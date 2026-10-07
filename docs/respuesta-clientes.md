# Detalle del cliente — las cuatro decisiones

Respuesta a la sección 4 de [`clientes.md`](clientes.md). Las tres primeras van decididas en
un párrafo. La cuarta —el tercer dato del historial, que nadie había concretado— es la
mitad de este documento, porque resultó ser la pregunta interesante.

Lo demás de su documento queda entendido y sin peros: `cartera`/`cobertura` ya está
corregido en la pantalla, el código de cliente siempre estaba en la posición 0 y éramos
nosotros leyendo mal, y la lista vacía del día 1 ya no dice «no tienes clientes».

---

## 1 · El top va por **cantidad**

Por volumen, que es lo que se pidió. Ordenen por cantidad.

Eso sí, **manden también el importe**, como ustedes proponían. No cuesta nada traerlo y
deja que la pantalla enseñe las dos cifras en la misma fila: el vendedor ve «60 unidades ·
S/ 1,710» y juzga solo. Si algún día se quiere ordenar por dinero, es cambiar el `ORDER BY`
y nada más.

## 2 · Diez, ordenados

Su inclinación, aceptada. La pantalla enseña dos y deja ver el resto al tocar.

## 3 · Los tres meses naturales anteriores

Su inclinación, aceptada, y por su motivo: **la cifra no cambia según el día en que se
mire**. Dos vendedores abriendo la misma ficha ven lo mismo, y el número cuadra con el
cierre de mes en vez de ir corriéndose.

Mirado un 2 de octubre: julio, agosto y septiembre. Octubre no entra.

---

## 4 · El tercer dato: **qué le toca reponer**

Lo que se busca, dicho en una frase: *que el vendedor abra la ficha y sepa con qué llamar a
este cliente hoy.*

«Lo que compraría» suena a adivinar, y no hace falta adivinar nada. Casi todo lo que
compran estos clientes es **reposición con un ritmo**: tóner, tinta, papel, consumibles. Un
cliente que pide dos cajas del mismo tóner cada cinco o seis semanas no es un misterio
estadístico — es un ritmo que la base ya conoce y que hoy solo está en la cabeza del
vendedor, si es que se acuerda.

Así que la propuesta no es predecir. Es **medir el ritmo de cada producto y decir cuánto
lleva pasado**.

### Lo que se calcula, por producto y cliente

| dato | cómo |
|---|---|
| cada cuántos días lo compra | **mediana** de los intervalos entre compras |
| cuánto pide cada vez | **mediana** de la cantidad por compra |
| cuándo fue la última | fecha de la última compra |
| cuántas veces lo compró | el número de compras en la ventana |

**Mediana y no promedio, en las dos.** Una compra grande y rara —una reposición de stock,
un pedido de fin de año— desplaza el promedio y deja un ritmo que no existe. La mediana se
la come.

### Lo que la pantalla enseñaría

> **TONER HP CF283A**
> suele pedir **2** cada **38 días** · lleva **51** · 7 compras

Esa línea es defendible por teléfono, que es la prueba de fuego: el vendedor puede decir
«suele pedirme dos cada mes y pico y lleva casi dos meses» sin tener que creerse nada.

### La forma que pedimos

Dentro de la misma respuesta de `/lista/clientes/detalle`, junto a `mes` y `top`:

```json
"reponer": [
  {
    "descripcion": "TONER HP CF283A",
    "cantidad":    2,
    "cada":        38,
    "ultima":      "2026-08-15",
    "compras":     7
  }
]
```

- `cada` — días entre compras, la mediana.
- `cantidad` — lo que pide cada vez, la mediana.
- `compras` — cuántas veces lo compró en la ventana. **Va en la respuesta a propósito**:
  es lo que deja al vendedor decidir si fiarse de la cifra. Tres compras y siete no se leen
  igual, y no queremos esconder esa diferencia detrás de un número redondo.
- Los días de retraso los calcula la pantalla con `ultima` y `cada`. No hace falta que
  venga: así la respuesta no caduca si alguien la mira mañana.

**Ordenado por lo que lleva pasado**, de mayor a menor, y **solo los que ya se pasaron**.
Un producto que va en su ritmo no es noticia. Diez como mucho, igual que el top.

### Tres condiciones para que esto signifique algo

Esto es lo que de verdad hay que mirar antes de escribir la consulta:

1. **Hacen falta tres compras del mismo producto, no dos.** Con dos compras hay un solo
   intervalo, y un intervalo no es un ritmo: es una coincidencia a la que le pusimos un
   número. Que los productos con menos de tres compras no entren.

2. **La ventana tiene que ser de doce meses, no de tres.** Y esto es lo importante: **no es
   la misma ventana que el top**. En tres meses, un producto que se compra cada seis
   semanas aparece dos veces como mucho, y acabamos de decir que con dos no se puede. Con
   doce meses, ese mismo producto tiene ocho o nueve compras y el ritmo se sostiene solo.

   O sea: `top` mira tres meses naturales, `reponer` mira doce. Son dos preguntas
   distintas y conviene que tengan ventanas distintas.

3. **Fuera las notas de crédito y las devoluciones.** Una línea devuelta no es una compra,
   y si cuenta como tal acorta el ritmo e inventa un retraso que no existe.

### Lo que esto **no** es, y cómo lo decimos en pantalla

No es una predicción. Si el cliente cambió de proveedor, cerró una línea o compró una
impresora distinta, esto va a seguir diciendo que le toca tóner durante meses.

Por eso la pantalla **no va a poner «va a comprar»**. Pone «suele pedir», que es lo único
que el dato sostiene, y enseña el número de compras al lado para que se vea de dónde sale.
Es la misma regla que seguimos con el `$` de los montos: no mostrar una cifra sin decir qué
es.

### Dos cosas que nos hace falta saber

- **¿Hay doce meses de historia consultables** por cliente y producto, con un coste
  razonable? Si solo hay seis, se puede hacer igual pidiendo tres compras, pero entran
  menos productos y conviene saberlo antes.
- **¿El detalle de factura —las líneas— se puede cruzar por cliente** sin que la consulta
  se vuelva cara? El top ya lo necesita, así que probablemente sí; lo preguntamos porque
  `reponer` lo necesita sobre cuatro veces más historia.

Si cualquiera de las dos sale mal, díganlo y lo recortamos: con seis meses y productos de
ritmo mensual sigue siendo útil, solo que con menos filas.

---

## Lo que queda abierto

**La cuota por cliente sigue vacía**, y con eso estamos de acuerdo: nada de barra de
progreso mientras no haya meta. La pantalla deja el hueco hecho, así que el día que se
carguen las cuotas es un campo más en la respuesta y no un rediseño.

Si se activa, queda su pregunta por contestar: la cuota es **por cliente y por marca**, y
habrá que decidir si la ficha suma o desglosa. Cuando llegue ese día lo miramos con una
cuota real delante, que es más fácil que decidirlo en abstracto.

---

## Cerrado · el tope de tres ciclos

Preguntan si tres es el número. **Sí, déjenlo en tres.**

El hallazgo es suyo y es bueno: sin tope, los productos que el cliente dejó de comprar
acumulan más días que nadie y copan los diez puestos, así que el bloque se llena justo de
lo que no sirve. Las dos filas que quedan con el tope puesto —2,7 y 2,9 ciclos— son las
que un vendedor puede defender por teléfono, que era la prueba que pusimos.

Que siga siendo una constante en un sitio. Si con meses de uso real se ve que entra
demasiado ruido o que se queda corto, se mueve ahí y ya.

Con esto la ficha del cliente queda cerrada por nuestra parte. **Gracias por las tres
correcciones del procedimiento**: lo de `cartera` contando ventas hechas cuando el cliente
todavía era de otro no lo habríamos visto nunca desde aquí.
