# Arquitectura del frontend

Cómo está montado el núcleo compartido y qué hay que saber para trabajar con él.

---

## Por qué un namespace global y no módulos ES

El proyecto tiene ~68 archivos JavaScript clásicos que se comunican por variables
globales y dependen del orden de los `<script>`.

`<script type="module">` **es siempre diferido**: se ejecuta después de que el documento
termina de parsearse y después de todos los scripts clásicos. Un núcleo en módulos ES
estaría disponible *más tarde* que el código que lo necesita, y varios de esos archivos
enganchan manejadores de eventos en el nivel superior. Habría que envolver los 68.

Por eso el núcleo son scripts clásicos que exponen **un único identificador global: `CDK`**.
Cada archivo se envuelve en una función anónima y solo extiende ese objeto:

```js
;(function (global) {
    "use strict";
    var CDK = global.CDK = global.CDK || {};
    CDK.http = { /* … */ };
})(window);
```

**Esta regla no es estética.** El proyecto declara `const` y `class` en el ámbito global
(`js/global/variables.js`, `js/global/toast-notifications.js`). A diferencia de `var`,
redeclarar un `const` global lanza `SyntaxError` y **anula el archivo entero**, no la
línea. Cualquier fuga de nombre desde el núcleo se convertiría en un fallo silencioso y
difícil de localizar.

El día que haya un paso de compilación, pasar cada archivo a `export default` es
mecánico.

---

## Los archivos

| Archivo | Responsabilidad |
|---|---|
| `cdk.js` | Crea el namespace. Deduce `CDK.base` de su propio `<script src>`, detecta el entorno y guarda la configuración. **Va primero.** |
| `cdk-rutas.js` | `api(camino)` y `app(camino)`. Una sola base de API según el entorno. |
| `cdk-http.js` | Peticiones al backend, desempaquetado de la respuesta y manejo del 401. |
| `cdk-sesion.js` | Datos del usuario, cierre de sesión y expiración. |
| `cdk-catalogo.js` | Conocimiento declarativo: módulos, iconos, permiso → página, tipos de vendedor. |
| `cdk-permisos.js` | Habla con `/vendedor` y `/<modulo>`. Caché en `sessionStorage`. |
| `cdk-ajustes.js` | Preferencias del usuario. |
| `cdk-ui.js` | Avisos, diálogos y estados de contenido. |
| `cdk-formato.js` | Moneda, fechas y números. |
| `cdk-shell.js` | Construye el armazón: barra superior, lateral, inferior. |
| `cdk-shell.css` | Estilos del armazón y de los componentes. |
| `cdk-hub.js` | Solo en las páginas hub: pinta las acciones del módulo. |
| `cdk-compat.js` | Opcional. Puentes hacia nombres antiguos durante una migración. |

---

## Plantilla de página

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="/core/cdk-shell.css">
    <title>CDK · Crear Cotización</title>
</head>

<body data-modulo="cotizacion" data-titulo="Crear Cotización">

    <div class="cdk-pagina">
        <!-- solo el contenido; nada de cabeceras ni menús -->
    </div>

    <!-- BLOQUE NÚCLEO: este orden es una dependencia real -->
    <script src="/core/cdk.js"></script>
    <script src="/core/cdk-rutas.js"></script>
    <script src="/core/cdk-http.js"></script>
    <script src="/core/cdk-sesion.js"></script>
    <script src="/core/cdk-catalogo.js"></script>
    <script src="/core/cdk-permisos.js"></script>
    <script src="/core/cdk-ui.js"></script>
    <script src="/core/cdk-formato.js"></script>
    <script src="/core/cdk-shell.js"></script>

    <!-- scripts propios de la página, siempre DESPUÉS -->
</body>
</html>
```

### Reglas

1. **`cdk-shell.css` va en el `<head>`.** Reserva el espacio del armazón antes del primer
   pintado. Si se carga al final, la página da un salto.
2. **El bloque del núcleo va antes de los scripts de página.** Así los elementos del
   armazón ya existen cuando corre cualquier código que busque elementos por id en el
   nivel superior.
3. **Nada de `defer` ni `async` en el núcleo.** El orden *es* la dependencia.
4. **Sin `data-modulo` no hay armazón.**

### Atributos del `<body>`

| Atributo | Para qué |
|---|---|
| `data-modulo="cotizacion"` | Módulo al que pertenece. Marca el elemento activo del menú y decide el botón de volver. |
| `data-titulo="…"` | Título en la barra superior. |
| `data-shell="inicio"` | Panel principal y páginas que no son de módulo. |
| `data-shell="none"` | Sin armazón y sin guard: inicio de sesión, registro, `dev/`. |
| `data-volver="/main.html"` | Fuerza el destino del botón de volver. |

---

## Por qué el armazón no salta

Todo el armazón es `position: fixed`, es decir, fuera del flujo del documento: no puede
desplazar nada, se inyecte cuando se inyecte. El espacio lo reserva `cdk-shell.css` con
selectores sobre `[data-modulo]`, un atributo que ya existe en tiempo de parseo.

```css
body[data-modulo] { padding-top: 56px; padding-bottom: 64px; }
@media (min-width: 768px) { body[data-modulo] { padding-left: 256px; padding-bottom: 0; } }
```

Por eso `cdk-shell.css` es **CSS plano, sin Tailwind**. El CDN de Tailwind genera sus
reglas en tiempo de ejecución observando el DOM, así que el marcado que inyecta el
JavaScript aparecería sin estilo durante varios fotogramas. El armazón tiene que
sostenerse sin él.

---

## Navegación

```
main.html              panel principal
  └── <modulo>.html    hub: las acciones permitidas en ese módulo
        └── <modulo>/<pantalla>.html
```

El botón de volver respeta esos tres niveles: desde una pantalla de trabajo lleva al hub
de su módulo, y desde el hub al panel.

En pantallas anchas hay menú lateral fijo; por debajo de 768 px, barra inferior con
cuatro módulos y un botón «Más». Los cuatro salen de una **prioridad declarada** en
`cdk-catalogo.js`, nunca del orden en que el backend devuelva las claves. El módulo
actual siempre ocupa un hueco visible.

---

## Peticiones al backend

```js
CDK.http.get(url, opciones)
CDK.http.post(url, cuerpo, opciones)
CDK.http.put(url, cuerpo, opciones)
CDK.http.del(url, cuerpo, opciones)
```

Opciones: `headers`, `timeout`, `senal`, `sin401` (no disparar el guard) y `crudo`
(devolver la `Response` sin tocar).

Siempre envía `mode: "cors"` y `credentials: "include"`.
Si el cuerpo es `FormData`, **no** fija `Content-Type`: lo pone el navegador con su
*boundary*.

### El desempaquetado

El backend devuelve un JSON cuyo contenido es *otro* JSON en forma de texto. Antes de
existir el núcleo, eso obligaba a escribir `JSON.parse()` justo después de `.json()` en
cada llamada; había 63 repartidas por el proyecto.

`CDK.http` lo normaliza en un solo sitio: si el valor decodificado sigue siendo un texto
que empieza por `{` o `[`, lo decodifica una vez más. **Una sola vez, nunca en bucle**: si
algún día llegara triplemente codificado, es un fallo del backend y debe verse.

Es tolerante al futuro: el día que el backend devuelva JSON normal, no hay nada que
cambiar.

### Sesión expirada

Ante un 401, `CDK.http` llama a `CDK.sesion.expirar()`, que lleva al inicio de sesión.
Es idempotente: si hay varias peticiones en vuelo y todas fallan, solo la primera
redirige. Y no actúa en páginas con `data-shell="none"`, para no entrar en bucle.

La petición de módulos que el armazón necesita de todas formas hace también de sonda de
sesión, así que el guard no cuesta ninguna petición adicional.

---

## Permisos

Dos llamadas, ambas ya filtradas por el backend:

- `GET /vendedor` → los módulos de esa persona, en `data`, con el nombre, el grupo, el
  tipo y el tipo de cambio del día al lado del sobre.
- `GET /<modulo>` → las acciones permitidas dentro de ese módulo, también en `data`.

Las dos pasaron al sobre `{ status, codigo, data }`. El frontend sigue aceptando las
formas anteriores —`{ modulos: … }`, `{ accesos: … }` y el arreglo suelto— porque el
backend migra pantalla por pantalla y el menú no debería depender de qué despliegue llegó
antes. El detalle está en [login-y-modulos.md](login-y-modulos.md).

> El endpoint de acciones es `/` + la carpeta del módulo. Coinciden todos salvo `listas`,
> cuya ruta es **`/lista`** en singular.

El menú se cachea en **`sessionStorage`** y se revalida en segundo plano; solo se
repinta si cambió. Nunca en `localStorage`: como no se puede leer la cookie de sesión,
no hay forma de asociar la caché a un usuario, y en un equipo compartido se mostraría el
menú de quien lo usó antes.

**El menú no es una frontera de seguridad.** El backend autoriza endpoint por endpoint;
una caché desfasada empeora la experiencia, no la seguridad.

---

## Tipos de vendedor

Tres ejes que conviene no confundir:

1. **`grupo`** — de quién depende organizativamente. Lo da el backend.
2. **Tipo de vendedor** — se elige una vez al registrarse y se guarda en el backend.
   Dos tipos del mismo grupo no son intercambiables.
3. **Módulos y accesos** — ya filtrados por el backend.

La interfaz puede cambiar según el tipo. Eso se declara en el marcado, no con condiciones
repartidas por el código:

```html
<section data-tipo="ESPECIALISTA">…</section>
<button  data-tipo="JEFATURA,ZONA">…</button>
<div     data-tipo-excepto="COBERTURA">…</div>
```

El armazón **elimina** del DOM lo que no aplica, en vez de ocultarlo: así no quedan
campos de formulario que puedan enviarse por error.

> Esto es presentación, **no seguridad**. Cualquiera puede editar el DOM. Lo que protege
> de verdad es que el backend rechace la operación.

---

## Añadir un módulo al catálogo

`cdk-catalogo.js` es declarativo y no contiene lógica. Para un módulo nuevo:

```js
inventario: {
    etiqueta: "Inventario",
    icono: ICONOS.generico,
    prioridad: 10,          // orden en la barra inferior
    carpeta: "inventario",  // carpeta de sus pantallas y endpoint de permisos
    accesos: {
        "leer": { pagina: "inventario_ver", etiqueta: "Ver", descripcion: "Consultar stock" }
    }
}
```

`existe: false` en un acceso significa que el backend puede concederlo pero no se opera
desde esta intranet. Se pinta sin enlace, en lugar de llevar a un 404.

Si el backend devuelve un permiso que el catálogo no conoce, la tarjeta no aparece pero
queda un aviso en la consola nombrándolo: no desaparece en silencio.

---

## Preferencias

`CDK.ajustes` guarda hoy en el navegador, **por usuario y por equipo**: quien entre desde
otro dispositivo no verá sus ajustes.

Todo el acceso al almacenamiento pasa por un adaptador dentro de `cdk-ajustes.js`. Para
llevarlo al backend basta con sustituir ese objeto; ni la página de configuración ni el
armazón se enteran. El contrato propuesto está anotado en la cabecera del archivo.

Las imágenes se reescalan en el navegador antes de guardarse: hasta 2560 px y 1 MB,
buscando la mejor calidad que quepa. No es solo por el límite de almacenamiento — cuando
esto se suba al backend, lo harán comerciales desde el móvil con datos.

---

## Documentación anterior

`docs/promociones/` y `docs/historico/` recogen la documentación previa a esta
reestructuración. Describen el estado del código en su momento y pueden haber quedado
desfasadas.
