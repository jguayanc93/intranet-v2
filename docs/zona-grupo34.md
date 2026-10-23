# Grupo 34 — Jefe de zona: avance y probabilidad

Contrato de los dos modulos nuevos del **grupo 34 (jefe de zona)**. Por ahora el jefe de zona mira
**todo el grupo 20** (cobertura y cartera): el avance de la cuota de todos los vendedores y, de uno en
uno, la probabilidad de que lleguen a su cuota. Implementado y probado en bdnava08. Los dos son
solo lectura.

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

Los permisos de los modulos que salieron del menu no se tocaron, igual que con el grupo 25: la
pantalla de cotizacion puede seguir usando las rutas de pedido o promocion que necesite.

---

## 2 · Reglas comunes

- **Quien sale:** los vendedores **del grupo 20 que registraron su cuota** de ese mes. El que no la
  registro no sale.
- **El avance es el mismo numero que el vendedor ve en su propia pantalla de cuota**
  (`/cuota/cobertura` o `/cuota/cartera`): el total de sus facturas y boletas del mes, **en dolares y
  con IGV**, las notas de credito restan, sin anuladas ni transferencias gratuitas. A un vendedor
  **COBERTURA** se le cuenta lo que facturo el; a uno **CARTERA**, lo de su cartera. Comprobado: el
  196 ve US$ 26 152,29 en su cuota y aqui sale lo mismo.
  *No es la regla de la cuota por marca del grupo 25 (que va sin IGV y solo con mercaderia y
  licitaciones): no hay que comparar las dos cifras.*
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
| `GET /v1/zona/avance?anno=2026&mes=9` | uno de los **dos meses anteriores** (`anno` y `mes` van juntos) |

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
| 400 | `periodo invalido` | avance: un mes que no es el actual ni uno de los dos anteriores, un mes futuro, o `anno` sin `mes` |
| 400 | `vendedor requerido` | probabilidad sin `codusu` |
| 404 | `vendedor desconocido` | ese `codusu` no es un vendedor del grupo 20 |
| 403 | `usuario sin acceso` | el usuario 297 (o cualquier otro del grupo 34 que no sea el 126), en el login y en cualquier ruta |
| 403 | `sin permiso` | otro grupo (20, 25…) |
| 401 | `falsa galleta` | sin sesion |

---

## 6 · Para probar en bdnava08

| caso | como |
|---|---|
| Avance de un mes cerrado con 9 vendedores (4 llegaron) | `GET /v1/zona/avance?anno=2026&mes=9` |
| Avance de agosto (6 vendedores, todos llegaron) | `?anno=2026&mes=8` |
| Mes en curso | `GET /v1/zona/avance`: en octubre solo el 196 registro cuota |
| Vendedores sin cuota | `sinCuota`: 20 en octubre, 12 en septiembre (Alina Gutierrez, la que mas factura) |
| Sin cuota el mes anterior | septiembre: 400, 269, 246 y 406 vienen con `mesAnterior: null` |
| Mes no permitido | `?anno=2026&mes=7` → 400 `periodo invalido` |
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

