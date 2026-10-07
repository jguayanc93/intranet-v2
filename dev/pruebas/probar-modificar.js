/**
 * Prueba de integracion de "Modificar cotizacion".
 *
 * Carga la pagina real con sus scripts en jsdom y la recorre: la lista filtrada,
 * abrir una, cambiar una cantidad, quitar una linea, agregar un producto y
 * guardar. Comprueba ademas que lo que viaja a /cotizacion/update conserva el
 * formato de 22 posiciones que el backend espera.
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
let fallaUpdate = null;

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo });

    const r = (obj, status) => Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });

    if (url.includes("/vendedor")) {
        return r({ status: "ok", codigo: 0, data: { cotizacion: "x" }, nombre: "JUAN", tipo: "ESPECIALISTA" });
    }

    if (url.includes("/lista/cotisxdia")) {
        // 0 fecha, 1 ndocu, 2 cliente, 3 total, 4 MONEDA, 5 registrado, 6 estado
        return r({
            0: { 0: "2026/10/02", 1: "009-00971087", 2: "SERVICIOS INTERNET S.A.C.",
                 3: 1645.01, 4: "D", 5: "2026-10-02 13:57:38", 6: "cotizado" },
            1: { 0: "2026/10/02", 1: "009-00971000", 2: "YA FACTURADA S.A.C.",
                 3: 500.00,  4: "D", 5: "2026-10-02 10:00:00", 6: "facturado" }
        });
    }

    if (url.includes("/cotizacion/read")) {
        const linea = (codigo, descr, cant, precio, dscto) => ({
            0: "F", 1: "2026-10-02T00:00:00.000Z", 2: "31", 3: "009-00971087",
            4: "C12171", 5: 3.437, 6: "D", 7: "D", 8: "S", 9: "item",
            10: codigo, 11: "PN-" + codigo, 12: "HEWL", 13: "UND", 14: descr,
            15: cant, 16: precio, 17: Math.round(precio * (1 - dscto / 100) * cant * 100) / 100,
            18: dscto, 19: 0, 20: "01", 21: precio * 0.8, 22: "S",
            23: "SERVICIOS INTERNET S.A.C.", 24: "JR. PABLO BERMUDEZ 150", 25: "EDA RIVERA"
        });
        /* Dos productos y tres lineas de promocion. Los DOS descuentos comparten
           el codigo 0303-010001, que es lo que hay en los datos reales. */
        const promo = (codigo, descr, cant, precio, importe) => ({
            0: "F", 1: "2026-10-02T00:00:00.000Z", 2: "31", 3: "009-00971087",
            4: "C12171", 5: 3.437, 6: "D", 7: "D", 8: "N", 9: "item",
            10: codigo, 11: "DS00", 12: "", 13: "", 14: descr,
            15: cant, 16: precio, 17: importe, 18: 0, 19: 0, 20: "01", 21: 0, 22: "N",
            23: "SERVICIOS INTERNET S.A.C.", 24: "JR. PABLO BERMUDEZ 150", 25: "EDA RIVERA"
        });

        return r({
            0: linea("0505-012610", "TONER TN-450 NEGRO", 2, 89.90, 5),
            1: linea("0110-004422", "MOUSE M170 NEGRO", 3, 39.00, 0),
            2: promo("0303-010001", "DSCTO/PROM: EPSON SETIEMBRE", 1, -15.56, -15.56),
            3: promo("0303-010001", "DSCTO/PROM: BROTHER OCTUBRE", 1, -8.40, -8.40),
            4: promo("0301-020793", "GRATIS/PROM: POLO EPSON MANGA CORTA", 2, 0, 0)
        });
    }

    if (url.includes("/producto/buscar")) {
        return r({ 0: { 0: "0210-009911", 1: "MEMORIA USB 64GB", 2: 22, 3: 0, 4: 15, 5: 18.90, 6: 4 } });
    }

    if (url.includes("/producto/encontrado")) {
        return r({ 0: "S", 1: "item", 2: "0210-009911", 3: "PN-009911", 4: "KINGSTON",
                   5: "UND", 6: "MEMORIA USB 64GB", 7: null, 8: 18.90, 9: 10, 10: 14.75, 11: "S" });
    }

    if (url.includes("/cotizacion/update")) {
        if (fallaUpdate) return r(fallaUpdate.cuerpo, fallaUpdate.status);
        return r({ status: "ok", codigo: 0, lineas: Object.keys(cuerpo.item || {}).length });
    }

    if (url.includes("/cotizacion")) return r({ status: "ok", codigo: 0, data: ["crear", "update"] });
    return r({ msg: "no simulado: " + url }, 404);
}

function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar() {
    let html = leer("cotizacion/cotizacion_modificar.html");
    html = html.replace(/<script src="https:\/\/[^"]*"><\/script>/g, "");
    html = html.replace(/<link[^>]*cdnjs[^>]*>/g, "");
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/cotizacion/cotizacion_modificar.html",
        runScripts: "outside-only", pretendToBeVisual: true
    });

    const w = dom.window;
    w.fetch = (url, opciones) => responder(String(url), opciones);
    w.HTMLElement.prototype.scrollIntoView = function () {};

    for (const rel of scripts) {
        try { w.eval(leer(rel)); }
        catch (e) { console.log(`  FALLA  al cargar ${rel}: ${e.message}`); fallos++; }
    }
    return { w, doc: w.document };
}

const pausa = (ms) => new Promise(r => setTimeout(r, ms));
const pulsar = (doc, id) => doc.getElementById(id)
    .dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));

/** Acepta el CDK.modal que esté abierto. */
function aceptarModal(doc) {
    const botones = doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    const confirmar = botones[botones.length - 1];
    if (confirmar) confirmar.dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
}

(async function () {
    console.log("\n=== Modificar cotizacion · flujo completo en la pagina real ===\n");

    const { w, doc } = await montar();
    await pausa(80);

    console.log("— la lista, filtrada —");
    ok("sin errores al cargar", fallos, 0);
    ok("pidio la lista", llamadas.some(l => l.url.includes("/lista/cotisxdia")), true);

    const filas = doc.querySelectorAll("#lista-cotis .cdk-articulo");
    ok("solo ofrece la modificable", filas.length, 1);
    ok("y no la facturada",
       doc.getElementById("lista-cotis").textContent.includes("YA FACTURADA"), false);

    console.log("\n— abrir —");
    filas[0].dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(120);

    ok("oculto la lista", doc.getElementById("seccion-elegir").classList.contains("hidden"), true);
    /* Solo los PRODUCTOS son editables. Las promociones van aparte: ni se
       tocan ni se guardan. */
    ok("solo los productos son editables",
       doc.querySelectorAll("#aqui-nuevos .cdk-articulo").length, 2);

    const zonaPromos = doc.getElementById("promos-de-la-coti");
    ok("muestra las promociones", zonaPromos.classList.contains("hidden"), false);
    /* Las TRES, no dos: los dos descuentos comparten codigo y agruparlas por
       codigo habria perdido una. */
    ok("las tres, sin perder ninguna",
       zonaPromos.querySelectorAll(".cdk-articulo").length, 3);
    ok("avisa de que se pierden",
       zonaPromos.textContent.includes("se retiran"), true);
    ok("muestra el cliente",
       doc.getElementById("datos-cliente").textContent.includes("SERVICIOS INTERNET"), true);
    ok("guardar empieza deshabilitado", doc.getElementById("crear-modificacion").disabled, true);

    console.log("\n— cambiar una cantidad —");
    const cambiar = doc.querySelectorAll("#aqui-nuevos .cdk-enlace-accion")[0];
    cambiar.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(50);

    ok("abre el panel", doc.getElementById("modal-cantidad").classList.contains("hidden"), false);
    ok("trae la cantidad actual", doc.getElementById("cantidad-valor").value, "2");

    pulsar(doc, "cantidad-mas");
    pulsar(doc, "btn-confirmar-cantidad");
    await pausa(60);

    ok("cerro el panel", doc.getElementById("modal-cantidad").classList.contains("hidden"), true);
    ok("guardar se habilito", doc.getElementById("crear-modificacion").disabled, false);
    ok("la linea dice 3 UND",
       doc.querySelector("#aqui-nuevos .cdk-articulo__detalle").textContent.trim(), "3 UND");

    console.log("\n— agregar un producto —");
    pulsar(doc, "cotimodificar-buscarnuevoproducto");
    const campo = doc.getElementById("producto");
    campo.value = "MEMORIA";
    campo.dispatchEvent(new w.Event("input", { bubbles: true }));
    await pausa(600);

    const hallado = doc.querySelector("#recorrer-productos .cdk-articulo");
    ok("encontro el producto", !!hallado, true);
    ok("busco SIN letra",
       llamadas.find(l => l.url.includes("/producto/buscar")).cuerpo.letra, undefined);

    hallado.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(50);
    pulsar(doc, "btn-confirmar-cantidad");
    await pausa(120);

    const enc = llamadas.find(l => l.url.includes("/producto/encontrado"));
    ok("pidio el precio del cliente", !!enc, true);
    ok("mandando la letra", enc.cuerpo.cctl, "F");
    ok("y el codigo de cliente", enc.cuerpo.ccli, "C12171");
    ok("ahora son tres lineas", doc.querySelectorAll("#aqui-nuevos .cdk-articulo").length, 3);

    console.log("\n— quitar una linea —");
    const quitar = doc.querySelectorAll("#aqui-nuevos .cdk-enlace-accion--peligro")[0];
    quitar.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(50);
    aceptarModal(doc);
    await pausa(60);

    ok("quedan dos lineas", doc.querySelectorAll("#aqui-nuevos .cdk-articulo").length, 2);

    console.log("\n— guardar —");
    pulsar(doc, "crear-modificacion");
    await pausa(60);

    /* Con promociones de por medio, guardar pide confirmacion: es el momento en
       que la perdida se vuelve irreversible. */
    const aviso = doc.querySelector(".cdk-modal__titulo");
    ok("pide confirmar antes de perderlas",
       aviso && aviso.textContent.indexOf("perder") >= 0, true);
    ok("y dice que hay que volver a aplicarlas",
       doc.querySelector(".cdk-modal__mensaje").textContent.includes("módulo de promociones"), true);

    aceptarModal(doc);
    await pausa(150);

    const update = llamadas.find(l => l.url.includes("/cotizacion/update"));
    ok("llamo a update", !!update, true);
    ok("manda el objeto item", typeof update.cuerpo.item, "object");
    ok("con dos lineas", Object.keys(update.cuerpo.item).length, 2);
    /* Las promociones NO viajan: el backend reescribe el detalle con lo que se
       le mande, asi que mandarlas seria conservarlas a medias. */
    ok("sin ninguna linea de promocion",
       Object.keys(update.cuerpo.item).some((c) => c.indexOf("0303-") === 0), false);

    /* EL FORMATO ES LO QUE NO PUEDE CAMBIAR: 22 posiciones, las de
       /cotizacion/read saltandose la 0. */
    const fila = update.cuerpo.item["0210-009911"];
    ok("22 posiciones", fila.length, 22);
    ok("pos 2 es el documento",  fila[2], "009-00971087");
    ok("pos 3 es el cliente",    fila[3], "C12171");
    ok("pos 9 es el codigo",     fila[9], "0210-009911");
    ok("pos 14 es la cantidad",  fila[14], 1);
    ok("pos 15 es el precio",    fila[15], 18.90);
    ok("pos 17 es el descuento", fila[17], 10);
    ok("pos 19 es el almacen",   fila[19], "01");

    // 18.90 con 10% = 17.01
    ok("pos 16 es el importe",   fila[16], 17.01);

    aceptarModal(doc);
    await pausa(80);
    ok("vuelve a la lista", doc.getElementById("seccion-elegir").classList.contains("hidden"), false);

    console.log("\n— una cotizacion aprobada —");
    fallaUpdate = { status: 409, cuerpo: { status: "coti no modificable", codigo: 3,
                                           msg: "la cotizacion ya fue aprobada" } };

    doc.querySelectorAll("#lista-cotis .cdk-articulo")[0]
       .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(120);
    doc.querySelectorAll("#aqui-nuevos .cdk-enlace-accion")[0]
       .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(50);
    pulsar(doc, "cantidad-mas");
    pulsar(doc, "btn-confirmar-cantidad");
    await pausa(60);
    pulsar(doc, "crear-modificacion");
    await pausa(60);
    // Primero sale la confirmacion por las promociones; se acepta y sigue.
    aceptarModal(doc);
    await pausa(150);

    const dialogo = doc.querySelector(".cdk-modal__titulo");
    ok("avisa que esta aprobada",
       dialogo && dialogo.textContent.includes("aprobada"), true);
    ok("y explica que se desaprueba fuera",
       doc.querySelector(".cdk-modal__mensaje").textContent.includes("fuera de esta pantalla"), true);
    ok("el trabajo no se pierde",
       doc.querySelectorAll("#aqui-nuevos .cdk-articulo").length, 2);

    console.log(fallos === 0
        ? `\nTodo correcto. ${llamadas.length} llamadas al backend.\n`
        : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});
