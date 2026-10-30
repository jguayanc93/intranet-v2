# Grupo 20 — Lista de precios

Contrato de la **lista de precios del grupo 20** (vendedores de cartera y de cobertura), para el frontend.
Es una sola accion: ver la lista en pantalla o descargarla en Excel. Solo lectura. Implementado y probado en
bdnava08.

**La lista puede llegar a manos de los clientes**, y por eso es distinta del reporte de precios del
grupo 25: **no lleva costo, ni stock real, ni codigos del sistema**.

---

## 0 · Estado y que falta del frontend

**Este documento no les habia llegado.** La lista se decidio el 28/10/2026 junto con las promociones
vigentes y «¿A quien vender hoy?», pero su contrato no se paso con los otros dos. Va aqui completo.

| | |
|---|---|
| **Backend** | la ruta `POST /v1/reporte/listaprecios` **ya esta** y sale el 30/10/2026 con el resto del grupo 20 |
| **Menu** | la clave `listaprecios` **sale apagada**: el backend no la manda a nadie. Asi ningun vendedor ve una entrada que lleve a una pagina que no existe |
| **Frontend** | falta la pantalla. No hay apuro: nada se rompe mientras no exista |
| **Encenderla** | cuando la pantalla este publicada, el frontend avisa y el backend agrega la clave al menu del grupo 20 (una linea) y reinicia. **Primero la pantalla, despues la clave** |

Mientras la clave este apagada, la ruta **responde igual** a cualquier vendedor del grupo 20: se puede
probar contra bdnava08 sin esperar al menu.

### Que se espera de la pantalla

Por lo que ya existe en el frontend, lo natural es lo mismo que `promovigentes` y `quienvender`: una
entrada `listaprecios` en `core/cdk-catalogo.js` y una pagina en la raiz (`listaprecios.html`). La
etiqueta, el icono, la prioridad y el diseño los deciden ustedes; la descripcion que manda el backend es
*«Descarga la lista de precios de venta, sin IGV y con IGV»*.

**Ya decidido con el grupo** (no hace falta preguntarlo):

- La lista baja **completa**, con las 8 familias juntas. **No hay seleccion de familia en el backend**: el
  vendedor filtra en la pantalla o en el Excel con la columna `FAMILIA`.
- **No hay stock ni costo.** La columna de disponibilidad dice lo mismo en todas las filas.
- **No hay paginacion**: llega todo en una respuesta.
- El precio es **uno solo para todos**: el de lista, antes del descuento por tipo de cliente. No depende
  del cliente ni del vendedor.

**Lo que queda a criterio del frontend:**

- Como mostrar unas 6 400 filas sin que la pagina se trabe (paginar o virtualizar en la pantalla).
- Que filtros ofrecer en la pantalla: familia, marca y busqueda por descripcion o part number son los
  obvios. Todo se filtra en el navegador, sin volver a pedir.
- El boton de Excel. Es el mismo manejo de archivo que la exportacion de los reportes del grupo 25
  (`js/reporte/`): pedir con `formato: "xlsx"`, revisar el `Content-Type` y guardar.

---

## 1 · Reglas

| | |
|---|---|
| **Quien** | solo el grupo 20, cartera y cobertura. El grupo 25 y el 34 reciben `403 sin permiso`. Los reportes por marca del grupo 25 no cambian |
| **Que productos** | los **vigentes** de las familias habilitadas que **tengan precio**, **haya o no stock**. Si solo salieran los que tienen stock, la hoja delataria el stock |
| **Familias** | `01` accesorios y perifericos, `02` equipos informaticos, `05` suministros, `06` partes y piezas, `09` almacenamiento externo, `11` impresion, `12` movilidad y `13` equipos multimedia. Quedan fuera 03, 04, 10, 00, 07, 08 y 14. La lista vive en el backend (`FAMILIAS_LISTA_PRECIOS`); la pantalla **no** debe tener su propia lista de familias: las saca de las filas |
| **Precio** | el **precio de lista** del **almacen principal**, en **dolares**. Es el valor de venta **antes** del descuento por tipo de cliente: no corresponde a ningun cliente en particular. El precio de M&M no se muestra |
| **IGV** | `precioSinIgv` es el valor de venta; `precioConIgv` es ese precio por 1,18, redondeado a dos decimales con la regla del ERP. Quien multiplique el de la hoja por 1,18 obtiene el otro. **La pantalla no calcula nada**: muestra los dos que llegan |
| **Disponibilidad** | la misma en todas las filas: `SUJETO A DISPONIBILIDAD`. No hay stock en la lista |
| **Marca** | tal cual esta en el sistema. Algunas llevan la linea: `HP-IMPRESORAS`, `EP_IMPRESORAS`, `HW-ADATA` (21 de 135 en bdnava08) |
| **Part number** | si el producto no lo tiene, llega `""` (42 productos en bdnava08) |
| **Orden** | familia, marca y descripcion, ya ordenado |

**Por que la clave es `listaprecios` y no `reporte`:** `reporte` es el menu de reportes por marca del
grupo 25, y su ruta `/reporte/marca` le daria `403` a un vendedor. La ruta si vive bajo `/reporte`.

### Volumen (bdnava08, 30/10/2026)

| | |
|---|---|
| Filas | 6 396 |
| Respuesta JSON | unos 1,4 MB |
| Excel | unos 2,2 MB |
| Tiempo de la consulta | menos de un segundo |
| Marcas | 135 |
| Descripcion mas larga | 80 caracteres |

Filas por familia: suministros 1 865, movilidad 1 405, partes y piezas 1 167, accesorios y perifericos
1 031, almacenamiento externo 597, impresion 300, equipos informaticos 24 y equipos multimedia 7.

En produccion las cifras seran parecidas, no iguales.

---

## 2 · Ruta

`POST /v1/reporte/listaprecios`, con la sesion de siempre (galleta `cdk`).

```json
{ "formato": "json" }
```

`formato` es `"json"` (o se omite) o `"xlsx"`; mayusculas o minusculas da igual. Es `POST` y no `GET`
porque lleva el formato en el cuerpo, como los reportes del grupo 25; no cambia nada en la base.

### Respuesta con `formato: "json"`

```json
{ "status":"ok", "codigo":0, "data": {
    "informe": "listaprecios",
    "fecha": "2026-10-30",
    "generado": "2026-10-30T15:14:03.512Z",
    "columnas": [
      { "campo":"descripcion",    "titulo":"DESCRIPCION" },
      { "campo":"partNumber",     "titulo":"PART NUMBER" },
      { "campo":"marca",          "titulo":"MARCA" },
      { "campo":"familia",        "titulo":"FAMILIA" },
      { "campo":"precioSinIgv",   "titulo":"PRECIO SIN IGV US$" },
      { "campo":"precioConIgv",   "titulo":"PRECIO CON IGV US$" },
      { "campo":"disponibilidad", "titulo":"DISPONIBILIDAD" }
    ],
    "filas": [
      { "descripcion":"HEADSET 3.5MM PRECOG S-WHCWW", "partNumber":"PRECOG S-WHCWW", "marca":"ADATA",
        "familia":"ACCESORIOS Y PERIFERICOS", "precioSinIgv":18, "precioConIgv":21.24,
        "disponibilidad":"SUJETO A DISPONIBILIDAD" }
    ]
} }
```

- `columnas` va en el orden del Excel; `titulo` es el mismo encabezado. La pantalla puede ocultar u
  ordenar distinto: el Excel conserva todas.
- Los precios llegan como **numeros**, en dolares (`18` es US$ 18,00). Mostrarlos con dos decimales.
- Un part number que no existe llega como `""`.
- La familia llega con su **nombre** (`"MOVILIDAD"`), no con su codigo.
- `fecha` es el dia del servidor (`AAAA-MM-DD`, hora de Lima); es la misma que lleva el nombre del
  archivo. Sirve para rotular la pantalla («Lista del 30/10/2026»). `generado` es el momento exacto, en UTC.

### Respuesta con `formato: "xlsx"`

El archivo, con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y
`Content-Disposition: attachment; filename="lista-precios-2026-10-30.xlsx"`.

Una hoja llamada `lista de precios`, con los mismos titulos y el mismo orden que el JSON. Los precios
son numeros con formato `#,##0.00`, asi que se pueden ordenar y sumar. El part number sin dato queda
en blanco.

El Excel trae **siempre la lista completa**, aunque en la pantalla haya un filtro puesto. Si eso puede
confundir al vendedor, conviene decirlo junto al boton.

**Como distinguir un error de un archivo:** el error llega con `Content-Type: application/json` y su
codigo http. Si el `Content-Type` no es el de la hoja, no guardarlo. Es el mismo caso que los reportes
del grupo 25.

---

## 3 · Errores

Siempre el JSON de siempre `{ status, codigo, msg }`, nunca un archivo.

| http | status | codigo | cuando |
|---|---|---|---|
| 400 | `formato invalido` | 2 | `formato` no es json ni xlsx |
| 401 | `falsa galleta` | 1 | no hay sesion |
| 403 | `sin permiso` | 3 | no es del grupo 20 |
| 403 | `usuario sin acceso` | 3 | el usuario no tiene acceso a la intranet |
| 500 | `error query` | 1 | fallo la consulta |

---

## 4 · Auditoria

**Cada descarga en Excel queda registrada** en el backend: modulo `reporte`, accion `lista de precios`,
el usuario, el dispositivo y el detalle (`xlsx · 6396 filas`). Verla en pantalla (`formato: "json"`)
**no** se registra. El frontend no tiene que hacer nada para esto.

---

## 5 · Para probar en bdnava08

Con cualquier usuario del grupo 20 (cartera o cobertura). Las claves de las cuentas de prueba no van en
los documentos.

| caso | que se ve |
|---|---|
| `{"formato":"json"}` | `200`, 6 396 filas, 8 familias, sin costo ni stock |
| `{"formato":"xlsx"}` | el archivo `lista-precios-AAAA-MM-DD.xlsx`, 7 columnas, 6 396 filas mas el encabezado |
| Sin cuerpo o sin `formato` | responde como json |
| `{"formato":"pdf"}` | `400 formato invalido` |
| Un usuario del grupo 25 o el 126 (grupo 34) | `403 sin permiso` |
| Sin sesion | `401 falsa galleta` |
| Producto sin part number | `""` en el JSON, celda en blanco en el Excel |
| `precioConIgv` | es `precioSinIgv` por 1,18 a un centimo, en las 6 396 filas |
| `GET /v1/vendedor/cartera` o `/cobertura` | **todavia sin** la clave `listaprecios` (sale apagada; ver §0) |
