/**
 * Prueba de integracion del ajuste de precios, lado del VENDEDOR (grupo 20), sobre
 * las paginas reales.
 *
 * Lo que mas importa:
 *
 *   · que se elija el documento de una lista, y no se teclee su numero
 *   · que el paso 2 diga ANTES de enviar lo que no se deshace solo —el documento pierde TODAS
 *     sus promociones si lo confirman, y queda bloqueado mientras esté pendiente— y, con la
 *     vista previa, a quien ira cada linea y **cuales no se enviaran a nadie**
 *   · que el asistente siga funcionando aunque el backend aun no tenga la vista previa
 *   · que cada motivo por el que el backend no deja enviar se diga en el paso 2, antes de
 *     escribir el mensaje
 *   · que "Mis ajustes" tenga una pestaña por estado, y que cada solicitud diga que le
 *     pasa al documento y lo que respondio quien la recibio
 *   · que cada punta quede en lo suyo: pedir ajuste no vive dentro de cotizacion ni de pedido
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
let accesosHub;              // lo que responde GET /ajuste

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
            status: "ok", codigo: 0, data: { ajuste: "Ajuste de precio de cotizaciones y pedidos" },
            nombre: "CRISTOPHER GONZALES", grupo: "VENTAS-EJECUTIVOS", tipo: S.rol, tipoCambio: 3.75
        });
    }

    if (camino === "/ajuste") return respuesta({ status: "ok", codigo: 0, data: accesosHub || ["enviar", "enviadas"] });

    let r = null;
    if (camino === "/ajuste/previa") r = ajusteSim.previa(cuerpo);
    else if (camino === "/lista/cotis") r = ajusteSim.listaCotizaciones();
    else if (camino === "/lista/pedidos") r = ajusteSim.listaPedidos();
    else if (camino === "/ajuste/enviar") r = ajusteSim.enviar(cuerpo);
    else if (camino === "/ajuste/enviadas") r = ajusteSim.enviadas({ estado: params.get("estado"), ndocu: params.get("ndocu"), desde: params.get("desde"), hasta: params.get("hasta") });

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
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
const enviar = (p, f) => f.dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
const posts = (ls) => ls.filter((l) => l.metodo === "POST").map((l) => ({ ruta: l.url.replace(/^.*\/v1/, ""), cuerpo: l.cuerpo }));
const sinNbsp = (t) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);

const $ = (p, id) => p.doc.getElementById(id);
const titulos = (p) => [...p.doc.querySelectorAll("#cdk-acciones .cdk-tarjeta__titulo")].map((n) => n.textContent);
const nombres = (p) => [...p.doc.querySelectorAll("#ajuste-solicitudes .cdk-articulo__cabecera .cdk-articulo__nombre")].map((n) => n.textContent.trim());
const filas = (p) => [...p.doc.querySelectorAll("[data-solicitud]")];
const pedidosDeLista = () => llamadas.filter((l) => l.url.includes("/ajuste/enviadas")).map((l) => l.url.replace(/^.*\/v1/, ""));

const modal = (p) => ({
    titulo: texto(p.doc.querySelector(".cdk-modal__titulo")),
    mensaje: texto(p.doc.querySelector(".cdk-modal__mensaje"))
});
const botonModal = (p, cual) => {
    const b = p.doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    return cual === "confirmar" ? b[b.length - 1] : b[0];
};

/** El valor de una medida dentro de un nodo (`Antes`, `Ahora`), por su etiqueta. */
const valorDe = (nodo, etiqueta) => {
    const m = [...nodo.querySelectorAll(".cdk-medida")]
        .find((x) => x.querySelector(".cdk-medida__etiqueta").textContent === etiqueta);
    return m ? texto(m.querySelector(".cdk-medida__valor")) : null;
};

/** El vendedor 246 del grupo 20, con TDK y EP_IMPRESORAS en manos de 233: lo que envie llega a tres responsables. */
function preparar(rol) {
    marcasSim.reiniciar(rol || "COBERTURA");
    forzar = null; accesosHub = undefined;

    marcasSim.buscarMarca("0002").dueno = "233";
    marcasSim.buscarMarca("0206").dueno = "233";
    S.confirmados["233"] = true;

    ajusteSim.reiniciar();
}

/** Lo que `Mis ajustes` debe contar de un estado, segun el simulacro. */
const delBackend = (estado) => ajusteSim.enviadas({ estado }).cuerpo.data.solicitudes;

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Ajuste de precios · vendedor (grupo 20) ===\n");

    /* ================================================================ el hub */
    console.log("— el hub —");
    preparar();
    let p = await montar("ajuste.html");
    await pausa(200);
    ok("carga sin errores", fallos, 0);
    ok("el vendedor ve «Pedir ajuste» y «Mis ajustes»", titulos(p), ["Pedir ajuste", "Mis ajustes"]);
    ok("que llevan a sus pantallas", [...p.doc.querySelectorAll("#cdk-acciones a")].map((a) => a.getAttribute("href")),
       ["/ajuste/ajuste_enviar.html", "/ajuste/ajuste_enviadas.html"]);
    ok("sin avisos de permisos sin declarar", p.avisos.some((a) => a.includes("sin declarar")), false);

    /* ============================================================ mis ajustes */
    console.log("\n— mis ajustes —");
    preparar();
    llamadas = [];
    p = await montar("ajuste/ajuste_enviadas.html");
    await pausa(250);

    ok("pide solo las pendientes", pedidosDeLista(), ["/ajuste/enviadas?estado=PENDIENTE"]);
    ok("una pestaña por estado", [...p.doc.querySelectorAll("#ajuste-pestanas .cdk-pestana")].map((b) => b.textContent),
       ["Pendientes", "Confirmadas", "Rechazadas", "Vencidas", "Cerradas"]);
    ok("el enlace a pedir uno", $(p, "ajuste-pedir").getAttribute("href"), "/ajuste/ajuste_enviar.html");

    /* La cotizacion llevaba marcas de tres responsables: cada uno responde por su lado. */
    ok("una solicitud por responsable", nombres(p), ["Cotización 009-00969476", "Cotización 009-00969476", "Cotización 009-00969476"]);
    ok("diciendo a quien se envio, sin repetir a nadie",
       filas(p).map((f) => ["COSSIO JOANNA", "SAMUEL HUARANCCA", "SAUÑE MANUEL"].find((n) => texto(f).includes("Para " + n))).sort(),
       ["COSSIO JOANNA", "SAMUEL HUARANCCA", "SAUÑE MANUEL"]);

    const fila0 = filas(p)[0];
    const id0 = fila0.getAttribute("data-solicitud");
    ok("el cliente y lo que escribio", [texto(fila0).includes("DISTRIBUIDORA OK.COM S.A.C."), texto(fila0).includes("Escribiste: «una ajustadita por favor»")], [true, true]);
    ok("cuando vence", texto(fila0).includes("Vence 24/10/2026"), true);
    ok("y que esta pendiente", texto(fila0).includes("Pendiente"), true);
    ok("dice que mientras no puede modificar el documento",
       texto($(p, "solicitud-" + id0 + "-nota")).startsWith("Mientras esté pendiente no puedes modificar el documento."), true);

    /* ---- las lineas, plegadas */
    const lineas0 = fila0.querySelector("details");
    ok("las lineas van plegadas", [!!lineas0, lineas0.open], [true, false]);
    ok("diciendo cuantas", texto(lineas0.querySelector("summary")).startsWith("Ver "), true);
    const l0 = lineas0.querySelector(".cdk-linea-ajuste");
    ok("cada una dice como estaba", valorDe(l0, "Antes").includes("×"), true);
    ok("y que sigue igual, porque aun no responden", valorDe(l0, "Ahora"), "Sin cambios");

    /* ---- buscar */
    escribir(p, $(p, "ajuste-buscar"), "huarancca");
    ok("buscar por responsable", filas(p).length, 1);
    escribir(p, $(p, "ajuste-buscar"), "ok.com");
    ok("o por cliente", filas(p).length, 3);
    escribir(p, $(p, "ajuste-buscar"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "ajuste-lista")).includes("Ninguna solicitud coincide"), true);
    escribir(p, $(p, "ajuste-buscar"), "");

    /* ---- una pestaña por estado */
    const verPestana = async (estado) => { llamadas = []; clic(p, $(p, "pestana-" + estado)); await pausa(250); };

    /* ---- filtrar por fecha de envio: lo mismo que en las recibidas, que es el mismo componente */
    llamadas = [];
    $(p, "ajuste-desde").value = "2026-10-22";
    $(p, "ajuste-desde").dispatchEvent(new p.w.Event("change", { bubbles: true }));
    await pausa(250);
    ok("el filtro pide a `enviadas` con la fecha, y el backend la aplica", pedidosDeLista(), ["/ajuste/enviadas?estado=PENDIENTE&desde=2026-10-22"]);
    ok("sin nada en esas fechas lo dice", texto($(p, "ajuste-lista")), "No hay solicitudes de este estado en esas fechas.");
    clic(p, $(p, "ajuste-fechas-quitar"));
    await pausa(250);
    ok("quitarlo devuelve lo de siempre", filas(p).length, 3);

    await verPestana("CONFIRMADA");
    ok("cada pestaña pide solo su estado", pedidosDeLista(), ["/ajuste/enviadas?estado=CONFIRMADA"]);
    ok("las confirmadas, una por responsable", nombres(p), ["Cotización 009-00851002", "Cotización 009-00851002", "Cotización 009-00851002"]);
    const conf = filas(p)[0];
    const idConf = conf.getAttribute("data-solicitud");
    ok("dicen que es del documento: precio nuevo y sin promociones",
       texto($(p, "solicitud-" + idConf + "-nota")), "Confirmada: los precios nuevos ya están en el documento y se quitaron todas sus promociones.");
    ok("traen lo que respondio el responsable",
       texto($(p, "solicitud-" + idConf + "-observacion")).includes("«listo, precio especial por volumen»"), true);
    ok("y nombran a quien lo dijo", texto($(p, "solicitud-" + idConf + "-observacion")).startsWith("Respuesta de "), true);
    ok("una ya respondida dice cuando, no cuando vence", [texto(conf).includes("Respondida"), texto(conf).includes("Vence")], [true, false]);

    /* La linea ajustada: lo que habia y lo que quedo, sin descuento. */
    const esperada = delBackend("CONFIRMADA").find((s) => String(s.id) === idConf).lineas[0];
    const lc = conf.querySelector(".cdk-linea-ajuste");
    ok("la linea ajustada dice como estaba",
       valorDe(lc, "Antes"), `${esperada.antes.cantidad} × $ ${esperada.antes.precio.toFixed(2)}`);
    ok("y como quedo, sin descuento",
       valorDe(lc, "Ahora"), `${esperada.despues.cantidad} × $ ${esperada.despues.precio.toFixed(2)} (sin descuento)`);

    await verPestana("RECHAZADA");
    ok("las rechazadas, con lo que se le dijo y que el documento no cambio",
       [nombres(p).length, texto(filas(p)[0]).includes("«el cliente tiene que llevar al menos 50 unidades»"),
        texto(filas(p)[0]).includes("Rechazada: el documento no cambió.")], [3, true, true]);

    await verPestana("VENCIDA");
    ok("las vencidas, que se libero el documento",
       [nombres(p).length, texto(filas(p)[0]).includes("Venció sin respuesta: el documento se liberó.")], [3, true]);

    await verPestana("CERRADA");
    ok("las cerradas, que el documento avanzo",
       [nombres(p).length, texto(filas(p)[0]).includes("el documento avanzó (se aprobó, facturó o anuló)")], [3, true]);

    /* ---- un documento con dos respuestas distintas */
    console.log("\n— cada responsable responde por su lado —");
    preparar();
    const pendientes = ajusteSim.enviadas({ estado: "PENDIENTE" }).cuerpo.data.solicitudes;
    ajusteSim.estado.solicitudes.find((s) => s.id === pendientes[0].id).estado = "CONFIRMADA";
    ajusteSim.estado.solicitudes.find((s) => s.id === pendientes[1].id).estado = "RECHAZADA";
    p = await montar("ajuste/ajuste_enviadas.html");
    await pausa(250);
    ok("una sigue pendiente", filas(p).length, 1);
    await verPestana("CONFIRMADA");
    ok("otra la confirmaron, entre las demas confirmadas", filas(p).some((f) => f.getAttribute("data-solicitud") === String(pendientes[0].id)), true);
    await verPestana("RECHAZADA");
    ok("y otra la rechazaron", filas(p).some((f) => f.getAttribute("data-solicitud") === String(pendientes[1].id)), true);

    /* ---- sin solicitudes */
    console.log("\n— sin solicitudes —");
    preparar();
    ajusteSim.estado.solicitudes.length = 0;
    p = await montar("ajuste/ajuste_enviadas.html");
    await pausa(250);
    ok("lo dice, sin parecer un error", texto($(p, "ajuste-lista")), "No tienes ajustes pendientes.");
    for (const [estado, frase] of [["CONFIRMADA", "Todavía no te han confirmado ningún ajuste."],
                                   ["RECHAZADA", "No te han rechazado ningún ajuste."],
                                   ["VENCIDA", "No tienes ajustes vencidos."],
                                   ["CERRADA", "No tienes ajustes cerrados."]]) {
        await verPestana(estado);
        ok("y en cada pestaña, su frase: " + estado, texto($(p, "ajuste-lista")), frase);
    }

    console.log("\n— un fallo del servidor —");
    preparar();
    forzar = (ruta) => (ruta.startsWith("/ajuste/enviadas") ? respuesta({ status: "error", msg: "se cayo" }, 500) : null);
    p = await montar("ajuste/ajuste_enviadas.html");
    await pausa(250);
    ok("un fallo del servidor se dice, con la posibilidad de reintentar", !!p.doc.querySelector("#ajuste-lista .cdk-estado"), true);
    forzar = null;

    console.log("\n— de la otra punta —");
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_enviadas.html");
    await pausa(250);
    ok("quien es del grupo 25 no ve los ajustes del vendedor: `sin permiso`",
       texto($(p, "ajuste-lista")).includes("otro grupo"), true);

    /* ================================================== pedir ajuste: el asistente */
    const pasoActual = (p) => [...p.doc.querySelectorAll("#ajuste-pasos .cdk-pasos__paso")].map((s) =>
        s.classList.contains("cdk-pasos__paso--actual") ? "actual" : s.classList.contains("cdk-pasos__paso--hecho") ? "hecho" : "pendiente");
    const pedidos = (ruta) => llamadas.filter((l) => l.url.includes(ruta)).length;
    const documentos = (p) => [...p.doc.querySelectorAll("#ajuste-cotizaciones li[data-ndocu]")].map((l) => l.getAttribute("data-ndocu"));
    const elegirDoc = async (p, ndocu) => {
        clic(p, p.doc.querySelector(`li[data-ndocu='${ndocu}'] button`));
        await pausa(250);
    };
    const escribirManual = async (p, tipo, numero) => {
        if (!$(p, "ajuste-manual")) clic(p, $(p, "ajuste-manual-abrir"));
        $(p, "ajuste-tipo").value = tipo;
        escribir(p, $(p, "ajuste-ndocu"), numero);
        enviar(p, $(p, "ajuste-manual"));
        await pausa(250);
    };

    console.log("\n— paso 1: elegir el documento —");
    preparar();
    llamadas = [];
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);

    ok("carga sin errores", fallos, 0);
    ok("el indicador: va por el primero", pasoActual(p), ["actual", "pendiente", "pendiente"]);
    ok("pide las dos listas, una vez cada una", [pedidos("/lista/cotis"), pedidos("/lista/pedidos")], [1, 1]);
    /* Solo las abiertas y sin aprobar, cotizaciones y pedidos, lo mas reciente primero: la cotizacion de FERRETERIA CENTRAL
       (009-00968800) esta aprobada y los pedidos 009-00774194 y 009-00849011 tambien, y no salen. */
    ok("salen las abiertas, no las aprobadas, cotizaciones y pedidos juntos", documentos(p),
       ["009-00775010", "009-00970222", "009-00970001", "009-00851002", "009-00851377", "009-00850190", "009-00969476"]);

    const tarjetaLima = p.doc.querySelector("li[data-ndocu='009-00970001']");
    ok("cada una dice el cliente, el numero con su serie, la fecha y el total",
       [texto(tarjetaLima).includes("CORPORACION LIMA SUR S.A.C."), texto(tarjetaLima).includes("Cotización 009-00970001 · 20/10/2026"),
        texto(tarjetaLima).includes("$ 1,002.88")], [true, true, true]);
    const tarjetaPedido = p.doc.querySelector("li[data-ndocu='009-00775010']");
    ok("un pedido sin aprobar sale igual, y dice que es un pedido",
       [texto(tarjetaPedido).includes("ABASTECEDORA DEL SUR S.A.C."), texto(tarjetaPedido).includes("Pedido 009-00775010 · 21/10/2026")], [true, true]);
    ok("la cotizacion, que es una cotizacion", texto(p.doc.querySelector("li[data-ndocu='009-00851002']")).includes("Cotización 009-00851002"), true);
    ok("nadie escribe un numero para llegar aqui", $(p, "ajuste-manual"), null);

    escribir(p, $(p, "ajuste-buscar-doc"), "lima");
    ok("buscar por cliente", documentos(p), ["009-00970001"]);
    escribir(p, $(p, "ajuste-buscar-doc"), "abastecedora");
    ok("el cliente de un pedido tambien se busca", documentos(p), ["009-00775010"]);
    escribir(p, $(p, "ajuste-buscar-doc"), "850190");
    ok("o por numero", documentos(p), ["009-00850190"]);
    escribir(p, $(p, "ajuste-buscar-doc"), "zzz");
    ok("sin coincidencias, lo dice", texto($(p, "ajuste-documentos")).includes("Ningún documento coincide"), true);
    escribir(p, $(p, "ajuste-buscar-doc"), "");

    /* ---- escribir el numero: lo que no sale en la lista */
    ok("queda siempre la salida de escribir el numero", texto($(p, "ajuste-manual-abrir")).startsWith("¿No lo ves?"), true);
    clic(p, $(p, "ajuste-manual-abrir"));
    ok("se abre el formulario: cotizacion o pedido", [...$(p, "ajuste-tipo").options].map((o) => o.textContent), ["Cotización", "Pedido"]);
    ok("pide la serie", texto($(p, "ajuste-manual")).includes("Sin la serie, el número es ambiguo"), true);
    clic(p, $(p, "ajuste-manual-abrir"));
    ok("tocar otra vez lo cierra", $(p, "ajuste-manual"), null);

    clic(p, $(p, "ajuste-manual-abrir"));
    llamadas = [];
    enviar(p, $(p, "ajuste-manual"));
    ok("sin numero no sigue ni pregunta nada", [pedidos("/ajuste/previa"), !!$(p, "ajuste-paso-revisa")], [0, false]);
    ok("y lo dice", texto($(p, "ajuste-manual-error")), "Escribe el número del documento, con su serie.");

    console.log("\n— sin documentos abiertos, o sin poder pedir las listas —");
    preparar();
    forzar = (ruta) => (ruta === "/lista/cotis" || ruta === "/lista/pedidos" ? respuesta({}) : null);
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    ok("sin cotizaciones ni pedidos abiertos, lo dice", texto($(p, "ajuste-documentos")), "No tienes cotizaciones ni pedidos abiertos.");
    ok("y se puede escribir el numero", !!$(p, "ajuste-manual-abrir"), true);

    /* Solo pedidos: tambien es una lista, no un vacio. */
    forzar = (ruta) => (ruta === "/lista/cotis" ? respuesta({}) : null);
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    ok("sin cotizaciones pero con pedidos, salen los pedidos", documentos(p), ["009-00775010", "009-00851377"]);

    forzar = (ruta) => (ruta === "/lista/cotis" ? respuesta({ status: "error", msg: "se cayo" }, 500) : null);
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    ok("si la lista de cotizaciones falla se dice, con la posibilidad de reintentar", !!p.doc.querySelector("#ajuste-documentos .cdk-estado"), true);
    ok("y no se pintan los pedidos a medias: una lista incompleta haria creer que no hay mas", documentos(p), []);
    ok("y no se pierde nada: se puede escribir el numero", !!$(p, "ajuste-manual-abrir"), true);

    forzar = (ruta) => (ruta === "/lista/pedidos" ? respuesta({ status: "error", msg: "se cayo" }, 500) : null);
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    ok("si falla la de pedidos, igual: se dice, y no salen solo las cotizaciones",
       [!!p.doc.querySelector("#ajuste-documentos .cdk-estado"), documentos(p)], [true, []]);

    /* Reintentar pide las dos de nuevo, y ya con la red buena salen todas. */
    forzar = null;
    llamadas = [];
    clic(p, p.doc.querySelector("#ajuste-documentos .cdk-estado button"));
    await pausa(250);
    ok("reintentar pide las dos listas y las pinta", [pedidos("/lista/cotis"), pedidos("/lista/pedidos"), documentos(p).length], [1, 1, 7]);
    forzar = null;

    /* ---------------------------------------------------- paso 2: la vista previa */
    console.log("\n— paso 2: lo que se enviara —");
    preparar();
    llamadas = [];
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    await elegirDoc(p, "009-00970001");

    ok("pide la vista previa de ese documento",
       llamadas.filter((l) => l.url.includes("/ajuste/previa")).map((l) => l.cuerpo), [{ tipo: "COT", ndocu: "009-00970001" }]);
    ok("el indicador: el primero hecho, va por el segundo", pasoActual(p), ["hecho", "actual", "pendiente"]);
    ok("mirar no envia nada", [posts(llamadas).filter((x) => x.ruta === "/ajuste/enviar").length,
        ajusteSim.enviadas({ estado: "PENDIENTE" }).cuerpo.data.solicitudes.length], [0, 3]);

    ok("el documento: cual es, de quien, y lo que ya se sabia de la lista",
       [texto($(p, "ajuste-resumen-titulo")), texto($(p, "ajuste-resumen-doc")).includes("CORPORACION LIMA SUR S.A.C."),
        texto($(p, "ajuste-resumen-doc")).includes("Fecha20/10/2026"), texto($(p, "ajuste-resumen-doc")).includes("Total con IGV$ 1,002.88")],
       ["Cotización 009-00970001", true, true, true]);
    ok("cuantas lineas tiene, y cuantas promociones",
       [texto($(p, "ajuste-resumen-doc")).includes("Líneas5"), texto($(p, "ajuste-resumen-doc")).includes("Promociones2")], [true, true]);

    /* Lo que antes solo se sabia despues de enviar. */
    const personas = [...p.doc.querySelectorAll(".ajuste-responsable")];
    ok("a quien ira cada linea: uno por responsable", personas.map((x) => texto(x.firstChild)).sort(),
       ["COSSIO JOANNA", "SAMUEL HUARANCCA", "SAUÑE MANUEL"]);
    ok("con su papel y cuantas lineas le tocan",
       personas.map((x) => texto(x.children[1])).sort(),
       ["Dueño de la marca · 1 línea", "Dueño de la marca · 1 línea", "Dueño de la marca · 2 líneas"]);
    const huarancca = personas.find((x) => texto(x).includes("SAMUEL HUARANCCA"));
    ok("y cuales, con su cantidad y precio en la moneda del documento",
       texto(huarancca).includes("2 × $ 168.50 IMPRESORA EPSON ECOTANK L3210") && texto(huarancca).includes("5 × $ 21.90 CD-R TDK 80 MIN 700MB"), true);

    ok("avisa, ANTES de enviar, de la linea que no ira a nadie",
       texto($(p, "ajuste-sin-responsable")).startsWith("1 línea NO se enviará a nadie: no se va a ajustar."), true);
    ok("diciendo cual, con su cantidad, y solo cual", [...$(p, "ajuste-sin-responsable-lineas").children].map((l) => texto(l)),
       ["1 × TARJETA DE VIDEO ZOTAC GT1030 2GB (ZOTAC)"]);
    ok("avisa de las promociones que se pierden, con cuantas son",
       texto($(p, "ajuste-aviso-previo")).startsWith("Tiene 2 promociones: si el ajuste se confirma, las pierde todas."), true);
    ok("y de que no podra modificarlo y se libera a los 3 dias",
       [texto($(p, "ajuste-aviso-previo")).includes("no podrás modificarlo"), texto($(p, "ajuste-aviso-previo")).includes("3 días")], [true, true]);
    ok("con la vista previa, no hace falta decir que llegara despues", $(p, "ajuste-sin-previa"), null);
    ok("no pide confirmar aparte: este paso ya es la revision", !!p.doc.querySelector(".cdk-modal__titulo"), false);

    /* ---- el mensaje, con frases rapidas, y que no se pierde al ir y volver */
    ok("frases rapidas para el mensaje", [...$(p, "ajuste-frases").children].map((b) => b.textContent),
       ["una ajustadita", "mejora el precio", "precio para cerrar hoy"]);
    clic(p, $(p, "ajuste-frases").children[1]);
    ok("tocar una la pone en el mensaje", $(p, "ajuste-mensaje").value, "mejora el precio");
    escribir(p, $(p, "ajuste-mensaje"), "  mejora el precio de las impresoras  ");

    llamadas = [];
    clic(p, $(p, "ajuste-atras"));
    ok("«Atrás» vuelve a elegir, sin volver a pedir las listas", [pedidos("/lista/cotis"), pedidos("/lista/pedidos"), !!$(p, "ajuste-paso-documento")], [0, 0, true]);
    ok("el indicador vuelve al primero", pasoActual(p), ["actual", "pendiente", "pendiente"]);
    await elegirDoc(p, "009-00970001");
    ok("y lo que se escribio sigue ahi", $(p, "ajuste-mensaje").value, "  mejora el precio de las impresoras  ");

    /* ---- enviar */
    llamadas = [];
    clic(p, $(p, "ajuste-enviar"));
    await pausa(300);
    ok("manda tipo, numero con serie y el mensaje sin espacios de sobra",
       posts(llamadas), [{ ruta: "/ajuste/enviar", cuerpo: { tipo: "COT", ndocu: "009-00970001", mensaje: "mejora el precio de las impresoras" } }]);

    /* ---- paso 3 */
    ok("el indicador: los dos primeros hechos, va por el tercero", pasoActual(p), ["hecho", "hecho", "actual"]);
    ok("dice que se envio, y de que documento", [texto($(p, "ajuste-enviada-titulo")), texto($(p, "ajuste-enviada-doc"))],
       ["Enviada a ajuste", "Cotización 009-00970001 · CORPORACION LIMA SUR S.A.C."]);

    const resp = [...p.doc.querySelectorAll("#ajuste-responsables > li")];
    ok("a quien se envio: uno por responsable", resp.map((l) => texto(l.querySelector(".cdk-articulo__nombre"))).sort(),
       ["COSSIO JOANNA", "SAMUEL HUARANCCA", "SAUÑE MANUEL"]);
    ok("cada uno con cuando vence", resp.every((l) => texto(l).includes("Vence 24/10/2026")), true);
    ok("y los precios con su moneda, que ya se sabia",
       texto(resp.find((l) => texto(l).includes("SAMUEL HUARANCCA"))).includes("2 × $ 168.50 IMPRESORA EPSON ECOTANK L3210"), true);
    ok("lo que no se envio a nadie, y cual", [texto($(p, "ajuste-sin-responsable")).startsWith("1 línea no se envió a nadie: no se va a ajustar."),
        [...$(p, "ajuste-sin-responsable-lineas").children].map((l) => texto(l))],
       [true, ["1 × TARJETA DE VIDEO ZOTAC GT1030 2GB (ZOTAC)"]]);
    ok("cuantas promociones tiene, que se pierden si confirman",
       texto($(p, "ajuste-enviada-promos")), "El documento tiene 2 promociones: si confirman el ajuste, se quitan todas.");
    ok("con el camino a sus ajustes", $(p, "ajuste-ver-mis-ajustes").getAttribute("href"), "/ajuste/ajuste_enviadas.html");

    /* ---- y ahora esta en sus ajustes */
    p = await montar("ajuste/ajuste_enviadas.html");
    await pausa(250);
    ok("sus ajustes ya lo tienen: tres solicitudes mas", filas(p).length, 6);

    /* ---- pedir otro */
    preparar();
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    await elegirDoc(p, "009-00970001");
    clic(p, $(p, "ajuste-enviar"));
    await pausa(300);
    llamadas = [];
    clic(p, $(p, "ajuste-pedir-otro"));
    await pausa(250);
    ok("«Pedir otro ajuste» vuelve al primer paso", pasoActual(p), ["actual", "pendiente", "pendiente"]);
    ok("y vuelve a pedir las listas, que lo enviado ya no se puede volver a enviar", [pedidos("/lista/cotis"), pedidos("/lista/pedidos")], [1, 1]);

    /* ---- sin mensaje, no viaja */
    preparar();
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    await elegirDoc(p, "009-00970001");
    llamadas = [];
    clic(p, $(p, "ajuste-enviar"));
    await pausa(300);
    ok("sin mensaje, no viaja", posts(llamadas).map((x) => x.cuerpo), [{ tipo: "COT", ndocu: "009-00970001" }]);

    /* ---------------------------------------- lo que no se deja enviar, ANTES de enviar */
    console.log("\n— lo que no se deja enviar se dice en el paso 2 —");
    preparar();
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);

    await elegirDoc(p, "009-00969476");
    ok("ya esta en ajuste: lo dice, con su mensaje", texto($(p, "ajuste-motivo-texto")).includes("ya tiene una solicitud pendiente"), true);
    ok("con el camino a ver su estado", !!p.doc.querySelector("#ajuste-motivo #ajuste-ver-mis-ajustes"), true);
    ok("sin ofrecer enviar lo que no se puede", $(p, "ajuste-enviar"), null);
    ok("se sigue sabiendo de que documento se trata", texto($(p, "ajuste-resumen-titulo")), "Cotización 009-00969476");
    clic(p, $(p, "ajuste-elegir-otro"));
    ok("y se puede elegir otro", !!$(p, "ajuste-paso-documento"), true);

    await elegirDoc(p, "009-00970222");
    ok("ninguna marca con responsable: `sin responsables`",
       texto($(p, "ajuste-motivo-texto")).includes("ninguna marca del documento tiene especialista ni jefatura"), true);

    /* Lo que no sale en la lista, escribiendo el numero. */
    clic(p, $(p, "ajuste-elegir-otro"));
    await escribirManual(p, "COT", "970001");
    ok("sin la serie: `documento ambiguo`", texto($(p, "ajuste-motivo-texto")).includes("lleva su serie"), true);
    clic(p, $(p, "ajuste-elegir-otro"));
    await escribirManual(p, "COT", "009-00999999");
    ok("que no existe: `documento desconocido`", texto($(p, "ajuste-motivo-texto")).includes("no existe o no es tuyo"), true);
    clic(p, $(p, "ajuste-elegir-otro"));
    await escribirManual(p, "PED", "009-00774171");
    ok("de otro vendedor, igual", texto($(p, "ajuste-motivo-texto")).includes("no existe o no es tuyo"), true);
    clic(p, $(p, "ajuste-elegir-otro"));
    await escribirManual(p, "COT", "009-00968800");
    ok("ya aprobado: `documento no ajustable`", texto($(p, "ajuste-motivo-texto")).includes("aprobado, facturado o anulado"), true);
    clic(p, $(p, "ajuste-elegir-otro"));

    forzar = (ruta) => (ruta === "/ajuste/previa" ? respuesta({ status: "error", msg: "se cayo" }, 500) : null);
    await elegirDoc(p, "009-00970001");
    ok("un fallo del servidor al revisar: se dice, con reintentar y con la salida de volver",
       [!!p.doc.querySelector("#ajuste-revisa .cdk-estado"), !!$(p, "ajuste-atras")], [true, true]);
    forzar = null;

    /* ---------------------------------------------------- aun sin vista previa en el backend */
    console.log("\n— el backend todavia no tiene la vista previa —");
    preparar();
    forzar = (ruta) => (ruta === "/ajuste/previa" ? respuesta({ msg: "Cannot POST /v1/ajuste/previa" }, 404) : null);
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    await elegirDoc(p, "009-00970001");

    ok("el paso 2 sigue: con el documento que ya se sabia",
       [texto($(p, "ajuste-resumen-titulo")), texto($(p, "ajuste-resumen-doc")).includes("Total con IGV$ 1,002.88")],
       ["Cotización 009-00970001", true]);
    ok("sin inventar lo que solo dice la vista previa: ni lineas, ni a quien, ni lo que no ira a nadie",
       [texto($(p, "ajuste-resumen-doc")).includes("Líneas"), $(p, "ajuste-se-enviara"), $(p, "ajuste-sin-responsable")], [false, null, null]);
    ok("avisa de que eso lo vera al enviar", texto($(p, "ajuste-sin-previa")).includes("verás a quién le llegó"), true);
    ok("y del aviso de siempre, sin decir cuantas promociones",
       texto($(p, "ajuste-aviso-previo")).startsWith("Si el ajuste se confirma, el documento pierde todas sus promociones."), true);

    llamadas = [];
    clic(p, $(p, "ajuste-enviar"));
    await pausa(300);
    ok("se puede enviar igual", posts(llamadas).map((x) => x.ruta), ["/ajuste/enviar"]);
    ok("y a quien fue se cuenta al final, con la linea sin responsable",
       [p.doc.querySelectorAll("#ajuste-responsables > li").length, texto($(p, "ajuste-sin-responsable")).startsWith("1 línea no se envió a nadie")], [3, true]);
    forzar = null;

    /* ---------------------------------------------------------------- un pedido, en soles */
    console.log("\n— un pedido, en soles —");
    preparar();
    llamadas = [];
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);

    /* Desde el 21/10 el pedido sin aprobar se elige de la lista, igual que una cotizacion. */
    await elegirDoc(p, "009-00775010");
    ok("elegido de la lista, pide la vista previa como PED", llamadas.filter((l) => l.url.includes("/ajuste/previa")).pop().cuerpo,
       { tipo: "PED", ndocu: "009-00775010" });
    ok("y ya se sabe lo de la lista: la fecha y el total en soles",
       [texto($(p, "ajuste-resumen-titulo")), texto($(p, "ajuste-resumen-doc")).includes("Fecha21/10/2026"),
        texto($(p, "ajuste-resumen-doc")).includes("Total con IGVS/ ")], ["Pedido 009-00775010", true, true]);
    llamadas = [];
    clic(p, $(p, "ajuste-enviar"));
    await pausa(300);
    ok("enviado, viaja como pedido", posts(llamadas), [{ ruta: "/ajuste/enviar", cuerpo: { tipo: "PED", ndocu: "009-00775010" } }]);
    ok("y sus precios en soles", texto($(p, "ajuste-responsables")).includes("S/ 603.00"), true);

    /* Escribiendo el numero no se sabe de el mas que lo que dice la vista previa. */
    preparar();
    llamadas = [];
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    await escribirManual(p, "PED", "009-00775010");

    ok("pide la vista previa de un pedido", llamadas.filter((l) => l.url.includes("/ajuste/previa")).pop().cuerpo,
       { tipo: "PED", ndocu: "009-00775010" });
    ok("del pedido solo se sabe lo que dice la vista previa: numero y cliente",
       [texto($(p, "ajuste-resumen-titulo")), texto($(p, "ajuste-resumen-doc")).includes("ABASTECEDORA DEL SUR S.A.C."),
        texto($(p, "ajuste-resumen-doc")).includes("Fecha")], ["Pedido 009-00775010", true, false]);
    const personasPed = [...p.doc.querySelectorAll(".ajuste-responsable")];
    ok("una marca sin dueño le llega a la jefatura, y lo dice",
       personasPed.some((x) => texto(x).includes("COSSIO JOANNA") && texto(x).includes("Jefatura de la familia: la marca no tiene dueño")), true);
    ok("los importes en soles, que lo dice la vista previa",
       personasPed.some((x) => texto(x).includes("2 × S/ 603.00 IMPRESORA EPSON ECOTANK L3210")), true);
    ok("sin lineas sueltas ni promociones, no avisa de ellas",
       [$(p, "ajuste-sin-responsable"), texto($(p, "ajuste-aviso-previo")).startsWith("Si el ajuste se confirma")], [null, true]);

    clic(p, $(p, "ajuste-enviar"));
    await pausa(300);
    ok("enviado, los precios siguen en soles", texto($(p, "ajuste-responsables")).includes("S/ 603.00"), true);

    /* Sin lista y sin vista previa, lo unico que dice la moneda es el envio: desde el 21/10 la trae. */
    preparar();
    forzar = (ruta) => (ruta === "/ajuste/previa" ? respuesta({ msg: "Cannot POST /v1/ajuste/previa" }, 404) : null);
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    await escribirManual(p, "PED", "009-00775010");
    clic(p, $(p, "ajuste-enviar"));
    await pausa(300);
    ok("sin vista previa ni lista, la moneda sale del envio: soles, no dolares por omision",
       [texto($(p, "ajuste-responsables")).includes("S/ 603.00"), texto($(p, "ajuste-responsables")).includes("$ ")], [true, false]);
    forzar = null;

    /* ------------------------------------------------------------------ algo cambio entre medias */
    console.log("\n— algo cambio entre la revision y el envio —");
    preparar();
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    await elegirDoc(p, "009-00970001");
    ajusteSim.estado.documentos["COT 009-00970001"].abierto = false;      // alguien la aprobo mientras tanto
    clic(p, $(p, "ajuste-enviar"));
    await pausa(300);
    ok("`documento no ajustable` al enviar: se dice aqui, donde esta", texto($(p, "ajuste-enviar-error")).includes("aprobado, facturado o anulado"), true);
    ok("sigue en el paso 2, con el boton listo", [!!$(p, "ajuste-paso-revisa"), $(p, "ajuste-enviar").disabled], [true, false]);

    preparar();
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    await elegirDoc(p, "009-00970001");
    ajusteSim.enviar({ tipo: "COT", ndocu: "009-00970001" });              // la envio desde otra pestaña
    clic(p, $(p, "ajuste-enviar"));
    await pausa(300);
    ok("`documento en ajuste` al enviar: lo dice, con el camino a ver su estado",
       [texto($(p, "ajuste-enviar-error")).includes("ya tiene una solicitud pendiente"), !!p.doc.querySelector("#ajuste-enviar-error #ajuste-ver-mis-ajustes")],
       [true, true]);

    /* ---------------------------------------------------- llegar con el documento en la URL */
    console.log("\n— llegar con el documento en la URL —");
    preparar();
    llamadas = [];
    p = await montar("ajuste/ajuste_enviar.html", "?tipo=PED&ndocu=009-00775010");
    await pausa(300);
    ok("salta el paso 1: va directo a revisar, sin pedir las listas",
       [!!$(p, "ajuste-paso-revisa"), pedidos("/lista/cotis"), pedidos("/lista/pedidos"), pedidos("/ajuste/previa")], [true, 0, 0, 1]);
    ok("con ese documento", texto($(p, "ajuste-resumen-titulo")), "Pedido 009-00775010");

    /* ------------------------------------------------------------------ de la otra punta */
    console.log("\n— de la otra punta —");
    preparar("ESPECIALISTA");
    p = await montar("ajuste/ajuste_enviar.html");
    await pausa(250);
    await escribirManual(p, "COT", "009-00970001");
    ok("quien es del grupo 25 no puede pedir ajustes: `sin permiso`", texto($(p, "ajuste-motivo-texto")).includes("otro grupo"), true);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
