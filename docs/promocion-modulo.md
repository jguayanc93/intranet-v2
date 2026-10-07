# Promoción — las ocho rutas, y dos que no existen

Responde a `promocion-modulo.md`.

Buena noticia para el punto 3, que era el que más les preocupaba: **el servidor ya no mira
lo que manda el navegador.** `/promocion/acoplar` se reescribió hace unas semanas y el
`0.18` escrito a mano no llega a ninguna parte.

Mala noticia para el punto 1: **dos de las cuatro rutas que buscan no existen**, ni en
`127.0.0.1` ni en producción.

---

## 1 · ⚠️ `/coti/buscar` y `/prom/verificar` no existen

No es que estén en otro sitio o con otro nombre. **No hay ninguna ruta `/verificar` en todo
el backend, y el único `/buscar` que existe es el de clientes y el de productos.** Tampoco
hay un prefijo `/v1/coti` ni `/v1/prom`: los módulos montados son `/v1/cotizacion` y
`/v1/promocion`.

Así que el buscador con el que empieza *Aplicar* **nunca ha funcionado contra producción**.
Apuntaba al equipo del vendedor, y aunque se corrigiera el host, al otro lado no hay nada.

Sobre `/prom/verificar`: **dada por retirada**, y con doble motivo. Su lectura de `#nprom`
falla al primer toque, y además la ruta no existe. `/promocion/revisar` la sustituye.

Para buscar la cotización, **lo que ya existe y les sirve es `/lista/cotisxdia`** — la misma
lista que usan *Ver*, *Modificar*, *Cambiar almacén* y *Dar de baja*. Trae el número, el
cliente, el monto, la moneda y `editable`. Es el camino con la propiedad garantizada, y
evita inventar una ruta nueva.

---

## 2 · Las dos que sí existen

### `/promocion/revisar`

```
POST /v1/promocion/revisar
{ "ncoti": "009-00970435" }
```

```json
{ "status": "ok", "codigo": 0, "data": ["14656","15024","13235"] }
```

**Una lista plana de `idprom`**: las promociones que tocan algún producto de esa cotización.
Nada más.

Por dentro lee el detalle, busca qué promociones activas incluyen esos códigos, y
**deduplica**. Esa deduplicación es lo que el código llama `agrupados`, y es un paso
intermedio: lo que sale es la lista única de ids, no un agrupamiento.

> **Lo acabo de cerrar**: esta ruta no comprobaba de quién era la cotización. Leía
> `dtl01cot` por número y punto, así que cualquiera con sesión podía preguntar por la de
> otro vendedor. Ahora entra por la cabecera y filtra por `codven_usu`.

### `/promocion/mostrar`

```
POST /v1/promocion/mostrar
{ "ncoti": "009-00970435", "nprom": "14656" }
```

**`grupos` no se lee en ninguna parte.** Lo busqué en los diecinueve archivos del módulo:
el servidor nunca lo toca. Pueden dejar de mandarlo.

Devuelve las líneas que esa promoción generaría, con el mismo motor y la misma fórmula que
`/promocion/detalle`. Si la cotización ya la tiene aplicada responde
`{"status":"promo ya aplicada","codigo":0}`.

---

## 3 · El `0.18` del navegador: ya no llega

`/promocion/acoplar` recibe hoy **solo esto**:

```json
{ "ndocu": "009-00970435", "nprom": "14656" }
```

`fullpromo` no se usa. El servidor lee el detalle de la cotización, evalúa la promoción con
su motor y arma él mismo las líneas y los importes. **Pueden dejar de calcular el descuento
y su IGV, y dejar de mandarlos.**

Antes no era así: el cuerpo traía las líneas ya armadas y se insertaban tal cual, con lo que
se podía meter cualquier producto a cualquier precio. Por eso se reescribió.

> **Sobre lo que ya está en la base:** sí, los descuentos aplicados antes de ese cambio se
> guardaron con el importe que calculó el navegador. No los he tocado. Si quieren, se puede
> contar cuántos difieren de lo que daría el motor hoy.

### Y sí, acepta subconjuntos

Es exactamente el contrato: **una llamada por promoción elegida**. No hay forma de mandarlas
todas de golpe, y no hace falta.

**Aplicar dos por separado da el mismo resultado que aplicar las dos juntas.** Lo garantiza
el motor: al evaluar una promoción, las líneas que dejaron otras —los `GRATIS/PROM` y los
descuentos `0303-010001`— **no entran en el cálculo**. Solo cuentan los productos reales.

Está comprobado con escritura real: una cotización con dos regalos previos recibió dos
promociones más y las cuatro convivieron, con los montos correctos.

---

## 4 · Quitar de un pedido: hoy no se puede

Respuesta corta a las dos preguntas:

- **No existe `/pedido/readprom`.** El módulo pedido tiene `/mostrar`, `/flete` y `/almacen`,
  y ninguna lista las líneas de promoción.
- **`/promocion/eliminar` solo sabe de cotizaciones.** No es que le dé igual el documento:
  sus consultas nombran `mst01cot` y `dtl01cot` explícitamente. Pasarle un número de pedido
  no borra nada — responde que la cotización no existe.

Así que la baldosa promete algo que no hace, y tienen razón en que es peor que no tenerla.

**Hacerlo es posible y no es grande**: las dos tablas de pedido son gemelas de las de
cotización —`mst01ped` y `dtl01ped`, con los mismos `codi` y `descr` para las líneas de
promoción— y el trigger del flete ya inserta ahí con el mismo SKU `0303-010001`. Sería
duplicar la consulta de borrado contra las tablas de pedido y una ruta que liste sus líneas.

**Lo que no puedo decidir yo** es en qué estados de pedido debe permitirse. En cotización la
regla es `flag='0' y estado='0'`; en pedido hay cinco valores de `apro` cuyo significado
sigue sin confirmarse. Díganme eso y lo hago.

---

## 5 · Las dos pequeñas del contrato

**La descripción de `removeproms` no se usa.** De cada fila solo se leen el documento `[0]`
y el número de ítem `[1]`. El tercer elemento se puede dejar de mandar sin que cambie nada.

Su respuesta es el sobre:

```json
{ "status": "ok", "codigo": 0, "msg": "removido con exito",
  "documento": "009-00971087", "removidas": 2 }
```

`removidas` es el número de líneas que de verdad se borraron, contado con `@@ROWCOUNT`. Si
sale 0 la operación se revierte entera y responde un rechazo, no un «ok» vacío.

**`fullpromo` no hace falta.** Basta `{ndocu, nprom}`, como queda dicho en el punto 3.

---

## 6 · Lo de «solo en dólares»: se mantiene, y ya se distingue

La restricción sigue: `/cotizacion/readprom` solo entrega cotizaciones abiertas y en
dólares.

Pedían un `status` propio para separarlo de «no hay nada», y está hecho. Antes los cinco
motivos respondían lo mismo; ahora:

| situación | `status` | HTTP |
|---|---|---|
| **la cotización va en soles** | `coti en soles` | **200** |
| está en dólares y abierta, pero sin promociones | `promocion no tiene` | 200 |
| no existe, o no es suya | `coti desconocida` | 403 |
| no está abierta | `coti no modificable` | 409 |

`coti en soles` va con **200 y `items: []`**, no con un error: la cotización está bien,
simplemente esta pantalla no le aplica. El `msg` ya trae el texto —«las promociones solo se
aplican a cotizaciones en dólares; esta va en soles»— y se puede enseñar tal cual.

Comprobado con las cuatro contra cotizaciones reales.

---

## 7 · Los dos accesos sin pantalla

`crear` y `leer` están en la matriz con **la lista de grupos vacía**, y una lista vacía
significa «todavía sin restringir»: el backend los deja pasar a cualquiera.

No conceden nada peligroso, porque no hay ninguna ruta detrás. Pero si el hub los pinta,
pintará dos baldosas que no llevan a ningún sitio. Lo más limpio es no enseñarlos hasta que
existan las pantallas.

---

## Resumen de lo que cambió en el backend

| | |
|---|---|
| `/promocion/revisar` | ahora valida que la cotización sea del vendedor |
| `/cotizacion/readprom` | distingue soles, sin promociones, ajena y no editable |

Y lo que **ya estaba hecho** de antes y responde tres de sus preguntas: `/acoplar` toma
`{ndocu, nprom}`, calcula los importes en el servidor y acepta una promoción por llamada.

## Lo que queda pendiente de ustedes

1. **En qué estados de pedido** se puede quitar una promoción, para poder construirlo.
2. Si quieren que **cuente los descuentos históricos** que difieren de lo que daría el motor.
