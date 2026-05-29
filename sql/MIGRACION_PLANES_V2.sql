-- ============================================================================
-- MIGRACIÓN: Nuevos planes (Free 2/2, Pro $40k, Max $70k)
-- ============================================================================
-- Correr UNA vez en el SQL Editor de Supabase. Idempotente.
--
-- Cambios:
--   - Free: 2 proveedores máximo, 2 listas/mes (antes: 3 prov, 1 lista total)
--   - Pro: SIN asistente IA (antes: 150 consultas), proveedores y listas ilimitados
--   - Max (business): conserva 500 consultas IA, ilimitado todo lo demás
--   - Nueva tabla: contador de listas procesadas por mes
--   - Nueva columna: mp_preapproval_id para suscripciones Mercado Pago
-- ============================================================================

-- 1) Actualizar funciones de límites
create or replace function public.limite_consultas_ia(plan_text text)
returns int
language plpgsql
immutable
as $$
begin
  case plan_text
    when 'free' then return 0;
    when 'pro' then return 0;        -- Pro NO tiene IA
    when 'business' then return 500; -- Max: 500/mes
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
    when 'free' then return 2;
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
    when 'free' then return 2;
    when 'pro' then return 999;
    when 'business' then return 999;
    else return 2;
  end case;
end;
$$;

-- 2) Columnas nuevas en profiles
alter table public.profiles add column if not exists listas_procesadas_mes int default 0;
alter table public.profiles add column if not exists listas_procesadas_reset timestamptz default now();
alter table public.profiles add column if not exists mp_preapproval_id text;

-- 3) Verificación (opcional)
select
  public.limite_consultas_ia('free')   as free_ia,
  public.limite_consultas_ia('pro')    as pro_ia,
  public.limite_consultas_ia('business') as max_ia,
  public.limite_proveedores('free')    as free_prov,
  public.limite_listas_mes('free')     as free_listas;
