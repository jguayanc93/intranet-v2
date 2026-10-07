# Cuota — las cuatro que quedaban, y una que falta

Respuesta a [`cuota.md`](cuota.md). **Las dos pantallas están hechas** con las cuatro
opciones puestas, y el módulo queda cerrado salvo por lo del final.

No esperábamos que vinieran implementadas. Y menos el hallazgo del `.toFixed()` sobre un
`SUM()` nulo: un `TypeError` que **tumbaba el proceso del servidor**, no solo la petición.
Eso lo habríamos visto desde aquí como «a veces la intranet entera deja de responder» y no
se nos habría ocurrido mirar ahí.

---

## 1 · `/cuota/marcarevisar`, y que se retire `/marcawach`

La que se queda es **`marcarevisar`**. Es la que el frontend referenciaba y su nombre dice
lo que hace; `marcawach` no se entiende sin preguntar.

## 2 · `jefatura`, `hp` y `zona`: que no sea un 404

Un 404 obliga a la pantalla a adivinar si es que la ruta no existe, si el servidor está
mal, o si a esa persona sencillamente no le toca tener cuota.

**Lo que pedimos es que el direccionador responda 200 con un `status` propio** —algo como
`cuota no corresponde`— y su `msg`. Con eso la pantalla dice «tu tipo de vendedor no lleva
cuota mensual» y se acabó, igual que hace ahora con `cuota no existe`.

Si resulta que esos tres **sí deberían tener cuota** y lo que falta es la ruta, entonces es
otra cosa y preferimos saberlo: hoy esas personas abren el módulo y ven un error.

## 3 · `/cuota/desechar`: que se retire

Con lo que explicaron, no se sostiene. Lista los items que el vendedor **ya vendió** de un
catálogo de 509 códigos que solo tiene `id` y `codigo` — sin cantidad y sin meta. Sin algo
contra lo que comparar, es una lista de cosas hechas, y eso no cambia lo que nadie hace.

Era además el único consumidor del segmento 3, que se ha ido. Así que: retirarla.

> Si esos 509 códigos son una **lista de empuje** —productos que la empresa quiere colocar—
> entonces sí hay algo ahí, pero hace falta una meta por código. Eso ya no es recuperar una
> ruta, es una funcionalidad nueva, y merece su propia conversación.

## 4 · Las frases: déjenlas

Están bien. Que roten con el día es exactamente lo que hacía falta para que no cansen, y
los tramos extremos están cubiertos, que era lo que más nos preocupaba.

No vamos a tocarlas por ahora. Si algún vendedor se queja de alguna, les decimos cuál.

---

## 5 · La cuota por marca: otra audiencia, sin prisa

Queda una pieza, pero **no bloquea el módulo**: la cuota por marca no es de los vendedores
de cobertura ni de cartera, que son los que cubren las dos pantallas de arriba. Es de otro
grupo —los especialistas— y por tanto es un trabajo aparte, no un hueco en este.

`/cuota/especialista` devuelve `{"multiple": …}`, una forma distinta que **no está
documentada**. Con ella van las tres rutas de marca: `/marcamostrar`, `/marcarevisar` y
`/marcaupdate`.

La pantalla, hoy, **detecta ese caso y dice que no está montado** en vez de pintarlo a ojo.
Enseñarle mal la cuota a alguien es peor que no enseñársela, y quien caiga ahí al menos
entiende por qué no ve nada.

Lo que nos haría falta:

- **La forma de `multiple`**: qué trae por cada marca.
- **Si los cuatro añadidos aplican también ahí.** ¿Hay un `falta`, un `ritmo` y unas `notas`
  por marca, o son del total?
- **Cómo se registra**: ¿una llamada a `/marcaupdate` por marca, o todas juntas? ¿Y la
  regla de una vez al mes vale por marca o para el conjunto?

Con eso montamos la vista del especialista igual que la del resto. **Sin urgencia**: para
cobertura y cartera el módulo ya está completo, así que esto puede ir a su ritmo y con su
propia conversación sobre qué conviene enseñarle a un especialista, que no tiene por qué
ser lo mismo.

---

## Lo que hicimos

**Ver el avance** — [`cuota/cuota_observar.html`](../cuota/cuota_observar.html)

- Las ~390 líneas de `<script>` dentro del HTML salieron a un archivo.
- **Sin cuota registrada ya no parece un error**: se lee `debeRegistrar`, se explica, y hay
  un botón que lleva a registrar.
- El segmento 1 se mantiene, con la frase arriba y grande —es lo que la gente lee primero—
  y la barra del sistema de diseño.
- **Los cuatro añadidos están puestos**: `falta` en dólares, el ritmo con su `cierreTipico`
  y el histórico, las notas de crédito solo cuando `avisar` viene en true, y la lista de a
  quién llamar.
- **Si alguno llega `null`, su bloque no sale y el avance se pinta igual**, como dijeron.

**Registrar** — [`cuota/cuota_registrar.html`](../cuota/cuota_registrar.html)

- Pregunta antes por cortesía, para enseñar la cuota ya puesta en vez de dejar escribir
  para nada. **Pero quien decide es el servidor**: si llega el 409 de `cuota ya registrada`,
  la pantalla deja de insistir y enseña la que hay, sin dejar un error rojo.
- Pide confirmación diciendo que es una vez al mes y que no se puede cambiar.

Y en el catálogo quedó escrito por qué *Modificar* y *Eliminar* no existen: porque la cuota
se registra una vez y no se cambia. Antes parecían pantallas pendientes de construir.
