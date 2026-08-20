#!/usr/bin/env node
// tests/run-auth.js — Vigila cómo se manda el token a /api/.
//
// El bug que originó esto: cada llamada a /api/ usaba `sesion.access_token`, una
// variable capturada UNA vez al abrir la página. El token de Supabase dura ~1
// hora, así que con la pestaña abierta un rato largo se mandaba uno vencido y el
// backend respondía "Token inválido". Lo confuso era que el resto de la app
// seguía andando: las consultas directas a Supabase usan el cliente, que
// refresca el token solo por dentro.
//
// No hace falta un DOM para vigilarlo: alcanza con mirar cómo están escritas las
// llamadas. Si alguien agrega un fetch nuevo con el token capturado, esto lo
// atrapa antes de que llegue a un usuario.
'use strict';
var fs = require('fs');
var path = require('path');

var fallos = 0, corridos = 0;
function ok(nombre, cond, detalle) {
  corridos++;
  if (cond) console.log('  OK   ' + nombre);
  else { fallos++; console.log('  FAIL ' + nombre + (detalle ? '  → ' + detalle : '')); }
}

var RAIZ = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(RAIZ, 'app/index.html'), 'utf8');
var js = (html.match(/<script>([\s\S]*?)<\/script>/) || [])[1] || '';

console.log('\n── Token de las llamadas a /api/ ' + '─'.repeat(30));

ok('existe el helper que refresca el token', /async function tokenActual\s*\(/.test(js));

// Ningún Authorization puede mandar el token capturado.
var capturados = (js.match(/'Bearer '\s*\+\s*sesion\.access_token/g) || []).length;
ok('ninguna llamada usa el token capturado en `sesion`', capturados === 0,
   capturados + ' llamada(s) todavía lo usan');

// Todo Authorization: Bearer tiene que salir de tokenActual()
var bearers = js.match(/'Bearer '\s*\+\s*[^,\n}]+/g) || [];
var malos = bearers.filter(function(b) { return b.indexOf('tokenActual()') < 0; });
ok('todo Authorization sale de tokenActual()', malos.length === 0, malos.join(' | '));

// Y tiene que haber al menos uno (si no, el test no está probando nada)
ok('hay llamadas autenticadas que vigilar', bearers.length > 0, 'no encontré ninguna');

// El 401 tiene que decir algo que el usuario pueda accionar, no "Token inválido"
ok('un 401 explica que la sesión venció', /Tu sesión venció/.test(js));

// tokenActual tiene que refrescar de verdad, no leer el global
var cuerpo = (js.match(/async function tokenActual\s*\([\s\S]*?\n\}/) || [''])[0];
ok('tokenActual pide la sesión a Supabase', /supabase\.auth\.getSession\(\)/.test(cuerpo));
ok('y actualiza el global para el resto del código', /sesion\s*=\s*s;/.test(cuerpo));

console.log('\n' + '═'.repeat(62));
console.log(fallos === 0
  ? 'TODO OK — ' + corridos + ' verificaciones'
  : fallos + ' FALLO(S) de ' + corridos + ' verificaciones');
console.log('═'.repeat(62) + '\n');
process.exit(fallos === 0 ? 0 : 1);
