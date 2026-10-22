# Grupo 25 (jefaturas y especialistas) — marcas del mes

Contrato del backend para construir las pantallas del grupo 25: el registro, el menu y el
modulo nuevo **marcas** (`/v1/marcas`). Todo lo de este documento ya esta implementado y
probado en la base de pruebas (bdnava08).

> **Actualizado el 16/10/2026**, en respuesta a [respuesta-marcas.md](respuesta-marcas.md).
> Cambios respecto a la version anterior:
> - `GET /login/registro` devuelve `diferenciadores` (seccion 3).
> - `/login/registro/completado` solo trae `marcas` y `confirmado` en el grupo 25 (seccion 3).
> - `CHAKAL` ya no se acepta en el registro (seccion 3).
> - `GET /marcas`, `/anterior` y `/confirmar` responden `400 no identificado` a quien no esta
>   registrado; `/disponibles` funciona antes del registro (seccion 5).
> - Respuestas a las siete dudas: seccion 9. Reportes: [reportes-grupo25.md](reportes-grupo25.md).

---

## 1. Como funciona el negocio

**Dos tipos de usuario.** El grupo 25 tiene dos diferenciadores: **JEFATURA** y
**ESPECIALISTA**.

**Familias.** Cada jefatura lleva **una sola familia** (Equipos informaticos, Partes y
piezas, Movilidad...) y cada familia tiene como maximo una jefatura. Hoy:

| familia | jefatura |
|---|---|
| 02 Equipos informaticos | TINEO MARIA |
| 06 Partes y piezas de computadora | MICHUE RICARDO |
| 09 Almacenamiento externo | COSSIO JOANNA |
| 11 Impresion | ATOCHE HEIDI |
| 12 Movilidad | FULCA ROBERT |

Las familias 01 (Accesorios y perifericos) y 05 (Suministros) no tienen jefatura: sus
especialistas no responden a nadie.

**Marcas.** La unidad es la marca del ERP (`codmar`, 4 digitos). Una misma marca comercial
puede estar partida en varias: HP tintas (0007), HP impresoras (0190), HP computo (0160)...
Para la pantalla son marcas distintas. Cada marca pertenece a una familia.

**Reglas del mes:**

1. Una marca tiene **un solo dueño** en el mes: un especialista o la jefatura.
2. El especialista elige sus marcas (de cualquier familia) y las **confirma**. Desde ese
   momento **no puede sumar, quitar ni cambiar** marcas hasta el mes siguiente: la cuota se
   calcula sobre ellas.
3. La jefatura tambien puede tomar marcas para si (solo de su familia), y al confirmarlas
   queda igual de bloqueada.
4. La jefatura **si** puede dar, pasar y quitar marcas de su familia a los especialistas
   en cualquier momento, aunque ya hayan confirmado.
5. La jefatura ve todas las marcas de su familia: las de sus especialistas, las suyas y
   las que nadie tiene.
6. La jefatura puede marcar una marca de su familia como **no trabajada**: desde ese
   momento nadie puede tomarla. Quien la tenga este mes la conserva hasta fin de mes.

**El borrador vive en la pantalla.** El backend no guarda nada hasta que el usuario
confirma: la pantalla arma la lista (suma, quita, precarga la del mes anterior) y la manda
una sola vez a `/marcas/confirmar`.

**El mes** lo decide el servidor (fecha del servidor). La pantalla no manda mes ni año.

---

## 2. Cosas comunes a todas las rutas

**Cookies.** Todas las rutas necesitan la cookie `cdk` (sesion). Las de `/v1/vendedor`
ademas necesitan `tip`. Hay que mandarlas con `credentials: 'include'`.

**Forma de las respuestas de `/v1/marcas`.** Siempre JSON (no doble codificado):

```json
{ "status": "ok", "codigo": 0, "data": { ... } }
```

En error:

```json
{ "status": "marcas ya confirmadas", "codigo": 3, "msg": "ya confirmaste tus marcas de este mes; ..." }
```

`status` es el valor estable para decidir en codigo; `msg` es para mostrar.
`codigo`: 0 = ok, 1 = falla del servidor, 2 = el pedido esta mal, 3 = no se permite.

**Como mandar marcas.** Donde una ruta recibe `marcas`, acepta cualquiera de estas formas:

```json
{ "marcas": ["0206", "0008"] }
{ "marcas": [["0206","EP_IM","EP_IMPRESORAS"], ["0008","EPSON","EPSON"]] }
{ "marcas": [{ "codmar": "0206" }, { "codmar": "0008" }] }
```

Maximo 50. Los repetidos se ignoran. Si algun elemento no es un codigo de 4 digitos se
rechaza todo con `400 marcas invalidas`.

**Marcas que no se pueden asignar.** Las rutas que asignan no fallan por una marca mala:
asignan las que pueden y devuelven las demas en `omitidas`, cada una con su `motivo`. La
pantalla debe mostrarlas. Motivos posibles:

| motivo | cuando |
|---|---|
| `la marca no existe` | el codigo no esta en el ERP |
| `la marca no esta en el catalogo de marcas` | existe pero no se le asigno familia (avisar a sistemas o a la jefatura) |
| `la marca ya no se trabaja` | la jefatura la marco como no trabajada |
| `la marca ya esta asignada a otro este mes` | tiene dueño; viene `asignadaA` con el nombre |
| `la marca no es de la familia de su jefatura` | una jefatura intento tomar una marca de otra familia |
| `la marca no es de tu familia` | la jefatura intento dar una marca de otra familia |
| `la marca es tuya y ya confirmaste tus marcas del mes` | la jefatura intento ceder una marca propia ya confirmada |
| `el especialista no tiene esta marca este mes` | al retirar |

---

## 3. Registro (primer ingreso)

El flujo de login no cambia: `POST /v1/login` → `GET /v1/login/identificador`. Si
identificador responde `400 no identificado`, el usuario no esta registrado y la pantalla
muestra el formulario de registro.

### `GET /v1/login/registro`

Devuelve el nombre del grupo y **los tipos que el registro acepta para ese grupo** (doble
codificado como siempre):

```json
"{\"grupo\":\"VENTAS-JEFES DE PROD\",\"diferenciadores\":[\"ESPECIALISTA\",\"JEFATURA\"]}"
```

Usar `diferenciadores` para llenar el desplegable: es la misma lista contra la que valida
`/registro/completado`, asi que la pantalla deja de necesitar su propio catalogo por grupo.
Un grupo sin registro disponible devuelve `[]`.

### `POST /v1/login/registro/completado`

```json
{ "diferenciador": "ESPECIALISTA", "marcas": ["0002", "0003"] }
```

| campo | que es |
|---|---|
| `diferenciador` | uno de los `diferenciadores` de `GET /login/registro`. Hoy: grupo 25 `ESPECIALISTA`/`JEFATURA`, 20 `COBERTURA`/`CARTERA`, 34 `ZONA`, 39 `HP` (`CHAKAL` ya no se acepta). Mayusculas o minusculas da igual |
| `marcas` | opcional, solo grupo 25. Las marcas del mes |

**Cambio importante:** antes esta ruta redirigia a `/login/identificador`. **Ahora responde
directamente** (y deja puesta la cookie `tip`). La forma sigue siendo la de identificador,
doble codificada, con `correcto` = el tipo. **Solo en el grupo 25** se agregan `marcas` y
`confirmado`, aunque no se haya elegido ninguna marca (`asignadas: []`, `confirmado: false`).
Los demas grupos reciben solo `{"correcto":"CARTERA"}`:

```json
"{\"correcto\":\"ESPECIALISTA\",\"marcas\":{\"asignadas\":[{\"codmar\":\"0036\",\"abrmar\":\"ZOTAC\",\"nombre\":\"ZOTAC\"}],\"omitidas\":[{\"codmar\":\"0024\",\"abrmar\":\"PNY\",\"nombre\":\"PNY\",\"motivo\":\"la marca ya esta asignada a otro este mes\",\"asignadaA\":\"SAUÑE MANUEL\"}]},\"confirmado\":true}"
```

Reglas:

- **Elegir marcas en el registro es la confirmacion del mes.** Si se asigno al menos una,
  `confirmado: true` y quedan fijas. Si el formulario no manda marcas (o ninguna se pudo
  asignar), `confirmado: false` y el usuario las confirma despues en el modulo de marcas.
  Conviene que la pantalla de registro lo diga ("estas marcas quedan fijas hasta fin de mes").
- Si el usuario esta cargado como jefatura de una familia, queda como **JEFATURA aunque
  haya elegido ESPECIALISTA**. Leer el tipo de `correcto`, no del formulario.
- Si elige **JEFATURA** sin estar cargado como jefatura: `403 jefatura sin familia`.
- Una jefatura solo puede tomar marcas de su familia en el registro; las demas van a `omitidas`.

Errores:

| http | status | cuando |
|---|---|---|
| 409 | `usuario ya registrado` | ya tenia registro (por ejemplo, doble clic en enviar) |
| 400 | `diferenciador invalido` | el tipo no corresponde a su grupo |
| 403 | `jefatura sin familia` | pidio JEFATURA y no esta cargado como jefatura |
| 400 | `marcas invalidas` | la lista de marcas no tiene la forma esperada |

---

## 4. Menu

`GET /v1/vendedor` redirige a `/v1/vendedor/especialista` o `/v1/vendedor/jefatura`. **Los dos
devuelven el mismo menu**: jefatura y especialista comparten los mismos modulos (decision de
negocio del 21/10/2026).

```json
{ "status":"ok", "codigo":0,
  "data": { "marcas":"Elige y administra tus marcas del mes",
            "cuota":"Fija las metas de tus marcas y revisa su avance",
            "reporte":"Stock, tiempo en almacen, lista de precios y guias de tus marcas",
            "cobertura":"Revisa a que clientes se les vendio cada marca en el mes",
            "ajuste":"Recibe y responde las solicitudes de ajuste de precio de los vendedores",
            "vendedormes":"Los 3 vendedores que mas venden cada una de tus marcas en el mes",
            "cotizacion":"Permite manejar cotizaciones" },
  "nombre":"...", "grupo":"VENTAS-JEFES DE PROD", "tipo":"JEFATURA", "tipoCambio":3.75,
  "ajustesPendientes": 0 }
```

**Cambio en el menu del grupo 25** (21/10/2026):

| clave | antes | ahora |
|---|---|---|
| `marcas`, `cuota`, `reporte`, `cotizacion` | si | si |
| `cobertura` | no | **si** (nuevo: [cobertura-grupo25.md](cobertura-grupo25.md)) |
| `ajuste` | no | **si** (nuevo: [ajuste-precios.md](ajuste-precios.md)) |
| `vendedormes` | no | **si** (nuevo, 22/10/2026: [vendedor-mes-grupo25.md](vendedor-mes-grupo25.md)) |
| `factura`, `promocion` | si | **no** |

`factura` y `promocion` solo salen del menu: sus rutas siguen funcionando para el grupo 25 (la
pantalla de cotizacion puede seguir usando las de promocion). `ajustesPendientes` es el numerito
para la tarjeta de `ajuste` (ver ajuste-precios.md, seccion 7).

El grupo 20 suma la clave `ajuste` a su menu.

Para saber que pintar dentro del modulo de marcas usar `data.rol` de `GET /v1/marcas`, no
`tipo` del menu (ver abajo).

---

## 5. Rutas de `/v1/marcas`

Solo para el grupo 25; cualquier otro grupo recibe `403 sin permiso`.

| ruta | quien | para que |
|---|---|---|
| `GET  /v1/marcas` | los dos | estado del mes: mis marcas, si confirme y, si soy jefatura, mi familia |
| `GET  /v1/marcas/anterior` | los dos | mis marcas del mes pasado, para "mantener las del mes anterior" |
| `POST /v1/marcas/disponibles` | los dos | buscador de marcas libres |
| `POST /v1/marcas/confirmar` | los dos | guardar mi lista y bloquearla hasta el mes siguiente |
| `POST /v1/marcas/asignar` | jefatura | dar o pasar marcas de mi familia a un especialista |
| `POST /v1/marcas/retirar` | jefatura | quitar marcas de mi familia a un especialista |
| `POST /v1/marcas/estado` | jefatura | marcar una marca de mi familia como trabajada / no trabajada |

### `GET /v1/marcas`

Es la ruta principal: con ella se pinta todo el modulo.

Especialista:

```json
{ "status":"ok", "codigo":0, "data": {
    "anno": 2026, "mes": 10,
    "rol": "ESPECIALISTA",
    "confirmado": true,
    "confirmadoEn": "2026-10-14T15:20:11.000Z",
    "marcas": [
      { "codmar":"0003", "abrmar":"MEMOR", "nombre":"MEMOREX", "codfam":"09",
        "familia":"ALMACENAMIENTO EXTERNO", "trabajada":true, "asignadaPor":"COSSIO JOANNA" }
    ],
    "familia": null
} }
```

- `rol`: `ESPECIALISTA` o `JEFATURA`. Decide que pantalla mostrar.
- `confirmado`: si es `false`, mostrar el editor de borrador; si es `true`, mostrar las
  marcas en solo lectura.
- `asignadaPor`: `"yo"` si la tomo el propio usuario, o el nombre de quien se la dio (la
  jefatura). Sirve para que el especialista vea que marcas le asignaron.
- `marcas` puede venir vacio.

Jefatura: lo mismo, mas `familia`:

```json
"familia": {
  "codfam": "09",
  "nombre": "ALMACENAMIENTO EXTERNO",
  "marcas": [
    { "codmar":"0124", "abrmar":"ACER", "nombre":"ACER", "trabajada":true,
      "dueno": { "codusu":"071", "nombre":"COSSIO JOANNA", "soyYo":true } },
    { "codmar":"0003", "abrmar":"MEMOR", "nombre":"MEMOREX", "trabajada":true,
      "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":false } },
    { "codmar":"0032", "abrmar":"ADATA", "nombre":"ADATA", "trabajada":true, "dueno": null },
    { "codmar":"0161", "abrmar":"HIKVI", "nombre":"HIKVISION", "trabajada":false, "dueno": null }
  ],
  "especialistas": [
    { "codusu":"229", "nombre":"MANUEL SAUÑE INOCENTE",
      "marcasDeMiFamilia":1, "marcasTotal":1, "confirmado":true }
  ]
}
```

- `familia.marcas`: **todas** las marcas de su familia, primero las trabajadas. `dueno: null`
  = sin asignar. `trabajada: false` = dejo de trabajarse (mostrarlas aparte o atenuadas, con
  opcion de reactivar).
- `familia.especialistas`: **todos** los especialistas registrados (no solo los que tienen
  marcas de su familia), para poder elegir a quien darle una marca. `marcasDeMiFamilia`
  indica cuales trabajan con su familia.
- Si una jefatura no tiene familia cargada, `familia` viene `null`.
- Si la persona es del grupo 25 pero **no esta registrada** en la intranet:
  `400 no identificado` (lo mismo que `/login/identificador`). Igual en `/anterior` y
  `/confirmar`.

### `GET /v1/marcas/anterior`

Para el boton "mantener las marcas del mes anterior". No asigna nada: la pantalla precarga
el borrador con las que vengan `disponible: true` y el usuario confirma.

```json
{ "status":"ok", "codigo":0, "data": {
    "anno": 2026, "mes": 9,
    "marcas": [
      { "codmar":"0003", "abrmar":"MEMOR", "nombre":"MEMOREX", "disponible":true,  "motivo":null, "asignadaA":null },
      { "codmar":"0021", "abrmar":"SONY",  "nombre":"SONY",    "disponible":false, "motivo":"la marca ya no se trabaja", "asignadaA":null },
      { "codmar":"0036", "abrmar":"ZOTAC", "nombre":"ZOTAC",   "disponible":true,  "motivo":null, "asignadaA":null }
    ]
} }
```

`disponible` refleja como esta la marca **ahora**; si otro la toma antes de que el usuario
confirme, aparecera en `omitidas` al confirmar.

### `POST /v1/marcas/disponibles`

Buscador para el borrador (y para la jefatura al asignar). Devuelve marcas que se trabajan y
**nadie tiene este mes**. Maximo 50, ordenadas por nombre.

```json
{ "sugerencia": "eps" }
```

Busca por nombre, abreviatura o codigo exacto. Con `sugerencia` vacia devuelve las primeras
50. Al especialista le muestra marcas de **todas** las familias; a la jefatura solo de la suya.

```json
{ "status":"ok", "codigo":0, "data": [
    { "codmar":"0032", "abrmar":"ADATA", "nombre":"ADATA", "codfam":"09", "familia":"ALMACENAMIENTO EXTERNO" }
] }
```

Lista vacia = no hay coincidencias (no es error).

**Funciona antes de registrarse**, para el buscador del formulario de registro. Quien aun
no esta registrado ve marcas de todas las familias, salvo que ya este cargado como jefatura:
entonces solo las de su familia, igual que despues.

### `POST /v1/marcas/confirmar`

Guarda la lista final del borrador y bloquea. Una sola vez por mes.

```json
{ "marcas": ["0002", "0021"] }
```

Respuesta (200):

```json
{ "status":"ok", "codigo":0, "data": {
    "confirmado": true, "anno": 2026, "mes": 10, "total": 1,
    "asignadas": [ { "codmar":"0002", "abrmar":"TDK", "nombre":"TDK" } ],
    "yaTenia":   [],
    "omitidas":  [ { "codmar":"0021", "abrmar":"SONY", "nombre":"SONY", "motivo":"la marca ya no se trabaja" } ]
} }
```

- `asignadas`: las que se tomaron ahora.
- `yaTenia`: venian en la lista pero ya eran suyas (se las habia dado la jefatura).
- `total`: cuantas marcas tiene en el mes despues de confirmar.
- Las marcas que la jefatura ya le habia dado **se conservan aunque no vengan en la lista**.
  Se puede confirmar con `"marcas": []` si ya tiene marcas dadas por la jefatura.
- Si hubo `omitidas`, mostrarlas: el usuario ya quedo confirmado con el resto.

Si al final **no le queda ninguna marca**, no se confirma y puede volver a intentarlo:

```
409  { "status":"sin marcas asignables", "codigo":3, "msg":"...", "data": { "confirmado":false, "total":0, "omitidas":[...] } }
```

Errores:

| http | status | cuando |
|---|---|---|
| 409 | `marcas ya confirmadas` | ya confirmo este mes |
| 409 | `sin marcas asignables` | ninguna se pudo asignar (ver `data.omitidas`) |
| 403 | `jefatura sin familia` | jefatura sin familia cargada |
| 400 | `marcas invalidas` | lista con forma incorrecta |

### `POST /v1/marcas/asignar` (jefatura)

Da marcas de su familia a un especialista. Si la marca ya era de otro especialista, se la
pasa. Funciona aunque el especialista ya haya confirmado.

```json
{ "codusu": "233", "marcas": ["0002"] }
```

```json
{ "status":"ok", "codigo":0, "data": {
    "especialista": { "codusu":"233", "nombre":"SAMUEL HUARANCCA MEZA" },
    "asignadas": [ { "codmar":"0002", "abrmar":"TDK", "nombre":"TDK", "movidaDe":"SAUÑE MANUEL" } ],
    "yaTenia":   [],
    "omitidas":  []
} }
```

`movidaDe` solo aparece si la marca se le quito a otro. Conviene pedir confirmacion en la
pantalla antes de mover una marca que ya tiene dueño.

Errores: `403 solo jefatura`, `403 jefatura sin familia`, `400 destino invalido` (falta
`codusu` o es el propio), `400 destino no especialista`, `400 marcas invalidas`.

Para tomar marcas para si misma, la jefatura usa `/marcas/confirmar`, no esta ruta.

### `POST /v1/marcas/retirar` (jefatura)

Le quita marcas de su familia a un especialista; quedan sin asignar.

```json
{ "codusu": "233", "marcas": ["0002"] }
```

```json
{ "status":"ok", "codigo":0, "data": {
    "especialista": { "codusu":"233", "nombre":"SAMUEL HUARANCCA MEZA" },
    "retiradas": [ { "codmar":"0002", "abrmar":"TDK", "nombre":"TDK" } ],
    "omitidas":  []
} }
```

Mismos errores que asignar.

### `POST /v1/marcas/estado` (jefatura)

Marca una marca de su familia como trabajada o no trabajada.

```json
{ "codmar": "0161", "trabajada": false }
```

`trabajada` acepta `true`/`false`, `1`/`0` o `"true"`/`"false"`.

```json
{ "status":"ok", "codigo":0, "data": {
    "codmar":"0161", "abrmar":"HIKVI", "nombre":"HIKVISION", "codfam":"09",
    "trabajada": false, "incorporada": false, "asignadaEsteMesA": null
} }
```

- `asignadaEsteMesA`: el **nombre** (texto) de quien la tiene este mes, o `null`. Esa persona
  la conserva hasta fin de mes. Avisarlo.
- `incorporada: true`: la marca existia en el ERP pero no estaba en el catalogo, y quedo
  incorporada a la familia de la jefatura. Asi se agrega una marca nueva.

Errores: `403 solo jefatura`, `403 jefatura sin familia`, `403 marca de otra familia`,
`400 marca desconocida`, `400 estado invalido`, `400 marcas invalidas` (codigo mal formado).

---

## 6. Pantallas sugeridas

**Especialista, sin confirmar** (`rol=ESPECIALISTA`, `confirmado=false`):

1. Mostrar las marcas que ya tiene (`marcas`, normalmente las que le dio la jefatura).
2. Borrador local: buscador (`/disponibles`) para sumar; quitar de la lista; boton
   "mantener las del mes anterior" (`/anterior`, solo las `disponible: true`).
3. Boton **Confirmar**, con aviso: "no podras cambiar tus marcas hasta el mes siguiente".
4. Enviar a `/confirmar`, mostrar `omitidas` si las hay, y volver a pedir `GET /marcas`.

**Especialista, confirmado**: lista de marcas en solo lectura, con `asignadaPor`. Sin
botones de edicion.

**Jefatura** (`rol=JEFATURA`):

- Sus propias marcas: igual que el especialista (borrador + confirmar), con el buscador
  limitado a su familia.
- Panel de su familia (`familia.marcas`), agrupable por dueño o filtrable por "sin asignar":
  - asignar una marca libre a un especialista (`/asignar`)
  - pasar una marca de un especialista a otro (`/asignar`, avisando `movidaDe`)
  - quitarsela (`/retirar`)
  - dejar de trabajarla o reactivarla (`/estado`)
- Lista de especialistas (`familia.especialistas`) con cuantas marcas lleva cada uno y si
  ya confirmo.

Despues de cada accion que escribe, volver a pedir `GET /v1/marcas` para repintar.

---

## 7. Lo que cambio para pantallas existentes

- `/v1/cuota/especialista`, `/v1/cuota/multiple` y `/v1/reporte/marcas` ahora leen las
  marcas **del mes en curso** de las tablas nuevas. La forma de la respuesta no cambio. Si el
  usuario no tiene marcas en el mes, responden `200` con
  `{"status":"sin marcas del mes","codigo":0,"debeAsignar":true,"marcas":{}}` (antes era un 500).
- `POST /v1/login/registro/completado` ya no redirige (ver seccion 3).

## 8. Pendiente (todavia no construir pantallas sobre esto)

Lo de este documento (registro, menu y `/v1/marcas`) esta listo para usarse. Lo siguiente
todavia va a cambiar; este documento se actualizara cuando este hecho:

- **Cuota por marca** (`/cuota/especialista`, `/cuota/marcaupdate`, `/cuota/marcamostrar`):
  se va a rehacer para que la cuota solo se pueda registrar sobre marcas confirmadas, y para
  que la jefatura vea el avance de su familia. Hoy la jefatura recibe `cuota no corresponde`.
- ~~Menu por tipo~~: decidido, jefatura y especialista comparten el mismo menu (seccion 4).

Los **reportes** ya estan hechos: ver [reportes-grupo25.md](reportes-grupo25.md).

---

## 9. Respuestas a [respuesta-marcas.md](respuesta-marcas.md) (2026-10-16)

| duda | respuesta |
|---|---|
| 1 · `/marcas/disponibles` antes del registro | **Funciona.** Ver la ruta en la seccion 5. Pueden dejar la busqueda en el registro |
| 2 · Registro sin marcas | En el **grupo 25** siempre llegan `marcas` (vacias) y `confirmado: false`. En los **demas grupos** solo `{ correcto }`. Antes llegaban siempre, tambien al grupo 20: eso ya se corrigio, asi que su regla «si no trae `marcas` ni `confirmado`, directo al panel» funciona |
| 3 · `CHAKAL` | **Ya no se usa.** El grupo 39 (conocido como «grupo HP») solo acepta `HP`. Retirenlo |
| 4 · `asignadaEsteMesA` | El **nombre**, en texto, o `null` |
| 5 · Jefatura cede una marca propia sin confirmar | **Si, se permite** y el backend ya lo hace (`/marcas/asignar`). Pueden poner el boton; si ya confirmo, la marca vuelve en `omitidas` |
| 6 · `GET /marcas` sin diferenciador | `400 no identificado`, igual que `/login/identificador`. Tambien en `/anterior` y `/confirmar` |
| 7 · Tipos en `GET /login/registro` | **Hecho**: devuelve `diferenciadores`. Ver seccion 3 |

**Sobre el `beforeunload` del borrador:** de nuestro lado no hay objecion; es decision de
ustedes.
