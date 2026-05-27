# ProveLink SaaS

Plataforma de gestión de proveedores, pedidos y producción para comercios.
Multi-tenant, con planes Free / Pro / Business y asistente IA integrado.

---

## Estructura real del repo

```
provelink-saas/
├── landing/
│   └── index.html          # Landing page pública (no requiere login)
├── app/
│   ├── index.html          # App principal (requiere login) — ~3900 líneas
│   ├── login.html          # Login + registro
│   ├── styles.css          # Design system completo (paleta midnight, glassmorphism)
│   └── icons.js            # SVG icons inline (Icon.box, Icon.list, Icon.factory, etc.)
├── api/
│   └── claude.js           # Proxy serverless a la API de Anthropic
│                           # Valida JWT, controla cuota, 3 tiers de modelo, retry con backoff
├── sql/
│   └── schema.sql          # Esquema Supabase + RLS + funciones + Storage policies
├── imagenes/
│   └── logo.png
├── vercel.json             # Rewrites + maxDuration: 60s para funciones
└── package.json
```

---

## Routing (vercel.json)

| URL            | Sirve                |
|----------------|----------------------|
| `/`            | `landing/index.html` |
| `/login`       | `app/login.html`     |
| `/login.html`  | `app/login.html`     |
| `/app`         | `app/index.html`     |
| `/app/`        | `app/index.html`     |

---

## Stack

| Capa       | Tecnología                                                         |
|------------|--------------------------------------------------------------------|
| Frontend   | HTML + JS vanilla (sin frameworks)                                 |
| Auth + DB  | Supabase (Postgres + Auth + RLS + Storage)                         |
| Serverless | Vercel Functions (Node.js) — solo `api/claude.js`                  |
| IA         | Claude Haiku 4.5 (extracción PDF, normalización, modo de precio) + Claude Sonnet 4 con thinking (extracción de imágenes) |
| Hosting    | Vercel                                                             |

---

## Tablas en Supabase

| Tabla                      | Descripción                                                                 |
|----------------------------|-----------------------------------------------------------------------------|
| `profiles`                 | Extiende `auth.users`: nombre_negocio, plan, cuota IA                       |
| `proveedores`              | Nombre, teléfono, `logo_url`. (`precio_tipo` queda en la DB por compat pero ya no se usa) |
| `listas_precios`           | Items JSON `[{productoLista, precio, unidad, clave_canonica, tipo, tamano, unidad_base, modo, precio_total, precio_unitario, confianza, revisar, razonamiento}]` por proveedor. 1 lista por proveedor. |
| `snapshots_precios`        | Versiones históricas de listas (antes de cada update)                       |
| `pedido_actual`            | Pedido en construcción del usuario (sincronizado con Supabase)              |
| `historial_pedidos`        | Pedidos confirmados con totales y desglose                                  |
| `uso_ia`                   | Log de cada llamada a Claude (tokens, costo, tipo, fecha)                   |
| `pl_auditoria_precios`     | Registro de cada item procesado por el pipeline: clave canónica, modo detectado, precio normalizado, confianza, razonamiento |
| `pl_cache_normalizacion`   | Cache **global** (compartido entre todas las cuentas) de nombres normalizados. La segunda vez que cualquier usuario sube el mismo producto, se saltea la llamada a la IA. Solo guarda normalización (clave, tipo, tamaño, unidad), nunca precios. |

**`logo_url`**: bucket Supabase Storage `provider-logos`, carpeta `{user_id}/{proveedor_id}.ext`.

### Aislamiento entre usuarios

- **Precios de listas, pedidos, historial, auditoría**: privados por usuario (RLS por `auth.uid()`).
- **Cache de normalización**: global, compartido. Solo nombres → claves canónicas. **Nunca contiene precios.**
- **Comparación cross-proveedor para detectar modo**: usa solo las listas del MISMO usuario.

### localStorage (datos locales del dispositivo)

| Clave                   | Contenido                                                    |
|-------------------------|--------------------------------------------------------------|
| `pl_recetas`            | Productos de producción (id, nombre, catId, subcatId)        |
| `pl_prod_cats`          | Categorías de producción                                     |
| `pl_prod_subcats`       | Subcategorías de producción                                  |
| `pl_prod_hist`          | Historial de pedidos a producción                            |
| `pl_prod_verif_hist`    | Estado de verificación de pedidos de producción              |
| `pl_orden_prod`         | Pedido a producción en construcción                          |

---

## Planes

| Plan     | Precio       | Proveedores | Listas | Consultas IA/mes |
|----------|--------------|-------------|--------|------------------|
| Free     | $0           | 3           | 1      | 0                |
| Pro      | $20 USD/mes  | Ilimitado   | ∞      | 150              |
| Business | $100 USD/mes | Ilimitado   | ∞      | 500              |

El procesamiento de listas (pipeline IA) **no consume cuota de consultas** — tiene su propio límite por plan (free = 1 lista). El asistente IA conversacional sí consume cuota.

El cambio de plan se gestiona manualmente: el admin actualiza `plan` en `profiles`.

---

## Variables de entorno en Vercel

```
SUPABASE_URL              = https://xxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY = eyJ...  (secreta, NUNCA en frontend)
ANTHROPIC_API_KEY         = sk-ant-...
```

---

## Setup inicial paso a paso

### 1. Supabase — base de datos

1. Crear proyecto en https://supabase.com
2. SQL Editor → New query → pegar `sql/schema.sql` completo → Run
3. Settings → API → copiar:
   - `Project URL` → variable de entorno `SUPABASE_URL` en Vercel
   - `service_role` key → variable `SUPABASE_SERVICE_ROLE_KEY` en Vercel
   - `anon public` key → hardcodeada en `app/index.html` y `app/login.html`
4. Authentication → Providers → Email → activar

### 2. Supabase — Storage para logos

1. Dashboard → Storage → New Bucket
   - Name: `provider-logos` · Public bucket: **activar**
2. SQL Editor → ejecutar el bloque `STORAGE` de `sql/schema.sql`

### 3. Vercel — deploy

1. Importar repo desde GitHub en https://vercel.com
2. Settings → Environment Variables → agregar las 3 variables
3. Deploy

### 4. Primer usuario

Registrarse desde `/login` → Supabase crea automáticamente un registro en `profiles` con `plan = 'free'`.
Para dar plan Pro/Business: Supabase → Table Editor → `profiles` → editar campo `plan`.

---

## Tabs del app

| Tab              | Descripción                                                       |
|------------------|-------------------------------------------------------------------|
| **Proveedores**  | CRUD de proveedores con logo, teléfono                           |
| **Listas**       | Cargar y gestionar listas de precios por proveedor               |
| **Armar pedido** | Buscador unificado con precios normalizados ($/kg o $/L)         |
| **Historial**    | Pedidos confirmados con desglose por proveedor                   |
| **Producción**   | Productos, categorías y pedidos internos de producción           |

---

## Pipeline de listas de precios

El módulo de listas implementa un pipeline multi-etapa para normalizar y comparar precios entre proveedores aunque cada uno los exprese de forma distinta (precio por bulto vs. precio por kg).

```
ETAPA 1: EXTRACCIÓN     → IA lee imagen/PDF y extrae filas crudas (precio como STRING)
ETAPA 2: NORMALIZACIÓN  → cache + IA convierten nombres a clave canónica comparable
ETAPA 3: AGRUPAMIENTO   → Código agrupa por clave canónica (gratis, sin IA)
ETAPA 4: DETECCIÓN MODO → Cascada: heurística → rangos típicos → IA
ETAPA 5: CÁLCULO FINAL  → Código calcula precio_total y precio_unitario
+ AUDITORÍA             → Todo se guarda en pl_auditoria_precios
```

**Principio**: la IA clasifica y razona. El código calcula. Nunca al revés.

### Detección de modo (cascada de 3 etapas)

Para cada producto se intenta decidir si el precio del PDF es por bulto (PACK) o por unidad base (UNITARIO):

1. **Heurística estructural** (gratis, sin IA): solo decide cuando la presentación es claramente unidad pura sin número ("KG", "X LT", "BOT", "UNI") → UNITARIO con confianza 0.85.
2. **Rangos típicos** (gratis, sin IA): usa la tabla `RANGOS_PRECIO_AR` con precios esperados por tipo de producto (aceite girasol, aceto balsámico, harina, etc.). Si SOLO una de las 2 interpretaciones cae dentro del rango típico, decide con confianza 0.9. **Esta etapa cubre la mayoría de los casos sin llamar a la IA.**
3. **IA** (Haiku, paga): solo para casos donde:
   - El tipo no está en `RANGOS_PRECIO_AR`
   - Ambas interpretaciones caen dentro/fuera del rango (verdaderamente ambiguo)
   - Hay 2+ proveedores con el mismo producto → la IA usa el ratio de precios para deducir

Si la IA falla y no hay más reintentos, el item queda con `modo: null` y se muestra como "para revisar" en la preview, donde el usuario puede flipearlo manualmente con un click.

### Modelos usados por etapa

| Etapa             | Modelo  | Motivo                                           |
|-------------------|---------|--------------------------------------------------|
| Extracción imagen | Sonnet + thinking | Visión + listas caóticas              |
| Extracción PDF    | Haiku   | Texto ya estructurado, tarea simple              |
| Normalización     | Haiku   | Tarea mecánica con reglas fijas                  |
| Detección modo    | Haiku   | Aritmética (ratio de precios = tamaño producto)  |

### Configuración de batches y límites (para evitar rate limits)

| Variable                  | Valor   | Comentario                                       |
|---------------------------|---------|--------------------------------------------------|
| `_CLAUDE_MAX_CONCURRENT`  | 2       | Semáforo: cuántas llamadas paralelas a `/api/claude` |
| Batch normalizar          | 40      | Items por request                                |
| Batch detectar_modo       | 15      | Grupos por request (cada uno con varios proveedores) |
| max_tokens normalizar     | 6000    | Suficiente para 40 items × ~120 tokens output    |
| max_tokens detectar_modo  | 4500    | Suficiente para 15 grupos × ~250 tokens          |
| `CACHE_HIT_MIN_CONFIANZA` | 0.6     | Items con confianza menor se re-normalizan        |

El rate limit de Anthropic en Tier 1 son 10K output tokens/minuto. Con concurrencia=2 y max_tokens conservativos, nos mantenemos cómodamente bajo el límite. El proxy `api/claude.js` además reintenta automáticamente 429/529/503 con backoff exponencial.

### Optimizaciones de costo

- **Cache global** (`pl_cache_normalizacion`): compartido entre todas las cuentas. La segunda vez que cualquier usuario sube un producto con el mismo nombre normalizado, se saltea la llamada a Haiku. Solo cachea normalización (clave, tipo, tamaño, unidad), nunca precios.
- **Rangos típicos cliente-side**: la tabla `RANGOS_PRECIO_AR` cubre ~20 tipos comunes (aceites, vinagres, acetos, harinas, lácteos, bebidas) y decide modo sin IA cuando hay match claro.
- **Heurística estructural**: si la presentación dice "KG", "BOT", etc. solo (sin número), el modo se determina sin IA.
- **Auto-subdivide en truncado**: si Claude devuelve `stop_reason: 'max_tokens'`, los batches se autodividen recursivamente y rellaman.
- **Recovery de JSON truncado**: `recuperarObjetosJsonArray()` extrae objetos completos de un array truncado en lugar de perder todo el batch.
- **Paralelismo controlado**: hasta 2 batches en vuelo a la vez (semáforo `_fetchClaude`).

### Robustez del pipeline

- **Retry por batch**: 3 intentos con backoff antes de marcar un batch como perdido.
- **Errores 4xx no-reintentables**: 401 (token inválido), 400, 403, etc. fallan rápido sin desperdiciar reintentos.
- **Respuestas no-JSON**: cuando Vercel hace 504 y devuelve HTML, `_fetchClaude` lo maneja sin romper el parser.
- **Validación de IDs**: si la IA devuelve `id_original` que no matchea ningún input, los items perdidos se cuentan y reportan al usuario via toast.
- **Sanity check del cache para multipack**: si un producto tiene patrón multipack "N x M unidad" y el cache tiene un tamaño incompatible, se fuerza re-normalización.

### Costo aproximado por lista

| Productos | Costo estimado |
|-----------|----------------|
| ~400      | ~$0.10-0.20    |
| ~1100     | ~$0.30-0.50    |
| Segunda vez (mismo producto en cache) | ~$0.02-0.05 (solo extracción) |

### Clave canónica

Formato: `[tipo] [tamaño][unidad]` — todo minúsculas, sin acentos, sin marca. Unidades canónicas: **kg, L, u**.

```
"ACEITE GIRASOL COCINERO X 5 LTS"        → "aceite girasol 5L"
"HARINA 000 CAÑUELAS X 25 KG"            → "harina 000 25kg"
"MAYONESA HELLMANN'S X 2.9 KG"           → "mayonesa 2.9kg"
"PARMESANO VAQUERO EN BLOQUE 24 MESES"   → "queso parmesano 24 meses"  ← meses = maduración, no kg
"LEVADURA FRESCA LEVEX X 500GR"          → "levadura fresca 0.5kg"
"VINAGRE MANZANA PACK 200 X 8CC"         → "vinagre manzana 1.6L"      ← multipack: 200×8/1000
"COCA COLA X 500CC"                      → "coca cola 0.5L"            ← cc = ml = L/1000
```

**Casos especiales**:
- `cc` y `ml` son lo mismo (ambos se convierten a L dividiendo por 1000)
- `gr` se convierte a kg dividiendo por 1000
- Multipack solo si hay palabra de pack explícita ("Pack", "Caja", "Set", etc.) o si la unidad es cc/ml/gr con N razonable (2-500). **Códigos de producto** ("Baño Blanco Aguila 9473 x 10 kg") **NO se confunden con multipack**.

### Formato de precios

La IA devuelve precios como **STRING** con el formato exacto del PDF (ej: `"13.996,53"`). El cliente parsea con `parsePrecio()` que maneja:
- AR `1.234,56` → `1234.56`
- US `1,234.56` → `1234.56`
- Con símbolos `$ 13.996,53` → `13996.53`
- Ambiguo `13.996` → `13996` (asume miles AR)

### Modo de precio: pack vs unitario

| Modo       | Significado del precio del PDF | precio_total | precio_unitario |
|------------|--------------------------------|--------------|-----------------|
| `pack`     | Precio total del envase        | = precio     | = precio / tamaño |
| `unitario` | Precio por unidad base (kg/L)  | = precio × tamaño | = precio   |

En el buscador y en los pedidos se muestra **`precio_total`** (lo que cuesta comprar 1 envase). El `precio_unitario` se muestra como subtítulo informativo ($X/kg).

En la preview, cada item tiene dos botones clickeables `📦 bulto` y `⚖️ x kg` con las consecuencias de cada interpretación. El usuario puede flippear con un click antes de guardar.

---

## Tab Producción

Módulo local (localStorage) simplificado para gestionar pedidos internos de producción.

### Sub-tabs

| Sub-tab         | Descripción                                                         |
|-----------------|---------------------------------------------------------------------|
| **Productos**   | Alta/edición de productos con categoría y subcategoría             |
| **Hacer pedido**| Armar un pedido de producción, confirmar, verificar e imprimir     |
| **Historial**   | Pedidos de producción anteriores con estado de verificación        |

### Verificación de pedidos

- Estado: `libre → confirmado → bloqueado` (máximo 5 ediciones)
- Fecha crítica basada en `diaDelAnio()` (código juliano 1-365): 0-2 días = verde, 3-5 días = amarillo, 6+ días = vencido

---

## API: `api/claude.js`

Recibe POST autenticado con JWT de Supabase. Valida plan, controla cuota y loguea uso.

### Tiers de modelo

| Tier               | Modelo            | Cuándo se usa                          |
|--------------------|-------------------|----------------------------------------|
| Sonnet + thinking  | `claude-sonnet-4-6` | `procesar_lista` (extracción de imágenes) |
| Haiku              | `claude-haiku-4-5-20251001` | Todo lo demás                 |

### Tipos de request

| `tipo`                  | Modelo  | Descripción                                      | Cuota          |
|-------------------------|---------|--------------------------------------------------|----------------|
| `chat`                  | Haiku   | Asistente IA conversacional                      | Sí (pro/biz)  |
| `procesar_lista`        | Sonnet  | Extracción de precios de imagen (con thinking)   | No (límite listas) |
| `detectar_columnas`     | Haiku   | Detección de columnas en texto de PDF            | No             |
| `procesar_chunk`        | Haiku   | Procesamiento de fragmento de PDF largo          | No             |
| `normalizar_lista`      | Haiku   | Etapa 2: normalizar nombres a clave canónica     | No             |
| `detectar_modo_precios` | Haiku   | Etapa 4: determinar si precio es pack o unitario | No             |
| `expandir_query`        | Haiku   | Expandir abreviaciones en el buscador            | No (sin restricción) |

### Retry automático en el proxy

Cuando Claude devuelve 429 (rate limit), 529 (overload) o 503 (service unavailable), el proxy reintenta hasta 4 veces con backoff exponencial respetando el header `Retry-After` si viene. Los 4xx no-retryable (401, 400, 403) fallan inmediatamente con el detalle del error en `data.detalle`.

---

## Funciones clave del frontend (`app/index.html`)

### Proveedores y listas

| Función                    | Qué hace                                                        |
|----------------------------|-----------------------------------------------------------------|
| `init()`                   | Verifica sesión → carga profile → proveedores → listas          |
| `cargarProveedores()`      | SELECT de `proveedores` ordenado por nombre                     |
| `guardarProveedor()`       | INSERT/UPDATE con upload de logo a Storage si hay archivo       |
| `cargarListas()`           | SELECT de `listas_precios` ordenado por fecha                   |
| `procesarArchivo(event)`   | Detecta PDF o imagen y llama al proceso correcto                |
| `procesarImagen(file)`     | Extracción via Sonnet → pipeline etapas 2-5                     |
| `procesarPDF(file)`        | PDF.js extrae texto → detecta columnas → chunks Haiku → pipeline etapas 2-5 |
| `guardarLista()`           | Upsert en `listas_precios` + snapshot + auditoría asíncrona     |
| `todosLosItems()`          | Aplana todas las listas en un array plano. `precio` expuesto = `precio_total` (lo que cuesta 1 envase). `precioRaw` para el original. |
| `renderBuscarProducto()`   | Busca en todas las listas, agrupa por proveedor                 |
| `confirmarPedido()`        | Guarda en `historial_pedidos`                                   |

### Pipeline de normalización

| Función                        | Qué hace                                                       |
|--------------------------------|----------------------------------------------------------------|
| `ejecutarPipelineNormalizacion()` | Orquesta etapas 2-5 después de la extracción              |
| `normalizarConCache()`         | Etapa 2: consulta cache Supabase primero, llama IA solo si falta; aplica sanity check de multipack |
| `llamarNormalizarListaIA()`    | Llamadas en paralelo (vía semáforo) a Haiku para normalizar    |
| `_normBatch()`                 | Un batch de normalización (40 items) con auto-subdivide en truncado |
| `_normBatchConRetry()`         | Wrap con 3 reintentos + backoff                                |
| `agruparPorClaveCanonica()`    | Etapa 3: agrupa por clave (código puro, sin IA)               |
| `detectarModoHeuristico()`     | Heurística estructural: presentación = solo unidad sin número  |
| `decidirModoPorRangos()`       | Auto-deducción usando `RANGOS_PRECIO_AR` (gratis, sin IA)      |
| `llamarDetectarModoIA()`       | Etapa 4: llamadas en paralelo (vía semáforo) a Haiku           |
| `llamarDetectarModoIAConRetry()` | Wrap con 3 reintentos + backoff                              |
| `calcularPrecios()`            | Etapa 5: calcula precio_total y precio_unitario (código puro) |
| `guardarAuditoriaPrecios()`    | Guarda resultados en `pl_auditoria_precios` (asíncrono)       |
| `getCacheNorm()`               | Carga cache desde Supabase + sanea cc/ml/gr viejos             |
| `guardarCacheNorm()`           | Upsert con dedup + chunks de 200 + logging completo            |
| `parsePrecio()`                | Convierte "18.449,65" (AR) o "1,234.56" (US) o "$ 13.996,53" a número |
| `canonizarUnidadBase()`        | Normaliza cc/ml/gr/lts/kilos/unidades a kg/L/u canónicas       |
| `detectarMultipack()`          | Detecta "Pack 200 x 8cc" (multipack real) sin confundir con códigos de producto |
| `recuperarObjetosJsonArray()`  | Parser tolerante: recupera objetos completos de un array JSON truncado |

### Helpers de IA

| Función                         | Qué hace                                                       |
|---------------------------------|----------------------------------------------------------------|
| `_fetchClaude(payload)`         | Wrapper de fetch a `/api/claude` con semáforo de concurrencia (`_CLAUDE_MAX_CONCURRENT=2`) y manejo seguro de respuestas no-JSON (504) |
| `_claudeAcquire/_claudeRelease` | Semáforo cooperativo                                          |
| `_esNoReintentable(err)`        | Devuelve true para 4xx no-429 (no vale la pena reintentar)    |

### Preview y edición manual

| Función                | Qué hace                                                          |
|------------------------|-------------------------------------------------------------------|
| `renderPreview()`      | Muestra cada item con dos botones clickeables (📦 bulto / ⚖️ x kg) mostrando ambas interpretaciones |
| `setModoPreview(idx, modo)` | Setea modo del item, recalcula precio_total y precio_unitario |
| `flipModoPreview(idx)` | Alias backward-compat para flip pack ↔ unitario                  |
| `editarFilaPreview()`  | Editar nombre/unidad/precio del item                              |
| `borrarFilaPreview()`  | Quitar item de la preview                                         |

### Producción

| Función                         | Qué hace                                                     |
|---------------------------------|--------------------------------------------------------------|
| `getRecetas() / setRecetas()`   | Lee/escribe productos en localStorage (`pl_recetas`)         |
| `renderProduccion()`            | Re-renderiza el tab de producción completo                   |
| `renderProdRecetas()`           | Lista de productos con categorías                            |
| `renderProdProducir()`          | Panel de armar pedido a producción                           |
| `confirmarPedidoProduccion()`   | Confirma el pedido y lo manda al historial                   |
| `confirmarVerifProdHist()`      | Avanza estado de verificación (libre→confirmado→bloqueado)   |
| `_buildProdPrintHTML()`         | Genera HTML para imprimir pedido de producción en 2 columnas |
| `diaDelAnio()`                  | Retorna el día juliano (1-365) para el código crítico        |
| `validarCriticoProd(cod)`       | Retorna clase CSS según antigüedad del código crítico        |

---

## Design system (`app/styles.css`)

- **Paleta base**: `--bg: #050507` (midnight) hasta `--bg-elev3: #1d1d28`
- **Fuentes**: Geist (sans), Instrument Serif (display), JetBrains Mono (mono)
- **Acento principal**: `--accent: #3b82f6` (blue)
- **Tri-color**: `--emerald` (Free), `--accent` (Pro), `--gold` (Business)
- **Glass**: `backdrop-filter: blur(20px)` en cards, header, sidebar, modales
- **Fondo atmosférico**: `body::before` — mesh gradient animado; `body::after` — grid overlay sutil
- **Radios**: `--r-sm: 8px` / `--r-md: 12px` / `--r-lg: 18px` / `--r-xl: 28px`

---

## Tabla de rangos típicos (`RANGOS_PRECIO_AR`)

Definida al inicio del pipeline en `app/index.html`. Cubre los productos más comunes en Argentina (2025). Rangos amplios que incluyen precio mayorista (mínimo) y premium (máximo). El algoritmo solo decide modo automáticamente cuando una de las 2 interpretaciones (pack/unitario) queda claramente fuera del rango:

```js
'aceite girasol':   { min: 600,  max: 4000,  unidad: 'L' }
'aceite oliva':     { min: 3000, max: 60000, unidad: 'L' }
'aceto balsamico':  { min: 1000, max: 30000, unidad: 'L' }
'vinagre manzana':  { min: 500,  max: 8000,  unidad: 'L' }
'harina':           { min: 300,  max: 3000,  unidad: 'kg' }
'azucar':           { min: 400,  max: 2500,  unidad: 'kg' }
'arroz':            { min: 700,  max: 5000,  unidad: 'kg' }
...
```

**Cómo extender**: agregar más tipos a la tabla con el rango esperado por unidad base. Si el `tipo` que devuelve la IA matchea el prefijo de una clave (ej "aceite girasol marca X" matchea "aceite girasol"), se usa ese rango.

---

## Notas para futura IA/desarrollador

- **No hay framework**: todo es HTML + JS vanilla. Los "componentes" son funciones que escriben `innerHTML`.
- **Producción es local**: productos, categorías, historial de pedidos de producción y verificaciones viven en `localStorage`. Si el usuario cambia de dispositivo, pierde esos datos.
- **El cache de normalización es global**: `pl_cache_normalizacion` no tiene `user_id`. Todos los usuarios comparten el mismo cache. Si se borra una entrada, la próxima vez se renormaliza y se vuelve a guardar.
- **El cache NO guarda precios**: solo clave canónica, tipo, tamaño, unidad. Los precios están en `listas_precios.items` (privados por usuario via RLS).
- **Si un producto se normalizó mal**: el cache se auto-corrige cuando detecta inconsistencias (ej multipack mal interpretado). Como fallback manual: borrar la fila correspondiente en `pl_cache_normalizacion` por `nombre_key`.
- **Logo upload**: requiere bucket `provider-logos` en Supabase Storage. Si no existe, `subirLogoAStorage()` falla.
- **Cambio de plan**: sin integración de pagos. El admin actualiza `plan` en `profiles` manualmente.
- **`escapeHtml()`** está definida dos veces en el código (deuda técnica, no es bug).
- **Límites de plan**: espejados en JS (`LIMITES_IA`) y en funciones SQL. Si se cambian, actualizar en ambos lados.
- **Modelos IA**: si se cambian, actualizar también los precios en `PRECIOS_HAIKU` y `PRECIOS_SONNET` en `api/claude.js` para que el tracking de costos siga siendo correcto.
- **`expandir_query`**: tipo especial sin cuota ni restricción de plan. Usado para expandir abreviaciones en el buscador.
- **Tiempo de maduración**: números seguidos de "meses/días/años" en nombres de productos son atributos (ej: "24 meses" = maduración), no peso. El prompt de normalización lo tiene explícito.
- **Códigos de producto en nombres**: "Baño Blanco Aguila 9473 x 10 kg" — 9473 es código, no conteo de multipack. `detectarMultipack()` lo distingue de un multipack real ("Pack 200 x 8cc") usando: presencia de palabra de contenedor, tamaño de unidad, y un sanity check de "total > 200" que descarta absurdos.
- **`precio_tipo` en `proveedores`**: columna legacy. Antes se usaba para configurar si el proveedor lista precios por envase o por kg/lt; se removió de la UI porque (a) confundía al usuario, (b) un mismo proveedor puede tener productos en ambos modos, (c) el pipeline ahora detecta modo por item. La columna queda en la DB por compat pero no se lee ni escribe.
- **Rate limits de Anthropic**: el rate limit de Tier 1 son 10K output tokens/minuto. El pipeline está configurado con `_CLAUDE_MAX_CONCURRENT=2` + max_tokens conservativos + retry con backoff en el proxy para mantenerse cómodamente por debajo del límite. Si se cambia el tier, se puede subir la concurrencia.
