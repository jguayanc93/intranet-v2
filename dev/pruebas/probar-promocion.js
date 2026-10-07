/**
 * Prueba de integracion del modulo Promocion, sobre las paginas reales.
 *
 * Lo que mas importa:
 *   · que acoplar DEJE ELEGIR —antes aplicaba todas o ninguna— y mande una
 *     llamada por promocion con solo {ndocu, nprom}
 *   · que no viaje ningun importe calculado en el navegador: el `0.18` a mano
 *     y el `fullpromo` entero eran lo que habia antes
 *   · que una cotizacion en soles se distinga de una sin promociones, que es
 *     lo que el backend acaba de separar
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

let llamadas = [];

const linea = (doc, item, codi, marca, descr, cant, unit, dscto, imp) => ({
    3: doc, 9: item, 11: codi, 12: marca, 14: descr, 15: cant, 16: unit, 18: dscto, 19: imp
});

let PROMOS;
function reiniciar() {
    PROMOS = {
        "009-00971087": {
            moneda: "D",
            aplican: ["14656", "15024"],
            yaAplicada: ["15024"],
            puestas: [
                linea("009-00971087", "7", "0303-010001", "CK",
                      "DSCTO/PROM: TONER HP 2026 (CK)", 1, 0, 100, -42.50),
                linea("009-00971087", "8", "TOHPCF28", "HEWL",
                      "GRATIS/PROM: TONER HP CF283A (83A)", 2, 0, 100, 0)
            ]
        },
        "009-00971042": { moneda: "D", aplican: [], yaAplicada: [], puestas: [] },
        "009-00970988": { moneda: "S", aplican: [], yaAplicada: [], puestas: [] }
    };
}
reiniciar();

const PREVIA = {
    "14656": [
        linea("", "", "TOHPCF28", "HEWL", "GRATIS/PROM: TONER HP CF283A (83A)", 2, 0, 100, 0),
        linea("", "", "0303-010001", "CK", "DSCTO/PROM: TONER HP 2026 (CK)", 1, 0, 100, -42.50)
    ],
    "15024": [linea("", "", "PAPBA475", "ATLA", "GRATIS/PROM: PAPEL BOND A4 75G", 1, 0, 100, 0)]
};

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo });

    const r = (obj, status) => Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });

    if (url.includes("/vendedor")) {
        return r({ status: "ok", codigo: 0, data: { promocion: "x" }, nombre: "JUAN" });
    }

    /* La lista del dia, que es con lo que se elige la cotizacion. Renumerada:
       4 moneda, 5 registrado, 6 estado, 7 editable. */
    if (url.includes("/lista/cotisxdia")) {
        return r({
            0: { 0: "2026/10/06", 1: "009-00971087", 2: "SERVICIOS INTERNET S.A.C.",
                 3: 1645.01, 4: "D", 5: "2026-10-06 13:57:38", 6: "cotizado", 7: 1 },
            1: { 0: "2026/10/06", 1: "009-00971042", 2: "PC SUMINISTROS S.A.C.",
                 3: 892.40, 4: "D", 5: "2026-10-06 11:12:04", 6: "cotizado", 7: 1 }
        });
    }

    if (url.includes("/promocion/revisar")) {
        const c = PROMOS[String(cuerpo.ncoti || "")];
        if (!c) return r({ status: "coti desconocida", codigo: 3, msg: "no es tuya" }, 403);
        return r({ status: "ok", codigo: 0, data: c.aplican });
    }

    if (url.includes("/promocion/mostrar")) {
        const c = PROMOS[String(cuerpo.ncoti || "")];
        if (!c) return r({ status: "coti desconocida", codigo: 3 }, 403);
        if (c.yaAplicada.includes(String(cuerpo.nprom))) {
            return r({ status: "promo ya aplicada", codigo: 0 });
        }
        const salida = {};
        (PREVIA[String(cuerpo.nprom)] || []).forEach((l, i) => { salida[i] = l; });
        return r(salida);
    }

    if (url.includes("/promocion/acoplar")) {
        const c = PROMOS[String(cuerpo.ndocu || "")];
        if (!c) return r({ status: "coti desconocida", codigo: 3, msg: "no es tuya" }, 403);
        if (c.yaAplicada.includes(String(cuerpo.nprom))) {
            return r({ status: "promo ya aplicada", codigo: 3, msg: "ya esta puesta" }, 409);
        }
        c.yaAplicada.push(String(cuerpo.nprom));
        (PREVIA[String(cuerpo.nprom)] || []).forEach((l, i) => {
            c.puestas.push(Object.assign({}, l, { 3: cuerpo.ndocu, 9: String(90 + i) }));
        });
        return r({ status: "ok", codigo: 0, documento: cuerpo.ndocu, promocion: cuerpo.nprom });
    }

    if (url.includes("/cotizacion/readprom")) {
        const c = PROMOS[String(cuerpo.ncoti || "")];
        if (!c) return r({ status: "coti desconocida", codigo: 3, msg: "no es tuya" }, 403);
        if (c.moneda === "S") {
            return r({ status: "coti en soles", codigo: 0, items: [],
                       msg: "las promociones solo se aplican a cotizaciones en dolares; esta va en soles" });
        }
        if (!c.puestas.length) {
            return r({ status: "promocion no tiene", codigo: 0, data: {},
                       msg: "esta cotizacion no tiene promociones aplicadas" });
        }
        const salida = {};
        c.puestas.forEach((l, i) => { salida[i] = l; });
        return r(salida);
    }

    if (url.includes("/promocion/eliminar")) {
        const filas = Array.isArray(cuerpo.removeproms) ? cuerpo.removeproms : [];
        if (!filas.length) return r({ status: "nada que quitar", codigo: 3 }, 400);
        const doc = String(filas[0][0] || "");
        const c = PROMOS[doc];
        if (!c) return r({ status: "coti desconocida", codigo: 3 }, 403);
        const quitar = filas.map(f => String(f[1]));
        const antes = c.puestas.length;
        c.puestas = c.puestas.filter(l => !quitar.includes(String(l[9])));
        const removidas = antes - c.puestas.length;
        if (!removidas) return r({ status: "nada que quitar", codigo: 3, msg: "no existen" }, 409);
        return r({ status: "ok", codigo: 0, msg: "removido con exito", documento: doc, removidas });
    }

    if (url.includes("/v1/")) return r({ status: "ok", codigo: 0, data: [] });
    return r({ msg: "no simulado: " + url }, 404);
}

function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar(pagina) {
    let html = leer(pagina);
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/" + pagina,
        runScripts: "outside-only", pretendToBeVisual: true
    });
    const w = dom.window;
    w.fetch = (url, opciones) => responder(String(url), opciones);
    w.HTMLElement.prototype.scrollIntoView = function () {};

    for (const rel of scripts) {
        try { w.eval(leer(rel)); }
        catch (e) { console.log(`  FALLA  ${rel}: ${e.message}`); fallos++; }
    }
    return { w, doc: w.document };
}

const pausa = (ms) => new Promise(r => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
function botonModal(doc, cual) {
    const b = doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    return cual === "confirmar" ? b[b.length - 1] : b[0];
}

async function porNumero(p, numero) {
    p.doc.getElementById("ncoti").value = numero;
    p.doc.getElementById("form-numero")
     .dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(200);
}

(async function () {
    console.log("\n=== Promocion · aplicar y quitar, sobre las paginas reales ===\n");

    /* ========================================================== ACOPLAR */
    console.log("— elegir la cotizacion de la lista —");
    llamadas = [];
    const a = await montar("promocion/promocion_acoplar.html");
    await pausa(120);

    ok("sin errores al cargar", fallos, 0);
    /* El buscador que habia antes llamaba a /coti/buscar, una ruta que NO
       EXISTE. Ahora se usa la lista del dia, que ya estaba hecha. */
    ok("usa la lista del dia",
       llamadas.some(l => l.url.includes("/lista/cotisxdia")), true);
    ok("y no la ruta que no existe",
       llamadas.some(l => l.url.includes("/coti/buscar")), false);

    const filas = a.doc.querySelectorAll("#lista-cotis .cdk-articulo");
    ok("ofrece las abiertas", filas.length, 2);
    clic(a, filas[0]);
    await pausa(250);

    console.log("\n— que promociones aplican —");
    const revisada = llamadas.filter(l => l.url.includes("/promocion/revisar")).pop();
    ok("pregunta cuales aplican", !!revisada, true);
    ok("con el numero de cotizacion", revisada.cuerpo.ncoti, "009-00971087");

    const tarjetas = a.doc.querySelectorAll("#promos .cdk-grupo");
    ok("pinta las dos que aplican", tarjetas.length, 2);
    /* Una ya esta puesta: se ve, pero no se puede volver a poner. */
    ok("marca la que ya esta aplicada",
       a.doc.getElementById("promos").textContent.includes("ya aplicada"), true);
    const pulsables = a.doc.querySelectorAll("#promos .cdk-articulo--pulsable");
    ok("y solo deja tocar la otra", pulsables.length, 1);

    /* `grupos` se mandaba y el servidor nunca lo leia. */
    const mostradas = llamadas.filter(l => l.url.includes("/promocion/mostrar"));
    ok("pide la previa de cada una", mostradas.length, 2);
    ok("sin mandar `grupos`", mostradas.every(l => l.cuerpo.grupos === undefined), true);

    console.log("\n— elegir, que antes no se podia —");
    ok("el boton empieza desactivado",
       a.doc.getElementById("btn-aplicar").disabled, true);

    clic(a, pulsables[0]);
    await pausa(120);
    ok("al marcarla se ve que trae",
       a.doc.querySelectorAll("#promos .cdk-opcion, #promos .cdk-articulos .cdk-articulo").length > 0, true);
    ok("y el boton dice cuantas",
       a.doc.getElementById("btn-aplicar").textContent.includes("1"), true);

    console.log("\n— aplicar —");
    llamadas = [];
    clic(a, a.doc.getElementById("btn-aplicar"));
    await pausa(80);
    ok("pide confirmacion", !!a.doc.querySelector(".cdk-modal__titulo"), true);
    clic(a, botonModal(a.doc, "confirmar"));
    await pausa(300);

    const acoplada = llamadas.filter(l => l.url.includes("/promocion/acoplar")).pop();
    ok("llama a acoplar", !!acoplada, true);
    /* EL CAMBIO DE FONDO: solo el documento y la promocion. Antes viajaba
       `fullpromo` entero, con un descuento y un IGV calculados aqui. */
    ok("mandando solo ndocu y nprom", Object.keys(acoplada.cuerpo).sort(), ["ndocu", "nprom"]);
    ok("sin fullpromo", acoplada.cuerpo.fullpromo, undefined);
    ok("sin descuento calculado aqui", acoplada.cuerpo.descuento, undefined);
    ok("una llamada por promocion elegida",
       llamadas.filter(l => l.url.includes("/promocion/acoplar")).length, 1);
    ok("y vuelve a mirar que aplica ahora",
       llamadas.filter(l => l.url.includes("/promocion/revisar")).length, 1);

    /* --------------------------------------- una sin promociones que apliquen */
    console.log("\n— una cotizacion sin promociones que le toquen —");
    clic(a, a.doc.getElementById("btn-volver"));
    await pausa(150);
    await porNumero(a, "009-00971042");
    ok("lo dice y no deja aplicar",
       a.doc.getElementById("promos").textContent.includes("Ninguna promoción"), true);
    ok("sin boton de aplicar",
       a.doc.getElementById("acciones").classList.contains("hidden"), true);

    /* =========================================================== QUITAR */
    console.log("\n— quitar: las lineas puestas —");
    reiniciar();
    llamadas = [];
    const q = await montar("promocion/promocion_quitar.html");
    await pausa(120);

    clic(q, q.doc.querySelectorAll("#lista-cotis .cdk-articulo")[0]);
    await pausa(200);

    ok("pide las lineas con promocion",
       llamadas.some(l => l.url.includes("/cotizacion/readprom")), true);
    ok("y pinta las dos",
       q.doc.querySelectorAll("#items .cdk-articulo").length, 2);
    ok("el boton empieza desactivado", q.doc.getElementById("btn-quitar").disabled, true);

    console.log("\n— marcar todas —");
    clic(q, q.doc.getElementById("btn-todas"));
    await pausa(100);
    ok("el boton dice cuantas",
       q.doc.getElementById("btn-quitar").textContent.includes("2"), true);

    llamadas = [];
    clic(q, q.doc.getElementById("btn-quitar"));
    await pausa(80);
    ok("avisa de que no se deshace",
       q.doc.querySelector(".cdk-modal__mensaje").textContent.includes("No se puede deshacer"), true);
    clic(q, botonModal(q.doc, "confirmar"));
    await pausa(300);

    const quitada = llamadas.filter(l => l.url.includes("/promocion/eliminar")).pop();
    ok("llama a eliminar", !!quitada, true);
    ok("con las dos lineas", quitada.cuerpo.removeproms.length, 2);
    /* La descripcion se mandaba y el servidor no la lee: es texto de pantalla. */
    ok("solo documento y numero de item", quitada.cuerpo.removeproms[0].length, 2);
    ok("y vuelve a mirar que queda",
       llamadas.filter(l => l.url.includes("/cotizacion/readprom")).length, 1);

    /* ------------------------------------------------- en soles */
    console.log("\n— una cotizacion en soles —");
    clic(q, q.doc.getElementById("btn-volver"));
    await pausa(150);
    await porNumero(q, "009-00970988");

    const texto = q.doc.getElementById("items").textContent;
    /* Que vaya en soles NO es «no tiene promociones». Antes las dos cosas se
       veian igual: una lista vacia. */
    ok("dice que es por la moneda", texto.includes("en soles"), true);
    ok("y no que no tenga ninguna", texto.includes("no tiene promociones"), false);
    ok("sin ofrecer quitar nada",
       q.doc.getElementById("acciones").classList.contains("hidden"), true);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});
