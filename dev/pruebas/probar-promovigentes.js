/**
 * Prueba de integracion del modulo `promovigentes` del grupo 20 (cartera y cobertura): las promociones vigentes para OFRECER, sobre la
 * pagina real (promovigentes.html).
 *
 * Lo que mas importa:
 *
 *   · que sea para ofrecer y NADA mas: sin montos (ni porcentajes ni cuanto se regala), sin botones que modifiquen, y las dos cosas que
 *     el ERP trae —el nombre, que a veces no dice nada, y la descripcion, que lo explica— a la vista
 *   · que NADA se calcule: el orden es el del backend (las que vencen antes primero), los dias salen de `diasRestantes` y no del reloj
 *     del equipo, y cuantos productos hay y cuantos tienen stock son los que manda el backend
 *   · que el stock se diga con TEXTO (`DISPONIBLE` / `AGOTADO`), que los agotados se vean atenuados y que nunca salga un numero
 *   · `soloAlgunosClientes` con su etiqueta y sin decir cuales; `tipo: null`; `disponibles: 0`; una descripcion vacia; sin vigentes
 *   · un `404 promocion no vigente` explicado, sin reintentar, y con la salida a la lista
 *   · el part number con su boton de copiar, y su caida cuando no hay portapapeles
 *   · el menu del grupo 20: «Promos vigentes» al final, en «Mas», y «Vender hoy» entrando en la barra inferior del movil
 *
 * El simulacro es dev/simulador-promovigentes.js, el mismo de dev/servidor.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const promoSim = require("../simulador-promovigentes");

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
let forzar = null;           // (ruta) -> respuesta armada, para probar errores
let alterar = null;          // (camino, resultado) -> resultado, para probar que no se calcula nada

function respuesta(obj, status) {
    const cuerpo = JSON.stringify(obj);
    return Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(cuerpo)
    });
}

/* Lo que recibe un vendedor del grupo 20 en el menu (dev/servidor.js, `modulosDe`): todo lo suyo mas las dos claves nuevas. */
const MENU = {
    cotizacion: "Crear, consultar y modificar cotizaciones", pedido: "Gestión de pedidos y flete", factura: "Modificación de datos de facturas",
    promocion: "Aplicar y quitar promociones", cuota: "Registro y avance de tu cuota mensual", listas: "Listados de cotizaciones, pedidos, facturas y clientes",
    programador: "Programación de entregas en almacén", ajuste: "Ajuste de precio de cotizaciones y pedidos",
    promovigentes: "Mira las promociones vigentes para ofrecer a tus clientes", quienvender: "Los 3 clientes de hoy: 2 para reponer y 1 para llamar"
};

function responder(url, opciones) {
    llamadas.push({ url, metodo: (opciones && opciones.method) || "GET" });

    const ruta = url.replace(/^https?:\/\/[^/]+\/v1/, "");

    const forzada = forzar && forzar(ruta);
    if (forzada) return forzada;

    const [camino] = ruta.split("?");

    if (camino === "/vendedor") {
        return respuesta({ status: "ok", codigo: 0, data: MENU, nombre: "CRISTOPHER GONZALES", grupo: "VENTAS-EJECUTIVOS", tipo: S.rol, tipoCambio: 3.75 });
    }

    let r = null;
    if (camino === "/promocion/vigentes") r = promoSim.lista();
    else if (camino.startsWith("/promocion/vigentes/")) r = promoSim.detalle(decodeURIComponent(camino.slice("/promocion/vigentes/".length)));

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
    if (alterar) r = alterar(camino, r) || r;

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

    const dom = new JSDOM(html, { url: "http://127.0.0.1:8080/" + pagina + (consulta || ""), runScripts: "outside-only", pretendToBeVisual: true });
    const w = dom.window;
    const destinos = [];

    /* Siempre el mismo dia: la prueba no puede depender del dia que se corra. */
    const Real = w.Date;
    w.Date = class extends Real {
        constructor(...a) { if (a.length) super(...a); else super(2026, 9, 29, 18); }
        static now() { return new Real(2026, 9, 29, 18).getTime(); }
    };

    const avisos = [];
    w.console.warn = (...a) => { avisos.push(a.join(" ")); };
    w.console.error = () => {};                 // el nucleo avisa de los fallos de red; aqui son a proposito

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
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);
const sinNbsp = (t) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);

const $ = (p, id) => p.doc.getElementById(id);
const rutas = () => llamadas.filter((l) => l.url.includes("/promocion/")).map((l) => l.url.replace(/^.*\/v1/, ""));

const idsDeLista = (p) => [...p.doc.querySelectorAll("#pv-promociones > li")].map((li) => li.getAttribute("data-idprom"));
const tarjeta = (p, idprom) => p.doc.querySelector(`#pv-promociones > li[data-idprom='${idprom}']`);
const nombreDe = (li) => texto(li.querySelector(".cdk-articulo__nombre"));
const descripcionDe = (li) => texto(li.querySelector(".pv-descripcion"));
const rotulosDe = (li) => [...li.querySelectorAll(".cdk-semaforo")].map((n) => texto(n));
const datosDe = (li) => [...li.querySelectorAll(".cdk-articulo__datos .cdk-dato")].map((n) => texto(n));
const filasDeProductos = (p) => [...p.doc.querySelectorAll("#pv-productos > li")];
const rotulosDeProducto = (li) => [...li.querySelectorAll(".cdk-semaforo")].map((n) => texto(n));
const filtrar = (p, idCaja, clave) => clic(p, p.doc.querySelector(`#${idCaja} [data-filtro='${clave}']`));
const pestanas = (p, idCaja) => [...p.doc.querySelectorAll(`#${idCaja} .cdk-pestana`)].map((b) => texto(b));
const pestanaActiva = (p, idCaja) => [...p.doc.querySelectorAll(`#${idCaja} .es-activa`)].map((b) => b.getAttribute("data-filtro"));

/* Lo que el backend dice, para comparar con lo que sale en pantalla. */
const lista = () => promoSim.lista().cuerpo.data;
const detalle = (id) => promoSim.detalle(id).cuerpo.data;

function preparar(rol) {
    marcasSim.reiniciar(rol || "COBERTURA");
    forzar = null; alterar = null;
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    /* ============================================================ el simulacro cumple el contrato */
    console.log("\n=== Grupo 20 · promociones vigentes ===\n");
    console.log("— el simulacro cumple lo que dice el documento —");
    preparar();
    const d = lista();
    const IDS_VENCIDAS = ["14898", "15124", "15217", "15218", "15227"];

    ok("20 vigentes, y `total` es cuantas llegan", [d.total, d.promociones.length], [20, 20]);
    ok("la primera vence el 2026-10-31, y la fecha es la de hoy", [d.promociones[0].venceEl, d.fecha], ["2026-10-31", "2026-10-29"]);
    ok("las cinco encendidas que ya vencieron no salen, ni la apagada, la que no empieza y la que no tiene productos",
       d.promociones.map((x) => x.idprom).filter((i) => IDS_VENCIDAS.concat(["15300", "15301", "15302"]).includes(i)), []);
    ok("van por vencimiento y, a igual vencimiento, por familia, marca y nombre",
       d.promociones.every((x, i) => i === 0 || [d.promociones[i - 1].venceEl, d.promociones[i - 1].familia, d.promociones[i - 1].marca, d.promociones[i - 1].nombre].join("|") <=
                                                  [x.venceEl, x.familia, x.marca, x.nombre].join("|")), true);
    ok("`idprom` llega como texto", d.promociones.every((x) => typeof x.idprom === "string"), true);
    ok("`diasRestantes` es de hoy al vencimiento: 2 para la que vence el 31/10", d.promociones[0].diasRestantes, 2);
    ok("`productos` y `disponibles` son los del detalle, de todas",
       d.promociones.every((x) => { const dd = detalle(x.idprom); return dd.productos.length === x.productos && dd.productos.filter((q) => q.disponibilidad === "DISPONIBLE").length === x.disponibles; }), true);
    ok("la 15221 es solo para algunos clientes, con marca HEWLETT PACKARD y 4 productos",
       [detalle("15221").promocion.soloAlgunosClientes, detalle("15221").promocion.marca, detalle("15221").productos.length], [true, "HEWLETT PACKARD", 4]);
    ok("la 14106 es de regalo, con 6 productos: 2 agotados y 4 disponibles",
       [detalle("14106").promocion.tipo, detalle("14106").productos.length, detalle("14106").productos.filter((q) => q.disponibilidad === "AGOTADO").length], ["REGALO", 6, 2]);
    ok("una vencida, una apagada y un id que no es numero: `404 promocion no vigente`",
       ["14898", "15300", "abc"].map((i) => [promoSim.detalle(i).status, promoSim.detalle(i).cuerpo.status]), [[404, "promocion no vigente"], [404, "promocion no vigente"], [404, "promocion no vigente"]]);
    const ORDEN_ALMACENES = ["PRINCIPAL", "M&M", "PIURA", "CHORRILLOS"];
    const todosLosProductos = d.promociones.map((x) => detalle(x.idprom).productos).reduce((a, b) => a.concat(b), []);
    ok("el detalle trae `almacenes` en cada producto; la lista no lo trae", [todosLosProductos.every((q) => Array.isArray(q.almacenes)), d.promociones.some((x) => "almacenes" in x)], [true, false]);
    ok("siempre en el orden PRINCIPAL, M&M, PIURA, CHORRILLOS, sin repetir",
       todosLosProductos.every((q) => q.almacenes.every((a, i) => ORDEN_ALMACENES.includes(a) && (i === 0 || ORDEN_ALMACENES.indexOf(q.almacenes[i - 1]) < ORDEN_ALMACENES.indexOf(a)))), true);
    ok("un AGOTADO trae [], y un DISPONIBLE trae al menos uno",
       todosLosProductos.every((q) => (q.disponibilidad === "AGOTADO") === (q.almacenes.length === 0)), true);
    ok("la 15221: el `1VV22AL` es DISPONIBLE solo en Piura",
       detalle("15221").productos.filter((q) => q.partNumber === "1VV22AL").map((q) => [q.disponibilidad, q.almacenes]), [["DISPONIBLE", ["PIURA"]]]);
    ok("la 14106: el `0-761345-20118-6` esta en Principal y M&M, y los 2 agotados traen []",
       [detalle("14106").productos.filter((q) => q.partNumber === "0-761345-20118-6")[0].almacenes,
        detalle("14106").productos.filter((q) => q.disponibilidad === "AGOTADO").map((q) => q.almacenes)], [["PRINCIPAL", "M&M"], [[], []]]);
    ok("el grupo 25 y el 34 reciben `403 sin permiso`, en la lista y en el detalle",
       ["ESPECIALISTA", "JEFATURA", "ZONA"].map((rol) => { marcasSim.reiniciar(rol); return [promoSim.lista().status, promoSim.detalle("15221").status, promoSim.lista().cuerpo.status]; }),
       [[403, 403, "sin permiso"], [403, 403, "sin permiso"], [403, 403, "sin permiso"]]);
    ok("no hay montos en ninguna parte del cuerpo", /monto|porcentaje|precio|importe|cantidad/i.test(JSON.stringify(d)), false);
    preparar();

    /* ============================================================ la lista */
    console.log("\n— la lista de las vigentes —");
    llamadas = [];
    let p = await montar("promovigentes.html");
    await pausa(250);

    ok("carga sin errores", fallos, 0);
    ok("pide la lista, una vez, y nada mas", rutas(), ["/promocion/vigentes"]);
    ok("se llama «Promos vigentes», y dice a que dia corresponde (el del backend)",
       [texto(p.doc.querySelector("h1")), p.doc.title, texto($(p, "periodo"))], ["Promos vigentes", "CDK · Promos vigentes", "Vigentes hoy, 29/10/2026"]);
    ok("las 20, en el orden del backend (las que vencen antes primero)", idsDeLista(p), d.promociones.map((x) => x.idprom));
    ok("ninguna vencida a la vista", idsDeLista(p).filter((i) => IDS_VENCIDAS.includes(i)), []);
    ok("dice que es para ofrecer, y de donde se aplica",
       texto($(p, "pv-lista-seccion").querySelector(".cdk-seccion__sub")).includes("Es para ofrecer: aplicar una promoción a una cotización se hace desde el módulo Promoción"), true);

    const c15221 = tarjeta(p, "15221");
    ok("el nombre y la descripcion, las dos: el nombre solo no dice nada",
       [nombreDe(c15221), descripcionDe(c15221)], ["HP BOTELLAS Q42026 DSCTO (CDK)", "Por la compra de 100 botellas GT52 y GT53, llevas un descuento especial."]);
    ok("su tipo y «solo algunos clientes», con texto y sin decir cuales", rotulosDe(c15221), ["Descuento", "Solo algunos clientes"]);
    ok("cuando vence (de `diasRestantes`), marca, familia y cuantos productos tienen stock",
       datosDe(c15221), ["Vence en 2 días (31/10/2026)", "Marca HEWLETT PACKARD", "Familia SUMINISTROS", "Con stock 4 de 4 productos"]);
    ok("una de regalo lo dice, y cuantos de sus productos hay: 4 de 6", [rotulosDe(tarjeta(p, "14106")), datosDe(tarjeta(p, "14106")).slice(-1)], [["Regalo"], ["Con stock 4 de 6 productos"]]);
    ok("una que es para todos no dice «solo algunos clientes»", rotulosDe(tarjeta(p, "15231")), ["Descuento"]);
    ok("no hay montos: ni porcentajes ni dolares ni soles", /[%$]|S\/|US\$/.test(texto($(p, "contenido"))), false);
    ok("no hay ningun boton que modifique algo: solo se toca una promocion para verla",
       [...p.doc.querySelectorAll("#contenido button")].filter((b) => !b.classList.contains("cdk-articulo--pulsable") && !b.classList.contains("cdk-pestana")).length, 0);
    ok("el stock no es un numero suelto: siempre «N de M»", datosDe(c15221).some((t) => /^Con stock \d+ de \d+ productos?$/.test(t)), true);

    clic(p, c15221.querySelector("button"));
    ok("tocar una lleva a su detalle", p.destinos, ["/promovigentes.html?id=15221"]);

    /* ---- buscar y filtrar */
    ok("tres pestañas de tipo, y «Todas» esta activa", [pestanas(p, "pv-filtros"), pestanaActiva(p, "pv-filtros")], [["Todas", "Descuento", "Regalo"], ["todas"]]);
    filtrar(p, "pv-filtros", "REGALO");
    ok("filtrar por «Regalo»", [idsDeLista(p), pestanaActiva(p, "pv-filtros")], [d.promociones.filter((x) => x.tipo === "REGALO").map((x) => x.idprom), ["REGALO"]]);
    ok("y dice cuantas se muestran de cuantas", texto($(p, "pv-cuenta")), `Se muestran ${d.promociones.filter((x) => x.tipo === "REGALO").length} de 20.`);
    filtrar(p, "pv-filtros", "DESCUENTO");
    ok("filtrar por «Descuento»", idsDeLista(p), d.promociones.filter((x) => x.tipo === "DESCUENTO").map((x) => x.idprom));
    filtrar(p, "pv-filtros", "todas");
    escribir(p, $(p, "pv-buscar"), "tcl");
    const conTcl = d.promociones.filter((x) => [x.nombre, x.descripcion, x.marca, x.familia].join(" ").toLowerCase().includes("tcl")).map((x) => x.idprom);
    ok("buscar por nombre, descripcion, marca o familia", [idsDeLista(p), conTcl.length > 0], [conTcl, true]);
    for (const termino of ["hewlett", "estabilizadores", "gt52"]) {          // solo en la marca, solo en la familia y solo en la descripcion
        escribir(p, $(p, "pv-buscar"), termino);
        const esperado = d.promociones.filter((x) => [x.nombre, x.descripcion, x.marca, x.familia].join(" ").toLowerCase().includes(termino)).map((x) => x.idprom);
        const soloNombre = d.promociones.filter((x) => x.nombre.toLowerCase().includes(termino)).map((x) => x.idprom);
        ok(`buscar «${termino}» encuentra tambien por marca, familia o descripcion, no solo por el nombre`, [idsDeLista(p), esperado.length > soloNombre.length], [esperado, true]);
    }
    escribir(p, $(p, "pv-buscar"), "tcl");
    filtrar(p, "pv-filtros", "REGALO");
    ok("la busqueda y el tipo se combinan", idsDeLista(p), d.promociones.filter((x) => x.tipo === "REGALO" && conTcl.includes(x.idprom)).map((x) => x.idprom));
    escribir(p, $(p, "pv-buscar"), "zzzz");
    ok("sin coincidencias, lo dice", texto($(p, "pv-lista")), "Ninguna promoción coincide.");
    escribir(p, $(p, "pv-buscar"), "");
    filtrar(p, "pv-filtros", "todas");
    ok("sin busqueda ni filtro, vuelven las 20", [idsDeLista(p).length, texto($(p, "pv-cuenta"))], [20, ""]);

    /* ---- nada se calcula: los dias, el tipo, el stock y los vacios, como vienen */
    console.log("\n— nada se calcula: lo que el backend dice, se dice —");
    preparar();
    alterar = (camino, r) => {
        if (camino === "/promocion/vigentes") {
            const ps = r.cuerpo.data.promociones;
            ps[0].diasRestantes = 0; ps[0].venceEl = "2026-10-29";
            ps[1].diasRestantes = 1; ps[1].venceEl = "2026-10-30";
            ps[2].tipo = null;
            ps[3].disponibles = 0;
            ps[4].descripcion = "";
            ps[5].productos = 1; ps[5].disponibles = 1;
            ps[6].soloAlgunosClientes = true; ps[6].tipo = "OTRO";
            ps[7].diasRestantes = 9;                 // no cuadra con el reloj ni con `venceEl`: los dias son del backend
        }
        return r;
    };
    llamadas = [];
    p = await montar("promovigentes.html");
    await pausa(250);
    const ids = lista().promociones.map((x) => x.idprom);
    const T = (i) => tarjeta(p, ids[i]);

    ok("vence hoy: `diasRestantes` 0 es el ultimo dia, y se dice «hoy» y no «en 0 días»", datosDe(T(0))[0], "Vence hoy (29/10/2026)");
    ok("vence mañana", datosDe(T(1))[0], "Vence mañana (30/10/2026)");
    ok("los dias salen de `diasRestantes`, no del reloj del equipo ni de restar fechas: 9 aunque no cuadre",
       [datosDe(T(7))[0].startsWith("Vence en 9 días ("), datosDe(T(7))[0].includes(`(${lista().promociones[7].venceEl.slice(8, 10)}/`)], [true, true]);
    ok("hoy y mañana llaman la atencion; el resto, no",
       [T(0).querySelector(".cdk-dato--alerta") !== null, T(1).querySelector(".cdk-dato--alerta") !== null, datosDe(T(2))[0].startsWith("Vence en "), T(2).querySelector(".cdk-dato--alerta") !== null],
       [true, true, true, false]);
    ok("un `tipo` null no se rotula (y no se inventa uno), pero la promocion se ve igual", [rotulosDe(T(2)), nombreDe(T(2)).length > 0], [[], true]);
    ok("un `tipo` que no es descuento ni regalo, tampoco", rotulosDe(T(6)), ["Solo algunos clientes"]);
    ok("sin ningun producto con stock: «sin stock hoy», con alerta", [datosDe(T(3)).slice(-1), T(3).querySelectorAll(".cdk-dato--alerta").length], [["Stock sin stock hoy"], 1]);
    ok("una descripcion vacia no deja un hueco: solo el nombre", [descripcionDe(T(4)), nombreDe(T(4)).length > 0], [null, true]);
    ok("un solo producto, en singular", datosDe(T(5)).slice(-1), ["Con stock 1 de 1 producto"]);
    ok("el orden sigue siendo el del backend aunque se alteren los datos", idsDeLista(p), ids);

    preparar();
    alterar = (camino, r) => { if (camino === "/promocion/vigentes") { r.cuerpo.data.total = 0; r.cuerpo.data.promociones = []; } return r; };
    p = await montar("promovigentes.html");
    await pausa(250);
    ok("sin ninguna vigente: lo dice, y no es un error", [texto($(p, "contenido")), p.doc.querySelector(".cdk-aviso--error")], ["Hoy no hay promociones vigentes.", null]);

    /* ============================================================ el detalle */
    console.log("\n— el detalle de la 15221 (solo para algunos clientes) —");
    preparar();
    llamadas = [];
    p = await montar("promovigentes.html", "?id=15221");
    await pausa(250);
    const d1 = detalle("15221");

    ok("pide el detalle de esa promocion, una vez, y nada mas", rutas(), ["/promocion/vigentes/15221"]);
    ok("el nombre, arriba y en la cabecera", [texto($(p, "periodo")), texto($(p, "pv-promocion").querySelector(".cdk-seccion__titulo"))],
       ["HP BOTELLAS Q42026 DSCTO (CDK)", "HP BOTELLAS Q42026 DSCTO (CDK)"]);
    ok("la descripcion y los rotulos", [texto($(p, "pv-descripcion")), [...$(p, "pv-promocion").querySelectorAll(".cdk-semaforo")].map((n) => texto(n))],
       ["Por la compra de 100 botellas GT52 y GT53, llevas un descuento especial.", ["Descuento", "Solo algunos clientes"]]);
    ok("vence, marca, familia y stock, los mismos de la lista",
       [0, 1, 2, 3].map((i) => texto($(p, "pv-dato-" + i))), ["en 2 días (31/10/2026)", "HEWLETT PACKARD", "SUMINISTROS", "4 de 4 productos"]);
    ok("«solo algunos clientes» no dice cuales", texto($(p, "pv-solo-algunos")), "Solo es para ciertas categorías de cliente.");
    ok("dice que es para ofrecer", texto($(p, "pv-ofrecer")).startsWith("Es para ofrecer"), true);
    ok("una de descuento no dice nada de regalos", texto($(p, "pv-productos-seccion").querySelector(".cdk-seccion__sub")).includes("regala"), false);
    ok("«Volver» lleva a la lista", $(p, "pv-volver").getAttribute("href"), "/promovigentes.html");

    ok("los 4 productos, en el orden del backend", filasDeProductos(p).map((li) => texto(li.querySelector(".cdk-fila__nombre"))), d1.productos.map((x) => sinNbsp(x.descripcion)));
    ok("cada uno dice si hay stock con TEXTO", filasDeProductos(p).map(rotulosDeProducto), d1.productos.map(() => ["Disponible"]));
    ok("con su part number y su boton de copiar, su marca y su familia, y donde hay stock",
       [...filasDeProductos(p)[0].querySelector(".cdk-fila__datos").children].map((n) => texto(n)),
       [`Part number ${d1.productos[0].partNumber}`, "Copiar", d1.productos[0].marca, d1.productos[0].familia, "Stock en Principal"]);
    ok("nunca un numero de stock (los almacenes se nombran, no se cuentan)", /\bstock\b\s*(en|:)?\s*\d|\d+\s*(unidades|und)/i.test(texto($(p, "pv-productos"))), false);

    /* ---- almacenes: la 15221 es el caso del documento, el 1VV22AL esta DISPONIBLE pero solo en Piura */
    const filaPiura = filasDeProductos(p).filter((li) => texto(li.querySelector(".cdk-fila__nombre")).includes("1VV22AL"))[0];
    ok("el 1VV22AL: disponible, pero dice que el stock esta solo en Piura",
       [rotulosDeProducto(filaPiura), texto(filaPiura.querySelector("[data-almacenes]"))], [["Disponible"], "Stock en Piura"]);
    ok("y avisa, con palabras, que al cotizar solo se elige Principal o M&M",
       texto(filaPiura.querySelector("[data-solo-fuera]")), "Solo hay stock en Piura, y al cotizar solo se puede elegir Principal o M&M. Consúltalo antes de ofrecerlo.");
    ok("el aviso es de ese producto y de ningun otro", p.doc.querySelectorAll("#pv-productos [data-solo-fuera]").length, 1);
    ok("el producto sigue pudiendo copiarse, y no se atenua (esta disponible)",
       [filaPiura.querySelector("[data-copiar]") !== null, filaPiura.classList.contains("cdk-fila--apagada")], [true, false]);
    ok("los demas dicen donde hay stock, tal cual lo manda el backend",
       filasDeProductos(p).filter((li) => li !== filaPiura).map((li) => texto(li.querySelector("[data-almacenes]"))), ["Stock en Principal", "Stock en Principal", "Stock en Principal"]);

    /* ---- copiar el part number */
    const copiados = [];
    Object.defineProperty(p.w.navigator, "clipboard", { configurable: true, value: { writeText: (t) => { copiados.push(t); return Promise.resolve(); } } });
    clic(p, filasDeProductos(p)[0].querySelector("[data-copiar]"));
    await pausa(50);
    ok("«Copiar» manda el part number al portapapeles, y avisa", [copiados, toasts(p.doc)], [[d1.productos[0].partNumber], [`Part number copiado: ${d1.productos[0].partNumber}`]]);

    Object.defineProperty(p.w.navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("negado")) } });
    clic(p, filasDeProductos(p)[1].querySelector("[data-copiar]"));
    await pausa(50);
    ok("si no se puede copiar, lo dice y no finge", toasts(p.doc).slice(-1), ["No se pudo copiar. Selecciónalo y cópialo a mano."]);

    /* ============================================================ el detalle de una de regalo */
    console.log("\n— el detalle de la 14106 (regalo, con 2 agotados y un producto sin part number) —");
    llamadas = [];
    p = await montar("promovigentes.html", "?id=14106");
    await pausa(250);
    const d2 = detalle("14106");

    ok("6 productos, y el tipo lo dice", [filasDeProductos(p).length, [...$(p, "pv-promocion").querySelectorAll(".cdk-semaforo")].map((n) => texto(n))], [6, ["Regalo"]]);
    ok("avisa que lo que se regala lo explica la descripcion, porque aqui solo va lo que se compra",
       texto($(p, "pv-productos-seccion").querySelector(".cdk-seccion__sub")).includes("Lo que se regala lo explica la descripción: aquí no aparece."), true);
    ok("los 2 agotados lo dicen con la palabra, y se ven atenuados",
       [filasDeProductos(p).filter((li) => rotulosDeProducto(li)[0] === "Agotado").length, p.doc.querySelectorAll("#pv-productos .cdk-fila--apagada").length], [2, 2]);
    ok("los 4 disponibles, no", filasDeProductos(p).filter((li) => rotulosDeProducto(li)[0] === "Disponible" && !li.classList.contains("cdk-fila--apagada")).length, 4);
    ok("un agotado no dice donde hay stock (no hay) ni avisa de nada",
       filasDeProductos(p).filter((li) => rotulosDeProducto(li)[0] === "Agotado").map((li) => [li.querySelector("[data-almacenes]"), li.querySelector("[data-solo-fuera]")]), [[null, null], [null, null]]);
    ok("el que esta en Principal y M&M lo dice, y no avisa: se puede cotizar desde alli",
       [d2.productos.filter((x) => x.partNumber === "0-761345-20118-6")[0].almacenes,
        filasDeProductos(p).filter((li) => texto(li.querySelector(".cdk-fila__datos")).includes("0-761345-20118-6")).map((li) => [texto(li.querySelector("[data-almacenes]")), li.querySelector("[data-solo-fuera]")])],
       [["PRINCIPAL", "M&M"], [["Stock en Principal, M&M", null]]]);
    ok("se ven TODOS: el backend manda tambien los agotados, y la pantalla los atenua, no los oculta",
       filasDeProductos(p).map((li) => texto(li.querySelector(".cdk-fila__nombre"))), d2.productos.map((x) => sinNbsp(x.descripcion)));

    const sinPn = d2.productos.findIndex((x) => x.partNumber === "");
    ok("un producto sin part number lo dice y no tiene boton de copiar",
       [sinPn >= 0, texto(filasDeProductos(p)[sinPn].querySelector(".cdk-fila__datos")).startsWith("Sin part number"), filasDeProductos(p)[sinPn].querySelector("[data-copiar]")], [true, true, null]);
    ok("y los demas si", filasDeProductos(p).filter((li) => li.querySelector("[data-copiar]")).length, 5);

    ok("dos pestañas, y «Todos» esta activa", [pestanas(p, "pv-stock"), pestanaActiva(p, "pv-stock")], [["Todos", "Con stock"], ["todos"]]);
    filtrar(p, "pv-stock", "stock");
    ok("«Con stock»: solo los 4 disponibles, y dice cuantos de cuantos",
       [filasDeProductos(p).length, texto($(p, "pv-productos-cuenta"))], [4, "Se muestran 4 de 6."]);
    filtrar(p, "pv-stock", "todos");
    ok("«Todos» los devuelve", [filasDeProductos(p).length, texto($(p, "pv-productos-cuenta"))], [6, ""]);

    /* ============================================================ los almacenes */
    console.log("\n— los almacenes de cada producto —");
    const almacenesYAviso = (pagina) => filasDeProductos(pagina).map((li) => [texto(li.querySelector("[data-almacenes]")), texto(li.querySelector("[data-solo-fuera]"))]);

    preparar();
    p = await montar("promovigentes.html", "?id=15204");          // toners BROTHER: el TN660 esta solo en Piura y Chorrillos
    await pausa(250);
    ok("en Piura y Chorrillos, y nada en Principal ni M&M: lo dice y lo avisa",
       almacenesYAviso(p).filter((x) => x[0] === "Stock en Piura, Chorrillos"),
       [["Stock en Piura, Chorrillos", "Solo hay stock en Piura y Chorrillos, y al cotizar solo se puede elegir Principal o M&M. Consúltalo antes de ofrecerlo."]]);
    ok("los otros dos, que estan en Principal, no avisan", almacenesYAviso(p).filter((x) => x[0] === "Stock en Principal"), [["Stock en Principal", null], ["Stock en Principal", null]]);

    p = await montar("promovigentes.html", "?id=15190");          // epson: el T544120-AL esta en Principal, M&M y Piura
    await pausa(250);
    ok("en Principal, M&M y Piura: los dice todos, en su orden, y no avisa (hay donde cotizar)",
       almacenesYAviso(p).filter((x) => x[0] === "Stock en Principal, M&M, Piura"), [["Stock en Principal, M&M, Piura", null]]);

    p = await montar("promovigentes.html", "?id=15250");          // kingston: el KF432C16BB/16 esta solo en M&M
    await pausa(250);
    ok("solo en M&M: se puede cotizar desde alli, asi que no avisa", almacenesYAviso(p).filter((x) => x[0] === "Stock en M&M"), [["Stock en M&M", null]]);

    /* Un almacen que no conocemos se dice tal cual; un detalle sin `almacenes` (o con `[]` en un disponible) no inventa nada. */
    alterar = (camino, r) => {
        if (camino === "/promocion/vigentes/15221") {
            r.cuerpo.data.productos[0].almacenes = ["PRINCIPAL", "BODEGA NUEVA"];
            r.cuerpo.data.productos[1].almacenes = ["BODEGA NUEVA"];
            delete r.cuerpo.data.productos[2].almacenes;
            r.cuerpo.data.productos[3].almacenes = [];
        }
        return r;
    };
    p = await montar("promovigentes.html", "?id=15221");
    await pausa(250);
    ok("un almacen desconocido se dice tal cual; sin `almacenes`, o `[]` en un disponible, no se inventa nada",
       almacenesYAviso(p).map((x) => x[0]), ["Stock en Principal, BODEGA NUEVA", "Stock en BODEGA NUEVA", null, null]);
    ok("solo en uno desconocido: tambien avisa (no se puede cotizar de alli); si ademas esta en Principal, no",
       almacenesYAviso(p).map((x) => x[1] !== null), [false, true, false, false]);
    alterar = (camino, r) => {
        if (camino === "/promocion/vigentes/14106") r.cuerpo.data.productos.filter((q) => q.disponibilidad === "AGOTADO").forEach((q) => { q.almacenes = ["PIURA"]; });
        return r;
    };
    p = await montar("promovigentes.html", "?id=14106");
    await pausa(250);
    ok("un agotado no dice donde hay stock ni avisa, aunque el backend mandara almacenes (se contradeciria con «Agotado»)",
       filasDeProductos(p).filter((li) => rotulosDeProducto(li)[0] === "Agotado").map((li) => [li.querySelector("[data-almacenes]"), li.querySelector("[data-solo-fuera]")]), [[null, null], [null, null]]);
    alterar = null;

    /* ============================================================ no vigente */
    console.log("\n— una promocion que ya no esta vigente —");
    for (const [idprom, motivo] of [["14898", "vencida"], ["abc", "un id que no es numero"], ["15300", "apagada"]]) {
        llamadas = [];
        p = await montar("promovigentes.html", "?id=" + idprom);
        await pausa(250);
        ok(`${motivo}: lo explica, con el mensaje del backend, y no reintenta`,
           [rutas(), texto($(p, "pv-no-vigente").querySelector(".cdk-seccion__titulo")), texto($(p, "pv-no-vigente").querySelector(".cdk-seccion__sub")).includes("no existe"),
            p.doc.querySelector("#contenido .cdk-estado button")],
           [["/promocion/vigentes/" + idprom], "Esa promoción ya no está vigente", true, null]);
        ok(`${motivo}: ofrece volver a la lista`, $(p, "pv-volver").getAttribute("href"), "/promovigentes.html");
    }

    /* ============================================================ errores */
    console.log("\n— errores —");
    preparar();
    forzar = (ruta) => (ruta.startsWith("/promocion/vigentes") ? respuesta({ status: "error query", codigo: 1, msg: "fallo la consulta" }, 500) : null);
    llamadas = [];
    p = await montar("promovigentes.html");
    await pausa(250);
    ok("un 500 en la lista: lo dice y ofrece reintentar",
       [texto(p.doc.querySelector("#contenido .cdk-estado__texto")), p.doc.querySelector("#contenido .cdk-estado button") !== null], ["fallo la consulta", true]);
    forzar = null;
    clic(p, p.doc.querySelector("#contenido .cdk-estado button"));
    await pausa(250);
    ok("«Reintentar» la pide otra vez, y la pantalla sigue", [rutas(), idsDeLista(p).length], [["/promocion/vigentes", "/promocion/vigentes"], 20]);

    forzar = (ruta) => (ruta.startsWith("/promocion/vigentes") ? respuesta({ status: "sin permiso", codigo: 3, msg: "esta ruta es del grupo 20" }, 403) : null);
    p = await montar("promovigentes.html");
    await pausa(250);
    ok("un 403 `sin permiso`: lo dice, sin reintentar (no hay nada que reintentar)",
       [texto(p.doc.querySelector("#contenido .cdk-estado__texto")), p.doc.querySelector("#contenido .cdk-estado button")], ["esta ruta es del grupo 20", null]);

    forzar = (ruta) => (ruta.startsWith("/promocion/vigentes/") ? respuesta({ status: "error query", codigo: 1, msg: "fallo la consulta" }, 500) : null);
    p = await montar("promovigentes.html", "?id=15221");
    await pausa(250);
    ok("un 500 en el detalle: ofrece reintentar (el 404 no)", p.doc.querySelector("#contenido .cdk-estado button") !== null, true);

    ok("el detalle con una respuesta rara no se pinta a ojo",
       await (async () => { forzar = (ruta) => (ruta.startsWith("/promocion/vigentes/") ? respuesta({ status: "ok", codigo: 0, data: { fecha: "2026-10-29" } }) : null);
                            p = await montar("promovigentes.html", "?id=15221"); await pausa(250);
                            return texto(p.doc.querySelector("#contenido .cdk-estado__texto")); })(), "La respuesta no trae la promoción.");

    /* ============================================================ el menu */
    console.log("\n— el menu del vendedor (grupo 20) —");
    preparar();
    llamadas = [];
    p = await montar("promovigentes.html");
    await pausa(250);
    const activo = p.doc.querySelector("#cdk-sidebar-lista .cdk-sidebar__enlace[aria-current='page'], #cdk-sidebar-lista .cdk-sidebar__enlace.es-activo");

    ok("«Promos vigentes» sale en el menu lateral, marcada, y lleva a su pagina", [texto(activo), activo && activo.getAttribute("href")], ["Promos vigentes", "/promovigentes.html"]);
    ok("el menu lateral: «Vender hoy» tercero (prioridad 2,5) y «Promos vigentes» al final",
       [...p.doc.querySelectorAll("#cdk-sidebar-lista .cdk-sidebar__enlace")].map((a) => texto(a)),
       ["Cotización", "Pedido", "Vender hoy", "Ajustes", "Factura", "Promoción", "Cuota", "Listados", "Programador", "Promos vigentes"]);
    ok("en el movil: «Vender hoy» entra en la barra (Factura pasa a «Más»), y como «Promos vigentes» es la pagina abierta ocupa el ultimo espacio",
       [...p.doc.querySelectorAll(".cdk-bottomnav__enlace")].map((a) => texto(a)), ["Cotización", "Pedido", "Vender hoy", "Promos vigentes", "Más"]);

    console.log(fallos ? `\n${fallos} comprobacion(es) fallaron.` : "\nTodo correcto.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.log("\nLa prueba se rompio:", e.message); console.log(e.stack.split("\n").slice(1, 4).join("\n")); process.exit(1); });
