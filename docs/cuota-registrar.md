# Modulo de cuota — contrato de las rutas

Dos problemas distintos, los dos del lado del cliente, y el contrato completo para
cerrarlos.

---

## 1. Registrar: por que sale "el monto debe ser mayor que cero"

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

### El contrato

#### `POST /v1/cuota/update`

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

#### Respuesta cuando sale bien

```json
{ "status": "ok", "codigo": 0, "permitido": true,
  "cuota": 220000, "family": "06", "objetivo": 0 }
```

`cuota`, `family` y `objetivo` son **lo que quedo guardado**, no lo que se mando. Sirven
para pintar la confirmacion sin volver a preguntar.

#### Errores

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

---

## 2. Ver la cuota: `/mostrar`, no `/revisar`

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

---

## 3. "No tiene ninguna cuota registrada" no es un fallo

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


---

## 4. Ver el avance: la pantalla carga pero sale vacia

Sintoma: la barra queda en 0.0 %, y "Meta del mes" y "Llevas" muestran un guion. No es
que no llegue la respuesta: llega entera, y la meta viene dentro.

El motivo es **donde esta el dato**. La respuesta no trae los campos arriba del todo:

```json
{ "status": "ok", "codigo": 0,
  "data": { "meta": 220000, "avance": 0, "porcentaje": "0.00 %", ... } }
```

Asi que es `respuesta.data.meta`, no `respuesta.meta`. Leyendo un nivel mas arriba todo
sale `undefined`, que es exactamente el guion de la imagen.

### Por que costaba acertar

Cada ruta de cuota devolvia el objeto bajo un nombre distinto, y uno de ellos colisionaba:

| ruta | clave que usaba | que contenia |
|---|---|---|
| `/cuota/cartera`, `/cuota/cobertura` | `simple` | el objeto del avance |
| `/cuota/multiple`, `/cuota/especialista` | `multiple` | el objeto del avance |
| `/cuota/marcamostrar` | `estimado` | el objeto del avance |
| `/cuota/simple` | `simple` | **un texto**, no un objeto |

La misma clave `simple` significaba una cosa en una ruta y otra distinta en otra. Eso es
culpa del backend, y ya esta corregido: **las cinco rutas devuelven ahora el objeto en
`data`**, siempre en el mismo sitio.

Las claves viejas (`simple`, `multiple`, `estimado`) siguen ahi con el mismo contenido para
no romper lo que ya las lee, pero **lo nuevo deberia usar `data`**.

### Los campos de la pantalla de avance

```json
{
  "meta": 220000,                 // la cuota del mes, numero
  "avance": 0,                    // facturado hasta hoy, numero. Nunca null
  "porcentaje": "0.00 %",         // TEXTO ya formateado, con el simbolo
  "falta": 220000,                // lo que queda, numero
  "mensaje": "arranca el motor que la carrera ya salio",
  "diastexto": "aun tienes mas de la mitad de mes",

  "codfam": "06",                 // objetivo especifico: familia
  "objesp": 0,                    // porcentaje del objetivo especifico
  "objspec_cuota": 0,
  "objspec_avance": 0,
  "objspec_porcentaje": null,

  "ritmo":      { "esperado":22.6, "real":0, "estado":"detras",
                  "cierreTipico":85.8, "historico":[{"periodo":"2026-09","porcentaje":42.3}] },
  "notas":      { "facturado":0, "restado":0, "porcentaje":0, "avisar":false },
  "reposicion": { "total":191480.58, "clientes":50, "top":[ ... ] }
}
```

**Cuidado con `porcentaje`:** es un **texto** con el simbolo (`"0.00 %"`), no un numero.
Pasarlo tal cual a una barra de progreso da 0 siempre. Para la barra conviene calcularlo:
`avance / meta * 100`.

`ritmo`, `notas` y `reposicion` pueden venir en **`null`** si su consulta falla. Esta hecho
a proposito para que la pantalla abra igual aunque uno de los cuatro bloques no cargue; hay
que contemplarlo al pintar.

### Y antes de llegar ahi: la redireccion

`GET /v1/cuota/mostrar` responde **302** y manda a `/cuota/cobertura`, `/cuota/cartera` o
`/cuota/especialista` segun el tipo de vendedor. El cliente HTTP tiene que:

- **seguir la redireccion** (con `axios`, ojo si teneis `maxRedirects: 0`);
- **mandar las cookies en el salto** (`fetch` necesita `credentials: "include"`).

Si no, la peticion termina sin cuerpo y la pantalla sale igual de vacia, pero por otro
motivo. Merece la pena comprobar en la pestaña de red si la respuesta que estais leyendo es
la del 302 o la de `/cartera`.

## Lo que esta en vuestras manos

1. Cambiar el nombre del campo a **`fijado`** en el POST de registro. Es el unico cambio
   necesario para que el formulario funcione.
2. Pedir el avance a **`/v1/cuota/mostrar`**, no a `/revisar`. Si ya usabais `/revisar`
   para eso, ahora responde 200 en vez de 403, pero no trae el avance: solo dice si queda
   cuota por registrar.
3. Tratar `debeRegistrar: true`, `aplica: false` y `puedeRegistrar: false` como estados de
   pantalla, no como errores.
4. Leer el avance de **`respuesta.data`**, no del primer nivel, y calcular el porcentaje
   de la barra con `avance / meta`, porque `porcentaje` viene como texto.
5. Comprobar que el cliente HTTP **sigue el 302 de `/mostrar` mandando las cookies**.
6. Decirnos si preferis otro nombre para el campo `fijado`. Cambiarlo ahora es barato;
   cuando este en produccion y usandose, ya no.
