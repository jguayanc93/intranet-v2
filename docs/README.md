# Documentación

## Cómo está montado el frontend

- **[arquitectura.md](arquitectura.md)** — El núcleo compartido: plantilla de página,
  peticiones al backend, permisos, tipos de vendedor y catálogo de módulos. Es lo que hay
  que leer antes de tocar `core/`.

## Contratos con el backend

Lo que cada ruta recibe y devuelve. Son la fuente a la que acudir cuando algo no cuadra,
y están escritos contra el código, no de memoria.

- **[login-y-modulos.md](login-y-modulos.md)** — Del usuario y contraseña hasta la lista
  de módulos: las dos galletas, el direccionador y qué hacer con cada código de error.
- **[crear-cotizacion.md](crear-cotizacion.md)** — Las ocho llamadas de *Crear
  cotización*, con lo que se envía y lo que se espera recibir en cada una.
- **[ver-cotizacion.md](ver-cotizacion.md)** — La lista del día y las tres posiciones que
  el detalle añadió para el documento del cliente.
- **[promociones.md](promociones.md)** — `/v1/promocion` entera: los cuatro ejes, las ocho
  combinaciones y las trampas de `montoDescuento`.
- **[listas-modulo.md](listas-modulo.md)** — El contrato de las ocho rutas, ya
  **renumerado**: las seis primeras posiciones son idénticas en las tres listas, con la
  moneda pegada al monto. Trae lo que vale cada posición, lo que aceptan las rutas, y los
  dos fallos que aparecieron al revisarlas — uno de ellos llevaba desde enero sirviendo
  pedidos del año pasado como si fueran los de hoy.
- **[factura.md](factura.md)** — Las nueve rutas del módulo. `/factura/campos` devuelve
  los siete campos editables de una vez **con nombres, no con posiciones**, más un bloque
  `puede` que dice cuáles permite cambiar el grupo de quien pregunta. Las cinco rutas de
  opciones filtran con `LIKE` y devuelven cinco. Documenta además dos agujeros que
  cerraron por el camino: el guardado no comprobaba de quién era la factura, y la matriz
  de permisos no se aplicaba en ninguna de las quince rutas.
- **[pedido.md](pedido.md)** — Las tres rutas del módulo: `/pedido/mostrar` con sus
  catorce posiciones, `/pedido/flete` con sus siete respuestas —incluida la que dice
  cuánto falta para llegar al mínimo— y `/pedido/almacen`, que es nueva. Explica además
  qué es el flete: un descuento del 0,4 % que aplica un trigger del ERP a siete
  departamentos.
- **[cuota-registrar.md](cuota-registrar.md)** — El contrato de `POST /cuota/update`. El
  campo del monto se llama **`fijado`**, y mandarlo con otro nombre daba «el monto debe ser
  mayor que cero», que mandaba a buscar el fallo al formulario. Trae los cuatro `status` de
  error, ya separados, y el flujo completo desde `/cuota/mostrar`.
- **[cuota.md](cuota.md)** — Trece rutas, no siete: `/cuota/mostrar` es un **GET que
  redirige** según el tipo de vendedor. Documenta que no haber registrado la cuota es un
  estado normal con `debeRegistrar` y no un 500, que el registro es una vez al mes y ahora
  lo hace cumplir el servidor, y los cuatro campos que reemplazan a los segmentos 2 y 3:
  cuánto falta, el ritmo contra el cierre habitual, lo que restan las notas de crédito y a
  qué clientes llamar. Trae además las 61 frases y por qué los segmentos viejos se leían al
  revés.
- **[promocion-modulo.md](promocion-modulo.md)** — El módulo entero. `/promocion/revisar`
  devuelve qué promociones alcanzan a una cotización, `/promocion/acoplar` toma
  `{ndocu, nprom}` y **calcula los importes en el servidor** —antes insertaba las líneas que
  mandara el navegador—, y `/cotizacion/readprom` distingue por fin una cotización en soles
  de una sin promociones. Dice además que `/coti/buscar` y `/prom/verificar`, que el
  frontend llamaba, **no existen**.
- **[clientes.md](clientes.md)** — Clientes entero: la lista y el detalle. Los dos valores
  de `tipo` —`cartera` y `cobertura`, no los que se habían supuesto— y, sobre todo, qué
  distingue de verdad las dos vistas: **no es «asignados contra no asignados»**, es qué
  vendedor de la factura se mira, y las dos se solapan. Trae también las tres piezas del
  detalle y las tres correcciones al procedimiento.

- **[marcas-grupo25.md](marcas-grupo25.md)** — El contrato del grupo 25 (jefaturas y
  especialistas), escrito por el backend: el registro con marcas, el menú y las siete rutas
  de `/v1/marcas`. Dice cómo funciona el negocio —una marca, un dueño al mes; el especialista
  confirma y queda bloqueado, la jefatura no— y qué hacer con cada `omitidas`. Se actualizó
  el 16/10 con las respuestas a nuestras dudas (sección 9). **Lo que declara pendiente**
  (el menú por tipo; la cuota por marca ya está hecha) no está construido a propósito.
- **[reportes-grupo25.md](reportes-grupo25.md)** — Los reportes por marca, **ya hechos por el
  backend**: `GET /reporte/marca` con las marcas que se pueden consultar y **cuatro informes**
  —stock, tiempo en almacén, lista de precios y **guías**— que se piden con `{ codmar, formato }`
  y responden JSON o Excel. Define qué marcas ve cada tipo, cómo se calcula el «disponible» y
  los días de tiempo en almacén, qué guías entran (remisión y notas de despacho, sin anuladas,
  una fila por producto, hasta 3 meses) y qué cambia respecto a la pantalla antigua (que
  calculaba mal el tiempo de 2026). Trae también las cuentas de prueba de bdnava08.
- **[cuota-grupo25.md](cuota-grupo25.md)** — La **cuota por marca** del grupo 25: `GET
  /cuota/marcas` con la meta, el avance, el cumplimiento y la proyección de cada marca, y `POST
  /cuota/marcas/meta` para fijarla. Solo la fija el dueño de la marca y solo tras confirmar sus
  marcas; la jefatura ve además el general de cada especialista (`porDueno`). El avance son las
  ventas de la marca **de toda la empresa**, no las del usuario. Reemplaza, para el grupo 25, las
  cinco rutas antiguas de cuota por marca. **La pantalla ya está construida**; falta recorrerla
  contra bdnava08. Se actualizó el 20/10 con sus respuestas: el cumplimiento del total cuenta
  solo las marcas con meta (`conMeta`), `proyeccion.cumplimiento`, una meta no puede ser 0,
  `/cuota/mostrar` redirige al grupo 25 (con CORS en el `302`), `/cuota/revisar` le responde
  `cuota por marca`, meses anteriores (hasta dos atrás, solo lectura) y `metaMesAnterior` para
  precargar el formulario.
- **[cobertura-grupo25.md](cobertura-grupo25.md)** — La **cobertura de clientes por marca** del grupo 25:
  `GET /cobertura/marcas` (cada marca con cuántos clientes la compraron, unidades y venta, y un total de
  **clientes distintos**) y `GET /cobertura/clientes?codmar=` (los clientes de una marca, por venta). Un cliente es
  uno al que le **quedaron unidades** compradas; quien solo devolvió sale en negativo y no cuenta. Misma regla de
  venta que la cuota, mes en curso y dos anteriores. **No es la cobertura del grupo 20** (`/cuota/cobertura`).
  Se actualizó el 21/10 con nuestras respuestas: `/clientes` sin tope (máximo real 636), `columnas`, **exportar a Excel**
  (`&formato=xlsx`), `formato invalido`, y que un 0 en `unidades` no siempre es «devolvió todo». **La pantalla ya está
  construida**; falta recorrerla contra bdnava08.
- **[vendedor-mes-grupo25.md](vendedor-mes-grupo25.md)** — El **vendedor del mes** del grupo 25: `GET
  /vendedormes/top` con, de cada marca, **los 3 vendedores del grupo 20 que más la vendieron** (puesto, venta,
  `participacion`, unidades, clientes) y su **tendencia** frente al mes anterior (`sube`, `baja`, `igual`, `nuevo`).
  Solo el mes en curso y el anterior (`400 mes no disponible`). **`total.venta` no es el avance de la cuota**: es solo lo que
  vendieron los vendedores del grupo 20 **con venta mayor que 0**. Se actualizó el 22/10 con nuestras respuestas: **desempate**
  fijo (venta, unidades, clientes, código), **solo venta neta mayor que 0** y `ventasHasta`. **La pantalla ya está construida**;
  falta recorrerla contra bdnava08.
- **[despliegue-grupo25.md](despliegue-grupo25.md)** — **Antes de subir** los módulos del grupo 25: que el «servidor de prueba» es
  el **del backend** (solo acepta `http://127.0.0.1:8080`, así que el frontend se prueba en local y no se sube a otro sitio), las
  tres comprobaciones previas (`todas.js`, `dev/revisar-despliegue.js` y `git status`), la **lista de rutas** de las que ahora
  depende el frontend —y por qué backend y frontend salen el mismo día—, el recorrido con una cuenta de cada tipo, y lo que el
  repositorio no dice (cómo llega el código a producción).
- **[servidor-prueba-grupo25.md](servidor-prueba-grupo25.md)** — Cómo **probar contra el servidor
  de prueba** del backend (bdnava08): qué tiene que cumplirse (CORS para `http://127.0.0.1:8080`,
  **https**, una dirección **bajo `compudiskett.com.pe`**, `credentials: 'include'`), las
  cabeceras reales que devuelve y cómo se ve cada falla. La dirección y las claves de las cuentas
  las pasa quien coordina.
- **[ajuste-precios.md](ajuste-precios.md)** — El **ajuste de precios**: el vendedor (grupo 20) envía una
  cotización o pedido para que el dueño de la marca —o la jefatura de su familia— le ajuste el
  precio, y se lo devuelve. Una solicitud por responsable, con solo las líneas de sus marcas; al confirmar,
  el descuento de la línea pasa a 0, se **quitan todas las promociones** del documento y el precio no puede
  quedar bajo el costo; a los 3 días vence. Siete rutas (con la **vista previa**), y lo que cambia en cotización,
  pedido y promoción mientras hay una pendiente (`409 documento en ajuste`). **Construido por las dos puntas, como módulo
  aparte (`ajuste`).** Se actualizó el 21/10 —dos rondas— con nuestras respuestas: `GET /ajuste`, `precioMinimo` (el costo, con hasta
  4 decimales, redondeado hacia arriba), `precioNeto`, filtros `desde`/`hasta`, las pendientes se **cierran al leer**,
  `ajustesPendientes` en `/vendedor` (solo lo que se puede responder), la lista de pedidos con los `sin aprobar`,
  `400 fechas invalidas` y el precio **redondeado al céntimo, la mitad hacia arriba**.

## Lo que está esperando a salir

> **El renumerado de listas está en la base de pruebas, no en producción.** Nuestras dos
> constantes ya están cambiadas y las suites en verde, así que de este lado está listo.
> **Backend y frontend tienen que salir el mismo día**: en la ventana entre uno y otro las
> pantallas no fallan —no se cae nada, no sale ningún error—, muestran la moneda en el
> sitio del estado y el importe con el símbolo que no es. Es el mismo tipo de fallo
> silencioso que el año escrito a mano en `pedidosxdia`, y por eso no queremos ni un día
> de ventana. Avisar al backend de que pueden salir.

## Preguntas abiertas

Cosas que el frontend no puede resolver solo. Se archivan cuando se respondan.

- **Quitar promociones de un pedido.** No existe `/pedido/readprom` y `/promocion/eliminar`
  nombra las tablas de cotización en sus consultas, así que hoy no se puede. El backend dice
  que construirlo no es grande; le contestamos en qué estados debería permitirse. Está en
  [respuesta-promocion.md](respuesta-promocion.md).
- **[programador.md](programador.md)** — **Sin prisa**: la única acción del módulo queda
  para más adelante, así que esto es para cuando se retome. Lo que habrá que preguntar
  entonces es qué hay en dos de las posiciones que la pantalla pinta, `[2]` como título y
  `[3]` sin etiqueta. Deja escritos cuatro hallazgos antes de que se olviden: el campo de
  número y su botón **no tienen listener**, el límite de fechas se descarta en silencio
  nueve meses al año por un cero que falta, al programar sin elegir fecha se manda
  `2026-10-6`, y un día tranquilo se ve igual que un fallo de red.
- **La lista de almacenes destino.** El backend dice que para pedido valen «`01`, `08`,
  `15`, `16`, entre otros». Ese «entre otros» deja el desplegable sin lista cerrada, así
  que hoy ofrece solo `01` y `08` — lo que venimos arrastrando sin confirmar desde la
  pantalla de cotización. Las dos comparten catálogo, así que una respuesta vale para las
  dos. Está en [respuesta-pedido.md](respuesta-pedido.md).
- **La cabecera de `/pedido/mostrar`.** Sin ella la pantalla suma las líneas, y los
  totales los gobierna un trigger del ERP: la suma va a discrepar. Está pedida.

- **[respuesta-marcas.md](respuesta-marcas.md)** — Para el backend: lo construido del grupo
  25, **qué campos lee el frontend de cada ruta y cuáles no**, las decisiones que tomamos por
  nuestra cuenta, y cómo cerramos cada una de las siete dudas que contestaron. Queda una
  decisión **nuestra**: avisar al salir de la pantalla con una lista sin confirmar.
- **[respuesta-reportes.md](respuesta-reportes.md)** — El **seguimiento de Reportes**, para el
  backend: qué hicimos con cada una de sus respuestas (las cuatro aclaraciones y las Guías,
  ya construidas), **la dirección que piden para el CORS** (`http://127.0.0.1:8080`, no
  `localhost`), lo que necesitamos para llegar a su servidor de prueba —sobre todo las
  cookies— y los casos que recorreremos contra bdnava08. Una pregunta pequeña: los códigos de
  almacén de las guías.
- **[respuesta-cuota-marcas.md](respuesta-cuota-marcas.md)** — Para el backend: **cómo quedó
  cada una de sus respuestas** a nuestras cinco preguntas y dos sugerencias (todas aplicadas),
  dos decisiones nuestras, lo que cumplimos de su documento del servidor de prueba, **lo que
  falta —la dirección y las claves—** y los casos que recorreremos contra bdnava08. Con su segunda
  respuesta, **la pantalla ya no mira el tipo de `/vendedor` en ningún sitio de la cuota**: la
  ruta y «Registrar» las decide lo que responde el backend.
- **[respuesta-ajuste-precios.md](respuesta-ajuste-precios.md)** — Para el backend: **cómo leímos el ajuste de
  precios** y qué hace cada pantalla de las dos puntas (pedir ajuste y mis ajustes, recibidas y ajustar),
  **tercera ronda (21/10)**: qué hicimos con cada una de sus respuestas a los diez puntos (el costo con sus
  decimales y el mínimo, `precioNeto`, el filtro por fecha, los pedidos en el paso 1, el numerito del menú…) y a las tres
  preguntas de la segunda ronda (el contador, `fechas invalidas`, el redondeo), **sin nada abierto**, y cómo recorrerlo
  contra bdnava08 sin gastar solicitudes reales.
- **[respuesta-vendedor-mes.md](respuesta-vendedor-mes.md)** — Para el backend: **cómo leímos el vendedor del mes**
  (una sola pantalla, sin hub; el top de cada marca con su tendencia leída por texto; menos de 3 o ninguno; un vendedor sin
  `tipo`; **el aviso de que el total no es el avance de la cuota**), **sus respuestas a las dos preguntas y a la sugerencia de
  `ventasHasta`**, ya reflejadas (queda solo la del `?top=`, que va en su próxima versión) y los casos que recorreremos contra
  bdnava08.
- **[respuesta-cobertura.md](respuesta-cobertura.md)** — Para el backend: **cómo leímos la cobertura de clientes**
  (una sola pantalla, sin hub; que el total de clientes son distintos y la pantalla lo explica; quien solo devolvió o
  quedó en cero; los 100 primeros y «Mostrar los N restantes»; **exportar a Excel**), **sus respuestas a las tres
  preguntas y a la sugerencia**, ya reflejadas, y los casos que recorreremos contra bdnava08.

### Ya resueltas

> **Cuota queda cerrado para cobertura y cartera**, que son los únicos tipos a los que se
> les ha cargado una meta: 36 y 12 en todo el histórico, y ninguna para jefatura, zona, hp
> ni especialista. Esos cuatro reciben ahora `cuota no corresponde` con 200, y la pantalla
> lo explica en vez de enseñar un error.
>
> La vista del **especialista** queda documentada en [cuota.md](cuota.md) —la forma de
> `multiple`, la meta por marca y la guarda que todavía le falta a `/marcaupdate`— pero sin
> construir, y con un aviso del propio backend: esa funcionalidad **casi no se ha
> estrenado**, así que merece decidir qué enseñarle a un especialista antes que migrar
> fielmente algo que nadie usa.

> **Factura queda cerrado.** Las dos preguntas que dejamos abiertas están decididas y
> aplicadas —dirección sin tope, y contactos solo de clientes con los que el vendedor tiene
> factura— y las cuatro peticiones concedidas: el `total` de las listas con tope, la razón
> social del cliente, el nombre `transporte` unificado en los tres sitios, y el formato de
> atención confirmado sobre 26 025 facturas. Ningún documento del módulo tiene nada
> pendiente.

> **Los cuatro campos rotos de factura ya funcionan.** Tres pedían a `127.0.0.1` y el de
> dirección tenía la llamada comentada. Era fallo nuestro, no del backend, y se arregló al
> migrar el módulo. De paso, `caminos/rutas.js` dejó de tener **ninguna** ruta apuntando al
> equipo del vendedor: eran veintisiete contando las que usaban la constante `desarrollo`.

> **El grupo 20 ya puede dar de baja** (corregido en el backend). Los 22 vendedores que no
> podían dar de baja lo suyo ya pueden. La pantalla no necesitaba nada: lee los permisos
> del backend, así que basta con que la matriz sea correcta. El documento está en
> [historico/permisos-dar-de-baja.md](historico/permisos-dar-de-baja.md).

> `jc_lista_clientes.sql` ya está en producción (5 de octubre de 2026), con sus tres
> correcciones. Las cifras de `cartera` y `cobertura` que ven los vendedores cambian a
> partir de ahí: la cobertura pasa de mostrar una fracción a mostrarlo todo, y la cartera
> deja de contar ventas hechas cuando el cliente aún era de otro. Están explicadas en
> [clientes.md](clientes.md).

## Lo que les hemos contestado

Las dos tandas de preguntas de arriba ya tienen respuesta nuestra. Están esperando a que
el backend las lea.

- **[listas-renumerar.md](listas-renumerar.md)** — **Aceptado y aplicado**, se conserva
  porque explica *por qué* el orden es ese: cuantos más módulos comparten un dato, más
  arriba va, y la moneda pegada al monto para que leer uno sin el otro sea raro de
  escribir. El contrato manda en [listas-modulo.md](listas-modulo.md); esto es el
  razonamiento.
- **[respuesta-cuota.md](respuesta-cuota.md)** — Las cuatro que dejaron abiertas: que se
  quede `marcarevisar`, que `jefatura`/`hp`/`zona` respondan un `status` propio en vez de un
  404, que `/cuota/desechar` se retire —lista cosas ya vendidas sin meta contra la que
  compararlas— y que las frases se queden. Pide además la forma de `multiple`, que es lo
  único que falta para cerrar el módulo.
- **[respuesta-promocion.md](respuesta-promocion.md)** — Las dos que dejaron abiertas: que
  quitar de un pedido siga la misma regla que el flete —solo con `flag='0'`, sin apoyarse en
  un `apro` que nadie sabe leer— y que sí cuenten los descuentos históricos calculados por
  el navegador, con cuántos difieren y cuánto suma la diferencia.
- **[respuesta-factura.md](respuesta-factura.md)** — **Contestado y aplicado.** Las dos que
  dejaron abiertas y cuatro peticiones nuestras, todas concedidas. Se conserva porque
  explica *por qué* dirección es el único campo sin tope, y por qué el código de cliente no
  se enseña aunque se use por dentro.
- **[respuesta-pedido.md](respuesta-pedido.md)** — Las tres que dejaron abiertas: que
  `apro` no nos bloquea porque la pantalla ya no lo interpreta, que sí queremos la
  cabecera con los totales, y que el mensaje de pedido inexistente conviene alinearlo.
  Explica también qué se hizo con lo que mandaron.
- **[respuesta-clientes.md](respuesta-clientes.md)** — **Ya contestado y cerrado**, se
  conserva porque explica *por qué* `reponer` es como es: la mediana en vez del promedio,
  el mínimo de tres compras, los doce meses de ventana frente a los tres del top, y por qué
  la pantalla dice «suele pedir» y nunca «va a comprar». El contrato manda en
  [clientes.md](clientes.md); esto es el razonamiento.

## Respuestas del backend

- **[baja-cotizacion.md](baja-cotizacion.md)** — La ruta de dar de baja, los siete
  `status` que devuelve, y la posición 7 `editable` que permite dejar de ofrecer las
  cotizaciones aprobadas.
- **[autorizacion-cotizacion.md](autorizacion-cotizacion.md)** — Tres rutas entregaban la
  cotización de cualquier vendedor y una dejaba reescribirla. Ya está cerrado; se conserva
  porque explica qué valida cada ruta ahora y por qué el 403 no distingue «no existe» de
  «no es tuya».
- **[respuesta-crear-cotizacion.md](respuesta-crear-cotizacion.md)** — La contestación a
  `crear-cotizacion.md`. Se conserva porque explica **por qué** varias cosas son como son:
  el stock de Piura que venía de Chorrillos, el trigger del ERP que gobierna los totales,
  y la conversión de moneda que estaba rota.

## Por módulo

- **[promociones/](promociones/)** — Siete documentos sobre el módulo de promociones y el
  cálculo del segmento 3, anteriores a la reestructuración. Útiles para entender la
  intención; para el contrato, manda `promociones.md`.

  Ojo con una confusión fácil: [promociones.md](promociones.md) documenta el **motor** de
  promociones que usa *Crear cotización*. Las pantallas del módulo `promocion/` llaman a
  otras rutas, y van en [promocion-modulo.md](promocion-modulo.md).

## Histórico

- **[historico/](historico/)** — Documentos que ya no describen el código actual:
  resúmenes de trabajos anteriores, el README previo, la guía de pruebas manuales que
  apuntaba a `test-api.html` (borrado), la de avisos de factura (el sistema actual es
  `CDK.toast`), la estructura de productos sin los campos de Piura, y las preguntas de
  *Ver cotización* que `ver-cotizacion.md` ya respondió.

  Ahí están también las dos tandas de preguntas sobre listas y clientes, ya contestadas por
  `listas-modulo.md` y `clientes.md`. Conviene no leerlas como descripción del contrato:
  casi todo lo que daban por supuesto resultó ser de otra manera.

  Se conservan como registro, pero **no son fuente fiable sobre el código actual**.

---

## Las pruebas ya no son manuales

La guía de pruebas manuales se archivó porque dejó de hacer falta. Hay **dieciocho suites
automáticas**, una por módulo migrado, en **[`dev/pruebas/`](../dev/pruebas/)**:

```
cd dev/pruebas
npm install          una sola vez: lo único que hace falta es jsdom
node todas.js        las dieciocho, con un resumen
```

Diecisiete de las dieciocho **cargan el HTML real con sus scripts reales** en un DOM y los accionan
como lo haría un vendedor. Existen porque las comprobaciones unitarias no vieron un fallo
que sí se notaba pulsando.

Lo que cubre cada una está en [`dev/pruebas/README.md`](../dev/pruebas/README.md), junto
con cómo escribir una nueva y dos cosas que han demostrado valer la pena: comprobar que una
prueba falla cuando debe, y poner siempre algún importe en soles.
