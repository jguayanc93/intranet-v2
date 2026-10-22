# Grupo 25 — Cuota por marca

Contrato de la cuota por marca del grupo 25 (especialistas y jefaturas): **fijar la meta del mes
de cada marca y ver su avance**. Implementado y probado en bdnava08.

> **Actualizado el 20/10/2026** (dos veces), en respuesta a [respuesta-cuota-marcas.md](respuesta-cuota-marcas.md).
> Lo ultimo: `/cuota/revisar` responde `cuota por marca` al grupo 25, y la redireccion de
> `/cuota/mostrar` lleva las cabeceras CORS (seccion 5; respuestas en la seccion 7).
>
> Lo anterior:
> Cambios respecto a la version anterior:
> - **El cumplimiento de `total` y `porDueno` cuenta solo las marcas con meta** en cada medida, y
>   trae `conMeta` (seccion 3). Antes una marca sin meta inflaba el %.
> - **`proyeccion.cumplimiento.monto`** en cada marca, en `total` y en `porDueno` (seccion 3).
> - **Una meta no puede ser 0**: para quitarla se manda `null` (seccion 4).
> - El ejemplo del `POST` estaba mezclado con otra ejecucion; ya esta corregido (seccion 4).
> - `/cuota/mostrar` redirige a especialista y jefatura a `/cuota/marcas`, y `GET /cuota` ya no
>   le da `crear` al grupo 25 (seccion 5).
> - **Meses anteriores**: `GET /cuota/marcas?anno=2026&mes=9`, hasta 2 meses atras (seccion 3).
> - **`metaMesAnterior`** en cada marca, para precargar el formulario de la meta (seccion 3).
> - Cada marca trae `trabajadaHoy`, y la respuesta `actual` (seccion 3).
> - Respuestas a sus preguntas y sugerencias: seccion 7.

Reemplaza, para el grupo 25, a `/cuota/especialista`, `/cuota/multiple`, `/cuota/marcarevisar`,
`/cuota/marcaupdate` y `/cuota/marcamostrar`, que **se retiraron el 21/10/2026** (responden `404`).
La cuota de cobertura y cartera (grupo 20) no cambia.

---

## 1 · Reglas

**Quien ve que** (las marcas del mes en curso, las mismas que en reportes):

| quien | ve |
|---|---|
| especialista | sus marcas asignadas, con su meta y su avance, y el total |
| jefatura | las marcas asignadas de su familia (las suyas y las de sus especialistas), el **general de cada uno** (`porDueno`) y el total |

**Quien fija la meta:** solo **el dueño de la marca** (el especialista, o la jefatura para sus
propias marcas), y solo **despues de confirmar sus marcas del mes**. La puede **corregir las veces
que haga falta** durante el mes. La jefatura no fija metas de las marcas de sus especialistas.

**Que se mide**, cada una opcional:

| meta | que es |
|---|---|
| `monto` | venta en US$, sin IGV |
| `margen` | rentabilidad en US$ (venta − costo) |
| `margenPct` | rentabilidad en % (margen / venta × 100) |
| `unidades` | unidades vendidas |

La rentabilidad se puede fijar **en US$, en %, o de las dos formas**: si vienen las dos, se
guardan las dos.

**Como se calcula el avance** (en el momento, con las facturas del mes):

- Ventas de la marca **de toda la empresa**, hechas por quien sea: mide como va la marca, no las
  ventas personales de quien la tiene.
- Solo **mercaderia y licitaciones**. No cuentan la venta al exterior, los servicios ni las
  transferencias gratuitas.
- Suman facturas y boletas; **las notas de credito restan** (importe, unidades y costo).
- **Los descuentos de promocion no se restan.**
- En dolares y sin IGV.

**Sin marcas en el mes:** el mismo `sin marcas del mes` + `debeAsignar` de siempre.

---

## 2 · Rutas

| ruta | quien | para que |
|---|---|---|
| `GET  /v1/cuota/marcas` | los dos | metas y avance del mes en curso, o de uno de los dos anteriores |
| `POST /v1/cuota/marcas/meta` | el dueño de la marca | fijar o corregir la meta de una marca |

Solo grupo 25. Fijar la meta se audita.

---

## 3 · `GET /v1/cuota/marcas`

Sin parametros: el mes en curso. Con `?anno=2026&mes=9`: un mes anterior (ver «Meses anteriores»).

Ejemplo real (especialista 229, dia 19 de octubre de 2026, con meta en EPSON y GIGABYTE; RICOH y
TDK sin meta):

```json
{ "status":"ok", "codigo":0, "data": {
    "anno": 2026, "mes": 10, "actual": true, "rol": "ESPECIALISTA",
    "dias": { "mes": 31, "transcurridos": 19, "restantes": 12 },
    "marcas": [
      { "codmar":"0008", "abrmar":"EPSON", "nombre":"EPSON", "familia":"SUMINISTROS",
        "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":true },
        "confirmada": true,
        "trabajadaHoy": true,
        "puedoFijarMeta": true,
        "meta": { "monto":50000, "margen":7000.56, "margenPct":null, "unidades":3000,
                  "actualizado":"2026-10-19T16:02:11.000Z" },
        "metaMesAnterior": { "monto":600000, "margen":null, "margenPct":8, "unidades":60000,
                             "actualizado":"2026-10-20T15:31:57.190Z" },
        "avance": { "venta":35835.86, "costo":33459.34, "margen":2376.53, "margenPct":6.63, "unidades":2714 },
        "cumplimiento": { "monto":71.67, "margen":33.95, "margenPct":null, "unidades":90.47 },
        "proyeccion": { "venta":58469.03, "cumplimiento": { "monto":116.94 } } },
      { "codmar":"0130", "abrmar":"RICOH", "nombre":"RICOH", "familia":"SUMINISTROS",
        "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":true },
        "confirmada": true, "trabajadaHoy": true, "puedoFijarMeta": true,
        "meta": null,
        "metaMesAnterior": null,
        "avance": { "venta":1753.16, "costo":1474.63, "margen":278.53, "margenPct":15.89, "unidades":20 },
        "cumplimiento": { "monto":null, "margen":null, "margenPct":null, "unidades":null },
        "proyeccion": { "venta":2860.42, "cumplimiento": { "monto":null } } }
    ],
    "total": {
      "marcas": 4,
      "conMeta": { "monto":2, "margen":1, "unidades":1 },
      "meta": { "monto":70000, "margen":7000.56, "unidades":3000 },
      "avance": { "venta":54173.95, "costo":50143.99, "margen":4029.96, "margenPct":7.44, "unidades":2933 },
      "cumplimiento": { "monto":74.89, "margen":33.95, "unidades":90.47 },
      "proyeccion": { "venta":88389.08, "cumplimiento": { "monto":122.18 } }
    }
} }
```

(El ejemplo muestra dos de las cuatro marcas; GIGABYTE lleva meta de monto 20 000 y venta
16 584,93, y TDK venta 0.)

**Cada marca:**

| campo | que es |
|---|---|
| `dueno` | quien tiene la marca este mes. `soyYo` si es quien pregunta |
| `confirmada` | el dueño ya confirmo sus marcas de ese mes |
| `trabajadaHoy` | si la marca **hoy** se trabaja. En un mes anterior, `false` avisa que una marca que se tuvo ya no se trabaja |
| `puedoFijarMeta` | mostrar el boton de fijar/corregir meta **solo si es `true`**: es el dueño, ya confirmo y es el mes en curso |
| `meta` | `null` si aun no tiene meta. Cada campo puede ser `null` (esa medida no tiene meta) |
| `metaMesAnterior` | la meta que tuvo **esta marca** el mes anterior, la pusiera quien la pusiera. `null` si no tuvo. Ver «Partir de la meta del mes anterior» |
| `avance` | lo vendido en el mes. `margenPct` es `null` si no hay venta |
| `cumplimiento` | % de cada meta que se lleva: `avance / meta × 100`. `null` donde no hay meta. Puede pasar de 100 |
| `proyeccion.venta` | a este ritmo, cuanto se vendera en el mes: `venta / dias transcurridos × dias del mes` |
| `proyeccion.cumplimiento.monto` | que % de la meta de monto seria esa proyeccion. `null` sin meta de monto |
| `proyeccion` entera | **`null` en un mes anterior**: el mes ya cerro y el avance es el cierre |

**`total`** (y cada `porDueno`):

| campo | que es |
|---|---|
| `marcas` | cuantas marcas suma |
| `conMeta` | cuantas de ellas tienen meta en cada medida |
| `meta` | suma de las metas que existen. **No hay meta de `margenPct`**: no se suman porcentajes |
| `avance` | lo vendido en **todas** las marcas, con o sin meta. `margenPct` calculado sobre la suma |
| `cumplimiento` | **solo con las marcas que tienen meta en esa medida**: la venta de las marcas con meta de monto entre la suma de esas metas, y lo mismo con margen y unidades. `null` si ninguna marca tiene meta en esa medida |
| `proyeccion.venta` | proyeccion de la venta de todas las marcas |
| `proyeccion.cumplimiento.monto` | proyeccion de la venta de las marcas con meta de monto, entre la suma de esas metas |

Con el ejemplo: el cumplimiento de monto es (35 835,86 + 16 584,93) / 70 000 = **74,89 %** (EPSON y
GIGABYTE, las dos con meta); RICOH vende pero no entra. El de margen es el de EPSON, la unica con
meta de margen: **33,95 %**.

**`dias`:** dias del mes, los que ya pasaron (contando hoy) y los que faltan, segun la fecha del
servidor. En un mes anterior: `transcurridos` = `mes` y `restantes` = 0.

**`actual`:** `true` en el mes en curso, `false` en un mes anterior.

### Meses anteriores

`GET /v1/cuota/marcas?anno=2026&mes=9` muestra **como fue ese mes**: las marcas que estaban
asignadas entonces, con **el dueño de ese mes**, su meta y su avance de ese mes. Solo lectura.

- Se puede pedir el mes en curso y **los dos anteriores**. Mas atras, un mes futuro, o `anno` sin
  `mes` (o al reves): `400 periodo invalido`.
- **Una marca nueva** no aparece en los meses en que no estaba asignada.
- **Una marca que ya no se trabaja** aparece en los meses en que se tuvo, con `trabajadaHoy: false`.
- **La jefatura** ve las marcas de su familia que estaban asignadas ese mes, con el general
  (`porDueno`) de quien tenia cada una **en ese mes**.
- `puedoFijarMeta` siempre es `false` y `proyeccion` es `null`.
- **La historia empieza cuando empieza el modulo de marcas**: un mes sin asignaciones responde
  `200 sin marcas en ese mes` (en el primer nivel, sin `data` y sin `debeAsignar`). En bdnava08
  las asignaciones empiezan en octubre de 2026.

Ejemplo real (229 viendo septiembre desde octubre, con asignaciones y meta de prueba en EPSON y
EP_IMPRESORAS; se muestra EPSON):

```json
{ "status":"ok", "codigo":0, "data": {
    "anno": 2026, "mes": 9, "actual": false, "rol": "ESPECIALISTA",
    "dias": { "mes": 30, "transcurridos": 30, "restantes": 0 },
    "marcas": [
      { "codmar":"0008", "abrmar":"EPSON", "nombre":"EPSON", "familia":"SUMINISTROS",
        "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":true },
        "confirmada": true, "trabajadaHoy": true, "puedoFijarMeta": false,
        "meta": { "monto":600000, "margen":null, "margenPct":8, "unidades":60000,
                  "actualizado":"2026-10-20T15:31:57.190Z" },
        "metaMesAnterior": null,
        "avance": { "venta":638611.34, "costo":608154.44, "margen":30456.89, "margenPct":4.77, "unidades":70140 },
        "cumplimiento": { "monto":106.44, "margen":null, "margenPct":59.62, "unidades":116.9 },
        "proyeccion": null }
    ],
    "total": {
      "marcas": 2,
      "conMeta": { "monto":1, "margen":0, "unidades":1 },
      "meta": { "monto":600000, "margen":null, "unidades":60000 },
      "avance": { "venta":822907.01, "costo":782007.1, "margen":40899.91, "margenPct":4.97, "unidades":70981 },
      "cumplimiento": { "monto":106.44, "margen":null, "unidades":116.9 },
      "proyeccion": null }
} }
```

### Partir de la meta del mes anterior

Cada marca trae `metaMesAnterior`: la meta que tuvo **esa marca** el mes anterior. Al abrir «Fijar
meta» de una marca que aun no tiene meta este mes, la pantalla **precarga el formulario** con esos
valores; la persona los revisa, cambia lo que quiera y guarda con el `POST` de siempre.

- **No se guarda nada sola**: la meta del mes existe cuando la persona la guarda.
- La meta es de la marca: se precarga aunque el mes anterior la marca la tuviera otro.
- Una marca nueva, o sin meta el mes anterior, trae `metaMesAnterior: null`: formulario vacio.
- Si la marca ya tiene meta este mes, el formulario es el de corregir, con `meta`.

### Jefatura: ademas, `porDueno`

El general de cada uno: sus especialistas y ella misma. Misma forma que `total`, mas `dueno`.
Ordenado por nombre.

```json
"porDueno": [
  { "dueno": { "codusu":"071", "nombre":"COSSIO JOANNA", "soyYo":true },
    "marcas": 1,
    "conMeta": { "monto":1, "margen":0, "unidades":0 },
    "meta": { "monto":30000, "margen":null, "unidades":null },
    "avance": { "venta":80.78, "costo":42.84, "margen":37.94, "margenPct":46.97, "unidades":4 },
    "cumplimiento": { "monto":0.27, "margen":null, "unidades":null },
    "proyeccion": { "venta":131.8, "cumplimiento": { "monto":0.44 } } },
  { "dueno": { "codusu":"229", "nombre":"SAUÑE MANUEL", "soyYo":false },
    "marcas": 1,
    "conMeta": { "monto":0, "margen":0, "unidades":0 },
    "meta": { "monto":null, "margen":null, "unidades":null },
    "avance": { "venta":0, "costo":0, "margen":0, "margenPct":null, "unidades":0 },
    "cumplimiento": { "monto":null, "margen":null, "unidades":null },
    "proyeccion": { "venta":0, "cumplimiento": { "monto":null } } }
]
```

En la lista `marcas` de la jefatura, las de sus especialistas vienen con `puedoFijarMeta: false`.
Agrupar por `dueno.codusu`, nunca por nombre.

| http | status | cuando |
|---|---|---|
| 200 | `sin marcas del mes` | no tiene marcas este mes; en el primer nivel, sin `data`, con `debeAsignar: true` |
| 200 | `sin marcas en ese mes` | un mes anterior sin marcas asignadas; en el primer nivel, sin `data` |
| 400 | `periodo invalido` | mas de dos meses atras, un mes futuro, o `anno` sin `mes` |
| 400 | `no identificado` | no esta registrado en la intranet |
| 403 | `sin permiso` | no es del grupo 25 |

---

## 4 · `POST /v1/cuota/marcas/meta`

```json
{ "codmar":"0008", "monto":50000, "margen":7000, "margenPct":12.5, "unidades":3000 }
```

Respuesta (real, primera vez que se fija la meta de EPSON en el mes):

```json
{ "status":"ok", "codigo":0, "data": {
    "codmar":"0008", "anno":2026, "mes":10, "nueva":true,
    "meta": { "monto":50000, "margen":7000, "margenPct":12.5, "unidades":3000 }
} }
```

- **Solo se cambia lo que se manda.** Un campo que no viene conserva lo que tenia; un campo en
  `null` (o `""`) **borra** esa meta. Ejemplo: despues de lo anterior,
  `{ "codmar":"0008", "unidades":3500 }` devuelve
  `{ "monto":50000, "margen":7000, "margenPct":12.5, "unidades":3500 }`, y
  `{ "codmar":"0008", "margenPct":null }` devuelve
  `{ "monto":50000, "margen":7000, "margenPct":null, "unidades":3500 }`.
- **Una meta tiene que ser mayor que 0.** Una meta de 0 no existe: para quitar una meta se manda
  `null`. Asi «sin meta» y «meta cero» no se confunden, y el cumplimiento nunca divide entre cero.
- Los numeros pueden ir como numero o como texto numerico. `monto`, `margen` y `margenPct` se
  guardan con dos decimales (`7000.555` queda `7000.56`); `unidades` tiene que ser entero.
  `margenPct` hasta 100.
- `meta` es la meta como quedo. `nueva: true` si es la primera vez que se fija la meta de esa
  marca en el mes. Despues, pedir `GET /cuota/marcas` para repintar.

| http | status | cuando |
|---|---|---|
| 400 | `codmar invalido` | falta `codmar` o no tiene 4 digitos |
| 400 | `meta vacia` | no vino ninguno de `monto`, `margen`, `margenPct`, `unidades` |
| 400 | `meta invalida` | un valor 0 o negativo, no numerico, unidades con decimales, o `margenPct` mayor que 100 |
| 403 | `meta solo del dueno` | la marca no es suya este mes (tambien la jefatura con las marcas de sus especialistas) |
| 409 | `marcas sin confirmar` | aun no confirmo sus marcas del mes: llevarlo a Marcas |
| 400 | `no identificado` | no esta registrado |
| 403 | `sin permiso` | no es del grupo 25 |

---

## 5 · Como llega la pantalla a la cuota

**`GET /v1/cuota/mostrar`** es el direccionador de siempre, y ahora cubre al grupo 25:

| tipo | redirige a |
|---|---|
| `COBERTURA` | `/v1/cuota/cobertura` |
| `CARTERA` | `/v1/cuota/cartera` |
| `ESPECIALISTA`, `JEFATURA` | `/v1/cuota/marcas` |
| otros | `200 cuota no corresponde` |

Pueden dejar de decidir la ruta por el tipo de `/vendedor` y entrar siempre por `/cuota/mostrar`.

La redireccion es un `302` real y **lleva las cabeceras CORS** (comprobado con el backend
configurado como el servidor de prueba):

```
GET /v1/cuota/mostrar
Origin: http://127.0.0.1:8080

HTTP 302
location: /v1/cuota/marcas
access-control-allow-origin: http://127.0.0.1:8080
access-control-allow-credentials: true
```

**`GET /v1/cuota/revisar`** (la entrada de «Registrar» cuota, de cobertura y cartera): para el
grupo 25 ya no redirige a la pantalla antigua; responde

```json
{ "status":"cuota por marca", "codigo":0, "aplica":false, "ruta":"/v1/cuota/marcas",
  "msg":"tu cuota no se registra aqui: se fija por marca, en tu cuota por marca" }
```

Pueden decidir por ese `status` y dejar de mirar el tipo de `/vendedor` tambien ahi.

**`GET /v1/cuota`** (los accesos): para el grupo 25 devuelve
`{"accesos":["leer","marcas","meta marca"]}`, **sin `crear`**: el grupo 25 no registra una cuota
de un solo monto. `marcas` y `meta marca` son los permisos de estas dos rutas; si no los usan para
pintar tarjetas, ignorenlos. El grupo 20 sigue recibiendo `crear` y `leer`.

---

## 6 · Datos de prueba (bdnava08)

Con los usuarios de `querys/sp/datos_prueba_grupo25.sql` (ver reportes-grupo25.md, seccion 6):

| caso | usuario |
|---|---|
| Especialista confirmado, puede fijar metas | 229 SAUÑE MANUEL (EPSON, GIGABYTE, RICOH, TDK) |
| Especialista sin confirmar: `marcas sin confirmar` al fijar | 233 HUARANCCA SAMUEL (ADATA) |
| Sin marcas: `sin marcas del mes` | 270 RUBIÑOS ANDERSON |
| Jefatura con `porDueno`, puede fijar solo ACER | 071 COSSIO JOANNA |
| Marca con venta 0 en el mes (`margenPct: null`) | TDK, ADATA, AVERY |

En bdnava08 las facturas llegan hasta el 09/10/2026: el avance de octubre es de esos dias. La
proyeccion, en cambio, usa la fecha de hoy, asi que en bdnava08 sale mas baja de lo que seria con
datos completos.

**Servidor de prueba:** como conectarse, que cabeceras devuelve y como se ve cada falla, en
[servidor-prueba-grupo25.md](servidor-prueba-grupo25.md). La direccion del servidor y las claves de
las cuentas se las pasa quien coordina con ustedes.

---

## 7 · Respuestas a [respuesta-cuota-marcas.md](respuesta-cuota-marcas.md)

| pregunta | respuesta |
|---|---|
| 1 · El cumplimiento del total mezcla ventas con y sin meta | **Tenian razon, era un error.** Ahora el cumplimiento de `total` y `porDueno` cuenta solo las marcas con meta en cada medida, y viene `conMeta`. Con su ejemplo: **74,89 %** de monto y **33,95 %** de margen (seccion 3) |
| 2 · El ejemplo del `POST` | Estaba mezclado con otra ejecucion. **Si vienen `margen` y `margenPct`, se guardan los dos.** El ejemplo correcto esta en la seccion 4 |
| 3 · Como elige la pantalla la ruta | `/cuota/mostrar` ya redirige a especialista y jefatura a `/cuota/marcas`, y `GET /cuota` ya no da `crear` al grupo 25 (seccion 5) |
| 4 · Una meta de 0 | **No existe**: el `POST` la rechaza con `meta invalida`. Para quitar una meta, `null`. Una meta guardada nunca es 0 |
| 5 · La proyeccion contra la meta | **Hecho**: `proyeccion.cumplimiento.monto` en cada marca, en `total` y en `porDueno` |

Sus decisiones de pantalla (barras sin color de alarma, repedir todo ante `409`/`403`, la leyenda
«mide como va la marca, no tus ventas personales») no necesitan nada del backend y nos parecen
bien.

**Sugerencias:**

| sugerencia | respuesta |
|---|---|
| 1 · Ver meses anteriores | **Hecho**, hasta **2 meses** atras y solo lectura. Ver «Meses anteriores» en la seccion 3 |
| 2 · Partir de las metas del mes anterior | **Hecho**, como precarga del formulario de cada marca (`metaMesAnterior`), no como copia automatica: nada se guarda sin que la persona lo revise. Ver «Partir de la meta del mes anterior» en la seccion 3 |

### Su segunda respuesta (lo aplicado tras el 20/10)

| tema | respuesta |
|---|---|
| Guardar una meta precargada manda todos los campos | De acuerdo: es una meta nueva, no hay nada que borrar |
| Los meses del selector salen de `anno`/`mes` (o del navegador si no hay marcas) | De acuerdo: el backend valida el periodo igual |
| ¿`/cuota/revisar` puede responder «no corresponde» al grupo 25? | **Hecho**: responde `200 cuota por marca` con `ruta` (seccion 5) |
| La redireccion `302` de `/cuota/mostrar` y CORS | **Lleva las cabeceras** `access-control-allow-origin` y `access-control-allow-credentials`; comprobado (seccion 5) |
| El preflight del `POST` de la meta | Comprobado con la ruta real: `204` con las cabeceras de [servidor-prueba-grupo25.md](servidor-prueba-grupo25.md), seccion 2 |

La direccion del servidor de prueba y las claves de las cuentas se las pasa quien coordina.

---

## 8 · Pendiente

- Mas adelante la meta vendra de un grupo superior; hoy la pone el dueño de la marca.
- ~~Retirar las rutas antiguas de cuota por marca~~: hecho el 21/10/2026.
