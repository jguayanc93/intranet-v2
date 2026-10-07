# Cuota — cerrado para cobertura y cartera, documentado para especialista

Responde a `respuesta-cuota.md`. Las cuatro decisiones están aplicadas, y al final va lo
del especialista con la forma de `multiple`, que era lo único que faltaba.

---

## Las cuatro decisiones, aplicadas

| | decidieron | hecho |
|---|---|---|
| 1 | se queda `marcarevisar`, fuera `marcawach` | ✓ retirada, con su handler y su query |
| 2 | `jefatura`/`hp`/`zona` con `status` propio, no 404 | ✓ `cuota no corresponde`, 200 |
| 3 | retirar `/cuota/desechar` | ✓ retirada, con sus dos queries |
| 4 | dejar las frases | ✓ sin tocar |

El módulo pasó de **trece rutas a once**, y de 15 archivos de función a 14.

---

## 1 · `jefatura`, `hp` y `zona`: no era que faltara la ruta

Lo comprobé antes de decidirlo, porque su pregunta era la correcta: **en toda la historia
de la tabla de metas solo hay cuotas de COBERTURA y CARTERA.**

| tipo | metas cargadas, histórico |
|---|---|
| COBERTURA | 36 |
| CARTERA | 12 |
| ESPECIALISTA · JEFATURA · ZONA · HP | **ninguna** |

A esas tres nunca se les cargó una. No falta la ruta: no les toca. Son **4 personas** en
total.

El direccionador ahora responde:

```json
{ "status": "cuota no corresponde", "codigo": 0,
  "msg": "tu tipo de vendedor no lleva cuota mensual", "aplica": false }
```

Con **200**, como pidieron. Comprobado con los seis tipos:

```
COBERTURA     redirige a  /v1/cuota/cobertura
CARTERA       redirige a  /v1/cuota/cartera
ESPECIALISTA  redirige a  /v1/cuota/especialista
JEFATURA      HTTP 200   cuota no corresponde
ZONA          HTTP 200   cuota no corresponde
HP            HTTP 200   cuota no corresponde
```

> Si algún día se decide que jefatura sí lleva cuota, es añadir el tipo a una lista de tres
> nombres en `funciones/cuota/mostrar.js`. Queda preparado para eso.

---

## 2 · Lo retirado

**`/cuota/desechar`** y **`/cuota/marcawach`** ya no existen. Llamarlas da 404.

Con ellas se fueron cinco archivos que no usaba nadie más: sus dos handlers y tres
consultas. Sobre los 509 códigos, de acuerdo con su lectura: si fueran una lista de empuje
haría falta una meta por código, y eso es una funcionalidad nueva.

El módulo queda así:

| ruta | método | para qué |
|---|---|---|
| `GET /v1/cuota` | GET | accesos del grupo |
| `GET /v1/cuota/mostrar` | GET | direccionador |
| `GET /v1/cuota/cobertura` · `/cartera` | GET | **el avance del mes** |
| `GET /v1/cuota/especialista` | GET | el caso `multiple`, ver abajo |
| `GET /v1/cuota/revisar` | GET | si ya registró |
| `POST /v1/cuota/update` | POST | **registrar, una vez al mes** |
| `POST /v1/cuota/marcamostrar` · `/marcarevisar` · `/marcaupdate` | POST | por marca |
| `GET /v1/cuota/simple` · `/multiple` | GET | — |

---

## 3 · Sobre el `.toFixed()`

Su lectura es exacta: desde el frontend se habría visto como «a veces la intranet entera
deja de responder», y el rastro no lleva a la cuota.

Un apunte por si vuelve a pasar: el proceso sobrevive porque `index.js` captura
`uncaughtException`, pero la petición que lo provocó **se queda colgada sin responder**.
Así que el síntoma real es una pantalla que no carga y, detrás, una línea en el log del
servidor. Si alguna vez ven eso, el log es el sitio donde mirar.

---

## 4 · El especialista: la forma de `multiple`

Sin urgencia, como dicen, pero aquí está documentado para cuando toque.

### Qué devuelve hoy

```
GET /v1/cuota/especialista
```

```json
{ "multiple": {
    "nombre": "CUBA NESTOR",
    "tipo": "ESPECIALISTA",
    "marcas": {
      "0208": ["HW-AD", "HW-ADATA"],
      "0036": ["ZOTAC", "ZOTAC"],
      "0071": ["MSI", "MSI"],
      "0038": ["XFX", "XFX"]
    } } }
```

La clave es el **código de marca**, y el par es `[abreviatura, nombre]`.

**Y eso es todo lo que devuelve.** No trae meta, ni avance, ni porcentaje: es solo **la
lista de marcas que ese especialista tiene asignadas**. El avance por marca se pide aparte,
con `/cuota/marcamostrar`.

Sale de `tbl01api_vendedores_marcas`, donde el campo `marcas` es **un JSON guardado como
texto** que el backend parsea.

### Las tres respuestas que pedían

**¿Los cuatro añadidos aplican ahí?** Hoy **no**: `falta`, `ritmo`, `notas` y `reposicion`
están colgados de `/cobertura` y `/cartera`, que son los que tienen una meta única.

Y conceptualmente solo dos tendrían sentido por marca: `falta` y `ritmo`. Las notas de
crédito y la reposición son del vendedor entero, no de una marca — repetirlas en cada fila
sería decir lo mismo cinco veces.

**¿Cómo se registra?** Por marca. La meta vive en `tbl01api_jefaturas_meta`, con clave
`codmar + codusu + año + mes` y columnas `monto`, `costo`, `rentabilidad`, `unidades` y
`avance`. Una llamada a `/marcaupdate` por marca.

**¿La regla de una vez al mes?** Por el diseño de la tabla, **por marca**: la clave incluye
`codmar`, así que registrar ADATA no impide registrar MSI. Lo que no debería poder es
registrar ADATA dos veces.

> **Eso último todavía no está cerrado.** El guardado de `/cuota/update` ya lo exige, pero
> `/marcaupdate` no se tocó. Cuando se monte la pantalla del especialista hay que ponerle
> la misma guarda, y entonces sí conviene decidir si la regla es por marca o por conjunto.

### Lo que conviene saber antes de montarla

**`tbl01api_jefaturas_meta` tiene una sola fila, de un solo vendedor.** Y
`tbl01api_vendedores_marcas` tiene las marcas de los especialistas, pero las metas por
marca prácticamente no se han usado.

O sea que esto no es «una pantalla que funciona y hay que migrar»: es **una funcionalidad
que casi no se ha estrenado**. Merece la conversación que ustedes proponen sobre qué
enseñarle a un especialista, antes que una migración fiel de algo que nadie usa.

Tiene además una columna `avance` que se guarda en la tabla, en vez de calcularse. Si se
retoma, habría que decidir si se mantiene así o se calcula como en el resto del módulo.

---

## Lo que queda abierto

Nada de cobertura y cartera: el módulo está cerrado por los dos lados.

Del especialista, cuando se retome: la guarda de una vez al mes en `/marcaupdate`, si los
cuatro añadidos aplican por marca, y qué hacer con la columna `avance` guardada.
