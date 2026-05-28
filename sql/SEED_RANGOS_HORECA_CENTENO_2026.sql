-- ============================================================================
-- SEED HORECA + CENTENO — correcciones y agregados (mayo 2026)
-- ============================================================================
-- Fuentes (listas reales con precios POR UNIDAD del tamaño nombrado):
--   • EL CRIOLLO / DISTRIBUIDORA HORECA  (lista 11, mayo 2026)
--   • CENTENO MATERIAS PRIMAS            (lista nro 7, 08/05/26)
--
-- REGLA DE ORO: la mediana_estimada = precio POR KG/L del formato BULK
--   (5/10/25kg). factorPackPequenio() del front agranda el máximo para
--   envases chicos, así que la mediana NO debe basarse en latitas/sachets.
--
-- Factores según nivel de precio:
--   < $2.000        → [0.4, 3.0]
--   $2.000–$9.999   → [0.3, 4.0]
--   >= $10.000      → [0.2, 5.0]
--
-- Idempotente: on conflict (tipo_producto) do update.
-- ============================================================================

insert into public.pl_rangos_precio
  (tipo_producto, unidad_base, mediana_estimada, factor_min, factor_max, origen, muestras, confiable)
values

  -- ==========================================================================
  -- (A) CORRECCIONES CRÍTICAS — precio de bulto cargado como precio/kg
  -- ==========================================================================
  -- MIEL: estaba $27.000/kg (error: $23.538 era el balde 5kg, no el kg).
  --   Real: EL CRIOLLO 5kg $24.450/5=$4.890/kg · 1kg $5.700. → $5.500/kg
  ('miel',                     'kg',  5500,  0.3, 4.0, 'manual', 4, true),

  -- ESENCIAS: estaban $12.000/L → flaggeaban vainilla/manteca baratas como anomalía.
  --   Vainilla 2L $1.750/L · Manteca 2L $2.935/L · Limón 1L $2.916/L (MAYANA/CENTENO)
  ('esencia',                  'L',   4000,  0.3, 4.0, 'manual', 4, true),
  ('esencia vainilla',         'L',   2200,  0.3, 4.0, 'manual', 4, true),
  ('esencia manteca',          'L',   2800,  0.3, 4.0, 'manual', 4, true),
  ('esencia limon',            'L',   3000,  0.3, 4.0, 'manual', 4, true),
  ('esencia banana',           'L',   7000,  0.3, 4.0, 'manual', 2, true),
  ('esencia almendra',         'L',   9000,  0.3, 4.0, 'manual', 2, true),
  ('esencia coco',             'L',   9000,  0.3, 4.0, 'manual', 2, true),
  ('esencia anis',             'L',  11000,  0.2, 5.0, 'manual', 2, true),
  ('esencia naranja',          'L',  15000,  0.2, 5.0, 'manual', 2, true),

  -- QUESO CREMA: estaba $28.000/kg. Real: MILKAUT balde 3.6kg $13.170/kg ·
  --   CASANCREM/BLANCREM (queso blanco crema) 4kg $4.665-6.464/kg → split:
  ('queso crema',              'kg', 12000,  0.2, 5.0, 'manual', 3, true),
  ('queso blanco',             'kg',  6500,  0.3, 4.0, 'manual', 3, true),

  -- QUESO AZUL: estaba $18.000/kg. Real CRIOLLO $12.368-13.180/kg.
  ('queso azul',               'kg', 13000,  0.2, 5.0, 'manual', 3, true),
  -- QUESO CREMOSO: estaba $12.000/kg. Real NOALSA/TREGAR $7.350-8.736/kg.
  ('queso cremoso',            'kg',  8000,  0.3, 4.0, 'manual', 3, true),
  -- QUESO PORT SALUT: estaba $9.000. Real NOALSA $7.274-7.425/kg.
  ('queso port salut',         'kg',  7500,  0.3, 4.0, 'manual', 3, true),
  -- QUESO FONTINA: estaba $12.000. Real LA PAULINA $16.547/kg.
  ('queso fontina',            'kg', 15000,  0.2, 5.0, 'manual', 2, true),
  -- QUESO GRUYERE: estaba $18.000. Real $19.768-24.342/kg.
  ('queso gruyere',            'kg', 20000,  0.2, 5.0, 'manual', 2, true),
  -- QUESO REGGIANITO: estaba $12.000. Real $14.361-17.514/kg.
  ('queso reggianito',         'kg', 15000,  0.2, 5.0, 'manual', 2, true),
  -- QUESO PROVOLONE: estaba $11.000. Real $12.150-24.624/kg (provoleta parrillera cara).
  ('queso provolone',          'kg', 17000,  0.2, 5.0, 'manual', 3, true),
  -- MASCARPONE: estaba $15.000. Real $17.026-27.665/kg.
  ('mascarpone',               'kg', 20000,  0.2, 5.0, 'manual', 2, true),
  ('queso mascarpone',         'kg', 20000,  0.2, 5.0, 'manual', 2, true),
  -- QUESO DE CABRA: estaba $18.000. Real barra LA HUERTA $38.592/kg.
  ('queso de cabra',           'kg', 35000,  0.2, 5.0, 'manual', 2, true),

  -- AZÚCAR IMPALPABLE: estaba $5.000. Real MAYANA 5kg $1.530/kg · antihúmeda 5kg $4.655/kg.
  ('azucar impalpable',        'kg',  3000,  0.3, 4.0, 'manual', 3, true),
  -- POROTOS: estaba $2.500. Real bulk 5kg: alubia $1.384 · negros $1.776 · colorados $1.960.
  ('porotos',                  'kg',  1800,  0.4, 3.0, 'manual', 3, true),
  -- LENTEJAS / LENTEJÓN: bulk 5kg $2.242 / $2.524.
  ('lentejas',                 'kg',  2200,  0.3, 4.0, 'manual', 2, true),
  ('lentejon',                 'kg',  2500,  0.3, 4.0, 'manual', 2, true),

  -- PREMEZCLAS: LAMARIS (KEUKEN) daba alto, CRIOLLO (ORLOC/EXQUISITA) da bajo → promedio.
  --   Bizcochuelo: ORLOC 5kg $2.520-3.843/kg vs KEUKEN $11.274 → $5.000
  ('premezcla bizcochuelo',    'kg',  5000,  0.3, 4.0, 'manual', 4, true),
  --   Brownie: EXQUISITA $8.186 vs KEUKEN $15.373 → $11.000
  ('premezcla brownie',        'kg', 11000,  0.2, 5.0, 'manual', 4, true),
  --   Mousse: ORLOC 5kg $16.632 vs KEUKEN $44.787 → $25.000
  ('premezcla mousse',         'kg', 25000,  0.2, 5.0, 'manual', 3, true),
  --   Pan de queso: CALSA 2kg $7.414 vs KEUKEN $17.569 → $12.000
  ('premezcla pan de queso',   'kg', 12000,  0.2, 5.0, 'manual', 3, true),

  -- LOMO AHUMADO: estaba $20.000. Real GRASSETTO/LA OCTAVA $12.770-15.291/kg.
  ('lomo ahumado',             'kg', 14000,  0.2, 5.0, 'manual', 3, true),
  -- COLORANTE: estaba $5.000. Real MAYANA 1L $2.430.
  ('colorante',                'L',   3000,  0.3, 4.0, 'manual', 2, true),
  -- POLVO DE HORNEAR: estaba $4.000. Real MAYANA 2-3kg $4.772 · CALSA 4kg $8.350.
  ('polvo de hornear',         'kg',  5500,  0.3, 4.0, 'manual', 3, true),
  -- EXTRACTO DE MALTA: estaba $5.000. Real MAYANA 5kg $3.092 · CENTENO 6-15kg $3.650-3.963.
  ('extracto de malta',        'kg',  3500,  0.3, 4.0, 'manual', 3, true),
  -- BICARBONATO DE SODIO: estaba $1.500. Real MAYANA 1kg $2.079.
  ('bicarbonato de sodio',     'kg',  2000,  0.3, 4.0, 'manual', 2, true),
  -- DULCE DE MEMBRILLO: estaba $2.500. Real cajón 5kg $2.931 · repostero 10kg $3.715.
  ('dulce de membrillo',       'kg',  3000,  0.3, 4.0, 'manual', 3, true),
  -- PASTA MANÍ: estaba $6.000. Real KING 1-4kg $4.315-5.479.
  ('pasta mani',               'kg',  5000,  0.3, 4.0, 'manual', 3, true),

  -- GALLETITA: estaba $25.000. Real consumer (Chocolinas/Oreo) $7.841-12.631/kg.
  ('galletita',                'kg', 13000,  0.2, 5.0, 'manual', 4, true),
  ('galletita rellena',        'kg', 13000,  0.2, 5.0, 'manual', 3, true),

  -- FIDEOS: estaba $1.500. Real Lucchetti/Matarazzo 500g $2.222-2.652/kg.
  ('fideos',                   'kg',  2500,  0.3, 4.0, 'manual', 3, true),
  ('fideos spaghetti',         'kg',  2500,  0.3, 4.0, 'manual', 3, true),

  -- ACEITE MAÍZ: estaba $4.000. Real ARCOR/LIRA 900cc $4.611-6.095/L.
  ('aceite maiz',              'L',   5000,  0.3, 4.0, 'manual', 2, true),

  -- FROZEN VEG (estaban estimados como fresco, muy bajos):
  ('brocoli congelado',        'kg',  6000,  0.3, 4.0, 'manual', 2, true),
  ('chaucha congelada',        'kg',  5000,  0.3, 4.0, 'manual', 2, true),
  ('espinaca congelada',       'kg',  4000,  0.3, 4.0, 'manual', 2, true),
  ('choclo en grano',          'kg',  3500,  0.3, 4.0, 'manual', 2, true),

  -- CONSERVAS / PESCADOS (estaban bajos):
  ('atun',                     'kg',  9000,  0.3, 4.0, 'manual', 3, true),
  ('atun en aceite',           'kg',  9000,  0.3, 4.0, 'manual', 3, true),
  ('caballa',                  'kg',  8000,  0.3, 4.0, 'manual', 2, true),
  ('caballa en aceite',        'kg',  8000,  0.3, 4.0, 'manual', 2, true),
  ('alcaparras',               'kg', 14000,  0.2, 5.0, 'manual', 3, true),
  ('champinon',                'kg',  5500,  0.3, 4.0, 'manual', 3, true),

  -- FRUTOS SECOS (bulk 1kg, estaban bajos):
  ('avellana',                 'kg', 28000,  0.2, 5.0, 'manual', 3, true),
  ('avellanas',                'kg', 28000,  0.2, 5.0, 'manual', 3, true),
  ('nuez',                     'kg', 20000,  0.2, 5.0, 'manual', 3, true),
  ('nueces',                   'kg', 20000,  0.2, 5.0, 'manual', 3, true),
  ('castana de caju',          'kg', 16000,  0.2, 5.0, 'manual', 3, true),
  ('castanas de caju',         'kg', 16000,  0.2, 5.0, 'manual', 3, true),
  ('pistacho',                 'kg', 45000,  0.2, 5.0, 'manual', 3, true),
  ('pistachos',                'kg', 45000,  0.2, 5.0, 'manual', 3, true),
  ('coco rallado',             'kg',  8000,  0.3, 4.0, 'manual', 3, true),
  ('pasa de uva',              'kg',  6000,  0.3, 4.0, 'manual', 3, true),
  ('granola',                  'kg', 13000,  0.2, 5.0, 'manual', 3, true),
  ('mani',                     'kg',  5000,  0.3, 4.0, 'manual', 3, true),
  ('almendra',                 'kg', 20000,  0.2, 5.0, 'manual', 3, true),
  ('almendras',                'kg', 20000,  0.2, 5.0, 'manual', 3, true),

  -- ESPECIAS (bulk 1kg, ajustes):
  ('nuez moscada',             'kg', 17000,  0.2, 5.0, 'manual', 3, true),
  ('pimienta negra',           'kg', 16000,  0.2, 5.0, 'manual', 3, true),
  ('provenzal',                'kg',  8000,  0.3, 4.0, 'manual', 2, true),

  -- ==========================================================================
  -- (B) QUESOS — tipos nuevos (precio KG real)
  -- ==========================================================================
  ('queso tybo',               'kg', 10000,  0.2, 5.0, 'manual', 3, true),  -- $9.000-10.885
  ('queso brie',               'kg', 17000,  0.2, 5.0, 'manual', 1, true),  -- $16.971
  ('queso camembert',          'kg', 45000,  0.2, 5.0, 'manual', 1, true),  -- 200g $10.608 → $53.040
  ('queso gouda',              'kg', 13000,  0.2, 5.0, 'manual', 1, true),  -- $13.564
  ('queso goya',               'kg', 16000,  0.2, 5.0, 'manual', 1, true),  -- $16.973
  ('queso holanda',            'kg', 14000,  0.2, 5.0, 'manual', 1, true),  -- $14.739
  ('queso sardo',              'kg', 16000,  0.2, 5.0, 'manual', 3, true),  -- $11.700-19.651
  ('queso sbrinz',             'kg', 18000,  0.2, 5.0, 'manual', 1, true),  -- $18.592
  ('provoleta',                'kg', 18000,  0.2, 5.0, 'manual', 3, true),  -- $14.789-29.113
  ('burrata',                  'kg', 32000,  0.2, 5.0, 'manual', 1, true),  -- 250g $8.456 → $33.824
  ('stracciatella',            'kg', 26000,  0.2, 5.0, 'manual', 1, true),  -- 250g $6.838 → $27.353

  -- ==========================================================================
  -- (C) FIAMBRES Y EMBUTIDOS — tipos nuevos (precio KG real)
  -- ==========================================================================
  ('jamon cocido',             'kg', 11000,  0.2, 5.0, 'manual', 5, true),  -- $8.505-23.588, mediana ~$11k
  ('jamon crudo',              'kg', 26000,  0.2, 5.0, 'manual', 5, true),  -- $16.116-42.003
  ('bondiola',                 'kg', 22000,  0.2, 5.0, 'manual', 1, true),  -- $22.500
  ('mortadela',                'kg', 10000,  0.2, 5.0, 'manual', 3, true),  -- bocha $8.094 · pistacho $12.852-14.773
  ('panceta',                  'kg', 17000,  0.2, 5.0, 'manual', 4, true),  -- $10.342-19.683
  ('salame',                   'kg', 16000,  0.2, 5.0, 'manual', 3, true),  -- milan $14.803-16.200 · pepperoni $17.559
  ('salamin',                  'kg', 19000,  0.2, 5.0, 'manual', 2, true),  -- picado fino $18.142-20.711
  ('salchicha',                'kg', 13000,  0.2, 5.0, 'manual', 2, true),  -- ~$13.593
  ('pastron',                  'kg', 21000,  0.2, 5.0, 'manual', 1, true),  -- $21.770
  ('prosciutto',               'kg', 29000,  0.2, 5.0, 'manual', 1, true),  -- $29.500
  ('bresaola',                 'kg', 50000,  0.2, 5.0, 'manual', 1, true),  -- $51.675
  ('lomo',                     'kg', 14000,  0.2, 5.0, 'manual', 3, true),  -- ahumado/horneado $12.770-15.291
  ('cantimpalo',               'kg', 17000,  0.2, 5.0, 'manual', 2, true),  -- $17.066-17.137
  ('candelario',               'kg', 18000,  0.2, 5.0, 'manual', 2, true),  -- $15.754-20.054
  ('longaniza',                'kg', 18000,  0.2, 5.0, 'manual', 1, true),  -- $18.204
  ('sopresatta',               'kg', 27000,  0.2, 5.0, 'manual', 1, true),  -- $26.958
  ('pata de cerdo',            'kg',  7500,  0.3, 4.0, 'manual', 4, true),  -- $6.000-8.797

  -- ==========================================================================
  -- (D) CONGELADOS — tipos nuevos (precio por kg del bulto nombrado)
  -- ==========================================================================
  ('arvejas congeladas',       'kg',  6000,  0.3, 4.0, 'manual', 2, true),  -- 2-2.5kg $5.959-6.284
  ('choclo congelado',         'kg',  5400,  0.3, 4.0, 'manual', 1, true),  -- 2.5kg $5.443
  ('cebolla congelada',        'kg',  4800,  0.3, 4.0, 'manual', 1, true),  -- 1kg $4.864
  ('champignon congelado',     'kg',  8000,  0.3, 4.0, 'manual', 1, true),  -- 1kg $8.360
  ('esparragos',               'kg', 13000,  0.2, 5.0, 'manual', 2, true),  -- 1kg $13.680-14.501
  ('morron congelado',         'kg',  8500,  0.3, 4.0, 'manual', 2, true),  -- 1kg $8.208-9.317
  ('papa congelada',           'kg',  6500,  0.3, 4.0, 'manual', 4, true),  -- McCain 2.5kg $5.334-7.282
  ('arandanos congelados',     'kg',  9700,  0.3, 4.0, 'manual', 1, true),  -- 1kg $9.728
  ('frambuesa congelada',      'kg', 20000,  0.2, 5.0, 'manual', 1, true),  -- 1kg $20.520
  ('frutos rojos',             'kg', 10600,  0.2, 5.0, 'manual', 2, true),  -- 1kg $10.640-11.248
  ('mango congelado',          'kg',  7600,  0.3, 4.0, 'manual', 1, true),  -- 1kg $7.600

  -- ==========================================================================
  -- (E) LEGUMBRES Y CEREALES — tipos nuevos (bulk 5kg)
  -- ==========================================================================
  ('arvejas secas',            'kg',   900,  0.4, 3.0, 'manual', 2, true),  -- 5kg $761-973 (¡distinto de arvejas en lata!)
  ('garbanzos',                'kg',  1300,  0.4, 3.0, 'manual', 3, true),  -- 5kg $1.114 · CENTENO 3kg $1.475
  ('cebada perlada',           'kg',  1700,  0.4, 3.0, 'manual', 1, true),  -- 5kg $1.692
  ('maiz pisado',              'kg',  2000,  0.4, 3.0, 'manual', 2, true),  -- 5kg $2.317 · CENTENO 3kg $1.597
  ('maiz pisingallo',          'kg',   850,  0.4, 3.0, 'manual', 1, true),  -- 5kg $843
  ('quinoa',                   'kg',  8500,  0.3, 4.0, 'manual', 3, true),  -- 1kg $8.056-9.027

  -- ==========================================================================
  -- (F) ESPECIAS Y SEMILLAS — tipos nuevos (bulk 1kg)
  -- ==========================================================================
  ('ajinomoto',                'kg', 14000,  0.2, 5.0, 'manual', 1, true),  -- $14.712
  ('ajo granulado',            'kg',  9000,  0.3, 4.0, 'manual', 1, true),  -- $9.121
  ('cebolla deshidratada',     'kg',  7000,  0.3, 4.0, 'manual', 2, true),  -- escamas/polvo $6.645-8.006
  ('chimichurri',              'kg',  9000,  0.3, 4.0, 'manual', 1, true),  -- $8.986
  ('coriandro',                'kg',  3500,  0.3, 4.0, 'manual', 2, true),  -- $3.468
  ('curry',                    'kg',  6500,  0.3, 4.0, 'manual', 1, true),  -- $6.360
  ('estragon',                 'kg', 15000,  0.2, 5.0, 'manual', 1, true),  -- $15.633
  ('perejil',                  'kg',  8000,  0.3, 4.0, 'manual', 1, true),  -- 400g $3.219 → $8.048
  ('pimienta blanca',          'kg', 20000,  0.2, 5.0, 'manual', 3, true),  -- $14.880-37.269 · CENTENO $24.393
  ('pimienta verde',           'kg', 38000,  0.2, 5.0, 'manual', 1, true),  -- $38.340
  ('semilla de amapola',       'kg', 11000,  0.2, 5.0, 'manual', 3, true),  -- $10.552-13.760
  ('semilla de chia',          'kg',  8500,  0.3, 4.0, 'manual', 2, true),  -- $7.445 · CENTENO $9.628
  ('semilla de lino',          'kg',  3000,  0.3, 4.0, 'manual', 2, true),  -- $2.601-3.802
  ('semilla de zapallo',       'kg', 15000,  0.2, 5.0, 'manual', 2, true),  -- $13.438 · CENTENO $16.800
  ('sesamo',                   'kg',  6000,  0.3, 4.0, 'manual', 3, true),  -- blanco $5.270-7.006
  ('sesamo negro',             'kg',  9000,  0.3, 4.0, 'manual', 2, true),  -- $8.794-10.003
  ('sesamo integral',          'kg',  3000,  0.3, 4.0, 'manual', 2, true),  -- $2.325-4.508

  -- ==========================================================================
  -- (G) ACEITUNAS Y ENCURTIDOS — tipos nuevos
  -- ==========================================================================
  ('aceitunas verdes',         'kg',  8000,  0.3, 4.0, 'manual', 4, true),  -- baldes 2-5kg $6.747-9.082
  ('aceitunas negras',         'kg', 11000,  0.2, 5.0, 'manual', 4, true),  -- $9.450-13.462
  ('aceitunas',                'kg',  9000,  0.3, 4.0, 'manual', 4, true),
  ('cebollitas',               'kg',  6000,  0.3, 4.0, 'manual', 1, true),  -- 3kg $6.045
  ('anchoas',                  'kg', 45000,  0.2, 5.0, 'manual', 2, true),  -- 1kg $45.600 · CENTENO $44.550

  -- ==========================================================================
  -- (H) CONSERVAS — tipos nuevos
  -- ==========================================================================
  ('tomate perita',            'kg',  2000,  0.4, 3.0, 'manual', 3, true),  -- 2.7-3kg $1.527-2.182
  ('pure de tomate',           'kg',  1800,  0.4, 3.0, 'manual', 3, true),  -- tetra 520-1020cc $1.288-2.239
  ('choclo cremoso',           'kg',  2800,  0.3, 4.0, 'manual', 2, true),  -- 340-800g $2.296-3.070
  ('sardinas',                 'kg',  8000,  0.3, 4.0, 'manual', 1, true),  -- 125g $1.863 → $14.908 (pack chico)
  ('dulce de batata',          'kg',  2700,  0.3, 4.0, 'manual', 2, true),  -- cajón 5kg $2.385-2.734

  -- ==========================================================================
  -- (I) VINAGRES Y SALSAS — tipos nuevos
  -- ==========================================================================
  ('vinagre',                  'L',   1300,  0.4, 3.0, 'manual', 3, true),  -- alcohol 5L $857-1.336/L
  ('vinagre de alcohol',       'L',   1200,  0.4, 3.0, 'manual', 3, true),
  ('vinagre de manzana',       'L',   2500,  0.3, 4.0, 'manual', 3, true),  -- $2.151-2.992/L
  ('vinagre de vino',          'L',   1800,  0.4, 3.0, 'manual', 2, true),  -- $1.705-2.186/L
  ('aceto balsamico',          'L',   5000,  0.3, 4.0, 'manual', 3, true),  -- HEI-MEN 5L $1.515 · CASALTA 400cc $6.655
  ('jugo de limon',            'L',   2500,  0.3, 4.0, 'manual', 2, true),  -- MINERVA $4.067 · MONTE ALTO $1.724
  ('salsa demiglace',          'kg', 17000,  0.2, 5.0, 'manual', 2, true),  -- KNORR 1kg $16.679 · SAFRA $18.217
  ('salsa blanca',             'kg', 10000,  0.2, 5.0, 'manual', 1, true),  -- 880g $10.609
  ('caldo',                    'kg', 17000,  0.2, 5.0, 'manual', 4, true),  -- granulado 650-700g $15.264-17.993
  ('pure de papas',            'kg',  9000,  0.3, 4.0, 'manual', 3, true),  -- KNORR/MAGGI 5-20kg $8.250-11.077

  -- ==========================================================================
  -- (J) PANIFICACIÓN / REBOZADORES — tipos nuevos
  -- ==========================================================================
  ('pan rallado',              'kg',  1800,  0.4, 3.0, 'manual', 3, true),  -- MORIXE 5kg $1.470 · PREFERIDO $2.469
  ('rebozador',                'kg',  2500,  0.3, 4.0, 'manual', 3, true),  -- MORIXE $1.470 · KNORR 4kg $4.487
  ('panko',                    'kg',  5500,  0.3, 4.0, 'manual', 2, true),  -- 1kg $5.175-5.835
  ('faina',                    'kg',  3000,  0.3, 4.0, 'manual', 2, true),  -- 5-10kg $2.735-3.482
  ('semolin',                  'kg',  1100,  0.4, 3.0, 'manual', 2, true),  -- 25kg $986-1.050

  -- ==========================================================================
  -- (K) REPOSTERÍA / DULCES — tipos nuevos
  -- ==========================================================================
  ('nutella',                  'kg', 29000,  0.2, 5.0, 'manual', 3, true),  -- 350g-3kg $26.627-31.280
  ('chocolate taza',           'kg', 35000,  0.2, 5.0, 'manual', 2, true),  -- 100-150g $37.753-44.637
  ('flan',                     'kg',  5500,  0.3, 4.0, 'manual', 2, true),  -- ORLOC 1kg $5.040-6.489
  ('gelatina postre',          'kg',  5500,  0.3, 4.0, 'manual', 2, true),  -- ORLOC 1-5kg $5.292
  ('postre',                   'kg',  4000,  0.3, 4.0, 'manual', 2, true),  -- ORLOC 1kg $2.923-5.292
  ('charlotte',                'kg',  5500,  0.3, 4.0, 'manual', 1, true),  -- 900g $5.458
  ('granas',                   'kg',  4500,  0.3, 4.0, 'manual', 2, true),  -- 1kg $3.472-4.724
  ('mermelada frutilla',       'kg',  3500,  0.3, 4.0, 'manual', 2, true),  -- EMETH 5.5kg $2.689 · BC 390g
  ('mermelada frambuesa',      'kg', 11000,  0.2, 5.0, 'manual', 2, true),  -- TAXONERA 5kg $11.432 · EMETH $3.096
  ('mermelada frutos del bosque','kg', 8000,  0.3, 4.0, 'manual', 2, true), -- TAXONERA 5kg $8.129
  ('ciruelas',                 'kg',  9000,  0.3, 4.0, 'manual', 1, true),  -- 5kg $8.977
  ('hongos secos',             'kg', 30000,  0.2, 5.0, 'manual', 1, true),  -- 500g $15.069 → $30.138
  ('mix frutos secos',         'kg', 14000,  0.2, 5.0, 'manual', 2, true),  -- 1kg $13.270-14.847
  ('tomates secos',            'kg', 14500,  0.2, 5.0, 'manual', 1, true),  -- 1kg $14.535
  ('arandanos',                'kg', 12700,  0.2, 5.0, 'manual', 1, true),  -- deshidratado 1kg $12.715

  -- ==========================================================================
  -- (L) INFUSIONES / CAFÉ / JUGOS — tipos nuevos
  -- ==========================================================================
  ('cafe en grano',            'kg', 55000,  0.2, 5.0, 'manual', 3, true),  -- LAVAZZA 1kg $52.800-62.150
  ('cafe molido',              'kg', 40000,  0.2, 5.0, 'manual', 3, true),  -- 200-250g $19.980-75.386
  ('cafe instantaneo',         'kg', 40000,  0.2, 5.0, 'manual', 3, true),  -- NESCAFE 1kg $36.647-46.779
  ('yerba mate',               'kg',  3000,  0.3, 4.0, 'manual', 1, true),  -- 1kg $3.046
  ('jugo',                     'L',   2500,  0.3, 4.0, 'manual', 3, true),  -- CITRIC 3-5L $2.845/L
  ('jugo en polvo',            'u',    320,  0.4, 3.0, 'manual', 2, true),  -- sobres BC/Clight

  -- ==========================================================================
  -- (M) BEBIDAS CON ALCOHOL — tipos nuevos (precio por L → bot 750cc/1L)
  -- ==========================================================================
  ('champagne',                'L',  15000,  0.2, 5.0, 'manual', 2, true),  -- 750cc $6.738-19.071
  ('fernet',                   'L',  20000,  0.2, 5.0, 'manual', 2, true),  -- BRANCA 1L $22.398
  ('gin',                      'L',  20000,  0.2, 5.0, 'manual', 3, true),  -- 750cc-1L $13.065-29.436
  ('whisky',                   'L',  35000,  0.2, 5.0, 'manual', 3, true),  -- 1L $11.498-61.804
  ('aperitivo',                'L',  13000,  0.2, 5.0, 'manual', 3, true),  -- aperol/campari/cynar
  ('vermouth',                 'L',  10000,  0.2, 5.0, 'manual', 3, true),  -- cinzano/martini 1L $9.095-11.981
  ('licor',                    'L',   9500,  0.3, 4.0, 'manual', 2, true)   -- cusenier/tia maria 700cc $6.701-9.772

on conflict (tipo_producto) do update set
  unidad_base       = excluded.unidad_base,
  mediana_estimada  = excluded.mediana_estimada,
  factor_min        = excluded.factor_min,
  factor_max        = excluded.factor_max,
  origen            = excluded.origen,
  muestras          = excluded.muestras,
  confiable         = excluded.confiable,
  ultima_actualizacion = now();

-- Verificación
select count(*) as total_rangos from public.pl_rangos_precio;
