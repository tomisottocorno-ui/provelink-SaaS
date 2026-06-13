# Flujo único de pedido con fecha de recepción — Diseño

**Fecha:** 2026-06-13
**Estado:** Aprobado, listo para plan

## Objetivo

Unificar el armado de pedidos en un solo flujo: el usuario arma el pedido, el
sistema le pregunta **qué día lo va a recibir**, y el pedido se realiza (va al
historial) y aparece en el calendario en esa fecha de recepción. Se elimina la
elección "Realizar vs Programar"; se conserva la repetición de pedidos.

## Estado actual (lo que se reemplaza)

- **"Armar pedido"** muestra una pantalla con 2 tarjetas: *Realizar* (al
  historial + calendario en la fecha de hoy) y *Programar* (solo calendario,
  fecha futura, no va al historial). Funciones: `arrancarRealizarPedido`,
  `arrancarProgramarPedido`, `_renderBannerModoPedido`, `volverALandingPedido`,
  `_entrarTabPedido`.
- **`confirmarPedido`** se ramifica en RAMA A (programación → calendario) y
  RAMA B (realizar → historial + reflejo en calendario en `hoyIso`).
- El **calendario** tiene su propio botón "Programar pedido" y al tocar un día
  arranca una programación (`arrancarProgramarPedidoEnFecha`).
- **Mensaje WhatsApp** (en el resumen, ~línea 6679, y en el flujo del asistente,
  ~7200): `'Hola, buen día ' + prov.nombre + '! Te paso el pedido:\n'` + items.
- **Historial**: `renderHistorialRecepcion` (pendientes) y
  `renderHistorialProveedores` (recepcionados). Hoy no muestran fechas de
  recepción esperada/real más allá de badges de faltantes/cambios/pesos.
- **Métricas** (`renderMetricas`, `gastosPorPeriodo`): el gasto se atribuye por
  `h.timestamp` (fecha en que se hizo el pedido), en ventanas móviles
  ("últimos 30 días", "últimos 7 días"). Cuenta todos los pedidos por igual,
  estén recepcionados o no.

## Flujo nuevo

### 1. Armado (UI)

- Se **elimina la pantalla de 2 tarjetas** (`pedido-landing`). Entrar al tab
  "Armar pedido" va directo al buscador (`pedido-flujo`).
- Se eliminan: el banner de modo, el botón "Cambiar modo"
  (`volverALandingPedido`), `arrancarProgramarPedido` y la lógica de modos en
  `_entrarTabPedido` / `_renderBannerModoPedido`.
- El pedido ya no tiene campo `modo` ni `fechaCalendario` en su estado de
  armado; sí un `fechaRecepcionPreset` opcional (ver Calendario).

### 2. Pregunta de fecha de recepción

La pantalla de resumen ("Pedidos por proveedor", `tab-resumen`) es el paso previo
a confirmar y ya tiene un selector de fecha (`resumen-fecha-cal`) hoy oculto salvo
en modo programar. Se **reutiliza ese selector** en vez de un popup:

- El selector pasa a estar **siempre visible** en el resumen, con un `<input
  type="date">`:
  - Título: *"¿Qué día vas a recibir el pedido?"*
  - `min` = hoy (no se permite fecha pasada).
  - Default = **mañana** (o el `fechaRecepcionPreset` si vino del calendario).
  - **Obligatorio**: el botón "Confirmar" queda deshabilitado hasta elegir fecha.
- Ventaja: el mensaje de WhatsApp se previsualiza ahí mismo con la fecha ya
  incluida, antes de enviar.

### 3. Mensaje de WhatsApp

Cambia a incluir la fecha de recepción:

> `Hola, buen día {prov.nombre}! Te paso el pedido para el {martes 17 de junio}:`
> + items

Aplica en los dos lugares que arman el mensaje (resumen y asistente). La fecha
se formatea en español (día de semana + día + mes).

### 4. Historial

- **Pendientes de recepción** (`renderHistorialRecepcion`): cada pedido muestra
  `📅 Para recibir el {fechaRecepcionEsperada}`.
- **Ya recepcionados** (`renderHistorialProveedores`): muestra **ambas** fechas:
  `Pedido para el {fechaRecepcionEsperada} · Recibido el {fechaRecepcion}`.

### 5. Calendario

- Se **elimina** el botón "Programar pedido" del calendario.
- Al tocar un **día futuro vacío**: abre el armado de pedido con ese día
  pre-cargado como fecha de recepción (`fechaRecepcionPreset`), de modo que el
  calendario siga sirviendo para iniciar pedidos. Tocar un día con pedido →
  lo muestra (comportamiento de detalle existente).
- Al confirmar, el reflejo en el calendario se hace en la **fecha de recepción**
  (antes era `hoyIso`). El pedido realizado se marca como **ejecutado**
  (`ejecutado: true`) en esa fecha — es un pedido real ya hecho, solo que se
  recibe más adelante. Las **repeticiones** futuras (sección 6) van como planes
  **no ejecutados** (`ejecutado: false`) hasta que el usuario las realiza.

### 6. Repetir (se mantiene)

- Tras confirmar, se sigue ofreciendo *"¿repetir cada semana/mes?"*
  (`_promptRepeticion` / `_generarSerieDesde`).
- Cada repetición se agenda con su **fecha de recepción corrida**: recepción
  base + N semanas. Las repeticiones futuras son planes en el calendario (no
  realizados aún); cuando llega su día, el usuario las realiza.

## Modelo de datos

- El pedido (entrada del historial) gana el campo **`fechaRecepcionEsperada`**
  (string ISO `YYYY-MM-DD`), la fecha elegida en el modal.
- Ya existe `fechaRecepcion` (timestamp real, se setea al recepcionar) y
  `recepcionado` (bool).
- **Migración** `sql/MIGRACION_FECHA_RECEPCION.sql`:
  ```sql
  alter table public.historial_pedidos
    add column if not exists fecha_recepcion_esperada date;
  ```
- Sincronización: `_pedidoARow` agrega `fecha_recepcion_esperada`;
  `_rowAPedido` lo lee de vuelta a `fechaRecepcionEsperada`.

## Métricas (atribución por fecha de recepción)

Todo el gasto se atribuye al **mes de la fecha de recepción**:
- Si el pedido ya se recepcionó → su `fechaRecepcion` (real).
- Si está pendiente → su `fechaRecepcionEsperada` (estimada).

### KPIs del mes actual

- **Gastado este mes (real)**: suma de pedidos **recepcionados** cuya fecha de
  recepción real cae en el mes actual.
- **Estimado del mes**: el real **+** los pedidos **pendientes** cuya
  `fechaRecepcionEsperada` cae en el mes actual.

Un pedido nuevo para recibir el 20 suma al **estimado** de junio; al
recepcionarlo, pasa a contar como **real**.

### Gráficos

Los gráficos "gastos por semana / por mes" también cuentan por **fecha de
recepción** (real si recepcionado, esperada si pendiente), reemplazando la
atribución por fecha de pedido. Cada pedido cae en el bin del período de su
fecha de recepción.

### Compatibilidad hacia atrás

Pedidos viejos sin `fechaRecepcionEsperada`: la fecha de atribución cae a
`fechaRecepcion` (si recepcionado) o, en su defecto, al `timestamp` del pedido
(fecha en que se hizo). Así las métricas históricas no se rompen.

## Fuera de alcance

- No se toca la lógica de recepción en sí (faltantes, cambios, peso variable).
- No se agrega un estado visual "pendiente vs ejecutado" nuevo en el calendario
  más allá de ubicar el pedido en su fecha de recepción.
- No se migran datos viejos (se manejan con el fallback de compatibilidad).
