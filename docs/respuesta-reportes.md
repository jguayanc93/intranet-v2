# Reportes por marca — seguimiento tras su actualización del 19/10

Responde a la actualización de [reportes-grupo25.md](reportes-grupo25.md). Sus respuestas cerraron las
cuatro aclaraciones y definieron las Guías: aquí está qué hicimos con cada una, **la dirección que nos
piden para el CORS** y lo que falta para recorrerlo contra bdnava08.

**Estado:** los cuatro informes —stock, tiempo en almacén, lista de precios y guías— están
construidos y probados contra un simulacro de su documento (`dev/simulador-reportes.js`). **Nada sale a
producción hasta que estén terminados los módulos del grupo 25 y probados en el servidor de prueba**, y
backend y frontend salen el mismo día, como acordaron.

---

## 1 · Qué hicimos con sus respuestas

| su respuesta | qué hicimos |
|---|---|
| **Guías construidas** (una fila por producto, periodo, 3 meses máximo) | Cuarta pestaña «Guías», con dos fechas —el mes en curso por defecto— y la misma tabla, buscador y Excel. **Las filas de una misma guía se agrupan**: la primera lleva una línea más marcada y las demás atenúan los datos de la guía que se repiten. El conteo dice «N guías · M productos». El Excel lleva el periodo **de la tabla que se ve**, no el de unas fechas tocadas sin aplicar |
| `rango invalido` | Si «desde» es posterior a «hasta», o falta una fecha, ni se manda. **El máximo de 3 meses lo decide su backend**: se muestra su `msg` y **la tabla y las fechas se quedan**, para corregirlas sin empezar de nuevo |
| `almacen` llega como código | Lo mostramos con nombre (`01` Principal, `08` M&M, `15` Piura, `16` Chorrillos) con nuestro catálogo; un código que no conozca sale tal cual. Ver 2·B |
| `productos` en `GET /reporte/marca` | La lista dice «8 productos», y una marca sin ninguno lo dice ya ahí: «sin productos vigentes» |
| Definición de «disponible» | En la ayuda de la pantalla, con sus palabras: pedidos de clientes y facturado que aún no sale del almacén; ambas reservas son temporales |
| «Valor venta» | En la ayuda: precio de lista, sin IGV y antes del descuento por tipo de cliente; no corresponde a ningún cliente |
| Sin umbral de «stock viejo» | No destacamos filas. Lo dice la ayuda de Tiempo: es para conocer la antigüedad |
| Sin marcas **con un `codmar`**: `403 marca no disponible` | Ya tratado: avisamos, volvemos a pedir la lista, y esa sí dice que no tiene marcas, con el botón a Marcas |
| Excel: textos en las celdas sin dato, fechas de Excel, importes con dos decimales | **Nuestro simulacro ya genera un `.xlsx` así y lo hemos abierto en Excel**: fechas reales (`dd/mm/yyyy`), importes `#,##0.00`, y `SIN COMPRA DESDE 2023` / `SIN ALTA EN M&M` en las celdas. Es el nuestro, no el suyo: el suyo lo abriremos contra bdnava08 |
| `dueno.nombre` igual que en `/marcas` | Seguimos agrupando por `codusu`, nunca por nombre |
| Sugerencias 2, 3 y 4: no por ahora | De acuerdo. Las nuestras (ordenar por columna, filtros rápidos, `FAMILIA` al final, recordar la marca) siguen sin hacerse y no necesitan nada de ustedes |

El código interno (`CODIGO`) **no se muestra en ninguna tabla**, también en Guías; `CODF` sí. El Excel
conserva todas las columnas, como dicen.

---

## 2 · Lo que necesitamos de ustedes

### A · Desde dónde abrimos la pantalla (su 4·B)

Nos piden la dirección para su CORS. **Es siempre la misma, la de nuestro servidor de desarrollo**:

- **`http://127.0.0.1:8080`**. Tiene que ser `127.0.0.1` y **no `localhost`**: para el navegador no son el
  mismo origen.
- Cuando se prueba desde un móvil en la misma red, **`http://<IP del equipo>:8080`**. Es una IP privada
  que cambia; si les resulta incómodo, lo dejamos fuera y se prueba solo desde el equipo.

Dos cosas más que dependen de lo que nos pasen:

1. **La dirección del servidor de prueba y si es `https`.** Hoy el frontend, abierto desde `127.0.0.1`,
   habla con `http://127.0.0.1:3000/v1`. Para apuntar a su servidor añadiremos **un ajuste solo de
   desarrollo** (nunca en producción), pero necesitamos la dirección para probarlo.
2. **Las cookies.** `cdk` y `tip` son `Secure` + `SameSite=None`, y **no viajan entre `http://127.0.0.1:8080`
   y un servidor por `http`**. Si su servidor de prueba es `https`, pueden funcionar; si no, ¿cómo lo
   resuelven en su configuración de prueba?

### B · Una pregunta pequeña

**Los códigos de almacén de las guías.** `almacen` llega como `01`, `08`, `15`…, y nosotros los traducimos
con una tabla propia: `01` Principal, `08` M&M, `15` Piura, `16` Chorrillos. ¿Son los mismos códigos y los
mismos nombres que en las guías, y no hay otros? Si hubiera otros, saldrían con su código tal cual hasta
que nos los digan.

---

## 3 · Cómo recorreremos bdnava08

Con las cuentas de su `querys/sp/datos_prueba_grupo25.sql`, cuando tengamos 2·A. **Ya está probado todo
con el simulacro; esto es lo que falta con datos reales**:

| caso | su cuenta | qué comprobamos |
|---|---|---|
| Especialista con marcas **sin confirmar** | 233, ADATA | que entran a Reportes |
| Especialista **confirmado** | 229 | el camino normal, y `403` al pedir una marca ajena |
| Especialista **sin marcas** | 270 | `sin marcas del mes` y el botón a Marcas |
| Jefatura con sus especialistas | 071 | las marcas que **sí** ve (ACER, TDK, ADATA, AVERY) y las que **no** (EPSON, RICOH, GIGABYTE, DAHUA) |
| Grupo 25 sin registrar / otro grupo | 094 / 246 | `no identificado` / `sin permiso` |
| Stock negativo, sin alta en M&M, precio en 0, sin compra | 229, 233 | las cifras en rojo, `—` frente a `$ 0.00`, «sin compra desde 2023» |
| **La marca más grande** | 229, GIGABYTE | 712 productos y 12 300 líneas de guías en 3 meses: tiempo de respuesta, y que la tabla se desplace bien en un móvil |
| Guías **anuladas** y guía con **varias marcas** | 229, GIGABYTE | que las 41 anuladas no salen y que solo cuentan las líneas de esa marca |
| **El Excel real** | cualquiera | que abre en Excel, con las fechas y los importes como números y los textos en las celdas sin dato |

Sabemos que las guías de bdnava08 llegan hasta el 09/10/2026 y que las de octubre están `PENDIENTE DE
SALIDA`; para ver `CON SALIDA` probaremos con un periodo anterior.

---

## 4 · Cierre y salida a producción

**Damos el módulo por cerrado cuando:**

- [x] las cuatro aclaraciones están respondidas y reflejadas en la ayuda de la pantalla
- [x] el informe de Guías está definido y construido
- [ ] sabemos cómo llegar a su servidor de prueba (2·A)
- [ ] los casos de la sección 3 están recorridos contra bdnava08
- [ ] **el Excel de ustedes** se abre en Excel con el formato descrito
- [ ] la marca más grande responde y se desplaza bien en un móvil

**Salida a producción, cuando termine el grupo 25 y se pruebe todo en el servidor de prueba:**

1. Subimos la pantalla nueva y **avisamos**.
2. A partir del aviso, ustedes retiran `/reporte/marcas`, `/stoc`, `/tiempo` y `/precios`. Por nuestra
   parte **ya no queda ninguna constante ni ningún script que las llame**.

**Backend y frontend salen el mismo día.** Hasta entonces la pantalla antigua sigue mostrando los días de
tiempo en almacén con el error que describen en su sección 5.
