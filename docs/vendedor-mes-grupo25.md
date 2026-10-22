# Grupo 25 — Vendedor del mes

Contrato del modulo **vendedor del mes** del grupo 25 (especialistas y jefaturas): de cada una de
sus marcas, **los 3 vendedores del grupo 20 que mas la vendieron en el mes**. Implementado y
probado en bdnava08. Es solo lectura.

> **Actualizado el 22/10/2026**, en respuesta a [respuesta-vendedor-mes.md](respuesta-vendedor-mes.md):
> regla de **desempate**, el total y la participacion **solo con vendedores de venta mayor que 0**
> (cambian algunas cifras del ejemplo), y nuevo campo **`ventasHasta`**. Respuestas en la seccion 6.

---

## 1 · Reglas

- **Que marcas:** las mismas que en cuota, reportes y cobertura. El especialista, las suyas del
  mes; la jefatura, las asignadas de su familia (las suyas y las de sus especialistas).
- **Que mes:** **el mes en curso o el anterior**, nada mas.
- **Quien entra en el ranking:** solo **vendedores del grupo 20** (cobertura o cartera). Las ventas
  de otros grupos no entran ni en el ranking ni en el total.
- **De quien es una venta:** del vendedor de la factura, igual que en la cuota del grupo 20.
- **Que cuenta como venta:** lo mismo que la cuota por marca: mercaderia y licitaciones, facturas y
  boletas suman, las notas de credito restan, los descuentos de promocion no se restan. En dolares
  y sin IGV.
- **El top** son los 3 de mayor venta. Si la marca la vendieron menos de 3, vienen menos; si nadie
  la vendio, el top viene vacio.
- **Desempate:** con la misma venta (al centimo) va primero el de **mas unidades**, luego el de
  **mas clientes** y, si todo empata, el de menor codigo de vendedor. El orden no cambia entre dos
  lecturas.
- **Solo vendedores con venta neta mayor que 0.** El que en el mes devolvio igual o mas de lo que
  vendio de esa marca no entra en el top, ni en `total.vendedores`, ni en `total.venta`. Asi el
  total, el numero de vendedores y la participacion salen siempre del mismo grupo, y ninguna venta ni
  participacion llega en cero o negativa.

**Ojo: `total.venta` de aqui no es el avance de la cuota.** La cuota mide la marca en toda la
empresa y con todas sus devoluciones; aqui el total es solo lo que vendieron los vendedores del grupo
20 con venta mayor que 0. Puede quedar por debajo de la cuota (ventas de otros grupos) o por encima
(devoluciones de vendedores que no entran). Ejemplos reales de octubre: EPSON, cuota US$ 35 835,86 y
aqui US$ 35 670,42; GIGABYTE, cuota US$ 16 584,93 y aqui US$ 16 661,38.

---

## 2 · Ruta

| ruta | para que |
|---|---|
| `GET /v1/vendedormes/top` | el top 3 de cada marca, en el mes en curso |
| `GET /v1/vendedormes/top?anno=2026&mes=9` | lo mismo, en el mes anterior |

Solo grupo 25. En el menu, la clave es **`vendedormes`** (para jefatura y especialista).

---

## 3 · Respuesta

Ejemplo real (especialista 229 viendo septiembre de 2026 en bdnava08, con BROTHER y EPSON):

```json
{ "status":"ok", "codigo":0, "data": {
    "anno": 2026, "mes": 9, "actual": false, "rol": "ESPECIALISTA",
    "ventasHasta": "2026-09-30",
    "marcas": [
      { "codmar":"0009", "abrmar":"BROTH", "nombre":"BROTHER", "familia":"SUMINISTROS",
        "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":true },
        "total": { "venta":150982.18, "vendedores":16 },
        "top": [
          { "puesto":1, "codven":"V0229", "nombre":"GUTIERREZ ALINA", "tipo":"CARTERA",
            "venta":23302.07, "participacion":15.43, "unidades":1583, "clientes":12,
            "anterior": { "puesto":null, "venta":null }, "tendencia":"nuevo" },
          { "puesto":2, "codven":"V0334", "nombre":"GONZALES JUAN", "tipo":"COBERTURA",
            "venta":22150.74, "participacion":14.67, "unidades":929, "clientes":35,
            "anterior": { "puesto":5, "venta":13509.41 }, "tendencia":"sube" },
          { "puesto":3, "codven":"V0336", "nombre":"JIMENEZ VILLANUEVA FERNANDO", "tipo":"CARTERA",
            "venta":20761.95, "participacion":13.75, "unidades":1546, "clientes":12,
            "anterior": { "puesto":1, "venta":38775.05 }, "tendencia":"baja" }
        ] }
    ]
} }
```

**`ventasHasta`:** el ultimo dia del mes con ventas registradas (de todas las marcas),
`AAAA-MM-DD`; `null` si el mes no tiene ventas. Sirve para decir *«con ventas hasta el
09/10/2026»*: a principio de mes el top es de pocos dias. En un mes cerrado suele ser el ultimo dia
habil.

**Cada marca:**

| campo | que es |
|---|---|
| `dueno` | quien tiene la marca ese mes (para que la jefatura agrupe por especialista, por `codusu`) |
| `total.venta` | lo que vendieron de esa marca en el mes **los vendedores del grupo 20 con venta mayor que 0** (US$ sin IGV) |
| `total.vendedores` | cuantos son esos vendedores |
| `top` | hasta 3 vendedores, del que mas vendio al que menos. Vacio si nadie la vendio |

**Cada vendedor del top:**

| campo | que es |
|---|---|
| `puesto` | 1, 2 o 3 |
| `codven`, `nombre` | el vendedor |
| `tipo` | `COBERTURA` o `CARTERA`. `null` si el vendedor aun no se registro en la intranet |
| `venta` | lo que vendio de la marca en el mes, US$ sin IGV |
| `participacion` | % que es su venta de `total.venta`. Siempre mayor que 0 |
| `unidades` | unidades netas de la marca (descontadas devoluciones) |
| `clientes` | a cuantos clientes distintos se la vendio |
| `anterior.puesto` | su puesto en esa marca el mes anterior a este (con las mismas reglas). Puede ser mayor que 3 (estaba fuera del top). `null` si el mes anterior no la vendio, o si devolvio igual o mas de lo que vendio |
| `anterior.venta` | lo que vendio el mes anterior, o `null` |
| `tendencia` | `sube` (antes estaba mas abajo), `baja`, `igual` o `nuevo` (el mes anterior no la vendio) |

La comparacion siempre es con el mes anterior **al que se esta viendo**: viendo septiembre, compara
con agosto; viendo octubre, con septiembre.

---

## 4 · Errores

| http | status | cuando |
|---|---|---|
| 200 | `sin marcas del mes` | no tiene marcas este mes; en el primer nivel, sin `data`, con `debeAsignar: true` |
| 200 | `sin marcas en ese mes` | el mes anterior no tuvo marcas asignadas |
| 400 | `mes no disponible` | un mes que no es el actual ni el anterior, un mes futuro, o `anno` sin `mes` |
| 400 | `no identificado` | no esta registrado en la intranet |
| 403 | `sin permiso` | no es del grupo 25 |
| 401 | `falsa galleta` | sin sesion |

---

## 5 · Para probar en bdnava08

| caso | usuario |
|---|---|
| Especialista con varias marcas | 229 (en octubre: EPSON, GIGABYTE, RICOH con top; TDK con el top vacio) |
| Jefatura | 071 (ACER con 1 vendedor) |
| Sin marcas | 270 |
| Mes anterior | `?anno=2026&mes=9`: en bdnava08 septiembre no tiene marcas asignadas (las asignaciones empiezan en octubre), asi que responde `sin marcas en ese mes` |

En bdnava08 las facturas llegan hasta el 09/10/2026: el top de octubre es de esos dias.

---

## 6 · Respuestas a [respuesta-vendedor-mes.md](respuesta-vendedor-mes.md)

| pregunta | respuesta |
|---|---|
| 1 · El desempate | Con la misma venta va primero el de **mas unidades**, luego el de **mas clientes**, y si todo empata el de menor codigo de vendedor. Es fijo: no cambia entre lecturas (seccion 1) |
| 2 · Ventas netas en cero o negativas | **No entran en nada**: ni en el top, ni en `total.vendedores`, ni en `total.venta`. Antes el total si las restaba, y el total y la participacion no salian del mismo grupo; ya esta corregido. Por eso cambian algunas cifras del ejemplo (BROTHER: total 150 982,18; Alina 15,43 %). Nunca llega una venta ni una participacion en cero o negativa |
| Sugerencia · desde que dia llegan los datos | **Hecho**: `ventasHasta` (seccion 3) |
| Sugerencia · mas de tres | En evaluacion por negocio; la respuesta va en la proxima version |

Su lectura del documento (una sola pantalla, el top tal como llega, «Nadie del grupo 20 la vendio
este mes», el vendedor sin `tipo`, la tendencia por texto, el filtro de la jefatura) es correcta.
