# Ver cotización — lo que falta para rediseñarla

La pantalla **Ver cotización** cambia por un pedido de los vendedores. Hoy pide el
número a mano; va a pasar a ofrecer **la lista de las cotizaciones del día** y, al
elegir una, mostrar su detalle y permitir **guardarla en PDF** para enviársela al
cliente.

Este documento lista solo lo que **no se puede resolver desde el frontend**. Todo lo
demás ya está en marcha.

---

## Lo que se va a construir

```
[ Mis cotizaciones de hoy ]          ← lista: cliente, monto y moneda
         │
         ├─ (clic en una)  →  detalle de sus productos
         │
         └─ [ Guardar PDF ]          ← documento para el cliente
```

El PDF se genera con la impresión del navegador, sin librerías: el mismo botón sirve
para guardar el archivo o compartirlo desde el móvil.

---

## 1 · La lista del día — falta su contrato

En `caminos/rutas.js` existen dos rutas que parecen ser esto:

```
/lista/cotis
/lista/cotisxdia
```

Pero no sé qué esperan ni qué devuelven, así que la pantalla no se puede conectar.

**Preguntas:**

- ¿`/lista/cotisxdia` es la correcta para «mis cotizaciones de hoy»? ¿Qué cuerpo espera —
  una fecha, un rango, nada— y cómo filtra por vendedor: por el `codven` de la galleta,
  o hay que mandarlo?
- ¿Se le puede pedir **dos días** en vez de uno? La pantalla abre con las de hoy y deja
  ampliar a dos si el vendedor no encuentra la que busca.
- ¿Qué devuelve por cada cotización? Lo que la lista necesita es poco:

  | dato | para qué |
  |---|---|
  | número con serie | identificar y pedir el detalle |
  | razón social del cliente | es por lo que el vendedor la reconoce |
  | monto total | para distinguirlas de un vistazo |
  | moneda | `D` o `S` |
  | fecha y hora | ordenarlas, la última primero |

> Si ya devuelve más de eso, no hace falta recortarlo: el frontend toma lo que usa.

---

## 2 · El documento para el cliente — faltan seis datos

El formato que piden los vendedores es el de la cotización impresa de siempre.
Contrastándolo contra lo que hoy devuelve `/cotizacion/read`:

### Lo que ya llega y alcanza

| columna del documento | de dónde sale |
|---|---|
| CODIGO | posición 11 (`partnumber`) |
| MARCA | posición 12 |
| DESCRIPCION | posición 14 |
| U.M. | posición 13 |
| CANT. | posición 15 |
| ITM | el orden de la línea; lo numera el frontend |
| **Precio LISTA** | posición 16 (`precioUnitario`) |
| **Precio DSCTO** | se calcula: `precio × (1 − descuento/100)`, con el descuento de la posición 18 |
| TOTAL | posición 17 (`importe`) |
| VALOR VENTA · IGV · TOTAL NETO | de las posiciones 17 y 19 |
| FECHA, número, moneda | posiciones 1, 3 y 6 |

Comprobado con un caso real del documento: `79.710` con 5 % da `75.720`, y
`109.060` con 5 % da `103.610`. La fórmula es correcta.

### Lo que no llega

| dato | hoy | nota |
|---|---|---|
| **SEÑOR** (razón social) | solo llega el **código** del cliente en la posición 4 | hoy se resuelve con `/cliente/id`, que es una llamada extra por cotización |
| **DIRECCION** | no llega | |
| **ATTE** | no llega | **es un campo guardado de la cotización**, así que debería venir en esta misma respuesta |

> Teléfono, fax, la fecha de llegada por línea y **REFERENCIA** salieron del formato:
> ya no se piden. Solo quedan estos tres.

**La petición concreta:** que `/cotizacion/read` devuelva en la cabecera, en posiciones
nuevas **al final**, estos tres:

| dato | de dónde sale |
|---|---|
| razón social del cliente | ya se resuelve con `/cliente/id`, pero cuesta una llamada |
| dirección del cliente | |
| **ATTE** | es de la propia cotización |

Al ir al final no se mueve ninguna de las posiciones que ya se leen, y se ahorra la
segunda llamada a `/cliente/id` por cada cotización que se abra.

Si no, se queda como está hoy: la razón social se resuelve con `/cliente/id` y la
dirección no se dibuja. Funciona, pero son dos llamadas por cotización y el documento
sale sin la dirección del cliente.

## 3 · El RUC y los datos de la empresa

El encabezado lleva el RUC de Compudiskett, su dirección y su teléfono. Son fijos y no
cambian por cotización, así que **los escribo en el frontend** salvo que prefieran que
viajen en la respuesta.

**Pregunta:** ¿se quedan fijos, o hay más de una razón social emisora?

---

## Estado del frontend

Ya está hecho y probado:

- **El documento y su impresión a PDF.** La tabla se arma con las líneas que traiga la
  cotización, sean las que sean; el número sale de la propia cotización; y el pie dice
  «EN : DOLARES AMERICANOS» o «EN : SOLES» según su moneda.
- **El detalle**, que funciona con `/cotizacion/read`.
- **La lista**, montada y esperando solo el contrato del punto 1.

Lo que quede sin dato no se dibuja, y aparece en cuanto el backend lo mande.

### Un detalle de la columna de precios

Las tres cifras decimales de `Precio LISTA` y `Precio DSCTO` son **dos decimales con un
cero de relleno**, no tres decimales reales. Y el precio con descuento se redondea a
céntimos antes de mostrarse: `79.71` con 5 % da `75.7245`, y el documento de siempre
dice `75.72`.

Lo comprobamos contra las seis filas distintas del documento de ejemplo. Se menciona
porque si el backend algún día manda ese precio ya calculado, conviene que lo haga con
el mismo redondeo.
