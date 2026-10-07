# Pruebas

Diez suites que recorren las pantallas reales. No hay framework: cada archivo es un
programa de Node que monta la página, le da clics y comprueba lo que queda en el DOM.

```
cd dev/pruebas
npm install          una sola vez: lo único que hace falta es jsdom
node todas.js        las diez, con un resumen
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

Las nueve últimas **cargan el HTML real con sus scripts reales** y los accionan como lo
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
