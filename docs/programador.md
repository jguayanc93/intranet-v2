# Programador — tres rutas y una pantalla

**Programador** es el último módulo, y el más pequeño: una pantalla de 63 líneas y tres
rutas. Programa facturas para despacho en almacén.

> **No hay prisa.** La acción de *entregar* —la única del módulo— **queda para más
> adelante** por decisión de negocio, así que el hub no la enlaza y la pantalla no está en
> uso. Esto es para cuando se retome, no algo que bloquee nada.

El documento es corto porque hay poco que preguntar. Lo que sí trae son **cuatro cosas que
encontramos leyendo el código**, y conviene que estén escritas antes de que se retome:
explican por qué esta pantalla hacía menos de lo que parecía.

---

## 1 · Las tres rutas

| ruta | cuerpo | cuándo |
|---|---|---|
| `/programador/despacho` | **ninguno** | al abrir la pantalla |
| `/programador/despachoxdia` | `{ "dia": … }` | al elegir una fecha |
| `/programador/programar` | `{ "factura": …, "fecha": … }` | al pulsar el botón de una fila |

### Lo que no sabemos: qué hay en cada posición

De cada fila que devuelven las dos primeras, la pantalla lee tres posiciones:

| posición | qué hace con ella |
|---|---|
| `[1]` | el **número de factura** — es lo que manda al programar |
| `[2]` | lo pinta como **título** de la fila |
| `[3]` | lo pinta debajo, **sin etiqueta** |

De la `[1]` estamos seguros porque viaja de vuelta. De las otras dos no: se pintan tal cual
y nadie escribió qué son. Suponemos que `[2]` es el cliente, pero **no vamos a rotularlas
adivinando** — es exactamente lo que nos costó caro en el módulo de listas, donde la
posición 5 de facturas llevaba meses pintada bajo la etiqueta «Referencia».

**¿Qué trae cada posición, y hay más de tres?**

Y de paso: **¿las dos rutas devuelven la misma forma?** La pantalla las trata igual —el
mismo código pinta las dos— pero eso es una suposición, no algo que nadie haya comprobado.

### Y tres preguntas de comportamiento

- **¿Filtran por el `codven` de la galleta?** Un vendedor no debería poder programar el
  despacho de la factura de otro. Es la misma pregunta que hicimos en cotización y en
  pedido, y en cotización resultó que no.
- **¿Qué devuelve `/programar`?** Hoy la pantalla ignora la respuesta por completo: repinta
  la lista con lo que llegue y no mira si salió bien. Si hay motivos de rechazo —ya
  programada, fuera de plazo, no es suya— queremos enseñarlos.
- **¿Qué fechas acepta?** Ver el punto 3.

---

## 2 · Dos controles que no hacen nada

La pantalla tiene un campo **«ingrese numero de documento»** y un botón **«programar»**.
Ninguno de los dos tiene un listener: `js/funciones/factura_programar.js` solo escucha al
selector de fecha.

Así que lo único que programa algo es el botón que aparece dentro de cada fila de la lista.
El campo de arriba es decoración.

No les pedimos nada por esto —es cosa nuestra y se va al migrar—, pero conviene decirlo por
si alguien reportó alguna vez que «escribo el número y no pasa nada». Tenía razón.

---

## 3 · El límite de fechas no se aplica

La pantalla intenta acotar el selector a ±2 días:

```js
let dia_max = dia + 2;
let dia_min = dia - 2;
let formato_min = año + "-" + mes + "-" + dia_min;
fechita.setAttribute("min", formato_min);
```

Tiene dos fallos que se anulan el uno al otro hasta que no:

- **El mes no lleva cero delante.** La línea que lo ponía está comentada, así que en octubre
  genera `2026-10-04`, pero en septiembre genera `2026-9-04`, que no es un formato válido
  para un `input type="date"` y **el navegador descarta el atributo en silencio**.
- **El día puede desbordar.** El día 30 produce `dia_max = 32`.

Resultado: durante nueve meses del año el límite **no existe**, y los otros tres existe a
medias. Se puede elegir cualquier fecha.

**Lo mismo pasa al programar.** Si no se elige fecha, `enviar()` construye la de hoy a mano
con el mismo error y manda `"2026-10-6"` en vez de `"2026-10-06"`.

**Las preguntas:**

- **¿Cuál es la ventana válida de verdad?** ¿±2 días? ¿solo hacia adelante? ¿días hábiles?
- **¿Qué hace `/programar` con una fecha fuera de ventana, o mal formada?** Porque lleva
  tiempo recibiéndolas.

Lo del formato lo arreglamos nosotros. Lo que necesitamos de ustedes es la regla.

---

## 4 · Un día tranquilo y un fallo de red se ven igual

El `catch` de las dos funciones de listado pinta **«SIN RESULTADOS · nada que mostrar»**.

Eso sale tanto si el día no tiene facturas que despachar como si la petición falló, el
servidor devolvió un 500 o se cayó la red. Para quien mira la pantalla son la misma cosa.

No necesitamos nada de ustedes para arreglarlo —el núcleo ya distingue las dos— pero sí
saber una cosa: **¿un día sin facturas responde lista vacía, o un error?** En las listas de
cotización resultó ser un 400 con un mensaje que hablaba de cotizaciones, y lo cambiaron.

---

## 5 · Dos accesos sin pantalla

El catálogo declara, además de *Entrega*, dos acciones más:

- **`retirar`** — retirar del despacho en almacén
- **`reprogramar`** — cambiar el día de despacho

Ninguna tiene pantalla: la de retirar era un archivo de doce líneas con un «uppsi» dentro,
y se borró.

**¿Existen rutas para esas dos?** Si existen, se construyen —son variantes de lo mismo y
no costarían mucho—. Si no existen, las quitamos del catálogo en vez de dejar dos baldosas
apagadas.

---

## Mientras tanto

No tocamos nada, por dos razones que se suman: la acción queda para más adelante, y sin
saber qué hay en las posiciones `[2]` y `[3]` lo único que podríamos hacer es pintar dos
columnas sin nombre — que es lo que hay hoy.

Cuando se retome, lo primero es responder esas dos posiciones. Lo demás —los controles sin
listener, el formato de fecha, el `catch` que confunde un día tranquilo con un fallo de
red— se arregla aquí sin pedir nada.
