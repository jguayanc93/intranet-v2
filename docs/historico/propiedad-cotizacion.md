# ¿Una cotización de otro vendedor se puede abrir?

Una pregunta de autorización que afecta a cuatro pantallas y que **el frontend no puede
resolver**.

---

## La regla

Un vendedor solo debe poder ver y tocar **sus** cotizaciones. Ver, modificar, cambiar de
almacén y eliminar: ninguna de las cuatro debe funcionar sobre la cotización de otro.

El dato para decidirlo ya existe: el `codven` viaja dentro de la galleta `cdk`.

## Lo que ya está resuelto

`/lista/cotis` y `/lista/cotisxdia` **filtran por el `codven` de la galleta**. No se puede
pedir el de otro vendedor ni mandando el código. Ese camino es seguro, y por eso las
pantallas entran por ahí.

## Lo que no sabemos

Las cuatro pantallas tienen además **un campo para escribir el número a mano**, porque una
cotización de la semana pasada no sale en la lista del día. Y ahí nada garantiza que el
número tecleado sea de quien lo teclea.

`login-y-modulos.md` dice que el `codven` «es con el que el backend valida que una
cotización sea del vendedor que la pide», pero solo nombra `/promocion/acoplar` y
`/promocion/eliminar`.

**Preguntas, una por ruta:**

| ruta | ¿rechaza la cotización de otro vendedor? |
|---|---|
| `POST /cotizacion/read` | ? |
| `POST /cotizacion/update` | ? |
| `POST /cotizacion/almacen` | ? |
| la ruta de eliminar, cuando la tengamos | ? |

Si alguna responde que no, un vendedor puede teclear números hasta dar con cotizaciones de
sus compañeros: precios, clientes y márgenes. Con `/update` o `/almacen`, además,
modificarlas.

## Por qué no lo arreglamos en el frontend

Podríamos comparar el vendedor de la cotización contra el usuario y ocultar los botones.
**No serviría de nada.** Para comparar hay que haber recibido ya la cotización, así que
los datos estarían en el navegador; ocultar un botón después es teatro. Y la petición de
guardar se puede repetir desde la consola en diez segundos.

Es el mismo principio que venimos aplicando en todo el módulo: **el frontend pinta lo que
le dan y el backend decide quién puede qué**. Si `/cotizacion/read` entrega la cotización,
ya se entregó.

## Qué cambió el frontend por esto

**Las cuatro pantallas entran ahora por la lista**, que es el único camino con la
propiedad garantizada. Antes `Cambiar almacén` solo tenía un campo para teclear el
número; ahora ofrece la lista y el campo queda plegado debajo.

| pantalla | antes | ahora |
|---|---|---|
| Ver | número a mano | lista + número plegado |
| Modificar | número a mano | lista + número plegado |
| **Cambiar almacén** | **solo número** | **lista + número plegado** |
| Eliminar | número a mano | pendiente de migrar |

La lista vive en un solo archivo, `js/cotizacion/lista_dia.js`, compartido por las tres.
Estaba escrita dos veces y a punto de escribirse una tercera.

**Las que escriben filtran además por estado.** `Modificar` y `Cambiar almacén` solo
ofrecen las que están en `cotizado`: a una facturada o convertida en pedido ya no se le
cambia nada, y ofrecerla sería dejar que el vendedor haga el trabajo para que el backend
lo rechace. `Ver` sí las muestra todas, porque reimprimir el PDF de una ya facturada es
justo lo que un cliente suele pedir.

**Si el backend rechaza, se muestra su mensaje tal cual y no se reintenta:** no es un
fallo que se arregle insistiendo.

Para ese último caso hace falta saber **con qué `status` responde**. Si es el mismo que
usa para una cotización que no existe, el vendedor leerá «no existe» cuando en realidad es
«no es tuya», y va a llamar a sistemas a preguntar por una cotización que sí está ahí.

**Pregunta:** ¿hay un `status` propio para «no es de este vendedor»?
