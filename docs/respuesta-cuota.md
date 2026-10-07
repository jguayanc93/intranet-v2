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

## 6 · El avance vacío: la pantalla ya leía bien

Este conviene aclararlo, porque la conclusión es distinta de los otros dos.

**`avance.js` ya lee de `respuesta.data`** —con un respaldo al primer nivel, porque
`cuota no existe` y `cuota no corresponde` llegan sin envolver— y **ya trataba `porcentaje`
como texto**, parseándolo antes de pasarlo a la barra. Si lo que probaron fue una versión
anterior a nuestros últimos commits, puede ser eso; con la de ahora, esos dos puntos están
cubiertos.

**Lo que sí estaba mal era nuestro simulador de pruebas**, que devolvía el avance en el
primer nivel. La suite pasaba sin tocar nunca la forma real, así que el día que alguien
tocara esa línea no habría saltado nada. Es el mismo fallo que con `/revisar`, dos veces en
el mismo módulo.

Ya están las dos cosas: el simulacro devuelve `data` y hay **catorce comprobaciones** que
saltan si la pantalla lee del nivel equivocado. Comprobado reintroduciendo el fallo.

De paso añadimos dos cosas de su lista:

- **`diastexto`**, que no estábamos enseñando. Va bien junto a la frase: `mensaje` dice
  dónde estás y `diastexto` cuánto margen queda, que es la otra mitad de la decisión.
- **Un respaldo en la barra**: si `porcentaje` no se puede parsear, se calcula con
  `avance / meta`. Son números y no dependen del formato del texto.

**Lo del 302 no necesitaba nada.** El núcleo usa `fetch` con `credentials: "include"` y sin
`redirect: "manual"`, así que sigue la redirección y manda las galletas en el salto. Era de
las primeras cosas que se unificaron.

---

## 7 · `/revisar` y `/mostrar`: corregido

También era nuestro, y es el que daba el síntoma feo.

*Registrar* preguntaba a `/revisar` —que es la ruta correcta— pero **leía su respuesta como
si fuera la de `/mostrar`**: buscaba `debeRegistrar` y un `meta`, que esa ruta no devuelve.
Como además antes respondía **403** cuando la cuota ya existía, la petición caía en el
`catch`, y ahí la pantalla tiene una regla deliberada: si la comprobación falla, deja
registrar igual, porque el servidor va a rechazar el duplicado de todos modos.

El resultado era el peor de los dos mundos: a quien ya tenía cuota se le ofrecía el
formulario, lo rellenaba, y se llevaba un 409.

Ahora lee **`puedeRegistrar`**, que es lo que dijeron. Y que las dos salidas sean 200
arregla la mitad del problema por sí solo: el caso normal deja de llegar por la vía de los
errores.

**El avance ya colgaba de `/mostrar`**, así que ahí no había nada que cambiar.

> **Lo que nos lo escondió fue nuestro simulador de pruebas**, que respondía lo mismo a las
> dos rutas. Si dos rutas se distinguen en el backend, tienen que distinguirse ahí también
> o las pruebas pasan sin estar probando nada. Ya están separadas, y hay cinco
> comprobaciones nuevas sobre el caso de entrar a registrar con la cuota ya puesta.

---

## 8 · Lo de `fijado`: corregido, y no hace falta cambiarlo

Era nuestro. El formulario mandaba `monto` y ustedes leen `fijado`, así que el valor no
llegaba y saltaba la validación del importe.

**Lo que costó el rato no fue el nombre, fue el mensaje.** «El monto debe ser mayor que
cero» manda a mirar el campo del formulario, que era justo donde no estaba el problema. Que
ahora `cuota no enviada` sea un `status` distinto lo resuelve: la próxima vez se ve de qué
lado está en cuanto se abre la consola.

**Sobre si preferimos otro nombre: no, déjenlo en `fijado`.** Ya está documentado y la
pantalla lo manda bien. Cambiarlo es tocar algo que funciona para ganar una palabra más
bonita, y eso tiene más riesgo que valor. Si algún día se reescribe esa ruta por otro
motivo, ahí sí.

> No mandamos `porcentaje` ni `objetivo_especial`. Eran el objetivo específico por familia
> —lo que enseñaba el segmento 2— y ese segmento se retiró, así que registrar un valor que
> nadie va a ver no aporta. Se quedan con sus valores por defecto, `0` y `COMPONENTES`.

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
