# Ajuste directo y asignacion — grupo 25

Contrato de dos acciones nuevas del modulo **ajuste** para el grupo 25 (especialistas y jefaturas):

- **directo**: el jefe de marca ajusta el precio de **sus propias** cotizaciones y pedidos, sin
  esperar a que un vendedor se los envie, y si quiere los **asigna** a un vendedor del grupo 20.
- **asignados**: el historial de lo que asigno, solo para consulta.

Lo que ya existia (`recibidas` y las solicitudes de los vendedores) no cambia: ver
[ajuste-precios.md](ajuste-precios.md). Implementado y probado en bdnava08 (06/11/2026).

> **Actualizado el 10/11/2026, segunda ronda**: respuesta a la segunda ronda de
> [respuesta-ajuste-directo.md](respuesta-ajuste-directo.md) en la **seccion 12**: el caso de lineas
> sin costo para «Recibidas» y como hacemos la asignacion de prueba. El contrato no cambia.
>
> **06/11/2026, primera ronda**: respuestas a las siete preguntas de
> [respuesta-ajuste-directo.md](respuesta-ajuste-directo.md) en la **seccion 11**. Cambios en el
> contrato: el detalle trae `otras` (las lineas de otras marcas), `motivoAjustar`/`motivoAsignar` y
> `flete` (seccion 5); las listas traen `hayMas` (secciones 4, 7 y 8); la lista de documentos trae
> `flete`, y sin filtros devuelve las fechas de los 30 dias en `desde`/`hasta` (seccion 4). Con
> `ndocu` las fechas se ignoran. Casos de prueba nuevos en la seccion 10.

---

## 1 · Como funciona

1. El jefe de marca ve **sus documentos**: los que tienen su codigo de vendedor (`codven_usu`).
   - **Cotizaciones**: sin aprobar o aprobadas, que todavia no se convirtieron en pedido ni factura.
   - **Pedidos**: sin aprobar o aprobados.
2. Abre uno y **ajusta el precio** de las lineas **de sus marcas**: las que tiene este mes o, si es
   jefatura, tambien las de su familia que no tienen dueño. Las demas lineas se ven pero no se tocan.
3. **Solo el precio.** No cambia cantidades (eso va por el modulo de cotizacion), no agrega ni quita
   lineas. Puede ajustar aunque el documento ya este aprobado: el documento es suyo y la marca tambien.
4. Al aplicar, en las lineas ajustadas:
   - el **precio** pasa a ser el que puso, redondeado al centimo (la mitad hacia arriba);
   - el **descuento del cliente pasa a 0**;
   - el **costo** de la linea pasa a ser el costo actual del producto en su almacen.

   Y en todo el documento:
   - **se quitan TODAS las promociones**, de todas las marcas, **incluido el descuento de flete de
     provincia**, que no vuelve a aplicarse solo;
   - se recalculan los totales.

   **El precio del producto en el ERP no se toca nunca**: el cambio es solo de ese documento. Y el
   ajuste no cambia la aprobacion: un pedido aprobado sigue aprobado.
5. **El precio nunca puede quedar por debajo del costo actual.** Ojo: hay productos cuyo precio de
   lista ya esta por debajo del costo; en esas lineas solo se puede **subir** el precio.
6. Puede ajustar el mismo documento **varias veces**. Cada ajuste queda en su historial.
7. **Asignar**: pasa el documento a un vendedor del grupo 20, haya ajustado o no. Desde ese momento
   el documento es del vendedor (lo ve en sus listas como suyo) y el jefe de marca ya no lo ve en
   `directo`; le queda en `asignados`.
   - Si se factura, la venta cuenta para la cuota del vendedor y para el avance de la marca.
   - Si el vendedor modifica una cotizacion asignada, su pantalla vuelve al precio de lista: el
     precio ajustado **no se protege**. Si quiere el precio especial, la envia a ajuste como siempre.
   - Si se asigna ya aprobada, el vendedor no la puede modificar y sigue su flujo normal.

**Fechas**: `AAAA-MM-DDTHH:MM:SS`, hora de Lima, sin zona (igual que en ajuste-precios).

---

## 2 · Menu

`GET /v1/ajuste` le devuelve al grupo 25 **tres** acciones (antes solo `recibidas`):

```
grupo 25  ->  "{\"accesos\":[\"recibidas\",\"directo\",\"asignados\"]}"
grupo 20  ->  "{\"accesos\":[\"enviar\",\"enviadas\"]}"          (sin cambios)
```

| accion | pantalla |
|---|---|
| `recibidas` | igual que hoy |
| `directo` | dos pestañas, **Cotizaciones** y **Pedidos**; abrir, ajustar y asignar |
| `asignados` | historial de solo lectura |

---

## 3 · Rutas

| ruta | para que |
|---|---|
| `GET  /v1/ajuste/directo/documentos?tipo=COT` | la lista de una pestaña (`COT` o `PED`) |
| `GET  /v1/ajuste/directo/documento?tipo=COT&ndocu=` | el detalle para ajustar |
| `POST /v1/ajuste/directo/aplicar` | aplicar los precios nuevos |
| `GET  /v1/ajuste/directo/vendedores?pista=` | buscador de vendedores del grupo 20, para asignar |
| `POST /v1/ajuste/directo/asignar` | pasar el documento a un vendedor |
| `GET  /v1/ajuste/asignados` | el historial de asignaciones |

Todas son solo del grupo 25. Aplicar y asignar se auditan.

---

## 4 · Lista de documentos — `GET /v1/ajuste/directo/documentos`

| parametro | |
|---|---|
| `tipo` | **obligatorio**: `COT` o `PED` (una pestaña cada uno) |
| `desde`, `hasta` | opcionales, `AAAA-MM-DD`, por fecha del documento |
| `ndocu` | opcional, con serie (`009-00969333`): busca **solo ese documento**, y entonces `desde` y `hasta` **se ignoran** |

**Sin `desde`, `hasta` ni `ndocu` llegan los de los ultimos 30 dias** (`ultimosDias: 30`), y
`desde`/`hasta` vienen con **las fechas de esos 30 dias**, contadas con la fecha del servidor, para
mostrarlas (*«del 07/10 al 06/11»*). Siempre los mas recientes primero, hasta 100; **`hayMas: true`**
si habia mas (*«Hay mas de 100: acota las fechas»*). Solo llegan los que todavia se pueden ajustar o
asignar: un `ndocu` suyo que ya se convirtio, se facturo o se anulo da la **lista vacia**, no un error.

Ejemplo real (jefatura 264, sin filtros, 06/11/2026):

```json
{ "status":"ok", "codigo":0, "data": {
    "tipo":"COT", "ndocu":null, "desde":"2026-10-07", "hasta":"2026-11-06", "ultimosDias":30,
    "hayMas":false, "documentos": []
} }
```

Ejemplo real (jefatura 264, pedidos de septiembre y octubre, recortado):

```json
{ "status":"ok", "codigo":0, "data": {
    "tipo":"PED", "ndocu":null, "desde":"2026-09-01", "hasta":"2026-10-31", "ultimosDias":null,
    "hayMas":false,
    "documentos": [
      { "ndocu":"009-00773963", "fecha":"2026-10-06", "cliente":"TECEMIP S.A.C.", "moneda":"D",
        "total":7937.36, "totalConIgv":9366.08, "situacion":"aprobado",
        "lineas":4, "lineasMias":3, "promociones":0, "flete":false, "ajustes":0 }
    ]
} }
```

| campo | que es |
|---|---|
| `situacion` | `sin aprobar` o `aprobado` |
| `lineas` / `lineasMias` | lineas del documento / cuantas son de sus marcas. Con `lineasMias: 0` no hay nada que ajustar, pero se puede asignar |
| `promociones` | lineas de promocion (incluye el flete). Si es mas de 0, al ajustar se quitan todas |
| `flete` | `true` si entre esas promociones esta el descuento de flete de provincia |
| `ajustes` | cuantos ajustes directos tuvo ya |

---

## 5 · Detalle — `GET /v1/ajuste/directo/documento?tipo=COT&ndocu=009-00969333`

La misma forma que `/ajuste/solicitud`, para reutilizar la pantalla de ajustar. Ejemplo real
(recortado a una linea):

```json
{ "status":"ok", "codigo":0, "data": {
    "tipo":"COT", "ndocu":"009-00969333",
    "puedoAjustar": true, "motivoAjustar": null,
    "puedoAsignar": true, "motivoAsignar": null,
    "documento": { "tipo":"COTIZACION", "ndocu":"009-00969333", "fecha":"2026-09-23",
                   "cliente":"MAGIC STAR S.R.L.", "moneda":"D", "tcam":3.362,
                   "total":3410, "totalConIgv":4023.8, "situacion":"sin aprobar" },
    "promociones": 0,
    "flete": false,
    "otrasLineas": 0,
    "otras": [],
    "lineas": [
      { "item":2, "codi":"1101-010110", "codf":"IMBRDCPT430W", "descripcion":"IMP. MFC DE TINTA BROTHER DCP-T430W",
        "marca": { "codmar":"0205", "abrmar":"BR_IM", "nombre":"BR_IMPRESORAS" },
        "actual": { "cantidad":10, "precio":134, "dsct":0, "total":1340, "precioNeto":134 },
        "costo":152.4, "stock":4, "almacen":"01", "precioMinimo":152.4,
        "margen": { "monto":-18.4, "sobreCosto":-12.07, "sobreVenta":-13.73 } }
    ],
    "ajustes": []
} }
```

| campo | que es |
|---|---|
| `puedoAjustar` | mostrar los controles de precio **solo si es `true`**: el documento se puede ajustar y tiene lineas de sus marcas |
| `motivoAjustar` | `null` si se puede; si no, por que (lista cerrada, abajo) |
| `puedoAsignar` | mostrar el boton de asignar **solo si es `true`** |
| `motivoAsignar` | `null` si se puede; si no, por que |
| `documento.situacion` | `sin aprobar` o `aprobado`; si el documento ya avanzo, en que quedo (`pedido`, `facturado`, `atendido`, `desaprobado`, `anulado`, `otro`) |
| `promociones` | si es mas de 0, **avisar**: al aplicar se quitan todas |
| `flete` | `true` si una de esas promociones es el **descuento de flete de provincia**: nombrarlo en el aviso |
| `otrasLineas` | cuantas lineas son de otras marcas |
| `otras[]` | esas lineas, **solo para verlas**: `item`, `codi`, `codf`, `descripcion`, `marca`, `cantidad`, `precio`, `dsct`, `total`. Sin costo ni margen |
| `lineas[]` | **solo las de sus marcas**. `actual.precio` es el precio de lista; `precioNeto`, lo que paga hoy el cliente por unidad |
| `costo`, `precioMinimo`, `stock`, `margen` | igual que en `/ajuste/solicitud`. El margen negativo del ejemplo es real: ese producto tiene el precio de lista bajo el costo |
| `ajustes` | los ajustes directos anteriores, los mas recientes primero (forma abajo) |

No hay `cantidadAjustable`: en esta accion la cantidad nunca se ajusta.

**Los motivos** (lista cerrada, en este orden de prioridad):

| motivo | `motivoAjustar` | `motivoAsignar` | que decir |
|---|---|---|---|
| `documento avanzado` | si | si | ya se convirtio, se facturo, se anulo o fue desaprobado (`documento.situacion` dice en que quedo) |
| `documento en ajuste` | si | si | tiene una solicitud de ajuste de un vendedor sin responder. Con sus propios documentos no deberia pasar; se comprueba igual |
| `sin lineas propias` | si | — | ninguna linea es de sus marcas este mes: no hay nada que ajustar, pero se puede asignar |

**Si el documento avanzo entre la lista y el detalle**, el detalle llega normal, con los dos `false`
y `motivo: documento avanzado`. `403 documento desconocido` solo llega si ya no es suyo (por
ejemplo, porque lo asigno).

Ejemplo real de las otras lineas (pedido `009-00773963`, jefatura 264):

```json
"otrasLineas": 1,
"otras": [ { "item":1, "codi":"0504-010155", "codf":"CIBTZE241",
             "descripcion":"CINTA BROTHER TZE241 BLACK ON WHITE 3/4\" X 8 MTS  (18MM)",
             "marca": { "codmar":"0009", "abrmar":"BROTH", "nombre":"BROTHER" },
             "cantidad":63, "precio":14.67, "dsct":0, "total":924.21 } ]
```

**`ajustes[]`** (ejemplo real, despues de aplicar):

```json
[ { "id":2, "fecreg":"2026-11-06T14:05:57",
    "ajusta": { "codusu":"264", "nombre":"ATOCHE HEIDI" },
    "observacion":"prueba ajuste directo", "promocionesQuitadas":0,
    "totalConIgvAntes":4023.8, "totalConIgvDespues":4281.75,
    "lineas": [ { "item":2, "codi":"1101-010110", "descripcion":"IMP. MFC DE TINTA BROTHER DCP-T430W",
                  "marca": { "codmar":"0205", "abrmar":"BR_IM" },
                  "antes":   { "cantidad":10, "precio":134,    "dsct":0 },
                  "despues": { "cantidad":10, "precio":155.86, "dsct":0, "costo":152.4 } } ] } ]
```

---

## 6 · Aplicar — `POST /v1/ajuste/directo/aplicar`

```json
{ "tipo":"COT", "ndocu":"009-00969333",
  "lineas":[ { "item":2, "precio":155.856 } ],
  "observacion":"precio por volumen, trato con el cliente" }
```

- `lineas`: solo las que se ajustan, al menos una. Las demas no se tocan.
- `precio`: se redondea al centimo, la mitad hacia arriba (155.856 → 155.86). Mayor que 0 y, ya
  redondeado, no menor que `precioMinimo`.
- `cantidad`: no se manda. Si viene, tiene que ser la misma que ya tiene la linea.
- `observacion`: opcional, hasta 300 caracteres. Queda en el historial.

Respuesta (real):

```json
{ "status":"ok", "codigo":0, "data": {
    "id":2, "tipo":"COT", "ndocu":"009-00969333",
    "lineas": [ { "item":2, "codi":"1101-010110",
                  "antes":   { "cantidad":10, "precio":134,    "dsct":0 },
                  "despues": { "cantidad":10, "precio":155.86, "dsct":0, "costo":152.4 } } ],
    "promocionesQuitadas": 0,
    "totales": { "tota":3628.6, "toti":653.15, "totn":4281.75 }
} }
```

`totales` son los nuevos totales del documento entero (sin IGV, IGV, con IGV). Despues de aplicar,
volver a pedir el detalle para repintar.

---

## 7 · Asignar

### Buscar el vendedor — `GET /v1/ajuste/directo/vendedores?pista=anthony`

Vendedores **activos del grupo 20**, **sin restriccion de cartera ni de zona**: el jefe de marca
sabe a quien se lo pasa. La `pista` busca en el nombre o en el codigo; sin pista llegan todos (hoy
son 34). Hasta 50, por nombre; **`hayMas: true`** si habia mas (*«escribe mas del nombre»*).

```json
{ "status":"ok", "codigo":0, "data": { "hayMas":false, "vendedores": [
    { "codven":"V0278", "nombre":"HUAMANI ANTHONY", "tipo":"COBERTURA" },
    { "codven":"V0251", "nombre":"UBILLUZ ZEGARRA ANTHONY JUNIOR", "tipo":"CARTERA" }
] } }
```

### Asignar — `POST /v1/ajuste/directo/asignar`

```json
{ "tipo":"PED", "ndocu":"009-00773963", "codven":"V0278" }
```

Respuesta (real):

```json
{ "status":"ok", "codigo":0, "data": {
    "id":2, "fecreg":"2026-11-06T14:05:58", "tipo":"PED", "ndocu":"009-00773963",
    "cliente":"TECEMIP S.A.C.", "moneda":"D", "totalConIgv":9412.81,
    "vendedor": { "codven":"V0278", "nombre":"HUAMANI ANTHONY" }
} }
```

**Pedir confirmacion antes de asignar**: no se puede deshacer desde la intranet. El documento
desaparece de `directo` (si se vuelve a pedir, responde `403 documento desconocido`).

---

## 8 · Historial — `GET /v1/ajuste/asignados`

Lo que asigno, los mas recientes primero, hasta 100 (**`hayMas: true`** si habia mas). Filtros
opcionales `desde` y `hasta` (`AAAA-MM-DD`, por fecha de asignacion). Solo lectura.

```json
{ "status":"ok", "codigo":0, "data": { "hayMas":false, "asignados": [
    { "id":2, "tipo":"PED", "ndocu":"009-00773963", "fecreg":"2026-11-06T14:05:58",
      "totalConIgv":9412.81, "vendedor": { "codven":"V0278", "nombre":"HUAMANI ANTHONY" },
      "cliente":"TECEMIP S.A.C.", "moneda":"D", "situacion":"aprobado", "ajustes":1 }
] } }
```

| campo | que es |
|---|---|
| `totalConIgv` | el total del documento **al momento de asignarlo** |
| `situacion` | en que quedo el documento **hoy**: `sin aprobar`, `aprobado`, `pedido` (la cotizacion se convirtio), `facturado`, `atendido`, `desaprobado`, `anulado` u `otro` |
| `ajustes` | cuantos ajustes directos tuvo antes de asignarlo |

---

## 9 · Errores

| http | status | cuando |
|---|---|---|
| 400 | `tipo invalido` | `tipo` no es COT ni PED |
| 400 | `documento ambiguo` | `ndocu` sin serie |
| 400 | `fechas invalidas` | `desde`/`hasta` mal escritos, inexistentes o `desde` posterior a `hasta` |
| 403 | `documento desconocido` | no existe o no es suyo (tambien despues de asignarlo) |
| 409 | `documento no ajustable` | aplicar: ya se convirtio, se facturo, se anulo o fue desaprobado |
| 409 | `documento no asignable` | asignar: lo mismo |
| 409 | `documento en ajuste` | tiene una solicitud de ajuste pendiente |
| 400 | `ajuste vacio` | `lineas` vacio |
| 400 | `linea ajena` | un `item` que no es de sus marcas, que no existe o que viene repetido |
| 400 | `precio invalido` | precio no numerico o 0 |
| 409 | `precio bajo costo` | precio por debajo de `precioMinimo`. No cambia nada: corregir y volver a aplicar |
| 400 | `cantidad no ajustable` | se mando otra cantidad |
| 409 | `costo desconocido` | el producto no tiene costo en el almacen de la linea: no existe **o es 0**. En el detalle esa linea llega con `costo`, `precioMinimo` y `margen` en `null`: mostrarla sin controles de precio |
| 400 | `vendedor invalido` | el codigo no es de un vendedor activo del grupo 20 |
| 400 | `no identificado` | no esta registrado en la intranet |
| 403 | `sin permiso` | no es del grupo 25 |
| 401 | `falsa galleta` | sin sesion |

Ningun error cambia nada.

---

## 10 · Para probar en bdnava08

| caso | documento | quien |
|---|---|---|
| Cotizacion sin aprobar, 3 lineas de su familia (todas con precio de lista bajo el costo: solo se puede subir) | `009-00969333` | jefatura 264 ATOCHE HEIDI (V0232) |
| Pedido **aprobado**, 3 de 4 lineas de su familia | `009-00773963` | jefatura 264 (V0232) |
| Cotizacion sin aprobar, 1 linea (HP, costo 87.102 → minimo 87.11) | `009-00971194` | jefatura 071 COSSIO JOANNA (V0008) |
| Cotizacion **aprobada**, 3 lineas de TOSHIBA con costo de 3 decimales | `009-00966639` | jefatura 071 (V0008) |
| Cotizacion con lineas que **no son suyas** (`lineasMias: 0`): no se ajusta, pero se puede asignar | `009-00962947` | jefatura 071 (V0008) |
| Especialista: cotizacion de 2024 con 4 lineas de EPSON. **No sale en los ultimos 30 dias**: sirve para probar la busqueda por `ndocu` | `009-00821916` | especialista 229 SAUÑE MANUEL (V0172) |
| **Con flete de provincia**: cotizacion aprobada, 1 linea BROTHER (costo 102, precio 113) y el flete (`promociones: 1`, `flete: true`). Al aplicar, `promocionesQuitadas: 1` y el flete no vuelve | `009-00963707` | jefatura 264 (V0232) |
| **Dos ajustes seguidos**: cotizacion sin aprobar con 2 lineas BROTHER (una bajo costo: 160 contra 184.04) y flete | `009-00958734` | jefatura 264 (V0232) |
| Cotizacion convertida en pedido: el detalle llega con `motivo: documento avanzado` y `situacion: pedido`; por `ndocu`, la lista vacia | `009-00971426` | jefatura 264 (V0232) |
| Rango amplio con `hayMas: true`: COT del `2020-01-01` al `2026-11-30` | — | jefatura 264 (V0232) |
| **Especialista sin marcas del mes**: `lineasMias: 0`, `motivoAjustar: sin lineas propias`, se puede asignar | `009-00971613` | especialista 270 RUBIÑOS ANDERSON (V0236) |
| Un vendedor del grupo 20 entrando a estas rutas: `403 sin permiso` | — | 246 o 196 |
| Vendedor para asignar | `V0278` HUAMANI ANTHONY | grupo 20 |

Las marcas de noviembre ya estan cargadas (las mismas de octubre; ver
[ajuste-precios.md](ajuste-precios.md), seccion 8). **Aplicar y asignar modifican los documentos de
verdad**, y un documento asignado deja de ser de quien lo asigno: avisen y lo dejamos como estaba.

---

## 11 · Respuestas a [respuesta-ajuste-directo.md](respuesta-ajuste-directo.md)

| pregunta | respuesta |
|---|---|
| 1 · ¿Se ven las lineas de otras marcas? | **Si**: `otras[]` en el detalle, con la forma que propusieron y sin costo ni margen (seccion 5). `otrasLineas` sigue llegando |
| 2 · El detalle de un documento que ya avanzo | **El detalle normal**, con `puedoAjustar: false`, `puedoAsignar: false`, `motivo: documento avanzado` y `documento.situacion` diciendo en que quedo (`pedido`, `facturado`...). `403 documento desconocido` solo si ya no es suyo |
| 3 · Por que es `false` | **`motivoAjustar` y `motivoAsignar`**, con la lista cerrada de la seccion 5: `documento avanzado`, `documento en ajuste` y (solo ajustar) `sin lineas propias`. No hay otros. Una linea sin costo cargado no bloquea el documento: llega con `costo` en `null` y al aplicarla da `409 costo desconocido` |
| 4 · ¿Hay mas de 100? | **`hayMas`** en `directo/documentos` y `asignados` (100) y en `directo/vendedores` (50) |
| 5 · `ndocu` y los 30 dias | Con `ndocu`, **`desde` y `hasta` se ignoran**. Un `ndocu` suyo que ya no se puede ajustar ni asignar da **la lista vacia**. Sin filtros, `desde` y `hasta` llegan **con las fechas de los 30 dias** (seccion 4) |
| 6 · ¿El flete esta entre las promociones? | **Si**, y ahora se dice: **`flete: true/false`** en el detalle y en cada documento de la lista. `promociones` lo sigue contando |
| 7 · ¿Restricciones para elegir el vendedor? | **Ninguna**: cualquier vendedor activo del grupo 20, aunque el cliente no este en su cartera o sea de otra zona. Lo decide el jefe de marca |

Su seccion 2 nos parece bien tal cual, incluido el aviso al asignar una cotizacion ya ajustada y que
`documento no ajustable`, `no asignable` y `en ajuste` vuelvan a pedir el detalle. Sobre el precio de
lista bajo el costo tienen razon: no basta con subir, hay que llegar al minimo (en `009-00969333`,
140 da `409 precio bajo costo` y 152.40 se aplica).

Los casos de su seccion 3 estan todos en la seccion 10, incluidos los que faltaban: el flete, dos
ajustes seguidos, `lineasMias: 0`, el especialista sin marcas y el vendedor del grupo 20.

---

## 12 · Respuestas a la segunda ronda de [respuesta-ajuste-directo.md](respuesta-ajuste-directo.md)

**La linea sin costo en «Recibidas»** (lo unico que faltaba): preparadas en bdnava08 las dos
variantes, en [ajuste-precios.md](ajuste-precios.md), seccion 8, parte B:

| id | documento | recibe | caso |
|---|---|---|---|
| 21 | `009-00970744` | 229 | **mezclada**: de 4 lineas de EPSON, los items 1 y 11 sin costo y los 12 y 13 con costo 7.23. Sirve para «Vas a ajustar 1 de N» y para `409 costo desconocido` sin consumir la solicitud |
| 22 | `009-00971696` | jefatura 071 | **ninguna linea con costo**: el aviso de «ninguna linea se puede ajustar» y rechazar |

Las pendientes de prueba vencian el 09/11 y se renovaron: todas **vencen el 17/11/2026**.

**La asignacion de prueba**: de acuerdo con hacerla al final. El documento es el de su tabla,
`009-00773963` (pedido aprobado de la jefatura 264) a `V0278`. Para que en «Asignados» salga con
`ajustes: 1`, apliquen antes un ajuste sobre ese mismo pedido: `ajustes` cuenta los ajustes directos
**anteriores a la asignacion**. Cuando terminen, avisen y lo devolvemos a 264 junto con los demas
documentos que hayan ajustado (`009-00969333`, `009-00971194`, `009-00966639`, `009-00963707`,
`009-00958734`), y el `009-00970744` vuelve a su almacen.

**Fechas**: el titulo de los 30 dias cambia con el dia. Hoy (10/11) llegan `desde: 2026-10-11` y
`hasta: 2026-11-10`.

Lo demas de su documento (las tres pantallas, los avisos al aplicar y al asignar, el orden «aplicar
no cierra, asignar si», los errores y la tarjeta de precio compartida con «Recibidas») no necesita
nada del backend.
