/**
 * Prueba de integracion de "Ver cotizacion".
 *
 * Carga la pagina real con sus scripts en jsdom y la recorre: lista del dia,
 * abrir una, el resumen, el documento para el cliente, y que el margen NO se
 * cuele en ese documento.
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

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo });

    const r = (obj, status) => Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });

    if (url.includes("/vendedor")) {
        return r({ status: "ok", codigo: 0, data: { cotizacion: "x" },
                   nombre: "FERNANDO UTANI ZUÑIGA", tipo: "ESPECIALISTA", tipoCambio: 3.437 });
    }

    if (url.includes("/lista/cotisxdia")) {
        // 0 fecha, 1 ndocu, 2 cliente, 3 total CON IGV, 4 MONEDA, 5 registrado, 6 estado
        const base = {
            0: { 0: "2026/10/02", 1: "009-00971087", 2: "SERVICIOS INTERNET Y C.O. S.A.C.",
                 3: 1645.01, 4: "D", 5: "2026-10-02 13:57:38", 6: "cotizado" }
        };
        // Un rango pide dos dias; un dia suelto, uno.
        if (cuerpo.desde) {
            base[1] = { 0: "2026/10/01", 1: "009-00970988", 2: "DISTRIBUIDORA ANDINA S.A.C.",
                        3: 3210.00, 4: "S", 5: "2026-10-01 09:12:04", 6: "facturado" };
        }
        return r(base);
    }

    if (url.includes("/cotizacion/read")) {
        // Una cotizacion que no es de este vendedor: 403 con su propio msg.
        if ((cuerpo.ncoti || "").indexOf("999") >= 0) {
            return r({ status: "coti desconocida", codigo: 3,
                       msg: "la cotizacion no existe o no pertenece a este vendedor" }, 403);
        }
        // 0 clase,1 fecha,2 tipo,3 ndocu,4 codcli,5 tc,6 moneda,7 monlin,8 igv,
        // 9 tipolinea,10 codigo,11 partnumber,12 marca,13 um,14 descr,
        // 15 cant,16 precio,17 importe,18 dscto,19 conIgv,20 alm,21 coste
        return r({
            0: { 0: "F", 1: "2026-10-02T00:00:00.000Z", 2: "31", 3: "009-00971087",
                 4: "C12171", 5: 3.437, 6: "D", 7: "D", 8: "S", 9: "item",
                 10: "0505-012610", 11: "TOHPCF28", 12: "HEWL", 13: "UND",
                 14: "TONER HP CF283A (83A) MFP M 127F NEGRO",
                 15: 1, 16: 79.71, 17: 75.72, 18: 5, 19: 89.35, 20: "01", 21: 60.00,
                 23: "SERVICIOS INTERNET Y C.O. S.A.C.",
                 24: "JR. PABLO BERMUDEZ NRO. 150 INT. 11C",
                 25: "EDA JOANA RIVERA ESPINOZA" }
        });
    }

    if (url.includes("/cliente/id")) {
        return r({ 0: { 0: "C12171", 1: "SERVICIOS INTERNET Y C.O. S.A.C.",
                        2: "20123053037", 3: "V0345", 4: "14", 5: "F" } });
    }

    if (url.includes("/cotizacion")) return r({ status: "ok", codigo: 0, data: ["crear", "leer"] });
    return r({ msg: "no simulado: " + url }, 404);
}

function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar() {
    let html = leer("cotizacion/cotizacion_observar.html");
    html = html.replace(/<script src="https:\/\/[^"]*"><\/script>/g, "");
    html = html.replace(/<link[^>]*cdnjs[^>]*>/g, "");
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/cotizacion/cotizacion_observar.html",
        runScripts: "outside-only", pretendToBeVisual: true
    });

    const w = dom.window;
    w.fetch = (url, opciones) => responder(String(url), opciones);
    w.print = () => { w.__imprimio = true; };
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

(async function () {
    console.log("\n=== Ver cotizacion · flujo completo en la pagina real ===\n");

    const { w, doc } = await montar();
    await pausa(80);

    console.log("— la lista del dia —");
    ok("sin errores al cargar", fallos, 0);
    ok("pidio la lista al entrar",
       llamadas.some(l => l.url.includes("/lista/cotisxdia")), true);
    ok("pidio un dia suelto",
       !!llamadas.find(l => l.url.includes("cotisxdia")).cuerpo.dia, true);

    const filas = doc.querySelectorAll("#lista-cotis .cdk-articulo");
    ok("pinto la cotizacion", filas.length, 1);
    ok("muestra al cliente",
       doc.querySelector("#lista-cotis .cdk-articulo__nombre").textContent,
       "SERVICIOS INTERNET Y C.O. S.A.C.");
    ok("y su monto con moneda",
       doc.querySelector("#lista-cotis .cdk-articulo__importe").textContent.includes("1,645.01"), true);

    console.log("\n— ampliar a 2 dias —");
    pulsar(doc, "btn-dos-dias");
    await pausa(80);
    const rango = llamadas.filter(l => l.url.includes("cotisxdia")).pop().cuerpo;
    ok("pidio un rango", !!(rango.desde && rango.hasta), true);
    ok("ahora son dos", doc.querySelectorAll("#lista-cotis .cdk-articulo").length, 2);
    /* "cotizado" no se marca -seria ruido en todas las filas-, pero la
       facturada si: es la que conviene distinguir. */
    ok("marca la facturada", doc.getElementById("lista-cotis").textContent.includes("facturado"), true);
    ok("no marca las cotizadas",
       doc.getElementById("lista-cotis").textContent.split("cotizado").length - 1, 0);

    console.log("\n— abrir una —");
    doc.querySelector("#lista-cotis .cdk-articulo")
       .dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(120);

    ok("oculto la lista",
       doc.getElementById("seccion-elegir").classList.contains("hidden"), true);
    ok("pidio el detalle",
       llamadas.some(l => l.url.includes("/cotizacion/read")), true);
    /* La razon social viene en la cabecera, asi que la segunda llamada sobra. */
    ok("YA NO pide /cliente/id",
       llamadas.some(l => l.url.includes("/cliente/id")), false);
    ok("el titulo lleva el numero",
       doc.getElementById("titulo-coti").textContent.includes("009-00971087"), true);

    console.log("\n— el resumen (interno) —");
    const resumen = doc.getElementById("contendor-final-final");
    ok("pinto la linea", resumen.querySelectorAll(".cdk-articulo").length, 1);
    ok("muestra el margen, que es interno",
       resumen.textContent.includes("Margen"), true);
    ok("el documento sigue oculto",
       doc.getElementById("lienzo-documento").classList.contains("hidden"), true);

    console.log("\n— el documento (para el cliente) —");
    pulsar(doc, "btn-vista-documento");
    await pausa(60);

    const lienzo = doc.getElementById("lienzo-documento");
    ok("se ve el documento", lienzo.classList.contains("hidden"), false);
    ok("y se oculto el resumen", resumen.classList.contains("hidden"), true);
    ok("aparecio el boton de PDF",
       doc.getElementById("btn-pdf").classList.contains("hidden"), false);

    const texto = lienzo.textContent;
    ok("lleva el numero",        texto.includes("009-00971087"), true);
    ok("la razon social",        texto.includes("SERVICIOS INTERNET Y C.O. S.A.C."), true);
    ok("la direccion",           texto.includes("JR. PABLO BERMUDEZ"), true);
    ok("el ATTE",                texto.includes("EDA JOANA RIVERA ESPINOZA"), true);
    ok("el vendedor",            texto.includes("FERNANDO UTANI ZUÑIGA"), true);
    ok("el emisor",              texto.includes("COMPUDISKETT"), true);
    ok("el precio de lista",     texto.includes("79.710"), true);
    ok("el precio con dscto",    texto.includes("75.720"), true);

    /* LO IMPORTANTE: el margen y el coste son internos y no pueden salir en el
       papel que se le manda al cliente. */
    ok("NO lleva el margen",     texto.includes("Margen"), false);
    ok("NO lleva el coste",      /\bCoste\b/.test(texto), false);
    ok("NO lleva el 60.00 del coste", texto.includes("60.00"), false);

    console.log("\n— guardar PDF —");
    pulsar(doc, "btn-pdf");
    await pausa(30);
    ok("llamo a imprimir", w.__imprimio, true);

    console.log("\n— volver —");
    pulsar(doc, "btn-volver");
    await pausa(60);
    ok("vuelve a la lista",
       doc.getElementById("seccion-elegir").classList.contains("hidden"), false);
    ok("y esconde el documento",
       doc.getElementById("lienzo-documento").classList.contains("hidden"), true);

    console.log("\n— una cotizacion de otro vendedor —");
    pulsar(doc, "btn-volver");
    await pausa(60);

    const campo = doc.getElementById("ncoti");
    campo.value = "009-00999999";
    doc.getElementById("form-buscar")
       .dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(120);

    const zona = doc.getElementById("contendor-final-final");
    /* El msg del backend manda sobre el texto generico de 403: es el que le dice
       al vendedor que no llame a sistemas. */
    ok("muestra el mensaje del backend",
       zona.textContent.includes("no pertenece a este vendedor"), true);
    ok("y NO el generico de permisos",
       zona.textContent.includes("No tienes permiso"), false);
    /* Reintentar un 403 da el mismo 403: el boton seria una invitacion en vano. */
    ok("no ofrece reintentar",
       zona.textContent.includes("Reintentar"), false);

    console.log(fallos === 0
        ? `\nTodo correcto. ${llamadas.length} llamadas al backend.\n`
        : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});
