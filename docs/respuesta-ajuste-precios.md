# Ajuste de precios (grupo 20 y grupo 25) — tercera ronda: todo contestado y adaptado

Responde a [ajuste-precios.md](ajuste-precios.md) **actualizado el 21/10/2026, segunda ronda** (sección 10: nuestras
tres preguntas, contestadas; la sección 2 de este documento recoge cómo quedó cada una). Las dos puntas siguen
construidas y probadas contra un simulacro de su documento (`dev/simulador-ajuste.js`, ya con el contrato del
21/10): el vendedor (grupo 20) pide el ajuste y ve sus respuestas, y el especialista o la jefatura (grupo 25)
recibe, ajusta y confirma o rechaza.

**Todo lo que respondieron está reflejado**, las dos rondas (secciones 1 y 2). **No queda ninguna pregunta
abierta**: solo falta recorrerlo contra bdnava08 (sección 3), que necesita la dirección del servidor de prueba y las
claves de las cuentas.

**«Pedir ajuste» sigue siendo un módulo aparte**, `ajuste`, con sus propias pantallas, y **no hemos tocado
cotización, pedido ni promoción**: todas enseñan el `msg` del backend cuando llega `409 documento en ajuste`
(su sección 6), y para saber antes de intentar el vendedor tiene «Mis ajustes → Pendientes».

**Nada sale a producción hasta que estén terminados los módulos del grupo 25 y probados en el servidor de
prueba**, y backend y frontend salen el mismo día.

---

## 1 · Sus respuestas, y qué hicimos con cada una

| punto | su respuesta | en la pantalla |
|---|---|---|
| 1 · Menú y hub | `GET /ajuste` devuelve los accesos; el grupo 25 recibe `ajuste` en el menú | El hub pinta lo que devuelve (grupo 20: «Pedir ajuste» y «Mis ajustes»; grupo 25: «Recibidas»). La tarjeta de **Ajustes** está en el menú de los dos grupos |
| 2 · Forma de `lineas[].ajuste` | La misma que `despues` | Ya la usábamos: *«Ajustada: 2 × $ 168.50 − 2.5 % → 3 × $ 160.00 sin descuento»* |
| 3 · De dónde parte el precio | Del precio de lista; el cliente pasa a pagar sin su descuento, y así debe ser | Se mantiene, con el aviso. Ahora **«Hoy el cliente paga»** sale de `actual.precioNeto` (con sus decimales, p. ej. `$ 164.2875 c/u`); si no llegara, de `total / cantidad` |
| 4 · Pendiente que ya no se puede ajustar | Se cierra al leer | La lista de pendientes ya no trae solicitudes muertas: llegan como `CERRADA` y se dicen así. Dejamos, por defensa, el texto *«ya no se puede ajustar»* para una `PENDIENTE` con `puedoAjustar: false` (no debería llegar) |
| 5 · Decimales | El precio se guarda en céntimos; el costo trae hasta 4 decimales; `precioMinimo` es el costo redondeado **hacia arriba** al céntimo | **El costo se muestra con sus decimales y el mínimo al lado**: *«Costo $ 18.4033 · mínimo $ 18.41»*. Con el precio por debajo: *«El precio no puede ser menor que el costo (costo $ 18.4033, mínimo $ 18.41)»*. Un **0 % sobre costo da 18.41, no 18.40**, y no se deja confirmar nada bajo el mínimo |
| 6 · Zona horaria | Hora de Lima | Se muestra tal cual |
| 7 · Cuánto se ven las respondidas | Sin ventana: las 100 más recientes **después** de filtrar por estado; hay `desde` y `hasta` | En «Mis ajustes» y en «Recibidas», **«Filtrar por fecha de envío»** (plegado y vacío): desde, hasta y «Quitar el filtro». Cada cambio **vuelve a pedir** con `?desde=` / `?hasta=`; el filtro sigue a la persona de una pestaña a otra. Si no hay nada en esas fechas lo dice con las fechas, no con el vacío de siempre. No dejamos mandar un `desde` posterior al `hasta` |
| 8 · `enviar` sin moneda | `enviar` trae `moneda` | Los precios del paso 3 usan la `moneda` de la respuesta (y la de la vista previa en el paso 2) antes que lo que ya se sabía de la lista |
| 9 · Vista previa | `POST /ajuste/previa`, con la forma que propusimos | Ya es el paso 2: a quién irá cada línea, qué líneas no irán a nadie y cuántas promociones se pierden, **antes** de escribir el mensaje. Si la ruta no existiera (404/405) el paso sigue sin ella |
| 10 · Pedidos sin aprobar | `/lista/pedidos` y `/pedidosxdia` los traen como `sin aprobar` con `editable = 1` | **El paso 1 ahora ofrece cotizaciones y pedidos**: lee `POST /lista/cotis` y `POST /lista/pedidos`, se queda con `editable = 1`, los ordena por fecha (el más reciente primero) y dice «Cotización …» o «Pedido …». Escribir el número queda para lo que no salga. Si **cualquiera de las dos listas falla, falla el paso** (con reintento): una lista a medias haría creer que no hay pedidos. La pantalla de **Listas → Pedidos** ya lee el `editable` (posición 7) y enseña el estado `sin aprobar` como los otros dos |
| Sugerencia · contador | `ajustesPendientes` en `/vendedor` | **Numerito rojo en la tarjeta de Ajustes**, en el menú lateral y en la barra de abajo del móvil (`99+` pasada la centena; nada con `0`, `null` o si no llega). **Se actualiza en el momento** al enviar, confirmar o rechazar (la pantalla vuelve a pedir `/vendedor`), no en la siguiente página |
| Sugerencia · `cantidad` en `sinResponsable` | Hecho | *«1 × TARJETA DE VIDEO ZOTAC GT1030 2GB (ZOTAC)»*, antes de enviar y al final |

### El menú del grupo 25

Seguimos lo que fijaron en [marcas-grupo25.md](marcas-grupo25.md), sección 4: **`marcas`, `cuota`, `reporte`,
`cobertura`, `ajuste`, `vendedormes` y `cotizacion`** (esta última clave, desde el 22/10), igual para jefatura y
especialista. Ni `factura`, `promocion` ni `programador`, y el servidor de demostración de este repositorio ya devuelve
exactamente ese menú. El grupo 20 suma `ajuste` y no recibe lo que es solo del 25 (`marcas`, `reporte`, `cobertura`,
`vendedormes`).

---

## 2 · Sus respuestas a la segunda ronda, y qué hicimos con cada una

| pregunta | su respuesta | en la pantalla |
|---|---|---|
| 1 · ¿`ajustesPendientes` cuenta solicitudes o documentos? | **Solicitudes**, una por responsable, y solo **las que se pueden responder** (vigentes y con el documento todavía abierto) | Nada que cambiar: lo mostramos tal cual, y coincide con las filas de «Mis ajustes → Pendientes» y de «Recibidas → Pendientes». Como baja en cuanto el documento se aprueba, el numerito del menú y la pestaña dicen lo mismo aunque nadie haya abierto la lista. El servidor de demostración lo calcula igual: cierra las que ya no se pueden responder antes de contar |
| 2 · `desde` y `hasta` mal formados | **`400 fechas invalidas`** (no `periodo invalido`): fecha mal escrita, inexistente o `desde` posterior a `hasta`; no se ignora el filtro | Si llega, la pantalla **dice el `msg` del backend donde están las fechas** y, en vez de una lista que no es la de esas fechas, *«Corrige las fechas para ver las solicitudes»* —sin el error de reintentar, porque reintentar no lo arregla—. Al corregirlas, el aviso se va y vuelve la lista. Con el selector de fechas no debería llegar: ya no dejamos mandar un `desde` posterior al `hasta` |
| 3 · Un precio con más de dos decimales | **Redondea, la mitad hacia arriba** (8.204 → 8.20, 8.205 → 8.21, 8.206 → 8.21), y valida contra `precioMinimo` **ya redondeado** | **La pantalla hace lo mismo antes de validar**: 18.405 se guarda como 18.41 y es válido con un mínimo de 18.41; 18.404 queda en 18.40 y no. Se dice como queda (*«Se guarda como $ 18.41»*) y **lo que viaja en `confirmar` es el precio ya redondeado**. El redondeo se hace sobre el texto del número, porque `1.005 × 100` da `100.49999999999999` y el redondeo de siempre lo baja a 1.00; un precio que redondea a 0 es *«Escribe el precio»* |

Con eso su documento y esta pantalla redondean igual, y lo que ve el vendedor en `despues.precio` es lo que la persona vio
antes de confirmar.

---

## 3 · Para recorrerlo contra bdnava08

Con la dirección del servidor de prueba y las claves de las cuentas (las pasa quien coordina), la pantalla se
apunta a ese servidor sin tocar código, como en [respuesta-cuota-marcas.md](respuesta-cuota-marcas.md).

**Cuidado con los documentos reales**, como dice su sección 8: enviar, confirmar y rechazar los **modifican**, y
una solicitud respondida **no se puede volver a responder**. Por eso:

- Empezaríamos **solo leyendo**: el menú de cada cuenta, la lista de cotizaciones y la de pedidos del vendedor,
  `enviadas` con 246 y `recibidas` / `solicitud` con 229, sin responder nada.
- Para enviar, confirmar y rechazar necesitamos que **ustedes nos preparen documentos y solicitudes de prueba**.
  Lo ideal, para recorrer cada camino una vez:

| caso | qué comprobamos |
|---|---|
| **Vendedor 246**: una cotización abierta con marcas de dos o más responsables | que `previa` y `enviar` reparten igual las líneas, y que «Mis ajustes» muestra una solicitud por responsable |
| **Las listas del vendedor**: cotizaciones y pedidos con `editable = 1` | que **todo** lo que las listas ofrecen lo acepta `previa`/`enviar`: si la lista dice «sin aprobar» y `previa` responde `409 documento no ajustable`, el paso 1 ofrecería lo que no se puede |
| Una cotización con una línea de marca **sin dueño ni jefatura** (BROTHER, HP) | `sinResponsable` con su `cantidad`, antes de enviar y al final |
| Una cotización con **promociones** | `promociones` en la vista previa y al enviar, y `promocionesQuitadas` al confirmar |
| La que ya está en ajuste, una aprobada, una sola de marcas sin responsable, un número sin serie | `409 documento en ajuste`, `409 documento no ajustable`, `409 sin responsables`, `400 documento ambiguo`, ya en el paso 2 |
| **Responsable 229**: cotización | ajustar una línea con cantidad; el descuento a 0; las promociones quitadas; los totales; `precioNeto` frente a `precio` |
| Pedido (`009-00774171`, envía 196) | solo el precio; `400 cantidad no ajustable` si se fuerza |
| Un producto con **costo de más de dos decimales** | `precioMinimo` redondeado hacia arriba; un 0 % sobre costo se confirma; un precio un céntimo por debajo da `409 precio bajo costo` y **no consume** la solicitud |
| Otra cotización | rechazar con observación, y que el vendedor la lea |
| Una con el documento ya avanzado | que `recibidas`, `enviadas` y `solicitud` la devuelven `CERRADA`, nunca `PENDIENTE` |
| Una vencida y una cerrada | cómo se ven en las pestañas de ambas puntas, y el filtro por fechas |
| **`ajustesPendientes`** | que sube al enviar y baja al responder, en el 20 y en el 25, y que **baja también cuando el documento se aprueba**, sin abrir la lista |
| **Un precio con tres decimales** | que `confirmar` con 18.405 deja 18.41 en `despues.precio`, y que 18.404 da `409 precio bajo costo` con un mínimo de 18.41 |
| **`desde` y `hasta`** | un rango válido, y `400 fechas invalidas` con un `desde` posterior al `hasta` |
| **Jefatura 071** | las líneas de marcas sin dueño de su familia |

Sabemos que el simulacro no cubre lo que pasa en el ERP al confirmar (costos, totales, promociones): eso solo
lo vemos con datos reales.

---

## 4 · Cierre

**Damos el módulo por cerrado cuando:**

- [x] las pantallas de las dos puntas están construidas y probadas con el simulacro del contrato del 21/10
- [x] sus respuestas a los diez puntos y a las dos sugerencias están reflejadas (sección 1)
- [x] las tres preguntas de la segunda ronda están respondidas y reflejadas (sección 2)
- [ ] tenemos la dirección del servidor de prueba y las claves
- [ ] los casos de la sección 3 están recorridos contra bdnava08
