# Grupo 20 — Promociones vigentes y ¿A quien vender hoy?: respuestas a sus ocho preguntas

Responde a [respuesta-promovigentes-quienvender.md](respuesta-promovigentes-quienvender.md). Los contratos son
[promovigentes-grupo20.md](promovigentes-grupo20.md) y [quienvender-grupo20.md](quienvender-grupo20.md); ya traen
todo lo de este documento.

> **Estado al 29/10/2026.** Las ocho preguntas estan contestadas. **Hay cuatro cambios respecto a lo que ustedes
> leyeron** (seccion 1): los almacenes en el detalle de una promocion, las fechas en el motor de cotizacion, unas
> precisiones de rotulos en «hoy» y un ajuste de periodo en `REACTIVAR`. **Nada esta subido** y el servidor de
> prueba todavia no tiene este codigo. La salida es **el mismo dia** para backend y frontend (seccion 4).

---

## 1 · Que cambio desde que lo leyeron

| | cambio | afecta a su pantalla |
|---|---|---|
| **A** | El **detalle** de una promocion trae `almacenes` en cada producto (pregunta 1) | si: pueden mostrarlo |
| **B** | El **motor de cotizacion respeta las fechas** de las promociones: las vencidas ya no se ofrecen ni se aplican (pregunta 2) | la pantalla de cotizacion: un `400` nuevo posible |
| **C** | **Precisiones** de `valorUsd`, `cantidad` y `fecha` en «hoy»: periodos, sin IGV, hora de Lima (preguntas 3, 4 y 5) | solo los rotulos |
| **D** | En `REACTIVAR`, los productos se miden en los **mismos 12 meses** que el `valorUsd`. Antes tomaban hasta 4 semanas mas | no cambia ningun campo |

Su lectura de la seccion 1 de su documento y la tabla de lo que suponen **es correcta en todo**, con cuatro matices:

| | matiz |
|---|---|
| `productos[].compras` (en `REPONER`) | son los **dias distintos** en que compro ese producto en 12 meses, no el numero de facturas. *«16 compras en 12 meses»* esta bien |
| `productos` en `REPONER` | de **1 a 5**, los de mas valor. Una tarjeta puede traer uno solo (hoy le pasa a V0278 en su segundo puesto). En `LLAMAR` y `REACTIVAR`, hasta 3 |
| `mesesConCompra` (en `LLAMAR`) | cuenta sobre los **6 meses completos anteriores al mes en curso**: el mes en curso no entra, porque en `LLAMAR` el cliente aun no compro en el. *«Compro en 6 de los ultimos 6 meses»* esta bien |
| Reintentar | **es seguro**, tambien en `quienvender`: el dia de un vendedor se graba una sola vez (clave unica por dia, vendedor y puesto). Pedirlo dos veces el mismo dia devuelve lo mismo |

---

## 2 · Las ocho preguntas

### Promociones vigentes

**1 · Almacenes. Si, y ya esta.** Cada producto del **detalle** trae `almacenes`: los almacenes con stock hoy,
**sin cantidades**, con los rotulos del reporte de stock del grupo 25 y siempre en este orden: `"PRINCIPAL"`,
`"M&M"`, `"PIURA"`, `"CHORRILLOS"`. Es `[]` cuando el producto esta `AGOTADO`.

```json
{ "descripcion":"TINTA HP 1VV22AL BOTTLE (GT53)  BLACK 4000 PAG", "partNumber":"1VV22AL",
  "marca":"HEWLETT PACKARD", "familia":"SUMINISTROS", "disponibilidad":"DISPONIBLE", "almacenes":["PIURA"] }
```

- **Su duda era real:** de 118 productos en promociones vigentes en bdnava08, **2** estan `DISPONIBLE` solo en
  Piura: el `1VV22AL` de la **15221** (la promocion que ustedes usan de prueba) y el `BT50013PK-Q2` de la 15206.
- `DISPONIBLE` sigue significando «hay stock en alguno de los cuatro». **El backend no dice cuales se pueden
  cotizar desde la pantalla**: dice donde hay stock, y la regla de que la cotizacion solo mueva entre principal y
  M&M la conocen ustedes. Si un producto trae solo `PIURA` o `CHORRILLOS`, es el caso que quieren avisar.
- La **lista** de promociones no trae `almacenes`: solo el detalle. `disponibles` de la lista cuenta productos
  con stock en cualquiera de los cuatro, como antes.

**2 · Las promociones vencidas. Arreglado, y sale con esta entrega.** El motor de cotizacion ya usa la misma regla
de vigencia que la lista: **encendida y hoy entre su inicio y su fin, el ultimo dia incluido**. Las 5 vencidas de
bdnava08 (14898, 15124, 15217, 15218, 15227) **ya no se ofrecen ni se aplican**.

| ruta del modulo `promocion` | con una promocion vencida |
|---|---|
| `POST /promocion/recolector` y `POST /promocion/revisar` | ya no la ofrecen. Si era la unica, responden lo de siempre cuando no hay ninguna: `400 ninguna promocion` |
| `POST /promocion/detalle`, `/mostrar` y `/acoplar` | `400 promocion no registrada`, con el mensaje *«la promocion no existe, esta desabilitada o ya vencio»* (antes decia *«no existe o esta desabilitada»*) |
| `POST /promocion/eliminar` | **no cambia**: retirar una promocion ya puesta en una cotizacion se puede siempre, aunque haya vencido |

- **Lo nuevo para ustedes:** una promocion puede vencer **mientras el vendedor arma la cotizacion**, entre la
  revision y el momento de acoplarla. La pantalla de cotizacion recibe ese `400` y debe mostrar el mensaje.
- En la **base principal** hoy las 43 promociones encendidas estan vigentes: ninguna vencida ni sin fecha. El
  cambio no altera nada hoy; evita que una que se olvide apagar se siga aplicando. Las 5 vencidas **solo existen
  en la base de prueba**, y alli pueden verlo.
- Una promocion encendida **sin fecha** de inicio o de fin se trata como no vigente. Hoy no hay ninguna.
- Como sale con esta entrega, **lo pueden probar el mismo dia**, que era lo que pedian.

### ¿A quien vender hoy?

**3 · ¿Que dia es «hoy»? El de Lima.** `fecha` lo cuenta el reloj del **servidor de base de datos**, que esta en
hora de Lima (UTC-5); lo comprobamos en la base de prueba y en la principal, que son el mismo servidor. No se cuenta
en UTC ni con el reloj del equipo del vendedor: a las 11 de la noche en Lima sigue siendo el mismo dia. Las
promociones vigentes usan el mismo reloj. Siguen mostrando la `fecha` que mandan.

**4 · `REACTIVAR`: el periodo de `cantidad`. Los 12 meses, como suponian.** `cantidad` son **unidades**, y su periodo
cambia segun el tipo:

| `tipo` | `productos[].cantidad` es | rotulo que sirve |
|---|---|---|
| `REPONER` | lo que **suele llevar en cada compra** (la mediana) | *«Suele llevar 36 por compra»* |
| `LLAMAR` | el total de los **3 meses completos anteriores al mes en curso** (en octubre: julio, agosto y septiembre) | *«Llevo 214 en los ultimos 3 meses»* |
| `REACTIVAR` | el total de los **ultimos 12 meses**, corridos desde hoy, el mismo periodo del `valorUsd` | *«Llevaba 36 en los ultimos 12 meses»* |

**5 · `REPONER`: que es el `valorUsd`.** La frase exacta: *la **suma**, de los productos que ya le tocan, de lo que
vale **una compra tipica** de cada uno. La compra tipica es la mediana de lo que pago cada vez que lo compro en los
ultimos 12 meses.* Es lo que valdria reponer todo lo que le toca.

- **No sale de la lista de precios** ni del stock: sale de lo que el cliente pago en sus facturas.
- Suma **todos** los productos que le tocan, aunque la tarjeta liste solo los 5 de mas valor. **No es la suma de la
  lista**: no la presenten como si lo fuera.
- Su rotulo provisional, *«Lo que vale lo que ya le toca»*, sirve. Mas claro: *«Lo que valdria reponer»*.

Y lo que no preguntaron pero conviene que rotulen igual:

- **Todos los importes de «hoy» son dolares y sin IGV**: el valor de venta de la factura, antes del impuesto. Los
  facturados en soles ya vienen convertidos.
- `LLAMAR`: `valorUsd` es lo comprado en los **6 meses completos anteriores al mes en curso**, entre 6 (la media mensual).
- `REACTIVAR`: lo que **este vendedor** vendio al cliente en 12 meses. `LIBRE`: lo que **todos los vendedores**
  vendieron en 12 meses.

**6 · Como recorrerlo hoy. No hace falta dejar un dia armado.** La ruta arma el dia **la primera vez que el
vendedor abre la pantalla**, y con el dia real de hoy hay candidatos de sobra: **14 de los 22 vendedores** de cartera
y cobertura registrados en la base de prueba reciben **2 `REPONER` y 1 `LLAMAR`** por la ruta real. Lo comprobamos con el dia de hoy (29/10/2026):

| vendedor | lo que devuelve la ruta | tarda |
|---|---|---|
| **V0313** (cartera) | puesto 1 `REPONER` (5 productos), 2 `REPONER` (5), 3 `LLAMAR` (3) | 1,3 s |
| **V0278** (cobertura) | 1 `REPONER` (5 productos), 2 `REPONER` (**1** producto), 3 `LLAMAR` (3) | 0,7 s |
| **V0353** (cobertura) | 3 `SIN_COMPRAS`, sin productos | 0,4 s |
| **V0360** (cobertura) | 3 `LIBRE`, sin productos | 0,7 s |

- Los tiempos son del **primer** pedido del dia. Los siguientes leen lo grabado y son inmediatos.
- La base de prueba va **atrasada**: sus facturas llegan al 09/10 y las cotizaciones al 23/10. Las fechas de
  `ultimaCompra` seran anteriores a eso. Los nombres de cliente son reales.
- Como el dia queda grabado, para **volver a ver el armado de un vendedor** hay que borrar sus filas del dia en la
  base de prueba. Avisen a este lado y se hace.
- `REACTIVAR` solo sale cuando a un vendedor no le quedan clientes de `REPONER` ni de `LLAMAR` y tiene clientes con
  60 dias o mas sin comprar. Si quieren ver esa tarjeta, este lado la arma con un dia simulado.

### Las dos

**7 · Salida. Backend y frontend salen el mismo dia.** Eso simplifica casi todo; lo que hay que cuidar es el orden
**dentro** de ese dia.

- **a) ¿Cada clave por separado?** Si: `promovigentes` y `quienvender` son dos lineas distintas del menu del
  grupo 20 y se pueden encender una sola. Como salen el mismo dia, **van las dos**.
- **b) ¿Ninguna antes del frontend?** Con salida el mismo dia, **que suba primero el frontend y despues el
  backend**. Si el backend subiera antes, mientras tanto **todos los vendedores** (cartera y cobertura) veran
  *«PROMOVIGENTES»* y *«QUIENVENDER»* como entradas genericas que llevan a una pagina que no existe.
  Si el frontend sube primero, no se ve nada hasta que el backend mande las claves.
- **c) ¿Como se deshace?** Con **un `git revert` del backend** (si sale en un solo merge): ese revert quita las dos claves del menu, las rutas
  nuevas y el cambio de fechas del motor. **El frontend no necesita nada**: sin las claves no hay entradas.
  Si solo se quita una clave del menu, la entrada desaparece pero **la ruta sigue respondiendo al grupo 20** si
  alguien escribe la direccion. Es solo lectura, salvo que abrir `quienvender` graba la fila del dia. El cambio de
  fechas del motor **no depende del menu**: se queda aunque se quite una clave.
- **Antes de subir a produccion**, el backend crea la tabla de «hoy» en la base principal (ya existe en la de
  prueba). Sin ella la pantalla funcionaria, pero sin recordar lo sugerido de los dias anteriores. No hay nada que
  hacer de su lado.
- **Quien avisa a los vendedores:** es un asunto de este lado y no necesita nada del frontend. *(Pendiente de este
  lado.)*

**8 · Servidor de prueba.** Las claves **no van en este documento** y no hace falta que este lado se las pase.
Las cuentas que necesitan son: un vendedor de **cartera** (V0313), uno de **cobertura** (V0278), uno del **grupo 25**
y el **126**, que reciben `403 sin permiso`.

**El servidor de prueba todavia no tiene este codigo.** Se monta cuando el backend de por cerrados los modulos, antes
de que ustedes lo recorran, y se les avisa cuando este. La tabla de «hoy» ya existe en la base que usa.

---

## 3 · Para recorrerlo

Su tabla de la seccion 4, con lo que **comprobamos el 29/10/2026 en bdnava08**. Algunos casos **dependen del dia**:
la **15221 vence el 31/10/2026**; despues de esa fecha su detalle da `404` y la lista deja de traerla. Para un caso
estable usen la **14106**, que vence el 01/01/2027. Los dos `404` de las vencidas siguen valiendo siempre.

| caso | que se ve |
|---|---|
| Un vendedor de cartera y uno de cobertura | el menu trae `promovigentes` y `quienvender` |
| `GET /promocion/vigentes` | 20 promociones; la primera vence el 2026-10-31; ninguna de 14898, 15124, 15217, 15218 y 15227 |
| `GET /promocion/vigentes/15221` | 4 productos, `soloAlgunosClientes: true`, marca `HEWLETT PACKARD`; el `1VV22AL` es `DISPONIBLE` pero solo en `["PIURA"]` |
| `GET /promocion/vigentes/14106` | `REGALO`; 6 productos, 2 `AGOTADO` (con `almacenes: []`) y 4 `DISPONIBLE` (el `0-761345-20118-6` en `["PRINCIPAL","M&M"]`) |
| `GET /promocion/vigentes/14898` y `/abc` | `404 promocion no vigente` |
| `POST /promocion/acoplar` o `/mostrar` con la 14898 | `400 promocion no registrada` (vencida) |
| `GET /quienvender`, V0313 y V0278 | 3 tarjetas: 2 `REPONER` y 1 `LLAMAR` (pregunta 6) |
| El mismo vendedor otra vez el mismo dia | las mismas tarjetas, al instante |
| V0360 y V0353 | 3 `LIBRE` y 3 `SIN_COMPRAS`, sin lista de productos |
| Un vendedor recien llegado, sin clientes | `sugeridos: []` y el `aviso`, sin error |
| El 126 y un usuario del grupo 25 | `403 sin permiso` |
| Sin sesion | `401 falsa galleta` |

La **15257** de produccion no existe en bdnava08 (la base de prueba va atrasada); en produccion saldra si esta vigente.

---

## 4 · Cierre

- [x] las ocho preguntas de su seccion 2 estan contestadas (este documento)
- [x] el backend esta construido y probado contra bdnava08; los contratos estan al dia
- [ ] el servidor de prueba tiene este codigo — **backend, antes de que lo recorran**
- [ ] recorridas las dos pantallas contra el servidor de prueba, con los casos de la seccion 3 — **frontend**
- [x] orden de salida: **el mismo dia, primero el frontend y despues el backend**
- [ ] aviso a los vendedores — **backend**, sin nada del frontend
