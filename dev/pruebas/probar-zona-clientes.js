/**
 * Prueba de integracion del modulo `clientes` del jefe de zona (grupo 34): la cartera de un vendedor de CARTERA y la cobertura de uno
 * de COBERTURA, sobre la pagina real (clientes.html).
 *
 * Lo que mas importa:
 *
 *   · que la ruta se elija por el TIPO del vendedor, y que como el tipo es el de ESE mes (un vendedor puede cambiar de uno a otro),
 *     un `400 vendedor de otro tipo` se pida una sola vez a la otra ruta, sin bucles
 *   · que NADA se calcule en pantalla: totales, porcentajes, desgloses, concentracion, riesgo y comparacion son los del backend,
 *     aunque no cuadren entre si
 *   · la regla de CARTERA, dicha con todas sus letras: lo que le cuenta (lo que facturo EL a clientes de cualquier cartera), lo que
 *     NO le cuenta (lo que otros les facturan, y lo que EL factura a quien no es de cartera), y los libres (el monto no cuenta, el
 *     cliente si)
 *   · que `porDueno` de la cobertura se rotule como lo que es y que no se cuente con `length`: la lista trae tambien a los que
 *     terminaron en 0 o en negativo, que no son atendidos
 *   · que un mes anterior avise de que los asignados pueden estar incompletos, y que se pueda ir hasta tres meses atras
 *   · los reemplazos por vacaciones, las listas vacias, un backend sin los campos del 24/10 y los errores
 *
 * El simulacro es dev/simulador-zona.js, el mismo de dev/servidor.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const zonaSim = require("../simulador-zona");

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

function responder(url, opciones) {
    llamadas.push({ url, metodo: (opciones && opciones.method) || "GET" });

    const ruta = url.replace(/^https?:\/\/[^/]+\/v1/, "");

    const forzada = forzar && forzar(ruta);
    if (forzada) return forzada;

    const [camino, consulta] = ruta.split("?");
    const params = new URLSearchParams(consulta || "");

    if (camino === "/vendedor") {
        return respuesta({
            status: "ok", codigo: 0,
            data: { cotizacion: "Permite manejar cotizaciones", avance: "Avance de cuota de todos los vendedores del grupo 20",
                    probabilidad: "Probabilidad de que un vendedor llegue a su cuota",
                    clientes: "Revisa la cartera o la cobertura de clientes de cada vendedor del grupo 20" },
            nombre: "CRISTHIAM VACA", grupo: "VENTAS-JEFES DE ZONA", tipo: S.rol, tipoCambio: 3.75
        });
    }

    const pedido = { anno: params.get("anno"), mes: params.get("mes"), codusu: params.get("codusu") };
    let r = null;
    if (camino === "/zona/avance") r = zonaSim.avance(pedido);
    else if (camino === "/zona/cartera") r = zonaSim.cartera(pedido);
    else if (camino === "/zona/cobertura") r = zonaSim.cobertura(pedido);

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
    if (alterar) r = alterar(camino, r) || r;

    return respuesta(r.cuerpo, r.status);
}

/* =====================================================================
 * Montar la pagina real
 * =================================================================== */
function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

const REFRESCO = 180000;

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
        constructor(...a) { if (a.length) super(...a); else super(2026, 9, 22, 18); }
        static now() { return new Real(2026, 9, 22, 18).getTime(); }
    };

    /* Cualquier refresco automatico de 3 minutos se anota en vez de esperarlo: esta pantalla no tiene ninguno, y se comprueba. */
    const relojes = [];
    const setReal = w.setTimeout.bind(w), clearReal = w.clearTimeout.bind(w);
    w.setTimeout = (fn, ms, ...a) => {
        if (ms !== REFRESCO) return setReal(fn, ms, ...a);
        const r = { fn, ms, id: 900000 + relojes.length, cancelado: false };
        relojes.push(r);
        return r.id;
    };
    w.clearTimeout = (id) => { const r = relojes.find((x) => x.id === id); if (r) r.cancelado = true; else clearReal(id); };

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

    return { w, doc: w.document, destinos, avisos, relojes, activos: () => relojes.filter((r) => !r.cancelado) };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
const escribir = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("input", { bubbles: true })); };
const elegirOpcion = async (p, select, valor) => {
    select.value = valor;
    select.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    await pausa(250);
};
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);
const sinNbsp = (t) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);

const $ = (p, id) => p.doc.getElementById(id);
const rutas = () => llamadas.filter((l) => l.url.includes("/zona/")).map((l) => l.url.replace(/^.*\/v1/, ""));
const filas = (p) => [...p.doc.querySelectorAll("#zc-clientes > li")];
const fila = (p, codcli) => p.doc.querySelector(`#zc-clientes > li[data-codcli='${codcli}']`);
const rotulos = (li) => [...li.querySelectorAll(".cdk-semaforo")].map((n) => texto(n));
const detalleDe = (li) => texto(li.querySelector(".cdk-articulo__detalle"));
/* La lista principal (desde el 27/10): una fila de dos lineas, con las pestañas de filtro arriba */
const importeDe = (li) => texto(li.querySelector(".cdk-fila__importe"));
const datosDe = (li) => texto(li.querySelector(".cdk-fila__datos"));
const masDe = (li) => texto(li.querySelector(".cdk-fila__mas"));
const abierta = (li) => li.querySelector(".cdk-fila__boton").getAttribute("aria-expanded");
const filtrar = (p, clave) => clic(p, p.doc.querySelector(`#zc-filtros [data-filtro='${clave}']`));
const pestanas = (p) => [...p.doc.querySelectorAll("#zc-filtros .cdk-pestana")].map((b) => texto(b));
const pestanaActiva = (p) => [...p.doc.querySelectorAll("#zc-filtros .es-activa")].map((b) => b.getAttribute("data-filtro"));
const comparaciones = (p) => [...p.doc.querySelectorAll("#zc-comparacion-lista > li")];

/* El que da el simulacro: lo que el backend dice, para comparar con lo que sale en pantalla. */
const cartera = (cod, periodo) => zonaSim.cartera(Object.assign({ codusu: cod }, periodo || {})).cuerpo.data;
const cobertura = (cod, periodo) => zonaSim.cobertura(Object.assign({ codusu: cod }, periodo || {})).cuerpo.data;
const avance = (periodo) => zonaSim.avance(periodo || {}).cuerpo.data;

const grupo = (n) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => (n < 0 ? "-$ " + grupo(-n) : "$ " + grupo(n));
const fechaCorta = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);
const MES = { 2026: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"] };
const nombreDeMes = (c) => MES[c.anno][c.mes - 1] + " de " + c.anno;
const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
const pc = (n) => n.toFixed(1) + " %";                 // un decimal, como lo pinta la pantalla: 0 es «0.0 %», 50 es «50.0 %»

function preparar(rol) {
    marcasSim.reiniciar(rol || "ZONA");
    forzar = null; alterar = null;
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Jefe de zona (grupo 34) · clientes ===\n");

    /* ============================================================ elegir: cartera o cobertura, y luego al vendedor */
    console.log("— el modulo se llama Cobertura: primero cartera o cobertura —");
    preparar();
    llamadas = [];
    let p = await montar("clientes.html");
    await pausa(250);
    const av = avance();
    const listaDeVendedores = () => [...p.doc.querySelectorAll("#zc-vendedores > li")].map((li) => li.getAttribute("data-codusu"));
    const deTipo = (t) => av.vendedores.concat(av.sinCuota).filter((v) => v.tipo === t).map((v) => v.codusu);

    ok("carga sin errores", fallos, 0);
    ok("se llama Cobertura: en la pagina y en la pestaña", [texto(p.doc.querySelector("h1")), p.doc.title], ["Cobertura", "CDK · Cobertura"]);
    ok("sin nada elegido, ofrece cartera y cobertura, y todavia no pide nada",
       [rutas(), [...p.doc.querySelectorAll("#zc-tipos > li")].map((li) => li.getAttribute("data-opcion")),
        [...p.doc.querySelectorAll("#zc-tipos .cdk-articulo__nombre")].map((n) => texto(n))],
       [[], ["CARTERA", "COBERTURA"], ["Cartera", "Cobertura"]]);
    ok("la cabecera pregunta que se quiere ver", texto($(p, "periodo")), "¿Qué vendedores quieres ver?");
    ok("y todavia no hay vendedores a la vista", [p.doc.getElementById("zc-vendedores"), p.doc.getElementById("zc-elegir-buscar")], [null, null]);
    clic(p, p.doc.querySelector("#zc-tipos > li[data-opcion='CARTERA'] button"));
    ok("tocar «Cartera» lleva a los vendedores de cartera", p.destinos, ["/clientes.html?tipo=CARTERA"]);
    clic(p, p.doc.querySelector("#zc-tipos > li[data-opcion='COBERTURA'] button"));
    ok("y «Cobertura», a los de cobertura", p.destinos.slice(1), ["/clientes.html?tipo=COBERTURA"]);

    p = await montar("clientes.html", "?tipo=zzz");
    await pausa(250);
    ok("un tipo que no es ninguno de los dos se ignora: vuelve a elegir", [p.doc.getElementById("zc-tipos") !== null, rutas()], [true, []]);

    console.log("\n— los vendedores de cartera —");
    llamadas = [];
    p = await montar("clientes.html", "?tipo=cartera");
    await pausa(250);

    ok("pide la lista del avance, una vez (y el tipo se lee sin importar las mayusculas)", rutas(), ["/zona/avance"]);
    ok("salen solo los de cartera: primero los que tienen cuota y, despues, los que no",
       listaDeVendedores(), deTipo("CARTERA"));
    ok("ninguno de cobertura se cuela", listaDeVendedores().some((c) => deTipo("COBERTURA").includes(c)), false);
    ok("la cabecera y el titulo lo dicen",
       [texto($(p, "periodo")), texto(p.doc.querySelector("#zc-elegir .cdk-seccion__titulo"))], ["Vendedores de cartera", "Elige un vendedor de cartera"]);
    ok("cada uno dice su codigo de vendedor; el tipo ya no, porque es el de toda la lista",
       texto(p.doc.querySelector("#zc-vendedores > li[data-codusu='293'] .cdk-articulo__detalle")), "V0261");
    ok("«Ver otro tipo» vuelve a elegir entre cartera y cobertura", $(p, "zc-cambiar-tipo").getAttribute("href"), "/clientes.html");
    escribir(p, $(p, "zc-elegir-buscar"), "utani");
    ok("se busca por nombre", listaDeVendedores(), ["293"]);
    escribir(p, $(p, "zc-elegir-buscar"), "v0261");
    ok("o por codigo de vendedor", listaDeVendedores(), ["293"]);
    escribir(p, $(p, "zc-elegir-buscar"), "huamani");
    ok("uno de cobertura no aparece en esta lista, aunque se busque por su nombre", [listaDeVendedores(), texto($(p, "zc-elegir-lista"))], [[], "Ningún vendedor coincide."]);
    escribir(p, $(p, "zc-elegir-buscar"), "utani");
    clic(p, p.doc.querySelector("#zc-vendedores > li button"));
    ok("tocar a uno lleva a sus clientes, con su tipo como pista", p.destinos, ["/clientes.html?codusu=293&tipo=CARTERA"]);

    console.log("\n— los vendedores de cobertura —");
    llamadas = [];
    p = await montar("clientes.html", "?tipo=COBERTURA");
    await pausa(250);

    ok("salen solo los de cobertura", listaDeVendedores(), deTipo("COBERTURA"));
    ok("la cabecera lo dice", texto($(p, "periodo")), "Vendedores de cobertura");
    escribir(p, $(p, "zc-elegir-buscar"), "v0334");
    ok("se busca por codigo de vendedor", listaDeVendedores(), ["399"]);
    escribir(p, $(p, "zc-elegir-buscar"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "zc-elegir-lista")), "Ningún vendedor coincide.");
    escribir(p, $(p, "zc-elegir-buscar"), "huamani");
    clic(p, p.doc.querySelector("#zc-vendedores > li button"));
    ok("tocar a uno de cobertura lo lleva con su tipo", p.destinos, ["/clientes.html?codusu=196&tipo=COBERTURA"]);

    preparar();
    alterar = (camino, r) => {
        if (camino === "/zona/avance") {
            const x = r.cuerpo.data;
            x.vendedores = x.vendedores.filter((v) => v.tipo !== "COBERTURA");
            x.sinCuota = (x.sinCuota || []).filter((v) => v.tipo !== "COBERTURA");
        }
        return r;
    };
    p = await montar("clientes.html", "?tipo=COBERTURA");
    await pausa(250);
    ok("si no hay vendedores de ese tipo, lo dice con el nombre del tipo",
       texto($(p, "zc-elegir-lista")), "No hay vendedores de cobertura.");

    /* ============================================================ cartera, mes en curso */
    console.log("\n— la cartera de UTANI, de vacaciones (octubre, el mes en curso) —");
    preparar();
    llamadas = [];
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    let d = cartera("293");
    let rs = d.resumen;

    ok("pide la cartera de ese vendedor, una vez, sin periodo", rutas(), ["/zona/cartera?codusu=293"]);
    ok("dice quien es, de que tipo, y a que hora se calculo",
       [texto($(p, "zc-nombre")), texto($(p, "zc-detalle")), texto($(p, "periodo"))],
       ["UTANI FERNANDO", "Cartera · V0261", "UTANI FERNANDO · actualizado a las 18:47"]);
    ok("dice hasta cuando se cuenta, y que es en dolares con IGV", texto($(p, "zc-corte")), "Hasta hoy, 22/10/2026. Todo en dólares y con IGV.");
    ok("«Cambiar» lleva a la lista de los vendedores de cartera, no otra vez a elegir el tipo",
       [texto($(p, "zc-elegir-otro")), $(p, "zc-elegir-otro").getAttribute("href")], ["Cambiar", "/clientes.html?tipo=CARTERA"]);
    ok("el mes en curso no avisa de historia incompleta", $(p, "zc-aviso-historia"), null);
    ok("no se actualiza solo: sin refresco programado, y dice que se toca «Actualizar»",
       [p.relojes.length, texto($(p, "zc-refresco"))], [0, "Se calcula en el momento. Toca «Actualizar» para volver a calcularlo."]);

    ok("el selector ofrece el mes en curso y tres atras, no un cuarto",
       [...$(p, "zc-mes").options].map((o) => texto(o)), ["octubre de 2026 (este mes)", "septiembre de 2026", "agosto de 2026", "julio de 2026"]);

    /* ---- los reemplazos: el dueño de la cartera */
    ok("parece estar de vacaciones: dice quien atendio su cartera, con lo que facturo y que parte fue",
       texto($(p, "zc-reemplazado")),
       `Parece estar de vacaciones: su cartera la atendió ${d.reemplazadoPor.nombre} (el ${d.reemplazadoPor.porcentaje} % de lo facturado a sus clientes: ${usd(d.reemplazadoPor.venta)}).`);
    ok("y no dice que reemplaza a nadie", p.doc.querySelectorAll("[data-reemplazo='reemplaza']").length, 0);

    /* ---- su cartera */
    ok("su cartera: cuantos clientes tiene, cuantos atendio y cuantos no",
       [texto($(p, "zc-asignados")), texto($(p, "zc-atendidos")), texto($(p, "zc-sin-atender"))],
       [String(rs.asignados), `${rs.atendidos} · ${pc(rs.porcentaje)}`, String(rs.sinAtender)]);
    ok("la barra es el % de clientes atendidos", p.doc.querySelector("#zc-cartera .cdk-progreso__relleno").getAttribute("style"), `width:${rs.porcentaje}%`);

    /* ---- lo que le cuenta, y es su avance */
    ok("lo que le cuenta, y de donde sale: lo que facturo a sus clientes y a los de otra cartera",
       [texto($(p, "zc-venta")), texto($(p, "zc-venta-propia")), texto($(p, "zc-venta-reemplazo"))],
       [usd(rs.venta), usd(rs.ventaPropia), usd(rs.ventaReemplazo)]);
    const suAvance = av.sinCuota.find((s) => s.codusu === "293").avance;
    ok("«lo que le cuenta» es el mismo numero que su avance (la regla del contrato)", [rs.venta === suAvance, texto($(p, "zc-venta"))], [true, usd(suAvance)]);
    ok("lo dice con todas sus letras: lo que facturo EL a clientes de cualquier cartera, haya reemplazo detectado o no",
       texto($(p, "zc-cuenta").querySelector(".cdk-seccion__sub")).includes("cualquier vendedor de cartera") &&
       texto($(p, "zc-cuenta").querySelector(".cdk-seccion__sub")).includes("haya un reemplazo detectado o no"), true);

    /* ---- lo que NO le cuenta */
    const ff = rs.ventaFueraDeCartera;
    ok("lo que no le cuenta: lo que otros facturaron a sus clientes, y lo que el facturo a quien no es de cartera",
       [texto($(p, "zc-venta-otros")), texto($(p, "zc-fuera-venta"))], [usd(rs.ventaDeOtros), usd(ff.venta)]);
    ok("lo que facturo a un cliente que no es de cartera se separa en libres (con cuantos cuentan como atendidos) y de un vendedor de cobertura",
       [texto($(p, "zc-fuera-libres")), texto($(p, "zc-fuera-con-dueno"))],
       [`Libres (de la oficina o sin dueño): ${plural(ff.libres.clientes, "cliente", "clientes")}, ${ff.libres.atendidos} atendidos · ${usd(ff.libres.venta)}.`,
        `De un vendedor de cobertura: ${plural(ff.conDueno.clientes, "cliente", "clientes")} · ${usd(ff.conDueno.venta)}.`]);
    ok("y dice que ese monto no le cuenta a nadie",
       texto($(p, "zc-nocuenta-nota")).includes("no le cuenta a nadie") && texto($(p, "zc-nocuenta-nota")).includes("tampoco si es de cobertura"), true);

    /* ---- su cobertura de clientes (los libres cuentan como cliente, no como monto) */
    const cob = rs.coberturaClientes;
    ok("su cobertura de clientes: el total, y de donde sale (los suyos, los de otra cartera y los libres)",
       [texto($(p, "zc-cobertura-total")), texto($(p, "zc-cobertura-detalle"))],
       [String(cob.total), `${plural(cob.cartera, "cliente", "clientes")} de su cartera, ${cob.reemplazo} de otra cartera y ${plural(cob.libres, "libre", "libres")}.`]);
    ok("avisa de que los libres cuentan como cliente pero su monto no, y que los de cobertura no cuentan de ninguna forma",
       texto($(p, "zc-cobertura-nota")).includes("cuentan como cliente atendido, pero su monto no cuenta") &&
       texto($(p, "zc-cobertura-nota")).includes("no cuentan de ninguna forma"), true);

    /* ---- concentracion */
    ok("de cuantos clientes depende: los 5 mas grandes y que parte de su venta es",
       texto($(p, "zc-concentracion-texto")), `Sus 5 clientes más grandes suman ${usd(rs.concentracion.venta)}, el ${pc(rs.concentracion.porcentaje)} de su venta.`);
    ok("con menos de 70 % no dice que dependa de pocos", $(p, "zc-concentracion-alto"), null);

    /* ---- comparacion */
    const meses = ["2026-10", "2026-09", "2026-08", "2026-07"];
    ok("este mes y los tres anteriores, del mas reciente al mas antiguo", comparaciones(p).map((li) => li.getAttribute("data-mes")), meses);
    const c0 = d.comparacion[0];
    ok("el mes en curso: hasta hoy, con sus clientes, sus libres y su venta",
       [texto(comparaciones(p)[0]).startsWith("octubre de 2026 · este mes"), texto(comparaciones(p)[0]).includes("hasta el 22/10/2026"),
        texto(comparaciones(p)[0]).includes(`Clientes ${c0.clientes}Libres ${c0.libres}Venta ${usd(c0.venta)}`)], [true, true, true]);
    const c1 = d.comparacion[1];
    ok("septiembre, a la misma altura (el dia 22), con lo suyo",
       [texto(comparaciones(p)[1]).includes("hasta el 22/09/2026"), texto(comparaciones(p)[1]).includes(`Clientes ${c1.clientes}Libres ${c1.libres}Venta ${usd(c1.venta)}`)], [true, true]);
    ok("dice que la cobertura de clientes de cada mes es «clientes» mas «libres»", texto($(p, "zc-comparacion-nota")).includes("«Clientes» más «Libres»"), true);

    /* ---- riesgo */
    const riesgo = $(p, "zc-riesgo");
    ok("los clientes en riesgo van plegados, con cuantos son", [riesgo.open, texto(riesgo.querySelector("summary"))], [false, `Clientes en riesgo (${d.riesgo.clientes})`]);
    ok("y explican la venta en juego, y que es solo de entre sus asignados",
       [texto(riesgo).includes(`Entre todos compraban ${usd(d.riesgo.promedioMensual)} por mes`), texto(riesgo).includes("Solo de entre sus clientes asignados")], [true, true]);
    const primeroDeRiesgo = d.riesgo.lista[0];
    ok("la lista, en el orden del backend (del que mas compraba al que menos)",
       [...p.doc.querySelectorAll("#zc-riesgo-lista > li")].map((li) => li.getAttribute("data-codcli")), d.riesgo.lista.map((c) => c.codcli));
    ok("cada uno: lo que compraba por mes, en cuantos de los 3 meses compro, y su ultima compra",
       [texto(p.doc.querySelector("#zc-riesgo-lista > li")).includes(`Compraba por mes ${usd(primeroDeRiesgo.promedioMensual)}`),
        texto(p.doc.querySelector("#zc-riesgo-lista > li")).includes(`Compró en ${primeroDeRiesgo.mesesConCompra} de los 3 meses anteriores`),
        texto(p.doc.querySelector("#zc-riesgo-lista > li")).includes(`Última compra ${fechaCorta(primeroDeRiesgo.ultimaCompra)}`)], [true, true, true]);

    /* ---- la lista de clientes: todos los asignados, atendidos o no */
    ok("la lista trae a todos sus asignados, en el orden del backend (del que mas compro al que menos)",
       filas(p).map((li) => li.getAttribute("data-codcli")), d.clientes.map((c) => c.codcli));
    const atendido = d.clientes.find((c) => c.atendido), sinAtender = d.clientes.find((c) => !c.atendido && c.venta === 0);
    ok("un atendido lo dice con texto; uno sin atender, tambien",
       [rotulos(fila(p, atendido.codcli)), rotulos(fila(p, sinAtender.codcli))], [["Atendido"], ["Sin atender"]]);
    ok("el cliente, en dos lineas: su nombre y su venta, y debajo cuantas facturas y su ultima compra; sin su codigo",
       [texto(fila(p, atendido.codcli).querySelector(".cdk-fila__nombre")), importeDe(fila(p, atendido.codcli)),
        datosDe(fila(p, atendido.codcli)).includes(`${plural(atendido.docs, "factura", "facturas")} · última compra ${fechaCorta(atendido.ultimaCompra)}`),
        detalleDe(fila(p, atendido.codcli))],
       [atendido.nombre, usd(atendido.venta), true, null]);
    ok("las filas son una lista de un solo marco, no una tarjeta por cliente",
       [p.doc.getElementById("zc-clientes").className, p.doc.querySelectorAll("#zc-clientes .cdk-articulo").length], ["cdk-filas", 0]);
    ok("el detalle esta cerrado, y tocar la fila lo abre y lo cierra; trae lo que compraba por mes",
       (() => { const li = fila(p, atendido.codcli); const antes = abierta(li); clic(p, li.querySelector(".cdk-fila__boton")); const durante = abierta(li);
                const mas = masDe(li); clic(p, li.querySelector(".cdk-fila__boton")); return [antes, durante, mas.startsWith(`Compraba por mes${usd(atendido.promedioMensual)}`), abierta(li)]; })(),
       ["false", "true", true, "false"]);
    ok("el codigo de un cliente no sale en ninguna parte de la pantalla: ni en la lista, ni en riesgo, ni en las plegadas",
       d.clientes.concat(d.riesgo.lista, d.reemplazo, d.fueraDeCartera).filter((c) => texto(p.doc.getElementById("contenido")).includes(c.codcli)).map((c) => c.codcli), []);
    const negativo = d.clientes.find((c) => c.venta < 0);
    ok("un cliente que solo tuvo notas de credito se ve en negativo, y NO es atendido",
       [importeDe(fila(p, negativo.codcli)), !!fila(p, negativo.codcli).querySelector(".cdk-fila__importe--negativo"), rotulos(fila(p, negativo.codcli))],
       [usd(negativo.venta), true, ["Sin atender"]]);

    /* ---- lo que otros le facturaron a sus clientes: no le cuenta, pero se ve */
    const conOtros = d.clientes.find((c) => c.otros.length);
    ok("lo que otro vendedor le facturo a un cliente suyo se ve, y dice que no le cuenta (aqui, su reemplazo)",
       texto(fila(p, conOtros.codcli).querySelector("[data-otros]")),
       `Otros vendedores le facturaron este mes: ${conOtros.otros[0].nombre} (${usd(conOtros.otros[0].venta)}). No le cuenta.`);
    ok("sin nota en los clientes que nadie mas facturo", p.doc.querySelectorAll("#zc-clientes [data-otros]").length, d.clientes.filter((c) => c.otros.length).length);

    /* ---- buscar y filtrar */
    ok("tres pestañas, en vez de un desplegable, y «Todos» esta activa",
       [pestanas(p), pestanaActiva(p), $(p, "zc-filtro-atencion")], [["Todos", "Atendidos", "Sin atender"], ["todos"], null]);
    filtrar(p, "atendidos");
    ok("filtrar por atendidos", [filas(p).length, pestanaActiva(p)], [d.clientes.filter((c) => c.atendido).length, ["atendidos"]]);
    ok("y dice cuantos se muestran de cuantos", texto($(p, "zc-lista-cuenta")), `Se muestran ${d.clientes.filter((c) => c.atendido).length} de ${d.clientes.length}.`);
    filtrar(p, "sin");
    ok("filtrar por sin atender", [filas(p).length, pestanaActiva(p)], [d.clientes.filter((c) => !c.atendido).length, ["sin"]]);
    filtrar(p, "todos");
    escribir(p, $(p, "zc-buscar"), atendido.nombre.slice(0, 12).toLowerCase());
    ok("buscar por nombre", filas(p).every((li) => texto(li).toLowerCase().includes(atendido.nombre.slice(0, 12).toLowerCase())) && !!fila(p, atendido.codcli), true);
    escribir(p, $(p, "zc-buscar"), atendido.codcli.toLowerCase());
    ok("el codigo del cliente no se ve, asi que tampoco busca", filas(p).length, 0);
    escribir(p, $(p, "zc-buscar"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "zc-lista")), "Ningún cliente coincide.");
    escribir(p, $(p, "zc-buscar"), "");

    /* ---- sin reemplazo entrante no hay lista de reemplazo; la de fuera de cartera si */
    ok("no atendio carteras ajenas: no hay lista de reemplazo", $(p, "zc-reemplazo"), null);
    const fuera = $(p, "zc-fuera");
    ok("los clientes que no son de cartera van plegados, con cuantos son",
       [fuera.open, texto(fuera.querySelector("summary"))], [false, `Clientes que no son de cartera (${ff.clientes})`]);
    ok("la lista, en el orden del backend", [...p.doc.querySelectorAll("#zc-fuera-lista > li")].map((li) => li.getAttribute("data-codcli")), d.fueraDeCartera.map((c) => c.codcli));

    const libreAtendido = d.fueraDeCartera.find((c) => c.libre && c.atendido), libreSin = d.fueraDeCartera.find((c) => c.libre && !c.atendido);
    const conDueno = d.fueraDeCartera.find((c) => !c.libre);
    const enFuera = (c) => p.doc.querySelector(`#zc-fuera-lista > li[data-codcli='${c.codcli}']`);
    ok("un libre que se atendio: libre, y cuenta como cliente atendido (el monto no)", rotulos(enFuera(libreAtendido)), ["Libre", "Cuenta como atendido"]);
    ok("un libre que solo tuvo notas de credito: libre, y no cuenta", rotulos(enFuera(libreSin)), ["Libre", "No cuenta como atendido"]);
    ok("uno de un vendedor de cobertura no cuenta de ninguna forma, y dice de quien es",
       [rotulos(enFuera(conDueno)), detalleDe(enFuera(conDueno))], [["No cuenta como atendido"], `De ${conDueno.dueno.nombre}`]);
    const dichos = d.fueraDeCartera.filter((c) => c.libre).map((c) => detalleDe(enFuera(c)));
    ok("un libre sin dueño lo dice; uno de la oficina, tambien", dichos.sort(), d.fueraDeCartera.filter((c) => c.libre).map((c) => c.dueno ? "De " + c.dueno.nombre : "Sin dueño").sort());
    ok("la explicacion: el monto no le cuenta a nadie; los libres si cuentan como cliente",
       texto(fuera).includes("El monto no le cuenta a nadie") && texto(fuera).includes("sí cuentan como cliente atendido"), true);

    /* ============================================================ cartera, un mes cerrado, que reemplazo a otra cartera */
    console.log("\n— la cartera de CASTILLO, que reemplazo a otra cartera (agosto, un mes cerrado) —");
    preparar();
    llamadas = [];
    p = await montar("clientes.html", "?codusu=246&tipo=CARTERA");
    await pausa(250);
    await elegirOpcion(p, $(p, "zc-mes"), "2026-08");
    const ago = { anno: "2026", mes: "8" };
    d = cartera("246", ago);
    rs = d.resumen;

    ok("pide la cartera de agosto, con anno y mes juntos", rutas(), ["/zona/cartera?codusu=246", "/zona/cartera?codusu=246&anno=2026&mes=8"]);
    ok("el selector queda en agosto", $(p, "zc-mes").value, "2026-08");
    ok("dice que es un mes cerrado, hasta el ultimo dia, y el mes",
       [texto($(p, "periodo")), texto($(p, "zc-corte"))],
       ["CASTILLO FLORES DIEGO · agosto de 2026 · mes cerrado", "Mes cerrado: hasta el 31/08/2026. Todo en dólares y con IGV."]);
    ok("avisa de que los asignados de un mes anterior pueden estar incompletos, y por que",
       [texto($(p, "zc-aviso-historia")).includes("pueden estar incompletos"), texto($(p, "zc-aviso-historia")).includes("el maestro de clientes no guarda historia"),
        texto($(p, "zc-aviso-historia")).includes("que hoy ya no tiene y que no compró ese mes")], [true, true, true]);
    ok("un mes cerrado no promete que se calcule «en el momento»", $(p, "zc-refresco"), null);

    ok("quien reemplazo dice a quien: la cartera ajena que atendio, con lo que facturo y que parte fue",
       [[...p.doc.querySelectorAll("[data-reemplazo]")].map((n) => texto(n)), p.doc.querySelectorAll("[data-reemplazo='reemplazado']").length],
       [d.reemplazaA.map((r) => `Reemplaza a ${r.nombre}: atendió su cartera (el ${r.porcentaje} % de lo facturado a sus clientes: ${usd(r.venta)}).`), 0]);
    ok("lo que facturo a clientes de otra cartera le cuenta: sale en «lo que le cuenta»",
       [texto($(p, "zc-venta-reemplazo")), rs.ventaReemplazo > 0], [usd(rs.ventaReemplazo), true]);

    /* El maestro no guarda historia: un cliente que figura en las facturas de ese mes pero que hoy es de otro, se dice. */
    const hoyDeOtro = d.clientes.filter((c) => c.enCarteraHoy === false);
    ok("un cliente que en las facturas de ese mes era suyo pero hoy ya es de otro vendedor, lo dice (hay en el simulacro)",
       [hoyDeOtro.length > 0, hoyDeOtro.every((c) => rotulos(fila(p, c.codcli)).includes("Hoy es de otro") &&
                                                   texto(fila(p, c.codcli)).includes("Hoy este cliente ya es de otro vendedor: figura aquí por las facturas del mes."))],
       [true, true]);
    ok("y los que siguen siendo suyos no dicen nada", filas(p).filter((li) => rotulos(li).includes("Hoy es de otro")).length, hoyDeOtro.length);

    const reem = $(p, "zc-reemplazo");
    ok("sus clientes de otra cartera van plegados, con cuantos son", [reem.open, texto(reem.querySelector("summary"))], [false, `Clientes de otra cartera que atendió (${d.reemplazo.length})`]);
    ok("cada uno dice de quien es el cliente",
       [...p.doc.querySelectorAll("#zc-reemplazo-lista > li")].map((li) => detalleDe(li)),
       d.reemplazo.map((c) => `Cliente de ${c.dueno.nombre}`));
    ok("y su cobertura de clientes los suma como de «otra cartera»",
       texto($(p, "zc-cobertura-detalle")).includes(`${rs.coberturaClientes.reemplazo} de otra cartera`), true);

    ok("la comparacion de un mes cerrado: cada mes entero, hasta su ultimo dia (tambien los que pasan de los tres meses)",
       [comparaciones(p).map((li) => li.getAttribute("data-mes")), texto($(p, "zc-comparacion")).includes("Cada mes, entero."),
        comparaciones(p).map((li) => texto(li).match(/hasta el (\d{2}\/\d{2}\/\d{4})/)[1])],
       [["2026-08", "2026-07", "2026-06", "2026-05"], true, d.comparacion.map((c) => fechaCorta(c.corte))]);
    ok("el primero es el mes que se ve, y no dice «este mes»", texto(comparaciones(p)[0]).startsWith("agosto de 2026 · el que ves"), true);

    /* ============================================================ cartera con todo en negativo */
    console.log("\n— la cartera de BENITES, que devolvio mas de lo que vendio (octubre) —");
    preparar();
    p = await montar("clientes.html", "?codusu=421&tipo=CARTERA");
    await pausa(250);
    d = cartera("421");
    rs = d.resumen;

    ok("su venta es negativa, y asi se dice", [texto($(p, "zc-venta")), texto($(p, "zc-venta-propia"))], [usd(rs.venta), usd(rs.ventaPropia)]);
    ok("no atendio a ninguno de su cartera: 0 y la barra vacia",
       [texto($(p, "zc-atendidos")), p.doc.querySelector("#zc-cartera .cdk-progreso__relleno").getAttribute("style")], ["0 · 0.0 %", "width:0%"]);
    ok("sin ventas no hay de que depender, y no se inventa un porcentaje", texto($(p, "zc-concentracion-texto")), "No hay clientes con venta este mes.");
    ok("su cobertura de clientes sigue contando al libre que si se atendio",
       texto($(p, "zc-cobertura-detalle")), `0 clientes de su cartera, 0 de otra cartera y ${plural(rs.coberturaClientes.libres, "libre", "libres")}.`);
    ok("todos sus clientes salen sin atender, tambien los que terminaron en negativo",
       [filas(p).length, filas(p).every((li) => rotulos(li)[0] === "Sin atender")], [d.clientes.length, true]);
    ok("tambien esta de vacaciones: lo dice", texto($(p, "zc-reemplazado")).startsWith("Parece estar de vacaciones: su cartera la atendió MENDOZA DEL CARPIO ROSA"), true);

    /* ============================================================ cobertura */
    console.log("\n— la cobertura de GONZALES JUAN, que reemplazo a dos carteras (octubre) —");
    preparar();
    llamadas = [];
    p = await montar("clientes.html", "?codusu=399&tipo=COBERTURA");
    await pausa(250);
    d = cobertura("399");
    rs = d.resumen;

    ok("pide la cobertura (no la cartera) de ese vendedor, una vez", rutas(), ["/zona/cobertura?codusu=399"]);
    ok("dice quien es y de que tipo", [texto($(p, "zc-nombre")), texto($(p, "zc-detalle"))], ["GONZALES JUAN", "Cobertura · V0334"]);
    ok("a que clientes les dejo venta, y lo que facturo (su avance)", [texto($(p, "zc-atendidos")), texto($(p, "zc-venta"))], [String(rs.atendidos), usd(rs.venta)]);
    ok("«lo que facturo» es el mismo numero que su avance", rs.venta, avance().sinCuota.find((s) => s.codusu === "399").avance);
    ok("no hay nada de cartera: ni «su cartera», ni lo que le cuenta, ni lo que no, ni fuera de cartera ni reemplazo",
       ["zc-cartera", "zc-cuenta", "zc-nocuenta", "zc-cobertura-clientes", "zc-fuera", "zc-reemplazo"].map((id) => $(p, id)), [null, null, null, null, null, null]);

    ok("reemplaza a dos carteras: las dos, en el orden del backend",
       [...p.doc.querySelectorAll("[data-reemplazo='reemplaza']")].map((n) => texto(n)),
       d.reemplazaA.map((r) => `Reemplaza a ${r.nombre}: atendió su cartera (el ${r.porcentaje} % de lo facturado a sus clientes: ${usd(r.venta)}).`));

    /* ---- de quien eran: segun la factura, y NO cierra con lo facturado */
    const rotuloDe = { propio: "Suyos", cartera: "De un vendedor de cartera", libre: "Libres (de la oficina o sin dueño)", otro: "De otro vendedor (que no es de cartera)" };
    ok("de quien eran los clientes atendidos, segun la factura: las cuatro categorias, con cuantos y cuanta venta",
       ["propio", "cartera", "libre", "otro"].map((k) => [texto($(p, "zc-dueno-" + k)), texto($(p, "zc-dueno-" + k).previousElementSibling)]),
       ["propio", "cartera", "libre", "otro"].map((k) => [`${plural(rs.porDueno[k].clientes, "cliente", "clientes")} · ${usd(rs.porDueno[k].venta)}`, rotuloDe[k]]));
    ok("dice que esa venta es de los clientes atendidos y que no cierra con lo facturado (notas de credito)",
       [texto($(p, "zc-por-dueno")).includes("Venta a los clientes atendidos, según la factura"), texto($(p, "zc-por-dueno-nota")).includes("No cierra con lo que facturó"),
        texto($(p, "zc-por-dueno-nota")).includes("terminaron el mes en 0 o en negativo")], [true, true, true]);
    ok("y de verdad no cierra: lo que suman las categorias no es lo facturado (el simulacro lo reproduce)",
       ["propio", "cartera", "libre", "otro"].reduce((s, k) => s + rs.porDueno[k].venta, 0) > rs.venta, true);

    /* ---- sus asignados: segun su cartera de hoy, no es lo mismo que «suyos» */
    ok("sus asignados, segun su cartera de hoy: cuantos tiene, cuantos atendio y cuantos no",
       [texto($(p, "zc-asignados")), texto($(p, "zc-asignados-atendidos")), texto($(p, "zc-asignados-sin-atender"))],
       [String(rs.asignados), `${rs.asignadosAtendidos} · ${pc(rs.porcentajeAsignados)}`, String(rs.asignadosSinAtender)]);
    ok("avisa de que no es lo mismo que «Suyos»",
       [texto($(p, "zc-asignados-nota")).includes("No es lo mismo que «Suyos»"), rs.asignadosAtendidos !== rs.porDueno.propio.clientes], [true, true]);
    ok("clientes nuevos: cuantos y cuanta venta, y que significa «nuevo»",
       [texto($(p, "zc-nuevos-total")), texto($(p, "zc-nuevos")).includes("12 meses anteriores")], [`${plural(rs.nuevos.clientes, "cliente", "clientes")} · ${usd(rs.nuevos.venta)}`, true]);
    ok("de cuantos clientes depende", texto($(p, "zc-concentracion-texto")),
       `Sus 5 clientes más grandes suman ${usd(rs.concentracion.venta)}, el ${pc(rs.concentracion.porcentaje)} de su venta.`);

    /* ---- la comparacion: en cobertura no hay «libres» */
    ok("la comparacion, sin «libres» (eso es de la cartera) y sin la nota",
       [comparaciones(p).length, texto(comparaciones(p)[0]).includes("Libres"), $(p, "zc-comparacion-nota")], [4, false, null]);
    ok("los riesgos: sin los clientes que hoy son de la cartera de alguien",
       [texto($(p, "zc-riesgo")).includes("Sin los clientes que hoy son de la cartera de alguien"), texto($(p, "zc-riesgo")).includes("Solo de entre sus clientes asignados")], [true, false]);

    /* ---- la lista: trae a los atendidos Y a los que terminaron en 0 o en negativo */
    const sinVenta = d.clientes.filter((c) => !c.atendido);
    ok("la lista es la del backend, en su orden", filas(p).map((li) => li.getAttribute("data-codcli")), d.clientes.map((c) => c.codcli));
    ok("trae MAS filas que clientes atendidos: la lista no es la cuenta (los que terminaron en 0 o en negativo no cuentan)",
       [filas(p).length > rs.atendidos, filas(p).length, rs.atendidos + sinVenta.length], [true, d.clientes.length, d.clientes.length]);
    ok("los que terminaron en negativo lo dicen: «no cuenta como atendido»",
       filas(p).filter((li) => rotulos(li).includes("No cuenta como atendido")).length, sinVenta.length);
    ok("los nuevos se marcan", filas(p).filter((li) => rotulos(li).includes("Nuevo")).length, d.clientes.filter((c) => c.nuevo).length);

    const de = (tipo) => d.clientes.find((c) => c.dueno && c.dueno.tipo === tipo && c.atendido);
    const oficina = d.clientes.find((c) => c.dueno && c.dueno.codven === "V0000"), sinDueno = d.clientes.find((c) => c.dueno === null);
    const rotuloDeDueno = (li) => texto(li.querySelector(".cdk-etiqueta"));
    const deQuienEra = (li) => texto(li.querySelector(".cdk-fila__mas > div > span:last-child"));
    ok("de quien es cada cliente, segun la factura, en pocas palabras en la fila: suyo, de cartera, de otro vendedor",
       [rotuloDeDueno(fila(p, de("propio").codcli)), rotuloDeDueno(fila(p, de("cartera").codcli)), rotuloDeDueno(fila(p, de("otro").codcli))],
       ["Suyo", `Cartera · ${de("cartera").dueno.nombre}`, `Otro · ${de("otro").dueno.nombre}`]);
    ok("y completo al tocarla",
       [deQuienEra(fila(p, de("propio").codcli)), deQuienEra(fila(p, de("cartera").codcli)), deQuienEra(fila(p, de("otro").codcli))],
       ["Suyo", `De cartera: ${de("cartera").dueno.nombre}`, `De otro vendedor: ${de("otro").dueno.nombre}`]);
    ok("uno de la oficina viene como libre, y al tocarlo dice OFICINA; uno sin dueño, tambien libre",
       [rotuloDeDueno(fila(p, oficina.codcli)), deQuienEra(fila(p, oficina.codcli)), rotuloDeDueno(fila(p, sinDueno.codcli)), deQuienEra(fila(p, sinDueno.codcli))],
       ["Libre", "OFICINA (libre)", "Libre", "Sin dueño (libre)"]);
    ok("tampoco aqui sale el codigo de ningun cliente",
       d.clientes.concat(d.riesgo.lista).filter((c) => texto(p.doc.getElementById("contenido")).includes(c.codcli)).map((c) => c.codcli), []);
    ok("los clientes de las carteras que reemplazo salen con su dueño, y suman lo que dice `reemplazaA`",
       d.reemplazaA.map((r) => Math.round(d.clientes.filter((c) => c.dueno && c.dueno.codven === r.codven && c.dueno.tipo === "cartera").reduce((s, c) => s + c.venta, 0) * 100) / 100),
       d.reemplazaA.map((r) => r.venta));

    const propioConOtros = d.clientes.find((c) => c.otros.length);
    ok("lo que otro vendedor le facturo a un cliente suyo se ve, aunque casi nunca pasa",
       [texto(fila(p, propioConOtros.codcli).querySelector("[data-otros]")).includes(`${propioConOtros.otros[0].nombre} (${usd(propioConOtros.otros[0].venta)})`),
        p.doc.querySelectorAll("#zc-clientes [data-otros]").length], [true, d.clientes.filter((c) => c.otros.length).length]);

    /* ---- las pestañas de la cobertura: de a una */
    const codigos = () => filas(p).map((li) => li.getAttribute("data-codcli"));
    const atendidosDe = (k) => d.clientes.filter((c) => c.atendido && (c.dueno ? c.dueno.tipo : "libre") === k).map((c) => c.codcli);
    ok("siete pestañas, en vez de dos desplegables, y «Todos» esta activa",
       [pestanas(p), pestanaActiva(p), $(p, "zc-filtro-dueno"), $(p, "zc-filtro-nuevos")],
       [["Todos", "Nuevos", "Suyos", "De cartera", "Libres", "De otro", "No cuentan"], ["todos"], null, null]);
    filtrar(p, "propio");
    ok("«Suyos»: los atendidos que eran suyos, como `porDueno` (los que terminaron en 0 no entran)", codigos(), atendidosDe("propio"));
    filtrar(p, "libre");
    ok("«Libres»: la oficina Y los que no tienen dueño", codigos(), atendidosDe("libre"));
    filtrar(p, "cartera");
    ok("«De cartera»", codigos(), atendidosDe("cartera"));
    filtrar(p, "otro");
    ok("«De otro»", codigos(), atendidosDe("otro"));
    ok("las cuatro de dueño mas «No cuentan» cubren a todos los clientes, ninguno dos veces",
       ["propio", "cartera", "libre", "otro"].reduce((s, k) => s + atendidosDe(k).length, 0) + sinVenta.length, d.clientes.length);
    filtrar(p, "nuevos");
    ok("«Nuevos»: solo los nuevos", [codigos(), pestanaActiva(p)], [d.clientes.filter((c) => c.nuevo).map((c) => c.codcli), ["nuevos"]]);
    filtrar(p, "no");
    ok("«No cuentan»: los que terminaron en 0 o en negativo", [codigos(), pestanaActiva(p)], [sinVenta.map((c) => c.codcli), ["no"]]);
    ok("y dice cuantos se muestran de cuantos", texto($(p, "zc-lista-cuenta")), `Se muestran ${sinVenta.length} de ${d.clientes.length}.`);
    filtrar(p, "todos");
    ok("«Todos» los devuelve, en el orden del backend", codigos(), d.clientes.map((c) => c.codcli));

    /* ---- la explicacion de la lista */
    ok("la lista dice que incluye a los que terminaron en 0 o en negativo, y que los sin atender no vienen",
       [texto($(p, "zc-clientes-seccion").querySelector(".cdk-seccion__sub")).includes("terminaron en 0 o en negativo"),
        texto($(p, "zc-clientes-seccion").querySelector(".cdk-seccion__sub")).includes("no vienen en la lista, solo su cuenta")], [true, true]);
    ok("y el titulo no cuenta con `length`", texto($(p, "zc-clientes-titulo")), "Sus clientes del mes");

    /* ============================================================ cobertura de un mes cerrado */
    console.log("\n— la cobertura de un mes cerrado (julio, el tercero hacia atras) —");
    await elegirOpcion(p, $(p, "zc-mes"), "2026-07");
    const jul = { anno: "2026", mes: "7" };
    d = cobertura("399", jul);
    ok("pide julio, que todavia se puede", rutas().slice(-1), ["/zona/cobertura?codusu=399&anno=2026&mes=7"]);
    ok("avisa de que los asignados pueden estar incompletos", !!$(p, "zc-aviso-historia"), true);
    ok("reemplazo a CASTILLO ese mes: lo dice, y sus clientes suman esa venta",
       [texto(p.doc.querySelector("[data-reemplazo='reemplaza']")).startsWith("Reemplaza a CASTILLO FLORES DIEGO"),
        Math.round(d.clientes.filter((c) => c.dueno && c.dueno.codven === d.reemplazaA[0].codven).reduce((s, c) => s + c.venta, 0) * 100) / 100 === d.reemplazaA[0].venta], [true, true]);

    /* ============================================================ cobertura sin ventas */
    console.log("\n— la cobertura de un vendedor recien llegado, sin ventas —");
    preparar();
    p = await montar("clientes.html", "?codusu=422&tipo=COBERTURA");
    await pausa(250);
    d = cobertura("422");
    ok("ninguna venta: 0 atendidos y 0 facturado", [texto($(p, "zc-atendidos")), texto($(p, "zc-venta"))], ["0", "$ 0.00"]);
    ok("una lista vacia lo dice, no queda un hueco", texto($(p, "zc-lista")), "Este vendedor no le facturó a ningún cliente este mes.");
    ok("sin clientes en riesgo, lo dice", [texto($(p, "zc-riesgo-vacio")), texto($(p, "zc-riesgo").querySelector("summary"))], ["Ningún cliente en riesgo.", "Clientes en riesgo (0)"]);
    ok("sin concentracion que mostrar", texto($(p, "zc-concentracion-texto")), "No hay clientes con venta este mes.");
    ok("sus asignados siguen saliendo, con 0 atendidos", [texto($(p, "zc-asignados")), texto($(p, "zc-asignados-atendidos"))], [String(d.resumen.asignados), "0 · 0.0 %"]);

    /* ============================================================ la ruta se elige por el tipo de ESE mes */
    console.log("\n— la ruta se elige por el tipo, y el tipo es el de ese mes —");
    preparar();
    llamadas = [];
    p = await montar("clientes.html", "?codusu=414&tipo=CARTERA");
    await pausa(250);
    ok("SALAZAR hoy es de cartera: pide la cartera, una vez, y pinta una cartera",
       [rutas(), !!$(p, "zc-cartera"), $(p, "zc-atendidos-seccion")], [["/zona/cartera?codusu=414"], true, null]);

    filtrar(p, "sin");
    llamadas = [];
    await elegirOpcion(p, $(p, "zc-mes"), "2026-08");
    ok("en agosto fue de cobertura: la cartera dice «vendedor de otro tipo» y se pide a la cobertura, una sola vez",
       rutas(), ["/zona/cartera?codusu=414&anno=2026&mes=8", "/zona/cobertura?codusu=414&anno=2026&mes=8"]);
    ok("la pestaña «Sin atender» es de cartera: al pasar a cobertura no existe, y vuelve a «Todos»", [pestanas(p).includes("Sin atender"), pestanaActiva(p)], [false, ["todos"]]);
    ok("y se pinta una cobertura", [!!$(p, "zc-atendidos-seccion"), $(p, "zc-cartera"), texto($(p, "zc-detalle"))], [true, null, "Cobertura · V0372"]);

    llamadas = [];
    await elegirOpcion(p, $(p, "zc-mes"), "2026-07");
    ok("recuerda el tipo que contesto (cobertura), asi que prueba esa primero; julio fue de cartera, y se corrige sola",
       rutas(), ["/zona/cobertura?codusu=414&anno=2026&mes=7", "/zona/cartera?codusu=414&anno=2026&mes=7"]);
    ok("y vuelve a pintar una cartera", [!!$(p, "zc-cartera"), $(p, "zc-atendidos-seccion")], [true, null]);

    llamadas = [];
    await elegirOpcion(p, $(p, "zc-mes"), "");
    ok("volver al mes en curso: ya sabe que es de cartera, y va directo", rutas(), ["/zona/cartera?codusu=414"]);

    /* sin pista, o con una pista equivocada */
    preparar();
    llamadas = [];
    p = await montar("clientes.html", "?codusu=399");
    await pausa(250);
    ok("sin pista de tipo, apuesta por la cartera y, si no es, pide la cobertura",
       [rutas(), !!$(p, "zc-atendidos-seccion")], [["/zona/cartera?codusu=399", "/zona/cobertura?codusu=399"], true]);
    ok("«Cambiar» vuelve a la lista del tipo que de verdad tiene (cobertura), no al de la apuesta",
       $(p, "zc-elegir-otro").getAttribute("href"), "/clientes.html?tipo=COBERTURA");

    llamadas = [];
    p = await montar("clientes.html", "?codusu=293&tipo=COBERTURA");
    await pausa(250);
    ok("una pista equivocada se corrige sola", [rutas(), !!$(p, "zc-cartera")], [["/zona/cobertura?codusu=293", "/zona/cartera?codusu=293"], true]);
    ok("y «Cambiar» vuelve a la lista de cartera", $(p, "zc-elegir-otro").getAttribute("href"), "/clientes.html?tipo=CARTERA");

    llamadas = [];
    p = await montar("clientes.html", "?codusu=399&tipo=cobertura");
    await pausa(250);
    ok("la pista va en minusculas, tambien", rutas(), ["/zona/cobertura?codusu=399"]);

    llamadas = [];
    p = await montar("clientes.html", "?codusu=293&tipo=XYZ");
    await pausa(250);
    ok("una pista que no es un tipo se ignora", rutas(), ["/zona/cartera?codusu=293"]);

    /* si las dos dicen «otro tipo», no hay bucle */
    llamadas = [];
    forzar = (ruta) => (/^\/zona\/(cartera|cobertura)/.test(ruta) ? respuesta({ status: "vendedor de otro tipo", codigo: 2, msg: "no es de ninguno" }, 400) : null);
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    ok("si las dos rutas dicen «otro tipo», prueba cada una UNA vez y se detiene, diciendo el motivo del backend (un 4xx no ofrece reintentar: insistir da lo mismo)",
       [rutas(), texto($(p, "contenido")).includes("no es de ninguno"), !!p.doc.querySelector("#contenido .cdk-estado button")],
       [["/zona/cartera?codusu=293", "/zona/cobertura?codusu=293"], true, false]);
    forzar = null;

    /* ============================================================ nada se calcula aqui */
    console.log("\n— nada se calcula en pantalla —");
    preparar();
    alterar = (camino, r) => {
        const x = r.cuerpo.data;
        if (camino === "/zona/cartera" && x && x.resumen) {
            Object.assign(x.resumen, { venta: 1.11, ventaPropia: 2.22, ventaReemplazo: 3.33, ventaDeOtros: 4.44, asignados: 7, atendidos: 5, sinAtender: 9, porcentaje: 12.3 });
            x.resumen.coberturaClientes = { total: 99, cartera: 1, reemplazo: 2, libres: 3 };
            x.resumen.concentracion = { clientes: 5, venta: 77.7, porcentaje: 88.8 };
            x.comparacion[0].clientes = 55; x.comparacion[0].venta = 66.6;
        }
        return r;
    };
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    ok("los totales, el desglose y la cobertura de clientes son los que llegan, aunque no cuadren con la lista ni entre si",
       [texto($(p, "zc-venta")), texto($(p, "zc-venta-propia")), texto($(p, "zc-venta-reemplazo")), texto($(p, "zc-venta-otros")),
        texto($(p, "zc-asignados")), texto($(p, "zc-atendidos")), texto($(p, "zc-sin-atender")), texto($(p, "zc-cobertura-total"))],
       ["$ 1.11", "$ 2.22", "$ 3.33", "$ 4.44", "7", "5 · 12.3 %", "9", "99"]);
    ok("la concentracion y la comparacion tambien, y con 70 % o mas dice que depende de pocos",
       [texto($(p, "zc-concentracion-texto")), texto($(p, "zc-concentracion-alto")), texto(comparaciones(p)[0]).includes("Clientes 55") && texto(comparaciones(p)[0]).includes("Venta $ 66.60")],
       ["Sus 5 clientes más grandes suman $ 77.70, el 88.8 % de su venta.", "Depende de muy pocos clientes.", true]);

    alterar = (camino, r) => {
        const x = r.cuerpo.data;
        if (camino === "/zona/cobertura" && x && x.resumen) {
            Object.assign(x.resumen, { atendidos: 3, venta: 9.99, asignados: 8, asignadosAtendidos: 4, asignadosSinAtender: 4, porcentajeAsignados: 50 });
            x.resumen.porDueno.propio = { clientes: 1, venta: 11.11 };
            x.resumen.nuevos = { clientes: 2, venta: 22.22 };
        }
        return r;
    };
    p = await montar("clientes.html", "?codusu=399&tipo=COBERTURA");
    await pausa(250);
    ok("en la cobertura: atendidos, venta, «suyos», asignados y nuevos son los que llegan",
       [texto($(p, "zc-atendidos")), texto($(p, "zc-venta")), texto($(p, "zc-dueno-propio")), texto($(p, "zc-asignados-atendidos")), texto($(p, "zc-nuevos-total"))],
       ["3", "$ 9.99", "1 cliente · $ 11.11", "4 · 50.0 %", "2 clientes · $ 22.22"]);
    alterar = null;

    /* ============================================================ un backend sin lo ultimo del 24/10 */
    console.log("\n— un backend anterior a los clientes libres —");
    preparar();
    alterar = (camino, r) => {
        const x = r.cuerpo.data;
        if (camino === "/zona/cartera" && x && x.resumen) {
            delete x.resumen.ventaFueraDeCartera; delete x.resumen.coberturaClientes; delete x.fueraDeCartera;
            x.comparacion.forEach((c) => { delete c.libres; });
        }
        return r;
    };
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    ok("sin `ventaFueraDeCartera`, `coberturaClientes`, `fueraDeCartera` ni `libres` no se inventa nada, y lo demas se pinta igual",
       [$(p, "zc-fuera-venta"), $(p, "zc-cobertura-clientes"), $(p, "zc-fuera"), $(p, "zc-comparacion-nota"), texto(comparaciones(p)[0]).includes("Libres"),
        !!$(p, "zc-venta"), filas(p).length, comparaciones(p).length], [null, null, null, null, false, true, cartera("293").clientes.length, 4]);
    alterar = null;

    /* Sin `reemplazadoPor` ni `reemplazaA`: el contrato dice que siempre vienen, pero la pantalla no se rompe si faltan. */
    alterar = (camino, r) => {
        const x = r.cuerpo.data;
        if (x && x.resumen) { delete x.reemplazadoPor; delete x.reemplazaA; }
        return r;
    };
    p = await montar("clientes.html", "?codusu=399&tipo=COBERTURA");
    await pausa(250);
    ok("sin `reemplazadoPor` ni `reemplazaA` no se inventa ninguna nota, y la pantalla se pinta entera",
       [p.doc.querySelectorAll("[data-reemplazo]").length, !!$(p, "zc-atendidos"), filas(p).length], [0, true, cobertura("399").clientes.length]);
    alterar = null;

    /* ============================================================ actualizar */
    console.log("\n— actualizar —");
    preparar();
    llamadas = [];
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    filtrar(p, "atendidos");
    llamadas = [];
    clic(p, $(p, "zc-actualizar"));
    await pausa(250);
    ok("«Actualizar» pide la cartera otra vez, y la pantalla sigue", [rutas(), !!$(p, "zc-venta")], [["/zona/cartera?codusu=293"], true]);
    ok("sin perder la pestaña que habia puesto", [pestanaActiva(p), filas(p).length], [["atendidos"], cartera("293").clientes.filter((c) => c.atendido).length]);

    /* si no se puede actualizar, la pantalla buena se queda */
    forzar = (ruta) => (ruta.startsWith("/zona/cartera") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    clic(p, $(p, "zc-actualizar"));
    await pausa(250);
    ok("un fallo al actualizar avisa y deja la pantalla como estaba",
       [toasts(p.doc).some((t) => t.includes("No se pudo actualizar la pantalla. se cayo")), !!$(p, "zc-venta"), $(p, "zc-actualizar").disabled], [true, true, false]);

    /* y al cambiar de mes, el selector vuelve donde estaba */
    forzar = (ruta) => (ruta.includes("mes=9") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    await elegirOpcion(p, $(p, "zc-mes"), "2026-09");
    ok("si no se puede ir a otro mes, el selector se queda en el que estaba y la pantalla sigue",
       [$(p, "zc-mes").value, $(p, "zc-mes").disabled, !!$(p, "zc-venta")], ["", false, true]);
    forzar = null;

    /* ============================================================ errores */
    console.log("\n— errores —");
    preparar();
    llamadas = [];
    p = await montar("clientes.html", "?codusu=229");
    await pausa(250);
    ok("alguien que no es del grupo 20: lo dice, sin reintentar, y ofrece elegir otro; y no prueba la otra ruta",
       [texto($(p, "zc-desconocido")).includes("ese usuario no es un vendedor del grupo 20"), $(p, "zc-elegir-otro").getAttribute("href"),
        !!p.doc.querySelector("#contenido .cdk-estado button"), rutas()], [true, "/clientes.html", false, ["/zona/cartera?codusu=229"]]);

    forzar = (ruta) => (/^\/zona\/(cartera|cobertura)/.test(ruta) ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    ok("un fallo del servidor se dice, con reintento", !!p.doc.querySelector("#contenido .cdk-estado button"), true);
    forzar = null;
    clic(p, p.doc.querySelector("#contenido .cdk-estado button"));
    await pausa(250);
    ok("reintentar pinta la cartera", [!!$(p, "zc-cartera"), texto($(p, "zc-nombre"))], [true, "UTANI FERNANDO"]);

    forzar = (ruta) => (/^\/zona\/(cartera|cobertura)/.test(ruta) ? respuesta({ status: "ok", codigo: 0, data: { vendedor: { nombre: "X" } } }, 200) : null);
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    ok("una respuesta que no es lo que dice el contrato no se pinta a ojo", [texto($(p, "contenido")).includes("La respuesta no trae los clientes."), $(p, "zc-cartera")], [true, null]);
    forzar = null;

    preparar("ESPECIALISTA");
    llamadas = [];
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    ok("quien es de otro grupo no lo ve: el motivo del backend, y sin probar la otra ruta",
       [texto($(p, "contenido")).includes("esta ruta es del grupo 34"), rutas()], [true, ["/zona/cartera?codusu=293"]]);

    preparar();
    forzar = (ruta) => (ruta.startsWith("/zona/cartera")
        ? respuesta({ status: "usuario sin acceso", codigo: 3, msg: "este usuario todavia no tiene acceso a la intranet" }, 403) : null);
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    ok("`usuario sin acceso`: lleva al login", p.destinos, ["/index.html"]);
    forzar = null;

    /* ============================================================ el menu */
    console.log("\n— el menu del jefe de zona —");
    preparar();
    p = await montar("clientes.html", "?codusu=293&tipo=CARTERA");
    await pausa(250);
    const activo = p.doc.querySelector(".cdk-sidebar__enlace.es-activo");
    ok("Cobertura sale en el menu (su clave sigue siendo `clientes`), marcado, y lleva a su pagina", [texto(activo), activo && activo.getAttribute("href")], ["Cobertura", "/clientes.html"]);
    ok("son cuatro modulos y en este orden", [...p.doc.querySelectorAll("#cdk-sidebar-lista .cdk-sidebar__enlace")].map((a) => texto(a)), ["Cotización", "Avance", "Probabilidad", "Cobertura"]);
    ok("con su icono (dos personas)", (activo.querySelector("svg path").getAttribute("d") || "").startsWith("M18 18.72a9.094"), true);
    ok("caben los cuatro en los cuatro espacios de la barra de abajo de un movil (el quinto boton es siempre «Más»)",
       [...p.doc.querySelectorAll(".cdk-bottomnav__enlace")].map((a) => texto(a)), ["Cotización", "Avance", "Probabilidad", "Cobertura", "Más"]);

    /* ============================================================ el simulacro cumple el contrato */
    console.log("\n— el simulacro cumple el contrato (para los 12 vendedores y los 4 meses) —");
    preparar();
    const malos = { venta: [], listas: [], codigos: [], tipo: [], reemplazos: [] };
    const r2 = (n) => Math.round(n * 100) / 100;
    const suma = (xs, f) => r2(xs.reduce((s, x) => s + f(x), 0));
    for (let atras = 0; atras <= 3; atras++) {
        const periodo = atras === 0 ? {} : { anno: "2026", mes: String(10 - atras) };
        const a = avance(periodo);
        for (const f of a.vendedores.concat(a.sinCuota)) {
            const clave = `${f.codusu}/-${atras}`;
            const dd = (f.tipo === "CARTERA" ? cartera : cobertura)(f.codusu, periodo);
            const otra = (f.tipo === "CARTERA" ? zonaSim.cobertura : zonaSim.cartera)(Object.assign({ codusu: f.codusu }, periodo));
            if (otra.cuerpo.status !== "vendedor de otro tipo") malos.tipo.push(clave);
            if (dd.resumen.venta !== f.avance) malos.venta.push(clave);
            if (dd.comparacion[0].venta !== f.avance) malos.venta.push(clave + " comparacion");
            if (JSON.stringify([dd.reemplazadoPor, dd.reemplazaA]) !== JSON.stringify([f.reemplazadoPor, f.reemplazaA])) malos.reemplazos.push(clave);
            const cods = dd.clientes.map((c) => c.codcli);
            if (new Set(cods).size !== cods.length) malos.codigos.push(clave);
            if (f.tipo === "CARTERA") {
                if (suma(dd.clientes, (c) => c.venta) !== dd.resumen.ventaPropia) malos.listas.push(clave + " clientes");
                if (suma(dd.reemplazo, (c) => c.venta) !== dd.resumen.ventaReemplazo) malos.listas.push(clave + " reemplazo");
                if (suma(dd.fueraDeCartera, (c) => c.venta) !== dd.resumen.ventaFueraDeCartera.venta) malos.listas.push(clave + " fuera");
            } else if (suma(dd.clientes, (c) => c.venta) !== dd.resumen.venta) malos.listas.push(clave + " cobertura");
        }
    }
    ok("`venta` es el `avance` de ese vendedor en ese mes, al centimo (y es la comparacion del mes pedido)", malos.venta, []);
    ok("las listas suman exacto lo que dice su resumen", malos.listas, []);
    ok("la ruta equivocada responde `400 vendedor de otro tipo`", malos.tipo, []);
    ok("los reemplazos son los mismos que en el avance", malos.reemplazos, []);
    ok("ningun codigo de cliente se repite en una lista", malos.codigos, []);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
