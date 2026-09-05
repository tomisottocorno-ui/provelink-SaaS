#!/usr/bin/env node
// tests/run-flujos.js — Recorre los flujos de la app de punta a punta sobre el
// código REAL (app/index.html montado en un DOM simulado), con Supabase y la red
// interceptados. Cubre los bugs reportados por el usuario para que no vuelvan.
'use strict';
var { montarApp } = require('./harness');

var fallos = 0, corridos = 0;
function ok(nombre, cond, detalle) {
  corridos++;
  if (cond) { console.log('  OK   ' + nombre); }
  else { fallos++; console.log('  FAIL ' + nombre + (detalle ? '  → ' + detalle : '')); }
}
function seccion(t) { console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 58 - t.length))); }

var HOY = new Date();
function iso(d) {
  var m = ('0' + (d.getMonth() + 1)).slice(-2), dd = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + dd;
}
function enDias(n) { var d = new Date(HOY); d.setDate(d.getDate() + n); return iso(d); }

// Datos base: productos reales representativos de los casos que dieron problema
function seedBase() {
  return {
    proveedores: [
      { id: 'p1', user_id: 'user-1', nombre: 'Fiambrería Test', telefono: '1122334455' },
      { id: 'p2', user_id: 'user-1', nombre: 'Almacén Test', telefono: '1199887766' }
    ],
    listas_precios: [
      { id: 'l1', user_id: 'user-1', proveedor_id: 'p1', items: [
        // Fiambre por kg con la señal en el NOMBRE, guardado mal como pack
        { productoLista: 'JAMON CRUDO LA RESIDENCIA $ X KG - VENTA X PIEZA', precio: 18314.36, unidad: '',
          modo: 'pack', tamano: null, unidad_base: 'kg', precio_unitario: 18314.36, precio_total: 18314.36,
          tipo: 'jamon crudo', clave_canonica: 'jamon crudo' },
        // Queso de pieza variable, por kg
        { productoLista: 'QUESO MOZZARELLA BARRA', precio: 9466.88, unidad: 'KILOS',
          modo: 'unitario', tamano: 3, unidad_base: 'kg', precio_unitario: 9466.88, precio_total: 28400.64,
          tipo: 'queso mozzarella', clave_canonica: 'queso mozzarella 3kg' },
        // Fiambre ENVASADO con peso declarado (modo pack) — debe permitir pesar igual
        { productoLista: 'JAMON COCIDO BOCATTI X 400 GR', precio: 4000, unidad: '400 gr',
          modo: 'pack', tamano: 0.4, unidad_base: 'kg', precio_unitario: 10000, precio_total: 4000,
          tipo: 'jamon cocido', clave_canonica: 'jamon cocido 0.4kg' },
        // Cheddar: antes no matcheaba el diccionario
        { productoLista: 'CHEDDAR EN FETAS', precio: 12500, unidad: '',
          modo: 'unitario', tamano: null, unidad_base: 'kg', precio_unitario: 12500, precio_total: null,
          tipo: 'cheddar', clave_canonica: 'cheddar' }
      ]},
      { id: 'l2', user_id: 'user-1', proveedor_id: 'p2', items: [
        // Líquido: NO debe tratarse como fiambre (bug reportado del aceite)
        { productoLista: 'ACEITE OLIVA DON HUGO X 5 LT', precio: 19346.71, unidad: '',
          modo: 'unitario', tamano: 5, unidad_base: 'L', precio_unitario: 19346.71, precio_total: 96733.55,
          tipo: 'aceite oliva', clave_canonica: 'aceite oliva 5L' },
        // Envasado no-fiambre: sin campo de peso
        { productoLista: 'HARINA 000 x 25 kg', precio: 19664.94, unidad: '',
          modo: 'pack', tamano: 25, unidad_base: 'kg', precio_unitario: 786.6, precio_total: 19664.94,
          tipo: 'harina 000', clave_canonica: 'harina 000 25kg' }
      ]}
    ]
  };
}

function buscar(app, q) {
  app.doc.getElementById('buscar-producto').value = q;
  app.win.renderBuscarProducto();
  return app.doc.getElementById('buscar-content').innerHTML;
}
function itemPorNombre(app, frag) {
  return app.win.todosLosItems().find(function(i) { return i.productoLista.indexOf(frag) >= 0; });
}

// ════════════════════════════════════════════════════════════════════════════
(async function main() {

  // ── 1. COMPARADOR ─────────────────────────────────────────────────────────
  seccion('Comparador: "POR KILO" y aviso de pesaje');
  {
    var app = await montarApp(seedBase());

    var jamon = itemPorNombre(app, 'JAMON CRUDO');
    ok('jamón "$ X KG" guardado como pack se autocorrige a unitario',
       jamon && jamon.modo === 'unitario', jamon && jamon.modo);

    var hJamon = buscar(app, 'jamon crudo');
    ok('jamón por kg muestra "POR KILO"', /por kilo/i.test(hJamon));
    ok('jamón por kg avisa que se pesa al recibir', /⚖️/.test(hJamon));

    var hCheddar = buscar(app, 'cheddar');
    ok('cheddar (no matcheaba el diccionario) muestra "POR KILO"', /por kilo/i.test(hCheddar));

    var hAceite = buscar(app, 'aceite');
    ok('aceite 5 L NO dice "POR KILO"', !/por kilo/i.test(hAceite));
    ok('aceite 5 L NO se trata como fiambre (sin ⚖️)', !/⚖️/.test(hAceite));

    var hHarina = buscar(app, 'harina');
    ok('harina en bolsa (pack) NO dice "POR KILO"', !/por kilo/i.test(hHarina));
  }

  // ── 2. SELECTOR DE COLUMNAS CON DOS LISTAS EN PARALELO ────────────────────
  seccion('Selector de columna de precio (dos cargas simultáneas)');
  {
    var app = await montarApp(seedBase());
    // Interceptar el procesamiento para capturar con qué columna se llamó
    var llamadas = [];
    app.win.procesarPDFConColumna = function(lineas, nombreColumna, ejemplo, todas, ficha) {
      llamadas.push({ columna: nombreColumna, ficha: ficha.jobId });
      return Promise.resolve();
    };
    app.win.crearBarraProgreso = function() {};
    app.win.renderCuerpoCarga = function() {};
    app.win.renderTabsCargas = function() {};
    app.win.renderPreviewSiActiva = function() {};

    var colsA = { precios: [{ nombre: 'PRECIO LISTA', ejemplo: '1000' }, { nombre: 'PRECIO NETO', ejemplo: '800' }] };
    var colsB = { precios: [{ nombre: 'CONTADO', ejemplo: '500' }, { nombre: 'CTA CTE', ejemplo: '600' }] };
    var fichaA = { jobId: 'jobA', proveedorId: 'p1', titulo: 'listaA', estado: 'proc' };
    var fichaB = { jobId: 'jobB', proveedorId: 'p2', titulo: 'listaB', estado: 'proc' };

    // Se abren los DOS modales, como pasa al subir dos listas juntas
    app.win.mostrarSelectorColumnasPDF(['linea'], colsA, fichaA);
    app.win.mostrarSelectorColumnasPDF(['linea'], colsB, fichaB);

    var modales = app.doc.querySelectorAll('.modal-overlay[id^="colpdf-"]');
    ok('se abren dos modales independientes', modales.length === 2, 'hay ' + modales.length);

    var ids = Array.prototype.map.call(modales, function(m) { return m.id; });
    ok('los modales tienen ids distintos', ids[0] !== ids[1], ids.join(','));

    var radiosA = modales[0].querySelectorAll('input[type=radio]');
    var radiosB = modales[1].querySelectorAll('input[type=radio]');
    ok('los radios NO comparten name entre modales',
       radiosA[0].name !== radiosB[0].name, radiosA[0].name + ' vs ' + radiosB[0].name);

    // En el modal B elijo la SEGUNDA opción ("CTA CTE")
    radiosB[1].checked = true;
    // ...y en el A la segunda también ("PRECIO NETO"), para que no se pisen
    radiosA[1].checked = true;
    ok('elegir en un modal no desmarca el otro',
       radiosA[1].checked && radiosB[1].checked);

    // Confirmo el modal B
    modales[1].querySelector('button[data-rol="confirmar"]').click();
    await app.esperar();
    ok('el modal B procesa SU columna elegida (CTA CTE)',
       llamadas.length === 1 && llamadas[0].columna === 'CTA CTE',
       JSON.stringify(llamadas));
    ok('el modal B procesa SU ficha (jobB)',
       llamadas.length === 1 && llamadas[0].ficha === 'jobB', JSON.stringify(llamadas));

    // Confirmo el modal A
    app.doc.querySelector('.modal-overlay[id^="colpdf-"] button[data-rol="confirmar"]').click();
    await app.esperar();
    ok('el modal A procesa SU columna elegida (PRECIO NETO)',
       llamadas.length === 2 && llamadas[1].columna === 'PRECIO NETO', JSON.stringify(llamadas));
  }

  // ── 3. ARMAR Y CONFIRMAR PEDIDO ───────────────────────────────────────────
  seccion('Pedido: fecha de recepción obligatoria → historial');
  {
    var app = await montarApp(seedBase());
    var jamon = itemPorNombre(app, 'JAMON COCIDO BOCATTI');
    app.win.cambiarCantidad(jamon.itemId, 2);
    app.win.irAResumen();
    await app.esperar();

    var inp = app.doc.getElementById('resumen-fecha-cal');
    ok('el selector de fecha de recepción está visible',
       app.doc.getElementById('resumen-cal-selector').style.display !== 'none');
    ok('viene precargado con mañana por defecto', inp && inp.value === enDias(1), inp && inp.value);

    var msg = app.doc.getElementById('resumen-content').textContent;
    ok('el mensaje de WhatsApp incluye la fecha de recepción', /Te paso el pedido para el /.test(msg));

    // Elegir una fecha futura concreta
    inp.value = enDias(3);
    inp.dispatchEvent(new app.win.Event('change'));
    await app.esperar();

    app.dialogos.confirmar = true;
    app.win.confirmarPedido();
    await app.esperar(80);

    var hist = app.win.histGet();
    ok('el pedido va al historial', hist.length === 1, 'hay ' + hist.length);
    ok('guarda la fecha de recepción elegida',
       hist[0] && hist[0].fechaRecepcionEsperada === enDias(3), hist[0] && hist[0].fechaRecepcionEsperada);
    ok('el pedido queda pendiente de recepción', hist[0] && hist[0].recepcionado === false);

    // El calendario debe reflejarlo en la FECHA DE RECEPCIÓN, no en la de hoy
    ok('el calendario lo ubica en la fecha de recepción',
       !!app.win._calMap[enDias(3)], Object.keys(app.win._calMap).join(','));
    ok('el calendario NO lo ubica en hoy', !app.win._calMap[enDias(0)]);

    // Aparece en la pestaña de Recepción
    app.win.renderHistorialRecepcion();
    var htmlRec = app.doc.getElementById('historial-content-recepcion').innerHTML;
    ok('aparece en la pestaña Recepción', /Recepcionar/.test(htmlRec));
    ok('muestra "recibís el" con la fecha', /recibís el/.test(htmlRec));

    // La vista combinada (calendario + proyección del historial) no debe
    // duplicar el pedido en el día en que se HIZO: solo en el de recepción.
    // Este era el "fantasma" que quedaba en el calendario.
    var comb = app.win._calMapCombinado();
    ok('la vista del calendario lo muestra en la fecha de recepción', !!comb[enDias(3)]);
    ok('NO deja un fantasma en el día en que se hizo el pedido', !comb[enDias(0)],
       'días con entrada: ' + Object.keys(comb).join(','));
  }

  // ── 4. PEDIDO SIN FECHA ───────────────────────────────────────────────────
  seccion('Pedido: no se puede confirmar sin fecha');
  {
    var app = await montarApp(seedBase());
    var it = itemPorNombre(app, 'CHEDDAR');
    app.win.cambiarCantidad(it.itemId, 1);
    app.win.irAResumen();
    await app.esperar();
    // Vaciar la fecha a mano
    var inp = app.doc.getElementById('resumen-fecha-cal');
    inp.value = '';
    inp.dispatchEvent(new app.win.Event('change'));
    await app.esperar();
    var p = app.win.pedidoGet();
    p.fechaRecepcionEsperada = null;
    app.win.pedidoSet(p);

    app.dialogos.confirmar = true;
    app.win.confirmarPedido();
    await app.esperar();
    ok('no guarda el pedido sin fecha', app.win.histGet().length === 0);
    ok('avisa que falta la fecha',
       app.toastsTexto().some(function(t) { return /fecha|día/i.test(t); }), app.toastsTexto().join(' | '));
  }

  // ── 5. RECEPCIÓN CON PESO REAL ────────────────────────────────────────────
  seccion('Recepción: peso real en fiambres (pieza y envasado)');
  {
    var app = await montarApp(seedBase());
    // Pedido con: queso de barra (pieza variable), jamón envasado, y harina (no fiambre)
    var barra   = itemPorNombre(app, 'QUESO MOZZARELLA BARRA');
    var envasado= itemPorNombre(app, 'JAMON COCIDO BOCATTI');
    var harina  = itemPorNombre(app, 'HARINA 000');
    app.win.cambiarCantidad(barra.itemId, 1);
    app.win.cambiarCantidad(envasado.itemId, 2);
    app.win.cambiarCantidad(harina.itemId, 1);
    app.win.irAResumen();
    await app.esperar();
    app.doc.getElementById('resumen-fecha-cal').value = enDias(2);
    app.doc.getElementById('resumen-fecha-cal').dispatchEvent(new app.win.Event('change'));
    await app.esperar();
    app.dialogos.confirmar = true;
    app.win.confirmarPedido();
    await app.esperar(80);

    var pedido = app.win.histGet()[0];
    ok('se creó el pedido', !!pedido);
    var totalOriginal = pedido.total;

    app.win.abrirModalRecepcionar(pedido.id);
    await app.esperar();
    var inputs = app.doc.querySelectorAll('#modal-rec-items input[data-peso-id]');
    ok('hay campo de peso para los DOS fiambres (barra y envasado)',
       inputs.length === 2, 'hay ' + inputs.length);

    var porId = {};
    Array.prototype.forEach.call(inputs, function(i) { porId[i.getAttribute('data-peso-id')] = i; });
    ok('el envasado viene precargado con su peso (0.4 × 2 = 0.8)',
       porId[envasado.itemId] && porId[envasado.itemId].value === '0.8',
       porId[envasado.itemId] && porId[envasado.itemId].value);
    ok('la pieza variable viene VACÍA (hay que pesarla)',
       porId[barra.itemId] && porId[barra.itemId].value === '',
       porId[barra.itemId] && JSON.stringify(porId[barra.itemId].value));
    ok('la harina (no fiambre) no tiene campo de peso', !porId[harina.itemId]);

    // Cargar el peso real de la barra: 2.7 kg en vez de los 3 estimados
    porId[barra.itemId].value = '2.7';
    app.win.actualizarPesoRecepcion(porId[barra.itemId]);
    app.win.guardarRecepcion(false);
    await app.esperar(60);

    var recep = app.win.histGet()[0];
    var itBarra = recep.items.find(function(i) { return i.itemId === barra.itemId; });
    var itEnv   = recep.items.find(function(i) { return i.itemId === envasado.itemId; });
    ok('guarda el peso real de la barra', itBarra && itBarra.pesoReal === 2.7, itBarra && itBarra.pesoReal);
    ok('recalcula el subtotal de la barra (2.7 × 9466.88)',
       itBarra && Math.abs(itBarra.subtotal - 2.7 * 9466.88) < 1, itBarra && itBarra.subtotal);
    ok('el envasado precargado NO cambia su subtotal (4000 × 2)',
       itEnv && Math.abs(itEnv.subtotal - 8000) < 0.5, itEnv && itEnv.subtotal);
    ok('el total del pedido baja al pesar menos', recep.total < totalOriginal,
       recep.total + ' vs ' + totalOriginal);
    ok('queda marcado como recepcionado', recep.recepcionado === true);
  }

  // ── 6. CALENDARIO: BORRAR DÍA ─────────────────────────────────────────────
  seccion('Calendario: borrar el día borra el pedido y no reaparece');
  {
    var app = await montarApp(seedBase());
    var it = itemPorNombre(app, 'CHEDDAR');
    app.win.cambiarCantidad(it.itemId, 1);
    app.win.irAResumen();
    await app.esperar();
    var fechaRec = enDias(4);
    app.doc.getElementById('resumen-fecha-cal').value = fechaRec;
    app.doc.getElementById('resumen-fecha-cal').dispatchEvent(new app.win.Event('change'));
    await app.esperar();
    app.dialogos.confirmar = true;
    app.win.confirmarPedido();
    await app.esperar(80);

    ok('el pedido está en el historial', app.win.histGet().length === 1);
    ok('el día aparece en el calendario', !!app.win._calMapCombinado()[fechaRec]);

    // Borrar el día desde el calendario
    app.win._calDiaEditando = fechaRec;
    app.win.cerrarModalDia = function() {};
    await app.win.borrarDiaCalendario();
    await app.esperar(60);

    ok('borra el pedido del historial', app.win.histGet().length === 0, 'quedan ' + app.win.histGet().length);
    ok('el día desaparece del calendario', !app.win._calMapCombinado()[fechaRec]);
    ok('borra también en el servidor (no vuelve al recargar)',
       app.db.pedidos_programados.length === 0 && app.db.historial_pedidos.length === 0,
       'cal=' + app.db.pedidos_programados.length + ' hist=' + app.db.historial_pedidos.length);
  }

  // ── 7. MÉTRICAS POR FECHA DE RECEPCIÓN ────────────────────────────────────
  seccion('Métricas: gastado (real) vs estimado del mes');
  {
    var app = await montarApp(seedBase());
    var g = app.win.gastoDelMes;
    var añoH = HOY.getFullYear(), mesH = HOY.getMonth();
    var pedidos = [
      { total: 1000, recepcionado: true,  fechaRecepcion: new Date(añoH, mesH, 5, 12).getTime() },
      { total: 500,  recepcionado: false, fechaRecepcionEsperada: iso(new Date(añoH, mesH, 20)) },
      { total: 999,  recepcionado: false, fechaRecepcionEsperada: iso(new Date(añoH, mesH + 1, 1)) }
    ];
    var r = g(pedidos, añoH, mesH);
    ok('"gastado" cuenta solo lo ya recibido', r.real === 1000, String(r.real));
    ok('"estimado" suma los pendientes del mes', r.estimado === 1500, String(r.estimado));
    ok('no cuenta pedidos de otro mes', r.estimado === 1500 && r.nPend === 1);

    // Al recepcionar, el pendiente pasa a real
    pedidos[1].recepcionado = true;
    pedidos[1].fechaRecepcion = new Date(añoH, mesH, 20, 12).getTime();
    var r2 = g(pedidos, añoH, mesH);
    ok('al recepcionar, el pendiente pasa a "gastado"', r2.real === 1500 && r2.nPend === 0,
       'real=' + r2.real + ' pend=' + r2.nPend);
  }

  // ── 8. SYNC RESILIENTE (migración sin correr) ─────────────────────────────
  seccion('Sync: el pedido llega al servidor aunque falte la migración');
  {
    var seed = seedBase();
    seed.__columnasFaltantes = { historial_pedidos: ['fecha_recepcion_esperada'] };
    var app = await montarApp(seed);
    var it = itemPorNombre(app, 'CHEDDAR');
    app.win.cambiarCantidad(it.itemId, 1);
    app.win.irAResumen();
    await app.esperar();
    app.doc.getElementById('resumen-fecha-cal').value = enDias(2);
    app.doc.getElementById('resumen-fecha-cal').dispatchEvent(new app.win.Event('change'));
    await app.esperar();
    app.dialogos.confirmar = true;
    app.win.confirmarPedido();
    await app.esperar(100);

    ok('el pedido queda guardado localmente', app.win.histGet().length === 1);
    ok('y llega igual al servidor (reintento sin la columna)',
       app.db.historial_pedidos.length === 1, 'filas=' + app.db.historial_pedidos.length);
  }

  // ── 9. PRUEBA DE 15 DÍAS: VENCIMIENTO ─────────────────────────────────────
  seccion('Prueba de 15 días: transición a "vencido"');
  {
    var ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    var app = await montarApp({
      profile: { plan: 'business', plan_estado: 'prueba', plan_vence: ayer }
    });
    await app.esperar(80);

    ok('el perfil local ya quedó en "vencido" tras cargar', app.win.profile.plan_estado === 'vencido');
    ok('y se escribió en la base, no solo en memoria',
       app.db.profiles[0].plan_estado === 'vencido', app.db.profiles[0].plan_estado);
  }

  seccion('Prueba de 15 días: mientras no venció, no toca nada');
  {
    var manana = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    var app = await montarApp({
      profile: { plan: 'business', plan_estado: 'prueba', plan_vence: manana }
    });
    await app.esperar(80);

    ok('sigue en "prueba"', app.win.profile.plan_estado === 'prueba');
    ok('no se disparó ningún update de más',
       app.dbLog.filter(function(l) { return l.tabla === 'profiles' && l.op === 'update'; }).length === 0);
  }

  seccion('Prueba de 15 días: el cartel');
  {
    var enDiasIso = function(n) { return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString(); };

    var app1 = await montarApp({ profile: { plan: 'business', plan_estado: 'prueba', plan_vence: enDiasIso(6) } });
    await app1.esperar(80);
    var txt1 = app1.texto('#plan-banner-txt');
    ok('en prueba activa, dice "Prueba gratis"', /prueba gratis/i.test(txt1), txt1);
    ok('y menciona los días que quedan', /6/.test(txt1), txt1);

    var app2 = await montarApp({ profile: { plan: 'business', plan_estado: 'vencido' } });
    await app2.esperar(80);
    var txt2 = app2.texto('#plan-banner-txt');
    ok('vencido, dice que terminó', /termin/i.test(txt2), txt2);
    ok('el botón para elegir plan sigue ahí (es el mismo de siempre)',
       !!app2.doc.querySelector('#plan-banner button'));

    var app3 = await montarApp({ profile: { plan: 'business', plan_estado: 'activo' } });
    await app3.esperar(80);
    ok('un plan Max activo normal no muestra ningún cartel de prueba',
       app3.doc.getElementById('plan-banner').style.display === 'none');
  }

  seccion('Prueba vencida: no se puede seguir operando (pero sí ver lo que hay)');
  {
    var app = await montarApp({
      profile: { plan: 'business', plan_estado: 'vencido' },
      proveedores: [{ id: 'p1', user_id: 'user-1', nombre: 'Proveedor Test', telefono: '' }]
    });
    await app.esperar(80);

    app.win.abrirModalProv();
    ok('no abre el modal de nuevo proveedor', app.doc.getElementById('modal-prov').classList.contains('open') === false);
    ok('avisa por qué', app.toastsTexto().some(function(t) { return /prueba/i.test(t); }));

    ok('pero los proveedores que ya tenía se siguen viendo',
       app.doc.querySelectorAll('.prov-card').length === 1);
  }

  seccion('Recorrido guiado: se dispara solo una vez, y se puede reabrir');
  {
    var app = await montarApp({ profile: { recorrido_visto: false } });
    await app.esperar(80);

    ok('aparece el overlay del tour en una cuenta nueva',
       !!app.doc.querySelector('.tour-overlay'));

    app.doc.getElementById('tour-saltar').click();
    await app.esperar(30);

    ok('al saltarlo, se marca como visto en la base',
       app.db.profiles[0].recorrido_visto === true);
    ok('y desaparece el overlay', !app.doc.querySelector('.tour-overlay'));

    app.win.reabrirRecorrido();
    ok('el menú lo puede reabrir en cualquier momento',
       !!app.doc.querySelector('.tour-overlay'));
  }

  seccion('Recorrido guiado: una cuenta que ya lo vio, no lo ve de nuevo solo');
  {
    var app = await montarApp({ profile: { recorrido_visto: true } });
    await app.esperar(80);
    ok('no aparece el overlay', !app.doc.querySelector('.tour-overlay'));
  }

  seccion('Menú: acceso a códigos de prueba solo para admins');
  {
    // El email del usuario logueado sale de sesion.user.email (la sesión
    // simulada de auth), no de profile.email — por eso se pasa como
    // seed.email y no dentro de seed.profile. Ver comentario en harness.js.
    // El ítem está siempre en el HTML (display:none por defecto) y la JS lo
    // muestra o no según el email, así que getElementById() nunca da null:
    // hay que mirar style.display, igual que se hace con plan-banner arriba.
    var appAdmin = await montarApp({ email: 'luchivega1212@gmail.com' });
    await appAdmin.esperar(80);
    var itemAdmin = appAdmin.doc.getElementById('menu-codigos-prueba');
    ok('un admin ve el ítem de menú', !!itemAdmin && itemAdmin.style.display !== 'none');

    var appNormal = await montarApp({ email: 'un-negocio-cualquiera@gmail.com' });
    await appNormal.esperar(80);
    var itemNormal = appNormal.doc.getElementById('menu-codigos-prueba');
    ok('una cuenta normal NO lo ve', !itemNormal || itemNormal.style.display === 'none');
  }

  seccion('Banner de plan: un empleado no lo ve, aunque el dueño esté en prueba/vencido');
  {
    // seed.empleados con empleado_id:'user-1' (la sesión simulada siempre es
    // user-1, ver crearSupabaseFake) hace que cargarProfile() arme
    // empleadoInfo y esEmpleado() pase a ser true. owner_id también apunta a
    // 'user-1' a propósito: así effectiveUserId() sigue resolviendo a la
    // misma fila de `profiles` que seedeamos con plan_estado 'prueba', sin
    // necesitar una segunda fila de perfil separada para el dueño.
    var enDiasIso = function(n) { return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString(); };
    var empleadoSeed = [{ empleado_id: 'user-1', owner_id: 'user-1', nombre: 'Empleado Test', permisos: ['pedido'], activo: true }];

    var appPrueba = await montarApp({
      profile: { plan: 'business', plan_estado: 'prueba', plan_vence: enDiasIso(5) },
      empleados: empleadoSeed
    });
    await appPrueba.esperar(80);
    ok('esEmpleado() da true con la sesión simulada', appPrueba.win.esEmpleado() === true);
    ok('el banner queda oculto para un empleado aunque el dueño esté en prueba',
       appPrueba.doc.getElementById('plan-banner').style.display === 'none');

    var appVencido = await montarApp({
      profile: { plan: 'business', plan_estado: 'vencido' },
      empleados: empleadoSeed
    });
    await appVencido.esperar(80);
    ok('el banner también queda oculto para un empleado con el dueño vencido',
       appVencido.doc.getElementById('plan-banner').style.display === 'none');
  }

  seccion('Indicador flotante: aparece con una carga procesando');
  {
    var app = await montarApp({ proveedores: [{ id: 'p1', user_id: 'user-1', nombre: 'Proveedor Uno' }] });
    await app.esperar(80);

    app.win.cargas = [{ id: 'f1', proveedorId: 'p1', titulo: 'Proveedor Uno', estado: 'procesando', jobId: 'j1' }];
    app.win.renderCargaFlotante();

    ok('el indicador se muestra', app.doc.getElementById('carga-flotante').style.display !== 'none');
    var texto = app.doc.getElementById('carga-flotante-resumen').textContent;
    ok('el resumen menciona que está procesando', /procesando|cargando/i.test(texto), texto);
  }

  seccion('Indicador flotante: desaparece sin cargas activas');
  {
    var app = await montarApp({});
    await app.esperar(80);
    app.win.cargas = [];
    app.win.renderCargaFlotante();
    ok('el indicador queda oculto', app.doc.getElementById('carga-flotante').style.display === 'none');
  }

  seccion('Indicador flotante: marca error si alguna ficha falló');
  {
    var app = await montarApp({});
    await app.esperar(80);
    app.win.cargas = [{ id: 'f1', proveedorId: 'p1', titulo: 'Proveedor Uno', estado: 'error', error: 'Fallo la IA' }];
    app.win.renderCargaFlotante();
    ok('el resumen queda marcado con la clase de error',
       app.doc.getElementById('carga-flotante-resumen').classList.contains('con-error'));
  }

  seccion('Indicador flotante: el panel desplegado lista cada ficha');
  {
    var app = await montarApp({});
    await app.esperar(80);
    app.win.cargas = [
      { id: 'f1', proveedorId: 'p1', titulo: 'Proveedor Uno', estado: 'procesando', jobId: 'j1' },
      { id: 'f2', proveedorId: 'p2', titulo: 'Proveedor Dos', estado: 'listo' }
    ];
    app.win.renderCargaFlotante();
    ok('el panel tiene una fila por ficha',
       app.doc.querySelectorAll('#carga-flotante-panel .carga-flotante-fila').length === 2);
  }

  seccion('Indicador flotante: se actualiza cuando guardarLista() saca una ficha de cargas');
  {
    var app = await montarApp({
      proveedores: [
        { id: 'p1', user_id: 'user-1', nombre: 'Proveedor Uno' },
        { id: 'p2', user_id: 'user-1', nombre: 'Proveedor Dos' }
      ]
    });
    await app.esperar(80);

    app.win.cargas = [
      { id: 'f1', proveedorId: 'p1', titulo: 'Proveedor Uno', estado: 'listo',
        filasPreview: [{ productoLista: 'Producto A', precio: 100, unidad: 'kg' }] },
      { id: 'f2', proveedorId: 'p2', titulo: 'Proveedor Dos', estado: 'procesando', jobId: 'j2', filasPreview: [] }
    ];
    app.win.cargaActivaId = 'f1';
    app.win.renderCargaFlotante();
    ok('antes de guardar, el panel lista las 2 fichas',
       app.doc.querySelectorAll('#carga-flotante-panel .carga-flotante-fila').length === 2);

    await app.win.guardarLista();
    await app.esperar(50);

    ok('la ficha guardada ya no está en cargas', app.win.cargas.length === 1);
    ok('el panel del indicador ya refleja el cambio (ya no lista la guardada)',
       app.doc.querySelectorAll('#carga-flotante-panel .carga-flotante-fila').length === 1);
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
