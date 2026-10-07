# Crear cotización — contrato con el backend

Qué pide la pantalla **Crear cotización** en cada paso, con qué cuerpo exacto, y
**qué espera recibir de vuelta**. Sirve para verificar las dos direcciones: que
lo que llega al backend es lo que necesita, y que lo que responde es lo que la
pantalla sabe leer.

Origen: `cotizacion/cotizacion_nuevo.html` y los scripts que carga. Todo lo que
aquí se describe está leído del código, no de memoria.

> **Estado:** el backend respondió en [`respuesta-crear-cotizacion.md`](respuesta-crear-cotizacion.md)
> y cambió `/vendedor`, `/cotizacion` y `/cotizacion/pegar`. Este documento ya
> refleja las formas nuevas. Lo que sigue abierto está al final.

---

## Convenciones comunes

Todas las llamadas salen con:

| | |
|---|---|
| `credentials` | `include` — la cookie de sesión `cdk` viaja siempre |
| `mode` | `cors` |
| `Content-Type` | `application/json` (salvo el login, que usa `FormData`) |
| Base | `https://pulpo.compudiskett.com.pe/v1` en producción |

**Importes: siempre en dólares.** El selector de moneda de la pantalla es de
presentación. Lo que se calcula, se guarda y se envía va en dólares, tal como
los devuelve `/producto/buscar`. La conversión a soles ocurre solo al pintar.

**El 401 se gestiona en un solo sitio.** Cualquier respuesta 401 cierra la
sesión y redirige al login. No hace falta que ningún endpoint devuelva nada
especial para eso.

### Cómo se leen las respuestas

El frontend hace **un solo desempaquetado**: si el cuerpo es un JSON que
contiene un *string* con otro JSON dentro, lo abre una vez más. No es recursivo.
Si llegara triple-codificado, se considera un error y debe verse.

Dos formas conviven hoy y las dos se aceptan:

| forma | quién la usa |
|---|---|
| El dato suelto — un arreglo o un objeto | `/vendedor`, `/cliente/*`, `/producto/buscar` |
| Envuelto en `{ status, codigo, data }` | `/promocion/*` |

> **Pregunta transversal:** ¿el sobre `{ status, codigo, data }` es la forma
> hacia la que van todas las rutas, o es propia de `/promocion`? Si va a ser el
> estándar, conviene saberlo ahora: el desempaquetado se haría en un único sitio
> en vez de ruta por ruta.

**Las listas pueden venir como arreglo o como objeto con claves `"0"`, `"1"`…**
El frontend recorre las dos igual, así que no hace falta cambiar nada por ese
lado.

---

## El recorrido

```
carga de la página   GET  /vendedor
                     GET  /cotizacion

paso 1  cliente      POST /cliente/buscar      (al teclear)
                     POST /cliente/id          (al elegir uno)

paso 2  productos    POST /producto/buscar     (al teclear)

paso 3  promociones  POST /promocion/recolector
                     POST /promocion/detalle   (una por idprom)

paso 4  crear        POST /cotizacion/pegar
```

---

## Carga de la página

### `GET /vendedor`

Sin cuerpo. Da los módulos del usuario; con ella se arma el menú lateral y la
barra inferior del móvil. Se cachea 10 minutos en `sessionStorage` y se
revalida en segundo plano.

**Para qué sirve además:** es la petición que la pantalla necesita de todos
modos, así que hace también de comprobación de sesión. Si responde 401, el
usuario va al login sin necesidad de una llamada aparte.

**Forma actual.** Los módulos van en `data`; los datos de usuario, **fuera del
sobre**, al mismo nivel que `status`:

```json
{
  "status": "ok",
  "codigo": 0,
  "data": {
    "cotizacion": "Permite manejar cotizaciones",
    "factura": "Modifica ciertos campos de la factura",
    "promocion": "Permite adjuntar y retirar promociones"
  },
  "nombre": "JUAN CARLOS",
  "grupo": "VENTAS-JEFES DE PROD",
  "tipo": "ESPECIALISTA",
  "tipoCambio": 3.437
}
```

Se siguen aceptando las dos formas anteriores — `{ "modulos": {...}, ... }` y el
mapa suelto — porque el backend migra pantalla por pantalla y el menú no debería
depender de qué despliegue llegó antes.

| campo | para qué se usa | si falta |
|---|---|---|
| `modulos` | las claves arman el menú; el valor es la descripción de la tarjeta | no hay menú |
| `nombre` | se muestra arriba a la derecha | se omite |
| `grupo` | qué tipos de vendedor puede elegir en el autenticador | se omite |
| `tipo` | **cambia qué partes de la interfaz se pintan** | se pinta la versión genérica |
| `marcas` | solo para `ESPECIALISTA` | se omite |
| `tipoCambio` | **el real del día**, ya en uso | llega `null` y se usa el fijo 3.408 |

Se admiten alias: `usuario` o `vendedor` por `nombre`, y `diferenciador` por
`tipo`.

**Claves de módulo que el frontend sabe pintar.** Cualquier otra se ignora en
silencio:

`cotizacion` · `pedido` · `factura` · `promocion` · `cuota` · `listas` ·
`programador` · `reporte` · `despacho`

### `GET /cotizacion`

Sin cuerpo. Da los accesos dentro del módulo: qué puede hacer este usuario.

**Forma actual:**

```json
{ "status": "ok", "codigo": 0, "data": ["crear", "leer", "update", "delete", "alm"] }
```

Se siguen aceptando `{ "accesos": [...] }` y el arreglo suelto.

Cada entrada se convierte en una tarjeta del hub. Un acceso que el frontend no
reconozca no se pinta. Los cinco nombres de arriba son exactamente los que el
catálogo reconoce para cotización.

> El documento anterior puso de ejemplo `crear`/`observar`/`modificar`/`almacen`
> y el backend lo señaló como desajuste. **El ejemplo estaba mal, el código no:**
> el catálogo siempre usó `crear`/`leer`/`update`/`delete`/`alm`. No hay nada que
> cambiar por ese lado.

> El frontend **no decide permisos**: pinta lo que llega. Si una acción no debe
> estar disponible, basta con no incluirla. Esto es presentación, no seguridad:
> cualquiera puede editar el HTML, así que el backend tiene que rechazar igual
> la operación si se dispara a mano.

> La ruta es `/` + el nombre de la carpeta del módulo. Coinciden todas salvo
> `listas`, cuyo endpoint es **`/lista`** en singular.

---

## Paso 1 · Cliente

### `POST /cliente/buscar`

Se dispara al teclear. Un RUC (11 dígitos) busca de inmediato; cualquier otro
texto espera 400 ms. Las peticiones anteriores se cancelan con `AbortController`.

```json
{ "sugerencia": "COMPUDISKETT" }
```

**Se espera** un arreglo de filas posicionales. De cada fila se leen tres:

| posición | contenido | para qué |
|---|---|---|
| 0 | código de cliente | se envía luego a `/cliente/id` |
| 1 | razón social | texto de la fila; se resalta la parte buscada |
| 2 | RUC | se muestra debajo |

```json
[
  ["20100047218", "COMPUDISKETT S.A.C.", "20100047218"],
  ["20512345678", "COMPUDATA PERU S.A.C.", "20512345678"]
]
```

Una lista vacía se muestra como "sin resultados", no como error.

> **Hoy la consulta devuelve solo dos posiciones**: el `SELECT` trae `codcli` y
> `nomcli`, así que la posición 2 llega `undefined` y el RUC no se muestra —
> aunque se busque *por* RUC. El frontend lo tolera sin romperse. Se arregla
> cuando se migren las demás pantallas que leen esta ruta, porque añadir una
> columna cambia las posiciones.

> También hay un `top 4`: nunca vuelven más de cuatro clientes.

> Buscar por RUC y buscar por nombre usan **esta misma ruta**; el frontend solo
> cambia cuándo dispara la consulta (el RUC, de inmediato; el texto, tras
> 400 ms). Que la respuesta traiga el RUC en las dos sirve para mostrarlo
> siempre.

### `POST /cliente/id`

Al elegir un cliente de la lista.

```json
{ "idcliente": "20100047218" }
```

**Se espera** un arreglo del que se usa **la primera fila**:

```json
[["20100047218", "COMPUDISKETT S.A.C.", "20100047218", "V0345", "14", "F"]]
```


| posición | contenido | uso en el frontend |
|---|---|---|
| 0 | código | se guarda |
| 1 | razón social | se muestra |
| 2 | RUC | se muestra |
| 3 | vendedor asignado temporal | se guarda, no se usa aún |
| 4 | `codcdv` — **sin confirmar qué es** | se guarda, no se usa aún |
| 5 | **letra** | **obligatoria**: va en `/producto/buscar` y decide el precio |

> Sin la posición 5 el paso 2 se bloquea con un aviso. Cotizar con la letra del
> cliente anterior daría precios que no corresponden.

La fila completa se guarda en la global `cliente_data` y se reenvía tal cual en
`/cotizacion/pegar`.

---

## Paso 2 · Productos

### `POST /producto/buscar`

Al teclear, desde 3 caracteres, con 400 ms de espera y cancelación de las
anteriores.

```json
{
  "letra": "F",
  "sugerencia": "TONER",
  "tipbusq": "1"
}
```

`tipbusq`: `"1"` descripción · `"2"` part number.

**Se espera** un arreglo de filas posicionales:

```json
[
  ["0115-010338", "MONITOR TCL 24G54 MINILED 24 FHD 100HZ", 12, 3, 6, 88.86, 0]
]
```

| posición | contenido | para qué se usa |
|---|---|---|
| 0 | código de producto | identifica la línea; va a todas las rutas siguientes |
| 1 | descripción | texto de la fila, con la parte buscada resaltada |
| 2 | stock almacén principal | se muestra; atenuado si es 0 |
| 3 | stock M&M | ídem |
| 4 | descuento máximo (%) | **acota** lo que el vendedor puede descontar |
| 5 | precio unitario en dólares | base de todos los importes |
| 6 | stock Piura | se muestra; atenuado si es 0 |

Los tres stocks se muestran **siempre**, aunque estén en cero: "M&M 0" y "no
aparece M&M" no significan lo mismo. Si los tres suman 0, la fila se marca
"Sin stock" pero **se puede cotizar igual** — a veces se cotiza lo que está por
llegar. El aviso es para que el vendedor no prometa una entrega sin saberlo.

Una lista vacía se muestra como "no se encontró ningún producto".

> Hay un `top 5` —nunca vuelven más de cinco productos— y solo se buscan
> artículos con `vvus > 1`. Conviene que la pantalla lo diga, para que nadie crea
> que esos cinco son todo lo que hay.

> **La posición 6 traía el stock de Chorrillos, no el de Piura.** La consulta
> unía `prd0116` en vez de `prd0115`. El backend ya lo corrigió: 168 productos
> tenían el valor equivocado, 146 ocultando stock que sí existe. El frontend no
> cambia nada — misma posición, mismo tipo.

Al elegir un producto **no se hace ninguna llamada más**: la respuesta ya trae
precio, tope de descuento y los tres stocks.

> `descuentoMaximo` ausente o no numérico se interpreta como **0**, no como un
> valor por defecto. El tope existe para proteger el margen.

---

## Paso 3 · Promociones

El contrato completo está en [`promociones.md`](promociones.md). Aquí solo lo
que se envía.

### `POST /promocion/recolector`

Al abrir el panel de promociones. Solo los códigos de producto:

```json
{
  "productos": {
    "0": { "codigo": "0115-010338" },
    "1": { "codigo": "0505-012611" }
  }
}
```

**Se espera** el sobre con el arreglo de `idprom` candidatos:

```json
{ "status": "ok", "codigo": 0, "data": ["15112", "14656"] }
```

Se admiten en texto o en número; el frontend los normaliza a texto.

> **Importante:** cuando ningún producto tiene promoción, la respuesta es un
> **400** con `"ninguna promocion"`, no una lista vacía. El frontend ya lo
> distingue de un fallo real y lo muestra como "no hay promociones", sin
> alarmar. Se menciona porque es fácil de cambiar sin darse cuenta.

### `POST /promocion/detalle`

Una llamada por cada `idprom` que devolvió el recolector, en paralelo.

```json
{
  "codigo": "15112",
  "productos": {
    "0": {
      "codigo": "0115-010338",
      "descripcion": "MONITOR TCL 24G54 MINILED 24 FHD 100HZ",
      "cantidad": 10,
      "preciosinIGV": 861.94,
      "descuento": 0
    }
  }
}
```

`preciosinIGV` = `cantidad × precioUnitario − descuento del vendedor`, en
dólares. Es el total de la línea ya rebajado, no un precio unitario.

**Se espera** el sobre con `data`, en cualquiera de sus dos formas (ámbito ítem
o ámbito total venta), o `data: null` con el motivo cuando no aplica. El
frontend ya lee las ocho combinaciones descritas en `promociones.md`.

De cada entrada se usa:

| campo | para qué se usa |
|---|---|
| `itemdescr` | título de la fila |
| `cantidad` | se muestra como "3×" — son **veces** alcanzadas, no unidades |
| `montoDescuento` | dólares si `tipo` es descuento · **piezas** si es regalo |
| `tipo` | decide lo anterior, y el color de la fila |
| `participantes` | solo total venta: cuántos productos la activaron |
| `acumulado` | solo total venta: se muestra tal cual |
| `descripcion` | nombre de la promoción, en la cabecera del bloque |

`monedaDescuento` **no se usa**. Dice `"D"` también en los regalos, así que
fiarse de él convertía 3 obsequios en "10.22 soles". El tipo es lo que manda.

**Cuando no aplica**, el frontend ya no lo descarta: muestra la promoción con el
mensaje y, si el motivo es `no_alcanza`, cuánto falta. Un "faltan 7 unidades" es
una venta a la vista.

---

## Paso 4 · Crear

### `POST /cotizacion/pegar`

```json
{
  "cliente": ["20100047218", "COMPUDISKETT S.A.C.", "20100047218", "V0345", "14", "F"],
  "productos": {
    "0": {
      "codigo": "0115-010338",
      "descripcion": "MONITOR TCL 24G54 MINILED 24 FHD 100HZ",
      "cantidad": 10,
      "descuento": 0,
      "precioUnitario": 88.86,
      "descuentoMaximo": 6,
      "preciosinIGV": 888.60,
      "stock1": 12,
      "stock2": 3,
      "stock3": 0,
      "stockTotal": 15
    }
  },
  "moneda": "D"
}
```

| campo | contenido |
|---|---|
| `cliente` | la fila entera de `/cliente/id`, sin modificar |
| `productos` | objeto con claves `"0"`, `"1"`… (no arreglo) |
| `moneda` | `"D"` o `"S"` — solo se registra en la cabecera (columna `mone`) |

> `promos` **ya no se envía**: el backend confirmó que nunca lo leyó. Las
> promociones se adjuntan después, con `/promocion/acoplar`.

Campos de cada producto:

| campo | contenido |
|---|---|
| `codigo` | código de producto |
| `descripcion` | descripción |
| `cantidad` | unidades, entero de 1 a 500 |
| `descuento` | % pedido por el vendedor, ya acotado al tope |
| `precioUnitario` | dólares, tal como llegó de `/producto/buscar` |
| `descuentoMaximo` | el tope que devolvió `/producto/buscar` |
| `preciosinIGV` | total de la línea con descuento, en dólares |
| `stock1` `stock2` `stock3` | principal · M&M · Piura, al momento de elegirlo |
| `stockTotal` | suma de los tres |

#### Qué se espera recibir

```json
{ "status": "ok", "codigo": 0,
  "documento": "098-00000037",
  "lineas": 1,
  "totales": { "tota": 861.94, "toti": 155.15, "totn": 1017.09 } }
```

| campo | para qué se usa |
|---|---|
| `status` | `"ok"` es éxito; cualquier otra cosa, fallo |
| `documento` | el `ndocu` **con serie**: se muestra y se encadena `/acoplar` |
| `totales` | en dólares: sin IGV, IGV, con IGV |
| `msg` (en fallo) | el texto que se le enseña al vendedor |

Las heurísticas que buscaban `success`, `valid`, `estado`, `resultado`, `numero`
o `id` **ya se eliminaron**: ahora lo dice `status`.

**El carrito solo se vacía cuando `status` es `"ok"`.** Si falla, queda intacto
para reintentar.

### `POST /promocion/acoplar`

Después de crear, una llamada **por cada promoción** que el vendedor aceptó:

```json
{ "ndocu": "098-00000037", "nprom": "15112" }
```

Van **en serie, no en paralelo**: `/acoplar` escribe y recalcula la cabecera
dentro de una transacción, y dos a la vez sobre el mismo documento sería pedirle
al ERP que resuelva una carrera.

El `ndocu` va siempre con serie. Un número suelto se rechaza como
`documento ambiguo`, porque conviven la serie `009-` y la `098-`.

Si una promoción falla, **la cotización no se deshace**: ya existe. Se avisa de
cuál no entró, porque se puede adjuntar después desde el módulo de promociones.

---

## Lo que sigue abierto

Los puntos 1, 2, 4, 5, 7 y 8 del documento anterior quedaron resueltos en la
respuesta del backend. Lo que queda:

### 1 · La caducidad de la cookie `tip` — lo más urgente

`cdk` dura 24 horas y `tip` solo 1. `/vendedor` necesita las dos, así que
pasada la hora responde 401 aunque la sesión siga viva. Como cualquier 401
cierra sesión, **el vendedor sería expulsado cada hora**.

Desde el frontend no hay nada que hacer salvo empeorarlo: tragarse ese 401
sería dejar la pantalla sin menú y sin saber por qué. Hay que arreglarlo en el
backend — igualar `tip` a 24 h, o leer el tipo del token y dejar de depender de
ella. La segunda parece mejor: una cookie menos que sincronizar.

### 2 · Qué es `codcdv`

Posición 4 de `/cliente/id`. Se guarda con el nombre de la columna hasta que se
confirme; ponerle un nombre bonito que resulte ser falso es peor que no tenerlo.

### 3 · El almacén al crear

`/pegar` escribe `codalm = '01'` fijo. Si la pantalla debe poder elegirlo, hace
falta añadir el campo al cuerpo.

Relacionado: ahora se conocen los cuatro códigos (`01` Principal, `08` M&M,
`15` Piura, `16` Chorrillos) y el frontend ya sabe nombrarlos todos. Pero el
desplegable de *cambiar almacén* sigue ofreciendo solo `01` y `08`: **saber cómo
se llama el 15 no lo convierte en destino válido**, y eso lo decide el negocio.
Si Piura y Chorrillos deben poder elegirse, se añaden en una línea.

### 4 · La línea de crédito

El dato existe: `mst01cli.mcredi` con `CodMonLinea`. No es un `S`/`N` sino un
importe con su moneda.

**Propuesta:** que `/cliente/id` devuelva el monto y su moneda en dos posiciones
nuevas al final. El frontend muestra el indicador S/N derivado de `mcredi > 0` y
además puede enseñar el importe, que es más útil que el booleano. Al ir al
final, no se mueven las posiciones que ya se leen.

### 5 · El RUC y el costo, cuando se migren las otras pantallas

- `ruccli` en `/cliente/buscar` — hoy la posición 2 llega vacía.
- `pcus` (costo) y `codf` (part number) en `/producto/buscar`.

El costo es el que más valor tiene: sin él no se puede avisar de que se está
cotizando bajo coste, y el backend ya encontró productos con costo 8.27 y precio
5.50.

### 6 · `tcme` congelado — del lado del backend

`otorgar_tcm.js` escribe `tcme = '3.37'` fijo desde el 7 de septiembre, cuando el
real es 3.45. `tcam` sí queda correcto. No afecta a esta pantalla, pero sí a lo
que se registre.
