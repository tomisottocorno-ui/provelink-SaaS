# Demo de la Parte 1 para captar negocios: prueba de 15 días + recorrido guiado — Plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDA: usar `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`) para el seguimiento.

**Objetivo:** Un clon de la Parte 1, desplegado aparte, donde un negocio nuevo se registra con un link especial y arranca 15 días en el plan Max; al vencer, su cuenta pasa a un estado propio ("vencido") que bloquea seguir cargando pero no le esconde nada de lo que ya cargó; y un recorrido guiado le muestra las secciones la primera vez que entra.

**Arquitectura:** Mismo código base de `provelink-SaaS`, mismas convenciones (vanilla JS, sin build step). Todo lo nuevo vive en `plan_estado` (dos valores nuevos: `'prueba'` y `'vencido'`) y en una columna `recorrido_visto`; el bloqueo real está en dos triggers de Postgres, el cliente es la experiencia amigable encima. El recorrido guiado es un motor chico y genérico (`app/tour.js`) más el contenido específico (los 6 pasos) en `index.html`.

**Stack:** Node ≥22 (fix conocido de Railway/WebSocket, ver Tarea 1), Supabase (Postgres + Auth), Railway (hosting), jsdom para los tests de integración.

**Spec:** `docs/superpowers/specs/2026-08-30-demo-prueba-negocios-design.md`

---

## Mapa de archivos

| Archivo | Repo | Qué cambia |
|---|---|---|
| `server.js` | nuevo (`provelink-demo`) | Rutea `/api/` (hoy solo sirve estáticos); puerto por env var; bind a `0.0.0.0` |
| `package.json` | nuevo | `engines.node >=22`, dependencia `ws` |
| `api/claude.js` | nuevo | `opcionesSupabase()` para que `createClient` no rompa en Node <22 |
| `api/empleados.js` | nuevo | Mismo fix que `claude.js`, + permitir `plan_estado='prueba'` en el guard existente |
| `sql/MIGRACION_DEMO_TRIAL.sql` | nuevo | Columna `recorrido_visto`; función + triggers de bloqueo |
| `app/login.html` | nuevo | Lee `?prueba=1`; registro setea plan/plan_estado/plan_vence |
| `app/tour.js` | nuevo (archivo nuevo) | Motor genérico del recorrido guiado |
| `app/index.html` | nuevo | Chequeo de vencimiento, cartel, 3 bloqueos de escritura, dispara/reabre el tour |
| `app/styles.css` | nuevo | CSS del overlay del tour |
| `tests/harness.js` | nuevo | Seed por defecto: `recorrido_visto: true` (para no romper los tests existentes) |
| `tests/run-flujos.js` | nuevo | Tests de integración de todo lo de arriba |
| `tests/run-tour.js` | nuevo | Tests unitarios del motor `tour.js`, sin pasar por el harness completo |

---

> **Nota de directorio:** todos los comandos de este plan, de la Tarea 1 en
> adelante, asumen que el directorio de trabajo es `C:\ProveLink\provelink-demo`
> (el clon, no `provelink-SaaS`). Si se ejecuta cada tarea en una sesión/agente
> nuevo sin memoria del `cd` anterior, hay que volver a pararse ahí primero:
> `cd C:\ProveLink\provelink-demo`.

## Tarea 1: Clonar el repo y aplicar los arreglos de infraestructura ya conocidos

**Por qué antes que nada:** esta sesión ya encontró y arregló EXACTAMENTE este mismo problema en la Parte 2 — Railway corre en un Node sin WebSocket nativo, lo que hace explotar `createClient` de supabase-js, y el `server.js` viejo no rutea `/api/`. Aplicarlo ahora evita perder tiempo re-descubriéndolo.

**Archivos:**
- Crear: `C:\ProveLink\provelink-demo\` (clon completo, con historia de git)
- Modificar: `server.js`, `package.json`, `api/claude.js`, `api/empleados.js`

- [ ] **Paso 1: Clonar el repo con historia completa**

```bash
cd C:\ProveLink
git clone provelink-SaaS provelink-demo
cd provelink-demo
git log --oneline -3
git remote -v
```

Esperado: el mismo historial que `provelink-SaaS` (incluido el commit del spec de esta misma feature), y `origin` apuntando a la carpeta LOCAL `C:/ProveLink/provelink-SaaS` (así funciona `git clone` de una ruta local — no es el `origin` de GitHub de `provelink-SaaS`, que es otra cosa).

- [ ] **Paso 1b: Sacar ese `origin` — no sirve para nada una vez clonado**

Si se lo deja, la Tarea 8 (crear el repo real en GitHub) va a fallar porque el nombre `origin` ya está ocupado.

```bash
git remote remove origin
git remote -v
```

Esperado: sin salida (ningún remoto configurado todavía — se agrega el de GitHub recién en la Tarea 8).

- [ ] **Paso 2: Reescribir `server.js` con el ruteo de `/api/` y el bind correcto**

Reemplazar el archivo entero:

```js
const http = require('http');
const fs = require('fs');
const path = require('path');

// Al desplegarlo, el servidor de hosting asigna el puerto por variable de entorno.
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.json': 'application/json',
};

const ROUTES = {
  '/':           '/app/login.html',
  '/login':      '/app/login.html',
  '/login.html': '/app/login.html',
  '/app':        '/app/index.html',
  '/app/':       '/app/index.html',
};

// ── Funciones de /api ───────────────────────────────────────────────────────
// Los archivos de `api/` están escritos al estilo Vercel: exportan `(req, res)`
// y usan `res.status(n).json(obj)` y `req.body` ya parseado. Vercel arma eso
// solo; acá no hay nada que lo arme, así que este servidor servía `/api/claude`
// como si fuera un archivo y devolvía 404. Esto conecta las dos cosas.
const LIMITE_BODY = 12 * 1024 * 1024;

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let crudo = '';
    let corto = false;
    req.on('data', (c) => {
      if (corto) return;
      crudo += c;
      if (crudo.length > LIMITE_BODY) { corto = true; reject(new Error('body demasiado grande')); }
    });
    req.on('end', () => {
      if (corto) return;
      if (!crudo) return resolve({});
      try { resolve(JSON.parse(crudo)); }
      catch (e) { reject(new Error('body no es JSON válido')); }
    });
    req.on('error', reject);
  });
}

function adaptarRes(res) {
  res.status = (codigo) => { res.statusCode = codigo; return res; };
  res.json = (obj) => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  return res;
}

async function manejarApi(req, res, nombre) {
  let handler;
  try {
    handler = require('./api/' + nombre + '.js');
  } catch (e) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'No existe la función /api/' + nombre }));
    return;
  }

  adaptarRes(res);
  try {
    req.body = req.method === 'POST' ? await leerBody(req) : {};
    await handler(req, res);
  } catch (e) {
    console.error('[api/' + nombre + ']', e);
    if (!res.headersSent) res.status(500).json({ error: e.message || 'Error del servidor' });
    else res.end();
  }
}

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];

  const api = urlPath.match(/^\/api\/([a-zA-Z0-9_-]+)$/);
  if (api) { manejarApi(req, res, api[1]); return; }

  const mapped = ROUTES[urlPath];
  if (mapped) urlPath = mapped;

  const filePath = path.join(ROOT, urlPath);
  const ext = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found: ' + urlPath);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

// 0.0.0.0 para que el hosting pueda alcanzarlo desde afuera del contenedor.
server.listen(PORT, '0.0.0.0', () => {
  console.log('ProveLink demo corriendo en el puerto ' + PORT);
});
```

- [ ] **Paso 3: `package.json` — Node ≥22 y la dependencia `ws`**

Reemplazar el archivo entero:

```json
{
  "name": "provelink-demo",
  "version": "0.1.0",
  "private": true,
  "description": "ProveLink — demo de la Parte 1 para captar negocios (prueba 15 días)",
  "scripts": {
    "start": "node server.js",
    "test": "node tests/run-golden.js && node tests/run-pedidos.js && node tests/run-flujos.js && node tests/run-tour.js",
    "test:golden": "node tests/run-golden.js",
    "test:pedidos": "node tests/run-pedidos.js",
    "test:flujos": "node tests/run-flujos.js",
    "test:tour": "node tests/run-tour.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "ws": "^8.21.3"
  },
  "devDependencies": {
    "jsdom": "^30.0.1"
  },
  "engines": {
    "node": ">=22"
  }
}
```

- [ ] **Paso 4: `api/claude.js` — el fix de WebSocket**

En `api/claude.js`, ubicar la línea:

```js
const { createClient } = require('@supabase/supabase-js');
```

Agregar inmediatamente debajo:

```js

// Supabase construye su cliente de realtime aunque nunca lo usemos, y en Node
// anterior al 22 no hay WebSocket nativo: sin esto `createClient` lanza
// "Node.js 18 detected without native WebSocket support" antes de hacer nada.
// Se le pasa `ws` SOLO si el runtime no lo trae, así anda en cualquier versión
// sin depender de qué Node elija el hosting.
function opcionesSupabase() {
  if (typeof WebSocket !== 'undefined') return undefined;
  try {
    return { realtime: { transport: require('ws') } };
  } catch (e) {
    return undefined;   // sin ws instalado: que falle donde fallaba antes
  }
}
```

Y en la línea (buscar `createClient(SUPABASE_URL, SERVICE_KEY)`):

```js
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
```

Cambiar a:

```js
const sb = createClient(SUPABASE_URL, SERVICE_KEY, opcionesSupabase());
```

- [ ] **Paso 5: `api/empleados.js` — el mismo fix**

Mismo patrón: agregar `opcionesSupabase()` (idéntica función) debajo del `require('@supabase/supabase-js')`, y cambiar la línea:

```js
const sb = createClient(SUPABASE_URL, SERVICE_KEY);
```

a:

```js
const sb = createClient(SUPABASE_URL, SERVICE_KEY, opcionesSupabase());
```

- [ ] **Paso 6: Instalar dependencias y correr la suite existente**

```bash
cd C:\ProveLink\provelink-demo
npm install
npm test
```

Esperado: termina en `TODO OK` con el mismo número de verificaciones que tenía `provelink-SaaS` antes del clon (nada de esto tocó lógica de producto, solo infraestructura).

- [ ] **Paso 7: Commit**

```bash
git add server.js package.json api/claude.js api/empleados.js package-lock.json
git commit -m "infra: preparar el clon para correr en Railway (Node 22, ruteo de /api/)"
```

---

## Tarea 2: El harness de tests no dispara el tour por accidente

**Por qué:** el motor del tour (Tarea 5) se dispara cuando `!profile.recorrido_visto`. El seed por defecto de `montarApp()` no trae ese campo → sería `undefined` → **todos los tests existentes** de golpe verían aparecer el overlay del tour, sin haberlo pedido. Se arregla el default del harness ANTES de escribir el resto, así ningún test futuro tiene que acordarse de taparlo.

**Archivos:**
- Modificar: `tests/harness.js:100` (la línea del seed por defecto de `profiles`)

- [ ] **Paso 1: Ubicar la línea exacta**

En `tests/harness.js`, dentro de `montarApp()`:

```js
    profiles: [Object.assign({ id: 'user-1', plan: 'business', consultas_ia_mes: 0, listas_procesadas_mes: 0 }, seed.profile || {})],
```

- [ ] **Paso 2: Agregar el default**

```js
    profiles: [Object.assign({ id: 'user-1', plan: 'business', consultas_ia_mes: 0, listas_procesadas_mes: 0, recorrido_visto: true }, seed.profile || {})],
```

`Object.assign` con `seed.profile` después significa que cualquier test que quiera probar el tour puede seguir pisando el default con `seed.profile = { recorrido_visto: false }`.

- [ ] **Paso 3: Correr la suite y confirmar que sigue igual**

```bash
npm test
```

Esperado: mismo resultado que en la Tarea 1 (este cambio no debería mover ningún número, solo evita un efecto secundario futuro).

- [ ] **Paso 4: Commit**

```bash
git add tests/harness.js
git commit -m "test: el harness no dispara el tour por default en cuentas de prueba existentes"
```

---

## Tarea 3: Migración SQL

**Archivos:**
- Crear: `sql/MIGRACION_DEMO_TRIAL.sql`
- Modificar: `sql/schema.sql` (mismo contenido, para que una instalación nueva del repo ya lo traiga)

- [ ] **Paso 1: Escribir la migración**

```sql
-- ============================================================================
-- MIGRACIÓN: prueba de 15 días + bloqueo al vencer + recorrido guiado
-- ============================================================================
-- Ver docs/superpowers/specs/2026-08-30-demo-prueba-negocios-design.md
--
-- `plan_estado` ya existe en `profiles` y NO tiene check constraint (es un
-- `text` con un comentario documentando los valores esperados) — así que
-- sumarle 'prueba' y 'vencido' no necesita ningún ALTER sobre esa columna,
-- solo hay que empezar a escribirlos y a leerlos.
--
-- Idempotente.
-- ============================================================================

-- 1) Si ya vio el recorrido guiado, para no repetírselo solo.
alter table public.profiles add column if not exists recorrido_visto boolean not null default false;


-- 2) Bloqueo de escritura para cuentas con la prueba vencida.
--
-- SECURITY DEFINER porque el trigger tiene que poder leer `plan_estado` del
-- DUEÑO de la fila (profiles.id = new.user_id), y ese dueño puede ser distinto
-- de quien está autenticado ahora mismo (un empleado inserta con el user_id
-- del owner). La RLS de `profiles` ("los usuarios ven su propio profile") le
-- taparía la lectura a la sesión del empleado si no fuera security definer.
create or replace function public.bloquear_si_prueba_vencida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  select plan_estado into v_estado from public.profiles where id = new.user_id;
  if v_estado = 'vencido' then
    raise exception 'Tu prueba terminó. Elegí un plan para seguir cargando.';
  end if;
  return new;
end;
$$;

-- `proveedores`: solo INSERT. Editar uno que ya existe (cambiarle el teléfono,
-- por ejemplo) no es "crear valor nuevo", no hace falta bloquearlo.
drop trigger if exists trg_bloquear_proveedor_vencido on public.proveedores;
create trigger trg_bloquear_proveedor_vencido
  before insert on public.proveedores
  for each row execute function public.bloquear_si_prueba_vencida();

-- `listas_precios`: INSERT *y* UPDATE. Tiene `unique(proveedor_id)` — una sola
-- fila por proveedor — así que recargar la lista de un proveedor que ya tiene
-- una (el caso más común, "subí la lista actualizada del mes") es un UPDATE,
-- no un INSERT. Si el trigger solo mirara INSERT, dejaría pasar justo la
-- acción que más importa bloquear.
drop trigger if exists trg_bloquear_lista_vencida on public.listas_precios;
create trigger trg_bloquear_lista_vencida
  before insert or update on public.listas_precios
  for each row execute function public.bloquear_si_prueba_vencida();


-- ============================================================================
-- Verificación (correr después de aplicar, a mano)
-- ============================================================================
-- select column_name from information_schema.columns
--  where table_name = 'profiles' and column_name = 'recorrido_visto';
-- -- 1 fila
--
-- select tgname from pg_trigger
--  where tgname in ('trg_bloquear_proveedor_vencido', 'trg_bloquear_lista_vencida');
-- -- 2 filas
```

- [ ] **Paso 2: Reflejar lo mismo en `sql/schema.sql`**

En `sql/schema.sql`, en la definición de `profiles` (buscar la línea `plan_vence timestamptz,`), agregar la columna nueva junto a las demás:

```sql
  recorrido_visto boolean default false not null,  -- si ya vio el tour guiado
```

Y al final del archivo (o cerca de donde estén las demás funciones/triggers), agregar el mismo bloque de `create or replace function public.bloquear_si_prueba_vencida()` + los dos `create trigger` del Paso 1, para que una instalación nueva del repo los traiga de una.

- [ ] **Paso 3: Commit**

```bash
git add sql/MIGRACION_DEMO_TRIAL.sql sql/schema.sql
git commit -m "sql: prueba de 15 dias, bloqueo al vencer (trigger), recorrido_visto"
```

*(Aplicar esta migración contra la base real es parte de la Tarea 8 — todavía no existe el proyecto Supabase del demo.)*

---

## Tarea 4: `api/empleados.js` — permitir `'prueba'` en el guard existente

**Por qué:** ya existe un chequeo (`profile.plan_estado !== 'activo' && profile.plan_estado !== null`) que bloquea crear empleados. Con los valores nuevos, una cuenta en `'prueba'` caería ahí adentro por error — el objetivo es que en prueba tenga acceso *completo* al plan Max, `'vencido'` sí tiene que seguir bloqueado por este mismo guard (gratis, sin tocar nada más).

**Archivos:**
- Modificar: `api/empleados.js`
- Test: `tests/run-tour.js` (agregamos esta verificación acá porque es la única prueba de este archivo en todo el plan; no amerita un archivo de test propio)

- [ ] **Paso 1: Ubicar el guard actual**

```js
      if (profile.plan_estado !== 'activo' && profile.plan_estado !== null) {
        return res.status(403).json({
          error: 'Tu plan no está activo. Regularizá el pago para gestionar empleados.',
          codigo: 'PLAN_NO_ACTIVO'
        });
      }
```

- [ ] **Paso 2: Sumar `'prueba'` a los estados permitidos**

```js
      if (profile.plan_estado !== 'activo' && profile.plan_estado !== null && profile.plan_estado !== 'prueba') {
        return res.status(403).json({
          error: 'Tu plan no está activo. Regularizá el pago para gestionar empleados.',
          codigo: 'PLAN_NO_ACTIVO'
        });
      }
```

- [ ] **Paso 3: Crear `tests/run-tour.js` con la primera verificación (estructural, no HTTP)**

`api/empleados.js` no pasa por el harness de jsdom (es una función de servidor, no una página). Se verifica leyendo el archivo, como ya hace el propio proyecto en otros lados para código de servidor:

```js
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

seccion('api/empleados.js: el guard de plan_estado permite la prueba');
{
  var src = fs.readFileSync(path.join(RAIZ, 'api/empleados.js'), 'utf8');
  ok('el guard menciona explícitamente \'prueba\' como estado permitido',
     /plan_estado\s*!==\s*'activo'[\s\S]{0,60}plan_estado\s*!==\s*null[\s\S]{0,60}plan_estado\s*!==\s*'prueba'/.test(src),
     'no se encontró el patrón esperado');
}

// ── RESUMEN ───────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(62));
console.log(fallos === 0
  ? 'TODO OK — ' + corridos + ' verificaciones'
  : fallos + ' FALLO(S) de ' + corridos + ' verificaciones');
console.log('═'.repeat(62) + '\n');
process.exit(fallos === 0 ? 0 : 1);
```

- [ ] **Paso 4: Correr y confirmar que falla ANTES del paso 2** (si todavía no se aplicó el cambio del Paso 2, este test tiene que fallar — es la prueba de que la prueba prueba algo)

```bash
node tests/run-tour.js
```

Esperado (si el Paso 2 ya está aplicado, saltar esta verificación): `FAIL`.

- [ ] **Paso 5: Confirmar que pasa con el fix aplicado**

```bash
node tests/run-tour.js
```

Esperado: `TODO OK — 1 verificaciones`

- [ ] **Paso 6: Commit**

```bash
git add api/empleados.js tests/run-tour.js
git commit -m "fix: una cuenta en prueba puede gestionar empleados (plan Max completo)"
```

---

## Tarea 5: El motor del recorrido guiado (`app/tour.js`)

**Por qué archivo aparte:** es lógica genérica y reutilizable (podría usarse en cualquier página), sin nada específico de ProveLink adentro — ni los pasos, ni el texto. Eso vive en `index.html`, que es quien conoce sus propias secciones.

**Archivos:**
- Crear: `app/tour.js`
- Modificar: `app/styles.css` (agregar al final)
- Test: `tests/run-tour.js` (se le suma una sección nueva a la que ya se creó en la Tarea 4)

- [ ] **Paso 1: Escribir el test primero — el motor recorre los pasos y respeta los controles**

Agregar a `tests/run-tour.js`, ANTES de la sección `// ── RESUMEN ──`:

```js
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
```

- [ ] **Paso 2: Correr para confirmar que falla** (todavía no existe `app/tour.js`)

```bash
node tests/run-tour.js
```

Esperado: error porque `app/tour.js` no existe (`ENOENT`), o `win.Tour` es `undefined`.

- [ ] **Paso 3: Escribir `app/tour.js`**

```js
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
```

- [ ] **Paso 4: Correr y confirmar que pasa**

```bash
node tests/run-tour.js
```

Esperado: `TODO OK — 14 verificaciones` (1 del guard de empleados + 13 del tour).

- [ ] **Paso 5: Agregar el CSS**

Al final de `app/styles.css`:

```css
/* ============================================================
   RECORRIDO GUIADO (tour.js)
   ============================================================ */
.tour-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .62);
  z-index: 9998;
}
.tour-resaltado {
  position: relative;
  z-index: 9999;
  outline: 3px solid var(--accent);
  outline-offset: 3px;
  border-radius: 10px;
}
.tour-tarjeta {
  position: fixed;
  z-index: 10000;
  width: 300px;
  background: var(--surface-hi);
  border: 1px solid var(--border-hi);
  border-radius: var(--r-md);
  padding: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, .4);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}
.tour-paso {
  font-size: 11px;
  color: var(--text-dim);
  font-weight: 600;
  letter-spacing: .05em;
  text-transform: uppercase;
  margin-bottom: 6px;
}
.tour-tarjeta h4 { margin: 0 0 6px; font-size: 15px; color: var(--text); }
.tour-tarjeta p { margin: 0 0 14px; font-size: 13px; color: var(--text-muted); line-height: 1.5; }
.tour-botones { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.tour-botones > div { display: flex; gap: 8px; }
```

- [ ] **Paso 6: Commit**

```bash
git add app/tour.js app/styles.css tests/run-tour.js
git commit -m "feat: motor generico del recorrido guiado (app/tour.js)"
```

---

## Tarea 6: Enganchar todo en `app/index.html`

Cuatro cosas en un archivo, en este orden: el chequeo de vencimiento, el cartel, los tres bloqueos de escritura, y el disparo/reapertura del tour.

**Archivos:**
- Modificar: `app/index.html`
- Test: `tests/run-flujos.js`

### 6.1 — El chequeo de vencimiento

- [ ] **Paso 1: Escribir el test primero**

Agregar a `tests/run-flujos.js` (cerca de donde estén los tests relacionados con `profile`/plan, o al final antes del resumen — buscar el patrón `var { montarApp } = require('./harness');` al principio del archivo para confirmar el import ya está):

```js
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
```

- [ ] **Paso 2: Correr para confirmar que falla**

```bash
node tests/run-flujos.js
```

Esperado: `FAIL` en ambas verificaciones nuevas (`plan_estado` sigue en `'prueba'` porque nada lo cambia todavía).

- [ ] **Paso 3: Implementar `chequearVencimientoPrueba()`**

En `app/index.html`, ubicar dentro de `(async function init() { ... })()`:

```js
    ok = await cargarProfile();
    if (!ok) { window.location.href = '/login'; return; }
    renderHeader();
```

Insertar la llamada nueva entre esas dos líneas:

```js
    ok = await cargarProfile();
    if (!ok) { window.location.href = '/login'; return; }
    await chequearVencimientoPrueba();
    renderHeader();
```

Y agregar la función, cerca de `cargarProfile()` (buscar `async function cerrarSesion()` para ubicarse — la función nueva va justo antes):

```js
// ============================================================
// PRUEBA DE 15 DÍAS
// ============================================================
// Sin cron: se resuelve solo, la primera vez que se abre la app después de
// que venció. Un único update, idempotente — si dos pestañas lo disparan a
// la vez, las dos mandan el mismo valor, no pasa nada raro.
async function chequearVencimientoPrueba() {
  if (profile.plan_estado !== 'prueba') return;
  if (!profile.plan_vence || new Date(profile.plan_vence) > new Date()) return;

  try {
    var { error } = await supabase
      .from('profiles')
      .update({ plan_estado: 'vencido' })
      .eq('id', profile.id);
    if (error) throw error;
    profile.plan_estado = 'vencido';
  } catch(e) {
    console.error('chequearVencimientoPrueba', e);
    // Si falla el update, se sigue mostrando "prueba" hasta el próximo intento
    // (el próximo load lo vuelve a chequear) — mejor eso que bloquear sin
    // haberlo podido confirmar en la base.
  }
}
```

- [ ] **Paso 4: Correr y confirmar que pasa**

```bash
node tests/run-flujos.js
```

Esperado: las dos verificaciones nuevas en `OK`.

- [ ] **Paso 5: Commit**

```bash
git add app/index.html tests/run-flujos.js
git commit -m "feat: transicion automatica de prueba a vencido, sin cron"
```

### 6.2 — El cartel

- [ ] **Paso 1: Escribir el test primero**

Agregar a `tests/run-flujos.js`:

```js
  seccion('Prueba de 15 días: el cartel');
  {
    var enDias = function(n) { return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString(); };

    var app1 = await montarApp({ profile: { plan: 'business', plan_estado: 'prueba', plan_vence: enDias(6) } });
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
```

- [ ] **Paso 2: Correr para confirmar que falla**

```bash
node tests/run-flujos.js
```

Esperado: `FAIL` (el banner hoy no sabe nada de `plan_estado`).

- [ ] **Paso 3: Extender `renderPlanBanner()`**

Ubicar:

```js
function renderPlanBanner() {
  var banner = $('plan-banner');
  var txt = $('plan-banner-txt');
  if (profile.plan === 'free') {
```

Cambiar a:

```js
function renderPlanBanner() {
  var banner = $('plan-banner');
  var txt = $('plan-banner-txt');
  if (profile.plan_estado === 'prueba') {
    var dias = Math.max(0, Math.ceil((new Date(profile.plan_vence) - new Date()) / 86400000));
    banner.classList.remove('warn');
    banner.classList.remove('danger');
    txt.innerHTML = '<strong>Prueba gratis</strong> · Te queda' + (dias === 1 ? '' : 'n') + ' ' +
      dias + (dias === 1 ? ' día' : ' días');
    banner.style.display = 'flex';
    return;
  }
  if (profile.plan_estado === 'vencido') {
    banner.classList.remove('warn');
    banner.classList.add('danger');
    txt.innerHTML = '<strong>Tu prueba terminó</strong> — elegí un plan para seguir';
    banner.style.display = 'flex';
    return;
  }
  if (profile.plan === 'free') {
```

*(el resto de la función, desde `var max = LIMITES.free.proveedores;` hasta el cierre, queda exactamente como está)*

- [ ] **Paso 4: Agregar el modificador `.danger` al CSS**

En `app/styles.css`, junto a la regla existente:

```css
.plan-banner.warn { border-left-color: var(--gold); }
```

Agregar debajo:

```css
.plan-banner.danger { border-left-color: var(--danger); }
```

- [ ] **Paso 5: Correr y confirmar que pasa**

```bash
node tests/run-flujos.js
```

- [ ] **Paso 6: Commit**

```bash
git add app/index.html app/styles.css tests/run-flujos.js
git commit -m "feat: cartel de dias restantes y de prueba vencida"
```

### 6.3 — Los tres bloqueos de escritura

- [ ] **Paso 1: Escribir el test primero**

```js
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
```

- [ ] **Paso 2: Correr para confirmar que falla**

```bash
node tests/run-flujos.js
```

Esperado: `FAIL` en "no abre el modal" (hoy `abrirModalProv()` no conoce `plan_estado`).

- [ ] **Paso 3: El helper compartido**

Cerca de `chequearVencimientoPrueba()`, agregar:

```js
// Chequeo compartido por los tres puntos donde se "crea valor nuevo"
// (agregar proveedor, cargar lista, confirmar pedido). Ver también el
// respaldo real del lado del servidor: sql/MIGRACION_DEMO_TRIAL.sql.
function bloqueadoPorVencimiento() {
  if (profile.plan_estado !== 'vencido') return false;
  showToast('Tu prueba terminó. Elegí un plan para seguir.', 'error');
  return true;
}
```

- [ ] **Paso 4: Cablear los tres puntos**

En `abrirModalProv()`:

```js
function abrirModalProv() {
  var limite = LIMITES[profile.plan || 'free'].proveedores;
```

a:

```js
function abrirModalProv() {
  if (bloqueadoPorVencimiento()) return;
  var limite = LIMITES[profile.plan || 'free'].proveedores;
```

En `guardarLista()`:

```js
async function guardarLista() {
  var ficha = cargaActiva();
  if (!ficha) return;
```

a:

```js
async function guardarLista() {
  if (bloqueadoPorVencimiento()) return;
  var ficha = cargaActiva();
  if (!ficha) return;
```

En `confirmarPedido()`:

```js
function confirmarPedido() {
  var ped = pedidoGet();
```

a:

```js
function confirmarPedido() {
  if (bloqueadoPorVencimiento()) return;
  var ped = pedidoGet();
```

- [ ] **Paso 5: Correr y confirmar que pasa**

```bash
node tests/run-flujos.js
```

- [ ] **Paso 6: Commit**

```bash
git add app/index.html tests/run-flujos.js
git commit -m "feat: bloquear agregar proveedor, cargar lista y confirmar pedido si la prueba vencio"
```

### 6.4 — Disparar y reabrir el recorrido guiado

- [ ] **Paso 1: Escribir el test primero**

```js
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
```

- [ ] **Paso 2: Correr para confirmar que falla**

```bash
node tests/run-flujos.js
```

Esperado: `FAIL` (nada dispara el tour todavía).

- [ ] **Paso 3: Los pasos del recorrido + el disparo automático**

Cerca de `bloqueadoPorVencimiento()`, agregar:

```js
// ============================================================
// RECORRIDO GUIADO
// ============================================================
function pasosRecorrido() {
  return [
    { selector: '#side-link-prov', titulo: 'Tus proveedores',
      texto: 'Acá cargás cada proveedor: nombre, teléfono, y si te cotiza por bulto o por kilo.' },
    { selector: '#side-link-listas', titulo: 'Listas de precios',
      texto: 'Subí la lista de cada proveedor: a mano, con la plantilla, o con IA leyendo el PDF, Excel o una foto.' },
    { selector: '#side-link-pedido', titulo: 'Comparar y armar el pedido',
      texto: 'El corazón de la app: buscás un producto y ves el precio de TODOS tus proveedores juntos, para elegir el más barato.' },
    { selector: '#side-link-calendario', titulo: 'Calendario',
      texto: 'Programá pedidos que se repiten: se arman solos en la fecha que elijas.' },
    { selector: '#side-link-metricas', titulo: 'Métricas',
      texto: 'El dashboard del plan Max: cuánto gastaste, con quién, y cómo evolucionan tus precios.' },
    { selector: '#ai-fab', titulo: 'Asistente IA',
      texto: 'Preguntale directo: "¿cuál es el dulce de leche más barato?" o "armame un pedido de harina y aceite".' }
  ];
}

async function marcarRecorridoVisto() {
  profile.recorrido_visto = true;
  try {
    await supabase.from('profiles').update({ recorrido_visto: true }).eq('id', profile.id);
  } catch(e) {
    console.error('marcarRecorridoVisto', e);
  }
}

function reabrirRecorrido() {
  $('menu').classList.remove('open');
  Tour.iniciar(pasosRecorrido(), function() {});
}
```

*(no existe una función `cerrarMenu()` — el resto del código cierra el menú tocando `$('menu').classList.remove('open')` directo, como hace `abrirPlanes()` unas líneas más abajo en el mismo archivo; se usa el mismo patrón acá para no inventar una abstracción nueva)*

- [ ] **Paso 4: Disparar el tour en cuentas nuevas, dentro de `init()`**

Ubicar, más abajo en `init()`:

```js
    cambiarTab(tabInicial);
    $('loader').style.display = 'none';
    $('app-shell').style.display = 'flex';
```

Cambiar a:

```js
    cambiarTab(tabInicial);
    $('loader').style.display = 'none';
    $('app-shell').style.display = 'flex';
    if (!profile.recorrido_visto && !esEmpleado()) {
      Tour.iniciar(pasosRecorrido(), marcarRecorridoVisto);
    }
```

*(`!esEmpleado()` porque el recorrido es para quien está evaluando el producto por primera vez — el dueño — no para un sub-usuario que ya se lo mostraron)*

- [ ] **Paso 5: Cargar `tour.js` y agregar la entrada al menú**

En el `<head>` de `app/index.html`, buscar dónde se cargan los scripts propios (`<script src="/app/icons.js">` o similar) y agregar, en el mismo bloque:

```html
<script src="/app/tour.js"></script>
```

En el menú desplegable (buscar `id="menu-planes"`):

```html
<div class="menu-item" id="menu-planes" onclick="abrirPlanes()"><span class="icon-slot" data-icon="star"></span> Cambiar plan</div>
```

Agregar debajo:

```html
<div class="menu-item" id="menu-recorrido" onclick="reabrirRecorrido()"><span class="icon-slot" data-icon="info"></span> Ver recorrido</div>
```

- [ ] **Paso 6: Correr y confirmar que pasa**

```bash
node tests/run-flujos.js
```

- [ ] **Paso 7: Correr TODA la suite del repo, no solo lo nuevo**

```bash
npm test
```

Esperado: `TODO OK` con el total de siempre + todo lo agregado en esta tarea.

- [ ] **Paso 8: Commit**

```bash
git add app/index.html tests/run-flujos.js
git commit -m "feat: recorrido guiado en cuentas nuevas, reabrible desde el menu"
```

---

## Tarea 7: El link de prueba en `app/login.html`

**Archivos:**
- Modificar: `app/login.html`

No hay harness para `login.html` (el proyecto solo tiene uno para `index.html`). Se prueba con una función pura, testeable sin DOM.

- [ ] **Paso 1: Escribir el test primero**

Agregar a `tests/run-tour.js`:

```js
seccion('login.html: datos de la cuenta de prueba según la URL');
{
  var vm = require('vm');
  // vm.createContext() aísla el contexto: no hereda los globals del host.
  // URLSearchParams hay que pasarlo a mano (si no, "URLSearchParams is not
  // defined" apenas se evalúa), y datosDePrueba('') cae al fallback
  // `window.location.search` — sin un `window.location` armado, revienta con
  // "Cannot read properties of undefined (reading 'search')". Las dos cosas
  // se confirmaron ejecutando el test antes de escribirlo así en el plan.
  var ctx = { window: { location: { search: '' } }, URLSearchParams: URLSearchParams };
  vm.createContext(ctx);
  var src = fs.readFileSync(path.join(RAIZ, 'app/login.html'), 'utf8');
  var m = src.match(/function datosDePrueba[\s\S]*?\n}/);
  ok('la función datosDePrueba existe en login.html', !!m);
  if (m) {
    vm.runInContext(m[0] + '\nwindow.datosDePrueba = datosDePrueba;', ctx);
    var conParametro = ctx.window.datosDePrueba('?prueba=1');
    ok('con ?prueba=1 arma el plan Max', conParametro && conParametro.plan === 'business');
    ok('en estado prueba', conParametro && conParametro.plan_estado === 'prueba');
    ok('vence en 15 días', function() {
      if (!conParametro) return false;
      var dias = Math.round((new Date(conParametro.plan_vence) - new Date()) / 86400000);
      return dias === 15;
    }());

    var sinParametro = ctx.window.datosDePrueba('');
    ok('sin el parámetro, no devuelve nada', sinParametro === null);

    var otroParametro = ctx.window.datosDePrueba('?otracosa=1');
    ok('con otro parámetro cualquiera, tampoco', otroParametro === null);
  }
}
```

- [ ] **Paso 2: Correr para confirmar que falla**

```bash
node tests/run-tour.js
```

Esperado: `FAIL` en "la función datosDePrueba existe" (todavía no existe).

- [ ] **Paso 3: Escribir `datosDePrueba()` en `login.html`**

Ubicar, cerca de `async function hacerRegistro() {`, y agregar la función ANTES:

```js
  // Si la URL trae ?prueba=1, esta cuenta arranca en el plan Max por 15 días
  // en vez del Free por defecto. Es un link privado — lo comparte el vendedor
  // en persona, no está anunciado en ningún lado de este despliegue.
  function datosDePrueba(queryString) {
    var params = new URLSearchParams(queryString || window.location.search);
    if (params.get('prueba') !== '1') return null;
    var vence = new Date();
    vence.setDate(vence.getDate() + 15);
    return { plan: 'business', plan_estado: 'prueba', plan_vence: vence.toISOString() };
  }
```

- [ ] **Paso 4: Usarla en `hacerRegistro()`**

Ubicar:

```js
      if (data.user) {
        await supabase.from('profiles').update({ nombre_negocio: negocio }).eq('id', data.user.id);
      }
```

Cambiar a:

```js
      if (data.user) {
        var actualizacion = Object.assign({ nombre_negocio: negocio }, datosDePrueba() || {});
        await supabase.from('profiles').update(actualizacion).eq('id', data.user.id);
      }
```

- [ ] **Paso 5: Correr y confirmar que pasa**

```bash
node tests/run-tour.js
```

- [ ] **Paso 6: Correr toda la suite una vez más**

```bash
npm test
```

- [ ] **Paso 7: Commit**

```bash
git add app/login.html tests/run-tour.js
git commit -m "feat: link de prueba (?prueba=1) activa 15 dias en el plan Max al registrarse"
```

---

## Tarea 8: Desplegar y verificar en vivo

Esta tarea es operativa, no de código — necesita acceso a los dashboards de Supabase y Railway en el momento de ejecutarla.

- [ ] **Paso 1: Crear el proyecto Supabase nuevo**

Vía dashboard (`https://supabase.com/dashboard`): un proyecto nuevo, nombre sugerido `provelink-demo`. Anotar el Project Ref, la `anon key` y la `service_role key`.

En **Authentication → Providers → Email**, desactivar "Confirm email" (el registro tiene que ser instantáneo durante la visita).

- [ ] **Paso 2: Aplicar el schema completo**

En el editor SQL de ese proyecto nuevo, correr en este orden: `sql/schema.sql` completo (ya incluye lo de la Tarea 3), y si por lo que sea se aplicó antes de que `schema.sql` tuviera los cambios, correr también `sql/MIGRACION_DEMO_TRIAL.sql` aparte (es idempotente, no rompe si ya estaba).

Verificar:

```sql
select column_name from information_schema.columns
 where table_name = 'profiles' and column_name = 'recorrido_visto';

select tgname from pg_trigger
 where tgname in ('trg_bloquear_proveedor_vencido', 'trg_bloquear_lista_vencida');
```

Esperado: 1 fila la primera, 2 filas la segunda.

- [ ] **Paso 3: Apuntar el clon a la base nueva**

En `app/login.html` y `app/index.html`, reemplazar:

```js
var SUPABASE_URL = 'https://himtrizetvkywrtperqu.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIs...';
```

por la URL y la `anon key` del proyecto nuevo (Paso 1).

```bash
git add app/login.html app/index.html
git commit -m "config: apuntar el demo a su propio proyecto Supabase"
```

- [ ] **Paso 4: Crear el repo en GitHub y pushear**

```bash
gh repo create provelink-demo --private --source=. --remote=origin
git push -u origin main
```

- [ ] **Paso 5: Crear el proyecto en Railway y conectarlo al repo**

Usando el MCP de Railway ya autenticado en esta sesión: crear un proyecto nuevo, un servicio conectado a `LuchiVega/provelink-demo` rama `main`. Si el GitHub App de Railway no tiene acceso a este repo nuevo todavía, va a pedir la misma autorización que se hizo para `provelink-parte-2` (Settings → Source → Connect Repo → Configure GitHub App → agregar el repo nuevo a la lista de repos permitidos).

- [ ] **Paso 6: Variables de entorno en Railway**

```
SUPABASE_URL=<la del proyecto nuevo>
SUPABASE_SERVICE_ROLE_KEY=<la service_role del proyecto nuevo>
ANTHROPIC_API_KEY=<la misma que ya se usa en la Parte 2, o una propia>
```

- [ ] **Paso 7: Verificar el despliegue**

```bash
curl -s -o /dev/null -w "login: %{http_code}\n" https://<dominio-de-railway>/login
curl -s -o /dev/null -w "app: %{http_code}\n" https://<dominio-de-railway>/app
curl -s -w " [%{http_code}]\n" -X POST https://<dominio-de-railway>/api/claude -H "Content-Type: application/json" -d '{}'
```

Esperado: `login` y `app` en `200`; `/api/claude` en `401` (no `404`) — mismo criterio que se usó para confirmar que la Parte 2 tenía las variables bien cargadas: un 401 significa que el handler cargó y está pidiendo autenticación, no que la ruta no existe.

- [ ] **Paso 8: Probar el registro con el link de prueba, de punta a punta**

Abrir `https://<dominio-de-railway>/login?prueba=1` en el navegador, registrar una cuenta de prueba real, y confirmar:
- Entra directo a `/app` sin pedir confirmación de mail.
- Aparece el recorrido guiado.
- El cartel dice "Prueba gratis · Te quedan 15 días".
- Consultando la base (`select plan, plan_estado, plan_vence from profiles where email = '...'`), los tres campos están bien.

- [ ] **Paso 9: Actualizar el spec con el resultado**

En `docs/superpowers/specs/2026-08-30-demo-prueba-negocios-design.md`, agregar al final una sección `## 11. Estado del despliegue` con la URL real, el Project Ref de Supabase, y la fecha de la verificación en vivo.

```bash
git add docs/superpowers/specs/2026-08-30-demo-prueba-negocios-design.md
git commit -m "docs: demo desplegado y verificado en vivo"
git push
```

---

## Auto-revisión del plan

- **Cobertura del spec:** §3 Infraestructura → Tarea 1 + Tarea 8. §4 Link de prueba → Tarea 7. §5 Estados de plan_estado (banner, transición, bloqueo en dos capas) → Tarea 6.1/6.2/6.3 + Tarea 3 (triggers). §6 Recorrido guiado → Tarea 5 + Tarea 6.4. §7 Cambios por archivo → cada uno tiene su tarea. Todo lo de "Fuera de alcance" (§9) no tiene tarea, correcto.
- **Placeholders:** ninguno — cada paso de código trae el código completo, cada comando trae su resultado esperado.
- **Consistencia de nombres:** `chequearVencimientoPrueba`, `bloqueadoPorVencimiento`, `pasosRecorrido`, `marcarRecorridoVisto`, `reabrirRecorrido` se usan igual en todas las tareas donde aparecen (Tarea 6 los define, y son los mismos nombres referenciados en sus propios tests). `Tour.iniciar(pasos, callback)` es la única función pública del motor, usada igual en la Tarea 5 (tests directos) y la Tarea 6.4 (uso real).
- **Hallazgo del harness (Tarea 2):** no estaba en el spec explícitamente, pero es una consecuencia directa de construir el recorrido guiado (spec §6) sobre un harness que ya tenían 500+ tests existentes — se agregó para no romper nada fuera del alcance de esta feature.
