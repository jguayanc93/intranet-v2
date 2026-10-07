# Ruta `/v1/promocion` — contrato y lógica

Referencia para integrar el frontend y para orientarse en el código.
Los ejemplos salieron de ejecutar el motor, no están escritos a mano.

---

## Flujo

```
carrito → POST /recolector → [idprom, …] → POST /detalle (una por idprom) → beneficio
```

`/detalle` **no descubre** promociones: evalúa una, la que se le indique.
Todas las rutas POST exigen la cookie de sesión `cdk`; sin ella responden **401**.

| endpoint | qué hace | escribe |
|---|---|---|
| `POST /recolector` | qué promociones podrían aplicar al carrito | no |
| `POST /detalle` | simula **una** promoción contra el carrito | no |
| `POST /revisar` | como `/recolector` pero sobre una cotización guardada | no |
| `POST /mostrar` | evalúa una promoción sobre la cotización guardada | no |
| `POST /acoplar` | aplica la promoción a la cotización | **sí** |
| `POST /eliminar` | quita promociones de la cotización | **sí** |

---

## POST /v1/promocion/recolector

Solo lee `codigo` de cada producto.

```json
{ "productos": { "0": { "codigo": "0115-010338" } } }
```

```json
{ "status": "ok", "codigo": 0, "data": ["15112", "14656"] }
```

`productos` acepta objeto con claves `"0"`, `"1"`… o arreglo.
Si ningún producto tiene promoción: **400** con `"ninguna promocion"`.

---

## POST /v1/promocion/detalle

```json
{
  "codigo": "15112",
  "productos": {
    "0": {
      "codigo": "0115-010338",
      "descripcion": "MONITOR TCL 24G54 MINILED 24 FHD 100HZ",
      "cantidad": 10,
      "precioUnitario": 88.86,
      "descuento": 0,
      "preciosinIGV": 861.94
    }
  }
}
```

> `codigo` en la raíz **no es un código de producto: es el `idprom`**.

De cada producto solo se usan cuatro campos:

| campo | para qué |
|---|---|
| `codigo` | cruce contra los productos programados de la promoción |
| `cantidad` | umbral cuando la métrica es **unidades** |
| `preciosinIGV` | umbral cuando la métrica es **valorizado**; es el total de la línea, **ya con el descuento del vendedor aplicado** |
| `descripcion` | solo para mostrar, vuelve en `itemdescr` |

`descuentoMaximo`, `stock1`, `stock2`, `stock3` y `stockTotal` se pueden enviar pero hoy no se leen.

---

## Los cuatro ejes

Columnas de `mst_promocion`. Mapeadas en `funciones/comunes/constantes.js`.

| eje | columna | valores | qué decide |
|---|---|---|---|
| Ámbito | `porvta` | 1 = ítem · 3 = total venta | si cada producto se mide por separado o el conjunto |
| Métrica | `metrica` | **1 = valorizado · 2 = unidades** | contra qué se compara el umbral |
| Tipo | `tipdsct` | 1 = descuento · 3 = regalo | qué significa `montoDescuento` |
| Otorga | `tipdsctoto` | 1 = porcentual · 3 = monto fijo | solo aplica cuando es descuento |

> **`metrica` vale 1 o 2, no 1 o 3.** Varios comentarios del código original decían 3 y estaban equivocados.

Siempre: `veces = floor(acumulado / umbral)`. El sobrante no genera nada hasta completar otro umbral.

---

## Las dos formas de `data`

**Ámbito ítem** — una entrada por producto que califica:

```json
{ "0": { "...": "producto A" },
  "1": { "...": "producto B" },
  "tipo": ["descuento"],
  "descripcion": "TCL PROMO REBATE MNT SEPT2026" }
```

**Ámbito total venta** — una sola entrada para el conjunto:

```json
{ "0": { "...": "...", "participantes": ["A1","A2"], "acumulado": 2600 },
  "tipo": ["descuento"],
  "descripcion": "TCL PROMO REBATE MNT SEPT2026" }
```

> **Al iterar hay que filtrar `tipo` y `descripcion`.** Están mezcladas con los índices
> numéricos dentro del mismo objeto; un `Object.entries(data)` sin filtrar las trata
> como si fueran productos.

### Campos de cada entrada

| campo | significado |
|---|---|
| `codigo` | el **idprom**, no un código de producto |
| `descripcion` | nombre de la promoción |
| `cantidad` | cuántas veces se alcanzó el umbral |
| `montoDescuento` | **dos significados según `tipo`** — ver aviso |
| `monedaDescuento` | siempre `"D"`, está fijo en el código |
| `itemdescr` | ítem: nombre del producto · total venta: `"N producto(s) del conjunto"` |
| `tipo` | `["descuento"]` o `["regalo"]` |
| `participantes` | solo total venta: códigos que activaron la promoción |
| `acumulado` | solo total venta: suma del conjunto (unidades o dinero según métrica) |

> **`montoDescuento` cambia de unidad según `tipo`.**
> Con `descuento` son **dólares sin IGV**. Con `regalo` son **unidades de obsequio**.
> `monedaDescuento` dice `"D"` en ambos casos, así que un regalo de 3 unidades se lee
> como "3 dólares" si no se mira `tipo`.

---

## Las ocho combinaciones

| # | ámbito | tipo | métrica | fórmula | activas |
|---|---|---|---|---|---|
| 1 | ítem | descuento | valorizado | `veces × dsct ÷ 1.18` | 0 |
| 2 | ítem | descuento | unidades | `veces × dsct ÷ 1.18` | 25 |
| 3 | ítem | regalo | valorizado | `veces × dsct` | 0 |
| 4 | ítem | regalo | unidades | `veces × dsct` | 8 |
| 5 | total venta | descuento | valorizado | `veces × dsct ÷ 1.18` | 0 |
| 6 | total venta | descuento | unidades | `(veces × umbral) × dsct ÷ 1.18` | 2 |
| 7 | total venta | regalo | valorizado | `veces × dsct` | 2 |
| 8 | total venta | regalo | unidades | `veces × dsct` | 5 |

> **`dsct` significa cosas distintas según el ámbito.** En ítem va *por bloque alcanzado*;
> en total venta con unidades va *por unidad*, por eso la fórmula 6 multiplica también por
> el umbral. No es incoherencia del código: así están cargados los datos, comprobado contra
> las promociones reales (la lectura contraria daba hasta 829 % de la venta).

### 1 · ítem · descuento · valorizado

umbral 500 · dsct 5.90 · valorizado 1700 → `floor(1700/500)=3` → `3 × 5.90 ÷ 1.18` = **15.00**

```json
{ "0": { "codigo":"15112", "descripcion":"TCL PROMO REBATE MNT SEPT2026",
         "cantidad":3, "montoDescuento":15, "monedaDescuento":"D",
         "itemdescr":"MONITOR TCL 24G54", "tipo":["descuento"] },
  "tipo":["descuento"], "descripcion":"TCL PROMO REBATE MNT SEPT2026" }
```

Con `otorga = 1` (porcentual): 5.9 % sobre los 1500 que alcanzaron el umbral → **88.50**.
El porcentaje **no** se divide entre 1.18.

### 2 · ítem · descuento · unidades — la más usada

umbral 1 · dsct 28.13 · 10 unidades → `10 × 28.13 ÷ 1.18` = **238.39**

```json
{ "0": { "codigo":"15112", "descripcion":"TCL PROMO REBATE MNT SEPT2026",
         "cantidad":10, "montoDescuento":238.39, "monedaDescuento":"D",
         "itemdescr":"MONITOR TCL 24G54", "tipo":["descuento"] },
  "tipo":["descuento"], "descripcion":"TCL PROMO REBATE MNT SEPT2026" }
```

Con dos productos de la promoción en el carrito aparecen dos entradas:

```json
{ "0": { "cantidad":10, "montoDescuento":238.39, "itemdescr":"MONITOR TCL 24G54" },
  "1": { "cantidad":4,  "montoDescuento":67.59,  "itemdescr":"TONER BROTHER TN1060" },
  "tipo":["descuento"], "descripcion":"TCL PROMO REBATE MNT SEPT2026" }
```

### 3 · ítem · regalo · valorizado

umbral 500 · dsct 2 obsequios · valorizado 1700 → 3 veces × 2 = **6 unidades de regalo**

```json
{ "0": { "cantidad":3, "montoDescuento":6, "monedaDescuento":"D",
         "itemdescr":"PSU ANTEC CSK 550W", "tipo":["regalo"] },
  "tipo":["regalo"], "descripcion":"TCL PROMO REBATE MNT SEPT2026" }
```

`montoDescuento: 6` son seis obsequios, no seis dólares.

### 4 · ítem · regalo · unidades

umbral 2 · dsct 1 · 7 unidades → `floor(7/2)=3` → **3 obsequios**

```json
{ "0": { "cantidad":3, "montoDescuento":3, "monedaDescuento":"D",
         "itemdescr":"PSU ANTEC CSK 550W", "tipo":["regalo"] },
  "tipo":["regalo"], "descripcion":"TCL PROMO REBATE MNT SEPT2026" }
```

### 5 · total venta · descuento · valorizado

umbral 1000 · dsct 50 · conjunto 1600+1000=2600 → 2 veces → `2 × 50 ÷ 1.18` = **84.75**

```json
{ "0": { "cantidad":2, "montoDescuento":84.75, "monedaDescuento":"D",
         "itemdescr":"2 producto(s) del conjunto",
         "participantes":["A1","A2"], "acumulado":2600, "tipo":["descuento"] },
  "tipo":["descuento"], "descripcion":"TCL PROMO REBATE MNT SEPT2026" }
```

### 6 · total venta · descuento · unidades

umbral 50 · dsct 0.24 · conjunto 60+40=100 un → 2 veces → `(2 × 50) × 0.24 ÷ 1.18` = **20.34**

```json
{ "0": { "cantidad":2, "montoDescuento":20.34, "monedaDescuento":"D",
         "itemdescr":"2 producto(s) del conjunto",
         "participantes":["A1","A2"], "acumulado":100, "tipo":["descuento"] },
  "tipo":["descuento"], "descripcion":"TCL PROMO REBATE MNT SEPT2026" }
```

Única combinación donde `dsct` se multiplica también por el umbral.

### 7 · total venta · regalo · valorizado

umbral 413 · dsct 1 · conjunto 700+500=1200 → `floor(1200/413)=2` → **2 obsequios**

```json
{ "0": { "cantidad":2, "montoDescuento":2, "monedaDescuento":"D",
         "itemdescr":"2 producto(s) del conjunto",
         "participantes":["A1","A2"], "acumulado":1200, "tipo":["regalo"] },
  "tipo":["regalo"], "descripcion":"TCL PROMO REBATE MNT SEPT2026" }
```

### 8 · total venta · regalo · unidades

umbral 20 · dsct 1 · conjunto 30+15=45 un → `floor(45/20)=2` → **2 obsequios**

```json
{ "0": { "cantidad":2, "montoDescuento":2, "monedaDescuento":"D",
         "itemdescr":"2 producto(s) del conjunto",
         "participantes":["A1","A2"], "acumulado":45, "tipo":["regalo"] },
  "tipo":["regalo"], "descripcion":"TCL PROMO REBATE MNT SEPT2026" }
```

---

## Cuando no aplica

No es error: **200** con `data: null` y el motivo. El segundo motivo trae **cuánto falta**.

```json
{ "status":"no aplica", "codigo":0, "data":null,
  "motivo":"no_participa",
  "msg":"ninguno de los productos del carrito participa en esta promocion" }
```

```json
{ "status":"no aplica", "codigo":0, "data":null,
  "motivo":"no_alcanza", "faltante":7, "unidad":"unidades",
  "msg":"faltan 7 unidades para alcanzar la promocion" }
```

```json
{ "status":"no aplica", "codigo":0, "data":null,
  "motivo":"no_alcanza", "faltante":4220, "unidad":"monto",
  "msg":"falta 4220 de valorizado para alcanzar la promocion" }
```

En ámbito total venta el mensaje dice "en el conjunto".
`unidad` vale `"unidades"` o `"monto"`; `faltante` puede ser `null` si el umbral es 0.

---

## Errores

| HTTP | `status` | cuándo |
|---|---|---|
| 401 | `falsa galleta` | sin cookie `cdk` o inválida |
| 403 | `sin permiso` | el grupo no tiene el permiso (`/acoplar`, `/eliminar`) |
| 400 | `promocion no registrada` | el `idprom` no existe o está deshabilitado |
| 400 | `ninguna promocion` | solo `/recolector`: ningún producto tiene promoción |
| 400 | `documento ambiguo` | el `ndocu` llegó sin serie (ver abajo) |
| 409 | `coti no modificable` | la cotización no existe, no es del vendedor, o no está abierta |
| 422 | `promocion no soportada` | combinación no implementada. Hoy no debería ocurrir |
| 500 | `error query` | fallo de SQL |

`codigo`: `0` correcto · `1` error interno · `2` dato inválido · `3` permiso o estado.

---

## Tres cosas que conviene saber

**Los montos salen sin IGV.** En `dtl_promocion_progra` los descuentos de monto fijo están
cargados **con** IGV (1.18 → 1, 5.90 → 5, 7.08 → 6) y el backend ya los divide.
El frontend no debe volver a dividir.

**`preciosinIGV` ya trae el descuento del vendedor.** Para 89.90 × 2 con 4 % de descuento
el valor es 172.61. El umbral de una promoción valorizada se compara contra ese monto
rebajado, no contra el precio de lista.

**El `ndocu` necesita su serie.** Conviven `009-` (serie principal) y `098-` (la que crea
`/pegar`). Un número suelto como `970435` es ambiguo y `/acoplar` y `/eliminar` lo rechazan
con `documento ambiguo`. Los endpoints de lectura todavía aceptan el número suelto por
compatibilidad, anteponiéndole `009-00`.

---

## Dónde vive cada cosa en el código

| archivo | responsabilidad |
|---|---|
| `promociones/promocion.js` | router: rutas, `exigirSesion`, `exigirPermiso` |
| `funciones/promocion/motor.js` | clasifica la promoción y despacha al evaluador |
| `funciones/promocion/beneficio.js` | **la fórmula del beneficio, en un solo lugar** |
| `funciones/promocion/normalizar.js` | lleva carrito y detalle de BD a una misma forma |
| `funciones/promocion/porItem.js` | evaluador ámbito ítem, origen carrito (`/detalle`) |
| `funciones/promocion/porTotalVenta.js` | evaluador ámbito total venta, origen carrito |
| `funciones/promocion/xitems.js` | evaluador ámbito ítem, origen BD (`/mostrar`, `/acoplar`) |
| `funciones/promocion/xtotalisados.js` | evaluador ámbito total venta, origen BD |
| `funciones/promocion/descuento.js` | arma las líneas de descuento |
| `funciones/promocion/bonificacion.js` | arma las líneas de regalo, topa por stock |
| `funciones/promocion/destino.js` | responder (vista previa) o recolectar (aplicar) |
| `funciones/comunes/constantes.js` | ejes, IGV, SKU de descuento, `resolverNdocu` |
| `querys/promocion/acoplar_transaccion.js` | inserción y recálculo de cabecera, transaccional |
| `querys/promocion/remover_transaccion.js` | borrado y recálculo, transaccional |

### Detalles de implementación que conviene no romper

- **La cabecera la gobierna un trigger del ERP.** `trg_mst01cot_Promo` sobre `mst01cot`
  recalcula `toti = SUM(tota)*0.18` y `totn = SUM(tota)*1.18` cuando la cotización tiene
  alguna línea `0303-010001`. El backend usa **la misma fórmula** para no pelear con él.
- **`flag` se compara como texto.** Las cotizaciones eliminadas tienen `flag='*'`;
  compararlo contra un número fuerza una conversión que revienta en SQL Server.
  Editable = `flag='0' AND estado='0'`.
- **El `rowCount` de tedious no es el número de filas afectadas**, cuenta result sets.
  Para verificar un UPDATE hay que pedir `@@ROWCOUNT` explícitamente.
- **Los regalos se topan contra el stock** del almacén principal (`prd0101.stoc`).
  Si corresponden 10 y hay 3, entrega 3; con stock 0 no genera línea y responde
  `obsequio sin stock`.
