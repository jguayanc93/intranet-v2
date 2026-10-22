# Vendedor del mes (grupo 25) — lo construido y todo contestado

Responde a [vendedor-mes-grupo25.md](vendedor-mes-grupo25.md) **actualizado el 22/10/2026** (sección 6: nuestras dos
preguntas y las dos sugerencias, contestadas; la sección 2 de este documento recoge qué hicimos con cada una) y al menú nuevo de
[marcas-grupo25.md](marcas-grupo25.md) (sección 4, `vendedormes`). **La pantalla está construida y probada contra un simulacro
de su documento** (`dev/simulador-vendedormes.js`), con las mismas marcas y los mismos meses que cuota, reportes y cobertura.

**No queda ninguna pregunta abierta**: solo falta recorrerla contra bdnava08 (sección 3), que necesita la dirección del
servidor de prueba y las claves de las cuentas. La única respuesta pendiente es la de la sugerencia opcional `?top=`, que ustedes
dicen que va en la próxima versión.

**Nada sale a producción hasta que estén terminados los módulos del grupo 25 y probados en el servidor de
prueba**, y backend y frontend salen el mismo día.

---

## 1 · Cómo lo leímos

**Una sola pantalla, no un hub.** Su documento no define `GET /v1/vendedormes` con accesos, así que la tarjeta
**Vendedor del mes** del menú lleva directamente a `vendedormes.html`, como Reportes, Marcas y Cobertura. En la barra de
abajo de un móvil la etiqueta es **«Vendedores»** (no caben más letras); en el menú lateral y en el título, «Vendedor del mes».

| tema | lo que hace la pantalla |
|---|---|
| **Una tarjeta por marca** | En el orden en que llegan. Dice el código, la familia (y, a la jefatura, de quién es la marca si no es suya), **cuánto vendieron en total los vendedores del grupo 20 con venta mayor que 0 y cuántos fueron** (`total`), y el top |
| **El top** | Una fila por vendedor, del que más vendió al que menos: **puesto**, nombre, **tipo** (Cobertura o Cartera), **venta**, **% del total** (`participacion`), unidades y clientes. Pinta lo que llega: **no suma ni calcula nada**, ni el puesto ni la participación |
| **Menos de 3, o ninguno** | Si la vendieron menos de 3, salen menos filas. Si nadie la vendió, la tarjeta lo dice —*«Nadie del grupo 20 la vendió este mes»*, con su total en cero—: **no se omite**, porque «sin dato» y «nadie» no son lo mismo |
| **Un vendedor sin `tipo`** | Es uno que aún no se registró en la intranet: la fila dice *«Sin registrar en la intranet»*. No inventamos un tipo |
| **La tendencia** | Se lee por su **texto**, y el color solo acompaña: *«▲ Sube (antes puesto 5 · $ 13,509.41)»*, *«▼ Baja (antes puesto 1 · …)»*, *«= Igual (antes puesto 3 · …)»* y *«Nuevo: no la vendió el mes anterior»* (sin inventar un puesto). El puesto de antes puede ser mayor que 3 y lo decimos tal cual |
| **El mes** | Un selector con **el mes en curso y el anterior, nada más** (`?anno=&mes=`). El anterior se pinta como «mes cerrado» y la nota dice que la tendencia compara con el mes anterior **a ese**. Si el mes anterior no tuvo marcas (`sin marcas en ese mes`, que en bdnava08 es lo normal para septiembre) no es un error: dice *«No tenías marcas en septiembre de 2026»* y deja volver. `sin marcas del mes` ofrece ir a **Marcas** |
| **La jefatura** | Un filtro por especialista (**por `dueno.codusu`**): «Todas», «Mías» y uno por cada especialista, con cuántas marcas tiene cada uno. El filtro vuelve a «Todas» si al cambiar de mes ese especialista ya no tiene marcas. El especialista no lo ve |

**Dos avisos en la pantalla, porque alguien va a comparar números:**

- **El total de cada marca no es el avance de la cuota.** Lo dice su sección 1 (EPSON: 35 835,86 de cuota y 35 670,42 aquí; GIGABYTE:
  16 584,93 y 16 661,38 —por encima—) y lo dice la pantalla: *«El total de cada marca es solo lo que vendieron los vendedores del grupo 20
  con venta mayor que 0: no es el avance de la cuota, que mide la marca en toda la empresa y con todas sus devoluciones, así que puede
  quedar por debajo o por encima»*.
- **Hasta qué día hay ventas.** Con su `ventasHasta`, la pantalla dice *«Con ventas hasta el 09/10/2026. El top es de esos días»* en el
  mes en curso, y solo *«Con ventas hasta el 30/09/2026»* en uno cerrado. Con `null` dice *«Este mes todavía no tiene ventas
  registradas»* (o *«Ese mes no tuvo…»*), y si el campo no llegara no se inventa nada.
- **Todo en dólares y sin IGV**, con lo mismo que cuenta como venta en la cuota.

---

## 2 · Sus respuestas, y qué hicimos con cada una

| pregunta | su respuesta | en la pantalla |
|---|---|---|
| 1 · El desempate | Con la misma venta (al céntimo): más unidades, luego más clientes, y si todo empata el menor código de vendedor. Es fijo | **Nada que cambiar en la pantalla**: pinta el orden que llega y no reordena. El simulacro lo reproduce (y lo comprobamos: venta al céntimo, unidades, clientes, código) para que el orden de las pruebas sea el de su documento |
| 2 · Ventas netas en cero o negativas | **No entran en nada**: ni en el top, ni en `total.vendedores`, ni en `total.venta`. Nunca llega una venta ni una participación en cero o negativa | **Ya no hay nada que decir de ellas**: la pantalla no tiene un caso «venta negativa». Lo que cambia es el aviso del total (arriba): puede quedar por debajo de la cuota (ventas de otros grupos) **o por encima** (devoluciones de vendedores que no entran). El simulacro tiene un vendedor que devolvió más de lo que vendió de EPSON: no sale en el top ni cuenta en el total, y las pruebas lo comprueban. `anterior.puesto` es `null` también para quien el mes anterior devolvió igual o más de lo que vendió: la pantalla pinta la `tendencia` que llega y no deduce nada del puesto |
| Sugerencia · desde qué día llegan los datos | **Hecho**: `ventasHasta` | **Construido**, ver «Hasta qué día hay ventas» en la sección 1 |
| Sugerencia · más de tres | En evaluación por negocio; la respuesta va en la próxima versión | **Nada que hacer por ahora.** Cuando la contesten, lo montamos igual (un `?top=`) o lo dejamos como está |

Su lectura del documento —una sola pantalla, el top tal como llega, *«Nadie del grupo 20 la vendió este mes»*, el vendedor sin `tipo`, la
tendencia por texto, el filtro de la jefatura— nos dijeron que es correcta.

---

## 3 · Para recorrerlo contra bdnava08

Con la dirección del servidor de prueba y las claves de las cuentas (las pasa quien coordina), la pantalla se apunta a ese
servidor sin tocar código, como en [respuesta-cuota-marcas.md](respuesta-cuota-marcas.md). **Es solo lectura**: no hay nada
que preparar.

| caso | qué comprobamos |
|---|---|
| **Especialista 229** (en octubre: EPSON, GIGABYTE y RICOH con top; TDK con el top vacío) | las tres tarjetas con su top, y la de TDK con *«Nadie del grupo 20 la vendió este mes»* |
| **Jefatura 071** (ACER con 1 vendedor) | el filtro por especialista, y una marca con **una sola fila** |
| **Sin marcas, 270** | `sin marcas del mes`, con el camino a Marcas |
| **Septiembre** | `?anno=2026&mes=9`: en bdnava08 responde `sin marcas en ese mes` y la pantalla lo dice sin error |
| **`?anno=2026&mes=8`** y **`?anno=2026`** | `400 mes no disponible` |
| **Contra la cuota** | que `total.venta` **no** coincida con el avance de la cuota de la misma marca, ni por debajo (EPSON: 35 835,86 frente a 35 670,42, por las ventas de otros grupos) ni por encima (GIGABYTE: 16 584,93 frente a 16 661,38, por las devoluciones de vendedores que no entran) |
| **`ventasHasta`** | que octubre diga «Con ventas hasta el 09/10/2026. El top es de esos días» (las facturas de bdnava08 llegan hasta ahí) y que un mes cerrado no lo diga |
| **El desempate y la venta mayor que 0** | que en ningún top llegue una venta ni una participación en cero o negativa, y que `total.vendedores` sea el número de vendedores que de verdad se sumaron en `total.venta` |
| Un vendedor **sin registrar** | que `tipo` llegue `null` y la fila diga *«Sin registrar en la intranet»* |
| Un grupo 20 | `403 sin permiso` |
| **El menú** | que `vendedormes` llegue en el menú del grupo 25 (jefatura y especialista) y no en el del 20 |

---

## 4 · Cierre

**Damos el módulo por cerrado cuando:**

- [x] la pantalla está construida y probada con el simulacro
- [x] las dos preguntas y la sugerencia de `ventasHasta` están respondidas y reflejadas (sección 2); la de `?top=` queda para su próxima versión
- [ ] tenemos la dirección del servidor de prueba y las claves
- [ ] los casos de la sección 3 están recorridos contra bdnava08
