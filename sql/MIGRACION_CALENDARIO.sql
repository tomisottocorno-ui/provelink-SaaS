-- ============================================================================
-- MIGRACIÓN: Calendario mensual de pedidos programados
-- ============================================================================
-- Correr UNA vez en el SQL Editor de Supabase. Idempotente.
--
-- Tabla nueva: pedidos_programados
--   - Un row por DÍA con plan: fecha exacta + items del día.
--   - Si el plan se repite (cada N semanas), todos los días generados
--     comparten el mismo serie_id para poder editar/borrar la serie entera.
--   - Solo disponible para plan Max (validado en frontend).
-- ============================================================================

create table if not exists public.pedidos_programados (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  fecha date not null,                       -- día específico del calendario
  items jsonb default '[]'::jsonb not null,  -- [{itemId, productoLista, qty, precio, proveedor, proveedorId, unidad, subtotal}]
  total numeric default 0,
  notas text,                                -- nota opcional para ese día
  serie_id uuid,                             -- agrupa días que comparten origen (repetición)
  cada_n_semanas int,                        -- 1, 2 o 4 (null si es único)
  serie_hasta date,                          -- fecha límite de la repetición
  ejecutado boolean default false,           -- true cuando el usuario lo convirtió en pedido real
  ejecutado_en timestamptz,
  creado_por uuid references auth.users(id) on delete set null,
  editado_por uuid references auth.users(id) on delete set null,
  creado timestamptz default now() not null,
  actualizado timestamptz default now() not null,
  unique (user_id, fecha)                    -- un solo plan por día por usuario
);

create index if not exists idx_pedidos_prog_user_fecha on public.pedidos_programados(user_id, fecha);
create index if not exists idx_pedidos_prog_serie on public.pedidos_programados(serie_id) where serie_id is not null;

alter table public.pedidos_programados enable row level security;

drop policy if exists "Calendario: CRUD propio" on public.pedidos_programados;
create policy "Calendario: CRUD propio"
  on public.pedidos_programados for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Verificación
select column_name, data_type from information_schema.columns
 where table_schema = 'public' and table_name = 'pedidos_programados'
 order by ordinal_position;
