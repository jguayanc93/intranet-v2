/**
 * Prueba de integracion del modulo Pedido, sobre las paginas reales.
 *
 * Cubre las dos pantallas: aplicar flete y cambiar almacen. Lo que mas
 * importa aqui es que la pantalla DEJO de decidir quien puede aplicar flete
 * —lo hacia con dos valores que venian del propio navegador— y que los
 * importes salen con SU moneda, que es el fallo que arrastraba el modulo.
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

/* 0 flag · 1 apro · 2 dias · 3 documento · 4 cliente · 5 item · 6 fabricante
   7 descripcion · 8 marca · 9 cantidad · 10 descuento · 11 precio · 12 total
   13 MONEDA */
const PEDIDOS = {
    // De provincia, en dolares y por encima del minimo.
    "099-00773326": { flag: "0", cliente: "DISTRIBUIDORA AREQUIPA S.A.C.", moneda: "D",
        lineas: [
            ["TOHPCF28", "TONER HP CF283A (83A) MFP M127F NEGRO", "HEWL", 12, 0, 79.71, 956.52],
            ["BOEPT544", "BOTELLA TINTA EPSON T544120-AL NEGRO", "EPSO", 30, 5, 28.50, 855.00],
            ["PAPBA475", "PAPEL BOND A4 75G ATLAS (MILLAR)", "ATLA", 10, 0, 13.63, 136.33]
        ] },
    // En SOLES y por debajo del minimo: la fila que delata el `$` a mano.
    "099-00132184": { flag: "0", cliente: "INNOVA 2512 S.A.C.", moneda: "S",
        lineas: [["CAHDMI20", "CABLE HDMI 2.0 DE 2 METROS", "GENE", 15, 0, 22.50, 337.50]] },
    // Ya atendido: no se le toca nada.
    "099-00999001": { flag: "1", cliente: "YA ATENDIDO S.A.C.", moneda: "D",
        lineas: [["TOHPCE28", "TONER HP CE285A (85A) L.J. P1102 NEGRO", "HEWL", 2, 0, 83.13, 166.26]] }
};

// Cuantas lineas tiene ahora mismo cada pedido: el flete añade una.
const extra = {};

function lineasDe(numero) {
    const p = PEDIDOS[numero];
    if (!p) return null;
    const salida = {};
    const todas = p.lineas.concat(extra[numero] || []);
    todas.forEach((l, i) => {
        salida[i] = { 0: p.flag, 1: 1, 2: 3, 3: numero, 4: p.cliente, 5: i + 1,
                      6: l[0], 7: l[1], 8: l[2], 9: l[3], 10: l[4], 11: l[5], 12: l[6],
                      13: p.moneda };
    });
    return salida;
}

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo });

    const r = (obj, status) => Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });

    if (url.includes("/vendedor")) {
        return r({ status: "ok", codigo: 0, data: { pedido: "x" }, nombre: "JUAN" });
    }

    if (url.includes("/pedido/mostrar")) {
        const lineas = lineasDe(String(cuerpo.npedi || ""));
        if (!lineas) {
            return r({ status: "pedido desconocido", codigo: 3, data: null,
                       msg: "el pedido no existe o no pertenece a este vendedor" }, 400);
        }
        return r(lineas);
    }

    if (url.includes("/pedido/flete")) {
        const numero = String(cuerpo.npedi || "");
        const p = PEDIDOS[numero];
        if (!p) return r({ status: "pedido desconocido", codigo: 3, msg: "falta el numero" }, 400);

        if (p.flag !== "0") {
            return r({ status: "pedido no modificable", codigo: 3,
                       msg: "el pedido ya fue atendido o esta anulado" }, 409);
        }

        const sinIgv = p.lineas.reduce((s, l) => s + l[6], 0);
        const minimo = p.moneda === "S" ? 1500 : 400;

        if (sinIgv < minimo) {
            return r({ status: "flete monto insuficiente", codigo: 3,
                       msg: "el pedido no alcanza el monto minimo para el flete de provincia",
                       moneda: p.moneda, total: Number(sinIgv.toFixed(2)),
                       minimo: minimo, falta: Number((minimo - sinIgv).toFixed(2)) }, 409);
        }

        // El trigger añade la linea del descuento y recalcula la cabecera.
        extra[numero] = [["0303-010001", "DSCTO/PROM: FLETE PROVINCIA AREQUIPA 2026 (CK)",
                          "CK", 1, 0, 0, -Number((sinIgv * 0.004).toFixed(2))]];

        const tota = Number((sinIgv * 0.996).toFixed(2));
        const toti = Number((tota * 0.18).toFixed(2));
        return r({ status: "ok", codigo: 0, documento: numero,
                   totales: { tota, toti, totn: Number((tota + toti).toFixed(2)) } });
    }

    if (url.includes("/pedido/almacen")) {
        const numero = String(cuerpo.npedi || "");
        const p = PEDIDOS[numero];
        if (!p) return r({ status: "pedido desconocido", codigo: 3, msg: "falta el numero" }, 400);
        if (!["01", "08", "15", "16"].includes(String(cuerpo.alm || ""))) {
            return r({ status: "almacen invalido", codigo: 3,
                       msg: "ese almacen no existe o esta inactivo" }, 400);
        }
        if (p.flag !== "0") {
            return r({ status: "pedido no modificable", codigo: 3,
                       msg: "el pedido ya fue atendido o esta anulado" }, 409);
        }
        return r({ status: "ok", codigo: 0, documento: numero,
                   almacen: cuerpo.alm, lineas: p.lineas.length });
    }

    if (url.includes("/v1/")) return r({ status: "ok", codigo: 0, data: [] });
    return r({ msg: "no simulado: " + url }, 404);
}

function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar(pagina) {
    let html = leer(pagina);
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m => m[1]);
    const enLinea = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "");

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
    for (const codigo of enLinea) {
        try { w.eval(codigo); }
        catch (e) { console.log(`  FALLA  <script> de ${pagina}: ${e.message}`); fallos++; }
    }
    return { w, doc: w.document };
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

async function buscar(p, numero) {
    p.doc.getElementById("npedi").value = numero;
    p.doc.getElementById("form-buscar")
        .dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(120);
}

(async function () {
    console.log("\n=== Pedido · las dos pantallas sobre las paginas reales ===\n");

    /* ============================================================ FLETE */
    console.log("— buscar un pedido —");
    llamadas = [];
    const f = await montar("pedido/pedido_flete.html");
    await pausa(80);

    ok("sin errores al cargar", fallos, 0);

    await buscar(f, "099-00773326");

    const pedida = llamadas.find(l => l.url.includes("/pedido/mostrar"));
    ok("pidio el pedido", !!pedida, true);
    ok("mandando su numero", pedida.cuerpo.npedi, "099-00773326");
    ok("abre la ficha",
       f.doc.getElementById("seccion-pedido").classList.contains("hidden"), false);
    ok("con el cliente",
       f.doc.getElementById("resumen").textContent.includes("DISTRIBUIDORA AREQUIPA"), true);
    ok("y sus tres lineas",
       f.doc.querySelectorAll("#productos .cdk-articulo").length, 3);

    console.log("\n— aplicar el flete —");
    f.doc.getElementById("btn-flete")
     .dispatchEvent(new f.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    ok("pide confirmacion", !!f.doc.querySelector(".cdk-modal__titulo"), true);
    ok("diciendo que cambia los totales",
       f.doc.querySelector(".cdk-modal__mensaje").textContent.includes("totales"), true);

    pulsarModal(f.doc, "confirmar");
    await pausa(200);

    const flete = llamadas.filter(l => l.url.includes("/pedido/flete")).pop();
    ok("llamo a la ruta del flete", !!flete, true);
    /* EL CAMBIO DE FONDO: antes se mandaban `flag` y `apro`, que venian del
       propio navegador y se podian cambiar desde la consola. */
    ok("mandando SOLO el numero", Object.keys(flete.cuerpo), ["npedi"]);
    ok("sin flag", flete.cuerpo.flag === undefined, true);
    ok("sin apro", flete.cuerpo.apro === undefined, true);

    const res = f.doc.getElementById("resultado").textContent;
    ok("ensena el total nuevo", res.includes("Total con flete"), true);
    ok("y desglosa el IGV", res.includes("IGV"), true);

    /* La linea del descuento es nueva: si no se recarga, la lista de arriba
       se queda mintiendo con una linea de menos. */
    await pausa(150);
    ok("y recarga las lineas",
       f.doc.querySelectorAll("#productos .cdk-articulo").length, 4);
    ok("con la del flete dentro",
       f.doc.getElementById("productos").textContent.includes("FLETE PROVINCIA"), true);

    /* ------------------------------------------- el que no llega al minimo */
    console.log("\n— un pedido que no llega al minimo —");
    f.doc.getElementById("btn-volver")
     .dispatchEvent(new f.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    await buscar(f, "099-00132184");

    /* EN SOLES. Es la comprobacion que delata el `$` escrito a mano, que era
       como estaban las cinco cifras de la pantalla vieja. */
    const impPed = f.doc.querySelector("#productos .cdk-articulo__importe").textContent;
    ok("el importe en SOLES", impPed.includes("S/"), true);
    ok("y no en dolares", /\$/.test(impPed), false);

    f.doc.getElementById("btn-flete")
     .dispatchEvent(new f.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    pulsarModal(f.doc, "confirmar");
    await pausa(150);

    const falta = f.doc.getElementById("resultado").textContent;
    ok("dice cuanto falta", falta.includes("Faltan"), true);
    ok("con la cifra", falta.includes("1,162.50"), true);
    /* El minimo se mide sobre el total SIN IGV, que no es el numero grande de
       arriba. Sin decirlo, la cuenta no cuadra a ojo. */
    ok("y avisa de que el minimo es sin IGV", falta.includes("sin IGV"), true);

    /* ------------------------------------------------ el ya atendido */
    console.log("\n— un pedido ya atendido —");
    f.doc.getElementById("btn-volver")
     .dispatchEvent(new f.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    await buscar(f, "099-00999001");

    f.doc.getElementById("btn-flete")
     .dispatchEvent(new f.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    pulsarModal(f.doc, "confirmar");
    await pausa(150);

    const atendido = f.doc.getElementById("resultado").textContent;
    ok("ensena el motivo del backend", atendido.includes("ya fue atendido"), true);
    ok("y no un generico", atendido.includes("Ocurrió un error"), false);
    /* Un 409 no se arregla insistiendo. */
    ok("sin boton de reintentar",
       !!f.doc.querySelector("#resultado .cdk-boton"), false);

    /* ========================================================== ALMACEN */
    console.log("\n— cambiar el almacen —");
    llamadas = [];
    const a = await montar("pedido/pedido_almacen.html");
    await pausa(80);

    const selector = a.doc.getElementById("alm");
    ok("el desplegable sale del catalogo", selector.options.length > 0, true);

    a.doc.getElementById("npedi").value = "099-00773326";
    selector.value = selector.options[0].value;
    a.doc.getElementById("form-almacen")
     .dispatchEvent(new a.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(80);

    ok("pide confirmacion", !!a.doc.querySelector(".cdk-modal__titulo"), true);
    ok("avisando de que mueve las lineas",
       a.doc.querySelector(".cdk-modal__mensaje").textContent.includes("líneas"), true);

    console.log("\n— cancelar no hace nada —");
    pulsarModal(a.doc, "cancelar");
    await pausa(60);
    ok("no llamo al backend",
       llamadas.some(l => l.url.includes("/pedido/almacen")), false);

    console.log("\n— confirmar —");
    a.doc.getElementById("form-almacen")
     .dispatchEvent(new a.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(60);
    pulsarModal(a.doc, "confirmar");
    await pausa(150);

    const cambio = llamadas.filter(l => l.url.includes("/pedido/almacen")).pop();
    ok("ahora si llama", !!cambio, true);
    ok("con el numero", cambio.cuerpo.npedi, "099-00773326");
    ok("y el almacen", !!cambio.cuerpo.alm, true);

    const hecho = a.doc.getElementById("resultado").textContent;
    /* Cuantas lineas se movieron: el almacen vive en la cabecera Y en cada
       linea, y lo que puede salir mal es que se actualice una y no la otra. */
    ok("dice cuantas lineas movio", hecho.includes("3 líneas actualizadas"), true);

    console.log("\n— un pedido que no se puede mover —");
    a.doc.getElementById("npedi").value = "099-00999001";
    a.doc.getElementById("form-almacen")
     .dispatchEvent(new a.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(60);
    pulsarModal(a.doc, "confirmar");
    await pausa(150);

    const noSePuede = a.doc.getElementById("resultado").textContent;
    ok("ensena el motivo", noSePuede.includes("ya fue atendido"), true);
    ok("sin boton de reintentar",
       !!a.doc.querySelector("#resultado .cdk-boton"), false);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});
