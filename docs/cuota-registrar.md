# Registrar la cuota del mes — por que sale "el monto debe ser mayor que cero"

El formulario manda **220000** y la pantalla responde *"el monto de la cuota debe ser un
numero mayor que cero"*. El monto esta bien escrito: el problema es el **nombre del campo**
en el cuerpo del POST.

El backend lee el monto de **`fijado`**. Si llega con cualquier otro nombre, el valor no
existe, y la validacion del monto es la primera que lo nota.

```
{ "cuota":  220000 }   ->  400   "el monto de la cuota debe ser un numero mayor que cero"
{ "monto":  220000 }   ->  400   "el monto de la cuota debe ser un numero mayor que cero"
{ "fijado": 220000 }   ->  200   registrada
```

El nombre `fijado` viene del backend original y se mantuvo para no romper nada que ya lo
usara. Si os estorba, se puede cambiar o aceptar los dos; decidlo y se hace.

---

## El contrato

### `POST /v1/cuota/update`

```json
{ "fijado": 220000 }
```

| campo | obligatorio | que es |
|---|---|---|
| `fijado` | **si** | el monto de la cuota, en dolares. Acepta numero (`220000`) o texto numerico (`"220000"`) |
| `porcentaje` | no | objetivo especifico, en porcentaje. Si no se manda se guarda `0` |
| `objetivo_especial` | no | nombre de la familia del objetivo especifico. Si no se manda se guarda COMPONENTES |

Si se usa `objetivo_especial`, el texto tiene que ser **exactamente** uno de estos; cualquier
otra cosa cae en COMPONENTES sin avisar:

```
ACCESORIOS Y PERIFERICOS    EQUIPOS INFORMATICOS    COMPONENTES
ALM. EXTERNO                IMPRESION               TELEFONIA
```

**Cookies.** Ademas de `cdk` hace falta `tip`, la del tipo de vendedor. Sin ella la
respuesta es `401 falsa galleta`, que es facil de confundir con "sesion caducada".

### Respuesta cuando sale bien

```json
{ "status": "ok", "codigo": 0, "permitido": true,
  "cuota": 220000, "family": "06", "objetivo": 0 }
```

`cuota`, `family` y `objetivo` son **lo que quedo guardado**, no lo que se mando. Sirven
para pintar la confirmacion sin volver a preguntar.

### Errores

| HTTP | `status` | que significa | que hacer |
|---|---|---|---|
| 400 | `cuota no enviada` | el cuerpo no trae `fijado` | **es un error del cliente**: revisar el nombre del campo |
| 400 | `cuota invalida` | `fijado` llego, pero vale cero, negativo o no es un numero | marcar el input y pedir otro valor |
| 409 | `cuota ya registrada` | ya hay cuota de este mes | la cuota es irreversible: llevar a la pantalla de avance |
| 401 | `falsa galleta` | falta `cdk` o falta `tip` | mandar al login |

El caso del campo ausente **antes no se distinguia**: respondia el mismo mensaje que un monto
malo, que es justo lo que os hizo perder tiempo buscando el fallo en el formulario. Ahora son
dos mensajes distintos, asi que si vuelve a pasar se ve de inmediato de que lado esta.

---

## Ver la cuota: `/mostrar`, no `/revisar`

Son dos rutas con nombres parecidos y trabajos distintos. Confundirlas da el sintoma
"registre la cuota y ahora no la puedo ver".

| ruta | pregunta que responde | redirige a |
|---|---|---|
| `GET /v1/cuota/revisar` | **¿puedo registrar?** | `/simple` (grupo 20), `/multiple` (25), `/superior` (34) |
| `GET /v1/cuota/mostrar` | **¿como voy?** | `/cobertura`, `/cartera` o `/especialista` segun el tipo |

La pantalla de avance cuelga de **`/mostrar`**. `/revisar` solo sirve para decidir si se
pinta el formulario de registro.

### Y `/revisar` ya no devuelve error cuando la cuota existe

Hasta ahora, en cuanto el vendedor registraba su cuota, `/revisar` respondia **403
"vendedor tiene un registro de cuota de este mes"**. Que la cuota ya este registrada no es
un fallo: es la mitad de la respuesta a la pregunta que se le hizo. Devolver un 403 obligaba
a tratar como error el caso normal.

Ahora las dos salidas son **200** y se decide con un booleano:

```json
{ "status":"ok", "codigo":0, "simple":"registro permitido",
  "puedeRegistrar": true,  "yaRegistrada": false, "monto": null }

{ "status":"ok", "codigo":0, "simple":"cuota existe",
  "puedeRegistrar": false, "yaRegistrada": true,  "monto": 220000 }
```

El campo `simple` conserva el texto que devolvia antes, por si ya lo leeis. Lo que hay que
mirar es **`puedeRegistrar`**.

---

## Lo otro que vais a ver: "no tiene ninguna cuota registrada"

No es un fallo, y conviene saberlo antes de perseguirlo.

La cuota se registra **una vez al mes y la registra el propio vendedor**. Mientras no lo
haga, no hay nada que mostrar. Comprobado en la base de pruebas: el ultimo periodo cargado
es **septiembre 2026**; para octubre no hay ni una fila de nadie.

Por eso `/v1/cuota/mostrar` responde **200**, no un error:

```json
{ "status": "cuota no existe", "codigo": 0,
  "msg": "todavia no registraste tu cuota de este mes",
  "debeRegistrar": true, "meta": 0, "avance": 0, "porcentaje": null }
```

Es un 200 a proposito: no ha fallado nada, simplemente toca registrar. La pantalla deberia
mirar **`debeRegistrar`** y mandar al formulario, en lugar de tratarlo como error.

Y el caso vecino, que tampoco es error:

```json
{ "status": "cuota no corresponde", "codigo": 0,
  "msg": "tu tipo de vendedor no lleva cuota mensual", "aplica": false }
```

Solo COBERTURA, CARTERA y ESPECIALISTA llevan cuota. A JEFATURA, ZONA y HP no se les ha
cargado nunca, asi que para ellos el modulo no deberia ni aparecer. Se distingue por
**`aplica: false`**.

### Resumen del flujo

```
GET  /v1/cuota/mostrar          <- SIEMPRE por aqui para ver el avance
   |
   +-- status "cuota no corresponde"  ->  no mostrar el modulo       (aplica: false)
   +-- status "cuota no existe"       ->  formulario de registro     (debeRegistrar: true)
   |                                        POST /v1/cuota/update  { "fijado": <monto> }
   |                                        y volver a /mostrar
   +-- 200 con datos                  ->  pantalla de avance

GET  /v1/cuota/revisar          <- solo para saber si toca ofrecer el formulario
   |
   +-- puedeRegistrar: true   ->  ofrecer el formulario
   +-- puedeRegistrar: false  ->  ya tiene cuota este mes; mandar a /mostrar
```

`/v1/cuota/mostrar` **redirige** segun el tipo de vendedor (`/cobertura`, `/cartera`,
`/especialista`), asi que el cliente HTTP tiene que seguir redirecciones y mandar las
cookies en el salto.

---

## Lo que esta en vuestras manos

1. Cambiar el nombre del campo a **`fijado`** en el POST de registro. Es el unico cambio
   necesario para que el formulario funcione.
2. Pedir el avance a **`/v1/cuota/mostrar`**, no a `/revisar`. Si ya usabais `/revisar`
   para eso, ahora responde 200 en vez de 403, pero no trae el avance: solo dice si queda
   cuota por registrar.
3. Tratar `debeRegistrar: true`, `aplica: false` y `puedeRegistrar: false` como estados de
   pantalla, no como errores.
4. Decirnos si preferis otro nombre para el campo `fijado`. Cambiarlo ahora es barato;
   cuando este en produccion y usandose, ya no.
