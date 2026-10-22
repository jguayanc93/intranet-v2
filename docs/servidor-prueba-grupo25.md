# Grupo 25 — Probar contra el servidor de prueba

Como hablar con el backend de prueba (base bdnava08) desde `http://127.0.0.1:8080`, y que
esperar en cada respuesta. Las cabeceras de los ejemplos son reales: salen del backend levantado
con la misma configuracion que tendra el servidor de prueba.

La **direccion del servidor** y las **claves de las cuentas de prueba** se las pasa quien coordina
con ustedes. Las cuentas y sus casos estan en [reportes-grupo25.md](reportes-grupo25.md) (seccion
6) y en [cuota-grupo25.md](cuota-grupo25.md) (seccion 6).

---

## 1 · Lo que tiene que cumplirse

| condicion | por que |
|---|---|
| El servidor de prueba tiene `CORS_ORIGENES_EXTRA=http://127.0.0.1:8080` | sin eso el navegador no deja leer ninguna respuesta. En produccion no se define |
| El servidor de prueba va por **https** | las cookies `cdk` y `tip` son `Secure`: por `http` el navegador las descarta |
| Su direccion esta **bajo `compudiskett.com.pe`** | las cookies se crean con `Domain=compudiskett.com.pe`; desde otro dominio el navegador las rechaza |
| Todas las llamadas llevan `credentials: 'include'` | sin eso las cookies no viajan |

```js
fetch(`${API}/v1/cuota/marcas`, { credentials: 'include' })

fetch(`${API}/v1/cuota/marcas/meta`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ codmar: '0008', monto: 50000 })
})
```

---

## 2 · Lo que devuelve el servidor

### Preflight de un `POST` con JSON

El navegador lo manda solo antes de cada `POST` con `Content-Type: application/json`.

```
OPTIONS /v1/cuota/marcas/meta
Origin: http://127.0.0.1:8080
Access-Control-Request-Method: POST
Access-Control-Request-Headers: content-type

HTTP 204
access-control-allow-origin: http://127.0.0.1:8080
access-control-allow-credentials: true
access-control-allow-methods: GET,POST
access-control-allow-headers: content-type
access-control-expose-headers: Content-Disposition
```

### Una llamada normal, con sesion

```
GET /v1/cuota/marcas
Origin: http://127.0.0.1:8080
Cookie: cdk=...; tip=...

HTTP 200
access-control-allow-origin: http://127.0.0.1:8080
access-control-allow-credentials: true
access-control-expose-headers: Content-Disposition
content-type: application/json; charset=utf-8
```

`Content-Disposition` esta expuesta: la pueden leer en las descargas de Excel de reportes.

### Como llegan las cookies

`POST /v1/login` crea `cdk` (la sesion) y redirige a `GET /v1/login/identificador`, que crea `tip`
(el tipo de vendedor). Asi llega `tip`:

```
GET /v1/login/identificador

HTTP 200
set-cookie: tip=s%3AESPECIALISTA.YbFK...; Max-Age=86400; Domain=compudiskett.com.pe; Path=/;
            Expires=Wed, 21 Oct 2026 19:36:24 GMT; HttpOnly; Secure; SameSite=None
```

Las dos duran 24 horas, son `HttpOnly` (la pantalla no las puede leer, solo enviarlas) y
`Secure` + `SameSite=None` (viajan entre dominios, pero solo por https).

---

## 3 · Como se ve cuando algo falla

| sintoma en el navegador | causa |
|---|---|
| `TypeError: Failed to fetch` y en la consola «blocked by CORS policy» | la pagina no se abre desde `http://127.0.0.1:8080`, o el servidor no tiene `CORS_ORIGENES_EXTRA`. El servidor si contesta, pero sin `access-control-allow-origin`, y el navegador no deja leer la respuesta |
| el login responde bien pero **todo** lo siguiente da `401 falsa galleta` | las cookies no se guardaron: el servidor va por `http`, o su direccion no esta bajo `compudiskett.com.pe`, o falta `credentials: 'include'` |
| `401 falsa galleta` solo en `/vendedor` o en `/cuota/mostrar` | falta `tip`: llamar a `GET /v1/login/identificador` y reintentar (lo que ya hacen) |

Ejemplo real de una llamada desde un origen no permitido (`http://localhost:5173`): el servidor
responde `200` pero **sin** `access-control-allow-origin`, asi que el navegador la bloquea:

```
HTTP 200
access-control-allow-credentials: true
access-control-expose-headers: Content-Disposition
content-type: application/json; charset=utf-8
```

Y sin cookie, con el origen correcto:

```
HTTP 401
access-control-allow-origin: http://127.0.0.1:8080
{ "status":"falsa galleta", "codigo":1, "msg":"la galleta no existe en el frasco" }
```
