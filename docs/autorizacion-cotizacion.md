# ¿Una cotización de otro vendedor se puede abrir? — ya no

Respuesta a `propiedad-cotizacion.md`. El análisis que mandaron era correcto, y la
sospecha se quedaba corta: de las cuatro rutas, **tres no comprobaban nada**.

Ya está corregido y probado contra la base.

---

## La tabla que pidieron

| ruta | ¿rechazaba la de otro vendedor? | ahora |
|---|---|---|
| `POST /cotizacion/read` | **No** | **sí** |
| `POST /cotizacion/readprom` | **No** — no la preguntaron | **sí** |
| `POST /cotizacion/update` | **No** | **sí** |
| `POST /cotizacion/almacen` | Sí, ya validaba | sin cambio |
| eliminar | la ruta no existe: está comentada en el router | — |

## Por qué no era evidente

Las tres rutas **sí verificaban la galleta**. Leían `cdk`, comprobaban la firma, decodificaban
el payload… y después lo descartaban. El `codven` nunca llegaba a la consulta.

El efecto era que estaban autenticadas pero no autorizadas: cualquier usuario con sesión
válida podía teclear un número y recibir la cotización de un compañero.

Con `/update` no era solo lectura. La ruta borra el detalle completo y lo reescribe:

```sql
delete from dtl01cot where ndocu=@doc
```

con el documento sacado del cuerpo. Un vendedor podía vaciar y reescribir la cotización de
cualquier otro.

> Tenían razón en no intentar arreglarlo desde el frontend. Para comparar el vendedor hay
> que haber recibido ya la cotización, y la petición de guardar se repite desde la consola.

---

## Cómo quedó

**En `/read` y `/readprom`, el filtro va dentro de la misma consulta**, no en una previa:

```sql
... where a.ndocu=@coti AND ISNULL(c.flag,'')<>'*' AND c.codven_usu=@codven
```

Así no cuesta una segunda ida a la base, y no existe el instante en que la cotización ya
se leyó pero todavía no se comprobó de quién es.

**En `/update` sí es una consulta previa**, porque ahí hay que bloquear antes de borrar.
Reusa el mismo validador que `/almacen` ya usaba, que exige a la vez que la cotización sea
del vendedor y que siga abierta.

### Comprobado

| caso | resultado |
|---|---|
| `/read` · cotización propia | 200, llega el detalle |
| `/read` · cotización ajena | **403**, no llega nada |
| `/readprom` · propia, con promociones | 200, llegan sus líneas |
| `/readprom` · ajena | **403** |
| `/update` · ajena | **403**, y la cotización queda con sus líneas intactas |

---

## Lo que su documento destapó sin querer

**`/cotizacion/read` no podía leer una cotización facturada.**

La consulta exigía `flag='0'`, o sea solo las abiertas. Como la lista ahora muestra también
facturadas, pedidos y boletas, al hacer clic en una habrían recibido:

```json
{"status":"cotizacion no registrada","codigo":2,"msg":"cotizacion inexistente en los registros"}
```

Justo el caso que describen como el más pedido: reimprimir el PDF de una ya facturada.

Verificado antes de tocarlo — `009-00969927` (facturada) rechazaba; `098-00000037`
(abierta) funcionaba.

**Corregido:** `/read` ahora acepta cualquier estado **salvo eliminada**. Encaja con lo que
decidieron para la pantalla: `Ver` las muestra todas, `Modificar` y `Cambiar almacén` solo
las que están en `cotizado`.

`/readprom` mantiene sus restricciones —solo abiertas y en dólares— porque sirve para
editar promociones, y a una facturada ya no se le editan.

---

## Su última pregunta: ¿hay un `status` propio para «no es tuya»?

**No, y es a propósito.** Las tres rutas responden lo mismo que para una cotización que no
existe:

```json
{ "status": "coti desconocida", "codigo": 3,
  "msg": "la cotizacion no existe o no pertenece a este vendedor" }
```

con **HTTP 403**.

Distinguir los dos casos convertiría la ruta en un confirmador de números válidos: tecleando
se podría averiguar qué cotizaciones existen aunque no se puedan abrir.

**Pero el problema que anticipan no se da: el mensaje ya dice las dos cosas.** El vendedor
no lee «no existe», lee «no existe o no pertenece a este vendedor», que es exactamente la
información que necesita para no llamar a sistemas.

Y el código separa los casos que sí conviene distinguir:

| respuesta | significa | qué mostrar |
|---|---|---|
| **403** `coti desconocida` | no existe, está eliminada, o no es suya | el `msg` tal cual |
| **400** `documento ambiguo` | el número vino sin serie | pedir que la incluya |
| **401** `falsa galleta` | la sesión venció | volver al login |
| **500** | fallo del backend | reintentar no ayuda |

Si quieren otro texto para el 403, se cambia el `msg` sin tocar nada más. Lo que no conviene
es partirlo en dos códigos distintos.

### Una excepción

`/readprom` responde `promocion no tiene` tanto si la cotización no es suya como si
simplemente no tiene promociones. Para esa ruta da igual —en los dos casos no hay nada que
pintar— pero conviene saberlo si alguna vez distinguen los dos estados en la interfaz.

---

## Lo que sigue pendiente

**Esto cierra el agujero de autorización, no el de atomicidad.** `/update` sigue borrando el
detalle y reescribiéndolo en tres conexiones sueltas, sin transacción: si falla a mitad, la
cotización queda sin líneas. Es el siguiente trabajo acordado sobre esa ruta.

**La ruta de eliminar no existe todavía.** Cuando se cree, nace con el validador puesto —
es la misma receta que ya usan `/almacen`, `/update`, `/promocion/acoplar` y
`/promocion/eliminar`.

---

## Sobre lo que cambiaron en el frontend

Entrar por la lista es la decisión correcta y ahora está respaldada por el backend: el
camino de la lista ya era seguro, y el del número tecleado dejó de ser un agujero. Las dos
puertas llevan al mismo sitio.

Filtrar por estado en `Modificar` y `Cambiar almacén` también acierta: el backend rechaza
una cotización que no esté abierta, así que ofrecerla sería hacer trabajar al vendedor para
nada. Lo que el frontend oculta por comodidad, el backend lo rechaza por regla.
