-- ============================================================================
-- LIMPIAR DUPLICADOS en pl_rangos_precio
-- ============================================================================
-- El problema: conviven "aceite de girasol" y "aceite girasol" como dos filas
-- distintas. Según cómo se normalice el nombre del producto al buscar, la
-- detección puede agarrar la que no corresponde, y si tienen medianas
-- distintas decide mal el modo de precio.
--
-- ── POR QUÉ SE REESCRIBIÓ ───────────────────────────────────────────────────
-- La versión anterior borraba SIEMPRE la fila con conector y conservaba la
-- otra, sin mirar de dónde venía cada una. El comentario decía "cuando ya
-- existe la gemela con origen='manual'", pero el SQL no lo comprobaba.
--
-- Eso es peligroso: hay 49 tipos CURADOS que llevan conector en el nombre
-- —dulce de leche, crema de leche, pechuga de pollo, vinagre de manzana,
-- extracto de tomate...—. Si la app había aprendido sola "dulce leche", el
-- DELETE viejo borraba el valor curado y dejaba el aprendido. Justo al revés.
--
-- ── LAS REGLAS DE AHORA ─────────────────────────────────────────────────────
--   · uno curado y otro aprendido  → se borra el aprendido
--   · los dos curados              → NO se toca (están los dos a propósito:
--                                    "vinagre de vino" y "vinagre vino" son
--                                    dos claves de búsqueda legítimas)
--   · los dos aprendidos           → queda el que tiene más muestras
--
-- PASO 1: mirar qué haría (no toca nada)
-- PASO 2: ejecutar el DELETE, solo si el PASO 1 se ve bien
-- ============================================================================


-- ── PASO 1: PREVIEW ─────────────────────────────────────────────────────────
with pares as (
  select
    d.tipo_producto              as con_conector,
    d.origen                     as origen_con,
    d.mediana_estimada           as mediana_con,
    coalesce(d.muestras, 0)      as muestras_con,
    m.tipo_producto              as sin_conector,
    m.origen                     as origen_sin,
    m.mediana_estimada           as mediana_sin,
    coalesce(m.muestras, 0)      as muestras_sin
  from public.pl_rangos_precio d
  join public.pl_rangos_precio m
    on m.tipo_producto = regexp_replace(
         d.tipo_producto, '\s+(de|del|la|el|los|las)\s+', ' ', 'g')
   and m.tipo_producto <> d.tipo_producto
)
select
  con_conector, origen_con, mediana_con, muestras_con,
  sin_conector, origen_sin, mediana_sin, muestras_sin,
  case
    when origen_con = 'manual' and origen_sin = 'manual'
      then 'NO TOCAR — los dos son curados'
    when origen_con = 'manual' and origen_sin <> 'manual'
      then 'borrar "' || sin_conector || '" (aprendido)'
    when origen_sin = 'manual' and origen_con <> 'manual'
      then 'borrar "' || con_conector || '" (aprendido)'
    when muestras_con >= muestras_sin
      then 'borrar "' || sin_conector || '" (menos muestras)'
    else 'borrar "' || con_conector || '" (menos muestras)'
  end as que_haria,
  case when mediana_con > 0 and mediana_sin > 0
       then round(greatest(mediana_con, mediana_sin) /
                  least(mediana_con, mediana_sin), 1)
  end as cuanto_se_diferencian
from pares
order by cuanto_se_diferencian desc nulls last, con_conector;


-- ── PASO 2: DELETE ──────────────────────────────────────────────────────────
-- Descomentar y correr SOLO si el PASO 1 se ve bien.
/*
with pares as (
  select
    d.tipo_producto         as a, d.origen as oa, coalesce(d.muestras, 0) as ma,
    m.tipo_producto         as b, m.origen as ob, coalesce(m.muestras, 0) as mb
  from public.pl_rangos_precio d
  join public.pl_rangos_precio m
    on m.tipo_producto = regexp_replace(
         d.tipo_producto, '\s+(de|del|la|el|los|las)\s+', ' ', 'g')
   and m.tipo_producto <> d.tipo_producto
),
a_borrar as (
  select case
    when oa = 'manual' and ob = 'manual' then null      -- los dos curados: quietos
    when oa = 'manual' and ob <> 'manual' then b
    when ob = 'manual' and oa <> 'manual' then a
    when ma >= mb then b
    else a
  end as tipo_producto
  from pares
)
delete from public.pl_rangos_precio
 where tipo_producto in (
   select tipo_producto from a_borrar where tipo_producto is not null
 );
*/


-- ── Cómo quedó ──────────────────────────────────────────────────────────────
select 'total de rangos' as que, count(*)::text as cuanto
  from public.pl_rangos_precio
union all
select 'curados (manual)', count(*)::text
  from public.pl_rangos_precio where origen = 'manual'
union all
select 'pares duplicados que quedan', count(*)::text
  from public.pl_rangos_precio d
  join public.pl_rangos_precio m
    on m.tipo_producto = regexp_replace(
         d.tipo_producto, '\s+(de|del|la|el|los|las)\s+', ' ', 'g')
   and m.tipo_producto <> d.tipo_producto
order by 1;
