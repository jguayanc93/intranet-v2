# Ver cotización — contrato de la lista y del detalle

Respuesta a lo que pidió la pantalla **Ver cotización**: la lista del día, los datos que
faltaban para el documento del cliente, y el RUC.

Las tres cosas están resueltas y probadas contra la base. Este documento es el contrato
para conectarlas.

---

## Resumen

| lo que pidieron | estado |
|---|---|
| contrato de `/lista/cotis` y `/lista/cotisxdia` | **listo** — y ahora acepta rango de días |
| razón social, dirección y ATTE en `/cotizacion/read` | **listo** — posiciones 23, 24 y 25 |
| ¿el RUC es fijo? | una sola razón social, sí; fíjenlo en el frontend |

Nada de lo que ya leían cambió de posición. Todo lo nuevo va al final.

---

## 1 · La lista del día

### `POST /lista/cotis` — las de hoy

**No espera cuerpo.** Filtra por el `codven` que viaja dentro de la galleta `cdk`; no hay
que mandarlo ni se puede pedir el de otro vendedor.

### `POST /lista/cotisxdia` — un día, o varios

Dos formas, las dos válidas:

```json
{ "dia": "2026-10-01" }
```
```json
{ "desde": "2026-09-30", "hasta": "2026-10-01" }
```

El formato es `AAAA-MM-DD`. Si llega otra cosa, responde **400** con
`"la fecha debe venir como AAAA-MM-DD"`. Si `desde` es posterior a `hasta` se invierten
solos.

> **Respondiendo a su pregunta de los dos días: sí, ya se puede.** Antes no.
> La ruta se quedaba solo con el número de día del valor recibido y dejaba fijos el año
> y el mes actuales, así que era imposible pedir un día de otro mes — el primero de cada
> mes la pantalla no habría podido ampliar el rango. Probado con datos reales:
> `2026-08-31 .. 2026-09-01` devuelve 37 cotizaciones.

### Lo que devuelven

Las dos, la misma forma. Un objeto con las cotizaciones indexadas `0`, `1`, `2`…, y cada
una con estas posiciones:

| pos | dato | ejemplo |
|---|---|---|
| 0 | fecha | `2026/09/26` |
| 1 | número con serie | `009-00969930` |
| 2 | razón social | `KEYNERS COMPANY S.A.C.` |
| 3 | monto total **con IGV** | `881.04` |
| 4 | estado | `cotizado` |
| 5 | **moneda** | `D` |
| 6 | **registrado** | `2026-09-26 13:57:38` |

Las posiciones **5 y 6 son nuevas**. Las cinco primeras estaban y no se movieron, porque
la pantalla de Listas ya las consume.

**El estado ya viene traducido**, no hay que mapear códigos: `cotizado`, `facturado`,
`boleta` o `pedido`.

### Por qué la hora está en la posición 6 y no en la 0

**La posición 0 no tiene hora: `fecha` siempre viene a las 00:00:00.** Por sí sola no
sirve para ordenar las cotizaciones de un mismo día.

La hora real está en otra columna (`FecReg`), y es la que va en la posición 6. Está
poblada en las 4 837 cotizaciones de los últimos 30 días, sin una sola excepción.

**La lista ya viene ordenada por esa hora, la última primero.** Antes no había ningún
orden garantizado.

### Dos cambios de comportamiento

**Un día sin cotizaciones ahora devuelve lista vacía, no un error.** Antes respondía
**400** `"cotizacion inexistente en los registros"`, así que un vendedor que todavía no
había cotizado veía un error. Ahora llega un objeto vacío.

**Ya no salen las cotizaciones eliminadas.** Ninguna de las dos consultas filtraba el
estado de borrado, así que las eliminadas aparecían mezcladas: 17 en los últimos 30 días.

> Las facturadas, pedidos y boletas **sí siguen apareciendo** — para eso está la columna
> de estado. Solo se excluyen las eliminadas.

### Un detalle de rendimiento

El filtro de fecha ya usa el índice. Antes descomponía la columna con `YEAR()`, `MONTH()`
y `DAY()`, lo que obliga a recorrer las 841 mil filas de la tabla en cada llamada. Importa
porque la pantalla va a abrir con esta consulta.

---

## 2 · El documento para el cliente

`POST /cotizacion/read` devuelve ahora **26 posiciones** por línea. Las 23 anteriores
están exactamente donde estaban; al final van las tres que faltaban:

| pos | dato | ejemplo |
|---|---|---|
| 23 | **razón social** | `ZONA PORTATIL E.I.R.L.` |
| 24 | **dirección** | `AV. CENTRAL MZA K LT. 5 INT 2 COO. DE VIVIENDA 26 DE MAYO` |
| 25 | **ATTE** | `LUCY AYUQUE RETAMOZO` |

**Se puede quitar la llamada a `/cliente/id`.** No costó ninguna consulta extra: la tabla
de clientes ya estaba en el JOIN de esta misma consulta, solo no se seleccionaban esas
columnas.

### Sobre ATTE

Tenían razón: **es un campo guardado de la cotización**, no del cliente. El backend lo
resuelve al crearla, tomando el contacto de compras del cliente, y lo congela ahí.

De **7 128 cotizaciones de los últimos 90 días, solo 30 no lo tienen** — vale la pena
dibujar la línea igual y dejarla en blanco en esos casos.

### De dónde sale la razón social

De la **cotización**, no del maestro de clientes. Son casi siempre lo mismo, pero difieren
en 47 de 15 879 casos: clientes que cambiaron de nombre después de la cotización.

Tomándola de la cotización, la lista y el detalle siempre muestran lo mismo, y un
documento reimpreso dice lo que decía cuando se cotizó.

Si prefieren el nombre actual del cliente, se cambia; es una línea.

### Su mapeo de posiciones está bien

Lo verifiqué columna por columna contra la consulta. Las 13 posiciones que usan para el
documento son las correctas, incluida la 11 como part number y la 18 como porcentaje de
descuento.

---

## 3 · El pie del documento: no sumen la posición 19

Esto no lo preguntaron, pero les va a morder.

**La cabecera de la cotización en el ERP la gobierna un trigger**, y no suma los totales
de línea: calcula `IGV = SUMA(posición 17) × 0.18` y `TOTAL NETO = SUMA(posición 17) × 1.18`.

Si el pie del PDF se arma sumando la posición 19 (el total con IGV de cada línea), el
resultado se desvía por céntimos de lo que muestra el ERP. No es teórico: durante las
pruebas de promociones esa diferencia dejó una cotización 2 céntimos descuadrada.

**Deriven las tres cifras del total de la posición 17** y el PDF va a coincidir con la
cotización impresa de siempre.

### Y sobre el redondeo de Precio DSCTO

Su lectura es correcta y su fórmula también. Si algún día el backend manda ese precio ya
calculado, lo hará con el mismo redondeo a céntimos que describieron.

---

## 4 · El RUC y los datos de la empresa

En el esquema **no hay concepto de emisor en la cotización**: no hay columna de empresa ni
de razón social emisora. Y los 16 almacenes registrados tienen todos la misma sucursal.

Todo apunta a una sola razón social emisora, así que **fijarlos en el frontend está bien**.
Si algún día hay una segunda, habría que agregarla primero en la base.

---

## Lo que queda por decidir

1. **El estado en la lista.** Llega traducido (`cotizado` / `facturado` / `boleta` /
   `pedido`). Si quieren distinguir visualmente las ya procesadas de las abiertas, ese es
   el campo.

2. **Qué hacer con una cotización facturada.** Ahora aparecen en la lista. ¿Se abren igual,
   se abren en solo lectura, o no se dejan abrir? El backend hoy las deja leer.

3. **El tope de la lista.** No hay paginación ni `TOP`. Un vendedor con 345 cotizaciones en
   20 días podría pedir un rango largo y recibirlas todas. Con dos días no es problema; si
   la pantalla deja elegir rangos amplios, conviene acordar un límite.

4. **La razón social**, si la quieren del maestro de clientes en vez de la cotización.

---

## Anexo: ejemplo de respuesta de la lista

`POST /lista/cotisxdia` con `{"desde":"2026-09-25","hasta":"2026-09-26"}` para el vendedor
de la galleta, recortado a tres:

```json
{
  "0": { "0":"2026/09/26", "1":"009-00969930", "2":"KEYNERS COMPANY S.A.C.",
         "3":881.04, "4":"cotizado", "5":"D", "6":"2026-09-26 13:57:38" },
  "1": { "0":"2026/09/26", "1":"009-00969910", "2":"INNOVA 2512 S.A.C.",
         "3":144.05, "4":"cotizado", "5":"D", "6":"2026-09-26 11:59:54" },
  "2": { "0":"2026/09/26", "1":"009-00969887", "2":"KEYNERS COMPANY S.A.C.",
         "3":568.24, "4":"cotizado", "5":"D", "6":"2026-09-26 11:34:00" }
}
```

⚠️ Igual que antes, **el cuerpo viene doble codificado**: hay que hacer `JSON.parse` dos
veces. Se dejó así a propósito porque la pantalla de Listas ya consume estas rutas con esa
forma. Cuando se migre Listas, las dos pasan al sobre `{status, codigo, data}` que ya usa
Crear cotización.
