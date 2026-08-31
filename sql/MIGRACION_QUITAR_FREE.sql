-- ============================================================================
-- MIGRACIÓN: eliminar el plan Free — el piso pasa a ser Pro
-- ============================================================================
-- El plan Free se da de baja como concepto de producto. No hay cuentas reales
-- en 'free' al momento de escribir esto (confirmado antes de esta migración),
-- pero el UPDATE de abajo es la red de seguridad por si alguna se coló.
--
-- Idempotente.
-- ============================================================================

alter table public.profiles alter column plan set default 'pro';

update public.profiles set plan = 'pro' where plan = 'free';

create or replace function public.limite_consultas_ia(plan_text text)
returns int
language plpgsql
immutable
as $$
begin
  case plan_text
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
    when 'pro' then return 999;
    when 'business' then return 999;
    else return 2;
  end case;
end;
$$;

create or replace function public.limite_empleados(plan_text text)
returns int
language plpgsql
immutable
as $$
begin
  case plan_text
    when 'pro' then return 2;
    when 'business' then return 10;
    else return 0;
  end case;
end;
$$;

-- ============================================================================
-- Verificación (correr después de aplicar, a mano)
-- ============================================================================
-- select column_default from information_schema.columns
--  where table_name = 'profiles' and column_name = 'plan';
-- -- 'pro'::text
--
-- select count(*) from public.profiles where plan = 'free';
-- -- 0
