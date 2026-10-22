# Grupo 25 — Reportes por marca

Contrato de los reportes por marca del grupo 25: **stock, tiempo en almacen, lista de precios y
guias**. Todo lo de este documento esta implementado y probado en bdnava08: rutas, permisos,
JSON y Excel.

> **Actualizado el 19/10/2026**, en respuesta a [respuesta-reportes.md](respuesta-reportes.md).
> Cambios respecto a la version anterior:
> - **Nuevo informe de Guias** (seccion 4, «Guias»).
> - `GET /reporte/marca` trae `productos` por marca (seccion 3).
> - El Excel: las celdas sin dato llevan un texto, las fechas son fechas de Excel y los
>   importes numeros con dos decimales (seccion 4, «Respuesta con xlsx»).
> - El nombre del especialista (`dueno.nombre`) es el mismo que en `/marcas`.
> - Definiciones de «disponible» y «valor venta» (seccion 4).
> - Respuestas a sus secciones 4 a 6: seccion 6.

**Las rutas antiguas (`/reporte/marcas`, `/stoc`, `/tiempo`, `/precios`) se retiraron el
21/10/2026**: responden `404`. Como backend y frontend salen el mismo dia, `reporte.html` deja de
usarse en esa misma salida.

---

## 1 · Reglas

**Que marcas entran** (siempre las del mes en curso):

| quien | ve |
|---|---|
| especialista | las marcas que **tiene asignadas** este mes, **las haya confirmado o no**. Si la jefatura le dio una y aun no confirmo, cuenta |
| jefatura | **las suyas y las de sus especialistas**: las marcas asignadas este mes que son de su familia. No entran las de su familia que nadie tiene, ni las marcas de otra familia que tenga uno de sus especialistas |

Sin marcas en el mes no ve nada, ni las del mes pasado: lista vacia con aviso (ver 3). Es una
regla de negocio.

**La marca va por `codmar`.** El backend comprueba que este entre las que puede consultar; si
no, `403 marca no disponible`.

**Ver y exportar:** la misma ruta con `formato`, `"json"` (por defecto) o `"xlsx"`.

**Volumen:** la marca mas grande tiene 712 productos y stock, tiempo y precios responden en
menos de 1 segundo; guias, con el maximo de 3 meses de la marca con mas movimiento (HP, unas
12 300 lineas), en pocos segundos. No hay paginacion: llega todo.

**Errores:** siempre el JSON de siempre `{ status, codigo, msg }`, nunca un archivo. El nombre
del archivo lo pone el servidor en `Content-Disposition`, expuesto por CORS.

**Permisos:** solo grupo 25. Solo lectura: no se auditan.

---

## 2 · Rutas

| ruta | para que |
|---|---|
| `GET  /v1/reporte/marca` | las marcas que puede consultar |
| `POST /v1/reporte/marca/stock` | stock de una marca |
| `POST /v1/reporte/marca/tiempo` | tiempo en almacen de una marca |
| `POST /v1/reporte/marca/precios` | lista de precios de una marca |
| `POST /v1/reporte/marca/guias` | guias de una marca en un periodo |

Ojo con los nombres: `/reporte/marca` (singular) es la nueva; `/reporte/marcas` (plural) es la
antigua.

---

## 3 · `GET /v1/reporte/marca`

```json
{ "status":"ok", "codigo":0, "data": {
    "anno": 2026, "mes": 10, "rol": "JEFATURA",
    "marcas": [
      { "codmar":"0124", "abrmar":"ACER", "nombre":"ACER", "codfam":"09", "familia":"ALMACENAMIENTO EXTERNO",
        "productos": 31,
        "dueno": { "codusu":"071", "nombre":"COSSIO JOANNA", "soyYo":true } },
      { "codmar":"0032", "abrmar":"ADATA", "nombre":"ADATA", "codfam":"09", "familia":"ALMACENAMIENTO EXTERNO",
        "productos": 76,
        "dueno": { "codusu":"233", "nombre":"HUARANCCA SAMUEL", "soyYo":false } }
    ]
} }
```

- Ordenadas por nombre.
- `productos`: productos vigentes de la marca, que son las filas que traeran stock y precios.
  `0` = marca sin productos vigentes.
- `dueno` sirve a la jefatura para agrupar o filtrar por especialista: **por `codusu`**. El
  nombre es el mismo que en `/marcas`, pero el `codusu` es lo estable.

| http | status | cuando |
|---|---|---|
| 200 | `sin marcas del mes` | no tiene marcas este mes. Viene en el primer nivel, sin `data`: `{"status":"sin marcas del mes","codigo":0,"msg":"...","debeAsignar":true,"marcas":{}}`. Mostrar el aviso con el boton a Marcas |
| 400 | `no identificado` | no esta registrado en la intranet |
| 403 | `sin permiso` | no es del grupo 25 |

---

## 4 · Los informes

Se piden igual:

```json
{ "codmar": "0008", "formato": "json" }
```

`formato` es `"json"` (o se omite) o `"xlsx"`; mayusculas o minusculas da igual. Guias acepta
ademas `desde` y `hasta` (ver «Guias»).

### Respuesta con `formato: "json"`

```json
{ "status":"ok", "codigo":0, "data": {
    "informe": "stock",
    "marca": { "codmar":"0008", "abrmar":"EPSON", "nombre":"EPSON", "familia":"SUMINISTROS" },
    "anno": 2026, "mes": 10,
    "generado": "2026-10-19T15:14:03.512Z",
    "columnas": [ { "campo":"codi", "titulo":"CODIGO" }, { "campo":"codf", "titulo":"CODF" }, ... ],
    "filas": [ { "codi":"0505-012851", "codf":"TIET01C100", "descripcion":"BOLSA DE TINTA T01C100 NEGRO", ... } ]
} }
```

- `columnas` va en el orden del Excel; `titulo` es el mismo encabezado. La pantalla puede
  ocultar u ordenar distinto (por ejemplo, sin `CODIGO`): el Excel conserva todas.
- `filas` puede venir vacia: no es error.
- Los numeros llegan como numeros; las fechas como `"AAAA-MM-DD"`. Un valor que no existe
  llega `null` (ver cada informe).

### Respuesta con `formato: "xlsx"`

El archivo, con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
y `Content-Disposition: attachment; filename="stock-EPSON-2026-10.xlsx"`. Guias lleva el
periodo: `guias-EPSON-2026-10-01_2026-10-31.xlsx`.

Una hoja con el nombre del informe, los mismos titulos y el mismo orden de columnas que el JSON:

- **Fechas** como fechas de Excel (formato `dd/mm/yyyy`), no como texto: se pueden ordenar.
- **Importes** como numeros con formato `#,##0.00`.
- **Celdas sin dato**: llevan un texto que explica por que, en vez de quedar vacias:

| informe | campo | texto en la celda |
|---|---|---|
| tiempo | `ultimaCompra` | `SIN COMPRA DESDE 2023` (el año es `kardexDesde`); `dias` queda vacia |
| precios | `costoMym`, `ventaMym` | `SIN ALTA EN M&M` |

**Como distinguir un error de un archivo:** el error llega con `Content-Type: application/json`
y su codigo http (400/403...). Si el `Content-Type` no es el de la hoja, no guardarlo.

### Stock — `POST /v1/reporte/marca/stock`

Todos los productos vigentes de la marca, ordenados por descripcion.

| campo | titulo | que es |
|---|---|---|
| `codi` | CODIGO | codigo interno |
| `codf` | CODF | codigo de fabrica |
| `descripcion` | DESCRIPCION | |
| `partNumber` | PART NUMBER | |
| `familia` | FAMILIA | familia del producto |
| `principal` | PRINCIPAL | disponible en almacen 01 |
| `mym` | M&M | disponible en almacen 08 |
| `piura` | PIURA | disponible en almacen 15 |
| `chorrillos` | CHORRILLOS | disponible en almacen 16 |
| `total` | TOTAL | suma de los cuatro |
| `ordenado` | ORDENADO | unidades pedidas **al proveedor** que aun no llegan, en los cuatro almacenes |

**Disponible** = stock fisico − lo reservado por **pedidos de clientes** − lo **facturado que aun
no sale del almacen**. Las dos reservas son temporales: se liberan cuando el pedido se factura o
cuando la factura tiene su salida.

**Puede ser negativo** cuando lo reservado supera al fisico (pasa en datos reales); mostrarlo tal
cual. Un almacen donde el producto no esta dado de alta cuenta 0.

Ejemplo real (EPSON `0008`): dos filas de `data.filas`, una con stock negativo y otra con stock
solo en Piura:

```json
[
  { "codi":"0505-012851", "codf":"TIET01C100", "descripcion":"BOLSA DE TINTA T01C100 NEGRO",
    "partNumber":"T01C100", "familia":"SUMINISTROS",
    "principal":-3, "mym":0, "piura":0, "chorrillos":0, "total":-3, "ordenado":10 },
  { "codi":"0505-012841", "codf":"TIET554120-AL", "descripcion":"BOTELLA EPSON T554120-AL NEGRO PIGMENTADO L8160",
    "partNumber":"T554120-AL", "familia":"SUMINISTROS",
    "principal":0, "mym":0, "piura":2, "chorrillos":0, "total":2, "ordenado":63 }
]
```

### Tiempo en almacen — `POST /v1/reporte/marca/tiempo`

Solo los productos **con stock** (`total` de los cuatro almacenes mayor que 0).

| campo | titulo | que es |
|---|---|---|
| `codi`, `codf`, `descripcion`, `partNumber`, `familia` | | igual que en stock |
| `stock` | STOCK | disponible total de los cuatro almacenes |
| `ultimaCompra` | ULTIMA COMPRA | fecha de la ultima compra |
| `dias` | DIAS | dias desde esa compra hasta hoy |

- Los dias se cuentan **desde la ultima compra** (en el pais o en el exterior). Las
  devoluciones de clientes, los ajustes de inventario y la proteccion de precio **no**
  reinician la cuenta: una devolucion de una unidad haria parecer recien llegado un stock de
  meses.

  Ejemplo real (16/10/2026): el CELULAR IPRO K2 3G (`1201-070014`, marca IPRO `0168`) tiene
  2 336 unidades, su ultima compra fue el 16/01/2026 y tuvo devoluciones de clientes en
  junio, agosto y octubre. El informe dice **273 dias**, no 14.
- **No hay umbral de «stock viejo»**: el informe es para conocer la antiguedad, no para marcar
  nada. No destacar filas.
- Se revisan las compras del año en curso y los tres anteriores. El año desde el que se reviso
  viene en `data.kardexDesde` (hoy 2023).
- Si no hay compra en esos años, `ultimaCompra` y `dias` llegan **`null`**: mostrarlo como
  «sin compra desde *kardexDesde*».
- Orden: primero los `null`, luego del mas antiguo al mas reciente.

Ejemplo real (RICOH `0130`, `data.kardexDesde` = 2023): un producto sin compra en los años
revisados y otro con compra:

```json
[
  { "codi":"0506-060420", "codf":"TORIAD041161", "descripcion":"CLEANING BLADE RICOH AD041161",
    "partNumber":"AD041161", "familia":"SUMINISTROS",
    "stock":1, "ultimaCompra":null, "dias":null },
  { "codi":"0506-015320", "codf":"TORI841921", "descripcion":"TONER RICOH CYAN MP C2503/ C2003 / C2004 (841921) 9,500 PAGINAS",
    "partNumber":"841921", "familia":"SUMINISTROS",
    "stock":2, "ultimaCompra":"2026-04-16", "dias":186 }
]
```

En el Excel, la primera fila lleva `SIN COMPRA DESDE 2023` en ULTIMA COMPRA y DIAS vacia.

### Lista de precios — `POST /v1/reporte/marca/precios`

Todos los productos vigentes de la marca, ordenados por descripcion. **En dolares y sin IGV.**

| campo | titulo | que es |
|---|---|---|
| `codi`, `codf`, `descripcion`, `partNumber`, `familia` | | igual que en stock |
| `costoPrincipal` | COSTO PRINCIPAL US$ | costo en almacen 01 |
| `ventaPrincipal` | VALOR VENTA PRINCIPAL US$ | valor de venta en almacen 01 |
| `costoMym` | COSTO M&M US$ | costo en almacen 08 |
| `ventaMym` | VALOR VENTA M&M US$ | valor de venta en almacen 08 |

- **Valor venta** es el **precio de lista** del producto, sin IGV y **antes** del descuento que
  se aplica en la cotizacion segun el tipo de cliente. No corresponde a ningun cliente en
  particular.
- **El costo se queda**: decision de negocio, las jefaturas y especialistas lo necesitan.
- Los precios **cambian segun el almacen**, por eso M&M va aparte. Si el producto no esta dado
  de alta en M&M, `costoMym` y `ventaMym` llegan `null` («—»). Un `0` es un precio real en 0.

Ejemplo real (EPSON `0008`): un producto con precio en los dos almacenes y otro sin alta en M&M:

```json
[
  { "codi":"0505-012851", "codf":"TIET01C100", "descripcion":"BOLSA DE TINTA T01C100 NEGRO",
    "partNumber":"T01C100", "familia":"SUMINISTROS",
    "costoPrincipal":29.54, "ventaPrincipal":32.28, "costoMym":29.54, "ventaMym":32.28 },
  { "codi":"0505-012960", "codf":"TIEC12C937181", "descripcion":"TANQUE DE MANT. EPSON C12C937181 AM-C4000/5000/6000",
    "partNumber":"C12C937181", "familia":"SUMINISTROS",
    "costoPrincipal":31.66, "ventaPrincipal":37.25, "costoMym":null, "ventaMym":null }
]
```

### Guias — `POST /v1/reporte/marca/guias`

Los productos de la marca que salieron (o estan por salir) en guias, en un periodo.

```json
{ "codmar": "0049", "desde": "2026-07-01", "hasta": "2026-09-30", "formato": "json" }
```

- `desde` y `hasta` son opcionales, en `"AAAA-MM-DD"`. Sin ellas: **el mes en curso completo**.
  Con solo una, la otra toma el borde del mes en curso.
- **Maximo 3 meses** (92 dias) entre las dos. Fuera de eso: `400 rango invalido`.
- La respuesta trae ademas `data.desde` y `data.hasta`: el periodo que se uso de verdad.

**Que guias entran:**

- **Guias de remision** (`GUIA REMISION`) y **notas de despacho del local** (`NOTA DE DESPACHO`).
  Ningun otro documento.
- **Las anuladas no entran.**
- Todos los motivos de la guia de remision: venta, traslado entre almacenes, devoluciones... El
  motivo va en su columna.

**Una fila por producto de la marca dentro de cada guia.** Si una guia lleva productos de tres
marcas, solo salen las lineas de la marca pedida. Para ver «las guias» la pantalla puede agrupar
por `numero`. Orden: la mas reciente primero.

Ejemplo real: la guia `T009-0079891` lleva un CPU AMD, una motherboard GIGABYTE y un SSD LEXAR.
Pedida para GIGABYTE (`0049`), sale una sola fila:

```json
{ "fecha":"2026-10-05", "tipo":"GUIA REMISION", "numero":"T009-0079891",
  "estado":"PENDIENTE DE SALIDA", "motivo":"VENTA DE PRODUCTOS", "almacen":"01",
  "cliente":"HWT COMPUTERS E.I.R.L.", "referencia":"FACTURA", "numeroReferencia":"F009-0650588",
  "codi":"0606-030139", "codf":"MBGIA520MKV2",
  "descripcion":"MOTHERBOARD GIGABYTE AMD AM4 A520M K V2", "cantidad":5 }
```

| campo | titulo | que es |
|---|---|---|
| `fecha` | FECHA | fecha de la guia |
| `tipo` | TIPO | `GUIA REMISION` o `NOTA DE DESPACHO` |
| `numero` | NUMERO | serie y numero |
| `estado` | ESTADO | `CON SALIDA` (ya salio del almacen) o `PENDIENTE DE SALIDA` (la guia existe pero aun no tiene su salida) |
| `motivo` | MOTIVO | `VENTA DE PRODUCTOS`, `TRASLADO ESTAB.CIA`, `DEVOLUCION A PROVEED`... (texto del ERP) |
| `almacen` | ALMACEN | codigo del almacen de salida (`01`, `08`, `15`...) |
| `cliente` | CLIENTE | a quien va |
| `referencia` | DOC. REFERENCIA | tipo de documento de origen: `FACTURA`, `BOLETA VTA`, `PEDIDOS`. `null` si no tiene |
| `numeroReferencia` | NRO. REFERENCIA | su numero. `null` si no tiene |
| `codi` | CODIGO | codigo interno del producto |
| `codf` | CODF | codigo de fabrica |
| `descripcion` | DESCRIPCION | |
| `cantidad` | CANTIDAD | unidades de ese producto en la guia |

**Sin importes**: la guia no muestra valores.

### Errores

| http | status | cuando |
|---|---|---|
| 400 | `codmar invalido` | falta `codmar` o no tiene 4 digitos |
| 400 | `formato invalido` | `formato` no es json ni xlsx |
| 400 | `rango invalido` | solo guias: fecha mal escrita o inexistente, `desde` posterior a `hasta`, o mas de 3 meses |
| 403 | `marca no disponible` | la marca no esta entre las que puede consultar este mes. **Tambien si no tiene ninguna marca**: con un `codmar` en la mano, la respuesta es esta y no `sin marcas del mes` |
| 400 | `no identificado` | no esta registrado en la intranet |
| 403 | `sin permiso` | no es del grupo 25 |
| 401 | `falsa galleta` | sin sesion |

---

## 5 · Lo que cambio respecto a la pantalla antigua

- **Tiempo estaba mal en 2026.** El calculo antiguo solo miraba las compras de 2023 a 2025: a
  3 181 productos con compras este año les daba dias de una compra anterior, o 0. El informe
  nuevo esta bien; el de `/reporte/tiempo` (la ruta antigua) sigue con el error hasta que se
  retire.
- **Stock suma Piura y Chorrillos** y trae un total. El antiguo solo tenia Principal y M&M.
- **La marca va por `codmar`.** Por texto, 64 productos vigentes no salian en ningun informe
  porque el nombre de su marca estaba escrito distinto.

---

## 6 · Respuestas a [respuesta-reportes.md](respuesta-reportes.md)

### 4·A · Las cuatro aclaraciones

| | respuesta |
|---|---|
| 1 · «Pedidos» en el disponible | Son **dos reservas distintas**, y ninguna es el pedido al proveedor: lo reservado por **pedidos de clientes**, y lo **facturado que aun no sale del almacen**. Lo pedido al proveedor es solo `ordenado`. Ver «Stock» |
| 2 · Celdas `null` del Excel | Ahora llevan un texto (`SIN COMPRA DESDE 2023`, `SIN ALTA EN M&M`). Ademas fechas e importes salen como numeros. Ver «Respuesta con xlsx» |
| 3 · Sin marcas, en las rutas de informe | `403 marca no disponible` |
| 4 · Que es «valor venta» | El precio de lista, sin IGV, antes del descuento por tipo de cliente. Ver «Lista de precios» |

### 4·B · Servidor de prueba

Hay un servidor de prueba conectado a bdnava08. La direccion y el acceso se los pasa directamente
quien coordina con ustedes. **Necesitamos que nos digan desde que direccion abriran la pantalla**
al probar contra el: el CORS hoy solo acepta `https://landing.compudiskett.com.pe`, y hay que
agregar la suya para que el navegador no bloquee las llamadas.

### 4·C · Datos de prueba

Cargados en bdnava08 para el mes en curso (`querys/sp/datos_prueba_grupo25.sql`; se recargan
cada mes). Las claves de estas cuentas se las pasa quien coordina con ustedes.

| caso | usuario | marca |
|---|---|---|
| Especialista con marcas asignadas **sin confirmar** | 233 HUARANCCA SAMUEL | ADATA `0032`, dada por la jefatura |
| Especialista **confirmado** | 229 SAUÑE MANUEL | TDK `0002`, EPSON `0008`, RICOH `0130`, GIGABYTE `0049` |
| Especialista **sin ninguna marca** | 270 RUBIÑOS ANDERSON | — |
| Jefatura con 2 o mas especialistas de su familia | 071 COSSIO JOANNA (familia 09) | su ACER `0124`; ve TDK (229), ADATA (233) y AVERY (192). **No esta registrada**: al entrar pasa por el registro, que tambien sirve para probarlo |
| Marca de **otra familia** de un especialista de la jefatura | 229 | EPSON, RICOH y GIGABYTE: la jefatura 071 **no** las ve |
| Marca **libre** de la familia de la jefatura | — | DAHUA `0182`: la jefatura 071 **no** la ve |
| Grupo 25 **sin registrar** | 094 TRINIDAD PATRICIA | — |
| **Otro grupo** | 246 (grupo 20) | — |
| Marca **sin productos vigentes** | 192 OLIVARES ALEXANDER | AVERY `0013` |
| **Stock negativo** | 229 | EPSON, producto `0505-012851` (−3) |
| Producto **sin alta en M&M** | 233 o la jefatura | ADATA |
| Producto con **precio en 0** | 229 | GIGABYTE |
| Producto **sin compra** desde 2023 | 229 | RICOH (31 productos) |
| **Marca mas grande** | 229 | GIGABYTE, 712 productos |
| Marca **con guias** / **sin guias** | 229 / 192 | GIGABYTE / AVERY |
| Guia con **varias marcas** | 229 | GIGABYTE, guia `T009-0079891` (05/10/2026) |
| Guias **anuladas** | 229 | GIGABYTE de julio a septiembre: 41 lineas anuladas en la base que no salen en el informe (955 de 996) |

En bdnava08 las guias llegan hasta el 09/10/2026 (es una copia), y las de octubre aun no tienen
su salida: para ver `CON SALIDA` usen un periodo anterior.

### 4·D · Guias

Definido y construido: ver «Guias» en la seccion 4. Respecto a su propuesta:

| su pregunta | respuesta |
|---|---|
| 1 · Que guias | Guias de remision y notas de despacho del local. Ingresos y traslados de otros documentos no |
| 2 · Que periodo | `desde`/`hasta` como propusieron, mes en curso por defecto, **maximo 3 meses** |
| 3 · Que es una fila | **Una por producto** de la marca en la guia (no una por guia): lo que se quiere ver es que mercaderia de la marca salio. Agrupen por `numero` si quieren la vista por guia |
| 4 · Que estados | Las anuladas no entran. `PENDIENTE DE SALIDA` y `CON SALIDA` si |
| 5 · Que se muestra | Cliente, motivo, almacen y el documento de referencia. **Sin importes** |
| 6 · Volumen | HP, la marca con mas movimiento: unas 1 460 guias y notas de despacho y 4 100 lineas al mes; 12 300 lineas en 3 meses |

Columnas que cambian respecto a su propuesta: no hay `destino` (es `cliente`), `documento` se
parte en `referencia` + `numeroReferencia`, y en vez de `productos`/`unidades` por guia hay una
fila por producto con su `cantidad`.

### 5 · Sugerencias

| | respuesta |
|---|---|
| 1 · `productos` en la lista | **Hecho** (seccion 3) |
| 2 · Un Excel con todos los informes | **No por ahora**: en la practica no siempre se necesitan los tres; depende del momento y del avance de cada usuario |
| 3 · Varias marcas en un informe | **No por ahora**: cada usuario trabaja sus marcas por separado. Puede revisarse mas adelante |
| 4 · Umbral de stock viejo | **No hay umbral**: el informe es para conocer la antiguedad. No destacar filas |

Sus sugerencias propias (ordenar por encabezado, filtros rapidos, `FAMILIA` al final, recordar la
ultima marca) no necesitan nada del backend.

### 6 · Salida a produccion

De acuerdo: backend y frontend salen el mismo dia, cuando termine el grupo 25 y se pruebe en el
servidor de prueba. `/reporte/marcas`, `/stoc`, `/tiempo` y `/precios` **ya estan retiradas** en el
backend (responden `404`), asi que esa salida tiene que ser la misma para los dos.
