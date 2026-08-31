-- ============================================================================
-- MIGRACIÓN: códigos de prueba de un solo uso
-- ============================================================================
-- Reemplaza el link fijo `?prueba=1` por códigos únicos por negocio. Cada
-- código se puede reclamar una sola vez (columna `usado`) — el reclamo real
-- lo hace api/reclamar-codigo.js con la service_role key, nunca el cliente
-- directo, así que no hace falta una política de UPDATE para `authenticated`.
--
-- Idempotente.
-- ============================================================================

create table if not exists public.codigos_prueba (
  id uuid default gen_random_uuid() primary key,
  codigo text unique not null,
  nota text,
  usado boolean default false not null,
  usado_por uuid references auth.users(id),
  usado_en timestamptz,
  creado_por text not null,
  creado timestamptz default now() not null
);

alter table public.codigos_prueba enable row level security;

-- Solo Luchi y Tomi pueden ver la lista de códigos.
drop policy if exists "Codigos prueba: solo admins ven" on public.codigos_prueba;
create policy "Codigos prueba: solo admins ven"
  on public.codigos_prueba for select
  using (auth.jwt() ->> 'email' in ('luchivega1212@gmail.com', 'tomisottocorno@gmail.com'));

-- Solo Luchi y Tomi pueden generar códigos nuevos.
drop policy if exists "Codigos prueba: solo admins crean" on public.codigos_prueba;
create policy "Codigos prueba: solo admins crean"
  on public.codigos_prueba for insert
  with check (auth.jwt() ->> 'email' in ('luchivega1212@gmail.com', 'tomisottocorno@gmail.com'));

-- A propósito, NO hay política de UPDATE ni DELETE para `authenticated` — el
-- único UPDATE (marcar usado) pasa por el endpoint de servidor, que usa la
-- service_role key y por lo tanto bypassea RLS. Nadie puede marcar un código
-- como usado (o "des-usarlo") desde el cliente, ni siquiera un admin.

-- ============================================================================
-- Verificación (correr después de aplicar, a mano)
-- ============================================================================
-- select column_name from information_schema.columns
--  where table_name = 'codigos_prueba';
-- -- 8 filas
--
-- select policyname from pg_policies where tablename = 'codigos_prueba';
-- -- 2 filas
