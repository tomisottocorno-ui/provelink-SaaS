-- ============================================================================
-- ProveLink SaaS - Esquema de base de datos (Supabase)
-- ============================================================================
-- Este archivo se ejecuta UNA VEZ en el SQL Editor de Supabase.
-- Crea todas las tablas, políticas de seguridad (RLS) e índices.
--
-- Tabla `auth.users` ya existe en Supabase, no la creamos.
-- ============================================================================


-- ============================================================================
-- TABLA: profiles (extiende auth.users con datos del negocio)
-- ============================================================================
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  nombre_negocio text,                  -- "Panadería La Esquina"
  telefono text,
  plan text default 'free' not null,    -- 'free' | 'pro' | 'business'
  plan_estado text default 'activo',    -- 'activo' | 'pendiente_pago' | 'cancelado'
  plan_vence timestamptz,               -- cuando vence el plan pago actual
  mp_suscripcion_id text,               -- id de suscripción de Mercado Pago
  consultas_ia_mes int default 0,       -- contador del mes en curso
  consultas_ia_reset timestamptz default now(), -- cuando se reseteó el contador
  creado timestamptz default now() not null,
  actualizado timestamptz default now() not null
);

-- Crear profile automáticamente cuando se registra un nuevo usuario
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================================
-- TABLA: proveedores
-- ============================================================================
create table if not exists public.proveedores (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  nombre text not null,
  telefono text,
  logo_url text,
  precio_tipo text default 'envase' check (precio_tipo in ('envase', 'kglt')),
  creado timestamptz default now() not null,
  actualizado timestamptz default now() not null
);

-- Migración: agregar precio_tipo a proveedores existentes
alter table public.proveedores add column if not exists precio_tipo text default 'envase' check (precio_tipo in ('envase', 'kglt'));

create index if not exists idx_proveedores_user on public.proveedores(user_id);


-- ============================================================================
-- TABLA: listas_precios (versión actual de la lista de cada proveedor)
-- ============================================================================
create table if not exists public.listas_precios (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  proveedor_id uuid references public.proveedores(id) on delete cascade not null,
  items jsonb default '[]'::jsonb not null,  -- [{productoLista, precio, ...}]
  fecha_actualizacion timestamptz default now() not null,
  unique (proveedor_id)  -- 1 lista actual por proveedor
);

create index if not exists idx_listas_user on public.listas_precios(user_id);


-- ============================================================================
-- TABLA: snapshots_precios (versiones históricas de listas)
-- ============================================================================
create table if not exists public.snapshots_precios (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  proveedor_id uuid references public.proveedores(id) on delete cascade not null,
  items jsonb default '[]'::jsonb not null,
  fecha timestamptz default now() not null
);

create index if not exists idx_snapshots_user on public.snapshots_precios(user_id);
create index if not exists idx_snapshots_proveedor on public.snapshots_precios(proveedor_id);


-- ============================================================================
-- TABLA: pedido_actual (el pedido que está armando ahora el usuario)
-- ============================================================================
create table if not exists public.pedido_actual (
  user_id uuid references auth.users(id) on delete cascade primary key,
  items jsonb default '{}'::jsonb not null,
  actualizado timestamptz default now() not null
);


-- ============================================================================
-- TABLA: historial_pedidos (pedidos confirmados)
-- ============================================================================
create table if not exists public.historial_pedidos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  fecha timestamptz default now() not null,
  total numeric default 0,
  items jsonb default '[]'::jsonb not null,
  ediciones int default 0,
  verificado boolean default false,
  faltantes jsonb default '[]'::jsonb
);

create index if not exists idx_historial_user on public.historial_pedidos(user_id);
create index if not exists idx_historial_fecha on public.historial_pedidos(user_id, fecha desc);


-- ============================================================================
-- TABLA: uso_ia (log de consultas a la IA, para análisis y debug)
-- ============================================================================
create table if not exists public.uso_ia (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  tipo text not null,                  -- 'chat' | 'procesar_lista'
  input_tokens int default 0,
  output_tokens int default 0,
  cache_read_tokens int default 0,
  cache_creation_tokens int default 0,
  costo_usd numeric(10,6) default 0,
  fecha timestamptz default now() not null
);

create index if not exists idx_uso_ia_user_fecha on public.uso_ia(user_id, fecha desc);


-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- Cada usuario solo ve/edita sus propios datos
-- ============================================================================

-- profiles
alter table public.profiles enable row level security;

drop policy if exists "Profiles: usuarios ven su propio profile" on public.profiles;
create policy "Profiles: usuarios ven su propio profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Profiles: usuarios actualizan su propio profile" on public.profiles;
create policy "Profiles: usuarios actualizan su propio profile"
  on public.profiles for update
  using (auth.uid() = id);

-- proveedores
alter table public.proveedores enable row level security;

drop policy if exists "Proveedores: CRUD propios" on public.proveedores;
create policy "Proveedores: CRUD propios"
  on public.proveedores for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- listas_precios
alter table public.listas_precios enable row level security;

drop policy if exists "Listas: CRUD propias" on public.listas_precios;
create policy "Listas: CRUD propias"
  on public.listas_precios for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- snapshots_precios
alter table public.snapshots_precios enable row level security;

drop policy if exists "Snapshots: CRUD propios" on public.snapshots_precios;
create policy "Snapshots: CRUD propios"
  on public.snapshots_precios for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- pedido_actual
alter table public.pedido_actual enable row level security;

drop policy if exists "Pedido: CRUD propio" on public.pedido_actual;
create policy "Pedido: CRUD propio"
  on public.pedido_actual for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- historial_pedidos
alter table public.historial_pedidos enable row level security;

drop policy if exists "Historial: CRUD propio" on public.historial_pedidos;
create policy "Historial: CRUD propio"
  on public.historial_pedidos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- uso_ia: el usuario solo puede LEER su propio uso (la inserción la hace el backend con service_role)
alter table public.uso_ia enable row level security;

drop policy if exists "Uso IA: usuarios ven su propio uso" on public.uso_ia;
create policy "Uso IA: usuarios ven su propio uso"
  on public.uso_ia for select
  using (auth.uid() = user_id);


-- ============================================================================
-- LÍMITES POR PLAN (función helper para el backend)
-- ============================================================================
create or replace function public.limite_consultas_ia(plan_text text)
returns int
language plpgsql
immutable
as $$
begin
  case plan_text
    when 'free' then return 0;
    when 'pro' then return 150;
    when 'business' then return 500;
    else return 0;
  end case;
end;
$$;

create or replace function public.limite_proveedores(plan_text text)
returns int
language plpgsql
immutable
as $$
begin
  case plan_text
    when 'free' then return 3;
    when 'pro' then return 999;
    when 'business' then return 999;
    else return 3;
  end case;
end;
$$;


-- ============================================================================
-- STORAGE — Logos de proveedores
-- IMPORTANTE: Ejecutar DESPUÉS de crear el bucket en el Dashboard de Supabase.
--
-- Pasos en el Dashboard:
--   1. Storage → New Bucket → nombre: "provider-logos" → Public: ON → Create
--   2. Luego ejecutar las políticas de abajo en el SQL Editor
-- ============================================================================

-- Permitir a usuarios autenticados subir logos a su propia carpeta (user_id/)
drop policy if exists "Provider logos: upload own" on storage.objects;
create policy "Provider logos: upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'provider-logos'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Permitir actualizar (re-upload con upsert)
drop policy if exists "Provider logos: update own" on storage.objects;
create policy "Provider logos: update own"
  on storage.objects for update
  using (
    bucket_id = 'provider-logos'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Permitir borrar logos propios
drop policy if exists "Provider logos: delete own" on storage.objects;
create policy "Provider logos: delete own"
  on storage.objects for delete
  using (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lectura pública (el bucket ya es público, pero la política lo hace explícito)
drop policy if exists "Provider logos: public read" on storage.objects;
create policy "Provider logos: public read"
  on storage.objects for select
  using (bucket_id = 'provider-logos');


-- ============================================================================
-- TABLA: pl_auditoria_precios (registro de cada item procesado por el pipeline)
-- ============================================================================
create table if not exists public.pl_auditoria_precios (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  user_id uuid references auth.users(id) on delete cascade not null,
  proveedor_id text not null,
  lista_id text,
  id_original text,
  nombre_original text,
  clave_canonica text,
  tipo text,
  tamano numeric,
  unidad_base text,
  precio_raw numeric,
  modo_detectado text,
  precio_total_calculado numeric,
  precio_unitario_calculado numeric,
  confianza numeric,
  razonamiento text,
  revisado_por_usuario boolean default false,
  correccion_usuario jsonb,
  fue_error boolean default false
);

create index if not exists idx_auditoria_user on public.pl_auditoria_precios(user_id, created_at desc);
create index if not exists idx_auditoria_clave on public.pl_auditoria_precios(user_id, clave_canonica);

alter table public.pl_auditoria_precios enable row level security;

drop policy if exists "Auditoría: usuarios ven la propia" on public.pl_auditoria_precios;
create policy "Auditoría: usuarios ven la propia"
  on public.pl_auditoria_precios for select
  using (auth.uid() = user_id);

-- La inserción la hace el frontend con anon key (RLS permite insertar datos propios)
drop policy if exists "Auditoría: usuarios insertan la propia" on public.pl_auditoria_precios;
create policy "Auditoría: usuarios insertan la propia"
  on public.pl_auditoria_precios for insert
  with check (auth.uid() = user_id);

drop policy if exists "Auditoría: usuarios actualizan la propia" on public.pl_auditoria_precios;
create policy "Auditoría: usuarios actualizan la propia"
  on public.pl_auditoria_precios for update
  using (auth.uid() = user_id);


-- ============================================================================
-- TABLA: pl_cache_normalizacion (cache global de nombres normalizados)
-- ============================================================================
create table if not exists public.pl_cache_normalizacion (
  nombre_key text primary key,        -- nombre normalizado para búsqueda (minúsculas, sin puntuación)
  clave_canonica text not null,
  tipo text,
  tamano numeric,
  unidad_base text,
  confianza numeric,
  usos integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Sin RLS: el cache es global (compartido entre todos los usuarios).
-- Solo se puede leer y upsert, no eliminar.
alter table public.pl_cache_normalizacion enable row level security;

drop policy if exists "Cache norm: lectura pública autenticada" on public.pl_cache_normalizacion;
create policy "Cache norm: lectura pública autenticada"
  on public.pl_cache_normalizacion for select
  using (auth.role() = 'authenticated');

drop policy if exists "Cache norm: upsert autenticado" on public.pl_cache_normalizacion;
create policy "Cache norm: upsert autenticado"
  on public.pl_cache_normalizacion for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Cache norm: update autenticado" on public.pl_cache_normalizacion;
create policy "Cache norm: update autenticado"
  on public.pl_cache_normalizacion for update
  using (auth.role() = 'authenticated');
