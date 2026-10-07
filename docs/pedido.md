# Pedido — flete y cambio de almacén

Responde a `pedido.md`. Sus deducciones del `/mostrar` eran correctas esta vez; las del
flete no, porque **esa ruta nunca ha funcionado**.

Las dos rutas están corregidas y probadas, y hay una tercera nueva: cambio de almacén.

---

## 1 · `/pedido/mostrar` — las catorce posiciones son las que dedujeron

Acertaron en las catorce. Y **sí filtra por el `codven` de la galleta**: la consulta lleva
`AND b.codven_usu=@vendedor`, así que el pedido de otro vendedor no se entrega. No es el
caso de cotización.

Un pedido que no existe, o que no es suyo, responde hoy **400** `cotizacion no registrada`
— el mensaje es de cotización y no corresponde. Si quieren, se alinea con el resto.

### Qué son `flag`, `apro` y `dias`

| campo | qué es |
|---|---|
| `flag` | estado del pedido: `0` aprobado · `1` atendido · `*` anulado |
| `apro` | **no es un booleano** |
| `dias` | días transcurridos desde la fecha de la línea hasta hoy, calculado al vuelo |

`dias` no lo usa nadie, confirmado. Pueden dejar de leerlo.

**`apro` es lo que conviene mirar con cuidado.** En 90 días toma cinco valores distintos:

| flag | apro | pedidos |
|---|---|---|
| 1 | 1 | 6 232 |
| 0 | 2 | 1 901 |
| `*` | 0 | 523 |
| 0 | 1 | 361 |
| 0 | 4 | 205 |
| 0 | 0 | 42 |
| 0 | 3 | 19 |

El gate del navegador exige `flag===0 && apro===1`, o sea **361 pedidos de 9 284**. No
sabemos qué significan los valores 2, 3 y 4; habría que preguntarlo a sistemas antes de
apoyarse en ellos.

De todas formas ese gate desaparece: ahora decide el backend.

**La posición 13 es la moneda**, `D` o `S`, igual que en las listas.

---

## 2 · `/pedido/flete` — nunca aplicó un flete

El procedimiento del ERP declara su parámetro como `@doc`. El código mandaba `@numero`.
SQL Server rechazaba **cada** llamada:

```
Procedure or function 'jc_activar_flete_externo' expects parameter '@doc',
which was not supplied.
```

La ruta devolvía **500 siempre**. Corregido en el backend; el procedimiento no se tocó.

### El contrato nuevo

```
POST /v1/pedido/flete
{ "npedi": "099-00773326" }
```

**Ya no se mandan `flag` ni `apro`.** Tenían razón: venían del propio navegador, el
servidor los tiene en la base, y cualquiera podía cambiarlos desde la consola. El
procedimiento nunca los usó.

Correcto:

```json
{ "status": "ok", "codigo": 0,
  "documento": "009-00773326",
  "totales": { "tota": 1940.06, "toti": 349.21, "totn": 2289.28 } }
```

### Lo que puede responder

| situación | `status` | HTTP |
|---|---|---|
| aplicado | `ok` | 200 |
| **no alcanza el monto** | `flete monto insuficiente` | 409 |
| ya lo tenía | `flete ya aplicado` | 409 |
| no le corresponde por departamento | `flete no corresponde` | 409 |
| no es suyo, atendido o anulado | `pedido no modificable` | 409 |
| falta el número | `pedido desconocido` | 400 |
| su grupo no puede | `sin permiso` | 403 |

### El monto insuficiente llega con las cifras

Lo pidieron así y es la respuesta más útil de las siete:

```json
{ "status": "flete monto insuficiente", "codigo": 3,
  "msg": "el pedido no alcanza el monto minimo para el flete de provincia",
  "moneda": "D", "total": 391.98, "minimo": 400, "falta": 8.02 }
```

La pantalla puede decir «faltan 8,02 para el flete» en vez de solo que no se puede. Probado
con tres pedidos de provincia reales: faltan 8,02 · 15,79 · 19,60.

> **El mínimo se mide sobre el total SIN IGV**, no sobre el que enseña la pantalla.
> Comprobado: el factor entre uno y otro es 1,18 exacto.

---

## 3 · Cuánto es el flete y quién lo decide

Lo decide un *trigger* del ERP sobre `mst01ped`, y ahí se queda. El procedimiento solo lo
habilita, dispara la actualización y lo vuelve a deshabilitar.

| | |
|---|---|
| cuánto | **0,4% del total sin IGV**, como descuento |
| cómo aparece | una línea más, SKU `0303-010001`, descripción `DSCTO/PROM: FLETE PROVINCIA <departamento> 2026 (CK)` |
| a quién | siete departamentos: Arequipa, La Libertad, Cusco, Puno, Junín, San Martín y Tacna. Más una lista de 17 clientes puestos a mano |
| mínimo | 400 dólares, o 400 × tipo de cambio si el pedido va en soles |
| ¿idempotente? | **sí**: cuenta si la línea ya existe y no hace nada |

**Sí cambia el total.** El trigger recalcula `tota`, `toti` y `totn` de la cabecera, por eso
la respuesta los devuelve. No hace falta volver a pedir el pedido: pinten lo que llega.

Ejemplo real, pedido de Arequipa por 1 947,85:

```
ANTES    tota=1947.85  toti=350.61  totn=2298.46   9 lineas
DESPUES  tota=1940.06  toti=349.21  totn=2289.28  10 lineas
linea:   DSCTO/PROM: FLETE PROVINCIA AREQUIPA 2026 (CK)   tota=-7.79
```

0,4% de 1 947,85 son 7,79.

### Lo que no se puede anticipar del todo

Preguntaban si la ruta podría decir **de antemano** si un pedido admite flete, como hace
`editable` en cotizaciones. A medias:

- **El monto sí**: ya se comprueba antes y devuelve cuánto falta.
- **El departamento no.** La elegibilidad mezcla siete departamentos con una lista de 17
  códigos de cliente escritos dentro del trigger. Copiarla al backend sería garantizar que
  un día digan cosas distintas, y el frontend se enteraría por un vendedor enfadado.

Así que para ese caso el flujo sigue siendo: pulsar y leer el motivo. Si alguna vez esas
reglas salen del trigger a una tabla, se puede anticipar entero.

---

## 4 · `/pedido/almacen` — nueva

```
POST /v1/pedido/almacen
{ "npedi": "099-00132184", "alm": "15" }
```

```json
{ "status": "ok", "codigo": 0,
  "documento": "099-00132184", "almacen": "15", "lineas": 19 }
```

| situación | `status` | HTTP |
|---|---|---|
| no es suyo, atendido o anulado | `pedido no modificable` | 409 |
| almacén que no existe o inactivo | `almacen invalido` | 400 |
| el pedido no tiene líneas | `pedido sin detalle` | 409 |
| falta el número | `pedido desconocido` | 400 |

Los códigos válidos son los mismos de cotización: `01` principal, `08` M&M, `15` Piura,
`16` Chorrillos, entre otros. Se validan contra el catálogo, así que un código inventado
responde 400 en vez de dejar el pedido apuntando a la nada.

> **Diferencia con cotización:** el pedido guarda el almacén en la cabecera **y** en cada
> línea, y en los 9 284 pedidos de los últimos 90 días los dos coinciden siempre. La ruta
> actualiza ambos dentro de una transacción; tocar solo uno los dejaría descuadrados.

Solo se permite sobre pedidos con `flag='0'`. Uno ya atendido no cambia de almacén.

---

## 5 · Lo del `$` escrito a mano

Confirmado, y la moneda ya les llega en la posición 13. Igual que en las listas, se arregla
al migrar la pantalla; no hace falta nada del backend.

## 6 · Los tres totales

Tenían razón en sospechar. **Los totales los gobierna el ERP**, igual que en cotización: el
trigger recalcula la cabecera desde el detalle. Sumar líneas en el navegador va a discrepar
en cuanto haya un redondeo de por medio.

`/pedido/flete` ya devuelve los tres después de aplicar. Para el total de entrada,
`/pedido/mostrar` todavía no manda la cabecera — si la pantalla la quiere, se agrega.

---

## Lo que queda por decidir

1. **Qué significan `apro` 2, 3 y 4.** Es lo único que bloquea poder decir con precisión
   qué pedidos están en qué estado.
2. **Si `/pedido/mostrar` debe devolver la cabecera** con sus totales, en vez de que la
   pantalla los sume.
3. **El mensaje de pedido inexistente** en `/mostrar`, que hoy dice «cotizacion no
   registrada».
