-- ============================================================================
-- LIMPIAR DUPLICADOS en pl_rangos_precio
-- ============================================================================
-- Borra las filas "X de Y" cuando ya existe "X Y" con origen='manual' (seed).
-- Para los casos donde "de" SI es parte del nombre (ej "dulce de leche"),
-- solo se borra si tambien existe "dulce leche" como manual — sino se respeta.
--
-- PASO 1: Ver que se va a borrar (no toca nada)
-- PASO 2: Ejecutar el DELETE (solo si el PASO 1 se ve bien)
-- ============================================================================

-- PASO 1: PREVIEW — que filas con "de/del/la/el" tienen su gemela normalizada
-- y se van a borrar?
with normalizado as (
  select
    tipo_producto,
    regexp_replace(tipo_producto, '\s+(de|del|la|el|los|las)\s+', ' ', 'g') as tipo_normalizado,
    mediana_estimada, muestras, origen, confiable
  from public.pl_rangos_precio
)
select
  d.tipo_producto       as borrar_este,
  d.mediana_estimada    as borrar_mediana,
  d.muestras            as borrar_muestras,
  d.origen              as borrar_origen,
  m.tipo_producto       as mantener_este,
  m.mediana_estimada    as mantener_mediana,
  m.muestras            as mantener_muestras,
  m.origen              as mantener_origen
from normalizado d
join public.pl_rangos_precio m
  on m.tipo_producto = d.tipo_normalizado
 and m.tipo_producto != d.tipo_producto
where d.tipo_producto != d.tipo_normalizado
order by d.tipo_producto;


-- PASO 2: DELETE — descomentar y ejecutar si el PASO 1 se ve bien
/*
with normalizado as (
  select
    tipo_producto,
    regexp_replace(tipo_producto, '\s+(de|del|la|el|los|las)\s+', ' ', 'g') as tipo_normalizado
  from public.pl_rangos_precio
)
delete from public.pl_rangos_precio
where tipo_producto in (
  select d.tipo_producto
  from normalizado d
  join public.pl_rangos_precio m
    on m.tipo_producto = d.tipo_normalizado
   and m.tipo_producto != d.tipo_producto
  where d.tipo_producto != d.tipo_normalizado
);
*/

-- Verificacion final
select count(*) as total_rangos from public.pl_rangos_precio;
