# Despliegue del grupo 25 y cómo probarlo contra el servidor de prueba

Lo que hay que saber y comprobar antes de subir los módulos del grupo 25 (marcas, cuota por marca, reportes, ajuste,
cobertura y vendedor del mes), y cómo recorrerlos contra el **backend de prueba** (base bdnava08).

---

## 1 · El «servidor de prueba» es el del backend, no uno para el frontend

El backend de prueba solo acepta peticiones desde **`http://127.0.0.1:8080`** (es su `CORS_ORIGENES_EXTRA`), va por
**https** y su dirección está **bajo `compudiskett.com.pe`**, porque las cookies `cdk` y `tip` son `Secure` y de ese dominio.
Por eso **el frontend no se sube a otro sitio para probarlo**: se sirve en local, en ese origen exacto, y se apunta al
backend de prueba. Ver [servidor-prueba-grupo25.md](servidor-prueba-grupo25.md).

```
cd teletran2
node dev/servidor.js            # sirve el frontend en http://127.0.0.1:8080 (y el simulacro de la API en :3000)
```

Después, en la consola del navegador, **estando en `http://127.0.0.1:8080`** (no en `localhost`):

```js
localStorage.setItem("cdk.api", "https://<dirección del servidor de prueba>")    // apunta al backend de prueba
localStorage.removeItem("cdk.api")                                               // vuelve al simulacro
```

- La dirección y las claves de las cuentas **las pasa quien coordina**; no están en el repositorio.
- Solo funciona en desarrollo y solo acepta `https` bajo `compudiskett.com.pe` ([core/cdk-rutas.js](../core/cdk-rutas.js)). En
  producción no hace nada, así que no puede apuntar una pantalla desplegada a otro servidor.
- Al cargar, la consola dice *«La API apunta al servidor de prueba: …»*. Si no lo dice, se está usando el simulacro.

---

## 2 · Antes de subir

Los tres, en este orden, y los tres tienen que salir limpios:

| comprobación | qué dice |
|---|---|
| `node dev/pruebas/todas.js` | que cada pantalla hace lo que debe, contra el simulacro del contrato del backend |
| `node dev/revisar-despliegue.js` | que **lo que se sirve está completo y no lleva restos**: cada página carga solo archivos que existen y que git conoce, ninguno de `dev/`; ningún script con errores de sintaxis; ningún `debugger` ni clave escrita; y lo nuevo sin direcciones escritas a mano ni `console.log` sueltos |
| `git status` | que no queda nada sin commitear de lo que se quiere subir |

`node dev/revisar-despliegue.js` deja pasar **un problema que ya existía** y no es de esta entrega: `programador_entregar.html`
carga un archivo que nunca existió, de un módulo que está desactivado en el catálogo.

**Qué se despliega:** todo menos `dev/` y la documentación (`docs/` y los `.md`). `dev/` contiene el servidor de demostración,
los simulacros y las pruebas, y no forma parte del producto ([dev/pruebas/README.md](../dev/pruebas/README.md)).

---

## 3 · La regla: backend y frontend salen el mismo día

El frontend de esta entrega **depende del backend del 21 y 22/10/2026**, y el backend **retiró las rutas antiguas** (responden `404`):

| el frontend ahora llama | y ya no llama |
|---|---|
| `/v1/marcas*`, `/v1/login/registro*` (con marcas) | — |
| `/v1/reporte/marca*` | `/reporte/marcas`, `/stoc`, `/tiempo`, `/precios` |
| `/v1/cuota/marcas*` | `/cuota/especialista`, `/multiple`, `/marcarevisar`, `/marcawach`, `/marcaupdate`, `/marcamostrar` |
| `/v1/ajuste*`, `/lista/pedidos` con `editable` en la posición 7 | — |
| `/v1/cobertura/*`, `/v1/vendedormes/top` | — |
| `/v1/vendedor` con `ajustesPendientes` y el menú de siete módulos del grupo 25 | — |

Por eso **no se puede subir uno sin el otro**: un frontend nuevo contra un backend que aún no tiene estas rutas no encuentra ninguna
de las pantallas nuevas, y un backend nuevo con el frontend viejo deja sin rutas a la cuota por marca y a los reportes del grupo 25.
**La vuelta atrás también es de los dos lados a la vez.** El grupo 20 (cobertura y cartera) no cambia, salvo que ahora tiene la tarjeta de
Ajustes.

### Volver a la versión anterior

El grupo 25 entra en `main` con **un solo commit de merge** («Grupo 25: …»), así que deshacerlo es **un comando**, sin reescribir la
historia ni perder nada:

```
git log --merges -1 --format=%h       # el hash del commit de merge del grupo 25
git revert -m 1 <ese hash>            # un commit nuevo que deja main como estaba antes
git push origin main
```

Probado en un clon descartable: tras el `revert`, `main` queda **idéntico** a como estaba antes del merge. Eso es `pre-grupo25` **más el commit
`c1aec2b`** (12/10, «Retira tres archivos que nadie cargaba»), que estaba solo en local y se sube en el mismo `push`.

- La etiqueta **`pre-grupo25`** marca lo que había en GitHub justo antes (`fe36cf4`). Sirve para comparar (`git diff pre-grupo25 main`) o para ver
  esa versión (`git switch --detach pre-grupo25`); **no hace falta moverla** para volver atrás.
- **No usar `git reset` ni `push --force` sobre `main`**: reescriben una historia que otros ya pueden haber bajado.
- Si luego se quiere volver a subir el grupo 25, hay que **deshacer el `revert`** (`git revert <hash del revert>`) y no volver a hacer el merge: git
  cree que esos cambios ya están y no los traería.
- **El backend vuelve a la vez.** Con el frontend viejo y el backend nuevo, la cuota por marca y los reportes del grupo 25 quedan sin rutas
  (sección 3).

---

## 4 · Después de subir: el recorrido

Con una cuenta de cada tipo (las claves las pasa quien coordina; los casos de cada módulo están en su documento
`respuesta-*.md`, sección «Para recorrerlo contra bdnava08»):

| cuenta | qué mirar |
|---|---|
| **Especialista** (229) | el menú trae **siete** módulos (marcas, cuota, reportes, cobertura, ajustes, vendedor del mes, cotización) y **ni factura ni promoción ni programador**; cada pantalla carga con datos; el numerito de Ajustes coincide con «Recibidas → Pendientes» |
| **Jefatura** (071) | el mismo menú; el filtro por especialista en Reportes, Cobertura y Vendedor del mes; el panel de su familia en Marcas |
| **Sin marcas** (270) | cada pantalla dice que no hay marcas y ofrece ir a Marcas, sin errores |
| **Vendedor del grupo 20** (246 o 196) | el menú trae **Ajustes** y **no** marcas, reportes, cobertura ni vendedor del mes; «Pedir ajuste» ofrece cotizaciones **y pedidos** |

**Solo lectura primero.** Enviar, confirmar y rechazar un ajuste **modifican documentos reales** y una solicitud respondida no se
puede volver a responder: se hacen con los documentos que prepara el backend.

---

## 5 · Lo que suma el grupo 34 (jefe de zona, 22/10/2026)

El jefe de zona se prueba y se sube igual, y se puede deshacer por separado: va en **su propio merge** (rama `zona34`). Lo que el frontend llama ahora, y que el backend
tiene que tener el mismo día:

| el frontend llama | para qué |
|---|---|
| `GET /v1/zona/avance` (con `?anno=&mes=` para un mes anterior) | el avance de todos los vendedores del grupo 20 |
| `GET /v1/zona/probabilidad?codusu=` | la probabilidad de uno |
| `GET /v1/vendedor` con tipo `ZONA` | el menú de tres módulos (`cotizacion`, `avance`, `probabilidad`) |
| `403 usuario sin acceso` en el login y en cualquier ruta | el 297: el frontend lo lleva al login |

Cuentas para el recorrido: el **126** (entra) y el **297** (`403`). Los casos están en [respuesta-zona.md](respuesta-zona.md), sección 3.

### Volver atrás del grupo 34

Entra en `main` con **su propio commit de merge** («Jefe de zona (grupo 34): …»), encima del del grupo 25, así que se deshace igual y por separado:

```
git log --merges -2 --format="%h %s"     # el de arriba es el del grupo 34
git revert -m 1 <hash del merge del grupo 34>
git push origin main
```

- La etiqueta **`pre-grupo34`** marca lo que había justo antes (el merge del grupo 25, `79dac94`).
- **Para deshacer el grupo 25 con el 34 ya subido, hay que deshacer primero el 34**: el 34 toca archivos que el 25 también tocó (el catálogo, el cliente
  HTTP, los estilos y el login), y revertir el 25 con el 34 encima da conflictos. En ese orden, cada `revert` sale limpio.

---

## 6 · Lo que este repositorio no dice

- **Cómo llega el código de `main` al servidor** (quién lo copia, desde dónde, a qué carpeta). Aquí solo está que `dev/` se excluye. El código
  se sube **empujando a `main`** (decisión del 22/10/2026), con el plan de vuelta atrás de la sección 3 y backend y frontend el mismo día.
- **La dirección del servidor de prueba y las claves** (las pasa quien coordina).
