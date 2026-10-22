# Grupo 25 — lo construido, lo que lee cada pantalla y lo que viene

Responde a [marcas-grupo25.md](marcas-grupo25.md). Sirve para que los dos lados estemos a
la par: **qué consume el frontend de cada ruta** (y qué no), qué decidimos por nuestra
cuenta, cómo cerramos las dudas que nos contestaron el 16/10, y dónde queda el siguiente
módulo, **Reportes**.

| | |
|---|---|
| [1 · Estado](#1--estado) | qué está hecho y cómo comprobarlo |
| [2 · Qué lee el frontend de cada ruta](#2--qué-lee-el-frontend-de-cada-ruta) | campos que usamos, campos que no, errores que tratamos aparte |
| [3 · Decisiones nuestras](#3--decisiones-nuestras-que-conviene-que-conozcan) | lo que cambió y por qué |
| [4 · Dudas: respondidas](#4--dudas-respondidas) | las siete, con lo que hicimos con cada respuesta |
| [5 · Lo que no se construyó](#5--lo-que-no-se-construyó-a-propósito) | la sección 8 de su documento |
| [6 · Reportes](#6--reportes) | dónde está ahora |

---

## 1 · Estado

Todo lo de la sección 3 a 7 de su documento está hecho: registro, menú, las siete rutas de
`/v1/marcas` y el aviso `debeAsignar` de cuota.

| pieza | dónde |
|---|---|
| Registro del grupo 25, con marcas opcionales | `autenticador.html`, `js/login/registro.js` |
| Módulo Marcas en el menú | `marcas.html`, `js/marcas/` |
| Especialista: borrador, confirmar, solo lectura | `js/marcas/marcas.js`, `editor.js` |
| Jefatura: panel de la familia | `js/marcas/familia.js` |
| Cuota con `sin marcas del mes` | `js/cuota/avance.js` |

**Cómo comprobarlo sin tocar su backend.** `node dev/servidor.js` levanta el frontend y una
API simulada que reproduce su contrato, con estado (dueños, confirmaciones, familia). Los
usuarios de prueba están en el README: `nuevo25`, `jefatura25`, `confirmado25`…

**El simulacro es una lectura ejecutable de su documento**: está en
[`dev/simulador-marcas.js`](../dev/simulador-marcas.js) y es lo que usan nuestras pruebas.
Si lo contrastan con su implementación, cada diferencia es o un error nuestro o un hueco
de su documento, y en los dos casos queremos saberlo.

**Si cambian una forma de respuesta, nuestras pruebas fallan** (`dev/pruebas/probar-marcas.js`
y `probar-login.js`, 238 comprobaciones). Conviene avisarnos igual: las pruebas cubren lo
que simulamos, no lo que el backend añada.

---

## 2 · Qué lee el frontend de cada ruta

Lo escribimos porque un campo que su documento declara y nosotros ignoramos es un campo
que pueden cambiar o retirar sin romper nada, y uno que leemos es uno que no.

### Reglas generales

- **Decidimos por `status`, mostramos `msg`.** Solo se ramifica por los `status` de la tabla
  de cada ruta; con cualquier otro se enseña el `msg` tal cual llegue. Por eso **el `msg` se
  lee entero por una persona**: conviene que esté escrito para ella.
- **Nunca filtramos ni validamos lo que es regla de negocio.** Qué marcas se ofrecen, a quién
  se pueden dar, si ya confirmó: lo decide el backend. La pantalla solo evita proponer lo que
  sabe que va a rechazarse (por ejemplo, no ofrece «dar» una marca propia a una jefatura que ya confirmó).
- **Repintamos pidiendo `GET /v1/marcas` entero** tras cada escritura, como indican. No
  mezclamos la respuesta de la escritura con el estado anterior.
- **Respuestas de `/v1/marcas`:** las leemos como JSON simple. Las de `/login/*` siguen
  llegando doblemente codificadas y las desempaquetamos una vez.

### `GET /v1/login/registro`

| usamos | no usamos |
|---|---|
| `diferenciadores` | — |
| `grupo`, solo como respaldo y para el mensaje de error | — |

**El desplegable se llena con `diferenciadores`**, tal cual y en ese orden. `[]` es «este
grupo no tiene registro disponible» y no se ofrece el formulario. Un tipo que nuestro catálogo no
conoce se ofrece igual, con su clave como etiqueta y sin sección de marcas.

Si la respuesta **no trae** `diferenciadores` —un despliegue anterior—, recurrimos a una tabla
propia por el texto de `grupo` (`VENTAS-EJECUTIVOS`, `VENTAS-JEFES DE PROD`,
`VENTAS-JEFES DE ZONA`, `VENTAS-JEFE DE PRODU`). Es solo respaldo: con el campo presente,
renombrar un grupo ya no rompe nada.

### `POST /v1/login/registro/completado`

**Enviamos:** `diferenciador` en mayúsculas, y `marcas` (lista de códigos como cadenas) **solo
si se eligió alguna**. Sin marcas el campo se omite; no mandamos `[]`.

| usamos de la respuesta | no usamos |
|---|---|
| `correcto` (el tipo con el que quedó, **no** el del formulario) | — |
| `marcas.asignadas[]` → `codmar`, `nombre` (o `abrmar`) | — |
| `marcas.omitidas[]` → `nombre`, `motivo`, `asignadaA` | — |
| `confirmado` | — |

**Si la respuesta no trae ni `marcas` ni `confirmado`, entramos directo al panel**: es lo que
ocurre en los grupos 20, 34 y 39, que reciben solo `{ correcto }`. Si trae cualquiera de los dos
—en el grupo 25 llegan siempre, aunque no se haya elegido ninguna marca—, enseñamos un
resultado del alta (tipo, marcas, omitidas) antes de entrar.

| `status` que tratamos aparte | qué hacemos |
|---|---|
| 409 `usuario ya registrado` | aviso y al panel. No es un error: el primer envío sí llegó |
| 403 `jefatura sin familia` | mostramos `msg`; se queda en el formulario para elegir otro tipo |
| 401 | al inicio de sesión (sin intentar renovar `tip`: aún no hay) |

### `GET /v1/vendedor`

| usamos | no usamos |
|---|---|
| las claves de `data` (una tarjeta por clave), sus valores como subtítulo | — |
| `nombre`, `grupo`, `tipo`, `tipoCambio` | — |

**Una clave de módulo que no conocemos produce una tarjeta que lleva a `/<clave>.html`**, que
si no existe es un 404. Hoy conocemos nueve: `cotizacion`, `pedido`, `factura`, `promocion`,
`cuota`, `listas`, `programador`, `reporte`, `marcas`. **Antes de añadir una clave nueva al
mapa del grupo, avísennos**: sale a producción primero nuestra página.

Para el módulo Marcas decidimos por `data.rol` de `GET /marcas`, **no** por el `tipo` de este
menú, como indican.

### `GET /v1/marcas`

| usamos | no usamos |
|---|---|
| `anno`, `mes` (para «octubre de 2026») | `marcas[].codfam` |
| `rol`, `confirmado`, `confirmadoEn` | `familia.codfam` |
| `marcas[]` → `codmar`, `nombre`, `familia`, `trabajada`, `asignadaPor` | |
| `abrmar` de `marcas[]`, solo si falta `nombre` | |
| `familia.nombre` | |
| `familia.marcas[]` → `codmar`, `abrmar`, `nombre`, `trabajada`, `dueno.{codusu, nombre, soyYo}` | |
| `familia.especialistas[]` → `codusu`, `nombre`, `marcasDeMiFamilia`, `marcasTotal`, `confirmado` | |

Cuatro cosas de las que **sí dependemos**, por si las cambian:

1. **El orden de `familia.marcas`.** No lo reordenamos: pintamos como llega, y su documento
   dice que van primero las trabajadas.
2. **`asignadaPor === "yo"`** como valor literal. Cualquier otro valor lo mostramos como el
   nombre de quien la dio.
3. **`dueno.codusu` y `especialistas[].codusu`** se comparan como cadenas iguales (para
   filtrar por especialista y para no ofrecerle una marca a quien ya la tiene).
4. **`rol` distinto de `JEFATURA` se trata como especialista.** Un tercer valor caería ahí.

Si `familia` es `null` en una jefatura, decimos que no tiene familia cargada y que avise a
sistemas; no rompe nada.

**`400 no identificado`** (alguien del grupo 25 que no completó el alta) se trata aparte: la
pantalla dice «todavía no estás registrado» y ofrece ir al formulario. Es lo único que se
ramifica por `status` en esta ruta.

### `GET /v1/marcas/anterior`

| usamos | no usamos |
|---|---|
| `marcas[]` → `codmar`, `abrmar`, `nombre`, `disponible`, `motivo`, `asignadaA` | `anno`, `mes` |

Solo las `disponible: true` entran al borrador. Las demás se enseñan con su `motivo`
(y `asignadaA` entre paréntesis) y no se pueden tomar desde ahí.

### `POST /v1/marcas/disponibles`

**Enviamos** `{ sugerencia }`, **solo con 2 o más caracteres** y esperando 300 ms desde la
última tecla. **Nunca mandamos la sugerencia vacía**, así que el «primeras 50» no lo usamos.

| usamos | no usamos |
|---|---|
| `codmar`, `abrmar`, `nombre`, `familia` | `codfam` |

**Confiamos en que el backend acota por rol** (todas las familias al especialista, solo la
suya a la jefatura): no filtramos nada de nuestro lado. **También se usa en el formulario de
registro**, antes del alta, donde el backend acota por si la persona ya está cargada como
jefatura. Es la única ruta de `/marcas` que funciona sin estar registrado.

### `POST /v1/marcas/confirmar`

**Enviamos** `{ marcas: ["0206", "0008"] }`: la primera de las tres formas que aceptan, códigos
como cadenas, sin mes ni año. Puede ir `[]` si ya tiene marcas dadas por la jefatura.

| usamos | no usamos |
|---|---|
| `total`, `omitidas[]` | `confirmado`, `anno`, `mes`, `asignadas`, `yaTenia` |

| `status` que tratamos aparte | qué hacemos |
|---|---|
| 409 `marcas ya confirmadas` | aviso, y repintamos con el estado real (queda en solo lectura) |
| 409 `sin marcas asignables` | **no** queda confirmado: leemos `data.omitidas`, las enseñamos, las **quitamos del borrador** y se puede reintentar |
| 403 `jefatura sin familia`, 400 `marcas invalidas` | mostramos `msg` |

### `POST /v1/marcas/asignar` y `/retirar`

**Enviamos una sola marca por llamada**: `{ codusu, marcas: ["0002"] }`. Es lo que permite la
interfaz (una acción por fila), no una restricción del contrato.

| ruta | usamos | no usamos |
|---|---|---|
| `/asignar` | `asignadas[0].movidaDe`, `yaTenia`, `omitidas[]` | `especialista` |
| `/retirar` | `retiradas`, `omitidas[]` | `especialista` |

Una jefatura también usa `/asignar` para ceder **sus propias marcas**, mientras no haya
confirmado; ahí no se le quita a nadie y no pedimos confirmación.

Antes de `/asignar` sobre una marca que ya tiene dueño pedimos confirmación, y mostramos el
nombre del dueño actual **que ya trae `GET /marcas`**, no el de la respuesta. Los errores
(`solo jefatura`, `destino invalido`, `destino no especialista`…) se muestran con su `msg`.

### `POST /v1/marcas/estado`

**Enviamos** `{ codmar, trabajada }` con `trabajada` como **booleano estricto**. Para
**incorporar** una marca nueva mandamos `trabajada: true` con un código que no está en la
familia, como describen.

| usamos | no usamos |
|---|---|
| `asignadaEsteMesA`, `incorporada`, `nombre`/`abrmar` | `codmar`, `codfam`, `trabajada` |

`asignadaEsteMesA` lo leemos como **el nombre en texto** (o `null`), como confirmaron.

### `GET /v1/cuota/mostrar` (sección 7)

Si la respuesta trae `debeAsignar` o `status: "sin marcas del mes"` —**en el primer nivel, sin
`data`**— enseñamos un aviso y un botón a Marcas, en vez de pintar un avance vacío. Es lo
único de cuota que tocamos.

---

## 3 · Decisiones nuestras que conviene que conozcan

### Los tipos del registro los pone el backend

El desplegable ofrece lo que devuelve `diferenciadores`. El frontend solo aporta lo que el
backend no tiene: la etiqueta («Jefatura»), una frase explicativa y si pide marcas. Esto cerró
una decisión nuestra anterior, en la que los tipos estaban escritos en el catálogo.

Lo que cambió respecto a la pantalla original, que tenía un `switch` con valores que ustedes
rechazan:

- **«TIO GASEOSA» pasa a llamarse `HP`**, como lo guarda la tabla de diferenciadores.
- **`WEB` deja de ofrecerse**: el grupo 34 solo acepta `ZONA`.
- **`CHAKAL` deja de ofrecerse**: el grupo 39 solo acepta `HP`.

### El registro no preselecciona tipo

El tipo no se puede cambiar después del alta. Con la primera opción preseleccionada, quien
guarda sin mirar acaba pidiendo `JEFATURA` siendo especialista y tropieza con el 403. Ahora
el desplegable arranca en «Elige tu tipo…» y no deja guardar hasta elegir. Con un solo tipo
(ZONA) queda puesto.

### El borrador vive solo en la pantalla

Como pide su documento. Quien cierra la pestaña a medias pierde la lista, y hoy **no
avisamos al salir**: decisión pendiente de nuestro lado, ver sección 4.

### Lo que cambió en el inicio de sesión

- **`no identificado` ya no muestra «usuario y/o contraseña incorrectos».** Antes salía ese
  mensaje un instante y luego se redirigía: a quien acertó su contraseña le decía lo
  contrario de lo que pasaba. Ahora va directo al registro.
- **Va al formulario (`autenticador.html`)**, no a una pantalla intermedia. `registro.html`,
  el menú antiguo que había en medio, se eliminó.
- **El enlace «Crear cuenta» de `index.html` se quitó.** El formulario necesita la sesión que
  se abre ahí, así que el enlace devolvía al login. Quien no figura en la intranet llega al
  alta solo, al entrar.
- **Entrar borra el menú cacheado en el navegador.** Si alguien entraba sin haber cerrado
  sesión, veía un instante el menú y el nombre de la persona anterior.

### Cuando `tip` caduca

Seguimos tratando un 401 como «quizá solo venció `tip`»: llamamos una vez a
`GET /login/identificador` y reintentamos. **Para alguien sin registrar esa llamada devuelve
400 `no identificado`**, que consideramos «sesión terminada» y mandamos al login. Es lo que
queremos; lo decimos para que no les extrañe verla en el registro.

---

## 4 · Dudas: respondidas

El backend contestó las siete en [marcas-grupo25.md](marcas-grupo25.md), sección 9. Qué dijo y
qué hicimos con cada una:

| duda | respuesta | qué hicimos |
|---|---|---|
| 1 · `/disponibles` antes del alta | Funciona. Quien no está registrado ve todas las familias, salvo que ya esté cargado como jefatura: entonces solo la suya | Nada: ya lo usábamos así. Probado con los dos casos |
| 2 · registro sin marcas | **Grupo 25:** siempre `marcas` (vacía) y `confirmado: false`. **Demás grupos:** solo `{ correcto }` | Nada: la regla «sin `marcas` ni `confirmado`, directo al panel» ya lo cubría. El simulacro lo reproduce |
| 3 · `CHAKAL` | Ya no se usa; el grupo 39 solo acepta `HP` | Retirado como opción. Se conserva en el catálogo solo para ponerle etiqueta a quien ya figure con ese tipo |
| 4 · `asignadaEsteMesA` | El **nombre** en texto, o `null` | Quitamos la tolerancia a que llegara como objeto |
| 5 · jefatura cede una marca propia sin confirmar | **Sí se permite** | Botón «Dar a un especialista» en sus propias marcas, **solo mientras no haya confirmado**. Confirmada, no se ofrece: se sabe que volvería en `omitidas` |
| 6 · `GET /marcas` sin diferenciador | `400 no identificado` (también `/anterior` y `/confirmar`) | Pantalla «Todavía no estás registrado», con un botón al formulario de registro. No es un error ni se reintenta |
| 7 · tipos en `GET /login/registro` | Hecho: `diferenciadores` | **El registro ofrece exactamente esos.** El catálogo solo pone la etiqueta, la descripción y si pide marcas; un tipo que no conozca se ofrece igual, con su clave. Si falta el campo —un despliegue anterior—, recurre a su tabla por grupo |

**Queda una decisión que es nuestra, no suya:** el aviso al salir con una lista sin confirmar
(`beforeunload`). Dicen que de su lado no hay objeción. **Sigue sin hacerse**: cerrar la
pestaña a medias pierde el borrador sin avisar.

---

## 5 · Lo que no se construyó a propósito

La sección 8 de su documento dice que no se construyan pantallas sobre esto, y no se hizo:

- Cuota por marca (`/cuota/marcaupdate`, `/cuota/marcamostrar`) y el avance de la familia.
- Reportes: **el backend ya los tiene hechos**; falta nuestra pantalla. Ver sección 6.
- Menús distintos por tipo: jefatura y especialista reciben el mismo.

---

## 6 · Reportes

Respondido por el backend en [reportes-grupo25.md](reportes-grupo25.md). Nuestra lectura de ese
documento, lo que queremos aclarar antes de construir y cómo vamos a hacerlo están en
[respuesta-reportes.md](respuesta-reportes.md).
