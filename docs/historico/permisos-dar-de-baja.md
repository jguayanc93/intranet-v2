# Quién puede dar de baja una cotización

Respuesta a la pregunta que quedó abierta en `baja-cotizacion.md`: hoy el permiso
`delete` lo tienen los grupos 25, 34 y 32, y eso deja fuera a los 22 vendedores del
grupo 20.

---

## Lo que debe pasar

**Un vendedor normal —cobertura o cartera— sí puede dar de baja sus propias
cotizaciones.** Las suyas, las que le pertenecen.

Así que **hay que agregar el grupo 20 a la matriz de permisos** para
`cotizacion` → `delete`. No es que el permiso esté bien y la pantalla deba ocultarse: la
pantalla está para ellos.

La validación de propiedad que acaban de añadir a la ruta sigue siendo la que importa, y
ya hace lo correcto: un vendedor del grupo 20 solo podrá dar de baja lo suyo.

### Mientras tanto

La pantalla ya consulta `GET /cotizacion` y, si no llega `delete`, no ofrece nada: explica
que el grupo no tiene permiso y esconde también la búsqueda por número, que llevaría al
mismo 403.

Eso es correcto como comportamiento general y se queda. Pero **hoy se activa para 22 de
27 vendedores**, que es justo lo contrario de lo que debería. En cuanto el grupo 20 entre
en la matriz, esos 22 ven la pantalla normal sin tocar nada del frontend.

---

## Lo que viene después, para tenerlo en el radar

**Un jefe de marca o de línea puede dar de baja cotizaciones que incluyan sus productos,
sea de quien sea.**

No es lo mismo que lo anterior y conviene no mezclarlo: ahí la propiedad deja de ser el
criterio. La regla pasa de «es mía» a «tiene un producto de mi marca», que es una consulta
sobre el detalle de la cotización, no sobre su cabecera.

**No hace falta hacerlo ahora** — queda para cuando los módulos estén terminados. Se
menciona porque tiene dos consecuencias que es mejor conocer antes que después:

- **Choca con la validación de propiedad** que acaban de poner en `/eliminar`. Ese jefe
  recibiría hoy `coti desconocida` sobre una cotización que sí debería poder tocar. Habrá
  que abrirle una excepción, no quitarle la validación a nadie.
- **La pantalla necesitaría otra lista.** `/lista/cotisxdia` filtra por `codven` y no
  acepta pedir las de otro, que es exactamente lo que la hace segura hoy. Un jefe de marca
  necesitaría una consulta distinta: «las que llevan productos de mis marcas», con su
  propia autorización.

Dicho de otro modo: cuando toque, es una ruta nueva y un permiso nuevo, no un parámetro
más en las que ya existen.

---

## Lo otro que estaba abierto

**El motivo se queda con el de por defecto.** La pantalla no lo envía, así que el backend
escribe `ANULADA DESDE INTRANET(01)`. Si algún día se quiere que el vendedor elija entre
las dos entradas del catálogo, es un `<select>` y una línea más en el cuerpo.
