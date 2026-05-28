-- ============================================================================
-- SEED FIAMBRERÍA: rangos típicos AR 2026 para fiambres y embutidos
-- ============================================================================

insert into public.pl_rangos_precio
  (tipo_producto, unidad_base, mediana_estimada, factor_min, factor_max, origen, muestras, confiable)
values
  -- Jamones
  ('jamon cocido',      'kg', 9000,  0.3, 4.0, 'manual', 1, true),
  ('jamon crudo',       'kg', 25000, 0.2, 5.0, 'manual', 1, true),
  ('jamon serrano',     'kg', 30000, 0.2, 5.0, 'manual', 1, true),
  ('jamon natural',     'kg', 8000,  0.3, 4.0, 'manual', 1, true),

  -- Embutidos secos
  ('salame',            'kg', 12000, 0.3, 4.0, 'manual', 1, true),
  ('salamin',           'kg', 12000, 0.3, 4.0, 'manual', 1, true),
  ('longaniza',         'kg', 9000,  0.3, 4.0, 'manual', 1, true),

  -- Paletas y otros cocidos
  ('paleta cocida',     'kg', 6500,  0.3, 4.0, 'manual', 1, true),
  ('paleta',            'kg', 6500,  0.3, 4.0, 'manual', 1, true),
  ('mortadela',         'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('bondiola',          'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('pancetta',          'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('panceta',           'kg', 10000, 0.3, 4.0, 'manual', 1, true),
  ('pastron',           'kg', 14000, 0.2, 5.0, 'manual', 1, true),
  ('lomito',            'kg', 30000, 0.2, 5.0, 'manual', 1, true),
  ('lomo',              'kg', 18000, 0.2, 5.0, 'manual', 1, true),

  -- Embutidos frescos
  ('chorizo',           'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('chorizo seco',      'kg', 12000, 0.3, 4.0, 'manual', 1, true),
  ('morcilla',          'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('butifarra',         'kg', 8000,  0.3, 4.0, 'manual', 1, true),

  -- Otros tipicos
  ('matambre',          'kg', 12000, 0.3, 4.0, 'manual', 1, true),
  ('lengua',            'kg', 9000,  0.3, 4.0, 'manual', 1, true),
  ('queso magro',       'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('queso untable',     'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('queso danbo',       'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('queso fresco',      'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('queso roquefort',   'kg', 18000, 0.2, 5.0, 'manual', 1, true),
  ('queso emmental',    'kg', 12000, 0.2, 5.0, 'manual', 1, true),

  -- Aceitunas y conservas
  ('aceituna verde',    'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('aceituna negra',    'kg', 5500,  0.3, 4.0, 'manual', 1, true),
  ('aceituna',          'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('pepino agridulce',  'kg', 4000,  0.3, 4.0, 'manual', 1, true),

  -- Quesos adicionales (suplemento)
  ('queso fundido',     'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('queso barra',       'kg', 7000,  0.3, 4.0, 'manual', 1, true)

on conflict (tipo_producto) do update set
  mediana_estimada = excluded.mediana_estimada,
  factor_min = excluded.factor_min,
  factor_max = excluded.factor_max,
  origen = excluded.origen,
  ultima_actualizacion = now();

select count(*) as total_rangos_fiambreria from public.pl_rangos_precio;
