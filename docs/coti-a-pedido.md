# Pasar una cotizacion a pedido — grupos 20 y 25

Contrato de una accion nueva del modulo **cotizacion**: el vendedor convierte una cotizacion suya, **ya aprobada**,
en un **pedido**, eligiendo los datos de despacho. Hoy eso solo se hace desde el ERP.

Implementado y probado en bdnava08 (18/11/2026). **Backend y frontend salen el mismo dia.**

> **Actualizado el 19/11/2026**: respuesta a [respuesta-coti-a-pedido.md](respuesta-coti-a-pedido.md) en la
> **seccion 11**. Cambios en el contrato:
> - el **plazo de 5 dias sin contar el domingo**, con la clave que propusieron, `coti fuera de plazo`
>   (secciones 1, 4 y 7);
> - el orden de los motivos que pidieron;
> - `opciones` trae `antiguedad` y `plazo`;
> - sin consignatario, la observacion va sin la parte `ATC.` (seccion 6).
>
> Implementado y probado en bdnava08.

La seccion 9 trae otros cambios del modulo cotizacion y del buscador de productos que salen en la misma version
y que la pantalla tiene que conocer: nuevos rechazos en crear, modificar y cambiar almacen, y el stock que muestra
el autocompletado.

---

## 1 · Como funciona

1. Solo se puede convertir una cotizacion que cumpla las cinco condiciones:
   - es **del vendedor**, es decir, lleva su codigo de vendedor (`codven_usu`);
   - tiene **hasta 5 dias de antiguedad sin contar el domingo**. La antiguedad son los dias desde la fecha de
     emision hasta hoy (fecha del servidor, hora de Lima), sin los domingos: la de hoy tiene 0 y con 6 o mas ya
     no se pasa;
   - esta **aprobada** en el ERP;
   - **no genero ningun documento**: ni pedido, ni factura, ni boleta. Una cotizacion genera un solo documento;
   - **no esta en ajuste de precio** con el grupo 25.
2. El vendedor elige el despacho:
   - **Tipo de entrega**:
     - `1` Ventanilla
     - `3` Lima
     - `4` Provincia
   - **Transportista**: en ventanilla y Lima va fijo **T0001** (Compudiskett) y no se elige. En provincia se
     elige uno de la lista y es obligatorio.
   - **Direccion de entrega**: una de las **direcciones registradas del cliente**. No se puede escribir otra.
   - **Consignatario**: un nombre, texto libre. Opcional.
   - **Observacion**: texto libre. Opcional.
3. Se crea un pedido de la serie **098-** (por ejemplo `098-00000001`):
   - Lleva **todas las lineas de la cotizacion tal cual**: precios, descuentos, almacen de cada linea y lineas de
     promocion. Los totales son los mismos de la cotizacion.
   - Nace **sin aprobar**. Lo aprueban en el ERP, como cualquier pedido.
   - **No separa stock** mientras no lo aprueben. Al aprobarlo, el ERP lo separa.
4. La cotizacion queda marcada como convertida: en las listas pasa a decir `pedido`, y ya no se puede modificar,
   dar de baja ni volver a convertir.
5. Todo va en una sola operacion: si algo falla no queda ni el pedido a medias ni la cotizacion marcada.

---

## 2 · Menu

`GET /v1/cotizacion` devuelve una accion mas, `pedido`, a los grupos **20 y 25**:

```json
{"status":"ok","codigo":0,"data":["crear","leer","update","delete","alm","pedido"]}
```

Sin `pedido` en la lista, el boton no se pinta. Los grupos 32 y 34 no lo tienen.

---

## 3 · Rutas

Las tres son `POST` y llevan la cookie de sesion de siempre.

| ruta | para que |
|---|---|
| `/v1/cotizacion/pedido/opciones` | al abrir la ventana: si se puede convertir, direcciones del cliente, tipos de entrega |
| `/v1/cotizacion/pedido/transportista` | buscar transportista (solo provincia) |
| `/v1/cotizacion/pedido` | convertir |

El numero de cotizacion va **siempre con su serie** (`098-00000055`, `009-00970435`). Un numero suelto se rechaza
con `400 documento ambiguo`.

---

## 4 · Opciones — `POST /v1/cotizacion/pedido/opciones`

```json
{"ndocu":"098-00000055"}
```

Respuesta (de la prueba en bdnava08; las direcciones estan recortadas):

```json
{
  "status":"ok","codigo":0,
  "documento":"098-00000055",
  "convertible":true,
  "motivo":null,
  "antiguedad":0,
  "plazo":5,
  "documento_generado":null,
  "cliente":{"codcli":"C00904","nomcli":"COMPUDISKETT S.R.L."},
  "consignatario_sugerido":"AREA SISTEMAS",
  "direcciones":[
    "AV. REPÚBLICA DE CHILE NRO.504 JESUS MARIA (LIMA-PERU)",
    "AV  LA MARINA 225 URB SAN VICENTE –LA LIBERTAD – TRUJILLO",
    "CAL.GARCIA DE CARBAJAL 600 URB. IV CENTENARIO-AREQUIPA-AREQUIPA"
  ],
  "tipos_entrega":[
    {"tipent":1,"nombre":"Desp.Ventanilla","transportista":"T0001"},
    {"tipent":3,"nombre":"Desp. Local (Lima)","transportista":"T0001"},
    {"tipent":4,"nombre":"Desp. Provincia","transportista":null}
  ]
}
```

| campo | uso |
|---|---|
| `convertible` | `false` → el boton se deshabilita y se muestra el `motivo` |
| `motivo` | `null`, o la misma clave que daria el error al convertir. Si hay varios, gana el primero de: `coti ya convertida`, `coti ya anulada`, `coti fuera de plazo`, `coti sin aprobar`, `documento en ajuste` |
| `antiguedad` | dias desde la emision sin contar domingos. Se puede convertir mientras sea `<= plazo` |
| `plazo` | `5` |
| `documento_generado` | si ya genero uno: `{"cdocu":"32","ndocu":"098-00000001"}`. `cdocu` `32` es pedido, `01` factura y `03` boleta. El `ndocu` va como lo guarda el ERP: `F009-0648731` en factura, `B007-0011342` en boleta |
| `consignatario_sugerido` | la atencion de la cotizacion, para rellenar el campo consignatario. Se puede cambiar |
| `direcciones` | todas, sin tope (un cliente puede tener mas de 20). Se filtra en la pantalla |
| `tipos_entrega[].transportista` | si trae codigo, el transportista es fijo y no se pide; si es `null`, hay que elegirlo |

Si la cotizacion no existe o es de otro vendedor: `403 coti desconocida`.

---

## 5 · Transportista — `POST /v1/cotizacion/pedido/transportista`

La misma busqueda que ya usa factura: transportistas activos, de cinco en cinco, por nombre.

```json
{"sugerencia":"shalom"}
```

```json
{"total":1,"data":{"0":{"0":"T0106","1":"TRANSPORTES \"SHALOM EXPRESS S.A.C.\""}}}
```

`total` dice cuantos hay detras del filtro aunque solo viajen cinco. Lista vacia: `{"total":0,"data":{}}`.

---

## 6 · Convertir — `POST /v1/cotizacion/pedido`

```json
{
  "ndocu":"098-00000056",
  "tipent":4,
  "codtra":"T0106",
  "dirent":"CAL.GARCIA DE CARBAJAL 600 URB. IV CENTENARIO-AREQUIPA-AREQUIPA",
  "consig":"MARIA LOPEZ",
  "obse":"recoge en agencia"
}
```

| campo | obligatorio | regla |
|---|---|---|
| `ndocu` | si | con serie |
| `tipent` | si | `1`, `3` o `4` (numero o texto) |
| `codtra` | solo en provincia (`4`) | un codigo de la busqueda del paso 5. En `1` y `3` se ignora y va T0001 |
| `dirent` | si | **exactamente** una de `direcciones` del paso 4: se manda el texto tal como vino |
| `consig` | no | hasta 60 caracteres; lo demas se corta |
| `obse` | no | texto libre |

Respuesta (de la prueba en bdnava08):

```json
{
  "status":"ok","codigo":0,
  "pedido":"098-00000002",
  "cotizacion":"098-00000056",
  "aprobado":false,
  "lineas":2,
  "moneda":"D",
  "totales":{"tota":23.99,"toti":4.32,"totn":28.31},
  "despacho":{
    "tipent":4,
    "codtra":"T0106",
    "transportista":"TRANSPORTES \"SHALOM EXPRESS S.A.C.\"",
    "dirent":"CAL.GARCIA DE CARBAJAL 600 URB. IV CENTENARIO-AREQUIPA-AREQUIPA",
    "consig":"MARIA LOPEZ",
    "obse":"ATC.MARIA LOPEZ transporte. TRANSPORTES \"SHALOM EXPRESS S.A.C.\" obse.recoge en agencia"
  }
}
```

- `aprobado` siempre es `false`: el pedido espera la aprobacion del ERP.
- `totales` estan en la moneda de la cotizacion (`moneda`): `tota` sin IGV, `toti` el IGV, `totn` con IGV.
- `despacho.obse` es lo que quedo grabado. La observacion se guarda con la forma de los pedidos de la web:
  `ATC.<consignatario> [transporte. <transportista>] obse.<texto>`. La parte de transporte solo va en provincia.
  **Sin consignatario no va la parte `ATC.`**: queda `obse.<texto>`, o `obse.` si tampoco hay texto. La pantalla
  manda solo el texto y el backend arma el resto.

Al terminar conviene refrescar la lista de cotizaciones: la cotizacion pasa a `pedido`.

---

## 7 · Errores

Mismo formato de siempre: `{"status":<clave>,"codigo":<n>,"msg":<texto>}`.

| HTTP | `status` | cuando | que hacer en la pantalla |
|---|---|---|---|
| 400 | `documento ambiguo` | numero sin serie | — (error de la pantalla) |
| 400 | `tipo entrega invalido` | `tipent` distinto de 1, 3 o 4 | — |
| 400 | `transportista invalido` | provincia sin `codtra`, o con uno inexistente o inactivo | pedir que elija transportista |
| 400 | `direccion invalida` | `dirent` vacia o que no es del cliente | pedir que elija una de la lista |
| 400 | `cotizacion vacia` | la cotizacion no tiene lineas | — |
| 403 | `coti desconocida` | no existe o es de otro vendedor | — |
| 403 | `sin permiso` | grupo distinto de 20 y 25 | — |
| 409 | `coti fuera de plazo` | tiene mas de 5 dias sin contar el domingo, este aprobada o no. Tambien si `opciones` la dio por buena y se convierte pasada la medianoche | avisar que haga una cotizacion nueva |
| 409 | `coti sin aprobar` | todavia no la aprueban | avisar que espere la aprobacion |
| 409 | `coti ya convertida` | ya genero pedido, factura o boleta. Tambien si dos personas convierten la misma a la vez: el segundo recibe este | refrescar la lista |
| 409 | `coti ya anulada` | fue dada de baja | refrescar la lista |
| 409 | `documento en ajuste` | el grupo 25 la esta ajustando | avisar que espere |
| 500 | `pedido no creado` | algo no se grabo completo; se revirtio todo y la cotizacion quedo como estaba | reintentar; si se repite, avisar a sistemas |
| 500 | `error query` | fallo de base | igual |

Si llega 400, 403 o 409, no se grabo nada y se puede reintentar sin miedo a duplicar.

---

## 8 · Pantalla sugerida

1. En la lista o en el detalle de la cotizacion, boton **«Pasar a pedido»** si el menu trae `pedido`.
2. Al pulsarlo, `opciones`:
   - `convertible:false` → mensaje con el motivo, sin formulario;
   - `convertible:true` → formulario.
3. Formulario:
   - tipo de entrega (3 opciones);
   - transportista: si el tipo trae `transportista`, se muestra como fijo («COMPUDISKETT S.R.L.»). Si no, un
     buscador con la ruta del paso 5;
   - direccion: lista desplegable con filtro;
   - consignatario: precargado con `consignatario_sugerido`;
   - observacion.
4. Confirmar → `pedido`. Mostrar el numero de pedido y que **queda pendiente de aprobacion**.

Las listas de cotizaciones (`/v1/lista/cotizacion...`) no dicen si una cotizacion esta aprobada: la columna 7 es
`1` solo si esta abierta y **sin** aprobar. Por eso, para saber si se puede convertir hay que preguntar a `opciones`.
Si prefieren que la lista traiga una columna mas con `convertible`, se agrega al final sin mover las demas: pidanla
en la respuesta.

---

## 9 · Otros cambios que salen el mismo dia

Salen de una revision del modulo cotizacion. Ninguno cambia el formato de las respuestas buenas; agregan rechazos
que antes no existian.

### Todas las rutas de cotizacion exigen permiso

`/pegar`, `/read`, `/readprom`, `/update` y `/almacen` ahora piden el permiso del grupo, como ya hacia `/eliminar`.
Los grupos 20, 25, 32 y 34 siguen pudiendo todo lo que podian. Cualquier otro grupo recibe `403 sin permiso`.

### `POST /v1/cotizacion/pegar` — crear

- **Del cliente solo se usa el codigo**: `cliente[0]`. Nombre, RUC, vendedor y condicion se leen del maestro de
  clientes. Lo demas del arreglo se puede seguir mandando y se ignora.
- Rechazos nuevos:

| HTTP | `status` | cuando |
|---|---|---|
| 400 | `cotizacion vacia` | `productos` viene vacio |
| 400 | `producto repetido` | el mismo codigo viene en dos lineas: hay que juntar las cantidades en una |
| 400 | `cliente no registrado` | el codigo de cliente no existe o esta inactivo |

### `POST /v1/cotizacion/update` — modificar

- Cada linea tiene que llevar en la **posicion 2** el numero de la cotizacion que se modifica. Si alguna trae otro:
  `400 linea ajena`.
- Las posiciones 1 (`cdocu`), 3 (cliente), 4 (tipo de cambio) y 5 (moneda) se toman de la cotizacion grabada.
  Lo que se mande ahi se ignora.
- El almacen de cada linea (posicion 19) tiene que existir y estar activo: si no, `400 almacen invalido`.

### `POST /v1/cotizacion/almacen` — cambiar almacen

- Cuerpo igual: `{"ncoti":"098-00000055","alm":"08"}`. Respuesta buena igual: `"almacen cambiado"`.
- Almacen inexistente o inactivo: `400 almacen invalido`.
- Cotizacion de otro vendedor o que ya no esta abierta: `403 coti desconocida`.
- Se puede cambiar el almacen **aunque la cotizacion este aprobada**. Solo cambia el almacen.

### Buscador de productos — stock disponible

`/v1/producto/buscar` (el autocompletado de crear cotizacion), `/v1/producto/id` y `/v1/producto/encontrado`
ahora muestran el **stock disponible**:

> disponible = stock − (separado + pedido)

Antes mostraban el stock fisico, que incluia lo ya comprometido. Las columnas y su orden no cambian (principal,
M&M y Piura en `buscar`).

- **El disponible puede ser negativo**, cuando hay mas comprometido que fisico. Hay que mostrarlo tal cual, con su
  signo, y no llevarlo a 0.
- `buscar` ordena las 5 sugerencias por disponible en principal, de mayor a menor.

---

## 10 · Para probar en bdnava08

- El servidor de prueba apunta a bdnava08 y ya tiene la numeracion de pedidos 098- creada.
- Una cotizacion **solo se aprueba en el ERP**. Para probar: crear una con `/pegar`, mandarnos el numero, y la
  aprobamos en bdnava08.
- Cliente sugerido: **C00904** (COMPUDISKETT S.R.L., Lima). Tiene 25 direcciones, sirve para probar la lista
  larga y los tres tipos de entrega.
- Casos que conviene ver:
  - cotizacion sin aprobar → `opciones` con `convertible:false` y `coti sin aprobar`;
  - aprobada → convertir en Lima y en provincia;
  - convertir dos veces la misma → la segunda da `409 coti ya convertida`;
  - provincia sin transportista → `400 transportista invalido`;
  - el buscador de productos con algun codigo de stock negativo.

Los pedidos de prueba se borran al terminar.

---

## 11 · Respuestas a [respuesta-coti-a-pedido.md](respuesta-coti-a-pedido.md)

### 0 · El plazo: hecho, tal como lo pidieron

- **Clave:** `coti fuera de plazo`, la que propusieron.
- **En `opciones`:** `convertible:false` con ese `motivo` y `documento_generado:null`. El resto viene igual
  (cliente, direcciones…).
- **Al convertir:** `409 coti fuera de plazo` con su `msg`. Tambien en el caso de la medianoche.
- **Orden de los motivos:** el suyo (convertida, anulada, fuera de plazo, sin aprobar, en ajuste). Una de 6 dias
  sin aprobar dice `coti fuera de plazo`.
- **«Hoy»:** la fecha del servidor de base de datos, que esta en hora de Lima (-05:00).
- **Campos nuevos en `opciones`:** `antiguedad` (los dias sin domingo) y `plazo` (5). Sirven para decir «le
  quedan N dias». Se pueden ignorar.

Probado en bdnava08 con hoy jueves 19/11, con las mismas fechas de su tabla:

| emitida | `antiguedad` | resultado |
|---|---|---|
| jue 19/11, aprobada | 0 | `convertible:true`; se convirtio |
| vie 13/11, aprobada | 5 | `convertible:true`; se convirtio |
| jue 12/11, aprobada | 6 | `coti fuera de plazo` en `opciones` y `409` al convertir |
| jue 12/11, sin aprobar | 6 | `coti fuera de plazo` (gana a `coti sin aprobar`) |

La cuenta tambien da 5 y 6 en su ejemplo del lunes 23/11 (martes 17 y lunes 16).

### 1 · Que no hace falta la columna `convertible`

De acuerdo: las listas no cambian.

### 3 · Las tres preguntas

1. **Consignatario vacio:** se arma **sin** la parte `ATC.`. Con `"consig":""` y `"obse":"prueba plazo"` quedo
   grabado `obse.prueba plazo`. Sin consignatario ni texto queda `obse.`.
2. **`documento_generado` de una factura o boleta:** si, trae la serie, tal como lo guarda el ERP en la
   cotizacion. Por ejemplo `{"cdocu":"01","ndocu":"F009-0648731"}` o `{"cdocu":"03","ndocu":"B007-0011342"}`.
   Es la misma forma que ven en las listas.
3. **Feriados:** solo se salta el domingo. El ERP tiene una tabla de feriados (`Tbl_Diaferiado`), pero tiene una
   sola fecha, de 2010, y nada la usa: no hay calendario que seguir. Si mas adelante se mantiene, se agrega y se
   los avisamos.

### 4 · El recorrido en bdnava08

- **Cotizaciones de prueba:** mandennos los numeros y las aprobamos. Para el caso «fuera de plazo» y «el ultimo
  dia», ademas les cambiamos la fecha de emision: digannos cual va con 6 dias y cual con 5.
- **Codigos con disponible negativo** en bdnava08 (lista de precios `A`):

| codigo | producto | stock | pedido | disponible |
|---|---|---|---|---|
| `0604-110018` | SSD M2 HYUNDAI 256GB NVME GEN3 | 0 | 2000 | **-2000** |
| `0601-060013` | DDR5 SODIMM LEXAR 16GB 5600MHZ CL46 | 291 | 582 | **-291** |
| `0505-020284` | TINTA HP CZ132A (711) YELLOW | 0 | 166 | **-166** |

  El segundo sirve para ver el caso «hay fisico pero no disponible»: tiene 291 en almacen y todo comprometido.
- Al terminar nos avisan y borramos los pedidos de prueba.
