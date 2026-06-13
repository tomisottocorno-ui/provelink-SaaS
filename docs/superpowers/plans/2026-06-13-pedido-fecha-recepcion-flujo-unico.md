# Flujo único de pedido con fecha de recepción — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar el armado de pedidos en un flujo único que pregunta la fecha de recepción, la usa en el mensaje de WhatsApp, el historial y el calendario, y atribuye las métricas por fecha de recepción (real + estimado).

**Architecture:** App vanilla JS de un solo archivo (`app/index.html`, ~8200 líneas de script inline) + funciones puras en `app/pipeline.js` (cargado antes, testeable vía `vm.runInNewContext`). Las funciones puras nuevas (fechas/atribución de gasto) van a `pipeline.js` con tests deterministas en `tests/`. El resto son ediciones de DOM/flujo verificadas con chequeo de sintaxis + preview.

**Tech Stack:** HTML/JS vanilla, Supabase (Postgres + RLS), localStorage como store primario del historial/calendario.

**Referencia de spec:** `docs/superpowers/specs/2026-06-13-pedido-fecha-recepcion-flujo-unico-design.md`

**Convención de campo:** el pedido gana `fechaRecepcionEsperada` (string ISO `YYYY-MM-DD`). Ya existen `fechaRecepcion` (timestamp ms real, se setea al recepcionar) y `recepcionado` (bool).

---

## Archivos que se tocan

- `app/pipeline.js` — 2 funciones puras nuevas: `fechaAtribucionGastoISO`, `gastoDelMes`.
- `tests/run-pedidos.js` — **nuevo**, tests de las 3 funciones puras.
- `sql/MIGRACION_FECHA_RECEPCION.sql` — **nuevo**, columna `fecha_recepcion_esperada`.
- `sql/schema.sql` — agregar la columna al esquema canónico.
- `app/index.html` — landing, resumen+picker, mensaje WhatsApp, `confirmarPedido`, render de historial, métricas, calendario, sync de pedidos.

---

## Task 1: Migración SQL + sincronización del campo

**Files:**
- Create: `sql/MIGRACION_FECHA_RECEPCION.sql`
- Modify: `sql/schema.sql` (tabla `historial_pedidos`)
- Modify: `app/index.html` (`_pedidoARow` ~5506, `_rowAPedido` ~5528)

- [ ] **Step 1: Crear la migración**

Crear `sql/MIGRACION_FECHA_RECEPCION.sql`:

```sql
-- MIGRACION_FECHA_RECEPCION.sql
-- Agrega la fecha de recepción esperada (el día que el usuario dice que va a
-- recibir el pedido) a historial_pedidos, para que sincronice entre dispositivos.
alter table public.historial_pedidos
  add column if not exists fecha_recepcion_esperada date;
```

- [ ] **Step 2: Reflejar la columna en el schema canónico**

En `sql/schema.sql`, en el `create table if not exists public.historial_pedidos` (~113-122), `faltantes` es la última columna. Reemplazar:

```sql
  faltantes jsonb default '[]'::jsonb
);
```

por:

```sql
  faltantes jsonb default '[]'::jsonb,
  fecha_recepcion_esperada date
);
```

- [ ] **Step 3: Sincronizar al subir (`_pedidoARow`)**

En `app/index.html`, función `_pedidoARow` (~5506), agregar el campo al objeto `row` devuelto (después de `faltantes: p.faltantes || [],`):

```javascript
    fecha_recepcion_esperada: p.fechaRecepcionEsperada || null,
```

- [ ] **Step 4: Sincronizar al bajar (`_rowAPedido`)**

En `app/index.html`, función `_rowAPedido` (~5528), agregar al objeto devuelto (después de `fechaRecepcion: r.fecha_recepcion ? ... : null,`):

```javascript
    fechaRecepcionEsperada: r.fecha_recepcion_esperada || null,
```

- [ ] **Step 5: Verificar sintaxis**

Run:
```bash
node -e "var fs=require('fs');var h=fs.readFileSync('app/index.html','utf8');var re=/<script>([\s\S]*?)<\/script>/g,m,ok=true,i=0;while((m=re.exec(h))!==null){i++;try{new Function(m[1]);}catch(e){ok=false;console.log('s'+i+': '+e.message);}}console.log(ok?'OK':'FAIL');process.exit(ok?0:1);"
```
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add sql/MIGRACION_FECHA_RECEPCION.sql sql/schema.sql app/index.html
git commit -m "feat(sql): columna fecha_recepcion_esperada + sync"
```

---

## Task 2: Funciones puras de atribución de gasto (TDD)

**Files:**
- Modify: `app/pipeline.js` (el archivo son declaraciones top-level; agregar al final)
- Create: `tests/run-pedidos.js`

- [ ] **Step 1: Escribir el test que falla**

Crear `tests/run-pedidos.js`:

```javascript
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
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `node tests/run-pedidos.js`
Expected: FAIL — `ctx.fechaAtribucionGastoISO is not a function` (las funciones no existen aún).

- [ ] **Step 3: Implementar las funciones puras**

En `app/pipeline.js`, agregar al final del archivo:

```javascript
// Fecha (YYYY-MM-DD) a la que se atribuye el gasto de un pedido en métricas:
//   recepcionado            → su fecha de recepción real (fechaRecepcion, ms)
//   pendiente con esperada  → la fecha esperada (fechaRecepcionEsperada)
//   pedido viejo (fallback) → la fecha en que se hizo (timestamp, ms)
function fechaAtribucionGastoISO(pedido) {
  if (!pedido) return null;
  var toISO = function(ts) {
    var d = new Date(ts);
    if (isNaN(d.getTime())) return null;
    var mm = ('0' + (d.getMonth() + 1)).slice(-2);
    var dd = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + mm + '-' + dd;
  };
  if (pedido.recepcionado && pedido.fechaRecepcion) return toISO(pedido.fechaRecepcion);
  if (pedido.fechaRecepcionEsperada) return String(pedido.fechaRecepcionEsperada).slice(0, 10);
  if (pedido.timestamp) return toISO(pedido.timestamp);
  return null;
}

// Gasto real y estimado de un mes (year, monthIdx 0-11), atribuyendo cada pedido
// por su fecha de recepción. real = ya recepcionados; estimado = real + pendientes
// cuya fecha de recepción cae en el mes. Pura.
function gastoDelMes(pedidos, year, monthIdx) {
  var real = 0, estimado = 0, nReal = 0, nPend = 0;
  (pedidos || []).forEach(function(p) {
    var iso = fechaAtribucionGastoISO(p);
    if (!iso) return;
    var partes = iso.split('-');
    if (+partes[0] !== year || (+partes[1] - 1) !== monthIdx) return;
    var total = p.total || 0;
    estimado += total;
    if (p.recepcionado) { real += total; nReal++; }
    else { nPend++; }
  });
  return { real: real, estimado: estimado, nReal: nReal, nPend: nPend };
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `node tests/run-pedidos.js`
Expected: `TODOS OK` (exit 0)

- [ ] **Step 5: Verificar que el golden sigue OK (pipeline.js no se rompió)**

Run: `node tests/run-golden.js`
Expected: `Errors determinísticos: 0`

- [ ] **Step 6: Commit**

```bash
git add app/pipeline.js tests/run-pedidos.js
git commit -m "feat: helpers puros fechaAtribucionGastoISO/gastoDelMes + tests"
```

---

## Task 3: Eliminar el landing de 2 botones y el botón Programar del calendario

**Files:**
- Modify: `app/index.html` (HTML landing ~197-220; HTML calendario ~149; `_entrarTabPedido` ~6155; `_renderBannerModoPedido` ~6177; `arrancarRealizarPedido` ~6207; `arrancarProgramarPedido` ~6217; `volverALandingPedido` ~6259)

- [ ] **Step 1: Quitar el botón "Programar pedido" del calendario**

En `app/index.html` (~149), borrar la línea:

```html
          <button class="btn primary" onclick="arrancarProgramarPedido()" style="font-size:12px;padding:7px 14px;"><span class="icon-slot" data-icon="plus"></span> Programar pedido</button>
```

- [ ] **Step 2: Reemplazar el landing de 2 tarjetas por entrada directa al buscador**

En `app/index.html`, reemplazar todo el bloque `<div id="pedido-landing" ...> ... </div>` (desde `<!-- LANDING: 2 opciones grandes ...` hasta el `</div>` que cierra `pedido-landing`, ~líneas 197-221) por:

```html
      <!-- (Landing de 2 modos eliminado: el flujo es único — armar y al confirmar se pide la fecha de recepción) -->
```

- [ ] **Step 3: Simplificar `_entrarTabPedido` (siempre mostrar el buscador)**

Reemplazar la función `_entrarTabPedido` (~6155) por:

```javascript
function _entrarTabPedido() {
  var landing = $('pedido-landing');
  var flujo = $('pedido-flujo');
  if (landing) landing.style.display = 'none';
  if (!flujo) return;
  flujo.style.display = '';
  var titulo = $('pedido-flujo-titulo');
  if (titulo) titulo.textContent = 'Armar pedido';
  var banner = $('pedido-modo-banner');
  if (banner) banner.style.display = 'none';
  renderFaltantesSugerencia();
  renderBuscarProducto();
  actualizarBadgePedido();
  pintarIconosEstaticos(flujo);
}
```

- [ ] **Step 4: Neutralizar `_renderBannerModoPedido` y `volverALandingPedido`**

Reemplazar `_renderBannerModoPedido` (~6177) por una versión vacía (se conserva el nombre por si lo llama algo):

```javascript
function _renderBannerModoPedido() {
  var banner = $('pedido-modo-banner');
  if (banner) banner.style.display = 'none';
}
```

Reemplazar `volverALandingPedido` (~6259) por una versión que solo limpia el pedido en curso (ya no hay landing al cual volver):

```javascript
function volverALandingPedido() {
  var p = pedidoGet();
  var tieneItems = Object.keys(p.items || {}).filter(function(k) { return p.items[k].qty > 0; }).length > 0;
  if (tieneItems && !confirm('¿Vaciar el pedido en curso?')) return;
  pedidoSet({ items: {} });
  actualizarBadgePedido();
  renderBuscarProducto();
}
```

- [ ] **Step 5: Unificar `arrancarRealizarPedido` y reducir `arrancarProgramarPedido`**

Reemplazar `arrancarRealizarPedido` (~6207) por (sin `modo`):

```javascript
function arrancarRealizarPedido() {
  var p = pedidoGet();
  pedidoSet(Object.assign({}, p, { fechaRecepcionEsperada: null }));
  _entrarTabPedido();
  setTimeout(function() { var inp = $('buscar-producto'); if (inp) inp.focus(); }, 80);
}
```

Reemplazar `arrancarProgramarPedido` (~6217) por un alias (por si quedan llamadas):

```javascript
function arrancarProgramarPedido() {
  arrancarRealizarPedido();
}
```

- [ ] **Step 6: Verificar sintaxis y abrir preview**

Run el chequeo de sintaxis del Task 1 Step 5. Expected: `OK`.
Verificación manual (preview): entrar al tab "Pedido" → debe ir directo al buscador, sin las 2 tarjetas; el calendario ya no muestra "Programar pedido".

- [ ] **Step 7: Commit**

```bash
git add app/index.html
git commit -m "feat: flujo único de pedido (sin landing realizar/programar)"
```

---

## Task 4: Selector de fecha de recepción en el resumen + mensaje WhatsApp con la fecha

**Files:**
- Modify: `app/index.html` (HTML `resumen-cal-selector` ~267-280; `renderResumen` ~6616; `actualizarBotonConfirmar` ~6750)

- [ ] **Step 1: Relabelar el selector de fecha en el HTML**

En `app/index.html` (~272), cambiar el título y subtítulo del selector:

```html
              <div style="font-size:13px;font-weight:600;">¿Qué día vas a recibir el pedido?</div>
              <div style="font-size:11px;color:var(--text-muted);">Queda agendado en el calendario para esa fecha.</div>
```

- [ ] **Step 2: Mostrar siempre el selector, default mañana, y meter la fecha en el mensaje**

En `renderResumen` (~6647), reemplazar el bloque del selector (desde `var selBox = $('resumen-cal-selector');` hasta su `}` de cierre, ~6647-6670) por:

```javascript
  // Selector de fecha de RECEPCIÓN: siempre visible y obligatorio.
  var selBox = $('resumen-cal-selector');
  if (selBox) {
    selBox.style.display = '';
    var inp = $('resumen-fecha-cal');
    if (inp) {
      inp.min = _isoDate(new Date());
      if (!inp.value) {
        // Default: la preseleccionada (si vino del calendario) o mañana.
        var manana = new Date(); manana.setDate(manana.getDate() + 1);
        inp.value = ped.fechaRecepcionEsperada || _isoDate(manana);
        pedidoSet(Object.assign({}, pedidoGet(), { fechaRecepcionEsperada: inp.value }));
      }
      if (!inp._listenerAttached) {
        inp.addEventListener('change', function() {
          var p = pedidoGet();
          pedidoSet(Object.assign({}, p, { fechaRecepcionEsperada: inp.value || null }));
          renderResumen(); // re-render para actualizar el mensaje y el botón
        });
        inp._listenerAttached = true;
      }
    }
    actualizarBotonConfirmar();
    pintarIconosEstaticos(selBox);
  }
```

- [ ] **Step 3: Incluir la fecha de recepción en el mensaje de WhatsApp**

En `renderResumen`, dentro del `keys.forEach` que arma `provData` (~6675-6683), reemplazar la construcción de `mensaje`:

```javascript
    var _fr = pedidoGet().fechaRecepcionEsperada;
    var _frTxt = _fr ? _parseIsoDate(_fr).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
    var mensaje = 'Hola, buen día ' + prov.nombre + '! Te paso el pedido' + (_frTxt ? ' para el ' + _frTxt : '') + ':\n';
    prov.items.forEach(function(it) { mensaje += it.qty + ' ' + it.productoLista + '\n'; });
```

- [ ] **Step 4: Botón de confirmar deshabilitado sin fecha**

Reemplazar `actualizarBotonConfirmar` (~6750) por:

```javascript
function actualizarBotonConfirmar() {
  var btn = $('btn-confirmar-pedido');
  if (!btn) return;
  var inp = $('resumen-fecha-cal');
  var fecha = inp && inp.value;
  if (fecha) {
    var d = _parseIsoDate(fecha);
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.innerHTML = '<span class="icon-slot" data-icon="check"></span> Confirmar — recibo el ' + d.getDate() + ' ' + _nombreMesLargo(d).split(' ')[0].toLowerCase();
  } else {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.innerHTML = '<span class="icon-slot" data-icon="check"></span> Elegí la fecha de recepción';
  }
  pintarIconosEstaticos(btn);
}
```

- [ ] **Step 5: Verificar sintaxis y preview**

Chequeo de sintaxis (Task 1 Step 5) → `OK`. Preview: armar un pedido → "Ver mensajes WhatsApp" → el selector de fecha aparece siempre, con mañana por default; el mensaje muestra "Te paso el pedido para el {fecha}:"; cambiar la fecha actualiza el mensaje.

- [ ] **Step 6: Commit**

```bash
git add app/index.html
git commit -m "feat: fecha de recepción obligatoria en resumen + en mensaje WhatsApp"
```

---

## Task 5: `confirmarPedido` — flujo único (sin programar), calendario en fecha de recepción

**Files:**
- Modify: `app/index.html` (`confirmarPedido` ~6769-6964)

- [ ] **Step 1: Reescribir el encabezado de `confirmarPedido` (validación de fecha, sin rama programar)**

Reemplazar desde `function confirmarPedido() {` hasta justo antes de `var todos = todosLosItems();` (~6769-6800) por:

```javascript
function confirmarPedido() {
  var ped = pedidoGet();
  var ids = Object.keys(ped.items || {}).filter(function(k) { return ped.items[k].qty > 0; });
  if (!ids.length) { showToast('El pedido está vacío'); return; }
  var editando = ped.editandoHistId || null;
  var hoyIso = _isoDate(new Date());
  var fechaRecepcion = ped.fechaRecepcionEsperada || null;
  if (!fechaRecepcion) { showToast('Elegí el día en que vas a recibir el pedido', 'error'); return; }
  if (fechaRecepcion < hoyIso) { showToast('La fecha de recepción no puede ser pasada.', 'error'); return; }

  if (!confirm('¿Confirmar el pedido? Se guarda en el historial' + (calendarioPermitido() ? ' y en el calendario el día de recepción.' : '.'))) return;
```

- [ ] **Step 2: Borrar la RAMA A (programación) completa**

Eliminar todo el bloque `// === RAMA A: PROGRAMACIÓN ... ===` incluyendo su `if (esProgramacion) { ... return; }` (~6820-6854). El armado de `items` (~6805-6818) se mantiene tal cual está. Eliminar también el comentario `// === RAMA B: REALIZAR ... ===` o dejarlo como encabezado.

- [ ] **Step 3: Guardar `fechaRecepcionEsperada` en el pedido editado**

En la rama `if (editando)`, dentro de `pedidoEditado` (~6874), agregar el campo (después de `fechaRecepcion: prev.fechaRecepcion || null,`):

```javascript
        fechaRecepcionEsperada: fechaRecepcion,
```

- [ ] **Step 4: Guardar `fechaRecepcionEsperada` en el pedido nuevo**

En `pedidoNuevo` (~6899), agregar el campo (después de `recepcionado: false,`):

```javascript
    fechaRecepcionEsperada: fechaRecepcion,
```

- [ ] **Step 5: Reflejar en el calendario en la FECHA DE RECEPCIÓN (no hoy)**

Reemplazar el bloque `// === Reflejar en el calendario ... ===` (~6919-6942) por:

```javascript
  // === Reflejar en el calendario en la FECHA DE RECEPCIÓN ===
  // El pedido realizado es real (ejecutado), pero se ubica el día que llega.
  var veniaDeSerie = false;
  if (calendarioPermitido()) {
    var planExistente = ped.ejecutandoPlanCalId
      ? Object.keys(_calMap).map(function(k) { return _calMap[k]; }).find(function(p) { return p.id === ped.ejecutandoPlanCalId; })
      : _calMap[fechaRecepcion];
    if (planExistente && planExistente.serie_id) veniaDeSerie = true;
    var planRegistro = {
      id: (planExistente && planExistente.id) || _uuid(),
      fecha: fechaRecepcion,
      items: items,
      total: pedidoNuevo.total,
      serie_id: planExistente ? planExistente.serie_id : null,
      cada_n_semanas: planExistente ? planExistente.cada_n_semanas : null,
      serie_hasta: planExistente ? planExistente.serie_hasta : null,
      ejecutado: true,
      ejecutado_en: Date.now(),
      creado_por: (planExistente && planExistente.creado_por) || ((sesion && sesion.user && sesion.user.id) || null)
    };
    _calMap[planRegistro.fecha] = planRegistro;
    syncCalDiaRemoto(planRegistro).catch(function() {});
  }
```

- [ ] **Step 6: Anclar la repetición en la fecha de recepción**

Reemplazar el bloque final de repetición (~6953-6963) por:

```javascript
  if (calendarioPermitido() && !veniaDeSerie) {
    setTimeout(function() {
      var nRep = _promptRepeticion('Pedido realizado. ');
      if (nRep && nRep > 0) {
        var base = { items: items, total: pedidoNuevo.total };
        _generarSerieDesde(fechaRecepcion, nRep, base, null).then(function(gen) {
          showToast('Se programaron ' + gen + ' repeticiones a futuro', 'ok');
        });
      }
    }, 400);
  }
```

- [ ] **Step 7: Verificar sintaxis y preview**

Chequeo de sintaxis → `OK`. Preview: armar → resumen → elegir fecha futura → confirmar → el pedido aparece en el historial y en el calendario en la fecha elegida (no hoy). Confirmar sin fecha → toast de error.

- [ ] **Step 8: Commit**

```bash
git add app/index.html
git commit -m "feat: confirmarPedido flujo único, calendario en fecha de recepción"
```

---

## Task 6: Historial muestra fecha esperada (pendientes) y ambas fechas (recepcionados)

**Files:**
- Modify: `app/index.html` (`renderHistorialRecepcion` ~6714; `renderHistorialProveedores` ~6769 pre-cambios → buscar por nombre)

- [ ] **Step 1: Helper de formato corto de fecha ISO (inline, reutilizable)**

En `app/index.html`, justo antes de `function renderHistorialRecepcion`, agregar:

```javascript
// Formatea una fecha ISO YYYY-MM-DD como "mar 17 jun" (corto, es-AR). '' si vacía.
function _fechaCortaES(iso) {
  if (!iso) return '';
  var d = _parseIsoDate(String(iso).slice(0, 10));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
}
```

- [ ] **Step 2: Pendientes — mostrar "Para recibir el {fecha}"**

En `renderHistorialRecepcion`, reemplazar exactamente:

```javascript
    html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">' + h.items.length + ' productos · ' + Object.keys(porProv).length + ' proveedor' + (Object.keys(porProv).length !== 1 ? 'es' : '') + '</div></div>';
```

por:

```javascript
    var _recTxt = h.fechaRecepcionEsperada ? ' · <span style="color:#60a5fa;">📅 recibís el ' + _fechaCortaES(h.fechaRecepcionEsperada) + '</span>' : '';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">' + h.items.length + ' productos · ' + Object.keys(porProv).length + ' proveedor' + (Object.keys(porProv).length !== 1 ? 'es' : '') + _recTxt + '</div></div>';
```

- [ ] **Step 3: Recepcionados — mostrar esperada + real**

En `renderHistorialProveedores`, reemplazar exactamente:

```javascript
    html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">' + h.items.length + ' productos · ' + Object.keys(porProv).length + ' proveedor' + (Object.keys(porProv).length !== 1 ? 'es' : '') + faltantesTag + cambiosTag + pesosTag + '</div></div>';
```

por:

```javascript
    var _espTxt = h.fechaRecepcionEsperada ? ' · 📅 para el ' + _fechaCortaES(h.fechaRecepcionEsperada) : '';
    var _realTxt = h.fechaRecepcion ? ' · <span style="color:var(--emerald);">✓ recibido el ' + new Date(h.fechaRecepcion).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) + '</span>' : '';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">' + h.items.length + ' productos · ' + Object.keys(porProv).length + ' proveedor' + (Object.keys(porProv).length !== 1 ? 'es' : '') + _espTxt + _realTxt + faltantesTag + cambiosTag + pesosTag + '</div></div>';
```

- [ ] **Step 4: Verificar sintaxis y preview**

Chequeo de sintaxis → `OK`. Preview: un pedido pendiente muestra "recibís el X"; uno recepcionado muestra "para el X · recibido el Y".

- [ ] **Step 5: Commit**

```bash
git add app/index.html
git commit -m "feat: historial muestra fecha de recepción esperada y real"
```

---

## Task 7: Métricas por fecha de recepción (real + estimado del mes)

**Files:**
- Modify: `app/index.html` (`renderMetricas` KPIs ~1415-1453; `gastosPorPeriodo` ~1250-1259)

- [ ] **Step 1: KPIs del mes actual con real + estimado**

En `renderMetricas`, reemplazar el bloque de cálculo de KPIs (~1415-1425, desde `var gastoMes = 0, ...` hasta `var deltaSem = ...;`) por:

```javascript
  var _hoy = new Date();
  var _gm = gastoDelMes(hist, _hoy.getFullYear(), _hoy.getMonth());
  var gastoMes = _gm.real;             // ya recepcionado este mes
  var gastoMesEstimado = _gm.estimado; // real + pendientes del mes
  // Mes anterior (solo real) para el delta
  var _mesPrev = new Date(_hoy.getFullYear(), _hoy.getMonth() - 1, 1);
  var _gmPrev = gastoDelMes(hist, _mesPrev.getFullYear(), _mesPrev.getMonth());
  var deltaMes = _gmPrev.real > 0 ? ((gastoMes - _gmPrev.real) / _gmPrev.real) * 100 : null;
```

- [ ] **Step 2: Reemplazar las cards de KPI**

Reemplazar las 3 llamadas a `_kpiCard` (~1450-1452) por:

```javascript
  html += _kpiCard('Gastado este mes', fmt$full(gastoMes), deltaMes, _gm.nReal + ' recibido(s)', sparkMesAnim, { delay: 0, rawValue: gastoMes });
  html += _kpiCard('Estimado del mes', fmt$full(gastoMesEstimado), null, _gm.nPend + ' pendiente(s)', sparkSemAnim, { delay: 1, rawValue: gastoMesEstimado });
  html += _kpiCard('Total histórico', fmt$full(totalHist), null, hist.length + ' pedidos', '', { delay: 2, rawValue: totalHist });
```

Nota: el Step 1 ya eliminó `gastoSem`, `deltaSem`, `nPedidosMes`, `nPedidosSem` y el `hist.forEach` viejo (estaban en el bloque reemplazado). `totalHist`, `sparkMesAnim` y `sparkSemAnim` siguen definidos arriba y se reutilizan acá. Si el syntax check marca alguna variable huérfana, eliminá su declaración.

- [ ] **Step 3: Gráficos por fecha de recepción**

En `gastosPorPeriodo` (~1253), reemplazar el `hist.forEach` de agrupación por:

```javascript
  hist.forEach(function(h) {
    var iso = fechaAtribucionGastoISO(h);
    var ts = iso ? _parseIsoDate(iso).getTime() : (h.timestamp || Date.now());
    var k = modo === 'semana' ? _claveSemana(ts) : _claveMes(ts);
    if (!agrupado[k]) agrupado[k] = { clave: k, total: 0, count: 0 };
    agrupado[k].total += h.total || 0;
    agrupado[k].count += 1;
  });
```

- [ ] **Step 4: Verificar sintaxis y correr tests**

Chequeo de sintaxis → `OK`. Run: `node tests/run-pedidos.js` (las funciones puras subyacentes ya están cubiertas) → `TODOS OK`. Preview: con un pedido pendiente para este mes, "Estimado del mes" lo incluye y "Gastado este mes" no; al recepcionarlo, pasa a "Gastado".

- [ ] **Step 5: Commit**

```bash
git add app/index.html
git commit -m "feat: métricas atribuidas por fecha de recepción (real + estimado)"
```

---

## Task 8: Tocar un día del calendario inicia un pedido con esa fecha de recepción

**Files:**
- Modify: `app/index.html` (`crearPlanParaEsteDia` ~2081; `editarPlanDelDia` ~2106)

- [ ] **Step 1: `crearPlanParaEsteDia` → armar pedido con la fecha preseleccionada**

Reemplazar `crearPlanParaEsteDia` (~2081) por:

```javascript
// Inicia un pedido nuevo con este día del calendario como fecha de recepción.
function crearPlanParaEsteDia() {
  if (!_calDiaEditando) return;
  var iso = _calDiaEditando;
  var hoyIso = _isoDate(new Date());
  if (iso < hoyIso) {
    showToast('Ese día ya pasó. Elegí hoy o una fecha futura.', 'error');
    return;
  }
  cerrarModalDia();
  pedidoSet({ items: {}, fechaRecepcionEsperada: iso });
  cambiarTab('pedido');
  showToast('Armá el pedido. Lo vas a recibir el ' + _fechaCortaES(iso) + '.', 'info');
}
```

- [ ] **Step 2: `editarPlanDelDia` → precargar con la fecha como recepción**

Reemplazar `editarPlanDelDia` (~2106) por:

```javascript
function editarPlanDelDia() {
  if (!_calDiaEditando) return;
  var iso = _calDiaEditando;
  var plan = _calMap[iso];
  if (!plan || !plan.items || plan.items.length === 0) return;
  var nuevoItems = {};
  plan.items.forEach(function(it) {
    if (it.itemId) nuevoItems[it.itemId] = { qty: it.qty };
  });
  pedidoSet({
    items: nuevoItems,
    fechaRecepcionEsperada: iso,
    editandoPlanCalId: plan.id
  });
  actualizarBadgePedido();
  cerrarModalDia();
  cambiarTab('pedido');
  showToast('Editando. Modificá y confirmá para guardar.', 'info');
}
```

- [ ] **Step 3: Verificar sintaxis y preview**

Chequeo de sintaxis → `OK`. Preview: tocar un día futuro vacío en el calendario → botón "Crear plan"/"Armar pedido" → entra al buscador; al ir al resumen, la fecha de recepción ya está puesta en ese día.

- [ ] **Step 4: Commit**

```bash
git add app/index.html
git commit -m "feat: tocar un día del calendario arma un pedido con esa fecha de recepción"
```

---

## Cierre

- [ ] Correr `node tests/run-pedidos.js` y `node tests/run-golden.js` → ambos en verde.
- [ ] Chequeo de sintaxis final del Task 1 Step 5 → `OK`.
- [ ] Recordatorio: ejecutar `sql/MIGRACION_FECHA_RECEPCION.sql` en Supabase antes de usar en producción (sino la fecha esperada no sincroniza entre dispositivos; localmente funciona igual).
- [ ] **REQUIRED SUB-SKILL:** Usar superpowers:finishing-a-development-branch para cerrar.
