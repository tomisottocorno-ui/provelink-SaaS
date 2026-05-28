-- ============================================================================
-- SEED INICIAL: pl_rangos_precio
-- ============================================================================
-- Sembrado manual con precios típicos AR (2026, mayoristas).
-- Pega esto entero en el SQL Editor de Supabase y dale Run.
-- Idempotente: cada upsert sobrescribe si ya existe el tipo_producto.
--
-- Fórmula de factores proporcionales al precio:
--   precio < $500:        factores [0.5x, 2.0x]   range 4x   (productos estables)
--   precio < $2000:       factores [0.4x, 3.0x]   range 7.5x
--   precio < $10000:      factores [0.3x, 4.0x]   range 13x
--   precio >= $10000:     factores [0.2x, 5.0x]   range 25x  (premium variable)
--
-- Si querés agregar más, copia una línea, cambiá tipo+unidad+mediana, y los
-- factores los calculás siguiendo la tabla de arriba.
-- ============================================================================

insert into public.pl_rangos_precio
  (tipo_producto, unidad_base, mediana_estimada, factor_min, factor_max, origen, muestras, confiable)
values
  -- Aceites
  ('aceite girasol',         'L',  1500,  0.4, 3.0, 'manual', 1, true),
  ('aceite mezcla',          'L',  1400,  0.4, 3.0, 'manual', 1, true),
  ('aceite maiz',            'L',  2200,  0.3, 4.0, 'manual', 1, true),
  ('aceite oliva',           'L',  8000,  0.3, 4.0, 'manual', 1, true),

  -- Vinagres y acetos
  ('vinagre alcohol',        'L',  500,   0.4, 3.0, 'manual', 1, true),
  ('vinagre manzana',        'L',  1200,  0.4, 3.0, 'manual', 1, true),
  ('vinagre vino',           'L',  900,   0.4, 3.0, 'manual', 1, true),
  ('aceto',                  'L',  2500,  0.3, 4.0, 'manual', 1, true),
  ('aceto balsamico',        'L',  3000,  0.3, 4.0, 'manual', 1, true),

  -- Harinas y cereales
  ('harina',                 'kg', 700,   0.4, 3.0, 'manual', 1, true),
  ('harina 000',             'kg', 700,   0.4, 3.0, 'manual', 1, true),
  ('harina 0000',            'kg', 800,   0.4, 3.0, 'manual', 1, true),
  ('harina integral',        'kg', 1000,  0.4, 3.0, 'manual', 1, true),
  ('harina maiz',            'kg', 900,   0.4, 3.0, 'manual', 1, true),
  ('semola',                 'kg', 1200,  0.4, 3.0, 'manual', 1, true),
  ('avena',                  'kg', 1500,  0.4, 3.0, 'manual', 1, true),

  -- Arroz
  ('arroz',                  'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('arroz largo fino',       'kg', 1300,  0.4, 3.0, 'manual', 1, true),
  ('arroz doble carolina',   'kg', 1600,  0.4, 3.0, 'manual', 1, true),
  ('arroz yamani',           'kg', 2500,  0.3, 4.0, 'manual', 1, true),

  -- Azúcar y endulzantes
  ('azucar',                 'kg', 900,   0.4, 3.0, 'manual', 1, true),
  ('azucar impalpable',      'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('azucar rubia',           'kg', 1100,  0.4, 3.0, 'manual', 1, true),
  ('azucar negra',           'kg', 1300,  0.4, 3.0, 'manual', 1, true),
  ('miel',                   'kg', 4500,  0.3, 4.0, 'manual', 1, true),

  -- Sal y especias
  ('sal',                    'kg', 250,   0.5, 2.0, 'manual', 1, true),
  ('sal fina',               'kg', 300,   0.5, 2.0, 'manual', 1, true),
  ('sal gruesa',             'kg', 250,   0.5, 2.0, 'manual', 1, true),

  -- Insumos panadería/repostería
  ('levadura fresca',        'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('levadura seca',          'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('cacao',                  'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('cacao amargo',           'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('chocolate',              'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('cobertura chocolate',    'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('cobertura amarga',       'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('dulce de leche',         'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('dulce de batata',        'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('dulce de membrillo',     'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('mermelada',              'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('crema chantilly',        'L',  3500,  0.3, 4.0, 'manual', 1, true),
  ('margarina',              'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('manteca',                'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('grasa',                  'kg', 2500,  0.3, 4.0, 'manual', 1, true),

  -- Lácteos
  ('leche',                  'L',  1200,  0.4, 3.0, 'manual', 1, true),
  ('leche en polvo',         'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('crema de leche',         'L',  3500,  0.3, 4.0, 'manual', 1, true),
  ('queso cremoso',          'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('queso parmesano',        'kg', 12000, 0.2, 5.0, 'manual', 1, true),

  -- Aderezos
  ('mayonesa',               'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('mostaza',                'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('ketchup',                'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('salsa de tomate',        'kg', 1800,  0.4, 3.0, 'manual', 1, true),
  ('pure de tomate',         'kg', 1500,  0.4, 3.0, 'manual', 1, true),

  -- Bebidas
  ('agua',                   'L',  500,   0.4, 3.0, 'manual', 1, true),
  ('agua mineral',           'L',  500,   0.4, 3.0, 'manual', 1, true),
  ('gaseosa',                'L',  1500,  0.4, 3.0, 'manual', 1, true),
  ('jugo',                   'L',  1500,  0.4, 3.0, 'manual', 1, true),
  ('cerveza',                'L',  2500,  0.3, 4.0, 'manual', 1, true),
  ('vino',                   'L',  5000,  0.3, 4.0, 'manual', 1, true)

on conflict (tipo_producto) do update set
  unidad_base = excluded.unidad_base,
  mediana_estimada = excluded.mediana_estimada,
  factor_min = excluded.factor_min,
  factor_max = excluded.factor_max,
  origen = excluded.origen,
  muestras = excluded.muestras,
  confiable = excluded.confiable,
  ultima_actualizacion = now();

-- Verificación: cuántos rangos quedaron
select count(*) as total_rangos, 'OK' as estado from public.pl_rangos_precio;
