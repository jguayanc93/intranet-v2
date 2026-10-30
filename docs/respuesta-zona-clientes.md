# Jefe de zona (grupo 34) — actualización del 24/10/2026: cómo la leímos y seis preguntas

Responde a [zona-grupo34.md](zona-grupo34.md) **actualizado el 24/10/2026**: el módulo nuevo `clientes` (sección 8), el cambio de lo que le cuenta a un vendedor
de **CARTERA** (sección 2), los reemplazos por vacaciones (sección 3) y el mes extra hacia atrás. La respuesta anterior, sobre la versión del 22/10, es
[respuesta-zona.md](respuesta-zona.md).

> **Estado al 26/10/2026.** El backend contestó las seis preguntas (sección 9 de [zona-grupo34.md](zona-grupo34.md)) y **ya está construido y probado con el simulacro**
> lo de esta actualización: el selector de tres meses, las notas de reemplazo y la pantalla de `clientes` (cartera y cobertura). Falta recorrerlo contra el servidor de prueba
> (sección 4). Lo de abajo es lo que enviamos el 24/10, sin cambios; el cierre de la sección 5 está al día.

**Todavía no hay nada construido de esta actualización.** Antes de hacerlo necesitamos que nos contesten las **seis preguntas de la sección 2**: las dos primeras condicionan cómo se
construye (dónde se muestra un reemplazo, qué trae el menú), la 3 y la 4 cambian cómo rotulamos unas cifras, y la 5 y la 6 aclaran la regla y dónde probar. Las **erratas** de la
sección 3 no bloquean nada.

**Nada sale a producción hasta que esté probado en el servidor de prueba, y backend y frontend salen el mismo día.** Esta vez pesa más que de costumbre: el cambio de
regla de CARTERA **modifica números que los vendedores ven hoy** en su propia pantalla de cuota.

---

## 1 · Cómo lo leímos

| cambio de su documento | lo que entendemos que hay que hacer en pantalla |
|---|---|
| **Hasta 3 meses atrás** en el avance y en los clientes | El selector del avance ofrece el mes en curso y los **tres** anteriores (hoy ofrece dos). `?anno=2026&mes=6` sigue siendo `400 periodo invalido` |
| **A CARTERA solo le cuenta lo que factura él** | **Nada que hacer en pantalla**: no se calcula nada, se muestra lo que llega. Cambian los números de esos vendedores en el avance, en la probabilidad y en su cuota |
| **`reemplazadoPor` y `reemplazaA`** | Una nota junto al vendedor, con la redacción que sugieren: *«vacaciones: su cartera la atendió GONZALES JUAN (98 %)»* y *«reemplaza a MELENDEZ WILLIAM»*. Sin reemplazo, nada |
| **Módulo `clientes`** | Una pantalla para elegir un vendedor del grupo 20 y ver sus clientes; se llega también desde una fila del avance. Se llama a `/cartera` o a `/cobertura` **según el `tipo` del vendedor**, nunca al revés |
| **El maestro de clientes no guarda historia** | En un mes anterior, la pantalla avisa que *la lista de asignados puede estar incompleta*, como piden |
| **`comparacion`, `riesgo`, `concentracion`, `nuevos`, `porDueno`** | Se muestran tal cual vienen; nada se recalcula en el cliente |

Lo demás de la sección 8 (reglas, listas, montos en US$ con IGV, `atendido` como venta mayor a 0, el 400 `vendedor de otro tipo`) lo leemos como está escrito.

---

## 2 · Preguntas

### 1 · ¿Las filas de `sinCuota` traen `reemplazadoPor` y `reemplazaA`?

**Qué vimos.** La sección 3 dice que *«normalmente el reemplazado no registró cuota ese mes, así que sale en `sinCuota`»*, y el ejemplo de MELENDEZ (octubre) es
justo ese caso. Pero la tabla de campos de `sinCuota` solo lista `codusu`, `codven`, `nombre`, `tipo`, `avance`, `hoy` y `proyeccion`, y el ejemplo JSON no dice en qué lista
está cada fila. La introducción habla de *«cada fila del avance»*.

**Qué suponemos mientras tanto.** Que las filas de `sinCuota` traen los dos campos, con la misma forma que en `vendedores`.

**Por qué importa.** Si no los traen, el caso principal (el que se fue de vacaciones) no tiene dónde mostrarse.

### 2 · ¿Cómo viene el módulo `clientes` en `GET /v1/vendedor/zona`?

**Qué vimos.** El documento dice que `clientes` es un módulo con **dos acciones**, `cartera` y `cobertura`, pero no muestra qué devuelve el menú para él.
Avance y probabilidad no tienen acciones.

**Qué suponemos mientras tanto.** Que el menú trae la clave `clientes` con sus acciones, `["cartera", "cobertura"]`, igual que `cuota` trae las suyas.

**Lo que necesitamos saber:**

- ¿Es así? ¿O viene solo la clave, y las dos rutas están siempre permitidas?
- ¿Puede venir **una sola** de las dos acciones? Si fuera así, la pantalla ofrecería solo los vendedores de ese tipo.
- ¿Existe algún `GET /v1/zona/clientes` que devuelva las acciones, o no?

*(Ya existe una acción `clientes` dentro de `listas` —`/lista/clientes`—; son niveles distintos y no nos choca, pero queremos confirmar que no se confunden en el
menú.)*

### 3 · En cobertura, `porDueno` no suma `venta`

**Qué vimos.** En el ejemplo de GONZALES JUAN:

| | clientes | venta |
|---|---|---|
| `propio` | 61 | 281 637,84 |
| `cartera` | 25 | 108 038,93 |
| `otro` | 95 | 132 189,38 |
| **suma** | **181** (= `atendidos` ✓) | **521 866,15** |
| `resumen.venta` | | **463 979,90** |

Los clientes cuadran; la venta **no**: faltan 57 886,25.

**Qué suponemos mientras tanto.** Que `porDueno` suma solo lo de los clientes atendidos (con venta neta mayor a 0), y que la diferencia son las notas de crédito de
clientes que quedaron en cero o en negativo.

**Lo que pedimos.** Que nos confirmen la causa, y que lo digan en el documento. Rotularíamos `porDueno` como *«venta a los clientes atendidos»* para que nadie espere que
cierre con el total.

### 4 · `propio.clientes` (61) frente a `asignadosAtendidos` (66)

**Qué vimos.** En el mismo ejemplo, `porDueno.propio` dice que atendió 61 clientes suyos, y `asignadosAtendidos` dice que atendió 66 de sus asignados. Parecen la
misma cosa con dos cifras.

**Qué suponemos mientras tanto.** Que difieren a propósito: `porDueno` usa el dueño que figura **en la factura** y los asignados usan el **maestro de hoy más las facturas del
mes** (sección 8, «Asignados»).

**Lo que pedimos.** Que lo confirmen. Si es así, rotulamos `porDueno` como *«según la factura»* y los asignados como *«según su cartera de hoy»*, para que el jefe no se encuentre
dos números distintos sin explicación.

### 5 · La regla de CARTERA: tres casos que el documento no cubre

La regla nueva (sección 2) dice que a CARTERA le cuenta lo que **facturó él** a clientes de cartera, *«los suyos y los de un compañero de cartera al que reemplaza»*.

**a) Un cliente que no es de ninguno de los dos.** Un vendedor de cartera factura a un cliente que no es suyo ni de un compañero al que reemplaza: porque el reemplazo no
llegó al umbral (dueño hasta el 10 %, otro al menos el 50 %), porque es de otra cartera sin reemplazo, de cobertura o de nadie.

- Entendemos que **no le cuenta a él**, y que **tampoco al dueño del cliente**, porque al dueño solo le cuenta lo que facturó él.
- ¿Esa venta **no cuenta para nadie** en el avance? Si es así, el jefe de zona no puede ver que se vendió y no se le atribuyó. ¿Hay algún campo donde aparezca, como
  `ventaDeOtros` para el dueño?

**b) El porcentaje de `reemplazadoPor` / `reemplazaA`.** ¿Sobre qué total se calcula? Por el ejemplo de MELENDEZ (296 254,54 es el 98,1 % de ≈302 031) entendemos que es **lo que
todos los vendedores facturaron a los clientes del dueño**. Si ese total es 0 o negativo, ¿el `porcentaje` viene `null`?

**c) Un cartera que reemplaza a un cobertura.** `reemplazaA` dice *«puede ser de cartera o de cobertura»*. La sección 2 dice que el cartera cuenta solo lo de clientes de
cartera. ¿Lo que facturó a los clientes del de cobertura al que reemplazó le cuenta o no?

### 6 · ¿En qué base se reproduce cada caso de la sección 6?

**Qué vimos.** La cabecera dice *«Implementado y probado en bdnava08»* y la sección 6 es *«Para probar en bdnava08»*. Pero el ejemplo de los reemplazos de octubre dice
*«(bdnava01)»* y la comprobación de la cifra de clientes dice *«con 6 vendedores en bdnava01, al céntimo»*. Además, GONZALES JUAN tiene en octubre un avance de **435 337,12**
en el ejemplo de reemplazos (bdnava01) y de **115 071,62** en el ejemplo de `sinCuota` de la sección 3 (bdnava08).

**Lo que pedimos.** Que nos digan **cuáles de los casos de la sección 6 se reproducen en bdnava08**, en particular *«octubre: MELENDEZ ← GONZALES JUAN»* y los de cartera y
cobertura, y cuáles solo en bdnava01. Con eso sabemos contra qué servidor recorrer cada uno y qué cifras esperar.

---

## 3 · Erratas y precisiones (no bloquean)

| dónde | qué |
|---|---|
| **Sección 2, nota en cursiva** | *«No es la regla de la cuota por marca del grupo 25 (sin IGV…)»* quedó **debajo del bullet «Meses»**, y se lee como si hablara de los meses. Hablaba del bullet «El avance es el mismo número…», que es donde estaba antes de la actualización |
| **Sección 2, ejemplo de MELENDEZ** | Dice *«se le contaban US$ 302 031 que facturó GONZALES JUAN»*; la sección 3 dice que GONZALES facturó **296 254,54**. Entendemos que 302 031 es lo que **todos** facturaron a sus clientes. Si es así, conviene corregir la frase |
| **`dueno` en las listas de clientes** | En cartera (`reemplazo`) es `{codven, nombre}` y en cobertura `{codven, nombre, tipo}`. Para un cliente de la oficina `V0000` o *«de nadie»*, el documento no dice qué viene: suponemos **`dueno: null`**. ¿Es así? |
| **`dueno.tipo` frente a `vendedor.tipo`** | Los dos se llaman `tipo` y significan otra cosa: `propio`/`cartera`/`otro` frente a `COBERTURA`/`CARTERA`. No pedimos cambiarlo; solo lo decimos por si se puede dejar escrito |
| **`otros` en cobertura** | Se define como *«lo que otros vendedores le facturaron a este cliente **suyo**»*, pero en cobertura la mayoría de los clientes de la lista no son suyos. Suponemos que viene para todos los clientes de la lista, con lo que **otros** les facturaron. ¿Es así? |

---

## 4 · Para recorrerlo contra el servidor de prueba

Con la dirección y las claves que pase quien coordina, la pantalla se apunta a ese servidor sin tocar código ([despliegue-grupo25.md](despliegue-grupo25.md), sección 1). **Es solo lectura.**
Los casos son los de su sección 6; la pregunta 6 nos dirá en qué base va cada uno.

| caso | qué comprobamos |
|---|---|
| **El 126** | el menú es de **cuatro** módulos (`cotizacion`, `avance`, `probabilidad`, `clientes`), y las pantallas cargan |
| **Julio** en el avance | el selector lo ofrece y responde; `?anno=2026&mes=6` → `400 periodo invalido` |
| **Reemplazos** | octubre, agosto y julio: la nota sale en la fila del reemplazado y en la del que reemplaza, **también en `sinCuota`** (pregunta 1) |
| **Cartera normal** | `codusu=293`, septiembre: 99 asignados, 41 atendidos, las cifras de `resumen` |
| **Cartera de vacaciones** | `codusu=246`, agosto: 0 atendidos, `reemplazadoPor` GONZALES JUAN, y `ventaDeOtros` con lo que él facturó |
| **Cartera que reemplaza** | `codusu=400`, agosto: `reemplazaA` GUTIERREZ y 40 clientes en `reemplazo` |
| **Cobertura** | `codusu=399`, septiembre: 181 atendidos y 17 nuevos; y `codusu=306`, con 2 531 asignados, sin que la pantalla se vuelva lenta |
| **Acción equivocada** | `/cartera?codusu=399` → `400 vendedor de otro tipo`: se dice con su mensaje |
| **`venta` frente a `avance`** | para los vendedores que se prueben, la `venta` de clientes y el `avance` del avance son **la misma cifra** |

---

## 5 · Cierre

**Damos el módulo por cerrado cuando:**

- [x] las seis preguntas de la sección 2 están contestadas (sección 9 de [zona-grupo34.md](zona-grupo34.md), 24/10/2026)
- [x] la pantalla de clientes, el selector de tres meses y las notas de reemplazo están construidos y probados con el simulacro (26/10/2026)
- [ ] tenemos la dirección del servidor de prueba y las claves
- [ ] los casos de la sección 4 están recorridos contra el servidor de prueba
