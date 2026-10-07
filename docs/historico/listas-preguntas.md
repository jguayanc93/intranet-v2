# Listas — ¿las tres rutas tienen la misma forma?

El módulo **Listas** son cuatro pantallas: cotizaciones, facturas, pedidos y clientes. Las
tres primeras son prácticamente la misma página repetida, y se están unificando en una
sola implementación.

Para hacerlo hace falta confirmar una cosa.

---

## El contrato que sí conocemos

`/lista/cotis` y `/lista/cotisxdia` están documentadas en
[`ver-cotizacion.md`](ver-cotizacion.md) y [`baja-cotizacion.md`](baja-cotizacion.md):

| pos | dato |
|---|---|
| 0 | fecha |
| 1 | número con serie |
| 2 | razón social |
| 3 | monto total con IGV |
| 4 | estado |
| 5 | **moneda** |
| 6 | registrado, con hora |
| 7 | **editable** |

## La pregunta

**¿`/lista/facturas`, `/lista/facturasxdia`, `/lista/pedidos` y `/lista/pedidosxdia`
devuelven esa misma forma?**

Lo pregunto porque el código actual sugiere que no. `js/listas/factura.js` lee la
**posición 5 como «Referencia»**:

```js
<p class="text-xs text-gray-500 font-medium">Referencia</p>
<p class="text-sm text-gray-700 font-mono">${data[5] || '-'}</p>
```

En cotizaciones esa posición es la moneda. Una de dos: o las rutas de factura devuelven
otra cosa, o ese código lleva tiempo pintando la moneda bajo la etiqueta «Referencia».

**No lo damos por supuesto**: adivinar la forma de una respuesta es lo que nos costó las
promociones. Con que confirmen las posiciones de las dos rutas, la pantalla queda
conectada.

### Y de paso

¿Esas cuatro rutas recibieron también las mejoras que se hicieron a las de cotización?
En concreto:

- ¿Aceptan `{ "dia": "AAAA-MM-DD" }` y `{ "desde": …, "hasta": … }`, o siguen con el
  formato anterior?
- ¿Filtran por el `codven` de la galleta?
- ¿Excluyen las eliminadas?
- ¿Devuelven lista vacía en vez de 400 cuando no hay nada ese día?

---

## Un fallo que encontramos de paso

**Las tres pantallas pintan el monto con un `$` escrito a mano:**

```js
<p class="text-lg font-bold text-indigo-600">$${data[3] || '0'}</p>
```

Una cotización en soles se muestra como `$3,210.00` cuando son **S/ 3,210.00**. El dato
para hacerlo bien ya llega en la posición 5; simplemente no se usa: `cotizacion.js` y
`pedidos.js` no la leen nunca.

No hace falta que el backend haga nada — se arregla al unificar las tres pantallas. Se
menciona porque los montos que esos vendedores han estado viendo en soles están
etiquetados en dólares.

---

## Lo que no bloquea

La página de **clientes** (`/lista/clientes`) es distinta a las otras tres y se tratará
aparte.
