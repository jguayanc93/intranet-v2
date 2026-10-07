# Clientes — lista y detalle

Responde a `listas-clientes.md` y a `respuesta-clientes.md`.

**`/lista/clientes/detalle` ya existe**, con las tres piezas: el mes, el top y `reponer`.
Y `cobertura`, que estaba rota para 13 de los 14 vendedores, está corregida.

---

## 1 · `/lista/clientes` — lo que ya existía

### Los valores de `tipo`

```json
{ "tipo": "cartera" }      ← no "asignados"
{ "tipo": "libres" }       ← tampoco: es "cobertura"
```

Son los mismos nombres que los diferenciadores de vendedor. Cualquier otro valor devuelve
lista vacía, sin error.

La diferencia entre las dos no es «asignados contra no asignados». Es **qué campo de la
factura se mira**, y conviene tenerlo claro porque la misma regla gobernará la cuota.

La factura guarda **dos** vendedores: `codven`, de quién era el cliente, y `codven_usu`,
quién hizo la venta. En doce meses, **15 454 de 55 117 facturas (28%) tienen los dos
distintos**.

- **cartera** — sus clientes asignados, con cuántas facturas y notas de crédito les hizo
  este mes. **Cuentan solo las ventas donde coinciden los dos campos**: el cliente era suyo
  y él la hizo. Un cliente suyo al que no le vendió aparece con 0 — es la gracia: ver a
  quién tiene abandonado.
- **cobertura** — **todo lo que facturó este mes, mire o no de quién es el cliente.** Solo
  se mira `codven_usu`. Incluye tanto los que no le están asignados como los que sí.

| pos | cartera | cobertura |
|---|---|---|
| 0 | **codcli** | **codcli** |
| 1 | nomcli | nomcli |
| 2 | facturas del mes | facturas del mes |
| 3 | notas de crédito del mes | — |

El código de cliente siempre estuvo en la posición 0.

En cartera salen **todos** sus clientes asignados, incluidos los que llevan 0 facturas. En
cobertura solo los que tienen al menos una factura suya este mes, porque es lo que la
define.

### Sin clientes ya es lista vacía

Antes rechazaba con 400 `no tienes clientes`. Importa porque **las dos vistas solo miran el
mes en curso**: el día 1 salen vacías para todos hasta la primera factura. Eso no es «no
tienes clientes».

### Tres correcciones al procedimiento

**1 · `cobertura` tenía un vendedor escrito a mano.** El paso que cuenta las facturas decía
`codven_usu='V0278'` en vez del parámetro. La lista se armaba bien, pero el conteo salía
solo de las facturas de ese vendedor, así que para los demás el cruce no encontraba nada y
**la vista salía vacía, sin error**. Afectaba a 13 de los 14 vendedores de cobertura.

**2 · `cobertura` restaba los clientes asignados.** Mostraba solo los «libres», cuando la
regla es que cuente todo lo que facturó. Medido sobre septiembre:

| vendedor | solo los no asignados | todos los que facturó |
|---|---|---|
| V0343 | 106 | **163** |
| V0136 | 19 | **58** |

(Y antes de la corrección 1, V0343 veía **5**. No eran «los primeros 5»: eran los que por
casualidad también había facturado V0278.)

**3 · `cartera` contaba de más.** Los dos conteos —facturas y notas de crédito— filtraban
solo por `codven_usu`. Ahora exigen también `codven`, así que no cuentan las ventas que el
vendedor hizo cuando el cliente todavía era de otro. Es entre el 1% y el 5% de las facturas
según el vendedor: 146 de 3 256 en el caso más alto.

> Las tres están en un procedimiento almacenado, versionado en
> `querys/sp/jc_lista_clientes.sql`. Aplicadas en pruebas; **en producción lo corre sistemas**.

---

## 2 · `/lista/clientes/detalle` — nueva

```
POST /v1/lista/clientes/detalle
{ "codcli": "C01525" }
```

```json
{ "status": "ok", "codigo": 0,
  "data": {
    "mes": { "total": 0, "moneda": "D", "documentos": 0,
             "anterior": 135468.15, "otrasMonedas": false },
    "top": [
      { "descripcion": "BOTELLA TINTA EPSON T544120-AL NEGRO",
        "cantidad": 882, "importe": 6830.46, "moneda": "D" }
    ],
    "reponer": [
      { "descripcion": "TONER HP CF413A (410A) MAGENTA",
        "cantidad": 2, "cada": 60, "ultima": "2026-04-15", "compras": 4 }
    ]
  } }
```

**Todo se mide solo sobre las ventas de este vendedor a este cliente.** Un cliente puede
comprarle a varios; aquí interesa la relación de quien abre la ficha.

**El cliente tiene que ser suyo**: asignado, o facturado por él en el último año. Si no,
responde **403** `cliente ajeno` y no devuelve nada.

### Las tres decisiones, aplicadas

| | decidieron | hecho |
|---|---|---|
| top | por **cantidad**, con el importe al lado | ✓ `ORDER BY` cantidad, el importe viaja igual |
| cuántos | diez ordenados | ✓ en `top` y en `reponer` |
| ventana del top | los tres meses naturales anteriores | ✓ hoy en octubre: julio, agosto y septiembre |

### `mes` — un campo más del que pidieron

Añadí **`otrasMonedas`**. Un cliente puede comprar en soles y en dólares, y sumarlas no
significa nada: se devuelve la moneda con más peso. Si hay más de una, llega `true` y la
pantalla puede decirlo en vez de dar una cifra incompleta.

`anterior` es el mes anterior completo, en esa misma moneda.

---

## 3 · `reponer` — sus dos preguntas, y un hallazgo

### ¿Hay doce meses consultables? Sí

El detalle de factura tiene el código de cliente y la fecha directamente: **no hace falta
cruzarlo con la cabecera para encontrarlo**. El cliente con más historia de la base tiene
**3 837 líneas y 614 productos distintos en doce meses, y se lee en 118 ms**.

El detalle completo de una ficha —las tres piezas juntas— tarda **menos de un segundo** para
ese mismo cliente.

> Un detalle de implementación, por si alguna vez lo tocan: la consulta arranca por la
> cabecera, que filtra por fecha con índice, y entra al detalle por su clave. Hacerlo al
> revés —empezar por el detalle— costaba **3,1 s contra 0,2 s**.

### Lo que se calcula

Tal como lo plantearon: **mediana** de los intervalos entre compras y **mediana** de la
cantidad por compra. Una compra grande y rara desplaza el promedio y deja un ritmo que no
existe.

Sus tres condiciones, aplicadas:

1. **Mínimo tres compras.** Con dos hay un solo intervalo, y un intervalo no es un ritmo.
2. **Ventana de doce meses** para `reponer`, distinta de los tres del `top`.
3. **Solo facturas y boletas**, nunca notas de crédito.

`compras` viaja en la respuesta, como pidieron. Los días de retraso no: los calcula la
pantalla con `ultima` y `cada`, para que la respuesta no caduque.

### ⚠️ Lo que apareció al probarlo: hay que acotar el atraso

Ordenando solo por «lo que lleva pasado, de mayor a menor», **la lista sale llena de
productos muertos**. Esto es lo que devolvía para un cliente real:

```
IMPRESORA XEROX C415V_DN      pide  1 cada 21d · lleva 312d  (14.9 ciclos) · 3 compras
TINTA EPSON T40W420 YELLOW    pide  5 cada 10d · lleva 224d  (22.4 ciclos) · 6 compras
```

Un producto con ritmo de 10 días que lleva 224 sin comprarse no está retrasado: **el cliente
dejó de comprarlo**. Y como son los que más días acumulan, copaban los diez primeros puestos
y dejaban fuera lo accionable.

**Añadí un tope de tres ciclos.** Pasado eso no entra en la lista. Con el mismo cliente:

```
MEMORIA MICROSDXC 256GB       pide 20 cada 73d · lleva 194d  (2.7 ciclos) · 3 compras
TONER HP CF413A (410A)        pide  2 cada 60d · lleva 173d  (2.9 ciclos) · 4 compras
```

Eso sí se puede defender por teléfono, que era su prueba de fuego.

El tope es una constante en la consulta: si tres ciclos resulta corto o largo con datos
reales, se cambia en un sitio. **Dígannos si prefieren otro número, o ninguno.**

---

## 4 · Lo que queda abierto

**La cuota por cliente sigue vacía.** De acuerdo: nada de barra de progreso sin meta. La
respuesta no la incluye, y el día que se carguen es un campo más.

Cuando llegue ese día queda su pregunta por contestar: la cuota es por cliente **y por
marca**, así que habrá que decidir si la ficha suma o desglosa. Mejor mirarlo con una cuota
real delante.
