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

// Precios por modelo (USD por millón de tokens)
const PRECIOS_HAIKU = {
  input: 1.0,
  cache_write: 1.25,
  cache_read: 0.10,
  output: 5.0
};
const PRECIOS_SONNET = {
  input: 3.0,
  output: 15.0
};

// Solo imágenes usan Sonnet+thinking (una llamada, puede tardar más)
// Los chunks de PDF van en Haiku para no multiplicar el tiempo x11 partes
const TIPOS_CON_THINKING = ['procesar_lista'];
// Sonnet sin thinking: solo para tareas que requieren visión o razonamiento complejo
// detectar_modo_precios usa Haiku (es aritmética simple: comparar ratios de precios)
const TIPOS_SONNET_SIN_THINKING = [];

// Asistente IA: solo plan Max (business). Pro NO lo tiene.
const LIMITES_IA = { free: 0, pro: 0, business: 500 };
// Listas procesadas por mes: Free 2, Pro y Max ilimitado.
const LIMITES_LISTAS_MES = { free: 2, pro: 999, business: 999 };

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
    const authUserId = userData.user.id;

    // Detectar si el caller es un empleado. Si lo es, el "owner" es quien paga
    // y a quien se le imputa la cuota y los logs de uso.
    let userId = authUserId; // user_id efectivo (owner_id si es empleado, propio si no)
    let empleadoPermisos = null; // null si es owner, array si es empleado
    {
      const { data: empFila } = await sb
        .from('empleados')
        .select('owner_id, permisos, activo')
        .eq('empleado_id', authUserId)
        .maybeSingle();
      if (empFila) {
        if (!empFila.activo) {
          return res.status(403).json({ error: 'Tu cuenta de empleado está desactivada', codigo: 'EMPLEADO_INACTIVO' });
        }
        userId = empFila.owner_id;
        empleadoPermisos = empFila.permisos || [];
      }
    }

    // 3) Cargar profile del usuario (siempre el del OWNER).
    // Si las columnas nuevas (listas_procesadas_*) no existen porque no se corrió
    // la migración SQL v2, hacemos un fallback al select básico para no romper.
    let profile = null;
    let profileError = null;
    {
      const r1 = await sb
        .from('profiles')
        .select('plan, plan_estado, consultas_ia_mes, consultas_ia_reset, listas_procesadas_mes, listas_procesadas_reset')
        .eq('id', userId)
        .single();
      if (r1.error && /listas_procesadas_/.test(r1.error.message || '')) {
        // Columnas nuevas no existen aún → fallback sin ellas
        const r2 = await sb
          .from('profiles')
          .select('plan, plan_estado, consultas_ia_mes, consultas_ia_reset')
          .eq('id', userId)
          .single();
        profile = r2.data;
        profileError = r2.error;
      } else {
        profile = r1.data;
        profileError = r1.error;
      }
    }
    if (profileError || !profile) {
      console.error('Profile error:', profileError);
      return res.status(404).json({ error: 'Profile no encontrado', detalle: profileError && profileError.message });
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
    const tiposProcesarLista = ['procesar_lista', 'detectar_columnas', 'procesar_chunk',
                               'normalizar_lista', 'detectar_modo_precios'];
    const esProcesarLista = tiposProcesarLista.indexOf(tipo) >= 0;

    // Si es empleado, validar permiso para el tipo de llamada
    if (empleadoPermisos !== null) {
      if (esProcesarLista && empleadoPermisos.indexOf('listas') < 0) {
        return res.status(403).json({ error: 'No tenés permiso para procesar listas', codigo: 'SIN_PERMISO_LISTAS' });
      }
      // expandir_query es libre. Cualquier otro tipo (chat) requiere 'ia'.
      const requiereIA = !esProcesarLista && tipo !== 'expandir_query';
      if (requiereIA && empleadoPermisos.indexOf('ia') < 0) {
        return res.status(403).json({ error: 'No tenés permiso para usar el asistente IA', codigo: 'SIN_PERMISO_IA' });
      }
    }

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

    // buscar_rango_web: usa Sonnet con web_search para estimar el rango de
    // orden de magnitud de un tipo de producto (precio por kg/L/u). No consume
    // cuota; se cachea en pl_rangos_precio y solo se llama UNA vez por tipo
    // en toda la vida del sistema (compartido entre usuarios).
    if (tipo === 'buscar_rango_web') {
      const tipoProducto = (body.tipo_producto || '').trim();
      const unidadBase   = (body.unidad_base || 'kg').trim();
      if (!tipoProducto) {
        return res.status(400).json({ error: 'Falta tipo_producto' });
      }

      const promptBusqueda =
        'Necesito un rango APROXIMADO de precio por unidad para un tipo de producto, en Argentina, ' +
        'precio mayorista. NO necesito un precio exacto ni actualizado al día: necesito el ORDEN DE ' +
        'MAGNITUD para distinguir si un precio de lista es por unidad o por bulto completo.\n\n' +
        'Producto: "' + tipoProducto + '" (unidad base: ' + unidadBase + ')\n\n' +
        'Buscá en la web precios mayoristas argentinos de este tipo de producto y devolvé una ' +
        'estimación de la mediana de precio por ' + unidadBase + '. Si no encontrás dato exacto, estimá ' +
        'por orden de magnitud según productos similares. Un rango amplio está bien.\n\n' +
        'Devolvé SOLO un JSON:\n' +
        '{\n' +
        '  "mediana_estimada": numero (precio por unidad base, en pesos argentinos),\n' +
        '  "confianza": numero 0-1,\n' +
        '  "fuente": "breve nota de en qué te basaste"\n' +
        '}';

      const apiBodyRango = {
        model: 'claude-sonnet-4-6',
        max_tokens: 1200,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: promptBusqueda }]
      };

      const respRango = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify(apiBodyRango)
      });

      if (!respRango.ok) {
        const errR = await respRango.json().catch(() => ({}));
        console.error('Error buscar_rango_web:', respRango.status, errR);
        return res.status(502).json({ error: 'Error IA', detalle: errR.error && errR.error.message });
      }

      const dataRango = await respRango.json();
      // Loguear uso (Sonnet, sin cuota)
      const uR = dataRango.usage || {};
      const costoR = ((uR.input_tokens || 0) * PRECIOS_SONNET.input + (uR.output_tokens || 0) * PRECIOS_SONNET.output) / 1_000_000;
      sb.from('uso_ia').insert({
        user_id: userId, tipo: 'buscar_rango_web',
        input_tokens: uR.input_tokens || 0, output_tokens: uR.output_tokens || 0, costo_usd: costoR
      }).then(() => {}).catch(() => {});

      // Extraer el JSON de los bloques de texto (puede venir entre tool_use)
      const textoCompleto = (dataRango.content || [])
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');
      let parsed = null;
      try {
        const limpio = textoCompleto.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(limpio);
      } catch (e) {
        const i = textoCompleto.indexOf('{');
        const f = textoCompleto.lastIndexOf('}');
        if (i >= 0 && f > i) {
          try { parsed = JSON.parse(textoCompleto.slice(i, f + 1)); } catch (e2) {}
        }
      }
      if (!parsed || typeof parsed.mediana_estimada !== 'number' || parsed.mediana_estimada <= 0) {
        return res.status(200).json({ rango: null, razon: 'IA no devolvió mediana válida' });
      }

      return res.status(200).json({
        rango: {
          tipo_producto: tipoProducto,
          unidad_base: unidadBase,
          mediana_estimada: parsed.mediana_estimada,
          factor_min: 0.5,
          factor_max: 2.5,
          origen: 'web',
          muestras: 0,
          confiable: false,
          confianza_web: parsed.confianza || 0.5,
          fuente: parsed.fuente || ''
        }
      });
    }

    if (esProcesarLista) {
      // Validar límite de listas PROCESADAS POR MES según el plan.
      // - Free: 2 procesamientos/mes (reset cada 30 días)
      // - Pro y Max: ilimitado
      // Solo cuentan los procesamientos NUEVOS, no las re-ediciones de una lista
      // existente. El procesamiento "real" es 'procesar_lista' (foto/imagen) o el
      // primer chunk de un PDF — el frontend manda `proveedor_id` y `nueva_lista`
      // para que sepamos si es la primera llamada del job (incrementamos solo ahí).
      const limiteListasMes = LIMITES_LISTAS_MES[plan] || LIMITES_LISTAS_MES.free;
      if (plan === 'free' && tipo === 'procesar_lista') {
        // Reset del contador si pasaron 30 días
        let listasUsadas = profile.listas_procesadas_mes || 0;
        const ahoraL = new Date();
        const resetL = new Date(profile.listas_procesadas_reset || 0);
        const diasDesdeResetL = (ahoraL - resetL) / (1000 * 60 * 60 * 24);
        if (diasDesdeResetL >= 30) {
          listasUsadas = 0;
          await sb.from('profiles').update({
            listas_procesadas_mes: 0,
            listas_procesadas_reset: ahoraL.toISOString()
          }).eq('id', userId);
        }
        if (listasUsadas >= limiteListasMes) {
          return res.status(403).json({
            error: 'Llegaste al límite de ' + limiteListasMes + ' listas por mes del plan Free. Mejorá a Pro para listas ilimitadas.',
            codigo: 'LIMITE_LISTAS_FREE_MES',
            usadas: listasUsadas,
            limite: limiteListasMes
          });
        }
        // Incrementar contador (no awaitamos, para no demorar respuesta)
        sb.from('profiles').update({
          listas_procesadas_mes: listasUsadas + 1
        }).eq('id', userId).then(() => {}).catch(e => console.error('Error incrementando contador listas:', e));
      }
      // Pro y Max: ilimitado, no validamos cuota de IA
    } else {
      // Tipo 'chat' (asistente IA): valida cuota normal
      if (limite === 0) {
        return res.status(403).json({
          error: 'Tu plan actual no incluye asistente IA. Mejorá a Max para usarlo.',
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

    // 7) Llamar a Claude — tres tiers: Sonnet+thinking / Sonnet plain / Haiku
    const usarThinking = TIPOS_CON_THINKING.indexOf(tipo) >= 0;
    const usarSonnet   = usarThinking || TIPOS_SONNET_SIN_THINKING.indexOf(tipo) >= 0;
    const modelo = usarSonnet ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
    const PRECIOS = usarSonnet ? PRECIOS_SONNET : PRECIOS_HAIKU;

    const apiBody = {
      model: modelo,
      max_tokens: maxTokens,
      messages: messages
    };

    if (usarThinking) {
      // budget_tokens: hasta 8000 pero siempre menor a max_tokens
      apiBody.thinking = { type: 'enabled', budget_tokens: Math.min(8000, maxTokens - 2000) };
    } else if (system) {
      apiBody.system = [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
    }

    // Tool use (opcional): el frontend puede pasar `tools` y `tool_choice`.
    // Se usa para que el asistente arme pedidos de forma estructurada y
    // confiable (en vez de pedirle que escriba un bloque JSON a mano).
    if (Array.isArray(body.tools) && body.tools.length) {
      apiBody.tools = body.tools;
      if (body.tool_choice) apiBody.tool_choice = body.tool_choice;
    }

    const betaHeader = usarThinking ? 'interleaved-thinking-2025-05-14' : 'prompt-caching-2024-07-31';

    // Retry con backoff exponencial para 429 (rate limit) y 529 (overload)
    const MAX_RETRIES = 4;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    let claudeResp;
    let errBody = {};
    for (let intento = 0; intento <= MAX_RETRIES; intento++) {
      claudeResp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': betaHeader,
          'content-type': 'application/json'
        },
        body: JSON.stringify(apiBody)
      });
      if (claudeResp.ok) break;
      errBody = await claudeResp.json().catch(() => ({}));
      const status = claudeResp.status;
      const reintentable = (status === 429 || status === 529 || status === 503);
      if (!reintentable || intento === MAX_RETRIES) break;
      // Respetar retry-after si viene; si no, backoff exponencial con jitter
      const retryAfter = parseFloat(claudeResp.headers.get('retry-after') || '0');
      const waitMs = retryAfter > 0
        ? Math.min(retryAfter * 1000, 30000)
        : Math.min(1000 * Math.pow(2, intento) + Math.random() * 500, 15000);
      console.warn('[Claude] ' + status + ' — reintentando en ' + waitMs + 'ms (intento ' + (intento + 1) + '/' + MAX_RETRIES + ')');
      await sleep(waitMs);
    }

    if (!claudeResp.ok) {
      console.error('Error Claude:', claudeResp.status, errBody);
      return res.status(502).json({
        error: 'Error al consultar a la IA',
        detalle: errBody.error && errBody.error.message,
        status: claudeResp.status
      });
    }

    const claudeData = await claudeResp.json();

    // 8) Calcular costo (para tracking interno)
    const usage = claudeData.usage || {};
    const inputT = usage.input_tokens || 0;
    const outputT = usage.output_tokens || 0;
    const cacheReadT = usage.cache_read_input_tokens || 0;
    const cacheCreationT = usage.cache_creation_input_tokens || 0;

    const costo = usarSonnet
      ? ((inputT * PRECIOS_SONNET.input) + (outputT * PRECIOS_SONNET.output)) / 1_000_000
      : ((inputT * PRECIOS_HAIKU.input) + (cacheCreationT * PRECIOS_HAIKU.cache_write) + (cacheReadT * PRECIOS_HAIKU.cache_read) + (outputT * PRECIOS_HAIKU.output)) / 1_000_000;

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
    // Filtrar bloques de thinking, pero CONSERVAR text y tool_use (el asistente
    // usa tool_use para armar pedidos de forma estructurada).
    const contentFiltrado = (claudeData.content || []).filter(function(b) {
      return b.type === 'text' || b.type === 'tool_use';
    });

    return res.status(200).json({
      content: contentFiltrado,
      stop_reason: claudeData.stop_reason,
      usage: usage,
      cuota: cuotaInfo
    });

  } catch (e) {
    console.error('Error en /api/claude:', e);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
