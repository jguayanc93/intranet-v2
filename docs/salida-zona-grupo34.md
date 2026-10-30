# Jefe de zona (grupo 34) — actualización del 24/10/2026: en qué orden sale y qué necesitamos de ustedes

Sigue a [respuesta-zona-clientes.md](respuesta-zona-clientes.md) y a la sección 9 de [zona-grupo34.md](zona-grupo34.md). Ya no preguntamos cómo se lee el contrato: eso está cerrado.
Lo que falta es **cuándo y en qué orden sale**, y cuatro cosas que solo ustedes pueden contestarnos.

> **Estado al 27/10/2026.** Del lado del frontend está construido y probado con un simulacro que sigue su documento: el selector de tres meses, las notas de
> reemplazo, la pantalla de `clientes` (cartera y cobertura) y un enlace «Ver sus clientes ›» desde cada fila del avance. **Nada está subido.**
> No lo hemos recorrido contra el servidor de prueba, y sin eso no sale.
>
> **Un aviso para quien pruebe el menú del 126 (27/10):** en pantalla este módulo se llama **Cobertura**, pero **su clave sigue siendo `clientes`**, la de ustedes, sin cambios de su lado.
>
> **Respondido el 27/10/2026** en la sección 10 de [zona-grupo34.md](zona-grupo34.md), sin cambios al contrato. Nuestra tabla de la sección 1 es correcta; **A se puede separar y B, C y D no**;
> el backend sale **completo en un solo despliegue**, después de nosotros; los tres meses valen desde el primer día **solo para avance, cartera y cobertura**; el aviso a los vendedores
> es un asunto interno de su lado; y se deshace con **un solo `git revert`** que no exige nada al frontend. **Pendiente:** el servidor de prueba **todavía no tiene este código** (lo montan y avisan),
> y la dirección y las claves las pasa quien lleva el proyecto de su lado.

---

## 1 · Por qué importa el orden

Esta actualización toca dos cosas que no se comportan igual si salen en distinto orden.

| | qué es | quién lo controla | qué pasa si sale **antes que el frontend** | qué pasa si el frontend sale **antes** |
|---|---|---|---|---|
| **A** | `clientes` en el menú del 126 | ustedes | el frontend no conoce esa clave y la pinta como una entrada genérica «CLIENTES» que lleva a una página que no existe (404). Solo lo ve el 126 | nada visible: sin `clientes` en el menú no aparece la pantalla ni el enlace desde el avance |
| **B** | la regla nueva de CARTERA | ustedes (el frontend no calcula nada, muestra lo que llega) | cambian los números de **todos los vendedores de cartera**: su avance, su probabilidad y su propia pantalla de cuota | el frontend no lo nota: sigue mostrando lo que llegue |
| **C** | `reemplazadoPor` y `reemplazaA` | ustedes | el frontend no los conoce y los ignora | sin los campos, la pantalla no inventa ninguna nota |
| **D** | el avance con tres meses atrás | ustedes | el selector todavía ofrece dos | el selector ofrece un tercer mes; si su servidor aún acepta dos, ese mes responde `400 periodo invalido` y la pantalla lo dice con su mensaje y vuelve al mes anterior. No rompe nada |

**Lo que se desprende:** subir el frontend primero es casi inofensivo; subir primero el backend, no. Lo único que el frontend no puede evitar es lo que ustedes
activan de su lado, sobre todo **B**, que no tiene interruptor en pantalla.

---

## 2 · Preguntas

**1 · ¿Se pueden activar por separado?** Queremos saber si la regla de CARTERA (B), `clientes` en el menú del 126 (A) y los tres meses (D) vienen en **un solo despliegue**
o se pueden activar uno por uno. Lo que más nos interesa: que **`clientes` se pueda añadir al menú del 126 como un paso aparte**, ya con el frontend arriba.

**2 · ¿Los tres meses estarán en producción desde el primer día?** La pantalla ofrece el mes en curso y los tres anteriores. ¿Su servidor de prueba y producción aceptarán `mes − 3` desde el mismo despliegue?

**3 · ¿Quién avisa a los vendedores de cartera, y cuándo?** La regla nueva les cambia cifras que ya ven hoy, en tres pantallas. Conviene que el aviso salga **el mismo día** en que se active.
No sabemos quién responde por ellos; si no son ustedes, ¿a quién se lo pedimos?

**4 · ¿Cómo se deshace del lado de ustedes?** El frontend de esta actualización sube como su propio merge y se deshace con un solo `revert` (ver [despliegue-grupo25.md](despliegue-grupo25.md)).
De su lado necesitamos saber dos cosas:
- Si hay que revertir la regla (B), **el frontend no necesita nada**: muestra lo que llegue.
- Si se quita `clientes` del menú (A), la entrada y el enlace desaparecen solos, sin tocar el frontend.

¿Es así en su lado, o hay algo que el frontend deba saber?

**5 · Servidor de prueba.** Para recorrerlo necesitamos la **dirección** y las **claves del 126** (que entra) **y del 297** (que recibe `403 usuario sin acceso`). Los casos **y sus cifras de bdnava08**
están en la sección 6 de su documento; la sección 4 de [respuesta-zona-clientes.md](respuesta-zona-clientes.md) solo lista qué comprobamos. Es solo lectura.

---

## 3 · Orden que proponemos

Es una propuesta; si en su lado conviene otro, lo ajustamos.

| paso | quién | qué |
|---|---|---|
| 1 | ustedes | nos pasan la dirección del servidor de prueba y las claves (pregunta 5) |
| 2 | nosotros | recorremos todo contra bdnava08 y les contamos qué vimos |
| 3 | nosotros | **subimos el frontend.** Sin efecto visible para nadie hasta el paso 4, salvo el tercer mes del selector (tabla de la sección 1, fila D) |
| 4 | ustedes | **el mismo día**, ya con el frontend arriba: activan la regla de CARTERA y ponen `clientes` en el menú del 126 |
| 5 | quien avise a los vendedores | el aviso sale ese mismo día (pregunta 3) |
| 6 | nosotros | entramos con el 126 y con el 297 en producción y confirmamos |

**Con su respuesta del 27/10:** antes del paso 1 hay un paso 0, **que ustedes monten este código en el servidor de prueba y nos avisen** (hoy no lo tiene). Y en el paso 4 el backend sale
**completo y en un solo despliegue** (regla, reemplazos, tercer mes y `clientes` en el menú), no por piezas; si prefieren que `clientes` en el menú vaya aparte, lo avisan y se separa.

**Lo que no hacemos:** subir nada antes del paso 2, ni tocar el servidor de ustedes. El frontend no escribe nada en el backend: todo lo de esta actualización es solo lectura.

---

## 4 · Cierre

- [x] contestadas las cinco preguntas de la sección 2 (sección 10 de [zona-grupo34.md](zona-grupo34.md), 27/10/2026)
- [ ] el servidor de prueba tiene este código y nos avisaron
- [ ] tenemos la dirección del servidor de prueba y las claves
- [ ] recorrido contra bdnava08 hecho y contado
- [ ] fecha acordada para los pasos 3 y 4 *(quién avisa a los vendedores lo resuelven ellos, en una reunión previa a la salida)*
