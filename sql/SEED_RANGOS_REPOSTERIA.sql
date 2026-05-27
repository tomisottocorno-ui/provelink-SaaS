-- ============================================================================
-- SEED REPOSTERÍA: rangos típicos AR 2026 — basado en lista real de ingredientes
-- ============================================================================
-- Cubre: glucosa, fondant, premezclas, coberturas, pastas, esencias,
--        frutos secos, frutas, pulpas, licores, syrups, especias, enlatados,
--        quesos, carnes, verduras congeladas, fideos y más.
--
-- Fórmula de factores:
--   precio < $2000:       [0.4x, 3.0x]
--   precio $2000–$10000:  [0.3x, 4.0x]
--   precio >= $10000:     [0.2x, 5.0x]
-- ============================================================================

insert into public.pl_rangos_precio
  (tipo_producto, unidad_base, mediana_estimada, factor_min, factor_max, origen, muestras, confiable)
values

  -- ============================================================
  -- Insumos básicos de repostería
  -- ============================================================
  ('glucosa',                   'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('fondant',                   'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('gelatina sin sabor',        'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('polvo de hornear',          'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('bicarbonato de sodio',      'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('bicarbonato de amonio',     'kg', 2000,  0.3, 4.0, 'manual', 1, true),
  ('extracto de malta',         'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('coco rallado',              'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('almidon de maiz',           'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('fecula de maiz',            'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('caramelo liquido',          'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('leche condensada',          'kg', 4000,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Coberturas y chocolates
  -- ============================================================
  ('cobertura blanca',          'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('cobertura leche',           'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('cobertura semiamarga',      'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('bano reposteria',           'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('bano moldeo',               'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('chocolate rallado',         'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('chips de chocolate',        'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('gotitas chocolate',         'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('cacao con leche',           'kg', 9000,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Premezclas
  -- ============================================================
  ('premezcla brownie',         'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('premezcla cookies',         'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('premezcla muffin',          'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('premezcla torta',           'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('premezcla panettone',       'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('premezcla pan de queso',    'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('premezcla tiramisu',        'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('premezcla bizcochuelo',     'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('premezcla',                 'kg', 3500,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Pastas de repostería / untables
  -- ============================================================
  ('pasta almendra',            'kg', 20000, 0.2, 5.0, 'manual', 1, true),
  ('pasta mani',                'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('pasta avellana',            'kg', 18000, 0.2, 5.0, 'manual', 1, true),
  ('pasta pistacho',            'kg', 30000, 0.2, 5.0, 'manual', 1, true),
  ('pasta maracuya',            'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('pasta frutilla',            'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('pasta mascarpone',          'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('pasta sambayon',            'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('pasta caramelo',            'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('pasta banana',              'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('pasta fruto del bosque',    'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('pasta mango',               'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('pasta untable avellana',    'kg', 18000, 0.2, 5.0, 'manual', 1, true),
  ('pasta untable pistacho',    'kg', 30000, 0.2, 5.0, 'manual', 1, true),
  ('pasta untable tiramisu',    'kg', 12000, 0.2, 5.0, 'manual', 1, true),

  -- ============================================================
  -- Esencias adicionales
  -- ============================================================
  ('esencia azahar',            'L',  12000, 0.2, 5.0, 'manual', 1, true),
  ('esencia banana',            'L',  12000, 0.2, 5.0, 'manual', 1, true),
  ('esencia naranja',           'L',  12000, 0.2, 5.0, 'manual', 1, true),
  ('esencia manteca',           'L',  12000, 0.2, 5.0, 'manual', 1, true),
  ('esencia pan dulce',         'L',  12000, 0.2, 5.0, 'manual', 1, true),
  ('esencia queso',             'L',  12000, 0.2, 5.0, 'manual', 1, true),
  ('esencia',                   'L',  12000, 0.2, 5.0, 'manual', 1, true),

  -- ============================================================
  -- Geles, estabilizantes, aditivos
  -- ============================================================
  ('gel de brillo',             'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('jalea frio',                'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('estabilizante',             'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('propionato de calcio',      'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('aditivo',                   'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('conservante',               'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('colorante',                 'L',  5000,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Frutas y pulpas
  -- ============================================================
  ('pulpa frutilla',            'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('pulpa durazno',             'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('pulpa maracuya',            'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('pulpa mango',               'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('pulpa palta',               'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('pulpa',                     'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('frutilla',                  'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('frutilla congelada',        'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('frambuesa',                 'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('frutos del bosque',         'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('banana',                    'kg', 1200,  0.4, 3.0, 'manual', 1, true),
  ('manzana',                   'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('naranja',                   'kg', 1200,  0.4, 3.0, 'manual', 1, true),
  ('limon',                     'kg', 1200,  0.4, 3.0, 'manual', 1, true),
  ('lima',                      'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('kiwi',                      'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('maracuya',                  'kg', 3000,  0.3, 4.0, 'manual', 1, true),

  -- Frutas en conserva/almibar
  ('durazno almibar',           'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('higo almibar',              'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('pera almibar',              'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('cereza',                    'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('anana almibar',             'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('pasa de uva',               'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('fruta abrillantada',        'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('fruta escurrida',           'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('manzana deshidratada',      'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('chips de banana',           'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('dulce de frambuesa',        'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('dulce de frutilla',         'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('dulce de durazno',          'kg', 3500,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Frutos secos
  -- ============================================================
  ('almendra',                  'kg', 18000, 0.2, 5.0, 'manual', 1, true),
  ('almendras',                 'kg', 18000, 0.2, 5.0, 'manual', 1, true),
  ('avellana',                  'kg', 20000, 0.2, 5.0, 'manual', 1, true),
  ('avellanas',                 'kg', 20000, 0.2, 5.0, 'manual', 1, true),
  ('castana de caju',           'kg', 22000, 0.2, 5.0, 'manual', 1, true),
  ('castanas de caju',          'kg', 22000, 0.2, 5.0, 'manual', 1, true),
  ('mani',                      'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('mani fileteado',            'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('mani crocante',             'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('nuez',                      'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('nueces',                    'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('pistacho',                  'kg', 30000, 0.2, 5.0, 'manual', 1, true),
  ('pistachos',                 'kg', 30000, 0.2, 5.0, 'manual', 1, true),
  ('girasol pelado',            'kg', 3500,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Especias y condimentos
  -- ============================================================
  ('oregano',                   'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('comino',                    'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('comino molido',             'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('pimenton',                  'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('pimienta negra',            'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('pimienta',                  'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('laurel',                    'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('romero',                    'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('albahaca',                  'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('ajo en polvo',              'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('aji molido',                'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('jengibre',                  'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('canela molida',             'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('canela',                    'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('azafran',                   'kg', 200000,0.2, 5.0, 'manual', 1, true),
  ('curcuma',                   'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('nuez moscada',              'kg', 25000, 0.2, 5.0, 'manual', 1, true),
  ('merken',                    'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('provenzal',                 'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('condimento',                'kg', 6000,  0.3, 4.0, 'manual', 1, true),
  ('especia',                   'kg', 8000,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Licores para pastelería
  -- ============================================================
  ('rhum',                      'L',  5000,  0.3, 4.0, 'manual', 1, true),
  ('cognac',                    'L',  6000,  0.3, 4.0, 'manual', 1, true),
  ('marsala',                   'L',  4000,  0.3, 4.0, 'manual', 1, true),
  ('licor oporto',              'L',  4000,  0.3, 4.0, 'manual', 1, true),
  ('triple sec',                'L',  4000,  0.3, 4.0, 'manual', 1, true),
  ('licor',                     'L',  4500,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Syrups y toppings
  -- ============================================================
  ('syrup vainilla',            'L',  5000,  0.3, 4.0, 'manual', 1, true),
  ('syrup caramelo',            'L',  5000,  0.3, 4.0, 'manual', 1, true),
  ('syrup avellana',            'L',  5000,  0.3, 4.0, 'manual', 1, true),
  ('syrup canela',              'L',  5000,  0.3, 4.0, 'manual', 1, true),
  ('syrup menta',               'L',  5000,  0.3, 4.0, 'manual', 1, true),
  ('syrup',                     'L',  5000,  0.3, 4.0, 'manual', 1, true),
  ('topping frutilla',          'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('topping durazno',           'kg', 4500,  0.3, 4.0, 'manual', 1, true),
  ('topping',                   'kg', 4500,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Quesos adicionales
  -- ============================================================
  ('ricota',                    'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('queso cheddar',             'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('queso mar del plata',       'kg', 9000,  0.3, 4.0, 'manual', 1, true),
  ('queso cuartirolo',          'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('queso fontina',             'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('queso gruyere',             'kg', 18000, 0.2, 5.0, 'manual', 1, true),
  ('queso mascarpone',          'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('mascarpone',                'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('queso pategras',            'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('queso port salut',          'kg', 9000,  0.3, 4.0, 'manual', 1, true),
  ('queso provolone',           'kg', 11000, 0.2, 5.0, 'manual', 1, true),
  ('queso rallado',             'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('queso reggianito',          'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('queso de cabra',            'kg', 18000, 0.2, 5.0, 'manual', 1, true),
  ('mozzarella',                'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('muzzarella',                'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('queso azul',                'kg', 18000, 0.2, 5.0, 'manual', 1, true),
  ('queso crema',               'kg', 8000,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Carnes adicionales (no fiambres)
  -- ============================================================
  ('bife de chorizo',           'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('costilla de cerdo',         'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('carre de cerdo',            'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('pechuga de pollo',          'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('suprema',                   'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('pata y muslo',              'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('lechon',                    'kg', 9000,  0.3, 4.0, 'manual', 1, true),
  ('milanesa',                  'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('nalga',                     'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('peceto',                    'kg', 14000, 0.2, 5.0, 'manual', 1, true),
  ('cuadril',                   'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('colita cuadril',            'kg', 15000, 0.2, 5.0, 'manual', 1, true),
  ('asado',                     'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('vacio',                     'kg', 12000, 0.2, 5.0, 'manual', 1, true),
  ('roast beef',                'kg', 14000, 0.2, 5.0, 'manual', 1, true),
  ('pechuga de pavo',           'kg', 10000, 0.2, 5.0, 'manual', 1, true),
  ('ribs',                      'kg', 9000,  0.3, 4.0, 'manual', 1, true),
  ('carne picada',              'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('pollo',                     'kg', 5500,  0.3, 4.0, 'manual', 1, true),
  ('pechito de cerdo',          'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('lomo ahumado',              'kg', 20000, 0.2, 5.0, 'manual', 1, true),

  -- ============================================================
  -- Enlatados y conservas
  -- ============================================================
  ('atun en aceite',            'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('atun',                      'kg', 7000,  0.3, 4.0, 'manual', 1, true),
  ('caballa en aceite',         'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('caballa',                   'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('palmitos',                  'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('alcaparras',                'kg', 8000,  0.3, 4.0, 'manual', 1, true),
  ('pickles',                   'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('morrones en lata',          'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('morron rojo',               'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('extracto de tomate',        'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('tomate triturado',          'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('salsa tomate',              'kg', 2500,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Verduras frescas y congeladas
  -- ============================================================
  ('espinaca',                  'kg', 2000,  0.3, 4.0, 'manual', 1, true),
  ('espinaca congelada',        'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('brocoli congelado',         'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('chaucha congelada',         'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('aros de cebolla',           'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('acelga',                    'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('papa',                      'kg', 1200,  0.4, 3.0, 'manual', 1, true),
  ('zanahoria',                 'kg', 1200,  0.4, 3.0, 'manual', 1, true),
  ('zapallo',                   'kg', 1200,  0.4, 3.0, 'manual', 1, true),
  ('cebolla',                   'kg', 1200,  0.4, 3.0, 'manual', 1, true),
  ('tomate',                    'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('berenjena',                 'kg', 2000,  0.3, 4.0, 'manual', 1, true),
  ('puerro',                    'kg', 2000,  0.3, 4.0, 'manual', 1, true),
  ('zapallito',                 'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('rucula',                    'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('lechuga',                   'kg', 2000,  0.3, 4.0, 'manual', 1, true),
  ('apio',                      'kg', 2000,  0.3, 4.0, 'manual', 1, true),
  ('choclo',                    'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('choclo en grano',           'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('arvejas',                   'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('lentejas',                  'kg', 2000,  0.3, 4.0, 'manual', 1, true),
  ('porotos',                   'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('papa pure escamas',         'kg', 3000,  0.3, 4.0, 'manual', 1, true),
  ('champinon',                 'kg', 5000,  0.3, 4.0, 'manual', 1, true),
  ('morron',                    'kg', 3000,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Fideos, cereales y pastas secas
  -- ============================================================
  ('fideos',                    'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('fideos spaghetti',          'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('fideos penne',              'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('fideos fusilli',            'kg', 1500,  0.4, 3.0, 'manual', 1, true),
  ('polenta',                   'kg', 1200,  0.4, 3.0, 'manual', 1, true),
  ('granola',                   'kg', 4000,  0.3, 4.0, 'manual', 1, true),
  ('trigo burgol',              'kg', 2000,  0.3, 4.0, 'manual', 1, true),
  ('lentejon',                  'kg', 2000,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Condimentos y salsas especiales
  -- ============================================================
  ('salsa de soja',             'L',  2500,  0.3, 4.0, 'manual', 1, true),
  ('salsa golf',                'kg', 3500,  0.3, 4.0, 'manual', 1, true),
  ('mayonesa individual',       'u',  200,   0.4, 3.0, 'manual', 1, true),
  ('mostaza individual',        'u',  200,   0.4, 3.0, 'manual', 1, true),
  ('vinagreta',                 'L',  2000,  0.3, 4.0, 'manual', 1, true),

  -- ============================================================
  -- Huevo
  -- ============================================================
  ('huevo',                     'kg', 2500,  0.3, 4.0, 'manual', 1, true),
  ('huevos',                    'u',  200,   0.4, 3.0, 'manual', 1, true)

on conflict (tipo_producto) do update set
  unidad_base = excluded.unidad_base,
  mediana_estimada = excluded.mediana_estimada,
  factor_min = excluded.factor_min,
  factor_max = excluded.factor_max,
  origen = excluded.origen,
  ultima_actualizacion = now();

select count(*) as total_rangos from public.pl_rangos_precio;
