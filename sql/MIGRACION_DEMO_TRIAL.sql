-- ============================================================================
-- MIGRACIÓN: prueba de 15 días + bloqueo al vencer + recorrido guiado
-- ============================================================================
-- `plan_estado` ya existe en `profiles` y NO tiene check constraint (es un
-- `text` con un comentario documentando los valores esperados) — así que
-- sumarle 'prueba' y 'vencido' no necesita ningún ALTER sobre esa columna,
-- solo hay que empezar a escribirlos y a leerlos.
--
-- Idempotente.
-- ============================================================================

-- 1) Si ya vio el recorrido guiado, para no repetírselo solo.
alter table public.profiles add column if not exists recorrido_visto boolean not null default false;


-- 2) Bloqueo de escritura para cuentas con la prueba vencida.
--
-- SECURITY DEFINER porque el trigger tiene que poder leer `plan_estado` del
-- DUEÑO de la fila (profiles.id = new.user_id), y ese dueño puede ser distinto
-- de quien está autenticado ahora mismo (un empleado inserta con el user_id
-- del owner). La RLS de `profiles` ("los usuarios ven su propio profile") le
-- taparía la lectura a la sesión del empleado si no fuera security definer.
create or replace function public.bloquear_si_prueba_vencida()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  select plan_estado into v_estado from public.profiles where id = new.user_id;
  if v_estado = 'vencido' then
    raise exception 'Tu prueba terminó. Elegí un plan para seguir cargando.';
  end if;
  return new;
end;
$$;

-- `proveedores`: solo INSERT. Editar uno que ya existe (cambiarle el teléfono,
-- por ejemplo) no es "crear valor nuevo", no hace falta bloquearlo.
drop trigger if exists trg_bloquear_proveedor_vencido on public.proveedores;
create trigger trg_bloquear_proveedor_vencido
  before insert on public.proveedores
  for each row execute function public.bloquear_si_prueba_vencida();

-- `listas_precios`: INSERT *y* UPDATE. Tiene `unique(proveedor_id)` — una sola
-- fila por proveedor — así que recargar la lista de un proveedor que ya tiene
-- una (el caso más común, "subí la lista actualizada del mes") es un UPDATE,
-- no un INSERT. Si el trigger solo mirara INSERT, dejaría pasar justo la
-- acción que más importa bloquear.
drop trigger if exists trg_bloquear_lista_vencida on public.listas_precios;
create trigger trg_bloquear_lista_vencida
  before insert or update on public.listas_precios
  for each row execute function public.bloquear_si_prueba_vencida();


-- ============================================================================
-- Verificación (correr después de aplicar, a mano)
-- ============================================================================
-- select column_name from information_schema.columns
--  where table_name = 'profiles' and column_name = 'recorrido_visto';
-- -- 1 fila
--
-- select tgname from pg_trigger
--  where tgname in ('trg_bloquear_proveedor_vencido', 'trg_bloquear_lista_vencida');
-- -- 2 filas
