# Golden set — detección de modo pack/unitario

Casos reales extraídos de 4 listas de proveedores (mayo 2026), con el modo correcto
anotado a mano. Es la red de verificación del spec
`docs/superpowers/specs/2026-06-10-deteccion-modo-sin-revision-design.md`.

## Las 4 listas y su convención

| Archivo | Proveedor | Convención | Qué aporta |
|---|---|---|---|
| `lamaris.json` | Grupo Lamaris | **Pack dominante**, filas `KILOS` = unitario | Columna Envase/Volumen/Unidad explícita (señal `m`), typos reales ("2,86 GRS" = kg), multipacks |
| `centeno-general.json` | Centeno Materias Primas | **Unitario dominante** vía columna `:UNI:` (KG/LTS) | La señal documental 1:1; trampas PAQ/CAJ (precio por unidad suelta, no por bulto) |
| `walter-dacal.json` | Distribuidora Argentina de Insumos | **Genuinamente mixta**, sin columna señal | Azúcar x25kg POR KG y harina x25kg POR BOLSA en la misma lista; 3 columnas de precio (se usa Neto) |
| `delite.json` | Delite | **Pack dominante**, sin columna señal | 4 columnas (Lista/DTO/Final/Neto — se usa Neto), tamaños entre paréntesis, filas sin tamaño |

## Por qué estas listas prueban el diseño

Cruces reales del mismo producto con convención OPUESTA entre proveedores:

- **Azúcar**: WD x25kg = $1.244 (por kg) · Delite x25kg = $26.459 (por bolsa)
- **Crema Paris Ledevit 4kg**: WD = $32.984 (balde) · CENTENO = $9.607 (por kg)
- **Grasa 20kg**: WD = $4.545 (por kg) · Delite = $101.979 (por caja)
- **Mermelada Frambuesa Ghelco 5.4kg**: WD = $84.244 (balde) · CENTENO = $20.071 (por kg)
- **Polvo de hornear 3kg**: Delite = $19.680 (bolsa) · CENTENO = $5.828 (por kg)
- **Harina de maíz 5kg**: WD = $773 (por kg) · Delite = $8.000 (por bolsa)

→ Ninguna regla "por proveedor" o "por producto" alcanza: la decisión es por fila,
con la cascada del spec.

## Formato

```json
{
  "proveedor": "...",
  "columna_precio_usada": "...",
  "filas": [
    {
      "id": "LAM01",
      "nombre": "nombre original tal cual el PDF",
      "presentacion": "columna envase/presentación si existe",
      "precio": 13838.0,
      "tipo": "tipo canónico (como lo daría la normalización)",
      "tamano": 3,            // null si el nombre no trae tamaño
      "unidad_base": "kg",    // kg | L | u
      "m": "P",               // señal del documento: "P" | "U" | ausente
      "esperado": "pack",     // ground truth: "pack" | "unitario"
      "anotacion": "ok",      // "ok" | "revisar" (ambigüedad real, confirmar con el dueño)
      "nota": "por qué / qué caso cubre"
    }
  ]
}
```

- `m` solo está presente cuando el documento lo dice explícitamente (columna
  Envase de Lamaris, `:UNI:` de CENTENO). WD y Delite no traen señal → esas filas
  prueban los pasos sin señal (coherencia, rango, consenso).
- `esperado` se verificó por: orden de magnitud del precio contra el tipo,
  y cruce contra el mismo producto en otra de las 4 listas.
- Las filas `anotacion: "revisar"` son ambigüedades genuinas del documento
  (ej. levadura donde el precio es por la unidad suelta, no por el estuche).
  El runner las reporta aparte, no como fallo.

## Runner

`node tests/run-golden.js` (llega con la Fase 1 — extracción de `pipeline.js`).
Corre la cascada SIN IA (determinística) y reporta acierto por fuente de decisión.
Los PDFs fuente no van al repo.
