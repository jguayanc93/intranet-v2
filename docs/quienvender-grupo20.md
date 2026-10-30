# Grupo 20 — ¿A quien vender hoy?

Contrato del modulo **¿A quien vender hoy?** del grupo 20 (vendedores de cartera y de cobertura). El
vendedor entra, y el sistema le dice **3 clientes para hoy**: **2 para reponer** y **1 para llamar**. Es
una sola ruta, de lectura para la pantalla. Implementado y probado en bdnava08.

Para el vendedor es solo informacion: **no hay boton de cambiar ni de refrescar**. Si lo sugerido no le
sirvio, espera al dia siguiente.

---

## 1 · Reglas

| | |
|---|---|
| **Quien** | solo el grupo 20: cartera y cobertura. El grupo 25 y el 34 reciben `403 sin permiso` |
| **Cuantos** | 3 por dia: los puestos `1` y `2` son **REPONER**, el `3` es **LLAMAR** |
| **Cuando se calcula** | la **primera vez que abre el modulo en el dia** (1 s aprox.). Se graba, y **todo el dia recibe los mismos**. Al dia siguiente, otros |
| **Que cuenta como venta** | lo que facturo el propio vendedor (facturas y boletas, sin anuladas). Un vendedor de **cartera** solo cuenta lo facturado a clientes de cartera, igual que su cuota |
| **Reponer** | un cliente que **compra un producto con ritmo** (3 compras o mas, en los ultimos 12 meses) **y ya le toca**: paso su ritmo habitual y no mas de 3 veces. Se ordenan por lo que vale lo que le toca. Productos de 0,50 US$ o menos no cuentan (son lineas de obsequio o de 0,10) |
| **Llamar** | **compro el mes pasado, este mes no, y compro en 2 o mas de los ultimos 6 meses**. Uno que compro una sola vez fuerte no cuenta. Se ordenan por su compra media mensual |
| **Que no varia a diario** | el cliente que mas valor tiene no se queda: se **rota**. Entre los **10 de mas valor** de cada lista sale primero el que hace **mas tiempo que no se le sugiere**. Un cliente de reponer vuelve a salir a los **5 dias** y uno de llamar a los **10** |
| **Si faltan clientes** | un cupo vacio se llena con un respaldo, en este orden: el resto de reponer, el resto de llamar, **REACTIVAR**, **SIN_COMPRAS** y, solo para cobertura, **LIBRE**. No hay cupo fijo de «explorar» |
| **Nunca se sugiere** | un cliente inactivo, ni la propia empresa ni fabricantes (Samsung, TCL, HP, Brother, ASUS, ADATA, Canon...): una lista explicita de 12 clientes en el codigo |
| **Sin telefono** | la tarjeta no lleva telefono ni contacto |

**Menu:** el grupo 20 trae la clave nueva **`quienvender`** en `GET /v1/vendedor/cartera` y en
`GET /v1/vendedor/cobertura` (*«Los 3 clientes de hoy: 2 para reponer y 1 para llamar»*).

### Los tipos

| `tipo` | por que se sugiere | `valorUsd` es | `productos` son |
|---|---|---|---|
| `REPONER` | productos que suele comprar y ya le tocan | lo que vale lo vencido | hasta 5, con su ritmo (`cada`, `ultima`, `compras`) |
| `LLAMAR` | compro el mes pasado y este mes no | su compra media mensual | lo que **mas lleva** (3 meses): 3 productos |
| `REACTIVAR` | hace 60 dias o mas que no compra (respaldo) | lo que compro en 12 meses | lo que mas llevaba: 3 productos |
| `SIN_COMPRAS` | cliente asignado a el, sin compras en 12 meses (respaldo) | `null` | `[]` |
| `LIBRE` | cliente de la oficina o sin dueño que compro en 12 meses; solo cobertura (respaldo) | lo comprado en 12 meses (a **todos** los vendedores) | `[]` |

Lo normal son 2 `REPONER` y 1 `LLAMAR`. Un `tipo` de respaldo solo aparece cuando el vendedor no tiene
mas candidatos de los anteriores (vendedor nuevo, o que ya vendio a todos). Un `REPONER` puede ocupar el
puesto `3` si no hay a quien llamar, y un `LLAMAR` el `1` o el `2`.

---

## 2 · Ruta

`GET /v1/quienvender`

Sin parametros: el vendedor es el de la sesion.

```json
{ "status":"ok", "codigo":0, "data": {
    "fecha": "2026-10-29",
    "vendedor": { "codven": "V0313", "tipo": "CARTERA" },
    "sugeridos": [
      { "puesto": 1, "tipo": "REPONER", "motivo": "Productos que suele comprar y ya le tocan",
        "codcli": "C17450", "cliente": "SIMAF E.I.R.L.",
        "valorUsd": 2001.14, "ultimaCompra": "2026-09-14",
        "mesesConCompra": null, "facturasMesPasado": null,
        "productos": [
          { "descripcion": "BOTELLA TINTA EPSON T544120-AL NEGRO PARA L3110", "partNumber": "T544120-AL",
            "cantidad": 36, "cada": 10, "ultima": "2026-09-14", "compras": 16 }
        ] },
      { "puesto": 2, "tipo": "REPONER", "...": "..." },
      { "puesto": 3, "tipo": "LLAMAR", "motivo": "Compro el mes pasado y este mes todavia no",
        "codcli": "C16527", "cliente": "SYSTEC CORP PERU S.A.C.",
        "valorUsd": 16496.45, "ultimaCompra": "2026-09-30",
        "mesesConCompra": 6, "facturasMesPasado": 8,
        "productos": [
          { "descripcion": "MOTHERBOARD INTEL ASUS PRIME H610M-F D4 R2.0", "partNumber": "PRIME H610M-F D4 R2.0", "cantidad": 214 }
        ] }
    ],
    "aviso": null
} }
```

| campo | |
|---|---|
| `fecha` | el dia, segun el servidor (`AAAA-MM-DD`) |
| `vendedor.tipo` | `CARTERA` o `COBERTURA` |
| `puesto` | 1, 2 y 3; vienen ordenados |
| `motivo` | una frase corta del por que; la pantalla puede usarla o redactar la suya segun `tipo` |
| `codcli`, `cliente` | el cliente. **No hay telefono** |
| `valorUsd` | dolares; lo que significa depende del `tipo` (tabla de arriba). `null` si no aplica |
| `ultimaCompra` | `AAAA-MM-DD` de su ultima compra a este vendedor, o `null` |
| `mesesConCompra` | **solo `LLAMAR`**: en cuantos de los ultimos 6 meses compro. En los demas, `null` |
| `facturasMesPasado` | **solo `LLAMAR`**: facturas del mes pasado. En los demas, `null` |
| `productos[].cantidad` | en `REPONER`: lo que suele llevar en cada compra; en los demas: lo que llevo en el periodo |
| `productos[].cada` | **solo `REPONER`**: cada cuantos dias suele comprarlo (la mediana) |
| `productos[].ultima`, `compras` | **solo `REPONER`**: su ultima compra de ese producto y cuantas lleva en 12 meses |
| `aviso` | `null`, o un texto cuando `sugeridos` viene vacio |

- Todos los importes son **dolares**; los facturados en soles ya vienen convertidos.
- `productos` puede venir `[]` (`SIN_COMPRAS` y `LIBRE` no tienen).
- **Nada sale de la lista de precios ni del stock**: no hay costo ni stock en la tarjeta.
- Si el vendedor **no tiene ningun cliente que sugerir** (recien empieza y no le asignaron clientes),
  `sugeridos: []` y `aviso: "todavia no hay clientes para sugerirte"`. No es un error y **no se graba nada**:
  se vuelve a intentar la proxima vez que abra el modulo.
- Si en el dia hay menos de 3 candidatos, llegan menos de 3 tarjetas.

---

## 3 · Errores

Siempre el JSON de siempre `{ status, codigo, msg }`.

| http | status | cuando |
|---|---|---|
| 401 | `falsa galleta` | no hay sesion |
| 403 | `sin permiso` | no es del grupo 20, o su tipo de vendedor no es cartera ni cobertura |
| 403 | `usuario sin acceso` | el usuario no tiene acceso a la intranet |
| 400 | `no identificado` | la sesion no trae el usuario o el codigo de vendedor |
| 500 | `error query` | fallo el calculo de las sugerencias |

**Lo que no es un error:** si no se puede **grabar** el dia, o **cerrar** los dias anteriores, el vendedor
recibe su lista igual. Lo unico que se pierde es la memoria entre dias: ese dia el mismo cliente puede
repetirse al dia siguiente. El fallo queda en el log del servidor (`[quienvender]`), como la auditoria.

---

## 4 · Historial de uso

Las sugerencias se guardan en **`tbl_api_quienvender`**, una tabla nueva (script
`querys/sp/quienvender.sql`) **aparte de la auditoria**. No tiene pantalla: se consulta con SELECT.

Una fila por cliente sugerido: el dia, el vendedor, el puesto, el tipo, el cliente, el valor, lo que se le
mostro (JSON) y tres marcas: **`cotizo`, `pidio`, `facturo`** — si **ese mismo dia** el vendedor hizo una
cotizacion, un pedido o una factura a ese cliente (cotizaciones tipo 31, pedidos tipo 32, facturas y
boletas 01 y 03; sin anuladas).

Las marcas se llenan cuando el vendedor **abre el modulo en un dia posterior**, que le cierra los dias
anteriores. No hay proceso nocturno. Hasta entonces valen `NULL`, que no es lo mismo que `0`: `NULL` es
«el dia aun no se cierra» y `0`, «no hizo nada». **El dia de hoy nunca esta cerrado**, y un vendedor que
deja de abrir el modulo deja sus ultimos dias sin cerrar.

```sql
-- que parte de lo sugerido termino en algo, por vendedor y tipo, en el mes
SELECT codven, tipo, COUNT(*) sugeridos,
       SUM(CAST(cotizo AS int)) cotizaron, SUM(CAST(pidio AS int)) pidieron, SUM(CAST(facturo AS int)) facturaron
FROM dbo.tbl_api_quienvender
WHERE cerrado IS NOT NULL AND fecha >= DATEFROMPARTS(YEAR(GETDATE()), MONTH(GETDATE()), 1)
GROUP BY codven, tipo ORDER BY codven, tipo;
```

**Despliegue:** la tabla se crea **una vez por base** con `querys/sp/quienvender.sql`. Ya esta creada en
bdnava08. Mientras no exista en una base, el modulo funciona pero sin memoria ni historial.

---

## 5 · Para probar en bdnava08

La base de prueba esta atrasada (facturas hasta el 2026-10-09, cotizaciones hasta el 23-oct), asi que hoy
no hay sugerencias «de verdad»; las pruebas se hicieron **simulando dias pasados** (la funcion
`armarDia(conexion, yo, 'AAAAMMDD')` de `querys/hoy/quienvender.js` recibe el dia; la ruta nunca lo recibe).

| caso | que se ve |
|---|---|
| V0313 (cartera) o V0278 (cobertura), `GET /quienvender` | 3 tarjetas: 2 `REPONER` y 1 `LLAMAR` |
| El mismo vendedor otra vez el mismo dia | exactamente las mismas, al instante (14 ms) |
| 7 dias seguidos | cada dia otros clientes; los de reponer **vuelven a los 5 dias**, los de llamar a los 10 |
| Dos peticiones a la vez el primer dia | las dos reciben lo mismo; en la tabla quedan 3 filas, no 6 |
| Cobertura sin historial (V0360) | 3 `LIBRE` |
| Cobertura con clientes asignados pero sin compras (V0353) | 3 `SIN_COMPRAS`, rotando |
| Cobertura que dejo de facturar, un dia lejano | 3 `REACTIVAR` |
| Dia siguiente a una sugerencia | la fila anterior queda **cerrada**: sus marcas coinciden con las cotizaciones, pedidos y facturas de ese dia |
| Un usuario del grupo 25 o el 126 (grupo 34) | `403 sin permiso` |
| Un usuario del grupo 20 que no es cartera ni cobertura | `403 sin permiso` |
| Sin sesion | `401 falsa galleta` |

**Contra la base principal (solo lectura)** se comprobaron los tamaños de lista: V0313 tiene 27 clientes
para reponer y 10 para llamar; V0278, 41 y 29. Los clientes excluidos (Compudiskett, Samsung, TCL...)
aparecian en las listas de V0278 y ya no se sugieren.
