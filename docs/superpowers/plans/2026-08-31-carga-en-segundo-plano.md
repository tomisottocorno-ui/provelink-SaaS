# Carga de listas en segundo plano — Plan de implementación (Parte 1)

> **Para agentes:** REQUERIDA: usar `superpowers:subagent-driven-development` para ejecutar este plan tarea por tarea.

**Goal:** Cerrar el modal de carga de listas ya no cancela el procesamiento; un indicador flotante arriba a la derecha muestra el estado agregado y permite reabrir la ficha que corresponda.

**Architecture:** Todo el estado ya vive en el array global `cargas` y ya sigue corriendo aunque el modal esté oculto (confirmado por investigación previa) — el cambio es: (1) que `cerrarModalLista()` deje de marcar `cancelado`/limpiar el array cuando hay algo procesando, (2) una función nueva `reabrirModalCargas()` para volver sin resetear, (3) un indicador flotante nuevo (`#carga-flotante`) que se re-renderiza en los mismos puntos donde ya se actualiza el progreso hoy.

**Spec:** `docs/superpowers/specs/2026-08-31-carga-en-segundo-plano-design.md`

---

## Mapa de archivos

| Archivo | Qué cambia |
|---|---|
| `app/index.html` | HTML del indicador, `cerrarModalLista()`, `reabrirModalCargas()`, `renderCargaFlotante()`, llamadas nuevas en los puntos de actualización de progreso |
| `app/styles.css` | CSS del indicador flotante |
| `tests/run-flujos.js` | Tests nuevos |

---

## Tarea 1: El indicador flotante — HTML y CSS

**Archivos:**
- Modificar: `app/index.html`
- Modificar: `app/styles.css`

- [ ] **Paso 1: Leer el contexto real antes de tocar nada**

Leé `app/index.html` alrededor de la línea 646 (declaración de `cargas`), 3075-3260 (`abrirModalLista`, `nuevaCargaTab`, `cerrarCargaTab`, `cerrarModalLista`, `_cerrarModalListaReal`, `crearBarraProgreso`, `setProgresoJob`, `removeBarraProgreso`) y confirmá que el código coincide con lo que se describe en cada paso de este plan — si algo cambió desde que se escribió este plan, avisá antes de aplicar un cambio que no calce.

- [ ] **Paso 2: Agregar el HTML del indicador**

Ubicá dónde termina el `<body>` (o un lugar a nivel raíz fuera de cualquier otro modal/overlay — buscá dónde está el markup de `#toast-container` o similar para ubicarte en la convención de "elementos flotantes globales" que ya use este archivo) y agregá:

```html
<!-- Indicador flotante de cargas en segundo plano -->
<div class="carga-flotante" id="carga-flotante" style="display:none;">
  <button type="button" class="carga-flotante-resumen" id="carga-flotante-resumen" onclick="toggleCargaFlotantePanel()"></button>
  <div class="carga-flotante-panel" id="carga-flotante-panel" style="display:none;"></div>
</div>
```

- [ ] **Paso 3: CSS**

Al final de `app/styles.css`, usando las variables reales que ya existen en `:root` de este archivo (confirmalas antes — `--surface`, `--border-hi`, `--accent`, `--r-md`, `--text`, `--text-muted`, `--danger` o el nombre real que corresponda a color de error, `--success`/`--emerald` o el nombre real para color de éxito):

```css
/* ============================================================
   CARGA EN SEGUNDO PLANO
   ============================================================ */
.carga-flotante {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 600;
  font-size: 13px;
}
.carga-flotante-resumen {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--border-hi);
  border-radius: var(--r-md);
  padding: 8px 14px;
  color: var(--text);
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.carga-flotante-resumen.con-error { border-color: var(--danger); }
.carga-flotante-panel {
  margin-top: 8px;
  background: var(--surface);
  border: 1px solid var(--border-hi);
  border-radius: var(--r-md);
  padding: 8px;
  min-width: 220px;
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
}
.carga-flotante-fila {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-muted);
}
.carga-flotante-fila:hover { background: var(--bg-elev2); }
.carga-flotante-fila.error { color: var(--danger); }
.carga-flotante-fila.listo { color: var(--text); }
```

Si `--bg-elev2` no existe con ese nombre en este archivo (es un nombre que vi usado en `crearBarraProgreso`, así que debería existir), confirmalo con grep antes de usarlo.

- [ ] **Paso 4: Commit**

```bash
cd C:\ProveLink\provelink-SaaS
git add app/index.html app/styles.css
git commit -m "feat: markup y estilos del indicador flotante de cargas en segundo plano"
```

(No hace falta test para HTML/CSS puro sin comportamiento todavía — el comportamiento es la Tarea 2.)

---

## Tarea 2: `renderCargaFlotante()` y su cableado

**Archivos:**
- Modificar: `app/index.html`
- Test: `tests/run-flujos.js`

- [ ] **Paso 1: Escribir el test primero**

Agregá a `tests/run-flujos.js`, antes del resumen final:

```js
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
```

Si el mock de `montarApp({ proveedores: [...] })` no acepta seed de proveedores de esa forma, o si `app.win.cargas` no es accesible tal cual (por ejemplo si `cargas` está en un scope no expuesto a `window`), ajustá el test al mecanismo real del harness — leé `tests/harness.js` primero si tenés dudas.

- [ ] **Paso 2: Correr para confirmar que falla**

```bash
cd C:\ProveLink\provelink-SaaS
node tests/run-flujos.js
```

- [ ] **Paso 3: Implementar `renderCargaFlotante()`**

Agregala cerca de `crearBarraProgreso`/`setProgresoJob`/`removeBarraProgreso` (línea ~3289 aproximada — confirmá la ubicación real):

```js
// ============================================================
// INDICADOR FLOTANTE DE CARGAS EN SEGUNDO PLANO
// ============================================================
// Se re-renderiza en los mismos puntos donde ya se actualiza el progreso de
// una carga (no hace falta un mecanismo de eventos nuevo) — ver
// setProgresoJob, crearBarraProgreso, removeBarraProgreso, y los 4 lugares
// donde cambia ficha.estado a 'listo'/'error', más donde se agregan/sacan
// fichas de `cargas`.
function renderCargaFlotante() {
  var cont = $('carga-flotante');
  var resumen = $('carga-flotante-resumen');
  var panel = $('carga-flotante-panel');
  if (!cont || !resumen || !panel) return;

  var relevantes = cargas.filter(function(c) {
    return c.estado === 'procesando' || c.estado === 'listo' || c.estado === 'error';
  });

  if (!relevantes.length) {
    cont.style.display = 'none';
    return;
  }

  var procesando = relevantes.filter(function(c) { return c.estado === 'procesando'; });
  var conError = relevantes.some(function(c) { return c.estado === 'error'; });

  resumen.classList.toggle('con-error', conError);

  if (procesando.length > 0) {
    resumen.textContent = procesando.length === 1
      ? 'Procesando 1 lista…'
      : 'Procesando ' + procesando.length + ' listas…';
  } else if (conError) {
    resumen.textContent = 'Hubo un error en una carga';
  } else {
    resumen.textContent = 'Lista lista para revisar';
  }

  panel.innerHTML = relevantes.map(function(c) {
    var iconoTxt = c.estado === 'error' ? 'Error' : (c.estado === 'listo' ? 'Listo' : 'Procesando…');
    return '<div class="carga-flotante-fila ' + c.estado + '" onclick="reabrirModalCargas(\'' + c.id + '\')">' +
      '<span>' + escapeHtml(c.titulo || 'Lista') + '</span>' +
      '<span>' + iconoTxt + '</span>' +
    '</div>';
  }).join('');

  cont.style.display = 'block';
}

function toggleCargaFlotantePanel() {
  var panel = $('carga-flotante-panel');
  if (!panel) return;
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
```

- [ ] **Paso 4: Cablear las llamadas**

Agregá `renderCargaFlotante();` al final de estas funciones existentes (una línea en cada una, al final del cuerpo):
- `crearBarraProgreso(jobId)`
- `setProgresoJob(jobId, texto, pct)`
- `removeBarraProgreso(jobId)`
- `nuevaCargaTab()`
- `cerrarCargaTab(id)`
- `_cerrarModalListaReal()`

Y en los 4 lugares donde se asigna `ficha.estado = 'listo'` o `ficha.estado = 'error'` (buscalos con `grep -n "\.estado = '\(error\|listo\)'" app/index.html` para confirmar las líneas reales — el plan asume 4 sitios: uno en `finalizarCargaListo` línea ~682, y tres más en el flujo de `procesarArchivo`/procesamiento, líneas ~3364 y ~3643 aproximadas), agregá `renderCargaFlotante();` inmediatamente después de cada asignación.

Si encontrás más o menos de 4 sitios, o alguno en un lugar inesperado, cableálos todos igual — el criterio es "cualquier lugar que cambie el estado visible de una ficha debe disparar un re-render del indicador", no un número fijo.

- [ ] **Paso 5: Correr y confirmar que pasa**

```bash
node tests/run-flujos.js
```

- [ ] **Paso 6: Commit**

```bash
git add app/index.html tests/run-flujos.js
git commit -m "feat: renderCargaFlotante() y su cableado en los puntos donde ya se actualiza el progreso"
```

---

## Tarea 3: Cerrar ya no cancela + reabrir sin resetear

**Archivos:**
- Modificar: `app/index.html`
- Test: `tests/run-flujos.js`

- [ ] **Paso 1: Escribir el test primero**

```js
  seccion('Cerrar el modal mientras procesa ya NO cancela');
  {
    var app = await montarApp({});
    await app.esperar(80);
    app.win.cargas = [{ id: 'f1', proveedorId: 'p1', titulo: 'Proveedor Uno', estado: 'procesando', jobId: 'j1', cancelado: false }];
    app.win.cargaActivaId = 'f1';
    app.doc.getElementById('modal-lista').classList.add('open');

    app.win.cerrarModalLista();

    ok('el modal se oculta', !app.doc.getElementById('modal-lista').classList.contains('open'));
    ok('la ficha sigue SIN cancelar', app.win.cargas[0].cancelado === false);
    ok('la ficha sigue en el array (no se resetea)', app.win.cargas.length === 1);
  }

  seccion('Cerrar el modal sin nada procesando sigue limpiando todo (comportamiento viejo)');
  {
    var app = await montarApp({});
    await app.esperar(80);
    app.win.cargas = [{ id: 'f1', proveedorId: 'p1', titulo: 'Proveedor Uno', estado: 'listo' }];
    app.doc.getElementById('modal-lista').classList.add('open');

    app.win.cerrarModalLista();

    ok('el modal se cierra', !app.doc.getElementById('modal-lista').classList.contains('open'));
    ok('y esta vez sí se limpia el array', app.win.cargas.length === 0);
  }

  seccion('reabrirModalCargas() vuelve a mostrar el modal sin resetear nada');
  {
    var app = await montarApp({ proveedores: [{ id: 'p1', user_id: 'user-1', nombre: 'Proveedor Uno' }] });
    await app.esperar(80);
    app.win.cargas = [{ id: 'f1', proveedorId: 'p1', titulo: 'Proveedor Uno', estado: 'listo', filasPreview: [] }];

    app.win.reabrirModalCargas('f1');

    ok('el modal queda abierto', app.doc.getElementById('modal-lista').classList.contains('open'));
    ok('la ficha activa es la pedida', app.win.cargaActivaId === 'f1');
    ok('el array sigue teniendo la misma ficha (no se reseteó)', app.win.cargas.length === 1);
  }
```

Si `montarApp({})` sin seed de `proveedores` rompe algo que la primera prueba necesite (por ejemplo si `cerrarModalLista` llama internamente a algo que asume `proveedores` no vacío), agregá un seed mínimo de proveedores a esas pruebas también.

- [ ] **Paso 2: Correr para confirmar que falla**

```bash
node tests/run-flujos.js
```

- [ ] **Paso 3: Reescribir `cerrarModalLista()`**

Reemplazá la función actual:

```js
function cerrarModalLista() {
  var procesando = cargas.filter(function(c) { return c.estado === 'procesando'; });
  if (procesando.length > 0) {
    if (!confirm('Hay ' + procesando.length + ' lista(s) procesando. Si cerrás, se cancelan. ¿Cerrar igual?')) return;
  }
  cargas.forEach(function(c) { c.cancelado = true; if (c.jobId) removeBarraProgreso(c.jobId); });
  _cerrarModalListaReal();
}
```

por:

```js
function cerrarModalLista() {
  var hayProcesando = cargas.some(function(c) { return c.estado === 'procesando'; });
  if (hayProcesando) {
    // Ya no cancela: se oculta nomás, el trabajo sigue y se retoma desde el
    // indicador flotante (ver renderCargaFlotante / reabrirModalCargas).
    $('modal-lista').classList.remove('open');
    return;
  }
  _cerrarModalListaReal();
}
```

- [ ] **Paso 4: Agregar `reabrirModalCargas()`**

Cerca de `abrirModalLista()`:

```js
// Vuelve a mostrar el modal sobre las cargas que ya existían (sin resetear
// `cargas`, a diferencia de abrirModalLista()) — la usa el indicador
// flotante para volver a la ficha que corresponda.
function reabrirModalCargas(fichaId) {
  if (!cargas.length) return;
  if (fichaId && cargaPorId(fichaId)) {
    cargaActivaId = fichaId;
  } else if (!cargaActivaId || !cargaPorId(cargaActivaId)) {
    cargaActivaId = cargas[0].id;
  }
  $('modal-lista').classList.add('open');
  renderTabsCargas();
  renderCuerpoCarga();
}
```

Confirmá que `cargaPorId(id)` existe como función en este archivo (se usa en `activarCargaTab`/`cerrarCargaTab`) antes de asumir el nombre.

- [ ] **Paso 5: Correr y confirmar que pasa**

```bash
node tests/run-flujos.js
```

- [ ] **Paso 6: Correr toda la suite**

```bash
npm test
```

- [ ] **Paso 7: Commit**

```bash
git add app/index.html tests/run-flujos.js
git commit -m "feat: cerrar el modal ya no cancela el procesamiento, reabrirModalCargas() para volver"
```

---

## Auto-revisión del plan

- **Cobertura del spec:** §3 (cerrar no cancela, reabrir, indicador, cuándo desaparece) → Tareas 1-3. §4 (costo) no requiere código, ya está respondido en la spec. §5 (Parte 2) es una tarea aparte, fuera de este plan.
- **Placeholders:** ninguno funcional — los números de línea son aproximados y el plan pide confirmarlos con grep antes de editar, siguiendo el mismo criterio que ya funcionó en planes anteriores de este mismo repo.
- **Consistencia de nombres:** `renderCargaFlotante()`, `reabrirModalCargas(fichaId)`, `toggleCargaFlotantePanel()` se usan igual en todas las tareas.
- **Riesgo principal:** el número exacto de sitios donde cablear `renderCargaFlotante()` (Tarea 2, Paso 4) se estimó en "4 lugares de estado + 6 funciones" a partir de una lectura previa del archivo — el plan explícitamente le pide al implementador re-confirmar con grep en el momento, no confiar en el número.
