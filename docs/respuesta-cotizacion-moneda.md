# Cotización en soles — respuestas y lo construido en la pantalla

Responde a [cotizacion-moneda.md](cotizacion-moneda.md) (sección 6, las cinco preguntas, y la 7, nuestra lista) y, en la
**sección 2**, a su actualización del **23/10/2026** (la regla de la línea corregida y su propuesta para dólares).
**La pantalla está construida y probada contra un simulacro de su contrato** (`dev/servidor.js` hace lo que ustedes
describen para `/pegar`). **No se ha probado contra bdnava08**: falta la dirección del servidor de prueba y las claves de
las cuentas. Cuando las tengamos recorremos la 098-00000052 (soles) y la 098-00000053 (dólares), que ustedes dejaron grabadas.

**Nada sale a producción hasta que esté probado en el servidor de prueba**, y backend y frontend salen el mismo día.

---

## 1 · Lo que cambió con su corrección

**Tenían razón y nosotros también nos equivocamos.** Habíamos implementado la regla de su primera versión
(`round2(preu × cant × (1 − dsct/100))`). Con la corregida —**el precio con descuento a 2 decimales, y ese por la
cantidad**— hicimos estos cambios, todos ya probados:

| qué | cambio |
|---|---|
| El importe de cada línea en soles, en la cotización nueva (lista de productos, panel de cantidad, carrito, panel de editar) | `round2(round2(preu × (1 − dsct/100)) × cant)` |
| El total | **suma de las líneas + IGV**, con `IGV = round2(suma × 0.18)`: ya no es un redondeo aparte de `suma × 1.18` (da lo mismo, pero ahora es su fórmula) |
| «Modificar»: las líneas nuevas y las de cantidad cambiada (lo que viaja a `/update`) | con la regla corregida; `preu` y `cost` siguen siendo `round3(precio × tcam)` |
| El impreso del cliente en soles | «Precio DSCTO» es el **valor exacto** con el que se calcula la línea: `18 × 26.950 = 485.10`. En coma flotante, 8.5 con 1 % (8.415 exacto) se habría impreso 8.41 en lugar de 8.42 |

Las líneas que ya estaban en una cotización (las que da `/read`) **no se recalculan**: se muestran y se devuelven como llegaron.

**Dos afirmaciones de nuestra respuesta anterior eran falsas por la regla vieja, y las retiramos:**

- *«7 unidades a US$ 89.90 con 4 %: la pantalla decía 2 084.25 y el ERP graba 2 084.24.»* **Al revés.** Con su regla, el ERP
  graba **S/ 2 084.25** (297.75 × 7), como ustedes dicen. La pantalla de antes acertaba la línea; lo que sí fallaba era el IGV y el
  total (**375.16 y 2 459.41** contra **375.17 y 2 459.42**), por convertir el total en dólares.
- *«La pantalla de antes difería del ERP en el 91 % de los carritos.»* Esa cifra salía de la regla vieja. Con la corregida, en
  una simulación nuestra de 60 000 carritos (1 a 5 líneas, precios de 1 a 600 US$, cantidades de 1 a 100, descuentos
  de 0 a 10 %) **la pantalla de antes difiere en algún total en el 98 %**. Sigue siendo una simulación con nuestros supuestos,
  no datos reales.

### Cómo lo comprobamos

- **Contra una referencia de enteros exactos** (centavos, milésimas, décimas de %), escrita con la regla corregida y distinta
  del código: 60 000 carritos, **0 diferencias**. La regla anterior, contra esa misma referencia, difiere en el 97 % de los
  carritos: la prueba distingue una de otra.
- **Con aritmética decimal exacta, no con coma flotante.** `3.05 × 3.45 = 10.5225` es `10.522499…` en coma flotante y se
  redondearía a 10.522; el ERP da 10.523. Vale igual para el precio con descuento (8.5 con 1 %). Ustedes dicen que calculan
  también con enteros exactos (`funciones/comunes/importes.js`); no hemos visto ese archivo, solo comparamos resultados.
- Los ejemplos de su documento, como pruebas: `0505-012605` (27.497 · 26.81 · 160.86 · cost 25.703) y la 098-00000069
  (143.244 · 138.95 · 13 895.00 · 2 501.10 · 16 396.10).
- Suite nueva `dev/pruebas/probar-soles.js` (166 comprobaciones): la regla, la cotización nueva (con y sin tipo de cambio,
  promociones, resultado de `/pegar`), «Modificar» una cotización en soles con una línea nueva y lo que viaja a `/update`, «Ver»
  y el impreso. **Se comprobó rompiendo el código a propósito**: cada cambio que probamos rompe al menos una prueba.

---

## 2 · Su actualización del 23/10

**1 · El redondeo: mitad hacia arriba sobre el decimal exacto.** Confirmado y asumido así.

**2 · La línea.** Corregida (sección 1). `dsct` es el que mandamos en `descuento`; el costo no viaja, lo toman ustedes.

**3 · El impreso en soles.** Resuelto con la regla corregida, como dicen: `cantidad × Precio DSCTO` da el total de la línea.

**Las cotizaciones en dólares: sí, estamos de acuerdo en alinearlas, pero como entrega aparte.** Cerramos primero soles. Para
dólares hay que cambiar nuestra fórmula de la línea (`calcularLinea`, un solo sitio) a
`round2(round2(precio × (1 − dsct/100)) × cant)` y el backend su `preciosinIGV`, **en los dos lados el mismo día**. Dos cosas que
conviene mirar antes:

- **`preciosinIGV` también alimenta las promociones.** El recolector y el detalle miden los umbrales contra él. Si cambia hasta en
  8 céntimos por línea, una promoción que hoy está justo en el umbral podría pasar al otro lado. ¿Sus reglas de promoción
  comparan contra el importe que ustedes recalculan, o contra el que mandamos?
- **El IGV en dólares.** Hoy la pantalla muestra `base × 0.18` sin redondear antes de formatear; el ERP lo redondea a 2 decimales.
  Entra en el mismo cambio.

---

## 3 · Sus cinco preguntas de la primera ronda

**1 · ¿Qué tipo de cambio usaba la pantalla?**
El `tipoCambio` de `/vendedor`, **cuando llegaba**; si no llegaba (o llegaba `null` o 0) usaba **un fijo de reserva, 3.408, en
silencio**. Eso se acabó (pregunta 5). Para la 098-00000069, con tc 3.45, la pantalla de antes enseñaba **S/ 13 894.67 de total
sin IGV, S/ 2 501.04 de IGV y S/ 16 395.71 de total**, según el código (no vimos la pantalla del vendedor): los de su tabla
anterior. Con la regla corregida el ERP graba **13 895.00 · 2 501.10 · 16 396.10**, así que **ni en ese caso coincidían**. Convertía
el total en dólares ya redondeado, y el ERP convierte el precio unitario, redondea el precio con descuento y multiplica.

**2 · ¿Siguen mandando a `/pegar` los precios en dólares?**
**Sí, siempre**, esté como esté el selector. El cuerpo no cambia:

| campo | qué lleva |
|---|---|
| `moneda` | `"D"` o `"S"`, la que muestra el selector (y **solo** `"S"` si hoy hay tipo de cambio) |
| `productos[i].precioUnitario` | **US$**, el precio del producto para ese cliente |
| `productos[i].cantidad` · `descuento` | cantidad y descuento en %, el que el vendedor tecleó (acotado al tope del producto) |
| `productos[i].preciosinIGV` | importe de la línea **en US$** con el descuento, a 2 decimales |

**Para soles se calcula desde `precioUnitario`, `cantidad` y `descuento`**, no desde `preciosinIGV`: ustedes ya lo hacen así.

**3 · En `/update`, para una cotización en soles, ¿qué mandan?**
*Antes:* la línea nueva salía tal como la da `/producto/encontrado`, **en dólares**, con los `mone`/`tcam` de la cabecera repetidos
en cada línea. *Ahora*, en una cotización en soles, se convierte con **el `tcam` de esa cotización** (nunca el del día):

| posición de `/update` | línea nueva en soles |
|---|---|
| 5 `tcam` | el de la cabecera, como lo dio `/read` |
| 6 `mone` · 7 `moneitm` | los de la cabecera, **como los dio `/read`** (en las del ERP `S` y `D`); ustedes los toman de la cabecera e ignoran estos |
| 16 `preu` | `round3(vvus × tcam)` |
| 17 importe de la línea | `round2(round2(preu × (1 − dsct/100)) × cantidad)` |
| 19 importe con IGV | `round2(importe × 1.18)` |
| 21 `cost` | `round3(pcus × tcam)` |

Si la cotización en soles **no trae `tcam`** (null o 0), **no dejamos agregar productos** y lo decimos. En dólares **nada cambia**.

Un hallazgo que no estaba en su documento: la pantalla decidía la moneda del documento con `moneitm || mone`, y en una cotización
en soles **hecha en el ERP** `moneitm` es `D`, así que **«Ver» y «Modificar» la enseñaban con `$`** aunque los importes ya
estaban en soles. Ahora manda **`mone`**. Y el precio unitario se enseña **con 3 decimales** (`S/ 27.497`, no `27.50`).

**4 · ¿Está el selector de moneda al editar?**
**No existe.** El único selector de moneda está en la cotización nueva. En «Modificar» el encabezado dice **«Soles · T.C. 3.450»**.

**5 · Con `tipoCambio` en `null`, ¿deshabilitar soles?**
**Sí, hecho.** La opción PEN queda desactivada con el aviso *«Hoy no hay tipo de cambio cargado: solo se puede cotizar en
dólares.»* Aunque el navegador restaure «PEN» al recargar, queda en dólares. **El 3.408 fijo ya no existe.** Con `tipoCambio` en
`null`, `/pegar` falla **también en dólares**: hoy mostramos su `msg` al intentar crear y el carrito no se pierde. Si prefieren que
avisemos antes, díganlo.

### Su lista de cambios del frontend (sección 7), uno por uno

| su punto | estado |
|---|---|
| Convertir en pantalla con `tipoCambio` y la regla | **Hecho**, con la regla **corregida** |
| Mostrar los `totales` que devuelve `/pegar` | **Hecho**, en el aviso de «Cotización generada»: *Total sin IGV · IGV · Total · Tipo de cambio*. **Solo si la respuesta trae `moneda`**: sin ella no se muestra ni se calcula nada |
| No volver a convertir lo que devuelve `/read` | **Hecho**: «Ver», «Modificar» y el impreso usan `mone` y no multiplican |
| En `/update`, las líneas nuevas con el `tcam` del documento | **Hecho**, con la regla corregida |
| Deshabilitar soles si `tipoCambio` es `null`; ocultar el selector al editar | **Hecho** |
| Promociones solo en dólares | **Hecho**: en soles el botón se desactiva con la nota *«Las promociones solo se aplican a cotizaciones en dólares»*; **si ya había promociones aceptadas, al elegir soles se retiran** y se avisa. Su `409 promocion en soles` queda como segunda barrera |

También corregimos un fallo nuestro: al crear, la moneda volvía a dólares **solo en una variable**, no en el selector, así que la
cotización siguiente **se veía en soles y se mandaba en dólares**.

---

## 4 · Cómo probarlo en la demo

`node dev/servidor.js` y abrir `http://127.0.0.1:8080/` (el usuario que se escribe en el login decide quién eres):

| qué | cómo |
|---|---|
| Crear en soles | cualquier usuario: `/vendedor` trae `tipoCambio: 3.45`; elegir PEN. La demo convierte `/pegar` con su regla corregida y responde `moneda`, `tcam` y `totales` |
| Sin tipo de cambio | usuario **`sintc20`**: `tipoCambio: null`, soles desactivada con su aviso, y `/pegar` responde `tipcambio no registrado` |
| Modificar una en soles | **098-00000070** (de hoy, 3.45, `mone` S y `moneitm` D, como las del ERP; 485.10 + 242.55 = 727.65 sin IGV, total 858.63): agregar un producto y mirar lo que viaja a `/update` |

---

## 5 · Orden de salida

Backend y frontend **el mismo día**, y coincidimos en lo de su sección 8: `/update` sale **el mismo día** que la pantalla nueva.

- **`/pegar` convierte (backend) + pantalla nueva:** cualquiera de los dos primero es inofensivo. El frontend de hoy ya manda
  dólares con `moneda: "S"`; con el backend nuevo queda bien. El frontend nuevo con el backend de hoy sigue grabando dólares (el
  problema que ya existe), no peor.
- **`/update` toma `mone` y `tcam` de la cabecera: tiene que salir junto con el frontend nuevo.** El frontend de hoy manda las
  líneas nuevas **en dólares** a una cotización en soles; con ese cambio del backend quedarían montos en dólares bajo una cabecera en soles.

**Volver atrás:** el frontend es una rama aparte, `git revert -m 1` del merge, sin tocar datos. Lo ya grabado en soles queda como está.
