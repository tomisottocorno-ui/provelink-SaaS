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

// esProductoPesable — al recepcionar: TODA la fiambrería en kg, pack o unitario
eq('pesable: jamón envasado 400g (pack)', ctx.esProductoPesable('jamon cocido', 'JAMON BOCATTI X 400 GR', 'kg'), true);
eq('pesable: queso rallado (envasado)',   ctx.esProductoPesable('queso rallado', 'QUESO RALLADO X 3 KG', 'kg'), true);
eq('pesable: mozzarella barra',           ctx.esProductoPesable('queso mozzarella', 'MOZZARELLA BARRA x kg', 'kg'), true);
eq('pesable: salame',                     ctx.esProductoPesable('salame', 'SALAME MILAN X KG', 'kg'), true);
eq('pesable: NO aceite (litros)',         ctx.esProductoPesable('aceite oliva', 'ACEITE OLIVA X 5 LT', 'L'), false);
eq('pesable: NO harina (kg pero no fiambre)', ctx.esProductoPesable('harina 000', 'HARINA 000 X 25 KG', 'kg'), false);

// Fiambrería que ANTES no matcheaba el diccionario (causa de la inconsistencia)
eq('pesable: cheddar',   ctx.esProductoPesable('cheddar', 'CHEDDAR EN FETAS', 'kg'), true);
eq('pesable: ricota',    ctx.esProductoPesable('ricota', 'RICOTA X 5 KG', 'kg'), true);
eq('pesable: dambo',     ctx.esProductoPesable('dambo', 'DAMBO LA PAULINA', 'kg'), true);
eq('pesable: salchichas',ctx.esProductoPesable('salchicha', 'SALCHICHAS VIENA', 'kg'), true);
eq('pesable: lomito',    ctx.esProductoPesable('lomito', 'LOMITO AHUMADO', 'kg'), true);
eq('pesable: por salut', ctx.esProductoPesable('por salut', 'PORT SALUT LIGHT', 'kg'), true);
eq('pesable: pastron',   ctx.esProductoPesable('pastron', 'PASTRON X KG', 'kg'), true);
eq('pesable: NO azucar', ctx.esProductoPesable('azucar', 'AZUCAR X 25 KG', 'kg'), false);

// esProductoPesoVariable (estricto) sigue excluyendo envasados tras ampliar el regex
eq('pesoVariable: mozzarella barra',   ctx.esProductoPesoVariable('queso mozzarella', 'MOZZARELLA BARRA x kg', 'kg'), true);
eq('pesoVariable: NO queso rallado',   ctx.esProductoPesoVariable('queso rallado', 'QUESO RALLADO X 3 KG', 'kg'), false);
eq('pesoVariable: NO aceite oliva 5L', ctx.esProductoPesoVariable('aceite oliva', 'ACEITE OLIVA DON HUGO X 5 LT', 'L'), false);

console.log('\n' + (fallos === 0 ? 'TODOS OK' : fallos + ' FALLO(S)'));
process.exit(fallos === 0 ? 0 : 1);
