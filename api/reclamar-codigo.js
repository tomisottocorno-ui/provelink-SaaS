// ============================================================================
// /api/reclamar-codigo.js — Reclama un código de prueba de un solo uso
// ============================================================================
// Método:
//   POST /api/reclamar-codigo   → body: { codigo }
//   Header: Authorization: Bearer <token de sesión>
//
// El UPDATE es atómico: sólo afecta la fila si todavía está `usado = false`,
// así que si dos requests llegan casi al mismo tiempo con el mismo código,
// como mucho uno de los dos encuentra la fila para actualizar — el otro no
// actualiza nada y `data` le queda vacío. No hace falta un SELECT previo ni
// un lock manual.
//
// El user_id se deriva SIEMPRE del token de sesión verificado (mismo patrón
// que empleados.js / claude.js) — nunca del body. Los códigos se reparten
// por WhatsApp/email a negocios reales antes de que la cuenta exista; si
// confiáramos en un user_id de body, cualquiera que interceptara el código
// podría pegarle al endpoint directo y quemárselo, sin pasar por la UI.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método no permitido' });
  }

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ ok: false, error: 'Servidor mal configurado' });
    }

    // Autenticar el caller (mismo patrón que empleados.js / claude.js)
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ ok: false, error: 'No autenticado' });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData || !userData.user) {
      return res.status(401).json({ ok: false, error: 'Token inválido' });
    }
    const callerId = userData.user.id;

    const body = req.body || {};
    const codigo = (body.codigo || '').trim();

    if (!codigo) {
      return res.status(400).json({ ok: false, error: 'Falta codigo' });
    }

    const { data, error } = await sb
      .from('codigos_prueba')
      .update({ usado: true, usado_por: callerId, usado_en: new Date().toISOString() })
      .eq('codigo', codigo)
      .eq('usado', false)
      .select();

    if (error) throw error;

    return res.status(200).json({ ok: !!(data && data.length > 0) });
  } catch (e) {
    console.error('Error en /api/reclamar-codigo:', e);
    return res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
};
