# Factura — las dos que dejaron abiertas, y una petición

Respuesta a [`factura.md`](factura.md). **La pantalla está hecha** contra el contrato nuevo
y el módulo queda cerrado por nuestra parte.

Gracias por los dos agujeros. El de `/cambiado` es el que más nos habría costado
encontrar: desde el navegador, una ruta que guarda se ve igual tanto si comprueba de quién
es la factura como si no.

---

## 1 · Dirección: **no le pongan tope**

Es el único campo donde la lista entera vale más que las cinco mejores.

Casi todos los clientes tienen dos o tres direcciones. Con `top 5` y filtro por `LIKE`,
quien tenga ocho no puede ver las suyas sin adivinar qué escribir — y una dirección no se
adivina: hay que reconocerla. Trayéndolas todas, la pantalla las enseña de golpe y filtra
en local, así que escribir no cuesta un viaje por tecla.

El cliente de 195 no es problema: el panel se desplaza y tiene su buscador. Un caso raro
no debería empeorar los mil normales.

## 2 · Contactos y direcciones: **ciérrenlo**

Sí, por favor.

Lo que devuelve atención no es una referencia interna, es **nombre y número de documento**
de una persona:

```
CONTACTO DE EJEMPLO UNO|00000000|
```

Hoy, con un `codcli` cualquiera, se listan los contactos de cualquier cliente. No hace
falta ni tener una factura suya. Que sea menos grave que lo de `/cambiado` no lo hace poco
grave: lo otro dejaba cambiar datos, esto deja leer datos personales de terceros.

Si cerrarlo rompe algo que no vemos, díganlo y lo miramos; pero por defecto, cerrado.

---

## 3 · Una petición: que `top 5` diga **de cuántos**

Esta no la habíamos previsto y aparece al usar la pantalla.

Con 358 transportistas y `LIKE`, escribir `TRANS` deja fuera a un montón **sin avisar**.
El vendedor ve cinco, no encuentra el suyo, y no tiene forma de saber si es que no existe o
si es que hay veinte más detrás.

No hace falta subir el tope. Basta con que la respuesta diga cuántos hay en total:

```json
{ "total": 23,
  "data": { "0": {"0":"T0210","1":"TRANSPORTES CRUZ DEL SUR S.A.C."}, … } }
```

Con eso la pantalla pone «5 de 23 · sigue escribiendo para acotar», que es la diferencia
entre una lista corta y una lista corta **que se sabe corta**.

Si devolver el total sale caro, la alternativa es subir el tope a veinte. Pero lo primero
es mejor: cinco bien explicados valen más que veinte a ciegas.

---

## 4 · Una incoherencia pequeña que nos obliga a usar los números

Para el mismo campo, ustedes mandan dos nombres distintos:

| sitio | cómo se llama |
|---|---|
| bloque `puede` | `transporte` |
| bloque `data` | `transportista` |

Por eso, de momento, **seguimos mandando la clave numérica** a `/cambiado` y no el nombre
—que es la forma que ustedes mismos prefieren—: no sabemos cuál de los dos espera. Si
fijan uno y lo usan en los tres sitios, la pantalla pasa a mandar `campo` cambiando una
línea.

Los otros seis coinciden.

---

## 5 · ¿Nos mandan la razón social del cliente?

`/factura/campos` devuelve `cliente: "C13290"`, el código. La pantalla **ya no lo enseña**:
«C13290» no le dice nada a quien la mira, y la factura ya se identifica por su número. Se
sigue usando por dentro, que es para lo que hace falta — es lo que pide los contactos y
las direcciones de ese cliente.

Lo que sí iría bien en la cabecera es el **nombre**. Al cambiar una dirección de entrega,
saber que es «KEYNERS COMPANY S.A.C.» y no otra es lo que confirma que se está tocando la
factura correcta. Hoy la cabecera solo puede enseñar el número de documento.

Si pueden añadir `clienteNombre` junto al código, la ponemos. Si sale caro, lo dejamos así:
es una mejora, no un arreglo.

---

## 6 · El formato de atención

Lo partimos para enseñarlo: el nombre en la fila y el documento debajo. La barra es de la
base y no tiene por qué leerla quien usa la pantalla.

**¿Es un formato estable, `NOMBRE|DOCUMENTO|`?** Lo preguntamos porque si algún día viene
un contacto con una barra en el nombre, lo partiríamos mal. Al guardar mandamos el valor
entero tal cual, sin tocar, así que por ese lado no hay riesgo.

---

## Lo que hicimos con lo que mandaron

Siete pantallas son ahora **una ficha**. Se busca la factura una vez y se toca el campo que
haga falta; cada campo se guarda solo.

- **`/factura/campos` en una llamada.** Antes eran siete rutas de lectura y la pantalla
  pedía solo la del campo que tocaba, así que no había forma de ver el resto.
- **El bloque `puede` pinta las filas.** La de vendedor sale **de solo lectura**, no
  desaparece: que no se pueda reasignar no quita que interese ver de quién es. Eso antes
  era imposible — era una baldosa que sencillamente no salía en el hub.
- **Los cinco campos de opciones abren un buscador** salvo despacho, que con tres se pinta
  entero. Dirección se pide una vez y se filtra aquí; los demás preguntan al servidor, que
  es quien filtra.
- **La fila enseña el nombre y guarda el código.** El `valor` que devuelven es el código,
  así que el texto lo pone la opción que se pulsó.
- **Los tres motivos de rechazo** —`factura desconocida`, `sin permiso`, `campo
  desconocido`— se enseñan con su mensaje y sin botón de reintentar.

Y retiramos las tres constantes que apuntaban a `127.0.0.1`. **`caminos/rutas.js` ya no
tiene ninguna ruta apuntando al equipo del vendedor**, que era un pendiente nuestro desde
hace semanas; lo que lo mantenía vivo era justo este módulo.
