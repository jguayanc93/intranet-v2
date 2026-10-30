# Grupo 20 — Lista de precios: la pantalla está lista y tres cosas que confirmar

Responde a [listaprecios-grupo20.md](listaprecios-grupo20.md).

> **Estado al 30/10/2026.** La pantalla **está construida y probada contra un simulacro** que sigue su contrato (6 396 filas,
> las 8 familias, 135 marcas, el Excel como archivo). **No se ha probado contra bdnava08**: el servidor de prueba no tiene todavía este
> código. Sale **con el resto del grupo 20**, y **primero el frontend**: cuando esté publicada, **les avisamos y ustedes encienden la
> clave `listaprecios`** (una línea en el menú del grupo 20). Mientras la clave esté apagada, nadie ve una entrada que lleve a una página que no existe.

---

## 1 · Cómo la leímos

| lo que dice su documento | lo que hacemos en pantalla |
|---|---|
| Una sola acción: ver la lista o bajarla en Excel | `listaprecios.html`: la lista en pantalla y un botón **Descargar Excel**. Clave de menú `listaprecios` (**no** `reporte`), nombre «Lista de precios» |
| `POST /v1/reporte/listaprecios` con `{ "formato": "json" }` | Se pide **una sola vez**, al abrir la pantalla. Filtrar y buscar se hace en el navegador, **sin volver a pedir** |
| Unas 6 400 filas, sin paginación | Se pintan **de 50 en 50** («Mostrar 50 más»), para que la página no se trabe en un móvil |
| Filtros a criterio del frontend | **Familia**, **marca** y una **búsqueda** por descripción, part number o marca (sin importar mayúsculas ni tildes, y con varias palabras: todas tienen que estar) |
| «La pantalla **no** debe tener su propia lista de familias» | Las familias y las marcas **salen de las filas**. Si eligen una familia, las marcas que se ofrecen son las de esa familia |
| `precioSinIgv` y `precioConIgv` | Se muestran **los dos tal cual llegan**, con la leyenda «sin IGV» y «con IGV» (con texto, no solo con color). **No se calcula nada**: ni el IGV, ni el orden |
| Orden: familia, marca y descripción | **Se respeta**: la pantalla no reordena |
| La disponibilidad dice lo mismo en todas las filas | Se dice **una sola vez**, arriba («Sujeto a disponibilidad»), y no seis mil veces. Si algún día llegara distinta, se dice en cada fila |
| Sin costo, sin stock, sin códigos | No se muestra nada de eso, y **no hay ningún botón que modifique algo** |
| `fecha` | Se rotula «Lista del 30/10/2026». Sale del backend, no del reloj del equipo |
| El Excel trae siempre la lista completa | Se pide **aparte** con `formato: "xlsx"` y **sin ningún dato del filtro**; junto al botón se dice «El Excel trae la lista completa (6 396 productos), aunque tengas filtros puestos» |
| Un error llega como JSON con su código; solo se guarda lo que sea una hoja | Se mira el `Content-Type`: **solo se guarda si es `spreadsheetml`**. Cualquier otra cosa (aunque venga con 200) se trata como error y se muestra su `msg`. El nombre del archivo es el de `Content-Disposition` |
| `400 formato invalido`, `401`, `403 sin permiso`, `403 usuario sin acceso`, `500 error query` | El mensaje del backend. **Un 500 se puede reintentar; un 403 no.** El 401 va al login, como en todo el resto |
| Cada descarga queda registrada | El frontend no hace nada para eso |

**Lo que suponemos y no preguntamos** (si es otra cosa, díganlo):

| caso | qué hacemos |
|---|---|
| `partNumber: ""` | «Sin part number», sin botón de copiar |
| Una familia o una marca que no conocemos | Se muestra tal cual: no hay lista nuestra |
| `filas: []` | «La lista de precios no trae productos». No es un error |
| La lista no se guarda en el navegador | Cada vez que se abre la pantalla se pide de nuevo: así el precio que ve el vendedor es el de hoy |

---

## 2 · Tres cosas que confirmar

**1 · ¿La respuesta JSON viaja comprimida?** *Qué vimos:* el JSON pesa unos **1,4 MB** (el Excel, 2,2 MB). *Por qué lo preguntamos:* en
un móvil con datos es lo más lento de la pantalla; con `gzip` o `br` (`Content-Encoding`) bajaría a una fracción. No cambia nada
en el contrato ni en el frontend: solo queremos saber si ya lo hacen o si el servidor (o el proxy que está delante) lo puede hacer.

**2 · `Content-Disposition` expuesto por CORS también en esta ruta.** *Qué vimos:* en los reportes del grupo 25 lo exponen
(`Access-Control-Expose-Headers`) y por eso el archivo se guarda con su nombre. *Qué suponemos:* que en `/reporte/listaprecios` también.
Si no, el archivo se guardaría como `lista-precios.xlsx` (nuestro nombre de respaldo) y no con la fecha.

**3 · El servidor de prueba y las cuentas.** Para recorrerla necesitamos que el servidor de prueba **ya tenga este código** y las
cuentas de **un vendedor de cartera y uno de cobertura** (el mismo V0313 y V0278 de las otras pantallas del grupo 20), y **el 126 y un
usuario del grupo 25** para comprobar el `403 sin permiso`. Las claves no van en documentos.

---

## 3 · Para recorrerla contra el servidor de prueba

| caso | qué comprobamos |
|---|---|
| Un vendedor de cartera y uno de cobertura | la pantalla carga y muestra **6 396 filas** (con la cifra de hoy), 8 familias, sin costo ni stock |
| La clave en el menú | **mientras esté apagada, el menú no trae «Lista de precios»**; al encenderla, aparece al final, en «Más» |
| Filtrar por familia, por marca y buscar | nada vuelve a pedir al backend; las marcas se acotan a la familia |
| Un producto sin part number | dice «Sin part number» |
| `precioConIgv` | el que llega, tal cual (a un céntimo de `precioSinIgv` por 1,18) |
| **Descargar Excel** con un filtro puesto | baja `lista-precios-AAAA-MM-DD.xlsx` con **todas** las filas |
| Un fallo al bajar (`500`) | se muestra el mensaje y no se guarda nada |
| El 126 y un usuario del grupo 25 | `403 sin permiso` |
| Sin sesión | `401 falsa galleta`: al login |

---

## 4 · Cierre

- [x] contrato leído; sin preguntas que bloqueen
- [x] pantalla construida y probada con el simulacro
- [ ] el servidor de prueba tiene este código — **backend**
- [ ] recorrida contra el servidor de prueba, con los casos de la sección 3 — **frontend**
- [ ] **pantalla publicada → el frontend avisa → el backend enciende la clave `listaprecios`** (primero la pantalla, después la clave)
