/**
 * Prueba de integracion del vendedor del mes (grupo 25), sobre la pagina real.
 *
 * Lo que mas importa:
 *
 *   · que NADA se calcule en pantalla: el total de cada marca, el puesto, la participacion y la
 *     tendencia son los del backend. Y que se diga que el total NO es el avance de la cuota
 *   · que una marca con menos de 3 vendedores, o con ninguno, se vea como tal y no se omita
 *   · que cada tendencia se lea por su texto (sube, baja, igual, nuevo), no solo por su color
 *   · que un vendedor sin `tipo` se diga, no se invente
 *   · que se pueda mirar el mes en curso y el anterior, y nada mas
 *   · que "sin marcas" no sea un error, y que un fallo se pueda reintentar
 *   · que la jefatura pueda filtrar por especialista, y el especialista no
 *
 * El simulacro es dev/simulador-vendedormes.js, el mismo de dev/servidor.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const vendedorSim = require("../simulador-vendedormes");

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
    const metodo = (opciones && opciones.method) || "GET";
    llamadas.push({ url, metodo });

    const ruta = url.replace(/^https?:\/\/[^/]+\/v1/, "");

    const forzada = forzar && forzar(ruta);
    if (forzada) return forzada;

    const [camino, consulta] = ruta.split("?");
    const params = new URLSearchParams(consulta || "");

    if (camino === "/vendedor") {
        return respuesta({
            status: "ok", codigo: 0, data: { vendedormes: "Los 3 vendedores que mas venden cada una de tus marcas en el mes", cuota: "Cuota" },
            nombre: "JUAN CARLOS", grupo: "VENTAS-JEFES DE PROD", tipo: S.rol, tipoCambio: 3.75
        });
    }

    let r = null;
    if (camino === "/vendedormes/top") r = vendedorSim.top({ anno: params.get("anno"), mes: params.get("mes") });

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
    if (alterar) r = alterar(camino, r) || r;

    return respuesta(r.cuerpo, r.status);
}

/* =====================================================================
 * Montar la pagina real
 * =================================================================== */
function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar(pagina) {
    let html = leer(pagina);
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, { url: "http://127.0.0.1:8080/" + pagina, runScripts: "outside-only", pretendToBeVisual: true });
    const w = dom.window;
    const destinos = [];

    /* Siempre el mismo dia: la prueba no puede depender del dia que se corra. */
    const Real = w.Date;
    w.Date = class extends Real {
        constructor(...a) { if (a.length) super(...a); else super(2026, 9, 22, 10); }
        static now() { return new Real(2026, 9, 22, 10).getTime(); }
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
const elegirOpcion = async (p, select, valor) => {
    select.value = valor;
    select.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    await pausa(250);
};
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);
const sinNbsp = (t) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);

const $ = (p, id) => p.doc.getElementById(id);
const rutas = () => llamadas.filter((l) => l.url.includes("/vendedormes/")).map((l) => l.url.replace(/^.*\/v1/, ""));

const tarjeta = (p, codmar) => p.doc.getElementById("vm-marca-" + codmar);
const tarjetas = (p) => [...p.doc.querySelectorAll("#vm-lista > section")];
const nombresDeMarcas = (p) => tarjetas(p).map((s) => texto(s.querySelector(".cdk-seccion__titulo")));
const filasDe = (p, codmar) => [...p.doc.querySelectorAll(`#vm-top-${codmar} > li`)];
const nombreDeFila = (li) => texto(li.querySelector(".cdk-articulo__nombre"));

/** Lo que dice el backend ahora mismo, sin pasar por la pantalla: con lo que se compara. */
const delBackend = (periodo) => vendedorSim.top(periodo || {}).cuerpo.data;
const marcaDelBackend = (codmar, periodo) => delBackend(periodo).marcas.find((m) => m.codmar === codmar);

/** Un especialista con seis marcas (TDK que nadie vendio, ADATA con solo dos vendedores), o una jefatura. */
function preparar(rol, opciones) {
    opciones = opciones || {};
    marcasSim.reiniciar(rol);
    forzar = null; alterar = null;

    if (rol === "ESPECIALISTA") {
        (opciones.marcas || ["0002", "0206", "0008", "0124", "0032", "0003"]).forEach((c) => { marcasSim.buscarMarca(c).dueno = "233"; });
        S.confirmados["233"] = true;
    }
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Vendedor del mes · grupo 25 ===\n");

    /* ============================================================ las marcas y su top */
    console.log("— las marcas del mes y su top —");
    preparar("ESPECIALISTA");
    llamadas = [];
    let p = await montar("vendedormes.html");
    await pausa(250);
    const sim = delBackend();

    ok("carga sin errores", fallos, 0);
    ok("pide el top del mes en curso, una vez, sin periodo", rutas(), ["/vendedormes/top"]);
    ok("dice el mes y quien es", texto($(p, "periodo")), "octubre de 2026 · Especialista");
    ok("una tarjeta por marca, en el orden del backend", nombresDeMarcas(p), sim.marcas.map((m) => m.nombre));
    ok("seis marcas, incluso la que nadie vendio", tarjetas(p).length, 6);

    const epson = marcaDelBackend("0008");
    ok("la marca dice cuanto vendio el grupo 20 y cuantos vendedores fueron (los del backend)",
       texto($(p, "vm-total-0008")), `El grupo 20 vendió $ ${epson.total.venta.toLocaleString("en-US", { minimumFractionDigits: 2 })} · ${epson.total.vendedores} vendedores`);
    ok("y el codigo y la familia", texto(tarjeta(p, "0008").querySelector(".cdk-seccion__sub")).startsWith("0008 · "), true);

    /* ---- el top: tres, del que mas vendio al que menos */
    ok("el top son tres, en el orden del backend", filasDe(p, "0008").map((li) => nombreDeFila(li)),
       epson.top.map((v) => String(v.puesto) + v.nombre));
    ok("cada fila lleva su puesto", filasDe(p, "0008").map((li) => li.getAttribute("data-puesto")), ["1", "2", "3"]);
    ok("y su vendedor", filasDe(p, "0008").map((li) => li.getAttribute("data-codven")), epson.top.map((v) => v.codven));
    ok("el primero va resaltado, y el puesto se lee como numero y no solo como color",
       [!!filasDe(p, "0008")[0].querySelector(".cdk-puesto--1"), filasDe(p, "0008")[1].querySelector(".cdk-puesto").getAttribute("aria-label")],
       [true, "Puesto 2"]);

    const v1 = epson.top[0];
    const fila1 = filasDe(p, "0008")[0];
    ok("cada vendedor: lo que vendio, su % del total, unidades y clientes",
       [texto(fila1).includes("$ " + v1.venta.toLocaleString("en-US", { minimumFractionDigits: 2 })),
        texto(fila1).includes(v1.participacion.toFixed(2) + " % del total"),
        texto(fila1).includes("Unidades " + v1.unidades.toLocaleString("en-US")),
        texto(fila1).includes("Clientes " + v1.clientes)], [true, true, true, true]);
    ok("y de que tipo es", ["Cobertura", "Cartera"].some((t) => texto(fila1).includes(t + " · ")), true);

    /* Un vendedor que aun no se registro en la intranet: `tipo` es null, y se dice. */
    const sinTipo = delBackend().marcas.flatMap((m) => m.top.map((v) => ({ m, v }))).find((x) => x.v.tipo === null);
    ok("el simulacro trae un vendedor sin registrar", !!sinTipo, true);
    const filaSinTipo = p.doc.querySelector(`#vm-top-${sinTipo.m.codmar} > li[data-codven='${sinTipo.v.codven}']`);
    ok("un vendedor sin `tipo` se dice «Sin registrar en la intranet», no se inventa", texto(filaSinTipo).includes("Sin registrar en la intranet · "), true);

    /* ---- menos de tres, y ninguno */
    const adata = marcaDelBackend("0032");
    ok("una marca que solo vendieron dos vendedores trae dos filas, no tres", [adata.top.length, filasDe(p, "0032").length], [2, 2]);
    ok("y dice cuantos vendedores fueron", texto($(p, "vm-total-0032")).endsWith("· 2 vendedores"), true);

    ok("una marca que nadie vendio se dice, no se omite", texto($(p, "vm-vacio-0002")), "Nadie del grupo 20 la vendió este mes.");
    ok("con su total en cero y sin lista", [texto($(p, "vm-total-0002")), $(p, "vm-top-0002")], ["El grupo 20 vendió $ 0.00 · 0 vendedores", null]);

    /* ---- el total NO es el avance de la cuota */
    ok("la pantalla dice que el total no es el avance de la cuota, y por que puede quedar por debajo o por encima",
       [texto($(p, "vm-nota-total")).startsWith("El total de cada marca es solo lo que vendieron los vendedores del grupo 20 con venta mayor que 0: no es el avance de la cuota"),
        texto($(p, "vm-nota-total")).includes("con todas sus devoluciones, así que puede quedar por debajo o por encima")], [true, true]);

    /* ---- hasta que dia hay ventas: a principios de mes el top es de pocos dias */
    ok("dice hasta que dia hay ventas, y que el top es de esos dias",
       texto($(p, "vm-ventas-hasta")), "Con ventas hasta el 19/10/2026. El top es de esos días.");
    ok("y que la tendencia compara con el mes pasado", texto($(p, "vm-nota-total")).endsWith("La tendencia compara con el mes pasado."), true);

    /* ---- nada se calcula aqui: si no cuadra con lo que sumarian las filas, sale lo del backend */
    alterar = (camino, r) => {
        if (r.cuerpo.data) {
            const m = r.cuerpo.data.marcas.find((x) => x.codmar === "0008");
            m.total = { venta: 12.5, vendedores: 99 };
            m.top[0].participacion = 7.77;
            m.top[0].puesto = 1;
        }
        return r;
    };
    p = await montar("vendedormes.html");
    await pausa(250);
    ok("el total y el numero de vendedores son los que llegan, aunque no cuadren con las filas",
       texto($(p, "vm-total-0008")), "El grupo 20 vendió $ 12.50 · 99 vendedores");
    ok("y la participacion tambien", texto(filasDe(p, "0008")[0]).includes("7.77 % del total"), true);
    alterar = null;

    /* ---- `ventasHasta` en null es un mes sin ventas; ausente es un backend que aun no lo manda */
    alterar = (camino, r) => { if (r.cuerpo.data) r.cuerpo.data.ventasHasta = null; return r; };
    p = await montar("vendedormes.html");
    await pausa(250);
    ok("un mes sin ventas registradas se dice", texto($(p, "vm-ventas-hasta")), "Este mes todavía no tiene ventas registradas.");
    alterar = (camino, r) => { if (r.cuerpo.data) delete r.cuerpo.data.ventasHasta; return r; };
    p = await montar("vendedormes.html");
    await pausa(250);
    ok("y si el backend no lo manda no se inventa nada, y lo demas sigue igual", [$(p, "vm-ventas-hasta"), tarjetas(p).length], [null, 6]);
    alterar = null;

    /* ---- lo que dice el contrato del simulacro: desempate, solo venta mayor que 0 y total del mismo grupo */
    console.log("\n— el contrato del simulacro: desempate y venta mayor que 0 —");
    const f = (codven, venta, unidades, clientes) => ({ vendedor: { codven }, venta, unidades, clientes });
    ok("con la misma venta, primero el de mas unidades",
       [f("V1", 100, 10, 5), f("V2", 100, 20, 1)].sort(vendedorSim.comparar).map((x) => x.vendedor.codven), ["V2", "V1"]);
    ok("con las mismas unidades, el de mas clientes",
       [f("V1", 100, 10, 5), f("V2", 100, 10, 9)].sort(vendedorSim.comparar).map((x) => x.vendedor.codven), ["V2", "V1"]);
    ok("y si todo empata, el de menor codigo de vendedor, estable entre lecturas",
       [f("V9", 100, 10, 5), f("V3", 100, 10, 5), f("V5", 100, 10, 5)].sort(vendedorSim.comparar).map((x) => x.vendedor.codven), ["V3", "V5", "V9"]);
    ok("la venta se compara al centimo: 100.004 y 100.001 empatan", vendedorSim.comparar(f("V1", 100.004, 1, 1), f("V2", 100.001, 1, 1)), -1);
    ok("pero una venta mayor siempre va primero, aunque tenga menos unidades",
       [f("V1", 100, 99, 99), f("V2", 100.01, 1, 1)].sort(vendedorSim.comparar).map((x) => x.vendedor.codven), ["V2", "V1"]);

    const todas = [0, 1].flatMap((atras) => delBackend(atras === 0 ? {} : { anno: 2026, mes: 9 }).marcas);
    ok("ninguna venta ni participacion llega en cero o negativa",
       todas.every((m) => m.top.every((v) => v.venta > 0 && v.participacion > 0)), true);
    ok("quien devolvio mas de lo que vendio no entra en el top ni en el total de vendedores",
       [vendedorSim.vendedoresDe("0008").some((x) => x.vendedor.codven === "V0241"),
        marcaDelBackend("0008").top.some((v) => v.codven === "V0241"),
        marcaDelBackend("0008").total.vendedores === vendedorSim.vendedoresDe("0008").length], [false, false, true]);
    ok("el total de venta es la suma del mismo grupo que se cuenta, no de otro",
       Math.abs(marcaDelBackend("0008").total.venta - vendedorSim.vendedoresDe("0008").reduce((s, x) => s + x.venta, 0)) < 0.011, true);

    /* ============================================================ la tendencia */
    console.log("\n— la tendencia: sube, baja, igual, nuevo —");
    alterar = (camino, r) => {
        if (r.cuerpo.data) {
            const m = r.cuerpo.data.marcas.find((x) => x.codmar === "0008");
            m.top[0].tendencia = "sube";  m.top[0].anterior = { puesto: 5, venta: 13509.41 };
            m.top[1].tendencia = "baja";  m.top[1].anterior = { puesto: 1, venta: 38775.05 };
            m.top[2].tendencia = "igual"; m.top[2].anterior = { puesto: 3, venta: 9000 };
            const a = r.cuerpo.data.marcas.find((x) => x.codmar === "0124");
            a.top[0].tendencia = "nuevo"; a.top[0].anterior = { puesto: null, venta: null };
        }
        return r;
    };
    p = await montar("vendedormes.html");
    await pausa(250);

    const tend = (li) => texto([...li.querySelectorAll(".cdk-dato")].find((d) => texto(d).startsWith("Tendencia")));
    ok("sube: dice de donde viene (el puesto de antes puede ser mayor que 3) y lo que vendio entonces",
       tend(filasDe(p, "0008")[0]), "Tendencia ▲ Sube (antes puesto 5 · $ 13,509.41)");
    ok("baja", tend(filasDe(p, "0008")[1]), "Tendencia ▼ Baja (antes puesto 1 · $ 38,775.05)");
    ok("igual", tend(filasDe(p, "0008")[2]), "Tendencia = Igual (antes puesto 3 · $ 9,000.00)");
    ok("nuevo: no la vendio el mes anterior, y no inventa un puesto", tend(filasDe(p, "0124")[0]), "Tendencia Nuevo: no la vendió el mes anterior");

    const clasesDe = (li) => [...li.querySelectorAll(".cdk-dato")].find((d) => texto(d).startsWith("Tendencia")).className;
    ok("el color acompaña al texto: sube en verde, baja en alerta, igual atenuado, nuevo sin color",
       [clasesDe(filasDe(p, "0008")[0]).includes("cdk-dato--bien"), clasesDe(filasDe(p, "0008")[1]).includes("cdk-dato--alerta"),
        clasesDe(filasDe(p, "0008")[2]).includes("cdk-dato--nulo"), /cdk-dato--/.test(clasesDe(filasDe(p, "0124")[0]))],
       [true, true, true, false]);
    alterar = null;

    /* ---- buscar y filtrar */
    console.log("\n— buscar y filtrar —");
    preparar("ESPECIALISTA");
    p = await montar("vendedormes.html");
    await pausa(250);
    escribir(p, $(p, "vm-buscar-marca"), "epson");
    ok("buscar una marca por nombre", nombresDeMarcas(p), ["EPSON"]);
    escribir(p, $(p, "vm-buscar-marca"), "0124");
    ok("o por su codigo", nombresDeMarcas(p), ["ACER"]);
    escribir(p, $(p, "vm-buscar-marca"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "vm-lista")), "Ninguna marca coincide.");
    escribir(p, $(p, "vm-buscar-marca"), "");
    ok("un especialista no filtra por dueño: todas le salen suyas", $(p, "vm-filtro"), null);

    /* ============================================================ otros meses */
    console.log("\n— el mes anterior, y nada mas —");
    ok("solo el mes en curso y el anterior: dos opciones, no tres",
       [...$(p, "vm-mes").options].map((o) => o.textContent), ["octubre de 2026 (este mes)", "septiembre de 2026"]);

    llamadas = [];
    await elegirOpcion(p, $(p, "vm-mes"), "2026-09");
    ok("el mes anterior pide con `anno` y `mes`", rutas(), ["/vendedormes/top?anno=2026&mes=9"]);
    ok("dice que es un mes cerrado", texto($(p, "periodo")), "septiembre de 2026 · Especialista · mes cerrado");
    ok("con las marcas de entonces: sin EP_IMPRESORAS, que es nueva, y con HIKVISION, que ya no",
       nombresDeMarcas(p), ["ACER", "ADATA", "EPSON", "HIKVISION", "MEMOREX", "TDK"]);
    ok("el selector queda en el mes elegido", $(p, "vm-mes").value, "2026-09");
    ok("y la tendencia dice con que mes compara", texto($(p, "vm-nota-total")).endsWith("La tendencia compara con el mes anterior a este."), true);
    ok("un mes cerrado dice hasta que dia hubo ventas, sin decir que el top es de pocos dias", texto($(p, "vm-ventas-hasta")), "Con ventas hasta el 30/09/2026.");
    ok("los numeros son los de ese mes, del backend",
       texto($(p, "vm-total-0008")).includes(String(marcaDelBackend("0008", { anno: 2026, mes: 9 }).total.vendedores) + " vendedores"), true);

    await elegirOpcion(p, $(p, "vm-mes"), "");
    ok("«este mes» vuelve a lo de ahora", [nombresDeMarcas(p).length, texto($(p, "periodo"))], [6, "octubre de 2026 · Especialista"]);

    /* `mes no disponible`: lo dice el backend si se pide otro mes; no deberia pasar con este selector. */
    forzar = (ruta) => (ruta.includes("mes=9")
        ? respuesta({ status: "mes no disponible", codigo: 2, msg: "solo se puede pedir el mes en curso y el anterior" }, 400) : null);
    await elegirOpcion(p, $(p, "vm-mes"), "2026-09");
    ok("`mes no disponible`: se dice con su mensaje, y la pantalla buena se queda donde estaba",
       [toasts(p.doc).some((t) => t.includes("solo se puede pedir el mes en curso y el anterior")), $(p, "vm-mes").value, $(p, "vm-mes").disabled, nombresDeMarcas(p).length],
       [true, "", false, 6]);
    forzar = null;

    /* El simulacro es fiel al documento: otro mes que no sea el en curso o el anterior es `400 mes no disponible`
       (hace dos meses, uno futuro, o un `anno` sin `mes`). */
    ok("el simulacro dice `mes no disponible` para lo que no es el en curso ni el anterior",
       [{ anno: 2026, mes: 8 }, { anno: 2026, mes: 11 }, { anno: 2026 }, { mes: 9 }, { anno: 2026, mes: 13 }]
           .map((q) => [vendedorSim.top(q).status, vendedorSim.top(q).cuerpo.status]),
       [[400, "mes no disponible"], [400, "mes no disponible"], [400, "mes no disponible"], [400, "mes no disponible"], [400, "mes no disponible"]]);
    ok("y el en curso y el anterior si", [vendedorSim.top({}).status, vendedorSim.top({ anno: 2026, mes: 9 }).status], [200, 200]);

    forzar = (ruta) => (ruta.includes("mes=9")
        ? respuesta({ status: "sin marcas en ese mes", codigo: 0, msg: "no tenias marcas asignadas en ese mes" }) : null);
    await elegirOpcion(p, $(p, "vm-mes"), "2026-09");
    ok("el mes anterior sin marcas (en bdnava08 las asignaciones empiezan en octubre): no es un error, y se dice",
       texto($(p, "vm-sin-marcas-mes")), "No tenías marcas en septiembre de 2026Ese mes no tenías marcas asignadas, así que no hay vendedores que ver.");
    ok("con el selector, para volver, y sin ofrecer elegir marcas", [$(p, "vm-mes").value, $(p, "vm-sin-marcas")], ["2026-09", null]);
    forzar = null;
    await elegirOpcion(p, $(p, "vm-mes"), "");
    ok("y se vuelve a este mes", nombresDeMarcas(p).length, 6);

    /* ============================================================ la jefatura */
    console.log("\n— una jefatura —");
    preparar("JEFATURA");
    p = await montar("vendedormes.html");
    await pausa(250);
    const jef = delBackend();
    const mia = jef.marcas.find((m) => m.dueno.soyYo);
    const ajena = jef.marcas.find((m) => !m.dueno.soyYo);

    ok("dice que es jefatura", texto($(p, "periodo")), "octubre de 2026 · Jefatura");
    ok("filtra por especialista: todas, las mias y cada uno de los demas",
       [...$(p, "vm-filtro").options].map((o) => o.value), ["todas", "mias", "u:" + ajena.dueno.codusu]);
    ok("a la jefatura le dice de quien es cada marca ajena, y no de las suyas",
       [texto(tarjeta(p, ajena.codmar).querySelector(".cdk-seccion__sub")).includes(ajena.dueno.nombre),
        texto(tarjeta(p, mia.codmar).querySelector(".cdk-seccion__sub")).includes(mia.dueno.nombre)], [true, false]);

    await elegirOpcion(p, $(p, "vm-filtro"), "mias");
    ok("filtrar por «mias»", nombresDeMarcas(p), [mia.nombre]);
    await elegirOpcion(p, $(p, "vm-filtro"), "u:" + ajena.dueno.codusu);
    ok("o por un especialista", nombresDeMarcas(p), [ajena.nombre]);

    /* Si el especialista elegido ya no tiene marcas en el otro mes, el filtro no se queda apuntando a nada. */
    alterar = (camino, r) => {
        if (r.cuerpo.data) r.cuerpo.data.marcas = r.cuerpo.data.marcas.filter((m) => m.dueno.codusu !== ajena.dueno.codusu);
        return r;
    };
    await elegirOpcion(p, $(p, "vm-mes"), "2026-09");
    ok("el filtro vuelve a «todas» y la lista no sale vacia sin explicacion",
       [$(p, "vm-filtro").value, nombresDeMarcas(p).length > 0, nombresDeMarcas(p).includes(ajena.nombre)], ["todas", true, false]);
    alterar = null;

    /* ============================================================ sin marcas, sin registro y los fallos */
    console.log("\n— sin marcas, sin registro y fallos —");
    preparar("ESPECIALISTA", { marcas: [] });
    p = await montar("vendedormes.html");
    await pausa(250);
    ok("sin marcas este mes no es un error: se dice y se ofrece el camino",
       [texto($(p, "vm-sin-marcas")).startsWith("Todavía no tienes marcas este mes"), $(p, "vm-sin-marcas").querySelector("a").getAttribute("href")],
       [true, "/marcas.html"]);
    ok("con lo que dice el backend", texto($(p, "vm-sin-marcas")).includes("no tienes marcas este mes; elige y confirma las tuyas"), true);
    ok("y se puede mirar el mes anterior", [...$(p, "vm-mes").options].length, 2);
    ok("el titulo lo dice", texto($(p, "periodo")), "Sin marcas este mes");

    await elegirOpcion(p, $(p, "vm-mes"), "2026-09");
    ok("el mes pasado si tenia (una marca que ya no se trabaja): sale esa", nombresDeMarcas(p), ["HIKVISION"]);

    S.yaRegistrado = false;
    p = await montar("vendedormes.html");
    await pausa(250);
    ok("sin registrarse, el camino al formulario",
       [texto($(p, "vm-sin-alta")).startsWith("Todavía no estás registrado"), p.doc.querySelector("#vm-sin-alta a").getAttribute("href")],
       [true, "/autenticador.html"]);

    preparar("COBERTURA");
    p = await montar("vendedormes.html");
    await pausa(250);
    ok("quien es del grupo 20 no ve el vendedor del mes: el motivo del backend",
       [!!p.doc.querySelector("#contenido .cdk-estado"), texto($(p, "contenido")).includes("esta ruta es del grupo 25")], [true, true]);

    /* ---- un fallo del servidor, con reintento */
    preparar("ESPECIALISTA");
    forzar = (ruta) => (ruta.startsWith("/vendedormes/top") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    p = await montar("vendedormes.html");
    await pausa(250);
    ok("un fallo del servidor se dice, con la posibilidad de reintentar", !!p.doc.querySelector("#contenido .cdk-estado button"), true);
    forzar = null;
    clic(p, p.doc.querySelector("#contenido .cdk-estado button"));
    await pausa(250);
    ok("reintentar pinta la lista", tarjetas(p).length, 6);

    /* Algo que no es lo que dice el contrato no se pinta a ojo. */
    alterar = (camino, r) => { if (r.cuerpo.data) delete r.cuerpo.data.marcas; return r; };
    p = await montar("vendedormes.html");
    await pausa(250);
    ok("una respuesta sin `marcas` no se pinta: se dice, con reintento",
       [!!p.doc.querySelector("#contenido .cdk-estado button"), tarjetas(p).length], [true, 0]);
    alterar = null;

    /* ============================================================ el menu */
    console.log("\n— el menu —");
    preparar("ESPECIALISTA");
    p = await montar("vendedormes.html");
    await pausa(250);
    const activo = p.doc.querySelector(".cdk-sidebar__enlace.es-activo");
    ok("Vendedor del mes sale en el menu, marcado, y lleva a su pagina",
       [texto(activo), activo && activo.getAttribute("href")], ["Vendedor del mes", "/vendedormes.html"]);
    ok("con su icono", (activo.querySelector("svg path").getAttribute("d") || "").startsWith("M16.5 18.75h-9m9"), true);
    ok("en la barra de abajo del movil lleva su etiqueta corta, que no se corta, y el menu lateral el nombre completo",
       [texto(p.doc.querySelector(".cdk-bottomnav__enlace.es-activo")), texto(p.doc.querySelector(".cdk-sidebar__enlace.es-activo"))],
       ["Vendedores", "Vendedor del mes"]);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
