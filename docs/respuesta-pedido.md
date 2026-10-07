# Pedido — las tres que quedaban

Respuesta a la sección final de [`pedido.md`](pedido.md). Las dos pantallas ya están
hechas contra el contrato nuevo y el módulo queda cerrado por nuestra parte.

Gracias por el hallazgo del `@doc`. No se nos habría ocurrido mirar ahí: desde el
navegador, una ruta que siempre devuelve 500 y una pantalla que se come el error en un
`catch` genérico se ven igual que una pantalla que nadie usa.

---

## 1 · `apro` 2, 3 y 4 — no nos bloquea

Pregúntenlo a sistemas cuando puedan, pero **no esperen por nosotros**.

El gate del navegador ya no existe: la pantalla no interpreta `apro` en ningún sitio.
Rotula el estado del pedido solo con `flag`, que sí está confirmado —`0` aprobado, `1`
atendido, `*` anulado— y para todo lo demás pregunta y enseña lo que respondan.

Nos interesa igualmente, pero para rotular mejor, no para decidir. Mientras tanto no se
muestra lo que no se entiende, que es preferible a inventarle un nombre.

> Un dato por si ayuda a priorizarlo: el gate viejo exigía `flag===0 && apro===1`, o sea
> **361 pedidos de 9 284**. Sumado a que la ruta devolvía 500 en todas las llamadas, la
> conclusión es que esa pantalla no aplicó un flete nunca. Si alguien reportó alguna vez
> que «el flete no funciona», tenía razón.

---

## 2 · Sí, manden la cabecera

**Es la que más nos hace falta de las tres.**

Ustedes mismos lo dijeron: los totales los gobierna el trigger y sumar líneas en el
navegador va a discrepar en cuanto haya un redondeo. Hoy la pantalla suma, porque no tiene
otra cosa, y la rotula **«Suma de las líneas»** en vez de «Total» precisamente para no
presentar como total algo que no lo es. Debajo dice que el total que vale es el de la
cabecera.

Con `tota`, `toti` y `totn` de la cabecera en la respuesta de `/pedido/mostrar`, esa
distinción desaparece y la pantalla enseña el total de verdad desde el primer momento. El
código ya está escrito para leerlo de ahí en cuanto llegue.

Importa además por el flete: el mínimo se mide sobre el total **sin IGV**, y hoy el
vendedor ve en pantalla una suma de líneas que no es ninguno de los dos números con los
que se compara. Cuando llega «faltan 8,02», la cuenta no le cuadra a ojo.

## 3 · Sí, alineen el mensaje

`/pedido/mostrar` diciendo `cotizacion no registrada` cuando falla un pedido es de las
cosas que hacen dudar de si la pantalla está pidiendo lo que cree. Con `pedido
desconocido` basta, para que case con las otras dos rutas.

---

## Lo que hicimos con lo que mandaron

Las dos pantallas están migradas al núcleo y cubiertas por una suite que las recorre
enteras en un DOM real.

**Flete.** Busca, enseña el pedido con sus líneas **y su moneda** —el `$` a mano ya no
está— y aplica. Lo que devuelven se usa entero:

- Los tres totales se pintan tal cual, sin volver a pedir nada.
- **Sí volvemos a pedir las líneas**, pero por otra razón: el trigger añade la línea del
  descuento y la lista en pantalla se quedaría con una línea de menos. No es por los
  totales.
- El «faltan 8,02» tiene su propio tratamiento, con las tres cifras y diciendo que el
  mínimo se mide sin IGV. Es, como dijeron, la respuesta más útil de las siete.
- Los otros cinco motivos se enseñan con su `msg` y **sin botón de reintentar**: ninguno
  se arregla repitiendo la misma petición.

**Almacén.** Pantalla nueva. El hub ya ofrecía la acción —estaba en el catálogo marcada
como inexistente— pero apuntaba a una página que no existía. Ahora existe, pide
confirmación antes de mover nada, y enseña **cuántas líneas se actualizaron**: es la señal
de que la cabecera y el detalle no quedaron descuadrados, que es justo lo que advirtieron.

---

## Una pregunta nueva, pequeña

**¿Cuál es la lista completa de almacenes destino válidos?**

Dicen «los mismos de cotización: `01`, `08`, `15`, `16`, entre otros». Ese «entre otros»
es el problema: el desplegable necesita una lista cerrada.

Hoy ofrece **solo `01` y `08`**, que es lo que arrastramos sin confirmar desde la pantalla
de cotización. Las dos pantallas comparten el catálogo a propósito, así que lo que
respondan vale para las dos.

Si `15` y `16` son destinos válidos y hoy no se ofrecen, hay vendedores que no pueden
hacer algo que el backend sí permite — y no hay manera de que se enteren.
