#!/usr/bin/env node
// tests/run-admin-codigos.js — La página de admin de códigos de prueba.
'use strict';
var { montarAdmin } = require('./harness');

var fallos = 0, corridos = 0;
function ok(nombre, cond, detalle) {
  corridos++;
  if (cond) { console.log('  OK   ' + nombre); }
  else { fallos++; console.log('  FAIL ' + nombre + (detalle ? '  → ' + detalle : '')); }
}
function seccion(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 58 - t.length))); }

(async function main() {

  seccion('Admin de códigos: un email que no es admin, lo saca');
  {
    var app = await montarAdmin({ email: 'negocio-cualquiera@gmail.com' });
    await app.esperar(80);
    // Nota: jsdom no implementa navegación real entre documentos (ver
    // node_modules/jsdom/lib/jsdom/living/window/navigation.js → navigateFetch()
    // llama a notImplemented() y nunca toca document._URL), así que
    // `window.location.href = '/login'` jamás cambia win.location.href acá
    // dentro — en un navegador real sí navega. Verificamos el mismo resultado
    // (fue expulsado) por una vía que sí es observable en este entorno: el
    // panel de admin nunca se muestra y nunca se llega a pedir la tabla.
    ok('no muestra el panel de admin', app.doc.getElementById('admin-wrap').style.display === 'none');
    ok('no llegó a cargar los códigos de prueba',
       app.dbLog.filter(function(e) { return e.tabla === 'codigos_prueba'; }).length === 0);
  }

  seccion('Admin de códigos: un admin real entra y ve la lista');
  {
    var app = await montarAdmin({
      email: 'luchivega1212@gmail.com',
      codigos_prueba: [
        { id: 'c1', codigo: 'AB3X9K', nota: 'Panadería La Espiga', usado: false, creado: new Date().toISOString() },
        { id: 'c2', codigo: 'ZZ11QQ', nota: null, usado: true, usado_en: new Date().toISOString(), creado: new Date().toISOString() }
      ]
    });
    await app.esperar(80);
    ok('no redirige', app.win.location.href.indexOf('/login') < 0);
    ok('muestra los 2 códigos', app.doc.querySelectorAll('#tabla-codigos-body tr').length === 2);
    ok('el código disponible tiene botón de copiar', !!app.doc.querySelector('#tabla-codigos-body tr:nth-child(1) button'));
    ok('el código ya usado NO tiene botón de copiar',
       app.doc.querySelectorAll('#tabla-codigos-body tr')[1].querySelectorAll('button').length === 0);
  }

  seccion('Admin de códigos: generar uno nuevo');
  {
    var app = await montarAdmin({ email: 'tomisottocorno@gmail.com', codigos_prueba: [] });
    await app.esperar(80);

    app.doc.getElementById('input-nota').value = 'Nueva panadería';
    app.win.generarCodigo();
    await app.esperar(80);

    ok('se insertó un código nuevo en la base',
       app.db.codigos_prueba && app.db.codigos_prueba.length === 1);
    ok('con la nota que se puso', app.db.codigos_prueba[0].nota === 'Nueva panadería');
    ok('sin usar todavía', app.db.codigos_prueba[0].usado === false);
    ok('con el email de quien lo generó', app.db.codigos_prueba[0].creado_por === 'tomisottocorno@gmail.com');
    ok('muestra el link generado en pantalla',
       app.doc.getElementById('link-generado').style.display !== 'none');
  }

  console.log('\n' + '═'.repeat(62));
  console.log(fallos === 0
    ? 'TODO OK — ' + corridos + ' verificaciones'
    : fallos + ' FALLO(S) de ' + corridos + ' verificaciones');
  console.log('═'.repeat(62) + '\n');
  process.exit(fallos === 0 ? 0 : 1);

})();
