/**
 * Cotizacion en SOLES (docs/cotizacion-moneda.md).
 *
 * El problema: una cotizacion hecha en soles se grababa con los importes en dolares (la 098-00000069 enseñaba S/ 4 752.38
 * donde valia S/ 16 395.71). El backend la va a convertir con la regla del ERP; esta suite comprueba el lado de la pantalla:
 *
 *   1. la regla, contra una referencia de ENTEROS exactos (no coma flotante) y contra los ejemplos del documento;
 *   2. la cotizacion nueva: lo que se ve en soles es lo que se graba, los precios SIGUEN yendo en dolares, no hay promociones
 *      en soles y sin tipo de cambio no hay soles;
 *   3. modificar una cotizacion en soles: se muestra en su moneda, y las lineas nuevas se convierten con SU tipo de cambio;
 *   4. ver una cotizacion en soles hecha en el ERP (moneda de la linea "D").
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const RAIZ = path.resolve(__dirname, "..", "..");

let fallos = 0;
function ok(etiqueta, real, esperado) {
    const bien = JSON.stringify(real) === JSON.stringify(esperado);
    if (!bien) fallos++;
    console.log(`${bien ? "  ok  " : " FALLA"} ${etiqueta}`);
    if (!bien) console.log(`         esperado: ${JSON.stringify(esperado)}\n         real:     ${JSON.stringify(real)}`);
}

let erroresDeCarga = 0;
const leer = (rel) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

/** El formateador separa el simbolo del numero con un espacio duro: se comparan textos con espacios normales. */
const limpio = (t) => String(t).replace(/ /g, " ").replace(/\s+/g, " ").trim();

/* =====================================================================================================================
 * 1 · La regla, sin pantalla
 * =================================================================================================================== */
console.log("\n=== Cotizacion en soles ===");
console.log("\n— la regla del ERP —");

const ctx = vm.createContext({ console, document: { getElementById: () => null }, Number, Math, parseInt, isFinite, String, Array });
ctx.window = ctx;
ctx.global = ctx;
vm.runInContext("var CDK = {};", ctx);
vm.runInContext(leer("js/cotizacion/campos.js"), ctx);
const C = ctx.CDK.coti;

/* redondear: la mitad hacia arriba, sin los errores de la coma flotante */
ok("redondear 1.005 a 2 (en coma flotante da 1.00)", C.redondear(1.005, 2), 1.01);
ok("redondear 2.675 a 2",       C.redondear(2.675, 2), 2.68);
ok("redondear 0.285 a 2",       C.redondear(0.285, 2), 0.29);
ok("la mitad se aleja del cero", C.redondear(-2.5, 0), -3);
ok("lo que no llega a la mitad baja", C.redondear(1.0049, 2), 1);
ok("un redondeo a cero no deja -0", Object.is(C.redondear(-0.0004, 2), 0), true);
ok("no finito da 0",            C.redondear(NaN, 2), 0);

/* El producto es EXACTO. 3.05 × 3.45 = 10.5225, que el ERP redondea a 10.523; en coma flotante da 10.522499999999999 y se
   redondearia a 10.522. */
ok("3.05 x 3.45 en coma flotante queda por debajo de 10.5225", 3.05 * 3.45 < 10.5225, true);
ok("y aun asi el precio unitario en soles es el del ERP (10.523)", C.precioEnMoneda(3.05, "S", 3.45), 10.523);
ok("el del documento: 7.97 x 3.45 = 27.4965 -> 27.497", C.precioEnMoneda(7.97, "S", 3.45), 27.497);
ok("en dolares, el precio tal cual",                    C.precioEnMoneda(7.97, "D", 3.45), 7.97);

/* El ejemplo de la seccion 2 del documento: 0505-012605, tc 3.45, cantidad 6, descuento 2.5 % */
const doc = C.lineaEnMoneda({ precio: 7.97, cantidad: 6, descuento: 2.5 }, "S", 3.45);
ok("seccion 2: preu = vvus × tcam, 3 decimales", doc.precioUnitario, 27.497);
ok("seccion 2: precio con descuento, a 2 decimales (27.497 × 0.975 = 26.809575)", doc.precioConDescuento, 26.81);
ok("seccion 2: tota de la linea (26.81 × 6)",    doc.importe, 160.86);
const nueva = C.lineaNuevaEnSoles({ precio: 7.97, coste: 7.45, cantidad: 6, descuento: 2.5, tcam: 3.45 });
ok("seccion 2: cost = pcus × tcam, 3 decimales", nueva.coste, 25.703);
ok("una linea nueva: el mismo precio unitario",  nueva.precioUnitario, 27.497);
ok("una linea nueva: el mismo importe",          nueva.importe, 160.86);
ok("una linea nueva: el importe con IGV",        nueva.importeConIgv, 189.81);

/* El caso del backend: 098-00000069, 100 unidades a US$ 41.52, 3 % de descuento, tc 3.45 */
const c69 = C.lineaEnMoneda({ precio: 41.52, cantidad: 100, descuento: 3 }, "S", 3.45);
ok("098-00000069: precio unitario", c69.precioUnitario, 143.244);
ok("098-00000069: precio con descuento (143.244 × 0.97 = 138.94668)", c69.precioConDescuento, 138.95);
ok("098-00000069: total sin IGV (138.95 × 100)", c69.importe, 13895);
const t69 = C.totalesEnMoneda([c69.importe], "S", 0);
ok("098-00000069: IGV",             t69.igv, 2501.1);
ok("098-00000069: total con IGV",   t69.total, 16396.1);
ok("098-00000069: en dolares eran", C.lineaEnMoneda({ precio: 41.52, cantidad: 100, descuento: 3 }, "D").importe, 4027.44);

/* LA CORRECCION DEL BACKEND (23/10): el precio con descuento se redondea a 2 decimales ANTES de multiplicar por la cantidad. La
   primera version de la regla decia round2(unitario × cantidad × (1 − d/100)), que solo explicaba el 51 % de las lineas en soles. */
ok("precio con descuento: 27.497 con 2 % = 26.94706 -> 26.95", C.precioConDescuentoEnSoles(27.497, 2), 26.95);
ok("18 × 26.95 = 485.10, no 485.05 (la regla anterior)",       C.importeEnSoles(27.497, 18, 2), 485.1);
ok("9 × 26.95 = 242.55, no 242.52",                            C.importeEnSoles(27.497, 9, 2), 242.55);
ok("la mitad exacta sube: 8.5 con 1 % = 8.415 -> 8.42 (en coma flotante, 8.41)", C.precioConDescuentoEnSoles(8.5, 1), 8.42);
ok("sin descuento, el precio con descuento es el unitario a 2 decimales", C.precioConDescuentoEnSoles(27.497, 0), 27.5);

/* Una cantidad o un descuento raros no rompen nada */
ok("cantidad negativa: importe 0", C.importeEnSoles(27.497, -3, 0), 0);
ok("descuento de mas de 100: no da negativo", C.importeEnSoles(27.497, 2, 150), 0);
ok("descuento negativo no sube el precio", C.importeEnSoles(27.497, 2, -10), 55);
ok("sin descuento (27.50 × 2)",    C.importeEnSoles(27.497, 2, 0), 55);

/* La moneda en pantalla: soles solo si el selector lo dice Y hay tipo de cambio de hoy. */
function coti(valorSelector, usuario) {
    const v = vm.createContext({ console, document: { getElementById: () => ({ value: valorSelector }) }, Number, Math, parseInt, isFinite, String, Array });
    v.window = v;
    v.global = v;
    vm.runInContext("var CDK = { sesion: { usuario: function () { return " + JSON.stringify(usuario) + "; } } };", v);
    vm.runInContext(leer("js/cotizacion/campos.js"), v);
    return v.CDK.coti;
}
ok("selector en soles y tipo de cambio de hoy: soles",   coti("S", { tipoCambio: 3.45 }).moneda(), "S");
ok("selector en soles y SIN tipo de cambio: dolares",     coti("S", { tipoCambio: null }).moneda(), "D");
ok("selector en soles y sin usuario todavia: dolares",    coti("S", null).moneda(), "D");
ok("selector en dolares: dolares",                        coti("D", { tipoCambio: 3.45 }).moneda(), "D");

/* En dolares NADA cambia */
const enD = C.lineaEnMoneda({ precio: 7.97, cantidad: 10, descuento: 2 }, "D");
ok("dolares: la linea sigue siendo la de calcularLinea", enD.importe, 78.11);
ok("dolares: el precio unitario",                        enD.precioUnitario, 7.97);
const tD = C.totalesEnMoneda([78.11, 100], "D", 15);
ok("dolares: productos",     tD.productos, 178.11);
ok("dolares: promociones",   tD.promociones, 15);
ok("dolares: base",          tD.sinIgv, 163.11);
ok("dolares: el IGV no se redondea (como siempre)", Math.abs(tD.igv - 29.3598) < 1e-9, true);

/* ---------------------------------------------------------------------------------------------------------------------
 * La referencia: enteros exactos. Centavos de dolar, milesimas de tipo de cambio, decimas de porcentaje.
 * ------------------------------------------------------------------------------------------------------------------- */
console.log("\n— contra una referencia de enteros exactos —");

const mitad = (num, den) => Math.floor((2 * num + den) / (2 * den));      // num / den, la mitad hacia arriba

function referencia(lineas, tcMilesimas) {
    let suma = 0;
    for (const l of lineas) {
        const preuMilesimas = mitad(l.precioCent * tcMilesimas, 100);                  // centavos × milesimas -> milesimas
        const conDsctCent = mitad(preuMilesimas * (1000 - l.dsctDeci), 10000);         // el precio con descuento, a 2 decimales
        suma += conDsctCent * l.cant;                                                   // la linea: ese precio por la cantidad
    }
    const igv = mitad(suma * 18, 100);
    return { sinIgv: suma, igv: igv, total: suma + igv };
}

/* La regla de la PRIMERA version, que el backend corrigio: la linea sin redondear antes el precio con descuento. */
function reglaAnterior(lineas, tcMilesimas) {
    let suma = 0;
    for (const l of lineas) {
        const preuMilesimas = mitad(l.precioCent * tcMilesimas, 100);
        suma += mitad(preuMilesimas * l.cant * (1000 - l.dsctDeci), 10000);
    }
    const igv = mitad(suma * 18, 100);
    return { sinIgv: suma, igv: igv, total: suma + igv };
}

/* Lo que enseña la pantalla, linea por linea y luego los totales. */
function pantalla(lineas, tc) {
    const importes = lineas.map((l) =>
        C.lineaEnMoneda({ precio: l.precioCent / 100, cantidad: l.cant, descuento: l.dsctDeci / 10 }, "S", tc).importe);
    const t = C.totalesEnMoneda(importes, "S", 0);
    return { sinIgv: Math.round(t.sinIgv * 100), igv: Math.round(t.igv * 100), total: Math.round(t.total * 100) };
}

/* Lo que hacia la pantalla antes: el importe de cada linea en dolares (2 decimales), el IGV sin redondear, y cada total
   multiplicado por el tipo de cambio. */
function antes(lineas, tc) {
    const dos = (n) => Math.round(n * 100) / 100;
    const base = lineas.reduce((a, l) => a + dos(l.precioCent / 100 * l.cant * (1 - l.dsctDeci / 1000)), 0);
    const aSoles = (d) => Math.round(d * tc * 100);
    return { sinIgv: aSoles(base), igv: aSoles(base * 0.18), total: aSoles(base * 1.18) };
}

let semilla = 20261023;
const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296; };

const TIPOS_DE_CAMBIO = [3.45, 3.437, 3.362, 3.408, 3.75, 3.5];
const CARRITOS = 60000;
let distintos = 0, distintosAntes = 0, distintosRegla = 0, primeroDistinto = null;

for (let i = 0; i < CARRITOS; i++) {
    const tc = TIPOS_DE_CAMBIO[Math.floor(azar() * TIPOS_DE_CAMBIO.length)];
    const lineas = Array.from({ length: 1 + Math.floor(azar() * 5) }, () => ({
        precioCent: 100 + Math.floor(azar() * 60000),
        cant: 1 + Math.floor(azar() * 100),
        dsctDeci: [0, 0, 10, 20, 25, 30, 50, 75, 100][Math.floor(azar() * 9)]
    }));

    const exacto = referencia(lineas, Math.round(tc * 1000));
    const real = pantalla(lineas, tc);
    const previo = antes(lineas, tc);

    if (JSON.stringify(exacto) !== JSON.stringify(real)) {
        distintos++;
        if (!primeroDistinto) primeroDistinto = { lineas, tc, exacto, real };
    }
    if (JSON.stringify(exacto) !== JSON.stringify(previo)) distintosAntes++;
    if (JSON.stringify(exacto) !== JSON.stringify(reglaAnterior(lineas, Math.round(tc * 1000)))) distintosRegla++;
}

ok(`${CARRITOS} carritos: la pantalla coincide con la referencia al centimo`, distintos, 0);
if (primeroDistinto) console.log("         primer caso:", JSON.stringify(primeroDistinto));
ok("y lo de antes (convertir el total en dolares) no coincidia en la mayoria", distintosAntes / CARRITOS > 0.8, true);
console.log(`         (lo de antes difiere en ${(distintosAntes / CARRITOS * 100).toFixed(1)} % de los carritos)`);
ok("y la regla anterior de la linea, que el backend corrigio, tampoco: la prueba distingue las dos", distintosRegla / CARRITOS > 0.2, true);
console.log(`         (la regla anterior difiere en ${(distintosRegla / CARRITOS * 100).toFixed(1)} % de los carritos)`);

/* Sin BigInt (un navegador muy viejo) se cae al calculo en coma flotante de siempre: lo que no puede es romper el archivo. */
console.log("\n— sin BigInt —");
{
    const sinBigInt = vm.createContext({ console, document: { getElementById: () => null }, Number, Math, parseInt, isFinite, String, Array });
    sinBigInt.window = sinBigInt;
    sinBigInt.global = sinBigInt;
    vm.runInContext("var CDK = {}; BigInt = undefined;", sinBigInt);
    vm.runInContext(leer("js/cotizacion/campos.js"), sinBigInt);
    const F = sinBigInt.CDK.coti;

    ok("el archivo carga", typeof F.lineaEnMoneda, "function");
    ok("el precio unitario del documento (27.497)", F.precioEnMoneda(7.97, "S", 3.45), 27.497);
    ok("la linea del documento (160.86)", F.lineaEnMoneda({ precio: 7.97, cantidad: 6, descuento: 2.5 }, "S", 3.45).importe, 160.86);
    const f69 = F.lineaEnMoneda({ precio: 41.52, cantidad: 100, descuento: 3 }, "S", 3.45);
    ok("098-00000069: 143.244 y 13 895.00", [f69.precioUnitario, f69.importe], [143.244, 13895]);
    const tf = F.totalesEnMoneda([f69.importe], "S", 0);
    ok("098-00000069: IGV y total", [tf.igv, tf.total], [2501.1, 16396.1]);
    ok("redondear sigue sin los errores de la coma flotante", F.redondear(1.005, 2), 1.01);
}

/* =====================================================================================================================
 * Montaje de paginas reales
 * =================================================================================================================== */
function sobre(data, extra) { return Object.assign({ status: "ok", codigo: 0, data }, extra || {}); }

function respuestaJson(obj, status) {
    return Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        // El backend devuelve JSON que contiene un JSON en texto.
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });
}

async function montar(pagina, backend, alCargar) {
    let html = leer(pagina);
    html = html.replace(/<script src="https:\/\/[^"]*"><\/script>/g, "");
    html = html.replace(/<link[^>]*cdnjs[^>]*>/g, "");
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/" + pagina,
        runScripts: "outside-only", pretendToBeVisual: true
    });

    const w = dom.window;
    w.fetch = (url, opciones) => backend(String(url), opciones);
    w.scrollTo = () => {};
    w.HTMLElement.prototype.scrollIntoView = function () {};

    /* Lo que el navegador restaura al recargar: la ultima eleccion del selector. */
    if (alCargar && alCargar.antes) alCargar.antes(w.document);

    for (const rel of scripts) {
        try { w.eval(leer(rel)); }
        catch (e) { console.log(`  FALLA  al cargar ${rel}: ${e.message}`); fallos++; erroresDeCarga++; }
    }

    /* Lo que se ve ANTES de que /vendedor responda: se mide aqui, en el mismo turno. */
    const inicial = alCargar && alCargar.despues ? alCargar.despues(w.document) : null;
    return { w, doc: w.document, inicial };
}

const clic = (w) => new w.MouseEvent("click", { bubbles: true });
const pulsar = (doc, id) => doc.getElementById(id).dispatchEvent(clic(doc.defaultView));
function escribir(doc, id, valor) {
    const n = doc.getElementById(id);
    n.value = valor;
    n.dispatchEvent(new doc.defaultView.Event("input", { bubbles: true }));
}
const textos = (doc, selector) => [...doc.querySelectorAll(selector)].map((n) => limpio(n.textContent));
const visible = (doc, id) => !doc.getElementById(id).classList.contains("hidden");

/** Acepta el CDK.modal que este abierto. */
function aceptarModal(doc) {
    const botones = doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    const confirmar = botones[botones.length - 1];
    if (confirmar) confirmar.dispatchEvent(clic(doc.defaultView));
}

/* =====================================================================================================================
 * 2 · Cotizacion nueva
 * =================================================================================================================== */
async function nuevaCotizacion() {
    const estado = {
        tipoCambio: 3.45,
        precio: 89.90,
        llamadas: [],
        pegar: () => ({ cuerpo: { status: "ok", codigo: 0, documento: "098-00000071", lineas: 1 }, status: 200 })
    };

    function backend(url, opciones) {
        const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
        estado.llamadas.push({ url, cuerpo });

        if (url.includes("/vendedor")) {
            return respuestaJson(sobre({ cotizacion: "Permite manejar cotizaciones" }, {
                nombre: "JUAN CARLOS", grupo: "VENTAS-EJECUTIVOS", tipo: "COBERTURA", tipoCambio: estado.tipoCambio
            }));
        }
        if (url.includes("/cliente/buscar")) return respuestaJson({ 0: { 0: "C10874", 1: "PC SUMINISTROS S.A.C.", 2: "20600828747" } });
        if (url.includes("/cliente/id")) {
            return respuestaJson({ 0: { 0: "C10874", 1: "PC SUMINISTROS S.A.C.", 2: "20600828747", 3: "V0345", 4: "14", 5: "F" } });
        }
        // 0 codigo, 1 descripcion, 2 princ, 3 mym, 4 tope, 5 precio, 6 piura
        if (url.includes("/producto/buscar")) {
            return respuestaJson({ 0: { 0: "0505-012610", 1: "TONER TN-450 NEGRO", 2: 12, 3: 3, 4: 6, 5: estado.precio, 6: 0 } });
        }
        if (url.includes("/promocion/recolector")) return respuestaJson(sobre(["15112"]));
        if (url.includes("/promocion/detalle")) {
            return respuestaJson(sobre({
                0: { codigo: "15112", descripcion: "TCL REBATE", cantidad: 2, montoDescuento: 15.00, monedaDescuento: "D",
                     itemdescr: "TONER TN-450 NEGRO", tipo: ["descuento"] },
                tipo: ["descuento"], descripcion: "TCL REBATE"
            }));
        }
        if (url.includes("/cotizacion/pegar")) {
            const r = estado.pegar(cuerpo);
            return respuestaJson(r.cuerpo, r.status);
        }
        if (url.includes("/promocion/acoplar")) return respuestaJson(sobre({ ndocu: cuerpo.ndocu }));
        if (url.includes("/cotizacion")) return respuestaJson(sobre(["crear", "leer", "update", "delete", "alm"]));
        return respuestaJson({ msg: "no simulado: " + url }, 404);
    }

    /** Cliente, un producto (4 % de descuento si no se dice otro) y la cantidad pedida. */
    async function armarCarrito(w, doc, cantidad, descuento) {
        pulsar(doc, "btn-buscar-cliente");
        escribir(doc, "input-busqueda", "20600828747");
        await pausa(80);
        doc.querySelector("#recorrer-clientes .cdk-articulo").dispatchEvent(clic(w));
        await pausa(80);

        pulsar(doc, "btn-buscar-producto");
        escribir(doc, "input-busqueda-producto", "TONER");
        await pausa(600);
        doc.querySelector("#recorrer-productos .cdk-articulo").dispatchEvent(clic(w));
        await pausa(50);
        const dscto = descuento === undefined ? 4 : descuento;
        if (dscto) {
            escribir(doc, "conf-descuento", String(dscto));
            await pausa(20);
        }
        doc.querySelector("#recorrer-productos .cdk-config .cdk-boton--primario").dispatchEvent(clic(w));
        await pausa(50);
        pulsar(doc, "btn-cancelar-busqueda-producto");
        await pausa(250);

        if (cantidad && cantidad !== 1) {
            doc.querySelector("#lista-carrito .cdk-articulo").dispatchEvent(clic(w));
            await pausa(50);
            escribir(doc, "edit-cantidad", String(cantidad));
            await pausa(20);
            pulsar(doc, "btn-guardar-cambios");
            await pausa(80);
        }
    }

    function cambiarMoneda(w, doc, valor) {
        const selector = doc.getElementById("alm");
        selector.value = valor;
        selector.dispatchEvent(new w.Event("change", { bubbles: true }));
    }

    return { estado, backend, armarCarrito, cambiarMoneda };
}

(async function () {
    /* ------------------------------------------------------------------------------------------------ con tipo de cambio */
    console.log("\n— cotizacion nueva, con tipo de cambio de hoy —");
    {
        const N = await nuevaCotizacion();
        const { w, doc, inicial } = await montar("cotizacion/cotizacion_nuevo.html", N.backend, {
            despues: (d) => ({
                opcionSolesDesactivada: d.querySelector('#alm option[value="S"]').disabled,
                avisoVisible: !d.getElementById("aviso-soles").classList.contains("hidden")
            })
        });

        ok("antes de saber el tipo de cambio, soles esta desactivada", inicial.opcionSolesDesactivada, true);
        ok("y no se avisa de nada todavia (no es un problema)",        inicial.avisoVisible, false);

        await pausa(80);
        const opcionSoles = doc.querySelector('#alm option[value="S"]');
        ok("sin errores al cargar", erroresDeCarga, 0);
        ok("al llegar el tipo de cambio, soles se activa", opcionSoles.disabled, false);
        ok("sin aviso", visible(doc, "aviso-soles"), false);
        ok("arranca en dolares", w.almc_id, "D");
        ok("el boton de promociones esta activo", doc.getElementById("btn-promociones").disabled, false);
        ok("y no hay aviso de promociones", visible(doc, "aviso-promos-soles"), false);

        /* --- en dolares, como siempre --- */
        await N.armarCarrito(w, doc, 7);
        ok("el producto entro", Object.keys(w.productosSeleccionados).length, 1);
        ok("dolares: la linea",
           textos(doc, "#lista-carrito .cdk-articulo__detalle")[0], "7 × $ 89.90 · desc. 4.00%");
        ok("dolares: el importe", textos(doc, "#lista-carrito .cdk-articulo__importe")[0], "$ 604.13");
        ok("dolares: sin IGV, IGV y total",
           textos(doc, "#totales-carrito .cdk-total__valor"), ["$ 604.13", "$ 108.74", "$ 712.87"]);

        /* --- se pasa a soles --- */
        console.log("\n— se elige soles —");
        N.cambiarMoneda(w, doc, "S");
        await pausa(40);

        ok("la moneda que se manda es soles", w.almc_id, "S");
        ok("la linea: precio unitario a 3 decimales",
           textos(doc, "#lista-carrito .cdk-articulo__detalle")[0], "7 × S/ 310.155 · desc. 4.00%");
        /* 310.155 × 0.96 = 297.7488 -> 297.75 (el precio con descuento, a 2 decimales); × 7 = 2 084.25. */
        ok("el importe es el del ERP: el precio con descuento (297.75) por la cantidad",
           textos(doc, "#lista-carrito .cdk-articulo__importe")[0], "S/ 2,084.25");
        /* IGV: 2 084.25 × 0.18 = 375.165 -> 375.17 (la mitad sube); total = suma + IGV. Convertir los totales en dolares daba
           375.16 y 2 459.41: el IGV y el total, un centimo menos. */
        ok("sin IGV, IGV y total, con la regla del ERP",
           textos(doc, "#totales-carrito .cdk-total__valor"), ["S/ 2,084.25", "S/ 375.17", "S/ 2,459.42"]);
        const totalesTexto = doc.getElementById("totales-carrito").textContent;
        ok("y no la conversion de antes (IGV 375.16, total 2,459.41)",
           totalesTexto.includes("375.16") || totalesTexto.includes("2,459.41"), false);

        ok("el boton de promociones se desactiva", doc.getElementById("btn-promociones").disabled, true);
        ok("y se dice por que", visible(doc, "aviso-promos-soles"), true);

        /* Aunque algo lo invoque, el panel de promociones no se abre en soles. */
        w.abrirModalPromociones();
        await pausa(30);
        ok("el panel de promociones no se abre", doc.getElementById("modal-promociones").classList.contains("hidden"), true);
        ok("no consulto el recolector", N.estado.llamadas.some((l) => l.url.includes("/promocion/recolector")), false);

        /* El panel de editar una linea tambien habla en soles. */
        doc.querySelector("#lista-carrito .cdk-articulo").dispatchEvent(clic(w));
        await pausa(50);
        ok("editar: el valor de venta es el del ERP", limpio(doc.getElementById("edit-valor-venta").textContent), "2084.25");
        ok("editar: en PEN", limpio(doc.getElementById("edit-moneda-venta").textContent), "PEN");
        pulsar(doc, "btn-cancelar-edicion");
        await pausa(30);

        /* El panel de cantidad del buscador: precio unitario con 3 decimales e importe del ERP. */
        pulsar(doc, "btn-buscar-producto");
        escribir(doc, "input-busqueda-producto", "TONER");
        await pausa(600);
        ok("la lista de productos enseña el precio en soles con 3 decimales",
           textos(doc, "#recorrer-productos .cdk-articulo__importe")[0], "S/ 310.155");
        pulsar(doc, "btn-cancelar-busqueda-producto");
        await pausa(60);

        /* --- vuelve a dolares --- */
        N.cambiarMoneda(w, doc, "D");
        await pausa(40);
        ok("de vuelta en dolares", w.almc_id, "D");
        ok("el importe vuelve a ser el de dolares", textos(doc, "#lista-carrito .cdk-articulo__importe")[0], "$ 604.13");
        ok("las promociones se pueden pedir otra vez", doc.getElementById("btn-promociones").disabled, false);
        ok("y el aviso se va", visible(doc, "aviso-promos-soles"), false);

        /* --- crear en soles --- */
        console.log("\n— crear en soles —");
        N.cambiarMoneda(w, doc, "S");
        await pausa(40);

        N.estado.pegar = (c) => ({
            cuerpo: { status: "ok", codigo: 0, documento: "098-00000071", lineas: 1,
                      moneda: c.moneda, tcam: 3.45, totales: { tota: 2084.25, toti: 375.17, totn: 2459.42 } },
            status: 200
        });
        pulsar(doc, "creacion");
        await pausa(250);

        const pegar = N.estado.llamadas.find((l) => l.url.includes("/cotizacion/pegar"));
        ok("llamo a /cotizacion/pegar", !!pegar, true);
        ok("manda la moneda: soles", pegar.cuerpo.moneda, "S");
        /* LO QUE NO CAMBIA: los precios siguen yendo en dolares, este como este el selector. */
        const linea = pegar.cuerpo.productos[0];
        ok("el precio unitario va en DOLARES", linea.precioUnitario, 89.90);
        ok("el importe de la linea va en DOLARES", linea.preciosinIGV, 604.13);
        ok("la cantidad", linea.cantidad, 7);
        ok("el descuento", linea.descuento, 4);

        const mensaje = limpio(doc.querySelector(".cdk-modal__mensaje").textContent);
        ok("el resultado dice el numero", mensaje.includes("098-00000071"), true);
        ok("y lo que se grabo, en la moneda del documento",
           mensaje.includes("Total sin IGV: S/ 2,084.25 · IGV: S/ 375.17 · Total: S/ 2,459.42"), true);
        ok("con el tipo de cambio", mensaje.includes("Tipo de cambio: 3.450"), true);

        aceptarModal(doc);
        await pausa(60);

        ok("vacio el carrito", Object.keys(w.productosSeleccionados).length, 0);
        /* Antes solo se reponia la global, y el selector se quedaba en soles: la siguiente cotizacion se veia en soles y se
           mandaba en dolares. */
        ok("el selector vuelve a dolares", doc.getElementById("alm").value, "D");
        ok("y la moneda que se manda tambien", w.almc_id, "D");
        ok("el boton de promociones esta activo otra vez", doc.getElementById("btn-promociones").disabled, false);
        ok("y sin el aviso", visible(doc, "aviso-promos-soles"), false);

        /* --- crear en dolares, con un backend que todavia no responde `moneda` --- */
        console.log("\n— crear en dolares (el backend aun no manda moneda) —");
        N.estado.pegar = () => ({
            cuerpo: { status: "ok", codigo: 0, documento: "098-00000072", lineas: 1,
                      totales: { tota: 604.13, toti: 108.74, totn: 712.87 } },
            status: 200
        });
        await N.armarCarrito(w, doc, 7);
        pulsar(doc, "creacion");
        await pausa(250);

        const pegarD = N.estado.llamadas.filter((l) => l.url.includes("/cotizacion/pegar"))[1];
        ok("en dolares manda la moneda D", pegarD.cuerpo.moneda, "D");
        ok("con el precio en dolares", pegarD.cuerpo.productos[0].precioUnitario, 89.90);
        const mensajeD = limpio(doc.querySelector(".cdk-modal__mensaje").textContent);
        ok("el resultado dice el numero", mensajeD.includes("098-00000072"), true);
        /* Sin `moneda` en la respuesta no se inventa nada: ni se calcula ni se muestra un total que el backend no dio. */
        ok("y no muestra totales que el backend no dijo", mensajeD.includes("Total"), false);
        aceptarModal(doc);
    }

    /* ----------------------------------------------------------------------------------- las promociones se retiran en soles */
    console.log("\n— con promociones aceptadas, al pasar a soles —");
    {
        const N = await nuevaCotizacion();
        const { w, doc } = await montar("cotizacion/cotizacion_nuevo.html", N.backend);
        await pausa(80);

        await N.armarCarrito(w, doc, 2);
        pulsar(doc, "btn-promociones");
        await pausa(150);
        pulsar(doc, "btn-aplicar-promo");
        await pausa(80);
        ok("la promocion esta aplicada", w.promocionesAplicadas.length, 1);
        ok("y a la vista en el carrito", doc.querySelectorAll("#lista-carrito .cdk-articulo--descuento").length, 1);

        N.cambiarMoneda(w, doc, "S");
        await pausa(60);

        ok("al elegir soles se retiran", w.promocionesAplicadas.length, 0);
        ok("y se van del carrito", doc.querySelectorAll("#lista-carrito .cdk-articulo--descuento").length, 0);
        const aviso = textos(doc, ".cdk-toast__texto").find((t) => t.includes("Se retiraron")) || "";
        ok("el aviso dice por que", aviso, "Se retiraron las promociones porque pasaste a soles, que no admite promociones.");
        /* No hay nada que volver a consultar: en soles no hay promociones. */
        ok("y no dice que las vuelva a consultar", aviso.includes("Vuelve a consultarlas"), false);

        /* Cambiar la linea EN DOLARES sigue pidiendo volver a consultarlas, como siempre. */
        N.cambiarMoneda(w, doc, "D");
        await pausa(40);
        pulsar(doc, "btn-promociones");
        await pausa(150);
        pulsar(doc, "btn-aplicar-promo");
        await pausa(80);
        doc.querySelector("#lista-carrito .cdk-articulo").dispatchEvent(clic(w));
        await pausa(50);
        escribir(doc, "edit-cantidad", "5");
        pulsar(doc, "btn-guardar-cambios");
        await pausa(80);
        const toasts = textos(doc, ".cdk-toast__texto");
        ok("en dolares, cambiar una linea sigue diciendo que las vuelva a consultar",
           toasts.some((t) => t.includes("Vuelve a consultarlas")), true);
    }

    /* ----------------------------------------------------------------------------------------- el IGV de una cotizacion en soles */
    console.log("\n— el IGV de una cotizacion en soles —");
    {
        const N = await nuevaCotizacion();
        N.estado.precio = 2.39;
        const { w, doc } = await montar("cotizacion/cotizacion_nuevo.html", N.backend);
        await pausa(80);

        await N.armarCarrito(w, doc, 1, 0);
        N.cambiarMoneda(w, doc, "S");
        await pausa(40);

        /* 2.39 × 3.45 = 8.2455 -> 8.246; sin descuento el precio con descuento es 8.25, y la linea tambien. IGV: 8.25 × 0.18 = 1.485,
           que el ERP redondea a 1.49. La formula de dolares (sin redondear) lo enseñaria como 1.48. */
        ok("la linea", textos(doc, "#lista-carrito .cdk-articulo__importe")[0], "S/ 8.25");
        ok("sin IGV, IGV y total: el IGV se redondea como el ERP",
           textos(doc, "#totales-carrito .cdk-total__valor"), ["S/ 8.25", "S/ 1.49", "S/ 9.74"]);

        N.cambiarMoneda(w, doc, "D");
        await pausa(40);
        ok("en dolares el IGV sigue siendo el de siempre, sin tocar",
           textos(doc, "#totales-carrito .cdk-total__valor"), ["$ 2.39", "$ 0.43", "$ 2.82"]);
    }

    /* ----------------------------------------------------------------------------------- el panel de cantidad, en soles */
    console.log("\n— el panel de cantidad del buscador, en soles —");
    {
        const N = await nuevaCotizacion();
        const { w, doc } = await montar("cotizacion/cotizacion_nuevo.html", N.backend);
        await pausa(80);

        pulsar(doc, "btn-buscar-cliente");
        escribir(doc, "input-busqueda", "20600828747");
        await pausa(80);
        doc.querySelector("#recorrer-clientes .cdk-articulo").dispatchEvent(clic(w));
        await pausa(80);

        N.cambiarMoneda(w, doc, "S");
        await pausa(40);

        pulsar(doc, "btn-buscar-producto");
        escribir(doc, "input-busqueda-producto", "TONER");
        await pausa(600);
        ok("la lista, con el precio en soles a 3 decimales",
           textos(doc, "#recorrer-productos .cdk-articulo__importe")[0], "S/ 310.155");

        doc.querySelector("#recorrer-productos .cdk-articulo").dispatchEvent(clic(w));
        await pausa(50);
        /* 1 unidad sin descuento: 310.155 -> 310.16 (la mitad hacia arriba) */
        ok("1 unidad: precio unitario e importe",
           textos(doc, "#recorrer-productos .cdk-config .cdk-total__valor"), ["S/ 310.155", "S/ 310.16"]);

        escribir(doc, "conf-descuento", "4");
        await pausa(20);
        /* 310.155 × 0.96 = 297.7488 */
        ok("con 4 %: el importe sale del precio unitario en soles",
           textos(doc, "#recorrer-productos .cdk-config .cdk-total__valor"), ["S/ 310.155", "S/ 297.75"]);
    }

    /* ----------------------------------------------------------------------------------------- sin tipo de cambio de hoy */
    console.log("\n— cotizacion nueva, SIN tipo de cambio de hoy —");
    {
        const N = await nuevaCotizacion();
        N.estado.tipoCambio = null;
        N.estado.pegar = () => ({
            cuerpo: { status: "tipcambio no registrado", codigo: 2, data: null, msg: "no hay tipo de cambio registrado para hoy" },
            status: 400
        });

        /* El navegador restaura "PEN" al recargar: se parte de ahi. */
        const { w, doc } = await montar("cotizacion/cotizacion_nuevo.html", N.backend, {
            antes: (d) => { d.getElementById("alm").value = "S"; }
        });
        await pausa(80);

        const opcionSoles = doc.querySelector('#alm option[value="S"]');
        ok("soles queda desactivada", opcionSoles.disabled, true);
        ok("se avisa por que", visible(doc, "aviso-soles"), true);
        ok("el aviso lo dice claro", limpio(doc.getElementById("aviso-soles").textContent).includes("Hoy no hay tipo de cambio"), true);
        ok("lo restaurado no cuenta: el selector queda en dolares", doc.getElementById("alm").value, "D");
        ok("la moneda es dolares", w.CDK.coti.moneda(), "D");
        ok("y no hay tipo de cambio inventado", w.CDK.coti.tipoCambio(), null);

        /* Aunque se fuerce, no hay soles. */
        N.cambiarMoneda(w, doc, "S");
        await pausa(30);
        ok("forzar soles no sirve: el selector vuelve", doc.getElementById("alm").value, "D");
        ok("la moneda que se manda sigue siendo D", w.almc_id, "D");

        /* /pegar rechaza en cualquier moneda, y el trabajo no se pierde. */
        await N.armarCarrito(w, doc, 2);
        pulsar(doc, "creacion");
        await pausa(250);
        const titulo = doc.querySelector(".cdk-modal__titulo");
        ok("el rechazo se dice", titulo && titulo.textContent, "No se pudo crear");
        ok("con el motivo del backend",
           limpio(doc.querySelector(".cdk-modal__mensaje").textContent).includes("no hay tipo de cambio registrado para hoy"), true);
        aceptarModal(doc);
        await pausa(40);
        ok("el carrito sigue intacto", Object.keys(w.productosSeleccionados).length, 1);
    }

    await modificar();
    await ver();

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});

/* =====================================================================================================================
 * 3 · Modificar una cotizacion en soles
 * =================================================================================================================== */
async function modificar() {
    console.log("\n— modificar una cotizacion en soles (grabada como la graba el ERP) —");

    const llamadas = [];

    /* 098-00000070: dos lineas, tipo de cambio 3.45, moneda del documento S y de la LINEA D (es la de origen del producto). */
    function filaSoles(ndocu, tc, codigo, descr, cant, preu, importe, dscto, conIgv, cost) {
        return {
            0: "F", 1: "2026-10-23T00:00:00.000Z", 2: "31", 3: ndocu,
            4: "C12171", 5: tc, 6: "S", 7: "D", 8: "S", 9: "item",
            10: codigo, 11: "PN-" + codigo, 12: "EPSON", 13: "UND", 14: descr,
            15: cant, 16: preu, 17: importe, 18: dscto, 19: conIgv, 20: "01", 21: cost, 22: "S",
            23: "DISTRIBUIDORA ANDINA S.A.C.", 24: "JR. PABLO BERMUDEZ 150", 25: "EDA RIVERA"
        };
    }

    function backend(url, opciones) {
        const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
        llamadas.push({ url, cuerpo });

        if (url.includes("/vendedor")) {
            return respuestaJson({ status: "ok", codigo: 0, data: { cotizacion: "x" }, nombre: "JUAN", tipo: "COBERTURA", tipoCambio: 3.5 });
        }
        if (url.includes("/lista/cotisxdia")) {
            return respuestaJson({
                0: { 0: "2026/10/23", 1: "098-00000070", 2: "DISTRIBUIDORA ANDINA S.A.C.", 3: 858.63, 4: "S", 5: "2026-10-23 12:30:00", 6: "cotizado", 7: 1 },
                1: { 0: "2026/10/23", 1: "098-00000075", 2: "SIN TIPO DE CAMBIO S.A.C.", 3: 100.00, 4: "S", 5: "2026-10-23 12:40:00", 6: "cotizado", 7: 1 }
            });
        }
        if (url.includes("/cotizacion/read")) {
            if (cuerpo.ncoti === "098-00000075") {
                /* Un documento en soles al que no le llego su tipo de cambio. */
                return respuestaJson({ 0: filaSoles("098-00000075", 0, "0505-012610", "BOTELLA TINTA NEGRO", 4, 27.497, 107.8, 2, 127.2, 25.703) });
            }
            return respuestaJson({
                0: filaSoles("098-00000070", 3.45, "0505-012610", "BOTELLA TINTA EPSON T544120-AL NEGRO", 18, 27.497, 485.1, 2, 572.42, 25.703),
                1: filaSoles("098-00000070", 3.45, "0505-012615", "BOTELLA TINTA EPSON T544220-AL CIAN", 9, 27.497, 242.55, 2, 286.21, 25.703)
            });
        }
        if (url.includes("/producto/buscar")) {
            return respuestaJson({ 0: { 0: "0210-009911", 1: "MEMORIA USB 64GB", 2: 22, 3: 0, 4: 15, 5: 18.90, 6: 4 } });
        }
        // 8 precio (DOLARES), 9 descuento, 10 coste (DOLARES)
        if (url.includes("/producto/encontrado")) {
            return respuestaJson({ 0: "S", 1: "item", 2: "0210-009911", 3: "PN-009911", 4: "KINGSTON",
                                   5: "UND", 6: "MEMORIA USB 64GB", 7: null, 8: 18.90, 9: 10, 10: 14.75, 11: "S" });
        }
        if (url.includes("/cotizacion/update")) return respuestaJson({ status: "ok", codigo: 0, lineas: Object.keys(cuerpo.item || {}).length });
        if (url.includes("/cotizacion")) return respuestaJson({ status: "ok", codigo: 0, data: ["crear", "update"] });
        return respuestaJson({ msg: "no simulado: " + url }, 404);
    }

    const { w, doc } = await montar("cotizacion/cotizacion_modificar.html", backend);
    await pausa(80);

    const abrirDeLaLista = async (indice) => {
        doc.querySelectorAll("#lista-cotis .cdk-articulo")[indice].dispatchEvent(clic(w));
        await pausa(120);
    };

    ok("la lista trae las dos en soles", doc.querySelectorAll("#lista-cotis .cdk-articulo").length, 2);
    ok("el monto de la lista, en soles", textos(doc, "#lista-cotis .cdk-articulo__importe")[0].startsWith("S/"), true);

    await abrirDeLaLista(0);

    ok("no hay selector de moneda al editar (la moneda no cambia despues de crear)",
       !!doc.querySelector("#alm, select[aria-label='Moneda']"), false);
    ok("el cliente, y que esta en soles con SU tipo de cambio",
       textos(doc, "#datos-cliente")[0].includes("Soles · T.C. 3.450"), true);

    /* La moneda de la LINEA es "D", la del documento "S": manda la del documento, y los importes ya estan en soles. */
    ok("el precio unitario, a 3 decimales",
       textos(doc, "#aqui-nuevos .cdk-articulo [class*='cdk-dato']").filter((t) => t.includes("P. unit.")),
       ["P. unit. S/ 27.497", "P. unit. S/ 27.497"]);
    ok("los importes se ven tal como estan grabados, sin volver a multiplicarlos",
       textos(doc, "#aqui-nuevos .cdk-articulo__importe"), ["S/ 485.10", "S/ 242.55"]);
    ok("sin IGV, IGV y total",
       textos(doc, "#totales-coti .cdk-total__valor"), ["S/ 727.65", "S/ 130.98", "S/ 858.63"]);

    /* --- una cantidad nueva: el importe sale de su precio unitario en soles --- */
    doc.querySelectorAll("#aqui-nuevos .cdk-enlace-accion")[0].dispatchEvent(clic(w));
    await pausa(50);
    doc.getElementById("cantidad-valor").value = "20";
    pulsar(doc, "btn-confirmar-cantidad");
    await pausa(60);

    /* 27.497 × 0.98 = 26.94706 -> 26.95; × 20 = 539.00 */
    ok("20 unidades: el importe de la linea", textos(doc, "#aqui-nuevos .cdk-articulo__importe")[0], "S/ 539.00");
    ok("los totales",
       textos(doc, "#totales-coti .cdk-total__valor"), ["S/ 781.55", "S/ 140.68", "S/ 922.23"]);

    /* --- un producto nuevo: se convierte con el tipo de cambio DE LA COTIZACION (3.45), no con el del dia (3.5) --- */
    pulsar(doc, "cotimodificar-buscarnuevoproducto");
    const campo = doc.getElementById("producto");
    campo.value = "MEMORIA";
    campo.dispatchEvent(new w.Event("input", { bubbles: true }));
    await pausa(600);
    doc.querySelector("#recorrer-productos .cdk-articulo").dispatchEvent(clic(w));
    await pausa(50);
    pulsar(doc, "btn-confirmar-cantidad");
    await pausa(150);

    ok("ahora son tres lineas", doc.querySelectorAll("#aqui-nuevos .cdk-articulo").length, 3);
    /* 18.90 × 3.45 = 65.205;  65.205 × 0.9 = 58.6845 */
    ok("la linea nueva: precio unitario en soles con el T.C. de la cotizacion",
       textos(doc, "#aqui-nuevos .cdk-articulo [class*='cdk-dato']").filter((t) => t.includes("P. unit."))[2], "P. unit. S/ 65.205");
    ok("la linea nueva: importe", textos(doc, "#aqui-nuevos .cdk-articulo__importe")[2], "S/ 58.68");
    ok("los totales con la linea nueva",
       textos(doc, "#totales-coti .cdk-total__valor"), ["S/ 840.23", "S/ 151.24", "S/ 991.47"]);

    /* --- lo que viaja a /cotizacion/update --- */
    pulsar(doc, "crear-modificacion");
    await pausa(150);

    const update = llamadas.find((l) => l.url.includes("/cotizacion/update"));
    ok("llamo a update", !!update, true);
    ok("con tres lineas", Object.keys(update.cuerpo.item).length, 3);

    const nuevaFila = update.cuerpo.item["0210-009911"];
    ok("22 posiciones", nuevaFila.length, 22);
    ok("la linea nueva: preu en soles (pos 16)",      nuevaFila[15], 65.205);
    ok("la linea nueva: importe en soles (pos 17)",   nuevaFila[16], 58.68);
    ok("la linea nueva: importe con IGV (pos 19)",    nuevaFila[18], 69.24);
    ok("la linea nueva: cost en soles, 3 decimales (pos 21)", nuevaFila[20], 50.888);
    ok("la linea nueva: tcam de la COTIZACION (pos 5)", nuevaFila[4], 3.45);
    ok("la linea nueva: mone del documento (pos 6)",  nuevaFila[5], "S");
    ok("la linea nueva: mone de la linea, como llego (pos 7)", nuevaFila[6], "D");

    const vieja = update.cuerpo.item["0505-012610"];
    ok("la linea que ya estaba: su preu, como la dio /read", vieja[15], 27.497);
    ok("la linea que ya estaba: la cantidad nueva",          vieja[14], 20);
    ok("la linea que ya estaba: su importe nuevo",           vieja[16], 539);
    ok("la linea que ya estaba: su importe con IGV",         vieja[18], 636.02);
    ok("la linea que ya estaba: su coste, como llego",       vieja[20], 25.703);
    ok("y su tcam",                                          vieja[4], 3.45);

    const intacta = update.cuerpo.item["0505-012615"];
    ok("la que no se toco, igual que la dio /read: importe",  intacta[16], 242.55);
    ok("la que no se toco: con IGV",                          intacta[18], 286.21);

    aceptarModal(doc);
    await pausa(80);

    /* --- sin el tipo de cambio de la cotizacion no se puede agregar un producto --- */
    console.log("\n— una cotizacion en soles sin su tipo de cambio —");
    await abrirDeLaLista(1);
    ok("no inventa uno: el encabezado dice Soles, sin T.C.",
       textos(doc, "#datos-cliente")[0].includes("Soles") && !textos(doc, "#datos-cliente")[0].includes("T.C."), true);

    const antes = llamadas.filter((l) => l.url.includes("/producto/encontrado")).length;
    pulsar(doc, "cotimodificar-buscarnuevoproducto");
    const campo2 = doc.getElementById("producto");
    campo2.value = "MEMORIA";
    campo2.dispatchEvent(new w.Event("input", { bubbles: true }));
    await pausa(600);
    doc.querySelector("#recorrer-productos .cdk-articulo").dispatchEvent(clic(w));
    await pausa(50);
    pulsar(doc, "btn-confirmar-cantidad");
    await pausa(150);

    ok("no se agrego la linea", doc.querySelectorAll("#aqui-nuevos .cdk-articulo").length, 1);
    ok("ni siquiera pidio el precio", llamadas.filter((l) => l.url.includes("/producto/encontrado")).length, antes);
    ok("y se dijo por que",
       textos(doc, ".cdk-toast__texto").some((t) => t.includes("no trae su tipo de cambio")), true);
}

/* =====================================================================================================================
 * 4 · Ver una cotizacion en soles hecha en el ERP
 * =================================================================================================================== */
async function ver() {
    console.log("\n— ver una cotizacion en soles (moneda de la linea D) —");

    function backend(url, opciones) {
        const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};

        if (url.includes("/vendedor")) {
            return respuestaJson({ status: "ok", codigo: 0, data: { cotizacion: "x" }, nombre: "JUAN", tipo: "COBERTURA", tipoCambio: 3.45 });
        }
        if (url.includes("/lista/cotisxdia")) {
            return respuestaJson({ 0: { 0: "2026/10/23", 1: "098-00000070", 2: "DISTRIBUIDORA ANDINA S.A.C.", 3: 868.56, 4: "S",
                                        5: "2026-10-23 12:30:00", 6: "cotizado" } });
        }
        if (url.includes("/cotizacion/read")) {
            const fila = (codigo, descr, cant, preu, importe, conIgv, dscto) => ({
                0: "F", 1: "2026-10-23T00:00:00.000Z", 2: "31", 3: "098-00000070", 4: "C12171", 5: 3.45, 6: "S", 7: "D",
                8: "S", 9: "item", 10: codigo, 11: "PN", 12: "EPSON", 13: "UND", 14: descr, 15: cant, 16: preu, 17: importe,
                18: dscto === undefined ? 2 : dscto, 19: conIgv, 20: "01", 21: 25.703, 22: "S",
                23: "DISTRIBUIDORA ANDINA S.A.C.", 24: "JR. PABLO BERMUDEZ 150", 25: "EDA RIVERA"
            });
            return respuestaJson({
                0: fila("0505-012610", "BOTELLA TINTA NEGRO", 18, 27.497, 485.1, 572.42),
                1: fila("0505-012615", "BOTELLA TINTA CIAN", 9, 27.497, 242.55, 286.21),
                2: fila("0505-012620", "CABLE USB NEGRO", 1, 8.5, 8.42, 9.94, 1)
            });
        }
        if (url.includes("/cotizacion")) return respuestaJson({ status: "ok", codigo: 0, data: ["crear", "leer"] });
        return respuestaJson({ msg: "no simulado: " + url }, 404);
    }

    const { w, doc } = await montar("cotizacion/cotizacion_observar.html", backend);
    await pausa(80);

    doc.querySelector("#lista-cotis .cdk-articulo").dispatchEvent(clic(w));
    await pausa(150);

    const resumen = doc.getElementById("contendor-final-final");
    const importes = textos(doc, "#contendor-final-final .cdk-articulo__importe");
    ok("las lineas, en soles (la moneda del documento, no la de la linea)", importes, ["S/ 485.10", "S/ 242.55", "S/ 8.42"]);
    ok("el resumen no habla de dolares", limpio(resumen.textContent).includes("$"), false);
    /* Texto seguido, sin espacio entre la etiqueta y el valor: asi lo da textContent. */
    ok("Subtotal, IGV y Total en soles",
       ["SubtotalS/ 736.07", "IGVS/ 132.49", "TotalS/ 868.56"].every((t) => limpio(resumen.textContent).includes(t)), true);
    /* El precio unitario esta grabado con 3 decimales: a 2 se veria 27.50. */
    ok("el precio unitario con 3 decimales, como esta grabado",
       limpio(resumen.textContent).includes("P. unit. S/ 27.497"), true);

    /* El impreso del cliente: el precio con descuento es el del ERP, y cantidad × ese precio da el total de la linea. */
    pulsar(doc, "btn-vista-documento");
    await pausa(80);
    const impreso = doc.getElementById("lienzo-documento").textContent;
    ok("el impreso: Precio LISTA con 3 decimales", impreso.includes("27.497"), true);
    ok("el impreso: Precio DSCTO (27.497 con 2 %) = 26.950", impreso.includes("26.950"), true);
    ok("el impreso: 18 × 26.95 = 485.10, el total de la linea", impreso.includes("485.10"), true);
    /* 8.5 con 1 % es 8.415 exacto: el ERP lo redondea a 8.42; en coma flotante saldria 8.41. */
    ok("el impreso: la mitad exacta sube (8.420, no 8.410)", impreso.includes("8.420") && !impreso.includes("8.410"), true);
    ok("el impreso: en soles", impreso.includes("SOLES"), true);
}
