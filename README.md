# ProveLink SaaS

Plataforma de gestión de proveedores y pedidos para comercios.
Multi-tenant, con planes Free / Pro / Max y asistente IA integrado.

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
│   └── icons.js            # SVG icons inline (Icon.box, Icon.list, etc.)
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

| Capa      | Tecnología                                          |
|-----------|-----------------------------------------------------|
| Frontend  | HTML + JS vanilla (sin frameworks)                  |
| Auth + DB | Supabase (Postgres + Auth + RLS + Storage)          |
| Serverless| Vercel Functions (Node.js) — solo `api/claude.js`   |
| IA        | Claude Haiku 3.5 via API (prompt caching activado)  |
| Hosting   | Vercel (free tier)                                  |

---

## Tablas en Supabase

| Tabla                | Descripción                                            |
|----------------------|--------------------------------------------------------|
| `profiles`           | Extiende `auth.users`: nombre_negocio, plan, cuota IA  |
| `proveedores`        | Nombre, teléfono, `logo_url` (Storage público)         |
| `listas_precios`     | Items JSON `[{productoLista, precio, unidad}]` por proveedor. **1 lista por proveedor**. |
| `snapshots_precios`  | Versiones históricas de listas (antes de cada update)  |
| `pedido_actual`      | El pedido en construcción del usuario (guardado en localStorage) |
| `historial_pedidos`  | Pedidos confirmados con totales y desglose              |
| `uso_ia`             | Log de cada llamada a Claude (tokens, costo, fecha)    |

**`logo_url`**: se sube a Supabase Storage bucket `provider-logos`, carpeta `{user_id}/{proveedor_id}.ext`.

---

## Planes

| Plan     | Precio        | Proveedores | Consultas IA/mes |
|----------|---------------|-------------|------------------|
| Free     | $0            | 3           | 0                |
| Pro      | $20 USD/mes   | Ilimitado   | 150              |
| Max      | $100 USD/mes  | Ilimitado   | 500              |

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
Para dar plan Pro/Max a alguien: ir a Supabase → Table Editor → `profiles` → editar el campo `plan`.

---

## Funciones clave del frontend (`app/index.html`)

| Función                   | Qué hace                                                   |
|---------------------------|------------------------------------------------------------|
| `init()`                  | Verifica sesión → carga profile → proveedores → listas     |
| `cargarProveedores()`     | SELECT de `proveedores` ordenado por nombre                |
| `guardarProveedor()`      | INSERT/UPDATE con upload de logo a Storage si hay archivo  |
| `subirLogoAStorage(file, provId)` | Sube imagen a bucket `provider-logos/{uid}/{provId}.ext` |
| `cargarListas()`          | SELECT de `listas_precios` con join a proveedores          |
| `procesarArchivo(event)`  | Detecta si es PDF o imagen y llama al proceso correcto     |
| `procesarImagen(file)`    | Envía imagen a `/api/claude` para extracción de productos  |
| `procesarPDF(file)`       | Extrae texto con PDF.js → detecta columnas → chunks a IA  |
| `parsearPrecioBase(precio, unidad, nombre)` | Normaliza precio a $/kg, $/l, $/u para comparar |
| `todosLosItems()`         | Aplana todas las listas en un array plano para buscar      |
| `renderBuscarProducto()`  | Busca en todas las listas y agrupa resultados por proveedor|
| `confirmarPedido()`       | Guarda pedido en `historial_pedidos` (Supabase) y localStorage |
| `abrirConfig()`           | Modal de configuración: nombre negocio, teléfono, password |
| `abrirPlanes()`           | Modal con los 3 planes y botones de upgrade (WA/email)     |
| `construirContextoIA()`   | Arma el system prompt con todos los datos del usuario      |

---

## API: `api/claude.js`

Recibe un POST autenticado con JWT de Supabase. Valida:
1. Token válido
2. Si `tipo === 'chat'`: plan debe ser `pro` o `business`, y no haber superado la cuota mensual
3. Cualquier `tipo` para procesamiento de listas (sin cuota, pero con plan check para pdfs grandes)

Campos del body:
```json
{
  "tipo": "chat" | "procesar_lista" | "procesar_chunk" | "detectar_columnas",
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
- **Tri-color**: `--emerald` (Free), `--accent` (Pro), `--gold` (Max)
- **Glass**: `backdrop-filter: blur(20px)` en cards, header, sidebar, modales
- **Fondo atmosférico**: `body::before` — mesh gradient animado; `body::after` — grid overlay sutil
- **Radios**: `--r-sm: 8px` / `--r-md: 12px` / `--r-lg: 18px` / `--r-xl: 28px`

---

## Notas para futura IA/desarrollador

- **No hay framework**: todo es HTML + JS vanilla. Los "componentes" son funciones que escriben `innerHTML`.
- **El historial de pedidos** está en `localStorage` (clave `pl_historial`), NO en Supabase. Supabase tiene `historial_pedidos` en el schema pero el código aún usa localStorage.
- **Logo upload**: requiere bucket `provider-logos` creado en Supabase Storage. Si el bucket no existe, `subirLogoAStorage()` falla con un error de Storage.
- **Cambio de plan**: no tiene integración de pagos. El usuario hace click → abre WhatsApp con mensaje prellenado al número `5491112345678` (actualizar ese número en `renderPlanesGrid()`).
- **`escapeHtml()`** está definida DOS veces en el código (línea ~1233 y ~1837). La segunda sobreescribe a la primera. No es un bug pero sí es deuda técnica.
- **Límites de plan**: espejados en JS (`LIMITES`) y en funciones SQL (`limite_proveedores`, `limite_consultas_ia`). Si se cambian, actualizar en ambos lados.
