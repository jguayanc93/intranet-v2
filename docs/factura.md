# Factura — las quince rutas, documentadas

Responde a `factura.md`. Hicieron bien en no escribir nada: **tres de sus suposiciones
eran falsas**, y una de ellas habría costado rehacer la pantalla.

Lo que pidieron está hecho: la ruta que lee los siete campos de una vez, el permiso de
`vendedor` restringido, y el agujero de `/cambiado` cerrado.

---

## Tres cosas que no son como pensaban

**`/factura/observacion/cambio` y `/factura/orden/cambio` no existen.** El router registra
**cinco** rutas `/cambio`, no siete. Observación y orden se guardan por `/cambiado` con las
claves 6 y 7, igual que los demás. **No hay dos maneras de guardar**, que era lo que les
preocupaba.

**La ruta es `/factura/transporte`**, no `/transportista`.

**`/vendedor/modificar` no existía en ningún router.** El bloque comentado llamaba a una
ruta que no está registrada. No era que se hubiera partido en siete: nunca llegó a existir.
Ahora sí existe, con otro nombre.

---

## 1 · La ruta nueva: `/factura/campos`

```
POST /v1/factura/campos
{ "doc": "B007-0011350" }
```

```json
{ "status": "ok", "codigo": 0,
  "data": {
    "documento":     "B007-0011350",
    "cliente":       "C13290",
    "clienteNombre": "CLIENTE DE EJEMPLO S.A.C.",
    "despacho":      { "codigo": 3, "texto": "Desp. Local (Lima)" },
    "transporte":    { "codigo": "T0001", "texto": "COMPUDISKETT S.R.L." },
    "atencion":      "CONTACTO DE EJEMPLO UNO|00000000|",
    "direccion":     "JR. GENERAL JOSE CANTERAC 545 - LIMA - JESUS MARIA",
    "vendedor":      { "codigo": "V0235", "texto": "WILLIAM MELENDEZ HUAMAN" },
    "observacion":   "",
    "orden":         ""
  },
  "puede": {
    "despacho": true, "transporte": true, "atencion": true, "direccion": true,
    "vendedor": false, "observacion": true, "orden": true
  } }
```

**Va con nombres, no con posiciones.** Es una ruta nueva y no arrastra compatibilidad; otra
tabla de posiciones era justo lo que sobraba en este módulo. Los campos que tienen código y
texto lo traen separado, así que pueden enseñar el nombre y guardar el código sin casos
especiales.

### El bloque `puede` les ahorra el cruce

Dice, campo por campo, si el grupo de quien pregunta puede cambiarlo. La pantalla pinta la
fila editable o de solo lectura leyendo eso, sin cruzar nada con el hub.

En el ejemplo `vendedor` está en `false` porque ese usuario es ejecutivo. Ver el punto 4.

Responde **403 `factura desconocida`** si no existe, está anulada, ya tiene guía emitida o
no es suya. Los cuatro casos dan la misma respuesta a propósito: distinguirlos convertiría
la ruta en un confirmador de números ajenos.

---

## 2 · Las claves numéricas son correctas

Su tabla está bien. Son columnas de `mst01fac`:

| clave | columna | campo |
|---|---|---|
| 1 | `TipEnt` | despacho |
| 2 | `codtra2` | transportista |
| 3 | `Consig` | atención |
| 4 | `dirent` | dirección |
| 5 | `codven_usu` | vendedor asignado |
| 6 | `observ` | observación |
| 7 | `orde` | orden de compra |

**Y ya se puede usar el nombre.** Las dos formas conviven:

```json
{ "1": "4", "doc": "F009-0649171" }
{ "campo": "despacho", "valor": "4", "doc": "F009-0649171" }
```

> **Una trampa que tenían encima:** el servidor tomaba **la primera clave del objeto**. Si
> hubieran mandado `{"doc": "...", "1": "..."}` con `doc` delante, respondía `no match`.
> Funcionaba solo por el orden en que lo escribían. Ahora se busca entre todas las claves.

---

## 3 · `/cambiado` no comprobaba nada — corregido

Las siete rutas de **lectura** sí validaban: exigen `codven_usu` del que pregunta, más
factura o boleta, no anulada y sin guía emitida.

**La de guardado no validaba nada.** Verificaba la galleta y descartaba el resultado:
cualquier usuario autenticado podía cambiarle a cualquier factura el transportista, la
dirección de entrega o la observación, sabiendo solo el número. Y con la clave 5,
**reasignar `codven_usu`**, es decir quitarle la factura a su dueño.

Ahora aplica los mismos filtros que las lecturas, dentro de una transacción, y comprueba el
permiso del campo que se está cambiando. Era lo que preguntaban en el punto 6, y la
respuesta era la misma que en cotización.

### Qué devuelve

```json
{ "status": "ok", "codigo": 0,
  "documento": "B007-0011350", "campo": "observacion", "valor": "PRUEBA BACKEND" }
```

**`valor` es lo que quedó en la base**, releído después de guardar, no lo que se mandó. Era
lo que pedían en el punto 7.

| situación | `status` | HTTP |
|---|---|---|
| guardado | `ok` | 200 |
| no existe, no es suya, anulada o con guía | `factura desconocida` | 403 |
| su grupo no puede cambiar ese campo | `sin permiso` | 403 |
| no se indicó campo, o no es de los siete | `campo desconocido` | 400 |

Ya no responde `{"resultado":"actualisado"}` cuando no tocó ninguna fila.

---

## 4 · Vendedor asignado: concedido

**`vendedor` pasa a ser solo del grupo 34**, jefatura de zona. Los ejecutivos y los jefes de
producto dejan de poder reasignar facturas.

Pero hacía falta algo más de lo que pensaban: **la matriz de permisos no se aplicaba en
ninguna de las quince rutas.** Solo se devolvía en `GET /v1/factura` para que pintaran. Si
solo se hubiera cambiado la matriz, cualquiera habría seguido reasignando facturas.

Ahora las catorce rutas de campo exigen su permiso, y `/cambiado` lo comprueba según el
campo que venga en el cuerpo.

Para la pantalla no hace falta hacer nada: el bloque `puede` de `/campos` ya dice qué filas
pintar.

---

## 5 · Cuántas opciones devuelve cada campo

Los números reales, contados en la base:

| campo | opciones que existen | lo que devuelve la ruta |
|---|---|---|
| despacho | **3** | las 3 |
| transportista | **358** activos | `top 5` |
| atención | 1,9 de media, **máximo 123** | `top 5` |
| dirección | **máximo 195** por cliente | sin tope |
| vendedor | **324** | `top 5` |

**El backend sí filtra por `sugerencia`**, con `LIKE`, y además capa a 5. Era la pregunta
que decidía el diseño: buscador para todo menos despacho.

Despacho son tres y fijas, así que se pueden pintar sin más:

| código | texto |
|---|---|
| 1 | `Desp.Ventanilla` |
| 3 | `Desp. Local (Lima)` |
| 4 | `Desp. Provincia` |

> Dirección es el único sin tope y llega a 195 en un cliente. Si quieren, se le pone `top 5`
> como a los demás.

---

## 6 · Un bug del backend que no habían visto

**`/factura/vendedor/cambio` estaba roto, y no por el `127.0.0.1`.**

Su consulta era copia de la de despacho: devolvía el tipo de despacho de la factura en vez
de la lista de vendedores. Y encima usaba `@codven` sin declararlo como parámetro, así que
SQL Server rechazaba la llamada y la ruta respondía **500**.

Aunque hubieran arreglado el host en el frontend, no habría funcionado.

Corregido: ahora lista vendedores igual que transportista lista los suyos.

```json
{ "0": {"0":"V0004", "1":"CESAR CAMPOS AZNARAN"},
  "1": {"0":"V0008", "1":"JOANNA COSSIO VELASQUEZ"} }
```

---

## 7 · Las tres cosas pequeñas

**Las formas sí difieren**, como sospechaban: despacho, transportista y vendedor devuelven
`[código, texto]`; atención y dirección devuelven **solo el texto**.

**Y está bien mandar la posición 0 en los cinco casos**: `Consig` y `dirent` guardan texto,
no códigos. No hay nada que traducir.

**La posición 0 de las lecturas** es el código en despacho y transportista, y la 1 el texto.
En los otros cinco la posición 0 **es** el valor. Por eso parecía que sobraba: solo sobra en
dos de los siete.

De todas formas, con `/factura/campos` ya no hace falta llamar a las siete.

---

## 8 · Contactos y direcciones: cerrado

Tenían razón y está hecho. Para que `/atencion/cambio` y `/direccion/cambio` entreguen algo,
**el vendedor tiene que tener alguna factura con ese cliente**. Con el `codcli` de un cliente
ajeno la lista llega vacía.

No responde un error: devuelve cero opciones. Es honesto —con ese cliente no tienen nada— y
no confirma si el código existe.

Las de **despacho**, **transportista** y **vendedor** son catálogos generales; ahí no hay
nada que validar.

---

## 9 · ⚠️ Las siete rutas de lectura ya no existen

`/campos` las reemplaza a todas, así que **se retiraron**:

```
/factura/despacho     /factura/transporte    /factura/atencion    /factura/direccion
/factura/vendedor     /factura/observacion   /factura/orden
```

Llamar a cualquiera de ellas da **404**. Es el único cambio de este documento que rompe lo
que hay hoy, y es a propósito: dejarlas vivas significaba mantener dos caminos para lo
mismo, y uno sin usar envejece mal.

El módulo pasó de quince rutas a nueve:

| ruta | qué hace |
|---|---|
| `GET /v1/factura` | los accesos del grupo |
| `POST /v1/factura/campos` | **los siete valores de una vez** |
| `POST /v1/factura/despacho/cambio` | opciones de despacho |
| `POST /v1/factura/transporte/cambio` | opciones de transportista |
| `POST /v1/factura/atencion/cambio` | contactos del cliente |
| `POST /v1/factura/direccion/cambio` | direcciones del cliente |
| `POST /v1/factura/vendedor/cambio` | vendedores |
| `POST /v1/factura/cambiado` | guarda un campo |

Con la pantalla única no hacen falta más: una llamada para abrir la ficha, una por lista de
opciones que se despliegue, y una por campo que se guarde.

---

---

## 10 · Las listas ya dicen de cuántas

Pedido concedido, y sin subir el tope. Las cinco devuelven la misma forma:

```json
{ "status": "ok", "codigo": 0, "total": 207,
  "data": { "0": {"0":"T0210","1":"TRANSPORTES CRUZ DEL SUR S.A.C."}, … } }
```

`total` es **cuántas hay con ese filtro**, no cuántas viajan. Sale de contar antes de
aplicar el tope, así que no cuesta una consulta extra.

Probado con el caso que describían: escribir `TRANS` encuentra **207 transportistas** y
devuelve 5. La pantalla ya puede decir «5 de 207».

| campo | devuelve | total típico |
|---|---|---|
| despacho | las 3 | 3 |
| transportista | 5 | hasta 358 |
| atención | 5 | 1,9 de media |
| **dirección** | **todas** | 2 o 3, máximo 195 |
| vendedor | 5 | 324 |

**Dirección se quedó sin tope**, como pidieron, y además sin filtro: llegan todas las del
cliente para que la pantalla filtre en local sin un viaje por tecla.

Y una lista vacía ya es una lista vacía. Antes rechazaban con `factura no asignada`, que ni
siquiera describía lo que pasaba.

---

## 11 · `transporte` en los tres sitios

Tenían razón en la incoherencia. El campo se llama **`transporte`** en la ruta, en el
permiso y en la matriz, así que ahora también en `data`. Era el único que no coincidía.

**Ya pueden mandar `campo` en vez de la clave numérica.**

---

## 12 · El nombre del cliente, y el formato de atención

**`clienteNombre` añadido**, junto a `cliente`. Sale de la propia factura, así que no costó
ni un JOIN.

Sobre el formato de atención, lo medí en las 26 025 facturas de los últimos seis meses:

| forma | facturas |
|---|---|
| dos barras | **25 695** (99,2 %) |
| sin barras, solo el nombre | 215 |
| una sola barra | 1 |
| **más de dos barras** | **0** |

**Es estable, y su miedo no se materializa: ningún nombre lleva una barra.** Ni uno en
26 025.

Pero son **tres** campos, no dos. La tercera barra no es un cierre: es un teléfono que
suele venir vacío.

```
CONTACTO DE EJEMPLO UNO|00000000|
CONTACTO DE EJEMPLO DOS|00000000|900000000
```

De los que traen las dos barras, **9 176 tienen el tercer campo vacío** y el resto llevan
número. Partiendo por `|` y tomando `[0]` nombre, `[1]` documento y `[2]` teléfono sale
bien en los tres casos — y conviene tolerar los 215 que llegan sin ninguna barra, que son
solo un nombre.

---

## Lo que queda abierto

Nada de este documento. Las dos que dejé abiertas están decididas y aplicadas, y las cuatro
peticiones de su respuesta están hechas.
