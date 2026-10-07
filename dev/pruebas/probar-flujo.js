/**
 * Prueba de integracion de "Crear cotizacion".
 *
 * Carga la PAGINA REAL con sus scripts reales en jsdom y la acciona como lo
 * haria un vendedor: elegir cliente, buscar producto, agregarlo, pedir
 * promociones, aplicarlas, editar una linea y crear.
 *
 * Existe porque las pruebas unitarias no vieron el ultimo fallo: las
 * promociones se borraban al cerrar su propio panel, y eso solo se nota
 * pulsando. El arnes de vm con stubs tampoco lo habria visto, porque el bug
 * estaba en como cooperan cuatro archivos sobre el DOM.
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

/* ---------------------------------------------------------------
 * Backend simulado: responde con las formas del contrato real.
 * ------------------------------------------------------------- */
const llamadas = [];

function sobre(data, extra) {
    return Object.assign({ status: "ok", codigo: 0, data }, extra || {});
}

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo });

    const r = (obj, status) => Promise.resolve({
        status: status || 200,
        ok: (status || 200) < 400,
        statusText: "",
        // El backend devuelve JSON que contiene un JSON en texto.
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });

    if (url.includes("/vendedor")) {
        return r(sobre({ cotizacion: "Permite manejar cotizaciones" }, {
            nombre: "JUAN CARLOS", grupo: "VENTAS-JEFES DE PROD",
            tipo: "ESPECIALISTA", tipoCambio: 3.437
        }));
    }

    if (url.includes("/cliente/buscar")) {
        return r({ 0: { 0: "C10874", 1: "PC SUMINISTROS S.A.C.", 2: "20600828747" } });
    }

    if (url.includes("/cliente/id")) {
        return r({ 0: { 0: "C10874", 1: "PC SUMINISTROS S.A.C.", 2: "20600828747",
                        3: "V0345", 4: "14", 5: "F" } });
    }

    if (url.includes("/producto/buscar")) {
        // 0 codigo, 1 descripcion, 2 princ, 3 mym, 4 tope, 5 precio, 6 piura
        return r({ 0: { 0: "0505-012610", 1: "TONER TN-450 NEGRO", 2: 12, 3: 3, 4: 6, 5: 89.90, 6: 0 } });
    }

    if (url.includes("/promocion/recolector")) return r(sobre(["15112"]));

    if (url.includes("/promocion/detalle")) {
        return r(sobre({
            0: { codigo: "15112", descripcion: "TCL REBATE", cantidad: 2,
                 montoDescuento: 15.00, monedaDescuento: "D",
                 itemdescr: "TONER TN-450 NEGRO", tipo: ["descuento"] },
            tipo: ["descuento"], descripcion: "TCL REBATE"
        }));
    }

    if (url.includes("/cotizacion/pegar")) {
        return r({ status: "ok", codigo: 0, documento: "098-00000037", lineas: 1,
                   totales: { tota: 172.61, toti: 31.07, totn: 203.68 } });
    }

    if (url.includes("/promocion/acoplar")) return r(sobre({ ndocu: cuerpo.ndocu }));
    if (url.includes("/cotizacion")) return r(sobre(["crear", "leer", "update", "delete", "alm"]));

    return r({ msg: "no simulado: " + url }, 404);
}

/* ---------------------------------------------------------------
 * Montar la pagina real
 * ------------------------------------------------------------- */
function leer(rel) {
    return fs.readFileSync(path.join(RAIZ, rel), "utf8");
}

async function montar() {
    let html = leer("cotizacion/cotizacion_nuevo.html");

    // Fuera lo externo: Tailwind y Font Awesome por CDN no hacen falta aqui
    // y jsdom intentaria descargarlos.
    html = html.replace(/<script src="https:\/\/[^"]*"><\/script>/g, "");
    html = html.replace(/<link[^>]*cdnjs[^>]*>/g, "");
    // Los scripts se inyectan a mano, en orden, para controlar el entorno.
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/cotizacion/cotizacion_nuevo.html",
        runScripts: "outside-only",
        pretendToBeVisual: true
    });

    const w = dom.window;
    w.fetch = (url, opciones) => responder(String(url), opciones);
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = function () {};

    // El shell pide /vendedor al cargar; su cache usa sessionStorage, que jsdom trae.
    for (const rel of scripts) {
        try {
            w.eval(leer(rel));
        } catch (e) {
            console.log(`  FALLA  al cargar ${rel}: ${e.message}`);
            fallos++;
        }
    }

    return { dom, w, doc: w.document };
}

/* --------------------------------------------------------------- */
const pausa = (ms) => new Promise(r => setTimeout(r, ms));

function pulsar(doc, id) {
    const n = doc.getElementById(id);
    if (!n) throw new Error("no existe #" + id);
    n.dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
}

function escribir(doc, id, valor) {
    const n = doc.getElementById(id);
    if (!n) throw new Error("no existe #" + id);
    n.value = valor;
    n.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
}

(async function () {
    console.log("\n=== Crear cotizacion · flujo completo en la pagina real ===\n");

    const { w, doc } = await montar();
    await pausa(50);

    console.log("— carga —");
    ok("sin errores al cargar los scripts", fallos, 0);
    ok("pidio /vendedor", llamadas.some(l => l.url.includes("/vendedor")), true);

    /* ---------------------------------------------- paso 1 · cliente */
    console.log("\n— paso 1 · cliente —");
    pulsar(doc, "btn-buscar-cliente");
    escribir(doc, "input-busqueda", "20600828747");   // RUC: busca ya
    await pausa(80);

    const filaCliente = doc.querySelector("#recorrer-clientes .cdk-articulo");
    ok("la busqueda pinta el cliente", !!filaCliente, true);

    if (filaCliente) {
        filaCliente.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
        await pausa(80);
    }

    ok("guardo la letra del cliente", w.cliente_data && w.cliente_data[5], "F");
    ok("el paso 2 quedo visible",
       !doc.getElementById("paso2").classList.contains("hidden"), true);

    /* --------------------------------------------- paso 2 · producto */
    console.log("\n— paso 2 · producto —");
    pulsar(doc, "btn-buscar-producto");
    escribir(doc, "input-busqueda-producto", "TONER");
    await pausa(600);   // la busqueda espera 400 ms

    const filaProd = doc.querySelector("#recorrer-productos .cdk-articulo");
    ok("la busqueda pinta el producto", !!filaProd, true);

    if (filaProd) {
        filaProd.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
        await pausa(50);
    }

    ok("la fila se abrio en su sitio",
       !!doc.querySelector("#recorrer-productos .cdk-grupo--abierto"), true);

    const btnAgregar = doc.querySelector("#recorrer-productos .cdk-config .cdk-boton--primario");
    ok("ofrece el boton de agregar", !!btnAgregar, true);

    if (btnAgregar) {
        escribir(doc, "conf-descuento", "4");
        await pausa(20);
        btnAgregar.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
        await pausa(50);
    }

    ok("el producto entro al carrito",
       Object.keys(w.productosSeleccionados || {}).length, 1);
    ok("y se guardo en dolares",
       w.productosSeleccionados[0].precioUnitario, 89.90);

    /* --------------------------------------------- paso 3 · carrito */
    console.log("\n— paso 3 · carrito —");
    pulsar(doc, "btn-cancelar-busqueda-producto");   // "Listo"
    await pausa(250);

    ok("el paso 3 quedo visible",
       !doc.getElementById("paso3").classList.contains("hidden"), true);
    ok("el carrito se ve en la pagina",
       doc.querySelectorAll("#lista-carrito .cdk-articulo").length, 1);
    ok("muestra sus totales",
       doc.querySelectorAll("#totales-carrito .cdk-total").length > 0, true);

    /* ----------------------------------------- paso 3 · promociones */
    console.log("\n— paso 3 · promociones —");
    pulsar(doc, "btn-promociones");
    await pausa(150);

    ok("consulto el recolector",
       llamadas.some(l => l.url.includes("/promocion/recolector")), true);
    ok("el recolector solo mando codigos",
       Object.keys(llamadas.find(l => l.url.includes("recolector")).cuerpo.productos[0]),
       ["codigo"]);
    ok("pidio el detalle",
       llamadas.some(l => l.url.includes("/promocion/detalle")), true);
    ok("pinto la promocion",
       doc.querySelectorAll("#lista-promociones .cdk-articulo").length > 0, true);

    pulsar(doc, "btn-aplicar-promo");
    await pausa(80);

    /* EL BUG DE LA VEZ PASADA: aplicar y cerrar borraba lo aceptado. */
    ok("la promocion sobrevive al cierre",
       (w.promocionesAplicadas || []).length, 1);
    ok("y aparece en el carrito",
       doc.querySelectorAll("#lista-carrito .cdk-articulo--descuento").length, 1);

    /* ------------------------------------ editar retira promociones */
    console.log("\n— editar una linea —");
    const filaCarrito = doc.querySelector("#lista-carrito .cdk-articulo");
    filaCarrito.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
    await pausa(50);

    ok("abre el panel de editar",
       !doc.getElementById("modal-editar-producto").classList.contains("hidden"), true);
    ok("avisa que se perderan las promociones",
       !doc.getElementById("edit-aviso-promos").classList.contains("hidden"), true);

    escribir(doc, "edit-cantidad", "5");
    await pausa(20);
    pulsar(doc, "btn-guardar-cambios");
    await pausa(80);

    ok("guardo la cantidad nueva", w.productosSeleccionados[0].cantidad, 5);
    ok("retiro las promociones", (w.promocionesAplicadas || []).length, 0);
    ok("y se fueron del carrito",
       doc.querySelectorAll("#lista-carrito .cdk-articulo--descuento").length, 0);

    /* ------------------------------------------------ paso 4 · crear */
    console.log("\n— paso 4 · crear —");

    // Volver a aplicar para comprobar que se acoplan al crear.
    pulsar(doc, "btn-promociones");
    await pausa(150);
    pulsar(doc, "btn-aplicar-promo");
    await pausa(80);
    ok("promocion aplicada de nuevo", (w.promocionesAplicadas || []).length, 1);

    const btnCrear = doc.getElementById("creacion");
    ok("el boton de crear esta habilitado", btnCrear.disabled, false);

    pulsar(doc, "creacion");
    await pausa(250);

    const pegar = llamadas.find(l => l.url.includes("/cotizacion/pegar"));
    ok("llamo a /cotizacion/pegar", !!pegar, true);
    ok("mando el cliente completo", pegar.cuerpo.cliente[5], "F");
    ok("mando una linea", Object.keys(pegar.cuerpo.productos).length, 1);
    ok("ya no manda promos", pegar.cuerpo.promos, undefined);

    const acoplar = llamadas.find(l => l.url.includes("/promocion/acoplar"));
    ok("acoplo la promocion", !!acoplar, true);
    ok("con el numero CON serie", acoplar && acoplar.cuerpo.ndocu, "098-00000037");
    ok("y el idprom", acoplar && acoplar.cuerpo.nprom, "15112");

    ok("vacio el carrito tras crear",
       Object.keys(w.productosSeleccionados || {}).length, 0);

    /* --------------------------------------------------------------- */
    console.log(fallos === 0
        ? `\nTodo correcto. ${llamadas.length} llamadas al backend.\n`
        : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});
