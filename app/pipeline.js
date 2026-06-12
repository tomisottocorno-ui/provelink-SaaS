// pipeline.js — Funciones puras del pipeline de listas de precios.
// Sin dependencias de Supabase, DOM ni fetch.
// Cargado antes del script principal de index.html.

function recuperarObjetosJsonArray(texto) {
  var ini = texto.indexOf('[');
  if (ini < 0) return [];
  var objs = [];
  var depth = 0;
  var inString = false;
  var prevWasEscape = false;
  var objStart = -1;

  for (var i = ini + 1; i < texto.length; i++) {
    var c = texto[i];
    if (inString) {
      if (prevWasEscape) { prevWasEscape = false; }
      else if (c === '\\') { prevWasEscape = true; }
      else if (c === '"') { inString = false; }
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        try { objs.push(JSON.parse(texto.slice(objStart, i + 1))); } catch(e) {}
        objStart = -1;
      }
    }
  }
  return objs;
}

// Robusto: maneja AR "1.234,56", US "1,234.56", con/sin símbolos de moneda
// ("$", "ARS"), y casos ambiguos como "13.996" (3 dígitos después del punto
// → asume miles AR, porque "$ 13.996" en una lista argentina es 13996, no 13.996).
function parsePrecio(str) {
  if (str === null || str === undefined) return null;
  if (typeof str === 'number') return isFinite(str) ? str : null;
  var s = String(str).trim();
  if (!s) return null;
  // Sacar todo lo que no sea dígito, "." o "," ($ ARS espacios símbolos)
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;

  var lastDot = s.lastIndexOf('.');
  var lastComma = s.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    // Tiene ambos: el ÚLTIMO es el decimal
    if (lastComma > lastDot) {
      // AR: "1.234,56" → punto miles, coma decimal
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US: "1,234.56" → coma miles, punto decimal
      s = s.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    // Solo comas: decimal AR ("13,99"); si hay varias, las primeras son miles
    s = s.replace(/,(?=.*,)/g, '').replace(',', '.');
  } else if (lastDot >= 0) {
    var parts = s.split('.');
    if (parts.length > 2) {
      // "1.234.567" → puntos son miles
      s = s.replace(/\./g, '');
    } else if (parts[1].length === 3) {
      // "13.996" ambiguo → en contexto AR asumimos miles → 13996
      s = s.replace(/\./g, '');
    }
    // "13.99" o "13.5" → decimal: dejar tal cual
  }

  var n = parseFloat(s);
  return (isNaN(n) || !isFinite(n)) ? null : n;
}

function redondear(n) { return Math.round(n * 100) / 100; }

// Normaliza unidad_base + tamano a las 3 unidades canonicas: kg, L, u.
// Esto cubre el caso donde la IA (o el cache) devolvio "cc", "ml", "gr", etc:
//   { unidad_base: "cc", tamano: 500 }  ->  { unidad_base: "L",  tamano: 0.5 }
//   { unidad_base: "gr", tamano: 500 }  ->  { unidad_base: "kg", tamano: 0.5 }
// Tambien re-calcula la clave_canonica si la unidad cambio, para que items con
// "500cc" y "500ml" caigan en el mismo grupo (cc = mililitros = cm cubicos).
function canonizarUnidadBase(item) {
  if (!item || !item.unidad_base) return item;
  var u = String(item.unidad_base).toLowerCase().trim();
  var tamano = parseFloat(item.tamano) || 0;
  var factor = 1;
  var canon = u;

  if (u === 'cc' || u === 'ml' || u === 'mililitro' || u === 'mililitros') {
    canon = 'L'; factor = 1/1000;
  } else if (u === 'lt' || u === 'lts' || u === 'litro' || u === 'litros' || u === 'l') {
    canon = 'L'; factor = 1;
  } else if (u === 'gr' || u === 'grs' || u === 'g' || u === 'gramo' || u === 'gramos') {
    canon = 'kg'; factor = 1/1000;
  } else if (u === 'kg' || u === 'kgs' || u === 'kilo' || u === 'kilos') {
    canon = 'kg'; factor = 1;
  } else if (u === 'u' || u === 'un' || u === 'und' || u === 'uni' || u === 'unidad' || u === 'unidades' || u === 'pieza' || u === 'piezas') {
    canon = 'u'; factor = 1;
  }

  if (canon === u && factor === 1) return item; // ya estaba canonica

  var nuevoTamano = tamano > 0 ? tamano * factor : tamano;
  var nuevaClave = item.clave_canonica;
  // Reescribir la clave si terminaba en la unidad vieja (ej "coca 500cc" -> "coca 0.5L")
  if (nuevaClave) {
    var reUnidad = new RegExp('(\\d+(?:[.,]\\d+)?)\\s*' + u + '$', 'i');
    if (reUnidad.test(nuevaClave)) {
      nuevaClave = nuevaClave.replace(reUnidad, function(_, num) {
        var n = parseFloat(num.replace(',', '.')) * factor;
        // Formatear sin decimales innecesarios
        var str = (n % 1 === 0) ? String(n) : String(parseFloat(n.toFixed(3)));
        return str + canon;
      });
    }
  }

  return Object.assign({}, item, {
    unidad_base: canon,
    tamano: nuevoTamano,
    clave_canonica: nuevaClave
  });
}

function agruparPorClaveCanonica(filas) {
  var grupos = {};
  filas.forEach(function(fila) {
    var clave = fila.clave_canonica || ('_raw_' + (fila.id_original || fila.productoLista || '?'));
    if (!grupos[clave]) {
      grupos[clave] = {
        clave_canonica: clave,
        tipo: fila.tipo || '',
        tamano: fila.tamano || 0,
        unidad_base: fila.unidad_base || 'u',
        proveedores: []
      };
    }
    grupos[clave].proveedores.push({
      proveedor_id: fila.proveedor_id || '',
      proveedor_nombre: fila.proveedor_nombre || '',
      id_original: fila.id_original || '',
      nombre_original: fila.nombre_original || fila.productoLista || '',
      precio_raw: typeof fila.precio === 'number' ? fila.precio : (parsePrecio(fila.precio) || 0),
      presentacion_original: fila.presentacion_original || fila.unidad || '',
      confianza_normalizacion: fila.confianza || 1,
      m: fila.m || undefined
    });
  });
  return Object.values(grupos);
}

function calcularPrecios(grupos, resultadosModo) {
  var modoPorId = {};
  (resultadosModo || []).forEach(function(g) {
    (g.resultados || []).forEach(function(r) { modoPorId[r.id_original] = r; });
  });
  var resultado = [];
  grupos.forEach(function(grupo) {
    grupo.proveedores.forEach(function(prov) {
      var modoInfo = modoPorId[prov.id_original];
      var precio = prov.precio_raw;
      var tamano = grupo.tamano;
      var unidadBaseCalc = grupo.unidad_base;
      // Caja de porciones individuales (sachets/sobres): el precio de la lista es
      // el del bulto completo → forzar PACK y tamaño = contenido total (N×M).
      var _txtCaja = ((prov.nombre_original || '') + ' ' + (prov.presentacion_original || '')).trim() || grupo.clave_canonica || '';
      var _caja = analizarCajaIndividual(_txtCaja) || analizarCajaPorciones(prov.nombre_original, prov.presentacion_original);
      if (_caja) {
        modoInfo = { modo: 'pack', confianza: 0.9, razonamiento: 'caja de porciones individuales: precio del bulto completo' };
        tamano = _caja.total;
        unidadBaseCalc = _caja.unidad;
      }
      var precio_total = null;
      var precio_unitario = null;
      if (modoInfo) {
        if (modoInfo.modo === 'pack') {
          precio_total = precio;
          precio_unitario = (tamano && tamano > 0) ? redondear(precio / tamano) : null;
        } else {
          precio_unitario = precio;
          precio_total = (tamano && tamano > 0) ? redondear(precio * tamano) : null;
        }
      }
      resultado.push({
        id_original: prov.id_original,
        clave_canonica: grupo.clave_canonica,
        tipo: grupo.tipo,
        tamano: tamano,
        unidad_base: unidadBaseCalc,
        proveedor_id: prov.proveedor_id,
        nombre_original: prov.nombre_original,
        presentacion_original: prov.presentacion_original,
        precio_raw: precio,
        modo: modoInfo ? modoInfo.modo : null,
        precio_total: precio_total,
        precio_unitario: precio_unitario,
        confianza: Math.min(
          prov.confianza_normalizacion || 1,
          modoInfo ? (modoInfo.confianza || 0.5) : 0.5
        ),
        // Desactivado: confiamos en la decisión de Haiku siempre. El usuario
        // puede corregir manualmente con los botones 📦/⚖️ si nota algo raro,
        // pero no se le muestra ningún aviso para no generar fricción.
        revisar: false,
        precio_alto_envase_chico: modoInfo ? (modoInfo.envase_chico || false) : false,
        tamano_sospechoso: modoInfo ? (modoInfo.tamano_sospechoso || false) : false,
        razonamiento: modoInfo ? modoInfo.razonamiento : null
      });
    });
  });
  return resultado;
}

var RANGOS_PRECIO_AR = {
  // tipo -> { min, max, unidad } (precio por unidad_base canonica)
  // Rangos amplios: incluyen mayorista (low) y premium (high) para que el
  // algoritmo solo decida cuando UNA de las 2 interpretaciones (pack/unitario)
  // queda claramente fuera. Si ambas caen dentro -> ambiguo -> IA decide.
  // Calibrados con precios reales Argentina mayo 2026 (ej: aceite girasol ~$3500/L).
  'aceite girasol':   { min: 2000,  max: 6500,  unidad: 'L' },
  'aceite oliva':     { min: 10000, max: 100000, unidad: 'L' },
  'aceite maiz':      { min: 2500,  max: 8000,  unidad: 'L' },
  'aceite mezcla':    { min: 2000,  max: 6500,  unidad: 'L' },
  'vinagre':          { min: 1000,  max: 9000,  unidad: 'L' },
  'vinagre manzana':  { min: 1500,  max: 15000, unidad: 'L' },
  'aceto':            { min: 3000,  max: 60000, unidad: 'L' },
  'aceto balsamico':  { min: 3000,  max: 60000, unidad: 'L' },
  'harina':           { min: 1000,  max: 6000,  unidad: 'kg' },
  'azucar':           { min: 1200,  max: 5000,  unidad: 'kg' },
  'arroz':            { min: 2000,  max: 10000, unidad: 'kg' },
  'sal':              { min: 300,   max: 3000,  unidad: 'kg' },
  'levadura':         { min: 4000,  max: 25000, unidad: 'kg' },
  'mayonesa':         { min: 4000,  max: 18000, unidad: 'kg' },
  'mostaza':          { min: 4000,  max: 22000, unidad: 'kg' },
  'ketchup':          { min: 4000,  max: 18000, unidad: 'kg' },
  'leche':            { min: 1500,  max: 9000,  unidad: 'L' },
  'agua':             { min: 300,   max: 6000,  unidad: 'L' },
  'gaseosa':          { min: 1000,  max: 8000,  unidad: 'L' },
  'cerveza':          { min: 2000,  max: 16000, unidad: 'L' }
};

// Busca el rango típico aplicable a un tipo (matching laxo: "aceite girasol marca x"
// matchea "aceite girasol").
// Normaliza tipo para matching laxo (idempotente con _normTipo de la cache DB)
function _normTipoLite(t) {
  return String(t || '').toLowerCase().trim()
    .replace(/\b(de|del|la|el|los|las)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function rangoParaTipo(tipo, unidadBase) {
  if (!tipo) return null;
  var t = String(tipo).toLowerCase().trim();
  var tn = _normTipoLite(t);
  // 1) Match exacto (raw o normalizado)
  if (RANGOS_PRECIO_AR[t]  && RANGOS_PRECIO_AR[t].unidad  === unidadBase) return RANGOS_PRECIO_AR[t];
  if (RANGOS_PRECIO_AR[tn] && RANGOS_PRECIO_AR[tn].unidad === unidadBase) return RANGOS_PRECIO_AR[tn];
  // 2) Match por prefijo, tambien sobre el tipo normalizado (sin "de")
  var keys = Object.keys(RANGOS_PRECIO_AR);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    if (RANGOS_PRECIO_AR[k].unidad !== unidadBase) continue;
    if (t.indexOf(k) === 0 || tn.indexOf(k) === 0) return RANGOS_PRECIO_AR[k];
  }
  return null;
}

// Decide modo (pack/unitario) usando rangos tipicos del producto.
// Devuelve null si no puede decidir (tipo desconocido o ambos casos plausibles).
// Esta heurística es la que el usuario pidió: "que la IA se de cuenta sola".
function decidirModoPorRangos(grupo) {
  var propios = grupo.proveedores.filter(function(p) { return p.id_original.indexOf('ext_') !== 0; });
  if (propios.length !== 1) return null; // si hay cross-provider, mejor que decida la IA
  var precio = parseFloat(propios[0].precio_raw) || 0;
  var tamano = parseFloat(grupo.tamano) || 0;
  if (precio <= 0 || tamano <= 0) return null;
  var rango = rangoParaTipo(grupo.tipo, grupo.unidad_base);
  if (!rango) return null;

  // Calcular el precio por unidad base bajo cada interpretacion
  var siPack = precio / tamano;       // precio es total del bulto, dividi
  var siUnit = precio;                // precio ya es por unidad base

  var packEnRango = (siPack >= rango.min && siPack <= rango.max);
  var unitEnRango = (siUnit >= rango.min && siUnit <= rango.max);

  // Si solo UNA interpretacion cae en el rango tipico, decidimos sin IA
  if (packEnRango && !unitEnRango) {
    return { modo: 'pack', confianza: 0.9,
      razonamiento: 'rango ' + grupo.tipo + ': $' + siPack.toFixed(0) + '/' + rango.unidad + ' (esperado ' + rango.min + '-' + rango.max + ')' };
  }
  if (unitEnRango && !packEnRango) {
    return { modo: 'unitario', confianza: 0.9,
      razonamiento: 'rango ' + grupo.tipo + ': $' + siUnit.toFixed(0) + '/' + rango.unidad + ' (esperado ' + rango.min + '-' + rango.max + ')' };
  }
  // Ambos caen / ninguno cae => ambiguo, dejar para la IA
  return null;
}

// Normaliza un tipo para matching: minusculas, sin articulos espanoles, sin
// espacios extra. Asegura que "aceite de girasol" y "aceite girasol" matcheen.
function _normTipo(t) {
  return String(t || '').toLowerCase().trim()
    .replace(/\b(de|del|la|el|los|las)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Lookup robusto. Orden de preferencia:
//   1. Exact match (raw o normalizado sin "de/del/la/el")
//   2. Prefix match con origen='manual' (los seeds, la verdad ground-truth)
//   3. Prefix match con cualquier origen (incluye auto-learned que pueden tener
//      el brand pegado al tipo si la IA no lo limpio bien)
// La preferencia de manual evita que una fila polucionada con brand
// ("aceite de girasol canuelas") gane sobre la seed limpia ("aceite girasol").
function lookupRangoCacheado(rangosMap, tipo) {
  if (!tipo || !rangosMap) return null;
  var t = String(tipo).toLowerCase().trim();
  if (rangosMap[t]) return rangosMap[t];
  var n = _normTipo(t);
  if (n && rangosMap[n]) return rangosMap[n];
  // Prefix: buscar TODOS los matches y elegir el mejor
  var keys = Object.keys(rangosMap);
  var bestManual = null, bestManualLen = 0;
  var bestOther  = null, bestOtherLen  = 0;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var nk = _normTipo(k);
    if (!nk || n.indexOf(nk) !== 0) continue;
    var row = rangosMap[k];
    if (row && row.origen === 'manual') {
      // Entre las manual, preferir la mas especifica (mas larga)
      if (nk.length > bestManualLen) { bestManual = row; bestManualLen = nk.length; }
    } else {
      if (nk.length > bestOtherLen) { bestOther = row; bestOtherLen = nk.length; }
    }
  }
  return bestManual || bestOther || null;
}

// Factores proporcionales al precio típico: baratos varían poco (rango estrecho),
// caros varían mucho (mayorista vs premium). Evita el 0.5/2.5 fijo que flaggeaba
// productos baratos como anomalía.
function _factoresPorPrecio(p) {
  p = parseFloat(p) || 0;
  if (p < 500)   return { min: 0.5, max: 2.0 }; // 4x
  if (p < 2000)  return { min: 0.4, max: 3.0 }; // 7.5x
  if (p < 10000) return { min: 0.3, max: 4.0 }; // 13x
  return { min: 0.2, max: 5.0 };                // 25x
}

// Multiplica factor_max para envases pequeños que son proporcionalmente más caros.
// Ejemplos: aceite girasol 500mL vs bidón 5L → el chico cuesta ~2x más por litro.
// tamano ya viene en unidades canónicas (kg o L).
function factorPackPequenio(tamano, unidadBase) {
  if (!tamano || tamano <= 0) return 1.0;
  var u = (unidadBase || '').toLowerCase();
  if (u !== 'kg' && u !== 'l') return 1.0; // unidades (u) no aplica
  if (tamano <= 0.1)  return 4.0;  // ≤100g/mL: sachets, monodosis
  if (tamano <= 0.25) return 3.0;  // ≤250g/mL: frascos chicos
  if (tamano <= 0.5)  return 2.5;  // ≤500g/500mL: medio kilo/litro
  if (tamano <= 1)    return 1.8;  // ≤1kg/L
  if (tamano <= 2)    return 1.3;  // ≤2kg/L
  return 1.0;                      // ≥2kg/L: bulk → sin ajuste
}

// Calcula el rango efectivo a partir de la mediana × factor.
// tamano (opcional) activa el ajuste de envase pequeño sobre factor_max.
function rangoEfectivo(rangoRow, tamano) {
  if (!rangoRow || !rangoRow.mediana_estimada) return null;
  var fMin = rangoRow.factor_min != null ? rangoRow.factor_min : 0.5;
  var fMax = rangoRow.factor_max != null ? rangoRow.factor_max : 2.5;
  var mult = factorPackPequenio(tamano, rangoRow.unidad_base);
  return {
    min:      rangoRow.mediana_estimada * fMin,
    max:      rangoRow.mediana_estimada * fMax * mult,  // ajustado por envase chico
    maxBase:  rangoRow.mediana_estimada * fMax,          // máximo sin ajuste (bulk)
    mediana:  rangoRow.mediana_estimada,
    confiable: !!rangoRow.confiable,
    unidad:   rangoRow.unidad_base,
    multPack: mult
  };
}

// Detecta bulto vs unitario para una fila dada usando un rango cacheado.
// Devuelve {modo, confianza, razonamiento, envase_chico} o null si no se puede decidir.
// envase_chico=true indica que el precio es alto pero válido por ser envase pequeño.
function detectarPorRangoDinamico(fila, rangoRow) {
  var tamano = parseFloat(fila.tamano) || 0;
  var rango = rangoEfectivo(rangoRow, tamano > 0 ? tamano : null);
  if (!rango) return null;
  var precioRaw = parseFloat(fila.precio_raw || fila.precio) || 0;
  if (precioRaw <= 0) return null;
  var precioSiUnitario = precioRaw;
  var precioSiPack = tamano > 0 ? precioRaw / tamano : null;

  // ── Detección de tamano sospechoso (típico: OCR lee "KG" como "CC") ──────────
  // Si dividir por tamano da un precio absurdo (>500× la mediana), es casi seguro
  // que el tamano fue mal leído. Ej: "2.9CC" = 0.0029L → $10.492/0.0029 = $3.6M/L
  // En ese caso marcamos tamano_sospechoso y no usamos la interpretación PACK.
  var UMBRAL_ABSURDO = 500;
  var packEsAbsurdo = precioSiPack != null && precioSiPack > rango.mediana * UMBRAL_ABSURDO;

  var enRango     = function(v) { return v != null && v >= rango.min && v <= rango.max; };
  var enRangoBase = function(v) { return v != null && v >= rango.min && v <= rango.maxBase; };
  var uOk     = enRango(precioSiUnitario);
  var pOk     = !packEsAbsurdo && precioSiPack != null && enRango(precioSiPack);
  var uOkBase = enRangoBase(precioSiUnitario);
  var pOkBase = !packEsAbsurdo && precioSiPack != null && enRangoBase(precioSiPack);

  // confianza base depende de si el rango es confiable (3+ muestras) o provisional
  var confBase = rango.confiable ? 0.9 : 0.65;
  // true si entra en rango sólo gracias al ajuste de envase chico
  var soloXEnvaseChico = function(esUnitario) {
    return rango.multPack > 1 && (esUnitario ? (!uOkBase && uOk) : (!pOkBase && pOk));
  };

  // Si el pack da precio absurdo y unitario entra en rango → unitario pero con aviso
  if (packEsAbsurdo && uOk) {
    var ec = soloXEnvaseChico(true);
    return { modo: 'unitario', confianza: 0.45, envase_chico: ec, tamano_sospechoso: true,
      razonamiento: 'pack daría $' + Math.round(precioSiPack) + '/' + rango.unidad +
        ' (absurdo, posible error "CC" por "KG" en OCR) — tratando como unitario' };
  }

  if (uOk && !pOk) {
    var ec = soloXEnvaseChico(true);
    return { modo: 'unitario', confianza: ec ? confBase * 0.85 : confBase, envase_chico: ec,
      razonamiento: '$' + Math.round(precioSiUnitario) + '/' + rango.unidad +
        (ec ? ' (precio alto — envase chico)' : ' en rango') +
        ' (mediana $' + Math.round(rango.mediana) + ')' };
  }
  if (pOk && !uOk) {
    var ec = soloXEnvaseChico(false);
    return { modo: 'pack', confianza: ec ? confBase * 0.85 : confBase, envase_chico: ec,
      razonamiento: 'precio/u=$' + Math.round(precioSiPack) + '/' + rango.unidad +
        (ec ? ' (precio alto — envase chico)' : ' en rango') +
        ' (mediana $' + Math.round(rango.mediana) + ')' };
  }
  if (uOk && pOk) {
    // Ambos en rango → rango no alcanza para decidir; pasa a consenso/IA.
    return null;
  }
  return null;
}

// Detección por coherencia interna: agrupar filas por tipo dentro de la misma
// lista. Si hay dos tamaños muy distintos (≥2x) pero precios parecidos, el
// grande tiene precio por unidad. Sin IA, sin DB.
// Recibe un array de grupos { clave_canonica, tipo, tamano, unidad_base, proveedores }
// y devuelve un map { id_original → { modo, confianza, razonamiento } }.
function detectarPorCoherenciaInterna(grupos) {
  var porTipo = {};
  var det = {};
  grupos.forEach(function(g) {
    if (!g.tipo || !g.tamano) return;
    var k = (g.tipo + '|' + (g.unidad_base || '')).toLowerCase();
    (porTipo[k] = porTipo[k] || []).push(g);
  });
  Object.keys(porTipo).forEach(function(k) {
    var grupo = porTipo[k];
    if (grupo.length < 2) return;
    for (var i = 0; i < grupo.length; i++) {
      for (var j = 0; j < grupo.length; j++) {
        if (i === j) continue;
        var a = grupo[i], b = grupo[j];
        if (a.tamano === b.tamano) continue;
        // Tomar el primer proveedor propio de cada grupo para comparar
        var pa = (a.proveedores || []).find(function(p) { return p.id_original.indexOf('ext_') !== 0; });
        var pb = (b.proveedores || []).find(function(p) { return p.id_original.indexOf('ext_') !== 0; });
        if (!pa || !pb) continue;
        var precioA = parseFloat(pa.precio_raw) || 0;
        var precioB = parseFloat(pb.precio_raw) || 0;
        if (precioA <= 0 || precioB <= 0) continue;
        var rT = Math.max(a.tamano, b.tamano) / Math.min(a.tamano, b.tamano);
        var rP = Math.max(precioA, precioB) / Math.min(precioA, precioB);
        // Tamaños muy distintos (≥2x) pero precios parecidos (< 60% del ratio
        // de tamaños) → el grande es unitario (no escala con el tamaño)
        if (rT >= 2 && rP < rT * 0.6) {
          var grande = a.tamano > b.tamano ? a : b;
          var pGrande = a.tamano > b.tamano ? pa : pb;
          det[pGrande.id_original] = {
            clave_canonica: grande.clave_canonica,
            modo: 'unitario', confianza: 0.85,
            razonamiento: 'coherencia interna: tamaño ' + grande.tamano + '× pero precio similar a ' + (a === grande ? b.tamano : a.tamano) + '×'
          };
        }
      }
    }
  });
  return det;
}

// Defensa anti-outliers: un precio no actualiza el rango si está absurdamente
// lejos de la mediana actual. El threshold se amplía para envases chicos (ej:
// un sachets de 100mL puede costar 4x más/L que un bidón de 5L → no es outlier).
function esOutlier(precioUnit, rangoRow, tamano) {
  if (!rangoRow || !rangoRow.muestras || rangoRow.muestras === 0) return false;
  var ratio = precioUnit / rangoRow.mediana_estimada;
  var mult  = factorPackPequenio(tamano, rangoRow.unidad_base);
  return ratio > 5 * mult || ratio < 0.2;
}

function _mediana(arr) {
  if (!arr || !arr.length) return 0;
  var s = arr.slice().sort(function(x, y) { return x - y; });
  var m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function detectarModoHeuristico(grupo) {
  // Si hay 2+ proveedores propios con precios distintos → dejar para la IA (comparativa)
  var propios = grupo.proveedores.filter(function(p) { return p.id_original.indexOf('ext_') !== 0; });
  var externos = grupo.proveedores.filter(function(p) { return p.id_original.indexOf('ext_') === 0; });
  if (externos.length > 0) return null; // hay datos cross-proveedor, la IA los aprovecha mejor
  if (propios.length !== 1) return null;

  var pres = (propios[0].presentacion_original || '').trim();
  var tamano = grupo.tamano || 0;

  // ÚNICO caso 100% inequívoco: la presentación es solo la unidad SIN número
  // ("KG", "LTS", "X KG", "X LT", "BOT", "UNI"). En este caso es claro que
  // el precio es por unidad base.
  var esUnitarioPuro = /^(kg|kgs?|kilos?|lts?|litros?|l|ml|cc|grs?|gramos?|bot(?:ella)?s?|uni(?:dad(?:es)?)?|u)\s*$/i.test(pres) ||
                       /^x\s*(kg|kgs?|lt|lts?|l|g|grs?|kilos?)\s*$/i.test(pres);

  if (esUnitarioPuro) {
    return { modo: 'unitario', confianza: 0.85,
      razonamiento: 'heurístico: presentación indica unidad base (' + pres + ')' };
  }

  // TODO el resto (incluyendo "Bolsa x 25 kg", "Bidón 5lt", "x 5 lt", "500 ml")
  // es AMBIGUO: una palabra de envase no garantiza que el precio sea del bulto
  // (mayoristas suelen cotizar por kg/L aunque pongan el envase como referencia).
  // → null = la IA decide con contexto, y si no hay contexto queda "para revisar"
  return null;
}

// Detecta si el nombre del producto trae un tamaño EXPLÍCITO tipo "x 5 lt",
// "x 3 kg", "x 2750 cc". En las listas reales eso significa que el precio es el
// del bulto/envase completo (modo pack), no por kg/L. El nombre manda.
function tamanoExplicitoEnNombre(grupo) {
  var re = /\bx\s*\d+(?:[.,]\d+)?\s*(kg|kgs|kilos?|lts?|litros?|l|grs?|gramos?|g|cc|ml)\b/i;
  return (grupo.proveedores || []).some(function(p) {
    if ((p.id_original || '').indexOf('ext_') === 0) return false; // solo listas propias
    return re.test(p.nombre_original || '');
  });
}

// Resuelve el modo cuando el nombre trae tamaño explícito.
//
// Por defecto: PACK (en listas mayoristas el envase escrito en el nombre suele
// indicar el bulto completo).
//
// PERO en muchas listas HORECA/Centeno el nombre dice "x 5 kg" como referencia
// del envase y el precio está cotizado POR KG. Ej: "HARINA 000 x 25 kg" a
// $1.200 NO es el bulto entero ($240/kg sería absurdo), es precio por kilo.
//
// Por eso: si hay rango disponible, chequeamos AMBAS interpretaciones contra
// el rango antes de decidir:
//   - Pack: precio / tamano debería caer cerca del rango típico
//   - Unit: precio (sin dividir) debería caer cerca del rango típico
// Si pack queda muy por DEBAJO del piso del rango (< factor_min × mediana / 2)
// y unit cae dentro → UNITARIO. Si pack cae dentro → PACK. Si todo es ambiguo,
// PACK con confianza media (el nombre manda como tiebreaker).
function decidirPackPorTamanoExplicito(grupo, propio, rangoRow) {
  var precio = parseFloat(propio.precio_raw) || 0;
  var tamano = parseFloat(grupo.tamano) || 0;
  if (precio <= 0 || tamano <= 0) return null;
  var siPack = precio / tamano;
  var siUnit = precio;
  var rg = rangoRow ? rangoEfectivo(rangoRow, tamano) : null;

  // Tamaño sospechoso (OCR "CC" por "KG"): pack daría $/u disparatado.
  if (rg && rg.mediana && siPack > rg.mediana * 500) return null;

  if (rg && rg.min && rg.max) {
    var packEnRango = (siPack >= rg.min && siPack <= rg.max);
    var unitEnRango = (siUnit >= rg.min && siUnit <= rg.max);
    var packDemasiadoBajo = (siPack < rg.min * 0.5);  // claramente fuera por abajo

    // Caso típico HORECA: nombre dice "x 5 kg" pero precio es por kg.
    // Pack daría un $/kg muy bajo (fuera del rango), unit cae bien.
    if (packDemasiadoBajo && unitEnRango) {
      return { modo: 'unitario', confianza: 0.85,
        razonamiento: 'nombre con tamaño (' + tamano + (grupo.unidad_base || '') +
          ') pero precio coincide con rango por ' + (grupo.unidad_base || 'u') + ' → cotizado por unidad' };
    }

    // Pack cae en rango → es lo más probable, el nombre lo confirma.
    if (packEnRango) {
      return { modo: 'pack', confianza: 0.9,
        razonamiento: 'nombre con tamaño explícito (' + tamano + (grupo.unidad_base || '') + ') + pack en rango → precio del bulto' };
    }

    // Pack fuera por arriba pero unit en rango → unitario.
    if (!packEnRango && unitEnRango) {
      return { modo: 'unitario', confianza: 0.75,
        razonamiento: 'pack fuera de rango por arriba, unit en rango → cotizado por unidad' };
    }
  }

  // Sin rango: no podemos validar si pack o unitario → dejar a IA.
  return null;
}

// Detecta patron multipack en el texto. Devuelve { total, unidad } o null.
// CUIDADO: muchos productos tienen CODIGOS numericos en el nombre (ej
// "Baño Blanco Aguila 9473 x 10 kg") que NO son conteos. Por eso solo
// consideramos multipack cuando:
//   A) Hay palabra de contenedor explicita (Pack/Caja/Set/etc.) + N x M unidad
//   B) Unidad pequeña (cc/ml/gr) + N razonable (2-500) — son las que casi
//      siempre son multipack real (vitaminas, ampollas, sobrecitos)
// Para "kg" y "L" sin palabra explicita: NO tocar (riesgo de codigo).
function _multipackResultado(n, size, unit) {
  if (!n || !size) return null;
  var total, unidad;
  if (unit === 'cc' || unit === 'ml') { total = n * size / 1000; unidad = 'L'; }
  else if (unit === 'gr' || unit === 'g') { total = n * size / 1000; unidad = 'kg'; }
  else if (unit === 'kg') { total = n * size; unidad = 'kg'; }
  else if (unit === 'l' || unit === 'lt' || unit === 'lts' || unit === 'litro' || unit === 'litros') { total = n * size; unidad = 'L'; }
  else return null;
  // Sanity check: totales absurdos (> 200 kg/L) probablemente son codigos
  if (total > 200) return null;
  return { total: total, unidad: unidad };
}

function detectarMultipack(texto) {
  var s = String(texto || '');
  // Caso A: palabra explicita de contenedor antes del numero
  var contWord = '(?:pack|caja|set|lote|bandeja|carton|cart[oó]n|display|bulto|estuche|cartoneria|cart[oó]neria)';
  var reA = new RegExp('\\b' + contWord + '\\s*(?:de\\s+)?(\\d+)\\s*x\\s*(\\d+(?:[.,]\\d+)?)\\s*(cc|ml|gr|g|kg|lts?|litros?|l)\\b', 'i');
  var mA = s.match(reA);
  if (mA) {
    var rA = _multipackResultado(parseInt(mA[1], 10), parseFloat(mA[2].replace(',', '.')), mA[3].toLowerCase());
    if (rA) return rA;
  }
  // Caso B: unidad pequeña (cc/ml/gr) + N razonable (2-500)
  // Estas casi siempre son multipack real, no codigos (un codigo "200" + "8cc"
  // es muy improbable).
  var reB = /(?:^|\s)(\d{1,3})\s*x\s*(\d+(?:[.,]\d+)?)\s*(cc|ml|gr|g)\b/i;
  var mB = s.match(reB);
  if (mB) {
    var n = parseInt(mB[1], 10);
    if (n >= 2 && n <= 500) {
      var rB = _multipackResultado(n, parseFloat(mB[2].replace(',', '.')), mB[3].toLowerCase());
      if (rB) return rB;
    }
  }
  return null;
}

// Detecta CAJAS DE PORCIONES INDIVIDUALES (sachets/sobres): en las listas
// mayoristas el precio es el de la CAJA COMPLETA, no el sobrecito.
// Ej: "SAL ABEDUL INDIV. 1000 X 0.5 GR" ($11.986 la caja, no $5,99 el sobre).
// Señal: marcador INDIV/INDV/SOBR/PARES, o patrón "N x M cc/gr" con N grande
// (>=50) y M chico (<=30). Excluye el caso anidado "N CAJA (MxP)" (paréntesis).
// Devuelve { total, unidad } con el contenido total en kg/L, o null.
function analizarCajaIndividual(texto) {
  var s = String(texto || '');
  if (s.indexOf('(') >= 0) return null; // anidado → lo maneja la regla de multipack
  var m = s.match(/\b(\d{2,5})\s*(?:sobr?\w*\.?\s*|pares?\s*)?x\s*(\d+(?:[.,]\d+)?)\s*(c\s*\.?\s*c|cc|ml|gr|g)\b/i);
  if (!m) return null;
  var n = parseInt(m[1], 10);
  var size = parseFloat(m[2].replace(',', '.'));
  if (!(n >= 2) || !(size > 0)) return null;
  var esIndividual = /\b(indiv\w*|indv\w*|sobres?|sobr|pares?)\b/i.test(s);
  var esSachetGrande = n >= 50 && size <= 30;   // muchas unidades chicas = caja de sobres
  if (!esIndividual && !esSachetGrande) return null;
  var unitRaw = m[3].toLowerCase().replace(/[\s.]/g, ''); // "c.c" → "cc"
  var unidad = (unitRaw === 'cc' || unitRaw === 'ml') ? 'L' : 'kg';
  var total = n * size / 1000; // gr→kg y cc/ml→L (ambos /1000)
  if (total <= 0 || total > 300) return null;   // sanity
  return { total: total, unidad: unidad };
}

// Caja de porciones con CONTEO SEPARADO del tamaño: el tamaño por unidad está en
// el NOMBRE ("8 cc") y la cantidad de unidades viene aparte como "Caja x 200" /
// "Pack x 50" (contenedor + número, SIN unidad de peso/volumen). Ninguna de las
// dos por separado alcanza → hay que combinarlas: total = N × M.
// Ej: nombre "Aderezos Aceite Maiz 8 cc" + presentación "Caja x 200" → 1.6 L.
// Solo unidades CHICAS (cc/ml/gr/g): son las porciones individuales. Para kg/L NO
// se combina (riesgo de confundir un código de producto con un conteo).
function analizarCajaPorciones(nombre, presentacion) {
  var nom = String(nombre || '');
  var todo = (nom + ' ' + String(presentacion || '')).trim();
  if (todo.indexOf('(') >= 0) return null; // anidado "N CAJA (MxP)" → otra regla
  // Conteo: palabra de contenedor + "x" + número que NO sea un tamaño (sin unidad detrás).
  var contWord = '(?:caja|pack|display|bandeja|set|lote|bulto|estuche|cart[oó]n|carton)';
  var reCont = new RegExp('\\b' + contWord + '\\s*x\\s*(\\d{1,4})(?!\\s*(?:cc|ml|gr|g|kg|lts?|litros?|l)\\b)', 'i');
  var mCont = todo.match(reCont);
  if (!mCont) return null;
  // Tamaño por unidad: número + unidad chica, buscado en el NOMBRE.
  var mSize = nom.match(/\b(\d+(?:[.,]\d+)?)\s*(c\s*\.?\s*c|cc|ml|gr|g)\b/i);
  if (!mSize) return null;
  var n = parseInt(mCont[1], 10);
  var size = parseFloat(mSize[1].replace(',', '.'));
  if (!(n >= 2 && n <= 2000) || !(size > 0)) return null;
  var unitRaw = mSize[2].toLowerCase().replace(/[\s.]/g, ''); // "c.c" → "cc"
  var unidad = (unitRaw === 'cc' || unitRaw === 'ml') ? 'L' : 'kg';
  var total = n * size / 1000; // gr→kg y cc/ml→L (ambos /1000)
  if (total <= 0 || total > 300) return null; // sanity
  return { total: total, unidad: unidad };
}

// ============================================================================
// Nuevas funciones de la cascada de 8 pasos
// ============================================================================

// Normaliza un nombre de producto a una clave para indexar correcciones.
// Minúsculas, sin acentos, espacios colapsados.
function normalizarNombreKey(nombre) {
  return String(nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Paso 6 de la cascada: prior suave basado en el modo mayoritario de la lista.
// Solo aplica si ≥80% de las filas ya decididas (confianza ≥ 0.8) comparten modo
// y hay al menos 5 filas decididas. Devuelve decisiones para las filas indecisas.
function consensoDeLista(decididos, todosGrupos) {
  var conteo = { pack: 0, unitario: 0 };
  var idsDecididos = Object.keys(decididos);
  idsDecididos.forEach(function(id) {
    var d = decididos[id];
    if ((d.confianza || 0) >= 0.8 && (d.modo === 'pack' || d.modo === 'unitario')) {
      conteo[d.modo]++;
    }
  });
  var total = conteo.pack + conteo.unitario;
  if (total < 5) return {};
  var mayoria = conteo.pack >= conteo.unitario ? 'pack' : 'unitario';
  if (conteo[mayoria] / total < 0.8) return {};

  var resultado = {};
  todosGrupos.forEach(function(g) {
    var propios = (g.proveedores || []).filter(function(p) {
      return p.id_original.indexOf('ext_') !== 0;
    });
    propios.forEach(function(p) {
      if (!decididos[p.id_original]) {
        resultado[p.id_original] = {
          modo: mayoria,
          confianza: 0.6,
          fuente_decision: 'consenso',
          razonamiento: 'consenso de lista (' + Math.round(conteo[mayoria] / total * 100) + '% ' + mayoria + ')'
        };
      }
    });
  });
  return resultado;
}

// Orquestador puro de la cascada de 8 pasos.
// opts.memoria: { nombre_key → modo } — correcciones del usuario (paso 0)
// opts.rangosCacheados: mapa de rangos de pl_rangos_precio (paso 5-db)
// opts.skipIA: true para tests determinísticos (aplica default en vez de IA)
// Devuelve { decididos: {id_original → {modo, confianza, fuente_decision, razonamiento}},
//            paraIA: [{grupo, prov}] }
function decidirModoCascada(grupos, opts) {
  var memoria    = (opts && opts.memoria)        || {};
  var rangosCach = (opts && opts.rangosCacheados) || {};
  var skipIA     = !!(opts && opts.skipIA);

  var decididos = {};

  // Pre-computar coherencia interna (necesita todos los grupos a la vez)
  var coherencia = detectarPorCoherenciaInterna(grupos);

  grupos.forEach(function(g) {
    var propios = (g.proveedores || []).filter(function(p) {
      return p.id_original.indexOf('ext_') !== 0;
    });
    // Grupos multi-proveedor: la IA aprovecha la comparación; no decisión determinística
    if (propios.length !== 1) return;
    var p  = propios[0];
    var id = p.id_original;

    // Paso 0: Memoria de correcciones
    var nk = normalizarNombreKey(p.nombre_original || '');
    if (memoria[nk]) {
      decididos[id] = { modo: memoria[nk], confianza: 1.0,
        fuente_decision: 'memoria', razonamiento: 'corrección del usuario' };
      return;
    }

    // Paso 1: Señal del documento
    if (p.m === 'P' || p.m === 'U') {
      var modoDoc = p.m === 'P' ? 'pack' : 'unitario';
      decididos[id] = { modo: modoDoc, confianza: 0.92,
        fuente_decision: 'doc', razonamiento: 'señal explícita del documento (m=' + p.m + ')' };
      return;
    }

    // Paso 2: Heurística estructural
    var h = detectarModoHeuristico(g);
    if (h) {
      decididos[id] = Object.assign({ fuente_decision: 'heuristica' }, h);
      return;
    }

    // Paso 3: Tamaño explícito en nombre
    var rangoRow = lookupRangoCacheado(rangosCach, g.tipo);
    if (tamanoExplicitoEnNombre(g)) {
      var detExp = decidirPackPorTamanoExplicito(g, p, rangoRow);
      if (detExp) {
        decididos[id] = Object.assign({ fuente_decision: 'tamano_explicito' }, detExp);
        return;
      }
    }

    // Paso 4: Coherencia interna
    if (coherencia[id]) {
      decididos[id] = Object.assign({ fuente_decision: 'coherencia' }, coherencia[id]);
      return;
    }

    // Paso 5: Rango (solo si inequívoco — confianza > 0.5)
    var detRango = null;
    if (rangoRow) {
      detRango = detectarPorRangoDinamico({ precio_raw: p.precio_raw, tamano: g.tamano }, rangoRow);
    }
    if (!detRango) {
      detRango = decidirModoPorRangos(g);
    }
    if (detRango && (detRango.confianza || 0) > 0.5) {
      var fuenteRango = rangoRow ? 'rango_db' : 'rango_hardcoded';
      decididos[id] = Object.assign({ fuente_decision: fuenteRango }, detRango);
      return;
    }
  });

  // Paso 6: Consenso de lista
  var consenso = consensoDeLista(decididos, grupos);
  Object.assign(decididos, consenso);

  // Paso 7: IA (manejado externamente en index.html)
  // Paso 8: Default pack (solo en skipIA / test)
  var paraIA = [];
  grupos.forEach(function(g) {
    var propios = (g.proveedores || []).filter(function(p) {
      return p.id_original.indexOf('ext_') !== 0;
    });
    propios.forEach(function(p) {
      if (!decididos[p.id_original]) {
        if (skipIA) {
          decididos[p.id_original] = { modo: 'pack', confianza: 0.3,
            fuente_decision: 'default', razonamiento: 'default conservador — IA desactivada' };
        } else {
          paraIA.push({ grupo: g, prov: p });
        }
      }
    });
  });

  return { decididos: decididos, paraIA: paraIA };
}

// Detecta productos de PESO VARIABLE: se cotizan por kg pero cada pieza/barra/
// horma pesa distinto, y el peso real se confirma al recibir (el proveedor pesa
// y cobra peso × precio/kg). Ej: "barra de queso", "jamón crudo", "salame".
//
// NO son peso variable, aunque estén en modo unitario (por kg/L):
//   - Líquidos (aceite, vinagre, leche): vienen en botellas/bidones de tamaño
//     EXACTO. Un bidón de "5 LT" siempre trae 5 L. → unidadBase 'L' nunca aplica.
//   - Sólidos en envase preciso: harina/azúcar/sal/fécula en bolsa, dulce de
//     leche/mermelada en balde, levadura en paquete. La bolsa de 25kg pesa 25kg.
//
// Por eso exigimos: unidadBase 'kg' + tipo de queso/fiambre/embutido/carne.
// Es deliberadamente conservador (match positivo): ante la duda, NO lo marca,
// así no aparece la UI de pesaje en productos envasados.
function esProductoPesoVariable(tipo, nombre, unidadBase) {
  if (unidadBase !== 'kg') return false; // líquidos y unidades: tamaño exacto
  var txt = (String(tipo || '') + ' ' + String(nombre || '')).toLowerCase();
  // Envasados que igual contienen palabras de queso/fiambre → excluir explícito.
  // "queso rallado" (bolsa sellada), "queso crema/untable" (pote), "queso en
  // polvo" → precio por kg pero envase preciso, no se pesan al recibir.
  if (/\b(rallad\w*|untable|en\s*polvo|polvo)\b/.test(txt)) return false;
  if (/\bqueso\s+crema\b/.test(txt)) return false;
  // Quesos enteros, fiambres, embutidos y carnes vendidos por pieza/peso.
  var re = /\b(queso|mozzarella|muzzarella|muza|cremoso|sardo|reggianito|reggiano|provolone|provoleta|fontina|gouda|pategr[aá]s|parmesano|gruyere|gruy[eè]re|emmental|roquefort|azul|port\s*salut|tybo|barra|horma|fiambre|jam[oó]n|salame|salam[ií]n|mortadela|bondiola|panceta|lomo|paleta|leberwurst|morcilla|chorizo|longaniza|salchich[oó]n|matambre|peceto|nalga|carne|pollo|milanesa|bondiola)\b/;
  return re.test(txt);
}
