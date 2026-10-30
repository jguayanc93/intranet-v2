# Grupo 34 — Jefe de zona: avance, probabilidad y clientes

Contrato de los modulos del **grupo 34 (jefe de zona)**. Por ahora el jefe de zona mira **todo el
grupo 20** (cobertura y cartera): el avance de la cuota de todos los vendedores; de uno en uno, la
probabilidad de que lleguen a su cuota; y los clientes de cada uno. Implementado y probado en
bdnava08. Todo es solo lectura.

> **27/10/2026:** la **seccion 10** responde a [salida-zona-grupo34.md](salida-zona-grupo34.md) sobre el
> orden de salida. No cambia el contrato.
>
> **Actualizado el 24/10/2026, en respuesta a [respuesta-zona-clientes.md](respuesta-zona-clientes.md):**
> las seis respuestas estan en la **seccion 9** y las erratas ya estan corregidas en su sitio. Hay **un
> campo nuevo en la cartera**, `ventaFueraDeCartera` con su lista `fueraDeCartera` (seccion 8). Ademas,
> **la regla de CARTERA queda escrita con precision** (seccion 2): le cuenta lo que factura a clientes
> de **cualquier** vendedor de cartera, haya reemplazo detectado o no.
>
> **Y despues, el mismo 24/10/2026: clientes libres.** Los de la oficina o sin dueño son **libres**. A
> un vendedor de CARTERA que les factura, **el monto no le cuenta, pero el cliente si cuenta como
> atendido** en su cobertura de clientes. Esto trae campos nuevos en la cartera: `coberturaClientes`,
> el desglose de `ventaFueraDeCartera`, `libre` y `atendido` en `fueraDeCartera`, y `libres` en
> `comparacion`. En la cobertura, `porDueno` y `dueno.tipo` traen una categoria nueva, `libre`
> (seccion 8).
>
> **Actualizado el 24/10/2026:**
>
> - **Modulo nuevo `clientes`**, con dos acciones: la **cartera** de un vendedor de cartera y la
>   **cobertura** de un vendedor de cobertura (seccion 8).
> - **Cambia lo que le cuenta a un vendedor de CARTERA** (seccion 2): solo lo que **factura el**.
>   Lo que otro vendedor les factura a sus clientes ya no le cuenta. Cambia su `avance` aqui, en la
>   probabilidad y en su propia pantalla de cuota.
> - **Reemplazos por vacaciones:** cada fila del avance trae `reemplazadoPor` y `reemplazaA`
>   (seccion 3).
> - **Se puede ir hasta 3 meses atras** (antes, 2) en el avance y en los clientes.
>
> **Actualizado el 22/10/2026:** la lista de avance trae ahora la **venta de hoy**, el **semaforo**
> (`estado`), la **proyeccion al cierre**, **como cerro el mes anterior** y la lista de los que **no
> registraron cuota**. Todo en la seccion 3.
>
> **Y en respuesta a [respuesta-zona.md](respuesta-zona.md):** todos los montos de los dos modulos son
> **con IGV** (seccion 2). Respuestas en la seccion 7.

---

## 1 · Quien entra y su menu

- **Solo el usuario 126 (VACA CRISTHIAM).** El otro usuario del grupo, 297 MOSCOSO DIEGO, **no puede
  entrar** hasta que se decida: el login le responde **403 `usuario sin acceso`** y no recibe sesion.
  Si tuviera una sesion abierta de antes, cualquier ruta le responde lo mismo (tambien `/vendedor/zona`).
- Su tipo es **`ZONA`**: el menu sale de `GET /v1/vendedor/zona`, como siempre.
- **Su menu cambia.** Antes era el de un vendedor (cotizacion, pedido, listas, factura, promocion,
  cuota, programador). Ahora es **exactamente**:

| clave | texto | pantalla |
|---|---|---|
| `cotizacion` | Permite manejar cotizaciones | la de siempre |
| `avance` | Avance de cuota de todos los vendedores del grupo 20 | nueva, seccion 3 |
| `probabilidad` | Probabilidad de que un vendedor llegue a su cuota, comparada con meses anteriores | nueva, seccion 4 |
| `clientes` | Revisa la cartera o la cobertura de clientes de cada vendedor del grupo 20 | **nueva, seccion 8**: dos acciones, `cartera` y `cobertura` |

La clave es `clientes` y no `cobertura` porque `cobertura` ya es otro modulo en el menu del grupo 25.

Los permisos de los modulos que salieron del menu no se tocaron, igual que con el grupo 25: la
pantalla de cotizacion puede seguir usando las rutas de pedido o promocion que necesite.

---

## 2 · Reglas comunes

- **Quien sale:** los vendedores **del grupo 20 que registraron su cuota** de ese mes. El que no la
  registro no sale.
- **El avance es el mismo numero que el vendedor ve en su propia pantalla de cuota**
  (`/cuota/cobertura` o `/cuota/cartera`): el total de sus facturas y boletas del mes, **en dolares y
  con IGV**, las notas de credito restan, sin anuladas ni transferencias gratuitas. Comprobado: el
  196 ve US$ 26 152,29 en su cuota y aqui sale lo mismo.
  *No es la regla de la cuota por marca del grupo 25 (que va sin IGV y solo con mercaderia y
  licitaciones): no hay que comparar las dos cifras.*
- **Que le cuenta a cada uno** (cambio del 24/10/2026). El "dueño" de un cliente es el vendedor que
  figura en cada factura (`mst01fac.codven`); quien factura es otro campo (`codven_usu`):
  - **COBERTURA:** todo lo que **facturo el**, sea de quien sea el cliente. Tambien a clientes de la
    cartera de otro vendedor.
  - **CARTERA:** lo que **facturo el** a clientes cuyo dueño es **cualquier vendedor de cartera**: los
    suyos y los de sus compañeros de cartera (por ejemplo cuando reemplaza a uno de vacaciones).
    **No depende de que se detecte un reemplazo** (seccion 3); eso es solo un aviso.
  - **A CARTERA no le cuenta:**
    - lo que **otro** vendedor les factura a sus clientes, tampoco si es de cobertura;
    - lo que **el** factura a clientes que **no son de cartera**: de un vendedor de cobertura, de la
      oficina (`V0000`) o sin dueño. **Ese monto no le cuenta a nadie**, porque el dueño de cobertura
      solo suma lo que factura el. Se ve en `ventaFueraDeCartera` (seccion 8).
  - **Clientes libres:** los de la oficina (`V0000`) o sin dueño, que suele tomar cobertura. Si uno de
    cartera le factura a un libre, **el monto no le cuenta, pero el cliente si cuenta como atendido**
    en su cobertura de clientes (`coberturaClientes`, seccion 8). Los clientes de un vendedor de
    cobertura no le cuentan de ninguna forma: ni monto ni cliente.
  - La cuota guarda una columna de meta de cobertura, pero hoy se registra siempre con 50 y **no se
    usa**: no hay meta de clientes que mostrar, solo cuantos atendio.
  - Antes, a cartera se le contaba todo lo facturado a sus clientes, lo hiciera quien lo hiciera. Asi,
    la venta de un reemplazo se contaba dos veces: al de cobertura que facturo y al dueño de la
    cartera. Ejemplo de octubre (bdnava01): a MELENDEZ WILLIAM se le contaban US$ 302 031, **lo que
    todos facturaron a sus clientes**, y de eso 296 254,54 lo facturo GONZALES JUAN. Ahora tiene
    −3 579,71 (solo notas de credito) y lo de GONZALES le cuenta solo a GONZALES.
- **Meses:** el mes en curso y **hasta 3 anteriores** (`?anno=2026&mes=7`), en el avance y en los
  clientes.
- **Tiempo real:** cada llamada se calcula en el momento; una factura emitida ya cuenta en la
  siguiente lectura. **Recomendacion: refrescar cada 2 a 5 minutos**, o con un boton. No mas seguido:
  no cambia tan rapido y cada lectura recorre las facturas del mes.
- **Todos los montos de los dos modulos son en US$ y con IGV**, con esa misma regla: en el avance
  (`meta`, `avance`, `falta`, `hoy`, `proyeccion`, `mesAnterior`, `sinCuota`) y en la probabilidad
  (`meta`, `avance`, `falta`, `ritmo`, `escenarios`, `cierre`). Salen todos de la misma suma.
- Montos redondeados a 2 decimales. Porcentajes con 1 decimal.

---

## 3 · Avance — `GET /v1/zona/avance`

| ruta | para que |
|---|---|
| `GET /v1/zona/avance` | el mes en curso |
| `GET /v1/zona/avance?anno=2026&mes=9` | uno de los **tres meses anteriores** (`anno` y `mes` van juntos) |

Ejemplo real del **mes en curso** (octubre de 2026 en bdnava08; de los 20 sin cuota se muestran 2):

```json
{ "status":"ok", "codigo":0, "data": {
    "anno": 2026, "mes": 10, "actual": true,
    "ventasHasta": "2026-10-09", "actualizado": "2026-10-22 18:47:06",
    "esperado": 71,
    "total": { "vendedores":1, "meta":220000, "avance":26152.29, "porcentaje":11.9, "logrados":0,
               "hoy":0, "estados": { "logrado":0, "adelantado":0, "justo":0, "atrasado":1 },
               "sinCuota":20 },
    "vendedores": [
      { "codusu":"196", "codven":"V0278", "nombre":"HUAMANI ANTHONY", "tipo":"COBERTURA",
        "meta":220000, "avance":26152.29, "porcentaje":11.9, "falta":193847.71, "logro":false,
        "hoy":0, "estado":"atrasado", "proyeccion":92889.26,
        "probabilidad":0, "motivo":null,
        "mesAnterior": { "meta":220000, "avance":232520.11, "porcentaje":105.7, "logro":true } }
    ],
    "sinCuota": [
      { "codusu":"293", "codven":"V0261", "nombre":"UTANI FERNANDO", "tipo":"CARTERA",
        "avance":138694.84, "hoy":0, "proyeccion":303053.15 },
      { "codusu":"399", "codven":"V0334", "nombre":"GONZALES JUAN", "tipo":"COBERTURA",
        "avance":115071.62, "hoy":0, "proyeccion":322483.18 }
    ]
} }
```

En un **mes cerrado** (septiembre) los campos del dia y del ritmo vienen en `null`:

```json
{ "codusu":"412", "codven":"V0343", "nombre":"GUEVARA SANTOS ABRAHAM", "tipo":"COBERTURA",
  "meta":380000, "avance":527563.35, "porcentaje":138.8, "falta":0, "logro":true,
  "hoy":null, "estado":null, "proyeccion":null, "probabilidad":null, "motivo":null,
  "mesAnterior": { "meta":410000, "avance":412850.49, "porcentaje":100.7, "logro":true } }
```

**Cabecera:**

| campo | que es |
|---|---|
| `actual` | `true` en el mes en curso |
| `ventasHasta` | el ultimo dia del mes con facturas de estos vendedores, `AAAA-MM-DD`; `null` si no hay ninguna |
| `actualizado` | fecha y hora del servidor en que se calculo, para *«actualizado a las 18:47»* |
| `esperado` | **cuanto del mes ya paso**, en %: dia de hoy entre los dias del mes (22 de 31 = 71). Es la marca sobre la barra. En un mes cerrado, 100. Es el mismo calculo que usa la pantalla de cuota del vendedor |
| `total.vendedores`, `meta`, `avance`, `porcentaje` | la suma de los que tienen cuota, y su % |
| `total.logrados` | cuantos ya llegaron a su meta |
| `total.hoy` | lo que facturaron hoy entre todos los que tienen cuota. `null` en un mes cerrado |
| `total.estados` | cuantos hay en cada color del semaforo. `null` en un mes cerrado |
| `total.sinCuota` | cuantos vienen en `sinCuota` |

**Cada vendedor con cuota** (`vendedores`, del de mayor `porcentaje` al de menor):

| campo | que es |
|---|---|
| `codusu` | su usuario: es lo que se manda a la probabilidad (seccion 4) |
| `codven`, `nombre`, `tipo` | el vendedor; `tipo` es `COBERTURA` o `CARTERA` ese mes |
| `meta` | la cuota que registro |
| `avance`, `porcentaje` | lo que lleva y su % de la meta. Puede pasar de 100, y puede ser negativo si devolvio mas de lo que vendio |
| `falta` | lo que le falta para la meta; 0 si ya llego |
| `logro` | `true` si ya llego a la meta |
| `hoy` | **lo que facturo hoy** (con las mismas reglas del avance). `null` en un mes cerrado |
| `estado` | **el semaforo**, comparando su `porcentaje` con `esperado`: `logrado` (ya llego), `adelantado` (va igual o por encima de lo que paso del mes: verde), `justo` (hasta 10 puntos por debajo: amarillo), `atrasado` (mas de 10 puntos por debajo: rojo). `null` en un mes cerrado: ahi manda `logro` |
| `proyeccion` | **como cerraria el mes si sigue a su ritmo** de los ultimos 90 dias (el escenario `probable` de la seccion 4). `null` en un mes cerrado o si no tiene historia (vendedor nuevo) |
| `probabilidad` | % de que llegue a su meta a fin de mes (como se calcula, en la seccion 4). `null` en un mes cerrado |
| `motivo` | por que `probabilidad` es `null` o fija: `historia insuficiente` (vendedor nuevo, menos de 20 dias con datos), `meta alcanzada` (100) o `mes cerrado` (0). Si no, `null` |
| `mesAnterior` | **como cerro el mes anterior al que se esta viendo**: su `meta`, `avance`, `porcentaje` y `logro`. `null` si ese mes no registro cuota |
| `reemplazadoPor` | **nuevo.** Si ese mes **otro vendedor atendio su cartera** (vacaciones): `{codven, nombre, venta, porcentaje}`. `venta` es lo que el reemplazo le facturo a sus clientes, y `porcentaje` que parte fue de **lo que todos los vendedores facturaron a sus clientes** ese mes. `null` si no hubo reemplazo. Solo puede venir en un vendedor de CARTERA |
| `reemplazaA` | **nuevo.** A que vendedores de cartera **reemplazo el** ese mes: lista con la misma forma (`codven` y `nombre` son los del reemplazado), `[]` si a nadie. El que reemplaza puede ser de cartera o de cobertura; **el reemplazado siempre es de cartera** |

**Reemplazos por vacaciones.** No estan registrados en ninguna parte, pero se ven en las facturas: el
dueño de la cartera casi no facturo a sus clientes y otro vendedor les facturo la mayor parte.
Exactamente: el dueño facturo **hasta el 10 %** de lo de sus clientes y otro **al menos el 50 %**.
En 2026 hay 6 meses asi, y en todos el dueño solo tuvo notas de credito mientras el otro facturo
del 72 al 99 %. Solo se busca si lo facturado a sus clientes en el mes es positivo: por eso
`porcentaje` nunca viene `null`. Normalmente el reemplazado no registro cuota ese mes, asi que sale en
`sinCuota`, **y alli tambien vienen los dos campos**. Ejemplo de octubre en **bdnava01** (los dos estan
en `sinCuota`; en bdnava08 las cifras son otras, seccion 6):

```json
{ "codusu":"269", "codven":"V0235", "nombre":"MELENDEZ WILLIAM", "tipo":"CARTERA", "avance":-3579.71,
  "reemplazadoPor": { "codven":"V0334", "nombre":"GONZALES JUAN", "venta":296254.54, "porcentaje":98.1 },
  "reemplazaA": [] }

{ "codusu":"399", "codven":"V0334", "nombre":"GONZALES JUAN", "tipo":"COBERTURA", "avance":435337.12,
  "reemplazadoPor": null,
  "reemplazaA": [ { "codven":"V0235", "nombre":"MELENDEZ WILLIAM", "venta":296254.54, "porcentaje":98.1 } ] }
```

**Sugerencia de pantalla:** junto a MELENDEZ, *«vacaciones: su cartera la atendio GONZALES JUAN
(98 %)»*; junto a GONZALES, *«reemplaza a MELENDEZ WILLIAM»*.

`proyeccion` y `probabilidad` no siempre van de la mano: la proyeccion supone que sigue a su ritmo
de siempre, y la probabilidad ademas cuenta con que el que va atrasado suele apretar al final (seccion
4). Un vendedor puede tener una proyeccion algo por debajo de la meta y aun asi una probabilidad
alta.

**Los que no registraron cuota** (`sinCuota`, del que mas factura al que menos): los vendedores del
grupo 20 **registrados en la intranet y activos** que no registraron cuota ese mes. Sirve para que el
jefe sepa a quien pedirsela.

| campo | que es |
|---|---|
| `codusu`, `codven`, `nombre`, `tipo` | el vendedor; `tipo` es con el que esta registrado hoy |
| `avance` | lo que facturo en el mes, con las mismas reglas |
| `hoy`, `proyeccion` | igual que arriba; `null` en un mes cerrado |
| `reemplazadoPor`, `reemplazaA` | igual que arriba. **Aqui es donde suele salir el reemplazado** |

Los que entraron hace poco salen con `avance` 0 y `proyeccion` `null`. Sin vendedores con cuota ese
mes, `vendedores` llega vacio y `total` en ceros: no es un error.

---

## 4 · Probabilidad — `GET /v1/zona/probabilidad?codusu=196`

De **un** vendedor del grupo 20: la probabilidad de llegar a su cuota este mes, y **como iba en los 3
meses anteriores a esta misma altura del mes**, con como termino cada uno. Si hoy es 22, cada mes se
mira **cortado el dia 22**: *«en septiembre, a esta altura, llevaba 82 % y tenia 98,6 % de llegar;
termino en 105,7 %»*. El `codusu` sale de la lista de avance.

Ejemplo real (196 en bdnava08; de los 4 meses se muestran 2):

```json
{ "status":"ok", "codigo":0, "data": {
    "vendedor": { "codusu":"196", "codven":"V0278", "nombre":"HUAMANI ANTHONY", "tipo":"COBERTURA" },
    "hoy": "2026-10-22", "actualizado": "2026-10-22 18:32:22",
    "meses": [
      { "anno":2026, "mes":10, "actual":true, "tipo":"COBERTURA", "meta":220000, "corte":"2026-10-22",
        "avance":26152.29, "porcentaje":11.9, "falta":193847.71,
        "quedan": { "habiles":7, "sabados":2 },
        "ritmo": { "necesario":21538.63, "habitual":7964.13 },
        "probabilidad":0, "motivo":null,
        "escenarios": { "pesimista":71918.95, "probable":92889.26, "optimista":122922.96 },
        "cierre": null },
      { "anno":2026, "mes":9, "actual":false, "tipo":"COBERTURA", "meta":220000, "corte":"2026-09-22",
        "avance":180446.49, "porcentaje":82, "falta":39553.51,
        "quedan": { "habiles":7, "sabados":1 },
        "ritmo": { "necesario":4944.19, "habitual":8831.43 },
        "probabilidad":98.6, "motivo":null,
        "escenarios": { "pesimista":226110.88, "probable":246869.67, "optimista":275831.25 },
        "cierre": { "avance":232520.11, "porcentaje":105.7, "logro":true } }
    ]
} }
```

`meses` trae **siempre 4**: el actual primero y luego los 3 anteriores, del mas reciente al mas
antiguo. Un mes en que no registro cuota viene con `meta: null`, `probabilidad: null` y
`motivo: "sin cuota"`, pero con su `avance`, sus `escenarios` y su `cierre` (lo que facturo), por si se quieren mostrar.

**Cada mes:**

| campo | que es |
|---|---|
| `corte` | el dia en que se mira ese mes: hoy en el actual; el mismo numero de dia en los anteriores (si el mes es mas corto, su ultimo dia) |
| `avance`, `porcentaje`, `falta` | lo facturado **del 1 al dia de corte incluido**, su % de la meta y lo que faltaba |
| `quedan.habiles`, `quedan.sabados` | dias de venta que quedaban desde el corte (incluido) hasta fin de mes. Sin domingos ni feriados |
| `ritmo.necesario` | lo que tenia que facturar **cada dia** que quedaba para llegar. `null` sin cuota |
| `ritmo.habitual` | lo que **suele** facturar por dia de venta (promedio de sus ultimos 90 dias, sabados incluidos). Si `necesario` es mucho mayor que `habitual`, va muy atrasado |
| `probabilidad` | % de llegar a la meta a fin de mes, visto desde el corte (0 a 100, 1 decimal) |
| `motivo` | `sin cuota`, `historia insuficiente`, `meta alcanzada` (ya iba en 100 % al corte: 100), `mes cerrado`, o `null` |
| `escenarios` | como cerraria el mes **si sigue vendiendo como en sus ultimos 90 dias**: `pesimista` (1 de cada 10 veces cierra por debajo), `probable` (la mitad de las veces por encima, la mitad por debajo), `optimista` (1 de cada 10 por encima). Viene aunque no tenga cuota; `null` solo si no tiene historia (vendedor nuevo) |
| `cierre` | como termino de verdad ese mes: `avance` total, `porcentaje` y `logro`. `null` en el mes actual |

**Como se calcula la probabilidad** (para poder explicarlo en la pantalla):

1. Lo facturado hasta ayer no se mueve.
2. Hoy y cada dia de venta que queda se rellenan con **un dia real del propio vendedor**, sacado al
   azar de sus ultimos 90 dias (los sabados con sabados, porque un sabado se vende menos). Hoy nunca
   cuenta menos de lo que ya facturo hoy.
3. Se repite **10 000 veces**, y se cuenta en cuantos de esos finales de mes llega a la meta.
4. Ese numero se **corrige con lo que paso de verdad**. Solo, salia demasiado bajo, porque el
   vendedor atrasado aprieta al final del mes y un dia sacado al azar no lo sabe. Con la correccion,
   en los meses de dic-2025 a sep-2026, cuando dice 38 % llego el 36 % de las veces; cuando dice 70 %,
   el 68 %; y cuando dice 87 %, el 82 %.
5. Si para llegar tiene que facturar por dia **mas de 2,5 veces lo que suele**, no se corrige: en
   esos casos nadie llego.

Con los mismos datos el numero no cambia entre dos lecturas: solo se mueve cuando entra una venta.
**Los `escenarios` no llevan la correccion**: dicen como cerraria siguiendo su ritmo de siempre, sin
contar con que apriete. Por eso puede pasar que la probabilidad sea alta y el `probable` quede algo
por debajo de la meta. Conviene rotularlos *«a su ritmo habitual»*.

**Sugerencia de pantalla:** una fila por mes, con la barra de `porcentaje` al corte, la
`probabilidad` y, en los meses pasados, el `cierre` al lado (logro si o no). La comparacion que
interesa es *«este mes, a esta altura, voy mejor o peor que los anteriores»*.

---

## 5 · Errores

| http | status | cuando |
|---|---|---|
| 400 | `periodo invalido` | avance o clientes: un mes que no es el actual ni uno de los tres anteriores, un mes futuro, o `anno` sin `mes` |
| 400 | `vendedor requerido` | probabilidad, cartera o cobertura sin `codusu` |
| 404 | `vendedor desconocido` | ese `codusu` no es un vendedor del grupo 20 |
| 400 | `vendedor de otro tipo` | `/cartera` con un vendedor de cobertura, o al reves (seccion 8) |
| 403 | `usuario sin acceso` | el usuario 297 (o cualquier otro del grupo 34 que no sea el 126), en el login y en cualquier ruta |
| 403 | `sin permiso` | otro grupo (20, 25…) |
| 401 | `falsa galleta` | sin sesion |

---

## 6 · Para probar en bdnava08

**Todos los casos de esta tabla se reproducen en bdnava08, con estas cifras** (comprobado el
24/10/2026 con la regla nueva). Los ejemplos que dicen *bdnava01* en otras secciones son de la base
de produccion y sirven solo para ilustrar: en bdnava08 las cifras de octubre son otras, porque sus
facturas llegan hasta el 09/10.

| caso | como |
|---|---|
| Avance de un mes cerrado con 9 vendedores (4 llegaron) | `GET /v1/zona/avance?anno=2026&mes=9` |
| Avance de agosto (6 vendedores, todos llegaron) | `?anno=2026&mes=8` |
| Mes en curso | `GET /v1/zona/avance`: en octubre solo el 196 registro cuota |
| Vendedores sin cuota | `sinCuota`: 20 en octubre, 12 en septiembre (Alina Gutierrez, la que mas factura) |
| Sin cuota el mes anterior | septiembre: 400, 269, 246 y 406 vienen con `mesAnterior: null` |
| Mes no permitido | `?anno=2026&mes=6` → 400 `periodo invalido` (julio ya se puede) |
| Reemplazos en el avance, octubre | los dos en `sinCuota`: MELENDEZ (`avance` −1 027,43) con `reemplazadoPor` GONZALES JUAN, 60 515,45, 99,9 %; GONZALES (`avance` 115 071,62) con `reemplazaA` MELENDEZ |
| Reemplazos, agosto | GONZALES CRISTOPHER ← GONZALES JUAN (473 877,58, 76,6 %) y GUTIERREZ ALINA ← UBILLUZ (956 544,84, 99,9 %) |
| Reemplazos, julio | GONZALES CRISTOPHER ← GONZALES JUAN (372 972,10, 71,8 %) |
| Cartera normal | `GET /v1/zona/cartera?codusu=293&anno=2026&mes=9` (UTANI: 99 asignados, 41 atendidos, `venta` 508 889,68; `ventaFueraDeCartera` 14 clientes, 7 228,88; `coberturaClientes.total` 42, con 1 libre) |
| Cartera con muchos libres | `/cartera?codusu=400&anno=2026&mes=8` (UBILLUZ: `coberturaClientes` 122 = 61 suyos + 35 de reemplazo + 26 libres) |
| Cartera de vacaciones | `/cartera?codusu=246&anno=2026&mes=8` (GONZALES CRISTOPHER: 0 atendidos, `venta` −2 600,13, `reemplazadoPor` GONZALES JUAN) |
| Cartera que reemplaza a otra | `/cartera?codusu=400&anno=2026&mes=8` (UBILLUZ: `venta` 1 404 013,65, `reemplazaA` GUTIERREZ, 40 clientes en `reemplazo`, 52 en `fueraDeCartera`) |
| Cobertura | `GET /v1/zona/cobertura?codusu=399&anno=2026&mes=9` (GONZALES JUAN: 181 atendidos, 17 nuevos, `venta` 463 979,90) |
| Cobertura con miles de asignados | `/cobertura?codusu=306` (RAMIREZ AUGUSTO: 2 531 asignados; en octubre 53 atendidos) |
| `venta` = `avance` | en los 8 casos de cartera y cobertura de arriba, comprobado en bdnava08 y en bdnava01 |
| Accion equivocada | `/cartera?codusu=399` → 400 `vendedor de otro tipo` |
| Probabilidad con los 4 meses con cuota | `codusu=196` |
| Mes con `meta alcanzada` | `codusu=399` (julio: al dia 22 ya iba en 103 %) |
| Meses `sin cuota` | `codusu=414` (solo tiene cuota en agosto) y `codusu=246` (solo septiembre, CARTERA) |
| No es del grupo 20 | `codusu=229` → 404 |

En bdnava08 las facturas llegan hasta el **09/10/2026**: el avance de octubre y su probabilidad son
de esos dias (por eso el 196 sale con 0 %). Para ver probabilidades con sentido, miren los meses
anteriores de la probabilidad.

---

## 7 · Respuestas a [respuesta-zona.md](respuesta-zona.md)

| pregunta | respuesta |
|---|---|
| 1 · ¿Los montos de la probabilidad tambien son con IGV? | **Si.** El `avance`, el `ritmo` (`necesario` y `habitual`), los `escenarios` y el `cierre` de cada mes salen de la misma suma que el avance: el total de la factura, en dolares y con IGV. *«Todo en dolares y con IGV»* esta bien rotulado. Lo agregamos a la seccion 2 para las dos pantallas |
| Sugerencia · el texto del 297 | **Quedense con su texto.** Lo estable es el `status` (`usuario sin acceso`): decidan por el. El `msg` de hoy (*«este usuario todavia no tiene acceso a la intranet»*) es generico y no esta pensado para mostrarse tal cual. Si un dia el 297 entra, simplemente deja de recibir ese 403: el texto no tiene que cambiar |

Su lectura del documento es correcta en todo. Algunas confirmaciones:

- **La probabilidad se puede pedir de cualquier vendedor del grupo 20**, tambien de los de `sinCuota`: sus meses vienen como `sin cuota`, pero con lo que facturaron, sus `escenarios` y su cierre.
- **Volver al login con el 403 `usuario sin acceso`** desde el cliente HTTP es lo correcto, y **no** con `sin permiso`: son dos `status` distintos a proposito.
- **Refrescar cada 3 minutos, solo en el mes en curso y con la pantalla a la vista** es justo lo que buscabamos.
- **Nada se calcula en pantalla:** de acuerdo. Si algo no cuadra entre si (por ejemplo, una `proyeccion` bajo la meta con `probabilidad` alta), es a proposito y esta explicado en las secciones 3 y 4.


---

## 8 · Clientes — `GET /v1/zona/cartera` y `GET /v1/zona/cobertura`

El modulo `clientes` del menu tiene **dos acciones**, una por tipo de vendedor. El jefe elige un
vendedor (por ejemplo de la lista del avance, por su `tipo`) y se llama a la que corresponde:

| ruta | para quien |
|---|---|
| `GET /v1/zona/cartera?codusu=293` | un vendedor de **CARTERA** |
| `GET /v1/zona/cobertura?codusu=399` | un vendedor de **COBERTURA** |

Las dos aceptan `&anno=2026&mes=9`, hasta 3 meses atras. Si el vendedor no es del tipo de la ruta en
ese mes, responden **400 `vendedor de otro tipo`**. El tipo es el de la cuota que registro ese mes o,
si no registro, el de hoy.

### Reglas

- **`venta` es la misma cifra que su `avance`** en `/zona/avance`, con la regla de la seccion 2.
  Comprobado al centimo con los 8 casos de la seccion 6, en bdnava08 y en bdnava01.
- **Atendido:** un cliente al que en el mes le quedo venta mayor a 0. Uno que solo tuvo notas de
  credito no cuenta.
- **Asignados:** los clientes que hoy tiene en el maestro de clientes (activos), mas los que figuran a
  su nombre en las facturas de ese mes. **El maestro no guarda historia:** en un mes anterior la
  lista se completa con las facturas, pero un cliente que tuvo entonces, que hoy ya no tiene y que no
  compro ese mes, no se puede saber. Conviene avisarlo en pantalla al ver un mes anterior.
- **Corte:** en el mes en curso, todo es hasta hoy. En un mes cerrado, el mes entero.
- **Montos** en US$ y con IGV, a 2 decimales; porcentajes con 1 decimal. Fechas `AAAA-MM-DD`.

### Lo comun a las dos respuestas

```json
{ "status":"ok", "codigo":0, "data": {
    "vendedor": { "codusu":"293", "codven":"V0261", "nombre":"UTANI FERNANDO", "tipo":"CARTERA" },
    "anno":2026, "mes":9, "actual":false, "corte":"2026-09-30", "actualizado":"2026-10-24 12:29:10",
    "reemplazadoPor": null, "reemplazaA": [],
    "resumen": { ... },
    "comparacion": [
      { "anno":2026, "mes":9, "corte":"2026-09-30", "clientes":41, "venta":508889.68 },
      { "anno":2026, "mes":8, "corte":"2026-08-31", "clientes":44, "venta":443503.27 },
      { "anno":2026, "mes":7, "corte":"2026-07-31", "clientes":43, "venta":520085.8 },
      { "anno":2026, "mes":6, "corte":"2026-06-30", "clientes":43, "venta":547249.8 } ],
    "riesgo": { "clientes":13, "promedioMensual":15163.32, "lista":[ ... ] },
    "clientes": [ ... ]
} }
```

| campo | que es |
|---|---|
| `corte` | hasta que dia se cuenta: hoy en el mes en curso, el ultimo dia en uno cerrado |
| `reemplazadoPor`, `reemplazaA` | los mismos de la seccion 3 |
| `comparacion` | **el mes y los 3 anteriores, cada uno hasta el mismo dia** (en el mes en curso, el dia de hoy; en uno cerrado, cada mes completo): cuantos `clientes` le dejaron venta que le cuenta y cuanta `venta`. **En la cartera trae ademas `libres`**: cuantos clientes libres atendio. Su cobertura de clientes de ese mes es `clientes` + `libres`. El primero es el mes pedido. Sirve para *«a esta altura, ¿voy mejor o peor que antes?»* |
| `resumen.concentracion` | **que parte de su venta sale de sus 5 clientes mas grandes**: `{clientes, venta, porcentaje}`. Con 70 % o mas, depende de muy pocos. `porcentaje` es `null` si la venta no es positiva |
| `riesgo` | **clientes en riesgo**: le compraron en alguno de los 3 meses anteriores y en este todavia no. `clientes` (cuantos), `promedioMensual` (lo que suman por mes entre todos, la venta en juego) y `lista`, ordenada por lo que compraba cada uno |

**Cada cliente** (en `clientes`, `riesgo.lista` y `reemplazo`) trae:

| campo | que es |
|---|---|
| `codcli`, `nombre` | el cliente |
| `venta`, `docs` | lo que le cuenta al vendedor en el mes, y en cuantas facturas o boletas |
| `atendido` | `venta` mayor a 0 |
| `ultimaCompra` | la ultima factura o boleta que le hizo este vendedor en los ultimos 4 meses. `null` si ninguna |
| `promedioMensual` | lo que le compraba por mes en los 3 meses anteriores |
| `otros` | **lo que otros vendedores le facturaron en el mes a este cliente**, solo si el cliente **es suyo segun las facturas del mes**: `[{codven, nombre, venta}]`. No le cuenta. En la cartera de un vendedor de vacaciones aqui sale su reemplazo. En cobertura casi siempre viene `[]`, porque la mayoria de sus clientes no son suyos (en el ejemplo de la seccion 6, 4 de 191 traen algo) |
| `mesesConCompra` | solo en `riesgo.lista`: en cuantos de los 3 meses anteriores le compro |

### Cartera — `GET /v1/zona/cartera?codusu=293`

```json
"resumen": {
  "asignados":99, "atendidos":41, "sinAtender":58, "porcentaje":41.4,
  "venta":508889.68, "ventaPropia":508889.68, "ventaReemplazo":0, "ventaDeOtros":2612.08,
  "ventaFueraDeCartera": { "clientes":14, "venta":7228.88,
                           "libres":   { "clientes":1, "atendidos":1, "venta":3197.94 },
                           "conDueno": { "clientes":13, "venta":4030.94 } },
  "coberturaClientes": { "total":42, "cartera":41, "reemplazo":0, "libres":1 },
  "concentracion": { "clientes":5, "venta":325729.88, "porcentaje":64 } }
```

| campo | que es |
|---|---|
| `asignados`, `atendidos`, `sinAtender`, `porcentaje` | su cartera: cuantos clientes tiene, cuantos atendio en el mes, cuantos no, y el % atendido |
| `venta` | lo que le cuenta: `ventaPropia` + `ventaReemplazo`. Es su `avance` |
| `ventaPropia` | lo que facturo a sus clientes |
| `ventaReemplazo` | lo que facturo a clientes de **otro vendedor de cartera**. Le cuenta, haya un reemplazo detectado o no |
| `ventaDeOtros` | lo que **otros** facturaron a sus clientes. **No le cuenta**; se muestra para que se vea |
| `ventaFueraDeCartera` | **nuevo.** Lo que **el** facturo a clientes que **no son de cartera**: `{clientes, venta}`, y separado en `libres` (oficina o sin dueño: `{clientes, atendidos, venta}`) y `conDueno` (de un vendedor que no es de cartera: `{clientes, venta}`). **El monto no le cuenta a nadie** (seccion 2). Se muestra para que el jefe vea esa venta |
| `coberturaClientes` | **nuevo. Su cobertura de clientes:** cuantos clientes atendio en total (`total`), sumando los suyos (`cartera`, igual a `atendidos`), los de un compañero de cartera (`reemplazo`) y los **libres** (`libres`, que cuentan como cliente pero no como monto). Los de un vendedor de cobertura no entran |

Listas:

- **`clientes`:** **todos** sus asignados, atendidos o no (como mucho unos 200), del que mas compro al
  que menos. Ademas de lo comun, traen `suyo: true`, `enCarteraHoy` (`false` si en el maestro ya es
  de otro y solo figura en las facturas del mes) y `dueno: null`.
- **`reemplazo`:** los clientes de otras carteras que atendio, con `suyo: false` y
  `dueno: {codven, nombre}`. Normalmente vacia.
- **`fueraDeCartera`:** **nuevo.** Los clientes de `ventaFueraDeCartera`, del que mas al que menos:
  `{codcli, nombre, venta, docs, dueno, libre, atendido}`. Solo trae esos campos, no los comunes.
  - `venta` es lo que el les facturo, y **no le cuenta**.
  - `dueno` es `{codven, nombre}` del dueño en sus facturas (`V0000` viene como `OFICINA`), o `null`
    si no tenian dueño.
  - `libre` es `true` si es de la oficina o sin dueño.
  - `atendido` es `true` si es libre y le quedo venta mayor a 0: **ese si cuenta en
    `coberturaClientes`**. En los que no son libres siempre es `false`.
- **`riesgo`:** solo de entre sus asignados.

Ejemplo de vacaciones, GONZALES CRISTOPHER en agosto: `atendidos: 0`, `venta: -2600.13`,
`ventaDeOtros: 621239.33` y `reemplazadoPor` GONZALES JUAN.

### Cobertura — `GET /v1/zona/cobertura?codusu=399`

```json
"resumen": {
  "atendidos":181,
  "porDueno": { "propio":  { "clientes":61, "venta":281637.84 },
                "cartera": { "clientes":25, "venta":108038.93 },
                "libre":   { "clientes":49, "venta":61750.67 },
                "otro":    { "clientes":46, "venta":70438.71 } },
  "asignados":195, "asignadosAtendidos":66, "asignadosSinAtender":129, "porcentajeAsignados":33.8,
  "venta":463979.9,
  "nuevos": { "clientes":17, "venta":30992.81 },
  "concentracion": { "clientes":5, "venta":168234.56, "porcentaje":36.3 } }
```

| campo | que es |
|---|---|
| `atendidos` | a cuantos clientes les dejo venta en el mes, sean de quien sean |
| `porDueno` | esos atendidos separados por **de quien era el cliente segun sus facturas** (si hay varias, la de mas venta): `propio` (el mismo), `cartera` (un vendedor de cartera), `libre` (la oficina `V0000` o sin dueño; **nuevo**) y `otro` (otro vendedor que no es de cartera). Con cuantos clientes y cuanta venta. **Es venta de los clientes atendidos y no cierra con `venta`:** quedan fuera los clientes que terminaron el mes en 0 o en negativo, por notas de credito. En el ejemplo son 10 clientes que suman −57 886,24. Sugerimos rotularlo *«venta a los clientes atendidos, segun la factura»* |
| `asignados`, `asignadosAtendidos`, `asignadosSinAtender`, `porcentajeAsignados` | cuantos de **sus asignados** atendio: los del maestro de hoy mas los que figuran a su nombre en cualquier factura del mes, **la haya hecho el u otro**. A cobertura le cuenta todo lo que factura, pero esto dice si tambien cuida a los suyos. **No es lo mismo que `porDueno.propio`**, que mira solo el dueño de **sus** facturas: un cliente que hoy es suyo y al que facturo con otro dueño cuenta aqui y no alli. Por eso 66 frente a 61 |
| `venta` | todo lo que facturo. Es su `avance` |
| `nuevos` | **clientes nuevos**: atendidos en el mes que **no tenian ninguna factura ni boleta en la empresa en los 12 meses anteriores**. Cuantos y cuanta venta |

Listas:

- **`clientes`:** **solo los que facturo en el mes**, del que mas compro al que menos. **Los asignados
  sin atender no vienen en la lista, solo su cuenta**: pueden ser miles (RAMIREZ AUGUSTO tiene 2 531).
  Para esos sirve `riesgo`. Ademas de lo comun, traen
  `dueno: {codven, nombre, tipo}` y `nuevo` (`true` si es cliente nuevo).
  - `dueno.tipo` es `propio`, `cartera`, `libre` u `otro`, como en `porDueno`. **No es lo mismo que
    `vendedor.tipo`** (`CARTERA`/`COBERTURA`), aunque se llamen igual.
  - Un cliente de la oficina viene con `dueno: {codven:"V0000", nombre:"OFICINA", tipo:"libre"}`.
  - Uno sin dueño en sus facturas viene con `dueno: null`, y en `porDueno` cuenta como `libre`.
- **`riesgo`:** **sin los clientes que hoy son de la cartera de alguien**. A esos los cuida su dueño,
  aunque este vendedor los haya atendido un tiempo (por ejemplo, en un reemplazo).

### Tiempos

Cada llamada tarda entre 0,2 y 0,4 segundos y pesa hasta unos 60 KB (RAMIREZ). Se calcula en el
momento, como el avance.

---

## 9 · Respuestas a [respuesta-zona-clientes.md](respuesta-zona-clientes.md)

Su lectura de la seccion 1 es correcta en todo. Las seis preguntas:

**1 · ¿`sinCuota` trae `reemplazadoPor` y `reemplazaA`? Si**, con la misma forma que en `vendedores`.
En octubre MELENDEZ y GONZALES JUAN estan los dos en `sinCuota`. Quedo agregado a la tabla de
`sinCuota` (seccion 3).

**2 · El menu.** `GET /v1/vendedor/zona` devuelve en `data` **solo `{clave: texto}`**, sin acciones;
asi es para todos los modulos de todos los grupos, tambien `cuota`. Para el 126:

```json
"data": { "cotizacion":"Permite manejar cotizaciones",
          "avance":"Avance de cuota de todos los vendedores del grupo 20",
          "probabilidad":"Probabilidad de que un vendedor llegue a su cuota, comparada con meses anteriores",
          "clientes":"Revisa la cartera o la cobertura de clientes de cada vendedor del grupo 20" }
```

- Si el menu trae `clientes`, **las dos rutas estan permitidas**: tienen el mismo permiso, solo el
  grupo 34. **No puede venir una sola.**
- **No existe `GET /v1/zona/clientes`.** La pantalla elige la ruta por el `tipo` del vendedor, como
  ustedes proponen.
- `clientes` del menu y `/lista/clientes` no se cruzan: uno es una clave del menu del grupo 34 y el
  otro una accion del modulo `listas` del grupo 20.

**3 · `porDueno` no suma `venta`. Su suposicion es correcta:** `porDueno` solo suma los clientes
atendidos. Los 57 886,25 que faltan son 10 clientes que terminaron septiembre en 0 o en negativo por
notas de credito (−57 886,24, mas un centimo de redondeo). Quedo escrito en la seccion 8, con su
rotulo.

**4 · 61 frente a 66. Correcto, difieren a proposito.** `porDueno.propio` mira el dueño que figura
**en sus facturas**. Los asignados son los del maestro de hoy mas los clientes que figuran a su nombre
en **cualquier** factura del mes, la haya hecho el u otro. Sus rotulos (*«segun la factura»* y
*«segun su cartera de hoy»*) estan bien. Quedo escrito en la seccion 8.

**5 · La regla de CARTERA.**

- **a)** Habia que precisarlo, y la seccion 2 ya lo dice. A CARTERA le cuenta lo que factura a
  clientes de **cualquier** vendedor de cartera, **haya reemplazo detectado o no**: el umbral del
  10/50 % es solo para el aviso, no para la regla. Lo que factura a clientes que **no son de cartera**
  (de cobertura, de la oficina o sin dueño) **no le cuenta a nadie**, como ustedes dedujeron. Para que
  el jefe lo vea, la cartera trae ahora `ventaFueraDeCartera` y la lista `fueraDeCartera`
  (seccion 8). Hoy no es poco: en octubre, en bdnava01, UBILLUZ facturo asi US$ 156 825,55 a 47
  clientes. **Despues de hablarlo con los vendedores:** si esos clientes son **libres** (oficina o
  sin dueño), el monto sigue sin contar, pero **el cliente si cuenta como atendido** en su cobertura
  de clientes (`coberturaClientes`). Si son de un vendedor de cobertura, no cuentan de ninguna forma.
- **b)** Es sobre **lo que todos los vendedores facturaron a los clientes del dueño** ese mes, como
  entendieron. Si ese total es 0 o negativo no se busca reemplazo: viene `reemplazadoPor: null`, y
  `porcentaje` nunca es `null` cuando hay objeto.
- **c)** **No existe ese caso.** El reemplazado siempre es de cartera: solo se buscan reemplazos de
  carteras, porque cobertura no tiene clientes que dependan de el. *«Puede ser de cartera o de
  cobertura»* hablaba del que **reemplaza**. Quedo corregido en la seccion 3.

**6 · En que base.** **Todos los casos de la seccion 6 son de bdnava08**, y ahora la tabla trae las
cifras de esa base. Los ejemplos marcados *bdnava01* (los reemplazos de octubre en la seccion 3 y
MELENDEZ en la seccion 2) son de produccion y solo ilustran. En bdnava08 octubre llega hasta el 09/10:
MELENDEZ tiene −1 027,43 y GONZALES JUAN 115 071,62 (la misma cifra del ejemplo de `sinCuota`), con un
reemplazo de 60 515,45 (99,9 %).

**Erratas:** las cinco quedaron corregidas en su sitio.

| errata | donde |
|---|---|
| la nota del grupo 25 | volvio debajo de *«El avance es el mismo numero…»* (seccion 2) |
| la frase de MELENDEZ | 302 031 es lo que facturaron todos, y de eso 296 254,54 GONZALES (seccion 2) |
| `dueno` de la oficina o de nadie | `V0000` viene como `{codven:"V0000", nombre:"OFICINA", tipo:"libre"}`, no como `null`; `null` es solo sin dueño, y tambien es `libre` (seccion 8) |
| los dos `tipo` | quedo escrito que no son lo mismo (seccion 8) |
| `otros` en cobertura | viene en todas las filas, pero solo trae algo si el cliente es suyo segun las facturas del mes; si no, `[]` (seccion 8) |

`V0000` antes salia con el nombre de cualquiera de las cuentas que lo comparten («Usuario Vendedor»,
«Brissa»…). Ahora sale siempre `OFICINA`.

---

## 10 · Respuestas a [salida-zona-grupo34.md](salida-zona-grupo34.md)

**No cambia el contrato**: esta seccion solo responde sobre el orden de salida. Su tabla de la seccion 1 es
correcta, con un matiz: el menu solo muestra la entrada `clientes`. Las rutas `/zona/cartera` y
`/zona/cobertura` se autorizan aparte (mismo permiso, solo el grupo 34), asi que el 126 puede llamarlas
aunque el menu no traiga `clientes`.

**1 · ¿Se activan por separado?** Solo en parte.

| | por separado | como |
|---|---|---|
| **A** `clientes` en el menu | **si** | es una sola linea del menu del grupo 34; puede ir en un commit aparte |
| **B** la regla de CARTERA | **no** | no tiene interruptor: es la misma regla en el avance, la probabilidad, la cuota del propio vendedor y los clientes, y la `venta` de clientes tiene que ser igual al `avance` |
| **C** `reemplazadoPor` y `reemplazaA` | no | salen con el avance |
| **D** el tercer mes | no | es una constante; sale con el resto |

**El orden que proponen sirve tal cual**: ustedes suben primero, y despues sale el backend completo
(B, C, D y A) en un solo despliegue. Si prefieren que A vaya como paso aparte, avisen y se separa.

**2 · ¿Los tres meses desde el primer dia? Si**, con el mismo despliegue en el servidor de prueba y en
produccion. Valen para el **avance, la cartera y la cobertura**. La cuota del propio vendedor y las
marcas siguen en dos meses: no le pidan el tercero.

**3 · ¿Quien avisa a los vendedores de cartera?** Es un asunto interno de este lado y se resuelve en
una reunion previa a la salida. No tienen que resolverlo ustedes.

**4 · ¿Como se deshace?** Con **un solo `git revert` del backend**, que deshace A, B, C y D a la vez.
**No se puede revertir B sola**, por lo de la pregunta 1. Tras ese revert, el frontend no necesita nada:
el tercer mes responde `400 periodo invalido` (lo manejan), sin los campos de reemplazo no hay nota, y sin
`clientes` en el menu no hay entrada ni enlace. Si solo se quita `clientes` del menu, la entrada y el
enlace desaparecen, pero **las rutas siguen respondiendo al 126**; es solo lectura y no hace daño.

**5 · Servidor de prueba.** La direccion y las claves del 126 y del 297 las coordina directamente
quien lleva el proyecto de este lado con el equipo de frontend; no van en este documento. El 126 entra y el
297 recibe `403 usuario sin acceso`, como esperan. **Las cifras de bdnava08 estan en la seccion 6 de este
documento**, no en la seccion 4 de respuesta-zona-clientes.md (esa solo lista que comprobar).

**El servidor de prueba todavia no tiene este codigo.** Hay que montarlo antes de que ustedes lo
recorran (es el paso previo al 1 de su orden) y se les avisa cuando este.
