# Promoción — las dos que quedaban

Respuesta a [`promocion-modulo.md`](promocion-modulo.md). **Las dos pantallas que sí se
pueden hacer están hechas** y el módulo queda cerrado por nuestra parte, salvo lo de pedido.

Lo de `/coti/buscar` fue el hallazgo del documento. No se nos ocurrió comprobar si existía:
dimos por hecho que, si el código la llamaba, estaría en alguna parte. La pantalla llevaba
quién sabe cuánto sin poder buscar una cotización y nadie lo reportó, probablemente porque
el error moría en un `console.log`.

---

## 1 · En qué estados de pedido se puede quitar una promoción

**La misma regla que ya aplicaron ustedes en `/pedido/flete`: solo con `flag='0'`.**

Es decir, aprobado. Ni atendido ni anulado. Su propia ruta del flete ya rechaza esos dos
casos con `pedido no modificable`, y usar ahí una regla y aquí otra sería pedir que alguien
se aprenda cuál va en cada sitio.

**Y a propósito no mencionamos `apro`.** Sigue sin confirmarse qué significan sus valores
2, 3 y 4 —lo preguntamos cuando hicimos pedido y sigue abierto— así que no queremos una
regla nueva apoyada en algo que nadie sabe leer. Con `flag` basta: distingue los tres casos
que importan y está documentado.

Si cuando sistemas conteste resulta que algún `apro` debería bloquearlo también, se añade.
Mejor empezar por lo que sí se entiende.

## 2 · Sí, cuenten los descuentos históricos

Sí, por favor. Es una medición de solo lectura y responde la única pregunta que importa:
**si hay algo que arreglar o no.**

Puede salir que son cuatro y da igual, o que son cuatro mil y hay que decidir qué hacer. Lo
que no se puede es seguir sin saberlo, porque son importes que alguien facturó.

Si pueden, dos cifras: **cuántos difieren y cuánto suma la diferencia**. La segunda es la
que dice si esto es una anécdota o un problema.

---

## Lo que hicimos

**Aplicar** — [`promocion/promocion_acoplar.html`](../promocion/promocion_acoplar.html)

- Se elige la cotización de **la lista del día**, como recomendaron. Es la misma de *Ver*,
  *Modificar* y *Dar de baja*, así que la propiedad está garantizada y no hubo que inventar
  nada.
- `/promocion/revisar` dice cuáles aplican, y se pide la previa de cada una con
  `/promocion/mostrar`. **Sin `grupos`**, que nunca se leyó.
- Las que ya están puestas se pintan como tales y no se pueden volver a poner.
- **Se eligen cuáles**, que era lo que faltaba, y se manda **una llamada por promoción**
  con `{ndocu, nprom}` y nada más. El `0.18` y el `fullpromo` desaparecieron.
- Si una falla y las otras no, se dice cuál: van en llamadas separadas y callarlo dejaría
  al vendedor sin saber en qué estado quedó la cotización.

**Quitar** — [`promocion/promocion_quitar.html`](../promocion/promocion_quitar.html)

- Mismo selector. `/cotizacion/readprom` y las cuatro situaciones distinguidas: **una
  cotización en soles enseña el motivo**, que es lo que pedimos y ustedes hicieron.
- Se marcan las líneas, o todas de una vez.
- `removeproms` va con **dos elementos por fila**, sin la descripción.
- Se enseña `removidas`, no cuántas marcamos: una promoción puede ocupar más de una línea.

**Quitar de pedido** queda retirada del hub, marcada como inexistente. Vuelve el día que
exista la ruta.

### Y la limpieza

`caminos/rutas.js` pierde `rutacotizacion` y `rutaprom`, las dos que apuntaban a rutas
inexistentes. **Ya no queda ninguna ruta del proyecto apuntando al equipo del vendedor.**

Se retiraron también las tres pantallas viejas y ocho archivos de JavaScript: 1.300 líneas
que hacían lo que ahora hacen 500, y que incluían la aritmética de descuentos que acaban de
dejar de usar.
