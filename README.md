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
│   ├── login.html          # Login + registro + recuperación de contraseña
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
| ~~`pedido_actual`~~        | ⚠️ El pedido en construcción se persiste en **localStorage** scoped por `user_id` (`pl_pedido_<id>`), **no** en Supabase. |
| ~~`historial_pedidos`~~    | ⚠️ El historial de pedidos confirmados (+ datos de recepción) se persiste en **localStorage** scoped por `user_id` (`pl_historial_<id>`), **no** en Supabase. |
| `uso_ia`                   | Log de cada llamada a Claude (tokens, costo, tipo, fecha)                   |
| `pl_auditoria_precios`     | Registro de cada item procesado por el pipeline: clave canónica, modo detectado, precio normalizado, confianza, razonamiento |
| `pl_cache_normalizacion`   | Cache **global** (compartido entre todas las cuentas) de nombres normalizados. La segunda vez que cualquier usuario sube el mismo producto, se saltea la llamada a la IA. Solo guarda normalización (clave, tipo, tamaño, unidad), nunca precios. |
| `pl_rangos_precio`         | **Global**, compartido. Rango de precio esperado por tipo de producto. Columnas: `tipo_producto`, `unidad_base` (kg/L/u), `mediana_estimada`, `factor_min`, `factor_max`, `origen` (`manual`/`datos`/`web`), `muestras`, `confiable`. Se usa para (a) decidir pack vs unitario y (b) detectar precios anómalos. **`origen='manual'` = seeds curados → el auto-aprendizaje NO los pisa.** `datos` = aprendido de detecciones reales. `web` = estimado por `web_search`. |

**`logo_url`**: bucket Supabase Storage `provider-logos`, carpeta `{user_id}/{proveedor_id}.ext`.

### Aislamiento entre usuarios

- **Precios de listas, pedidos, historial, auditoría**: privados por usuario (RLS por `auth.uid()`).
- **Cache de normalización**: global, compartido. Solo nombres → claves canónicas. **Nunca contiene precios.**
- **Comparación cross-proveedor para detectar modo**: usa solo las listas del MISMO usuario.

### localStorage (datos locales del dispositivo)

| Clave                       | Contenido                                                    |
|-----------------------------|--------------------------------------------------------------|
| `pl_pedido_<user_id>`       | Pedido en construcción, **scoped por usuario** (cada cuenta ve solo el suyo) |
| `pl_historial_<user_id>`    | Historial de pedidos confirmados + recepción (faltantes/cambios), scoped por usuario |
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
5. Authentication → URL Configuration → **Redirect URLs**: agregar `https://TU-DOMINIO/login.html` (necesario para que el link de recuperación de contraseña funcione — sin esto, "¿Olvidaste tu contraseña?" envía el mail pero el link falla)

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
ETAPA 4: DETECCIÓN MODO → Cascada: heurística → rango dinámico (pl_rangos_precio) → coherencia entre proveedores → rangos hardcoded → web_search (aprende y cachea) → IA
ETAPA 5: CÁLCULO FINAL  → Código calcula precio_total y precio_unitario
+ AUDITORÍA             → Todo se guarda en pl_auditoria_precios
```

**Principio**: la IA clasifica y razona. El código calcula. Nunca al revés.

### Detección de modo (cascada completa)

Para cada producto se intenta decidir si el precio del PDF es por bulto (PACK) o por unidad base (UNITARIO). Se recorre la cascada y se corta en el primer paso que decida:

1. **Heurística estructural** (gratis): solo decide cuando la presentación es unidad pura sin número ("KG", "X LT", "BOT", "UNI") → UNITARIO conf. 0.85.
2. **Rango dinámico** (`pl_rangos_precio`, gratis): para el `tipo` del producto, mira si el precio (interpretado como pack o como unitario) cae en `[mediana×factor_min, mediana×factor_max]`. El máximo se agranda para envases chicos vía `factorPackPequenio()`. Si solo una interpretación es coherente, decide. **Cubre la mayoría de los casos sin IA.**
3. **Coherencia entre proveedores** (gratis): si 2+ proveedores tienen el mismo producto y los precios difieren ≈ por el factor del tamaño, el menor es UNITARIO y el mayor PACK.
4. **Rangos hardcoded** (`RANGOS_PRECIO_AR`, gratis): fallback fijo en el código para ~20 tipos comunes.
5. **Web search** (`buscar_rango_web`, Sonnet + web_search): si el tipo NO tiene rango, busca el precio mayorista típico en la web, **crea el rango y lo cachea en `pl_rangos_precio`** → la próxima subida de ese tipo ya está cubierta. Tiene circuit breaker (se desactiva tras N fallos seguidos) y se bloquea para tipos genéricos de 1 palabra si ya hay manuales más específicos.
6. **IA** (Haiku, paga): lo que quede ambiguo.

Si la IA falla y no hay más reintentos, el item queda con `modo: null` → "para revisar" en la preview, donde el usuario lo flipea con un click.

**Importante — sin rango no se rompe nada:** si un tipo no tiene rango, el producto igual se carga (modo decidido por heurística/coherencia/web/IA). Lo único que se pierde es la red de detección de anomalías (`esOutlier` devuelve `false` sin rango). **Un rango MALO es peor que no tener rango**, porque flaggea productos buenos como anómalos.

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
| `buscar_rango_web`      | Sonnet + web_search | Estima la mediana de precio mayorista de un tipo sin rango. Se cachea en `pl_rangos_precio` (1 vez por tipo, compartido entre usuarios) | No |
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

## Sistema de rangos de precio

Hay **dos** fuentes de rangos, en orden de prioridad:

### 1. `pl_rangos_precio` (Supabase, dinámico) — la fuente principal

Tabla global compartida. Cada fila tiene `mediana_estimada` (precio típico por kg/L/u del formato **bulk**), `factor_min`, `factor_max`, y `origen`. El rango efectivo es:

```
min = mediana × factor_min
max = mediana × factor_max × factorPackPequenio(tamaño)
```

**`factorPackPequenio(tamaño)`** agranda el máximo para envases chicos (que cuestan más por kg/L que el bulto grande):

| Tamaño        | Multiplicador del máximo |
|---------------|--------------------------|
| ≤100 g/mL     | ×4.0   |
| ≤250 g/mL     | ×3.0   |
| ≤500 g/mL     | ×2.5   |
| ≤1 kg/L       | ×1.8   |
| ≤2 kg/L       | ×1.3   |
| >2 kg/L (bulk)| ×1.0   |

Por eso la **mediana siempre se calcula del formato bulk** (5/10/25 kg), nunca de latitas/sachets — el multiplicador ya cubre los chicos.

**Factores proporcionales al precio** (`_factoresPorPrecio()`): productos baratos → rango angosto, caros → ancho. `<$500`: 0.5/2.0 · `<$2.000`: 0.4/3.0 · `<$10.000`: 0.3/4.0 · `≥$10.000`: 0.2/5.0.

#### Orígenes y aprendizaje

- **`manual`**: seeds curados (ver `sql/SEED_*.sql`). **El auto-aprendizaje NUNCA los pisa** (`actualizarRangosConDetecciones` saltea cualquier fila con `origen='manual'`). Para corregirlos: re-correr el SQL.
- **`datos`**: aprendido de detecciones reales. Cada lista procesada actualiza la mediana (suavizado 70% nuevo / 30% viejo) y re-deriva los factores proporcionales.
- **`web`**: estimado por `buscar_rango_web` (Sonnet + web_search) cuando un tipo no tiene rango. Se cachea para no volver a buscarlo.

#### Sembrar / corregir rangos

- Desde la consola del browser: `_seedRango('queso rallado', 'kg', 16000)` o `_seedRangos([['x','kg',100], ...])`.
- Por SQL: ver `sql/SEED_RANGOS_REPOSTERIA.sql`, `SEED_RANGOS_2026_PRECIOS_REALES.sql`, `SEED_RANGOS_HORECA_CENTENO_2026.sql`. Usan `on conflict (tipo_producto) do update` (idempotentes).
- **Regla de oro**: cargar un precio de **bulto** como si fuera por kg rompe el sistema (flaggea productos buenos). La mediana es siempre **por kg/L del bulto grande**.

### 2. `RANGOS_PRECIO_AR` (hardcoded en JS) — fallback legacy

Tabla fija al inicio del pipeline para ~20 tipos comunes. Solo se usa si `pl_rangos_precio` no cubrió el tipo. Match por prefijo del `tipo`.

### Columna `:UNI:` de listas mayoristas

Algunos PDFs (ej. CENTENO) traen una columna de tipo de envase con códigos: `KG`/`LTS` significan **precio por kg/litro**; `BOL`/`CAJ`/`PAQ`/`LAT`/`FCO`/`POT`/`POM`/`BOT` significan **precio por envase**. El prompt de extracción **ignora esa columna para el campo `unidad`** (el tamaño siempre sale del nombre, ej. "X 5 LTS"), y los prompts de normalización/detección la usan como señal de pack vs unitario.

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
- **Rangos de precio (`pl_rangos_precio`)**: es la fuente principal de rangos (ver sección "Sistema de rangos de precio"). **Los `origen='manual'` son intocables por el auto-aprendizaje** — si querés corregir uno corrompido, re-correr el SQL con `origen='manual'` (queda blindado). Un rango con la mediana mal cargada (típico: precio de bulto como si fuera por kg, ej. miel a $27.000/kg cuando es $5.500/kg) flaggea productos buenos como anómalos → **un rango malo es peor que no tener rango**. La mediana siempre se deriva del formato bulk (5/10/25 kg); `factorPackPequenio()` cubre los envases chicos.
- **Datos del usuario en localStorage scoped por `user_id`**: el pedido en construcción y el historial de pedidos (con recepción) viven en `localStorage` con clave `pl_pedido_<user_id>` / `pl_historial_<user_id>` (funciones `getPedidoKey()`/`getHistKey()`). Esto evita que dos cuentas en el mismo navegador vean los pedidos de la otra. **No están en Supabase** — si el usuario cambia de dispositivo, pierde pedidos e historial.
- **Recuperación de contraseña** (`login.html`): `resetPasswordForEmail` con `redirectTo: origin + '/login.html'`. Al volver del mail, `onAuthStateChange` detecta el evento `PASSWORD_RECOVERY` y muestra el form de nueva contraseña (función `hacerCambioContrasenia()` → `updateUser`). Requiere que la URL esté en los Redirect URLs de Supabase (ver Setup paso 1.5).
- **Columna `:UNI:` (tipo de envase)**: códigos como `BOL`/`CAJ`/`PAQ`/`KG`/`LTS` NO son la unidad de tamaño — el tamaño sale del nombre ("X 5 LTS"). Los prompts de extracción/normalización/detección lo manejan explícitamente (ver sección "Sistema de rangos de precio").
- **Recepción de pedidos** (modal en Historial): arranca con todo **destildado**; botones "Seleccionar todos" / "Limpiar todo"; **"Guardar"** = borrador editable, **"Guardar definitivamente"** = bloquea a solo-lectura. Sin límite de ediciones hasta cerrar. Útil cuando el pedido llega en días distintos.
- **Orden del buscador**: los resultados que **empiezan** por la query van arriba; los que la contienen en el medio, abajo (ej. "dulce de leche" muestra primero "dulce de leche repostero", después "salsa de dulce de leche").
