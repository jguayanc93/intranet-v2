/**
 * Entorno de desarrollo local, temporal (vive en el scratchpad, no en el repo).
 *
 *   :8080  sirve el proyecto desde la RAIZ, que es como conviene servirlo
 *          tambien en local para que /core/... y /js/... se comporten igual
 *          que en produccion.
 *   :3000  simula la API, con el mismo contrato raro del backend real
 *          (un JSON que contiene un string JSON).
 *
 * Si levantas la API de verdad en el 3000, para este proceso antes.
 */
/**
 * dev/servidor.js — Servidor de desarrollo.
 *
 * Sirve el frontend tal cual, sin compilar nada, y levanta una API simulada que
 * responde con las formas del contrato real (ver docs/).
 *
 *     node dev/servidor.js
 *
 *   http://127.0.0.1:8080        desde este equipo
 *   http://<tu-ip>:8080          desde el celular, en la misma red
 *
 * Por que hace falta: abrir los .html con doble clic no sirve. Las rutas de los
 * scripts son absolutas -/core/cdk.js- y con file:// apuntan a la raiz del
 * disco. Ademas el navegador bloquea las peticiones desde file://.
 *
 * La API simulada escucha en el 3000 y el frontend la encuentra sola: cuando la
 * pagina se sirve en el 8080 desde una IP local, CDK.env vale "dev" y las rutas
 * apuntan ahi en vez de a produccion.
 *
 * ESTO NO SE DESPLIEGA. Es para desarrollar y para probar desde el telefono.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

/* La raiz sale de donde vive este archivo, no escrita a mano: asi funciona
   en cualquier equipo que clone el repositorio. */
const RAIZ = path.resolve(__dirname, "..");
const ORIGEN = "http://127.0.0.1:8080";

/* ===================== 1. Estatico ===================== */
const TIPOS = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png", ".jpg": "image/jpeg",
    ".svg": "image/svg+xml", ".ico": "image/x-icon"
};

http.createServer((pet, res) => {
    let ruta = decodeURIComponent(pet.url.split("?")[0]);
    if (ruta.endsWith("/")) ruta += "index.html";

    const destino = path.join(RAIZ, path.normalize(ruta).replace(/^(\.\.[/\\])+/, ""));
    if (!destino.startsWith(path.normalize(RAIZ))) return res.writeHead(403).end("prohibido");

    fs.readFile(destino, (err, datos) => {
        if (err) {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            return res.end("no encontrado: " + ruta);
        }
        res.writeHead(200, {
            "Content-Type": TIPOS[path.extname(destino).toLowerCase()] || "application/octet-stream",
            "Cache-Control": "no-store"
        });
        res.end(datos);
    });
}).listen(8080, "0.0.0.0", () => {
    // La IP de red es la que sirve para abrirlo desde el celular.
    const red = Object.values(require("os").networkInterfaces())
        .flat()
        .filter(i => i && i.family === "IPv4" && !i.internal)
        .map(i => i.address)[0] || "127.0.0.1";

    console.log(`[estatico] ${RAIZ}`);
    console.log(`           local    http://127.0.0.1:8080`);
    console.log(`           red      http://${red}:8080   <- desde el celular`);
    console.log(``);
    console.log(`           variantes paso 2  /dev/paso2-variantes.html`);
    console.log(`           variantes paso 3  /dev/paso3-variantes.html`);
    console.log(`           documento coti   /dev/documento-cotizacion.html`);
    console.log(`           variantes cliente /dev/cliente-variantes.html`);
    console.log(`           panel             /main.html`);
    console.log(`           demo shell        /dev/shell-demo.html`);
    console.log(`           diagnostico       /dev/diagnostico.html`);
});

/* ===================== 2. API simulada ===================== */

/* Lee el cuerpo JSON de una peticion y se lo pasa al manejador. Evita repetir
   el mismo on("data")/on("end") en cada ruta. */
function conCuerpo(pet, manejar) {
    let cuerpo = "";
    pet.on("data", (t) => { cuerpo += t; });
    pet.on("end", () => {
        let d = {};
        try { d = JSON.parse(cuerpo || "{}"); } catch (e) {}
        manejar(d);
    });
}

/* Correlativo de las cotizaciones creadas en esta sesion. */
let contadorCoti = 36;

/* La cuota del mes: null hasta que se registre. Se guarda en memoria para
   poder probar los dos estados sin reiniciar nada. */
let cuotaRegistrada = null;



// Cambia esto para probar otros escenarios (quita modulos, cambia el tipo...).
const USUARIO = { nombre: "Juan Carlos", grupo: "VENTAS-JEFES DE PROD", tipo: "ESPECIALISTA" };

const MODULOS = {
    cotizacion:  "Crear, consultar y modificar cotizaciones",
    pedido:      "Gestión de pedidos y flete",
    factura:     "Modificación de datos de facturas",
    promocion:   "Aplicar y quitar promociones",
    cuota:       "Registro y avance de tu cuota mensual",
    listas:      "Listados de cotizaciones, pedidos, facturas y clientes",
    programador: "Programación de entregas en almacén",
    reporte:     "Reportes de marcas, stock, tiempo y precios"
};

const ACCESOS = {
    "/v1/cotizacion":  ["crear", "leer", "update", "delete", "alm"],
    "/v1/pedido":      ["flete", "alm"],
    "/v1/factura":     ["despacho", "transporte", "atencion", "direccion", "vendedor", "observacion", "orden"],
    "/v1/promocion":   ["update", "delete cotizacion", "delete pedido"],
    "/v1/cuota":       ["crear", "leer"],
    "/v1/lista":       ["cotizacion", "pedido", "factura", "clientes"],
    "/v1/programador": ["entregar", "retirar"]
};

// El backend real devuelve un JSON cuyo contenido es un string JSON.
// Se replica para ejercitar el desempaquetado de CDK.http tal cual.
function responder(res, cuerpo, estado = 200) {
    res.writeHead(estado, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": ORIGEN,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
    });
    res.end(JSON.stringify(JSON.stringify(cuerpo)));
}

http.createServer((pet, res) => {
    const ruta = pet.url.split("?")[0];

    if (pet.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": ORIGEN,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
        });
        return res.end();
    }

    console.log(`[api] ${pet.method} ${ruta}`);

    // Login simulado: cualquier usuario entra salvo "malo", que sirve para
    // probar el camino de error sin tocar el backend real.
    if (ruta === "/v1/login") {
        let cuerpo = "";
        pet.on("data", t => { cuerpo += t; });
        pet.on("end", () => {
            if (/name="cuenta"[\s\S]{0,40}?malo/.test(cuerpo)) {
                return responder(res, { status: "no cdk user", msg: "usuario no registrado" }, 401);
            }
            responder(res, { msg: "sesion creada" });
        });
        return;
    }

    // Detalle de cotización: respuesta REAL del backend, capturada tal cual.
    // 16 líneas con la mezcla habitual: 13 productos, 2 descuentos de
    // promoción (importe negativo) y 1 obsequio (importe cero).
    /* Respuesta real de una cotizacion, con las posiciones 23, 24 y 25 que el
       backend agrego al final: razon social, direccion y ATTE. Con ellas sobra
       la llamada a /cliente/id. */
    if (ruta === "/v1/cotizacion/read") {
        return conCuerpo(pet, (d) => {
            /* Una cotizacion de otro vendedor: 403 con su propio msg. El backend
               no distingue "no existe" de "no es tuya" a proposito, para que la
               ruta no sirva de confirmador de numeros validos. Los que llevan
               999 se simulan como ajenos. */
            if (String(d.ncoti || "").indexOf("999") >= 0) {
                return responder(res, {
                    status: "coti desconocida", codigo: 3,
                    msg: "la cotizacion no existe o no pertenece a este vendedor"
                }, 403);
            }
            responder(res, JSON.parse(
                fs.readFileSync(path.join(__dirname, "cotizacion-ejemplo.json"), "utf8")
            ));
        });
    }

    if (ruta === "/v1/cotizacion/almacen") {
        return responder(res, { msg: "almacen actualizado" });
    }

    // Búsqueda de cliente. Respuesta real del backend: { n: {0: codigo, 1: razon social} }.
    // Se busca por razón social o por RUC (11 dígitos).
    if (ruta === "/v1/cliente/buscar") {
        const CLIENTES = [
            ["C07358", "PC SUMINISTROS DEL PERU S.A.C.",              "20548112233"],
            ["C08026", "HPC SUMINISTROS S.A.C.",                      "20601445566"],
            ["C10874", "PC SUMINISTROS & SISTEMAS INFORMATICOS S.A.C.", "20600828747"],
            ["C11389", "APC SUMINISTROS S.A.C.",                      "20487334455"],
            ["C12171", "DISTRIBUIDORA TECNOLOGICA ANDINA S.A.C.",     "20556998877"],
            ["C09044", "COMERCIAL INFORMATICA DEL SUR E.I.R.L.",      "20471223344"]
        ];

        let cuerpo = "";
        pet.on("data", t => { cuerpo += t; });
        pet.on("end", () => {
            let texto = "";
            try { texto = (JSON.parse(cuerpo || "{}").sugerencia || "").trim().toUpperCase(); } catch (e) {}

            const hallados = CLIENTES.filter(c =>
                /^\d{11}$/.test(texto) ? c[2] === texto : c[1].includes(texto)
            );

            const salida = {};
            // El backend puede devolver tambien el RUC en la busqueda.
            hallados.forEach((c, i) => { salida[i] = { 0: c[0], 1: c[1], 2: c[2] }; });
            responder(res, salida);
        });
        return;
    }

    // Busqueda de producto. Forma real del backend:
    //   0 codigo, 1 descripcion, 2 stock principal, 3 stock M&M,
    //   4 descuento MAXIMO permitido, 5 precio unitario, 6 stock Piura.
    // El precio depende de la letra del cliente, que llega en el cuerpo.
    if (ruta === "/v1/producto/buscar") {
        const CATALOGO = [
            // codigo, descripcion, princ, mym, dsctoMax, precio, piura
            ["0505-011055", "BOTELLA TINTA EPSON T664120-AL NEGRO PARA L200",    2401, 0,   2, 7.97, 0],
            ["0505-011060", "BOTELLA TINTA EPSON T664220-AL CIAN PARA L200",     1127, 0,   2, 7.97, 0],
            ["0505-011065", "BOTELLA TINTA EPSON T664320-AL MAGENTA PARA L200",   863, 0,   2, 7.97, 0],
            ["0505-011070", "BOTELLA TINTA EPSON T664420-AL YELLOW PARA L200",    601, 0,   2, 7.97, 0],
            ["0505-012610", "BOTELLA TINTA EPSON T544120-AL NEGRO PARA L3110",    150, 42,  2, 7.97, 18],
            ["0505-012924", "TINTA BROTHER BTD100BK BLACK DCP-T230/430W/436W",     12, 0,   1, 8.39, 0],
            // Casos limite a proposito, para probar el comportamiento:
            ["0505-099001", "TONER HP 105A NEGRO ORIGINAL (sin stock)",            0,  0,   3, 58.40, 0],
            ["0505-099002", "CABLE HDMI 2.0 3M (sin descuento permitido)",       340,  15,  0, 4.20, 0]
        ];

        let cuerpo = "";
        pet.on("data", t => { cuerpo += t; });
        pet.on("end", () => {
            let texto = "", letra = "";
            try {
                const d = JSON.parse(cuerpo || "{}");
                texto = (d.sugerencia || "").trim().toUpperCase();
                letra = d.letra || "";
            } catch (e) {}

            console.log(`      busqueda="${texto}" letra="${letra}"`);

            const hallados = texto
                ? CATALOGO.filter(p => p[1].toUpperCase().includes(texto) || p[0].includes(texto))
                : [];

            const salida = {};
            hallados.forEach((p, i) => {
                salida[i] = { 0: p[0], 1: p[1], 2: p[2], 3: p[3], 4: p[4], 5: p[5], 6: p[6] };
            });
            responder(res, salida);
        });
        return;
    }

    // Datos completos del cliente elegido, con la forma real del backend:
    // 0 codigo, 1 razon social, 2 RUC, 3 ?, 4 ?, 5 letra (decide el precio).
    if (ruta === "/v1/cliente/id") {
        let cuerpo = "";
        pet.on("data", t => { cuerpo += t; });
        pet.on("end", () => {
            let id = "C10874";
            try { id = JSON.parse(cuerpo || "{}").idcliente || id; } catch (e) {}

            const FICHAS = {
                "C07358": ["C07358", "PC SUMINISTROS DEL PERU S.A.C.",              "20548112233", "V0345", "14", "F"],
                "C08026": ["C08026", "HPC SUMINISTROS S.A.C.",                      "20601445566", "V0122", "30", "A"],
                "C10874": ["C10874", "PC SUMINISTROS & SISTEMAS INFORMATICOS S.A.C.", "20600828747", "V0345", "14", "F"],
                "C11389": ["C11389", "APC SUMINISTROS S.A.C.",                      "20487334455", "V0210", "7",  "B"],
                "C12171": ["C12171", "DISTRIBUIDORA TECNOLOGICA ANDINA S.A.C.",     "20556998877", "V0345", "30", "A"],
                "C09044": ["C09044", "COMERCIAL INFORMATICA DEL SUR E.I.R.L.",      "20471223344", "V0122", "0",  "C"]
            };

            const f = FICHAS[id];
            if (!f) return responder(res, {});
            responder(res, { 0: { 0: f[0], 1: f[1], 2: f[2], 3: f[3], 4: f[4], 5: f[5] } });
        });
        return;
    }

    /* -----------------------------------------------------------------
     * Pasos 3 y 4. Ya con el contrato real: docs/promociones.md y
     * docs/respuesta-crear-cotizacion.md.
     *
     * Todo va en el sobre { status, codigo, data }.
     * ----------------------------------------------------------------- */

    // Que promociones PODRIAN aplicar. Con el carrito vacio el backend real
    // responde 400 "ninguna promocion", no una lista vacia: es el caso que mas
    // facil se confunde con un fallo, asi que conviene poder provocarlo.
    if (ruta === "/v1/promocion/recolector") {
        return conCuerpo(pet, (d) => {
            const n = d.productos ? Object.keys(d.productos).length : 0;
            console.log(`      recolector: ${n} producto(s)`);

            if (n === 0) {
                return responder(res, { status: "ninguna promocion", codigo: 2, data: null }, 400);
            }
            responder(res, { status: "ok", codigo: 0, data: ["15112", "14656"] });
        });
    }

    /* El detalle evalua UNA promocion. Se simulan los dos desenlaces para poder
       ver las dos mitades de la pantalla:
         15112 -> aplica, descuento por unidades (el caso 2 del documento)
         14656 -> no alcanza, con cuanto falta */
    if (ruta === "/v1/promocion/detalle") {
        return conCuerpo(pet, (d) => {
            const idprom = String(d.codigo || "");
            const items = Object.values(d.productos || {});
            console.log(`      detalle: promo ${idprom}, ${items.length} producto(s)`);

            if (idprom === "14656") {
                return responder(res, {
                    status: "no aplica", codigo: 0, data: null,
                    motivo: "no_alcanza", faltante: 7, unidad: "unidades",
                    msg: "faltan 7 unidades para alcanzar la promocion"
                });
            }

            // Una entrada por producto que califica. Ojo: `tipo` y `descripcion`
            // conviven con los indices numericos, igual que en el backend real.
            const data = { tipo: ["descuento"], descripcion: "TCL PROMO REBATE MNT SEPT2026" };
            items.forEach((it, i) => {
                const cant = Number(it.cantidad) || 0;
                data[i] = {
                    codigo: idprom,
                    descripcion: "TCL PROMO REBATE MNT SEPT2026",
                    cantidad: cant,
                    // dsct 28.13 por unidad, sin IGV: el backend ya divide /1.18
                    montoDescuento: Math.round((cant * 28.13 / 1.18) * 100) / 100,
                    monedaDescuento: "D",
                    itemdescr: it.descripcion || "",
                    tipo: ["descuento"]
                };
            });

            responder(res, { status: "ok", codigo: 0, data: data });
        });
    }

    // Adjunta una promocion a la cotizacion ya creada. Exige el numero CON
    // serie: suelto responde "documento ambiguo", como el real.
    if (ruta === "/v1/promocion/acoplar") {
        return conCuerpo(pet, (d) => {
            const ndocu = String(d.ndocu || "");
            const nprom = String(d.nprom || "");
            console.log(`      acoplar: promo ${nprom} -> ${ndocu}`);

            if (!/^\d{3}-/.test(ndocu)) {
                return responder(res, {
                    status: "documento ambiguo", codigo: 2, data: null,
                    msg: "el numero de documento necesita su serie"
                }, 400);
            }
            responder(res, { status: "ok", codigo: 0, data: { ndocu: ndocu, nprom: nprom } });
        });
    }

    // Crear. Devuelve el ndocu CON serie, que es lo que encadena /acoplar.
    if (ruta === "/v1/cotizacion/pegar") {
        return conCuerpo(pet, (d) => {
            const items = Object.values(d.productos || {});
            console.log(`      crear: ${items.length} producto(s), moneda ${d.moneda}, cliente ${(d.cliente || [])[0] || "?"}`);

            if (!items.length) {
                return responder(res, {
                    status: "sin detalle", codigo: 2, data: null,
                    msg: "la cotizacion no tiene ninguna linea"
                }, 400);
            }

            // Importes en dolares, como los manda la pantalla.
            const tota = items.reduce((a, it) => a + (Number(it.preciosinIGV) || 0), 0);
            const toti = Math.round(tota * 0.18 * 100) / 100;

            contadorCoti++;
            responder(res, {
                status: "ok", codigo: 0,
                documento: "098-" + String(contadorCoti).padStart(8, "0"),
                lineas: items.length,
                totales: {
                    tota: Math.round(tota * 100) / 100,
                    toti: toti,
                    totn: Math.round((tota + toti) * 100) / 100
                }
            });
        });
    }

    /* Modulos del usuario. El mapa va en `data` y los datos de usuario FUERA
       del sobre, al mismo nivel que `status`, tal como quedo el backend. */
    if (ruta === "/v1/vendedor") {
        return responder(res, Object.assign(
            { status: "ok", codigo: 0, data: MODULOS },
            USUARIO
        ));
    }

    /* Repone la galleta `tip` leyendo solo `cdk`. Es la salida al desajuste de
       vigencias: `cdk` dura 24 h y `tip` solo 1, asi que el frontend la llama
       ante un 401 antes de dar la sesion por muerta.
       Con ?falla=1 responde 401 para probar el camino en que ya no hay nada
       que renovar. */
    /* Las cotizaciones del vendedor, con el contrato de docs/ver-cotizacion.md.
       Acepta un dia suelto o un rango, filtra sola por el vendedor de la
       galleta, y va ordenada por hora de registro, la ultima primero.
       Doble codificada, como la real. */
    /* Un producto con el precio que le toca a ESTE cliente. Doce posiciones que
       encajan con las de /cotizacion/read: 0 afectoIgv, 1 tipo, 2 codigo,
       3 partnumber, 4 marca, 5 unidad, 6 descripcion, 8 precio, 9 descuento,
       10 coste, 11 extra. */
    if (ruta === "/v1/producto/encontrado") {
        return conCuerpo(pet, (d) => {
            const codigo = String(d.sugerencia || "");
            console.log(`      encontrado: ${codigo} para ${d.ccli} letra ${d.cctl}`);

            const p = CATALOGO.find((x) => x[0] === codigo);
            if (!p) return responder(res, { status: "no existe", codigo: 2, data: null }, 400);

            return responder(res, {
                0: "S", 1: "item", 2: p[0], 3: "PN-" + p[0].slice(-6), 4: "GENERICA",
                5: "UND", 6: p[1], 7: null, 8: p[5], 9: p[4], 10: p[5] * 0.78, 11: "S"
            });
        });
    }

    // Guardar la modificacion. Responde 409 si la cotizacion esta aprobada.
    if (ruta === "/v1/cotizacion/update") {
        return conCuerpo(pet, (d) => {
            const n = d.item ? Object.keys(d.item).length : 0;
            console.log(`      update: ${n} linea(s)`);

            // El documento va en la posicion 2 de cualquier linea.
            const doc = n ? String(Object.values(d.item)[0][2] || "") : "";

            if (doc && doc.indexOf("999") >= 0) {
                return responder(res, {
                    status: "coti desconocida", codigo: 3,
                    msg: "la cotizacion no existe o no pertenece a este vendedor"
                }, 403);
            }
            if (doc && !/^\d{3}-/.test(doc)) {
                return responder(res, {
                    status: "documento ambiguo", codigo: 2,
                    msg: "el numero de documento necesita su serie"
                }, 400);
            }

            if (!n) {
                return responder(res, { status: "sin detalle", codigo: 2, data: null,
                                        msg: "la cotizacion no puede quedarse sin lineas" }, 400);
            }
            responder(res, { status: "ok", codigo: 0, lineas: n });
        });
    }

    /* Dar de baja. Llama por dentro a AnulaCotFac, el procedimiento del ERP:
       no borra, marca flag='*' y pone los importes a cero. Cada rechazo tiene
       su propio status. Ver docs/baja-cotizacion.md. */
    if (ruta === "/v1/cotizacion/eliminar") {
        return conCuerpo(pet, (d) => {
            const ndocu = String(d.ndocu || "");
            console.log(`      baja: ${ndocu}${d.motivo ? " (" + d.motivo + ")" : ""}`);

            const no = (status, msg, http) =>
                responder(res, { status, codigo: 3, data: null, msg }, http);

            if (!/^\d{3}-/.test(ndocu)) {
                return no("documento ambiguo",
                    "el numero de cotizacion debe incluir su serie, por ejemplo 009-00970435", 400);
            }
            if (ndocu.indexOf("999") >= 0) {
                return no("coti desconocida",
                    "la cotizacion no existe o no pertenece a este vendedor", 403);
            }
            if (ndocu.indexOf("969917") >= 0) {
                return no("coti aprobada",
                    "la cotizacion ya fue aprobada; hay que desaprobarla primero para poder darla de baja", 409);
            }
            if (ndocu.indexOf("970988") >= 0) {
                return no("coti no anulable",
                    "la cotizacion ya fue facturada o convertida en pedido; no se puede dar de baja", 409);
            }

            responder(res, {
                status: "ok", codigo: 0,
                documento: ndocu,
                motivo: d.motivo || "ANULADA DESDE INTRANET(01)"
            });
        });
    }

    /* Las listas del modulo Listas. Las de cotizacion comparten ruta con las
       pantallas de cotizacion. Las tres coinciden en las cuatro primeras
       posiciones y en ninguna mas: facturas mete el tipo de entrega y el tipo
       de documento en la 4 y la 5, y empuja su moneda a la 6. Ver
       docs/listas-modulo.md. */
    if (/^\/v1\/lista\/(cotis|facturas|pedidos)$/.test(ruta)) {
        return conCuerpo(pet, () => {
            const tipo = ruta.split("/").pop();
            console.log(`      lista completa: ${tipo}`);

            const f = (x) => x.toISOString().slice(0, 10).replace(/-/g, "/");
            const hoy = f(new Date());
            const ayer = f(new Date(Date.now() - 86400000));

            /* RENUMERADO. Las seis primeras son iguales en las tres:
                 0 fecha · 1 ndocu · 2 cliente · 3 total CON IGV
                 4 MONEDA · 5 registrado con hora
               Y luego, por cuantos modulos lo comparten:
                 6 estado · 7 editable · 8 tipo de entrega · 9 tipo de documento
               Donde no aplica va `null`, SIN correr las posiciones. */
            const MUESTRA = {
                cotis: [
                    { 0: hoy,  1: "009-00971087", 2: "SERVICIOS INTERNET Y C.O. S.A.C.",
                      3: 1645.01, 4: "D", 5: hoy + " 13:57:38", 6: "cotizado", 7: 1 },
                    { 0: ayer, 1: "009-00970988", 2: "DISTRIBUIDORA TECNOLOGICA ANDINA S.A.C.",
                      3: 3210.00, 4: "S", 5: ayer + " 09:40:22", 6: "cotizado", 7: 1 }
                ],
                /* La nota de despacho va en SOLES a proposito: es la fila que
                   delata a quien lea mal la moneda. */
                facturas: [
                    { 0: hoy,  1: "F009-0649171", 2: "KEYNERS COMPANY S.A.C.",
                      3: 881.04,  4: "S", 5: hoy + " 15:02:10",
                      6: null, 7: null, 8: "Provincia",  9: "N.DESPACHO" },
                    { 0: ayer, 1: "F009-0649088", 2: "SERVICIOS INTERNET Y C.O. S.A.C.",
                      3: 2410.75, 4: "D", 5: ayer + " 09:18:33",
                      6: null, 7: null, 8: "ventanilla", 9: "FACTURA" }
                ],
                /* Un pedido solo esta `aprobado` o `atendido`, y no trae
                   `editable`: la 7 llega null. */
                pedidos: [
                    { 0: hoy,  1: "099-00132184", 2: "INNOVA 2512 S.A.C.",
                      3: 144.05,  4: "S", 5: hoy + " 11:59:54",  6: "atendido", 7: null },
                    { 0: ayer, 1: "009-00772637", 2: "PC SUMINISTROS & SISTEMAS INFORMATICOS S.A.C.",
                      3: 1980.00, 4: "D", 5: ayer + " 16:44:02", 6: "aprobado", 7: null }
                ]
            };

            const salida = {};
            (MUESTRA[tipo] || []).forEach((c, i) => { salida[i] = c; });
            responder(res, salida);
        });
    }

    /* Las "por dia" de factura y pedido. Ya aceptan la fecha completa y un
       rango {desde,hasta}, filtran por el vendedor de la galleta y vienen
       ordenadas con la ultima primero. */
    if (/^\/v1\/lista\/(facturas|pedidos)xdia$/.test(ruta)) {
        return conCuerpo(pet, (d) => {
            console.log(`      lista por dia: ${ruta} (${d.dia || "?"})`);
            // Con una fecha cualquiera se devuelve vacio: es el caso que mas
            // cuesta ver y el que antes daba un 400.
            responder(res, {});
        });
    }

    /* ===============================================================
     * CUOTA
     *
     * /cuota/mostrar y /cuota/revisar son GET. El primero es en realidad un
     * direccionador que reenvia segun el tipo de vendedor de la galleta;
     * desde el navegador es una sola ruta. Ver docs/cuota.md.
     * ============================================================= */
    /* `/revisar` contesta «¿puedo registrar?» y nada mas. No trae el avance:
       para eso esta `/mostrar`. Se parecen en el nombre y confundirlas da el
       sintoma "registre la cuota y ahora no la puedo ver". */
    if (ruta === "/v1/cuota/revisar") {
        console.log(`      puede registrar: ${cuotaRegistrada ? "no, ya tiene" : "si"}`);
        return responder(res, cuotaRegistrada
            ? { status: "ok", codigo: 0, simple: "cuota existe",
                puedeRegistrar: false, yaRegistrada: true, monto: cuotaRegistrada }
            : { status: "ok", codigo: 0, simple: "registro permitido",
                puedeRegistrar: true, yaRegistrada: false, monto: null });
    }

    if (ruta === "/v1/cuota/mostrar") {
        console.log(`      cuota: ${cuotaRegistrada ? "registrada" : "sin registrar"}`);

        /* A jefatura, zona y hp la cuota no les toca: en toda la historia de
           la tabla de metas solo hay cuotas de COBERTURA y CARTERA. Responde
           200 con un campo propio, no un 404, para que la pantalla lo pueda
           explicar. Cambia `tipoDeVendedor` aqui para probarlo. */
        const tipoDeVendedor = "COBERTURA";
        if (!["COBERTURA", "CARTERA"].includes(tipoDeVendedor)) {
            return responder(res, {
                status: "cuota no corresponde", codigo: 0,
                msg: "tu tipo de vendedor no lleva cuota mensual", aplica: false
            });
        }

        /* Sin cuota registrada NO es un error: es un estado normal del mes.
           Antes esto era un 500 y el vendedor veia una pantalla rota. */
        if (!cuotaRegistrada) {
            return responder(res, {
                status: "cuota no existe", codigo: 0,
                msg: "todavia no registraste tu cuota de este mes",
                debeRegistrar: true,
                meta: 0, avance: 0, porcentaje: null
            });
        }

        const meta = cuotaRegistrada;
        const avance = 288420;
        const pct = (avance / meta) * 100;

        /* `mensaje` es una de las 61 frases, elegida por tramo y rotando con
           el dia del mes. Llega en el campo de siempre: no cambia nada. */
        const FRASES = {
            bajo:  ["esto recien empieza, como el primer episodio",
                    "que la fuerza te acompañe"],
            medio: ["ya se te ve el potencial de Super Saiyajin",
                    "mitad de camino, como Frodo en Rivendel"],
            alto:  ["cerca, pero cerca no cobra",
                    "la Genkidama ya esta cargada, solo falta lanzarla"],
            hecho: ["al infinito y mas alla",
                    "TU SI ERES VENDEDOR NO COMO EL DE TU COSTADO"]
        };
        const tramo = pct >= 100 ? "hecho" : pct >= 65 ? "alto" : pct >= 35 ? "medio" : "bajo";
        const dia = new Date().getDate();

        /* El avance va dentro de `data`, como las demas rutas del modulo.
           Antes cada una lo devolvia bajo un nombre distinto —`simple`,
           `multiple`, `estimado`— y la clave `simple` ademas significaba dos
           cosas segun la ruta. */
        responder(res, { status: "ok", codigo: 0, data: {
            debeRegistrar: false,
            meta, avance,
            // TEXTO ya formateado, con el simbolo. No es un numero.
            porcentaje: pct.toFixed(2) + " %",
            mensaje: FRASES[tramo][dia % FRASES[tramo].length],
            diastexto: dia > 15 ? "ya pasaste la mitad del mes"
                                : "aun tienes mas de la mitad de mes",

            // A · cuanto falta, en dolares
            falta: Number((meta - avance).toFixed(2)),

            // B · como va de ritmo contra su propio cierre habitual
            ritmo: {
                esperado: Number(((dia / 30) * 100).toFixed(1)),
                real: Number(pct.toFixed(1)),
                estado: pct < (dia / 30) * 100 ? "detras" : "adelante",
                cierreTipico: 85.8,
                historico: [
                    { periodo: "2026-09", porcentaje: 42.3 },
                    { periodo: "2026-07", porcentaje: 101.1 },
                    { periodo: "2026-06", porcentaje: 113.9 }
                ]
            },

            // C · lo que restan las notas de credito
            notas: { facturado: 543410, restado: 205047, porcentaje: 37.7, avisar: true },

            // D · a quien llamar
            reposicion: {
                total: 187514.34, clientes: 49,
                top: [
                    { codcli: "C01525", cliente: "MEMORY KINGS PERU S.A.C.",
                      productos: 97, vencido: 106570.07 },
                    { codcli: "C12171", cliente: "SERVICIOS INTERNET Y C.O. S.A.C.",
                      productos: 31, vencido: 48210.50 },
                    { codcli: "C10874", cliente: "PC SUMINISTROS & SISTEMAS INFORMATICOS S.A.C.",
                      productos: 18, vencido: 32733.77 }
                ]
            }
        }});
        return;
    }

    /* Una vez al mes, y lo hace cumplir el servidor. Antes era un INSERT a
       secas: un segundo envio metia una segunda fila con otra meta. */
    if (ruta === "/v1/cuota/update") {
        return conCuerpo(pet, (d) => {
            /* El campo se llama `fijado`. Mandarlo con otro nombre daba antes
               «el monto debe ser mayor que cero», que mandaba a buscar el
               fallo al formulario; ahora son dos mensajes distintos. */
            console.log(`      registrar cuota: ${d.fijado}`);

            if (d.fijado === undefined || d.fijado === null || d.fijado === "") {
                return responder(res, {
                    status: "cuota no enviada", codigo: 3, data: null,
                    msg: "el cuerpo no trae el campo `fijado`"
                }, 400);
            }

            const monto = Number(d.fijado);

            if (cuotaRegistrada) {
                return responder(res, {
                    status: "cuota ya registrada", codigo: 3, data: null,
                    msg: "ya registraste tu cuota de este mes; solo se puede una vez"
                }, 409);
            }
            if (!monto || monto <= 0 || isNaN(monto)) {
                return responder(res, {
                    status: "cuota invalida", codigo: 3, data: null,
                    msg: "el monto de la cuota debe ser un numero mayor que cero"
                }, 400);
            }

            cuotaRegistrada = monto;
            /* Lo que quedo guardado, no lo que mandaron. `objetivo` y
               `family` son los valores por defecto cuando no se mandan
               `porcentaje` ni `objetivo_especial`. */
            responder(res, {
                status: "ok", codigo: 0, permitido: true,
                cuota: monto, family: "06", objetivo: 0
            });
        });
    }

    /* ===============================================================
     * PROMOCION
     *
     * Dos rutas que el frontend usaba —/coti/buscar y /prom/verificar— NO
     * EXISTEN en el backend, asi que tampoco aqui. Para elegir la cotizacion
     * se usa /lista/cotisxdia, que ya esta mas abajo.
     * ============================================================= */

    // Una linea de promocion: posiciones 3 doc, 9 item, 11..19 lo demas.
    const linea = (doc, item, codi, marca, descr, cant, unit, dscto, imp) => ({
        3: doc, 9: item, 11: codi, 12: marca, 14: descr,
        15: cant, 16: unit, 18: dscto, 19: imp
    });

    const PROMOS = {
        // Cotizacion en dolares y abierta: le aplican dos promociones.
        "009-00971087": {
            moneda: "D",
            aplican: ["14656", "15024"],
            yaAplicada: ["15024"],          // una ya esta puesta
            puestas: [
                linea("009-00971087", "7", "0303-010001", "CK",
                      "DSCTO/PROM: TONER HP 2026 (CK)", 1, 0, 100, -42.50),
                linea("009-00971087", "8", "TOHPCF28", "HEWL",
                      "GRATIS/PROM: TONER HP CF283A (83A)", 2, 0, 100, 0)
            ]
        },
        // Abierta y en dolares, pero sin promociones que le toquen.
        "009-00971042": { moneda: "D", aplican: [], yaAplicada: [], puestas: [] },
        // En soles: las promociones no se le aplican, y eso NO es un error.
        "009-00970988": { moneda: "S", aplican: [], yaAplicada: [], puestas: [] }
    };

    // Lo que cada promocion pondria si se aplicara.
    const PREVIA = {
        "14656": [
            linea("", "", "TOHPCF28", "HEWL", "GRATIS/PROM: TONER HP CF283A (83A)", 2, 0, 100, 0),
            linea("", "", "0303-010001", "CK", "DSCTO/PROM: TONER HP 2026 (CK)", 1, 0, 100, -42.50)
        ],
        "15024": [
            linea("", "", "PAPBA475", "ATLA", "GRATIS/PROM: PAPEL BOND A4 75G", 1, 0, 100, 0)
        ]
    };

    if (ruta === "/v1/promocion/revisar") {
        return conCuerpo(pet, (d) => {
            const ncoti = String(d.ncoti || "");
            console.log(`      promos que aplican a: ${ncoti}`);

            const c = PROMOS[ncoti];
            if (!c) {
                return responder(res, {
                    status: "coti desconocida", codigo: 3, data: null,
                    msg: "la cotizacion no existe o no es tuya"
                }, 403);
            }
            // Una lista plana de idprom. Nada mas.
            responder(res, { status: "ok", codigo: 0, data: c.aplican });
        });
    }

    if (ruta === "/v1/promocion/mostrar") {
        return conCuerpo(pet, (d) => {
            const ncoti = String(d.ncoti || "");
            const nprom = String(d.nprom || "");
            console.log(`      previa de la promo ${nprom} sobre ${ncoti}`);

            const c = PROMOS[ncoti];
            if (!c) return responder(res, { status: "coti desconocida", codigo: 3 }, 403);

            if (c.yaAplicada.includes(nprom)) {
                return responder(res, { status: "promo ya aplicada", codigo: 0 });
            }

            const salida = {};
            (PREVIA[nprom] || []).forEach((l, i) => { salida[i] = l; });
            responder(res, salida);
        });
    }

    /* Recibe SOLO {ndocu, nprom}. Antes llegaban las lineas ya armadas y se
       insertaban tal cual, con lo que se podia meter cualquier producto a
       cualquier precio; por eso se reescribio. Los importes los calcula el
       servidor. */
    if (ruta === "/v1/promocion/acoplar") {
        return conCuerpo(pet, (d) => {
            const ndocu = String(d.ndocu || "");
            const nprom = String(d.nprom || "");
            console.log(`      acoplar promo ${nprom} a ${ndocu}`);

            const c = PROMOS[ndocu];
            if (!c) return responder(res, { status: "coti desconocida", codigo: 3,
                                            msg: "la cotizacion no existe o no es tuya" }, 403);
            if (c.yaAplicada.includes(nprom)) {
                return responder(res, { status: "promo ya aplicada", codigo: 3,
                                        msg: "esa promocion ya esta puesta" }, 409);
            }

            c.yaAplicada.push(nprom);
            (PREVIA[nprom] || []).forEach((l, i) => {
                c.puestas.push(Object.assign({}, l, { 3: ndocu, 9: String(90 + i) }));
            });

            responder(res, { status: "ok", codigo: 0, documento: ndocu, promocion: nprom });
        });
    }

    /* Cuatro situaciones distintas, que antes respondian lo mismo. Dos llegan
       con 200: la cotizacion esta bien, simplemente no hay nada que hacer. */
    if (ruta === "/v1/cotizacion/readprom") {
        return conCuerpo(pet, (d) => {
            const ncoti = String(d.ncoti || "");
            console.log(`      lineas con promocion de: ${ncoti}`);

            const c = PROMOS[ncoti];
            if (!c) {
                return responder(res, {
                    status: "coti desconocida", codigo: 3, data: null,
                    msg: "la cotizacion no existe o no es tuya"
                }, 403);
            }
            if (c.moneda === "S") {
                return responder(res, {
                    status: "coti en soles", codigo: 0, items: [],
                    msg: "las promociones solo se aplican a cotizaciones en dolares; esta va en soles"
                });
            }
            if (!c.puestas.length) {
                return responder(res, {
                    status: "promocion no tiene", codigo: 0, data: {},
                    msg: "esta cotizacion no tiene promociones aplicadas"
                });
            }

            const salida = {};
            c.puestas.forEach((l, i) => { salida[i] = l; });
            responder(res, salida);
        });
    }

    if (ruta === "/v1/promocion/eliminar") {
        return conCuerpo(pet, (d) => {
            const filas = Array.isArray(d.removeproms) ? d.removeproms : [];
            console.log(`      quitar ${filas.length} linea(s) de promocion`);

            if (!filas.length) {
                return responder(res, { status: "nada que quitar", codigo: 3, data: null,
                                        msg: "no se indico ninguna linea" }, 400);
            }

            const doc = String(filas[0][0] || "");
            const c = PROMOS[doc];
            if (!c) return responder(res, { status: "coti desconocida", codigo: 3,
                                            msg: "la cotizacion no existe o no es tuya" }, 403);

            // Solo se leen el documento [0] y el numero de item [1].
            const quitar = filas.map((f) => String(f[1]));
            const antes = c.puestas.length;
            c.puestas = c.puestas.filter((l) => !quitar.includes(String(l[9])));
            const removidas = antes - c.puestas.length;

            if (!removidas) {
                return responder(res, { status: "nada que quitar", codigo: 3, data: null,
                                        msg: "ninguna de esas lineas existe en la cotizacion" }, 409);
            }
            if (!c.puestas.length) c.yaAplicada.length = 0;

            responder(res, { status: "ok", codigo: 0, msg: "removido con exito",
                             documento: doc, removidas });
        });
    }

    /* ===============================================================
     * FACTURA
     *
     * Nueve rutas. Las SIETE de lectura por campo ya no existen —las
     * reemplaza /factura/campos— y llamarlas da 404, que es justo lo que hace
     * el backend. Ver docs/factura.md.
     * ============================================================= */
    const FACTURAS = {
        "F009-0649171": {
            cliente: "C13290", clienteNombre: "KEYNERS COMPANY S.A.C.",
            despacho:    { codigo: 3, texto: "Desp. Local (Lima)" },
            transporte:  { codigo: "T0001", texto: "COMPUDISKETT S.R.L." },
            // nombre | documento | telefono. El tercero suele venir vacio.
            atencion:    "CONTACTO DE EJEMPLO UNO|00000000|",
            direccion:   "JR. GENERAL JOSE CANTERAC 545 - LIMA - JESUS MARIA",
            vendedor:    { codigo: "V0235", texto: "WILLIAM MELENDEZ HUAMAN" },
            observacion: "",
            orden:       ""
        },
        "B007-0011350": {
            cliente: "C12171", clienteNombre: "SERVICIOS INTERNET Y C.O. S.A.C.",
            despacho:    { codigo: 4, texto: "Desp. Provincia" },
            transporte:  { codigo: "T0042", texto: "SHALOM EMPRESARIAL S.A.C." },
            // Con telefono: el 1 % de las facturas lo trae.
            atencion:    "CONTACTO DE EJEMPLO DOS|00000000|900000000",
            direccion:   "AV. LA MARINA 234 - LIMA - SAN MIGUEL",
            vendedor:    { codigo: "V0361", texto: "JUAN CARLOS QUISPE" },
            observacion: "ENTREGAR EN RECEPCION",
            orden:       "OC-2026-1182"
        }
    };

    /* Quien pregunta es ejecutivo: puede todo menos reasignar la factura a
       otro vendedor, que paso a ser solo del grupo 34. */
    const PUEDE = {
        despacho: true, transporte: true, atencion: true, direccion: true,
        vendedor: false, observacion: true, orden: true
    };

    /* Las dos formas conviven: clave numerica o nombre. El nombre es el
       mismo en los tres sitios desde que se unifico `transporte`. */
    const CLAVES = {
        1: "despacho", 2: "transporte", 3: "atencion", 4: "direccion",
        5: "vendedor", 6: "observacion", 7: "orden"
    };

    const DESPACHOS = [["1", "Desp.Ventanilla"], ["3", "Desp. Local (Lima)"], ["4", "Desp. Provincia"]];

    const TRANSPORTISTAS = [
        ["T0001", "COMPUDISKETT S.R.L."], ["T0042", "SHALOM EMPRESARIAL S.A.C."],
        ["T0103", "OLVA COURIER S.A.C."], ["T0210", "TRANSPORTES CRUZ DEL SUR S.A.C."],
        ["T0311", "MARVISUR E.I.R.L."], ["T0355", "TRANSPORTES LINEA S.A."],
        ["T0401", "SCHARFF INTERNATIONAL COURIER S.A."], ["T0455", "DHL EXPRESS PERU S.A.C."],
        /* Siete contienen "TRANS": con el tope de 5, dos se quedan fuera y la
           pantalla tiene que decirlo. Es el caso que el `total` resuelve. */
        ["T0501", "TRANSPORTES ITTSA S.A."], ["T0502", "TRANSPORTES PAKATNAMU S.A.C."],
        ["T0503", "TRANSPORTES RODRIGO CARRANZA S.A.C."], ["T0504", "TRANSPORTES CHICLAYO S.A."],
        ["T0505", "TRANSPORTES EL SOL E.I.R.L."]
    ];

    const VENDEDORES = [
        ["V0004", "CESAR CAMPOS AZNARAN"], ["V0008", "JOANNA COSSIO VELASQUEZ"],
        ["V0136", "LUIS ANGELES PAREDES"], ["V0235", "WILLIAM MELENDEZ HUAMAN"],
        ["V0343", "ROSA QUISPE MAMANI"], ["V0361", "JUAN CARLOS QUISPE"]
    ];

    // Atencion y direccion devuelven SOLO el texto, no [codigo, texto].
    const CONTACTOS = {
        C13290: ["CONTACTO DE EJEMPLO UNO|00000000|", "CONTACTO DE EJEMPLO TRES|00000000|"],
        C12171: ["CONTACTO DE EJEMPLO CUATRO|00000000|", "CONTACTO DE EJEMPLO CINCO|00000000|",
                 "ALMACEN CENTRAL||"]
    };
    const DIRECCIONES = {
        C13290: ["JR. GENERAL JOSE CANTERAC 545 - LIMA - JESUS MARIA",
                 "AV. ARENALES 1302 - LIMA - LINCE"],
        C12171: ["AV. LA MARINA 234 - LIMA - SAN MIGUEL",
                 "JR. LAMPA 1102 - LIMA - CERCADO DE LIMA",
                 "CAL. LOS NOGALES 88 - LIMA - SURQUILLO"]
    };

    /* Las rutas de opciones filtran con LIKE y devuelven TOP 5, mas un
       `total` que dice cuantas hay CON ESE FILTRO —no cuantas viajan—, para
       que la pantalla pueda decir "5 de 207". Direccion es la excepcion:
       llega entera y sin filtrar. */
    function opciones(filas, sugerencia, tope) {
        const t = String(sugerencia || "").trim().toUpperCase();
        let hallados = filas;
        if (t) {
            hallados = filas.filter((f) => {
                const texto = Array.isArray(f) ? f[1] : f;
                return String(texto).toUpperCase().includes(t);
            });
        }

        const cuantas = hallados.length;
        if (tope) hallados = hallados.slice(0, tope);

        const data = {};
        hallados.forEach((f, i) => {
            data[i] = Array.isArray(f) ? { 0: f[0], 1: f[1] } : { 0: f };
        });
        return { status: "ok", codigo: 0, total: cuantas, data };
    }

    if (ruta === "/v1/factura/campos") {
        return conCuerpo(pet, (d) => {
            const doc = String(d.doc || "");
            console.log(`      factura campos: ${doc || "(sin numero)"}`);

            const f = FACTURAS[doc];
            /* Un solo 403 para cuatro casos —no existe, no es suya, anulada,
               o ya tiene guia— a proposito: distinguirlos convertiria la ruta
               en un confirmador de numeros ajenos. */
            if (!f) {
                return responder(res, {
                    status: "factura desconocida", codigo: 3, data: null,
                    msg: "la factura no existe, no es tuya, esta anulada o ya tiene guia emitida"
                }, 403);
            }

            responder(res, {
                status: "ok", codigo: 0,
                data: Object.assign({ documento: doc }, f),
                puede: PUEDE
            });
        });
    }

    if (/^\/v1\/factura\/(despacho|transporte|atencion|direccion|vendedor)\/cambio$/.test(ruta)) {
        return conCuerpo(pet, (d) => {
            const campo = ruta.split("/")[3];
            console.log(`      opciones de ${campo}: "${d.sugerencia || ""}"`);

            if (campo === "despacho")   return responder(res, opciones(DESPACHOS, d.sugerencia, 0));
            if (campo === "transporte") return responder(res, opciones(TRANSPORTISTAS, d.sugerencia, 5));
            if (campo === "vendedor")   return responder(res, opciones(VENDEDORES, d.sugerencia, 5));

            /* Contactos y direcciones solo si el vendedor tiene alguna
               factura con ese cliente. Con un codcli ajeno la lista llega
               VACIA, no con error: es honesto y no confirma si existe. */
            if (campo === "atencion")   return responder(res, opciones(CONTACTOS[d.cli] || [], d.sugerencia, 5));
            // Direccion es el unico sin tope y sin filtro.
            return responder(res, opciones(DIRECCIONES[d.cli] || [], null, 0));
        });
    }

    if (ruta === "/v1/factura/cambiado") {
        return conCuerpo(pet, (d) => {
            const doc = String(d.doc || "");
            const f = FACTURAS[doc];

            const no = (status, msg, http) =>
                responder(res, { status, codigo: 3, data: null, msg }, http);

            // El campo puede venir por nombre o por su clave numerica.
            let nombre = d.campo || null;
            let valor = d.valor;
            if (!nombre) {
                for (const k of Object.keys(d)) {
                    if (CLAVES[k] !== undefined) { nombre = CLAVES[k]; valor = d[k]; break; }
                }
            }
            console.log(`      cambiar ${nombre} de ${doc} -> "${valor}"`);

            if (!nombre) return no("campo desconocido", "no se indico que campo cambiar", 400);
            if (!f) {
                return no("factura desconocida",
                          "la factura no existe, no es tuya, esta anulada o ya tiene guia emitida", 403);
            }
            if (PUEDE[nombre] !== true) {
                return no("sin permiso", "tu grupo no puede cambiar ese campo", 403);
            }

            if (f[nombre] && typeof f[nombre] === "object") f[nombre].codigo = valor;
            else f[nombre] = valor;

            /* Se devuelve lo que quedo EN LA BASE, releido, no lo que mandaron. */
            responder(res, {
                status: "ok", codigo: 0,
                documento: doc, campo: nombre,
                valor: f[nombre] && typeof f[nombre] === "object" ? f[nombre].codigo : f[nombre]
            });
        });
    }

    /* ===============================================================
     * PEDIDO
     *
     * 0 flag · 1 apro · 2 dias · 3 documento · 4 cliente · 5 item
     * 6 fabricante · 7 descripcion · 8 marca · 9 cantidad · 10 descuento
     * 11 precio unitario · 12 total de linea · 13 MONEDA
     *
     * `flag`: 0 aprobado · 1 atendido · '*' anulado.
     * `apro` toma cinco valores y nadie sabe que significan 2, 3 y 4, asi que
     * la pantalla no lo interpreta. Ver docs/pedido.md.
     * ============================================================= */
    const PEDIDOS = {
        // De provincia y por encima del minimo: el flete entra.
        "099-00773326": {
            flag: "0", cliente: "DISTRIBUIDORA AREQUIPA S.A.C.", moneda: "D",
            lineas: [
                ["TOHPCF28", "TONER HP CF283A (83A) MFP M127F NEGRO", "HEWL", 12, 0, 79.71, 956.52],
                ["BOEPT544", "BOTELLA TINTA EPSON T544120-AL NEGRO", "EPSO", 30, 5, 28.50, 855.00],
                ["PAPBA475", "PAPEL BOND A4 75G ATLAS (MILLAR)",     "ATLA", 10, 0, 13.63, 136.33]
            ]
        },
        // En soles y por debajo del minimo: responde cuanto falta.
        "099-00132184": {
            flag: "0", cliente: "INNOVA 2512 S.A.C.", moneda: "S",
            lineas: [
                ["CAHDMI20", "CABLE HDMI 2.0 DE 2 METROS", "GENE", 15, 0, 22.50, 337.50]
            ]
        },
        // Ya atendido: no se le toca ni el flete ni el almacen.
        "099-00999001": {
            flag: "1", cliente: "YA ATENDIDO S.A.C.", moneda: "D",
            lineas: [
                ["TOHPCE28", "TONER HP CE285A (85A) L.J. P1102 NEGRO", "HEWL", 2, 0, 83.13, 166.26]
            ]
        }
    };

    function lineasDe(numero) {
        const p = PEDIDOS[numero];
        if (!p) return null;

        const salida = {};
        p.lineas.forEach((l, i) => {
            salida[i] = {
                0: p.flag, 1: 1, 2: 3, 3: numero, 4: p.cliente, 5: i + 1,
                6: l[0], 7: l[1], 8: l[2], 9: l[3], 10: l[4], 11: l[5], 12: l[6],
                13: p.moneda
            };
        });
        return salida;
    }

    if (ruta === "/v1/pedido/mostrar") {
        return conCuerpo(pet, (d) => {
            const numero = String(d.npedi || "");
            console.log(`      pedido: ${numero || "(sin numero)"}`);

            const lineas = lineasDe(numero);
            /* Filtra por el vendedor de la galleta, asi que el de otro
               responde igual que uno inexistente. */
            if (!lineas) {
                return responder(res, {
                    status: "pedido desconocido", codigo: 3, data: null,
                    msg: "el pedido no existe o no pertenece a este vendedor"
                }, 400);
            }
            responder(res, lineas);
        });
    }

    /* El flete: 0,4 % del total SIN IGV, y el minimo se mide ahi tambien, no
       sobre el total que enseña la pantalla. El factor entre uno y otro es
       1,18 exacto. */
    if (ruta === "/v1/pedido/flete") {
        return conCuerpo(pet, (d) => {
            const numero = String(d.npedi || "");
            console.log(`      flete: ${numero || "(sin numero)"}`);

            const p = PEDIDOS[numero];
            const no = (status, msg, http) =>
                responder(res, { status, codigo: 3, data: null, msg }, http);

            if (!p) return no("pedido desconocido", "falta el numero de pedido o no es suyo", 400);
            if (p.flag !== "0") {
                return no("pedido no modificable",
                          "el pedido ya fue atendido o esta anulado", 409);
            }

            const sinIgv = p.lineas.reduce((s, l) => s + l[6], 0);
            const minimo = p.moneda === "S" ? 400 * 3.75 : 400;

            if (sinIgv < minimo) {
                return responder(res, {
                    status: "flete monto insuficiente", codigo: 3,
                    msg: "el pedido no alcanza el monto minimo para el flete de provincia",
                    moneda: p.moneda,
                    total: Number(sinIgv.toFixed(2)),
                    minimo: Number(minimo.toFixed(2)),
                    falta: Number((minimo - sinIgv).toFixed(2))
                }, 409);
            }

            const tota = Number((sinIgv * 0.996).toFixed(2));   // el 0,4 % de descuento
            const toti = Number((tota * 0.18).toFixed(2));

            responder(res, {
                status: "ok", codigo: 0,
                documento: numero,
                totales: { tota, toti, totn: Number((tota + toti).toFixed(2)) }
            });
        });
    }

    /* El almacen vive en la cabecera Y en cada linea: por eso la respuesta
       dice cuantas se tocaron. */
    if (ruta === "/v1/pedido/almacen") {
        return conCuerpo(pet, (d) => {
            const numero = String(d.npedi || "");
            const alm = String(d.alm || "");
            console.log(`      almacen de pedido: ${numero} -> ${alm}`);

            const p = PEDIDOS[numero];
            const no = (status, msg, http) =>
                responder(res, { status, codigo: 3, data: null, msg }, http);

            if (!p) return no("pedido desconocido", "falta el numero de pedido o no es suyo", 400);
            if (!["01", "08", "15", "16"].includes(alm)) {
                return no("almacen invalido", "ese almacen no existe o esta inactivo", 400);
            }
            if (p.flag !== "0") {
                return no("pedido no modificable",
                          "el pedido ya fue atendido o esta anulado", 409);
            }

            responder(res, {
                status: "ok", codigo: 0,
                documento: numero, almacen: alm, lineas: p.lineas.length
            });
        });
    }

    /* Los clientes del vendedor. Una sola ruta y un `tipo` que decide cual de
       las dos vistas devuelve — y que NO vale "asignados"/"libres": cualquier
       valor que no sea "cartera" o "cobertura" sale como lista vacia sin dar
       error, asi que el fallo no se ve.

       Las dos NO son complementarias: cartera son sus clientes asignados
       (todos, incluso con cero facturas) y cobertura es todo lo que facturo
       este mes, suyo o no. Un cliente suyo al que vendio sale en las dos.
       Ver docs/clientes.md. */
    if (ruta === "/v1/lista/clientes") {
        return conCuerpo(pet, (d) => {
            const tipo = String(d.tipo || "");
            console.log(`      clientes: ${tipo || "(sin tipo)"}`);

            // 0 codcli, 1 nomcli, 2 facturas del mes, 3 notas de credito
            const CARTERA = [
                ["C12171", "SERVICIOS INTERNET Y C.O. S.A.C.", 4, 1],
                ["C10874", "PC SUMINISTROS & SISTEMAS INFORMATICOS S.A.C.", 2, 0],
                // Un cliente suyo al que no le vendio este mes: la gracia de
                // la vista es justamente verlo.
                ["C11902", "DISTRIBUIDORA TECNOLOGICA ANDINA S.A.C.", 0, 0]
            ];
            /* Cobertura: TODO lo que facturo este mes. Son tres posiciones
               —no trae notas de credito— y se solapa con la cartera: C12171
               aparece aqui tambien porque es suyo Y le vendio. */
            const COBERTURA = [
                ["C12171", "SERVICIOS INTERNET Y C.O. S.A.C.", 4],
                ["C09988", "INNOVA 2512 S.A.C.", 2],
                ["C13540", "KEYNERS COMPANY S.A.C.", 1]
            ];

            const filas = tipo === "cartera" ? CARTERA
                        : tipo === "cobertura" ? COBERTURA
                        : [];

            const salida = {};
            filas.forEach((c, i) => { salida[i] = c; });
            responder(res, salida);
        });
    }

    /* El detalle de un cliente. Todo se mide SOLO sobre las ventas de este
       vendedor a este cliente, y el cliente tiene que ser suyo: si no, 403
       "cliente ajeno". Ver docs/clientes.md. */
    if (ruta === "/v1/lista/clientes/detalle") {
        return conCuerpo(pet, (d) => {
            const codcli = String(d.codcli || "");
            console.log(`      detalle de cliente: ${codcli || "(sin codigo)"}`);

            const hace = (n) => {
                const f = new Date();
                f.setHours(0, 0, 0, 0);
                f.setDate(f.getDate() - n);
                const p = (x) => String(x).padStart(2, "0");
                return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
            };

            /* `reponer` viene acotado a tres ciclos: un producto que lleva 20
               veces su ritmo sin pedirse no esta retrasado, esta muerto, y
               antes del tope copaba los diez primeros puestos. */
            const FICHAS = {
                C12171: {
                    mes: { total: 4820.50, moneda: "D", documentos: 3,
                           anterior: 3100.00, otrasMonedas: false },
                    reponer: [
                        { descripcion: "BOTELLA TINTA EPSON T544120-AL NEGRO",
                          cantidad: 6, cada: 45, ultima: hace(72), compras: 5 },
                        { descripcion: "TONER HP CF283A (83A) MFP M127F NEGRO",
                          cantidad: 2, cada: 38, ultima: hace(51), compras: 7 }
                    ],
                    top: [
                        { descripcion: "PAPEL BOND A4 75G ATLAS (MILLAR)",
                          cantidad: 120, importe: 1860.00, moneda: "D" },
                        { descripcion: "BOTELLA TINTA EPSON T544120-AL NEGRO",
                          cantidad: 60, importe: 1710.00, moneda: "D" }
                    ]
                },
                // Compro en las dos monedas: la cifra del mes es parcial.
                C10874: {
                    mes: { total: 0, moneda: "S", documentos: 0,
                           anterior: 2480.00, otrasMonedas: true },
                    reponer: [
                        { descripcion: "PAPEL BOND A4 75G ATLAS (MILLAR)",
                          cantidad: 20, cada: 21, ultima: hace(55), compras: 14 }
                    ],
                    top: [
                        { descripcion: "PAPEL BOND A4 75G ATLAS (MILLAR)",
                          cantidad: 140, importe: 2240.00, moneda: "S" }
                    ]
                }
            };

            const ficha = FICHAS[codcli];
            if (!ficha) {
                return responder(res, {
                    status: "cliente ajeno", codigo: 3, data: null,
                    msg: "este cliente no esta asignado a tu cartera ni lo has facturado"
                }, 403);
            }

            responder(res, { status: "ok", codigo: 0, data: ficha });
        });
    }

    if (ruta === "/v1/lista/cotisxdia") {
        return conCuerpo(pet, (d) => {
            const rango = !!(d.desde && d.hasta);
            console.log(`      lista: ${rango ? d.desde + ".." + d.hasta : d.dia || "hoy"}`);

            const f = (x) => x.toISOString().slice(0, 10).replace(/-/g, "/");
            const hoy = f(new Date());
            const ayer = f(new Date(Date.now() - 86400000));

            // 0 fecha, 1 ndocu, 2 cliente, 3 total CON IGV, 4 MONEDA, 5 registrado, 6 estado
            /* La posicion 7 es `editable`: 1 si sigue abierta Y SIN APROBAR.
               La tercera esta aprobada: se rotula "cotizado" igual que una
               normal, y sin este campo es imposible distinguirla. */
            const todas = [
                { 0: hoy,  1: "009-00971087", 2: "SERVICIOS INTERNET Y C.O. S.A.C.",
                  3: 1645.01, 4: "D", 5: hoy.replace(/\//g, "-") + " 13:57:38", 6: "cotizado",  7: 1 },
                { 0: hoy,  1: "009-00971042", 2: "PC SUMINISTROS & SISTEMAS INFORMATICOS S.A.C.",
                  3: 892.40,  4: "D", 5: hoy.replace(/\//g, "-") + " 11:12:04", 6: "cotizado",  7: 1 },
                { 0: hoy,  1: "009-00969917", 2: "APROBADA S.A.C. (rotulada cotizado)",
                  3: 450.00,  4: "D", 5: hoy.replace(/\//g, "-") + " 10:05:11", 6: "cotizado",  7: 0 },
                { 0: ayer, 1: "009-00970988", 2: "DISTRIBUIDORA TECNOLOGICA ANDINA S.A.C.",
                  3: 3210.00, 4: "S", 5: ayer.replace(/\//g, "-") + " 09:40:22", 6: "facturado", 7: 0 }
            ];

            const salida = {};
            todas.filter((c) => rango || c[0] === hoy)
                 .forEach((c, i) => { salida[i] = c; });

            // Sin cotizaciones es un objeto vacio, no un error.
            responder(res, salida);
        });
    }

    if (ruta === "/v1/login/identificador") {
        if (pet.url.indexOf("falla=1") >= 0) {
            return responder(res, { status: "falsa galleta", codigo: 3, data: null }, 401);
        }
        console.log("      identificador: repone tip");
        // Doble codificado, como el backend real en esta ruta.
        return responder(res, JSON.stringify({ correcto: "ESPECIALISTA" }));
    }

    if (ruta === "/v1/logout")    return responder(res, { msg: "sesion terminada" });
    if (ACCESOS[ruta])            return responder(res, { status: "ok", codigo: 0, data: ACCESOS[ruta] });

    responder(res, { msg: "endpoint no simulado: " + ruta }, 404);
}).listen(3000, "0.0.0.0", () => {
    console.log(`[api] simulada en http://127.0.0.1:3000/v1  (y en la IP de red)`);
});
