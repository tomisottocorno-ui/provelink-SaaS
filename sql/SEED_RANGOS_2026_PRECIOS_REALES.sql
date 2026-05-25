-- ============================================================================
-- SEED 2026 — PRECIOS REALES basados en listas de proveedores (mayo 2026)
-- ============================================================================
-- Fuentes:
--   • LAMARIS (Grupo Lamaris, 1era quincena mayo 2026, sin impuestos)
--   • Delite (Lista Delite Neto, mayo 2026)
--   • El Excel de ingredientes del establecimiento
--
-- Cálculo mediana_estimada:
--   precio_distribuidor_sin_iva × 1.21 ≈ precio que paga la panadería/restó
--   (se usa 21% IVA estándar por simplificación, ajustar si el tipo tiene 10.5%)
--
-- IMPORTANTE: este seed PISA los seeds anteriores para los tipos en conflicto.
-- Es idempotente (on conflict do update).
-- ============================================================================

insert into public.pl_rangos_precio
  (tipo_producto, unidad_base, mediana_estimada, factor_min, factor_max, origen, muestras, confiable)
values

  -- ============================================================
  -- LÁCTEOS (fuente: LAMARIS mayo 2026)
  -- ============================================================
  -- Leche entera 12x1L VERONICA: $21.084/12 = $1.757/L sin IVA → ×1.105 (IVA 10.5%) = $1.942/L
  ('leche',                   'L',   2000,  0.4, 3.0, 'manual', 3, true),
  -- Leche en polvo entera MOLFINO 25KG: $187.550/25 = $7.502/kg sin IVA → ×1.105 = $8.290/kg
  ('leche en polvo',          'kg', 8500,   0.3, 4.0, 'manual', 3, true),
  -- Crema de leche 39% VACALIN 10L: $70.070/10 = $7.007/L sin IVA → ×1.21 = $8.478/L
  ('crema de leche',          'L',   8500,  0.3, 4.0, 'manual', 3, true),
  -- Better Crème Chantilly 907g RICH, caja 12: $91.583/12 = $7.632/u → /0.907 = $8.414/kg sin IVA
  ('crema chantilly',         'L',   9000,  0.3, 4.0, 'manual', 3, true),

  -- ============================================================
  -- MANTECA (fuente: LAMARIS mayo 2026)
  -- MANTECA LAPAULINA caja 25KG: $282.150/25 = $11.286/kg sin IVA → ×1.105 = $12.471/kg
  -- ============================================================
  ('manteca',                 'kg', 13000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- QUESOS (fuente: LAMARIS mayo 2026, precio por kg)
  -- ============================================================
  -- Mozzarella cilindro 3KG VACALIN: $9.466/kg sin IVA → ×1.21 = $11.454/kg
  -- Mozzarella barra 3.5KG LAPAULINA: $8.976/kg sin IVA → ×1.21 = $10.861/kg
  ('mozzarella',              'kg', 11000,  0.2, 5.0, 'manual', 3, true),
  ('muzzarella',              'kg', 11000,  0.2, 5.0, 'manual', 3, true),
  -- Parmesano LAPAULINA: $17.204/kg sin IVA → ×1.21 = $20.817/kg
  ('queso parmesano',         'kg', 21000,  0.2, 5.0, 'manual', 3, true),
  -- Queso rallado LAPAULINA: $62.434/kg sin IVA → ×1.21 = $75.545/kg (premium añejo)
  ('queso rallado',           'kg', 60000,  0.2, 5.0, 'manual', 3, true),
  -- Queso pategras barra 3.5KG LAPAULINA: $10.494/kg sin IVA → ×1.21 = $12.698/kg
  ('queso pategras',          'kg', 13000,  0.2, 5.0, 'manual', 3, true),
  -- Queso danbo barra 3.8KG LAPAULINA: $9.069/kg sin IVA → ×1.21 = $10.974/kg
  ('queso danbo',             'kg', 11000,  0.2, 5.0, 'manual', 3, true),
  ('queso barra',             'kg', 11000,  0.2, 5.0, 'manual', 3, true),
  -- Queso crema LAPAULINA: $24.145/kg sin IVA → ×1.21 = $29.215/kg (al kg en bolsa)
  ('queso crema',             'kg', 28000,  0.2, 5.0, 'manual', 3, true),
  ('queso cremoso',           'kg', 12000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- AZÚCAR Y ENDULZANTES (fuente: LAMARIS + Delite mayo 2026)
  -- ============================================================
  -- Azúcar impalpable KEUKEN: $6.710/kg sin IVA → ×1.105 = $7.414/kg
  -- Azúcar impalpable genérica (bulk 10kg): ~$2.000-3.000/kg con IVA
  ('azucar impalpable',       'kg',  5000,  0.3, 4.0, 'manual', 3, true),
  -- Azúcar negra LODISER 10KG: $14.300/10 = $1.430/kg sin IVA → ×1.105 = $1.580/kg
  ('azucar negra',            'kg',  2000,  0.4, 3.0, 'manual', 3, true),
  ('azucar rubia',            'kg',  2000,  0.4, 3.0, 'manual', 3, true),
  -- Azúcar blanca estándar: estimada ~$1.200-1.800/kg
  ('azucar',                  'kg',  1500,  0.4, 3.0, 'manual', 3, true),
  -- Miel INDUSTRIAL 5KG DON CARLOS: $23.538/kg sin IVA → ×1.105 = $26.010/kg
  ('miel',                    'kg', 27000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- SAL (fuente: LAMARIS mayo 2026, 25kg)
  -- Sal fina 25KG SANCLAS: $18.817/25 = $752/kg sin IVA → ×1.105 = $831/kg
  -- Sal gruesa 25KG: $16.947/25 = $677/kg sin IVA → ×1.105 = $748/kg
  -- ============================================================
  ('sal',                     'kg',   900,  0.5, 2.0, 'manual', 3, true),
  ('sal fina',                'kg',   900,  0.5, 2.0, 'manual', 3, true),
  ('sal gruesa',              'kg',   800,  0.5, 2.0, 'manual', 3, true),

  -- ============================================================
  -- ALMIDONES Y FÉCULA (fuente: LAMARIS mayo 2026)
  -- Almidón de maíz BUFFALO 25KG: $28.517/25 = $1.140/kg sin IVA → ×1.105 = $1.260/kg
  -- ============================================================
  ('almidon de maiz',         'kg',  1400,  0.4, 3.0, 'manual', 3, true),
  ('fecula de maiz',          'kg',  1400,  0.4, 3.0, 'manual', 3, true),

  -- ============================================================
  -- DULCES Y CONSERVAS (fuente: LAMARIS mayo 2026)
  -- ============================================================
  -- ============================================================
  -- DULCE DE LECHE — por variedad (CRÍTICO: alfajorero es 8x más caro)
  -- ============================================================
  -- Dulce de leche repostero VACALIN balde 10KG: $43.890/10 = $4.389/kg sin IVA → ×1.105 = $4.850/kg
  ('dulce de leche',               'kg',  5000,  0.3, 4.0, 'manual', 3, true),
  ('dulce de leche repostero',     'kg',  5000,  0.3, 4.0, 'manual', 3, true),
  -- ALFAJORERO / COPITOS: consistencia más dura para relleno de alfajores.
  -- Precio REAL: DULCE ALFAJORERO ALYSER x10KG = $39.468/kg (confimado lista proveedor)
  -- Son MUCHO más caros que el dulce de leche común — NO confundir.
  ('dulce alfajorero',             'kg', 40000,  0.2, 5.0, 'manual', 5, true),
  ('dulce de leche alfajorero',    'kg', 40000,  0.2, 5.0, 'manual', 5, true),
  -- Mermelada relleno alfajorero (ej: arándanos TAXONERA x10KG = $57.755/kg)
  ('mermelada alfajorero',         'kg', 55000,  0.2, 5.0, 'manual', 5, true),
  ('relleno alfajorero',           'kg', 45000,  0.2, 5.0, 'manual', 5, true),

  -- Mermelada membrillo DEWEY 10KG: $20.350/10 = $2.035/kg sin IVA → ×1.105 = $2.249/kg
  ('mermelada',               'kg',  2500,  0.3, 4.0, 'manual', 3, true),
  ('dulce de membrillo',      'kg',  2500,  0.3, 4.0, 'manual', 3, true),

  -- ============================================================
  -- TOMATE Y CONSERVAS (fuente: LAMARIS mayo 2026)
  -- Tomate triturado TERRAMARE 8KG lata: $9.900/8 = $1.237/kg sin IVA → ×1.105 = $1.367/kg
  -- Morrones 750g x12 TERRAMARE: $38.500/9kg total = $4.278/kg sin IVA → ×1.105 = $4.727/kg
  -- ============================================================
  ('tomate triturado',        'kg',  1500,  0.4, 3.0, 'manual', 3, true),
  ('salsa de tomate',         'kg',  1800,  0.4, 3.0, 'manual', 3, true),
  ('extracto de tomate',      'kg',  4000,  0.3, 4.0, 'manual', 3, true),
  ('morrones en lata',        'kg',  5000,  0.3, 4.0, 'manual', 3, true),

  -- ============================================================
  -- ADEREZOS (fuente: LAMARIS mayo 2026)
  -- ============================================================
  -- Mayonesa FANACOA 2.75KG bolsa: $9.900/2.75 = $3.600/kg sin IVA → ×1.21 = $4.356/kg
  ('mayonesa',                'kg',  4500,  0.3, 4.0, 'manual', 3, true),
  -- Ketchup HELLMANN'S sachet: $13.838/kg sin IVA → ×1.21 = $16.744/kg
  ('ketchup',                 'kg', 17000,  0.2, 5.0, 'manual', 3, true),
  -- Mostaza SAVORA sachet: $10.051/kg sin IVA → ×1.21 = $12.162/kg
  ('mostaza',                 'kg', 12000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- CACAO Y CHOCOLATES (fuente: LAMARIS mayo 2026)
  -- ============================================================
  -- Cacao amargo soluble BARRY 25KG: $298.737/25 = $11.949/kg sin IVA → ×1.21 = $14.458/kg
  -- Cacao BLEND ALPINO 15KG: $248.700/15 = $16.580/kg sin IVA → ×1.21 = $20.062/kg
  ('cacao amargo',            'kg', 15000,  0.2, 5.0, 'manual', 3, true),
  ('cacao',                   'kg', 15000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- COBERTURAS Y BAÑOS (fuente: LAMARIS mayo 2026)
  -- ============================================================
  -- Cobertura semiamarga TRONADOR 20KG bolsa: $338.800/20 = $16.940/kg sin IVA → ×1.21 = $20.497/kg
  -- Cobertura blanca TRONADOR 20KG bolsa: $296.450/20 = $14.823/kg sin IVA → ×1.21 = $17.935/kg
  ('cobertura semiamarga',    'kg', 21000,  0.2, 5.0, 'manual', 3, true),
  ('cobertura amarga',        'kg', 21000,  0.2, 5.0, 'manual', 3, true),
  ('cobertura blanca',        'kg', 18000,  0.2, 5.0, 'manual', 3, true),
  ('cobertura leche',         'kg', 19000,  0.2, 5.0, 'manual', 3, true),
  ('cobertura chocolate',     'kg', 20000,  0.2, 5.0, 'manual', 3, true),
  -- Baño repostería semiamargo ALPINO 20KG: $164.318/20 = $8.216/kg sin IVA → ×1.21 = $9.941/kg
  -- Baño repostería leche/blanco ALPINO 20KG: $133.826/20 = $6.691/kg sin IVA → ×1.21 = $8.096/kg
  ('bano reposteria',         'kg',  9000,  0.3, 4.0, 'manual', 3, true),
  -- Baño moldeo (envase pequeño, más caro): ~$50.000/kg aprox
  ('bano moldeo',             'kg', 30000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- CHIPS DE CHOCOLATE (fuente: LAMARIS mayo 2026)
  -- MINICHIP 5M semiamargo ALPINO 20KG: $121.121/20 = $6.056/kg sin IVA → ×1.21 = $7.328/kg
  -- CHIP 2M semiamargo ALPINO 20KG: $121.121/20 = $6.056/kg sin IVA → ×1.21 = $7.328/kg
  -- Chip blanco: $121.121/20 = $6.056/kg (estimado similar) → $7.328/kg con IVA
  -- ============================================================
  ('chips de chocolate',      'kg',  8000,  0.3, 4.0, 'manual', 3, true),
  ('gotitas chocolate',       'kg',  8000,  0.3, 4.0, 'manual', 3, true),

  -- ============================================================
  -- JALEA Y GEL BRILLO (fuente: LAMARIS mayo 2026)
  -- Jalea fantasía brillo especial LODISER 13KG balde: $28.050/13 = $2.157/kg → ×1.21 = $2.610/kg
  -- Jalea en frío LODISER: $14.190/kg sin IVA → ×1.21 = $17.170/kg
  -- Jalea en caliente PRINDAL 10KG: $15.444/10 = $1.544/kg → ×1.21 = $1.869/kg (bulk)
  -- ============================================================
  ('jalea frio',              'kg', 18000,  0.2, 5.0, 'manual', 3, true),
  ('gel de brillo',           'kg',  3000,  0.3, 4.0, 'manual', 3, true),
  ('jalea',                   'kg',  3000,  0.3, 4.0, 'manual', 3, true),

  -- ============================================================
  -- PREMEZCLAS (fuente: LAMARIS mayo 2026, precio/kg sin IVA)
  -- ============================================================
  -- Premezcla pan de queso KEUKEN: $14.520/kg sin IVA → ×1.21 = $17.569/kg
  ('premezcla pan de queso',  'kg', 18000,  0.2, 5.0, 'manual', 3, true),
  -- Mix Cake Chocolate KEUKEN: $15.267/kg sin IVA → ×1.21 = $18.473/kg
  ('premezcla torta',         'kg', 15000,  0.2, 5.0, 'manual', 3, true),
  -- Mix Cake Vainilla KEUKEN: $9.317/kg sin IVA → ×1.21 = $11.274/kg
  ('premezcla bizcochuelo',   'kg', 11000,  0.2, 5.0, 'manual', 3, true),
  -- Mix Brownie KEUKEN: $12.705/kg sin IVA → ×1.21 = $15.373/kg
  ('premezcla brownie',       'kg', 15500,  0.2, 5.0, 'manual', 3, true),
  -- Mousse de Chocolate KEUKEN: $37.014/kg sin IVA → ×1.21 = $44.787/kg
  ('premezcla mousse',        'kg', 45000,  0.2, 5.0, 'manual', 3, true),
  ('premezcla muffin',        'kg', 14000,  0.2, 5.0, 'manual', 3, true),
  ('premezcla cookies',       'kg', 15000,  0.2, 5.0, 'manual', 3, true),
  ('premezcla',               'kg', 14000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- VARIEGATOS / PASTAS HELADERÍA-REPOSTERÍA (fuente: LAMARIS mayo 2026)
  -- Variegato frutilla/frutos del bosque KEUKEN 5KG: $47.643/5 = $9.528/kg sin IVA → ×1.21 = $11.529/kg
  -- Variegato maracuyá/frutos rojos KEUKEN 5KG: $47.643/5 = $9.528/kg sin IVA (precio pack)
  -- Variegato avellanas crunch: $53.361/5 = $10.672/kg sin IVA → ×1.21 = $12.913/kg
  -- ============================================================
  ('variegato frutilla',      'kg', 12000,  0.2, 5.0, 'manual', 3, true),
  ('variegato maracuya',      'kg', 12000,  0.2, 5.0, 'manual', 3, true),
  ('variegato frutos rojos',  'kg', 12000,  0.2, 5.0, 'manual', 3, true),
  ('variegato avellana',      'kg', 14000,  0.2, 5.0, 'manual', 3, true),
  ('variegato',               'kg', 12000,  0.2, 5.0, 'manual', 3, true),
  ('pasta variegato',         'kg', 12000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- GANACHE (fuente: LAMARIS mayo 2026)
  -- Ganache semiamargo/maní ALPINO 2.5KG balde: $19.904/2.5 = $7.962/kg sin IVA → ×1.21 = $9.634/kg
  -- Ganache blanco ALPINO 2.5KG balde: $15.140/2.5 = $6.056/kg → ×1.21 = $7.328/kg
  -- Ganache maní ALPINO 20KG caja: $105.875/20 = $5.294/kg sin IVA → ×1.21 = $6.405/kg
  -- ============================================================
  ('ganache semiamargo',      'kg',  9500,  0.3, 4.0, 'manual', 3, true),
  ('ganache blanco',          'kg',  7500,  0.3, 4.0, 'manual', 3, true),
  ('ganache mani',            'kg',  7500,  0.3, 4.0, 'manual', 3, true),
  ('ganache',                 'kg',  9000,  0.3, 4.0, 'manual', 3, true),

  -- ============================================================
  -- GALLETITAS (fuente: LAMARIS + estimación mercado mayo 2026)
  -- ============================================================
  -- IMPORTANTE: el usuario reportó que el sistema estimaba $500/paquete para chocolinas
  -- lo cual es INCORRECTO. Precios reales 2026 Argentina:
  --   • MICRO GALLETITA CHOC-LECHE LODISER (gourmet/repostería): $101.447/kg sin IVA
  --   • Galletitas consumer tipo chocolinas/oreo: ~$15.000-40.000/kg dependiendo del tipo
  --   • 1 paquete 200g Chocolinas ≈ $4.000-8.000 → $20.000-40.000/kg
  --   • 1 paquete 100g galletita agua ≈ $2.000-4.000 → $20.000-40.000/kg
  --
  -- Median: $25.000/kg para galletitas consumer en 2026
  -- Specialty/repostería: $80.000-120.000/kg
  -- ============================================================
  ('galletita',               'kg', 25000,  0.2, 5.0, 'manual', 3, true),
  ('galletita chocolate',     'kg', 30000,  0.2, 5.0, 'manual', 3, true),
  ('galletita dulce',         'kg', 25000,  0.2, 5.0, 'manual', 3, true),
  ('galletita agua',          'kg', 20000,  0.2, 5.0, 'manual', 3, true),
  ('galletita maria',         'kg', 20000,  0.2, 5.0, 'manual', 3, true),
  ('galletita oblea',         'kg', 28000,  0.2, 5.0, 'manual', 3, true),
  ('galletita rellena',       'kg', 30000,  0.2, 5.0, 'manual', 3, true),
  ('micro galletita',         'kg', 90000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- GALLETAS / COOKIES / BIZCOCHOS
  -- ============================================================
  ('oreo',                    'u',  6000,   0.3, 4.0, 'manual', 3, true),
  ('chocolinas',              'u',  5000,   0.3, 4.0, 'manual', 3, true),

  -- ============================================================
  -- LEVADURA (fuente: LAMARIS, estimación)
  -- LAMARIS: estuche 10kg $3.623 = $362/kg bulk sin IVA.
  -- Para compra en cantidades menores (500g-2kg): ~$1.500-4.000/kg.
  -- mediana conservadora: $2.500/kg fresca, $12.000/kg seca.
  -- ============================================================
  ('levadura',                'kg',  2500,  0.3, 4.0, 'manual', 3, true),
  ('levadura fresca',         'kg',  2500,  0.3, 4.0, 'manual', 3, true),
  ('levadura seca',           'kg', 12000,  0.2, 5.0, 'manual', 3, true),
  ('levadura instantanea',    'kg', 12000,  0.2, 5.0, 'manual', 3, true),

  -- ============================================================
  -- ACEITES (estimación mercado 2026 - LAMARIS data ambigua)
  -- ============================================================
  ('aceite girasol',          'L',   3000,  0.3, 4.0, 'manual', 2, true),
  ('aceite maiz',             'L',   4000,  0.3, 4.0, 'manual', 2, true),
  ('aceite oliva',            'L',  18000,  0.2, 5.0, 'manual', 2, true),
  ('aceite mezcla',           'L',   2500,  0.3, 4.0, 'manual', 2, true),

  -- ============================================================
  -- ARROZ (estimación mercado 2026)
  -- ============================================================
  ('arroz',                   'kg',  2000,  0.4, 3.0, 'manual', 2, true),
  ('arroz largo fino',        'kg',  1800,  0.4, 3.0, 'manual', 2, true),
  ('arroz doble carolina',    'kg',  2200,  0.4, 3.0, 'manual', 2, true),
  ('arroz yamani',            'kg',  3500,  0.3, 4.0, 'manual', 2, true),

  -- ============================================================
  -- HARINAS (estimación mercado 2026 — harina es muy sensible a inflación)
  -- ============================================================
  ('harina',                  'kg',  1200,  0.4, 3.0, 'manual', 2, true),
  ('harina 000',              'kg',  1200,  0.4, 3.0, 'manual', 2, true),
  ('harina 0000',             'kg',  1400,  0.4, 3.0, 'manual', 2, true),
  ('harina integral',         'kg',  1800,  0.4, 3.0, 'manual', 2, true),
  ('harina maiz',             'kg',  1500,  0.4, 3.0, 'manual', 2, true),
  ('harina almendra',         'kg', 30000,  0.2, 5.0, 'manual', 2, true),
  ('harina garbanzo',         'kg', 10000,  0.2, 5.0, 'manual', 2, true),

  -- ============================================================
  -- BEBIDAS (estimación)
  -- ============================================================
  ('agua',                    'L',   800,   0.5, 2.0, 'manual', 2, true),
  ('agua mineral',            'L',   800,   0.5, 2.0, 'manual', 2, true),
  ('gaseosa',                 'L',  2500,   0.4, 3.0, 'manual', 2, true),
  ('cerveza',                 'L',  4000,   0.3, 4.0, 'manual', 2, true),
  ('vino',                    'L',  8000,   0.3, 4.0, 'manual', 2, true)

on conflict (tipo_producto) do update set
  unidad_base       = excluded.unidad_base,
  mediana_estimada  = excluded.mediana_estimada,
  factor_min        = excluded.factor_min,
  factor_max        = excluded.factor_max,
  origen            = excluded.origen,
  muestras          = excluded.muestras,
  confiable         = excluded.confiable,
  ultima_actualizacion = now();

-- Verificación final
select tipo_producto, mediana_estimada, factor_min, factor_max
from public.pl_rangos_precio
order by tipo_producto
limit 100;
