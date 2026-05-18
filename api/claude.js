// ============================================================================
// /api/claude.js — Proxy a Claude con cuota por usuario
// ============================================================================
// Recibe del frontend: { messages, system, max_tokens, tipo }
// Hace:
//   1. Verifica el token JWT del usuario (Authorization header)
//   2. Carga su profile y su plan
//   3. Verifica que tenga cuota disponible (reseteando el contador si pasó un mes)
//   4. Llama a la API de Claude con la API key del servidor (la tuya)
//   5. Incrementa el contador de consultas
//   6. Loguea el uso en uso_ia (tokens y costo)
//   7. Devuelve la respuesta de Claude al frontend
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

// Precios Claude Haiku 4.5 (USD por millón de tokens)
const PRECIOS = {
  input: 1.0,
  cache_write: 1.25,
  cache_read: 0.10,
  output: 5.0
};

const LIMITES_IA = { free: 0, pro: 150, business: 500 };

module.exports = async function handler(req, res) {
  // CORS (Vercel maneja same-origin si todo está en el mismo dominio,
  // pero por las dudas habilitamos lo básico)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1) Validar config del servidor
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY || !ANTHROPIC_KEY) {
      console.error('Faltan variables de entorno');
      return res.status(500).json({ error: 'Servidor mal configurado' });
    }

    // 2) Verificar el JWT del usuario
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return res.status(401).json({ error: 'No autenticado' });
    }

    // Cliente de Supabase con service_role para hacer cualquier cosa
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Validar el token y obtener el user
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData || !userData.user) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const userId = userData.user.id;

    // 3) Cargar profile del usuario
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('plan, plan_estado, consultas_ia_mes, consultas_ia_reset')
      .eq('id', userId)
      .single();
    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile no encontrado' });
    }

    const plan = profile.plan || 'free';
    const limite = LIMITES_IA[plan] || 0;

    // Validar payload temprano
    const body = req.body || {};
    const messages = body.messages;
    const system = body.system;
    const maxTokens = Math.min(body.max_tokens || 800, 16000);
    const tipo = body.tipo || 'chat';

    // Los tipos relacionados con procesar listas NO consumen cuota de IA
    // pero tienen sus propias restricciones por plan
    const tiposProcesarLista = ['procesar_lista', 'detectar_columnas', 'procesar_chunk'];
    const esProcesarLista = tiposProcesarLista.indexOf(tipo) >= 0;

    // expandir_query: usado para expandir abreviaciones en el buscador.
    // No consume cuota, no requiere plan específico, disponible para todos.
    if (tipo === 'expandir_query') {
      // Solo validar que el body sea razonable
      if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'Falta messages' });
      }
      // Llamar a Claude sin ninguna restricción de plan
      const apiBodyEQ = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: Math.min(maxTokens, 300),
        messages: messages
      };
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(apiBodyEQ)
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        return res.status(502).json({ error: 'Error IA', detalle: err.error && err.error.message });
      }
      const data = await resp.json();
      // Loguear uso (sin incrementar cuota)
      const u = data.usage || {};
      const costo = ((u.input_tokens||0)*1.0 + (u.output_tokens||0)*5.0) / 1_000_000;
      sb.from('uso_ia').insert({ user_id: userId, tipo: 'expandir_query',
        input_tokens: u.input_tokens||0, output_tokens: u.output_tokens||0, costo_usd: costo
      }).then(() => {}).catch(() => {});
      return res.status(200).json({ content: data.content, stop_reason: data.stop_reason });
    }

    if (esProcesarLista) {
      // Validar límite de listas para plan free: máximo 1 lista en total
      if (plan === 'free') {
        const { count, error: countError } = await sb
          .from('listas_precios')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId);
        if (countError) {
          console.error('Error contando listas:', countError);
        } else if ((count || 0) >= 1) {
          // En el plan free, solo se puede tener 1 lista. Si ya tiene una,
          // bloquear procesamiento de nuevas listas. Sí puede editar la existente
          // (eso no pasa por acá porque no llama a IA).
          // Excepción: si ya estamos actualizando una lista existente, el frontend
          // debería usar el endpoint de update directo, no éste.
          // Para diferenciar, requerimos que se pase proveedor_id y validamos.
          const proveedorId = body.proveedor_id;
          if (proveedorId) {
            const { data: listaExistente } = await sb
              .from('listas_precios')
              .select('id')
              .eq('user_id', userId)
              .eq('proveedor_id', proveedorId)
              .maybeSingle();
            if (!listaExistente) {
              return res.status(403).json({
                error: 'El plan Free permite cargar 1 lista. Mejorá a Pro para listas ilimitadas.',
                codigo: 'LIMITE_LISTAS_FREE'
              });
            }
            // Si existe lista para ese proveedor, está actualizándola: permitir
          } else {
            return res.status(403).json({
              error: 'El plan Free permite cargar 1 lista. Mejorá a Pro para listas ilimitadas.',
              codigo: 'LIMITE_LISTAS_FREE'
            });
          }
        }
      }
      // Pro y Business: ilimitado, no validamos cuota de IA
    } else {
      // Tipo 'chat' (asistente IA): valida cuota normal
      if (limite === 0) {
        return res.status(403).json({
          error: 'Tu plan actual no incluye asistente IA. Mejorá a Pro para usarlo.',
          codigo: 'PLAN_SIN_IA'
        });
      }

      // 4) Verificar si hay que resetear el contador (pasaron 30 días)
      let consultasUsadas = profile.consultas_ia_mes || 0;
      const ahora = new Date();
      const reset = new Date(profile.consultas_ia_reset || 0);
      const diasDesdeReset = (ahora - reset) / (1000 * 60 * 60 * 24);
      if (diasDesdeReset >= 30) {
        consultasUsadas = 0;
        await sb.from('profiles').update({
          consultas_ia_mes: 0,
          consultas_ia_reset: ahora.toISOString()
        }).eq('id', userId);
      }

      // 5) Verificar cuota
      if (consultasUsadas >= limite) {
        return res.status(403).json({
          error: 'Llegaste al límite de consultas IA de este mes (' + limite + '). Se renueva el ' + new Date(reset.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('es-AR') + '.',
          codigo: 'CUOTA_IA_AGOTADA',
          usadas: consultasUsadas,
          limite: limite
        });
      }
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Falta el campo messages' });
    }

    // 7) Llamar a Claude con prompt caching en el system prompt
    // El caching reduce el costo de input hasta 10x en requests consecutivos
    const apiBody = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      messages: messages
    };
    if (system) {
      apiBody.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
    }
    const claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'content-type': 'application/json'
      },
      body: JSON.stringify(apiBody)
    });

    if (!claudeResp.ok) {
      const errBody = await claudeResp.json().catch(() => ({}));
      console.error('Error Claude:', claudeResp.status, errBody);
      return res.status(502).json({
        error: 'Error al consultar a la IA',
        detalle: errBody.error && errBody.error.message
      });
    }

    const claudeData = await claudeResp.json();

    // 8) Calcular costo (para tracking interno)
    const usage = claudeData.usage || {};
    const inputT = usage.input_tokens || 0;
    const outputT = usage.output_tokens || 0;
    const cacheReadT = usage.cache_read_input_tokens || 0;
    const cacheCreationT = usage.cache_creation_input_tokens || 0;

    const costo = (
      (inputT * PRECIOS.input) +
      (cacheCreationT * PRECIOS.cache_write) +
      (cacheReadT * PRECIOS.cache_read) +
      (outputT * PRECIOS.output)
    ) / 1_000_000;

    // 9) Loguear uso siempre. Solo incrementar contador si es tipo 'chat'
    const updates = [];
    if (!esProcesarLista) {
      const consultasUsadas = profile.consultas_ia_mes || 0;
      updates.push(
        sb.from('profiles').update({
          consultas_ia_mes: consultasUsadas + 1
        }).eq('id', userId)
      );
    }
    updates.push(
      sb.from('uso_ia').insert({
        user_id: userId,
        tipo: tipo,
        input_tokens: inputT,
        output_tokens: outputT,
        cache_read_tokens: cacheReadT,
        cache_creation_tokens: cacheCreationT,
        costo_usd: costo
      })
    );
    Promise.all(updates).catch(e => console.error('Error logueando uso:', e));

    // 10) Devolver al frontend
    const cuotaInfo = esProcesarLista ? null : {
      usadas: (profile.consultas_ia_mes || 0) + 1,
      limite: limite,
      restantes: limite - ((profile.consultas_ia_mes || 0) + 1)
    };
    return res.status(200).json({
      content: claudeData.content,
      stop_reason: claudeData.stop_reason,
      usage: usage,
      cuota: cuotaInfo
    });

  } catch (e) {
    console.error('Error en /api/claude:', e);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
