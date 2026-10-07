# Modificar cotización — una pregunta

La pantalla **Modificar cotización** se está migrando. El contrato de sus cuatro rutas
se mantiene **exactamente igual**: `/cotizacion/read`, `/producto/buscar`,
`/producto/encontrado` y `/cotizacion/update` reciben y devuelven lo mismo que hoy.

Solo hace falta un dato nuevo, y es en la lista.

---

## La pregunta: el `flag` en la lista

Los vendedores piden entrar desde **la lista de sus cotizaciones del día** en vez de
teclear el número, igual que en Ver cotización. Pero aquí hay una regla que allá no
existe:

> Una cotización **aprobada** (`flag = 1`) no se puede modificar. Ya fue aceptada en
> otras tablas. Para tocarla hay que desaprobarla primero, y eso **no se hace desde esta
> pantalla**, sino por otro lado.

La lista de `/lista/cotisxdia` devuelve el **estado** en la posición 4 —`cotizado`,
`facturado`, `boleta`, `pedido`— pero no el `flag`. Son cosas distintas: una cotización
puede estar en estado `cotizado` y aun así estar aprobada.

**Pregunta:** ¿puede la lista devolver el `flag` en una **posición nueva al final** —la
7— o, mejor aún, un booleano ya resuelto del tipo `modificable`?

Un booleano sería preferible: la condición real es `flag = '0' AND estado = '0'` según
`promociones.md`, y resolverla en el backend evita que el frontend reimplemente una regla
de negocio que puede cambiar.

### Mientras tanto

La pantalla filtra por lo que sí tiene: **solo ofrece las que están en estado
`cotizado`**, de modo que facturadas, boletas y pedidos no aparecen.

Una aprobada que siga en estado `cotizado` **sí se colaría**. Si el vendedor la abre e
intenta guardar, `/cotizacion/update` la rechazará; la pantalla muestra ese rechazo
explicando que hay que desaprobarla primero y que eso se hace fuera de aquí.

Funciona, pero es peor experiencia: el vendedor descubre el problema después de haber
hecho el trabajo. Con el `flag` en la lista, ni siquiera la ve.

**Pregunta relacionada:** ¿con qué `status` responde `/cotizacion/update` cuando la
cotización está aprobada? Si tiene uno propio, la pantalla puede dar el mensaje exacto en
vez de uno genérico.

---

## Lo que no cambia

Para que conste, porque esta pantalla se reescribe entera por dentro:

| ruta | qué envía | sin cambios |
|---|---|---|
| `POST /cotizacion/read` | `{ ncoti }` | sí |
| `POST /producto/buscar` | `{ sugerencia, tipbusq }` — **sin `letra`**, a propósito | sí |
| `POST /producto/encontrado` | `{ sugerencia, cctl, ccli }` | sí |
| `POST /cotizacion/update` | `{ item: { … } }` | sí |

> La búsqueda va sin `letra` porque aquí es de dos pasos: primero se encuentra el
> producto y después `/producto/encontrado` trae su precio para ese cliente. Lo
> comprobamos al migrar; no es un olvido.

El objeto `item` sigue siendo el mismo: las claves son códigos de producto y cada valor
es el arreglo de **22 posiciones** que corresponde a las posiciones 1-22 de
`/cotizacion/read`, saltándose la 0. Se conserva tal cual.
