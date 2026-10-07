# Dar de baja una cotización — falta la ruta

La pantalla está terminada y probada. Lo único que falta es la ruta del backend: hoy
`/cotizacion/eliminar` **no existe** — está comentada en el router, como ustedes mismos
anotaron en `autorizacion-cotizacion.md`.

Este documento dice qué espera la pantalla, para que nazca ya encajando.

---

## Qué hace la pantalla

Es la hermana pequeña de *Modificar*: se elige de la lista de las propias, pero **no se
abre el detalle**. Para revisar qué lleva una cotización está *Ver*; esta hace una sola
cosa y es irreversible.

```
[ Hoy ] [ 2 días ]

 SERVICIOS INTERNET S.A.C.              US$ 1,645.01
 009-00971087 · 13:57       [ Dar de baja ]

 PC SUMINISTROS S.A.C.                    US$ 892.40
 009-00971042 · 11:12       [ Dar de baja ]
```

Solo ofrece las que están en estado `cotizado`, por lo mismo que *Modificar*: a una
facturada o convertida en pedido no se le da de baja desde aquí.

La confirmación lleva el cliente y el importe, no solo el número: un «¿seguro?» con un
código de documento no le dice al vendedor si está a punto de tirar la correcta.

---

## Lo que la pantalla enviaría

```
POST /v1/cotizacion/eliminar
{ "ndocu": "009-00971087" }
```

Con la cookie `cdk`, como todo lo demás.

**El número va siempre con su serie.** La lista lo da así, y el campo de búsqueda manual
pide el formato completo. No hace falta que la ruta acepte números sueltos; de hecho es
mejor que no, por lo mismo que `/promocion/acoplar`: conviven `009-` y `098-`, y un
número suelto es ambiguo.

### Preguntas

- ¿Es `/cotizacion/eliminar` el camino, o prefieren otro? Cambiarlo en el frontend es una
  línea: está aislado en una sola constante.
- ¿`ndocu` es el nombre del campo? `/promocion/acoplar` usa ese mismo, así que se escogió
  por coherencia.
- ¿Hace falta mandar algo más — un motivo, por ejemplo?

---

## Lo que la pantalla espera recibir

El sobre de siempre:

```json
{ "status": "ok", "codigo": 0 }
```

Cualquier `status` distinto de `"ok"`, o un HTTP de error, se trata como fallo y se
muestra **el `msg` tal cual**, sin reintentar. Es lo que ya hacen las demás pantallas: el
backend escribe mejores mensajes que los que el frontend pueda adivinar.

Los casos que convendría distinguir, y que ya tienen `status` propio en otras rutas:

| situación | `status` esperado | qué mostraría la pantalla |
|---|---|---|
| no existe, o no es de este vendedor | `coti desconocida` · **403** | el `msg` tal cual |
| ya facturada, o ya dada de baja | algo propio · **409** | el `msg` tal cual |
| **aprobada** (`flag = 1`) | algo propio · **409** | ver abajo |
| el número vino sin serie | `documento ambiguo` · **400** | el `msg` tal cual |

### La aprobada necesita su propio mensaje

**Una cotización aprobada no se puede dar de baja**, igual que no se puede modificar: ya
fue aceptada en otras tablas y hay que desaprobarla primero, por fuera de la intranet.

La pantalla lo explica con esas palabras en vez de dar un error seco, porque el vendedor
tiene que saber **qué hacer a continuación**, no solo que falló.

Pero hoy lo deduce del texto del `msg` o de un 409 a secas, que es frágil. **Pregunta:**
¿puede tener un `status` propio, del tipo `coti aprobada`? Así la pantalla lo reconoce sin
adivinar.

> Es la misma pregunta que quedó abierta en `modificar-cotizacion.md`, y la misma
> solución serviría para las dos pantallas.

---

## Lo que importa de la implementación

**Que valide la propiedad**, con la misma receta que acaban de aplicar a `/read`,
`/readprom` y `/update`. Es una ruta de escritura y destructiva: es la que más lo
necesita.

**Que sea `flag='*'` y no un borrado real**, si es posible. `promociones.md` dice que así
se marcan hoy las eliminadas, y `/lista/cotisxdia` ya las excluye. Manteniendo esa
convención, la cotización desaparece de la lista sola y no hay que tocar nada más.

**Que rechace la que no esté abierta y la aprobada.** La pantalla filtra por estado, pero
eso es comodidad; y la aprobada **ni siquiera la puede filtrar**, porque la lista no
devuelve el `flag`. Lo que impide de verdad dar de baja una facturada o una aprobada tiene
que estar del lado servidor.

> Si `/lista/cotisxdia` devolviera el `flag` —o mejor, un booleano ya resuelto—, ni
> *Modificar* ni *Dar de baja* ofrecerían lo que van a rechazar. Está pedido en
> `modificar-cotizacion.md` y sirve para las dos.

---

## Mientras tanto

La pantalla está completa y **dice la verdad**: al confirmar, avisa de que dar de baja
todavía no está habilitado en el servidor, que la pantalla ya está lista, y que avisen a
sistemas si lo necesitan con urgencia.

Es mejor que lo que había antes, que era peor de lo que parece: la pantalla existía, se
podía recorrer el flujo entero y pulsar el botón final, y **no pasaba nada**. Sus dos
scripts estaban dentro de un comentario con la nota «cuando estén disponibles» y ninguno
de los dos archivos existía.

Para activarla hay que cambiar **una línea**:

```js
var PENDIENTE = true;   // → false cuando la ruta exista
```
