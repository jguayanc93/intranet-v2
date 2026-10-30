# Grupo 20 — Lista de precios: respuesta del backend

Responde a [respuesta-listaprecios.md](respuesta-listaprecios.md). Contrato: [listaprecios-grupo20.md](listaprecios-grupo20.md).

**Lo que hace la pantalla esta bien con el contrato.** Revisamos la tabla de la seccion 1 y lo que suponen sin
preguntar: no hay nada que corregir. Pedir una sola vez, filtrar en el navegador, no reordenar, decir la
disponibilidad una sola vez, rotular con `fecha` y pedir el Excel sin el filtro es justo lo esperado.

---

## Las tres preguntas

**1 · ¿La respuesta JSON viaja comprimida? No.** El backend no comprime. Lo comprobamos el 30/10/2026 con el codigo que sale, pidiendo
con `Accept-Encoding: gzip, br`, y la respuesta llego sin `Content-Encoding`: unos 1,4 MB el JSON y unos 2,2 MB el
Excel. Que un proxy delante del servidor comprima depende de la instalacion, no del codigo; se ve en las
herramientas del navegador (`Content-Encoding` en la respuesta).

**Para esta salida se queda asi.** Comprimir en el backend es una dependencia nueva que toca todas las rutas, y
no la vamos a meter el mismo dia de la salida. Queda anotado para despues. La pantalla no cambia por eso: si
algun dia llega comprimida, el navegador la descomprime solo.

**2 · `Content-Disposition` expuesto por CORS: si, tambien en esta ruta.** La cabecera se expone para todo el
servicio, no ruta por ruta. Comprobado el 30/10/2026: `POST /v1/reporte/listaprecios` con `formato: "xlsx"`
devuelve `Access-Control-Expose-Headers: Content-Disposition` y
`Content-Disposition: attachment; filename="lista-precios-2026-10-30.xlsx"`. El archivo se guarda con la fecha.

**3 · Servidor de prueba y cuentas.**

- **El codigo:** sale hoy a la rama `main` y el servidor de prueba lo trae en el mismo paso que el resto del
  grupo 20. Les avisamos cuando este arriba.
- **Las cuentas:** las mismas de las otras pantallas del grupo 20, V0313 (cartera) y V0278 (cobertura), mas el
  126 y un usuario del grupo 25 para el `403 sin permiso`. Las claves se pasan aparte, no en documentos.
- **La clave del menu sigue apagada** en el servidor de prueba. La pantalla se recorre entrando directo a
  `listaprecios.html`: la ruta responde igual a cualquier vendedor del grupo 20.

---

## Cierre

- [x] contrato leido y pantalla revisada contra el contrato — **sin observaciones**
- [x] compresion: no hay; se queda asi en esta salida
- [x] `Content-Disposition` expuesto en esta ruta
- [ ] el servidor de prueba tiene este codigo — **backend**, hoy
- [ ] recorrida contra el servidor de prueba, con los casos de su seccion 3 — **frontend**
- [ ] pantalla publicada → el frontend avisa → el backend enciende la clave `listaprecios`
