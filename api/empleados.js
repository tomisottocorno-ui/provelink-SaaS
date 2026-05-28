// ============================================================================
// /api/empleados.js — Gestión de empleados (sub-usuarios)
// ============================================================================
// Métodos:
//   GET    /api/empleados              → Lista empleados del owner
//   POST   /api/empleados              → Crear empleado (email, password, nombre, permisos)
//   PUT    /api/empleados?id=<uuid>    → Actualizar nombre/permisos/activo
//   DELETE /api/empleados?id=<uuid>    → Eliminar empleado (borra auth.user + fila empleados)
//
// Solo el OWNER (quien NO es a su vez empleado) puede gestionar empleados.
// El backend usa service_role para crear/borrar cuentas en Supabase Auth.
// ============================================================================

const { createClient } = require('@supabase/supabase-js');

const LIMITES_EMPLEADOS = { free: 0, pro: 2, business: 10 };
const PERMISOS_VALIDOS = ['proveedores', 'listas', 'pedido', 'historial', 'verificar', 'ia', 'produccion'];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(500).json({ error: 'Servidor mal configurado' });
    }

    // Autenticar el caller
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return res.status(401).json({ error: 'No autenticado' });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: userData, error: userError } = await sb.auth.getUser(token);
    if (userError || !userData || !userData.user) {
      return res.status(401).json({ error: 'Token inválido' });
    }
    const callerId = userData.user.id;

    // Verificar que el caller NO sea empleado (los empleados no pueden gestionar otros empleados)
    const { data: esEmpleadoFila } = await sb
      .from('empleados')
      .select('id')
      .eq('empleado_id', callerId)
      .maybeSingle();
    if (esEmpleadoFila) {
      return res.status(403).json({ error: 'Solo el dueño de la cuenta puede gestionar empleados' });
    }

    // Cargar profile del owner para conocer plan + limites
    const { data: profile, error: profileError } = await sb
      .from('profiles')
      .select('plan, plan_estado')
      .eq('id', callerId)
      .single();
    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile no encontrado' });
    }

    const plan = profile.plan || 'free';
    const limite = LIMITES_EMPLEADOS[plan] || 0;

    // ============================ GET — listar empleados ============================
    if (req.method === 'GET') {
      const { data: empleados, error: listErr } = await sb
        .from('empleados')
        .select('id, empleado_id, nombre, email, permisos, activo, creado')
        .eq('owner_id', callerId)
        .order('creado', { ascending: false });
      if (listErr) {
        console.error('Error listando empleados:', listErr);
        return res.status(500).json({ error: 'Error al listar empleados' });
      }
      return res.status(200).json({
        empleados: empleados || [],
        limite: limite,
        usados: (empleados || []).length,
        plan: plan
      });
    }

    // ============================ POST — crear empleado ============================
    if (req.method === 'POST') {
      const body = req.body || {};
      const nombre = (body.nombre || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const password = body.password || '';
      const permisos = Array.isArray(body.permisos) ? body.permisos : [];

      if (!nombre) return res.status(400).json({ error: 'Falta el nombre' });
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Email inválido' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
      }
      const permisosLimpios = permisos.filter(p => PERMISOS_VALIDOS.indexOf(p) >= 0);

      // Validar plan
      if (limite === 0) {
        return res.status(403).json({
          error: 'Tu plan actual no permite empleados. Mejorá a Pro o Business.',
          codigo: 'PLAN_SIN_EMPLEADOS'
        });
      }
      if (profile.plan_estado !== 'activo' && profile.plan_estado !== null) {
        return res.status(403).json({
          error: 'Tu plan no está activo. Regularizá el pago para gestionar empleados.',
          codigo: 'PLAN_NO_ACTIVO'
        });
      }

      // Contar empleados actuales
      const { count, error: countErr } = await sb
        .from('empleados')
        .select('id', { count: 'exact', head: true })
        .eq('owner_id', callerId);
      if (countErr) {
        console.error('Error contando empleados:', countErr);
        return res.status(500).json({ error: 'Error verificando límite de empleados' });
      }
      if ((count || 0) >= limite) {
        return res.status(403).json({
          error: 'Llegaste al límite de empleados de tu plan (' + limite + '). Mejorá el plan o eliminá uno.',
          codigo: 'LIMITE_EMPLEADOS',
          limite: limite,
          usados: count || 0
        });
      }

      // Crear el usuario en Supabase Auth (auto-confirmado para que pueda loguear ya)
      const { data: newUser, error: createErr } = await sb.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { nombre: nombre, es_empleado: true, owner_id: callerId }
      });
      if (createErr || !newUser || !newUser.user) {
        const msg = (createErr && createErr.message) || 'Error creando usuario';
        // Mensaje más amigable si el email ya existe
        if (msg.toLowerCase().indexOf('already') >= 0 || msg.toLowerCase().indexOf('registered') >= 0) {
          return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });
        }
        console.error('Error creando auth user:', createErr);
        return res.status(500).json({ error: msg });
      }
      const nuevoEmpleadoId = newUser.user.id;

      // Insertar fila en empleados
      const { data: filaEmp, error: insErr } = await sb
        .from('empleados')
        .insert({
          owner_id: callerId,
          empleado_id: nuevoEmpleadoId,
          nombre: nombre,
          email: email,
          permisos: permisosLimpios,
          activo: true
        })
        .select('id, empleado_id, nombre, email, permisos, activo, creado')
        .single();
      if (insErr) {
        // Rollback: borrar el auth user creado
        console.error('Error insertando empleado, haciendo rollback:', insErr);
        await sb.auth.admin.deleteUser(nuevoEmpleadoId).catch(() => {});
        return res.status(500).json({ error: 'Error guardando empleado: ' + insErr.message });
      }

      return res.status(201).json({ empleado: filaEmp });
    }

    // ============================ PUT — actualizar empleado ============================
    if (req.method === 'PUT') {
      const id = (req.query && req.query.id) || (req.url || '').split('id=')[1];
      if (!id) return res.status(400).json({ error: 'Falta id' });

      // Verificar que el empleado pertenezca al caller
      const { data: emp, error: getErr } = await sb
        .from('empleados')
        .select('id, empleado_id, owner_id')
        .eq('id', id)
        .single();
      if (getErr || !emp) return res.status(404).json({ error: 'Empleado no encontrado' });
      if (emp.owner_id !== callerId) {
        return res.status(403).json({ error: 'No es tu empleado' });
      }

      const body = req.body || {};
      const updates = {};
      if (typeof body.nombre === 'string' && body.nombre.trim()) {
        updates.nombre = body.nombre.trim();
      }
      if (Array.isArray(body.permisos)) {
        updates.permisos = body.permisos.filter(p => PERMISOS_VALIDOS.indexOf(p) >= 0);
      }
      if (typeof body.activo === 'boolean') {
        updates.activo = body.activo;
      }

      // Si viene nueva contraseña, actualizar en Auth
      if (body.password && typeof body.password === 'string') {
        if (body.password.length < 6) {
          return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
        }
        const { error: pwErr } = await sb.auth.admin.updateUserById(emp.empleado_id, {
          password: body.password
        });
        if (pwErr) {
          console.error('Error cambiando password:', pwErr);
          return res.status(500).json({ error: 'Error cambiando contraseña' });
        }
      }

      if (Object.keys(updates).length > 0) {
        const { data: updated, error: updErr } = await sb
          .from('empleados')
          .update(updates)
          .eq('id', id)
          .select('id, empleado_id, nombre, email, permisos, activo, creado')
          .single();
        if (updErr) {
          console.error('Error actualizando empleado:', updErr);
          return res.status(500).json({ error: 'Error actualizando empleado' });
        }
        return res.status(200).json({ empleado: updated });
      }

      return res.status(200).json({ ok: true });
    }

    // ============================ DELETE — eliminar empleado ============================
    if (req.method === 'DELETE') {
      const id = (req.query && req.query.id) || (req.url || '').split('id=')[1];
      if (!id) return res.status(400).json({ error: 'Falta id' });

      const { data: emp, error: getErr } = await sb
        .from('empleados')
        .select('id, empleado_id, owner_id')
        .eq('id', id)
        .single();
      if (getErr || !emp) return res.status(404).json({ error: 'Empleado no encontrado' });
      if (emp.owner_id !== callerId) {
        return res.status(403).json({ error: 'No es tu empleado' });
      }

      // Borrar auth user (cascade borra la fila en empleados)
      const { error: delErr } = await sb.auth.admin.deleteUser(emp.empleado_id);
      if (delErr) {
        console.error('Error borrando auth user:', delErr);
        // Si falla, intentar borrar solo la fila de empleados
        await sb.from('empleados').delete().eq('id', id);
        return res.status(500).json({ error: 'Error borrando cuenta del empleado' });
      }

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('Error en /api/empleados:', e);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
};
