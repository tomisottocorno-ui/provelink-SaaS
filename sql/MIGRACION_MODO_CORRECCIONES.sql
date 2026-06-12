-- MIGRACION_MODO_CORRECCIONES.sql
-- Crea la tabla pl_modo_correcciones para persistir las correcciones manuales
-- de modo (pack/unitario) que el usuario hace desde la UI (botones 📦/⚖️).
-- También agrega columnas de trazabilidad a pl_auditoria_precios.
--
-- Aplicar en Supabase: SQL Editor > Pegar y ejecutar.

-- ── Tabla de correcciones manuales ───────────────────────────────────────────
create table if not exists public.pl_modo_correcciones (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users(id)        on delete cascade,
  proveedor_id   uuid not null references public.proveedores(id) on delete cascade,
  nombre_key     text not null,      -- normalizarNombreKey(nombre_original)
  clave_canonica text,               -- para debugging / lookup futuro
  modo           text not null check (modo in ('pack', 'unitario')),
  precio_al_corregir numeric,        -- precio en el momento de la corrección
  fecha          timestamptz default now(),
  unique (owner_id, proveedor_id, nombre_key)
);

-- RLS: cada usuario solo ve y edita sus propias correcciones
alter table public.pl_modo_correcciones enable row level security;

create policy "sel_modo_correcciones" on public.pl_modo_correcciones
  for select using (owner_id = get_owner_id());

create policy "ins_modo_correcciones" on public.pl_modo_correcciones
  for insert with check (owner_id = get_owner_id());

create policy "upd_modo_correcciones" on public.pl_modo_correcciones
  for update using (owner_id = get_owner_id());

create policy "del_modo_correcciones" on public.pl_modo_correcciones
  for delete using (owner_id = get_owner_id());

-- ── Columnas de trazabilidad en pl_auditoria_precios ─────────────────────────
alter table public.pl_auditoria_precios
  add column if not exists fuente_decision text,    -- qué paso de la cascada decidió
  add column if not exists corregido       boolean default false; -- el usuario flippeó el modo
