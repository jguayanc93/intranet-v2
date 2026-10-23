# CDK · Intranet de ventas (frontend)

Portal interno para la fuerza de ventas: cotizaciones, pedidos, facturas, promociones,
cuota, listados y programación de despacho.

Esto es **solo el frontend**. El backend vive en otro proyecto y se consume por HTTP.

- **Sin build.** HTML estático, JavaScript clásico y CSS plano. No hay `package.json`,
  ni npm, ni bundler. Lo que ves en el repositorio es lo que se sirve.
- **Sesión por cookie `HttpOnly`.** El JavaScript no puede leerla; toda petición va con
  `credentials: "include"` y el backend responde 401 cuando caduca.
- **El backend es la única autoridad.** El frontend pinta lo que recibe y nunca decide
  qué puede hacer alguien.

---

## Levantarlo en local

Hace falta un servidor HTTP: abrir los archivos con `file://` no funciona, porque las
peticiones al backend necesitan un origen real.

**Sírvelo desde la raíz**, no desde un subdirectorio. El proyecto usa rutas absolutas
(`/core/…`, `/js/…`), así que bajo `/demo1/` se romperían.

Cualquier servidor estático vale. Con Apache o XAMPP, apunta un *virtual host* a la
carpeta del proyecto y entra por `http://127.0.0.1/`.

> Usa **127.0.0.1**, no `localhost`. El backend tiene configurado ese origen en CORS y
> para el navegador no son lo mismo.

El entorno se detecta solo por el nombre del host: en `127.0.0.1` o `localhost` se apunta
a la API de desarrollo, y en cualquier otro a la de producción. No hay que tocar nada al
desplegar.

### Comprobar que todo responde

Abre **`/dev/diagnostico.html`**. Verás el entorno detectado, el estado de la cookie de
sesión y una prueba de cada endpoint. También revisa `caminos/rutas.js` y señala las rutas
que apuntan a `127.0.0.1` aunque se sirvan en producción.

**`/dev/shell-demo.html`** muestra el armazón y los componentes con datos simulados, sin
necesidad de backend.

### Probar sin backend

```
node dev/servidor.js          sirve el frontend en :8080 y una API simulada en :3000
```

Abre `http://127.0.0.1:8080/`. El usuario que escribes en el login decide quién eres; la
contraseña es cualquiera de 4 o más caracteres. Al arrancar, el servidor imprime esta misma
lista.

| usuario | qué pasa |
|---|---|
| `nuevo25` | Grupo 25 sin registrar: va al formulario de alta. Pedir **Jefatura** le da 403. |
| `nuevajefa25` | Grupo 25 sin registrar, cargada como jefatura: queda **Jefatura** aunque elija Especialista. |
| `especialista25` | Especialista registrado que aún no confirmó sus marcas: ve el borrador. **No tiene marcas, así que en Reportes ve el aviso de «sin marcas».** |
| `confirmado25` | Especialista que ya confirmó: sus marcas, en solo lectura. **Tiene dos marcas (EP_IMPRESORAS y TDK): sirve para probar Reportes, la Cuota por marca, la Cobertura, el Vendedor del mes y el Ajuste de precios** (le llegan dos solicitudes pendientes y cuatro ya respondidas). TDK parte de la meta del mes pasado al fijar la suya. |
| `pendiente25` | Especialista con una marca que le dio la jefatura y sin confirmar: en Reportes la ve, pero en Cuota **no le deja fijar la meta** y le lleva a Marcas. |
| `jefatura25` | Jefatura registrada: ve el panel de su familia. En Reportes ve las suyas y las de sus especialistas de su familia. En Ajustes recibe, además de lo suyo, lo de las marcas sin dueño de su familia. |
| `vendedor20` | **Del grupo 20**, no del 25: un vendedor que pide ajustes de precio y ve sus respuestas. Sin marcas ni reportes. Sirve para ver el otro lado de Ajustes: puede enviar la cotización `009-00970001` (tres responsables, una línea sin dueño y dos promociones) o el pedido `009-00775010`, en soles. |
| `zona126` | **Del grupo 34**, jefe de zona (el usuario 126): su menú es solo Cotización, **Avance** y **Probabilidad**; ve el avance de la cuota de todo el grupo 20 y la probabilidad de cada vendedor. |
| `zona297` | Jefe de zona **sin acceso** (el usuario 297): el login responde 403 `usuario sin acceso` y no entra. |
| `random25` | Uno de los seis anteriores, al azar, con un nombre inventado. |
| `malo` | Contraseña incorrecta. |
| cualquier otro | Especialista ya registrado. Con `TIPO=JEFATURA node dev/servidor.js`, jefatura. |

El menú de la demo depende del grupo, como en el backend (desde el 21/10): el 25 recibe **exactamente**
`marcas`, `cuota`, `reporte`, `cobertura`, `ajuste`, `vendedormes` y `cotizacion` —ni factura, ni promoción, ni
programador, ni pedido ni listas—, y el 20 recibe lo suyo más `ajuste`, pero no lo que es solo del 25 (`marcas`,
`reporte`, `cobertura`, `vendedormes`). La tarjeta de **Ajustes** lleva un numerito rojo con lo que espera respuesta (`ajustesPendientes`
de `/vendedor`) que baja al responder.

Hay **una sola sesión para todo el servidor**, no una por navegador: no hay cookies. Cada
ingreso deja al usuario y sus marcas como al empezar, así que se puede repetir el alta sin
reiniciar nada. La definición está en [`dev/usuarios-prueba.js`](dev/usuarios-prueba.js).

### Probar contra el servidor de prueba del backend

Para recorrer lo construido con datos reales (base bdnava08), la pantalla se puede apuntar al servidor
de prueba **sin tocar código**. Lo que exige el backend está en
[docs/servidor-prueba-grupo25.md](docs/servidor-prueba-grupo25.md); la dirección y las claves de las
cuentas las pasa quien coordina.

1. Arranca `node dev/servidor.js` (solo para servir las páginas) y abre **`http://127.0.0.1:8080/`**.
   Ese origen exacto: ni `localhost` ni la IP de red, o el navegador bloquea las respuestas.
2. En la consola del navegador, una sola vez:
   `localStorage.setItem("cdk.api", "https://<dirección del servidor de prueba>")` y recarga.
   La consola avisa «La API apunta al servidor de prueba».
3. Entra con una de las cuentas de prueba del backend.
4. Para volver al simulador: `localStorage.removeItem("cdk.api")`.

Solo funciona en desarrollo y solo acepta **https** bajo `compudiskett.com.pe` (es lo que sus cookies
exigen); en producción no existe.

---

## Estructura

```
core/           Núcleo compartido. Se carga en todas las páginas.
                Ver docs/arquitectura.md

index.html      Inicio de sesión
main.html       Panel principal
configuracion.html
<modulo>.html   Un hub por módulo (cotizacion, factura, cuota, …)

<modulo>/       Las pantallas de trabajo de cada módulo
js/<modulo>/    Su JavaScript
styles/         CSS heredado de pantallas aún sin migrar
caminos/        Constantes de endpoints (heredado; ver docs/arquitectura.md)
dev/            Herramientas de desarrollo. No forman parte del producto.
dev/pruebas/    Las diecinueve suites automáticas
docs/           Documentación
```

La navegación tiene tres niveles: **panel → hub del módulo → pantalla de trabajo**.
El hub no es un menú decorativo: pregunta al backend qué acciones tiene permitidas esa
persona y solo pinta esas.

---

## Añadir una página

Toda página declara qué es en el `<body>` y el armazón se monta solo. No se escribe la
barra superior, ni el menú lateral, ni la barra inferior.

```html
<body data-modulo="cotizacion" data-titulo="Crear Cotización">
```

El bloque de `<script>` del núcleo tiene un orden obligatorio.
Está detallado, con la plantilla completa, en **[docs/arquitectura.md](docs/arquitectura.md)**.

---

## Las pruebas

```
cd dev/pruebas
npm install          una sola vez: lo único que hace falta es jsdom
node todas.js        las diecinueve suites, con un resumen
```

Dieciocho de las diecinueve cargan las páginas reales en un DOM y las accionan. `node todas.js` sale
con código 1 si alguna falla. Ver [`dev/pruebas/README.md`](dev/pruebas/README.md).

Antes de subir, además: `node dev/revisar-despliegue.js` comprueba que lo que se sirve está completo y no lleva restos (ningún archivo
que falte o que sea de `dev/`, ni `debugger`, ni direcciones escritas a mano). La guía —incluido cómo probar contra el servidor
de prueba del backend y por qué backend y frontend salen el mismo día— está en
[docs/despliegue-grupo25.md](docs/despliegue-grupo25.md).

> El `package.json` de ahí dentro es la **única** concesión a npm en todo el proyecto, y
> está en su propia carpeta a propósito: lo que se despliega sigue sin build y sin
> dependencias.

---

## Desplegar

Copiar los archivos al servidor, en la raíz del dominio. No hay paso de compilación.

**Excluye `dev/` y `docs/`.** Ninguna página de producción los enlaza, así que no rompe
nada, y conviene por dos razones:

- `docs/` publicaría el contrato entero del backend en una URL pública: qué valida cada
  ruta, cómo funcionan las cookies de sesión, qué permisos gobiernan cada acción. Está
  escrito para leerse dentro.
- `dev/` lleva el simulador de la API y `diagnostico.html`, que sondea los endpoints uno
  por uno; más los 26 MB de `node_modules` de las pruebas.

---

## Pendientes conocidos

Cosas identificadas y aún sin resolver, para que no se descubran por sorpresa:

- ~~Rutas apuntando a `127.0.0.1` en producción.~~ **Resuelto.** Eran veintisiete entre
  las escritas a mano y las que usaban la constante `desarrollo`. Hoy no queda ninguna:
  las que nadie usaba se retiraron, y las que quedaban vivas eran del módulo Factura, que
  ya pide por `CDK.rutas.api()`.
- **La cookie de sesión es de otro host** (`landing.*` frente a `pulpo.*`). Si no se
  emite con `Domain=.compudiskett.com.pe`, depende de cookies de terceros y el
  endurecimiento de los navegadores puede dejar la intranet sin sesión.
- **Los listados no paginan.** Se renderizan todos los registros de golpe.
- **Queda un módulo sin migrar al núcleo:** `programador/` está **en pausa a propósito**: su
  única acción queda para más adelante, así que el hub no la enlaza. Lo que hay que saber
  antes de retomarla está en [docs/programador.md](docs/programador.md).

  `cotizacion/`, `lista/`, `pedido/`, `factura/`, `promocion/`, `cuota/`, `marcas.html` y
  `reporte.html` ya usan el núcleo.

- **Del grupo 25 el backend declara pendiente una cosa** y no está construida a propósito:
  los menús distintos por tipo (jefatura y especialista reciben hoy el mismo). Las siete dudas
  que teníamos de Marcas están contestadas y aplicadas
  ([docs/respuesta-marcas.md](docs/respuesta-marcas.md)).
- **Reportes está construido y probado, y falta salir.** `reporte.html` ya es la pantalla
  nueva con los **cuatro informes** —stock, tiempo, precios y guías—, la marca por `codmar`,
  ver en pantalla y exportar a Excel, pero **hasta que esté en producción la antigua sigue
  calculando mal los días de tiempo en almacén de 2026**. Al subirla hay que **avisar al
  backend**, que retira las cuatro rutas antiguas. Falta recorrerlo contra bdnava08, y para eso
  **necesitamos la dirección del servidor de prueba y saber cómo viajan las cookies**. El
  contrato está en [docs/reportes-grupo25.md](docs/reportes-grupo25.md) y el seguimiento en
  [docs/respuesta-reportes.md](docs/respuesta-reportes.md).
- **La cuota por marca del grupo 25 está construida y probada con un simulacro, y falta
  salir.** El contrato es [docs/cuota-grupo25.md](docs/cuota-grupo25.md) (actualizado el 20/10 con
  nuestras respuestas): meta y avance por marca, el general de cada especialista para la jefatura,
  meses anteriores y precarga desde el mes pasado. La pantalla es la de
  `cuota/cuota_observar.html`: **entra siempre por `/cuota/mostrar`**, que el backend redirige al
  grupo 25 a `/cuota/marcas`, y ya no decide por el tipo; «Registrar» tampoco: lo decide el
  `status: "cuota por marca"` de `/cuota/revisar`. Cobertura y cartera no cambian.
  **Falta recorrerla contra bdnava08**: necesitamos la dirección del servidor de prueba y las
  claves de las cuentas ([docs/respuesta-cuota-marcas.md](docs/respuesta-cuota-marcas.md)).
- **El ajuste de precios está construido por las dos puntas, y falta recorrerlo contra bdnava08.** Es un
  módulo aparte, `ajuste`: el vendedor (grupo 20) pide el ajuste y ve sus respuestas, y el especialista o
  la jefatura (grupo 25) recibe, ajusta y confirma o rechaza. **No se tocó cotización, pedido ni
  promoción**: mientras hay una solicitud pendiente responden `409 documento en ajuste` y ya enseñan el
  mensaje del backend. «Pedir ajuste» es un **asistente de tres pasos** (documento, revisa, enviado) que elige de las
  listas de **cotizaciones y pedidos** abiertos y sin aprobar (desde el 21/10 la lista de pedidos los distingue) y, con la
  **vista previa** que ya ofrece el backend, dice antes de enviar a quién irá cada línea y cuáles no irán a nadie. Con el
  contrato del 21/10 el costo se muestra con sus cuatro decimales y el mínimo redondeado hacia arriba, las listas se pueden
  filtrar por fecha de envío (y un `400 fechas invalidas` se dice con su mensaje), el precio se **redondea al
  céntimo, la mitad hacia arriba, antes de validar** contra el mínimo, y el menú lleva el numerito de pendientes. El
  contrato es [docs/ajuste-precios.md](docs/ajuste-precios.md); **el backend ya contestó todas las preguntas**
  ([docs/respuesta-ajuste-precios.md](docs/respuesta-ajuste-precios.md)) y solo falta el servidor de prueba.
- **La cobertura de clientes por marca (grupo 25) está construida y falta recorrerla contra bdnava08.** Es otra
  pantalla en la raíz (`cobertura.html`, módulo `cobertura`; **no** la cobertura del grupo 20): las marcas del mes
  con sus clientes, unidades y venta, y los clientes de cada marca, para el mes en curso y los dos anteriores. No
  calcula nada: el total de clientes son clientes distintos y lo dice el backend. Los clientes de una marca **se
  exportan a Excel** (el archivo lo arma el backend; si llega un error, nunca se guarda como archivo), y una fila en 0
  unidades dice «sin unidades netas en el mes» porque no siempre es «devolvió todo». El contrato es
  [docs/cobertura-grupo25.md](docs/cobertura-grupo25.md); **el backend ya contestó todas las preguntas**
  ([docs/respuesta-cobertura.md](docs/respuesta-cobertura.md)) y solo falta el servidor de prueba.
- **El vendedor del mes (grupo 25) está construido y falta recorrerlo contra bdnava08.** Otra pantalla en la raíz
  (`vendedormes.html`, módulo `vendedormes`, 22/10): de cada marca, **los 3 vendedores del grupo 20 que más la vendieron en el
  mes**, con su venta, su % del total, y si suben o bajan respecto al mes anterior (el en curso y el anterior, nada más). No
  calcula nada, **dice que el total de cada marca no es el avance de la cuota** (puede quedar por debajo o por encima) y
  **hasta qué día hay ventas** (`ventasHasta`). El contrato es [docs/vendedor-mes-grupo25.md](docs/vendedor-mes-grupo25.md);
  **el backend ya contestó todas las preguntas** ([docs/respuesta-vendedor-mes.md](docs/respuesta-vendedor-mes.md)) y solo falta
  el servidor de prueba.
- **El jefe de zona (grupo 34) está construido y falta recorrerlo contra bdnava08.** Dos pantallas en la raíz (22/10): **Avance**
  (`avance.html`: el avance de la cuota de TODOS los vendedores del grupo 20, con semáforo, lo que ya pasó del mes, proyección, cómo cerró
  el mes anterior y los que no registraron cuota; se actualiza sola cada 3 minutos) y **Probabilidad** (`probabilidad.html`: la de un vendedor
  y cómo iba, a esta misma altura, en los 3 meses anteriores). Su menú es exactamente `cotizacion`, `avance` y `probabilidad`, y solo
  entra el usuario 126: el 297 recibe `403 usuario sin acceso`, en el login y en cualquier ruta (el cliente HTTP lo lleva al login). El
  contrato es [docs/zona-grupo34.md](docs/zona-grupo34.md); queda **una pregunta pequeña** ([docs/respuesta-zona.md](docs/respuesta-zona.md)).
- **El menú del grupo 25 ya es el que fijó el backend**: `marcas`, `cuota`, `reporte`, `cobertura`, `ajuste`, `vendedormes` y `cotizacion`.
  Las rutas antiguas de cuota por marca y de reportes se retiraron el 21/10 (responden 404) y el frontend ya no las nombra.
- **Sin marcas en el mes no hay reportes**, ni los del mes pasado: es una regla de negocio
  confirmada. Quien llega sin marcas ve eso explicado y un botón a Marcas.

Ya resueltos, por si alguien llega buscándolos: la hoja de factura con `@apply` que no
pintaba nada y el `parseJSONResponse` definido dos veces se retiraron al migrar sus
módulos. `cotizacion_eliminar.html` ya tiene su lógica y su suite.
