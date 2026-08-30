# Demo de la Parte 1 para captar negocios: prueba de 15 días + recorrido guiado

**Fecha:** 2026-08-30
**Estado:** Diseño aprobado — pendiente de plan de implementación

---

## 1. Objetivo

Arrancar la captación de **negocios** (no proveedores) mostrándoles la Parte 1 en persona. El vendedor visita, por ejemplo, una panadería, le muestra la app funcionando en el momento, y le deja una cuenta activa en el plan Max (el mejor) por **15 días**, para que la use de verdad y se termine de convencer sola.

Dos problemas a resolver:

1. **No hay ningún mecanismo de prueba temporal.** `profiles.plan_vence` y `profiles.plan_estado` existen en el schema pero no los lee ni los escribe nada del código — quedaron de una integración de pagos que nunca se terminó.
2. **No hay ninguna guía dentro de la app.** Un dueño de panadería sin experiencia con este tipo de herramientas entra y no sabe por dónde arrancar.

## 2. Alcance

**Entra:**
- Un despliegue nuevo, aislado de producción, clon de la Parte 1.
- Un link de registro especial que activa 15 días en el plan Max.
- Un estado de cuenta "vencido", propio, que no depende de que el plan Free siga existiendo.
- Un cartel visible mientras dura la prueba, con los días restantes.
- Un recorrido guiado paso a paso, la primera vez que se entra, reabrible después.

**No entra (decisiones ya tomadas en la charla previa):**
- Instagram: nada por ahora.
- Datos de ejemplo precargados: la cuenta arranca vacía a propósito.
- Publicar el link en ningún lado público: lo comparte el vendedor en persona, nada de landing ni redes.
- Integrar un cobro real (Mercado Pago): elegir un plan pago desde el estado "vencido" abre el modal de planes que ya existe hoy, informativo — cobrar de verdad sigue fuera de este alcance.
- Portar el recorrido guiado a la Parte 1 de producción: si se quiere más adelante, es una decisión aparte.

## 3. Infraestructura

| Pieza | Decisión | Por qué |
|---|---|---|
| Repo | Clon nuevo de `provelink-SaaS`, carpeta propia (`provelink-demo`) | Evoluciona sin arriesgar la producción real; mismo código base, mismas convenciones |
| Hosting | Railway (proyecto nuevo) | Ya hay acceso funcionando ahí (se usa para la Parte 2); no hay CLI de Vercel instalada ni token guardado en esta máquina — Railway es el camino sin fricción para desplegar sin pedirle un paso extra al usuario |
| Base de datos | Proyecto Supabase nuevo, aislado | El que había quedado libre de un intento anterior está pausado (Supabase pausa proyectos free inactivos) y hay que reactivarlo a mano desde el dashboard; más simple arrancar limpio con nombre propio |
| Confirmación de mail | Desactivada en este proyecto | El registro tiene que ser instantáneo durante la visita — no se puede depender de que el dueño de la panadería revise su correo en el momento |

La creación real de ambos (Supabase + Railway) necesita que el usuario abra el dashboard correspondiente en algún momento de la implementación — se avisa en ese punto, no es parte del diseño en sí.

## 4. El link de prueba y qué pasa al registrarse

URL del estilo `/login?prueba=1` en el login de este despliegue (no en el de producción). Al completar el registro por ese camino, en vez del `plan: 'free'` por defecto:

```
plan         = 'business'                      -- el plan Max, de una
plan_estado  = 'prueba'                        -- nuevo valor, ver §5
plan_vence   = now() + interval '15 days'
```

**Por qué `plan` queda en `'business'` desde el minuto uno y no algo tipo `'trial'` aparte:** todo el código que ya limita funciones por plan (`LIMITES[profile.plan]`, el asistente IA, el dashboard de métricas) sigue funcionando sin tocarlo — la cuenta de prueba automáticamente tiene acceso a todo lo del plan Max, porque *es* el plan Max, con fecha de vencimiento. El estado nuevo (`plan_estado`) es lo que hace el seguimiento de que es una prueba y no una suscripción paga.

## 5. Estados de `plan_estado`

`plan_estado` amplía sus valores posibles:

```
'activo' | 'pendiente_pago' | 'cancelado'   -- ya existían, sin cambios
'prueba'                                     -- nuevo: prueba de 15 días en curso
'vencido'                                    -- nuevo: la prueba terminó
```

### Mientras `plan_estado = 'prueba'`

- Cartel fijo (no modal, no molesta) en algún lugar visible siempre, tipo header: **"Prueba gratis · Te quedan N días"**. `N` sale de `plan_vence - hoy`, redondeado hacia arriba.
- El resto de la app funciona exactamente como el plan Max normal.

### La transición a `'vencido'`

Sin cron: se resuelve solo, la primera vez que se abre la app después de la fecha.

- Al cargar el perfil (mismo punto donde hoy se lee `profile.plan`), si `plan_estado === 'prueba'` y `plan_vence < ahora`, el cliente dispara **un único** `update` que pone `plan_estado = 'vencido'`. Idempotente: si dos pestañas abren a la vez, las dos mandan el mismo update, no pasa nada raro.
- A partir de ahí el estado queda en la base, no es una ilusión del cliente: entrar desde otro dispositivo ve lo mismo.

### Mientras `plan_estado = 'vencido'`

- **Se puede seguir viendo todo lo que ya cargó**: proveedores, listas, historial de pedidos, calendario. Nada se oculta ni se borra.
- **No se puede seguir operando**: cargar una lista nueva, agregar un proveedor, o armar un pedido quedan bloqueados.
- Aparece un cartel fijo (reemplaza al de "te quedan N días"): **"Tu prueba terminó — elegí un plan para seguir"**, con un botón que abre el modal de planes que ya existe (`abrirPlanes()`), sin tocar nada de ese flujo.
- Este estado **no depende de que exista el plan Free**: es un estado propio, no un downgrade a `plan: 'free'`. Si el día de mañana el plan Free se saca del todo, este mecanismo sigue funcionando igual.

### Defensa en la base, no solo en el cliente

El bloqueo de "no puede seguir operando" se hace en dos capas:

1. **Cliente**: los botones de agregar proveedor / cargar lista / armar pedido se deshabilitan y explican por qué, apenas `plan_estado === 'vencido'`.
2. **Base de datos**: un trigger rechaza la escritura si el dueño tiene `plan_estado = 'vencido'`, en:
   - `proveedores`, solo en `insert` (agregar un proveedor nuevo).
   - `listas_precios`, en `insert` **y en `update`**. `listas_precios` tiene `unique(proveedor_id)` — una sola fila por proveedor — así que recargar la lista de un proveedor que ya tiene una (el caso más común, "subí la lista actualizada del mes") es un `update`, no un `insert`. Un trigger que solo mirara `insert` dejaría pasar justo la acción que más importa bloquear.

   No se replica en cada tabla de la app — solo en estas dos, que son donde se crea valor nuevo — para no sobre-construir un candado en un entorno de bajo riesgo (link privado, sin datos reales de terceros en juego).

## 6. Recorrido guiado

Un overlay hecho a mano (sin librería externa — mismo criterio que el resto de la app: vanilla JS, sin build step), que aparece **la primera vez que se entra** a cualquier cuenta nueva de este despliegue.

- Nueva columna `profiles.recorrido_visto boolean default false`.
- Al montar la app, si `!profile.recorrido_visto`, se dispara el recorrido; al terminarlo o saltarlo, se marca `true` y no se repite solo.
- Reabrible en cualquier momento desde un ícono/opción fija en el menú ("Ver recorrido"), para quien lo cerró rápido y quiere volver a mirarlo.
- Pasos, cada uno señalando la sección real con una explicación corta (no un texto largo — una o dos oraciones):
  1. Comparador de precios — para qué sirve, qué resuelve.
  2. Cargar una lista — los tres caminos (a mano, plantilla, con IA).
  3. Mis proveedores — cómo se arma la ficha.
  4. Armar pedido / calendario — cómo se programa una compra.
  5. Métricas — qué mide el dashboard (plan Max).
  6. Asistente IA — qué le puede preguntar.
- Controles: Siguiente / Atrás / Saltar. Saltar en cualquier paso marca `recorrido_visto = true` igual — no se le puede insistir a alguien que ya dijo que no quiere verlo ahora.

## 7. Cambios por archivo

| Pieza | Cambio |
|---|---|
| **`sql/MIGRACION_DEMO_TRIAL.sql`** (nuevo) | Amplía el check de `plan_estado` con `'prueba'`/`'vencido'`; agrega `recorrido_visto`; función/trigger de bloqueo en `proveedores` y `listas_precios`. Idempotente. |
| `app/login.html` | Lee `?prueba=1` de la URL; si está, el registro setea `plan`/`plan_estado`/`plan_vence` como en §4 en vez de los defaults. |
| `app/index.html` | Chequeo de vencimiento al cargar perfil (transición a `'vencido'`); cartel de días restantes / cartel de vencido; deshabilita las acciones de escritura cuando corresponde; dispara el recorrido guiado en cuentas nuevas; entrada de menú para reabrirlo. |
| **`app/tour.js`** (nuevo) | El motor del recorrido guiado: los pasos, el overlay, los controles. Se extrae a archivo propio en vez de sumarlo a `index.html`, que ya es grande — mismo criterio que se usó para sacar `pipeline.js`. |
| `sql/schema.sql` | Refleja los mismos cambios para instalaciones nuevas del repo clonado. |
| `api/empleados.js` | Ya existe un guard (línea ~111) que bloquea crear empleados si `plan_estado !== 'activo' && plan_estado !== null`. Con los valores nuevos, una cuenta en `'prueba'` caería ahí adentro por error — justo lo contrario de lo que tiene que pasar (en prueba tiene acceso completo al plan Max). Se agrega `'prueba'` a la lista de estados permitidos. `'vencido'` queda bloqueado por este mismo guard sin tocar nada más: correcto y gratis. |

## 8. Testing

Seguí el patrón existente (`tests/run-*.js` sobre el harness jsdom):

- **Unit**: cálculo de días restantes; la función que decide si corresponde pasar a `'vencido'`; la secuencia de pasos del tour (siguiente/atrás/saltar no se rompen en los bordes).
- **Integración vía harness**: registrarse con `?prueba=1` deja el perfil con los tres campos de §4 seteados bien; una cuenta con `plan_vence` pasado transiciona a `'vencido'` al cargar y no antes de tiempo; en estado `'vencido'` los botones de escritura están deshabilitados y los datos existentes se siguen viendo; el tour aparece una sola vez y el menú lo puede reabrir.

## 9. Fuera de alcance

- Instagram (biografía, contenido, mensajes de contacto): explícitamente para después.
- Datos de ejemplo precargados en la cuenta nueva: decisión explícita de arrancar vacía.
- Publicar o promocionar el link de prueba en ningún canal público.
- Cobro real / integración de Mercado Pago para completar un upgrade desde el estado vencido.
- Portar el recorrido guiado o el mecanismo de prueba a la Parte 1 de producción.
- Rate-limiting o verificación de identidad en el registro: el link es privado y de bajo riesgo (charlado y decidido así en la sesión de diseño).

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El proyecto Supabase del demo también se pausa por inactividad entre tandas de visitas | Es un costo conocido del plan free de Supabase; si pasa, se reactiva desde el dashboard en un par de minutos. No se diseña nada especial para evitarlo — no vale la pena la complejidad para un entorno de demo. |
| Alguien con conocimientos técnicos bypassea el bloqueo del lado del cliente en estado "vencido" | El trigger en base de datos (§5) es el respaldo real; el cliente es la experiencia amigable para el caso normal. |
| El link `?prueba=1` no es un secreto fuerte | Aceptado a propósito: vive en un despliegue aislado que no está anunciado en ningún lado; la privacidad real la da que nadie conoce la URL del demo, no el parámetro en sí. |
| `plan_estado` gana valores nuevos y algo en el código asumía el set viejo | Auditado buscando en todo el código (`app/*.html`, `api/*.js`, `sql/*.sql`): el único lugar que lo lee es el guard de crear empleados en `api/empleados.js` (línea ~111). Sin este chequeo, una cuenta en `'prueba'` habría quedado bloqueada para agregar empleados por accidente — encontrado durante el diseño, no durante la implementación. El arreglo puntual está en §7. |
