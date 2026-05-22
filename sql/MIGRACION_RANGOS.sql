-- ============================================================================
-- MIGRACIÓN: pl_rangos_precio (BRIEF DETECCION FINAL)
-- ============================================================================
-- Correr UNA vez en el SQL Editor de Supabase. Idempotente: se puede correr
-- varias veces sin romper nada.
--
-- Crea la tabla que cachea rangos de orden de magnitud (mediana × factor) por
-- tipo de producto. Compartida entre todos los usuarios. NUNCA contiene precios
-- de listas específicas, solo el orden de magnitud por tipo.
-- ============================================================================

create table if not exists public.pl_rangos_precio (
  tipo_producto text primary key,
  unidad_base text not null,
  mediana_estimada numeric not null,
  factor_min numeric default 0.5,
  factor_max numeric default 2.5,
  origen text default 'web',
  muestras integer default 0,
  confiable boolean default false,
  ultima_actualizacion timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists idx_rangos_origen on public.pl_rangos_precio(origen);

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

-- Verificación rápida (opcional): debería devolver 0 filas la primera vez
select count(*) as filas, 'pl_rangos_precio creada OK' as estado
from public.pl_rangos_precio;
