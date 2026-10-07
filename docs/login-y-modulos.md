# Login, galletas y el direccionador de módulos

Cómo funciona el ingreso a la intranet desde que el vendedor manda usuario y contraseña
hasta que la pantalla recibe la lista de módulos que puede pintar.

Está escrito para decidir **cómo armar los módulos en el frontend**: qué datos llegan,
en qué momento, de qué dependen, y qué casos hoy no llegan a ninguna parte.

Todo lo que se afirma está comprobado leyendo el código y consultando la base.

---

## Lo primero, porque cambia el diseño

**Hay dos llaves distintas y el frontend no controla ninguna.**

| llave | de dónde sale | para qué sirve |
|---|---|---|
| `diferenciador` | tabla `tbl_api_vendedores_diferenciador` | **a qué ruta** se redirige al vendedor |
| `id_grupo` | grupo del usuario en el ERP (`fcu0000.codgru`) | **qué módulos** devuelve esa ruta |

Son independientes. El diferenciador decide el camino; el grupo decide el contenido.
Dos vendedores con el mismo diferenciador pueden recibir módulos distintos, y dos con
grupos distintos pueden pasar por la misma ruta.

**El frontend no decide módulos: los recibe.** La pantalla pinta lo que llega en `data`.

---

## El recorrido completo

### Paso 1 · `POST /v1/login`

Dos campos: `cuenta` y `pass`.

```
cuenta=jguayan
pass=••••••••
```

La ruta monta `multer().none()` y `express.json()`, así que acepta tanto
`multipart/form-data` como JSON. Lo mismo vale para `POST /v1/login/registro/completado`.

El backend ejecuta el procedimiento `jc_user_identificador`, que valida la contraseña
contra el ERP (`dbo.fn_DesEncrip`) y devuelve 7 columnas.

Con esas 7 columnas arma un JWS y **pone la galleta `cdk`**. Luego responde:

```
HTTP/1.1 302 Found
Location: /v1/login/identificador
Set-Cookie: cdk=s%3AeyJhbGciOiJIUzI1NiIs…; Domain=compudiskett.com.pe; Path=/;
            Max-Age=86400; HttpOnly; Secure; SameSite=None
```

**Es un redirect, no un JSON.** Con `fetch` y `redirect: 'follow'` (el valor por defecto)
el navegador sigue solo y el frontend ve la respuesta del paso 2.

Si la contraseña no es válida: **500** con `"no esta registrado en el navachof"`.

### Paso 2 · `GET /v1/login/identificador`

Lee `cdk`, busca el `codusu` en `tbl_api_vendedores_diferenciador` y
**pone la galleta `tip`**:

```
HTTP/1.1 200 OK
Set-Cookie: tip=s%3AESPECIALISTA.YbFKDmN5dLd1…; Domain=compudiskett.com.pe; Path=/;
            Max-Age=3600; HttpOnly; Secure; SameSite=None

"{\"correcto\":\"ESPECIALISTA\"}"
```

⚠️ **Ese cuerpo está doble codificado**: hay que hacer `JSON.parse` dos veces. Esta ruta
es de la pantalla de login y quedó fuera del cambio de sobre que se hizo en Crear
cotización; si estorba se migra.

**Aquí termina el login.** Recién con las dos galletas puestas se puede pedir el menú.

### Paso 3 · El desvío: usuario sin diferenciador

Si el usuario existe en el ERP pero **no está en la tabla de diferenciadores**, el paso 2
responde:

```
HTTP/1.1 400 Bad Request
{"status":"no identificado","codigo":2,"msg":"el user no esta registrado en la intranet"}
```

**No es un error: es el camino de alta.** Ese usuario debe pasar por
`GET /v1/login/registro` y `POST /v1/login/registro/completado`, que insertan su
diferenciador (y sus marcas, si corresponde) y recién ahí ponen `tip`.

Es un caso frecuente, no un borde: **52 usuarios de los grupos de ventas no tienen
diferenciador** hoy. El frontend debe tratar ese 400 como «mandar a registro»,
no como «credenciales malas».

### Paso 4 · `GET /v1/vendedor` — el direccionador

Lee las **dos** galletas y redirige según el diferenciador, en minúsculas:

```js
let ruta_dinamica = `/v1/vendedor/${diferenciador.toLowerCase()}`;
res.redirect(ruta_dinamica);
```

→ `/v1/vendedor/cobertura`, `/cartera`, `/zona` o `/especialista`.

Si falta cualquiera de las dos galletas: **401** `"la galleta no existe en el frasco"`.

### Paso 5 · `GET /v1/vendedor/<tipo>` — los módulos

Las cuatro rutas van al **mismo handler**. No cambian según el diferenciador: cambian
según el `id_grupo` que viene dentro de `cdk`.

```json
{
  "status": "ok",
  "codigo": 0,
  "data": {
    "cotizacion": "Permite manejar cotizaciones",
    "factura":    "Modifica ciertos campos de la factura",
    "promocion":  "Permite adjuntar y retirar promociones",
    "cuota":      "Ver el avance de las cuotas",
    "reporte":    "Permite sacar reportes de marcas"
  },
  "nombre": "JUAN CARLOS",
  "grupo": "VENTAS-JEFES DE PROD",
  "tipo": "ESPECIALISTA",
  "tipoCambio": 3.437
}
```

`data` es un **objeto, no un arreglo**: la clave es el identificador del módulo y el valor
es su descripción, lista para usarse como subtítulo de la tarjeta.

`tipoCambio` es el del día (`tbl01tca.tcvta`). Si no hay cargado, llega `null` —
la pantalla debe abrirse igual.

---

## Las dos galletas, por dentro

| | `cdk` | `tip` |
|---|---|---|
| contiene | un JWS (HS256) con 7 campos | un texto plano |
| firma interna | `jws`, con un secreto corto escrito en el código | ninguna |
| firma de cookie | `cookie-parser`, con otro secreto corto | igual |
| caduca | **24 h** | **1 h** |
| tamaño | ~331 caracteres | ~66 caracteres |
| `httpOnly` | sí | sí |
| `secure` / `sameSite` | sí / `None` | sí / `None` |
| `domain` | `compudiskett.com.pe` | `compudiskett.com.pe` |

### Qué lleva `cdk`

El JWS decodificado son las 7 columnas del procedimiento, en orden posicional:

```json
{
  "identificador": "jguayan",             // fcu0000.codusu
  "nombre":        "JUAN CARLOS",         // fcu0000.nomusu
  "codigo":        "V0260",               // fcu0000.codven
  "id_area":       3,                     // tbl_area_esquema.id
  "nom_area":      "VENTAS",              // tbl_area_esquema.area
  "id_grupo":      25,                    // tbl01gna_api.codgru
  "nom_grupo":     "VENTAS-JEFES DE PROD" // tbl01gna_api.nomgru
}
```

Dos campos cargan todo el peso del sistema:

- **`codigo`** (el `codven`) es con el que el backend valida que una cotización sea del
  vendedor que la pide. `/promocion/acoplar` y `/eliminar` lo exigen.
- **`id_grupo`** es el que decide los módulos y los permisos de escritura.

### Qué lleva `tip`

Solo una palabra, de un catálogo de seis en la base:

| diferenciador | usuarios | ¿tiene ruta? |
|---|---|---|
| COBERTURA | 14 | sí |
| CARTERA | 8 | sí |
| ESPECIALISTA | 5 | sí |
| JEFATURA | 2 | **no** |
| HP | 1 | **no** |
| ZONA | 1 | sí |

---

## Lo que el frontend puede y no puede hacer con las galletas

**No puede leerlas.** Las dos son `httpOnly`: `document.cookie` no las ve. No hay forma de
sacar el nombre, el grupo ni el tipo desde el navegador.

Por eso `nombre`, `grupo` y `tipo` tuvieron que agregarse al cuerpo de
`/v1/vendedor/<tipo>`. **Esa respuesta es la única fuente de los datos de sesión.**
Conviene guardarla en el estado de la aplicación al entrar.

**Toda petición necesita `credentials: 'include'`.** Sin eso el navegador no manda las
galletas y todo responde 401.

**No funcionan en `localhost` sobre `http`.** `Domain=compudiskett.com.pe` + `Secure` +
`SameSite=None` exigen HTTPS y ese dominio. El `Access-Control-Allow-Origin` además está
fijo en `https://landing.compudiskett.com.pe`. Para desarrollo local hay que tocar
`cors/conf.js` y las opciones de la galleta; hay una configuración alterna comentada ahí
mismo apuntando a `127.0.0.1`.

---

## Quién llega hasta los módulos, y quién no

Para ver la pantalla hacen falta **tres cosas a la vez**: estar en la tabla de
diferenciadores, que ese diferenciador tenga ruta, y que el grupo tenga mapa de módulos.
Cruzando las tres contra la base:

| grupo | diferenciador | usuarios | resultado |
|---|---|---|---|
| 20 · VENTAS-EJECUTIVOS | COBERTURA | 14 | ✅ entra |
| 20 · VENTAS-EJECUTIVOS | CARTERA | 8 | ✅ entra |
| 25 · VENTAS-JEFES DE PROD | ESPECIALISTA | 4 | ✅ entra |
| 34 · VENTAS-JEFES DE ZONA | ZONA | 1 | ✅ entra |
| 25 · VENTAS-JEFES DE PROD | JEFATURA | 2 | ❌ **404** |
| 39 · VENTAS-JEFE DE PRODU | HP | 1 | ❌ **404** |
| 20 / 25 / 34 / 39 / 32 / 24 | (sin diferenciador) | 52 | ↪ va a registro |

**Entran hoy 27 usuarios.** Tres chocan contra el direccionador y 52 pasan primero por
el alta. (Hay además un registro `ESPECIALISTA` con `codusu` 229 que no resuelve a
ningún grupo válido.)

### Las tres fallas del direccionador

**1 · `HP` y `JEFATURA` no tienen ruta.** El direccionador arma la URL con el
diferenciador en minúsculas, pero el router solo registra `cobertura`, `cartera`, `zona`
y `especialista`. Esos 3 usuarios reciben un 404 al abrir la pantalla.

**2 · Los grupos 32 y 39 no tienen mapa de módulos.** El archivo de módulos solo define
`grupo20`, `grupo25` y `grupo34`; `grupo39` está comentado. Si un usuario de
ADM-SISTEMAS (8 usuarios) o VENTAS-JEFE DE PRODU (5) llegara al paso 5, recibiría
**400 `"no identificado"`** aunque la matriz de permisos sí contempla al grupo 32 para
cotización.

**3 · `tip` caduca en 1 hora y `cdk` en 24.** El direccionador necesita las dos. Pasada la
hora, `/v1/vendedor` responde 401 aunque la sesión siga viva 23 horas más. Si el frontend
trata cualquier 401 como «sesión vencida» y manda al login, **el vendedor es expulsado
cada hora**.

Las tres están identificadas pero **no corregidas**: tocan el login y el catálogo de
grupos, y conviene decidirlas juntos.

---

## Los módulos que puede devolver hoy

| módulo | descripción que llega | grupo 20 | grupo 25 | grupo 34 |
|---|---|---|---|---|
| `cotizacion` | Permite manejar cotizaciones | sí | sí | sí |
| `pedido` | Permite manejar pedidos | sí | — | sí |
| `listas` | Lista tus ventas realizadas | sí | — | sí |
| `factura` | Modifica ciertos campos de la factura | sí | sí | sí |
| `promocion` | Permite adjuntar y retirar promociones | sí | sí | sí |
| `cuota` | Ver el avance de las cuotas | sí | sí | sí |
| `programador` | Permite entregar factura a almacen | sí | — | sí |
| `reporte` | Permite sacar reportes de marcas | — | sí | — |

Los grupos 20 y 34 reciben hoy **exactamente el mismo conjunto**. El 25 es el único que
cambia: pierde pedido, listas y programador, y gana reporte.

**Para armar la pantalla**: recorrer las claves de `data` en vez de escribir una lista fija.
Son 8 identificadores posibles y el conjunto depende del grupo, así que una lista fija
pinta tarjetas que el usuario no puede usar, o esconde las que sí.

---

## Después del menú: permisos por acción

Entrar a un módulo no es lo mismo que poder operar dentro. Cada módulo expone un
`GET /v1/<modulo>` que devuelve las acciones permitidas para el grupo:

```
GET /v1/cotizacion
{ "status":"ok", "codigo":0, "data":["crear","leer","update","delete","alm"] }
```

Esa lista sale de la matriz de `funciones/permisos.js`, que mapea **acción → grupos**:

```js
const cotizacion = {
    "crear":  [20,34,25,32],
    "leer":   [20,25,32,34],
    "update": [20,25,34,32],
    "delete": [25,34,32],
    "alm":    [20,25,34,32]
}
```

**Esto es para pintar, no para autorizar.** El backend vuelve a verificar el permiso del
grupo en cada ruta de escritura — `/promocion/acoplar` y `/eliminar` lo hacen del lado
servidor. Si el frontend se equivoca mostrando un botón de más, la operación igual se
rechaza.

Ojo con el vocabulario: el backend devuelve `crear`, `leer`, `update`, `delete`, `alm`.
Hay que acordar un juego único de nombres entre los dos lados.

---

## Lo que el frontend tiene que decidir

1. **De dónde toma los datos de sesión.** No puede ser la cookie. La respuesta del paso 5
   es la única fuente de `nombre`, `grupo`, `tipo` y `tipoCambio`.

2. **Cómo pinta el menú.** Recorriendo `data`, no con una lista fija: el conjunto depende
   del grupo y hoy ya hay tres combinaciones distintas.

3. **Qué hace con cada código de error.** No todos significan lo mismo:

   | respuesta | significado | qué debería hacer la pantalla |
   |---|---|---|
   | 500 `no cdk user` | contraseña mala | mostrar el error en el login |
   | 400 `no identificado` | falta el alta en la intranet | mandar a `/v1/login/registro` |
   | 401 `falsa galleta` | falta o venció una galleta | reintentar o volver al login |
   | 404 | el diferenciador no tiene ruta | avisar a sistemas, no es del usuario |

   Tratar los cuatro como «vuelve al login» es lo que hace que el caso de `tip` vencida se
   sienta como una caída.

4. **Si el menú se cachea.** `cdk` dura 24 h, así que el grupo no cambia durante la sesión
   y el menú se puede pedir una vez. Pero `tipoCambio` sí cambia en el día.

5. **Si quiere las marcas del vendedor.** `marcas` no llega: necesita otra consulta y solo
   aplica a `ESPECIALISTA`. Si la pantalla las va a usar, se agrega.

---

## Anexo: notas para el backend

No afectan al armado del frontend, pero conviene que estén escritas.

- **El JWS no tiene `exp`.** El payload son solo esos 7 campos: ni emisión ni expiración.
  Lo único que caduca es la cookie. Un token copiado antes de caducar sigue siendo válido
  contra `jws.verify` indefinidamente.
- **Los dos secretos están escritos en el código**, el del JWS y el de
  `cookie-parser`. Como el payload incluye `id_grupo`, quien los tenga puede forjar una
  sesión con los permisos que quiera.

  > Los valores estaban aquí y **se quitaron antes de publicar el repositorio**. Siguen en
  > el código del backend, que es donde hay que cambiarlos: documentarlos no los hacía más
  > seguros y los sacaba de la máquina.
- **El login se repite en 4 archivos.** La función `galleta_credencial` está copiada en
  `identificador.js`, `registro_completo.js` y `redirigir_tipo.js`, cada una con el secreto
  escrito a mano. En promoción ya se reemplazó por `funciones/comunes/auth.js`; falta
  hacerlo en login y vendedor.
