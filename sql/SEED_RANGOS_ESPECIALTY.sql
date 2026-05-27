-- ============================================================================
-- SEED ESPECIALTY: harinas y productos premium con rangos más altos
-- ============================================================================
-- Pega en Supabase SQL Editor y dale Run. Idempotente.
-- ============================================================================

insert into public.pl_rangos_precio
  (tipo_producto, unidad_base, mediana_estimada, factor_min, factor_max, origen, muestras, confiable)
values
  -- Harinas premium (no son harina común)
  ('harina garbanzo',  'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('harina almendra',  'kg', 25000, 0.2, 5.0, 'manual', 1, true),
  ('harina coco',      'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('harina arroz',     'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('harina avena',     'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('harina centeno',   'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('harina cebada',    'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('harina gluten',    'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('harina soja',      'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('harina lino',      'kg', 4500,  0.3, 4.0, 'manual', 1, true),
  ('harina quinoa',    'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('harina mandioca',  'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('harina amaranto',  'kg', 8000,  0.2, 5.0, 'manual', 1, true),

  -- Aceites premium
  ('aceite coco',      'L',  15000, 0.2, 5.0, 'manual', 1, true),
  ('aceite sesamo',    'L',  12000, 0.2, 5.0, 'manual', 1, true),
  ('aceite lino',      'L',  10000, 0.2, 5.0, 'manual', 1, true),

  -- Leches alternativas (premium)
  ('leche almendra',   'L',  3500,  0.3, 4.0, 'manual', 1, true),
  ('leche coco',       'L',  3500,  0.3, 4.0, 'manual', 1, true),
  ('leche soja',       'L',  2500,  0.3, 4.0, 'manual', 1, true),
  ('leche avena',      'L',  3500,  0.3, 4.0, 'manual', 1, true),

  -- Semillas (premium, varía mucho según tipo)
  ('semillas sesamo',  'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('semillas chia',    'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('semillas lino',    'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('semillas girasol', 'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('semillas calabaza','kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('semillas amapola', 'kg', 12000, 0.2, 5.0, 'manual', 1, true),

  -- Frutos secos
  ('fruto seco',       'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('fruta seca',       'kg', 8000,  0.2, 5.0, 'manual', 1, true),

  -- Esencias y aromas (concentrados, varían bastante)
  ('esencia vainilla', 'L',  20000, 0.2, 5.0, 'manual', 1, true),
  ('esencia almendra', 'L',  18000, 0.2, 5.0, 'manual', 1, true),
  ('esencia limon',    'L',  18000, 0.2, 5.0, 'manual', 1, true)

on conflict (tipo_producto) do update set
  unidad_base = excluded.unidad_base,
  mediana_estimada = excluded.mediana_estimada,
  factor_min = excluded.factor_min,
  factor_max = excluded.factor_max,
  origen = excluded.origen,
  ultima_actualizacion = now();

select count(*) as total_rangos from public.pl_rangos_precio;
