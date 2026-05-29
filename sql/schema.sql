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
alter table public.proveedores add column if not exists cuit text;
alter table public.proveedores add column if not exists email text;

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
  using (
    auth.uid() = id
    OR id = public.get_owner_id(auth.uid())  -- empleados ven el profile del owner
  );

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
    when 'pro' then return 0;        -- Pro NO tiene asistente IA
    when 'business' then return 500; -- Max: 500 consultas/mes
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
    when 'free' then return 2;       -- Free: 2 proveedores máximo
    when 'pro' then return 999;
    when 'business' then return 999;
    else return 2;
  end case;
end;
$$;

create or replace function public.limite_listas_mes(plan_text text)
returns int
language plpgsql
immutable
as $$
begin
  case plan_text
    when 'free' then return 2;       -- Free: 2 procesamientos de lista por mes
    when 'pro' then return 999;
    when 'business' then return 999;
    else return 2;
  end case;
end;
$$;

-- Contador de listas procesadas en el mes (reset a los 30 días)
alter table public.profiles add column if not exists listas_procesadas_mes int default 0;
alter table public.profiles add column if not exists listas_procesadas_reset timestamptz default now();

-- ID de preapproval de Mercado Pago (suscripción recurrente)
alter table public.profiles add column if not exists mp_preapproval_id text;


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


-- ============================================================================
-- TABLA: pl_rangos_precio (rangos de orden de magnitud para detectar bulto/unitario)
-- ============================================================================
-- Cachea rangos de precio por tipo de producto (sin tamaño). El rango se
-- expresa como mediana × factor_min/max, de modo que escala con la inflación.
-- Es compartida globalmente entre todos los usuarios (como pl_cache_normalizacion).
-- NUNCA contiene precios de listas específicas, solo el orden de magnitud por tipo.
--
-- Defensas implementadas (ver BRIEF DETECCION FINAL):
--   1. Rango provisional hasta muestras >= 3 (confiable = false)
--   2. Outliers rechazados antes de actualizar (> 5x o < 0.2x la mediana)
--   3. Se usa mediana (no promedio), datos manuales pesan el doble
--   4. Una corrección de usuario recalcula el rango (recuperación)
-- ============================================================================
create table if not exists public.pl_rangos_precio (
  tipo_producto text primary key,        -- clave SIN tamaño: "harina 0000", "aceite girasol"
  unidad_base text not null,             -- 'kg' | 'L' | 'u'
  mediana_estimada numeric not null,     -- precio por unidad base, en pesos argentinos
  factor_min numeric default 0.5,        -- multiplicador para el piso del rango
  factor_max numeric default 2.5,        -- multiplicador para el techo del rango
  origen text default 'web',             -- 'web' (estimado inicial) | 'datos' (afinado con listas reales)
  muestras integer default 0,            -- cuántos precios reales contribuyeron a la mediana
  confiable boolean default false,       -- true cuando muestras >= 3
  ultima_actualizacion timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_rangos_origen on public.pl_rangos_precio(origen);

-- Compartido entre todos los usuarios (como pl_cache_normalizacion)
alter table public.pl_rangos_precio enable row level security;

drop policy if exists "Rangos: lectura pública autenticada" on public.pl_rangos_precio;
create policy "Rangos: lectura pública autenticada"
  on public.pl_rangos_precio for select
  using (auth.role() = 'authenticated');

drop policy if exists "Rangos: upsert autenticado" on public.pl_rangos_precio;
create policy "Rangos: upsert autenticado"
  on public.pl_rangos_precio for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "Rangos: update autenticado" on public.pl_rangos_precio;
create policy "Rangos: update autenticado"
  on public.pl_rangos_precio for update
  using (auth.role() = 'authenticated');


-- ============================================================================
-- SISTEMA DE EMPLEADOS (sub-usuarios bajo una cuenta principal)
-- ============================================================================
-- Un "owner" (cuenta principal con plan pago) puede crear empleados que tienen
-- su propio login (email + password Supabase Auth), pero acceden a los DATOS
-- del owner (proveedores, listas, pedidos, etc.) con permisos granulares.
--
-- Límites por plan: Free=0, Pro=2, Business=10
-- ============================================================================

create table if not exists public.empleados (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  empleado_id uuid references auth.users(id) on delete cascade not null unique,
  nombre text not null,
  email text not null,
  -- Permisos posibles: 'proveedores','listas','pedido','historial','verificar','ia','produccion'
  permisos text[] not null default '{}',
  activo boolean default true not null,
  creado timestamptz default now() not null,
  unique (owner_id, email)
);

create index if not exists idx_empleados_owner on public.empleados(owner_id);
create index if not exists idx_empleados_empleado on public.empleados(empleado_id);


-- Helper: dado un user_id, devuelve el owner_id (= sí mismo si no es empleado).
-- Esta función se usa en todas las políticas RLS para resolver "qué cuenta es la dueña de los datos".
create or replace function public.get_owner_id(uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select owner_id from public.empleados where empleado_id = uid and activo = true limit 1),
    uid
  );
$$;


-- Límite de empleados según plan
create or replace function public.limite_empleados(plan_text text)
returns int
language plpgsql
immutable
as $$
begin
  case plan_text
    when 'free' then return 0;
    when 'pro' then return 2;
    when 'business' then return 10;
    else return 0;
  end case;
end;
$$;


-- RLS para tabla empleados
alter table public.empleados enable row level security;

-- Owner puede CRUD sobre sus propios empleados
drop policy if exists "Empleados: owner CRUD" on public.empleados;
create policy "Empleados: owner CRUD"
  on public.empleados for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

-- Empleado puede leer su propia fila (para saber quién es su owner y sus permisos)
drop policy if exists "Empleados: read own" on public.empleados;
create policy "Empleados: read own"
  on public.empleados for select
  using (auth.uid() = empleado_id);


-- ============================================================================
-- ACTUALIZAR RLS DE TABLAS EXISTENTES: que empleados accedan a datos del owner
-- ============================================================================
-- Lógica: cada política antes decía `auth.uid() = user_id`. Ahora decimos
-- `user_id = get_owner_id(auth.uid())`:
--   - Si auth.uid() es owner: get_owner_id devuelve auth.uid() → user_id = auth.uid()
--   - Si auth.uid() es empleado: get_owner_id devuelve el owner_id → user_id = owner_id
-- Esto cubre ambos casos sin tocar el código del frontend (que sigue usando owner_id en las queries).

-- proveedores
drop policy if exists "Proveedores: CRUD propios" on public.proveedores;
create policy "Proveedores: CRUD propios"
  on public.proveedores for all
  using (user_id = public.get_owner_id(auth.uid()))
  with check (user_id = public.get_owner_id(auth.uid()));

-- listas_precios
drop policy if exists "Listas: CRUD propias" on public.listas_precios;
create policy "Listas: CRUD propias"
  on public.listas_precios for all
  using (user_id = public.get_owner_id(auth.uid()))
  with check (user_id = public.get_owner_id(auth.uid()));

-- snapshots_precios
drop policy if exists "Snapshots: CRUD propios" on public.snapshots_precios;
create policy "Snapshots: CRUD propios"
  on public.snapshots_precios for all
  using (user_id = public.get_owner_id(auth.uid()))
  with check (user_id = public.get_owner_id(auth.uid()));

-- pedido_actual
drop policy if exists "Pedido: CRUD propio" on public.pedido_actual;
create policy "Pedido: CRUD propio"
  on public.pedido_actual for all
  using (user_id = public.get_owner_id(auth.uid()))
  with check (user_id = public.get_owner_id(auth.uid()));

-- historial_pedidos
drop policy if exists "Historial: CRUD propio" on public.historial_pedidos;
create policy "Historial: CRUD propio"
  on public.historial_pedidos for all
  using (user_id = public.get_owner_id(auth.uid()))
  with check (user_id = public.get_owner_id(auth.uid()));

-- uso_ia: el empleado VE el log del owner; las inserciones las hace el backend con service_role
drop policy if exists "Uso IA: usuarios ven su propio uso" on public.uso_ia;
create policy "Uso IA: usuarios ven su propio uso"
  on public.uso_ia for select
  using (user_id = public.get_owner_id(auth.uid()));

-- pl_auditoria_precios
drop policy if exists "Auditoría: usuarios ven la propia" on public.pl_auditoria_precios;
create policy "Auditoría: usuarios ven la propia"
  on public.pl_auditoria_precios for select
  using (user_id = public.get_owner_id(auth.uid()));

drop policy if exists "Auditoría: usuarios insertan la propia" on public.pl_auditoria_precios;
create policy "Auditoría: usuarios insertan la propia"
  on public.pl_auditoria_precios for insert
  with check (user_id = public.get_owner_id(auth.uid()));

drop policy if exists "Auditoría: usuarios actualizan la propia" on public.pl_auditoria_precios;
create policy "Auditoría: usuarios actualizan la propia"
  on public.pl_auditoria_precios for update
  using (user_id = public.get_owner_id(auth.uid()));


-- ============================================================================
-- STORAGE: provider-logos - permitir a empleados acceder a la carpeta del owner
-- ============================================================================
-- Las políticas viejas usaban `(storage.foldername(name))[1] = auth.uid()::text`.
-- Ahora usamos get_owner_id para que el empleado vea/edite logos en la carpeta del owner.

drop policy if exists "Provider logos: upload own" on storage.objects;
create policy "Provider logos: upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'provider-logos'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.get_owner_id(auth.uid())::text
  );

drop policy if exists "Provider logos: update own" on storage.objects;
create policy "Provider logos: update own"
  on storage.objects for update
  using (
    bucket_id = 'provider-logos'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = public.get_owner_id(auth.uid())::text
  );

drop policy if exists "Provider logos: delete own" on storage.objects;
create policy "Provider logos: delete own"
  on storage.objects for delete
  using (
    bucket_id = 'provider-logos'
    AND (storage.foldername(name))[1] = public.get_owner_id(auth.uid())::text
  );
-- La política "Provider logos: public read" sigue igual (bucket público).
