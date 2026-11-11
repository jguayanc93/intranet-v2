# Ajuste directo y asignación (grupo 25) — segunda ronda: todo contestado y construido

Responde a [ajuste-directo.md](ajuste-directo.md) **actualizado el 06/11/2026, primera ronda** (su sección 11: nuestras
siete preguntas, contestadas). También recoge el cambio de regla de [ajuste-precios.md](ajuste-precios.md) del mismo
día (**un costo de 0 cuenta como costo desconocido**), que afectaba a «Recibidas», que ya está en producción.

**Las pantallas están construidas** y probadas contra un simulacro de su contrato (`dev/simulador-ajuste-directo.js`).
**No queda ninguna pregunta abierta**: solo falta recorrerlo en bdnava08 (sección 3).

> **10/11/2026**: recibida su respuesta (su sección 12 y la parte B de la sección 8 de ajuste-precios.md). Las
> solicitudes 21 y 22 cubren la línea sin costo en «Recibidas», y la asignación de prueba queda como dicen. **No
> pedimos nada más**: la tabla de la sección 3 ya tiene todos los casos. Lo recorremos **antes del 17/11**, cuando
> vencen las pendientes de prueba, y al terminar les avisamos para que devuelvan los documentos.

**Lo que ya existía sigue igual** para el grupo 20. Para el grupo 25, «Recibidas» solo cambia en las líneas sin costo
(sección 2). Ajuste sigue siendo un módulo aparte: no se tocó cotización, pedido ni promoción.

**Salida:** backend y frontend el mismo día, como siempre. Si encienden `directo` y `asignados` antes, no se rompe
nada: el menú en producción descarta las acciones que no conoce.

---

## 1 · Sus respuestas, y qué hicimos con cada una

| pregunta | su respuesta | en la pantalla |
|---|---|---|
| 1 · Líneas de otras marcas | `otras[]`, sin costo ni margen | Sección **«Otras marcas»** en el documento, solo para ver: descripción, marca, *«12 × $ 7.97 = $ 95.64»*. Con `lineasMias: 0` es todo lo que se ve, y se puede asignar sabiendo qué se pasa |
| 2 · Detalle de un documento que ya avanzó | El detalle normal, con `motivo: documento avanzado` y `situacion` | *«Este documento ya avanzó (convertida en pedido): ya no se puede ajustar ni asignar.»* Las líneas se ven, sin controles. `403 documento desconocido` dice *«No encontramos ese documento»* y recuerda que lo asignado está en «Asignados» |
| 3 · Por qué es `false` | `motivoAjustar` / `motivoAsignar`, lista cerrada | Un texto por motivo. **Cuando los dos dicen lo mismo, se dice una sola vez.** `sin lineas propias` añade *«pero puedes asignarlo a un vendedor»*. Un motivo que no conozcamos se dice tal cual |
| 4 · `hayMas` | En las tres listas | *«Hay más de 100: se muestran los 100 más recientes. Acota las fechas para ver los demás.»*; en vendedores, *«Hay más vendedores: escribe más del nombre para encontrarlo.»* |
| 5 · `ndocu` y los 30 días | Con `ndocu` se ignoran las fechas; lista vacía si ya avanzó; las fechas de los 30 días en `desde`/`hasta` | El filtro de fechas dice lo que se está viendo: *«Fechas: del 07/10/2026 al 06/11/2026 (últimos 30 días)»*. El buscador filtra lo que llegó (cliente o número) y, **si se escribe un número con serie que no está, ofrece «Buscar el 009-00821916 en todas las fechas»**, que pide solo con `ndocu`. Si llega vacío, dice que no existe, no es suyo o ya avanzó |
| 6 · `flete` | `true/false` en el detalle y en la lista | El aviso lo nombra: *«…tiene 1 promoción, entre ellas el descuento de flete de provincia, que no vuelve a aplicarse solo.»* También en la confirmación y, en la lista, *«1 promoción · con flete»* antes de abrirlo |
| 7 · Restricciones de vendedor | Ninguna | Buscador con todos los activos del grupo 20 (nombre, código y tipo) |
| Precio de lista bajo el costo | Hay que llegar al mínimo, no basta con subir | La pantalla no deja aplicar por debajo de `precioMinimo` y dice el costo y el mínimo: *«El precio no puede ser menor que el costo (costo $ 18.4033, mínimo $ 18.41).»* |

### Cómo quedó cada pantalla

| pantalla | qué hace |
|---|---|
| **Mis documentos** (`directo`) | Pestañas **Cotizaciones** y **Pedidos** (la elegida queda en la dirección, para volver a ella). Cada fila: número, cliente, total con IGV, fecha, situación, *«Tuyas 2 de 3»* o *«Ninguna línea tuya»*, promociones (y flete) y cuántas veces se ajustó. Filtro por fecha del documento y búsqueda por número |
| **El documento** | Cabecera con total y situación; avisos antes de ajustar; **«Tus líneas»** con la misma tarjeta de precio que «Recibidas» (precio y % sobre costo, **sin cantidad**); «Otras marcas»; observación opcional y **«Aplicar ajuste»** con confirmación; **«Asignar a un vendedor»**; y **«Ajustes anteriores»**, el más reciente primero, con lo que cambió en cada línea, el total antes y después y las promociones quitadas |
| **Asignados** (`asignados`) | Lo asignado, lo más reciente primero: a quién, cuándo, **el total al asignarlo**, **en qué quedó hoy** y cuántas veces se ajustó antes. Filtro por fecha de asignación. No se abre: ya es del vendedor |

**Al aplicar** viaja solo `{ item, precio }`, con el precio ya redondeado al céntimo. **Nunca viaja la cantidad**, así que
`400 cantidad no ajustable` no debería llegar. Después se vuelve a pedir el detalle y se muestran sus `totales` y
`promocionesQuitadas`.

**Al asignar** se confirma siempre: *«Vas a pasar la cotización 009-00969333 a HUAMANI ANTHONY. Desde ese momento es
suya y ya no la verás en «Mis documentos». No se puede deshacer desde la intranet.»* Hay dos avisos más:
- **Cotización sin aprobar que ya tuvo ajustes:** *«Si la modifica, su pantalla vuelve al precio de lista y el precio
  que ajustaste se pierde.»*
- **Líneas marcadas y no aplicadas:** *«Los precios que marcaste y no aplicaste no se guardan.»*

Antes de eso, la pantalla dice el orden: aplicar no cierra el documento (después se puede asignar, y el vendedor lo
recibe con ese precio), pero asignar sí (después ya no se puede ajustar). Si hay precios marcados sin aplicar, se
avisa junto al botón de asignar, no solo en la confirmación.

Después se dice a quién se asignó, con el camino a «Asignados».

**Errores**: se muestra el `msg` de su sección 9.
- `documento no ajustable`, `no asignable`, `en ajuste` y `costo desconocido` vuelven a pedir el detalle, porque la
  pantalla quedó desfasada.
- `precio bajo costo` y `vendedor invalido` se dicen sin perder lo escrito.
- `400 fechas invalidas` se dice junto a las fechas.

---

## 2 · Un costo de 0 (cambio del 06/11 en ajuste-precios.md)

Las dos pantallas que ajustan, «Recibidas» y «Mis documentos», comparten ahora **una sola tarjeta de precio**. Así redondean y
validan igual. Una línea con `costo` en `null`:

- se ve con **«Costo: Sin costo en este almacén»**, sin margen y **sin controles de precio**, y dice *«Este producto no
  tiene costo cargado en su almacén: su precio no se puede ajustar.»*;
- no cuenta en *«Vas a ajustar 1 de N líneas»*. Si **todas** las líneas de una solicitud llegan sin costo, «Recibidas» dice
  *«Ninguna línea se puede ajustar: no tienen costo cargado. Si no hay nada que ajustar, rechaza la solicitud.»*;
- si el costo se borra después de abrir la pantalla, `409 costo desconocido` vuelve a pedirla y la línea queda sin
  controles.

---

## 3 · Para recorrerlo en bdnava08

Con sus casos de la sección 10. **Asignar cambia el dueño de verdad**: la asignación la haríamos al final, con un
documento que ustedes nos digan que se puede asignar, y les avisamos para que lo devuelvan.

| caso | documento | qué comprobamos |
|---|---|---|
| Lista sin filtros, COT y PED | jefatura 264 | los 30 días en el título del filtro; que no salga la convertida |
| Rango amplio | 264, COT del `2020-01-01` al `2026-11-30` | el aviso de `hayMas` |
| Línea de lista bajo el costo | `009-00969333` (264) | que 140 no se deja y 152.40 se aplica; el historial |
| Costo de tres decimales | `009-00971194` (071, HP 87.102) y `009-00966639` (071, TOSHIBA, aprobada) | el mínimo redondeado hacia arriba; que 87.11 vale y 87.10 no; que la aprobada sigue aprobada |
| Con flete | `009-00963707` (264) | el aviso que nombra el flete, `promocionesQuitadas: 1` y que no vuelve |
| Dos ajustes seguidos | `009-00958734` (264) | los dos en el historial, el más reciente primero |
| `lineasMias: 0` | `009-00962947` (071) | «Otras marcas» con todas sus líneas; sin aplicar, con asignar |
| Convertida en pedido | `009-00971426` (264) | el motivo con `situacion: pedido`; por número, la lista vacía |
| Búsqueda por número | `009-00821916` (229, de 2024) | que no sale en los 30 días y aparece al buscarla en todas las fechas |
| Especialista sin marcas | `009-00971613` (270) | *«Ninguna línea es de tus marcas…»* y asignar disponible |
| Vendedor del grupo 20 | 246 o 196 | que las rutas le dan `403 sin permiso` y no ve las acciones |
| Asignar, **al final** | `009-00773963` (264): primero se le aplica un ajuste y después se asigna a `V0278` | el aviso de líneas marcadas sin aplicar; que tras aplicar se pueda asignar; la confirmación; que desaparece de «Mis documentos», aparece en «Asignados» con `ajustes: 1` y 196 lo ve en sus listas |
| Líneas sin costo mezcladas, en «Recibidas» | solicitud **21**, `009-00970744` (229) | los items 1 y 11 sin controles y *«Costo: Sin costo en este almacén»*; *«Vas a ajustar 1 de 2 líneas»* con el 12 o el 13; que el 12 y el 13 se confirman normal |
| Ninguna línea con costo, en «Recibidas» | solicitud **22**, `009-00971696` (071) | *«Ninguna línea se puede ajustar: no tienen costo cargado. Si no hay nada que ajustar, rechaza la solicitud.»* y rechazar |

---

## 4 · Cierre

- [x] respuestas a las siete preguntas (su sección 11), reflejadas (sección 1)
- [x] pantallas construidas y probadas con el simulacro del contrato del 06/11
- [x] líneas sin costo en «Recibidas» y en «Mis documentos» (sección 2)
- [x] casos de línea sin costo para «Recibidas» en bdnava08 (solicitudes 21 y 22, su sección 12)
- [ ] recorrido en bdnava08 (sección 3)
- [ ] salida el mismo día que encienden `directo` y `asignados`
