# Carga de listas de precios en paralelo (pestañas)

**Fecha:** 2026-05-28
**Estado:** Diseño aprobado — pendiente de plan de implementación

---

## 1. Objetivo

Permitir que el usuario cargue **varias listas de precios al mismo tiempo** sin tener que esperar a que termine una para empezar la siguiente. Hoy el modal "Cargar lista de precios" procesa un archivo por vez: mientras la IA normaliza 1500 productos (puede tardar minutos), el usuario queda bloqueado esperando.

La meta es que pueda **disparar una carga, abrir otra pestaña, disparar la segunda, y dejarlas procesando juntas**, revisando y guardando cada una cuando esté lista.

---

## 2. Requisitos (confirmados con el usuario)

| # | Requisito | Decisión |
|---|-----------|----------|
| 1 | Modelo de UI | **Pestañas** dentro del modal. Se ve una lista a la vez; las demás procesan en segundo plano. |
| 2 | Cantidad | **Ilimitadas**, con un botón **"+"** que agrega pestañas. |
| 3 | Persistencia | El **modal queda abierto** mientras procesan. Cerrar el modal **cancela** las cargas en curso (con confirmación). No hay jobs a nivel app. |
| 4 | Un proveedor por pestaña | No se puede abrir dos pestañas para el mismo proveedor (es 1 lista por proveedor). |
| 5 | Plan Free | Sigue limitado a 1 lista. La función de paralelo es efectivamente para Pro/Business. |

---

## 3. Contexto técnico actual

- **Un modal único** `#modal-lista` con un selector `#lista-prov-select` y un área de preview `#preview-tabla`.
- **Un array global `filasPreview`** que representa los productos de la lista que se está cargando/editando. Lo consumen: `renderPreview`, `editarFilaPreview`, `setModoPreview`, `flipModoPreview`, `borrarFilaPreview`, `guardarLista`, y las funciones de procesamiento (`procesarImagen`, `procesarPDF`, `procesarExcel`, `ejecutarPipelineNormalizacion`) que **escriben** en él.
- **Las barras de progreso ya soportan múltiples jobs concurrentes** (`crearBarraProgreso(jobId)` apila divs en `#lista-loading-container`). Ese motor no hay que rehacerlo.
- **Semáforo de IA** `_CLAUDE_MAX_CONCURRENT = 2`: como máximo 2 llamadas a `/api/claude` en vuelo a la vez (límite de rate de Anthropic).

**El conflicto central:** el `filasPreview` global hace que dos cargas simultáneas se pisen entre sí. Hay que pasar de "un estado global" a **"un estado por pestaña"**.

---

## 4. Diseño

### 4.1 Modelo de estado: "fichas" de carga

Se reemplaza el `filasPreview` global por un array de **fichas** (`cargas`) y un puntero a la activa (`cargaActivaId`):

```js
// Cada ficha de carga
{
  id: <string único>,
  proveedorId: '',           // proveedor elegido en esta pestaña
  esEdicion: false,          // true si entró por "editar lista existente"
  titulo: 'Lista 1',         // etiqueta de la pestaña (cambia al nombre del proveedor)
  estado: 'idle',            // 'idle' | 'procesando' | 'listo' | 'error'
  jobId: null,               // id de la barra de progreso asociada
  filasPreview: [],          // productos de ESTA lista (lo que antes era global)
  cancelado: false,          // bandera para descartar resultados si se cierra/cancela
  error: null,               // mensaje si estado === 'error'
}
```

`filasPreview` deja de ser global y pasa a vivir dentro de la ficha activa. Las funciones que hoy lo usan se refactorizan para operar sobre **una ficha concreta** (recibida por parámetro / id), no sobre el global.

### 4.2 UI

- **Barra de pestañas** arriba del contenido del modal. Cada pestaña muestra:
  - Etiqueta (nombre del proveedor o "Nueva lista").
  - Indicador de estado: ⏳ (procesando) · ✓ (listo) · ⚠️ (error).
  - Botón **"×"** para descartar esa pestaña.
- Botón **"+"** al final de la barra → agrega una ficha nueva en estado `idle` y la activa.
- El **cuerpo del modal** (selector de proveedor + zona de subida + preview) muestra **la ficha activa**. Cambiar de pestaña re-renderiza el cuerpo con los datos de esa ficha.
- El botón **Guardar** guarda la ficha activa.

### 4.3 Flujo de datos

1. El usuario abre el modal → se crea la ficha 1 (`idle`), activa.
2. Elige proveedor + sube archivo → la ficha pasa a `procesando`; se le asigna un `jobId` y arranca el pipeline (`procesarArchivo` → procesar* → pipeline etapas 2-5), **escribiendo en `ficha.filasPreview`**.
3. El usuario toca "+" → ficha 2 (`idle`), activa. La ficha 1 **sigue procesando atrás**.
4. Cuando un pipeline termina: setea `ficha.estado = 'listo'`, `ficha.filasPreview = resultado`. Si la ficha es la activa, re-renderiza el preview; si no, solo actualiza el indicador de la pestaña + toast "Lista de {proveedor} lista para revisar".
5. El usuario revisa/edita (las ediciones operan sobre la ficha activa) y toca **Guardar** → upsert en `listas_precios` para `ficha.proveedorId` (lógica actual de `guardarLista`). Al terminar, **se cierra esa pestaña** y se activa otra (o se cierra el modal si era la última).

### 4.4 Refactor de funciones (alcance)

- `renderPreview()` → renderiza siempre **la ficha activa** (lee `cargaActivaId`). Se mantiene una sola área `#preview-tabla` reutilizada.
- `editarFilaPreview / setModoPreview / flipModoPreview / borrarFilaPreview` → operan sobre la ficha activa.
- `procesarArchivo / procesarImagen / procesarPDF / procesarExcel / ejecutarPipelineNormalizacion` → reciben la ficha (o su id) y escriben en `ficha.filasPreview`. Antes de escribir resultados, chequean `ficha.cancelado` para no pisar nada si se canceló.
- `guardarLista()` → guarda la ficha activa; al éxito cierra esa pestaña.
- `abrirModalLista(proveedorId)` → crea la primera ficha (modo carga o edición) y abre el modal.
- `cerrarModalLista()` → si hay fichas en `procesando`, confirma; si confirma, marca todas `cancelado = true` y limpia estado.
- **Nuevas:** `nuevaCargaTab()`, `activarCargaTab(id)`, `cerrarCargaTab(id)`, `renderTabsCargas()`.

### 4.5 Reglas y casos borde

- **Un proveedor por pestaña:** en el selector de cada ficha, los proveedores ya tomados por **otra pestaña abierta** aparecen **deshabilitados** (greyed out). Si por algún camino se intenta igual, se bloquea con un toast de aviso.
- **Plan Free:** se mantiene el guard actual (máx 1 lista). El "+" no agrega valor en Free, pero el límite de guardado sigue vigente.
- **Cerrar/cancelar:** cancelar no aborta los `fetch` en vuelo (no hay AbortController hoy), pero `ficha.cancelado` hace que los resultados se **descarten** al volver. Las barras de progreso se limpian.
- **Error en una carga:** la ficha queda en `error` con su mensaje; el usuario puede reintentar (re-subir archivo en esa pestaña) o descartarla.
- **Guardar deja pestañas pendientes:** tras guardar, si quedan otras fichas, se activa la primera pendiente; el modal no se cierra.

---

## 5. Concurrencia (limitación honesta, no es un bug)

El semáforo `_CLAUDE_MAX_CONCURRENT = 2` se mantiene. Dos listas grandes comparten esos 2 cupos de IA, así que **procesar 2 en paralelo no es 2× más rápido** — terminan en un tiempo total parecido al de hacerlas en secuencia. El valor de la feature es de **UX/comodidad**: disparar varias y no quedarse esperando, no velocidad bruta. No se sube el semáforo para no arriesgar rate limits de Anthropic.

---

## 6. Fuera de alcance (YAGNI)

- Jobs que sobrevivan al cierre del modal o a navegar por la app.
- Persistencia de cargas a medio hacer entre recargas de página.
- Cancelación real de requests en vuelo (AbortController).
- Subir el límite de concurrencia de IA.
- Guardado masivo "guardar todas de una" (cada pestaña se guarda individualmente).

---

## 7. Criterios de aceptación

1. Con el modal abierto, puedo subir una lista, tocar "+", elegir otro proveedor y subir otra, y **ambas procesan** sin pisarse.
2. Cada pestaña muestra su estado correcto (⏳/✓/⚠️) y su propio preview.
3. Al terminar una carga en segundo plano, su pestaña se marca ✓ y aparece un toast.
4. Puedo editar y **Guardar cada lista por separado**; al guardar, la pestaña se cierra.
5. No puedo abrir dos pestañas para el mismo proveedor.
6. Si cierro el modal con cargas en curso, se me pide confirmación y se cancelan.
7. El plan Free sigue topado en 1 lista.
