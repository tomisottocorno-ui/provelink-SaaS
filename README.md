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
│   ├── index.html          # App principal (requiere login)
│   ├── login.html          # Login + registro
│   ├── styles.css          # Design system completo (paleta midnight, glassmorphism)
│   └── icons.js            # SVG icons inline (Icon.box, Icon.list, Icon.factory, etc.)
├── api/
│   └── claude.js           # Proxy serverless a la API de Anthropic
│                           # Valida JWT, controla cuota por usuario/mes
├── sql/
│   └── schema.sql          # Esquema Supabase + RLS + funciones + Storage policies
├── imagenes/
│   └── logo.png
├── vercel.json             # Rewrites: / → landing, /login → app/login, /app → app/index
└── package.json
```

---

## Routing (vercel.json)

| URL            | Sirve                     |
|----------------|---------------------------|
| `/`            | `landing/index.html`      |
| `/login`       | `app/login.html`          |
| `/login.html`  | `app/login.html`          |
| `/app`         | `app/index.html`          |
| `/app/`        | `app/index.html`          |

---

## Stack

| Capa      | Tecnología                                                  |
|-----------|-------------------------------------------------------------|
| Frontend  | HTML + JS vanilla (sin frameworks)                          |
| Auth + DB | Supabase (Postgres + Auth + RLS + Storage)                  |
| Serverless| Vercel Functions (Node.js) — solo `api/claude.js`           |
| IA        | Claude Haiku 4.5 via API (prompt caching activado)          |
| Hosting   | Vercel (free tier)                                          |

---

## Tablas en Supabase

| Tabla                | Descripción                                            |
|----------------------|--------------------------------------------------------|
| `profiles`           | Extiende `auth.users`: nombre_negocio, plan, cuota IA  |
| `proveedores`        | Nombre, teléfono, `logo_url` (Storage público)         |
| `listas_precios`     | Items JSON `[{productoLista, precio, unidad}]` por proveedor. **1 lista por proveedor**. |
| `snapshots_precios`  | Versiones históricas de listas (antes de cada update)  |
| `historial_pedidos`  | Pedidos confirmados con totales y desglose              |
| `uso_ia`             | Log de cada llamada a Claude (tokens, costo, fecha)    |

**`logo_url`**: se sube a Supabase Storage bucket `provider-logos`, carpeta `{user_id}/{proveedor_id}.ext`.

### localStorage (datos locales del dispositivo)

| Clave            | Contenido                                                        |
|------------------|------------------------------------------------------------------|
| `pl_historial`   | Historial de pedidos confirmados (array JSON)                    |
| `pl_pedido`      | Pedido en construcción (objeto JSON)                             |
| `pl_materias`    | Materias primas de producción (id, nombre, unidadBase, stockActual, stockMinimo) |
| `pl_recetas`     | Recetas de producción (id, nombre, ingredientes[])              |
| `pl_prod_log`    | Log de producciones registradas                                  |

---

## Planes

| Plan     | Precio        | Proveedores | Listas | Consultas IA/mes |
|----------|---------------|-------------|--------|------------------|
| Free     | $0            | 3           | 1      | 0                |
| Pro      | $20 USD/mes   | Ilimitado   | ∞      | 150              |
| Business | $100 USD/mes  | Ilimitado   | ∞      | 500              |

El cambio de plan se gestiona manualmente: el usuario hace click → abre WhatsApp/email → el admin actualiza el campo `plan` en `profiles`.

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
   - `anon public` key → hardcodeada en `app/index.html` y `app/login.html` (línea `var SUPABASE_ANON_KEY = ...`)
4. Authentication → Providers → Email → activar. Desactivar "Confirm email" en dev.

### 2. Supabase — Storage para logos

1. Dashboard → Storage → New Bucket
   - Name: `provider-logos`
   - Public bucket: **activar** (para que las URLs sean públicas)
   - Create bucket
2. SQL Editor → ejecutar las políticas de `sql/schema.sql` (bloque `STORAGE — Logos de proveedores`)

### 3. Vercel — deploy

1. Importar repo desde GitHub en https://vercel.com
2. Settings → Environment Variables → agregar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`
3. Deploy

### 4. Primer usuario admin

Registrarse desde `/login` → Supabase crea automáticamente un registro en `profiles` con `plan = 'free'`.
Para dar plan Pro/Business a alguien: ir a Supabase → Table Editor → `profiles` → editar el campo `plan`.

---

## Tabs del app

| Tab          | Descripción                                                  |
|--------------|--------------------------------------------------------------|
| **Buscar**   | Buscador unificado de productos en todas las listas          |
| **Pedido**   | Armar pedido actual, ver totales por proveedor               |
| **Proveedores** | CRUD de proveedores con logo, teléfono y lista de precios |
| **Historial**| Pedidos confirmados con desglose y totales                   |
| **Producción** | Stock de materias primas, recetas y panel de producir      |

---

## Tab Producción

Módulo local (localStorage) para controlar stock de ingredientes y calcular capacidad productiva. Se compone de 3 sub-tabs:

### Stock
- Alta/edición de **materias primas** (nombre, unidad base, stock actual, stock mínimo)
- Barra visual de stock (verde / amarillo / rojo según umbral mínimo)
- Alertas automáticas cuando alguna materia está por debajo del mínimo

### Recetas
- Definición de **recetas** (producto terminado + lista de ingredientes con cantidad por unidad)
- Unidades soportadas: g, kg, ml, l, latas, u
- Conversión automática al guardar: kg → g, l → ml

### Producir
- Panel que muestra **cuántas unidades podés hacer** de cada receta según el stock disponible
- `calcularMaxProduccion(receta)` = mínimo entre todos los ingredientes de `floor(stock / qty_por_unidad)`
- Botón "Producir N unidades" → descuenta ingredientes del stock y loguea en `pl_prod_log`
- Badge rojo/amarillo si el stock alcanza para 0 o pocas unidades

### Auto-creación desde pedidos
Al confirmar un pedido de proveedor, el sistema:
1. Abre un modal con estado de carga ("🤖 Detectando tipos de productos…")
2. Llama a la IA (`tipo: 'expandir_query'`, sin cuota) para normalizar nombres de productos
   - Ignora marca y presentación: "Harina 0000 Cañuelas 25kg" → "Harina 0000"
   - Diferencia grados: "Harina 000" ≠ "Harina 0000"
   - Unifica marcas: "Hellman's mayonesa" = "Natura mayonesa" → "Mayonesa"
3. Busca match fuzzy en materias primas existentes
   - Match encontrado → pre-selecciona la materia y suma el stock
   - No match → pre-selecciona "+ Crear [tipo IA]" (crea la materia nueva automáticamente al guardar)
4. `inferirUnidadBase()` determina la unidad: kg → g, l → ml, g/ml → igual, resto → u

---

## Funciones clave del frontend (`app/index.html`)

### Proveedores y listas

| Función                   | Qué hace                                                   |
|---------------------------|------------------------------------------------------------|
| `init()`                  | Verifica sesión → carga profile → proveedores → listas     |
| `cargarProveedores()`     | SELECT de `proveedores` ordenado por nombre                |
| `guardarProveedor()`      | INSERT/UPDATE con upload de logo a Storage si hay archivo  |
| `subirLogoAStorage()`     | Sube imagen a bucket `provider-logos/{uid}/{provId}.ext`   |
| `cargarListas()`          | SELECT de `listas_precios` con join a proveedores          |
| `procesarArchivo(event)`  | Detecta si es PDF o imagen y llama al proceso correcto     |
| `procesarImagen(file)`    | Envía imagen a `/api/claude` para extracción de productos  |
| `procesarPDF(file)`       | Extrae texto con PDF.js → detecta columnas → chunks a IA  |
| `parsearPrecioBase()`     | Normaliza precio a $/kg, $/l, $/u para comparar            |
| `todosLosItems()`         | Aplana todas las listas en un array plano para buscar      |
| `renderBuscarProducto()`  | Busca en todas las listas y agrupa resultados por proveedor|
| `confirmarPedido()`       | Guarda en `historial_pedidos` → dispara modal stock        |
| `abrirConfig()`           | Modal de configuración: nombre negocio, teléfono, password |
| `abrirPlanes()`           | Modal con los 3 planes y botones de upgrade (WA/email)     |
| `construirContextoIA()`   | Arma el system prompt con todos los datos del usuario      |

### Producción

| Función                             | Qué hace                                                         |
|-------------------------------------|------------------------------------------------------------------|
| `getMaterias() / setMaterias()`     | Lee/escribe `pl_materias` en localStorage                        |
| `getRecetas() / setRecetas()`       | Lee/escribe `pl_recetas` en localStorage                         |
| `calcularMaxProduccion(receta)`     | Retorna el máximo de unidades producibles con el stock actual    |
| `renderProduccion()`                | Re-renderiza los 3 paneles del tab Producción                    |
| `renderProdAlertas()`               | Muestra chips de alerta si stock < mínimo                        |
| `abrirModalMateria(id, nombre)`     | Abre modal de alta/edición de materia prima                      |
| `abrirModalReceta(id)`              | Abre modal de alta/edición de receta con ingredientes            |
| `agregarIngredienteModal()`         | Agrega una fila de ingrediente en el modal de receta             |
| `normalizarTiposProductoIA(nombres)` | Llama IA para extraer tipo de producto (sin marca/presentación) |
| `buscarMateriaFuzzy(nombre, mats)`  | Match exacto → contains fallback contra lista de materias        |
| `inferirUnidadBase(unidad)`         | Convierte unidad del pedido a unidad base (kg→g, l→ml, etc.)    |
| `ofrecerActualizarStockPedido(items)` | Modal async: IA normaliza → muestra rows con pre-selección    |
| `aplicarStockPedido()`              | Suma stock a materias existentes; crea nuevas para `__nueva__`   |

---

## API: `api/claude.js`

Recibe un POST autenticado con JWT de Supabase.

### Tipos de request

| `tipo`              | Descripción                                           | Cuota  |
|---------------------|-------------------------------------------------------|--------|
| `chat`              | Asistente IA conversacional                           | Sí (pro/business) |
| `procesar_lista`    | Extracción de precios de imagen/PDF                   | No (límite de listas en free) |
| `detectar_columnas` | Detección de columnas en texto de PDF                 | No     |
| `procesar_chunk`    | Procesamiento de fragmento de PDF largo               | No     |
| `expandir_query`    | Normalización de términos de búsqueda / tipos IA      | No (sin restricción de plan) |

Campos del body:
```json
{
  "tipo": "chat | procesar_lista | procesar_chunk | detectar_columnas | expandir_query",
  "messages": [...],
  "system": "...",
  "max_tokens": 800,
  "proveedor_id": "uuid"
}
```

Respuesta: objeto con `content`, `usage`, `stop_reason`, y opcionalmente `cuota`.

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

## Notas para futura IA/desarrollador

- **No hay framework**: todo es HTML + JS vanilla. Los "componentes" son funciones que escriben `innerHTML`.
- **Producción es 100% local**: materias primas, recetas y log de producción viven en `localStorage`. No hay tabla en Supabase. Si el usuario cambia de dispositivo, pierde los datos de producción.
- **El historial de pedidos** está en `localStorage` (clave `pl_historial`), NO en Supabase. Supabase tiene `historial_pedidos` en el schema pero el código aún usa localStorage.
- **Logo upload**: requiere bucket `provider-logos` creado en Supabase Storage. Si el bucket no existe, `subirLogoAStorage()` falla con un error de Storage.
- **Cambio de plan**: no tiene integración de pagos. El usuario hace click → abre WhatsApp con mensaje prellenado al número `5491112345678` (actualizar ese número en `renderPlanesGrid()`).
- **`escapeHtml()`** está definida DOS veces en el código. La segunda sobreescribe a la primera. No es un bug pero sí es deuda técnica.
- **Límites de plan**: espejados en JS (`LIMITES`) y en funciones SQL (`limite_proveedores`, `limite_consultas_ia`). Si se cambian, actualizar en ambos lados.
- **Modelo IA**: `claude-haiku-4-5-20251001`. Si se cambia, actualizar también los precios de costo en `PRECIOS` dentro de `api/claude.js`.
- **`expandir_query`**: tipo especial que no consume cuota y no requiere plan específico. Usado tanto para expandir abreviaciones en el buscador como para normalizar nombres de productos en el flujo de Producción.
