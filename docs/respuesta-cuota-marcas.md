# Cuota por marca (grupo 25) — lo aplicado tras su actualización del 20/10

Responde a [cuota-grupo25.md](cuota-grupo25.md) (actualizado el 20/10/2026) y a
[servidor-prueba-grupo25.md](servidor-prueba-grupo25.md). **Las cinco preguntas y las dos
sugerencias están aplicadas** en la pantalla y probadas contra un simulacro de su documento
(`dev/simulador-cuota.js`). Falta recorrerla contra bdnava08: ver la sección 3.

**Nada sale a producción hasta que estén terminados los módulos del grupo 25 y probados en el servidor
de prueba**, y backend y frontend salen el mismo día.

---

## 1 · Sus respuestas, y cómo quedaron

| lo que contestaron | lo que hace ahora la pantalla |
|---|---|
| **1 · El cumplimiento del total cuenta solo las marcas con meta**, y viene `conMeta` | Se pinta tal cual llega, sin recalcular. Además se dice **en cuántas marcas hay meta**: «Venta · meta en 2 de 4», y una nota bajo el total («el cumplimiento cuenta solo las marcas que tienen meta en esa medida») cuando alguna medida no las cuenta todas. Si ninguna tiene meta en esa medida, «sin meta»; si todas la tienen, no dice nada. La meta de `margenPct` no se suma y su ausencia en un total no se llama «sin meta». Lo mismo en el general de cada uno (`porDueno`) |
| **2 · Si vienen `margen` y `margenPct`, se guardan los dos** | El formulario ya admite las dos y manda las dos. «Rentabilidad en US$» y «Rentabilidad en %» son campos independientes |
| **3 · `/cuota/mostrar` redirige al grupo 25** | **La pantalla entra siempre por `/cuota/mostrar` y ya no decide por el tipo de `/vendedor`.** Reconoce la cuota por marca por lo que llega (una lista `marcas`, o `sin marcas del mes`) y no vuelve a pedir lo que ya tiene. Un `400 no identificado` por esa ruta se explica con el camino al registro. Lo mismo en «Registrar»: decide por el `status: "cuota por marca"` de `/cuota/revisar` |
| **3 · `GET /cuota` sin `crear` para el grupo 25** | El hub pinta solo «Ver». `marcas` y `meta marca` están declarados en nuestro catálogo como permisos conocidos **sin tarjeta**, así que no hay avisos de «permiso sin declarar» ni importa el orden en que lleguen |
| **4 · Una meta de 0 no existe** | El formulario rechaza 0 y negativos antes de enviar («tiene que ser un número mayor que 0. Para quitar esa meta, déjala vacía»); el `meta invalida` del backend se muestra tal cual y el formulario se queda abierto. Para quitar una meta se manda `null`, que es lo que hace vaciar el campo |
| **5 · `proyeccion.cumplimiento.monto`** | Bajo la venta: «A este ritmo, el mes cierra en $ 58 469,03 · 116,9 % de la meta». Sin meta de monto, solo el cierre. También en el total y en el general de cada uno. En un mes anterior no hay proyección y no se pinta |
| **Sugerencia 1 · Meses anteriores** | Un selector «Mes» con **el mes en curso y los dos anteriores**. Un mes cerrado es de solo lectura: sin botones de meta (aunque `confirmada` venga `false`, que de un mes cerrado no dice nada de hoy), sin proyección, y con una línea que lo dice. `trabajadaHoy: false` → «Esta marca ya no se trabaja». `sin marcas en ese mes` → «No tenías marcas en agosto de 2026», sin botón a Marcas (no hay nada que elegir) y con el selector a la vista para volver. `periodo invalido` u otro fallo al cambiar de mes → se avisa y la pantalla se queda como estaba |
| **Sugerencia 2 · `metaMesAnterior`** | Al abrir «Fijar meta» de una marca **sin meta este mes y con `metaMesAnterior`**, el formulario parte de esos valores y dice: «Partimos de la meta que tuvo esta marca el mes pasado. Revísala y cámbiala si quieres: no se guarda hasta que pulses “Guardar meta”». Abrirlo o cancelarlo no guarda nada. Si la marca ya tiene meta este mes, es el formulario de corregir, con `meta` |

Lo que ya estaba y sigue igual: el aviso de que el avance es el de la marca en toda la empresa, las
barras sin color de alarma, repedir todo ante `409`/`403`, y que **solo viaja lo que cambió**.

---

## 2 · Dos decisiones nuestras, para que las conozcan

1. **Guardar una meta precargada manda todos los campos del formulario.** Como este mes la marca aún
   no tiene meta, todo lo que hay en el formulario es nuevo: `{ codmar, monto, margenPct, unidades }`,
   por ejemplo. Si la persona vacía un campo precargado no viaja un `null`: no había nada que borrar.
2. **Los meses del selector salen del mes que dice la respuesta.** Con `anno`/`mes` del mes en curso
   calculamos los dos anteriores. Solo cuando este mes **no hay marcas** (no hay `data`) usamos la
   fecha del navegador para armar la lista, para no negar el mes pasado a quien aún no tiene marcas
   asignadas. El backend sigue decidiendo qué meses valen (`periodo invalido`).

Y la pregunta pequeña que dejamos abierta, **ya resuelta con su segunda respuesta**: la pantalla de
«Registrar» cuota (`/cuota/revisar`, de cobertura y cartera) avisaba a especialistas y jefaturas por el
tipo de `/vendedor`. Ahora **decide por el `status: "cuota por marca"` que `/cuota/revisar` responde al
grupo 25**: les dice que su cuota se fija por marca y les lleva a «Ver mi cuota», sin formulario. Con
eso **ya no miramos el tipo de `/vendedor` en ningún sitio de la cuota**.

---

## 3 · Para recorrerlo contra bdnava08

De su documento de servidor de prueba, cumplimos lo que nos toca:

| condición | cómo la cumplimos |
|---|---|
| Se abre desde `http://127.0.0.1:8080` | Sí; ni `localhost` ni la IP de red |
| `credentials: 'include'` en todas las llamadas | Ya lo hace `CDK.http` |
| `401 falsa galleta` solo en `/vendedor` o `/cuota/mostrar` → reponer `tip` con `/login/identificador` y reintentar | Ya lo hace, una vez, sin entrar en bucle |
| Dirección **https bajo `compudiskett.com.pe`** | La pantalla se puede **apuntar a esa dirección sin tocar código**, solo en desarrollo y solo si es https bajo ese dominio: `localStorage.setItem("cdk.api", "https://<dirección>")`. Se quita con `removeItem` |

**Lo único que nos falta es la dirección del servidor y las claves de las cuentas de prueba**, que
según su documento las pasa quien coordina.

Dos cosas que preguntamos y que **ya comprobaron ustedes**: el `302` de `/cuota/mostrar` lleva
`access-control-allow-origin` y `access-control-allow-credentials`, y el preflight del `POST` de la meta
responde `204` con las cabeceras de su documento. Nuestro simulacro hace lo mismo (un `302` de verdad,
con esas cabeceras), y en Edge funciona. **Igualmente las volveremos a mirar con nuestras llamadas
reales** en cuanto lleguemos al servidor de prueba, porque el navegador es quien tiene la última
palabra con CORS.

### Casos que recorreremos

| caso | su cuenta | qué comprobamos |
|---|---|---|
| Especialista confirmado | 229 | que fija, corrige y borra metas, y lo que vale `puedoFijarMeta` |
| Especialista sin confirmar | 233 | `puedoFijarMeta: false` y `409 marcas sin confirmar` al forzar el `POST` |
| Sin marcas | 270 | `sin marcas del mes` y el botón a Marcas; el selector de mes disponible |
| Jefatura con `porDueno` | 071 | el general de cada uno; que solo pueda fijar ACER; el cumplimiento del total y de cada uno con `conMeta` |
| Marca con venta 0 | TDK, ADATA, AVERY | que `margenPct: null` se vea como «—» |
| Corrección parcial | 229, EPSON | que cambiar solo las unidades conserva el resto, y que `null` borra |
| Meta de 0 | 229 | `meta invalida` con un 0 forzado, y que el formulario se queda abierto |
| **Un mes anterior con datos** | 229, septiembre | solo lectura, sin proyección, `trabajadaHoy`, las marcas y la meta de entonces |
| **Un mes sin historia** | cualquiera, hace dos meses | `sin marcas en ese mes` |
| **Precarga** | 229 | `metaMesAnterior` en el formulario de una marca sin meta este mes |
| **Redirección** | cualquiera de los dos tipos | que `/cuota/mostrar` llegue a la pantalla por marca sin que el tipo intervenga |

Sabemos que las facturas de bdnava08 llegan hasta el 09/10/2026: el avance de octubre es de esos días,
y la proyección sale más baja de lo que sería con datos completos.

---

## 4 · Cierre

**Damos el módulo por cerrado cuando:**

- [x] la pantalla está construida y probada con el simulacro
- [x] las cinco preguntas están respondidas y reflejadas en la pantalla
- [x] las dos sugerencias están hechas
- [x] la ruta —`/cuota/mostrar`— y «Registrar» —`/cuota/revisar`— las decide lo que responde el backend, no el tipo
- [ ] tenemos la dirección del servidor de prueba y las claves de las cuentas
- [ ] los casos de la sección 3 están recorridos contra bdnava08

**Salida a producción, cuando termine el grupo 25:** subimos la pantalla nueva y **avisamos**; a partir del
aviso, ustedes retiran `/cuota/especialista`, `/multiple`, `/marcarevisar`, `/marcaupdate` y `/marcamostrar`.
Por nuestra parte, **ya no las llama ninguna pantalla**.
