#!/usr/bin/env node
// tests/run-golden.js — Test runner determinístico para el golden set de 76 filas.
//
// Uso:
//   node tests/run-golden.js
//
// Carga pipeline.js en un contexto aislado (vm.runInNewContext) para que funcione
// fuera del browser sin ningún shim. Llama a decidirModoCascada con skipIA:true,
// lo que aplica el default "pack" en vez de llamar a la IA.
//
// Corre cada proveedor golden POR SEPARADO para que detectarPorCoherenciaInterna
// solo compare productos dentro de la misma lista (como en producción).
//
// Sale con código 1 si algún paso DETERMINÍSTICO (fuente_decision != "default")
// tomó una decisión incorrecta. Los "default" (IA desactivada) no fallan el test.

'use strict';
var fs   = require('fs');
var path = require('path');
var vm   = require('vm');

// ── Cargar pipeline.js en un sandbox aislado ──────────────────────────────────
var pipelineSrc = fs.readFileSync(path.join(__dirname, '../app/pipeline.js'), 'utf8');
var ctx = {};
vm.runInNewContext(pipelineSrc, ctx);

var decidirModoCascada = ctx.decidirModoCascada;
if (typeof decidirModoCascada !== 'function') {
  console.error('ERROR: decidirModoCascada no encontrada en pipeline.js');
  process.exit(1);
}

// ── Cargar los 4 archivos golden ──────────────────────────────────────────────
var goldenFiles = ['lamaris.json', 'centeno-general.json', 'walter-dacal.json', 'delite.json'];
var goldenDir   = path.join(__dirname, 'golden');

// ── Estadísticas globales ─────────────────────────────────────────────────────
var stats = { total: 0, ok: 0, error: 0, default: 0, byFuente: {} };
var errores = [];

// ── Correr la cascada por cada archivo (un proveedor a la vez) ────────────────
goldenFiles.forEach(function(fname) {
  var fpath = path.join(goldenDir, fname);
  if (!fs.existsSync(fpath)) {
    console.warn('AVISO: No encontrado ' + fpath + ', saltando.');
    return;
  }
  var data  = JSON.parse(fs.readFileSync(fpath, 'utf8'));
  var filas = (data.filas || []).filter(function(f) { return f.anotacion !== 'revisar'; });

  // Convertir filas al formato de grupos (1 proveedor por grupo)
  var grupos = filas.map(function(f) {
    return {
      clave_canonica: f.id,
      tipo:          f.tipo         || '',
      tamano:        f.tamano       || 0,
      unidad_base:   f.unidad_base  || 'u',
      proveedores: [{
        id_original:           f.id,
        proveedor_id:          data.proveedor || fname,
        nombre_original:       f.nombre        || '',
        presentacion_original: f.presentacion  || '',
        precio_raw:            f.precio        || 0,
        m:                     f.m             // undefined si no tiene señal
      }]
    };
  });

  var resultado = decidirModoCascada(grupos, { memoria: {}, rangosCacheados: {}, skipIA: true });
  var decididos = resultado.decididos;

  filas.forEach(function(f) {
    stats.total++;
    var dec    = decididos[f.id];
    var fuente = dec ? (dec.fuente_decision || 'desconocido') : 'sin_decision';
    var modo   = dec ? dec.modo : null;

    if (!stats.byFuente[fuente]) stats.byFuente[fuente] = { ok: 0, error: 0, total: 0 };
    stats.byFuente[fuente].total++;

    if (modo === f.esperado) {
      stats.ok++;
      stats.byFuente[fuente].ok++;
    } else if (fuente === 'default') {
      stats.default++;
      stats.byFuente[fuente].error++;
    } else {
      stats.error++;
      stats.byFuente[fuente].error++;
      errores.push({
        id:        f.id,
        proveedor: data.proveedor || fname,
        nombre:    f.nombre,
        esperado:  f.esperado,
        obtenido:  modo,
        fuente:    fuente,
        razonamiento: dec ? dec.razonamiento : null
      });
    }
  });
});

// ── Reporte ───────────────────────────────────────────────────────────────────
console.log('\n══════════════ GOLDEN SET — RESULTADOS ══════════════');
console.log('Total filas evaluadas : ' + stats.total);
console.log('Correctas             : ' + stats.ok   + '  (' + pct(stats.ok,   stats.total) + '%)');
console.log('Errors determinísticos: ' + stats.error + '  ← FALLA el test si > 0');
console.log('Default (IA desact.)  : ' + stats.default + '  (cobertura no resuelta)');

console.log('\n── Por fuente_decision ──────────────────────────────');
Object.keys(stats.byFuente).sort().forEach(function(f) {
  var b = stats.byFuente[f];
  var pctStr = pct(b.ok, b.total);
  console.log('  ' + pad(f, 20) + ' ok=' + b.ok + '  err=' + b.error + '  total=' + b.total + '  (' + pctStr + '%)');
});

if (errores.length > 0) {
  console.log('\n── Errores determinísticos ──────────────────────────');
  errores.forEach(function(e) {
    console.log('  [' + e.id + '] ' + e.nombre);
    console.log('      esperado=' + e.esperado + '  obtenido=' + e.obtenido +
                '  fuente=' + e.fuente);
    if (e.razonamiento) console.log('      razón: ' + e.razonamiento);
  });
}

console.log('\n═════════════════════════════════════════════════════\n');

process.exit(stats.error > 0 ? 1 : 0);

// ── Helpers ───────────────────────────────────────────────────────────────────
function pct(n, d) { return d > 0 ? Math.round(n / d * 100) : 0; }
function pad(s, n) { return (s + '                    ').slice(0, n); }
