# Respuesta a `crear-cotizacion.md`

Revisión del documento que llegó del frontend, contrastada contra el código y la base
de datos. Para cada ruta: **qué se verificó, qué se cambió, y qué queda por hacer.**

Todo lo que aquí se afirma está comprobado ejecutando el código o consultando la base,
no leído de memoria. Lo que no pude comprobar se dice explícitamente.

---

## Resumen: qué cambió hoy y qué tiene que hacer el frontend

| ruta | estado | ¿el frontend debe cambiar algo? |
|---|---|---|
| `GET /vendedor` | **cambiada** | **sí** — nueva forma, y ahora sí llegan `nombre`, `grupo`, `tipo`, `tipoCambio` |
| `GET /cotizacion` | **cambiada** | **sí** — los accesos pasaron de `accesos` a `data` |
| `POST /cliente/buscar` | sin cambiar | no |
| `POST /cliente/id` | sin cambiar | no |
| `POST /producto/buscar` | **corregida** | no en la forma — pero el stock de Piura que mostraban era de otro almacén |
| `POST /promocion/recolector` | ya estaba | no |
| `POST /promocion/detalle` | ya estaba | no |
| `POST /cotizacion/pegar` | **cambiada** | **sí** — ahora devuelve el `ndocu` |

Las tres rutas compartidas (`cliente/*`, `producto/buscar`) las consumen **otras pantallas
que siguen en producción**, así que **conservan su forma de respuesta** a propósito, para no
romperlas. Se migrarán cuando esas pantallas se reescriban. La corrección de
`/producto/buscar` es de **dato, no de forma**: mismas 7 posiciones, valor correcto.

---

## El sobre `{ status, codigo, data }`

Respondiendo a la pregunta transversal del documento: **sí, es la forma hacia la que van
todas las rutas.** Pero la migración es por pantalla, no de golpe.

De las 8 rutas de *Crear cotización*, **5 ya lo usan**. Las 3 restantes son compartidas.

Dato que puede ahorrar trabajo: **los errores ya estaban estandarizados**. Los 25 casos de
`funciones/error/err1.js` devuelven el sobre y los usan todos los módulos. Lo único
disperso eran las respuestas de éxito.

`codigo`: `0` correcto · `1` error interno · `2` dato inválido · `3` permiso o estado.

---

## `GET /vendedor` — cambiada

### Lo que se encontró

El documento la describe como una respuesta JSON con datos de usuario. **No lo era.**
El handler hacía:

```js
res.redirect(`/v1/vendedor/${tipo.toLowerCase()}`)
```

Un *redirect* a `/v1/vendedor/especialista`, `/cobertura`, `/cartera` o `/zona` según la
cookie `tip`. Esa ruta destino devolvía **solo el mapa de módulos**, doble codificado.

Por eso `nombre`, `grupo`, `tipo`, `marcas` y `tipoCambio` nunca llegaban, y la pantalla
caía siempre a su versión genérica. No era un fallo del frontend.

### Lo que se cambió

El destino del redirect ahora devuelve el sobre **con los datos de usuario**:

```json
{
  "status": "ok",
  "codigo": 0,
  "data": {
    "cotizacion": "Permite manejar cotizaciones",
    "factura": "Modifica ciertos campos de la factura",
    "promocion": "Permite adjuntar y retirar promociones",
    "cuota": "Ver el avance de las cuotas",
    "reporte": "Permite sacar reportes de marcas"
  },
  "nombre": "JUAN CARLOS",
  "grupo": "VENTAS-JEFES DE PROD",
  "tipo": "ESPECIALISTA",
  "tipoCambio": 3.437
}
```

- El mapa de módulos pasó de la raíz a **`data`**.
- `nombre` y `grupo` salen del token de sesión.
- `tipo` sale de la cookie `tip`.
- **`tipoCambio` es el real del día** (`tbl01tca.tcvta`), ya no hace falta el 3.408 fijo.
  Si no hay tipo de cambio cargado para hoy llega `null` — la pantalla debe tolerarlo.

`marcas` sigue sin llegar: necesita otra consulta y solo aplica a `ESPECIALISTA`.
Si hace falta, se agrega.

### ⚠️ Un problema que sigue abierto y afecta a usuarios hoy

| cookie | caducidad |
|---|---|
| `cdk` (sesión) | **24 horas** |
| `tip` (tipo de vendedor) | **1 hora** |

`/vendedor` necesita las dos. **Pasada la hora, `tip` expira y `/vendedor` responde 401**
aunque la sesión siga válida 23 horas más.

Como cualquier 401 cierra sesión y manda al login, **el vendedor sería expulsado cada
hora**. Es el tipo de fallo que se reporta como "se cayó el sistema".

**No se corrigió** porque toca el login y conviene decidirlo juntos: igualar `tip` a 24 h,
o dejar de depender de ella leyendo el tipo del token. Vale la pena confirmar primero si
está pasando en producción.

---

## `GET /cotizacion` — cambiada

Antes: `{"accesos": ["crear", ...]}` doble codificado.
Ahora:

```json
{ "status": "ok", "codigo": 0, "data": ["crear","leer","update","delete","alm"] }
```

**El frontend debe leer `data`, no `accesos`.**

Nota sobre los nombres: el backend devuelve `crear`, `leer`, `update`, `delete`, `alm`.
El documento del frontend menciona `crear`, `observar`, `modificar`, `almacen`. **No
coinciden**, así que hoy probablemente no se pinta ninguna tarjeta o se pintan mal.
Hay que acordar un vocabulario: o el backend traduce, o el frontend mapea.

Se mantiene lo que dice el documento: el backend **no** confía en esto para autorizar.
`/acoplar` y `/eliminar` verifican el permiso del grupo del lado servidor.

---

## `POST /cotizacion/pegar` — cambiada

Era el punto 4 del documento, el que más bloqueaba.

### Antes

```js
res.status(200).json(JSON.stringify({"success":true}))
```

Doble codificado y **sin el número de cotización**. Por eso el frontend tenía que adivinar
el éxito buscando `success`, `valid`, `estado`, `resultado`, `numero`, `id`…

### Ahora

```json
{ "status": "ok", "codigo": 0,
  "documento": "098-00000037",
  "lineas": 1,
  "totales": { "tota": 861.94, "toti": 155.15, "totn": 1017.09 } }
```

- **`documento` es el `ndocu` completo, con serie.** Sirve para mostrárselo al vendedor y
  para encadenar `/promocion/acoplar`, que lo exige con serie.
- `totales` en dólares: sin IGV, IGV, con IGV.
- En fallo responde el catálogo de errores común, con `status` legible y el HTTP correcto.

**Se puede borrar el bloque de heurísticas.** Éxito es `status: "ok"`; cualquier otra cosa
es fallo, y el `msg` es el texto para el vendedor.

**Probado punta a punta**: se creó la cotización `098-00000037` en la base de pruebas y se
encadenó `/acoplar` con el número devuelto. Funcionó.

### Punto 1 del documento: `promos`

`/pegar` **no lee `promos`**. No es que llegue vacío: el campo no se consulta nunca. Solo
se leen `cliente`, `productos` y `moneda`.

**El camino es el segundo que planteaba el documento:** llamar a `/promocion/acoplar`
después de `/pegar`, con el `documento` que ahora devuelve. Ya es posible.

El contrato de `/acoplar` es `{ "ndocu": "098-00000037", "nprom": "15112" }` — una llamada
por promoción. Detalle en [`promociones.md`](promociones.md).

### Punto 2 del documento: `moneda` — la sospecha se quedaba corta

**El backend sí convertía.** Había una rama `if(moneda=='S')` que multiplicaba precio y
costo por el tipo de cambio.

Y además **estaba rota**: recorría `dataenviada["productos"]` cuando `dataenviada` ya era
el objeto de productos. `for...in` sobre `undefined` no itera nunca, así que creaba la
**cabecera con total 0 y sin ninguna línea de detalle**. Encima leía índices posicionales,
el formato viejo de `/create`, no los campos con nombre que manda la pantalla.

**Se eliminó la conversión.** Ahora `moneda` solo se registra en la cabecera (columna
`mone`), tal como describe el documento. Mandar `"S"` ya es seguro.

### Punto 3 del documento: almacén

No se deduce del vendedor: `crear_detallado.js` escribe **`codalm = '01'` fijo** en todas
las líneas. Para cambiarlo existe `/cotizacion/almacen`.

Si la pantalla debe poder elegirlo al crear, hay que agregar el campo al cuerpo — hoy no
se contempla.

### Punto 5 del documento: campos que no se usan

Confirmado. De cada producto, `/pegar` solo lee:

`codigo` · `cantidad` · `precioUnitario` · `descuento` · `preciosinIGV`

**No se leen** `descuentoMaximo`, `stock1`, `stock2`, `stock3` ni `stockTotal`.
`descripcion` tampoco: se toma de la base junto con costo, part number y marca.

Se pueden dejar de enviar. Enviarlos no hace daño.

---

## `POST /cliente/buscar` — sin cambiar, pero hay un desajuste

La forma de la respuesta no se tocó. Pero **el documento espera tres posiciones y la
consulta devuelve dos**:

```sql
select top 4 codcli, nomcli from mst01cli where estado=1 and (nomcli like @pista OR ruccli like @num)
```

Busca *por* RUC pero **no lo devuelve**. La posición 2 llega `undefined`.
También hay un `top 4` que el documento no menciona: nunca vuelven más de 4 resultados.

Agregar `ruccli` al SELECT es una columna más. **No se hizo** porque cambiar el número de
posiciones rompería a las otras pantallas que ya leen esta ruta. Conviene hacerlo en el
mismo despliegue que las migre.

---

## `POST /cliente/id` — sin cambiar, una posición a confirmar

La consulta es `codcli, nomcli, ruccli, codven, codcdv, tipocl`.

| posición | columna | lo que dice el documento | ¿coincide? |
|---|---|---|---|
| 0 | `codcli` | código | sí |
| 1 | `nomcli` | razón social | sí |
| 2 | `ruccli` | RUC | sí |
| 3 | `codven` | vendedor asignado | sí |
| 4 | `codcdv` | condición de pago | **a confirmar** |
| 5 | `tipocl` | letra | sí |

La posición 4 es `codcdv`, no un campo de condición de pago. Conviene confirmar con
sistemas qué representa antes de darle ese nombre en la interfaz.

### Punto 6: línea de crédito

El dato **existe**: `mst01cli.mcredi` (monto) y `CodMonLinea` (moneda). Ejemplo real:
`50000` en `D`.

No es un `S`/`N` como pedía el documento, es un **importe con su moneda**. Decidan cómo lo
quieren —el monto, o un booleano derivado de `mcredi > 0`— y se agrega.

---

## `POST /producto/buscar` — la forma calza, el stock de Piura no

Lee `letra`, `sugerencia` y `tipbusq`, y devuelve las 7 posiciones en el orden que describe
el documento. **La estructura es la única que coincidía al cien por cien.**

Dos cosas que el documento no menciona: hay un **`top 5`** (nunca vuelven más de 5
productos) y solo se buscan artículos con `vvus > 1`.

### El stock de "Piura" era de Chorrillos

Revisando la consulta apareció un error real. El ERP guarda el stock de cada almacén en su
propia tabla, `prd01` + código de almacén:

| tabla | almacén |
|---|---|
| `prd0101` | 01 · PRINCIPAL |
| `prd0108` | 08 · M & M |
| `prd0115` | **15 · PIURA** |
| `prd0116` | 16 · CHORRILLOS |

La consulta unía **`prd0116`** y rotulaba la columna `'piura'`. Es decir, **la posición 6
traía el stock de Chorrillos**.

No es interpretación nuestra: el propio procedimiento del ERP `PRO_InventarioAlmPiura2`
hace `LEFT JOIN prd0115 as piu` y `LEFT JOIN prd0116 as cho`.

**Alcance medido sobre los productos activos: 168 con valor equivocado.** En 146 se ocultaba
stock que sí existe en Piura, y en 22 se mostraba stock que allí no está.

Ejemplo real, antes y después:

| producto | mostraba | real en Piura |
|---|---|---|
| BOTELLA TINTA EPSON T544220 CIAN | 0 | **470** |
| BOTELLA TINTA EPSON T544420 YELLOW | 0 | **470** |
| BOTELLA TINTA EPSON T544120 NEGRO | 0 | **457** |

**Corregido** a `prd0115`. Verificado contra la base: esos productos ahora devuelven 470,
470 y 457 en la posición 6.

**El frontend no tiene que cambiar nada** — misma posición, mismo tipo. Pero conviene
saberlo: si alguien reportó que "Piura nunca tiene stock", esta era la causa, y las
cotizaciones que se dejaron de hacer por eso eran evitables.

### Punto 6: costo y part number

Los dos **existen** en `prd0101` y solo falta agregarlos al SELECT:

| dato | columna |
|---|---|
| costo | `prd0101.pcus` |
| part number | `prd0101.codf` |

Y sirven: buscando en la base aparecen productos con **costo 8.27 y precio 5.50**, es
decir vendiéndose bajo costo. Es exactamente lo que el documento quería poder avisar.

**No se agregaron** por la misma razón que el RUC: cambiarían las posiciones del arreglo y
romperían las otras pantallas.

---

## `POST /promocion/recolector` y `/detalle` — sin cambios

Ya usaban el sobre. El contrato completo, con ejemplos de las ocho combinaciones, está en
[`promociones.md`](promociones.md).

### Punto 8: el ejemplo que no cuadraba

**Tenían razón, el ejemplo estaba mal.** Se copiaron `cantidad`, `precioUnitario` y
`preciosinIGV` de una línea real que tenía **3 % de descuento**, pero se escribió
`descuento: 0`.

La fórmula del documento es la correcta:

```
preciosinIGV = cantidad × precioUnitario × (1 − descuento/100)
```

Con `descuento: 0` → **888.60**. Con el 3 % real → 861.94.
Ya está corregido en `promociones.md`.

---

## Punto 7: código de almacén de Piura

**`codalm = '15'`**, confirmado en `tbl01alm`. Catálogo completo de los que usa la pantalla:

| código | almacén |
|---|---|
| `01` | PRINCIPAL |
| `08` | M & M |
| `15` | **PIURA** |
| `16` | CHORRILLOS |

El 16 se incluye porque es el que estaba colándose como Piura en `/producto/buscar`.

---

## Lo que queda pendiente, por orden de urgencia

1. **La caducidad de la cookie `tip`** (1 h contra 24 h de `cdk`). Es el único que afecta
   a usuarios ahora mismo. Hay que decidir entre igualarla o dejar de depender de ella.
2. **El vocabulario de accesos** de `GET /cotizacion`: `crear`/`leer`/`update`/`delete`/`alm`
   contra `crear`/`observar`/`modificar`/`almacen`. Hoy no coinciden.
3. **El RUC en `/cliente/buscar`** y **costo + part number en `/producto/buscar`**: ambos
   cambian posiciones del arreglo, así que van cuando se migren las otras pantallas.
4. **Qué es `codcdv`** (posición 4 de `/cliente/id`).
5. **El almacén al crear**, si la pantalla debe poder elegirlo.
6. **La línea de crédito**, decidiendo qué forma quieren.

### Y uno del lado del backend

`otorgar_tcm.js` escribe **`tcme = '3.37'` fijo** en toda cotización, puesto
"temporalmente" el 7 de septiembre. El valor real de hoy es **3.45**. El campo `tcam` sí
queda correcto (3.437); es `tcme` el que está congelado.
