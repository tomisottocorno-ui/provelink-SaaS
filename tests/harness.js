// tests/harness.js — Monta la app REAL (app/index.html) en un DOM simulado,
// con Supabase y la red interceptados, para poder recorrer los flujos de punta
// a punta sin tocar la cuenta del usuario ni gastar IA.
//
// No es un mock de la lógica: se ejecuta el mismo código que corre en el
// navegador. Solo se reemplaza lo de afuera (base de datos, red, diálogos).
'use strict';
var fs = require('fs');
var path = require('path');
var { JSDOM } = require('jsdom');

var RAIZ = path.join(__dirname, '..');

// ── Supabase falso: tablas en memoria + query builder encadenable ────────────
function crearSupabaseFake(tablas, log) {
  tablas = tablas || {};
  function filas(t) { return (tablas[t] = tablas[t] || []); }

  function query(tabla) {
    var st = { eq: [], gte: [], lte: [], op: 'select', payload: null, onConflict: null };

    function aplicar() {
      return filas(tabla).filter(function(r) {
        return st.eq.every(function(f) { return String(r[f[0]]) === String(f[1]); }) &&
               st.gte.every(function(f) { return String(r[f[0]]) >= String(f[1]); }) &&
               st.lte.every(function(f) { return String(r[f[0]]) <= String(f[1]); });
      });
    }

    function ejecutar() {
      log.push({ tabla: tabla, op: st.op, eq: st.eq.slice(), n: (st.payload ? [].concat(st.payload).length : 0) });
      try {
        if (st.op === 'select') return { data: aplicar(), error: null };
        if (st.op === 'insert' || st.op === 'upsert') {
          var rows = [].concat(st.payload || []);
          // Simula la columna que puede no existir todavía (migración sin correr)
          if (tablas.__columnasFaltantes && tablas.__columnasFaltantes[tabla]) {
            var faltan = tablas.__columnasFaltantes[tabla];
            for (var i = 0; i < rows.length; i++) {
              for (var j = 0; j < faltan.length; j++) {
                if (rows[i][faltan[j]] !== undefined) {
                  return { data: null, error: { message: 'column "' + faltan[j] + '" of relation "' + tabla + '" does not exist' } };
                }
              }
            }
          }
          rows.forEach(function(row) {
            var clave = st.onConflict || 'id';
            var idx = filas(tabla).findIndex(function(r) { return row[clave] !== undefined && r[clave] === row[clave]; });
            if (idx >= 0 && st.op === 'upsert') filas(tabla)[idx] = Object.assign({}, filas(tabla)[idx], row);
            else filas(tabla).push(Object.assign({}, row));
          });
          return { data: rows, error: null };
        }
        if (st.op === 'update') {
          aplicar().forEach(function(r) { Object.assign(r, st.payload); });
          return { data: null, error: null };
        }
        if (st.op === 'delete') {
          var quedan = filas(tabla).filter(function(r) { return aplicar().indexOf(r) < 0; });
          tablas[tabla] = quedan;
          return { data: null, error: null };
        }
      } catch (e) { return { data: null, error: { message: String(e) } }; }
      return { data: null, error: null };
    }

    var q = {
      select: function() { if (st.op === 'select') st.op = 'select'; return q; },
      insert: function(p) { st.op = 'insert'; st.payload = p; return q; },
      upsert: function(p, o) { st.op = 'upsert'; st.payload = p; st.onConflict = (o && o.onConflict) || 'id'; return q; },
      update: function(p) { st.op = 'update'; st.payload = p; return q; },
      delete: function() { st.op = 'delete'; return q; },
      eq: function(c, v) { st.eq.push([c, v]); return q; },
      gte: function(c, v) { st.gte.push([c, v]); return q; },
      lte: function(c, v) { st.lte.push([c, v]); return q; },
      order: function() { return q; },
      limit: function() { return q; },
      maybeSingle: function() { var r = ejecutar(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: r.error }); },
      single: function() { var r = ejecutar(); return Promise.resolve({ data: (r.data && r.data[0]) || null, error: r.error }); },
      then: function(res, rej) { return Promise.resolve(ejecutar()).then(res, rej); }
    };
    return q;
  }

  return {
    __tablas: tablas,
    from: function(t) { return query(t); },
    auth: {
      getSession: function() {
        return Promise.resolve({ data: { session: { access_token: 'fake', user: { id: 'user-1', email: 'test@test.com' } } }, error: null });
      },
      signOut: function() { return Promise.resolve({}); },
      onAuthStateChange: function() { return { data: { subscription: { unsubscribe: function() {} } } }; }
    },
    storage: { from: function() { return { upload: function() { return Promise.resolve({ error: null }); }, getPublicUrl: function() { return { data: { publicUrl: '' } }; }, remove: function() { return Promise.resolve({}); } }; } }
  };
}

// ── Monta la app ────────────────────────────────────────────────────────────
// seed: { profile, proveedores, listas_precios, historial_pedidos, pedidos_programados, __columnasFaltantes }
async function montarApp(seed) {
  seed = seed || {};
  var html = fs.readFileSync(path.join(RAIZ, 'app/index.html'), 'utf8');

  var tablas = {
    profiles: [Object.assign({ id: 'user-1', plan: 'business', consultas_ia_mes: 0, listas_procesadas_mes: 0 }, seed.profile || {})],
    empleados: [],
    proveedores: seed.proveedores || [],
    listas_precios: seed.listas_precios || [],
    historial_pedidos: seed.historial_pedidos || [],
    pedidos_programados: seed.pedidos_programados || [],
    pl_cache_normalizacion: [],
    pl_rangos_precio: [],
    pl_modo_correcciones: [],
    snapshots_precios: [],
    pl_auditoria_precios: []
  };
  if (seed.__columnasFaltantes) tablas.__columnasFaltantes = seed.__columnasFaltantes;

  var dbLog = [];
  var dom = new JSDOM(html, {
    url: 'https://app.local/app',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  var win = dom.window;

  // Stubs del entorno (lo de afuera de la app)
  win.supabase = { createClient: function() { return crearSupabaseFake(tablas, dbLog); } };
  win.fetch = function() { return Promise.resolve({ ok: false, status: 599, headers: { get: function() { return 'application/json'; } }, json: function() { return Promise.resolve({ error: 'red desactivada en tests' }); }, text: function() { return Promise.resolve(''); } }); };
  win.scrollTo = function() {};
  win.HTMLElement.prototype.scrollIntoView = function() {};

  // Diálogos: controlables desde el test
  var dialogos = { confirmar: true, prompt: null, toasts: [], confirmsVistos: [], promptsVistos: [] };
  win.confirm = function(msg) { dialogos.confirmsVistos.push(String(msg)); return dialogos.confirmar; };
  win.prompt = function(msg, def) { dialogos.promptsVistos.push(String(msg)); return dialogos.prompt !== null ? dialogos.prompt : def; };
  win.alert = function() {};

  // Cargar scripts en el mismo orden que el navegador
  var icons = fs.readFileSync(path.join(RAIZ, 'app/icons.js'), 'utf8');
  var pipeline = fs.readFileSync(path.join(RAIZ, 'app/pipeline.js'), 'utf8');
  var inline = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1];
  if (!inline) throw new Error('No encontré el script inline de index.html');

  win.eval(icons);
  win.eval(pipeline);
  win.eval(inline);

  // showToast real necesita DOM; lo envolvemos para poder asertar sobre avisos
  var showToastOrig = win.showToast;
  win.showToast = function(msg, tipo) {
    dialogos.toasts.push({ msg: String(msg), tipo: tipo || '' });
    try { if (showToastOrig) showToastOrig.call(win, msg, tipo); } catch (e) {}
  };

  // Esperar a que init() termine (es async)
  await new Promise(function(r) { setTimeout(r, 60); });

  return {
    win: win,
    doc: win.document,
    db: tablas,
    dbLog: dbLog,
    dialogos: dialogos,
    // helpers
    esperar: function(ms) { return new Promise(function(r) { setTimeout(r, ms || 30); }); },
    texto: function(sel) { var el = win.document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; },
    toastsTexto: function() { return dialogos.toasts.map(function(t) { return t.msg; }); }
  };
}

module.exports = { montarApp: montarApp, crearSupabaseFake: crearSupabaseFake };
