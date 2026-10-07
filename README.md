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
dev/pruebas/    Las diez suites automáticas
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
node todas.js        las diez suites, con un resumen
```

Nueve de las diez cargan las páginas reales en un DOM y las accionan. `node todas.js` sale
con código 1 si alguna falla. Ver [`dev/pruebas/README.md`](dev/pruebas/README.md).

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
- **`styles/factura-components.css` no aplica ningún estilo.** Usa `@apply`, que requiere
  un build de Tailwind que este proyecto no tiene, así que el navegador lo descarta
  entero. Las pantallas de `factura/` se ven sin estilo.
- **`parseJSONResponse` está definida dos veces con comportamientos opuestos**:
  `js/cotizacion/buscar_promo_part4.js` devuelve `null` si el parseo falla y
  `js/cotizacion/buscar_promo_part5.js` devuelve el valor original. Las dos se cargan en
  `cotizacion/cotizacion_nuevo.html`, y como part5 va después, gana la suya: quien
  comprueba `=== null` nunca lo recibe.
- **`cotizacion/cotizacion_eliminar.html` no tiene lógica.** Sus scripts están
  comentados a la espera de que se escriban.
- **Los listados no paginan.** Se renderizan todos los registros de golpe.
- `programador/` es el único módulo sin migrar, y está **en pausa a propósito**: su única
  acción queda para más adelante, así que el hub no la enlaza. Su pantalla sigue en el
  repositorio con su cabecera propia; lo que hay que saber antes de retomarla está en
  [docs/programador.md](docs/programador.md).

  `cotizacion/`, `lista/`, `pedido/`, `factura/`, `promocion/` y `cuota/` ya usan el núcleo.
