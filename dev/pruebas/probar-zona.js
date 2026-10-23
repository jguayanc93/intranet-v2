/**
 * Prueba de integracion del jefe de zona (grupo 34): el avance de la cuota de todos los vendedores del grupo 20 y
 * la probabilidad de que uno llegue a la suya, sobre las paginas reales.
 *
 * Lo que mas importa:
 *
 *   · que NADA se calcule en pantalla: el porcentaje, el semaforo, lo que ya paso del mes, la proyeccion, la
 *     probabilidad y el mes anterior son los del backend
 *   · que el semaforo se diga con TEXTO, y que un mes cerrado no tenga semaforo ni lo de hoy: ahi manda si logro la meta
 *   · que quien no registro su cuota salga aparte, y que un vendedor nuevo o con avance negativo se vea como tal
 *   · que se diga que es en dolares CON IGV (no la regla de la cuota por marca)
 *   · que se actualice solo cada 3 minutos mientras se ve y es el mes en curso, y nunca en un mes cerrado
 *   · que la probabilidad compare los 4 meses a la misma altura, con como termino cada uno, y que un mes sin cuota,
 *     un vendedor nuevo o una meta alcanzada se digan sin inventar un numero
 *   · que un 403 `usuario sin acceso` lleve al login, y que el menu del jefe de zona sea de tres modulos
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
                    probabilidad: "Probabilidad de que un vendedor llegue a su cuota" },
            nombre: "CRISTHIAM VACA", grupo: "VENTAS-JEFES DE ZONA", tipo: S.rol, tipoCambio: 3.75
        });
    }

    let r = null;
    if (camino === "/zona/avance") r = zonaSim.avance({ anno: params.get("anno"), mes: params.get("mes") });
    else if (camino === "/zona/probabilidad") r = zonaSim.probabilidad({ codusu: params.get("codusu") });

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

    /* El refresco automatico dura 3 minutos: se anota en vez de esperarlo, y se dispara a mano. */
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
/** Dispara el refresco programado, como si hubieran pasado los 3 minutos: ya no esta programado, y el codigo programa el siguiente. */
const disparar = (p) => { const r = p.activos()[0]; r.cancelado = true; r.fn(); };
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
const escribir = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("input", { bubbles: true })); };
const elegirOpcion = async (p, select, valor) => {
    select.value = valor;
    select.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    await pausa(250);
};
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);
const sinNbsp = (t) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);

const $ = (p, id) => p.doc.getElementById(id);
const rutas = () => llamadas.filter((l) => l.url.includes("/zona/")).map((l) => l.url.replace(/^.*\/v1/, ""));
const filas = (p) => [...p.doc.querySelectorAll("#za-vendedores > li")];
const nombreDe = (li) => texto(li.querySelector(".cdk-articulo__nombre"));
const fila = (p, codusu) => p.doc.querySelector(`#za-vendedores > li[data-codusu='${codusu}']`);
const chip = (li) => li.querySelector(".cdk-semaforo");

const delBackend = (periodo) => zonaSim.avance(periodo || {}).cuerpo.data;
const usd = (n) => "$ " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function preparar(rol) {
    marcasSim.reiniciar(rol || "ZONA");
    forzar = null; alterar = null;
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Jefe de zona (grupo 34) · avance y probabilidad ===\n");

    /* ============================================================ el avance: el total */
    console.log("— el avance del mes en curso —");
    preparar();
    llamadas = [];
    let p = await montar("avance.html");
    await pausa(250);
    const sim = delBackend();

    ok("carga sin errores", fallos, 0);
    ok("pide el avance del mes en curso, una vez, sin periodo", rutas(), ["/zona/avance"]);
    ok("dice el mes y a que hora se calculo", texto($(p, "periodo")), "octubre de 2026 · actualizado a las 18:47");

    ok("el total: lo que llevan todos, y la meta de todos (los del backend)",
       [texto($(p, "za-total-avance")), texto($(p, "za-total-meta"))], [usd(sim.total.avance), usd(sim.total.meta)]);
    ok("cuantos tienen cuota, cuantos ya llegaron y cuantos no la registraron",
       [texto($(p, "za-total-vendedores")), texto($(p, "za-total-logrados")), texto($(p, "za-total-sincuota"))],
       [String(sim.total.vendedores), sim.total.logrados + " de " + sim.total.vendedores, String(sim.total.sinCuota)]);
    ok("lo facturado hoy entre todos", texto($(p, "za-total-hoy")), usd(sim.total.hoy));
    ok("dice cuanto llevan y cuanto del mes ya paso, con los numeros del backend",
       texto($(p, "za-ritmo-texto")), `Llevan el ${sim.total.porcentaje} % de la meta, y ya pasó el ${sim.esperado} % del mes.`);

    const marca = p.doc.querySelector("#za-total-barra .cdk-ritmo__marca");
    ok("la barra lleva la marca de cuanto del mes ya paso", marca && marca.getAttribute("style"), `left:${sim.esperado}%`);
    ok("y el relleno es lo que llevan, no lo que ya paso", p.doc.querySelector("#za-total-barra .cdk-progreso__relleno").getAttribute("style"), `width:${sim.total.porcentaje}%`);

    ok("el semaforo, contado: cuantos hay en cada color, dicho con texto",
       [...p.doc.querySelectorAll("#za-estados .cdk-semaforo")].map((s) => texto(s)),
       ["Logrado " + sim.total.estados.logrado, "Adelantado " + sim.total.estados.adelantado, "Justo " + sim.total.estados.justo, "Atrasado " + sim.total.estados.atrasado]);

    ok("avisa de que es en dolares CON IGV, el mismo numero de la cuota del vendedor",
       texto($(p, "za-resumen").querySelector(".cdk-seccion__sub")).includes("Todo en dólares y con IGV"), true);
    ok("dice hasta que dia hay facturas", texto($(p, "za-ventas-hasta")), "Con facturas hasta el 21/10/2026.");
    ok("y que se actualiza solo", texto($(p, "za-refresco")).includes("cada 3 minutos"), true);

    /* Nada se calcula aqui: si no cuadra con las filas, sale lo del backend. */
    alterar = (camino, r) => {
        if (r.cuerpo.data && r.cuerpo.data.total) {
            r.cuerpo.data.total.avance = 111.11; r.cuerpo.data.total.meta = 222.22; r.cuerpo.data.total.porcentaje = 50;
            r.cuerpo.data.esperado = 33;
        }
        return r;
    };
    p = await montar("avance.html");
    await pausa(250);
    ok("el total no se suma de las filas: sale el que llega, aunque no cuadre",
       [texto($(p, "za-total-avance")), texto($(p, "za-total-meta")), texto($(p, "za-ritmo-texto"))],
       ["$ 111.11", "$ 222.22", "Llevan el 50.0 % de la meta, y ya pasó el 33 % del mes."]);
    ok("y la marca va donde dice `esperado`", p.doc.querySelector("#za-total-barra .cdk-ritmo__marca").getAttribute("style"), "left:33%");
    alterar = null;

    /* ============================================================ el avance: los vendedores */
    console.log("\n— los vendedores —");
    preparar();
    p = await montar("avance.html");
    await pausa(250);

    ok("los vendedores, en el orden del backend (de mas a menos avance)", filas(p).map((li) => li.getAttribute("data-codusu")), sim.vendedores.map((v) => v.codusu));

    /* ---- el semaforo, con texto */
    const atrasado = sim.vendedores.find((v) => v.estado === "atrasado" && v.motivo === null && v.probabilidad === 0);
    const filaAtrasado = fila(p, atrasado.codusu);
    ok("cada vendedor dice su semaforo con TEXTO, y el color solo acompaña",
       [texto(chip(filaAtrasado)), chip(filaAtrasado).className.includes("cdk-semaforo--atrasado")], ["Atrasado", true]);
    ok("los cuatro estados, cada uno con su texto", ["logrado", "adelantado", "justo", "atrasado"].map((e) => {
        const v = sim.vendedores.find((x) => x.estado === e);
        return texto(chip(fila(p, v.codusu)));
    }), ["Logrado", "Adelantado", "Justo", "Atrasado"]);

    ok("su barra lleva la marca de cuanto del mes ya paso", filaAtrasado.querySelector(".cdk-ritmo__marca").getAttribute("style"), `left:${sim.esperado}%`);
    ok("lo que lleva, de su meta, y su %",
       texto($(p, "za-avance-" + atrasado.codusu)), `${usd(atrasado.avance)} de ${usd(atrasado.meta)} · ${atrasado.porcentaje} %`);
    ok("lo que le falta, y lo que facturo hoy",
       [texto(filaAtrasado).includes("Le falta " + usd(atrasado.falta)), texto(filaAtrasado).includes("Hoy " + usd(atrasado.hoy))], [true, true]);
    ok("a su ritmo de los ultimos 90 dias, como cerraria",
       texto($(p, "za-proyeccion-" + atrasado.codusu)), `A su ritmo de los últimos 90 días cerraría en ${usd(atrasado.proyeccion)}.`);
    ok("y la probabilidad de llegar, la del backend",
       texto($(p, "za-probabilidad-" + atrasado.codusu)), "Probabilidad de llegar a su meta: 0.0 %");
    ok("el tipo y el codigo del vendedor", texto(filaAtrasado.querySelector(".cdk-articulo__detalle")), `${atrasado.tipo === "COBERTURA" ? "Cobertura" : "Cartera"} · ${atrasado.codven}`);

    /* ---- el mes anterior */
    const conAnterior = sim.vendedores.find((v) => v.mesAnterior);
    ok("como cerro el mes anterior, con su % y su meta",
       texto($(p, "za-anterior-" + conAnterior.codusu)),
       `El mes anterior cerró en ${conAnterior.mesAnterior.porcentaje} % de su meta de ${usd(conAnterior.mesAnterior.meta)} · ${conAnterior.mesAnterior.logro ? "la logró." : "no la logró."}`);
    const sinAnterior = sim.vendedores.find((v) => !v.mesAnterior);
    ok("si el mes anterior no registro cuota, lo dice", texto($(p, "za-anterior-" + sinAnterior.codusu)), "El mes anterior no registró cuota.");

    /* ---- los casos que no son el comun */
    const logrado = sim.vendedores.find((v) => v.estado === "logrado");
    ok("quien ya llego: no tiene «le falta», y dice que ya llego (no una probabilidad inventada)",
       [texto(fila(p, logrado.codusu)).includes("Le falta"), texto($(p, "za-probabilidad-" + logrado.codusu))], [false, "Ya llegó a su meta."]);
    ok("su barra pasa de 100 sin salirse: el relleno se corta en 100",
       fila(p, logrado.codusu).querySelector(".cdk-progreso__relleno").getAttribute("style"), "width:100%");

    const nuevo = sim.vendedores.find((v) => v.motivo === "historia insuficiente");
    ok("un vendedor nuevo no tiene proyeccion ni probabilidad: lo dice, no se inventa",
       [$(p, "za-proyeccion-" + nuevo.codusu), texto($(p, "za-probabilidad-" + nuevo.codusu))],
       [null, "Vendedor nuevo: todavía no hay historia para calcular su probabilidad."]);

    const negativo = sim.vendedores.find((v) => v.avance < 0);
    ok("quien devolvio mas de lo que vendio tiene un % negativo, y su barra no se sale por la izquierda",
       [texto($(p, "za-avance-" + negativo.codusu)).endsWith("· -1.4 %"), fila(p, negativo.codusu).querySelector(".cdk-progreso__relleno").getAttribute("style")],
       [true, "width:0%"]);

    ok("cada fila lleva al detalle de ese vendedor",
       $(p, "za-ver-probabilidad-" + atrasado.codusu).getAttribute("href"), "/probabilidad.html?codusu=" + atrasado.codusu);

    /* ---- nada se calcula aqui */
    alterar = (camino, r) => {
        if (r.cuerpo.data && r.cuerpo.data.vendedores) {
            const v = r.cuerpo.data.vendedores[0];
            v.porcentaje = 12.3; v.estado = "atrasado"; v.proyeccion = 1.5; v.probabilidad = 77.7; v.motivo = null; v.avance = 5; v.meta = 9999;
        }
        return r;
    };
    p = await montar("avance.html");
    await pausa(250);
    const primero = filas(p)[0];
    ok("el %, el semaforo, la proyeccion y la probabilidad son los que llegan, aunque no cuadren entre si",
       [texto(chip(primero)), texto($(p, "za-avance-" + primero.getAttribute("data-codusu"))), texto($(p, "za-proyeccion-" + primero.getAttribute("data-codusu"))),
        texto($(p, "za-probabilidad-" + primero.getAttribute("data-codusu")))],
       ["Atrasado", "$ 5.00 de $ 9,999.00 · 12.3 %", "A su ritmo de los últimos 90 días cerraría en $ 1.50.", "Probabilidad de llegar a su meta: 77.7 %"]);
    alterar = null;

    /* ---- buscar y filtrar */
    console.log("\n— buscar y filtrar —");
    preparar();
    p = await montar("avance.html");
    await pausa(250);
    escribir(p, $(p, "za-buscar"), "huamani");
    ok("buscar por nombre", filas(p).map((li) => nombreDe(li)), ["HUAMANI ANTHONY"]);
    escribir(p, $(p, "za-buscar"), "v0343");
    ok("o por codigo de vendedor", filas(p).map((li) => li.getAttribute("data-codusu")), ["412"]);
    escribir(p, $(p, "za-buscar"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "za-lista")), "Ningún vendedor coincide.");
    escribir(p, $(p, "za-buscar"), "");

    await elegirOpcion(p, $(p, "za-filtro-tipo"), "CARTERA");
    ok("filtrar por tipo", filas(p).map((li) => li.getAttribute("data-codusu")), sim.vendedores.filter((v) => v.tipo === "CARTERA").map((v) => v.codusu));
    await elegirOpcion(p, $(p, "za-filtro-tipo"), "todos");
    await elegirOpcion(p, $(p, "za-filtro-estado"), "atrasado");
    ok("filtrar por semaforo: los atrasados", filas(p).map((li) => li.getAttribute("data-codusu")), sim.vendedores.filter((v) => v.estado === "atrasado").map((v) => v.codusu));
    await elegirOpcion(p, $(p, "za-filtro-tipo"), "COBERTURA");
    ok("y los dos filtros juntos", filas(p).map((li) => li.getAttribute("data-codusu")),
       sim.vendedores.filter((v) => v.estado === "atrasado" && v.tipo === "COBERTURA").map((v) => v.codusu));

    /* ============================================================ los que no registraron cuota */
    console.log("\n— los que no registraron su cuota —");
    preparar();
    p = await montar("avance.html");
    await pausa(250);
    const sc = $(p, "za-sincuota");
    ok("salen aparte, plegados, y dicen cuantos son", [texto(sc.querySelector("summary")), sc.open], [`No registraron su cuota (${sim.sinCuota.length})`, false]);
    ok("en el orden del backend (del que mas factura al que menos)",
       [...p.doc.querySelectorAll("#za-sincuota-lista > li")].map((li) => li.getAttribute("data-codusu")), sim.sinCuota.map((s) => s.codusu));
    const s0 = sim.sinCuota[0];
    const li0 = p.doc.querySelector(`#za-sincuota-lista > li[data-codusu='${s0.codusu}']`);
    ok("cada uno: lo que facturo, hoy y como cerraria a su ritmo",
       [texto(li0).includes("Facturó " + usd(s0.avance)), texto(li0).includes("Hoy " + usd(s0.hoy)), texto(li0).includes("cerraría en " + usd(s0.proyeccion))], [true, true, true]);
    const recien = sim.sinCuota.find((s) => s.proyeccion === null);
    ok("el recien llegado sale con avance 0 y sin proyeccion", texto(p.doc.querySelector(`#za-sincuota-lista > li[data-codusu='${recien.codusu}']`)).includes("cerraría en"), false);
    ok("y se puede ver su probabilidad igual", p.doc.querySelector(`#za-sincuota-lista > li[data-codusu='${s0.codusu}'] a`).getAttribute("href"), "/probabilidad.html?codusu=" + s0.codusu);
    ok("no estan entre los que tienen cuota", filas(p).some((li) => li.getAttribute("data-codusu") === s0.codusu), false);

    /* Sin ningun vendedor con cuota no es un error: se dice, y los que no la registraron siguen saliendo. */
    alterar = (camino, r) => {
        if (r.cuerpo.data && r.cuerpo.data.vendedores) {
            r.cuerpo.data.vendedores = [];
            Object.assign(r.cuerpo.data.total, { vendedores: 0, meta: 0, avance: 0, porcentaje: null, logrados: 0, hoy: 0 });
        }
        return r;
    };
    p = await montar("avance.html");
    await pausa(250);
    ok("sin vendedores con cuota: lo dice, sin error, y no pinta una barra de nadie",
       [texto($(p, "za-sin-cuotas")), texto($(p, "za-lista")), $(p, "za-total-barra"), !!$(p, "za-sincuota")],
       ["Nadie registró su cuota en octubre de 2026.", "Ningún vendedor registró su cuota este mes.", null, true]);
    alterar = null;

    /* ============================================================ otros meses */
    console.log("\n— un mes cerrado —");
    preparar();
    p = await montar("avance.html");
    await pausa(250);
    ok("el mes en curso y los dos anteriores", [...$(p, "za-mes").options].map((o) => o.textContent),
       ["octubre de 2026 (este mes)", "septiembre de 2026", "agosto de 2026"]);

    llamadas = [];
    await elegirOpcion(p, $(p, "za-mes"), "2026-09");
    const sept = delBackend({ anno: 2026, mes: 9 });
    ok("un mes anterior pide con `anno` y `mes`", rutas(), ["/zona/avance?anno=2026&mes=9"]);
    ok("dice que es un mes cerrado", texto($(p, "periodo")), "septiembre de 2026 · mes cerrado");
    ok("trae los vendedores de ese mes", filas(p).map((li) => li.getAttribute("data-codusu")), sept.vendedores.map((v) => v.codusu));

    const cerrado = fila(p, sept.vendedores.find((v) => v.logro).codusu);
    const noLlego = sept.vendedores.find((v) => !v.logro);
    ok("en un mes cerrado no hay semaforo: dice si logro la meta",
       [texto(chip(cerrado)), noLlego ? texto(chip(fila(p, noLlego.codusu))) : "No llegó"], ["Logró su meta", "No llegó"]);
    ok("ni lo de hoy, ni proyeccion ni probabilidad",
       [texto(cerrado).includes("Hoy"), $(p, "za-proyeccion-" + cerrado.getAttribute("data-codusu")), $(p, "za-probabilidad-" + cerrado.getAttribute("data-codusu"))], [false, null, null]);
    ok("sin la marca de cuanto del mes ya paso: ya paso todo", cerrado.querySelector(".cdk-ritmo__marca"), null);
    ok("ni el semaforo contado, ni el filtro por semaforo, ni «facturado hoy»",
       [$(p, "za-estados"), $(p, "za-filtro-estado"), $(p, "za-total-hoy")], [null, null, null]);
    ok("el total dice como cerraron, no cuanto ya paso", texto($(p, "za-ritmo-texto")), `Cerraron en el ${sept.total.porcentaje} % de la meta.`);
    ok("no se actualiza solo ni ofrece actualizar: un mes cerrado no cambia", [$(p, "za-actualizar"), $(p, "za-refresco"), p.activos().length], [null, null, 0]);
    ok("dice hasta que dia hubo facturas", texto($(p, "za-ventas-hasta")), "Con facturas hasta el 30/09/2026.");
    ok("los que no registraron, de ese mes", texto($(p, "za-sincuota").querySelector("summary")), `No registraron su cuota (${sept.sinCuota.length})`);
    ok("y sin lo de hoy ni la proyeccion", texto($(p, "za-sincuota-lista")).includes("cerraría en"), false);

    /* Si cambiar de mes falla, no se pierde lo que se estaba viendo. */
    await elegirOpcion(p, $(p, "za-mes"), "");
    forzar = (ruta) => (ruta.includes("mes=8")
        ? respuesta({ status: "periodo invalido", codigo: 2, msg: "solo se puede pedir el mes en curso y los dos anteriores" }, 400) : null);
    await elegirOpcion(p, $(p, "za-mes"), "2026-08");
    ok("`periodo invalido`: se dice con su mensaje, y el selector vuelve a donde estaba",
       [toasts(p.doc).some((t) => t.includes("solo se puede pedir el mes en curso")), $(p, "za-mes").value, $(p, "za-mes").disabled, filas(p).length], [true, "", false, sim.vendedores.length]);
    forzar = null;
    llamadas = [];
    clic(p, $(p, "za-actualizar"));
    await pausa(250);
    ok("tras fallar un cambio de mes, «Actualizar» sigue siendo del mes que se ve (octubre), no del que fallo", rutas(), ["/zona/avance"]);

    /* ---- un mes cerrado no tiene semaforo, ni lo de hoy, ni proyeccion: aunque el backend los mandara */
    alterar = (camino, r) => {
        const d = r.cuerpo.data;
        if (d && d.vendedores && d.actual === false) {
            d.total.hoy = 999; d.total.estados = { logrado: 1, adelantado: 1, justo: 1, atrasado: 1 };
            d.vendedores.forEach((v) => { v.estado = "atrasado"; v.proyeccion = 123; v.hoy = 45; });
            d.sinCuota.forEach((s) => { s.proyeccion = 7; s.hoy = 8; });
        }
        return r;
    };
    await elegirOpcion(p, $(p, "za-mes"), "2026-09");
    ok("en un mes cerrado manda `logro`, no un semaforo que no corresponde",
       [filas(p).every((li) => /^(Logró su meta|No llegó)$/.test(texto(chip(li)))), $(p, "za-estados"), $(p, "za-total-hoy")], [true, null, null]);
    ok("ni la proyeccion ni lo de hoy, ni en la lista ni en los que no registraron",
       [filas(p).some((li) => texto(li).includes("cerraría en") || texto(li).includes("Hoy")),
        texto($(p, "za-sincuota-lista")).includes("cerraría en") || texto($(p, "za-sincuota-lista")).includes("Hoy")], [false, false]);
    alterar = null;

    /* ============================================================ actualizar */
    console.log("\n— actualizar —");
    preparar();
    llamadas = [];
    p = await montar("avance.html");
    await pausa(250);
    ok("el mes en curso se actualiza solo: hay un refresco programado, a los 3 minutos", p.activos().map((r) => r.ms), [REFRESCO]);

    llamadas = [];
    disparar(p);
    await pausa(250);
    ok("al cumplirse pide el avance otra vez, sin tapar la pantalla con un spinner", [rutas(), !!$(p, "za-vendedores")], [["/zona/avance"], true]);
    ok("y deja programado el siguiente (el anterior se cancelo)", p.activos().length, 1);

    /* En segundo plano no se gasta una lectura: cada una recorre las facturas del mes. */
    Object.defineProperty(p.doc, "hidden", { value: true, configurable: true });
    llamadas = [];
    disparar(p);
    await pausa(120);
    ok("con la pantalla en segundo plano no pide nada, y vuelve a programar", [rutas(), p.activos().length], [[], 1]);
    Object.defineProperty(p.doc, "hidden", { value: false, configurable: true });

    llamadas = [];
    clic(p, $(p, "za-actualizar"));
    ok("el boton «Actualizar» se deshabilita mientras pide", [$(p, "za-actualizar").disabled, texto($(p, "za-actualizar"))], [true, "Actualizando…"]);
    await pausa(250);
    ok("y pide el avance una vez", rutas(), ["/zona/avance"]);

    /* Un refresco que falla no tapa lo que se veia. */
    forzar = (ruta) => (ruta.startsWith("/zona/avance") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    disparar(p);
    await pausa(250);
    ok("si el refresco falla, la pantalla buena se queda y se avisa", [filas(p).length, toasts(p.doc).some((t) => t.includes("No se pudo actualizar")), p.activos().length], [sim.vendedores.length, true, 1]);
    forzar = null;

    /* ============================================================ errores */
    console.log("\n— errores —");
    preparar();
    forzar = (ruta) => (ruta.startsWith("/zona/avance") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    p = await montar("avance.html");
    await pausa(250);
    ok("un fallo del servidor se dice, con la posibilidad de reintentar", !!p.doc.querySelector("#contenido .cdk-estado button"), true);
    forzar = null;
    clic(p, p.doc.querySelector("#contenido .cdk-estado button"));
    await pausa(250);
    ok("reintentar pinta el avance", filas(p).length, sim.vendedores.length);

    alterar = (camino, r) => { if (r.cuerpo.data) delete r.cuerpo.data.vendedores; return r; };
    p = await montar("avance.html");
    await pausa(250);
    ok("una respuesta sin `vendedores` no se pinta: se dice con su motivo, y con reintento",
       [!!p.doc.querySelector("#contenido .cdk-estado button"), filas(p).length, texto($(p, "contenido")).includes("La respuesta no trae los vendedores.")], [true, 0, true]);
    alterar = null;

    preparar("ESPECIALISTA");
    p = await montar("avance.html");
    await pausa(250);
    ok("quien es de otro grupo no lo ve: el motivo del backend", texto($(p, "contenido")).includes("esta ruta es del grupo 34"), true);

    /* `403 usuario sin acceso` en cualquier ruta: no hay sesion que conservar, se vuelve al login. */
    preparar();
    forzar = (ruta) => (ruta.startsWith("/zona/avance")
        ? respuesta({ status: "usuario sin acceso", codigo: 3, msg: "este usuario todavia no tiene acceso a la intranet" }, 403) : null);
    p = await montar("avance.html");
    await pausa(250);
    ok("`usuario sin acceso`: lleva al login", p.destinos, ["/index.html"]);
    forzar = null;

    /* ============================================================ el menu */
    console.log("\n— el menu del jefe de zona —");
    preparar();
    p = await montar("avance.html");
    await pausa(250);
    const activo = p.doc.querySelector(".cdk-sidebar__enlace.es-activo");
    ok("Avance sale en el menu, marcado, y lleva a su pagina", [texto(activo), activo && activo.getAttribute("href")], ["Avance", "/avance.html"]);
    ok("son tres modulos y en este orden", [...p.doc.querySelectorAll("#cdk-sidebar-lista .cdk-sidebar__enlace")].map((a) => texto(a)), ["Cotización", "Avance", "Probabilidad"]);
    ok("con su icono", (activo.querySelector("svg path").getAttribute("d") || "").startsWith("M3.75 3v11.25"), true);

    /* ============================================================ la probabilidad: elegir */
    console.log("\n— la probabilidad: elegir al vendedor —");
    preparar();
    llamadas = [];
    p = await montar("probabilidad.html");
    await pausa(250);
    const listaDeVendedores = () => [...p.doc.querySelectorAll("#zp-vendedores > li")].map((li) => li.getAttribute("data-codusu"));

    ok("sin vendedor elegido, pide la lista del avance", rutas(), ["/zona/avance"]);
    ok("salen los que tienen cuota y, despues, los que no: la probabilidad se puede pedir de cualquiera",
       listaDeVendedores(), sim.vendedores.map((v) => v.codusu).concat(sim.sinCuota.map((s) => s.codusu)));
    ok("a los que no la registraron se les dice",
       texto(p.doc.querySelector(`#zp-vendedores > li[data-codusu='${sim.sinCuota[0].codusu}']`)).includes("sin cuota este mes"), true);
    escribir(p, $(p, "zp-buscar"), "utani");
    ok("se busca por nombre", listaDeVendedores(), ["293"]);
    escribir(p, $(p, "zp-buscar"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "zp-lista")), "Ningún vendedor coincide.");
    escribir(p, $(p, "zp-buscar"), "huamani");
    clic(p, p.doc.querySelector("#zp-vendedores > li button"));
    ok("tocar a uno lleva a su probabilidad", p.destinos, ["/probabilidad.html?codusu=196"]);

    /* ============================================================ la probabilidad: un vendedor */
    console.log("\n— la probabilidad de un vendedor —");
    preparar();
    llamadas = [];
    p = await montar("probabilidad.html", "?codusu=196");
    await pausa(250);
    const pr = zonaSim.probabilidad({ codusu: "196" }).cuerpo.data;
    const mesesEnPantalla = () => [...p.doc.querySelectorAll("#zp-meses > li")].map((li) => li.getAttribute("data-mes"));

    ok("pide la probabilidad de ese vendedor, una vez", rutas(), ["/zona/probabilidad?codusu=196"]);
    ok("dice quien es y a que hora se calculo", [texto($(p, "zp-nombre")), texto($(p, "zp-detalle")), texto($(p, "periodo"))],
       ["HUAMANI ANTHONY", "Cobertura · V0278", "HUAMANI ANTHONY · actualizado a las 18:47"]);
    ok("dice que dia es, que cada mes se corta en el mismo, y que es en dolares con IGV",
       texto($(p, "zp-hoy")), "Hoy es 22/10/2026. Cada mes se mira cortado en el mismo día. Todo en dólares y con IGV.");
    ok("siempre cuatro meses: el actual y los tres anteriores, del mas reciente al mas antiguo", mesesEnPantalla(), ["2026-10", "2026-09", "2026-08", "2026-07"]);

    const oct = pr.meses[0];
    ok("este mes: la probabilidad, grande", texto($(p, "zp-prob-2026-10")), "0.0 % de llegar");
    ok("lo que lleva (en presente), y lo que le falta", texto($(p, "zp-corte-2026-10")), `Lleva ${usd(oct.avance)} de ${usd(oct.meta)} · ${oct.porcentaje} % · le faltan ${usd(oct.falta)}`);
    ok("cuantos dias de venta quedan, sin domingos", texto(p.doc.querySelector("#zp-meses > li[data-mes='2026-10']")).includes("Quedan7 días hábiles y 2 sábados"), true);
    ok("lo que tiene que facturar por dia, frente a lo que suele",
       [texto(p.doc.querySelector("#zp-meses > li[data-mes='2026-10']")).includes("Tiene que facturar por día" + usd(oct.ritmo.necesario)),
        texto(p.doc.querySelector("#zp-meses > li[data-mes='2026-10']")).includes("Suele facturar por día" + usd(oct.ritmo.habitual))], [true, true]);
    ok("los escenarios, rotulados «a su ritmo habitual»",
       [texto($(p, "zp-escenarios-2026-10")).startsWith("A su ritmo habitual, el mes cerraría"), texto($(p, "zp-escenarios-2026-10")).includes("Lo más probable" + usd(oct.escenarios.probable)),
        texto($(p, "zp-escenarios-2026-10")).includes("Entre" + usd(oct.escenarios.pesimista) + " y " + usd(oct.escenarios.optimista))], [true, true, true]);
    ok("el mes en curso no tiene cierre", $(p, "zp-cierre-2026-10"), null);

    const sep = pr.meses[1];
    ok("septiembre, a esta altura: la probabilidad que tenia", texto($(p, "zp-prob-2026-09")), `${sep.probabilidad} % de llegar`);
    ok("lo que llevaba (en pasado) y lo que le faltaba", texto($(p, "zp-corte-2026-09")), `Llevaba ${usd(sep.avance)} de ${usd(sep.meta)} · ${sep.porcentaje.toFixed(1)} % · le faltaban ${usd(sep.falta)}`);
    ok("el corte, dicho: «visto el 22/09/2026»", texto(p.doc.querySelector("#zp-meses > li[data-mes='2026-09']")).includes("visto el 22/09/2026"), true);
    ok("y como termino de verdad", texto($(p, "zp-cierre-2026-09")), `Terminó en ${sep.cierre.porcentaje} % de su meta (${usd(sep.cierre.avance)}) · la logró.`);
    ok("un mes pasado se dice en pasado: «quedaban»", texto(p.doc.querySelector("#zp-meses > li[data-mes='2026-09']")).includes("Quedaban7 días hábiles y 1 sábado"), true);

    ok("el mes que no llego lo dice", texto($(p, "zp-cierre-2026-08")), `Terminó en ${pr.meses[2].cierre.porcentaje} % de su meta (${usd(pr.meses[2].cierre.avance)}) · ${pr.meses[2].cierre.logro ? "la logró." : "no la logró."}`);

    /* ---- «como se calcula» */
    const como = $(p, "zp-como");
    ok("«Cómo se calcula» va plegado, con los cinco pasos", [como.open, como.querySelectorAll("ol > li").length], [false, 5]);
    ok("y avisa de que los escenarios no llevan la correccion", texto(como).includes("sin contar con que apriete"), true);

    /* ---- nada se calcula aqui */
    alterar = (camino, r) => {
        if (r.cuerpo.data && r.cuerpo.data.meses) {
            r.cuerpo.data.meses[1].probabilidad = 12.3;
            r.cuerpo.data.meses[0].escenarios = { pesimista: 1, probable: 2, optimista: 3 };
        }
        return r;
    };
    p = await montar("probabilidad.html", "?codusu=196");
    await pausa(250);
    ok("la probabilidad y los escenarios son los que llegan, aunque no cuadren con lo demas",
       [texto($(p, "zp-prob-2026-09")), texto($(p, "zp-escenarios-2026-10")).includes("Lo más probable$ 2.00")], ["12.3 % de llegar", true]);
    alterar = null;

    /* ---- cada motivo, sin inventar un numero */
    console.log("\n— sin cuota, meta alcanzada y vendedor nuevo —");
    preparar();
    p = await montar("probabilidad.html", "?codusu=399");
    await pausa(250);
    ok("un mes sin cuota lo dice, sin probabilidad", texto($(p, "zp-prob-2026-10")), "Sin cuota registrada ese mes");
    ok("pero con lo que facturo, que se puede mostrar", texto($(p, "zp-corte-2026-10")).startsWith("Lleva facturados $ 115,071.62 (sin cuota que medir)"), true);
    ok("y sin barra de una meta que no hay", p.doc.querySelector("#zp-meses > li[data-mes='2026-10'] .cdk-progreso"), null);
    ok("un mes pasado sin cuota dice lo que facturo en total", texto($(p, "zp-cierre-2026-09")).startsWith("Terminó el mes con $ 262,500.00 facturados"), true);
    ok("«meta alcanzada»: ya iba en 100 % al corte, no una probabilidad", texto($(p, "zp-prob-2026-07")), "Ya había llegado a su meta");
    ok("pero se le dice como termino", texto($(p, "zp-cierre-2026-07")).includes("la logró"), true);

    p = await montar("probabilidad.html", "?codusu=420");
    await pausa(250);
    ok("un vendedor nuevo no tiene probabilidad, y lo dice",
       texto($(p, "zp-prob-2026-10")), "Vendedor nuevo: todavía no hay historia para calcularla");
    ok("ni escenarios ni lo que suele facturar: no hay historia para inventarlos",
       [$(p, "zp-escenarios-2026-10"), texto(p.doc.querySelector("#zp-meses > li[data-mes='2026-10']")).includes("Suele facturar")], [null, false]);

    /* ---- errores */
    console.log("\n— errores de la probabilidad —");
    preparar();
    p = await montar("probabilidad.html", "?codusu=229");
    await pausa(250);
    ok("alguien que no es del grupo 20: lo dice, sin reintentar, y ofrece elegir otro",
       [texto($(p, "zp-desconocido")).includes("ese usuario no es un vendedor del grupo 20"), $(p, "zp-elegir-otro").getAttribute("href"), !!p.doc.querySelector("#contenido .cdk-estado button")],
       [true, "/probabilidad.html", false]);

    forzar = (ruta) => (ruta.startsWith("/zona/probabilidad") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    p = await montar("probabilidad.html", "?codusu=196");
    await pausa(250);
    ok("un fallo del servidor se dice, con reintento", !!p.doc.querySelector("#contenido .cdk-estado button"), true);
    forzar = null;
    clic(p, p.doc.querySelector("#contenido .cdk-estado button"));
    await pausa(250);
    ok("reintentar pinta los cuatro meses", mesesEnPantalla(), ["2026-10", "2026-09", "2026-08", "2026-07"]);

    llamadas = [];
    clic(p, $(p, "zp-actualizar"));
    await pausa(250);
    ok("«Actualizar» pide la probabilidad otra vez, y la pantalla sigue", [rutas(), mesesEnPantalla().length], [["/zona/probabilidad?codusu=196"], 4]);

    preparar("ESPECIALISTA");
    p = await montar("probabilidad.html", "?codusu=196");
    await pausa(250);
    ok("quien es de otro grupo no la ve: el motivo del backend", texto($(p, "contenido")).includes("esta ruta es del grupo 34"), true);

    preparar();
    p = await montar("probabilidad.html", "?codusu=196");
    await pausa(250);
    const act = p.doc.querySelector(".cdk-sidebar__enlace.es-activo");
    ok("Probabilidad sale en el menu, marcada", [texto(act), act && act.getAttribute("href")], ["Probabilidad", "/probabilidad.html"]);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
