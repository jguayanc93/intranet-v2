# Pruebas

Dieciocho suites que recorren las pantallas reales. No hay framework: cada archivo es un
programa de Node que monta la página, le da clics y comprueba lo que queda en el DOM.

```
cd dev/pruebas
npm install          una sola vez: lo único que hace falta es jsdom
node todas.js        las dieciocho, con un resumen
node probar-listas.js  una sola, con el detalle
```

`node todas.js` sale con código 1 si alguna falla, así que sirve tal cual en un gancho de
commit o en una tubería.

---

## Por qué hay un `package.json` aquí dentro

El proyecto que se despliega **no tiene npm, ni build, ni dependencias**: lo que está en el
repositorio es lo que se sirve. Eso no cambia.

Las pruebas sí necesitan una cosa —jsdom, para tener un DOM fuera del navegador— y se
declara aquí, en su propia carpeta, en vez de en la raíz. Así queda claro que es una
herramienta de desarrollo y no algo que el servidor necesite. `dev/` entero se excluye del
despliegue.

---

## Qué cubre cada una

| suite | qué recorre |
|---|---|
| `probar-core.js` | las rutas, el entorno, el formato, el cálculo de línea, el contrato de promociones, y que **ninguna página use un `CDK.*` que sus scripts no definan** |
| `probar-flujo.js` | crear una cotización entera, sobre la página real |
| `probar-observar.js` | la lista del día, el detalle y el documento para el cliente |
| `probar-modificar.js` | cambiar, quitar, agregar y guardar |
| `probar-eliminar.js` | dar de baja, con sus siete motivos de rechazo |
| `probar-listas.js` | las cuatro listas y la ficha del cliente |
| `probar-pedido.js` | el flete y el cambio de almacén |
| `probar-factura.js` | la ficha de los siete campos |
| `probar-promocion.js` | aplicar y quitar promociones |
| `probar-cuota.js` | registrar la cuota y ver el avance |
| `probar-login.js` | el inicio de sesión y el recorrido de punta a punta con los usuarios de prueba: login → alta → panel → marcas, encadenando las páginas reales sobre un mismo simulacro |
| `probar-reportes.js` | los reportes por marca: la lista según quién eres, los cuatro informes en una tabla, que no se sume nada del lado del cliente, qué significa cada `null`, exportar a Excel distinguiéndolo de un error, y que un informe lento no pise al siguiente |
| `probar-cuota-marcas.js` | la cuota por marca (grupo 25): que se llegue por `/cuota/mostrar` y lo decida lo que llega y no el tipo, las cuatro medidas de cada marca, quién puede fijar la meta según `puedoFijarMeta`, que solo viaje lo que cambió y que vaciar un campo lo borre, que una meta de 0 no se mande, que el total cuente solo las marcas con meta y lo diga, que la meta del mes pasado se precargue sin guardarse sola, el mes pasado y el anterior en solo lectura, que nada se calcule del lado del cliente, qué hace cada error del backend, el panel de la jefatura con `porDueno` y el hub de Cuota |
| `probar-ajuste.js` | el ajuste de precios, lado del **grupo 25**: las recibidas con una pestaña por estado (pendientes primero y con cuándo vencen); que el precio y el % sobre costo se muevan juntos, que no baje del costo —también en soles— y que solo viajen las líneas elegidas; que en un pedido no se toque la cantidad; el aviso de que se quitan todas las promociones y de que el descuento pasa a 0; que rechazar exija la observación; qué se hace cuando la pantalla ya no está al día; las ya respondidas en solo lectura; que no se recalcule lo que el backend ya dice (ni el `precioNeto`); un **costo de cuatro decimales** con su mínimo redondeado hacia arriba; el filtro por fecha de envío y su `400 fechas invalidas`; **el precio redondeado al céntimo, la mitad hacia arriba, antes de validar** (con el caso de 1.005); **el numerito de pendientes del menú** y que baje en el momento al responder; y el hub |
| `probar-ajuste-vendedor.js` | el ajuste de precios, lado del **vendedor (grupo 20)**: el asistente de tres pasos —elegir el documento de las listas de **cotizaciones y pedidos**, no teclear su número; la vista previa, que dice **antes de enviar** a quién irá cada línea y **cuáles no irán a nadie**; que siga funcionando si el backend aún no la tiene; cada motivo por el que no se deja enviar, dicho en el paso 2—; un pedido en soles; «Mis ajustes» con una pestaña por estado, la observación del responsable y lo que le pasa al documento; el filtro por fecha, y que cada punta quede en lo suyo |
| `probar-cobertura.js` | la cobertura de clientes por marca (grupo 25): que **nada se calcule en pantalla** —el total de clientes son clientes **distintos**, no la suma de los de cada marca, y es el del backend—, que marcas y clientes salgan en el orden del backend, que una marca grande no se pinte entera (los 100 primeros y «Mostrar los N restantes»), que quien solo devolvió se vea como tal y no cuente, el mes en curso y los dos anteriores con las marcas de entonces (y que un mes sin marcas no sea un error), el filtro por especialista de la jefatura y que no se quede apuntando a nadie, sin marcas, sin registro, los fallos con reintento, que una respuesta lenta no pise a la siguiente, y que **los clientes de una marca se exporten a Excel** (el archivo del backend, el mes que se ve, y que un error o un 200 que no es la hoja nunca se guarden), que un 0 en unidades se diga sin suponer por qué, y que Cobertura salga en el menú |
| `probar-vendedormes.js` | el vendedor del mes (grupo 25): que **nada se calcule en pantalla** —el total de cada marca, el puesto, la participación y la tendencia son los del backend— y que se diga que **el total no es el avance de la cuota**; que una marca con menos de 3 vendedores, o con ninguno, se vea como tal y no se omita; que cada tendencia (sube, baja, igual, nuevo) se lea por su texto y el color solo acompañe; **hasta qué día hay ventas** (`ventasHasta`, también en `null` y ausente); que el simulacro respete el **desempate** y que **nunca llegue una venta o participación en cero o negativa**; que un vendedor sin `tipo` se diga y no se invente; el mes en curso y el anterior, y nada más (con `sin marcas en ese mes` sin error); el filtro por especialista de la jefatura; sin marcas, sin registro y los fallos con reintento; y que salga en el menú con su etiqueta corta en la barra de abajo |
| `probar-marcas.js` | las marcas del mes (grupo 25): el borrador y confirmar, lo que el backend deja en `omitidas`, el panel de la familia de una jefatura, y el registro |

Las diecisiete últimas **cargan el HTML real con sus scripts reales** y los accionan como lo
haría un vendedor. Existen porque las comprobaciones unitarias no vieron un fallo que sí se
notaba pulsando.

---

## Cómo está escrita una suite

Todas siguen la misma forma, y conviene mantenerla:

1. **Un `responder(url, opciones)`** que simula el backend. Devuelve las formas reales,
   incluido el contrato raro de este proyecto: un JSON que contiene un string JSON.
2. **Un `montar(pagina)`** que lee el HTML de verdad, evalúa sus scripts de verdad en un
   DOM de jsdom, y devuelve la ventana.
3. **`ok(etiqueta, real, esperado)`**, que cuenta y explica cuando falla.

**Marcas, login, reportes, cuota por marca, ajuste, cobertura y vendedor del mes son la excepción en un punto**: su simulacro no está en el archivo
de la suite sino en [`dev/simulador-marcas.js`](../simulador-marcas.js),
[`dev/usuarios-prueba.js`](../usuarios-prueba.js) y
[`dev/simulador-reportes.js`](../simulador-reportes.js) y [`dev/simulador-cuota.js`](../simulador-cuota.js) y [`dev/simulador-ajuste.js`](../simulador-ajuste.js) , [`dev/simulador-cobertura.js`](../simulador-cobertura.js) y [`dev/simulador-vendedormes.js`](../simulador-vendedormes.js), y lo comparten con
`dev/servidor.js`. Llevan estado —dueños, confirmaciones, familia—, que es lo que permite
probar «la marca ya tiene dueño»; el de reportes lee de ahí qué marcas puede consultar cada
quien. Tener una sola copia evita que el servidor de desarrollo y la suite acaben simulando
dos backends distintos.

Tres cosas que han demostrado valer la pena:

- **Que el simulacro distinga lo que el backend distingue.** Si dos rutas devuelven cosas
  distintas allí, aquí no pueden compartir un `if`. Pasó con `/cuota/revisar` y
  `/cuota/mostrar`: respondían lo mismo, así que la suite pasaba mientras la pantalla leía
  la respuesta equivocada.

- **Comprobar que una prueba falla cuando debe.** Más de una vez una comprobación pasaba
  por casualidad. Si se añade una guarda contra una regresión, conviene introducir la
  regresión a mano una vez y ver que salta.
- **Poner algún importe en soles.** Buena parte de los fallos de este proyecto han sido
  monedas leídas de la posición equivocada, y en dólares no se notan.

---

## Los datos son inventados

Ningún nombre, documento ni número de cliente de estas pruebas corresponde a nadie. Los que
venían de ejemplos reales se sustituyeron antes de publicar el repositorio.
