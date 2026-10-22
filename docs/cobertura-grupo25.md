# Grupo 25 — Cobertura de clientes por marca

Contrato del modulo **cobertura** del grupo 25 (especialistas y jefaturas), accion **clientes**:
a que clientes se les vendio cada marca en el mes, cuantas unidades y por cuanto. Implementado y
probado en bdnava08.

**No es la cobertura del grupo 20.** `/cuota/cobertura` es la cuota de los vendedores de tipo
COBERTURA y no cambia. Este modulo vive en `/v1/cobertura`.

> **Actualizado el 21/10/2026**, en respuesta a [respuesta-cobertura.md](respuesta-cobertura.md):
> respuestas en la seccion 8. **Nuevo: los clientes de una marca se exportan a Excel**
> (`&formato=xlsx`, seccion 4) y `/clientes` trae `columnas`.

---

## 1 · Reglas

**Que marcas ve cada uno:** las mismas que en cuota y reportes. El especialista, las suyas del
mes; la jefatura, las asignadas de su familia (las suyas y las de sus especialistas).

**Que mes:** el mes en curso, o uno de los dos anteriores con `?anno=2026&mes=9`, igual que en
cuota. Un mes anterior se ve con las marcas y los dueños que habia ese mes.

**Que cuenta como venta:** exactamente lo mismo que el avance de la cuota (las dos rutas usan la
misma regla):

- mercaderia y licitaciones; no la venta al exterior, servicios ni transferencias gratuitas
- facturas y boletas suman; **las notas de credito restan**
- los descuentos de promocion no se restan
- en dolares y sin IGV

**Que es un cliente de la marca:** un cliente al que en el mes **le quedaron unidades compradas**
(mas de 0, descontando devoluciones). Un cliente que en el mes solo devolvio aparece en la lista
con unidades y venta negativas, pero **no cuenta** en `clientes`.

---

## 2 · Rutas

| ruta | para que |
|---|---|
| `GET /v1/cobertura/marcas` | cada marca con cuantos clientes la compraron, unidades y venta |
| `GET /v1/cobertura/clientes?codmar=0008` | los clientes de una marca; con `&formato=xlsx`, en Excel |

Las dos aceptan `&anno=2026&mes=9`. Solo grupo 25. Solo lectura.

---

## 3 · `GET /v1/cobertura/marcas`

Ejemplo real (especialista 229, octubre de 2026 en bdnava08):

```json
{ "status":"ok", "codigo":0, "data": {
    "anno": 2026, "mes": 10, "actual": true, "rol": "ESPECIALISTA",
    "marcas": [
      { "codmar":"0008", "abrmar":"EPSON", "nombre":"EPSON", "familia":"SUMINISTROS",
        "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":true },
        "clientes":126, "unidades":2714, "venta":35835.86 },
      { "codmar":"0049", "abrmar":"GIGAB", "nombre":"GIGABYTE", "familia":"PARTES Y PIEZAS DE COMPUTADORA",
        "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":true },
        "clientes":17, "unidades":199, "venta":16584.93 },
      { "codmar":"0002", "abrmar":"TDK", "nombre":"TDK", "familia":"ALMACENAMIENTO EXTERNO",
        "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":true },
        "clientes":0, "unidades":0, "venta":0 }
    ],
    "total": { "clientes":143, "unidades":2933, "venta":54173.95 }
} }
```

- `marcas`, ordenadas por nombre. Una marca sin ventas en el mes viene con ceros.
- `total.clientes` son **clientes distintos**: un cliente que compro dos marcas cuenta una vez.
  Por eso no es la suma de los `clientes` de cada marca (126 + 17 + 3 + 0 = 146, pero son 143).
- `total.unidades` y `total.venta` si son la suma.
- `dueno`: para que la jefatura agrupe o filtre por especialista, **por `codusu`**.

---

## 4 · `GET /v1/cobertura/clientes?codmar=0008`

```json
{ "status":"ok", "codigo":0, "data": {
    "anno": 2026, "mes": 10, "actual": true,
    "marca": { "codmar":"0008", "abrmar":"EPSON", "nombre":"EPSON", "familia":"SUMINISTROS",
               "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":true } },
    "columnas": [ { "campo":"codcli", "titulo":"CODIGO" }, { "campo":"ruc", "titulo":"RUC" },
                  { "campo":"nombre", "titulo":"CLIENTE" }, { "campo":"unidades", "titulo":"UNIDADES" },
                  { "campo":"venta", "titulo":"VENTA US$ SIN IGV" }, { "campo":"comprobantes", "titulo":"COMPROBANTES" },
                  { "campo":"ultimaCompra", "titulo":"ULTIMA COMPRA" } ],
    "clientes": [
      { "codcli":"C11859", "ruc":"20542750643", "nombre":"GRUPO CIONICA NEO TECH S.A.C.",
        "unidades":280, "venta":3896.1, "comprobantes":2, "ultimaCompra":"2026-10-09" },
      { "codcli":"C18434", "ruc":"20605855521", "nombre":"GRUPO GLOBAL SOLUTION E.I.R.L.",
        "unidades":67, "venta":2688.71, "comprobantes":1, "ultimaCompra":"2026-10-02" }
    ],
    "total": { "clientes":126, "unidades":2714, "venta":35835.86 }
} }
```

| campo | que es |
|---|---|
| `columnas` | las columnas en el orden del Excel, con su titulo (como en reportes) |
| `codcli` | codigo del cliente en el ERP |
| `ruc` | RUC o documento |
| `nombre` | razon social |
| `unidades` | unidades de la marca en el mes, descontadas las devoluciones. Puede ser 0 o negativo (ver «Unidades en 0 o negativas») |
| `venta` | US$ sin IGV, descontadas las notas de credito |
| `comprobantes` | cuantas facturas, boletas o notas tuvo ese cliente con la marca en el mes |
| `ultimaCompra` | fecha del ultimo comprobante del mes, `AAAA-MM-DD` |

- Ordenados por `venta`, de mayor a menor.
- **Sin tope**: llegan todos los clientes de la marca en el mes. El maximo real en lo que va del año
  es EPSON en marzo, con 636 clientes; la respuesta es liviana y llega en una sola peticion. No hace
  falta paginar.

**Unidades en 0 o negativas.** `unidades` es la suma neta del mes: lo comprado menos lo devuelto.

| `unidades` | por que | cuenta en `clientes` |
|---|---|---|
| mayor que 0 | compro (y quiza devolvio parte) | si |
| 0 | **compro y devolvio todo**; o solo tuvo **notas de credito sin unidades** (rebajas o correcciones de precio, que restan venta pero no unidades); o solo **notas de debito** (suman venta, no mueven mercaderia) | no |
| menor que 0 | devolvio en el mes algo comprado en un mes anterior | no |

En septiembre (bdnava08), de 79 combinaciones marca-cliente en 0: 30 compraron y devolvieron todo,
45 solo tuvieron notas de credito sin unidades y 4 solo notas de debito. Por eso un 0 no siempre es
«devolvio todo»: un texto neutro como *«no cuenta: sin unidades netas en el mes»* sirve para los tres.
- `total.clientes` cuenta solo los que tienen `unidades` mayor que 0. `total.unidades` y
  `total.venta` suman a todos, tambien a los que solo devolvieron.

Ejemplo de lo que se veria en septiembre (bdnava08), con estas reglas:

| marca | clientes | los que mas compraron |
|---|---|---|
| EP_IMPRESORAS `0206` | 60 | TRADING SERVICE M&A S.R.L. (67 u, US$ 20 953,58), GRUPO M & M PRINTER S.A.C. (66 u, US$ 13 063,20), DEVERCOMP TECHNOLOGY S.A.C. (50 u, US$ 11 736,32) |
| AMD `0037` | 41 | MEMORY KINGS PERU S.A.C. (60 u, US$ 20 344,86), CONECTION SERVICE M&M ASOCIADOS S.A.C. (59 u, US$ 19 590,55), IMPORTACIONES PC MASTER STORE E.I.R.L. (71 u, US$ 18 050,13) |

---

### Exportar a Excel

`GET /v1/cobertura/clientes?codmar=0008&formato=xlsx` (tambien `&anno=&mes=`). Igual que en reportes:

- `formato` es `json` (por defecto) o `xlsx`; mayusculas o minusculas da igual.
- Responde el archivo con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
  y `Content-Disposition: attachment; filename="clientes-EPSON-2026-10.xlsx"` (expuesta por CORS).
- Una hoja `clientes` con las mismas `columnas` y **todos** los clientes, en el mismo orden que el JSON
  (tambien los que solo devolvieron). `ULTIMA COMPRA` es fecha de Excel y `VENTA US$ SIN IGV` es un
  numero con dos decimales.
- **Si algo falla, la respuesta es el JSON de error de siempre**, nunca un archivo: miren el
  `Content-Type` antes de guardar, como en reportes.

Ejemplo real (229, EPSON, octubre en bdnava08): 127 filas; la primera, *C11859 · GRUPO CIONICA NEO TECH
S.A.C. · 280 · 3,896.10 · 2 · 09/10/2026*.

## 5 · Errores

| http | status | cuando |
|---|---|---|
| 200 | `sin marcas del mes` | no tiene marcas este mes; en el primer nivel, con `debeAsignar: true` |
| 200 | `sin marcas en ese mes` | un mes anterior sin marcas asignadas |
| 400 | `codmar invalido` | `/clientes` sin `codmar` o con un codigo que no es de 4 digitos |
| 400 | `formato invalido` | `/clientes` con un `formato` que no es json ni xlsx |
| 400 | `periodo invalido` | mas de dos meses atras, un mes futuro, o `anno` sin `mes` |
| 403 | `marca no disponible` | la marca no esta entre las que puede consultar ese mes. **Tambien si no tiene ninguna marca**: con un `codmar` en la mano, `/clientes` responde esto y no `sin marcas del mes` (igual que en reportes) |
| 400 | `no identificado` | no esta registrado en la intranet |
| 403 | `sin permiso` | no es del grupo 25 |

---

## 6 · Menu

**La clave `cobertura` ya esta en el menu del grupo 25** (aviso, como pidieron), para jefatura y
especialista por igual. Ver [marcas-grupo25.md](marcas-grupo25.md), seccion 4.

## 7 · Datos de prueba (bdnava08)

| caso | usuario |
|---|---|
| Especialista con varias marcas | 229 (EPSON con 126 clientes en octubre; TDK con 0) |
| Jefatura | 071 (ACER con 2 clientes) |
| Sin marcas | 270 |

---

## 8 · Respuestas a [respuesta-cobertura.md](respuesta-cobertura.md)

| pregunta | respuesta |
|---|---|
| 1 · `/clientes` de quien no tiene marcas | **`403 marca no disponible`**, como asumieron (y como en reportes): con un `codmar` en la mano, nunca `sin marcas del mes` (seccion 5) |
| 2 · `unidades` en cero | **No siempre es «devolvio todo»**: tambien puede ser solo notas de credito sin unidades (rebajas de precio) o solo notas de debito. En septiembre, 45 de 79 ceros fueron notas de credito sin unidades. Sugerimos un texto neutro (seccion 4) |
| 3 · Tope en `/clientes` | **No hay tope** y no hace falta: el maximo real es 636 clientes (EPSON, marzo). Su «Mostrar los N restantes» basta (seccion 4) |
| Sugerencia · Excel | **Hecho**: `/clientes` con `&formato=xlsx` exporta los clientes de la marca en el mes, igual que reportes (seccion 4, «Exportar a Excel») |

Su lectura del documento (una sola pantalla sin hub, el filtro por `dueno.codusu`, la explicacion de
`total.clientes`, las filas de solo devoluciones) es correcta.
