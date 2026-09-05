# Carga de listas en segundo plano — Spec

## 1. Objetivo

Hoy, cargar una lista de precios "atrapa" al usuario: el modal de carga es un overlay a pantalla completa, y cerrarlo mientras procesa cancela todo (`cargas.forEach(c => c.cancelado = true)`). El objetivo es que el usuario pueda cerrar/ocultar el modal sin perder el trabajo, seguir usando el resto de la app, y ver el estado de sus cargas desde un indicador flotante arriba a la derecha.

## 2. Alcance

**Adentro:** que ocultar el modal ya no cancele el procesamiento; un indicador flotante persistente (mientras dure la sesión/pestaña) con el estado agregado de las cargas activas; poder reabrir el modal en la ficha que corresponda desde ese indicador.

**Afuera:** sobrevivir a cerrar la pestaña o recordar la página — eso requeriría mover el procesamiento al servidor (cola de jobs), que es un cambio de arquitectura mucho más grande y no fue pedido. Si se cierra la pestaña o se recarga antes de que termine, el trabajo se pierde — igual que hoy.

## 3. Diseño

**Cerrar el modal ya no cancela.** `cerrarModalLista()` pasa a solo ocultar el modal (`classList.remove('open')`) si hay algo `procesando` — sin tocar `cargas`, sin marcar `cancelado`, sin borrar los contenedores del DOM donde ya escriben las barras de progreso (así el trabajo en curso sigue actualizando su estado sin que nadie lo esté mirando). Si NADA está procesando, se comporta igual que hoy (cierre real, limpia todo).

**Reabrir sin resetear.** Función nueva `reabrirModalCargas(fichaId)`: si hay `cargas` existentes, muestra el modal de nuevo en la ficha pedida (o la que ya estaba activa), sin tocar el array. `abrirModalLista()` (la que abre el modal para cargar algo nuevo) NO cambia — sigue reseteando `cargas` como hoy, para no mezclar "empezar de cero" con "volver a lo que ya estaba".

**El indicador flotante.** Un elemento fijo arriba a la derecha, oculto por default. Se muestra mientras haya al menos una ficha con estado `procesando`, `listo` (recién terminada, sin revisar) o `error`. Modo resumen: "N cargando… X%" (promedio de las que procesan) o "Lista lista"/"Error en una carga" si no hay ninguna procesando. Al hacer click se despliega un panel angosto con una fila por ficha (título del proveedor, % o ícono de estado); click en una fila llama a `reabrirModalCargas(fichaId)`.

**Se re-renderiza en los mismos puntos donde ya se actualiza el progreso hoy** (`setProgresoJob`, `crearBarraProgreso`, `removeBarraProgreso`) más los 4 lugares donde cambia `ficha.estado` a `'listo'`/`'error'`, más donde se agregan/sacan fichas de `cargas` (`nuevaCargaTab`, `cerrarCargaTab`, `_cerrarModalListaReal`) — así no hace falta un mecanismo de eventos nuevo, se reusa el flujo de actualización que ya existe.

**Cuándo desaparece.** Cuando ya no queda ninguna ficha en estado `procesando`/`listo-sin-revisar`/`error` — es decir, cuando el usuario revisó y guardó (o descartó) todo. Guardar una ficha (`finalizarCargaListo` ya la deja en `'listo'`; el flujo real de guardado en base lo saca de `cargas` en otro punto — confirmar el mecanismo real al implementar) la saca de la cuenta.

## 4. Costo de API

No cambia: la cantidad de llamadas a Claude depende del tamaño de la lista (tandas de líneas para extracción, tandas para detectar modo de precio), no de si la pantalla está bloqueada. La única diferencia real: hoy, cerrar el modal a mitad de camino corta las llamadas que faltan (`ficha.cancelado` se chequea entre pasos); con este cambio, una carga que hoy se abandonaría a mitad de camino va a terminar corriendo — el costo total puede subir un poco por eso, no porque el mismo trabajo cueste más.

## 5. Segunda parte del mismo trabajo

Este mismo patrón se porta después a `provelink-parte-2` (Parte 2), en sus dos flujos de carga (negocio y proveedor) — cada uno con su propia implementación pero el mismo comportamiento esperado. Se hace como una tarea aparte, después de tener esto probado en Parte 1.
