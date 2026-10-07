# Listas — contrato de las ocho rutas

**Renumerado y en la base de pruebas.** Esta es la forma definitiva de las tres listas.

Responde a `listas.md` y a `listas-renumerar.md`.

---

## La forma, tal como la pidieron

| pos | dato | cotización | factura | pedido |
|---|---|---|---|---|
| 0 | fecha | ✓ | ✓ | ✓ |
| 1 | número con serie | ✓ | ✓ | ✓ |
| 2 | razón social | ✓ | ✓ | ✓ |
| 3 | monto total con IGV | ✓ | ✓ | ✓ |
| 4 | **moneda** | ✓ | ✓ | ✓ |
| 5 | **registrado, con hora** | ✓ | ✓ | ✓ |
| 6 | estado | ✓ | `null` | ✓ |
| 7 | editable | ✓ | `null` | `null` |
| 8 | tipo de entrega | — | ✓ | — |
| 9 | tipo de documento | — | ✓ | — |

Sus dos peticiones, cumplidas:

- **`null` donde no aplica, sin correr posiciones.** En facturas, la 6 y la 7 llegan `null`
  y el tipo de entrega sigue en la 8. Donde pusieron `—` la posición no viene: son
  trailing, así que leerlas da `undefined` sin romper nada.
- **Las ocho rutas coinciden.** Verificado comparando las listas de columnas: las cuatro
  generales y las cuatro `xdia` del mismo módulo generan exactamente el mismo `SELECT`.

### Comprobado contra la base

```
COTIZACIONES  V0337 2026-09-01   (12 filas)
   0 fecha        = 2026/09/01        5 registrado  = 2026-09-01 18:24:12
   1 numero       = 009-00964903      6 estado      = pedido
   2 razon social = SAENZ PEREZ ...   7 editable    = 0
   3 monto        = 2590.01           8 entrega     = (no aplica)
   4 MONEDA       = S                 9 tipo doc    = (no aplica)

FACTURAS      V0334 2026-09-23   (39 filas)
   3 monto        = 1846.07           6 estado      = null
   4 MONEDA       = D                 7 editable    = null
   5 registrado   = 2026-09-23 ...    8 entrega     = ventanilla
                                      9 tipo doc    = N.DESPACHO

PEDIDOS       V0229 2026-09-17   (19 filas)
   4 MONEDA       = D                 6 estado      = atendido
   5 registrado   = 2026-09-17 ...    7 editable    = null
```

La primera cotización del ejemplo es **en soles** (`S`) por 2 590.01. Es justo el caso que
las tres pantallas venían pintando con `$`.

---

## El despliegue

Entendida la condición y es la correcta: entre que sale el backend renumerado y el frontend
nuevo, las pantallas de hoy no fallan, **mienten**. Nada de ventana.

Está en **pruebas**, no en producción. Cuando tengan sus dos constantes cambiadas y las
suites en verde, salimos el mismo día.

---

## Qué significa cada posición

**4 · moneda** — `D` o `S`. Pegada al monto, como pidieron.

**5 · registrado** — `AAAA-MM-DD HH:MM:SS`. Sale de otra columna, no de la 0: **la fecha de
la posición 0 siempre viene a las 00:00:00** y por sí sola no ordena las del mismo día. Las
tres listas ya vienen ordenadas por esta, la última primero.

**6 · estado** — viene traducido, no hay que mapear códigos:

| módulo | valores |
|---|---|
| cotización | `cotizado`, `facturado`, `boleta`, `pedido` |
| pedido | `aprobado`, `atendido` |
| factura | `null` — no tiene estado propio |

**7 · editable** — `1` si la cotización sigue abierta y sin aprobar, `0` si no. Vale `1`
exactamente cuando `/update`, `/almacen` y `/eliminar` la van a aceptar.

Sirve para un caso que no se puede deducir de la 6: **una cotización aprobada se rotula
`cotizado`** pero ya no se toca. Ejemplo real: `009-00969917` llega con estado `cotizado` y
editable `0`.

**8 · tipo de entrega** — `ventanilla`, `Lima`, `Provincia`.

**9 · tipo de documento** — `FACTURA`, `GUIA`, `N.DESPACHO`. Es lo que la pantalla de
facturas rotulaba «Referencia»: nunca fue la moneda ni una referencia.

---

## Lo que reciben las rutas

Las generales (`/lista/cotis`, `/lista/facturas`, `/lista/pedidos`) **no esperan cuerpo**:
filtran por el `codven` de la galleta.

Las `xdia` aceptan dos formas:

```json
{ "dia": "2026-10-01" }
{ "desde": "2026-09-30", "hasta": "2026-10-01" }
```

El rango queda apuntado como disponible, tal como lo dejaron: está hecho y probado, aunque
la pantalla todavía ofrezca un día suelto.

Una fecha mal formada responde **400** `fecha invalida`. Un día sin movimientos devuelve
**lista vacía**, no error. Las anuladas no salen.

---

## Lo que se corrigió por el camino

**`/lista/pedidosxdia` devolvía datos de otro año.** Tenía `YEAR(fecha)=2025` escrito a
mano y el mes fijo en el actual, así que pedir un día devolvía ese número de día del mes en
curso pero de 2025. No fallaba: respondía ocho pedidos reales de hace un año como si fueran
los del día pedido.

**Las cuatro rutas de facturas y pedidos** recibieron además lo mismo que ya tenían las de
cotización: rango de fechas, cruce de mes, lista vacía en vez de error 400, orden por hora y
filtro de fecha que usa el índice en vez de recorrer la tabla entera.

---

## Los formatos de número

De acuerdo en no tocarlos. Siguen siendo tres distintos y la posición 1 los entrega tal cual:

| módulo | ejemplo |
|---|---|
| cotización | `009-00969930` |
| pedido | `099-00132184`, `009-00772637` |
| factura | `F009-0649171` |
