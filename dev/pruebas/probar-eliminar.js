/**
 * Prueba de integracion de "Dar de baja una cotizacion".
 *
 * Recorre la pagina real: la lista filtrada, que no se abra ningun detalle, la
 * confirmacion con cliente e importe, y el aviso honesto de que la ruta todavia
 * no existe. Despues la activa en caliente y comprueba el camino completo.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const RAIZ = path.resolve(__dirname, "..", "..");

let fallos = 0;
function ok(etiqueta, real, esperado) {
    const bien = JSON.stringify(real) === JSON.stringify(esperado);
    if (!bien) fallos++;
    console.log(`${bien ? "  ok  " : " FALLA"} ${etiqueta}`);
    if (!bien) console.log(`         esperado: ${JSON.stringify(esperado)}\n         real:     ${JSON.stringify(real)}`);
}

const llamadas = [];
let fallaBaja = null;
let sinPermisoDelete = false;

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo });

    const r = (obj, status) => Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });

    if (url.includes("/vendedor")) {
        return r({ status: "ok", codigo: 0, data: { cotizacion: "x" }, nombre: "JUAN" });
    }

    if (url.includes("/lista/cotisxdia")) {
        /* Renumerado: 4 MONEDA, 5 registrado, 6 estado, 7 editable.
           La tercera esta APROBADA: se rotula "cotizado" igual que la
           primera, y solo el 7 las distingue. */
        return r({
            0: { 0: "2026/10/02", 1: "009-00971087", 2: "SERVICIOS INTERNET S.A.C.",
                 3: 1645.01, 4: "S", 5: "2026-10-02 13:57:38", 6: "cotizado",  7: 1 },
            1: { 0: "2026/10/02", 1: "009-00971000", 2: "YA FACTURADA S.A.C.",
                 3: 500.00,  4: "D", 5: "2026-10-02 10:00:00", 6: "facturado", 7: 0 },
            2: { 0: "2026/10/02", 1: "009-00969917", 2: "APROBADA S.A.C.",
                 3: 450.00,  4: "D", 5: "2026-10-02 10:05:11", 6: "cotizado",  7: 0 }
        });
    }

    if (url.includes("/cotizacion/eliminar")) {
        if (fallaBaja) return r(fallaBaja.cuerpo, fallaBaja.status);
        return r({ status: "ok", codigo: 0 });
    }

    if (url.includes("/cotizacion")) {
        return r({ status: "ok", codigo: 0, data: sinPermisoDelete ? ["crear", "leer"] : ["delete"] });
    }
    return r({ msg: "no simulado: " + url }, 404);
}

function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar() {
    let html = leer("cotizacion/cotizacion_eliminar.html");
    html = html.replace(/<script src="https:\/\/[^"]*"><\/script>/g, "");
    html = html.replace(/<link[^>]*cdnjs[^>]*>/g, "");
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/cotizacion/cotizacion_eliminar.html",
        runScripts: "outside-only", pretendToBeVisual: true
    });

    const w = dom.window;
    w.fetch = (url, opciones) => responder(String(url), opciones);
    w.HTMLElement.prototype.scrollIntoView = function () {};

    // Para poder activar la ruta en caliente a mitad de la prueba.
    const fuentes = {};
    for (const rel of scripts) {
        fuentes[rel] = leer(rel);
        try { w.eval(fuentes[rel]); }
        catch (e) { console.log(`  FALLA  al cargar ${rel}: ${e.message}`); fallos++; }
    }
    return { w, doc: w.document, fuentes };
}

const pausa = (ms) => new Promise(r => setTimeout(r, ms));

function botonModal(doc, cual) {
    const b = doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    return cual === "confirmar" ? b[b.length - 1] : b[0];
}
function pulsarModal(doc, cual) {
    const b = botonModal(doc, cual);
    if (b) b.dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
}

(async function () {
    console.log("\n=== Dar de baja · flujo completo en la pagina real ===\n");

    const { w, doc, fuentes } = await montar();
    await pausa(80);

    console.log("— la lista —");
    ok("sin errores al cargar", fallos, 0);
    ok("pidio la lista", llamadas.some(l => l.url.includes("/lista/cotisxdia")), true);

    const filas = doc.querySelectorAll("#lista-cotis .cdk-articulo");
    ok("solo ofrece la abierta", filas.length, 1);
    /* En SOLES. Es la unica fila que esta pantalla llega a pintar —las otras
       dos las filtra `soloAbiertas`— y por tanto la unica que puede delatar
       que el mapa de posiciones se ha movido. Sin esto, renumerar el backend
       no rompia ninguna comprobacion aqui. */
    ok("con su moneda",
       doc.querySelector("#lista-cotis .cdk-articulo__importe").textContent.includes("S/"),
       true);
    ok("y no la facturada",
       doc.getElementById("lista-cotis").textContent.includes("YA FACTURADA"), false);
    /* La aprobada se rotula "cotizado" como la buena: solo la posicion 7 la
       distingue, y antes de tenerla se colaba. */
    ok("ni la aprobada",
       doc.getElementById("lista-cotis").textContent.includes("APROBADA"), false);

    /* Esta pantalla NO abre el detalle: no debe pedir /cotizacion/read nunca. */
    ok("no pide el detalle",
       llamadas.some(l => l.url.includes("/cotizacion/read")), false);

    console.log("\n— la accion va en un boton, no en la fila —");
    /* Dar de baja es irreversible: una fila pulsable entera se dispara sin
       querer en un movil. */
    ok("la fila no es pulsable",
       filas[0].tagName.toLowerCase() === "button", false);

    const accion = doc.querySelector("#lista-cotis .cdk-enlace-accion");
    ok("hay un boton de dar de baja", !!accion, true);
    ok("y se ve como peligroso",
       accion.className.includes("cdk-enlace-accion--peligro"), true);

    console.log("\n— confirmar —");
    accion.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(60);

    const titulo = doc.querySelector(".cdk-modal__titulo");
    const mensaje = doc.querySelector(".cdk-modal__mensaje");
    ok("pide confirmacion", !!titulo, true);
    ok("con el numero", titulo.textContent.includes("009-00971087"), true);
    /* Con el cliente y el importe dentro: un "seguro?" con solo un codigo no
       dice si se esta tirando la correcta. */
    ok("con el cliente", mensaje.textContent.includes("SERVICIOS INTERNET"), true);
    ok("con el importe", mensaje.textContent.includes("1,645.01"), true);
    ok("y avisa de que no se deshace",
       mensaje.textContent.includes("no se puede deshacer"), true);

    console.log("\n— cancelar no hace nada —");
    pulsarModal(doc, "cancelar");
    await pausa(60);
    ok("no llamo al backend",
       llamadas.some(l => l.url.includes("/cotizacion/eliminar")), false);

    console.log("\n— dar de baja —");
    doc.querySelector("#lista-cotis .cdk-enlace-accion")
       .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    pulsarModal(doc, "confirmar");
    await pausa(100);

    const baja = llamadas.find(l => l.url.includes("/cotizacion/eliminar"));
    ok("ahora si llama al backend", !!baja, true);
    ok("manda ndocu", !!baja.cuerpo.ndocu, true);
    /* Con su serie: un numero suelto es ambiguo entre 009- y 098-. */
    ok("con su serie", /^\d{3}-/.test(baja.cuerpo.ndocu), true);

    const recargas = llamadas.filter(l => l.url.includes("/lista/cotisxdia")).length;
    ok("recarga la lista despues", recargas >= 2, true);

    console.log("\n— si el backend rechaza —");
    fallaBaja = { status: 409, cuerpo: { status: "coti no anulable", codigo: 3,
        msg: "la cotizacion ya fue facturada o convertida en pedido; no se puede dar de baja" } };

    doc.querySelector("#lista-cotis .cdk-enlace-accion")
       .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    pulsarModal(doc, "confirmar");
    await pausa(100);

    ok("muestra el mensaje del backend",
       doc.querySelector(".cdk-modal__mensaje").textContent.includes("ya fue facturada"), true);
    pulsarModal(doc, "confirmar");
    await pausa(40);

    console.log("\n— si esta aprobada —");
    // El msg literal del backend, de docs/baja-cotizacion.md.
    fallaBaja = { status: 409, cuerpo: { status: "coti aprobada", codigo: 3,
        msg: "la cotizacion ya fue aprobada; hay que desaprobarla primero para poder darla de baja" } };

    doc.querySelector("#lista-cotis .cdk-enlace-accion")
       .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    pulsarModal(doc, "confirmar");
    await pausa(100);

    /* No basta con decir que fallo: el vendedor tiene que saber QUE HACER, y
       desaprobarla no se hace desde aqui. */
    ok("avisa que esta aprobada",
       doc.querySelector(".cdk-modal__titulo").textContent.includes("aprobada"), true);
    /* El mensaje sale del backend, que ya dice que hay que desaprobarla: la
       pantalla no lo reescribe, solo le pone el titulo que corresponde. */
    ok("y explica que hay que desaprobarla",
       doc.querySelector(".cdk-modal__mensaje").textContent.includes("desaprobarla"), true);

    /* ------------------------------------------------------------------
     * Un vendedor cuyo grupo no puede dar de baja: 22 de los 27 de hoy.
     * GET /cotizacion no le devuelve `delete`, asi que la pantalla no debe
     * ofrecerle nada en vez de dejarle llegar hasta el 403.
     * ------------------------------------------------------------------ */
    console.log("\n— un grupo sin permiso —");
    sinPermisoDelete = true;
    const sin = await montar();
    await pausa(120);

    const zona = sin.doc.getElementById("lista-cotis");
    ok("no ofrece ninguna cotizacion",
       sin.doc.querySelectorAll("#lista-cotis .cdk-enlace-accion").length, 0);
    ok("y explica por que",
       zona.textContent.includes("no tiene permiso"), true);
    ok("sin boton de reintentar",
       zona.textContent.includes("Reintentar"), false);
    /* Buscar por numero tampoco serviria: lleva al mismo 403. */
    ok("esconde la busqueda por numero",
       sin.doc.querySelector("#form-buscar").closest("details").classList.contains("hidden"), true);

    console.log(fallos === 0
        ? `\nTodo correcto. ${llamadas.length} llamadas al backend.\n`
        : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});
