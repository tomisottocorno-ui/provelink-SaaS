# ProveLink SaaS

Plataforma de gestión de proveedores y pedidos para comercios.
Multi-tenant, con planes Free / Pro / Business y pagos por Mercado Pago.

## Estructura

```
provelink-saas/
├── public/              # Landing pública (sin login)
│   └── index.html
├── app/                 # Aplicación (requiere login)
│   ├── login.html       # Login + registro
│   ├── index.html       # App principal (multi-tenant)
│   └── planes.html      # Elegir plan / suscripción
├── api/                 # Funciones serverless (Vercel)
│   ├── claude.js        # Proxy a Claude con cuota por usuario
│   ├── mp-crear-suscripcion.js
│   └── mp-webhook.js    # Webhook de Mercado Pago
├── sql/
│   └── schema.sql       # Esquema de Supabase (ejecutar UNA vez)
└── vercel.json
```

## Setup inicial (paso a paso)

### 1. Supabase

1. Crear proyecto nuevo en https://supabase.com
2. Ir a SQL Editor → New query
3. Pegar todo el contenido de `sql/schema.sql` y ejecutar
4. Ir a Settings → API y copiar:
   - `Project URL` (algo como `https://xxxxx.supabase.co`)
   - `anon public` key (la pública, se usa en el frontend)
   - `service_role` key (la secreta, SOLO para el backend)
5. Ir a Authentication → Providers → Email
   - Activar "Enable Email provider"
   - Para empezar fácil: desactivar "Confirm email" (después se prende cuando metamos templates lindos)

### 2. Vercel

1. Crear cuenta en https://vercel.com
2. Importar este repo desde GitHub
3. Settings → Environment Variables, agregar:
   ```
   SUPABASE_URL              = https://xxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY = eyJ... (la secreta)
   ANTHROPIC_API_KEY         = sk-ant-... (la tuya, vos pagás la IA)
   MP_ACCESS_TOKEN           = APP_USR-... (token de MP)
   MP_WEBHOOK_SECRET         = un-string-aleatorio-largo
   ```
4. Deploy

### 3. Mercado Pago

1. Ir a https://www.mercadopago.com.ar/developers/panel
2. Crear una aplicación nueva
3. Copiar el `Access Token` de producción (o de test mientras probamos)
4. Configurar webhook: URL `https://tu-app.vercel.app/api/mp-webhook`

## Planes

| Plan     | Precio  | Proveedores | Consultas IA/mes | Extras |
|----------|---------|-------------|------------------|--------|
| Free     | $0      | 3           | 0                | -      |
| Pro      | ARS 3000/mes (~$7 USD) | Ilimitado | 150 | Backups |
| Business | ARS 8000/mes (~$20 USD) | Ilimitado | 500 | Multi-usuario, reportes |

## Stack

- **Frontend**: HTML + JS plano (sin frameworks)
- **DB + Auth**: Supabase (Postgres + Auth + Row Level Security)
- **Backend serverless**: Vercel Functions (Node.js)
- **IA**: Claude Haiku 4.5 via API (con prompt caching activado)
- **Pagos**: Mercado Pago Suscripciones
- **Hosting**: Vercel (free tier alcanza para empezar)
