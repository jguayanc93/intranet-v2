# Despliegue del grupo 25 y cómo probarlo contra el servidor de prueba

Lo que hay que saber y comprobar antes de subir los módulos del grupo 25 (marcas, cuota por marca, reportes, ajuste,
cobertura y vendedor del mes), y cómo recorrerlos contra el **backend de prueba** (base bdnava08).

---

## 1 · El «servidor de prueba» es el del backend, no uno para el frontend

El backend de prueba solo acepta peticiones desde **`http://127.0.0.1:8080`** (es su `CORS_ORIGENES_EXTRA`), va por
**https** y su dirección está **bajo `compudiskett.com.pe`**, porque las cookies `cdk` y `tip` son `Secure` y de ese dominio.
Por eso **el frontend no se sube a otro sitio para probarlo**: se sirve en local, en ese origen exacto, y se apunta al
backend de prueba. Ver [servidor-prueba-grupo25.md](servidor-prueba-grupo25.md).

```
cd teletran2
node dev/servidor.js            # sirve el frontend en http://127.0.0.1:8080 (y el simulacro de la API en :3000)
```

Después, en la consola del navegador, **estando en `http://127.0.0.1:8080`** (no en `localhost`):

```js
localStorage.setItem("cdk.api", "https://<dirección del servidor de prueba>")    // apunta al backend de prueba
localStorage.removeItem("cdk.api")                                               // vuelve al simulacro
```

- La dirección y las claves de las cuentas **las pasa quien coordina**; no están en el repositorio.
- Solo funciona en desarrollo y solo acepta `https` bajo `compudiskett.com.pe` ([core/cdk-rutas.js](../core/cdk-rutas.js)). En
  producción no hace nada, así que no puede apuntar una pantalla desplegada a otro servidor.
- Al cargar, la consola dice *«La API apunta al servidor de prueba: …»*. Si no lo dice, se está usando el simulacro.

---

## 2 · Antes de subir

Los tres, en este orden, y los tres tienen que salir limpios:

| comprobación | qué dice |
|---|---|
| `node dev/pruebas/todas.js` | que cada pantalla hace lo que debe, contra el simulacro del contrato del backend |
| `node dev/revisar-despliegue.js` | que **lo que se sirve está completo y no lleva restos**: cada página carga solo archivos que existen y que git conoce, ninguno de `dev/`; ningún script con errores de sintaxis; ningún `debugger` ni clave escrita; y lo nuevo sin direcciones escritas a mano ni `console.log` sueltos |
| `git status` | que no queda nada sin commitear de lo que se quiere subir |

`node dev/revisar-despliegue.js` deja pasar **un problema que ya existía** y no es de esta entrega: `programador_entregar.html`
carga un archivo que nunca existió, de un módulo que está desactivado en el catálogo.

**Qué se despliega:** todo menos `dev/` y la documentación (`docs/` y los `.md`). `dev/` contiene el servidor de demostración,
los simulacros y las pruebas, y no forma parte del producto ([dev/pruebas/README.md](../dev/pruebas/README.md)).

---

## 3 · La regla: backend y frontend salen el mismo día

El frontend de esta entrega **depende del backend del 21 y 22/10/2026**, y el backend **retiró las rutas antiguas** (responden `404`):

| el frontend ahora llama | y ya no llama |
|---|---|
| `/v1/marcas*`, `/v1/login/registro*` (con marcas) | — |
| `/v1/reporte/marca*` | `/reporte/marcas`, `/stoc`, `/tiempo`, `/precios` |
| `/v1/cuota/marcas*` | `/cuota/especialista`, `/multiple`, `/marcarevisar`, `/marcawach`, `/marcaupdate`, `/marcamostrar` |
| `/v1/ajuste*`, `/lista/pedidos` con `editable` en la posición 7 | — |
| `/v1/cobertura/*`, `/v1/vendedormes/top` | — |
| `/v1/vendedor` con `ajustesPendientes` y el menú de siete módulos del grupo 25 | — |

Por eso **no se puede subir uno sin el otro**: un frontend nuevo contra un backend que aún no tiene estas rutas no encuentra ninguna
de las pantallas nuevas, y un backend nuevo con el frontend viejo deja sin rutas a la cuota por marca y a los reportes del grupo 25.
**La vuelta atrás también es de los dos lados a la vez.** El grupo 20 (cobertura y cartera) no cambia, salvo que ahora tiene la tarjeta de
Ajustes.

### Volver a la versión anterior

El grupo 25 entra en `main` con **un solo commit de merge** («Grupo 25: …»), así que deshacerlo es **un comando**, sin reescribir la
historia ni perder nada:

```
git log --merges -1 --format=%h       # el hash del commit de merge del grupo 25
git revert -m 1 <ese hash>            # un commit nuevo que deja main como estaba antes
git push origin main
```

Probado en un clon descartable: tras el `revert`, `main` queda **idéntico** a como estaba antes del merge. Eso es `pre-grupo25` **más el commit
`c1aec2b`** (12/10, «Retira tres archivos que nadie cargaba»), que estaba solo en local y se sube en el mismo `push`.

- La etiqueta **`pre-grupo25`** marca lo que había en GitHub justo antes (`fe36cf4`). Sirve para comparar (`git diff pre-grupo25 main`) o para ver
  esa versión (`git switch --detach pre-grupo25`); **no hace falta moverla** para volver atrás.
- **No usar `git reset` ni `push --force` sobre `main`**: reescriben una historia que otros ya pueden haber bajado.
- Si luego se quiere volver a subir el grupo 25, hay que **deshacer el `revert`** (`git revert <hash del revert>`) y no volver a hacer el merge: git
  cree que esos cambios ya están y no los traería.
- **El backend vuelve a la vez.** Con el frontend viejo y el backend nuevo, la cuota por marca y los reportes del grupo 25 quedan sin rutas
  (sección 3).

---

## 4 · Después de subir: el recorrido

Con una cuenta de cada tipo (las claves las pasa quien coordina; los casos de cada módulo están en su documento
`respuesta-*.md`, sección «Para recorrerlo contra bdnava08»):

| cuenta | qué mirar |
|---|---|
| **Especialista** (229) | el menú trae **siete** módulos (marcas, cuota, reportes, cobertura, ajustes, vendedor del mes, cotización) y **ni factura ni promoción ni programador**; cada pantalla carga con datos; el numerito de Ajustes coincide con «Recibidas → Pendientes» |
| **Jefatura** (071) | el mismo menú; el filtro por especialista en Reportes, Cobertura y Vendedor del mes; el panel de su familia en Marcas |
| **Sin marcas** (270) | cada pantalla dice que no hay marcas y ofrece ir a Marcas, sin errores |
| **Vendedor del grupo 20** (246 o 196) | el menú trae **Ajustes** y **no** marcas, reportes, cobertura ni vendedor del mes; «Pedir ajuste» ofrece cotizaciones **y pedidos** |

**Solo lectura primero.** Enviar, confirmar y rechazar un ajuste **modifican documentos reales** y una solicitud respondida no se
puede volver a responder: se hacen con los documentos que prepara el backend.

---

## 5 · Lo que suma el grupo 34 (jefe de zona, 22/10/2026)

El jefe de zona se prueba y se sube igual, y se puede deshacer por separado: va en **su propio merge** (rama `zona34`). Lo que el frontend llama ahora, y que el backend
tiene que tener el mismo día:

| el frontend llama | para qué |
|---|---|
| `GET /v1/zona/avance` (con `?anno=&mes=` para un mes anterior) | el avance de todos los vendedores del grupo 20 |
| `GET /v1/zona/probabilidad?codusu=` | la probabilidad de uno |
| `GET /v1/vendedor` con tipo `ZONA` | el menú de tres módulos (`cotizacion`, `avance`, `probabilidad`); desde el 24/10, cuatro (ver más abajo) |
| `403 usuario sin acceso` en el login y en cualquier ruta | el 297: el frontend lo lleva al login |

Cuentas para el recorrido: el **126** (entra) y el **297** (`403`). Los casos están en [respuesta-zona.md](respuesta-zona.md), sección 3.

### Volver atrás del grupo 34

Entra en `main` con **su propio commit de merge** («Jefe de zona (grupo 34): …»), encima del del grupo 25, así que se deshace igual y por separado:

```
git log --merges -2 --format="%h %s"     # el de arriba es el del grupo 34
git revert -m 1 <hash del merge del grupo 34>
git push origin main
```

- La etiqueta **`pre-grupo34`** marca lo que había justo antes (el merge del grupo 25, `79dac94`).
- **Para deshacer el grupo 25 con el 34 ya subido, hay que deshacer primero el 34**: el 34 toca archivos que el 25 también tocó (el catálogo, el cliente
  HTTP, los estilos y el login), y revertir el 25 con el 34 encima da conflictos. En ese orden, cada `revert` sale limpio.

### Lo que suma la actualización del 24/10/2026 del grupo 34 (clientes, reemplazos, tres meses)

Se sube como un paso aparte, para poder deshacerlo por separado, igual que los anteriores (con su propio commit de merge; el hash se anota aquí al hacerlo). Además de lo de arriba,
el frontend llama ahora a:

| el frontend llama | para qué |
|---|---|
| `GET /v1/zona/cartera?codusu=` y `GET /v1/zona/cobertura?codusu=` (con `&anno=&mes=`, hasta 3 meses atrás) | los clientes de un vendedor; la pantalla elige la ruta por **el tipo que tuvo ese mes** |
| `400 vendedor de otro tipo` | **es normal**, no un fallo: la pantalla prueba la otra ruta una sola vez. Si las dos lo dicen, se detiene y muestra el motivo |
| `GET /v1/vendedor` con tipo `ZONA` | menú de **cuatro** módulos: `cotizacion`, `avance`, `probabilidad` y `clientes` |
| `reemplazadoPor` y `reemplazaA` en cada fila de `/zona/avance` | las notas «parece estar de vacaciones» y «reemplaza a …» (sin los campos, no se muestra nada) |
| `/zona/avance?anno=&mes=` de hasta 3 meses atrás | el selector del avance ofrece el mes en curso y tres anteriores (antes, dos) |

**El orden importa más de lo habitual:**

- **El backend no debe poner `clientes` en el menú del 126 antes de que el frontend esté subido.** Un módulo que el frontend no conoce se pinta como una entrada
  genérica «CLIENTES» que lleva a una página que no existe (404). Al revés no pasa nada: si el frontend sube primero, `clientes` simplemente no aparece
  hasta que el backend lo ponga en el menú, y sin `reemplazadoPor`/`reemplazaA` la pantalla no inventa ninguna nota.
- **El cambio de la regla de CARTERA modifica números que los vendedores ven hoy** (a un vendedor de cartera solo le cuenta lo que factura **él**; cambian su avance
  aquí, en la probabilidad y en su propia pantalla de cuota). No hay nada que hacer en pantalla, pero conviene avisar a los vendedores el mismo día.
- **Cuentas para el recorrido:** el **126** (entra) y el **297** (`403`). Qué comprobamos está en [respuesta-zona-clientes.md](respuesta-zona-clientes.md), sección 4, y **los casos con sus cifras de bdnava08**
  en la sección 6 de [zona-grupo34.md](zona-grupo34.md). El servidor de prueba **todavía no tiene este código** (el backend lo monta y avisa); la dirección y las claves las pasa quien lleva el proyecto de su lado.
- **Un archivo compartido más: `core/cdk-shell.css`.** Esta actualización le **agrega** un bloque («Fila compacta»: `.cdk-filas`, `.cdk-fila…`, `.cdk-etiqueta` y `.cdk-pestanas--cortas`) para la lista de clientes. Solo suma clases nuevas: no cambia
  ninguna existente, así que ninguna otra pantalla se ve distinta. Es el único cambio de estilos del paso, y se deshace con el resto.
- **El nombre en pantalla.** El módulo se llama **Cobertura** (27/10), pero **su clave del menú sigue siendo `clientes`**: es la que manda el backend y no cambia. Primero pide elegir entre cartera y cobertura, y el código del cliente
  no se muestra en ninguna parte. Quien recorra el menú del 126 verá «Cobertura», no «Clientes».
- **Cómo sale el backend** (su respuesta del 27/10, sección 10 de [zona-grupo34.md](zona-grupo34.md)): **completo y en un solo despliegue** —la regla de CARTERA, los reemplazos, el tercer mes y `clientes` en el menú—, **después**
  de que este frontend esté arriba. Solo `clientes` en el menú se puede separar, si se avisa. El tercer mes vale **solo para el avance, la cartera y la cobertura**; la cuota del propio vendedor y las marcas siguen en dos
  (esas pantallas no se tocaron). Las rutas `/zona/cartera` y `/zona/cobertura` se autorizan aparte del menú: el 126 puede llamarlas aunque el menú no traiga `clientes`.
- **Cómo se deshace.** El backend, con **un solo `git revert`** que deshace todo a la vez (la regla de CARTERA no se puede revertir sola); el frontend no necesita nada después: el tercer mes responde
  `400 periodo invalido` y se muestra con su mensaje, sin los campos de reemplazo no hay notas, y sin `clientes` en el menú no hay entrada ni enlace. **Para deshacer solo el frontend con el backend ya arriba**,
  el menú del 126 seguiría trayendo `clientes` y saldría la entrada genérica que lleva a un 404: conviene pedirle antes al backend que quite esa línea del menú (es lo que se puede separar), o aceptar esa entrada para un solo usuario mientras tanto.

### Volver atrás de la actualización del 24/10 del grupo 34

Entra en `main` con **su propio commit de merge** («Jefe de zona (grupo 34): Cobertura, reemplazos y tres meses atrás»), encima del de la cotización en soles, así que se deshace igual y por separado:

```
git log --merges -5 --format="%h %s"     # el de arriba de los tres es el de la lista de precios; el del 24/10 es el tercero
git revert -m 1 <hash del merge de esta actualización>
git push origin main
```

- La etiqueta **`pre-zona34-clientes`** marca lo que había justo antes (el merge de la cotización en soles, `b7ecc46`). Probado en un clon descartable: tras el `revert`, `main` queda **idéntico** a `pre-zona34-clientes`.
- **De arriba abajo.** Para deshacer la cotización en soles, el jefe de zona del 22/10 o el grupo 25 con esta actualización encima, hay que **deshacer primero esta** —y antes de esta, los dos pasos del grupo 20 que van encima—: tocan archivos comunes (`README.md`, el catálogo, `dev/servidor.js`…) y revertir en otro orden da conflicto. En ese orden, cada `revert` sale limpio.
- El backend se deshace aparte, con su propio `git revert` (ver «Cómo se deshace» arriba): el frontend no necesita nada después.

### Lo que suma la actualización del 29/10/2026 del grupo 20 (promos vigentes y a quién vender hoy)

Se sube como **un paso aparte**, con su propio commit de merge (el hash se anota aquí al hacerlo). **Es la primera vez que un módulo nuevo llega al menú de todos los vendedores** —cartera y cobertura, el grupo 20 entero—
y no a un solo usuario, así que pesa más que el del jefe de zona. Los contratos son [promovigentes-grupo20.md](promovigentes-grupo20.md) y [quienvender-grupo20.md](quienvender-grupo20.md); nuestras ocho preguntas están en
[respuesta-promovigentes-quienvender.md](respuesta-promovigentes-quienvender.md) y **el backend las contestó el 29/10** en [cierre-promovigentes-quienvender.md](cierre-promovigentes-quienvender.md) (abajo, lo que cambió). Todo es de
solo lectura, y el frontend llama a:

| el frontend llama | para qué |
|---|---|
| `GET /v1/promocion/vigentes` y `GET /v1/promocion/vigentes/<idprom>` | la lista de lo que está en promoción hoy y el detalle de una (un `404 promocion no vigente` es normal: se explica y se vuelve a la lista) |
| `GET /v1/quienvender` | los 3 clientes del día. **Se pide una sola vez, cuando el vendedor abre la pantalla**: la primera vez del día el backend la calcula y la graba (cerca de 1 s), y todo el día contesta lo mismo. Nunca se pide por adelantado, ni se refresca |
| `GET /v1/vendedor` del grupo 20 | dos claves nuevas: `promovigentes` y `quienvender`. Sin acciones |

**El orden importa más que nunca:**

- **El backend no debe poner `promovigentes` ni `quienvender` en el menú antes de que el frontend esté subido.** Una clave que el frontend no conoce se pinta como una entrada genérica («PROMOVIGENTES», «QUIENVENDER») que lleva a una
  página que no existe (404), y esta vez la verían **todos los vendedores**. Al revés no pasa nada: si el frontend sube primero, las pantallas simplemente no aparecen hasta que el backend ponga las claves. **El backend confirmó** que cada
  clave se activa por separado y que **sube primero el frontend y después el backend, el mismo día** (respuesta 7).
- **La barra inferior del móvil cambia para todos los vendedores:** «Vender hoy» entra en el tercer lugar y **Factura pasa a «Más»** (decidido el 29/10; en el menú lateral y en «Más» siguen todos). «Promos vigentes» va al final, en «Más».
  Conviene avisar a los vendedores el mismo día. Es la única prioridad que no es entera (2,5): no se movió ninguna otra.
- **El nombre en el menú es corto a propósito** («Vender hoy», «Promos vigentes») porque en la barra inferior el texto se corta; el título de la pantalla es «¿A quién vender hoy?». Las claves son las del backend y no cambian.
- **Un archivo compartido, otra vez: `core/cdk-shell.css`.** Estas pantallas reutilizan el bloque «Fila compacta» que nació con Cobertura (grupo 34) y le suman dos clases (`.cdk-fila__contenido` y `.cdk-fila--apagada`).
  **Dependen de él los dos pasos**: para deshacer el del grupo 34 con este ya subido hay que **deshacer primero este**; si no, las listas de productos quedan sin estilo.
- **Las promociones vencidas que la cotización ofrecía: el backend lo arregla en esta misma entrega** (respuesta del 29/10, pregunta 2 de [cierre-promovigentes-quienvender.md](cierre-promovigentes-quienvender.md)). El motor de
  cotización ya usa la misma regla de vigencia que la lista (encendida y hoy entre su inicio y su fin, el último día incluido): las cinco vencidas de bdnava08 (14898, 15124, 15217, 15218 y 15227) ya no se ofrecen ni se aplican.
  **Cambia lo que ven todos los vendedores en el módulo de siempre**, aunque en la base principal hoy no hay ninguna vencida (las 43 encendidas están vigentes). Lo nuevo para la pantalla de cotización: una promoción puede
  **vencer mientras el vendedor arma la cotización**, y entonces `/promocion/acoplar` responde `400 promocion no registrada` con *«la promocion no existe, esta desabilitada o ya vencio»*. El módulo Promoción ya mostraba el
  `msg`; **la cotización lo decía sin motivo** («no se pudo adjuntar») y por eso se tocó una función de `js/cotizacion/buscar_promo_part5.js` (`acoplarPromociones`): ahora el aviso trae el motivo del backend. Esa promoción
  **no se puede adjuntar después**: la cotización ya se creó, y el aviso lo dice.
- **Los almacenes (respuesta del 29/10, pregunta 1).** El **detalle** de cada promoción trae `almacenes` en cada producto (sin cantidades; `[]` si está agotado; la lista no lo trae). La pantalla lo dice («Stock en Principal, M&M»)
  y avisa cuando un producto está disponible **solo** donde la cotización no deja elegir (hoy solo Principal y M&M, de `CDK.catalogo.almacenes()`): en la 15221, el `1VV22AL` está solo en Piura. El backend dice dónde hay, no dónde se
  puede cotizar: esa regla es del frontend.
- **Rótulos de «Vender hoy» ajustados a lo que dijo el backend (pregunta 4 y 5):** en REPONER «Lo que valdría reponer» (la suma de todo lo que le toca, **no** la de los productos de la tarjeta, que son los de más valor); en REACTIVAR
  «Le vendiste en 12 meses» (lo que **este** vendedor vendió); y una nota «Los importes están en dólares, sin IGV». **El día de `fecha` es el de Lima** (reloj del servidor de base de datos, pregunta 3); la pantalla no lo calcula.
- **Orden de salida acordado con el backend (29/10): el mismo día, primero el frontend y después el backend.** Las dos claves son líneas distintas del menú y van las dos. Antes de subir a producción el backend crea la tabla de «hoy» en la
  base principal (ya existe en la de prueba); no hay nada que hacer de nuestro lado. **Avisar a los vendedores** (la barra inferior cambia) es del lado del backend, sin nada del frontend.
- **Cuentas para el recorrido:** un vendedor de **cartera** (V0313), uno de **cobertura** (V0278), el **126** y uno del grupo 25 (`403 sin permiso`). Las claves **no se pasan por escrito**: las da quien coordina. **El servidor de
  prueba todavía no tiene este código** (se monta cuando el backend dé por cerrados los módulos y se avisa). En bdnava08 hoy sí hay sugerencias «de verdad»: 14 de los 22 vendedores de cartera y cobertura reciben 2 REPONER y 1 LLAMAR
  por la ruta real (V0313: 5, 5 y 3 productos; V0278: 5, **1** y 3; V0353: 3 SIN_COMPRAS; V0360: 3 LIBRE). La base está atrasada (facturas al 09/10): las fechas de `ultimaCompra` serán anteriores. **El día queda grabado**: para volver
  a ver el armado de un vendedor hay que pedirle al backend que borre sus filas del día. REACTIVAR solo sale con un día simulado: lo arma el backend si se pide.
  **Dos casos dependen del día:** la **15221 vence el 31/10/2026** (después da `404` y la lista deja de traerla); para un caso estable, la **14106** (vence el 01/01/2027).
- **Cómo se deshace.** **El backend, con un solo `git revert`** si sale en un solo merge: quita las dos claves del menú, las rutas y el cambio de fechas del motor, y **el frontend no necesita nada** (sin las claves no hay entradas). Si solo se quita
  una clave del menú, la entrada desaparece pero la ruta sigue respondiendo al grupo 20 si alguien escribe la dirección (es solo lectura, salvo que abrir `quienvender` graba la fila del dia). **El cambio de fechas del motor no depende del
  menú**: se queda aunque se quite una clave. **Para deshacer solo el frontend con el backend ya arriba**, el menú de todos los vendedores seguiría trayendo las dos claves y saldrían entradas genéricas que llevan a un 404: antes hay que pedirle
  al backend que las quite del menú. El aviso de la cotización con el motivo (`buscar_promo_part5.js`) es inocuo con el backend anterior: sin `msg`, dice lo de siempre.

### Volver atrás del grupo 20 (promos vigentes y a quién vender hoy)

Entra en `main` con **su propio commit de merge** («Grupo 20: promociones vigentes y ¿A quién vender hoy?»), encima del de la actualización del 24/10 del grupo 34, así que se deshace igual y por separado:

```
git log --merges -5 --format="%h %s"     # el de arriba es el de la lista de precios; el de promos vigentes y a quién vender hoy es el segundo
git revert -m 1 <hash del merge del grupo 20>
git push origin main
```

- La etiqueta **`pre-grupo20`** marca lo que había justo antes (el merge de la actualización del 24/10 del grupo 34). Probado en un clon descartable: tras el `revert`, `main` queda **idéntico** a `pre-grupo20`.
- **Se deshace antes que la actualización del 24/10 del grupo 34**, y **después de la lista de precios** (que va encima): usa el bloque «Fila compacta» de `core/cdk-shell.css` que esa actualización agregó, y los tres tocaron `README.md`, el catálogo y `dev/servidor.js`. De arriba abajo, cada `revert` sale limpio.
- **Antes de deshacerlo, el backend tiene que quitar `promovigentes` y `quienvender` de su menú**: si no, **todos los vendedores** verían dos entradas genéricas que llevan a un 404. El cambio de fechas del motor de cotización del backend se queda aunque se quite una clave (ver «Cómo se deshace» arriba).
- Lo único que se toca de un módulo que ya existía es `acoplarPromociones` en `js/cotizacion/buscar_promo_part5.js` (el aviso con el motivo): al deshacer vuelve a decir «no se pudo adjuntar» sin motivo, que es lo que decía.

### Lo que suma la lista de precios del grupo 20 (30/10/2026)

Se sube como **un paso aparte**, con su propio commit de merge, **encima del de promos vigentes y a quién vender hoy**. Su contrato ([listaprecios-grupo20.md](listaprecios-grupo20.md)) llegó después de los otros dos del grupo 20; lo que
leímos y lo que hay que confirmar está en [respuesta-listaprecios.md](respuesta-listaprecios.md). Es de solo lectura, y el frontend llama a:

| el frontend llama | para qué |
|---|---|
| `POST /v1/reporte/listaprecios` con `{ "formato": "json" }` | la lista completa para ver en pantalla (unas 6 400 filas, 1,4 MB). **Se pide una vez al abrir la pantalla**; filtrar y buscar se hace en el navegador |
| `POST /v1/reporte/listaprecios` con `{ "formato": "xlsx" }` | el Excel, con **la lista completa aunque haya un filtro puesto**. Solo se guarda si el `Content-Type` es una hoja de cálculo; un error llega como JSON y se muestra |
| `GET /v1/vendedor` del grupo 20 | una clave nueva: **`listaprecios`** (no `reporte`, que es del grupo 25). Sin acciones |

**Lo que cambia en el orden de salida respecto a los otros dos módulos del grupo 20:**

- **La clave sale apagada**: el backend no la manda a nadie hasta que esta pantalla esté publicada. **Primero la pantalla, después la clave** (una línea en el menú del grupo 20 y un reinicio del backend), así que **no hay apuro y nada se
  rompe mientras tanto**. Esto es **distinto** de `promovigentes` y `quienvender`, que sí salen el mismo día que el frontend.
- La ruta responde igual a cualquier vendedor del grupo 20 aunque la clave esté apagada: se puede recorrer contra bdnava08 sin esperar al menú. El grupo 25 y el 34 reciben `403 sin permiso`.
- **Una prioridad más, sin mover a nadie:** «Lista de precios» tiene prioridad 15, **al final**, y en un móvil queda en «Más». La barra inferior no cambia.
- **Nada de costo ni de stock**: la lista puede llegar a manos de los clientes. Si algún día el backend agregara un campo a las filas, la pantalla **no lo muestra** (solo pinta descripción, part number, marca, familia y los dos precios).
- **Cuentas para el recorrido:** un vendedor de cartera y uno de cobertura (V0313 y V0278), y el 126 y uno del grupo 25 (`403 sin permiso`). Las claves se pasan aparte, no en documentos. **El backend contestó el 30/10**
  ([cierre-listaprecios.md](cierre-listaprecios.md)): el código sale hoy a `main` y el servidor de prueba lo trae en el mismo paso que el resto del grupo 20; ellos avisan cuando esté arriba. **Con la clave apagada la pantalla se recorre
  entrando directo a `listaprecios.html`** (la ruta responde igual a cualquier vendedor del grupo 20): hay una prueba que lo comprueba (abre, pide la lista, baja el Excel, y el menú no la ofrece ni deja la barra del móvil distinta).
- **Lo que contestó el backend (30/10):** la pantalla está bien con el contrato, **sin observaciones**. **La respuesta JSON NO viaja comprimida** (unos 1,4 MB el JSON y 2,2 MB el Excel, sin `Content-Encoding`): se queda así en esta salida
  y queda anotado para después, porque comprimir en el backend es una dependencia nueva que toca todas las rutas; si un proxy delante la comprime, el navegador la descomprime solo y la pantalla no cambia. **`Content-Disposition` sí sale por CORS**
  en esta ruta, así que el Excel se guarda con la fecha (`lista-precios-AAAA-MM-DD.xlsx`). **Con datos móviles, la primera carga de la lista es lo más lento de la pantalla**: se ve «Cargando la lista de precios…» mientras llega.
- **Cada descarga en Excel queda registrada en el backend** (módulo `reporte`, acción `lista de precios`). El frontend no hace nada para eso: mirar la lista en pantalla no se registra.
- **No se guarda nada en el navegador**: cada vez que se abre la pantalla se pide de nuevo, para que el precio sea el de hoy.

### Volver atrás de la lista de precios

Entra en `main` con **su propio commit de merge** («Grupo 20: lista de precios»), encima del de promos vigentes y a quién vender hoy, así que se deshace igual y por separado, y **es lo primero que se deshace** si hay que volver atrás:

```
git log --merges -3 --format="%h %s"     # el de arriba es el de la lista de precios
git revert -m 1 <hash del merge de la lista de precios>
git push origin main
```

- La etiqueta **`pre-listaprecios`** marca lo que había justo antes (el merge de promos vigentes y a quién vender hoy). Probado en un clon descartable: tras el `revert`, `main` queda **idéntico** a `pre-listaprecios`.
- **No hace falta que el backend quite nada antes**, porque la clave `listaprecios` sale apagada: mientras no esté en el menú nadie ve la entrada. **Si ya la encendieron, que la apaguen antes de deshacer el frontend**: si no, los vendedores verían una entrada genérica («LISTAPRECIOS») que lleva a un 404.
- No toca ningún módulo que ya existía: solo agrega archivos nuevos y líneas nuevas en el catálogo, `dev/servidor.js` y los índices.

---

## 6 · Lo que este repositorio no dice

- **Cómo llega el código de `main` al servidor** (quién lo copia, desde dónde, a qué carpeta). Aquí solo está que `dev/` se excluye. El código
  se sube **empujando a `main`** (decisión del 22/10/2026), con el plan de vuelta atrás de la sección 3 y backend y frontend el mismo día.
- **La dirección del servidor de prueba y las claves** (las pasa quien coordina).

---

## 7 · Lo que suma la cotización en soles (23/10/2026)

Va en **su propio merge** (rama `cotizacion-soles`), encima del del grupo 34, y se puede deshacer por separado. No agrega rutas: cambia **lo que la
pantalla muestra y lo que manda a `/cotizacion/update`**. El detalle y las preguntas, en [respuesta-cotizacion-moneda.md](respuesta-cotizacion-moneda.md).

| cambia en el backend (ya hecho y probado en bdnava08) | y el frontend |
|---|---|
| `POST /cotizacion/pegar` convierte a soles y responde `moneda`, `tcam` y `totales` | sigue mandando **dólares** con `moneda`; enseña lo mismo que se graba y los `totales` que devuelve |
| `POST /cotizacion/update` toma `mone` y `tcam` de **la cabecera** | las líneas nuevas de una cotización en soles van **en soles**, con el `tcam` de esa cotización |
| `POST /promocion/acoplar` rechaza las cotizaciones en soles (`409 promocion en soles`) | en soles no hay promociones |

**Hay un orden que importa:** `/pegar` puede salir antes o después, pero **el cambio de `/update` del backend sale el mismo día que este frontend**. El
frontend de antes manda las líneas nuevas **en dólares** a una cotización en soles, y con el cambio del backend quedarían montos en dólares bajo una cabecera en soles.
**La vuelta atrás de `/update` también es de los dos lados a la vez.**

Tras subir, con un usuario que tenga `tipoCambio` en `/vendedor`:

- **Crear** una cotización en soles y comparar el aviso de «Cotización generada» (lo que devolvió el backend) con lo que se veía en el carrito: tienen que ser iguales
  al céntimo. Repetir en dólares.
- **Sin tipo de cambio** (`tipoCambio: null`): la opción PEN queda desactivada con su aviso.
- **«Ver» y «Modificar»** con la 098-00000052 (soles) y la 098-00000053 (dólares) que dejó el backend: la de soles se ve en soles, con «Soles · T.C. …», y agregar un
  producto graba `preu` y `cost` en soles.

### Volver atrás de la cotización en soles

```
git log --merges -3 --format="%h %s"     # el de arriba es el de la cotización en soles
git revert -m 1 <hash del merge de la cotización en soles>
git push origin main
```

- La etiqueta **`pre-cotizacion-soles`** marca lo que había justo antes (el merge del grupo 34, `d3a72e2`). Probado en un clon descartable: tras el `revert`,
  `main` queda **idéntico** a `pre-cotizacion-soles`.
- **Orden con los otros dos: de arriba abajo.** Para deshacer el grupo 34 con este ya subido hay que **deshacer primero este**: revertir el 34 con este encima
  da conflicto (en `README.md`, y en lo que los dos tocaron). En ese orden, cada `revert` sale limpio, y tras el segundo queda el merge del grupo 25.
- Queda abierto, **como entrega aparte**, aplicar la misma regla a las cotizaciones en **dólares** (en los dos lados el mismo día): ver la sección 2 de
  [respuesta-cotizacion-moneda.md](respuesta-cotizacion-moneda.md).

---

## 8 · Lo que suma el ajuste directo y la asignación (grupo 25, 06/11/2026)

Va en **su propio merge** (rama `ajuste-directo`), encima del de la lista de precios, y se puede deshacer por separado. El contrato es
[ajuste-directo.md](ajuste-directo.md); lo que hicimos con cada respuesta y el recorrido por bdnava08, en
[respuesta-ajuste-directo.md](respuesta-ajuste-directo.md). Dos acciones nuevas en el hub de Ajustes, **solo para el grupo 25** (especialistas y
jefaturas):

| el frontend llama | para qué |
|---|---|
| `GET /v1/ajuste` del grupo 25 con `directo` y `asignados` | las dos tarjetas nuevas del hub, «Mis documentos» y «Asignados» |
| `GET /v1/ajuste/directo/documentos?tipo=` (y `desde`, `hasta`, `ndocu`) | sus cotizaciones y pedidos, los últimos 30 días por defecto |
| `GET /v1/ajuste/directo/documento?tipo=&ndocu=` | el detalle para ajustar |
| `POST /v1/ajuste/directo/aplicar` | aplicar los precios (**modifica el documento**: descuento a 0 y fuera todas las promociones, flete incluido) |
| `GET /v1/ajuste/directo/vendedores?pista=` y `POST /v1/ajuste/directo/asignar` | pasar el documento a un vendedor del grupo 20 (**no se deshace desde la intranet**) |
| `GET /v1/ajuste/asignados` | el historial, de solo lectura |

**El orden de salida es el de siempre, el mismo día, y en cualquier orden nada se rompe:**

- **Si el backend enciende `directo` y `asignados` antes**, el hub que hay hoy en producción las ignora (avisa en la consola y no pinta nada): no
  sale ninguna entrada genérica ni un 404.
- **Si el frontend sube antes**, las dos tarjetas no aparecen hasta que el backend las mande; las rutas nuevas no se llaman.
- **Lo único que cambia en algo que ya está en producción es «Recibidas»** (grupo 25): su tarjeta de precio pasó a una pieza compartida
  ([js/ajuste/precio.js](../js/ajuste/precio.js)) y **una línea con costo 0 o sin costo se muestra sin controles de precio**. Es la regla del
  backend desde el 06/11 (antes un costo 0 dejaba el mínimo en 0 y aceptaba cualquier precio). Con el backend anterior, el frontend nuevo
  también deja sin controles una línea de costo 0: es más estricto, no más permisivo. El grupo 20 no cambia.
- **Cuentas para el recorrido:** la jefatura **264** y la **071**, el especialista **229** y el **270**, y un vendedor del grupo 20 (**246** o **196**)
  para el `403 sin permiso`. Los casos están en la sección 3 de [respuesta-ajuste-directo.md](respuesta-ajuste-directo.md). **Aplicar y asignar
  modifican documentos reales**: la asignación (`009-00773963` a `V0278`, con un ajuste aplicado antes) va al final, y al terminar se avisa al
  backend para que devuelva los documentos. **Las solicitudes de prueba de «Recibidas» vencen el 17/11/2026.**

### Volver atrás del ajuste directo

Entra en `main` con **su propio commit de merge** («Grupo 25: ajuste directo y asignación»), encima del de la lista de precios, así que se deshace
igual y por separado, y **es lo primero que se deshace** si hay que volver atrás:

```
git log --merges -3 --format="%h %s"     # el de arriba es el del ajuste directo
git revert -m 1 <hash del merge del ajuste directo>
git push origin main
```

- La etiqueta **`pre-ajuste-directo`** marca lo que había justo antes (el último commit de la lista de precios, `ef055e2`).
- **No hace falta que el backend quite nada antes**: con el frontend anterior, el hub ignora `directo` y `asignados`. Las rutas siguen respondiendo
  al grupo 25 si alguien las llama a mano, que es cosa del backend.
- Al deshacerlo, «Recibidas» vuelve a su tarjeta de precio anterior. Con una línea sin costo, esa versión dice «Costo $ 0.00», deja los
  controles y, al confirmar esa línea, el backend responde `409 costo desconocido` y se muestra su `msg`. **No se rompe nada**: solo se pierde el
  aviso previo. Comprobado pasando los casos de costo 0 del simulacro nuevo por la «Recibidas» de `ef055e2`. Lo mismo ve producción hoy si el backend
  sube su regla del costo 0 antes que este frontend.
- No toca ningún módulo fuera de Ajustes: solo archivos nuevos de `ajuste/` y `js/ajuste/`, `solicitud.js` y su página, dos líneas del catálogo,
  `dev/` y los documentos.
