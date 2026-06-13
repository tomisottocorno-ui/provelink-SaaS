#!/usr/bin/env node
// tests/run-pedidos.js — Tests de las funciones puras del flujo de pedidos.
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ctx = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/pipeline.js'), 'utf8'), ctx);

var fallos = 0;
function eq(nombre, got, exp) {
  var okk = JSON.stringify(got) === JSON.stringify(exp);
  if (!okk) { fallos++; console.log('FAIL ' + nombre + ' → got ' + JSON.stringify(got) + ' exp ' + JSON.stringify(exp)); }
  else console.log('OK   ' + nombre);
}

// fechaAtribucionGastoISO
eq('atrib recepcionado usa fechaRecepcion',
   ctx.fechaAtribucionGastoISO({ recepcionado: true, fechaRecepcion: Date.UTC(2026,5,20,12), fechaRecepcionEsperada: '2026-06-25' }).slice(0,7),
   '2026-06');
eq('atrib pendiente usa esperada',
   ctx.fechaAtribucionGastoISO({ recepcionado: false, fechaRecepcionEsperada: '2026-07-02' }),
   '2026-07-02');
eq('atrib viejo cae a timestamp',
   ctx.fechaAtribucionGastoISO({ timestamp: Date.UTC(2026,4,10,12) }).slice(0,7),
   '2026-05');

// gastoDelMes (junio 2026 = year 2026, monthIdx 5)
var pedidos = [
  { total: 1000, recepcionado: true,  fechaRecepcion: Date.UTC(2026,5,5,12) },   // real junio
  { total: 500,  recepcionado: false, fechaRecepcionEsperada: '2026-06-20' },     // pendiente junio
  { total: 999,  recepcionado: false, fechaRecepcionEsperada: '2026-07-01' }      // otro mes
];
eq('gastoDelMes junio', ctx.gastoDelMes(pedidos, 2026, 5), { real: 1000, estimado: 1500, nReal: 1, nPend: 1 });

console.log('\n' + (fallos === 0 ? 'TODOS OK' : fallos + ' FALLO(S)'));
process.exit(fallos === 0 ? 0 : 1);
