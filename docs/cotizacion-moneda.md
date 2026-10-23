# Cotizacion en soles — moneda y tipo de cambio

Acuerdo entre backend y frontend: el problema, la regla que usa el ERP y lo que hace cada lado.

> **Actualizado el 23/10/2026, en respuesta a [respuesta-cotizacion-moneda.md](respuesta-cotizacion-moneda.md):**
>
> - **CORRECCION IMPORTANTE: la regla de la linea estaba mal.** El ERP **no** calcula
>   `redondear(preu × cant × (1 − dsct/100), 2)`: primero redondea **el precio con descuento a 2
>   decimales** y despues lo multiplica por la cantidad. Comprobado contra todas las lineas de 2026
>   (seccion 2). **Hay que cambiarlo en la pantalla y en lo que viaja a `/update`.** Para la
>   098-00000069 el total correcto es **S/ 16 396.10**, no S/ 16 395.71.
> - **El backend ya esta hecho y probado en bdnava08** (seccion 7). No sale a produccion hasta
>   probarlo junto con la pantalla, como piden.
> - Sus tres preguntas estan respondidas en la **seccion 8**.

---

## 1 · El problema

Una cotizacion creada con **soles** en pantalla se graba con la moneda en soles pero **con todos
los importes en dolares**. Caso real, **098-00000069** (creada el 23/10/2026 desde la intranet):

| campo | grabado | que es en realidad |
|---|---|---|
| `mst01cot.mone` | `S` | |
| `tcam` | 3.45 | el tipo de cambio de venta del dia (correcto) |
| `dtl01cot.preu` | 41.52 | el precio de lista del producto **en dolares** (`vvus`) |
| `dtl01cot.cost` | 38.5207 | el costo **en dolares** (`pcus`) |
| `tota` / `totn` | 4 027.44 / 4 752.38 | **dolares** |

Quien abra esa cotizacion en el ERP ve **S/ 4 752.38** por algo que vale **S/ 16 395.71**.

**Por que pasa:** `/cotizacion/pegar` recibe los precios en dolares (asi los manda hoy el frontend,
este o no en soles la pantalla) y graba la moneda que llega en `moneda`, **sin convertir nada**.
Hace unos meses habia una conversion en el backend, pero estaba rota y se retiro el 07/10/2026
sin reemplazarla.

---

## 2 · Como graba el ERP una cotizacion en soles

Comprobado con cotizaciones en soles hechas en el ERP el mismo dia (009-00974681 y 009-00974688):
**todo el documento queda en soles**, convertido con el `tcam` de la cotizacion.

| campo | regla | ejemplo `0505-012605`, tc 3.45, cant 6, dsct 2.5 % |
|---|---|---|
| `mone` | `S` | `S` |
| `moneitm` | **`D`**: es la moneda de origen del producto, no la del documento | `D` |
| `tcam` | tipo de cambio **de venta** del dia (`tbl01tca.tcvta`) | 3.45 |
| `preu` | `vvus × tcam`, **3 decimales** | 7.97 × 3.45 = **27.497** |
| `cost` | `pcus × tcam`, **3 decimales** | 7.45 × 3.45 = **25.703** |
| precio con descuento (no se graba) | `preu × (1 − dsct/100)`, **2 decimales** | 27.497 × 0.975 = 26.809575 → **26.81** |
| `tota` de la linea | **precio con descuento × cant**, 2 decimales | 26.81 × 6 = **160.86** |
| `totn` de la linea | `tota × 1.18`, 2 decimales | **189.81** |
| cabecera `tota` | suma de `tota` de las lineas | |
| `toti` / `totn` | `toti` = `tota × 0.18` a 2 decimales; `totn` = `tota + toti` | |

**Todo redondea mitad hacia arriba**, sobre el valor decimal exacto.

**Como se comprobo.** Contra todas las lineas de cotizacion de 2026 de la serie 009 en bdnava01:
176 155 en dolares y 10 225 en soles.

| | en dolares | en soles |
|---|---|---|
| cumplen la regla de arriba | 175 973 | 8 012 |
| el vendedor tecleo un precio final con IGV (`tota = totn / 1.18`) | 182 | 2 213 |
| **sin explicar** | **0** | **0** |

La regla que dimos antes, `redondear(preu × cant × (1 − dsct/100), 2)`, solo explica el 51 % de las
lineas en soles. **Es la que hay que reemplazar.**

Las cabeceras en soles cumplen su regla en el 97 % (2 628 de 2 703). El resto son documentos tocados
despues en el ERP.

Los otros modulos del backend ya dan por hecho esta regla: el **ajuste de precios** convierte el
costo con el `tcam` del documento si va en soles, y el **flete** convierte su minimo de la misma
forma. La cotizacion es la unica que no la cumple.

---

## 3 · Que tipo de cambio usar

- **Al crear:** el de venta del dia, `tbl01tca.tcvta`. Es el que ya les llega como **`tipoCambio`**
  en el menu (`GET /v1/vendedor/cobertura`, `/cartera`, `/zona`, `/especialista`, `/jefatura`,
  `/hp`). Hoy, 23/10/2026, vale **3.45**.
  - **No** usar `tcmer` (tipo de cambio mercado), que es otro numero. Tampoco un valor fijo.
  - Si `tipoCambio` llega **`null`** es que el tipo de cambio de hoy no esta cargado. En ese caso
    `/pegar` falla con `tipcambio no registrado` en cualquier moneda. **Propuesta:** deshabilitar
    la opcion soles y avisar.
- **Con una cotizacion ya grabada:** el **`tcam` de esa cotizacion** (lo devuelve `/read`), **nunca
  el del dia**. Una cotizacion de ayer en soles se edita con el tipo de cambio de ayer.

---

## 4 · Propuesta, ruta por ruta

### `POST /v1/cotizacion/pegar` — crear

| | quien | que |
|---|---|---|
| precios del cuerpo | **frontend** | **siguen llegando en dolares**, como hoy (`precioUnitario`, `preciosinIGV`), en cualquier moneda. No cambia nada |
| `moneda` | **frontend** | `"D"` o `"S"`, como hoy |
| conversion | **backend** | si `moneda` es `"S"`, convierte con la regla de la seccion 2 y el `tcvta` del dia, igual que el ERP |
| respuesta | **backend** | `totales` en la moneda del documento, con dos campos nuevos: **`moneda`** y **`tcam`** |

Asi el tipo de cambio y el redondeo se deciden en un solo lugar, y el frontend no tiene que cambiar
lo que manda.

Respuesta real, en bdnava08, para el carrito de la 098-00000069 en soles:

```json
{ "status":"ok", "codigo":0, "documento":"098-000000xx", "lineas":1,
  "moneda":"S", "tcam":3.45,
  "totales":{ "tota":13895.00, "toti":2501.10, "totn":16396.10 } }
```

Con `moneda` distinta de `"D"` o `"S"` responde **400 `moneda desconocida`**. En soles sin tipo de
cambio del dia, **400 `tipcambio no registrado`**, igual que antes.

### La pantalla antes de grabar

Para que lo que ve el vendedor coincida **al centimo** con lo que se graba, la conversion en
pantalla deberia seguir la misma regla:

```
precio unitario S/  = redondear(precio US$ × tipoCambio, 3)
precio con dscto S/ = redondear(precio unitario S/ × (1 − dsct/100), 2)
total linea S/      = redondear(precio con dscto S/ × cantidad, 2)
total sin IGV       = suma de los totales de linea
IGV                 = redondear(total sin IGV × 0.18, 2)
total con IGV       = total sin IGV + IGV
```

> **Ojo:** convertir el total en dolares ya redondeado (`preciosinIGV × tipoCambio`) puede diferir
> en uno o dos centimos. El ERP convierte **el precio unitario** y recalcula desde ahi.

Ejemplo, la 098-00000069 (100 unidades a US$ 41.52, 3 % de descuento, tc 3.45):

| | S/ |
|---|---|
| precio unitario | **143.244** |
| precio con descuento | 138.94668 → **138.95** |
| total sin IGV | **13 895.00** |
| IGV | **2 501.10** |
| total con IGV | **16 396.10** |

*(Antes decia S/ 13 894.67 / 2 501.04 / 16 395.71: estaba calculado con la regla equivocada.)*

### `POST /v1/cotizacion/read` — ver

Sin cambios en el backend. Devuelve las lineas **tal como estan grabadas, en la moneda del
documento** (`mone`), con su `tcam`. **Si `mone` es `S`, los importes ya estan en soles: no hay que
volver a multiplicarlos.**

### `POST /v1/cotizacion/update` — modificar

Esta ruta graba cada linea con lo que manda el cuerpo, incluidos `mone`, `tcam`, `preu` y `cost`.

| | quien | que |
|---|---|---|
| lineas que ya estaban | **frontend** | devolverlas como las dio `/read`, ya en la moneda del documento |
| lineas nuevas en una cotizacion en soles | **frontend** | `preu` y `cost` convertidos con el **`tcam` del documento**, con la regla de la seccion 2 |
| importes de linea en soles (nuevas o con la cantidad cambiada) | **frontend** | con la regla **corregida** de la seccion 2: precio con descuento a 2 decimales, por la cantidad |
| `mone` y `tcam` de cada linea | **backend** | los toma **de la cabecera** e ignora los del cuerpo. Asi una linea no puede quedar en otra moneda ni con otro tipo de cambio |
| cambiar la moneda de una cotizacion ya creada | — | **no se permite**. `/update` no cambia la moneda de la cabecera; para pasar a la otra moneda hay que crear otra cotizacion |

### Promociones

No cambia: **las promociones solo se aplican a cotizaciones en dolares**. `/cotizacion/readprom` ya
responde `coti en soles` (ver [promocion-modulo.md](promocion-modulo.md), seccion 6).

El backend agrega el mismo bloqueo en **`/promocion/acoplar`**, que antes no lo validaba. Sus
descuentos se calculan en dolares, asi que llamado sobre una cotizacion en soles la dejaria con
lineas en dos monedas. Ahora responde:

```json
{ "status":"promocion en soles", "codigo":3,
  "msg":"las promociones solo se aplican a cotizaciones en dolares; esta va en soles" }
```

con **HTTP 409**, no 200 como `/readprom`: aqui se pidio escribir y no se escribio nada.

---

## 5 · Lo que ya esta grabado

- **098-00000069**: el vendedor la anulara desde la intranet. El backend no la toca.
- **098-00000061** (19/10/2026): el precio quedo en soles pero el costo en dolares. Ya paso a
  pedido (`flag=1`), asi que tampoco se toca.
- Son las **unicas dos** cotizaciones de la intranet (serie 098) en soles. Las demas van en dolares.

---

## 6 · Preguntas para el frontend

1. **¿Que tipo de cambio usa hoy la pantalla para convertir a soles?** ¿Es `tipoCambio` del menu, un
   valor fijo u otro? ¿Que montos mostro para la 098-00000069? Deberian ser los de la tabla de la
   seccion 4.
2. **¿Confirman que siguen mandando a `/pegar` los precios en dolares**, este como este el selector?
3. **En `/update`, para una cotizacion en soles:** ¿que mandan hoy en `preu` y `cost` de una linea
   nueva? ¿Y en `mone` y `tcam`?
4. **¿El selector de moneda esta disponible al editar?** Si lo esta, habria que ocultarlo, porque la
   moneda no cambia despues de crear.
5. Con `tipoCambio` en `null`, ¿les parece bien deshabilitar soles?

---

## 7 · Resumen de cambios

**Backend**, hecho y probado en bdnava08 el 23/10/2026. Pendiente de salir junto con la pantalla:

- [x] `/pegar`: convierte a soles cuando `moneda` es `S` (precio, costo y totales) con `tcvta` y la
      regla del ERP. En dolares no cambia nada.
- [x] `/pegar`: la respuesta trae `moneda` y `tcam`, y `totales` en la moneda del documento.
- [x] `/pegar`: rechaza una `moneda` que no sea `D` ni `S` (`moneda desconocida`, 400).
- [x] `/update`: `mone` y `tcam` de cada linea salen de la cabecera.
- [x] `/promocion/acoplar`: rechaza las cotizaciones en soles (`promocion en soles`, 409).

Prueba en bdnava08: con el carrito de la 098-00000069 mas `0505-012605`, en soles y en dolares,
quedaron grabadas la 098-00000052 (soles) y la 098-00000053 (dolares). Se comprobo:

- cada linea en soles, con `preu`, `cost`, `tota` y `totn` segun la regla;
- la cabecera igual a la suma de las lineas y a la respuesta;
- que `/acoplar` rechaza la cotizacion en soles;
- que `/update` corrige un `mone` y un `tcam` equivocados del cuerpo;
- que en dolares queda todo igual que antes;
- que una moneda invalida se rechaza.

Las dos cotizaciones se pueden usar para probar «Ver» y «Modificar».

**Frontend:**

- [x] Convertir en pantalla con `tipoCambio`. **Falta cambiar la regla de la linea por la corregida
      de la seccion 2.**
- [x] Mostrar los `totales` que devuelve `/pegar`.
- [x] No volver a convertir lo que devuelve `/read` cuando `mone` es `S`.
- [x] En `/update`, convertir las lineas nuevas con el `tcam` del documento. **Tambien con la regla
      corregida.**
- [x] Deshabilitar soles si `tipoCambio` es `null`. El selector no existe al editar.

---

## 8 · Respuestas a [respuesta-cotizacion-moneda.md](respuesta-cotizacion-moneda.md)

**Gracias por la simulacion**: fue la que nos hizo revisar la regla contra los datos. Coincidimos
en todo, incluido el orden de salida de su seccion 5: `/update` sale **el mismo dia** que la
pantalla nueva, no antes.

### 1 · El redondeo: si, mitad hacia arriba sobre el decimal exacto

Las columnas son `decimal` (`preu` y `cost` con 4 decimales, `tota` y `totn` con 2), y el ERP
redondea **mitad hacia arriba**. En las lineas cuyo precio con descuento cae justo en un 5 en el
tercer decimal, el ERP redondea hacia arriba en todas las que siguen su regla. Las pocas que van hacia
abajo son lineas con precio final con IGV tecleado. `preu` nunca tiene mas de 3 decimales, en ninguna
moneda.

El backend tambien calcula con **enteros exactos** (`funciones/comunes/importes.js`), no con coma
flotante. Reproduce linea por linea las 175 973 + 8 012 lineas del ERP que siguen la regla. Su
`3.05 × 3.45 = 10.523` da lo mismo aqui.

### 2 · La linea: no, y es nuestro error

La regla buena es **precio con descuento a 2 decimales, por la cantidad**:

```
precio con dscto = round2(preu × (1 − dsct/100))
tota             = round2(precio con dscto × cant)
totn             = round2(tota × 1.18)
cabecera         toti = round2(Σ tota × 0.18) · totn = Σ tota + toti
```

Con `dsct` **tal como lo mandan** en `descuento`. Su ejemplo, 7 unidades a US$ 89.90 con 4 % y tc
3.45:

| | S/ |
|---|---|
| precio unitario | 89.90 × 3.45 = **310.155** |
| precio con descuento | 310.155 × 0.96 = 297.7488 → **297.75** |
| total de la linea | 297.75 × 7 = **2 084.25** |

**El ERP graba 2 084.25, no 2 084.24.** El 2 084.24 sale de la regla que les dimos mal. En este caso
la pantalla de antes acertaba por casualidad. La seccion 2 trae los conteos.

**Que tienen que cambiar:** el calculo de la pantalla en soles y los importes de linea en soles que
mandan a `/update`. El cuerpo de `/pegar` no cambia: el backend ya calcula en soles desde
`precioUnitario`, `cantidad` y `descuento`.

### 3 · El impreso en soles: «Precio DSCTO» a 2 decimales

Con la regla corregida se resuelve solo. El «precio con descuento» del ERP **es** el valor a 2
decimales con el que se calcula la linea: `round2(preu × (1 − dsct/100))`. Enseñandolo asi, con o
sin el 0 de relleno (`26.95` o `26.950`), **cantidad × Precio DSCTO da exactamente el total de la
linea**: 18 × 26.95 = 485.10.

No vimos el impreso del propio ERP. Lo que confirmamos es que en sus datos esa cuenta cuadra al
centimo.

### Una que no estaba en la lista: las cotizaciones en dolares

La misma regla del ERP vale para dolares (99.9 % de las lineas). Pero en dolares `/pegar` sigue
grabando el `preciosinIGV` que manda la pantalla, que hoy se calcula con la regla vieja. En las 207
lineas en dolares de la serie 098, **41 difieren de lo que habria grabado el ERP, hasta en 8
centimos**. Un ejemplo es la propia 098-00000069: US$ 4 027.44 contra los 4 027.00 del ERP.

No lo tocamos porque acordamos que en dolares no cambiaba nada. **Proponemos** cerrar lo de soles
primero y despues aplicar la misma regla en dolares, en los dos lados a la vez. ¿Les parece?
