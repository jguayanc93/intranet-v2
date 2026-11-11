/**
 * Prueba de integracion de ajuste directo y asignacion (grupo 25), sobre las paginas reales:
 * «Mis documentos», el documento y «Asignados».
 *
 * Lo que mas importa:
 *
 *   · que la lista diga que fechas se ven (los ultimos 30 dias por defecto), que se encuentre uno
 *     antiguo por su numero, y que avise cuando hay mas de 100
 *   · que ajustar sea solo el precio (nunca viaja la cantidad), redondeado y validado como en «Recibidas»,
 *     que una linea sin costo no se pueda tocar, y que se avise de lo que se pierde, flete incluido
 *   · que lo que no se puede hacer se diga con el motivo del backend
 *   · que asignar pida confirmacion, avise cuando el precio ajustado se puede perder, y deje claro a
 *     quien se le paso; y que despues el documento sea del vendedor
 *   · que «Asignados» diga el total al asignarlo y en que quedo hoy
 *
 * El simulacro es dev/simulador-ajuste-directo.js, el mismo de dev/servidor.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const ajusteSim = require("../simulador-ajuste");
const directoSim = require("../simulador-ajuste-directo");

const S = marcasSim.estado;
const RAIZ = path.resolve(__dirname, "..", "..");

let fallos = 0;
function ok(etiqueta, real, esperado) {
    const bien = JSON.stringify(real) === JSON.stringify(esperado);
    if (!bien) fallos++;
    console.log(`${bien ? "  ok  " : " FALLA"} ${etiqueta}`);
    if (!bien) console.log(`         esperado: ${JSON.stringify(esperado)}\n         real:     ${JSON.stringify(real)}`);
}

/* =====================================================================
 * El backend simulado
 * =================================================================== */
let llamadas = [];
let forzar = null;           // (ruta, cuerpo) -> respuesta armada, para probar errores
let alterar = null;          // (camino, cuerpo, resultado) -> resultado
let accesosHub;

function respuesta(obj, status) {
    const cuerpo = JSON.stringify(obj);
    return Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(cuerpo)
    });
}

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    const metodo = (opciones && opciones.method) || "GET";
    llamadas.push({ url, cuerpo, metodo });

    const ruta = url.replace(/^https?:\/\/[^/]+\/v1/, "");
    const forzada = forzar && forzar(ruta, cuerpo);
    if (forzada) return forzada;

    const [camino, consulta] = ruta.split("?");
    const q = new URLSearchParams(consulta || "");

    if (camino === "/vendedor") {
        return respuesta({ status: "ok", codigo: 0, data: { ajuste: "Ajuste de precio de cotizaciones y pedidos" },
                           nombre: "JUAN CARLOS", grupo: "VENTAS-JEFES DE PROD", tipo: S.rol, tipoCambio: 3.75 });
    }
    if (camino === "/ajuste") return respuesta({ status: "ok", codigo: 0, data: accesosHub || ["recibidas", "directo", "asignados"] });

    const p = { tipo: q.get("tipo"), ndocu: q.get("ndocu"), desde: q.get("desde"), hasta: q.get("hasta"), pista: q.get("pista") };
    let r = null;
    if (camino === "/ajuste/directo/documentos") r = directoSim.documentos(p);
    else if (camino === "/ajuste/directo/documento") r = directoSim.documento(p);
    else if (camino === "/ajuste/directo/aplicar") r = directoSim.aplicar(cuerpo);
    else if (camino === "/ajuste/directo/vendedores") r = directoSim.vendedores(p);
    else if (camino === "/ajuste/directo/asignar") r = directoSim.asignar(cuerpo);
    else if (camino === "/ajuste/asignados") r = directoSim.asignados(p);

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
    if (alterar) r = alterar(camino, cuerpo, r) || r;
    return respuesta(r.cuerpo, r.status);
}

/* =====================================================================
 * Montar la pagina real
 * =================================================================== */
function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar(pagina, consulta) {
    let html = leer(pagina);
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/" + pagina + (consulta || ""),
        runScripts: "outside-only", pretendToBeVisual: true
    });
    const w = dom.window;
    const destinos = [];

    const Real = w.Date;
    w.Date = class extends Real {
        constructor(...a) { if (a.length) super(...a); else super(2026, 10, 6, 10); }
        static now() { return new Real(2026, 10, 6, 10).getTime(); }
    };

    const avisos = [];
    w.console.warn = (...a) => { avisos.push(a.join(" ")); };
    w.console.error = () => {};

    const real = w.location;
    w.__location = new Proxy({}, {
        get(_, clave) {
            if (clave === "replace" || clave === "assign") return (u) => { destinos.push(String(u)); };
            const v = real[clave];
            return typeof v === "function" ? v.bind(real) : v;
        }
    });
    w.fetch = (url, opciones) => responder(String(url), opciones);
    w.HTMLElement.prototype.scrollIntoView = function () {};

    for (const rel of scripts) {
        try { w.eval("(function (location) {\n" + leer(rel) + "\n})(window.__location)"); }
        catch (e) { console.log(`  FALLA  ${rel}: ${e.message}`); fallos++; }
    }

    return { w, doc: w.document, destinos, avisos };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
const escribir = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("input", { bubbles: true })); };
const cambiar = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("change", { bubbles: true })); };
const marcar = (p, n, si) => { n.checked = si; n.dispatchEvent(new p.w.Event("change", { bubbles: true })); };
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);
const posts = (ls) => ls.filter((l) => l.metodo === "POST").map((l) => ({ ruta: l.url.replace(/^.*\/v1/, ""), cuerpo: l.cuerpo }));
const getsA = (ls, parte) => ls.filter((l) => l.metodo === "GET" && l.url.includes(parte)).map((l) => l.url.replace(/^.*\/v1/, ""));
const sinNbsp = (t) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);
const valorDe = (nodo, etiqueta) => {
    const m = [...nodo.querySelectorAll(".cdk-medida")]
        .find((x) => x.querySelector(".cdk-medida__etiqueta").textContent === etiqueta);
    return m ? texto(m.querySelector(".cdk-medida__valor")) : null;
};

const $ = (p, id) => p.doc.getElementById(id);
const titulos = (p) => [...p.doc.querySelectorAll("#cdk-acciones .cdk-tarjeta__titulo")].map((n) => n.textContent);
const filas = (p, lista) => [...p.doc.querySelectorAll("#" + lista + " .cdk-articulo__nombre")].map((n) => texto(n));
const datosDe = (nodo) => [...nodo.querySelectorAll(".cdk-dato")].map((n) => texto(n));
const fila = (p, ndocu) => p.doc.querySelector('[data-ndocu="' + ndocu + '"]');
/** La fila se pulsa por su boton: es toda la fila. */
const abrirFila = (p, ndocu) => clic(p, fila(p, ndocu).querySelector("button"));

const modal = (p) => ({ titulo: texto(p.doc.querySelector(".cdk-modal__titulo")), mensaje: texto(p.doc.querySelector(".cdk-modal__mensaje")) });
const botonModal = (p, cual) => {
    const b = p.doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    return cual === "confirmar" ? b[b.length - 1] : b[0];
};

/** Una jefatura (071: ACER, y ADATA y TDK sin dueño de su familia) o un especialista con las marcas que se le den. */
function preparar(rol, opciones) {
    opciones = opciones || {};
    marcasSim.reiniciar(rol);
    forzar = null; alterar = null; accesosHub = undefined;

    if (rol === "ESPECIALISTA") {
        (opciones.marcas || ["0002", "0206"]).forEach((c) => { marcasSim.buscarMarca(c).dueno = "233"; });
        S.confirmados["233"] = true;
    }
    ajusteSim.reiniciar();
    directoSim.reiniciar();
}

const DOC = (tipo, ndocu) => "?tipo=" + tipo + "&ndocu=" + ndocu;

/** Elige un vendedor en la seccion de asignar y pulsa «Asignar»; devuelve el modal. */
async function elegirYAsignar(p, codven) {
    clic(p, p.doc.querySelector('[data-codven="' + codven + '"]'));
    clic(p, $(p, "documento-asignar-boton"));
    await pausa(60);
    return modal(p);
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Ajuste directo y asignación · grupo 25 ===\n");

    /* ================================================================ el hub */
    console.log("— el hub —");
    preparar("JEFATURA");
    let p = await montar("ajuste.html");
    await pausa(200);
    ok("carga sin errores", fallos, 0);
    ok("el grupo 25 ve sus tres acciones", titulos(p), ["Recibidas", "Mis documentos", "Asignados"]);
    ok("que llevan a sus pantallas", [...p.doc.querySelectorAll("#cdk-acciones a")].map((a) => a.getAttribute("href")),
       ["/ajuste/ajuste_recibidas.html", "/ajuste/ajuste_directo.html", "/ajuste/ajuste_asignados.html"]);
    ok("sin avisos de permisos sin declarar", p.avisos.some((a) => a.includes("sin declarar")), false);

    /* ===================================================== la lista */
    console.log("\n— Mis documentos —");
    preparar("JEFATURA");
    llamadas = [];
    p = await montar("ajuste/ajuste_directo.html");
    await pausa(250);
    ok("carga sin errores", fallos, 0);
    ok("entra por las cotizaciones, sin fechas: el backend da los ultimos 30 dias",
       getsA(llamadas, "/ajuste/directo/documentos"), ["/ajuste/directo/documentos?tipo=COT"]);
    ok("y se dice que fechas son", texto($(p, "directo-fechas-titulo")), "Fechas: del 07/10/2026 al 06/11/2026 (últimos 30 días)");
    ok("sin nada que quitar: no es un filtro elegido", $(p, "directo-fechas-quitar").classList.contains("hidden"), true);
    ok("los que se pueden ajustar o asignar, el mas reciente primero (no la convertida en pedido)",
       filas(p, "directo-documentos"), ["009-00969333", "009-00971194", "009-00971500", "009-00962947"]);
    ok("cada uno dice cuantas lineas son suyas y lo que se perderia",
       datosDe(fila(p, "009-00969333")), ["Fecha 03/11/2026", "Sin aprobar", "Tuyas 2 de 3", "1 promoción · con flete"]);
    ok("aprobada tambien se ofrece", datosDe(fila(p, "009-00971194")).includes("Aprobado"), true);
    ok("sin lineas suyas, se dice (y se ofrece igual: se puede asignar)", datosDe(fila(p, "009-00962947")).includes("Ninguna línea tuya"), true);
    ok("el importe es el total con IGV", texto(fila(p, "009-00969333").querySelector(".cdk-articulo__importe")), "$ 444.51");

    abrirFila(p, "009-00969333");
    ok("abrir uno lleva a su pantalla", p.destinos, ["/ajuste/ajuste_documento.html?tipo=COT&ndocu=009-00969333"]);

    llamadas = [];
    clic(p, $(p, "pestana-PED"));
    await pausa(200);
    ok("la pestaña de pedidos los pide aparte", getsA(llamadas, "/ajuste/directo/documentos"), ["/ajuste/directo/documentos?tipo=PED"]);
    ok("y los muestra", filas(p, "directo-documentos"), ["009-00774500", "009-00773963"]);
    ok("la pestaña queda en la direccion, para volver a ella", p.w.location.search, "?tipo=PED");
    abrirFila(p, "009-00773963");
    ok("y abrir uno lleva el tipo", p.destinos.pop(), "/ajuste/ajuste_documento.html?tipo=PED&ndocu=009-00773963");

    p = await montar("ajuste/ajuste_directo.html", "?tipo=PED");
    await pausa(250);
    ok("volviendo con ?tipo=PED se entra por los pedidos", [$(p, "pestana-PED").getAttribute("aria-selected"), filas(p, "directo-documentos").length], ["true", 2]);

    /* ---- buscar */
    p = await montar("ajuste/ajuste_directo.html");
    await pausa(250);
    escribir(p, $(p, "directo-buscar"), "magic");
    ok("el buscador filtra lo que llego, por cliente", filas(p, "directo-documentos"), ["009-00969333"]);
    escribir(p, $(p, "directo-buscar"), "962947");
    ok("o por numero", filas(p, "directo-documentos"), ["009-00962947"]);
    ok("un numero que esta no ofrece buscar en otras fechas", !!$(p, "directo-buscar-numero"), false);

    escribir(p, $(p, "directo-buscar"), "009-00821916");
    ok("uno antiguo no esta en los 30 dias, y se ofrece buscarlo en todas las fechas",
       [texto(p.doc.querySelector("#directo-lista .cdk-vacio, #directo-lista p")) !== null, texto($(p, "directo-buscar-numero"))],
       [true, "Buscar el 009-00821916 en todas las fechas"]);
    llamadas = [];
    clic(p, $(p, "directo-buscar-numero"));
    await pausa(200);
    ok("se pide solo por su numero, sin fechas", getsA(llamadas, "/ajuste/directo/documentos"),
       ["/ajuste/directo/documentos?tipo=COT&ndocu=009-00821916"]);
    ok("y aparece", filas(p, "directo-documentos"), ["009-00821916"]);
    ok("se dice que se esta buscando en todas las fechas, y el filtro de fechas se aparta",
       [texto(p.doc.querySelector("#directo-por-numero .cdk-aviso__texto")), $(p, "directo-fechas").classList.contains("hidden")],
       ["Buscando el 009-00821916 en todas las fechas.", true]);
    llamadas = [];
    clic(p, $(p, "directo-por-numero-quitar"));
    await pausa(200);
    ok("«Volver a la lista» vuelve a los 30 dias", [getsA(llamadas, "/ajuste/directo/documentos"), filas(p, "directo-documentos").length],
       [["/ajuste/directo/documentos?tipo=COT"], 4]);

    escribir(p, $(p, "directo-buscar"), "009-00971426");
    clic(p, $(p, "directo-buscar-numero"));
    await pausa(200);
    ok("la que ya se convirtio en pedido llega vacia, y se dice por que puede ser",
       texto($(p, "directo-lista")).includes("ya avanzó (se convirtió, se facturó o se anuló)"), true);

    /* ---- fechas */
    p = await montar("ajuste/ajuste_directo.html");
    await pausa(250);
    llamadas = [];
    cambiar(p, $(p, "directo-desde"), "2020-01-01");
    await pausa(150);
    cambiar(p, $(p, "directo-hasta"), "2026-11-30");
    await pausa(200);
    ok("cambiar las fechas vuelve a pedir con ellas", getsA(llamadas, "/ajuste/directo/documentos").pop(),
       "/ajuste/directo/documentos?tipo=COT&desde=2020-01-01&hasta=2026-11-30");
    ok("el titulo dice las elegidas, y ya no «últimos 30 días»", texto($(p, "directo-fechas-titulo")), "Fechas: del 01/01/2020 al 30/11/2026");
    ok("con mas de 100, lo avisa", texto($(p, "directo-hay-mas")),
       "Hay más de 100: se muestran los 100 más recientes. Acota las fechas para ver los demás.");
    ok("y muestra 100", p.doc.querySelectorAll("#directo-documentos > li").length, 100);
    llamadas = [];
    clic(p, $(p, "directo-fechas-quitar"));
    await pausa(200);
    ok("«Volver a los últimos 30 días» quita el filtro", [getsA(llamadas, "/ajuste/directo/documentos"), !!$(p, "directo-hay-mas")],
       [["/ajuste/directo/documentos?tipo=COT"], false]);

    llamadas = [];
    cambiar(p, $(p, "directo-desde"), "2026-11-10");
    cambiar(p, $(p, "directo-hasta"), "2026-11-01");
    await pausa(150);
    ok("un desde posterior al hasta no se pide: se dice", [getsA(llamadas, "/ajuste/directo/documentos").length, texto($(p, "directo-fechas-error"))],
       [0, "La fecha de inicio no puede ser posterior a la de fin."]);

    preparar("JEFATURA");
    forzar = (ruta) => ruta.startsWith("/ajuste/directo/documentos")
        ? respuesta({ status: "fechas invalidas", codigo: 2, msg: "desde y hasta son fechas AAAA-MM-DD" }, 400) : null;
    p = await montar("ajuste/ajuste_directo.html");
    await pausa(250);
    ok("`400 fechas invalidas`: el mensaje junto a las fechas, y no otra lista",
       [texto($(p, "directo-fechas-error")), texto($(p, "directo-lista"))],
       ["desde y hasta son fechas AAAA-MM-DD", "Corrige las fechas para ver los documentos."]);

    preparar("JEFATURA");
    S.yaRegistrado = false;
    p = await montar("ajuste/ajuste_directo.html");
    await pausa(250);
    ok("sin registrarse, el camino al formulario", p.doc.querySelector("#ajuste-sin-alta a").getAttribute("href"), "/autenticador.html");

    preparar("ESPECIALISTA", { marcas: [] });
    p = await montar("ajuste/ajuste_directo.html");
    await pausa(250);
    ok("un especialista sin marcas del mes ve sus documentos, sin lineas suyas",
       [filas(p, "directo-documentos").length, datosDe(fila(p, "009-00969333")).includes("Ninguna línea tuya")], [4, true]);

    /* ===================================================== ajustar */
    console.log("\n— ajustar el precio —");
    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00969333"));
    await pausa(300);
    ok("carga sin errores", fallos, 0);
    ok("el documento, su cliente y su total", [texto($(p, "documento-titulo")), texto($(p, "documento-cliente")),
       datosDe($(p, "documento-cabecera"))], ["Cotización 009-00969333", "MAGIC STAR S.R.L.",
       ["Fecha 03/11/2026", "Moneda Dólares", "Sin aprobar", "Total $ 444.51 con IGV"]]);
    ok("avisa que se quitan las promociones, nombrando el flete", texto($(p, "documento-aviso-promos")),
       "Al aplicar se quitan TODAS las promociones del documento, también las de otras marcas: tiene 1 promoción, " +
       "entre ellas el descuento de flete de provincia, que no vuelve a aplicarse solo.");
    ok("que solo se cambia el precio, y que el ERP no cambia",
       [texto($(p, "documento-aviso-precio")), texto($(p, "documento-aviso-erp"))],
       ["Aquí solo se cambia el precio: ni la cantidad ni las líneas.", "El precio del producto en el ERP no cambia: el ajuste es solo de este documento."]);
    ok("sus lineas: TDK y ACER", [...p.doc.querySelectorAll("#documento-lineas > li")].map((n) => n.id), ["linea-1", "linea-2"]);
    ok("las de otras marcas, aparte y solo para ver", [texto($(p, "documento-aviso-otras")), filas(p, "documento-otras"),
       texto(p.doc.querySelector("#otra-3 .cdk-pista"))],
       ["Tiene 1 línea de otras marcas: las ves abajo, pero no las puedes tocar.", ["BOTELLA DE TINTA EPSON 664 NEGRO"], "12 × $ 7.97 = $ 95.64"]);
    ok("sin controles en las otras", p.doc.querySelectorAll("#documento-otras input").length, 0);
    ok("el costo con sus decimales y el minimo al lado", valorDe($(p, "linea-1"), "Costo"), "$ 18.4033 · mínimo $ 18.41");
    ok("nunca hay cantidad", [!!$(p, "linea-1-cantidad"), !!$(p, "linea-2-cantidad")], [false, false]);
    ok("aplicar empieza apagado, y dice que hacer", [$(p, "documento-aplicar").disabled, texto($(p, "documento-resumen"))],
       [true, "Marca las líneas que quieres ajustar."]);

    marcar(p, $(p, "linea-1-activa"), true);
    ok("el precio de lista esta bajo el costo: no basta con marcarla", [texto($(p, "linea-1-error")), $(p, "documento-aplicar").disabled],
       ["El precio no puede ser menor que el costo (costo $ 18.4033, mínimo $ 18.41).", true]);
    escribir(p, $(p, "linea-1-precio"), "17");
    ok("subir sin llegar al minimo tampoco", $(p, "documento-aplicar").disabled, true);
    escribir(p, $(p, "linea-1-precio"), "18.404");
    ok("18.404 se guarda como 18.40: no vale", $(p, "documento-aplicar").disabled, true);
    escribir(p, $(p, "linea-1-precio"), "18.405");
    ok("18.405 se guarda como 18.41, y se dice", [texto($(p, "linea-1-calculo")).startsWith("Se guarda como $ 18.41."),
       $(p, "documento-aplicar").disabled, texto($(p, "documento-resumen"))], [true, false, "Vas a ajustar 1 de 2 líneas."]);

    marcar(p, $(p, "linea-2-activa"), true);
    ok("la que tiene descuento dice lo que paga hoy y que pasa a 0",
       texto($(p, "linea-2-dscto")).startsWith("Hoy el cliente paga $ 73.0275 c/u (precio $ 74.90 con 2.5 % de descuento)"), true);
    marcar(p, $(p, "linea-2-activa"), false);

    llamadas = [];
    clic(p, $(p, "documento-aplicar"));
    await pausa(60);
    ok("se confirma antes, diciendo lo que se pierde (el flete tambien)", modal(p), {
        titulo: "¿Aplicar el ajuste?",
        mensaje: "Vas a ajustar 1 línea. En ellas el descuento del cliente pasa a 0 y el precio que pusiste es el que paga. " +
                 "Se quitarán 1 promoción de todo el documento, incluido el descuento de flete de provincia, que no vuelve a aplicarse solo. " +
                 "Podrás volver a ajustarlo después."
    });
    clic(p, botonModal(p, "cancelar"));
    await pausa(60);
    ok("cancelar no manda nada", posts(llamadas), []);

    escribir(p, $(p, "documento-observacion"), "  precio por volumen  ");
    clic(p, $(p, "documento-aplicar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(400);
    ok("viaja solo el precio, ya redondeado, sin cantidad, y la observacion limpia", posts(llamadas), [{
        ruta: "/ajuste/directo/aplicar",
        cuerpo: { tipo: "COT", ndocu: "009-00969333", lineas: [{ item: 1, precio: 18.41 }], observacion: "precio por volumen" }
    }]);
    ok("despues vuelve a pedir el documento", getsA(llamadas, "/ajuste/directo/documento?").length, 1);
    ok("y dice lo que paso: las promociones que se fueron y los totales nuevos",
       [texto($(p, "documento-promos-quitadas")), texto($(p, "documento-totales"))],
       ["Se quitaron 1 promoción del documento.", "Total del documento: $ 425.80 sin IGV · $ 76.64 de IGV · $ 502.44 con IGV."]);
    ok("ya no tiene promociones de que avisar", !!$(p, "documento-aviso-promos"), false);
    ok("el ajuste queda en el historial", [filas(p, "documento-historial").length,
       texto(p.doc.querySelector("#documento-historial .cdk-articulo__detalle"))], [1, "«precio por volumen»"]);
    ok("con lo que cambio", [...p.doc.querySelectorAll("#documento-historial .cdk-pista")].map(texto),
       ["CD-R TDK 80 MIN 700MB (TORRE X50): 10 × $ 15.00 → $ 18.41 sin descuento",
        "Total con IGV $ 444.51 → $ 502.44 · se quitaron 1 promoción."]);

    /* Se puede volver a ajustar. */
    marcar(p, $(p, "linea-2-activa"), true);
    escribir(p, $(p, "linea-2-precio"), "80");
    clic(p, $(p, "documento-aplicar"));
    await pausa(60);
    ok("la segunda vez no hay promociones que avisar", modal(p).mensaje.includes("promoci"), false);
    clic(p, botonModal(p, "confirmar"));
    await pausa(400);
    ok("se ajusta otra vez, y el historial pone el mas reciente primero",
       [...p.doc.querySelectorAll("#documento-historial > li")].map((n) => n.getAttribute("data-ajuste")), ["2", "1"]);

    /* ---- errores al aplicar */
    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00969333"));
    await pausa(300);
    marcar(p, $(p, "linea-2-activa"), true);
    forzar = (ruta) => ruta === "/ajuste/directo/aplicar"
        ? respuesta({ status: "precio bajo costo", codigo: 3, msg: "el precio no puede ser menor que el costo (63.00)" }, 409) : null;
    llamadas = [];
    clic(p, $(p, "documento-aplicar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("`precio bajo costo`: se dice y no se pierde lo escrito",
       [toasts(p.doc).includes("el precio no puede ser menor que el costo (63.00)"), getsA(llamadas, "/ajuste/directo/documento?").length,
        $(p, "linea-2-activa").checked, $(p, "documento-aplicar").disabled], [true, 0, true, false]);

    forzar = (ruta) => ruta === "/ajuste/directo/aplicar"
        ? respuesta({ status: "documento no ajustable", codigo: 3, msg: "el documento ya se convirtio" }, 409) : null;
    llamadas = [];
    clic(p, $(p, "documento-aplicar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("`documento no ajustable`: se dice y se vuelve a pedir", [toasts(p.doc).includes("el documento ya se convirtio"),
       getsA(llamadas, "/ajuste/directo/documento?").length], [true, 1]);
    forzar = null;

    /* ---- una linea sin costo */
    console.log("\n— una línea sin costo —");
    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00971194"));
    await pausa(300);
    ok("se ve sin controles y se dice por que", [!!$(p, "linea-2-activa"), texto($(p, "linea-2-sin-costo")), valorDe($(p, "linea-2"), "Costo")],
       [false, "Este producto no tiene costo cargado en su almacén: su precio no se puede ajustar.", "Sin costo en este almacén"]);
    ok("la otra si se ajusta", !!$(p, "linea-1-activa"), true);
    ok("y siendo aprobada, avisa que sigue aprobada", texto($(p, "documento-aviso-erp")).endsWith("Y sigue aprobado."), true);

    /* ===================================================== lo que no se puede */
    console.log("\n— lo que no se puede, y por qué —");
    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00962947"));
    await pausa(300);
    ok("sin lineas suyas: lo dice, sin aplicar, pero se puede asignar",
       [texto($(p, "documento-motivo")), !!$(p, "documento-seccion-aplicar"), !!$(p, "documento-seccion-asignar")],
       ["Ninguna línea es de tus marcas este mes: no hay precio que ajustar, pero puedes asignarlo a un vendedor.", false, true]);
    ok("y ve todas las lineas del documento, que son de otras marcas", filas(p, "documento-otras").length, 2);
    ok("sin seccion de «Tus líneas»", !!$(p, "documento-seccion-lineas"), false);

    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00971426"));
    await pausa(300);
    ok("convertida en pedido: lo dice una vez, y no se puede ni ajustar ni asignar",
       [texto($(p, "documento-motivo")), !!$(p, "documento-seccion-aplicar"), !!$(p, "documento-seccion-asignar")],
       ["Este documento ya avanzó (convertida en pedido): ya no se puede ajustar ni asignar.", false, false]);
    ok("sus lineas se ven, sin controles", [p.doc.querySelectorAll("#documento-lineas > li").length, p.doc.querySelectorAll("#documento-lineas input").length], [1, 0]);

    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00971500"));
    await pausa(300);
    ok("en ajuste: lo dice", texto($(p, "documento-motivo")),
       "Tiene una solicitud de ajuste de un vendedor sin responder: no se puede ajustar ni asignar hasta que la respondan o venza.");

    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00999999"));
    await pausa(300);
    ok("uno que no es suyo: no existe, con el camino de vuelta y donde buscar lo asignado",
       [!!$(p, "documento-no-existe"), $(p, "documento-volver").getAttribute("href"), texto($(p, "documento-no-existe")).includes("«Asignados»")],
       [true, "/ajuste/ajuste_directo.html?tipo=COT", true]);

    llamadas = [];
    p = await montar("ajuste/ajuste_documento.html", "?ndocu=009-00969333");
    await pausa(200);
    ok("sin tipo no pide nada, y lo dice", [getsA(llamadas, "/ajuste/directo/documento").length, !!$(p, "documento-no-existe")], [0, true]);

    /* ===================================================== asignar */
    console.log("\n— asignar —");
    preparar("JEFATURA");
    llamadas = [];
    p = await montar("ajuste/ajuste_documento.html", DOC("PED", "009-00773963"));
    await pausa(300);
    ok("trae los vendedores del grupo 20, por nombre", [getsA(llamadas, "/ajuste/directo/vendedores"), filas(p, "asignar-vendedores")],
       [["/ajuste/directo/vendedores"], ["GONZALES CRISTOPHER", "HUAMANI ANTHONY", "MENDOZA RIVERA LUIS", "QUISPE ROSARIO",
                                          "TORRES MILAGROS", "UBILLUZ ZEGARRA ANTHONY JUNIOR"]]);
    ok("con su codigo y su tipo", texto(p.doc.querySelector('[data-codven="V0278"] .cdk-articulo__detalle')), "V0278 · Cobertura");
    ok("asignar empieza apagado", [$(p, "documento-asignar-boton").disabled, texto($(p, "asignar-elegido"))], [true, "Elige a quién se lo pasas."]);

    llamadas = [];
    escribir(p, $(p, "asignar-buscar"), "anthony");
    await pausa(450);
    ok("buscar pide al backend con la pista", [getsA(llamadas, "/ajuste/directo/vendedores"), filas(p, "asignar-vendedores")],
       [["/ajuste/directo/vendedores?pista=anthony"], ["HUAMANI ANTHONY", "UBILLUZ ZEGARRA ANTHONY JUNIOR"]]);
    escribir(p, $(p, "asignar-buscar"), "zzz");
    await pausa(450);
    ok("sin coincidencias, se dice", texto($(p, "asignar-lista")), "Ningún vendedor del grupo 20 coincide con «zzz».");
    escribir(p, $(p, "asignar-buscar"), "anthony");
    await pausa(450);

    clic(p, p.doc.querySelector('[data-codven="V0278"]'));
    ok("elegir uno lo dice, y el boton lleva su nombre",
       [texto($(p, "asignar-elegido")), texto($(p, "documento-asignar-boton")), $(p, "documento-asignar-boton").disabled,
        p.doc.querySelector('[data-codven="V0278"]').getAttribute("aria-pressed")],
       ["Lo pasarás a HUAMANI ANTHONY (V0278).", "Asignar a HUAMANI ANTHONY", false, "true"]);

    llamadas = [];
    clic(p, $(p, "documento-asignar-boton"));
    await pausa(60);
    ok("se confirma antes: a quien, que deja de verlo y que no se deshace", modal(p), {
        titulo: "¿Asignar a HUAMANI ANTHONY?",
        mensaje: "Vas a pasar el pedido 009-00773963 a HUAMANI ANTHONY. Desde ese momento es suyo y ya no lo verás en «Mis documentos». " +
                 "No se puede deshacer desde la intranet."
    });
    clic(p, botonModal(p, "cancelar"));
    await pausa(60);
    ok("cancelar no manda nada", posts(llamadas), []);

    clic(p, $(p, "documento-asignar-boton"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(350);
    ok("manda el documento y el codigo del vendedor", posts(llamadas), [{
        ruta: "/ajuste/directo/asignar", cuerpo: { tipo: "PED", ndocu: "009-00773963", codven: "V0278" } }]);
    ok("y dice a quien se lo paso, con el camino a «Asignados»",
       [texto($(p, "documento-asignado-a")), $(p, "documento-ir-asignados").getAttribute("href"), !!$(p, "documento-seccion-lineas")],
       ["Ahora es de HUAMANI ANTHONY (V0278): lo ve en sus listas como suyo.", "/ajuste/ajuste_asignados.html", false]);
    ok("ya no es suyo: el backend responde 403", directoSim.documento({ tipo: "PED", ndocu: "009-00773963" }).status, 403);

    /* El orden: aplicar no cierra el documento, asignar si. Que la pantalla lo diga antes de que se pierda algo. */
    console.log("\n— primero aplicar, despues asignar —");
    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_documento.html", DOC("PED", "009-00773963"));
    await pausa(300);
    const visible = (n) => !!n && n.style.display !== "none";
    const casillas = () => [...p.doc.querySelectorAll('#documento-lineas input[type="checkbox"]')];
    ok("asignar dice el orden: primero aplicar", texto($(p, "asignar-orden")),
       "Si vas a ajustar el precio, aplícalo antes de asignar: después ya no podrás.");
    ok("sin nada marcado, no hay aviso de lo no aplicado", visible($(p, "asignar-sin-aplicar")), false);

    marcar(p, casillas()[0], true);
    ok("con una marcada y sin aplicar, se avisa al lado de asignar",
       [visible($(p, "asignar-sin-aplicar")), texto($(p, "asignar-sin-aplicar"))],
       [true, "Tienes 1 línea marcada sin aplicar: aplícala primero o se perderá al asignar."]);
    marcar(p, casillas()[1], true);
    ok("con dos, en plural", texto($(p, "asignar-sin-aplicar")),
       "Tienes 2 líneas marcadas sin aplicar: aplícalas primero o se perderán al asignar.");
    marcar(p, casillas()[1], false);
    marcar(p, casillas()[0], false);
    ok("desmarcadas, el aviso se va", visible($(p, "asignar-sin-aplicar")), false);

    const item = casillas()[0].id.replace(/^linea-(\d+)-activa$/, "$1");
    marcar(p, casillas()[0], true);
    escribir(p, $(p, "linea-" + item + "-precio"), "500");
    llamadas = [];
    clic(p, $(p, "documento-aplicar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(400);
    ok("aplicado: dice que ahora se puede asignar, con este precio", texto($(p, "documento-ahora-asignar")),
       "Si ya quedó como querías, ahora puedes asignarlo a un vendedor (abajo): lo recibe con este precio.");
    ok("y asignar sigue ahí, sin aviso de lo no aplicado (ya se aplicó)",
       [!!$(p, "documento-seccion-asignar"), visible($(p, "asignar-sin-aplicar")), !!$(p, "documento-seccion-aplicar")],
       [true, false, true]);

    let m = await elegirYAsignar(p, "V0278");
    ok("la confirmacion ya no habla de precios sin aplicar", m.mensaje.includes("no aplicaste"), false);
    clic(p, botonModal(p, "confirmar"));
    await pausa(350);
    ok("asignado despues de ajustar: en «Asignados» con su ajuste", directoSim.asignados({}).cuerpo.data.asignados
        .filter((a) => a.ndocu === "009-00773963").map((a) => [a.vendedor.codven, a.ajustes]), [["V0278", 1]]);

    /* Sin lineas que ajustar no hay orden que explicar. */
    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00962947"));
    await pausa(300);
    ok("sin lineas propias: asignar sin la nota del orden ni el aviso",
       [!!$(p, "documento-seccion-asignar"), !!$(p, "asignar-orden"), visible($(p, "asignar-sin-aplicar"))], [true, false, false]);

    /* Una cotizacion sin aprobar ya ajustada: el precio se pierde si el vendedor la modifica. */
    preparar("JEFATURA");
    directoSim.aplicar({ tipo: "COT", ndocu: "009-00969333", lineas: [{ item: 2, precio: 80 }] });
    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00969333"));
    await pausa(300);
    marcar(p, $(p, "linea-1-activa"), true);
    m = await elegirYAsignar(p, "V0246");
    ok("ajustada y sin aprobar: avisa que el precio se pierde si la modifica, y lo marcado sin aplicar",
       m.mensaje.endsWith("No se puede deshacer desde la intranet. Si la modifica, su pantalla vuelve al precio de lista y el precio " +
                          "que ajustaste se pierde. Los precios que marcaste y no aplicaste no se guardan."), true);
    ok("en femenino, que es una cotizacion", m.mensaje.startsWith("Vas a pasar la cotización 009-00969333 a GONZALES CRISTOPHER. Desde ese momento es suya y ya no la verás"), true);
    clic(p, botonModal(p, "confirmar"));
    await pausa(350);
    S.rol = "CARTERA";
    ok("asignada al vendedor de la demo, le aparece en su lista de cotizaciones",
       Object.values(ajusteSim.listaCotizaciones().cuerpo).some((f) => f[1] === "009-00969333"), true);
    S.rol = "JEFATURA";

    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00971194"));
    await pausa(300);
    m = await elegirYAsignar(p, "V0278");
    ok("aprobada y sin ajustes: sin el aviso del precio", m.mensaje.includes("precio de lista"), false);
    clic(p, botonModal(p, "cancelar"));

    /* Errores al asignar. */
    forzar = (ruta) => ruta === "/ajuste/directo/asignar"
        ? respuesta({ status: "documento no asignable", codigo: 3, msg: "el documento ya se facturo" }, 409) : null;
    llamadas = [];
    await elegirYAsignar(p, "V0278");
    clic(p, botonModal(p, "confirmar"));
    await pausa(350);
    ok("`documento no asignable`: se dice y se vuelve a pedir", [toasts(p.doc).includes("el documento ya se facturo"),
       getsA(llamadas, "/ajuste/directo/documento?").length], [true, 1]);

    forzar = (ruta) => ruta === "/ajuste/directo/asignar"
        ? respuesta({ status: "vendedor invalido", codigo: 2, msg: "el codigo no es de un vendedor activo del grupo 20" }, 400) : null;
    llamadas = [];
    await pausa(200);
    await elegirYAsignar(p, "V0278");
    clic(p, botonModal(p, "confirmar"));
    await pausa(350);
    ok("`vendedor invalido`: se dice, sin perder la pantalla", [toasts(p.doc).includes("el codigo no es de un vendedor activo del grupo 20"),
       getsA(llamadas, "/ajuste/directo/documento?").length, $(p, "documento-asignar-boton").disabled], [true, 0, false]);
    forzar = null;

    preparar("JEFATURA");
    alterar = (camino, cuerpo, r) => (camino === "/ajuste/directo/vendedores"
        ? { status: 200, cuerpo: { status: "ok", codigo: 0, data: Object.assign({}, r.cuerpo.data, { hayMas: true }) } } : null);
    p = await montar("ajuste/ajuste_documento.html", DOC("COT", "009-00962947"));
    await pausa(300);
    ok("con mas de 50 vendedores, pide escribir mas", texto($(p, "asignar-hay-mas")), "Hay más vendedores: escribe más del nombre para encontrarlo.");
    alterar = null;

    /* ===================================================== asignados */
    console.log("\n— Asignados —");
    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_asignados.html");
    await pausa(250);
    ok("carga sin errores", fallos, 0);
    ok("sin nada asignado, dice donde se hace", texto($(p, "asignados-lista")),
       "Todavía no has asignado ningún documento. Se hace desde «Mis documentos».");
    ok("el filtro empieza plegado y sin fechas", [texto($(p, "asignados-fechas-titulo")), $(p, "asignados-fechas-quitar").classList.contains("hidden")],
       ["Filtrar por fecha de asignación", true]);

    directoSim.aplicar({ tipo: "PED", ndocu: "009-00773963", lineas: [{ item: 2, precio: 80 }] });
    directoSim.asignar({ tipo: "PED", ndocu: "009-00773963", codven: "V0278" });
    directoSim.asignar({ tipo: "COT", ndocu: "009-00962947", codven: "V0251" });
    p = await montar("ajuste/ajuste_asignados.html");
    await pausa(250);
    ok("lo asignado, lo mas reciente primero", filas(p, "asignados-documentos"), ["Cotización 009-00962947", "Pedido 009-00773963"]);
    const ped = p.doc.querySelector('[data-asignado="1"]');
    ok("a quien, cuando, en que quedo hoy y si se ajusto antes", datosDe(ped),
       ["A HUAMANI ANTHONY", "El 06/11/2026, 03:30 p. m.", "Hoy Aprobado", "Ajustado antes 1 vez"]);
    ok("con el total al asignarlo", texto(ped.querySelector(".cdk-articulo__importe")), "$ 897.04");
    ok("no se abre: ya es del vendedor", ped.querySelector("button"), null);

    directoSim.docDe("PED", "009-00773963").situacion = "facturado";
    p = await montar("ajuste/ajuste_asignados.html");
    await pausa(250);
    ok("si se facturo despues, lo dice", datosDe(p.doc.querySelector('[data-asignado="1"]')).includes("Hoy Facturado"), true);

    escribir(p, $(p, "asignados-buscar"), "ubilluz");
    ok("el buscador encuentra por vendedor", filas(p, "asignados-documentos"), ["Cotización 009-00962947"]);
    escribir(p, $(p, "asignados-buscar"), "");

    llamadas = [];
    cambiar(p, $(p, "asignados-desde"), "2026-11-07");
    await pausa(200);
    ok("filtrar por fecha vuelve a pedir, y dice que no hay en esas fechas",
       [getsA(llamadas, "/ajuste/asignados").pop(), texto($(p, "asignados-lista")), texto($(p, "asignados-fechas-titulo"))],
       ["/ajuste/asignados?desde=2026-11-07", "No asignaste nada desde el 07/11/2026.", "Fechas: desde el 07/11/2026"]);
    clic(p, $(p, "asignados-fechas-quitar"));
    await pausa(200);
    ok("quitar el filtro vuelve a todo", filas(p, "asignados-documentos").length, 2);

    alterar = (camino, cuerpo, r) => (camino === "/ajuste/asignados"
        ? { status: 200, cuerpo: { status: "ok", codigo: 0, data: Object.assign({}, r.cuerpo.data, { hayMas: true }) } } : null);
    p = await montar("ajuste/ajuste_asignados.html");
    await pausa(250);
    ok("con mas de 100, lo avisa", texto($(p, "asignados-hay-mas")),
       "Hay más de 100: se muestran los 100 más recientes. Filtra por fecha para ver los demás.");
    alterar = null;

    preparar("ESPECIALISTA");
    directoSim.asignar({ tipo: "COT", ndocu: "009-00962947", codven: "V0251" });
    marcasSim.reiniciar("JEFATURA");
    p = await montar("ajuste/ajuste_asignados.html");
    await pausa(250);
    ok("cada uno ve solo lo que asigno el", filas(p, "asignados-documentos"), []);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
