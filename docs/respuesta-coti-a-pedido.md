# Pasar una cotización a pedido — respuesta: construido, y una regla que falta

Responde a [coti-a-pedido.md](coti-a-pedido.md) del **18/11/2026**. **La pantalla está construida** y probada contra un
simulacro de su contrato (`dev/simulador-coti-pedido.js`), que reproduce sus ejemplos tal cual (el de la sección 6 da
la misma observación grabada, carácter por carácter). También están hechos los cambios de la sección 9 que nos tocan.

> **Segunda ronda (19/11), cerrada.** Su sección 11 hizo el plazo tal como lo pedimos y contestó las tres
> preguntas. Ya está todo en la pantalla:
> - **Plazo:** `coti fuera de plazo` y el orden de los motivos ya estaban; no cambió nada.
> - **`antiguedad` y `plazo`:** los usamos. El formulario dice *«Te quedan 4 días más para pasarla a pedido, sin
>   contar el domingo.»* y, con 5, destaca *«Hoy es el último día para pasarla a pedido.»* Si no vinieran, no dice
>   nada.
> - **Consignatario vacío:** el simulacro ya graba `obse.<texto>` sin `ATC.`. La pantalla muestra lo que devuelven.
> - **Factura o boleta:** *«Generó la factura F009-0648731.»*, probado con su forma.
>
> **Lo que queda es el recorrido en bdnava08** (sección 4). Les mandamos los números de las cotizaciones de prueba
> diciendo cuál va con 6 días y cuál con 5.

**Les pedimos una regla nueva (actualizado el 19/11):** una cotización solo se puede pasar a pedido **hasta con 5 días
de antigüedad, sin contar el domingo**. Faltó en nuestro pedido original; va en la sección siguiente. Es lo único que
bloquea la salida: la pantalla ya lo respeta en la lista, pero quien teclee el número de una más antigua depende de
que `opciones` y la conversión la rechacen.

**No hace falta la columna `convertible` en las listas.** La pantalla se apaña con `estado` y `editable`, y quien
decide es `opciones` (sección 1).

Quedan **tres preguntas cortas** (sección 3). No bloquean: la pantalla ya funciona con lo que suponemos.

**Salida:** backend y frontend el mismo día, como siempre. Si encienden `pedido` en el menú antes, no se rompe nada: el
menú en producción descarta las acciones que no conoce.

---

## 0 · La regla nueva: plazo de 5 días sin contar el domingo

**Qué es la antigüedad.** Los días que pasaron desde la **fecha de emisión** de la cotización (la posición 0 de
`/lista/cotisxdia`) hasta hoy, **sin contar los domingos**. La de hoy tiene 0. **Se puede pasar con 0 a 5; con 6 o
más, no**, esté aprobada o no.

Con hoy **jueves 19/11/2026**:

| emitida | antigüedad | ¿se pasa? |
|---|---|---|
| jue 19/11 | 0 | sí |
| lun 16/11 | 3 | sí |
| dom 15/11 | 4 | sí |
| sáb 14/11 | 4 (el domingo 15 no cuenta) | sí |
| **vie 13/11** | **5** | **sí, es el último día** |
| jue 12/11 | 6 | **no** |

Y con hoy **lunes 23/11/2026**: el martes 17/11 tiene 5 y se pasa; el lunes 16/11 tiene 6 y ya no.

**Lo que les pedimos:**

| dónde | qué |
|---|---|
| `POST /cotizacion/pedido/opciones` | `convertible: false`, `motivo: "coti fuera de plazo"`, `documento_generado: null`. El resto (cliente, direcciones…) igual |
| `POST /cotizacion/pedido` | `409 coti fuera de plazo`, con su `msg`. Hace falta aunque `opciones` ya lo diga: el vendedor puede abrirla a las 23:58 y convertir pasada la medianoche |
| orden de los motivos | si hay varios, que gane el primero de: `coti ya convertida`, `coti ya anulada`, **`coti fuera de plazo`**, `coti sin aprobar`, `documento en ajuste`. El plazo va antes que «sin aprobar» porque eso se arregla esperando y el plazo no: al vendedor le sirve más saber que ya no podrá |
| la fecha de «hoy» | la del servidor, en hora de Lima |

Si prefieren otra clave que `coti fuera de plazo`, nos la dicen y la cambiamos: es una línea.

**En la pantalla** ya está hecho:
- la lista ofrece **Hoy · 3 días · 6 días**, contados sin domingo; «6 días» es hoy y los 5 anteriores, o sea el plazo
  entero, y es la que se abre por defecto. Ya no hay 7 ni 30 días. Un jueves, «6 días» pide `desde` el viernes
  anterior;
- con `coti fuera de plazo` dice: *«Tiene más de 5 días, sin contar el domingo: ya no se puede pasar a pedido. Si el
  cliente la quiere, haz una cotización nueva.»*, sin formulario;
- si llega como `409` al convertir, vuelve a pedir `opciones` y recarga la lista, como con los otros `409`.

---

## 1 · Qué hicimos con su contrato

| contrato | en la pantalla |
|---|---|
| `pedido` en `GET /v1/cotizacion` (grupos 20 y 25) | Una tarjeta nueva en el módulo Cotización, **«Pasar a pedido»**, y la misma opción en el menú «¿Qué quieres hacer con esta cotización?» de «Ver». Sin `pedido` no aparece en ninguno de los dos sitios, y si alguien entra por la dirección, la pantalla dice que su grupo no puede |
| La lista no dice si está aprobada | La lista de la pantalla es la de siempre (`/lista/cotisxdia`), **de 6 días sin contar el domingo por defecto** (también Hoy y 3 días; ver sección 0), porque la aprobación llega después de crearla. Se ofrecen las `cotizado` y se marcan: `editable` 1 → *«sin aprobar»*; `editable` 0 → *«aprobada»*. Las convertidas, facturadas y anuladas no salen. Al abrir una, manda `opciones` |
| Número con serie | Buscar por número exige la serie antes de viajar. `403 coti desconocida` se muestra con su `msg` |
| `convertible: false` | Se dice el motivo con un texto por clave, y **no hay formulario**. Con `documento_generado`: *«Generó el pedido 098-00000001.»* (o la factura o la boleta, según `cdocu`). Un motivo que no conozcamos se dice tal cual |
| Tipo de entrega | Tres botones: Ventanilla, Lima y Provincia. **Ninguno viene marcado**: hay que elegirlo |
| Transportista | Si el tipo trae `transportista`, se muestra fijo («COMPUDISKETT S.R.L.», T0001) y **no se manda `codtra`**. En provincia hay un buscador con su ruta: de cinco en cinco, y con `total` se dice *«Hay 12 con ese nombre y se muestran 5: escribe más…»* |
| Dirección | La lista entera, con un filtro que no distingue mayúsculas ni tildes. **Se manda el texto tal como vino.** Con una sola dirección ya queda elegida. Sin ninguna, se avisa que hay que registrarlas en el ERP y no deja convertir |
| Consignatario | Precargado con `consignatario_sugerido`, con tope de 60 caracteres en el campo |
| Observación | Se manda solo el texto; mostramos después el `despacho.obse` que devuelven |
| Convertir | Se confirma antes: *«Se crea un pedido con todas sus líneas y precios, por $ 28.31 con IGV. Entrega: Provincia, por TRANSPORTES "SHALOM EXPRESS S.A.C.", en CAL.GARCIA DE CARBAJAL… El pedido queda pendiente de aprobación, y la cotización ya no se podrá modificar, dar de baja ni volver a pasar.»* |
| Respuesta buena | El número del pedido, que **queda pendiente de aprobación y no separa stock hasta entonces**, los totales en la `moneda` del documento, el despacho y la observación grabada. La lista se recarga y la cotización deja de ofrecerse |
| Almacén | El formulario dice que el pedido lleva el almacén de cada línea y enlaza a «Almacén» para cambiarlo antes |

### Los errores (su sección 7)

Se muestra su `msg`, con un título por `status`. Además:

| `status` | qué hace la pantalla después |
|---|---|
| `transportista invalido` | Suelta el transportista elegido y pide otro. Lo demás se conserva |
| `direccion invalida` | Suelta la dirección y pide otra. Lo demás se conserva |
| `coti sin aprobar`, `coti ya convertida`, `coti ya anulada`, `coti fuera de plazo` (sección 0), `documento en ajuste`, `coti desconocida` | Vuelve a pedir `opciones`, que dice en qué quedó la cotización, y recarga la lista |
| `pedido no creado`, `error query` | Añade: *«No quedó nada a medias: la cotización está como estaba. Vuelve a intentarlo y, si se repite, avisa a sistemas.»* Lo elegido se conserva para reintentar |
| sin respuesta (red) | *«…si el pedido ya se hubiera creado, te lo diremos en vez de crear otro.»* Nos apoyamos en que un segundo intento da `409 coti ya convertida` |

Mientras se convierte, el botón queda ocupado y no se puede cambiar de cotización, para que una respuesta buena no se
pierda.

---

## 2 · Los cambios de la sección 9

| cambio | qué hicimos |
|---|---|
| Todas las rutas exigen permiso | Nada: los grupos 20, 25, 32 y 34 siguen pudiendo lo mismo |
| `/pegar`: `cotizacion vacia`, `producto repetido`, `cliente no registrado` | Nada. La pantalla ya no deja crear sin productos ni agregar dos veces el mismo, y muestra el `msg` de cualquier rechazo |
| `/update`: `linea ajena`, `almacen invalido` | Nada: la posición 2 ya lleva el número de la cotización y la 19, el almacén que vino en `/read`. Muestra el `msg` |
| `/almacen` acepta aprobadas | **«Almacén» ahora ofrece también las aprobadas**, marcadas así; antes las dejaba fuera. Sirve justo antes de pasarla a pedido |
| Stock disponible, puede ser negativo | **Se muestra con su signo** en los tres almacenes, en rojo si es negativo. El total para el aviso de stock **suma solo lo positivo**: un −4 en M&M no resta de lo que hay en Principal, y un producto con todo en negativo sale como *«Sin stock»*, no como *«solo hay −4»*. No reordenamos: usamos su orden |

---

## 3 · Tres preguntas

1. **Consignatario vacío.** Si el vendedor borra el sugerido, mandamos `"consig": ""`. ¿La observación queda
   `ATC. obse.<texto>`, o la arman sin la parte `ATC.`? No cambia la pantalla, porque mostramos lo que devuelvan. Solo
   queremos saberlo para el recorrido.
2. **`opciones` de una cotización convertida en factura o boleta.** ¿`documento_generado` trae la serie de la factura
   (`F009-…`) igual que en las listas? Lo mostramos tal cual, así que cualquier forma sirve.
3. **Feriados en el plazo (sección 0).** Nosotros solo saltamos el domingo. Si el ERP tiene un calendario de feriados
   y quieren que tampoco cuenten, díganlo: la lista de «6 días» se quedaría corta un día en la semana del feriado, pero
   quien decide es `opciones`, así que no se pasaría ninguna que no deba.

---

## 4 · Para recorrerlo en bdnava08

Con su sección 10. Creamos las cotizaciones con `/pegar` (cliente **C00904**), les mandamos los números y, cuando las
aprueben:

| caso | qué comprobamos |
|---|---|
| Sin aprobar | sale *«sin aprobar»* en la lista y, al abrirla, el motivo sin formulario |
| Aprobada → Lima | T0001 fijo, sin `codtra`; el pedido 098- con los totales de la cotización |
| Aprobada → provincia | buscar transportista, elegir una de las 25 direcciones, la observación grabada |
| Convertir dos veces | la segunda dice *«Ya se pasó a pedido»* y muestra el pedido que generó |
| Fuera de plazo | una aprobada con 6 días sin domingo (o la fecha de emisión cambiada a mano): no sale en «6 días» y, por número, `opciones` dice `coti fuera de plazo`; convertirla da `409` |
| El último día | una aprobada con 5 días justos, con un domingo en medio: sale en «6 días» y se pasa |
| Provincia sin transportista | no se puede: la pantalla lo pide antes de enviar (el `400` lo probamos en el simulacro) |
| Almacén de una aprobada | aparece en «Almacén», se cambia, y el pedido sale con ese almacén |
| Buscador con stock negativo | con sus códigos: `0604-110018` (−2000), y `0601-060013` (−291 con 291 en almacén) para ver «hay físico pero no disponible»: sale en rojo y con *«Sin stock»* |
| Consignatario vacío | la observación grabada sale `obse.<texto>` |
| Plazo en el formulario | una de hoy dice que le quedan 5; la de 5 días, que hoy es el último |

Al terminar les avisamos para que borren los pedidos de prueba.

---

## 5 · Cierre

- [x] pantalla «Pasar a pedido» construida y probada con el simulacro del contrato del 18/11
- [x] sección 9: «Almacén» con aprobadas y stock disponible negativo
- [x] plazo de 5 días sin domingo en la pantalla: lista de Hoy / 3 / 6 días y el motivo `coti fuera de plazo`
- [x] el plazo en el backend (sección 0): hecho y probado en bdnava08 (su sección 11)
- [x] sus respuestas a la sección 3 y los códigos con stock negativo; `antiguedad` y `plazo` en el formulario
- [ ] recorrido en bdnava08 (sección 4)
- [ ] salida el mismo día que encienden `pedido`
