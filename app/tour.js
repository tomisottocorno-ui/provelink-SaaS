// app/tour.js — Recorrido guiado, genérico y sin librería externa.
//
// Atenúa la pantalla, resalta un elemento real por vez (vía selector CSS) y
// muestra una tarjeta con una explicación corta y los controles para avanzar.
// No sabe nada de ProveLink: los pasos (selector/título/texto) se los pasa
// quien lo usa. Pensado para 4-8 pasos, no para reemplazar documentación.
window.Tour = (function() {
  var overlay = null, tarjeta = null, resaltado = null;
  var pasos = [], idx = 0, cbFinal = null;

  function limpiarResaltado() {
    if (resaltado) {
      resaltado.classList.remove('tour-resaltado');
      resaltado = null;
    }
  }

  function posicionarTarjeta(el) {
    var r = el.getBoundingClientRect();
    var alturaTarjeta = tarjeta.offsetHeight || 160;
    var anchoTarjeta = tarjeta.offsetWidth || 300;
    var arriba = r.top > (window.innerHeight || 800) / 2;
    var left = Math.max(12, Math.min(r.left, (window.innerWidth || 1000) - anchoTarjeta - 12));
    tarjeta.style.left = left + 'px';
    tarjeta.style.top = (arriba ? (r.top - alturaTarjeta - 14) : (r.bottom + 14)) + 'px';
    tarjeta.style.transform = '';
  }

  function pintarPaso() {
    var paso = pasos[idx];
    limpiarResaltado();
    var el = document.querySelector(paso.selector);
    if (el) {
      el.classList.add('tour-resaltado');
      resaltado = el;
      if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    tarjeta.innerHTML =
      '<div class="tour-paso">' + (idx + 1) + ' / ' + pasos.length + '</div>' +
      '<h4>' + paso.titulo + '</h4>' +
      '<p>' + paso.texto + '</p>' +
      '<div class="tour-botones">' +
        (idx > 0 ? '<button type="button" class="btn" id="tour-atras">Atrás</button>' : '<span></span>') +
        '<div>' +
          '<button type="button" class="btn" id="tour-saltar">Saltar</button>' +
          '<button type="button" class="btn primary" id="tour-siguiente">' +
            (idx === pasos.length - 1 ? 'Listo' : 'Siguiente') +
          '</button>' +
        '</div>' +
      '</div>';

    if (el) posicionarTarjeta(el);
    else {
      tarjeta.style.left = '50%';
      tarjeta.style.top = '50%';
      tarjeta.style.transform = 'translate(-50%,-50%)';
    }

    document.getElementById('tour-siguiente').onclick = function() {
      if (idx >= pasos.length - 1) terminar();
      else { idx++; pintarPaso(); }
    };
    document.getElementById('tour-saltar').onclick = terminar;
    var btnAtras = document.getElementById('tour-atras');
    if (btnAtras) btnAtras.onclick = function() { idx--; pintarPaso(); };
  }

  function onResize() {
    if (resaltado) posicionarTarjeta(resaltado);
  }

  function terminar() {
    limpiarResaltado();
    if (overlay) { overlay.remove(); overlay = null; }
    if (tarjeta) { tarjeta.remove(); tarjeta = null; }
    window.removeEventListener('resize', onResize);
    var cb = cbFinal;
    cbFinal = null;
    if (cb) cb();
  }

  // Recorre `pasosIn` ({selector, titulo, texto}[]). Los pasos cuyo selector
  // no existe en la página se descartan solos, para no romper si algo no
  // cargó. Si no queda ningún paso válido, llama a `onTerminar` derecho, sin
  // mostrar nada.
  function iniciar(pasosIn, onTerminar) {
    pasos = (pasosIn || []).filter(function(p) { return document.querySelector(p.selector); });
    cbFinal = onTerminar || null;

    if (!pasos.length) {
      var cb = cbFinal;
      cbFinal = null;
      if (cb) cb();
      return;
    }

    idx = 0;
    overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    document.body.appendChild(overlay);

    tarjeta = document.createElement('div');
    tarjeta.className = 'tour-tarjeta';
    document.body.appendChild(tarjeta);

    window.addEventListener('resize', onResize);
    pintarPaso();
  }

  return { iniciar: iniciar };
})();
