/**
 * Prueba de integracion de la cobertura de clientes por marca (grupo 25), sobre la
 * pagina real.
 *
 * Lo que mas importa:
 *
 *   · que NADA se calcule en pantalla: el total de clientes de la lista son clientes
 *     DISTINTOS, no la suma de los de cada marca, y es el que dice el backend
 *   · que las marcas y los clientes salgan en el orden del backend, y que una marca grande
 *     no se pinte entera de una vez
 *   · que quien solo devolvio se vea como tal, y no cuente como cliente
 *   · que se pueda mirar el mes en curso y los dos anteriores, con las marcas de entonces
 *   · que los clientes de una marca se exporten a Excel con lo que dice el backend, y que lo que no sea la hoja
 *     de calculo no se guarde
 *   · que un 0 en unidades se diga sin suponer por que (notas de credito, de debito o devolucion)
 *   · que "sin marcas" no sea un error, y que un fallo se pueda reintentar
 *   · que la jefatura pueda filtrar por especialista, y el especialista no
 *   · que una respuesta lenta de una marca no pise a lo que se eligio despues
 *
 * El simulacro es dev/simulador-cobertura.js, el mismo de dev/servidor.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const coberturaSim = require("../simulador-cobertura");

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
let demora = null;           // (ruta) -> milisegundos que tarda en llegar

function respuesta(obj, status, tipo) {
    const cuerpo = typeof obj === "string" ? obj : JSON.stringify(obj);
    return Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        headers: { get: (n) => (n.toLowerCase() === "content-type" ? (tipo || "application/json") : null) },
        /* Con blob() a proposito: una implementacion que guardara cualquier 200 tiene que poder hacerlo, o la prueba pasaria por otra razon. */
        blob: () => Promise.resolve(new Blob([cuerpo])),
        text: () => Promise.resolve(cuerpo)
    });
}

/** El Excel, con su nombre en Content-Disposition como lo manda el servidor. */
function archivo(a) {
    return Promise.resolve({
        status: 200, ok: true, statusText: "",
        headers: { get: (n) => ({ "content-type": a.tipo,
                                  /* Sin nombre en la cabecera: la pantalla pone uno de respaldo. */
                                  "content-disposition": a.sinNombre ? null : `attachment; filename="${a.nombre}"` })[n.toLowerCase()] || null },
        blob: () => Promise.resolve(new Blob([a.contenido])),
        text: () => Promise.resolve("")
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
            status: "ok", codigo: 0, data: { cobertura: "Revisa a que clientes se les vendio cada marca en el mes", cuota: "Cuota" },
            nombre: "JUAN CARLOS", grupo: "VENTAS-JEFES DE PROD", tipo: S.rol, tipoCambio: 3.75
        });
    }

    const p = { codmar: params.get("codmar"), anno: params.get("anno"), mes: params.get("mes"), formato: params.get("formato") };
    let r = null;
    if (camino === "/cobertura/marcas") r = coberturaSim.marcas(p);
    else if (camino === "/cobertura/clientes") r = coberturaSim.clientes(p);

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
    if (r.archivo) return archivo(r.archivo);
    if (alterar) r = alterar(camino, r) || r;

    const resp = respuesta(r.cuerpo, r.status);
    const espera = demora && demora(ruta);
    return espera ? new Promise((res) => setTimeout(() => res(resp), espera)) : resp;
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
    const destinos = [], descargas = [];

    /* Siempre el mismo dia: la prueba no puede depender del dia que se corra. */
    const Real = w.Date;
    w.Date = class extends Real {
        constructor(...a) { if (a.length) super(...a); else super(2026, 9, 21, 10); }
        static now() { return new Real(2026, 9, 21, 10).getTime(); }
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

    /* jsdom no implementa ni los blobs ni la descarga: se anotan. */
    w.URL.createObjectURL = (b) => "blob:prueba/" + b.size;
    w.URL.revokeObjectURL = () => {};
    w.HTMLAnchorElement.prototype.click = function () {
        descargas.push({ href: this.getAttribute("href"), nombre: this.getAttribute("download") });
    };

    for (const rel of scripts) {
        try { w.eval("(function (location) {\n" + leer(rel) + "\n})(window.__location)"); }
        catch (e) { console.log(`  FALLA  ${rel}: ${e.message}`); fallos++; }
    }

    return { w, doc: w.document, destinos, descargas, avisos };
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
const pedidos = (ruta) => llamadas.filter((l) => l.url.replace(/^.*\/v1/, "") === ruta).map((l) => l.url.replace(/^.*\/v1/, ""));
const rutas = () => llamadas.filter((l) => l.url.includes("/cobertura/")).map((l) => l.url.replace(/^.*\/v1/, ""));

const marcasEnPantalla = (p) => [...p.doc.querySelectorAll("#cobertura-marcas > li")];
const nombresDeMarcas = (p) => marcasEnPantalla(p).map((li) => texto(li.querySelector(".cdk-articulo__nombre")));
const clientesEnPantalla = (p) => [...p.doc.querySelectorAll("#cobertura-lista-clientes > li")];
const marca = (p, codmar) => p.doc.querySelector(`#cobertura-marcas > li[data-codmar='${codmar}']`);
const abrirMarca = async (p, codmar) => {
    llamadas = [];
    clic(p, marca(p, codmar).querySelector("button"));
    await pausa(250);
};

/** Lo que dice el backend ahora mismo, sin pasar por la pantalla: con lo que se compara. */
const delBackend = () => coberturaSim.marcas({}).cuerpo.data;
const clientesDelBackend = (codmar, periodo) => coberturaSim.clientes(Object.assign({ codmar }, periodo || {})).cuerpo.data;

/** Un especialista con seis marcas (TDK sin ventas, ADATA solo con devoluciones, EPSON la grande), o una jefatura. */
function preparar(rol, opciones) {
    opciones = opciones || {};
    marcasSim.reiniciar(rol);
    forzar = null; alterar = null; demora = null;

    if (rol === "ESPECIALISTA") {
        (opciones.marcas || ["0002", "0206", "0008", "0124", "0032", "0003"]).forEach((c) => { marcasSim.buscarMarca(c).dueno = "233"; });
        S.confirmados["233"] = true;
    }
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Cobertura de clientes por marca · grupo 25 ===\n");

    /* ============================================================ la lista de marcas */
    console.log("— las marcas del mes —");
    preparar("ESPECIALISTA");
    llamadas = [];
    let p = await montar("cobertura.html");
    await pausa(250);
    const sim = delBackend();

    ok("carga sin errores", fallos, 0);
    ok("pide las marcas del mes en curso, una vez, sin periodo", rutas(), ["/cobertura/marcas"]);
    ok("dice el mes y quien es", texto($(p, "periodo")), "octubre de 2026 · Especialista");
    ok("las marcas, en el orden del backend (por nombre)", nombresDeMarcas(p), sim.marcas.map((m) => m.nombre));
    ok("seis marcas, incluso las que no vendieron", marcasEnPantalla(p).length, 6);

    const epson = marca(p, "0008");
    ok("una marca dice su venta, sus clientes y sus unidades",
       [texto(epson).includes("$ 378,314.90"), texto(epson).includes("Clientes 130"), texto(epson).includes("Unidades 3,895")], [true, true, true]);
    ok("y su codigo", texto(epson.querySelector(".cdk-articulo__distintivo")), "0008");

    const tdk = marca(p, "0002");
    ok("una marca sin ventas sale con ceros, y atenuada: «0» no es «sin dato»",
       [texto(tdk).includes("$ 0.00"), texto(tdk).includes("Clientes 0"), !!tdk.querySelector(".cdk-dato--nulo")], [true, true, true]);

    const adata = marca(p, "0032");
    ok("una marca con solo devoluciones: cero clientes y unidades negativas, en alerta",
       [texto(adata).includes("Clientes 0"), texto(adata).includes("Unidades -2"), !!adata.querySelector(".cdk-dato--alerta")], [true, true, true]);
    ok("y sus cero clientes, atenuados aunque tenga unidades", !!adata.querySelector(".cdk-dato--nulo"), true);

    /* ---- los totales: del backend, y de clientes distintos */
    ok("el total de clientes es el del backend",
       [texto($(p, "cobertura-total-clientes")), texto($(p, "cobertura-total-unidades")), texto($(p, "cobertura-total-venta"))],
       ["130", "6,335", "$ 601,252.80"]);
    const sumaDeFilas = sim.marcas.reduce((n, m) => n + m.clientes, 0);
    ok("que no es la suma de los de cada marca: un cliente de dos marcas cuenta una vez",
       [sim.total.clientes < sumaDeFilas, sim.total.clientes], [true, 130]);
    ok("y la pantalla lo explica", texto($(p, "cobertura-nota-distintos")).startsWith("Son clientes distintos: uno que compró dos marcas cuenta una sola vez"), true);

    /* Si la pantalla sumara, los numeros no cuadrarian a proposito. */
    alterar = (camino, r) => {
        if (camino === "/cobertura/marcas" && r.cuerpo.data) r.cuerpo.data.total = { clientes: 77, unidades: 5, venta: 12.5 };
        return r;
    };
    p = await montar("cobertura.html");
    await pausa(250);
    ok("nada se suma aqui: sale lo que dice el backend",
       [texto($(p, "cobertura-total-clientes")), texto($(p, "cobertura-total-unidades")), texto($(p, "cobertura-total-venta"))],
       ["77", "5", "$ 12.50"]);
    alterar = null;

    /* Una sola marca: no hay nada que explicar. */
    preparar("ESPECIALISTA", { marcas: ["0008"] });
    p = await montar("cobertura.html");
    await pausa(250);
    ok("con una sola marca no hay nota de «distintos»", $(p, "cobertura-nota-distintos"), null);

    /* ---- buscar y filtrar */
    preparar("ESPECIALISTA");
    p = await montar("cobertura.html");
    await pausa(250);
    escribir(p, $(p, "cobertura-buscar-marca"), "epson");
    ok("buscar una marca por nombre", nombresDeMarcas(p), ["EPSON"]);
    escribir(p, $(p, "cobertura-buscar-marca"), "0124");
    ok("o por su codigo", nombresDeMarcas(p), ["ACER"]);
    escribir(p, $(p, "cobertura-buscar-marca"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "cobertura-lista")), "Ninguna marca coincide.");
    escribir(p, $(p, "cobertura-buscar-marca"), "");
    ok("un especialista no filtra por dueño: todas le salen suyas", $(p, "cobertura-filtro"), null);

    /* ============================================================ los clientes de una marca */
    console.log("\n— los clientes de una marca —");
    await abrirMarca(p, "0008");
    const epsonClientes = clientesDelBackend("0008");

    ok("pide los clientes de esa marca, en el mes en curso", rutas(), ["/cobertura/clientes?codmar=0008"]);
    ok("dice cual es la marca y el mes", [texto($(p, "cobertura-marca-nombre")), texto($(p, "cobertura-marca-mes"))], ["EPSON", "octubre de 2026"]);
    ok("los numeros de la marca, del backend",
       [texto($(p, "cobertura-marca-total-clientes")), texto($(p, "cobertura-marca-total-unidades")), texto($(p, "cobertura-marca-total-venta"))],
       ["130", "3,895", "$ 378,314.90"]);
    ok("sin devoluciones, no hay nota de ellas", $(p, "cobertura-nota-devoluciones"), null);

    ok("una marca grande no se pinta entera: salen 100", clientesEnPantalla(p).length, 100);
    ok("y se ofrece el resto, con cuantos son", texto($(p, "cobertura-ver-todos")), "Mostrar los 30 restantes");
    ok("en el orden del backend: los que mas compraron primero",
       [texto(clientesEnPantalla(p)[0].querySelector(".cdk-articulo__nombre")), texto(clientesEnPantalla(p)[99].querySelector(".cdk-articulo__nombre"))],
       [epsonClientes.clientes[0].nombre, epsonClientes.clientes[99].nombre]);

    const primero = epsonClientes.clientes[0];
    const filaPrimero = clientesEnPantalla(p)[0];
    ok("cada cliente: nombre, RUC, unidades, comprobantes, ultima compra e importe",
       [texto(filaPrimero).includes(primero.nombre), texto(filaPrimero).includes("RUC " + primero.ruc),
        texto(filaPrimero).includes("Unidades " + primero.unidades), texto(filaPrimero).includes("Comprobantes " + primero.comprobantes),
        texto(filaPrimero).includes("Última compra 05/10/2026"), texto(filaPrimero).includes("$ 10,087.00")],
       [true, true, true, true, true, true]);

    clic(p, $(p, "cobertura-ver-todos"));
    ok("al pedir el resto salen los 130, y el boton se va", [clientesEnPantalla(p).length, $(p, "cobertura-ver-todos")], [130, null]);
    ok("el ultimo es el que menos compro",
       texto(clientesEnPantalla(p)[129].querySelector(".cdk-articulo__nombre")), epsonClientes.clientes[129].nombre);

    /* ---- buscar un cliente */
    escribir(p, $(p, "cobertura-buscar-cliente"), primero.ruc);
    ok("buscar por RUC", clientesEnPantalla(p).map((li) => li.getAttribute("data-codcli")), [primero.codcli]);
    escribir(p, $(p, "cobertura-buscar-cliente"), "peru digital 023");
    ok("o por nombre, sin importar mayusculas", clientesEnPantalla(p).map((li) => li.getAttribute("data-codcli")), [primero.codcli]);
    ok("lo que coincide va resaltado", !!clientesEnPantalla(p)[0].querySelector("mark.cdk-marca"), true);
    escribir(p, $(p, "cobertura-buscar-cliente"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "cobertura-clientes")), "Ningún cliente coincide.");
    escribir(p, $(p, "cobertura-buscar-cliente"), "");

    /* ---- volver */
    clic(p, $(p, "cobertura-cambiar"));
    ok("«Marcas» vuelve a la lista, sin pedirla otra vez", [marcasEnPantalla(p).length, pedidos("/cobertura/marcas").length], [6, 0]);

    /* La busqueda de marcas sigue a la persona: entra, mira, vuelve. */
    escribir(p, $(p, "cobertura-buscar-marca"), "mem");
    await abrirMarca(p, "0003");
    clic(p, $(p, "cobertura-cambiar"));
    ok("al volver, lo que se buscaba sigue puesto", [$(p, "cobertura-buscar-marca").value, nombresDeMarcas(p)], ["mem", ["MEMOREX"]]);
    escribir(p, $(p, "cobertura-buscar-marca"), "");

    /* ---- devoluciones: quien solo devolvio sale, pero no cuenta */
    console.log("\n— devoluciones, ceros y marcas sin ventas —");

    /* Un 0 en unidades no siempre es «devolvio todo»: tambien notas de credito sin unidades o solo notas de debito. */
    await abrirMarca(p, "0124");
    const acer = clientesDelBackend("0124");
    ok("ACER tiene dos clientes en 0 unidades (una nota de credito y una de debito) que no cuentan",
       [acer.clientes.filter((c) => c.unidades === 0).length, acer.total.clientes, acer.clientes.length], [2, 17, 19]);
    ok("la pantalla dice los que cuentan, no las filas", texto($(p, "cobertura-marca-total-clientes")), "17");
    const ceros = clientesEnPantalla(p).filter((li) => texto(li).includes("Unidades 0"));
    ok("las filas en cero lo dicen sin suponer por que: «sin unidades netas en el mes»",
       ceros.map((li) => texto(li).includes("no cuenta: sin unidades netas en el mes")), [true, true]);
    ok("sin decir «devolvio todo», que puede no ser cierto",
       clientesEnPantalla(p).some((li) => texto(li).includes("devolvió todo")), false);
    ok("y en alerta, como las demas que no cuentan", ceros.every((li) => !!li.querySelector(".cdk-dato--alerta")), true);
    ok("la nota de la lista tampoco dice solo «devoluciones»", texto($(p, "cobertura-nota-devoluciones")).includes("notas de crédito o de débito"), true);
    clic(p, $(p, "cobertura-cambiar"));

    await abrirMarca(p, "0003");
    const memorex = clientesDelBackend("0003");
    ok("los clientes que cuentan no incluyen a quien solo devolvio", [memorex.total.clientes, memorex.clientes.length], [24, 25]);
    ok("la pantalla dice los que cuentan, no las filas", texto($(p, "cobertura-marca-total-clientes")), "24");
    ok("y se explica que quien solo devolvio sale en negativo y no cuenta", texto($(p, "cobertura-nota-devoluciones")).includes("no cuenta como cliente de la marca"), true);

    const devolvio = clientesEnPantalla(p).pop();
    ok("la fila de quien devolvio lo dice, con unidades negativas y en alerta",
       [texto(devolvio).includes("no cuenta: solo devoluciones"), texto(devolvio).includes("Unidades -3"), !!devolvio.querySelector(".cdk-dato--alerta")],
       [true, true, true]);
    ok("y las demas no", clientesEnPantalla(p).slice(0, 24).some((li) => texto(li).includes("no cuenta")), false);

    clic(p, $(p, "cobertura-cambiar"));
    await abrirMarca(p, "0032");
    ok("una marca solo con devoluciones: cero clientes, una fila, y las unidades en negativo",
       [texto($(p, "cobertura-marca-total-clientes")), texto($(p, "cobertura-marca-total-unidades")), clientesEnPantalla(p).length], ["0", "-2", 1]);
    ok("sale quien devolvio, y dice que no cuenta", texto(clientesEnPantalla(p)[0]).includes("no cuenta: solo devoluciones"), true);

    clic(p, $(p, "cobertura-cambiar"));
    await abrirMarca(p, "0002");
    ok("una marca sin ventas: lo dice, con el mes", texto($(p, "cobertura-clientes")), "Nadie compró TDK en octubre de 2026.");
    ok("y no ofrece buscar entre nadie", $(p, "cobertura-buscar-cliente"), null);

    /* ============================================================ exportar a Excel */
    console.log("\n— exportar a Excel —");
    clic(p, $(p, "cobertura-cambiar"));
    await abrirMarca(p, "0008");
    const exportar = $(p, "cobertura-exportar");
    ok("los clientes de una marca se pueden exportar", texto(exportar), "Exportar a Excel");

    llamadas = [];
    clic(p, exportar);
    ok("mientras se genera, el boton no deja pulsar otra vez", [exportar.disabled, texto(exportar)], [true, "Generando…"]);
    clic(p, exportar);
    await pausa(200);

    ok("pide el archivo una sola vez, con el codigo de la marca y el formato", rutas(), ["/cobertura/clientes?codmar=0008&formato=xlsx"]);
    ok("lo guarda con el nombre que pone el servidor", p.descargas.map((d) => d.nombre), ["clientes-EPSON-2026-10.xlsx"]);
    ok("y es el archivo del backend, no uno armado con la lista que se ve",
       p.descargas[0].href, "blob:prueba/" + coberturaSim.clientes({ codmar: "0008", formato: "xlsx" }).archivo.contenido.length);
    ok("sin salir de la pagina, y lo avisa", [p.destinos, toasts(p.doc).some((t) => t.includes("clientes-EPSON-2026-10.xlsx"))], [[], true]);
    ok("el boton vuelve a estar libre", [exportar.disabled, texto(exportar)], [false, "Exportar a Excel"]);
    ok("y la lista sigue como estaba", clientesEnPantalla(p).length, 100);

    /* Si el servidor no pusiera el nombre, la pantalla usa uno de respaldo con la marca. */
    p.descargas.length = 0;
    forzar = (ruta) => (ruta.includes("formato=xlsx")
        ? archivo({ tipo: coberturaSim.clientes({ codmar: "0008", formato: "xlsx" }).archivo.tipo, contenido: "x", sinNombre: true }) : null);
    clic(p, exportar); await pausa(200);
    ok("sin nombre en \`Content-Disposition\`: «clientes-» y el codigo de la marca", p.descargas.map((d) => d.nombre), ["clientes-0008.xlsx"]);
    forzar = null;

    /* El simulacro es fiel al documento: la hoja trae TODOS los clientes (tambien los que solo devolvieron), en el
       mismo orden que el JSON, y las mismas columnas. */
    const hoja = coberturaSim.clientes({ codmar: "0003", formato: "xlsx" }).archivo.contenido.toString("utf8");
    const jsonMem = clientesDelBackend("0003");
    ok("la hoja trae una fila por cliente mas la cabecera, tambien el que solo devolvio",
       (hoja.match(/<row /g) || []).length, jsonMem.clientes.length + 1);
    ok("en el mismo orden que el JSON: el primero y el ultimo",
       [hoja.indexOf(jsonMem.clientes[0].nombre) < hoja.indexOf(jsonMem.clientes[1].nombre),
        hoja.indexOf(jsonMem.clientes[23].nombre) < hoja.indexOf(jsonMem.clientes[24].nombre)], [true, true]);
    ok("con las columnas del JSON, en su orden", jsonMem.columnas.map((c) => c.titulo),
       ["CODIGO", "RUC", "CLIENTE", "UNIDADES", "VENTA US$ SIN IGV", "COMPROBANTES", "ULTIMA COMPRA"]);
    ok("el formato se pide en mayusculas o minusculas; otro es `formato invalido`",
       [coberturaSim.clientes({ codmar: "0003", formato: "XLSX" }).status, coberturaSim.clientes({ codmar: "0003", formato: "pdf" }).cuerpo.status],
       [200, "formato invalido"]);

    /* Si en vez de un Excel llega un error, nunca se guarda: un fallo y un Excel corrupto se veian igual. */
    p.descargas.length = 0;
    forzar = (ruta) => (ruta.includes("formato=xlsx")
        ? respuesta({ status: "formato invalido", codigo: 2, msg: "el formato es json o xlsx" }, 400) : null);
    clic(p, exportar); await pausa(200);
    ok("un error del backend no se guarda, y se muestra su mensaje",
       [p.descargas.length, toasts(p.doc).some((t) => t.includes("el formato es json o xlsx"))], [0, true]);

    forzar = (ruta) => (ruta.includes("formato=xlsx") ? respuesta("<html>mantenimiento</html>", 200, "text/html") : null);
    clic(p, exportar); await pausa(200);
    ok("un 200 que no es la hoja de calculo tampoco se guarda, y el boton sigue funcionando", [p.descargas.length, exportar.disabled], [0, false]);

    forzar = (ruta) => (ruta.includes("formato=xlsx") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    clic(p, exportar); await pausa(200);
    ok("un fallo del servidor tampoco", [p.descargas.length, exportar.disabled], [0, false]);

    /* La marca ya no esta entre las que puede consultar: la lista esta desfasada. */
    forzar = (ruta) => (ruta.includes("formato=xlsx")
        ? respuesta({ status: "marca no disponible", codigo: 3, msg: "esa marca no esta entre las que puedes consultar ese mes" }, 403) : null);
    llamadas = [];
    clic(p, exportar); await pausa(300);
    ok("`marca no disponible` al exportar: lo dice y vuelve a pedir la lista",
       [toasts(p.doc).some((t) => t.includes("no esta entre las que puedes consultar")), pedidos("/cobertura/marcas").length, marcasEnPantalla(p).length],
       [true, 1, 6]);
    forzar = null;

    /* Una marca sin ningun cliente no ofrece exportar una hoja vacia. */
    await abrirMarca(p, "0002");
    ok("TDK, sin clientes: no ofrece exportar una hoja vacia", $(p, "cobertura-exportar"), null);
    clic(p, $(p, "cobertura-cambiar"));
    /* Pero con solo devoluciones si: hay filas que ver, y el Excel las trae. */
    await abrirMarca(p, "0032");
    ok("ADATA, con una sola fila de devolucion: si lo ofrece", !!$(p, "cobertura-exportar"), true);
    clic(p, $(p, "cobertura-cambiar"));

    /* ============================================================ otros meses */
    console.log("\n— otros meses —");
    ok("el mes en curso y los dos anteriores",
       [...$(p, "cobertura-mes").options].map((o) => o.textContent),
       ["octubre de 2026 (este mes)", "septiembre de 2026", "agosto de 2026"]);

    llamadas = [];
    await elegirOpcion(p, $(p, "cobertura-mes"), "2026-09");
    ok("un mes anterior pide con `anno` y `mes`", rutas(), ["/cobertura/marcas?anno=2026&mes=9"]);
    ok("dice que es un mes cerrado", texto($(p, "periodo")), "septiembre de 2026 · Especialista · mes cerrado");
    ok("con las marcas de entonces: sin EP_IMPRESORAS, que es nueva, y con HIKVISION, que ya no",
       nombresDeMarcas(p), ["ACER", "ADATA", "EPSON", "HIKVISION", "MEMOREX", "TDK"]);
    ok("el selector queda en el mes elegido", $(p, "cobertura-mes").value, "2026-09");
    ok("y los numeros son los de ese mes, del backend",
       texto($(p, "cobertura-total-clientes")), String(coberturaSim.marcas({ anno: 2026, mes: 9 }).cuerpo.data.total.clientes));

    await abrirMarca(p, "0008");
    ok("los clientes de una marca van de ese mes: la consulta lleva el periodo", rutas(), ["/cobertura/clientes?codmar=0008&anno=2026&mes=9"]);
    ok("y lo dice", texto($(p, "cobertura-marca-mes")), "septiembre de 2026 · mes cerrado");
    ok("con los clientes de entonces",
       texto($(p, "cobertura-marca-total-clientes")), String(clientesDelBackend("0008", { anno: 2026, mes: 9 }).total.clientes));

    clic(p, $(p, "cobertura-cambiar"));
    ok("al volver, sigue en ese mes", [$(p, "cobertura-mes").value, texto($(p, "periodo")).includes("septiembre")], ["2026-09", true]);

    /* El Excel de un mes cerrado lleva ese mes: lo que se descarga es lo que se ve. */
    await abrirMarca(p, "0008");
    p.descargas.length = 0;
    llamadas = [];
    clic(p, $(p, "cobertura-exportar")); await pausa(200);
    ok("la consulta del Excel lleva el periodo", rutas(), ["/cobertura/clientes?codmar=0008&anno=2026&mes=9&formato=xlsx"]);
    ok("y el archivo trae ese mes en su nombre", p.descargas.map((d) => d.nombre), ["clientes-EPSON-2026-09.xlsx"]);
    clic(p, $(p, "cobertura-cambiar"));

    await elegirOpcion(p, $(p, "cobertura-mes"), "2026-08");
    ok("hace dos meses no tenia marcas: no es un error, y se dice",
       texto($(p, "cobertura-sin-marcas-mes")), "No tenías marcas en agosto de 2026Ese mes no tenías marcas asignadas, así que no hay cobertura que ver.");
    ok("y se puede volver a otro mes", [!!$(p, "cobertura-mes"), $(p, "cobertura-mes").value], [true, "2026-08"]);
    ok("sin ofrecer elegir marcas, que entonces no habia nada que elegir", $(p, "cobertura-sin-marcas"), null);

    await elegirOpcion(p, $(p, "cobertura-mes"), "");
    ok("«este mes» vuelve a lo de ahora", [nombresDeMarcas(p).length, texto($(p, "periodo"))], [6, "octubre de 2026 · Especialista"]);

    /* Si cambiar de mes falla, no se pierde lo que se estaba viendo. */
    forzar = (ruta) => (ruta.includes("mes=9") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    await elegirOpcion(p, $(p, "cobertura-mes"), "2026-09");
    ok("un fallo al cambiar de mes se dice, y el selector vuelve a donde estaba",
       [toasts(p.doc).length > 0, $(p, "cobertura-mes").value, $(p, "cobertura-mes").disabled, nombresDeMarcas(p).length], [true, "", false, 6]);
    forzar = null;
    await abrirMarca(p, "0124");
    ok("y lo que se mira despues sigue siendo el mes en curso: sin periodo en la consulta", rutas(), ["/cobertura/clientes?codmar=0124"]);
    clic(p, $(p, "cobertura-cambiar"));

    /* ============================================================ la jefatura */
    console.log("\n— una jefatura —");
    preparar("JEFATURA");
    p = await montar("cobertura.html");
    await pausa(250);
    const jef = delBackend();
    const mia = jef.marcas.find((m) => m.dueno.soyYo);
    const ajena = jef.marcas.find((m) => !m.dueno.soyYo);

    ok("dice que es jefatura", texto($(p, "periodo")), "octubre de 2026 · Jefatura");
    ok("filtra por especialista: todas, las mias y cada uno de los demas",
       [...$(p, "cobertura-filtro").options].map((o) => o.value), ["todas", "mias", "u:" + ajena.dueno.codusu]);
    ok("con cuantas marcas tiene cada uno",
       [...$(p, "cobertura-filtro").options].map((o) => o.textContent),
       ["Todas (" + jef.marcas.length + ")", "Mías (1)", ajena.dueno.nombre + " (1)"]);
    ok("a la jefatura le dice de quien es cada marca ajena, y no de las suyas",
       [texto(marca(p, ajena.codmar)).includes(ajena.dueno.nombre), texto(marca(p, mia.codmar)).includes(mia.dueno.nombre)], [true, false]);

    await elegirOpcion(p, $(p, "cobertura-filtro"), "mias");
    ok("filtrar por «mias»", nombresDeMarcas(p), [mia.nombre]);
    await elegirOpcion(p, $(p, "cobertura-filtro"), "u:" + ajena.dueno.codusu);
    ok("o por un especialista", nombresDeMarcas(p), [ajena.nombre]);
    ok("el total no cambia al filtrar: es el de todas sus marcas", texto($(p, "cobertura-total-clientes")), String(jef.total.clientes));

    /* El filtro sobrevive a mirar una marca y volver. */
    await abrirMarca(p, ajena.codmar);
    clic(p, $(p, "cobertura-cambiar"));
    ok("al volver, el filtro sigue puesto", [$(p, "cobertura-filtro").value, nombresDeMarcas(p)], ["u:" + ajena.dueno.codusu, [ajena.nombre]]);

    /* Si el especialista elegido ya no tiene marcas en otro mes, el filtro no se queda apuntando a nada. */
    alterar = (camino, r) => {
        if (camino === "/cobertura/marcas" && r.cuerpo.data) {
            r.cuerpo.data.marcas = r.cuerpo.data.marcas.filter((m) => m.dueno.codusu !== ajena.dueno.codusu);
        }
        return r;
    };
    await elegirOpcion(p, $(p, "cobertura-mes"), "2026-09");
    ok("el filtro vuelve a «todas» y la lista no sale vacia sin explicacion",
       [$(p, "cobertura-filtro").value, nombresDeMarcas(p).length > 0, nombresDeMarcas(p).includes(ajena.nombre)], ["todas", true, false]);
    alterar = null;

    /* ============================================================ sin marcas, sin alta y los fallos */
    console.log("\n— sin marcas, sin registro y fallos —");
    preparar("ESPECIALISTA", { marcas: [] });
    p = await montar("cobertura.html");
    await pausa(250);
    ok("sin marcas este mes no es un error: se dice y se ofrece el camino",
       [texto($(p, "cobertura-sin-marcas")).startsWith("Todavía no tienes marcas este mes"), $(p, "cobertura-sin-marcas").querySelector("a").getAttribute("href")],
       [true, "/marcas.html"]);
    ok("con lo que dice el backend", texto($(p, "cobertura-sin-marcas")).includes("no tienes marcas este mes; elige y confirma las tuyas"), true);
    ok("y se puede mirar otro mes", [...$(p, "cobertura-mes").options].length, 3);
    ok("el titulo lo dice", texto($(p, "periodo")), "Sin marcas este mes");

    await elegirOpcion(p, $(p, "cobertura-mes"), "2026-09");
    ok("el mes pasado si tenia (una marca que ya no se trabaja): sale esa", nombresDeMarcas(p), ["HIKVISION"]);

    S.yaRegistrado = false;
    p = await montar("cobertura.html");
    await pausa(250);
    ok("sin registrarse, el camino al formulario",
       [texto($(p, "cobertura-sin-alta")).startsWith("Todavía no estás registrado"), p.doc.querySelector("#cobertura-sin-alta a").getAttribute("href")],
       [true, "/autenticador.html"]);

    preparar("COBERTURA");
    p = await montar("cobertura.html");
    await pausa(250);
    ok("quien es del grupo 20 no ve la cobertura del grupo 25: el motivo del backend",
       [!!p.doc.querySelector("#contenido .cdk-estado"), texto($(p, "contenido")).includes("esta ruta es del grupo 25")], [true, true]);

    /* ---- un fallo del servidor, con reintento */
    preparar("ESPECIALISTA");
    forzar = (ruta) => (ruta.startsWith("/cobertura/marcas") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    p = await montar("cobertura.html");
    await pausa(250);
    ok("un fallo del servidor se dice, con la posibilidad de reintentar", !!p.doc.querySelector("#contenido .cdk-estado button"), true);
    forzar = null;
    clic(p, p.doc.querySelector("#contenido .cdk-estado button"));
    await pausa(250);
    ok("reintentar pinta la lista", marcasEnPantalla(p).length, 6);

    /* ---- una marca que falla se reintenta, y se puede volver */
    forzar = (ruta) => (ruta.startsWith("/cobertura/clientes") ? respuesta({ status: "error", codigo: 1, msg: "se cayo" }, 500) : null);
    await abrirMarca(p, "0008");
    ok("si fallan los clientes de una marca: error con reintento, y el camino de vuelta sigue",
       [!!p.doc.querySelector("#cobertura-clientes-caja .cdk-estado button"), !!$(p, "cobertura-cambiar")], [true, true]);
    forzar = null;
    clic(p, p.doc.querySelector("#cobertura-clientes-caja .cdk-estado button"));
    await pausa(250);
    ok("reintentar trae los clientes", clientesEnPantalla(p).length, 100);

    /* ---- la marca ya no esta entre las que puede consultar */
    clic(p, $(p, "cobertura-cambiar"));
    forzar = (ruta) => (ruta.startsWith("/cobertura/clientes")
        ? respuesta({ status: "marca no disponible", codigo: 3, msg: "esa marca no esta entre las que puedes consultar ese mes" }, 403) : null);
    llamadas = [];
    clic(p, marca(p, "0124").querySelector("button"));
    await pausa(300);
    ok("`marca no disponible`: lo dice con su mensaje", toasts(p.doc).some((t) => t.includes("no esta entre las que puedes consultar")), true);
    ok("y vuelve a pedir la lista, que estaba desfasada", [pedidos("/cobertura/marcas").length, marcasEnPantalla(p).length], [1, 6]);
    forzar = null;

    /* ---- una respuesta lenta no pisa a lo que se eligio despues */
    console.log("\n— una respuesta lenta no pisa a la siguiente —");
    demora = (ruta) => (ruta.startsWith("/cobertura/clientes") ? 400 : 0);
    clic(p, marca(p, "0008").querySelector("button"));
    await pausa(30);
    clic(p, $(p, "cobertura-cambiar"));
    await pausa(700);
    ok("se volvio a la lista antes de que llegaran los clientes: la lista se queda, y no los pinta despues",
       [marcasEnPantalla(p).length, !!$(p, "cobertura-lista-clientes")], [6, false]);
    demora = null;

    /* ============================================================ el menu */
    console.log("\n— el menu —");
    preparar("ESPECIALISTA");
    p = await montar("cobertura.html");
    await pausa(250);
    const activo = p.doc.querySelector(".cdk-sidebar__enlace.es-activo");
    ok("Cobertura sale en el menu, marcada, y lleva a su pagina",
       [texto(activo), activo && activo.getAttribute("href")], ["Cobertura", "/cobertura.html"]);
    ok("con su icono", (activo.querySelector("svg path").getAttribute("d") || "").startsWith("M18 18.72"), true);
    ok("y sin numerito: ese es solo de Ajustes", p.doc.querySelectorAll(".cdk-insignia").length, 0);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
