# Grupo 20 — Promociones vigentes y ¿A quién vender hoy?: cómo los leímos y ocho preguntas

Responde a [promovigentes-grupo20.md](promovigentes-grupo20.md) y a [quienvender-grupo20.md](quienvender-grupo20.md).

> **Estado al 29/10/2026.** Todavía **no hay nada subido**. Vamos a construir las dos pantallas con un simulacro que sigue sus documentos. Las ocho preguntas de la sección 2 **no bloquean** la
> construcción, pero cambian cómo rotulamos algunas cifras y cómo se hace la salida. **Nada sale a producción hasta que esté probado en el servidor de prueba, y backend y frontend salen el mismo día.**
> Esta vez pesa más que de costumbre: las dos claves de menú llegan a **todos los vendedores** (cartera y cobertura), no a un solo usuario.

---

## 1 · Cómo lo leímos

### Promociones vigentes (`promovigentes`)

| lo que dice su documento | lo que hacemos en pantalla |
|---|---|
| Lista de promociones vigentes, las que **vencen antes** primero | La lista **en su orden**; no reordenamos nada. Una búsqueda por nombre, descripción o marca, y un filtro por tipo (*Todas · Descuento · Regalo*) |
| `nombre` a veces no dice nada; `descripcion` la explica | Mostramos **las dos**: el nombre y, debajo, la descripción |
| `tipo`: `DESCUENTO` o `REGALO`, sin montos | Un rótulo con texto. **No inventamos ningún porcentaje ni cantidad** |
| `venceEl` y `diasRestantes` (0 el último día) | *«Vence hoy»*, *«Vence mañana»* o *«Vence en N días»*, con la fecha. **Usamos `diasRestantes`, no el reloj del equipo del vendedor** |
| `soloAlgunosClientes: true` | La etiqueta *«Solo algunos clientes»*. No decimos cuáles, porque no lo dicen |
| `productos` y `disponibles` | *«4 de 4 productos con stock»*; si `disponibles` es 0, *«Sin stock hoy»* |
| El detalle: productos con `partNumber`, marca, familia y `DISPONIBLE`/`AGOTADO` | Los productos **en su orden**; los agotados **se ven**, atenuados y con la palabra *AGOTADO* (no solo con color). Un filtro *Todos · Con stock*. Un botón **Copiar** junto al part number, porque para cotizar el vendedor busca por part number |
| Sin promociones vigentes: `total: 0` | Un texto *«Hoy no hay promociones vigentes»*; no es un error |
| `404 promocion no vigente` en el detalle | El mensaje, y un enlace para volver a la lista (la promoción pudo vencer mientras tanto) |
| Es **para ofrecer**, no para aplicar | La pantalla **no toca nada** y no tiene botones que modifiquen. Aplicar sigue siendo el módulo `promocion` |

### ¿A quién vender hoy? (`quienvender`)

| lo que dice su documento | lo que hacemos en pantalla |
|---|---|
| 3 clientes por día, los mismos **todo el día** | Las tarjetas por `puesto`, y la nota *«Son los mismos todo el día. Mañana habrá otros»*. **Sin botón de cambiar ni de refrescar**, sin recarga automática y sin recargar al volver a la pestaña |
| Se calcula la **primera vez del día** (1 s aprox.) | Un mensaje de espera *«Preparando tus clientes de hoy…»*. **La ruta se pide solo cuando el vendedor abre la pantalla**: nunca desde otra pantalla ni por adelantado |
| Cinco `tipo`: `REPONER`, `LLAMAR`, `REACTIVAR`, `SIN_COMPRAS`, `LIBRE` | **Redactamos nosotros el motivo según el `tipo`** (como dicen que se puede), porque `valorUsd` significa algo distinto en cada uno. Para un `tipo` que no conozcamos, mostramos su `motivo` |
| `valorUsd` según el tipo; `null` si no aplica | Cada tipo con su rótulo: *«Lo que vale lo vencido»* (reponer), *«Compra media mensual»* (llamar), *«Compró en 12 meses»* (reactivar y libre), nada en `SIN_COMPRAS`. **En `LIBRE` decimos que es a todos los vendedores**, no a este |
| `productos`: con `cada`, `ultima`, `compras` solo en `REPONER` | *«Suele llevar 36 por compra · cada 10 días · última 14/09/2026 · 16 compras en 12 meses»*. En los demás, la cantidad. Si `productos` viene `[]`, sin lista |
| `mesesConCompra` y `facturasMesPasado` solo en `LLAMAR` | *«Compró en 6 de los últimos 6 meses · 8 facturas el mes pasado»* |
| Menos de 3 tarjetas; o `sugeridos: []` con `aviso` | Las que lleguen. Con `aviso`, el texto en un aviso, **no como error** |
| Sin teléfono ni contacto | No hay. **Tampoco mostramos el código del cliente** (`codcli`): decisión nuestra, el vendedor reconoce al cliente por el nombre |
| Todo en dólares | `$` y dos decimales |

**Lo que no hace el frontend en ninguna de las dos:** no calcula cifras (ni sumas, ni porcentajes, ni días), no escribe nada en el backend, y no cambia el orden en que llegan las cosas.

### Lo que suponemos y no preguntamos (si es otra cosa, díganlo)

| caso | qué hacemos |
|---|---|
| `descripcion` vacía o ausente | Mostramos solo el nombre |
| `tipo: null` en una promoción | Sin rótulo de tipo; la promoción se ve igual |
| `partNumber: ""` | *«Sin part number»*, sin botón de copiar |
| Un `404 promocion no vigente` en el detalle | Mensaje y volver a la lista; sin reintentar |
| `500 error query` | El mensaje, con **Reintentar** (también en `quienvender`: nos apoyamos en que pedir dos veces el mismo día devuelve lo mismo y no graba de más, como dicen en su sección 5) |
| `403 sin permiso` | El mensaje. El menú no ofrece estas pantallas a otros grupos, así que solo se llega escribiendo la dirección |
| `401 falsa galleta` y `403 usuario sin acceso` | Al login, como en todo el resto |

---

## 2 · Preguntas

### Promociones vigentes

**1 · Almacenes.** *Qué vimos:* `DISPONIBLE` es «hay stock en alguno de los cuatro almacenes» (principal, M&M, Piura y Chorrillos). *Por qué lo preguntamos:* la cotización de hoy solo deja mover entre el principal y M&M,
así que un producto *disponible* solo en Piura o en Chorrillos puede no poder cotizarse desde la pantalla. *Qué suponemos mientras tanto:* mostramos `DISPONIBLE` / `AGOTADO` tal cual. *Qué pedimos:* ¿se puede
decir **en qué almacenes hay** (sin cantidades)? Si sí, lo mostramos en cada producto; si no, queda como está.

**2 · Las promociones vencidas que la cotización sí ofrece.** *Qué vimos:* su sección 4: `/promocion/revisar` y el motor solo miran `estado = 1`, así que en bdnava08 hay 5 promociones vencidas
(14898, 15124, 15217, 15218 y 15227) que esta lista **no muestra** y la cotización **sí puede aplicar**. *Qué suponemos:* que ese cambio es aparte y por ahora no se hace; esta pantalla no lo arregla ni lo oculta.
*Qué pedimos:* ¿**hay fecha** para que el motor deje de aplicar las vencidas? Cuando se haga, cambia lo que ven los vendedores en el módulo `promocion` de siempre, y queremos probarlo el mismo día. Mientras tanto, un vendedor
puede ver aplicada en una cotización una promoción que no figura aquí.

### ¿A quién vender hoy?

**3 · ¿Qué día es «hoy»?** *Qué vimos:* `fecha` es «el día, segun el servidor», y las sugerencias se calculan y se graban **una vez por día**. *Por qué lo preguntamos:* si el servidor cuenta el día en UTC, entre las 7 de la noche y la
medianoche de Lima ya sería «mañana», y el vendedor recibiría —y fijaría— las sugerencias del día siguiente. *Qué pedimos:* confirmar que el día se cuenta **en hora de Lima**. Mostramos la `fecha` que mandan, así que
si no coincidiera con el calendario del vendedor, se vería.

**4 · REACTIVAR: ¿de qué periodo es `cantidad`?** *Qué vimos:* en `LLAMAR` los productos son «lo que más lleva (3 meses)» y en `REACTIVAR` «lo que más llevaba», pero **no dicen el periodo**. *Qué suponemos:* que son
los 12 meses del `valorUsd`, y lo rotulamos *«Llevaba 36 en los últimos 12 meses»*. *Qué pedimos:* el periodo exacto.

**5 · REPONER: ¿qué es «lo que vale lo vencido»?** *Qué vimos:* `valorUsd` en `REPONER` es «lo que vale lo vencido», y que *«nada sale de la lista de precios»*. *Qué pedimos:* **una frase exacta** de cómo se calcula (por ejemplo: la
cantidad que suele llevar de cada producto que ya le toca, a los precios de sus últimas compras), para rotularlo sin prometer algo distinto. Mientras tanto decimos *«Lo que vale lo que ya le toca»*.

**6 · Cómo vamos a recorrerlo hoy.** *Qué vimos:* su sección 5: la base de prueba está atrasada y las pruebas se hicieron **simulando días pasados** con `armarDia`; la ruta nunca recibe el día. *Qué pedimos:* ¿qué vendedores de bdnava08 devuelven hoy,
por la **ruta real**, **2 `REPONER` y 1 `LLAMAR`**? Si ninguno, ¿pueden **dejar armado un día** para uno de cartera y uno de cobertura, para que veamos las tarjetas de verdad y no solo los de respaldo?

### Las dos

**7 · Salida.** *Qué vimos:* cada módulo trae su clave nueva en `GET /v1/vendedor/cartera` y en `/vendedor/cobertura`. *Por qué importa:* una clave de menú que el frontend no conoce se pinta como una entrada genérica
(*«PROMOVIGENTES»*, *«QUIENVENDER»*) que lleva a una página que no existe (404), y esta vez la verían **todos los vendedores**. *Qué pedimos:* (a) que **cada clave se pueda activar por separado**, para sacar un módulo a la vez; (b) que
**ninguna se active antes de que el frontend esté subido** (al revés no pasa nada: si el frontend sube primero, las pantallas simplemente no aparecen hasta que pongan la clave); y (c) que nos digan **cómo se deshace**
de su lado, y si quitar una clave del menú basta, ya que las rutas se autorizan aparte.

**8 · Servidor de prueba.** Para recorrerlo necesitamos **la dirección y las claves de un vendedor de cartera y uno de cobertura del grupo 20**, y de **un usuario del grupo 25 y del 126** para comprobar el `403 sin permiso`. Es solo lectura.
Y que ese servidor **ya tenga este código** (hoy no sabemos si lo tiene).

---

## 3 · Dos cosas que decidimos nosotros

- **«¿A quién vender hoy?» va en la barra inferior del móvil**, en el tercer lugar, y por eso **Factura pasa a «Más»** para los vendedores. «Promos vigentes» va en «Más» y en el menú lateral, sin desplazar nada.
  Lo avisamos porque es un cambio que verán todos los vendedores; no pide nada al backend.
- **El nombre en pantalla.** En el menú son *«Promos vigentes»* y *«Vender hoy»* (más corto, porque en la barra inferior de un móvil el texto se corta); el título de la pantalla es *«¿A quién vender hoy?»*. Las claves siguen
  siendo las suyas: `promovigentes` y `quienvender`.

---

## 4 · Para recorrerlo contra el servidor de prueba

| caso | qué comprobamos |
|---|---|
| **Un vendedor de cartera y uno de cobertura** | el menú trae las dos claves nuevas; las pantallas cargan |
| `GET /promocion/vigentes` | 20 promociones; la primera vence el 2026-10-31; ninguna de 14898, 15124, 15217, 15218 y 15227 |
| `/promocion/vigentes/15221` | 4 productos, *«solo algunos clientes»*, marca `HEWLETT PACKARD` |
| `/promocion/vigentes/14106` | `REGALO`, 6 productos, 2 agotados y 4 disponibles |
| `/promocion/vigentes/14898` y `/abc` | `404 promocion no vigente`: el mensaje y volver a la lista |
| `GET /quienvender`, V0313 (cartera) y V0278 (cobertura) | 3 tarjetas: 2 de reponer y 1 de llamar (**pregunta 6**) |
| El mismo vendedor otra vez el mismo día | las mismas tarjetas, al instante |
| Cobertura sin historial (V0360) y con clientes sin compras (V0353) | 3 `LIBRE` y 3 `SIN_COMPRAS`, sin lista de productos |
| Un vendedor recién llegado, sin clientes | `sugeridos: []` y el `aviso`, **sin error** |
| El 126 y un usuario del grupo 25 | `403 sin permiso` |
| Sin sesión | `401 falsa galleta`: al login |

---

## 5 · Cierre

**Damos los módulos por cerrados cuando:**

- [ ] las ocho preguntas de la sección 2 están contestadas
- [ ] el servidor de prueba tiene este código y tenemos la dirección y las claves
- [ ] las dos pantallas están construidas y probadas con el simulacro
- [ ] recorridas contra el servidor de prueba, con las cuentas de la sección 4
- [ ] acordado el orden de salida de la **pregunta 7** y quién avisa a los vendedores
