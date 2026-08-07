# Tests

Correr todo:

```bash
npm install   # solo la primera vez (instala jsdom)
npm test
```

## Qué cubre cada suite

| Suite | Qué prueba | Necesita |
|---|---|---|
| `run-golden.js` | Detección de modo (pack/unitario) contra 76 filas reales anotadas de 4 proveedores. Mide el % de acierto de la cascada. | nada |
| `run-pedidos.js` | Funciones puras de `app/pipeline.js`: atribución de gasto por fecha, gasto del mes, diccionario de fiambrería, marcador "precio por kilo". | nada |
| `run-flujos.js` | **Flujos completos de la app**: monta `app/index.html` en un DOM simulado (jsdom) con Supabase y la red interceptados, y recorre comparador → pedido → recepción → calendario → métricas. | jsdom |

`harness.js` no es una suite: es el andamio que monta la app. Ejecuta el
**código real** de `index.html`; solo reemplaza lo de afuera (base de datos,
red, `confirm`/`prompt`). Por eso los tests de flujo detectan bugs de DOM y de
integración, no solo de lógica.

## Qué NO cubren

- La extracción de listas con IA (necesita credenciales y gasta dinero).
- La persistencia real en Supabase (el harness usa una base en memoria).
- El aspecto visual / CSS.

Eso se verifica a mano en el entorno desplegado.

## Regla al arreglar un bug

Antes de dar por bueno un arreglo, **re-introducí el bug a propósito y confirmá
que algún test falla**. Un test que no falla cuando el bug vuelve no está
probando nada. Los cuatro bugs reportados en producción (ids duplicados del
selector de columnas, campo de peso ausente en fiambres envasados, fantasma en
el calendario, y el modo "por kilo" sin detectar en el nombre) tienen su test
verificado de esa forma.
