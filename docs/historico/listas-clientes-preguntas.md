# Lista de clientes — lo que hace falta

La pantalla de **clientes** se usa para consultar información general de los clientes, y
va a crecer: al tocar un cliente se verá cómo va el mes con él y qué le compra.

Eso necesita rutas que hoy no existen. Aquí va lo que la pantalla pediría y por qué, para
que nazcan encajando.

---

## 1 · Lo que ya existe, y una duda

`POST /lista/clientes` se llama **dos veces con la misma ruta** y un campo que decide qué
devuelve:

```json
{ "tipo": "asignados" }    →   { cliente, facturas, nc }
{ "tipo": "libres" }       →   { cliente, factura }
```

**Preguntas:**

- ¿Es así? Lo deducimos del código actual, que además está rodeado de comentarios
  `TODO: IMPLEMENTAR EVENTO AL BACKEND`, así que no sabemos si llegó a conectarse.
- ¿Devuelve un **código de cliente**? Hoy solo se lee el nombre, y sin código no se puede
  pedir el detalle de nadie. Es lo que más falta.
- ¿`asignados` y `libres` qué significan exactamente — los que tienen vendedor asignado y
  los que no?

---

## 2 · El avance del mes con un cliente

Al tocar un cliente, el vendedor quiere ver **cómo va el mes con él**.

**Pregunta de fondo: ¿avance contra qué?** «Avance» puede ser dos cosas distintas y la
pantalla se dibuja diferente según cuál sea:

| lectura | qué mostraría |
|---|---|
| cuánto lleva comprado este mes | una cifra y su comparación con el mes anterior |
| cuánto lleva **contra una cuota** asignada | una barra de progreso con su porcentaje |

Si hay cuota por cliente, la segunda es mucho más útil. Si la cuota es del vendedor y no
por cliente, entonces es la primera.

Lo que la pantalla necesitaría, sea cual sea:

| dato | para qué |
|---|---|
| total comprado en el mes en curso | la cifra principal |
| su moneda | sin ella se repite el fallo del `$` escrito a mano |
| número de documentos | «3 facturas» da contexto a la cifra |
| el mes anterior, para comparar | saber si va mejor o peor |
| la meta, si existe | pintar el progreso |

---

## 3 · El historial de tres meses

Lo que pidieron: **los dos productos que más le compró**, con el volumen.

| dato | nota |
|---|---|
| descripción del producto | |
| cantidad total en los 3 meses | el «volumen» |
| importe total | para ordenar por dinero, no solo por piezas |
| su moneda | |

**Preguntas:**

- **¿«Los que más compró» es por cantidad o por importe?** No dan el mismo resultado: 500
  unidades de un producto barato pueden pesar menos que 3 de uno caro. Para un vendedor
  suele importar el dinero, pero dijeron «volumen», así que conviene confirmarlo.
- **¿Dos fijos, o los dos primeros de una lista más larga?** Si la ruta devuelve, digamos,
  los diez más comprados ordenados, la pantalla enseña dos y deja ver el resto. Cuesta lo
  mismo en el backend y da más margen.
- **¿Tres meses hacia atrás desde hoy, o los tres meses naturales anteriores?** No es lo
  mismo un 2 de octubre.

---

## 4 · Lo que la pantalla propone

Una sola ruta para las dos cosas, porque se piden a la vez al tocar un cliente:

```
POST /lista/clientes/detalle
{ "codcli": "C12171" }
```

```json
{
  "status": "ok", "codigo": 0,
  "data": {
    "mes":     { "total": 4820.50, "moneda": "D", "documentos": 3, "anterior": 3100.00 },
    "top":     [
      { "descripcion": "TONER HP CF283A", "cantidad": 24, "importe": 1915.00, "moneda": "D" },
      { "descripcion": "BOTELLA TINTA T544", "cantidad": 60, "importe": 1710.00, "moneda": "D" }
    ]
  }
}
```

Dos llamadas separadas también valen. Se propone una porque la pantalla las necesita
juntas y así es una sola espera.

> **Debe filtrar por el vendedor de la galleta**, como `/lista/cotisxdia`. Un vendedor no
> debería poder consultar el avance de un cliente que no es suyo escribiendo su código.

---

## 5 · Falta una cosa

Nos dijeron que hay **un tercer dato** para el historial que todavía no está decidido. La
pantalla se está montando de modo que añadirlo sea una fila más, no un rediseño.

Cuando se concrete, se agrega aquí.

---

## Mientras tanto

La pantalla se migra con lo que hoy funciona —las dos vistas de clientes— y con el detalle
montado y vacío, listo para conectar. Si se toca un cliente antes de que las rutas
existan, lo dice en vez de quedarse en blanco.
