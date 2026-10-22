# Cobertura de clientes por marca (grupo 25) — lo construido y todo contestado

Responde a [cobertura-grupo25.md](cobertura-grupo25.md) **actualizado el 21/10/2026** (sección 8: nuestras tres
preguntas y la sugerencia, contestadas; la sección 2 de este documento recoge qué hicimos con cada una). **La pantalla
está construida y probada contra un
simulacro de su documento** (`dev/simulador-cobertura.js`), con las mismas marcas y los mismos meses que cuota y
reportes. **No tiene nada que ver con la cobertura del grupo 20** (`/cuota/cobertura`): no la hemos tocado.

**No queda ninguna pregunta abierta**: solo falta recorrerla contra bdnava08 (sección 3), que necesita la dirección
del servidor de prueba y las claves de las cuentas.

**Nada sale a producción hasta que estén terminados los módulos del grupo 25 y probados en el servidor de
prueba**, y backend y frontend salen el mismo día.

---

## 1 · Cómo la leímos

**Una sola pantalla, no un hub.** Su documento no define `GET /v1/cobertura` con accesos, así que la tarjeta
**Cobertura** del menú lleva directamente a `cobertura.html`, como Reportes y Marcas. Tiene dos vistas en la misma página.

| vista | lo que hace |
|---|---|
| **Las marcas del mes** | Una tarjeta por marca, en el orden que llega (por nombre): su código, nombre, familia, la **venta**, los **clientes** y las **unidades**. Arriba, el resumen (`total`): clientes, unidades y venta. **Una marca sin ventas sale con ceros y atenuada**, no se omite |
| **El mes** | Un selector con **el mes en curso y los dos anteriores** (`?anno=&mes=`). Un mes anterior se pinta como «mes cerrado», con las marcas y los dueños de entonces. `sin marcas en ese mes` no es un error: dice *«No tenías marcas en agosto de 2026»* y deja cambiar de mes. `sin marcas del mes` ofrece ir a **Marcas** |
| **La jefatura** | Además, un filtro por especialista (**por `dueno.codusu`**): «Todas», «Mías» y uno por cada especialista, con cuántas marcas tiene cada uno. A la jefatura la segunda línea de una marca ajena le dice de quién es. El especialista no ve el filtro: todas le salen suyas |
| **Los clientes de una marca** | Al tocar una marca se pide `GET /cobertura/clientes?codmar=` con el mes que se estaba mirando. Muestra la marca, su dueño y sus números (`total`), y los clientes **en el orden que llega** (por venta, de mayor a menor): nombre, RUC, unidades, comprobantes, última compra e importe. Con buscador por nombre o RUC |

**Nada se calcula en pantalla.** Los totales, el orden y el número de clientes salen de ustedes. En particular
**`total.clientes` de la lista de marcas son clientes distintos**: la pantalla lo dice (*«uno que compró dos marcas
cuenta una sola vez, por eso no es la suma de los clientes de cada marca»*) para que nadie sume las filas y piense
que hay un error.

**Quien solo devolvió.** Lo que dice su sección 1: sale en la lista con unidades y venta negativas y **no cuenta** en
`clientes`. Lo decimos en la propia fila (*«no cuenta: solo devoluciones»*, con las unidades en rojo) y con una nota
sobre la lista, para que el número de arriba no extrañe frente a las filas.

**Volumen.** Pintamos los **100 primeros** —los que más compraron— y un botón **«Mostrar los N restantes»**. El
buscador mira todos, no solo los pintados. Como no hay tope en `/clientes` (el máximo real es EPSON en marzo, con 636
clientes), eso basta.

**Exportar a Excel.** En los clientes de una marca hay un botón **«Exportar a Excel»** (junto al buscador). Pide
`GET /cobertura/clientes?codmar=…&formato=xlsx` —con `&anno=&mes=` si se está mirando un mes cerrado: **el Excel lleva el
mes que se ve**— y guarda el archivo con el nombre que pone el servidor en `Content-Disposition` (*clientes-EPSON-2026-10.xlsx*). El archivo
es el del backend, con **todos** los clientes y en el mismo orden: no lo armamos con la lista que se ve. **Antes de guardar
se mira el `Content-Type`**: si no es la hoja de cálculo es el JSON de error de siempre —`marca no disponible`, `formato
invalido`, un 500, un 200 que no es Excel— y **no se guarda nada**; se dice su `msg`. No se ofrece en una marca sin
clientes (una hoja vacía no sirve). Mientras se genera, el botón no deja pulsar otra vez.

---

## 2 · Sus respuestas, y qué hicimos con cada una

| pregunta | su respuesta | en la pantalla |
|---|---|---|
| 1 · `/clientes` de quien no tiene marcas | **`403 marca no disponible`**, como asumimos: con un `codmar` en la mano nunca es `sin marcas del mes` | Ya lo tratábamos así: lo dice con su `msg` y **vuelve a pedir la lista**, que estaba desfasada. Igual al exportar |
| 2 · `unidades` en cero | **No siempre es «devolvió todo»**: también solo notas de crédito sin unidades (rebajas de precio) o solo notas de débito. Sugieren un texto neutro | Corregido: una fila en 0 dice ***«no cuenta: sin unidades netas en el mes»*** y ya no «devolvió todo lo comprado»; una en negativo sigue diciendo *«no cuenta: solo devoluciones»*. La nota sobre la lista también lo dice: *«quien no tiene unidades netas —solo devolvió, o solo tuvo notas de crédito o de débito— sale con 0 o con negativos y no cuenta como cliente de la marca»* |
| 3 · ¿Tope en `/clientes`? | **No hay tope** y no hace falta paginar (máximo real: 636) | Nos quedamos con «Mostrar los N restantes» (ver arriba) |
| Sugerencia · Excel | **Hecho**: `&formato=xlsx` | **Construido**, ver «Exportar a Excel» en la sección 1 |
| `columnas` | `/clientes` trae `columnas` (como reportes) | El simulacro las trae igual que su documento. La pantalla no las necesita —pinta tarjetas, no una tabla—; el Excel sí las usa, y eso lo arma el backend |

Su lectura del documento —una sola pantalla sin hub, el filtro por `dueno.codusu`, la explicación de `total.clientes`, las
filas de solo devoluciones— nos dijeron que es correcta.

---

## 3 · Para recorrerlo contra bdnava08

Con la dirección del servidor de prueba y las claves de las cuentas (las pasa quien coordina), la pantalla se
apunta a ese servidor sin tocar código, como en [respuesta-cuota-marcas.md](respuesta-cuota-marcas.md). **Es solo
lectura**: no hay nada que preparar.

| caso | qué comprobamos |
|---|---|
| **Especialista 229** (EPSON con 126 clientes en octubre; TDK con 0) | la marca grande con su botón de «restantes»; TDK con ceros; que `total.clientes` **no** sea la suma de las filas |
| **Jefatura 071** (ACER con 2 clientes) | el filtro por especialista y la segunda línea de las marcas ajenas |
| **Sin marcas, 270** | `sin marcas del mes`, con el camino a Marcas |
| **Septiembre** y **hace dos meses** | `?anno=2026&mes=9` con las marcas de entonces; `sin marcas en ese mes` en el de hace dos meses |
| Un cliente que **solo devolvió** en el mes, y uno **en 0 unidades** por una nota de crédito o de débito | que salen con negativos o con cero, que `total.clientes` no los cuenta y que la fila lo dice sin suponer por qué |
| **Exportar a Excel**, el mes en curso y septiembre | que `clientes-EPSON-2026-10.xlsx` y `…-09.xlsx` abren en Excel con **todas** las filas (también las de devolución) y en el orden de la pantalla; que las fechas son fechas y la venta un número con dos decimales; y que un error nunca se guarda como archivo |
| **Contra la cuota** | que la `venta` de una marca aquí sea la `avance.venta` de la misma marca y el mismo mes en `/cuota/marcas` (su sección 1 dice que usan la misma regla) |
| `/clientes` sin `codmar`, con uno de 3 dígitos, o de una marca ajena | `400 codmar invalido` y `403 marca no disponible` |
| Un usuario del grupo 20 | `403 sin permiso` |

---

## 4 · Cierre

**Damos el módulo por cerrado cuando:**

- [x] la pantalla está construida y probada con el simulacro
- [x] las tres preguntas, la sugerencia del Excel y `columnas` están respondidas y reflejadas (sección 2)
- [ ] tenemos la dirección del servidor de prueba y las claves
- [ ] los casos de la sección 3 están recorridos contra bdnava08
