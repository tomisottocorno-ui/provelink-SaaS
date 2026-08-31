# Detección de modo sin revisión — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el spec `docs/superpowers/specs/2026-06-10-deteccion-modo-sin-revision-design.md`: cascada de detección pack/unitario que siempre decide (sin "revisar"), aprende de correcciones, y garantiza ≤US$0.30 por lista de 1000 productos.

**Architecture:** Se extraen las funciones puras del pipeline (etapas 3-5) de `app/index.html` a un archivo nuevo `app/pipeline.js` (globals, sin módulos — patrón vanilla del proyecto), lo que habilita un runner Node contra el golden set ya commiteado en `tests/golden/`. Sobre esa base se construye la cascada nueva (`decidirModoCascada`), el bucle de correcciones (`pl_modo_correcciones`), la señal documental `m` en extracción, la IA con elección forzada y el medidor de presupuesto.

**Tech Stack:** JS vanilla (ES5-style, sin transpilación), Supabase (Postgres+RLS), Vercel Functions (`api/claude.js`), Node ≥18 solo para tests.

---

## Prerrequisitos

- **Node no está instalado en la máquina Windows actual.** Instalarlo antes de la Task 2: `winget install OpenJS.NodeJS.LTS` (o correr los tests en la otra computadora). Solo se usa para los tests; la app no lo necesita.
- **Las migraciones SQL (Task 6) hay que correrlas en el SQL Editor de Supabase a mano** — avisarle al dueño en ese punto.
- ⚠️ **Los números de línea de `app/index.html` citados son PRE-extracción** (estado en commit `03b82d5`). Después de la Task 1 el archivo se achica ~1.300 líneas: usar SIEMPRE grep por nombre de función, no el número.
- ⚠️ **Cada push a `main` deploya a producción en Vercel.** Commitear por task, pero pushear solo en los puntos marcados "PUSH" (después de verificación).

---

### Task 1: Extraer las funciones puras a `app/pipeline.js`

Extracción **mecánica, sin cambio de lógica**. Mueve a un archivo nuevo todo lo que no toca DOM ni Supabase.

**Files:**
- Create: `app/pipeline.js`
- Modify: `app/index.html` (borrar las funciones movidas + agregar `<script src="pipeline.js"></script>`)

- [ ] **Step 1: Crear `app/pipeline.js` con header y mover las funciones**

El archivo arranca así:

```js
// ============================================================================
// pipeline.js — Lógica PURA del pipeline de listas (etapas 3-5)
// Sin DOM, sin Supabase, sin fetch. Cargado por index.html ANTES del script
// principal, y por tests/run-golden.js bajo Node (vm.runInThisContext).
// ============================================================================
```

Mover (cortar de `index.html`, pegar acá, **idénticas**) estas funciones/constantes. Localizar cada una con grep `function <nombre>` o `var <NOMBRE>`:

1. `redondear`
2. `parsePrecio`
3. `canonizarUnidadBase`
4. `detectarMultipack`
5. `recuperarObjetosJsonArray`
6. `normalKey`
7. `agruparPorClaveCanonica`
8. `analizarCajaIndividual`
9. `analizarCajaPorciones`
10. `calcularPrecios` (estaba en index.html:3963)
11. `RANGOS_PRECIO_AR` (objeto, ~index.html:4340)
12. `_normTipoLite` (4395)
13. `rangoParaTipo` (4402)
14. `decidirModoPorRangos` (4422)
15. `_normTipo` (4473)
16. `lookupRangoCacheado` (4506)
17. `_factoresPorPrecio` (4534)
18. `factorPackPequenio` (4607)
19. `rangoEfectivo` (4621)
20. `detectarPorRangoDinamico` (4640)
21. `detectarPorCoherenciaInterna` (4708)
22. `esOutlier` (4830)
23. `_mediana` (4837)
24. `detectarModoHeuristico` (4938)
25. `tamanoExplicitoEnNombre` (4969)
26. `decidirPackPorTamanoExplicito` (4993)

**NO mover** (dependen de Supabase/DOM/estado global): `getRangosCacheados`, `guardarRangoCacheado`, `_seedRango(s)`, `actualizarRangosConDetecciones`, `buscarRangoWebCliente`, `getCacheNorm`, `guardarCacheNorm`, `normalizarConCache`, `_normBatch*`, `llamarDetectarModoIA*`, `guardarAuditoriaPrecios`, `ejecutarPipelineNormalizacion`, `_fetchClaude`, `_claudeAcquire/Release`, `_invalidarRangosCache`, `_rangosCache`.

Regla de verificación: ninguna función movida puede referenciar `supabase`, `document`, `$(`, `fetch`, `sesion`, `showToast`, `cargas`, ni variables que queden en index.html. Si una la referencia, NO se mueve (anotarlo).

- [ ] **Step 2: Incluir pipeline.js en index.html**

Buscar cómo se incluye `icons.js` en `app/index.html` (grep `icons.js`) y agregar al lado, ANTES del script principal:

```html
<script src="pipeline.js"></script>
```

- [ ] **Step 3: Verificación estática**

Correr y revisar que no quede ninguna definición duplicada ni referencia perdida:

```
grep -n "function parsePrecio\|function calcularPrecios\|function detectarModoHeuristico\|RANGOS_PRECIO_AR =" app/index.html
```
Esperado: 0 resultados (todas viven solo en pipeline.js).

```
grep -c "parsePrecio\|calcularPrecios(" app/index.html
```
Esperado: >0 (los CALLERS siguen en index.html, las definiciones no).

- [ ] **Step 4: Commit (sin push)**

```bash
git add app/pipeline.js app/index.html
git commit -m "refactor: extraer logica pura del pipeline a pipeline.js (sin cambio de logica)"
```

---

### Task 2: Cascada actual como función pura + runner del golden set (baseline)

**Files:**
- Modify: `app/pipeline.js` (agregar `decidirModoCascada` — versión con la lógica ACTUAL)
- Modify: `app/index.html` (el loop inline de la Etapa 4 pasa a llamar `decidirModoCascada`)
- Create: `tests/run-golden.js`
- Create: `tests/golden/rangos-fixture.json`

- [ ] **Step 1: Escribir el runner (el test) — `tests/run-golden.js`**

```js
// Runner del golden set. Uso:  node tests/run-golden.js [--strict]
// Carga pipeline.js como globals y corre decidirModoCascada SIN IA.
// --strict: exit 1 si alguna fila DECIDIDA está mal (las residuales van a IA, no cuentan).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'pipeline.js'), 'utf8'));

const strict = process.argv.includes('--strict');

// Rangos simulando pl_rangos_precio sembrada (mismo shape que las filas de la tabla)
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden', 'rangos-fixture.json'), 'utf8'));
const rangosMap = {};
fixture.forEach(row => {
  const tipo = row.tipo_producto.toLowerCase();
  rangosMap[tipo] = row;
  const norm = _normTipo(tipo);
  if (norm && norm !== tipo) rangosMap[norm] = row;
});

const archivos = ['lamaris', 'centeno-general', 'walter-dacal', 'delite'];
const tot = { decididas: 0, aciertos: 0, residual: 0, revisar: 0 };
const porFuente = {};

archivos.forEach(nombre => {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden', nombre + '.json'), 'utf8'));
  const grupos = golden.filas.map(f => ({
    clave_canonica: f.id, tipo: f.tipo, tamano: f.tamano, unidad_base: f.unidad_base,
    m: f.m || null,
    proveedores: [{ id_original: f.id, proveedor_id: 'golden', precio_raw: f.precio,
      nombre_original: f.nombre, presentacion_original: f.presentacion || '', m: f.m || null }]
  }));

  const out = decidirModoCascada(grupos, { rangosMap: rangosMap, memoria: {} });
  const porId = {};
  out.decisiones.forEach(d => (d.resultados || []).forEach(r => porId[r.id_original] = r));

  let ok = 0; const errores = []; let resid = 0;
  golden.filas.forEach(f => {
    if (f.anotacion === 'revisar') { tot.revisar++; return; }
    const dec = porId[f.id];
    if (!dec) { resid++; tot.residual++; return; }
    tot.decididas++;
    const fu = dec.fuente || '?';
    porFuente[fu] = porFuente[fu] || { total: 0, ok: 0 };
    porFuente[fu].total++;
    if (dec.modo === f.esperado) { ok++; tot.aciertos++; porFuente[fu].ok++; }
    else errores.push('  X ' + f.id + ' [' + fu + '] dio ' + dec.modo + ', esperado ' + f.esperado + ' | ' + f.nombre);
  });
  console.log('== ' + nombre + ' == ok ' + ok + ' | mal ' + errores.length + ' | residual(IA) ' + resid);
  errores.forEach(e => console.log(e));
});

console.log('\n==== TOTAL ====');
const pct = tot.decididas ? Math.round(100 * tot.aciertos / tot.decididas) : 0;
console.log('Decididas gratis: ' + tot.decididas + ' | aciertos ' + tot.aciertos + ' (' + pct + '%) | residual a IA: ' + tot.residual + ' | excluidas("revisar"): ' + tot.revisar);
Object.keys(porFuente).forEach(f => console.log('  fuente ' + f + ': ' + porFuente[f].ok + '/' + porFuente[f].total));
if (strict && tot.aciertos < tot.decididas) { console.error('\nSTRICT: hay filas decididas MAL'); process.exit(1); }
```

- [ ] **Step 2: Crear `tests/golden/rangos-fixture.json`** (medianas por kg/L del formato bulk, derivadas de los precios reales por kg de CENTENO/WD):

```json
[
  { "tipo_producto": "azucar", "unidad_base": "kg", "mediana_estimada": 1300, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "azucar impalpable", "unidad_base": "kg", "mediana_estimada": 1400, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "harina 0000", "unidad_base": "kg", "mediana_estimada": 850, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "harina 000", "unidad_base": "kg", "mediana_estimada": 700, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "harina centeno", "unidad_base": "kg", "mediana_estimada": 3500, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "harina de maiz", "unidad_base": "kg", "mediana_estimada": 1400, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "fecula de maiz", "unidad_base": "kg", "mediana_estimada": 1300, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "salvado", "unidad_base": "kg", "mediana_estimada": 1000, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "dulce de leche", "unidad_base": "kg", "mediana_estimada": 3300, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "miel", "unidad_base": "kg", "mediana_estimada": 4000, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "mayonesa", "unidad_base": "L", "mediana_estimada": 4500, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "ketchup", "unidad_base": "kg", "mediana_estimada": 4600, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "aceite girasol", "unidad_base": "L", "mediana_estimada": 3300, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "aceite oliva", "unidad_base": "L", "mediana_estimada": 20000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "leche", "unidad_base": "L", "mediana_estimada": 1800, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "crema de leche", "unidad_base": "L", "mediana_estimada": 7100, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "crema chantilly", "unidad_base": "L", "mediana_estimada": 8500, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "crema paris", "unidad_base": "kg", "mediana_estimada": 9000, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "manteca", "unidad_base": "kg", "mediana_estimada": 11000, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "margarina", "unidad_base": "kg", "mediana_estimada": 5300, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "grasa", "unidad_base": "kg", "mediana_estimada": 5300, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "queso mozzarella", "unidad_base": "kg", "mediana_estimada": 9000, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "queso rallado", "unidad_base": "kg", "mediana_estimada": 13000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "queso crema", "unidad_base": "kg", "mediana_estimada": 13000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "queso azul", "unidad_base": "kg", "mediana_estimada": 13000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "sal", "unidad_base": "kg", "mediana_estimada": 600, "factor_min": 0.5, "factor_max": 2.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "levadura", "unidad_base": "kg", "mediana_estimada": 7500, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "levadura fresca", "unidad_base": "kg", "mediana_estimada": 8000, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "polvo de hornear", "unidad_base": "kg", "mediana_estimada": 6000, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "cacao amargo", "unidad_base": "kg", "mediana_estimada": 25000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "tomate triturado", "unidad_base": "kg", "mediana_estimada": 1400, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "pure de tomate", "unidad_base": "kg", "mediana_estimada": 2800, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "mermelada frambuesa", "unidad_base": "kg", "mediana_estimada": 18000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "pulpa", "unidad_base": "kg", "mediana_estimada": 2800, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "cerezas", "unidad_base": "kg", "mediana_estimada": 10000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "fideos", "unidad_base": "kg", "mediana_estimada": 5000, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "gelatina sin sabor", "unidad_base": "kg", "mediana_estimada": 25000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "salsa caramelo", "unidad_base": "kg", "mediana_estimada": 7000, "factor_min": 0.4, "factor_max": 3.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "salsa dulce de leche", "unidad_base": "kg", "mediana_estimada": 11000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true },
  { "tipo_producto": "nutella", "unidad_base": "kg", "mediana_estimada": 30000, "factor_min": 0.3, "factor_max": 4.0, "origen": "manual", "muestras": 5, "confiable": true }
]
```

- [ ] **Step 3: Correr el runner para verificar que falla** (decidirModoCascada no existe)

Run: `node tests/run-golden.js`
Esperado: `ReferenceError: decidirModoCascada is not defined`

- [ ] **Step 4: Implementar `decidirModoCascada` en `pipeline.js` — versión BASELINE (lógica actual)**

Replica el loop inline de `ejecutarPipelineNormalizacion` (index.html, grep `Etapa 4: Detectar modo`), con `fuente` etiquetada y soporte de `ctx` para los pasos futuros:

```js
// Cascada de decisión de modo. Pura: recibe todo por parámetro.
// ctx = { rangosMap: {}, memoria: {} }
// Devuelve { decisiones: [{clave_canonica, resultados:[...]}], residual: [grupos] }
function decidirModoCascada(grupos, ctx) {
  ctx = ctx || {};
  var rangosMap = ctx.rangosMap || {};
  var decisiones = [];
  var residual = [];

  var aplicar = function(g, h, fuente) {
    var propios = g.proveedores.filter(function(p) { return p.id_original.indexOf('ext_') !== 0; });
    decisiones.push({
      clave_canonica: g.clave_canonica,
      resultados: propios.map(function(p) {
        return { id_original: p.id_original, proveedor_id: p.proveedor_id,
                 modo: h.modo, confianza: h.confianza, razonamiento: h.razonamiento,
                 fuente: fuente,
                 envase_chico: h.envase_chico || false,
                 tamano_sospechoso: h.tamano_sospechoso || false };
      })
    });
  };

  grupos.forEach(function(g) {
    var primerPropio = g.proveedores.find(function(p) { return p.id_original.indexOf('ext_') !== 0; });
    if (!primerPropio) return;

    // 2) Heurística estructural
    var h = detectarModoHeuristico(g);
    if (h) { aplicar(g, h, 'heuristica'); return; }

    var tipoKey = (g.tipo || '').toLowerCase().trim();
    var rangoRow = tipoKey ? lookupRangoCacheado(rangosMap, tipoKey) : null;

    // 3) Tamaño explícito en el nombre (rango como veto)
    if (tamanoExplicitoEnNombre(g)) {
      var detExp = decidirPackPorTamanoExplicito(g, primerPropio, rangoRow);
      if (detExp) { aplicar(g, detExp, 'tamano_explicito'); return; }
    }

    // 5) Rango dinámico
    if (rangoRow) {
      var det = detectarPorRangoDinamico({ precio_raw: primerPropio.precio_raw, tamano: g.tamano }, rangoRow);
      if (det) { aplicar(g, det, 'rango_db'); return; }
    }
    // 5b) Rangos hardcoded
    var r = decidirModoPorRangos(g);
    if (r) { aplicar(g, r, 'rango_hardcoded'); return; }

    residual.push(g);
  });

  return { decisiones: decisiones, residual: residual };
}
```

- [ ] **Step 5: Reemplazar el loop inline de index.html por la llamada**

En `ejecutarPipelineNormalizacion`, el bloque desde `var todosLosModos = [];` hasta el `console.log('[Pipeline] Modo — ...')` inclusive (pre-extracción era index.html:5384-5442) se reemplaza por:

```js
if (loadingEl) loadingEl.textContent = 'Detectando modo de precio...';
var rangosCacheados = await getRangosCacheados();
var cascada = decidirModoCascada(gruposConComparacion, { rangosMap: rangosCacheados, memoria: {} });
var todosLosModos = cascada.decisiones;
var gruposParaIA = cascada.residual;
console.log('[Pipeline] Modo — gratis: ' + todosLosModos.length + ' · IA Haiku (fallback): ' + gruposParaIA.length + ' grupos');
```

(El batching de `gruposParaIA` que sigue queda igual.)

- [ ] **Step 6: Correr el runner — BASELINE**

Run: `node tests/run-golden.js`
Esperado: corre sin excepciones e imprime el reporte. **Va a haber errores y residual** (la lógica actual no usa `m` ni coherencia) — eso ES el baseline. Copiar el bloque TOTAL impreso y pegarlo como comentario al final de `tests/run-golden.js`:

```js
// BASELINE (lógica pre-spec, commit <hash>):
// <pegar el output TOTAL acá>
```

- [ ] **Step 7: Commit + PUSH** (la app sigue funcionando igual; verificar antes con una carga de lista manual si hay dudas)

```bash
git add app/pipeline.js app/index.html tests/
git commit -m "refactor: cascada de modo como funcion pura + runner del golden set (baseline)"
git push origin main
```

---

### Task 3: Pasos 0 y 1 de la cascada nueva (memoria + señal del documento)

**Files:**
- Modify: `app/pipeline.js` (`normalizarNombreKey` nueva, `decidirModoCascada` gana pasos 0 y 1)

- [ ] **Step 1: Agregar `normalizarNombreKey` a pipeline.js**

```js
// Clave de memoria de correcciones: nombre original normalizado.
// MISMA función para escribir y para leer (si cambia, invalida la memoria).
function normalizarNombreKey(nombre) {
  return String(nombre || '')
    .toLowerCase()
    // sin acentos (escape explícito: NO usar el rango de combinantes literal, se corrompe al copiar)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

- [ ] **Step 2: Insertar pasos 0 y 1 en `decidirModoCascada`**, al inicio del `grupos.forEach`, después de obtener `primerPropio`:

```js
    // 0) Memoria de correcciones del usuario (match exacto, imbatible)
    var nk = normalizarNombreKey(primerPropio.nombre_original);
    var memoria = ctx.memoria || {};
    if (nk && memoria[nk]) {
      aplicar(g, { modo: memoria[nk].modo, confianza: 1.0,
        razonamiento: 'corregido por el usuario anteriormente' }, 'memoria');
      return;
    }

    // 1) Señal del documento (campo m de la extracción), con veto de absurdo
    var m = primerPropio.m || g.m || null;
    if (m === 'P' || m === 'U') {
      var modoDoc = (m === 'P') ? 'pack' : 'unitario';
      var rangoVeto = lookupRangoCacheado(ctx.rangosMap || {}, (g.tipo || '').toLowerCase().trim());
      var vetado = false;
      if (rangoVeto && rangoVeto.mediana_estimada) {
        var pv = parseFloat(primerPropio.precio_raw) || 0;
        var tv = parseFloat(g.tamano) || 0;
        var implicito = (modoDoc === 'pack' && tv > 0) ? pv / tv : pv;
        if (implicito > rangoVeto.mediana_estimada * 500) vetado = true; // típico OCR "CC" por "KG"
      }
      if (!vetado) {
        aplicar(g, { modo: modoDoc, confianza: 0.92,
          razonamiento: 'el documento lo indica (' + m + ')' }, 'doc');
        return;
      }
    }
```

- [ ] **Step 3: Correr el runner y verificar la mejora**

Run: `node tests/run-golden.js`
Esperado: las 38 filas con señal `m` (Lamaris + CENTENO) ahora se deciden por fuente `doc` (o `memoria` si aplicara) y **todas correctas**. Los errores del baseline en CENTENO tipo "X 5 LTS por litro" desaparecen.

- [ ] **Step 4: Commit**

```bash
git add app/pipeline.js tests/run-golden.js
git commit -m "feat: cascada pasos 0 y 1 - memoria de correcciones + senal del documento"
```

---

### Task 4: Pasos 4, 6 y 8 (coherencia como decisor, consenso de lista, default) + matar el desempate débil

**Files:**
- Modify: `app/pipeline.js` (`consensoDeLista` nueva; `decidirModoCascada` completa)

- [ ] **Step 1: Agregar `consensoDeLista` a pipeline.js**

```js
// Prior suave: si ≥80% de las filas YA decididas con confianza ≥0.8 comparten
// modo (mínimo 5 filas), los indecisos heredan ese modo. Mata la zona ciega
// de 1kg/1L en listas no-mixtas; en listas 60/40 no aplica y decide la IA.
function consensoDeLista(decisiones) {
  var packs = 0, units = 0;
  decisiones.forEach(function(d) {
    (d.resultados || []).forEach(function(r) {
      if ((r.confianza || 0) < 0.8) return;
      if (r.modo === 'pack') packs++;
      else if (r.modo === 'unitario') units++;
    });
  });
  var total = packs + units;
  if (total < 5) return null;
  var pct = Math.round(100 * Math.max(packs, units) / total);
  if (pct < 80) return null;
  return { modo: (packs >= units) ? 'pack' : 'unitario', pct: pct };
}
```

- [ ] **Step 2: Integrar coherencia (paso 4) y filtrar el desempate débil (paso 5)**

En `decidirModoCascada`: antes del `grupos.forEach`, calcular la coherencia una sola vez:

```js
  // 4) Coherencia interna: se calcula una vez para toda la lista
  var coherencia = detectarPorCoherenciaInterna(grupos);
```

Dentro del forEach, ENTRE el paso 3 (tamaño explícito) y el paso 5 (rango):

```js
    // 4) Coherencia interna como DECISOR (reactivada: ahora decide, no marca revisar)
    var coh = coherencia[primerPropio.id_original];
    if (coh) { aplicar(g, coh, 'coherencia'); return; }
```

Y en el paso 5, **descartar el desempate por cercanía** (confianza 0.5 = moneda al aire):

```js
    if (rangoRow) {
      var det = detectarPorRangoDinamico({ precio_raw: primerPropio.precio_raw, tamano: g.tamano }, rangoRow);
      if (det && det.confianza > 0.5) { aplicar(g, det, 'rango_db'); return; }
      // confianza <= 0.5 era el viejo "ambos en rango, gana cercanía" → ahora cae a consenso/IA
    }
```

- [ ] **Step 3: Agregar el paso 6 (consenso) al final de `decidirModoCascada`**, antes del `return`:

```js
  // 6) Consenso de lista sobre lo que quedó indeciso
  if (ctx.consenso !== false && residual.length > 0) {
    var cons = consensoDeLista(decisiones);
    if (cons) {
      residual.forEach(function(g) {
        aplicar(g, { modo: cons.modo, confianza: 0.6,
          razonamiento: 'consenso de lista: ' + cons.pct + '% de las filas son ' + cons.modo }, 'consenso');
      });
      residual = [];
    }
  }
```

- [ ] **Step 4: Correr el runner**

Run: `node tests/run-golden.js --strict`
Esperado: el par de pulpas de WD (WD12/WD13) se decide por `coherencia`; Delite (pack-dominante sin señal) resuelve sus indecisos por `consenso`. Si `--strict` falla, anotar QUÉ filas y ajustar (típico: afinar la mediana de la fixture, no la lógica). Objetivo de salida: **0 filas decididas mal**; residual que queda = lo que en prod va a IA.

- [ ] **Step 5: Unit tests de las funciones puras — `tests/unit.test.js`**

```js
// node tests/unit.test.js — asserts simples, sin framework
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'app', 'pipeline.js'), 'utf8'));

// parsePrecio: formatos AR/US/símbolos
assert.strictEqual(parsePrecio('13.996,53'), 13996.53);
assert.strictEqual(parsePrecio('1,234.56'), 1234.56);
assert.strictEqual(parsePrecio('$ 13.996,53'), 13996.53);

// normalizarNombreKey: acentos, espacios, case — misma clave al escribir y leer
assert.strictEqual(normalizarNombreKey('  AZÚCAR  Ledesma '), 'azucar ledesma');
assert.strictEqual(normalizarNombreKey("MAYONESA HELLMANN'S"), normalizarNombreKey("mayonesa hellmann's"));

// consensoDeLista: umbral 80% y mínimo 5 filas con confianza ≥0.8
const dec = (modo, conf, n) =>
  Array.from({ length: n }, () => ({ resultados: [{ modo: modo, confianza: conf }] }));
assert.strictEqual(consensoDeLista(dec('pack', 0.9, 4)), null, 'menos de 5 filas → null');
assert.strictEqual(consensoDeLista(dec('pack', 0.9, 8).concat(dec('unitario', 0.9, 5))), null, '62% → sin consenso');
assert.strictEqual(consensoDeLista(dec('pack', 0.9, 9).concat(dec('unitario', 0.9, 1))).modo, 'pack', '90% → pack');
assert.strictEqual(consensoDeLista(dec('pack', 0.5, 10)), null, 'confianza <0.8 no cuenta');

console.log('unit.test.js: OK');
```

Run: `node tests/unit.test.js`
Esperado: `unit.test.js: OK`

- [ ] **Step 6: Commit + PUSH**

```bash
git add app/pipeline.js tests/unit.test.js
git commit -m "feat: cascada completa - coherencia como decisor, consenso de lista, sin desempate debil"
git push origin main
```

---

### Task 5: La extracción emite la señal `m` (PDF/Excel/foto) y llega hasta los grupos

**Files:**
- Modify: `app/index.html` — prompts de `detectarColumnasPDF` / `procesarPDFConColumna` (grep) y de `procesarImagen` (grep `procesar_lista`); plumbing de `m` en `itemsConId` y en los proveedores de los grupos.

- [ ] **Step 1: Agregar la instrucción `m` a los prompts de extracción**

En el system prompt del chunk de PDF (dentro de `procesarPDFConColumna`, grep `procesar_chunk`) y en el de imagen (grep `tipo: 'procesar_lista'`), agregar este bloque textual:

```
SEÑAL DE MODO DE PRECIO (campo opcional "m" por fila):
Si la lista indica EXPLÍCITAMENTE si el precio es por unidad de medida o por envase, agregá "m" a esa fila:
- "m":"U" → el precio es POR KG o POR LITRO: columna de unidad con KG/KGS/LTS/LT, o encabezado tipo "PRECIO POR KILO".
- "m":"P" → el precio es POR ENVASE/BULTO: columna con BOL/CAJ/PAQ/LAT/FCO/POT/POM/BOT/EST/UN, o equivalente explícito.
Si el documento NO lo indica explícitamente, OMITÍ el campo "m". NO lo adivines por el precio.
```

(Excel reusa el flujo del PDF — no necesita cambio aparte.)

- [ ] **Step 2: Propagar `m` por el pipeline**

a) Donde se construye `itemsConId` en `ejecutarPipelineNormalizacion` (grep `presentacion_original: it.unidad`), agregar a cada item: `m: it.m || null`.

b) En `agruparPorClaveCanonica` (ahora en pipeline.js) y en el bloque "enriquecido" de comparación cross-proveedor (grep `confianza_normalizacion: 1` en index.html), agregar `m: <item>.m || null` al objeto proveedor que se pushea.

c) Verificar con el runner que nada se rompió: `node tests/run-golden.js --strict` (el runner ya pasa `m` en los proveedores).

- [ ] **Step 3: Smoke test manual**

Subir el PDF de CENTENO en la app (entorno local o deploy preview) y verificar en la consola `[Pipeline] Modo —` que la mayoría de los grupos salen decididos gratis y el residual a IA es chico. Verificar 2-3 precios contra la lista.

- [ ] **Step 4: Commit + PUSH**

```bash
git add app/index.html app/pipeline.js
git commit -m "feat: extraccion emite senal m (columna de unidad/envase) y la cascada la usa"
git push origin main
```

---

### Task 6: Migración SQL — `pl_modo_correcciones` + columnas de auditoría

**Files:**
- Create: `sql/MIGRACION_MODO_CORRECCIONES.sql`
- Modify: `sql/schema.sql` (espejo para instalaciones nuevas)

- [ ] **Step 1: Crear `sql/MIGRACION_MODO_CORRECCIONES.sql`** (idempotente):

```sql
-- ============================================================================
-- MIGRACIÓN: memoria de correcciones de modo + medición en auditoría
-- Correr UNA vez en el SQL Editor de Supabase. Idempotente.
-- ============================================================================

create table if not exists public.pl_modo_correcciones (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  nombre_key text not null,
  clave_canonica text,
  modo text not null check (modo in ('pack','unitario')),
  precio_al_corregir numeric,
  fecha timestamptz default now(),
  unique (owner_id, proveedor_id, nombre_key)
);

alter table public.pl_modo_correcciones enable row level security;

drop policy if exists "Correcciones: select" on public.pl_modo_correcciones;
create policy "Correcciones: select" on public.pl_modo_correcciones
  for select using (owner_id = public.get_owner_id(auth.uid()));

drop policy if exists "Correcciones: insert" on public.pl_modo_correcciones;
create policy "Correcciones: insert" on public.pl_modo_correcciones
  for insert with check (owner_id = public.get_owner_id(auth.uid()));

drop policy if exists "Correcciones: update" on public.pl_modo_correcciones;
create policy "Correcciones: update" on public.pl_modo_correcciones
  for update using (owner_id = public.get_owner_id(auth.uid()))
  with check (owner_id = public.get_owner_id(auth.uid()));

drop policy if exists "Correcciones: delete" on public.pl_modo_correcciones;
create policy "Correcciones: delete" on public.pl_modo_correcciones
  for delete using (owner_id = public.get_owner_id(auth.uid()));

-- Medición: qué paso de la cascada decidió y si el usuario lo corrigió
alter table public.pl_auditoria_precios add column if not exists fuente_decision text;
alter table public.pl_auditoria_precios add column if not exists corregido boolean default false;
```

- [ ] **Step 2: Copiar el mismo bloque al final de `sql/schema.sql`** con un comentario de sección (`-- SISTEMA DE CORRECCIONES DE MODO`).

- [ ] **Step 3: Commit + avisar al dueño que corra la migración en Supabase.**

```bash
git add sql/
git commit -m "sql: tabla pl_modo_correcciones + fuente_decision/corregido en auditoria"
```

---

### Task 7: Bucle de convergencia — capturar, persistir y usar las correcciones

**Files:**
- Modify: `app/index.html` — `setModoPreview`, `guardarLista`, `ejecutarPipelineNormalizacion`, `guardarAuditoriaPrecios`, `actualizarRangosConDetecciones`, y el mapeo resultado→filasPreview.

- [ ] **Step 1: `setModoPreview` marca la corrección** (grep `function setModoPreview`). Después de `it.confianza = 1;` agregar:

```js
  it.confirmado_manual = true;
  it.fuente_decision = 'memoria'; // a partir de ahora esta fila es verdad del usuario
```

- [ ] **Step 2: El mapeo resultado→filasPreview conserva `fuente`** (grep `Mantener alerta original`): en el `Object.assign` del resultado agregar:

```js
      fuente_decision: p.fuente || null,
      confirmado_manual: false,
```

Y en `calcularPrecios` (pipeline.js), el objeto que se pushea a `resultado` gana:

```js
        fuente: modoInfo ? (modoInfo.fuente || null) : null,
```

(El `fuente` viaja en `modoPorId` porque `decidirModoCascada` ya lo pone en cada resultado.)

- [ ] **Step 3: Nueva función `guardarCorreccionesModo` en index.html** (cerca de `guardarAuditoriaPrecios`):

```js
// Persiste las filas que el usuario tocó (flip 📦/⚖️) como verdad permanente.
// Flipear y volver al original también cuenta: es una confirmación humana.
async function guardarCorreccionesModo(items, proveedorId) {
  var tocados = items.filter(function(it) { return it.confirmado_manual && it.modo; });
  if (!tocados.length) return;
  var porKey = {};
  tocados.forEach(function(it) {
    var nk = normalizarNombreKey(it.productoLista || it.nombre_original);
    if (!nk) return;
    porKey[nk] = {
      owner_id: effectiveUserId(),
      proveedor_id: proveedorId,
      nombre_key: nk,
      clave_canonica: it.clave_canonica || null,
      modo: it.modo,
      precio_al_corregir: parseFloat(it.precio) || null,
      fecha: new Date().toISOString()
    };
  });
  var filas = Object.keys(porKey).map(function(k) { return porKey[k]; });
  if (!filas.length) return;
  var r = await supabase.from('pl_modo_correcciones')
    .upsert(filas, { onConflict: 'owner_id,proveedor_id,nombre_key' });
  if (r.error) console.warn('[Correcciones] Error guardando:', r.error.message);
  else console.log('[Correcciones] Selladas', filas.length, 'correcciones');
}
```

Y llamarla en `guardarLista` justo después del upsert exitoso de la lista (al lado de la llamada a `guardarAuditoriaPrecios`):

```js
    guardarCorreccionesModo(items, proveedorId)
      .catch(function(e) { console.warn('[Correcciones] error:', e); });
```

- [ ] **Step 4: Cargar la memoria al inicio del pipeline.** Nueva función en index.html:

```js
async function getMemoriaModos(proveedorId) {
  try {
    var r = await supabase.from('pl_modo_correcciones')
      .select('nombre_key, modo')
      .eq('proveedor_id', proveedorId);
    if (r.error) { console.warn('[Correcciones] No se pudo cargar:', r.error.message); return {}; }
    var map = {};
    (r.data || []).forEach(function(f) { map[f.nombre_key] = { modo: f.modo }; });
    return map;
  } catch(e) { console.warn('[Correcciones] Excepción:', e); return {}; }
}
```

Y en `ejecutarPipelineNormalizacion`, la llamada a la cascada pasa a:

```js
var memoriaModos = await getMemoriaModos(proveedorId);
var cascada = decidirModoCascada(gruposConComparacion, { rangosMap: rangosCacheados, memoria: memoriaModos });
```

- [ ] **Step 5: Auditoría con fuente y corrección.** En `guardarAuditoriaPrecios` (grep), agregar al objeto fila:

```js
        fuente_decision: p.fuente_decision || null,
        corregido: !!p.confirmado_manual
```

- [ ] **Step 6: Los rangos solo aprenden de fuentes fuertes.** En `actualizarRangosConDetecciones` (grep), al inicio del `filasDetectadas.forEach`, antes del filtro de confianza existente:

```js
    var FUENTES_FUERTES = { memoria: 1, doc: 1, heuristica: 1, tamano_explicito: 1, coherencia: 1 };
    if (!f.confirmado_manual && !FUENTES_FUERTES[f.fuente_decision]) return;
```

(El peso ×2 de `confirmado_manual` ya existe en la función — con el Step 1 por fin se activa.)

- [ ] **Step 7: Smoke test** — subir una lista, flipear un producto, guardar; verificar en Supabase (Table Editor → `pl_modo_correcciones`) que apareció la fila. Volver a subir la MISMA lista y verificar en consola que ese producto sale con fuente `memoria` sin tocar IA.

- [ ] **Step 8: Commit + PUSH**

```bash
git add app/index.html app/pipeline.js
git commit -m "feat: bucle de convergencia - correcciones persistidas, memoria en cascada, auditoria con fuente"
git push origin main
```

---

### Task 8: IA con elección forzada + eliminación total de "revisar"

**Files:**
- Modify: `app/index.html` — `SYSTEM_DETECCION_MODO` (grep), manejo de batch perdido en `ejecutarPipelineNormalizacion`.

- [ ] **Step 1: Forzar elección en el prompt.** En `SYSTEM_DETECCION_MODO` (grep), agregar al final:

```
REGLA FINAL OBLIGATORIA: respondé SIEMPRE "pack" o "unitario" para CADA grupo. "modo": null NO es una respuesta válida. Si un caso es genuinamente ambiguo, elegí la interpretación más probable y reflejá la duda en "confianza" (0.5-0.6). Mantené "razonamiento" en 8 palabras o menos.
```

- [ ] **Step 2: El batch perdido cae a default, no a "revisar".** En `ejecutarPipelineNormalizacion`, en el `.catch` del batch de modo (grep `Batch modo perdido`), en lugar de solo contar, aplicar default:

```js
        llamarDetectarModoIAConRetry(slice).catch(function(e) {
          console.error('[Pipeline] Batch modo perdido (' + slice.length + ' grupos), default pack:', e.message);
          // Default determinista: pack = mostrar el precio impreso sin transformar
          return slice.map(function(g) {
            var propios = g.proveedores.filter(function(p) { return p.id_original.indexOf('ext_') !== 0; });
            return {
              clave_canonica: g.clave_canonica,
              resultados: propios.map(function(p) {
                return { id_original: p.id_original, proveedor_id: p.proveedor_id,
                         modo: 'pack', confianza: 0.3,
                         razonamiento: 'default: la IA no respondió',
                         fuente: 'degradado' };
              })
            };
          });
        })
```

- [ ] **Step 3: Eliminar el toast de "revisar".** Grep `quedan para revisar` y borrar ese `showToast` (la variable `modoPerdidos` puede quedar para el log). Grep `revisar:` en el flujo del pipeline para confirmar que ya no se setea `true` en ningún camino del modo.

- [ ] **Step 4: Etiquetar la fuente de la IA.** Donde se procesan los resultados de los batches (grep `modoResultados.forEach`), asegurar que cada resultado que venga de la IA tenga `fuente: 'ia'` si no trae fuente:

```js
    modoResultados.forEach(function(r) {
      r.forEach(function(g) {
        (g.resultados || []).forEach(function(x) { if (!x.fuente) x.fuente = 'ia'; });
      });
      todosLosModos = todosLosModos.concat(r);
    });
```

- [ ] **Step 5: Commit + PUSH**

```bash
git add app/index.html
git commit -m "feat: IA con eleccion forzada y default pack - el paso revisar deja de existir"
git push origin main
```

---

### Task 9: Presupuesto duro por lista

**Files:**
- Modify: `api/claude.js` (devolver `costo_usd`)
- Modify: `app/index.html` (acumulador + gates de degradación)

- [ ] **Step 1: `api/claude.js` devuelve el costo.** En la respuesta 200 final (línea ~478, `return res.status(200).json({...})`), agregar:

```js
      costo_usd: costo,
```

- [ ] **Step 2: Acumulador en el cliente.** Cerca de `_CLAUDE_MAX_CONCURRENT` (grep) agregar:

```js
// Presupuesto duro por lista: $0.0003/producto, piso $0.10 (invariante del spec).
var _costoListaActual = 0;
var _presupuestoLista = Infinity;
function _presupuestoAgotado() {
  return _costoListaActual >= _presupuestoLista * 0.85;
}
```

En `_fetchClaude`, después de parsear `data` OK, agregar:

```js
    if (data && typeof data.costo_usd === 'number') _costoListaActual += data.costo_usd;
```

- [ ] **Step 3: Reset + gates en `ejecutarPipelineNormalizacion`.** Al inicio de la función:

```js
  _costoListaActual = 0;
  _presupuestoLista = Math.max(0.10, (filasBase || []).length * 0.0003);
```

Gate en normalización: en el loop que dispara batches de `_normBatchConRetry` (grep `_normBatchConRetry`), antes de despachar cada batch:

```js
    if (_presupuestoAgotado()) {
      console.warn('[Presupuesto] agotado — ' + (batch.length) + ' items quedan sin normalizar (precio visible igual)');
      // mismo tratamiento que un fallo de red: el item conserva precio sin clave canónica
      continue; // o el equivalente según la estructura del loop
    }
```

Gate en modo IA: antes de despachar los batches de `gruposParaIA`:

```js
  if (gruposParaIA.length > 0 && _presupuestoAgotado()) {
    console.warn('[Presupuesto] agotado — ' + gruposParaIA.length + ' grupos a default/consenso');
    todosLosModos = todosLosModos.concat(gruposParaIA.map(function(g) {
      var propios = g.proveedores.filter(function(p) { return p.id_original.indexOf('ext_') !== 0; });
      return { clave_canonica: g.clave_canonica, resultados: propios.map(function(p) {
        return { id_original: p.id_original, proveedor_id: p.proveedor_id, modo: 'pack',
                 confianza: 0.3, razonamiento: 'presupuesto de lista agotado', fuente: 'degradado' };
      }) };
    }));
    gruposParaIA = [];
  }
```

Al final del pipeline, loguear el gasto: `console.log('[Presupuesto] Lista procesada por $' + _costoListaActual.toFixed(4) + ' (tope $' + _presupuestoLista.toFixed(2) + ')');`

- [ ] **Step 4: Smoke test** — subir una lista y verificar el log `[Presupuesto] Lista procesada por $...`. El número es la primera medición real del costo por lista.

- [ ] **Step 5: Commit + PUSH**

```bash
git add api/claude.js app/index.html
git commit -m "feat: presupuesto duro por lista con degradacion automatica (\$0.0003/producto)"
git push origin main
```

---

### Task 10: Esquemas compactos en normalización (−30% output tokens)

**Files:**
- Modify: `app/index.html` — prompt de `normalizar_lista` (grep `SYSTEM_NORMALIZACION` o `tipo: 'normalizar_lista'`) y parseo en `_normBatch`.

- [ ] **Step 1: Cambiar el formato de salida en el prompt de normalización** a claves de 1 letra. Instrucción a agregar/reemplazar en el prompt:

```
FORMATO DE SALIDA (claves cortas, sin espacios extra):
[{"i":"<id_original>","c":"<clave_canonica>","t":"<tipo>","z":<tamano|null>,"u":"<kg|L|u>","f":<confianza 0-1>}]
No incluyas razonamiento salvo que la confianza sea < 0.6 (campo "r", máximo 6 palabras).
```

- [ ] **Step 2: Re-expandir en `_normBatch`** inmediatamente después del JSON.parse exitoso (todas las variantes de parseo, incluido `recuperarObjetosJsonArray`):

```js
  function _expandirNormCompacta(arr) {
    return (arr || []).map(function(o) {
      if (o && o.i !== undefined && o.id_original === undefined) {
        return { id_original: o.i, clave_canonica: o.c || '', tipo: o.t || '',
                 tamano: (o.z === undefined ? null : o.z), unidad_base: o.u || '',
                 confianza: (o.f === undefined ? 1 : o.f), razonamiento: o.r || '' };
      }
      return o; // backward-compat con formato viejo
    });
  }
```

Aplicarla en cada punto de retorno de `_normBatch`. **El cache global y la auditoría no cambian**: la expansión ocurre antes de tocar cualquier almacenamiento.

- [ ] **Step 3: Smoke test** — subir una lista fresca (producto nuevo, sin cache) y verificar que normaliza igual que antes y que el log `[Presupuesto]` da menor costo que la medición de la Task 9.

- [ ] **Step 4: Commit + PUSH**

```bash
git add app/index.html
git commit -m "perf: esquema compacto en normalizacion (-30% output tokens)"
git push origin main
```

---

### Task 11: Documentación + verificación final

**Files:**
- Modify: `README.md` (secciones del pipeline y detección de modo)
- Modify: `tests/run-golden.js` (registrar resultado final junto al baseline)

- [ ] **Step 1: Correr la suite completa**

Run: `node tests/run-golden.js --strict`
Esperado: PASS (0 filas decididas mal). Pegar el TOTAL final como comentario en `run-golden.js` debajo del baseline, con el hash del commit.

- [ ] **Step 2: Actualizar el README**: sección "Detección de modo (cascada completa)" reescrita con los 9 pasos del spec, la tabla `pl_modo_correcciones`, el presupuesto por lista, y la query de tasa de acierto por `fuente_decision` (está en el spec §6). Eliminar las menciones a "revisar" como estado del flujo.

- [ ] **Step 3: Commit final + PUSH**

```bash
git add README.md tests/run-golden.js
git commit -m "docs: README actualizado a la cascada nueva + resultado final del golden set"
git push origin main
```

---

## Orden y dependencias

```
Task 1 (pipeline.js) → Task 2 (cascada pura + runner) → Task 3 (memoria+doc) → Task 4 (coherencia+consenso)
Task 5 (señal m en extracción)  — depende de 3
Task 6 (SQL)                    — independiente, puede ir en paralelo
Task 7 (convergencia)           — depende de 4 y 6 (y de que el dueño corra la migración)
Task 8 (IA forzada)             — depende de 2
Task 9 (presupuesto)            — depende de 8
Task 10 (esquemas compactos)    — depende de 9 (para medir el ahorro)
Task 11 (docs + verificación)   — al final
```

## Criterios de éxito (del spec)

1. `node tests/run-golden.js --strict` en verde: **0 filas decididas mal** por las señales gratis.
2. Ningún camino del pipeline produce "revisar" ni toast de revisión.
3. Log `[Presupuesto]` ≤ $0.30 en una lista de ~1000 productos (fría).
4. Re-subir una lista tras corregir un producto → ese producto sale con `fuente: memoria`.
5. Query de auditoría por `fuente_decision` devuelve datos (medición activa).
