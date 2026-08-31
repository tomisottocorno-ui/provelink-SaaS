#!/usr/bin/env node
// tests/run-tour.js — El motor del recorrido guiado (tour.js) y el guard de
// empleados.js para cuentas en prueba.
'use strict';
var fs = require('fs');
var path = require('path');

var fallos = 0, corridos = 0;
function ok(nombre, cond, detalle) {
  corridos++;
  if (cond) { console.log('  OK   ' + nombre); }
  else { fallos++; console.log('  FAIL ' + nombre + (detalle ? '  → ' + detalle : '')); }
}
function seccion(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 58 - t.length))); }

var RAIZ = path.join(__dirname, '..');

// Todo el archivo corre dentro de una única función async (mismo patrón que
// tests/run-flujos.js) porque la sección de datosDePrueba() más abajo hace
// `await` sobre una función async real — si el resto del archivo siguiera
// corriendo de forma síncrona, el RESUMEN final se imprimiría (y
// process.exit se llamaría) antes de que esos awaits terminaran.
(async function main() {

seccion('api/empleados.js: el guard de plan_estado permite la prueba');
{
  var src = fs.readFileSync(path.join(RAIZ, 'api/empleados.js'), 'utf8');
  ok('el guard menciona explícitamente \'prueba\' como estado permitido',
     /plan_estado\s*!==\s*'activo'[\s\S]{0,60}plan_estado\s*!==\s*null[\s\S]{0,60}plan_estado\s*!==\s*'prueba'/.test(src),
     'no se encontró el patrón esperado');
}

seccion('tour.js: recorre pasos, respeta Siguiente/Atrás/Saltar');
{
  var { JSDOM } = require('jsdom');
  // runScripts: 'outside-only' es necesario para que `win.eval(...)` corra
  // con `window` bien enganchado como global del contexto — sin esta opción,
  // el script de tour.js revienta con "window is not defined" apenas se
  // evalúa (confirmado ejecutándolo antes de escribir este test así).
  var dom = new JSDOM('<!doctype html><html><body>' +
    '<div id="a">A</div><div id="b">B</div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
  var win = dom.window;
  win.eval(fs.readFileSync(path.join(RAIZ, 'app/tour.js'), 'utf8'));

  var terminado = false;
  win.Tour.iniciar([
    { selector: '#a', titulo: 'Paso A', texto: 'Explicación A' },
    { selector: '#b', titulo: 'Paso B', texto: 'Explicación B' }
  ], function() { terminado = true; });

  var tarjeta = win.document.querySelector('.tour-tarjeta');
  ok('aparece la tarjeta', !!tarjeta);
  ok('aparece el overlay', !!win.document.querySelector('.tour-overlay'));
  ok('el paso 1 resalta el elemento correcto',
     win.document.getElementById('a').classList.contains('tour-resaltado'));
  ok('muestra el título del primer paso', tarjeta.textContent.indexOf('Paso A') >= 0);
  ok('en el primer paso no hay botón Atrás', !win.document.getElementById('tour-atras'));

  win.document.getElementById('tour-siguiente').click();
  ok('al avanzar, resalta el segundo elemento',
     win.document.getElementById('b').classList.contains('tour-resaltado'));
  ok('y deja de resaltar el primero',
     !win.document.getElementById('a').classList.contains('tour-resaltado'));
  ok('en el último paso el botón dice "Listo"',
     win.document.getElementById('tour-siguiente').textContent.indexOf('Listo') >= 0);

  win.document.getElementById('tour-atras').click();
  ok('Atrás vuelve al paso 1', tarjeta.textContent.indexOf('Paso A') >= 0);

  win.document.getElementById('tour-siguiente').click();
  win.document.getElementById('tour-siguiente').click();  // "Listo" en el paso 2
  ok('al terminar, se llama el callback', terminado === true);
  ok('y se limpia el overlay', !win.document.querySelector('.tour-overlay'));
  ok('y se limpia la tarjeta', !win.document.querySelector('.tour-tarjeta'));
  ok('y no queda ningún elemento resaltado',
     !win.document.getElementById('a').classList.contains('tour-resaltado') &&
     !win.document.getElementById('b').classList.contains('tour-resaltado'));
}

seccion('tour.js: Saltar termina en cualquier paso');
{
  var { JSDOM: JSDOM2 } = require('jsdom');
  var dom2 = new JSDOM2('<!doctype html><html><body><div id="x">X</div></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
  var win2 = dom2.window;
  win2.eval(fs.readFileSync(path.join(RAIZ, 'app/tour.js'), 'utf8'));

  var terminado2 = false;
  win2.Tour.iniciar([{ selector: '#x', titulo: 'Único paso', texto: '...' }],
    function() { terminado2 = true; });
  win2.document.getElementById('tour-saltar').click();
  ok('Saltar también dispara el callback', terminado2 === true);
}

seccion('tour.js: si ningún selector existe en la página, no rompe');
{
  var { JSDOM: JSDOM3 } = require('jsdom');
  var dom3 = new JSDOM3('<!doctype html><html><body></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
  var win3 = dom3.window;
  win3.eval(fs.readFileSync(path.join(RAIZ, 'app/tour.js'), 'utf8'));

  var llamado = false;
  win3.Tour.iniciar([{ selector: '#no-existe', titulo: 'x', texto: 'y' }],
    function() { llamado = true; });
  ok('con cero pasos válidos, llama al callback derecho y no agrega overlay',
     llamado === true && !win3.document.querySelector('.tour-overlay'));
}

seccion('login.html: datos de la cuenta de prueba via codigo (async)');
{
  // A diferencia del repo hermano (provelink-demo), acá datosDePrueba(queryString,
  // token) NO manda user_id en el body: manda el token de sesión en el header
  // Authorization: Bearer <token>, y api/reclamar-codigo.js deriva el usuario
  // SIEMPRE de ese token verificado con sb.auth.getUser(token) — nunca de un
  // user_id del body. Es un fix de seguridad aplicado específicamente en este
  // repo (ver comentario en api/reclamar-codigo.js): un user_id de body sería
  // falsificable por cualquiera que interceptara el código antes de que la
  // cuenta exista. Este test verifica ESE contrato, no el del repo hermano.
  var vm = require('vm');
  var src = fs.readFileSync(path.join(RAIZ, 'app/login.html'), 'utf8');
  // A diferencia de la versión síncrona anterior (cuyo único `return {...}`
  // entraba en una sola línea, así que un `\n\s*}` no-greedy encontraba
  // directo la llave de cierre real), este cuerpo async tiene llaves
  // anidadas antes del final (las opciones de fetch(), el try/catch) — un
  // regex así de simple corta la función a la mitad. Contamos llaves
  // balanceadas para agarrar el cuerpo completo, sea cual sea su forma.
  var m = null;
  {
    var idx = src.indexOf('async function datosDePrueba');
    if (idx !== -1) {
      var llaveInicio = src.indexOf('{', idx);
      var profundidad = 0;
      for (var i = llaveInicio; i < src.length; i++) {
        if (src[i] === '{') profundidad++;
        else if (src[i] === '}') {
          profundidad--;
          if (profundidad === 0) { m = [src.slice(idx, i + 1)]; break; }
        }
      }
    }
  }
  ok('la función datosDePrueba existe y es async', !!m);
  ok('la firma real es (queryString, token), no (queryString, userId)',
     !!m && /async function datosDePrueba\s*\(\s*queryString\s*,\s*token\s*\)/.test(m[0]));

  if (m) {
    var fetchLlamadas;

    function crearContexto(respuestaOk) {
      fetchLlamadas = [];
      var ctx = {
        window: { location: { search: '' } },
        URLSearchParams: URLSearchParams,
        console: console,
        fetch: function(url, opts) {
          fetchLlamadas.push({ url: url, headers: opts.headers, body: JSON.parse(opts.body) });
          return Promise.resolve({ json: function() { return Promise.resolve({ ok: respuestaOk }); } });
        }
      };
      vm.createContext(ctx);
      vm.runInContext(m[0] + '\nwindow.datosDePrueba = datosDePrueba;', ctx);
      return ctx;
    }

    var ctxOk = crearContexto(true);
    var conCodigo = await ctxOk.window.datosDePrueba('?prueba=AB3X9K', 'token-abc');
    ok('con codigo y token validos, arma el plan Max', conCodigo && conCodigo.plan === 'business');
    ok('en estado prueba', conCodigo && conCodigo.plan_estado === 'prueba');
    ok('vence en 15 dias', (function() {
      if (!conCodigo) return false;
      var dias = Math.round((new Date(conCodigo.plan_vence) - new Date()) / 86400000);
      return dias === 15;
    })());
    ok('llama al endpoint con el codigo en el body',
       fetchLlamadas.length === 1 &&
       fetchLlamadas[0].url === '/api/reclamar-codigo' &&
       fetchLlamadas[0].body.codigo === 'AB3X9K');
    ok('el body NO manda user_id (se deriva del token en el servidor)',
       fetchLlamadas[0].body.user_id === undefined);
    ok('manda el token en el header Authorization: Bearer <token>',
       fetchLlamadas[0].headers && fetchLlamadas[0].headers.Authorization === 'Bearer token-abc');

    var ctxUsado = crearContexto(false);
    var conCodigoUsado = await ctxUsado.window.datosDePrueba('?prueba=YAUSADO', 'token-xyz');
    ok('con codigo invalido o ya usado, no devuelve nada', conCodigoUsado === null);

    var ctxSinCodigo = crearContexto(true);
    var sinCodigo = await ctxSinCodigo.window.datosDePrueba('', 'token-qqq');
    ok('sin codigo en la URL, ni siquiera llama al endpoint',
       sinCodigo === null && fetchLlamadas.length === 0);

    var ctxSinToken = crearContexto(true);
    var sinToken = await ctxSinToken.window.datosDePrueba('?prueba=AB3X9K', undefined);
    ok('sin token de sesión, ni siquiera llama al endpoint (no confía en nada mandable por el cliente)',
       sinToken === null && fetchLlamadas.length === 0);
  }
}

seccion('api/reclamar-codigo.js: estructura del endpoint');
{
  var src = fs.readFileSync(path.join(RAIZ, 'api/reclamar-codigo.js'), 'utf8');
  ok('exporta un handler async', /module\.exports\s*=\s*async function/.test(src));
  ok('rechaza métodos que no son POST', /req\.method\s*!==\s*'POST'/.test(src));
  ok('hace un UPDATE condicionado a usado=false (reclamo atomico)',
     /\.eq\(\s*['"]usado['"]\s*,\s*false\s*\)/.test(src));
  ok('el UPDATE marca usado, usado_por y usado_en',
     /usado:\s*true/.test(src) && /usado_por/.test(src) && /usado_en/.test(src));
  // Diferencia con el repo hermano: acá el user_id NUNCA sale del body, sale
  // SIEMPRE del token de sesión verificado con sb.auth.getUser(token) (mismo
  // patrón que empleados.js / claude.js) — es el fix de seguridad de este repo.
  ok('lee el token del header Authorization', /req\.headers\.authorization/.test(src));
  ok('rechaza sin token (401)', /if\s*\(\s*!token\s*\)[\s\S]{0,40}401/.test(src));
  ok('verifica el token con sb.auth.getUser(token)', /sb\.auth\.getUser\(\s*token\s*\)/.test(src));
  ok('el callerId sale del token verificado, no del body',
     /callerId\s*=\s*userData\.user\.id/.test(src));
  ok('usado_por usa el callerId derivado del token, no un user_id del body',
     /usado_por:\s*callerId/.test(src));
  ok('el endpoint NO confía en un user_id mandado por el cliente',
     !/body\.user_id/.test(src));
}

  // ── RESUMEN ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(62));
  console.log(fallos === 0
    ? 'TODO OK — ' + corridos + ' verificaciones'
    : fallos + ' FALLO(S) de ' + corridos + ' verificaciones');
  console.log('═'.repeat(62) + '\n');
  process.exit(fallos === 0 ? 0 : 1);
})().catch(function(e) {
  console.error('\nERROR en el harness:', e.message);
  console.error(e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
});
