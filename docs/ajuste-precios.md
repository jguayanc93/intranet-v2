# Ajuste de precios — cotizaciones y pedidos

Contrato del modulo **ajuste**: el vendedor (grupo 20) envia una cotizacion o pedido para que el
especialista o la jefatura de la marca (grupo 25) le ajuste el precio, y se lo devuelve. Dos
pantallas: la del vendedor (pedir ajuste y mis ajustes) y la del grupo 25 (recibidas y ajustar).
Implementado y probado en bdnava08.

> **Actualizado el 21/10/2026, segunda ronda**: las tres preguntas que quedaban abiertas estan
> respondidas en la seccion 10. Cambios de esta ronda: el precio se **redondea** al centimo
> (seccion 4), `400 fechas invalidas` para `desde`/`hasta` (seccion 3) y `ajustesPendientes` cuenta
> solo lo que se puede responder (seccion 7).
>
> **Primera ronda (21/10/2026)**, en respuesta a [respuesta-ajuste-precios.md](respuesta-ajuste-precios.md).
> Cambios respecto a la version anterior:
> - **Nueva `POST /ajuste/previa`**, como la propusieron (seccion 3).
> - **Nueva `GET /ajuste`** con los accesos de cada grupo (seccion 2).
> - `enviar` trae `moneda`; `sinResponsable` trae `cantidad` (seccion 3).
> - Las pendientes cuyo documento avanzo **se cierran al leer** (seccion 1).
> - **Precio en centimos** y `precioMinimo` redondeado hacia arriba al centimo (seccion 4).
> - `actual.precioNeto`: lo que paga hoy el cliente por unidad (seccion 4).
> - Filtros `desde`/`hasta` en `enviadas` y `recibidas` (secciones 3 y 4).
> - `ajustesPendientes` en la respuesta de `/vendedor`, para el numerito del menu (seccion 7).
> - **La lista de pedidos ya distingue los sin aprobar** (seccion 7).
> - Respuestas a sus diez puntos: seccion 9 (el punto 3 ya esta decidido).
> - **`ajuste` ya esta en el menu del grupo 20 y del grupo 25** (seccion 7).

---

## 1 · Como funciona

1. **El vendedor envia** una cotizacion o pedido suyo a ajuste, con un mensaje opcional
   («una ajustadita», «mejora el precio de estas impresoras»). Antes puede pedir la **vista
   previa** para saber a quien ira cada linea.
2. Se crea **una solicitud por cada responsable**: el dueño de la marca en el mes o, si la marca
   no tiene dueño, la jefatura de su familia. Cada responsable recibe **solo las lineas de sus
   marcas**. Las lineas de marcas sin responsable no se envian (la respuesta las lista).
3. **Mientras haya una solicitud pendiente, el vendedor no puede modificar el documento** (ver
   seccion 6).
4. **El responsable la recibe**, la abre y la **confirma** (con los precios nuevos) o la
   **rechaza** (con una observacion obligatoria). Despues ya no la puede volver a tocar.
5. **Al confirmar**, en las lineas que ajusto:
   - el **precio** pasa a ser el que puso;
   - el **descuento del cliente pasa a 0** (el precio ajustado ya es lo que paga el cliente);
   - la **cantidad** cambia si la cambio (**solo en cotizaciones**; en pedidos solo el precio);
   - el **costo** de la linea se actualiza al costo actual;
   - **se quitan TODAS las promociones del documento**, de todas las marcas;
   - se recalculan los totales.

   **El precio del producto en el ERP no se toca nunca**: el cambio es solo de esa venta.
6. **El precio nunca puede quedar por debajo del costo actual** del producto.
7. **Si el documento avanza** —cotizacion aprobada, pedido aprobado, facturado o anulado— lo que
   quedaba pendiente ya no se puede confirmar: la solicitud pasa a **CERRADA**. Pasa **en cuanto
   alguien la lee** (`enviadas`, `recibidas` o `solicitud`) o intenta confirmarla, asi que una
   lista de pendientes nunca trae una que ya no se pueda responder. Las facturas nunca se ajustan.
8. **A los 3 dias sin respuesta, la solicitud VENCE** y el documento se libera.

Con dos responsables (por ejemplo monitor LG de uno y tinta EPSON de otro), cada uno responde por
su lado: uno puede confirmar y el otro rechazar. Cada respuesta le llega al vendedor por separado.

**Que documentos se pueden enviar:** cotizaciones abiertas (sin aprobar) y pedidos sin aprobar.
Nunca facturas. Son los que en `/lista/cotis` y `/lista/pedidos` llegan con `editable = 1`.

**Estados de una solicitud:**

| estado | que significa |
|---|---|
| `PENDIENTE` | esperando al responsable. El documento esta bloqueado para el vendedor |
| `CONFIRMADA` | el responsable ajusto y el cambio ya esta en el documento |
| `RECHAZADA` | el responsable no ajusto; el documento no cambio. Ver `observacion` |
| `VENCIDA` | pasaron 3 dias sin respuesta |
| `CERRADA` | el documento avanzo (se aprobo, facturo o anulo) antes de que respondiera |

**Fechas** (`fecreg`, `vence`, `fecrespuesta`): `AAAA-MM-DDTHH:MM:SS`, **hora de Lima** (la del
servidor, UTC−5), sin zona.

---

## 2 · Rutas

| ruta | quien | para que |
|---|---|---|
| `GET  /v1/ajuste` | todos | las acciones que su grupo puede usar |
| `POST /v1/ajuste/previa` | vendedor (grupo 20) | a quien iria cada linea, sin enviar nada |
| `POST /v1/ajuste/enviar` | vendedor (grupo 20) | enviar una cotizacion o pedido a ajuste |
| `GET  /v1/ajuste/enviadas` | vendedor (grupo 20) | sus solicitudes y sus respuestas |
| `GET  /v1/ajuste/recibidas` | especialista o jefatura (grupo 25) | las solicitudes que le llegaron |
| `GET  /v1/ajuste/solicitud?id=` | especialista o jefatura | una solicitud, con todo para ajustar |
| `POST /v1/ajuste/confirmar` | especialista o jefatura | aplicar el ajuste |
| `POST /v1/ajuste/rechazar` | especialista o jefatura | devolverla sin cambios |

Enviar, confirmar y rechazar se auditan.

### `GET /v1/ajuste`

Como el resto de modulos: los accesos, doble codificado.

```
grupo 20  ->  "{\"accesos\":[\"enviar\",\"enviadas\"]}"
grupo 25  ->  "{\"accesos\":[\"recibidas\"]}"
otros     ->  "{\"accesos\":[]}"
```

`enviar` cubre `previa` y `enviar`; `recibidas` cubre `recibidas`, `solicitud`, `confirmar` y
`rechazar`.

---

## 3 · Lado del vendedor (grupo 20)

### `POST /v1/ajuste/previa`

Mismo cuerpo que `enviar` (sin `mensaje`). **No crea nada.** Misma forma que la respuesta de
`enviar`, sin `id` ni `vence`. Mismos errores.

```json
{ "tipo":"COT", "ndocu":"009-00969476" }
```

```json
{ "status":"ok", "codigo":0, "data": {
    "tipo":"COT", "ndocu":"009-00969476", "cliente":"DISTRIBUIDORA OK.COM S.A.C.", "moneda":"D",
    "solicitudes": [
      { "recibe": { "codusu":"229", "nombre":"SAUÑE MANUEL", "como":"DUENO" },
        "lineas": [ { "item":1, "codi":"0505-012610", "codf":"...", "descripcion":"...",
                      "marca":{ "codmar":"0008", "abrmar":"EPSON", "nombre":"EPSON" }, "cantidad":18, "precio":7.97 } ] }
    ],
    "sinResponsable": [
      { "item":5, "codi":"0505-011946", "codf":"...", "descripcion":"...",
        "marca":{ "codmar":"0009", "abrmar":"BROTH", "nombre":"BROTHER" }, "cantidad":2 }
    ],
    "promociones": 1
} }
```

Entre la vista previa y el envio el documento puede cambiar (otro lo aprueba, se envia desde otra
pestaña): el reparto que vale es el que devuelve `enviar`.

### `POST /v1/ajuste/enviar`

```json
{ "tipo":"COT", "ndocu":"009-00969476", "mensaje":"una ajustadita por favor" }
```

- `tipo`: `COT` (cotizacion) o `PED` (pedido).
- `ndocu` **con su serie** (`009-00969476`); un numero suelto es ambiguo.
- `mensaje`: opcional, hasta 300 caracteres.

**Antes de enviar, avisar al vendedor**: si el ajuste se confirma, **el documento pierde todas
sus promociones**. La respuesta (y la vista previa) dice cuantas tiene (`promociones`).

```json
{ "status":"ok", "codigo":0, "data": {
    "tipo":"COT", "ndocu":"009-00969476", "cliente":"DISTRIBUIDORA OK.COM S.A.C.", "moneda":"D",
    "solicitudes": [
      { "id":1,
        "recibe": { "codusu":"229", "nombre":"SAUÑE MANUEL", "como":"DUENO" },
        "vence":"2026-10-24T10:15:02",
        "lineas": [ { "item":1, "codi":"0505-012610", "codf":"...", "descripcion":"...",
                      "marca":{ "codmar":"0008", "abrmar":"EPSON", "nombre":"EPSON" }, "cantidad":18, "precio":7.97 } ] }
    ],
    "sinResponsable": [
      { "item":5, "codi":"0505-011946", "codf":"...", "descripcion":"...",
        "marca":{ "codmar":"0009", "abrmar":"BROTH", "nombre":"BROTHER" }, "cantidad":2 }
    ],
    "promociones": 1
} }
```

- `moneda`: `D` o `S`; los precios de las lineas estan en esa moneda.
- `recibe.como`: `DUENO` (el dueño de la marca este mes) o `JEFATURA` (la marca no tiene dueño y
  le llega a la jefatura de su familia).
- `sinResponsable`: lineas que no se enviaron a nadie, con su `cantidad`.

| http | status | cuando |
|---|---|---|
| 400 | `tipo invalido` | `tipo` no es COT ni PED |
| 400 | `documento ambiguo` | `ndocu` sin serie |
| 403 | `documento desconocido` | no existe o no es del vendedor |
| 409 | `documento no ajustable` | ya esta aprobado, facturado o anulado |
| 409 | `documento en ajuste` | ya tiene una solicitud pendiente |
| 409 | `sin responsables` | ninguna marca del documento tiene especialista ni jefatura |

### `GET /v1/ajuste/enviadas`

Sus solicitudes, **las mas recientes primero, hasta 100**. Filtros opcionales, que se aplican
**antes** del tope de 100:

| filtro | ejemplo |
|---|---|
| `estado` | `?estado=RECHAZADA` |
| `ndocu` | `?ndocu=009-00969476` |
| `desde`, `hasta` | `?desde=2026-10-01&hasta=2026-10-31` (por fecha de envio, dias completos, hora de Lima) |

No hay archivo ni ventana de tiempo: sin `desde`/`hasta` llegan las 100 mas recientes de ese
filtro. Una fecha mal escrita, que no existe (`2026-02-30`) o un `desde` posterior al `hasta`
responde **`400 fechas invalidas`** (en `enviadas` y en `recibidas`); no se ignora. Una pestaña por estado con `?estado=` nunca sale vacia si hay solicitudes de ese estado.

```json
{ "status":"ok", "codigo":0, "data": { "solicitudes": [
  { "id":1, "tipo":"COT", "ndocu":"009-00969476", "estado":"CONFIRMADA",
    "cliente":"DISTRIBUIDORA OK.COM S.A.C.", "moneda":"D",
    "mensaje":"una ajustadita por favor",
    "observacion":"listo, precio especial por volumen",
    "fecreg":"2026-10-21T10:15:02", "vence":"2026-10-24T10:15:02", "fecrespuesta":"2026-10-21T10:20:40",
    "envia": { "codusu":"246", "nombre":"GONZALES CRISTOPHER" },
    "recibe": { "codusu":"229", "nombre":"SAUÑE MANUEL" },
    "lineas": [
      { "item":1, "codi":"0505-012610", "codf":"...", "descripcion":"...", "marca":{ "codmar":"0008", "abrmar":"EPSON", "nombre":"EPSON" },
        "antes":   { "cantidad":18, "precio":7.97, "dsct":2.5 },
        "despues": { "cantidad":19, "precio":8.2,  "dsct":0, "costo":7.45 } },
      { "item":2, "codi":"0505-012615", "...":"...",
        "antes":   { "cantidad":18, "precio":7.97, "dsct":2.5 },
        "despues": null }
    ],
    "montoEnviado": 559.49 }
] } }
```

- `despues: null` = esa linea no se ajusto (el responsable no la toco, o la solicitud no se
  confirmo).
- `montoEnviado`: lo que sumaban las lineas enviadas al momento de enviar (sin IGV), en `moneda`.

---

## 4 · Lado del responsable (grupo 25)

### `GET /v1/ajuste/recibidas`

Las que le llegaron, las mas recientes primero, hasta 100, con los mismos filtros que `enviadas`
(`estado`, `ndocu`, `desde`, `hasta`). Misma forma que `enviadas`, pero `lineas` es **un numero**
(cuantas lineas le tocan); el detalle esta en `/solicitud`.

```json
{ "id":1, "tipo":"COT", "ndocu":"009-00969476", "estado":"PENDIENTE",
  "cliente":"DISTRIBUIDORA OK.COM S.A.C.", "moneda":"D",
  "envia": { "codusu":"246", "nombre":"GONZALES CRISTOPHER" },
  "mensaje":"una ajustadita por favor", "lineas":4, "montoEnviado":559.49,
  "fecreg":"2026-10-21T10:15:02", "vence":"2026-10-24T10:15:02", "...":"..." }
```

### `GET /v1/ajuste/solicitud?id=1`

Todo lo que necesita la pantalla de ajustar. Ejemplo real (229, cotizacion con 4 lineas de
EPSON y 2 de otras marcas):

```json
{ "status":"ok", "codigo":0, "data": {
    "id":1, "tipo":"COT", "ndocu":"009-00969476", "estado":"PENDIENTE",
    "mensaje":"una ajustadita por favor", "observacion":null,
    "fecreg":"2026-10-21T10:15:02", "vence":"2026-10-24T10:15:02",
    "envia": { "codusu":"246", "nombre":"GONZALES CRISTOPHER" },
    "puedoAjustar": true,
    "cantidadAjustable": true,
    "documento": { "tipo":"COTIZACION", "ndocu":"009-00969476", "fecha":"2026-09-24",
                   "cliente":"DISTRIBUIDORA OK.COM S.A.C.", "moneda":"D", "tcam":3.385,
                   "total":593.18, "totalConIgv":699.95, "abierto":true },
    "promociones": 1,
    "otrasLineas": 2,
    "lineas": [
      { "item":1, "codi":"0505-012610", "codf":"...", "descripcion":"...",
        "marca": { "codmar":"0008", "abrmar":"EPSON", "nombre":"EPSON" },
        "enviado": { "cantidad":18, "precio":7.97, "dsct":2.5 },
        "actual":  { "cantidad":18, "precio":7.97, "dsct":2.5, "total":139.86, "precioNeto":7.7708 },
        "costo": 7.45, "precioMinimo": 7.45, "stock": 3491, "almacen":"01",
        "margen": { "monto":0.52, "sobreCosto":6.98, "sobreVenta":6.52 },
        "ajuste": null }
    ]
} }
```

| campo | que es |
|---|---|
| `puedoAjustar` | mostrar los controles de ajuste **solo si es `true`**: esta pendiente y el documento sigue abierto |
| `cantidadAjustable` | `true` en cotizaciones; `false` en pedidos: en un pedido solo se cambia el precio |
| `documento` | la cabecera, para contexto. **Todos los importes de la solicitud estan en `documento.moneda`** |
| `promociones` | cuantas lineas de promocion tiene el documento. Si es mas de 0, **avisar**: al confirmar se quitan todas |
| `otrasLineas` | lineas del documento que no son suyas (de otras marcas); no se pueden tocar |
| `lineas[].enviado` | como estaba la linea cuando el vendedor la envio |
| `lineas[].actual` | como esta ahora en el documento. `precio` es el **precio de lista** de la linea; `precioNeto` es **lo que paga hoy el cliente por unidad** (precio con su descuento, hasta 4 decimales) |
| `lineas[].costo` | **costo actual** del producto, en el almacen de la linea y en la moneda del documento. Puede traer hasta 4 decimales |
| `lineas[].precioMinimo` | el precio no puede bajar de aqui: el costo **redondeado hacia arriba al centimo** (costo 7.4533 → minimo 7.46) |
| `lineas[].stock` | stock disponible en el almacen de la linea (`almacen` es su codigo). Es un aviso: no bloquea subir la cantidad |
| `lineas[].margen` | margen con el precio de lista **sin descuento** (que es como queda al ajustar) |
| `lineas[].ajuste` | `null` hasta que se confirma; despues, **la misma forma que `despues`**: `{ cantidad, precio, dsct:0, costo }` |

**El calculo en la pantalla** (precio, % sobre costo, ganancia):

```
margen         = precio − costo
% sobre costo  = margen / costo × 100
% sobre venta  = margen / precio × 100
precio desde % = costo × (1 + % sobre costo / 100), redondeado al centimo
```

Si la persona mueve el precio, se recalcula el %; si mueve el %, se recalcula el precio. Con el
precio por debajo de `precioMinimo`, no dejar confirmar (el backend lo rechaza igual).

### `POST /v1/ajuste/confirmar`

```json
{ "id":1,
  "lineas":[ { "item":1, "precio":8.2, "cantidad":19 } ],
  "observacion":"listo, precio especial por volumen" }
```

- `lineas`: solo las que se ajustan; las de la solicitud que no vienen **no se tocan** (conservan
  su precio y su descuento). Al menos una.
- `precio`: **se redondea al centimo**, la mitad hacia arriba (8.204 → 8.20, 8.205 → 8.21,
  8.206 → 8.21), y ese es el que se guarda y el que ve el vendedor en `despues.precio`. Mayor que 0 y,
  ya redondeado, no menor que
  `precioMinimo`.
- `cantidad`: opcional. Entero de 1 o mas. **En pedidos no se puede cambiar** (mandarla igual o
  no mandarla).
- `observacion`: opcional al confirmar, hasta 300 caracteres.

Respuesta (real):

```json
{ "status":"ok", "codigo":0, "data": {
    "id":1, "estado":"CONFIRMADA", "ndocu":"009-00969476", "tipo":"COT",
    "lineas": [ { "item":1, "codi":"0505-012610",
                  "antes":   { "cantidad":18, "precio":7.97, "dsct":2.5 },
                  "despues": { "cantidad":19, "precio":8.2,  "dsct":0, "costo":7.45 } } ],
    "promocionesQuitadas": 1,
    "totales": { "tota":609.12, "toti":109.64, "totn":718.76 }
} }
```

`totales` son los nuevos totales del documento entero (sin IGV, IGV, con IGV).

### `POST /v1/ajuste/rechazar`

```json
{ "id":1, "observacion":"el cliente tiene que llevar al menos 50 unidades" }
```

La `observacion` es **obligatoria** (sin contar espacios): el vendedor tiene que saber por que.
El documento no cambia.

### Errores de confirmar y rechazar

| http | status | cuando |
|---|---|---|
| 404 | `solicitud desconocida` | no existe o no le fue enviada |
| 409 | `solicitud cerrada` | ya fue respondida, vencio o se cerro |
| 409 | `documento no ajustable` | el documento avanzo mientras estaba pendiente. **La solicitud queda CERRADA**: repintar |
| 400 | `ajuste vacio` | `lineas` vacio (si no hay cambios, rechazar) |
| 400 | `linea ajena` | un `item` que no es de la solicitud, o repetido |
| 400 | `precio invalido` | precio no numerico o 0 |
| 409 | `precio bajo costo` | precio por debajo de `precioMinimo`. **No consume la solicitud**: se puede corregir y volver a confirmar |
| 400 | `cantidad invalida` | cantidad no entera o menor que 1 |
| 400 | `cantidad no ajustable` | se cambio la cantidad en un pedido |
| 409 | `costo desconocido` | no se encontro el costo del producto en el almacen de la linea |
| 400 | `observacion requerida` | rechazar sin observacion |

Ninguno de estos errores cambia nada, salvo `documento no ajustable`, que deja la solicitud en
`CERRADA`.

---

## 5 · Errores comunes

| http | status | cuando |
|---|---|---|
| 401 | `falsa galleta` | sin sesion |
| 403 | `sin permiso` | `previa`, `enviar` y `enviadas` son del grupo 20; `recibidas`, `solicitud`, `confirmar` y `rechazar` del grupo 25 |
| 400 | `no identificado` | (grupo 25) no esta registrado en la intranet |

---

## 6 · Lo que cambia en las pantallas del vendedor que ya existen

Mientras un documento tiene una solicitud **pendiente**, estas rutas responden
**`409 documento en ajuste`** y no hacen nada:

| ruta | accion |
|---|---|
| `POST /v1/cotizacion/update` | modificar la cotizacion |
| `POST /v1/cotizacion/almacen` | cambiar su almacen |
| `POST /v1/cotizacion/eliminar` | darla de baja |
| `POST /v1/promocion/acoplar` | aplicarle una promocion |
| `POST /v1/promocion/eliminar` | quitarle promociones |
| `POST /v1/pedido/almacen` | cambiar el almacen de un pedido |
| `POST /v1/pedido/flete` | aplicarle el flete |

```json
{ "status":"documento en ajuste", "codigo":3,
  "msg":"el documento esta en ajuste de precio: no se puede modificar hasta que respondan o venza la solicitud" }
```

Su decision de no tocar esas pantallas y mostrar el `msg` nos parece bien.

---

## 7 · Menu y listas

**`/vendedor`** trae ahora `ajustesPendientes`:

| grupo | que cuenta |
|---|---|
| 25 | solicitudes que le llegaron y esperan su respuesta |
| 20 | solicitudes que envio y aun no le responden |
| otros | `null` |

Cuenta **solicitudes**, no documentos: una cotizacion enviada a tres responsables suma 3, igual que las
filas de la pestaña de pendientes. Y cuenta **solo las que se pueden responder** (vigentes y con el
documento todavia abierto), asi que coincide con la pestaña aunque nadie la haya abierto todavia.
`null` tambien si la consulta falla: el menu se abre igual.

**`/lista/pedidos` y `/lista/pedidosxdia`** ya distinguen los pedidos sin aprobar. Antes todo
pedido abierto salia como `aprobado` y `editable` llegaba `null`:

| posicion | antes | ahora |
|---|---|---|
| 6 · estado | `aprobado` / `atendido` | **`sin aprobar`** / `aprobado` / `atendido` |
| 7 · editable | siempre `null` | **`1`** si esta sin aprobar (es lo que acepta el ajuste), `0` si no |

Ejemplo real (vendedor 196): `009-00774171` → `sin aprobar`, `1`; `009-00774194` → `aprobado`, `0`.
Si alguna pantalla compara el estado con el texto `aprobado`, un pedido sin aprobar ya no entra.

**Menu: la clave `ajuste` ya esta en el menu del grupo 20 y del grupo 25** (aviso, como
pidieron). La tarjeta lleva a su hub, que pide `GET /v1/ajuste` para saber que acciones pintar.
El menu del grupo 25 queda en `marcas`, `cuota`, `reporte`, `cobertura`, `ajuste` y `cotizacion`, igual para jefatura y especialista; ver
[marcas-grupo25.md](marcas-grupo25.md), seccion 4.

---

## 8 · Para probar en bdnava08

| caso | documento | quien |
|---|---|---|
| Cotizacion con EPSON (le llega a 229) y lineas sin responsable (BROTHER, HP) | `009-00969476` | envia 246, recibe 229 |
| Pedido sin aprobar con EPSON (solo precio) | `009-00774171` | envia 196, recibe 229 |

**Probar con documentos reales los modifica.** Para enviar, confirmar y rechazar, los documentos
y solicitudes de prueba los prepara el backend antes de cada sesion; empiecen leyendo.

---

## 9 · Respuestas a [respuesta-ajuste-precios.md](respuesta-ajuste-precios.md)

| punto | respuesta |
|---|---|
| 1 · Menu y hub | **Hecho**: `GET /v1/ajuste` devuelve los accesos con los nombres que usan: grupo 20 `["enviar","enviadas"]`, grupo 25 `["recibidas"]` (seccion 2) |
| 2 · Forma de `lineas[].ajuste` | **La misma que `despues`**: `{ cantidad, precio, dsct:0, costo }` |
| 3 · De donde parte el precio | **Del precio de lista** (`actual.precio`), como lo hacen hoy. Decision de negocio: si la persona marca la linea y no cambia el precio (por ejemplo, solo sube la cantidad), el cliente pasa a pagar el precio de lista sin su descuento, y asi debe ser. Mantengan el aviso que ya muestran. `precioNeto` queda como referencia de lo que paga hoy |
| 4 · Pendiente que ya no se puede ajustar | **Se cierra al leer**: `enviadas`, `recibidas` y `solicitud` la pasan a `CERRADA` antes de responder (seccion 1, punto 7) |
| 5 · Decimales | El precio **se guarda en centimos**. El costo puede traer hasta 4 decimales; por eso `precioMinimo` es el costo **redondeado hacia arriba al centimo** y es contra el que se valida (seccion 4) |
| 6 · Zona horaria | **Hora de Lima** (UTC−5), la del servidor. Mostrarla tal cual |
| 7 · Cuanto se ven las respondidas | No hay ventana: las 100 mas recientes **despues** de filtrar por `estado`. Hecho `?desde=` y `?hasta=` (seccion 3) |
| 8 · `enviar` sin moneda | **Hecho**: trae `moneda` |
| 9 · Vista previa | **Hecho**: `POST /v1/ajuste/previa`, con el nombre y la forma que propusieron |
| 10 · Pedidos sin aprobar | **Hecho**: `/lista/pedidos` los trae como `sin aprobar` con `editable = 1` (seccion 7) |
| Sugerencia · contador | **Hecho**: `ajustesPendientes` en `/vendedor` (seccion 7) |
| Sugerencia · cantidad en `sinResponsable` | **Hecho** |

---

## 10 · Respuestas a la segunda ronda de [respuesta-ajuste-precios.md](respuesta-ajuste-precios.md)

| pregunta | respuesta |
|---|---|
| 1 · ¿`ajustesPendientes` cuenta solicitudes o documentos? | **Solicitudes**, una por responsable: coincide con las filas de «Mis ajustes → Pendientes» y de «Recibidas → Pendientes». Ademas ahora cuenta **solo las que se pueden responder**: si el documento se aprueba, el numero baja enseguida, sin esperar a que alguien abra la lista (seccion 7) |
| 2 · `desde` y `hasta` mal formados | **`400 fechas invalidas`** (no `periodo invalido`, que es de los meses de cuota y cobertura): fecha mal escrita, inexistente, o `desde` posterior a `hasta`. No se ignoran (seccion 3) |
| 3 · Precio con mas de dos decimales | **Redondea**, la mitad hacia arriba: 8.204 → 8.20, 8.205 → 8.21, 8.206 → 8.21. Se valida contra `precioMinimo` ya redondeado, y es el precio que queda en el documento y en `despues.precio` (seccion 4) |

Lo demas de su documento (el filtro por fechas, el numerito, el paso 1 con cotizaciones y pedidos, la
moneda) no necesita nada mas del backend.
