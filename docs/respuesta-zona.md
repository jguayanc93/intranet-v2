# Jefe de zona (grupo 34) — lo construido y lo que necesitamos aclarar

Responde a [zona-grupo34.md](zona-grupo34.md) (actualizado el 22/10/2026). **Las dos pantallas están construidas y probadas contra un
simulacro de su documento** (`dev/simulador-zona.js`): **Avance** (de todos los vendedores del grupo 20) y **Probabilidad** (de uno).

**Nada sale a producción hasta que estén probadas en el servidor de prueba**, y backend y frontend salen el mismo día.

---

## 1 · Cómo lo leímos

**Quién entra y su menú.** El usuario 126 entra y su menú es **exactamente** `cotizacion`, `avance` y `probabilidad`: tres módulos, que caben todos en la
barra de abajo de un móvil. **El 297 recibe `403 usuario sin acceso`**:

- **En el login:** no sale de la pantalla, no se le da sesión, y se le dice *«Tu usuario todavía no tiene acceso a la intranet. Consulta con tu
  jefatura o con sistemas»*. **No** se le dice que su contraseña es incorrecta: la acertó.
- **En cualquier ruta, tambien en `/vendedor`:** no hay sesión que conservar, y se vuelve al login. Lo hace el cliente HTTP para **todas** las pantallas,
  no cada una por su cuenta; un `403 sin permiso` (otro grupo) no cierra la sesión.
- El tipo `ZONA` pasa a «operativo» en nuestro catálogo.

### Avance — `GET /v1/zona/avance`

| tema | lo que hace la pantalla |
|---|---|
| **El total** | Lo que llevan todos, su meta, cuántos tienen cuota, cuántos ya llegaron, lo facturado hoy y cuántos **no registraron su cuota**. Una barra con **una marca de cuánto del mes ya pasó** (`esperado`: 71 el día 22), y *«Llevan el 56.2 % de la meta, y ya pasó el 71 % del mes»*. Lo de **cuántos hay en cada color** del semáforo, como números |
| **El semáforo, con texto** | Cada vendedor dice **«Logrado», «Adelantado», «Justo» o «Atrasado»**, y el color solo acompaña (una persona daltónica lee lo mismo). Se puede **filtrar por semáforo** y por tipo (cobertura o cartera), y buscar por nombre o código |
| **Cada vendedor** | Su barra con la misma marca de lo que ya pasó del mes, lo que lleva de su meta y su %, lo que le falta, lo que facturó hoy, *«a su ritmo de los últimos 90 días cerraría en…»* (`proyeccion`), la probabilidad, y **cómo cerró el mes anterior** (o *«el mes anterior no registró cuota»*). Un enlace a su probabilidad |
| **Casos que no son el común** | Quien ya llegó: sin «le falta» y *«Ya llegó a su meta»*. Un vendedor nuevo (`historia insuficiente`): sin proyección ni probabilidad, y lo dice. Quien devolvió más de lo que vendió (avance negativo): su % sale negativo y la barra no se sale por la izquierda. Una barra que pasa de 100 se corta en 100 |
| **Los que no registraron cuota** | Aparte, en un bloque plegado con cuántos son, del que más factura al que menos: lo que facturaron, lo de hoy y cómo cerrarían. Para saber **a quién pedirsela** |
| **Meses cerrados** | El mes en curso y los dos anteriores. En un mes cerrado **no hay semáforo, ni lo de hoy, ni proyección ni probabilidad** —vienen en `null`—: cada vendedor dice si **logró su meta** o *«No llegó»*, y la marca de «ya pasó» no se pone |
| **Tiempo real** | Como recomiendan: se **actualiza sola cada 3 minutos** mientras la pantalla se ve y es el mes en curso, y con un botón «Actualizar». **No** se actualiza en un mes cerrado, ni con la pantalla en segundo plano (no se gasta una lectura). Dice *«actualizado a las 18:47»* con su `actualizado` |
| **IGV** | La pantalla dice que **es en dólares y con IGV**, el mismo número que cada vendedor ve en su cuota; no la regla de la cuota por marca (sin IGV) |

**Nada se calcula en pantalla**: el %, el semáforo, `esperado`, la proyección, la probabilidad y el mes anterior son los suyos, aunque no cuadren entre sí.

### Probabilidad — `GET /v1/zona/probabilidad?codusu=196`

- **Sin vendedor elegido**, la lista para elegirlo (la del avance, **más los que no registraron cuota**: la probabilidad se puede pedir de cualquiera
  del grupo 20). Con `?codusu=` —o tocando «Ver su probabilidad» en una fila— se abre directo.
- **Cuatro meses, del actual al más antiguo**, cada uno cortado el mismo día, con la **probabilidad grande** (es lo que se compara de un mes a otro), la barra
  de lo que llevaba, lo que le faltaba, **cuántos días de venta quedaban** (hábiles y sábados), lo que **tenía que facturar por día frente a lo que suele**, y
  los escenarios **rotulados «A su ritmo habitual»**. En los meses pasados, **cómo terminó**: *«Terminó en 105.7 % de su meta · la logró»*.
- **El mes actual se dice en presente** («lleva», «quedan», «tiene que facturar») y los pasados en pasado: era lo que llevaba **a esa altura**.
- **Un mes sin cuota** (`sin cuota`) no inventa una probabilidad: dice *«Sin cuota registrada ese mes»*, sin barra, pero con lo que facturó y cómo terminó el mes.
  **`meta alcanzada`** dice *«Ya llegó a su meta»*. **`historia insuficiente`**, *«Vendedor nuevo»*, sin escenarios ni «suele facturar».
- Un `codusu` que no es del grupo 20 (`404 vendedor desconocido`) no se reintenta: se dice y se ofrece elegir otro.
- **«Cómo se calcula»**, plegado, con los cinco pasos de su sección 4, y la aclaración de que **los escenarios no llevan la corrección**: por eso la probabilidad puede
  ser alta y el «probable» quedar algo por debajo de la meta.

---

## 2 · Lo que necesitamos aclarar

### 1 · ¿Los montos de la probabilidad también son con IGV?

Su sección 2 dice que **el avance es en dólares y con IGV**, y esa regla aparece junto a la lista de avance. En la probabilidad no lo repiten: ¿el `avance`, el `ritmo`
(`necesario` y `habitual`), los `escenarios` y el `cierre` de **cada mes** son también **con IGV**? Lo asumimos —es lo coherente con la cuota, que el vendedor registra con IGV— y la
pantalla lo dice (*«Todo en dólares y con IGV»*), pero **si fuera sin IGV, estaríamos rotulando mal cada número**.

### Una sugerencia, opcional

- **El texto del 297.** Hoy la pantalla de login dice un texto nuestro (*«Tu usuario todavía no tiene acceso a la intranet…»*). Si prefieren que lea **el `msg` de su
  respuesta**, lo usamos; basta con que nos digan cuál será, porque cambiará cuando se decida qué pasa con ese usuario.

---

## 3 · Para recorrerlo contra bdnava08

Con la dirección del servidor de prueba y las claves (las pasa quien coordina), la pantalla se apunta a ese servidor sin tocar código
([despliegue-grupo25.md](despliegue-grupo25.md), sección 1). **Es solo lectura.**

| caso | qué comprobamos |
|---|---|
| **El 126** | el menú es de tres módulos y **ni factura ni promoción ni cuota ni programador**; las dos pantallas cargan |
| **El 297** | en el login, el texto de «sin acceso» y **ninguna** sesión; y con una sesión de antes, cualquier pantalla lo devuelve al login |
| Avance de **septiembre** (9 vendedores, 4 llegaron) y de **agosto** (6, todos llegaron) | sin semáforo, con «Logró su meta» / «No llegó», y **sin** lo de hoy ni proyección |
| **Mes en curso** | en octubre solo el 196 registró cuota: una barra, un semáforo `atrasado`, y **20 vendedores en «No registraron su cuota»** |
| **`mesAnterior: null`** | septiembre: 400, 269, 246 y 406 dicen *«el mes anterior no registró cuota»* |
| **`?anno=2026&mes=7`** | `400 periodo invalido`: el selector no ofrece ese mes, pero si llegara, se dice con su mensaje |
| **Probabilidad del 196** | los cuatro meses con cuota, con su cierre en los tres pasados |
| **`codusu=399`** | julio con **meta alcanzada** (al día 22 ya iba en 103 %) |
| **`codusu=414` y `codusu=246`** | los meses **sin cuota**, mostrando lo que facturaron |
| **`codusu=229`** | `404 vendedor desconocido`: se dice, y se puede elegir otro |
| **Un usuario de otro grupo** (20 o 25) | `403 sin permiso` en las dos rutas, y **sin** cerrar su sesión |

En bdnava08 las facturas llegan hasta el **09/10/2026**: el avance de octubre y su probabilidad son de esos días, y por eso el 196 sale con 0 %.
Para ver probabilidades con sentido, los meses anteriores de la probabilidad.

---

## 4 · Cierre

**Damos el módulo por cerrado cuando:**

- [x] las dos pantallas están construidas y probadas con el simulacro
- [ ] la pregunta de la sección 2 está respondida
- [ ] tenemos la dirección del servidor de prueba y las claves
- [ ] los casos de la sección 3 están recorridos contra bdnava08
