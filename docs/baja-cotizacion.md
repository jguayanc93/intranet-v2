# Dar de baja una cotización — la ruta ya existe

Respuesta a `eliminar-cotizacion.md`. La ruta está creada, usa el procedimiento del propio
ERP y está probada contra la base, camino de éxito incluido.

Pueden poner `PENDIENTE = false`. **Pero lean antes lo del permiso**, o la pantalla va a
fallar para la mayoría de los vendedores.

---

## El contrato

Tal como lo plantearon:

```
POST /v1/cotizacion/eliminar
{ "ndocu": "009-00971087" }
```

Con la cookie `cdk`. Respuesta correcta:

```json
{ "status": "ok", "codigo": 0,
  "documento": "098-00000037",
  "motivo": "ANULADA DESDE INTRANET(01)" }
```

### Sus tres preguntas

**¿Es `/cotizacion/eliminar` el camino?** Sí, se quedó así.

**¿`ndocu` es el nombre del campo?** Sí, por coherencia con `/promocion/acoplar`, como
propusieron.

**¿Hace falta mandar algo más — un motivo?** Resulta que **sí hay dónde guardarlo**. La
cotización tiene una columna de motivo de anulación y está poblada en el 95% de las
10 398 ya anuladas.

El campo es **opcional**: si no mandan nada, la ruta escribe
`ANULADA DESDE INTRANET(01)`. Si quieren que el vendedor lo elija, el ERP tiene un
catálogo propio para cotizaciones con solo dos entradas:

| código | motivo |
|---|---|
| `01` | Error (otros) |
| `02` | pruebas |

La convención del ERP es escribir el texto con el código entre paréntesis al final:
`ERROR DE PROCEDIMIENTO(02)`. Si mandan `{"motivo":"..."}` se guarda tal cual, recortado a
100 caracteres.

---

## ⚠️ El permiso bloquea a 22 de 27 vendedores

Dar de baja está restringido por grupo, y **el grupo de los ejecutivos no está en la
lista**:

| grupo | diferenciador | usuarios | ¿puede dar de baja? |
|---|---|---|---|
| 20 · VENTAS-EJECUTIVOS | CARTERA | 8 | **no** |
| 20 · VENTAS-EJECUTIVOS | COBERTURA | 14 | **no** |
| 25 · VENTAS-JEFES DE PROD | ESPECIALISTA | 4 | sí |
| 34 · VENTAS-JEFES DE ZONA | ZONA | 1 | sí |

Los 22 del grupo 20 reciben:

```json
{ "status":"sin permiso", "codigo":3, "msg":"su grupo no tiene permiso para esta accion" }
```

con **HTTP 403**.

No es un fallo de la ruta: es lo que dice la matriz de permisos del backend, que para
`cotizacion` → `delete` lista los grupos 25, 34 y 32. La ruta la respeta igual que
`/promocion/acoplar` y `/promocion/eliminar` respetan la suya.

**Hay que decidirlo antes de activar la pantalla.** Si dar de baja es para todos los
vendedores, hay que agregar el grupo 20 a esa lista. Si es a propósito que solo las
jefaturas puedan, entonces la pantalla debería ocultar el botón según los accesos que ya
devuelve `GET /v1/cotizacion`: ahí llega `delete` solo si el grupo lo tiene.

> Es la pieza que ya existía y que ahora cobra sentido: ese listado es justo para esto.

---

## Los `status` que puede devolver

Su tabla, completada. **La aprobada tiene su propio `status`, como pidieron.**

| situación | `status` | HTTP | `msg` |
|---|---|---|---|
| correcto | `ok` | 200 | — |
| no existe, o no es de este vendedor | `coti desconocida` | 403 | la cotizacion no existe o no pertenece a este vendedor |
| **aprobada** | `coti aprobada` | **409** | la cotizacion ya fue aprobada; hay que desaprobarla primero para poder darla de baja |
| ya facturada, pedido o boleta | `coti no anulable` | 409 | la cotizacion ya fue facturada o convertida en pedido; no se puede dar de baja |
| ya dada de baja | `coti ya anulada` | 409 | la cotizacion ya estaba dada de baja |
| número sin serie | `documento ambiguo` | 400 | el numero de cotizacion debe incluir su serie, por ejemplo 009-00970435 |
| su grupo no puede | `sin permiso` | 403 | su grupo no tiene permiso para esta accion |
| la baja no se aplicó | `baja no aplicada` | 500 | la baja no llego a aplicarse y se revirtio; la cotizacion quedo como estaba |

`coti aprobada` y `coti no anulable` son distintos a propósito: la primera se resuelve
desaprobando, la segunda no se resuelve. El `msg` de cada una ya explica qué hacer, así
que mostrarlo tal cual funciona sin que la pantalla interprete nada.

### Sobre «aprobada»

En su documento la equiparan a `flag = 1`. No es eso: `flag = 1` son las **facturadas,
pedidos y boletas**. La aprobada es otra cosa — mismo `flag = 0` que una abierta, pero con
el estado cambiado. Hay 626 así.

Por eso la pantalla no podía distinguirla: **la lista las rotula `cotizado`**, porque esa
etiqueta se calcula de otro campo. Para eso sirve lo siguiente.

---

## La lista ahora dice cuáles son editables

Lo pidieron y está hecho. `/lista/cotis` y `/lista/cotisxdia` devuelven una **posición 7**:

| pos | dato | valor |
|---|---|---|
| 7 | editable | `1` si la cotización sigue abierta y sin aprobar, `0` si no |

Es el booleano ya resuelto que pedían, no el `flag` crudo. Vale `1` exactamente cuando
`/update`, `/almacen` y `/eliminar` la van a aceptar.

Comprobado con una cotización aprobada real:

```
009-00969917   rotulo="cotizado"   editable=0
```

La pantalla la ve como cotizada, pero ya sabe que no debe ofrecerla. Ese caso era
imposible de filtrar antes.

*Modificar*, *Cambiar almacén* y *Dar de baja* pueden filtrar por la posición 7 en lugar de
por el texto del estado. *Ver* las sigue mostrando todas.

---

## Qué hace la ruta por dentro

No inventa una forma de borrar: llama a **`AnulaCotFac`**, el procedimiento que el ERP ya
usa. Así una cotización dada de baja desde la intranet queda idéntica a una dada de baja
desde el ERP.

El procedimiento marca la cabecera y el detalle como anulados, pone los importes y las
cantidades en cero, y guarda el motivo. **No es un borrado real**, como esperaban: la
cotización sigue en la base y desaparece sola de la lista, que ya excluye las anuladas.

Dos cosas que había que resolver alrededor:

**El procedimiento no valida nada.** Anula lo que se le pase: no mira de quién es, ni en
qué estado está, ni si ya estaba anulada. Toda la comprobación vive en la ruta, antes de
llamarlo, y con un bloqueo sobre la fila para que no cambie entremedio.

**Por dentro son dos UPDATE sueltos** (cabecera y detalle). Si el segundo fallara, la
cotización quedaría con la cabecera anulada y el detalle vivo. La llamada va dentro de una
transacción, y después se vuelve a leer la cabecera para confirmar que quedó anulada de
verdad antes de dar la operación por buena. Si no, se revierte y responde
`baja no aplicada`.

---

## Qué se probó

Los siete rechazos, contra cotizaciones reales:

| caso | resultado |
|---|---|
| número inexistente | `coti desconocida` |
| cotización de otro vendedor | `coti desconocida` |
| ya anulada | `coti ya anulada` |
| facturada | `coti no anulable` |
| aprobada | `coti aprobada` |
| número sin serie | `documento ambiguo` |
| número vacío | `documento ambiguo` |

Y el camino de éxito, sobre una cotización de prueba:

```
ANTES    cabecera: flag=0  tota=861.94  toti=155.15  totn=1017.09  motanu=
         detalle : item=1  flag=0  cant=10  tota=861.94  totn=1017.09

DESPUES  cabecera: flag=*  tota=0  toti=0  totn=0  motanu=PRUEBA DE LA RUTA NUEVA(02)
         detalle : item=1  flag=*  cant=0  tota=0  totn=0
```

La cotización se restauró a su estado original al terminar.

---

## Lo que queda por decidir

1. **El permiso del grupo 20.** Es lo que bloquea la pantalla para 22 de 27 vendedores.
2. **Si el vendedor elige el motivo** o se deja el de por defecto.
3. **Si *Modificar* y *Cambiar almacén* pasan a filtrar por la posición 7** en vez de por
   el texto del estado. Es lo que les permite dejar de ofrecer las aprobadas.
