# Listas — sí, renumeren

Respuesta a la oferta del final de [`listas-modulo.md`](listas-modulo.md): *«si al unificar
prefieren que las tres tengan la moneda y la hora en la misma posición, se puede
renumerar»*.

**Sí.** Aquí va la forma que pedimos, por qué esa y no otra, y qué nos cuesta a nosotros —
que es menos de lo que parece, pero toca cinco pantallas, no una.

---

## La forma que pedimos

| pos | dato | cotización | factura | pedido |
|---|---|---|---|---|
| 0 | fecha | ✓ | ✓ | ✓ |
| 1 | número con serie | ✓ | ✓ | ✓ |
| 2 | razón social | ✓ | ✓ | ✓ |
| 3 | monto total con IGV | ✓ | ✓ | ✓ |
| 4 | **moneda** | ✓ | ✓ | ✓ |
| 5 | **registrado, con hora** | ✓ | ✓ | ✓ |
| 6 | estado | ✓ | `null` | ✓ |
| 7 | editable | ✓ | `null` | `null` |
| 8 | tipo de entrega | — | ✓ | — |
| 9 | tipo de documento | — | ✓ | — |

El criterio es uno solo: **cuantos más módulos comparten un dato, más arriba va**. Las seis
primeras posiciones las tienen los tres; el estado, dos de tres; `editable`, uno; y lo que
es propio de un módulo va al final.

De ahí salen las dos cosas que pedimos de verdad:

- **La moneda pegada al monto.** El fallo que arrastraban las tres pantallas era mostrar
  soles con `$`. Tener el importe en la 3 y su moneda en la 4, siempre, hace que leer uno
  sin el otro sea raro de escribir.
- **La hora justo después.** Es el otro dato que las tres necesitan y que hoy está en tres
  sitios distintos.

### Dos peticiones concretas sobre la tabla

1. **`null` donde no aplica, no correr las posiciones.** Si facturas no tiene estado, que la
   6 venga `null`. Lo que no puede pasar es que el dato siguiente suba un puesto: eso es
   exactamente el problema de hoy.
2. **Que las ocho rutas coincidan.** Las cuatro generales y las cuatro `xdia` del mismo
   módulo, con la misma forma. Hoy lo están; conviene que siga siendo así después.

---

## Lo que nos cuesta, dicho entero

No es solo la pantalla de Listas. `/lista/cotisxdia` también es la lista de «mis
cotizaciones» que usan **Ver, Modificar, Cambiar almacén y Dar de baja** para elegir sin
teclear el número.

En el frontend las posiciones están en **dos sitios y solo dos**, cada uno una constante:

| archivo | a quién sirve |
|---|---|
| `js/listas/lista.js` | las tres listas del módulo Listas |
| `js/cotizacion/lista_dia.js` | Ver, Modificar, Cambiar almacén, Dar de baja |

Cambiar las dos es un commit corto, y hay cuatro suites automáticas que recorren esas
pantallas con un DOM real y fallan si una posición se mueve. Lo comprobamos a propósito
antes de contestar: metiendo el mapa viejo a mano, la prueba de facturas falla señalando el
importe en dólares.

Así que el coste real no es el cambio, es el **despliegue**.

---

## La condición: se despliega a la vez

Ustedes ya lo dijeron y lo repetimos porque es la única parte delicada.

**Entre que sale el backend renumerado y sale el frontend nuevo, las pantallas de hoy
mienten.** No fallan —no se cae nada, no sale un error—: muestran la moneda en el sitio del
estado y el importe con el símbolo que no es. Es el mismo tipo de fallo silencioso que el
año escrito a mano en `pedidosxdia`, y por eso no queremos que haya ni un día de ventana.

Lo que proponemos:

1. Nos avisan cuando esté renumerado en la base de pruebas.
2. Cambiamos las dos constantes, pasamos las suites y lo dejamos listo.
3. Sale backend y frontend el mismo día.

Si prefieren no abrir esa ventana, también nos vale dejarlo como está: la pantalla
unificada ya funciona con un mapa por módulo y está cubierta. **Renumerar es una mejora,
no un arreglo** — la elección es suya, y si el calendario no acompaña, no pasa nada.

---

## Lo que no pedimos

- **El rango `{desde, hasta}` no hace falta tocarlo.** Está hecho y funciona; la pantalla
  todavía ofrece solo un día suelto, y lo añadiremos cuando alguien lo pida. Queda
  apuntado como disponible para que no se vuelva a construir.
- **Los formatos de número no los tocamos.** Los tres son distintos (`009-00969930`,
  `099-00132184`, `F009-0649171`) y así se quedan: la pantalla los imprime tal cual y no
  valida ni reformatea ninguno, justo por el aviso del final de su documento.
