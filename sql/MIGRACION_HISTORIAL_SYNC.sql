-- ============================================================================
-- MIGRACIÓN: Sincronización de historial entre dispositivos
-- ============================================================================
-- Correr UNA vez en el SQL Editor de Supabase. Idempotente.
--
-- Agrega columnas a historial_pedidos para soportar recepción, cambios y
-- auditoría (quien creó/editó cada pedido). Antes el historial vivía solo en
-- localStorage del navegador → al loguearte en otra compu no veías nada.
-- Ahora se persiste en Supabase y los dispositivos sincronizan.
-- ============================================================================

alter table public.historial_pedidos add column if not exists recepcionado boolean default false;
alter table public.historial_pedidos add column if not exists fecha_recepcion timestamptz;
alter table public.historial_pedidos add column if not exists cambios jsonb default '[]'::jsonb;
alter table public.historial_pedidos add column if not exists creado_por uuid references auth.users(id) on delete set null;
alter table public.historial_pedidos add column if not exists editado_por uuid references auth.users(id) on delete set null;
alter table public.historial_pedidos add column if not exists ultima_edicion timestamptz;
alter table public.historial_pedidos add column if not exists edit_count int default 0;
alter table public.historial_pedidos add column if not exists fecha_str text;       -- "lunes, 28 de mayo de 2026"
alter table public.historial_pedidos add column if not exists timestamp_ms bigint;  -- timestamp original en ms

-- Índice para el query típico: ordenar por timestamp_ms desc
create index if not exists idx_historial_user_ts on public.historial_pedidos(user_id, timestamp_ms desc);

-- Verificación
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'historial_pedidos'
 order by ordinal_position;
