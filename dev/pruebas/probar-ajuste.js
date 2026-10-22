/**
 * Prueba de integracion del ajuste de precios (lado del grupo 25), sobre las
 * paginas reales.
 *
 * Lo que mas importa:
 *
 *   · que quien recibe vea las solicitudes pendientes primero, con cuando vencen
 *   · que ajustar sea lo que dice el contrato: el precio y el % sobre costo se
 *     mueven juntos, el precio no baja del costo (en la moneda del documento), y
 *     solo viajan las lineas que se ajustaron
 *   · que en un pedido no se pueda tocar la cantidad
 *   · que se avise de lo que se pierde: TODAS las promociones del documento y que el
 *     descuento de la linea pasa a 0
 *   · que rechazar exija la observacion, y que nada se mande sin ella
 *   · que si la pantalla ya no esta al dia (alguien respondio, el documento avanzo)
 *     se diga y se vuelva a pedir todo
 *   · que nada se calcule de lo que el backend ya dice (margen de hoy, totales)
 *
 * El simulacro es dev/simulador-ajuste.js, el mismo de dev/servidor.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const ajusteSim = require("../simulador-ajuste");

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
let alterar = null;          // (camino, cuerpo, resultado) -> resultado, para probar que no se calcula nada
let demora = null;           // (ruta) -> milisegundos que tarda en llegar
let accesosHub;              // lo que responde GET /ajuste
let pendientesMenu;          // lo que dice /vendedor en `ajustesPendientes`: un valor, o una funcion que lo calcula; undefined: no lo manda

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
    const params = new URLSearchParams(consulta || "");

    if (camino === "/vendedor") {
        return respuesta({
            status: "ok", codigo: 0,
            /* Con numerito, un modulo mas: para ver que la insignia es solo de Ajustes. */
            data: Object.assign({ ajuste: "Ajuste de precio de cotizaciones y pedidos" },
                                pendientesMenu === undefined ? {} : { cuota: "Cuota" }),
            nombre: "JUAN CARLOS", grupo: "VENTAS-JEFES DE PROD", tipo: S.rol, tipoCambio: 3.75,
            ...(pendientesMenu === undefined ? {} : {
                ajustesPendientes: typeof pendientesMenu === "function" ? pendientesMenu() : pendientesMenu
            })
        });
    }

    /* Los accesos del hub. */
    if (camino === "/ajuste") return respuesta({ status: "ok", codigo: 0, data: accesosHub || ["recibidas"] });

    const p = { id: params.get("id"), estado: params.get("estado"), ndocu: params.get("ndocu"),
                desde: params.get("desde"), hasta: params.get("hasta") };
    let r = null;
    if (camino === "/ajuste/recibidas") r = ajusteSim.recibidas(p);
    else if (camino === "/ajuste/solicitud") r = ajusteSim.solicitud(p);
    else if (camino === "/ajuste/confirmar") r = ajusteSim.confirmar(cuerpo);
    else if (camino === "/ajuste/rechazar") r = ajusteSim.rechazar(cuerpo);

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
    if (alterar) r = alterar(camino, cuerpo, r) || r;

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
    const destinos = [];

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

    for (const rel of scripts) {
        try { w.eval("(function (location) {\n" + leer(rel) + "\n})(window.__location)"); }
        catch (e) { console.log(`  FALLA  ${rel}: ${e.message}`); fallos++; }
    }

    return { w, doc: w.document, destinos, avisos };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
const escribir = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("input", { bubbles: true })); };
const marcar = (p, n, si) => { n.checked = si; n.dispatchEvent(new p.w.Event("change", { bubbles: true })); };
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);
const posts = (ls) => ls.filter((l) => l.metodo === "POST").map((l) => ({ ruta: l.url.replace(/^.*\/v1/, ""), cuerpo: l.cuerpo }));
const gets = (ls, parte) => ls.filter((l) => l.metodo === "GET" && l.url.includes(parte)).length;
const sinNbsp = (t) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);
/** El valor de una medida de una linea (`Costo`, `Stock`…), por su etiqueta. */
const valorDe = (nodo, etiqueta) => {
    const m = [...nodo.querySelectorAll(".cdk-medida")]
        .find((x) => x.querySelector(".cdk-medida__etiqueta").textContent === etiqueta);
    return m ? texto(m.querySelector(".cdk-medida__valor")) : null;
};

const $ = (p, id) => p.doc.getElementById(id);
const titulos = (p) => [...p.doc.querySelectorAll("#cdk-acciones .cdk-tarjeta__titulo")].map((n) => n.textContent);
const nombres = (p) => [...p.doc.querySelectorAll("#ajuste-solicitudes .cdk-articulo__nombre")].map((n) => n.textContent.trim());

/** Las solicitudes pendientes del usuario, por documento. */
const idDe = (ndocu) => ajusteSim.recibidas({ ndocu }).cuerpo.data.solicitudes[0].id;

/** El modal abierto: su mensaje, y pulsar su boton de confirmar o de cancelar. */
const modal = (p) => ({
    titulo: texto(p.doc.querySelector(".cdk-modal__titulo")),
    mensaje: texto(p.doc.querySelector(".cdk-modal__mensaje"))
});
const botonModal = (p, cual) => {
    const b = p.doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    return cual === "confirmar" ? b[b.length - 1] : b[0];
};

/** Un especialista con TDK y EP_IMPRESORAS, o una jefatura. Las solicitudes salen de sus marcas. */
function preparar(rol, opciones) {
    opciones = opciones || {};
    marcasSim.reiniciar(rol);
    forzar = null; alterar = null; demora = null; accesosHub = undefined; pendientesMenu = undefined;

    if (rol === "ESPECIALISTA") {
        (opciones.marcas || ["0002", "0206"]).forEach((c) => { marcasSim.buscarMarca(c).dueno = "233"; });
        S.confirmados["233"] = true;
    }
    ajusteSim.reiniciar();
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Ajuste de precios · grupo 25 ===\n");

    /* ================================================================ el hub */
    console.log("— el hub —");
    preparar("ESPECIALISTA");
    let p = await montar("ajuste.html");
    await pausa(200);
    ok("carga sin errores", fallos, 0);
    ok("el grupo 25 ve «Recibidas»", titulos(p), ["Recibidas"]);
    ok("que lleva a la lista", p.doc.querySelector("#cdk-acciones a").getAttribute("href"), "/ajuste/ajuste_recibidas.html");
    ok("sin avisos de permisos sin declarar", p.avisos.some((a) => a.includes("sin declarar")), false);

    /* ===================================================== el numerito del menu */
    console.log("\n— el numerito de pendientes en el menu —");
    const insignias = (p) => ({
        lateral: texto(p.doc.querySelector(".cdk-sidebar__enlace .cdk-insignia")),
        inferior: texto(p.doc.querySelector(".cdk-bottomnav__enlace .cdk-insignia")),
        cuantas: p.doc.querySelectorAll(".cdk-insignia").length
    });

    preparar("ESPECIALISTA");
    pendientesMenu = 3;
    p = await montar("ajuste.html");
    await pausa(250);
    ok("con 3 pendientes, el menu lo dice: en el lateral y en la barra de abajo", [insignias(p).lateral, insignias(p).inferior], ["3", "3"]);
    ok("lo lee un lector de pantalla", p.doc.querySelector(".cdk-sidebar__enlace .cdk-insignia").getAttribute("aria-label"), "3 pendientes");
    ok("y es solo de Ajustes: Cuota, que tambien esta en el menu, no lo lleva", insignias(p).cuantas, 2);
    ok("el numerito no navega: esta dentro del enlace de Ajustes",
       p.doc.querySelector(".cdk-sidebar__enlace .cdk-insignia").closest("a").getAttribute("href"), "/ajuste.html");

    pendientesMenu = 1;
    p = await montar("ajuste.html");
    await pausa(250);
    ok("con una sola, en singular", p.doc.querySelector(".cdk-sidebar__enlace .cdk-insignia").getAttribute("aria-label"), "1 pendiente");

    pendientesMenu = 150;
    p = await montar("ajuste.html");
    await pausa(250);
    ok("pasada la centena no se desborda: 99+", insignias(p).lateral, "99+");

    for (const [valor, cual] of [[0, "0"], [null, "null: no aplica o no se pudo contar"], [undefined, "que el backend no lo mande"], ["3", "un texto"]]) {
        preparar("ESPECIALISTA");
        pendientesMenu = valor;
        p = await montar("ajuste.html");
        await pausa(250);
        ok("sin numerito con " + cual + ", y el menu abre igual", [insignias(p).cuantas, !!p.doc.querySelector(".cdk-sidebar__enlace")], [0, true]);
    }

    /* Responder una solicitud la quita de las pendientes: el numerito baja en el momento, sin cambiar de pagina. */
    preparar("ESPECIALISTA");
    pendientesMenu = () => ajusteSim.recibidas({ estado: "PENDIENTE" }).cuerpo.data.solicitudes.length;
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    ok("en la pantalla de una solicitud, el menu dice cuantas esperan", insignias(p).lateral, "2");
    marcar(p, $(p, "linea-2-activa"), true);
    escribir(p, $(p, "linea-2-precio"), "170");
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(400);
    ok("al confirmar, el numerito baja a 1", [insignias(p).lateral, insignias(p).inferior], ["1", "1"]);

    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00774171"));
    await pausa(250);
    escribir(p, $(p, "ajuste-observacion"), "no hay margen");
    clic(p, $(p, "ajuste-rechazar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(400);
    ok("al rechazar la ultima, el numerito desaparece", insignias(p).cuantas, 0);

    /* ======================================================== las recibidas */
    console.log("\n— las recibidas —");
    preparar("ESPECIALISTA");
    llamadas = [];
    p = await montar("ajuste/ajuste_recibidas.html");
    await pausa(250);

    ok("pide las pendientes, y solo ellas", llamadas.filter((l) => l.url.includes("/ajuste/recibidas")).map((l) => l.url.replace(/^.*\/v1/, "")),
       ["/ajuste/recibidas?estado=PENDIENTE"]);
    ok("la pestaña elegida es la de pendientes", $(p, "pestana-PENDIENTE").getAttribute("aria-selected"), "true");
    /* La mas reciente primero: el pedido llego a las 10:15 y la cotizacion a las 09:40. */
    ok("las mas recientes primero", nombres(p), ["Pedido 009-00774171", "Cotización 009-00969476"]);

    const filaPed = p.doc.querySelector("[data-solicitud]");
    const filaCot = p.doc.querySelectorAll("[data-solicitud]")[1];
    ok("el cliente y quien la envia", [texto(filaCot).includes("DISTRIBUIDORA OK.COM S.A.C."), texto(filaCot).includes("De GONZALES CRISTOPHER")], [true, true]);
    ok("lo que dijo el vendedor", texto(filaCot).includes("«una ajustadita por favor»"), true);
    ok("cuantas lineas le tocan", texto(filaCot).includes("Líneas 2"), true);
    ok("lo que sumaban, en la moneda del documento: dolares", texto(filaCot).includes("$ 394.28"), true);
    ok("y soles", texto(filaPed).includes("S/ 3,177.00"), true);
    ok("cuando vence, que a los 3 dias se pierde", texto(filaCot).includes("Vence 24/10/2026"), true);
    ok("y que esta pendiente", texto(filaCot).includes("Pendiente"), true);

    clic(p, filaCot.querySelector("button"));
    ok("abrir una lleva a su pantalla", p.destinos, ["/ajuste/ajuste_solicitud.html?id=" + idDe("009-00969476")]);

    /* ---- buscar, sobre las pendientes */
    escribir(p, $(p, "ajuste-buscar"), "megahard");
    ok("buscar por cliente", nombres(p), ["Pedido 009-00774171"]);
    escribir(p, $(p, "ajuste-buscar"), "969476");
    ok("o por documento", nombres(p), ["Cotización 009-00969476"]);
    escribir(p, $(p, "ajuste-buscar"), "torres");
    ok("o por quien la envio", nombres(p), ["Pedido 009-00774171"]);
    escribir(p, $(p, "ajuste-buscar"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "ajuste-lista")).includes("Ninguna solicitud coincide"), true);
    escribir(p, $(p, "ajuste-buscar"), "");
    ok("y al borrar la busqueda vuelven todas", nombres(p).length, 2);

    /* ---- una pestaña por estado */
    console.log("\n— una pestaña por estado —");
    ok("las pestañas", [...p.doc.querySelectorAll("#ajuste-pestanas .cdk-pestana")].map((b) => b.textContent),
       ["Pendientes", "Confirmadas", "Rechazadas", "Vencidas", "Cerradas"]);
    ok("ninguna que mezcle los estados", $(p, "pestana-todas"), null);

    const verPestana = async (estado) => {
        llamadas = [];
        clic(p, $(p, "pestana-" + estado));
        await pausa(250);
    };
    const pedidosDeLista = () => llamadas.filter((l) => l.url.includes("/ajuste/recibidas")).map((l) => l.url.replace(/^.*\/v1/, ""));
    const filas = () => [...p.doc.querySelectorAll("[data-solicitud]")];

    await verPestana("CONFIRMADA");
    ok("cada pestaña pide solo su estado", pedidosDeLista(), ["/ajuste/recibidas?estado=CONFIRMADA"]);
    ok("la elegida queda marcada", [$(p, "pestana-CONFIRMADA").getAttribute("aria-selected"), $(p, "pestana-PENDIENTE").getAttribute("aria-selected")],
       ["true", "false"]);
    ok("las confirmadas", nombres(p), ["Cotización 009-00851002"]);
    ok("dice que esta confirmada", texto(filas()[0]).includes("Confirmada"), true);
    ok("una ya respondida dice cuando, no cuando vence", [texto(filas()[0]).includes("Respondida"), texto(filas()[0]).includes("Vence")], [true, false]);
    ok("y lo que se le dijo al vendedor", texto(filas()[0]).includes("Tu observación: «listo, precio especial por volumen»"), true);

    await verPestana("RECHAZADA");
    ok("las rechazadas, con su observacion", [nombres(p), texto(filas()[0]).includes("Tu observación: «el cliente tiene que llevar al menos 50 unidades»")],
       [["Pedido 009-00851377"], true]);

    await verPestana("VENCIDA");
    ok("las vencidas", [nombres(p), texto(filas()[0]).includes("Vencida")], [["Cotización 009-00850190"], true]);

    await verPestana("CERRADA");
    ok("las cerradas", [nombres(p), texto(filas()[0]).includes("Cerrada")], [["Pedido 009-00849011"], true]);

    /* La busqueda sigue a la persona de una pestaña a otra. */
    escribir(p, $(p, "ajuste-buscar"), "850190");
    ok("buscar en las cerradas lo que es de otra pestaña no encuentra nada", texto($(p, "ajuste-lista")).includes("Ninguna solicitud coincide"), true);
    await verPestana("VENCIDA");
    ok("pero en la suya si", nombres(p), ["Cotización 009-00850190"]);
    escribir(p, $(p, "ajuste-buscar"), "");

    /* ---- filtrar por fecha de envio: para ver lo anterior a las 100 mas recientes */
    console.log("\n— filtrar por fecha de envio —");
    const fechar = async (id, valor) => {
        $(p, id).value = valor;
        $(p, id).dispatchEvent(new p.w.Event("change", { bubbles: true }));
        await pausa(250);
    };
    await verPestana("PENDIENTE");
    ok("sin filtro: las dos pendientes, y el filtro plegado, sin estorbar",
       [nombres(p).length, $(p, "ajuste-filtro-fechas").open, $(p, "ajuste-desde").value, $(p, "ajuste-hasta").value], [2, false, "", ""]);

    llamadas = [];
    await fechar("ajuste-desde", "2026-10-21");
    ok("con una fecha vuelve a pedir, con `desde`", pedidosDeLista(), ["/ajuste/recibidas?estado=PENDIENTE&desde=2026-10-21"]);
    ok("y salen las dos, que llegaron ese dia", nombres(p).length, 2);

    llamadas = [];
    await fechar("ajuste-hasta", "2026-10-20");
    ok("un fin anterior al inicio no se pide: se dice",
       [pedidosDeLista(), texto($(p, "ajuste-fechas-error")), $(p, "ajuste-fechas-error").classList.contains("hidden")],
       [[], "La fecha de inicio no puede ser posterior a la de fin.", false]);
    ok("y la lista sigue como estaba", nombres(p).length, 2);

    await fechar("ajuste-hasta", "2026-10-21");
    ok("corregido, pide con las dos fechas y el aviso se va",
       [pedidosDeLista(), $(p, "ajuste-fechas-error").classList.contains("hidden")],
       [["/ajuste/recibidas?estado=PENDIENTE&desde=2026-10-21&hasta=2026-10-21"], true]);

    /* El filtro sigue a la persona de una pestaña a otra, como la busqueda. */
    await verPestana("CONFIRMADA");
    ok("al cambiar de pestaña el filtro sigue puesto",
       pedidosDeLista(), ["/ajuste/recibidas?estado=CONFIRMADA&desde=2026-10-21&hasta=2026-10-21"]);
    ok("y si en ese periodo no hay, lo dice con las fechas, no con el vacio de siempre",
       texto($(p, "ajuste-lista")), "No hay solicitudes de este estado en esas fechas.");

    llamadas = [];
    clic(p, $(p, "ajuste-fechas-quitar"));
    await pausa(250);
    ok("quitar el filtro vuelve a pedir sin fechas, y vuelven las confirmadas",
       [pedidosDeLista(), nombres(p), $(p, "ajuste-desde").value, $(p, "ajuste-hasta").value],
       [["/ajuste/recibidas?estado=CONFIRMADA"], ["Cotización 009-00851002"], "", ""]);

    llamadas = [];
    clic(p, $(p, "ajuste-fechas-quitar"));
    await pausa(100);
    ok("quitar lo que no hay no pide nada", pedidosDeLista(), []);

    /* `400 fechas invalidas`: no se ignora el filtro, se dice con el mensaje del backend. Con el selector de fechas no
       deberia llegar, pero si llega, la pantalla no enseña una lista que no es la de esas fechas. */
    forzar = (ruta) => (ruta.includes("desde=")
        ? respuesta({ status: "fechas invalidas", codigo: 2, msg: "desde y hasta son fechas AAAA-MM-DD que existen" }, 400) : null);
    await fechar("ajuste-desde", "2026-10-01");
    ok("`fechas invalidas`: lo dice con su mensaje, donde estan las fechas",
       [texto($(p, "ajuste-fechas-error")), $(p, "ajuste-fechas-error").classList.contains("hidden")],
       ["desde y hasta son fechas AAAA-MM-DD que existen", false]);
    ok("sin enseñar una lista que no es la de esas fechas, y sin el error de reintentar",
       [texto($(p, "ajuste-lista")), !!p.doc.querySelector("#ajuste-lista .cdk-estado button")],
       ["Corrige las fechas para ver las solicitudes.", false]);

    forzar = null;
    await fechar("ajuste-desde", "2026-10-19");
    ok("corregidas, el aviso se va y vuelve la lista (la pestaña es la de confirmadas, que llegaron el 19)",
       [$(p, "ajuste-fechas-error").classList.contains("hidden"), nombres(p)], [true, ["Cotización 009-00851002"]]);
    clic(p, $(p, "ajuste-fechas-quitar"));
    await pausa(250);

    /* ---- una pestaña lenta no pisa a la que se eligio despues */
    console.log("\n— una carga lenta no pisa a la siguiente —");
    preparar("ESPECIALISTA");
    demora = (ruta) => (ruta.includes("estado=PENDIENTE") ? 400 : 0);
    p = await montar("ajuste/ajuste_recibidas.html");
    clic(p, $(p, "pestana-CONFIRMADA"));
    await pausa(700);
    ok("queda lo de «Confirmadas», no lo de las pendientes que llego despues", nombres(p), ["Cotización 009-00851002"]);
    demora = null;

    /* ---- sin solicitudes */
    console.log("\n— sin solicitudes —");
    preparar("ESPECIALISTA", { marcas: [] });
    p = await montar("ajuste/ajuste_recibidas.html");
    await pausa(250);
    ok("lo dice, sin parecer un error", texto($(p, "ajuste-lista")), "No tienes solicitudes pendientes.");
    for (const [estado, frase] of [["CONFIRMADA", "Todavía no has confirmado ninguna solicitud."],
                                   ["RECHAZADA", "No has rechazado ninguna solicitud."],
                                   ["VENCIDA", "No tienes solicitudes vencidas."],
                                   ["CERRADA", "No tienes solicitudes cerradas."]]) {
        clic(p, $(p, "pestana-" + estado));
        await pausa(250);
        ok("y en cada pestaña, su frase: " + estado, texto($(p, "ajuste-lista")), frase);
    }

    console.log("\n— sin registrarse —");
    preparar("ESPECIALISTA");
    S.yaRegistrado = false;
    p = await montar("ajuste/ajuste_recibidas.html");
    await pausa(250);
    ok("explica que falta el registro", !!$(p, "ajuste-sin-alta"), true);
    ok("con el camino al formulario", p.doc.querySelector("#ajuste-sin-alta a").getAttribute("href"), "/autenticador.html");

    console.log("\n— un fallo del servidor —");
    preparar("ESPECIALISTA");
    forzar = (ruta) => (ruta.startsWith("/ajuste/recibidas") ? respuesta({ status: "error", msg: "se cayo" }, 500) : null);
    p = await montar("ajuste/ajuste_recibidas.html");
    await pausa(250);
    ok("se dice, con la posibilidad de reintentar", !!p.doc.querySelector("#ajuste-lista .cdk-estado"), true);
    forzar = null;

    /* ------------------------------------------------------- la jefatura */
    console.log("\n— una jefatura —");
    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_recibidas.html");
    await pausa(250);
    ok("recibe las suyas: sus marcas, y las sin dueño de su familia", nombres(p), ["Pedido 009-00774171", "Cotización 009-00969476"]);
    ok("con las lineas que le tocan", texto(p.doc.querySelectorAll("[data-solicitud]")[1]).includes("Líneas 3"), true);

    /* ============================================== ajustar una cotizacion */
    console.log("\n— una cotizacion —");
    preparar("ESPECIALISTA");
    const COT = idDe("009-00969476");
    llamadas = [];
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + COT);
    await pausa(250);

    ok("pide esa solicitud", llamadas.filter((l) => l.url.includes("/ajuste/solicitud")).map((l) => l.url.replace(/^.*\/v1/, "")),
       ["/ajuste/solicitud?id=" + COT]);
    ok("dice que es y de quien", [texto($(p, "ajuste-titulo")), texto($(p, "ajuste-cliente"))],
       ["Cotización 009-00969476", "DISTRIBUIDORA OK.COM S.A.C."]);
    ok("lo que escribio el vendedor", texto($(p, "ajuste-mensaje")), "El vendedor escribió: «una ajustadita por favor»");
    ok("y cuando vence", texto($(p, "ajuste-estado")).includes("vence el 24/10/2026"), true);

    /* ---- lo que hay que saber antes de ajustar */
    ok("avisa de que se quitan TODAS las promociones, con cuantas son",
       texto($(p, "ajuste-aviso-promos")).includes("TODAS las promociones") && texto($(p, "ajuste-aviso-promos")).includes("1 promoción"), true);
    ok("y que hay lineas de otras marcas que no se tocan", texto($(p, "ajuste-aviso-otras")).includes("5 líneas de otras marcas"), true);
    ok("que el ERP no cambia", texto($(p, "ajuste-aviso-erp")).includes("no cambia"), true);
    ok("en una cotizacion no avisa de que la cantidad no se toca", $(p, "ajuste-aviso-pedido"), null);

    /* ---- las lineas */
    ok("sus lineas, y solo las suyas", [...p.doc.querySelectorAll("#ajuste-lineas > li")].map((n) => n.id), ["linea-2", "linea-3"]);
    const l2 = $(p, "linea-2");
    ok("lo que hay hoy en la linea: cantidad, precio, descuento y total",
       valorDe(l2, "Hoy"), "2 × $ 168.50 − 2.5 % = $ 328.58");
    ok("el costo", valorDe(l2, "Costo"), "$ 152.00");
    ok("el stock, con el nombre del almacen", valorDe(l2, "Stock"), "62 · Principal");
    ok("y el margen que dice el backend", valorDe(l2, "Margen sin descuento"), "$ 16.50 · 10.86 % sobre costo");
    ok("sin nada que ajustar no se puede confirmar", [$(p, "ajuste-confirmar").disabled, texto($(p, "ajuste-resumen")).includes("Marca las líneas")], [true, true]);
    ok("los editores estan cerrados", $(p, "linea-2-editor").classList.contains("hidden"), true);

    /* ---- ajustar una linea: el precio y el % se mueven juntos */
    marcar(p, $(p, "linea-2-activa"), true);
    ok("al elegirla se abre el editor", $(p, "linea-2-editor").classList.contains("hidden"), false);
    ok("parte del precio de hoy", $(p, "linea-2-precio").value, "168.5");
    ok("con su % sobre costo", $(p, "linea-2-pct").value, "10.86");
    ok("y la ganancia por unidad, y por linea",
       texto($(p, "linea-2-calculo")), "Ganancia $ 16.50 por unidad · 10.86 % sobre costo · 9.79 % sobre venta · total de la línea $ 337.00");
    ok("dice lo que paga hoy el cliente (`precioNeto`, con sus decimales): con descuento",
       texto($(p, "linea-2-dscto")).includes("Hoy el cliente paga $ 164.2875 c/u (precio $ 168.50 con 2.5 % de descuento)"), true);
    ok("y que el descuento pasa a 0", texto($(p, "linea-2-dscto")).includes("el descuento pasa a 0"), true);
    ok("ya hay algo que ajustar", [$(p, "ajuste-confirmar").disabled, texto($(p, "ajuste-resumen"))], [false, "Vas a ajustar 1 de 2 líneas."]);

    escribir(p, $(p, "linea-2-precio"), "160");
    ok("al mover el precio se recalcula el %", $(p, "linea-2-pct").value, "5.26");
    ok("y la ganancia", texto($(p, "linea-2-calculo")).startsWith("Ganancia $ 8.00 por unidad · 5.26 % sobre costo · 5.00 % sobre venta"), true);

    escribir(p, $(p, "linea-2-pct"), "10");
    ok("al mover el % se recalcula el precio", $(p, "linea-2-precio").value, "167.2");
    escribir(p, $(p, "linea-2-pct"), "0");
    ok("0 % es el costo, y se puede", [$(p, "linea-2-precio").value, $(p, "linea-2-error").classList.contains("hidden")], ["152", true]);

    /* ---- por debajo del costo no se deja */
    escribir(p, $(p, "linea-2-precio"), "150");
    ok("por debajo del costo se dice", texto($(p, "linea-2-error")), "El precio no puede ser menor que el costo ($ 152.00).");
    ok("y no se deja confirmar", [$(p, "ajuste-confirmar").disabled, texto($(p, "ajuste-resumen"))],
       [true, "Corrige el precio de 1 línea para poder confirmar."]);
    escribir(p, $(p, "linea-2-precio"), "");
    ok("sin precio, tambien", [texto($(p, "linea-2-error")), $(p, "ajuste-confirmar").disabled], ["Escribe el precio.", true]);
    escribir(p, $(p, "linea-2-precio"), "152");
    ok("justo en el costo, bien", [$(p, "linea-2-error").classList.contains("hidden"), $(p, "ajuste-confirmar").disabled], [true, false]);

    /* ---- la cantidad, solo en cotizaciones */
    escribir(p, $(p, "linea-2-precio"), "160");
    escribir(p, $(p, "linea-2-cantidad"), "3");
    ok("la cantidad cambia el total de la linea", texto($(p, "linea-2-calculo")).endsWith("total de la línea $ 480.00"), true);

    /* ---- confirmar: solo lo ajustado viaja */
    $(p, "ajuste-observacion").value = "listo, precio especial por volumen";
    llamadas = [];
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);
    ok("pide confirmacion", modal(p).titulo, "¿Confirmar el ajuste?");
    ok("diciendo que el descuento pasa a 0", modal(p).mensaje.includes("el descuento pasa a 0"), true);
    ok("y que se quitan las promociones de todo el documento", modal(p).mensaje.includes("1 promoción de todo el documento"), true);
    ok("y que no se puede volver a tocar", modal(p).mensaje.includes("no podrás volver a tocar"), true);
    ok("hasta aqui no se ha mandado nada", posts(llamadas).length, 0);

    /* Arrepentirse a tiempo: cancelar no manda nada, y se puede volver a pedir. */
    clic(p, botonModal(p, "cancelar"));
    await pausa(60);
    ok("cancelar no manda nada", posts(llamadas).length, 0);
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);

    clic(p, botonModal(p, "confirmar"));
    await pausa(300);

    ok("manda solo la linea ajustada, con su precio y su cantidad",
       posts(llamadas), [{ ruta: "/ajuste/confirmar",
                           cuerpo: { id: COT, lineas: [{ item: 2, precio: 160, cantidad: 3 }], observacion: "listo, precio especial por volumen" } }]);
    ok("lo avisa", toasts(p.doc).some((t) => t.includes("Ajuste confirmado")), true);
    ok("y vuelve a pedir la solicitud", gets(llamadas, "/ajuste/solicitud"), 1);

    /* ---- despues: lo que quedo */
    ok("dice que se quitaron las promociones", texto($(p, "ajuste-promos-quitadas")), "Se quitaron 1 promoción del documento.");
    ok("y los totales nuevos de todo el documento", texto($(p, "ajuste-totales")).startsWith("Total del documento: $ 1,123.74 sin IGV"), true);
    ok("la solicitud esta confirmada", texto($(p, "ajuste-estado")), "Confirmada: el ajuste ya está en el documento.");
    ok("sin controles para volver a ajustar", [$(p, "ajuste-respuesta"), $(p, "linea-2-activa"), $(p, "ajuste-avisos")], [null, null, null]);
    ok("la linea ajustada dice como quedo",
       texto($(p, "linea-2-ajuste")), "Ajustada: 2 × $ 168.50 − 2.5 % → 3 × $ 160.00 sin descuento");
    ok("la que no se toco, que no tiene ajuste", texto($(p, "linea-3-ajuste")), "Sin ajuste.");
    ok("y lo que escribio", texto($(p, "ajuste-observacion-previa")), "Tu observación: «listo, precio especial por volumen»");

    /* ---- varias lineas, y una que se deja */
    console.log("\n— varias lineas —");
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    marcar(p, $(p, "linea-2-activa"), true);
    marcar(p, $(p, "linea-3-activa"), true);
    escribir(p, $(p, "linea-2-precio"), "165");
    escribir(p, $(p, "linea-3-precio"), "20");
    ok("dice cuantas de cuantas", texto($(p, "ajuste-resumen")), "Vas a ajustar 2 de 2 líneas.");

    marcar(p, $(p, "linea-3-activa"), false);
    ok("quitar una la deja fuera", texto($(p, "ajuste-resumen")), "Vas a ajustar 1 de 2 líneas.");

    marcar(p, $(p, "linea-3-activa"), true);
    escribir(p, $(p, "linea-3-precio"), "10");              // bajo el costo de 18.40
    ok("una mala impide confirmar aunque la otra este bien", $(p, "ajuste-confirmar").disabled, true);
    marcar(p, $(p, "linea-3-activa"), false);
    ok("y si se deja de ajustar, ya no estorba", $(p, "ajuste-confirmar").disabled, false);

    /* Sin tocar la cantidad no viaja. */
    llamadas = [];
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("la cantidad no viaja si no cambio, ni la observacion vacia",
       posts(llamadas).map((x) => x.cuerpo), [{ id: idDe("009-00969476"), lineas: [{ item: 2, precio: 165 }] }]);

    /* ============================================ un costo con cuatro decimales */
    console.log("\n— un costo con cuatro decimales (TDK: 18.4033, minimo 18.41) —");
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);

    ok("el costo se ve con sus decimales, y el minimo al lado: a dos decimales diria 18.40",
       valorDe($(p, "linea-3"), "Costo"), "$ 18.4033 · mínimo $ 18.41");
    ok("un costo de dos decimales no repite el minimo", valorDe($(p, "linea-2"), "Costo"), "$ 152.00");

    marcar(p, $(p, "linea-3-activa"), true);
    escribir(p, $(p, "linea-3-precio"), "18.40");
    ok("18.40 queda por debajo del costo real: no se deja, y el mensaje dice el costo y el minimo",
       [texto($(p, "linea-3-error")), $(p, "ajuste-confirmar").disabled],
       ["El precio no puede ser menor que el costo (costo $ 18.4033, mínimo $ 18.41).", true]);
    escribir(p, $(p, "linea-3-precio"), "18.41");
    ok("18.41, el minimo, se deja", [$(p, "linea-3-error").classList.contains("hidden"), $(p, "ajuste-confirmar").disabled], [true, false]);

    escribir(p, $(p, "linea-3-pct"), "0");
    ok("0 % sobre costo da 18.41 y no 18.40: sin quedar por debajo del minimo",
       [$(p, "linea-3-precio").value, $(p, "linea-3-error").classList.contains("hidden")], ["18.41", true]);
    escribir(p, $(p, "linea-3-pct"), "0.01");
    ok("y un % que ya lo supera redondea normal (18.4051 → 18.41)", $(p, "linea-3-precio").value, "18.41");
    escribir(p, $(p, "linea-3-pct"), "1");
    ok("y mas arriba tambien (18.5873 → 18.59)", $(p, "linea-3-precio").value, "18.59");

    escribir(p, $(p, "linea-3-precio"), "18.41");
    llamadas = [];
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("el backend lo acepta: viaja 18.41", posts(llamadas).map((x) => x.cuerpo), [{ id: idDe("009-00969476"), lineas: [{ item: 3, precio: 18.41 }] }]);

    /* ---- el precio se redondea al centimo, la mitad hacia arriba, ANTES de validar contra el minimo */
    console.log("\n— el precio se redondea al centimo —");
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    marcar(p, $(p, "linea-3-activa"), true);

    escribir(p, $(p, "linea-3-precio"), "18.405");
    ok("18.405 se guarda como 18.41, que es el minimo: se deja, y se dice como queda",
       [$(p, "linea-3-error").classList.contains("hidden"), $(p, "ajuste-confirmar").disabled, texto($(p, "linea-3-calculo")).startsWith("Se guarda como $ 18.41. Ganancia")],
       [true, false, true]);
    ok("lo que se escribio se respeta en el campo", $(p, "linea-3-precio").value, "18.405");

    escribir(p, $(p, "linea-3-precio"), "18.404");
    ok("18.404 se guarda como 18.40, que esta bajo el minimo: no se deja, y se dice como queda",
       [texto($(p, "linea-3-error")), $(p, "ajuste-confirmar").disabled, texto($(p, "linea-3-calculo")).startsWith("Se guarda como $ 18.40. Ganancia")],
       ["El precio no puede ser menor que el costo (costo $ 18.4033, mínimo $ 18.41).", true, true]);

    escribir(p, $(p, "linea-3-precio"), "18.41");
    ok("con dos decimales no hay nada que decir", texto($(p, "linea-3-calculo")).startsWith("Ganancia"), true);

    /* La linea 2 tiene un costo de dos decimales exactos (152): lo mismo, un centimo mas arriba. */
    marcar(p, $(p, "linea-3-activa"), false);
    marcar(p, $(p, "linea-2-activa"), true);
    escribir(p, $(p, "linea-2-precio"), "151.995");
    ok("151.995 sube a 152.00 (la mitad hacia arriba, aunque 151.995 × 100 no sea exacto) y es el costo: se deja",
       [$(p, "linea-2-error").classList.contains("hidden"), texto($(p, "linea-2-calculo")).startsWith("Se guarda como $ 152.00.")], [true, true]);
    escribir(p, $(p, "linea-2-precio"), "151.994");
    ok("151.994 baja a 151.99: bajo el costo", texto($(p, "linea-2-error")), "El precio no puede ser menor que el costo ($ 152.00).");
    escribir(p, $(p, "linea-2-precio"), "0.004");
    ok("un precio que redondea a 0 no es un precio", texto($(p, "linea-2-error")), "Escribe el precio.");
    /* El caso clasico: 1.005 × 100 da 100.49999999999999, y Math.round lo bajaria a 1.00. */
    escribir(p, $(p, "linea-2-precio"), "1.005");
    ok("1.005 se guarda como 1.01, no como 1.00 (el redondeo de siempre se equivoca con este)",
       texto($(p, "linea-2-calculo")).startsWith("Se guarda como $ 1.01. Ganancia"), true);

    /* Lo que viaja es lo que se guarda: el redondeado, no lo escrito. */
    marcar(p, $(p, "linea-2-activa"), false);
    marcar(p, $(p, "linea-3-activa"), true);
    escribir(p, $(p, "linea-3-precio"), "18.405");
    llamadas = [];
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("viaja el precio redondeado: 18.41", posts(llamadas).map((x) => x.cuerpo), [{ id: idDe("009-00969476"), lineas: [{ item: 3, precio: 18.41 }] }]);

    /* ======================================================== un pedido */
    console.log("\n— un pedido, en soles —");
    preparar("ESPECIALISTA");
    const PED = idDe("009-00774171");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + PED);
    await pausa(250);

    ok("dice que en un pedido solo se cambia el precio", !!$(p, "ajuste-aviso-pedido"), true);
    ok("sin promociones, no avisa de ellas", $(p, "ajuste-aviso-promos"), null);
    ok("los importes en soles", valorDe($(p, "linea-1"), "Hoy"), "4 × S/ 603.00 = S/ 2,412.00");
    ok("y el costo, en soles tambien", valorDe($(p, "linea-1"), "Costo"), "S/ 518.32");

    marcar(p, $(p, "linea-1-activa"), true);
    ok("sin campo de cantidad", $(p, "linea-1-cantidad"), null);
    escribir(p, $(p, "linea-1-precio"), "500");
    ok("el minimo es el costo en soles", texto($(p, "linea-1-error")), "El precio no puede ser menor que el costo (S/ 518.32).");
    escribir(p, $(p, "linea-1-precio"), "560");

    llamadas = [];
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);
    ok("sin promociones, no habla de ellas al confirmar", modal(p).mensaje.includes("promoci"), false);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("manda solo el precio: la cantidad no se toca", posts(llamadas).map((x) => x.cuerpo), [{ id: PED, lineas: [{ item: 1, precio: 560 }] }]);

    /* ======================================================== rechazar */
    console.log("\n— rechazar —");
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    llamadas = [];

    clic(p, $(p, "ajuste-rechazar"));
    await pausa(40);
    ok("sin observacion, no se rechaza", [posts(llamadas).length, !!p.doc.querySelector(".cdk-modal__titulo")], [0, false]);
    ok("y se explica", [$(p, "ajuste-observacion-error").classList.contains("hidden"), texto($(p, "ajuste-observacion-error")).includes("por qué")], [false, true]);

    escribir(p, $(p, "ajuste-observacion"), "   ");
    clic(p, $(p, "ajuste-rechazar"));
    ok("espacios no son una observacion", posts(llamadas).length, 0);

    escribir(p, $(p, "ajuste-observacion"), "el cliente tiene que llevar al menos 50 unidades");
    ok("al escribir, desaparece el aviso", $(p, "ajuste-observacion-error").classList.contains("hidden"), true);
    clic(p, $(p, "ajuste-rechazar"));
    await pausa(60);
    ok("pide confirmacion, diciendo que el documento no cambia", [modal(p).titulo, modal(p).mensaje.includes("El documento no cambia")],
       ["¿Rechazar la solicitud?", true]);
    clic(p, botonModal(p, "cancelar"));
    await pausa(60);
    ok("cancelar no manda nada", posts(llamadas).length, 0);

    clic(p, $(p, "ajuste-rechazar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("rechaza con su observacion", posts(llamadas), [{ ruta: "/ajuste/rechazar",
        cuerpo: { id: idDe("009-00969476"), observacion: "el cliente tiene que llevar al menos 50 unidades" } }]);
    ok("queda rechazada", texto($(p, "ajuste-estado")), "Rechazada: el documento no cambió.");
    ok("sin controles", $(p, "ajuste-respuesta"), null);
    ok("y sin cambios en el documento", ajusteSim.estado.documentos["COT 009-00969476"].promociones, 1);

    /* Se puede rechazar aunque las lineas esten a medias o mal. */
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    marcar(p, $(p, "linea-2-activa"), true);
    escribir(p, $(p, "linea-2-precio"), "1");
    escribir(p, $(p, "ajuste-observacion"), "no se puede");
    ok("con una linea mal, confirmar esta cerrado y rechazar abierto", [$(p, "ajuste-confirmar").disabled, $(p, "ajuste-rechazar").disabled], [true, false]);

    /* ============================================ la pantalla ya no esta al dia */
    console.log("\n— la pantalla ya no esta al dia —");
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    marcar(p, $(p, "linea-2-activa"), true);
    escribir(p, $(p, "linea-2-precio"), "160");

    /* Mientras la miraba, el documento se aprobo. */
    ajusteSim.estado.documentos["COT 009-00969476"].abierto = false;
    llamadas = [];
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("`documento no ajustable`: lo dice con su mensaje", toasts(p.doc).some((t) => t.includes("el documento ya avanzo")), true);
    ok("vuelve a pedir todo", gets(llamadas, "/ajuste/solicitud"), 1);
    ok("y la solicitud ya esta cerrada, sin controles", [texto($(p, "ajuste-estado")), $(p, "ajuste-respuesta")],
       ["Cerrada: el documento avanzó antes de que se respondiera.", null]);

    /* Alguien respondio antes. */
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    marcar(p, $(p, "linea-2-activa"), true);
    forzar = (ruta) => (ruta === "/ajuste/confirmar"
        ? respuesta({ status: "solicitud cerrada", codigo: 3, msg: "esa solicitud ya fue respondida" }, 409) : null);
    llamadas = [];
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("`solicitud cerrada`: lo dice", toasts(p.doc).some((t) => t.includes("ya fue respondida")), true);
    ok("y vuelve a pedir todo", gets(llamadas, "/ajuste/solicitud"), 1);
    forzar = null;

    /* El costo cambio y el precio ya no alcanza: se corrige aqui, sin perder lo escrito. */
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    marcar(p, $(p, "linea-2-activa"), true);
    escribir(p, $(p, "linea-2-precio"), "160");
    forzar = (ruta) => (ruta === "/ajuste/confirmar"
        ? respuesta({ status: "precio bajo costo", codigo: 3, msg: "el precio no puede ser menor que el costo actual" }, 409) : null);
    llamadas = [];
    clic(p, $(p, "ajuste-confirmar"));
    await pausa(60);
    clic(p, botonModal(p, "confirmar"));
    await pausa(300);
    ok("`precio bajo costo`: su mensaje", toasts(p.doc).some((t) => t.includes("menor que el costo actual")), true);
    ok("no repinta: lo escrito se conserva", [$(p, "linea-2-precio").value, gets(llamadas, "/ajuste/solicitud")], ["160", 0]);
    ok("y el boton vuelve a servir", $(p, "ajuste-confirmar").disabled, false);
    forzar = null;

    /* =============================================== lo que ya se respondio */
    console.log("\n— solicitudes ya respondidas —");
    preparar("ESPECIALISTA");
    const historial = (estado) => ajusteSim.recibidas({ estado }).cuerpo.data.solicitudes[0].id;

    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + historial("CONFIRMADA"));
    await pausa(250);
    ok("una confirmada: lo que quedo, sin controles",
       [texto($(p, "ajuste-estado")), $(p, "ajuste-respuesta"), texto(p.doc.querySelector("[id$='-ajuste']")).startsWith("Ajustada:")],
       ["Confirmada: el ajuste ya está en el documento.", null, true]);
    ok("y su observacion", texto($(p, "ajuste-observacion-previa")), "Tu observación: «listo, precio especial por volumen»");

    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + historial("RECHAZADA"));
    await pausa(250);
    ok("una rechazada", [texto($(p, "ajuste-estado")), texto($(p, "ajuste-observacion-previa")).includes("al menos 50 unidades")],
       ["Rechazada: el documento no cambió.", true]);

    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + historial("VENCIDA"));
    await pausa(250);
    ok("una vencida", texto($(p, "ajuste-estado")), "Venció: pasaron 3 días sin respuesta.");

    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + historial("CERRADA"));
    await pausa(250);
    ok("una cerrada", [texto($(p, "ajuste-estado")), $(p, "ajuste-respuesta")], ["Cerrada: el documento avanzó antes de que se respondiera.", null]);

    /* Desde el 21/10 el backend cierra la pendiente cuyo documento avanzo EN CUANTO ALGUIEN LA LEE: no llega pendiente. */
    preparar("ESPECIALISTA");
    ajusteSim.estado.documentos["COT 009-00969476"].abierto = false;
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    ok("pendiente con el documento ya avanzado: llega CERRADA, y asi se dice",
       texto($(p, "ajuste-estado")), "Cerrada: el documento avanzó antes de que se respondiera.");
    ok("y no ofrece ajustar", [$(p, "ajuste-respuesta"), $(p, "linea-2-activa")], [null, null]);

    /* Por si acaso: una PENDIENTE que llegara con `puedoAjustar: false` no se podria responder, y se dice. */
    preparar("ESPECIALISTA");
    alterar = (camino, cuerpo, r) => {
        if (camino === "/ajuste/solicitud" && r.cuerpo.data) { r.cuerpo.data.estado = "PENDIENTE"; r.cuerpo.data.puedoAjustar = false; }
        return r;
    };
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    ok("una pendiente sin poder ajustarse: dice que ya no se puede",
       texto($(p, "ajuste-estado")), "El documento ya avanzó (aprobado, facturado o anulado): ya no se puede ajustar.");
    ok("y no ofrece ajustar, por si acaso", [$(p, "ajuste-respuesta"), $(p, "linea-2-activa")], [null, null]);
    alterar = null;

    /* ================================================== nada se calcula aqui */
    console.log("\n— lo que dice el backend no se recalcula —");
    preparar("ESPECIALISTA");
    alterar = (camino, cuerpo, r) => {
        if (camino === "/ajuste/solicitud" && r.cuerpo.data) {
            r.cuerpo.data.lineas[0].margen = { monto: 9.99, sobreCosto: 12.34, sobreVenta: 5.55 };
            r.cuerpo.data.lineas[0].stock = 777;
        }
        return r;
    };
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    /* Los numeros no cuadran a proposito: si la pantalla los recalculara de hoy, saldrian otros. */
    ok("el margen de hoy es el que llega", valorDe($(p, "linea-2"), "Margen sin descuento"), "$ 9.99 · 12.34 % sobre costo");
    ok("y el stock", valorDe($(p, "linea-2"), "Stock"), "777 · Principal");

    /* `precioNeto` tambien es del backend: si no cuadra con total / cantidad, manda el suyo. */
    alterar = (camino, cuerpo, r) => {
        if (camino === "/ajuste/solicitud" && r.cuerpo.data) r.cuerpo.data.lineas[0].actual.precioNeto = 150.1234;
        return r;
    };
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    marcar(p, $(p, "linea-2-activa"), true);
    ok("lo que paga hoy el cliente es el `precioNeto` que llega", texto($(p, "linea-2-dscto")).includes("Hoy el cliente paga $ 150.1234 c/u"), true);

    /* Sin `precioNeto` —un backend que aun no lo manda— se saca del total de la linea. */
    alterar = (camino, cuerpo, r) => {
        if (camino === "/ajuste/solicitud" && r.cuerpo.data) delete r.cuerpo.data.lineas[0].actual.precioNeto;
        return r;
    };
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    marcar(p, $(p, "linea-2-activa"), true);
    ok("sin `precioNeto`, total / cantidad", texto($(p, "linea-2-dscto")).includes("Hoy el cliente paga $ 164.29 c/u"), true);
    alterar = null;

    /* ============================================================ la jefatura */
    console.log("\n— una jefatura —");
    preparar("JEFATURA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=" + idDe("009-00969476"));
    await pausa(250);
    ok("ve las lineas de sus marcas y las sin dueño de su familia",
       [...p.doc.querySelectorAll("#ajuste-lineas > li")].map((n) => n.id), ["linea-1", "linea-3", "linea-6"]);
    ok("y las que no son suyas, aparte", texto($(p, "ajuste-aviso-otras")).includes("4 líneas de otras marcas"), true);

    /* ====================================================== lo que no existe */
    console.log("\n— lo que no existe —");
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_solicitud.html", "?id=9999");
    await pausa(250);
    ok("una solicitud que no es suya o no existe", [!!$(p, "ajuste-no-existe"), !!$(p, "ajuste-volver")], [true, true]);
    ok("con el camino de vuelta", $(p, "ajuste-volver").getAttribute("href"), "/ajuste/ajuste_recibidas.html");

    llamadas = [];
    p = await montar("ajuste/ajuste_solicitud.html");
    await pausa(150);
    ok("sin id no pide nada, y lo dice", [gets(llamadas, "/ajuste/solicitud"), texto($(p, "ajuste-no-existe")).includes("qué solicitud abrir")], [0, true]);

    preparar("ESPECIALISTA");
    S.yaRegistrado = false;
    p = await montar("ajuste/ajuste_solicitud.html", "?id=1");
    await pausa(250);
    ok("sin registrarse, el camino al formulario", p.doc.querySelector("#ajuste-sin-alta a").getAttribute("href"), "/autenticador.html");

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
