# Detección de modo pack/unitario sin revisión del usuario

**Fecha**: 2026-06-10
**Estado**: Aprobado (diseño validado en sesión de brainstorming)

---

## 1. Contexto y problema

El pipeline de listas de precios decide por producto si el precio impreso es **pack** (total del envase) o **unitario** (por kg/L). Hoy la decisión descansa principalmente en rangos de precio (`pl_rangos_precio` + `RANGOS_PRECIO_AR`), con la IA como fallback, y lo ambiguo queda marcado **"revisar"** para que el usuario lo confirme a mano.

Problemas confirmados leyendo el código:

1. **"Revisar" es inaceptable como producto**: el usuario no va a revisar productos. Decisión de producto: *el paso "revisar" no puede existir*.
2. **El bucle de aprendizaje está al revés**: `actualizarRangosConDetecciones()` aprende de las decisiones automáticas del propio pipeline (sesgo de confirmación), mientras que las correcciones del usuario (flip 📦/⚖️) se descartan — `confirmado_manual` se lee en el código pero **nunca se setea**. El mismo error se repite lista tras lista.
3. **Zona ciega en 1kg/1L**: con tamaño ≈ 1, precio-pack ≈ precio-unitario; ningún rango puede separarlos. Hoy cae a un desempate por cercanía a la mediana con confianza 0.5 (moneda al aire).
4. **Rangos demasiado anchos**: `_factoresPorPrecio` llega a span 25× y `factorPackPequenio` multiplica hasta ×4 → el chequeo "¿en rango?" casi nunca discrimina.
5. **Las listas reales son mixtas**: dentro de una misma lista hay productos cotizados por bulto y por kg (dato confirmado por el dueño del producto). No existe la salida fácil de "detectar la convención de la lista y aplicarla a todo".
6. **Sin medición**: `pl_auditoria_precios` registra qué se decidió pero no si fue correcto. No se conoce la tasa de acierto.

## 2. Invariantes (lo que el sistema promete)

1. **Nunca existe "revisar"**: todo producto sale del pipeline con modo decidido y precio mostrable. Los botones 📦/⚖️ del preview se mantienen como *input de corrección opcional*, nunca como tarea pendiente.
2. **Una corrección = nunca más ese error**: una corrección del usuario queda persistida y gana sobre cualquier inferencia futura para ese proveedor+producto, para siempre.
3. **Presupuesto duro**: US$0.0003 por producto (US$0.30 por lista de 1000). Si el gasto acumulado se acerca al tope, el pipeline **degrada solo** a señales gratis. El tope se cumple por construcción.
4. **Ante la duda total, no transformar el precio**: el default final es `pack` (mostrar el número impreso en la lista tal cual). Un default que no inventa números hace el menor daño posible.

## 3. Arquitectura: la nueva cascada

Cada producto recorre los pasos en orden; el primero que decide, corta. **Ningún paso marca "revisar".** Cada decisión registra su `fuente_decision`.

| # | Paso | Fuente (`fuente_decision`) | Confianza | Costo |
|---|------|---------------------------|-----------|-------|
| 0 | Memoria de correcciones (match exacto proveedor+producto) | `memoria` | 1.0 | gratis |
| 1 | Señal del documento (campo `m` de la extracción) | `doc` | 0.92 | ~gratis (ver §5) |
| 2 | Heurística estructural (presentación = unidad pura, ya existe) | `heuristica` | 0.85 | gratis |
| 3 | Tamaño explícito en el nombre + rango como veto (ya existe) | `tamano_explicito` | 0.8–0.9 | gratis |
| 4 | Coherencia interna reactivada como **decisor** | `coherencia` | 0.85 | gratis |
| 5 | Rango dinámico, **solo si decide inequívocamente** (una sola interpretación en rango) | `rango_db` / `rango_hardcoded` | 0.65–0.9 | gratis |
| 6 | Consenso de lista (prior suave) | `consenso` | 0.6 | gratis |
| 7 | IA Haiku con **elección forzada** (nunca devuelve null) | `ia` | lo que reporte (piso 0.55) | pago |
| 8 | Default determinista: `pack` | `default` | 0.3 | gratis |

Cambios respecto a hoy:

- El desempate "ambos en rango → cercanía a la mediana" (confianza 0.5) **se elimina**. Esos casos pasan a consenso → IA.
- El paso "rango" baja de decisor principal a quinto: solo decide cuando es inequívoco.
- El veto de absurdo (`UMBRAL_ABSURDO = 500×` la mediana, típico OCR "CC" por "KG") se mantiene y aplica en los pasos 1, 3 y 5.

### Paso 0 — Memoria de correcciones

- Al inicio del pipeline, **una** query: `pl_modo_correcciones` filtrada por `owner_id` (vía `effectiveUserId()`) y `proveedor_id` de la lista en curso. Se indexa en memoria por `nombre_key`.
- `nombre_key` = nombre original normalizado: minúsculas, sin acentos, espacios colapsados, trim. Función pura `normalizarNombreKey()` compartida entre escritura y lectura (vive en `pipeline.js`).
- Match exacto → modo confirmado con confianza 1.0. **Scoped por proveedor**: el mismo nombre en otro proveedor NO matchea (otra lista puede usar otra convención).
- El caso que cubre es el dominante: re-subir la lista actualizada del mismo proveedor (todos los meses).

### Paso 1 — Señal del documento (#2: "leer en la fuente")

La extracción ya paga por leer cada fila; ahora también reporta lo que el documento dice sobre el modo:

- Los prompts de extracción (PDF `procesar_chunk`/`detectar_columnas`, Excel reusa el flujo PDF, foto `procesar_lista`) ganan una instrucción: *si la fila o la lista indican explícitamente si el precio es por envase o por unidad de medida —columna de tipo de envase (`KG`/`LTS` → por unidad; `BOL`/`CAJ`/`PAQ`/`LAT`/`FCO`/`POT`/`POM`/`BOT` → por envase), encabezado tipo "PRECIO POR KILO", etc.— agregar `"m":"U"` o `"m":"P"` a la fila. Si no hay indicación explícita, **omitir el campo**.*
- Costo marginal: ~5 tokens de salida por fila con señal → ≈ +US$0.025 por 1000 productos.
- El rango (si existe) solo **veta absurdos**; no re-decide.
- Importante: el campo `m` NO entra al cache global de normalización (`pl_cache_normalizacion`) — el modo depende del documento y el proveedor, no del nombre del producto. El esquema del cache no cambia.

### Paso 4 — Coherencia interna como decisor

`detectarPorCoherenciaInterna()` ya existe pero está desactivada porque marcaba "revisar" y generaba ruido. Se reactiva con rol nuevo: **decide** (no flaggea).

- Regla actual que se conserva: mismo tipo, dos tamaños con ratio ≥2×, precios con ratio < 60% del ratio de tamaños → el grande es `unitario` (su precio no escala con el tamaño).
- Solo decide la fila del tamaño grande (la chica sigue en cascada).
- Como ahora decide en vez de marcar revisar, el motivo original de desactivarla desaparece.

### Paso 6 — Consenso de lista

Mata la zona ciega de 1kg/1L en listas donde la mezcla no es 50/50:

- Tras correr los pasos 0–5 sobre toda la lista, se calcula la distribución de modos entre las filas **ya decididas con confianza ≥ 0.8**.
- Si ≥80% comparte un modo y hay ≥5 filas decididas → las filas aún indecisas heredan ese modo con confianza 0.6, fuente `consenso`.
- Si la lista es genuinamente mixta (sin mayoría del 80%), el consenso no aplica y esas filas siguen a la IA.

### Paso 7 — IA con elección forzada

- El prompt de `detectar_modo_precios` cambia: **siempre** elegir `pack` o `unitario`; `null` deja de ser una respuesta válida. Devuelve su confianza real.
- Las decisiones de baja confianza se loguean en auditoría para el bucle de convergencia — **no** se le muestran al usuario como pendiente.
- Si un batch falla tras los reintentos existentes, sus filas caen al paso 8 (default), fuente `degradado`. El toast actual "quedan para revisar" se elimina; se loguea en consola/auditoría.

## 4. Bucle de convergencia (#1)

### Tabla nueva: `pl_modo_correcciones`

```sql
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
```

- RLS con el patrón existente de empleados: `owner_id = public.get_owner_id(auth.uid())` para select/insert/update/delete (un empleado con permiso `listas` corrige hacia el espacio del owner).
- Upsert `on conflict (owner_id, proveedor_id, nombre_key) do update` (la última corrección manda).

### Flujo de escritura

- `setModoPreview(idx, modo)` (el flip 📦/⚖️) marca la fila `confirmado_manual = true`.
- En `guardarLista()`, toda fila tocada por el usuario se upsertea en `pl_modo_correcciones` con su modo final. Flipear y volver al original también cuenta: es una **confirmación** humana, señal igual de valiosa.
- `actualizarRangosConDetecciones()` ya pesa ×2 las filas con `confirmado_manual` ([app/index.html:4893](../../app/index.html)) — solo faltaba setear el flag.

### Reglas de aprendizaje de rangos (anti sesgo de confirmación)

- Los rangos solo aprenden de filas con fuente fuerte: `memoria`, `doc`, `heuristica`, `tamano_explicito`, `coherencia`, o confirmación manual. Las fuentes débiles (`consenso`, `ia` con confianza < 0.8, `default`, `degradado`) **no alimentan** los rangos.
- El filtro actual `confianza >= 0.7` se conserva como segunda barrera.
- Los seeds `origen='manual'` siguen siendo intocables (regla existente).

## 5. Presupuesto duro (garantía de ≤ US$0.30 / 1000 productos)

### Mecánica

1. `api/claude.js` ya calcula el costo por llamada para `uso_ia`; ahora también lo devuelve en la respuesta (`costo_usd`).
2. El cliente acumula `_costoListaActual` (reset al inicio de cada pipeline). Presupuesto = `max(0.10, nProductos × 0.0003)` USD.
3. Al alcanzar el **85%** del presupuesto:
   - La detección de modo IA restante se degrada a consenso → default (gratis).
   - La normalización restante con cache-miss se omite: esos items quedan sin clave canónica (no agrupan en el comparador) pero **con precio visible** — exactamente el comportamiento actual ante un fallo de red. Nunca se bloquea el guardado.
4. La extracción no se degrada (sin extracción no hay lista) pero sí se cuenta. Con esquemas compactos entra holgada (ver abajo).
5. Toda degradación se loguea (`fuente_decision = 'degradado'`) — sin toast molesto.

### Por qué cierra la cuenta

Anclado a los números empíricos del README (lista fría ~1100 productos: $0.30–0.50; con cache caliente: $0.02–0.05):

| Rubro | Hoy | Con este diseño |
|---|---|---|
| Extracción | base | base + ~$0.03 (campo `m`) |
| Normalización | base; el cache global ya la achica | −30% de tokens de salida vía claves compactas |
| Detección modo IA | el rubro caro en listas mixtas (~250 tokens/grupo) | −80/90%: solo llega el residual que ninguna señal gratis decidió |
| **Total frío** | $0.30–0.50 | **≤ $0.30, garantizado por el tope** |
| **Total caliente** | $0.02–0.05 | igual o menor |

La garantía dura no depende de que las estimaciones acierten: si una lista patológica gasta más rápido, el medidor degrada y el tope se respeta igual.

### Esquemas compactos

- Salidas de normalización y detección de modo pasan a claves de 1 letra (mapeo documentado en un solo lugar de `pipeline.js`; el cliente re-expande al recibir).
- El cache global (`pl_cache_normalizacion`) y la auditoría **no cambian de esquema**: la compactación es solo transporte IA→cliente.
- Alcance foto: la garantía aplica al camino PDF/Excel (las listas de 1000 ítems llegan así). El camino foto usa Sonnet, se acota por foto, y el medidor de presupuesto igual lo cubre.

## 6. Medición

`pl_auditoria_precios` gana dos columnas:

```sql
alter table public.pl_auditoria_precios add column if not exists fuente_decision text;
alter table public.pl_auditoria_precios add column if not exists corregido boolean default false;
```

- `fuente_decision`: qué paso de la cascada decidió (`memoria`/`doc`/`heuristica`/`tamano_explicito`/`coherencia`/`rango_db`/`rango_hardcoded`/`consenso`/`ia`/`default`/`degradado`).
- `corregido`: `true` si el usuario flipeó esa fila en el preview antes de guardar.

Tasa de acierto por fuente con una query:

```sql
select fuente_decision,
       count(*) as total,
       sum(case when corregido then 1 else 0 end) as corregidos,
       round(100.0 * (1 - sum(case when corregido then 1 else 0 end)::numeric / count(*)), 1) as acierto_pct
from pl_auditoria_precios
where fuente_decision is not null
group by 1 order by total desc;
```

Sin dashboard: la query es el reporte. Si más adelante hace falta UI, la data ya está.

## 7. Cambios concretos por archivo

| Pieza | Cambio |
|---|---|
| **`app/pipeline.js` (nuevo)** | Se extraen de `index.html` las funciones puras de las etapas 2–5 (~1500 líneas): `parsePrecio`, `canonizarUnidadBase`, `detectarMultipack`, `recuperarObjetosJsonArray`, `agruparPorClaveCanonica`, `detectarModoHeuristico`, `decidirModoPorRangos`, `rangoParaTipo`, `RANGOS_PRECIO_AR`, `_normTipo`/`_normTipoLite`, `rangoEfectivo`, `factorPackPequenio`, `_factoresPorPrecio`, `detectarPorRangoDinamico`, `detectarPorCoherenciaInterna`, `esOutlier`, `_mediana`, `calcularPrecios`, `tamanoExplicitoEnNombre`, `decidirPackPorTamanoExplicito` + nuevas: `normalizarNombreKey`, `consensoDeLista`, `decidirModoCascada` (orquestador puro de la cascada). Se carga con `<script src="pipeline.js">` antes del script principal; funciones globales, sin módulos (patrón vanilla del proyecto). Las funciones con dependencia de Supabase/DOM quedan en `index.html`. |
| `app/index.html` | Cascada nueva en la Etapa 4; pasos 0/1/4/6 cableados; eliminación del flag "revisar" y del toast "quedan para revisar"; `setModoPreview` setea `confirmado_manual`; `guardarLista` persiste correcciones; medidor de presupuesto; prompts de extracción con campo `m`; esquemas compactos. |
| `api/claude.js` | Devolver `costo_usd` en la respuesta de cada llamada; prompt de `detectar_modo_precios` con elección forzada. |
| **`sql/MIGRACION_MODO_CORRECCIONES.sql` (nuevo)** | Tabla `pl_modo_correcciones` + RLS + 2 columnas en `pl_auditoria_precios`. Idempotente. |
| `sql/schema.sql` | Reflejar lo mismo para instalaciones nuevas. |
| **`tests/` (nuevo)** | Golden set + unit tests (ver §8). |
| `README.md` | Actualizar secciones de pipeline/detección de modo. |

## 8. Testing

La vara "nunca falla" exige red de verificación:

- **Golden set**: 3–5 listas reales problemáticas (las aporta el dueño del producto), anonimizadas si hace falta, con el modo correcto anotado a mano por fila. Formato: `tests/golden/<lista>.json` con `{ filas: [{nombre_original, precio_raw, tamano, unidad_base, tipo, presentacion_original, m?}], esperado: {id → modo} }`.
- **Runner**: `node tests/run-golden.js` carga `pipeline.js` (vía `vm.runInThisContext`), corre la cascada **sin IA** (determinística) y reporta acierto por fuente. Falla si el acierto global baja del umbral o si hay regresión contra el resultado anterior versionado.
- **Unit tests** de funciones puras: `parsePrecio`, `normalizarNombreKey`, `detectarPorCoherenciaInterna`, `consensoDeLista`, lógica del presupuesto.
- Criterio de éxito medible post-deploy: tasa de `corregido` global < 2% y tendencia decreciente (cada corrección sella su producto vía memoria).

## 9. Manejo de errores

- Fallo de batch IA (tras reintentos existentes) → filas a `default`/`degradado`; la lista **siempre** se puede guardar.
- Fallo de la query de memoria/rangos → la cascada sigue sin ese paso (degradación parcial, log en consola).
- Presupuesto agotado → degradación silenciosa, log + auditoría.
- El parser tolerante de JSON truncado y el auto-subdivide existentes se conservan.

## 10. Fuera de alcance

- **Web search sigue desactivada** (costo): la memoria de correcciones cumple ese rol gratis.
- Dashboard de métricas de acierto (la query SQL es el reporte por ahora).
- Cambios al camino foto más allá del campo `m` y el medidor de presupuesto.
- Compartir correcciones entre cuentas (la memoria es por owner; un cache global de modo sería riesgoso porque la convención es del documento, no del producto).

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| La señal `m` viene mal extraída (OCR/columna ambigua) | Veto de absurdo por rango; confianza 0.92 (no 1.0) deja que una corrección la pise; golden set la mide |
| El consenso hereda mal en listas 60/40 | Umbral de 80% + mínimo 5 filas decididas; si no, va a IA |
| Default `pack` equivocado | Solo llega ahí lo que ninguna señal pudo decidir Y la IA falló — casos raros, logueados como `degradado`, y una corrección lo sella |
| Compactar esquemas rompe parsing | El re-expansor vive en un solo lugar; unit tests; el parser tolerante existente cubre truncados |
| Extraer 1500 líneas a `pipeline.js` introduce regresiones | Extracción mecánica sin cambio de lógica como primer paso aislado; golden set corre antes y después |
