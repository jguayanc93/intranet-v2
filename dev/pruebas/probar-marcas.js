/**
 * Prueba de integracion de Marcas del mes (grupo 25), sobre las paginas reales.
 *
 * Cubre dos paginas: marcas.html (especialista y jefatura) y autenticador.html
 * (el registro). Lo que mas importa:
 *
 *   · que el borrador NO toque el backend hasta confirmar, y que confirmar mande
 *     una sola vez la lista entera, sin mes ni año
 *   · que lo que el backend deja en `omitidas` se vea: sin eso la persona cree
 *     que tiene una marca que en realidad no se le dio
 *   · que una vez confirmado no quede ningun control de edicion
 *   · que una jefatura que arma su lista no la pierda al dar una marca a otro
 *   · que el registro lea el tipo de `correcto` y no del formulario
 *
 * El simulacro lleva estado —duenos, confirmaciones, familia— porque las reglas
 * que importan dependen de el: "la marca ya tiene dueño" solo se puede probar si
 * alguien la tiene.
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

/* =====================================================================
 * El backend simulado
 *
 * Vive en dev/simulador-marcas.js y lo comparte con dev/servidor.js: dos copias
 * se desalinean, y un simulacro que ya no se parece al backend hace pasar
 * pruebas que no prueban nada. Aqui solo se arma el sobre HTTP.
 * =================================================================== */
const sim = require("../simulador-marcas");
const S = sim.estado;                 // estado vivo: duenos, confirmaciones, grupo del registro…
const reiniciar = sim.reiniciar;
const buscarMarca = sim.buscarMarca;

let llamadas = [];

function respuesta(obj, status, doble) {
    const cuerpo = doble ? JSON.stringify(JSON.stringify(obj)) : JSON.stringify(obj);
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

    if (ruta === "/vendedor") {
        return respuesta({
            status: "ok", codigo: 0,
            data: { cotizacion: "Permite manejar cotizaciones", factura: "Modifica ciertos campos de la factura",
                    promocion: "Permite adjuntar y retirar promociones", cuota: "Ver el avance de las cuotas",
                    reporte: "Permite sacar reportes de marcas", marcas: "Elige y administra tus marcas del mes" },
            nombre: "JUAN CARLOS", grupo: "VENTAS-JEFES DE PROD", tipo: S.rol, tipoCambio: 3.75
        });
    }

    let r = null;
    if (ruta.indexOf("/marcas") === 0) r = sim.marcas(ruta.slice("/marcas".length), cuerpo);
    else if (ruta.indexOf("/login/registro") === 0) r = sim.registro(ruta, cuerpo);

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
    return respuesta(r.cuerpo, r.status, r.doble);
}

/* =====================================================================
 * Montar una pagina real
 * =================================================================== */
function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

/**
 * Carga el HTML y evalua sus scripts, como las otras suites.
 *
 * jsdom no deja redefinir `location.replace`, y varias pantallas lo usan para
 * salir (al panel, al login). Se pasa un `location` propio como parametro de
 * cada script: lee del real y anota los destinos. Los scripts no se tocan.
 */
async function montar(pagina) {
    let html = leer(pagina);
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/" + pagina,
        runScripts: "outside-only", pretendToBeVisual: true
    });
    const w = dom.window;
    const destinos = [];

    /* El objetivo del Proxy es un objeto vacio a proposito: las propiedades de
       `location` son no configurables, y un Proxy no puede devolver otra cosa
       que la real si su objetivo las tiene. */
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

    return { w, doc: w.document, destinos };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
const escribir = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("input", { bubbles: true })); };
const enviar = (p, f) => f.dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
const botonModal = (doc, cual) => {
    const b = doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    return cual === "confirmar" ? b[b.length - 1] : b[0];
};
const nombres = (nodo) => [...nodo.querySelectorAll(".cdk-articulo__nombre")].map((n) => n.textContent.trim());
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);
const aMarcas = (ls) => ls.filter((l) => l.url.includes("/v1/marcas"));
const escrituras = (ls) => ls.filter((l) => l.metodo === "POST" && !l.url.endsWith("/disponibles"));

/** El boton de una fila de la familia por su texto. */
function botonDeFila(doc, nombre, texto) {
    const fila = [...doc.querySelectorAll("#marcas-familia-lista .cdk-articulo")]
        .find((f) => f.querySelector(".cdk-articulo__nombre").textContent.trim() === nombre);
    return fila && [...fila.querySelectorAll("button")].find((b) => b.textContent.trim() === texto);
}

const filasDeFamilia = (doc) => nombres(doc.getElementById("marcas-familia-lista"));

/** Los textos de las acciones de una marca de la familia en la pagina q. */
function textos2(q, nombre) {
    const fila = [...q.doc.querySelectorAll("#marcas-familia-lista .cdk-articulo")]
        .find((f) => f.querySelector(".cdk-articulo__nombre").textContent.trim() === nombre);
    return [...fila.querySelectorAll("button")].map((b) => b.textContent.trim());
}

/** Elige una opcion del menu de especialistas, por el nombre. */
function elegirEnMenu(p, nombre) {
    const op = [...p.doc.querySelectorAll("#cdk-acciones-menu .cdk-opcion")]
        .find((o) => o.querySelector(".cdk-opcion__texto").textContent === nombre);
    if (op) clic(p, op);
    return !!op;
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Marcas del mes · grupo 25 ===\n");

    /* ================================================== el menu */
    console.log("— el modulo en el menu —");
    reiniciar("ESPECIALISTA");
    llamadas = [];
    let p = await montar("marcas.html");
    await pausa(200);

    ok("la pagina carga sin errores", fallos, 0);
    const enlace = [...p.doc.querySelectorAll("#cdk-sidebar-lista a")].find((a) => a.title === "Marcas");
    ok("Marcas sale en el menu lateral", !!enlace, true);
    ok("y lleva a marcas.html", enlace && enlace.getAttribute("href"), "/marcas.html");
    ok("marcado como la pagina actual", enlace && enlace.getAttribute("aria-current"), "page");
    /* No es un hub: el patron de accesos dinamicos pediria GET /marcas como si
       fuera una lista de permisos, y es el estado del mes. */
    ok("no se trata como hub", p.doc.getElementById("cdk-acciones"), null);

    /* ======================================= especialista sin confirmar */
    console.log("\n— un especialista que aun no confirma —");
    reiniciar("ESPECIALISTA");
    /* La jefatura le dio ADATA antes de que confirmara. */
    buscarMarca("0032").dueno = "233";
    S.dioLaJefatura["0032"] = "COSSIO JOANNA";
    llamadas = [];
    p = await montar("marcas.html");
    await pausa(200);

    ok("dice mes y rol", p.doc.getElementById("periodo").textContent, "octubre de 2026 · Especialista");
    ok("pide el estado una vez", aMarcas(llamadas).filter((l) => l.metodo === "GET").length, 1);
    ok("ofrece el borrador", !!p.doc.getElementById("marcas-buscar"), true);
    ok("no hay panel de familia", p.doc.getElementById("marcas-familia"), null);
    ok("enseña lo que le dio la jefatura", nombres(p.doc.getElementById("marcas-mias")).includes("ADATA"), true);
    ok("y quien se lo dio",
       p.doc.getElementById("marcas-mias").textContent.includes("COSSIO JOANNA"), true);
    ok("avisa de que despues no se cambia",
       p.doc.querySelector("#marcas-mias .cdk-seccion__sub").textContent.includes("hasta el mes siguiente"), true);
    ok("confirmar vale con solo las de la jefatura",
       p.doc.getElementById("marcas-confirmar").disabled, false);

    /* ---- el buscador */
    llamadas = [];
    escribir(p, p.doc.getElementById("marcas-buscar"), "e");
    await pausa(450);
    ok("con una letra no busca", llamadas.some((l) => l.url.endsWith("/disponibles")), false);

    escribir(p, p.doc.getElementById("marcas-buscar"), "ep");
    await pausa(450);
    const busq = llamadas.filter((l) => l.url.endsWith("/disponibles"));
    ok("con dos letras busca, una vez", busq.length, 1);
    ok("mandando solo la sugerencia", busq[0].cuerpo, { sugerencia: "ep" });
    /* EPSON es de otro y el backend no la devuelve: lo que sale es libre. */
    ok("solo salen las libres", nombres(p.doc.getElementById("marcas-resultados")), ["EP_IMPRESORAS"]);
    ok("con la familia de cada una",
       p.doc.getElementById("marcas-resultados").textContent.includes("IMPRESION"), true);

    /* Buscar y teclear de nuevo antes de que llegue: manda la ultima. */
    llamadas = [];
    escribir(p, p.doc.getElementById("marcas-buscar"), "tdk");
    escribir(p, p.doc.getElementById("marcas-buscar"), "zo");
    await pausa(450);
    ok("el rebote junta lo tecleado en una sola busqueda",
       llamadas.filter((l) => l.url.endsWith("/disponibles")).length, 1);
    ok("y busca lo ultimo",
       llamadas.filter((l) => l.url.endsWith("/disponibles"))[0].cuerpo, { sugerencia: "zo" });
    ok("pintando lo de lo ultimo", nombres(p.doc.getElementById("marcas-resultados")), ["ZOTAC"]);

    /* ---- armar el borrador: nada toca el backend */
    escribir(p, p.doc.getElementById("marcas-buscar"), "tdk");
    await pausa(450);
    llamadas = [];
    clic(p, p.doc.querySelector("#marcas-resultados button.cdk-articulo--pulsable"));
    ok("la marca pasa a la lista", nombres(p.doc.getElementById("marcas-borrador")), ["TDK"]);
    ok("y se marca como ya elegida",
       p.doc.getElementById("marcas-resultados").textContent.includes("En tu lista"), true);
    ok("sin poder pulsarse otra vez",
       p.doc.querySelectorAll("#marcas-resultados button.cdk-articulo--pulsable").length, 0);
    /* El borrador vive en la pantalla: este es el contrato. */
    ok("armar el borrador no llama al backend", llamadas.length, 0);

    escribir(p, p.doc.getElementById("marcas-buscar"), "ep");
    await pausa(450);
    clic(p, p.doc.querySelector("#marcas-resultados button.cdk-articulo--pulsable"));
    ok("suma otra", nombres(p.doc.getElementById("marcas-borrador")), ["TDK", "EP_IMPRESORAS"]);

    const quitar = [...p.doc.querySelectorAll("#marcas-borrador button")].find((b) => b.textContent === "Quitar");
    clic(p, quitar);
    ok("quitar la saca de la lista", nombres(p.doc.getElementById("marcas-borrador")), ["EP_IMPRESORAS"]);

    /* ---- las del mes anterior */
    llamadas = [];
    clic(p, p.doc.getElementById("marcas-anterior"));
    await pausa(200);

    const previas = nombres(p.doc.getElementById("marcas-borrador"));
    /* ADATA ya es suya, MEMOREX es de otro y SONY ya no se trabaja: no
       entra ninguna, pero la lista de antes tiene que seguir intacta. */
    ok("no pisa lo que ya habia", previas, ["EP_IMPRESORAS"]);
    const aviso = p.doc.getElementById("marcas-anterior-aviso").textContent;
    ok("dice que SONY ya no se trabaja", aviso.includes("SONY") && aviso.includes("ya no se trabaja"), true);
    ok("y que MEMOREX es de otro, diciendo de quien",
       aviso.includes("MEMOREX") && aviso.includes("SAUÑE MANUEL"), true);
    ok("preguntar por el mes pasado no asigna nada", escrituras(llamadas).length, 0);

    /* ---- confirmar */
    llamadas = [];
    clic(p, p.doc.getElementById("marcas-confirmar"));
    ok("pide confirmacion", !!p.doc.querySelector(".cdk-modal__titulo"), true);
    ok("avisando de que despues no se cambia",
       p.doc.querySelector(".cdk-modal__mensaje").textContent.includes("hasta el mes siguiente"), true);
    ok("contando las suyas y las de la jefatura",
       p.doc.querySelector(".cdk-modal__mensaje").textContent.includes("2 marcas"), true);

    clic(p, botonModal(p.doc, "cancelar"));
    await pausa(80);
    ok("cancelar no manda nada", escrituras(llamadas).length, 0);
    ok("y sigue en el borrador", !!p.doc.getElementById("marcas-buscar"), true);

    /* Alguien se queda con EP_IMPRESORAS mientras tanto. */
    buscarMarca("0206").dueno = "229";

    clic(p, p.doc.getElementById("marcas-confirmar"));
    clic(p, botonModal(p.doc, "confirmar"));
    await pausa(300);

    const conf = llamadas.filter((l) => l.url.endsWith("/marcas/confirmar"));
    ok("confirma una sola vez", conf.length, 1);
    ok("mandando la lista entera, solo los codigos", conf[0].cuerpo, { marcas: ["0206"] });
    ok("sin mes ni año: los pone el servidor", Object.keys(conf[0].cuerpo), ["marcas"]);

    /* Quedo confirmado con lo de la jefatura; lo otro se dice. */
    ok("repinta pidiendo el estado de nuevo",
       llamadas.filter((l) => l.metodo === "GET" && l.url.endsWith("/v1/marcas")).length, 1);
    ok("ya no hay buscador", p.doc.getElementById("marcas-buscar"), null);
    ok("ni boton de confirmar", p.doc.getElementById("marcas-confirmar"), null);
    ok("ni nada que quitar", p.doc.querySelectorAll("#marcas-mias button").length, 0);
    ok("dice que quedo confirmado",
       p.doc.getElementById("marcas-confirmadas").textContent.includes("Confirmaste tus marcas"), true);
    ok("y la marca que le dieron sigue",
       nombres(p.doc.getElementById("marcas-mias")), ["ADATA"]);

    /* Lo omitido se dice DESPUES de repintar, y tiene que seguir ahi. */
    const omitidas = p.doc.getElementById("avisos").textContent;
    ok("dice cual no se pudo asignar", omitidas.includes("EP_IMPRESORAS"), true);
    ok("por que", omitidas.includes("ya esta asignada a otro"), true);
    ok("y a quien se la dieron", omitidas.includes("SAUÑE MANUEL"), true);
    ok("avisa que quedo confirmado", toasts(p.doc).some((t) => t.includes("Marcas confirmadas: 1")), true);

    /* ============================================ confirmar sin marcas */
    console.log("\n— sin ninguna marca —");
    reiniciar("ESPECIALISTA");
    llamadas = [];
    p = await montar("marcas.html");
    await pausa(200);

    ok("no deja confirmar", p.doc.getElementById("marcas-confirmar").disabled, true);
    ok("y dice por que",
       p.doc.getElementById("marcas-confirmar-pista").textContent.includes("al menos una"), true);

    escribir(p, p.doc.getElementById("marcas-buscar"), "tdk");
    await pausa(450);
    clic(p, p.doc.querySelector("#marcas-resultados button.cdk-articulo--pulsable"));
    ok("con una ya deja", p.doc.getElementById("marcas-confirmar").disabled, false);

    const quitarUna = [...p.doc.querySelectorAll("#marcas-borrador button")].find((b) => b.textContent === "Quitar");
    clic(p, quitarUna);
    ok("y al quitarla vuelve a no dejar", p.doc.getElementById("marcas-confirmar").disabled, true);

    /* ---- 409 `sin marcas asignables`: no queda confirmado y puede reintentar */
    console.log("\n— ninguna se pudo asignar —");
    escribir(p, p.doc.getElementById("marcas-buscar"), "tdk");
    await pausa(450);
    clic(p, p.doc.querySelector("#marcas-resultados button.cdk-articulo--pulsable"));
    buscarMarca("0002").dueno = "229";          // se la llevan antes de confirmar

    clic(p, p.doc.getElementById("marcas-confirmar"));
    clic(p, botonModal(p.doc, "confirmar"));
    await pausa(300);

    ok("sigue en el borrador, sin confirmar", !!p.doc.getElementById("marcas-buscar"), true);
    ok("dice cual y a quien se la dieron",
       p.doc.getElementById("avisos").textContent.includes("TDK") &&
       p.doc.getElementById("avisos").textContent.includes("SAUÑE MANUEL"), true);
    ok("saca del borrador la que no se pudo", nombres(p.doc.getElementById("marcas-borrador")), []);
    ok("y vuelve a no dejar confirmar vacio", p.doc.getElementById("marcas-confirmar").disabled, true);
    ok("el editor vuelve a estar libre", p.doc.getElementById("marcas-buscar").disabled, false);

    /* ---- 409 `marcas ya confirmadas`: otra pestaña lo hizo antes */
    console.log("\n— ya habia confirmado, desde otra pestaña —");
    reiniciar("ESPECIALISTA");
    p = await montar("marcas.html");
    await pausa(200);

    escribir(p, p.doc.getElementById("marcas-buscar"), "tdk");
    await pausa(450);
    clic(p, p.doc.querySelector("#marcas-resultados button.cdk-articulo--pulsable"));
    S.confirmados["233"] = true;                  // en otra pestaña
    buscarMarca("0206").dueno = "233";

    clic(p, p.doc.getElementById("marcas-confirmar"));
    clic(p, botonModal(p.doc, "confirmar"));
    await pausa(300);

    ok("no es un error: enseña como quedo", !!p.doc.getElementById("marcas-confirmadas"), true);
    ok("sin editor", p.doc.getElementById("marcas-buscar"), null);
    ok("lo dice con el mensaje del backend",
       toasts(p.doc).some((t) => t.includes("ya confirmaste")), true);

    /* ====================================================== confirmado */
    console.log("\n— un especialista que ya confirmo —");
    reiniciar("ESPECIALISTA");
    buscarMarca("0002").dueno = "233";
    buscarMarca("0206").dueno = "233";
    S.dioLaJefatura["0206"] = "COSSIO JOANNA";
    S.confirmados["233"] = true;
    llamadas = [];
    p = await montar("marcas.html");
    await pausa(200);

    ok("solo pidio el estado", llamadas.length >= 1 && escrituras(llamadas).length === 0, true);
    ok("lista sus marcas", nombres(p.doc.getElementById("marcas-mias")), ["TDK", "EP_IMPRESORAS"]);
    ok("sin buscador", p.doc.getElementById("marcas-buscar"), null);
    ok("sin confirmar", p.doc.getElementById("marcas-confirmar"), null);
    ok("sin botones de ninguna clase", p.doc.querySelectorAll("#marcas-mias button").length, 0);
    ok("la que tomo el propio usuario dice «ti»",
       p.doc.querySelector("#marcas-mias .cdk-articulo").textContent.includes("ti"), true);
    ok("la que le dieron dice quien",
       p.doc.getElementById("marcas-mias").textContent.includes("COSSIO JOANNA"), true);
    ok("avisa que quedan fijas",
       p.doc.getElementById("marcas-confirmadas").textContent.includes("hasta el mes siguiente"), true);

    /* ================================================== la jefatura */
    console.log("\n— una jefatura: el panel de su familia —");
    reiniciar("JEFATURA");
    llamadas = [];
    p = await montar("marcas.html");
    await pausa(200);

    ok("dice el rol del backend, no el del menu",
       p.doc.getElementById("periodo").textContent, "octubre de 2026 · Jefatura");
    ok("tiene el panel de familia", !!p.doc.getElementById("marcas-familia"), true);
    ok("y tambien su propio borrador", !!p.doc.getElementById("marcas-buscar"), true);
    ok("con el nombre de la familia",
       p.doc.getElementById("marcas-resumen").textContent.includes("ALMACENAMIENTO EXTERNO"), true);

    const total = [...p.doc.querySelectorAll("#marcas-resumen .cdk-total")]
        .map((t) => t.textContent.replace(/\s+/g, " ").trim());
    ok("cuenta las que se trabajan", total[0], "Marcas que se trabajan4");
    ok("las sin asignar", total[1], "Sin asignar2");
    ok("y las que ya no se trabajan", total[2], "Ya no se trabajan2");

    const esps = nombres(p.doc.querySelector("#marcas-resumen ul"));
    ok("lista a todos los especialistas", esps, ["MANUEL SAUÑE INOCENTE", "SAMUEL HUARANCCA MEZA"]);
    ok("diciendo quien ya confirmo",
       p.doc.querySelector("#marcas-resumen ul").textContent.includes("confirmó") &&
       p.doc.querySelector("#marcas-resumen ul").textContent.includes("sin confirmar"), true);

    ok("las trabajadas van primero",
       filasDeFamilia(p.doc), ["ACER", "MEMOREX", "ADATA", "TDK", "HIKVISION", "SONY"]);

    /* ---- filtros */
    const filtro = p.doc.getElementById("marcas-filtro");
    filtro.value = "libres"; filtro.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    ok("filtrar por sin asignar", filasDeFamilia(p.doc), ["ADATA", "TDK"]);

    filtro.value = "e:229"; filtro.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    ok("filtrar por un especialista", filasDeFamilia(p.doc), ["MEMOREX"]);

    filtro.value = "no"; filtro.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    ok("filtrar por las que ya no se trabajan", filasDeFamilia(p.doc), ["HIKVISION", "SONY"]);

    filtro.value = "mias"; filtro.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    ok("filtrar por las mias", filasDeFamilia(p.doc), ["ACER"]);

    /* ---- que se ofrece segun el estado de cada marca */
    filtro.value = "todas"; filtro.dispatchEvent(new p.w.Event("change", { bubbles: true }));
    const accionesDe = (n) => [...(p.doc.querySelectorAll("#marcas-familia-lista .cdk-articulo"))]
        .find((f) => f.querySelector(".cdk-articulo__nombre").textContent.trim() === n)
        .querySelectorAll("button");
    const textos = (n) => [...accionesDe(n)].map((b) => b.textContent.trim());

    ok("una libre: dar o dejar de trabajarla",
       textos("ADATA"), ["Dar a un especialista", "Dejar de trabajarla"]);
    ok("la de un especialista: pasar, quitar, dejar",
       textos("MEMOREX"), ["Pasar a otro", "Quitar", "Dejar de trabajarla"]);
    /* Mientras no haya confirmado, el backend deja ceder las propias
       (docs/marcas-grupo25.md, secc. 9, duda 5). */
    ok("una propia sin confirmar: tambien se puede dar", textos("ACER"), ["Dar a un especialista", "Dejar de trabajarla"]);
    ok("una que ya no se trabaja: solo reactivarla", textos("HIKVISION"), ["Volver a trabajarla"]);

    /* ---- dar una marca libre */
    llamadas = [];
    clic(p, botonDeFila(p.doc, "ADATA", "Dar a un especialista"));
    ok("abre la lista de especialistas", p.doc.querySelectorAll("#cdk-acciones-menu .cdk-opcion").length, 2);
    elegirEnMenu(p, "SAMUEL HUARANCCA MEZA");
    await pausa(300);

    ok("dar una libre no pide confirmacion", !!p.doc.querySelector(".cdk-modal"), false);
    const dada = llamadas.filter((l) => l.url.endsWith("/marcas/asignar"));
    ok("asigna", dada.length, 1);
    ok("al especialista y esa marca", dada[0].cuerpo, { codusu: "233", marcas: ["0032"] });
    ok("y repinta pidiendo el estado",
       llamadas.some((l) => l.metodo === "GET" && l.url.endsWith("/v1/marcas")), true);
    ok("la marca ya tiene dueño",
       botonDeFila(p.doc, "ADATA", "Pasar a otro") !== undefined, true);

    /* ---- pasar una que ya tiene dueño */
    llamadas = [];
    clic(p, botonDeFila(p.doc, "MEMOREX", "Pasar a otro"));
    const ofrecidos = [...p.doc.querySelectorAll("#cdk-acciones-menu .cdk-opcion__texto")].map((o) => o.textContent);
    /* No se la va a pasar a quien ya la tiene. */
    ok("no ofrece a quien ya la tiene", ofrecidos, ["SAMUEL HUARANCCA MEZA"]);
    elegirEnMenu(p, "SAMUEL HUARANCCA MEZA");
    await pausa(80);

    ok("pasar una con dueño si pide confirmacion", !!p.doc.querySelector(".cdk-modal"), true);
    ok("diciendo de quien es hoy",
       p.doc.querySelector(".cdk-modal__mensaje").textContent.includes("SAUÑE MANUEL"), true);
    clic(p, botonModal(p.doc, "cancelar"));
    await pausa(80);
    ok("cancelar no mueve nada", llamadas.some((l) => l.url.endsWith("/marcas/asignar")), false);

    clic(p, botonDeFila(p.doc, "MEMOREX", "Pasar a otro"));
    elegirEnMenu(p, "SAMUEL HUARANCCA MEZA");
    clic(p, botonModal(p.doc, "confirmar"));
    await pausa(300);
    ok("confirmar la mueve", buscarMarca("0003").dueno, "233");
    ok("y lo dice con `movidaDe`",
       toasts(p.doc).some((t) => t.includes("pasó de SAUÑE MANUEL")), true);

    /* ---- quitar */
    llamadas = [];
    clic(p, botonDeFila(p.doc, "MEMOREX", "Quitar"));
    ok("quitar pide confirmacion", !!p.doc.querySelector(".cdk-modal"), true);
    clic(p, botonModal(p.doc, "confirmar"));
    await pausa(300);

    const ret = llamadas.filter((l) => l.url.endsWith("/marcas/retirar"));
    ok("retira del dueño actual", ret[0].cuerpo, { codusu: "233", marcas: ["0003"] });
    ok("y queda sin asignar", buscarMarca("0003").dueno, null);

    /* ---- dejar de trabajar y volver a trabajar */
    llamadas = [];
    clic(p, botonDeFila(p.doc, "ADATA", "Dejar de trabajarla"));
    ok("avisa que quien la tiene la conserva",
       p.doc.querySelector(".cdk-modal__mensaje").textContent.includes("hasta fin de mes"), true);
    clic(p, botonModal(p.doc, "confirmar"));
    await pausa(300);

    const est = llamadas.filter((l) => l.url.endsWith("/marcas/estado"));
    ok("fija el estado", est[0].cuerpo, { codmar: "0032", trabajada: false });
    ok("y avisa a quien se la conserva",
       toasts(p.doc).some((t) => t.includes("SAMUEL HUARANCCA") && t.includes("hasta fin de mes")), true);

    llamadas = [];
    clic(p, botonDeFila(p.doc, "ADATA", "Volver a trabajarla"));
    await pausa(300);
    ok("reactivar no pide confirmacion", !!p.doc.querySelector(".cdk-modal"), false);
    ok("la reactiva",
       llamadas.filter((l) => l.url.endsWith("/marcas/estado"))[0].cuerpo, { codmar: "0032", trabajada: true });

    /* ---- incorporar una marca nueva */
    llamadas = [];
    p.doc.getElementById("marcas-incorporar").value = "12";
    enviar(p, p.doc.getElementById("marcas-form-incorporar"));
    await pausa(80);
    ok("un codigo mal formado ni se manda",
       llamadas.some((l) => l.url.endsWith("/marcas/estado")), false);

    p.doc.getElementById("marcas-incorporar").value = "0999";
    enviar(p, p.doc.getElementById("marcas-form-incorporar"));
    await pausa(300);
    ok("incorpora declarandola trabajada",
       llamadas.filter((l) => l.url.endsWith("/marcas/estado"))[0].cuerpo, { codmar: "0999", trabajada: true });
    ok("y queda en la familia", filasDeFamilia(p.doc).includes("NUEVA MARCA"), true);
    ok("diciendolo", toasts(p.doc).some((t) => t.includes("incorporada")), true);

    p.doc.getElementById("marcas-incorporar").value = "0888";
    enviar(p, p.doc.getElementById("marcas-form-incorporar"));
    await pausa(300);
    ok("una que no existe en el ERP se explica con el mensaje del backend",
       toasts(p.doc).some((t) => t.includes("no existe en el ERP")), true);

    /* ---- lo que el backend no pudo hacer */
    console.log("\n— lo que el backend deja en omitidas —");
    reiniciar("JEFATURA");
    p = await montar("marcas.html");
    await pausa(200);

    /* Otra persona la deja de trabajar mientras esta pantalla sigue abierta. */
    buscarMarca("0002").trabajada = false;
    clic(p, botonDeFila(p.doc, "TDK", "Dar a un especialista"));
    elegirEnMenu(p, "SAMUEL HUARANCCA MEZA");
    await pausa(300);

    ok("no lo da por hecho", buscarMarca("0002").dueno, null);
    ok("lo dice, con el motivo",
       p.doc.getElementById("avisos").textContent.includes("TDK") &&
       p.doc.getElementById("avisos").textContent.includes("ya no se trabaja"), true);
    ok("y la pantalla se pone al dia", botonDeFila(p.doc, "TDK", "Volver a trabajarla") !== undefined, true);

    /* ---- el filtro y el borrador sobreviven a una accion */
    console.log("\n— el filtro y el borrador sobreviven a una accion —");
    reiniciar("JEFATURA");
    p = await montar("marcas.html");
    await pausa(200);

    escribir(p, p.doc.getElementById("marcas-buscar"), "tdk");
    await pausa(450);
    clic(p, p.doc.querySelector("#marcas-resultados button.cdk-articulo--pulsable"));
    ok("arma su propia lista", nombres(p.doc.getElementById("marcas-borrador")), ["TDK"]);

    const f2 = p.doc.getElementById("marcas-filtro");
    f2.value = "libres"; f2.dispatchEvent(new p.w.Event("change", { bubbles: true }));

    clic(p, botonDeFila(p.doc, "ADATA", "Dar a un especialista"));
    elegirEnMenu(p, "SAMUEL HUARANCCA MEZA");
    await pausa(300);

    /* Dar una marca repinta todo. Si el editor se reconstruyera, la jefatura
       que estaba armando su lista la perderia sin aviso. */
    ok("su borrador sigue ahi", nombres(p.doc.getElementById("marcas-borrador")), ["TDK"]);
    ok("el filtro sigue donde estaba", p.doc.getElementById("marcas-filtro").value, "libres");
    ok("y la lista respeta el filtro", filasDeFamilia(p.doc), ["TDK"]);

    /* ---- sin familia */
    console.log("\n— una jefatura sin familia cargada —");
    reiniciar("JEFATURA");
    S.jefaturaConFamilia = false;
    p = await montar("marcas.html");
    await pausa(200);

    ok("no se rompe", p.doc.getElementById("marcas-familia") !== null, true);
    ok("explica que falta y a quien avisar",
       p.doc.getElementById("marcas-familia").textContent.includes("sistemas"), true);
    ok("y sin controles de familia", p.doc.getElementById("marcas-filtro"), null);

    console.log("\n— ceder una marca propia —");
    reiniciar("JEFATURA");
    p = await montar("marcas.html");
    await pausa(200);

    llamadas = [];
    clic(p, botonDeFila(p.doc, "ACER", "Dar a un especialista"));
    elegirEnMenu(p, "SAMUEL HUARANCCA MEZA");
    await pausa(300);
    ok("darla no pide confirmacion: no se le quita a nadie", !!p.doc.querySelector(".cdk-modal"), false);
    ok("la asigna", llamadas.filter((l) => l.url.endsWith("/marcas/asignar"))[0].cuerpo,
       { codusu: "233", marcas: ["0124"] });
    ok("y pasa a ser del especialista", buscarMarca("0124").dueno, "233");
    /* Sin `movidaDe`: no se le quito a OTRO. */
    ok("lo dice sin hablar de otro dueño",
       toasts(p.doc).some((t) => t.includes("es ahora de") && !t.includes("pasó de")), true);

    /* Ya confirmada, el backend la devolveria en `omitidas`: no se ofrece. */
    reiniciar("JEFATURA");
    S.confirmados["071"] = true;
    p = await montar("marcas.html");
    await pausa(200);
    ok("confirmada, una propia ya no se puede dar", textos2(p, "ACER"), ["Dejar de trabajarla"]);

    console.log("\n— alguien del grupo 25 que aun no se registro —");
    reiniciar("ESPECIALISTA");
    S.yaRegistrado = false;
    p = await montar("marcas.html");
    await pausa(200);
    /* `no identificado` no es un fallo ni se arregla reintentando: falta el alta. */
    ok("explica que falta el registro", !!p.doc.getElementById("marcas-sin-alta"), true);
    ok("con el camino al formulario",
       p.doc.querySelector("#marcas-sin-alta a").getAttribute("href"), "/autenticador.html");
    ok("sin boton de reintentar", p.doc.querySelectorAll("#contenido .cdk-boton").length, 1);

    /* ================================================== el registro */
    console.log("\n— el registro: otros grupos —");
    const registrar = async (grupo) => {
        reiniciar("ESPECIALISTA");
        S.grupoRegistro = grupo; S.yaRegistrado = false; S.cargadoComoJefatura = false; S.sinSesion = false;
        llamadas = [];
        const q = await montar("autenticador.html");
        await pausa(200);
        return q;
    };
    const opciones = (q) => [...q.doc.querySelectorAll("#tipo option")].map((o) => o.value).filter(Boolean);
    /* Elegir en el desplegable de verdad: cambiar el valor sin el evento no
       enseña ni esconde la seccion de marcas. */
    const elegirTipo = (q, valor) => {
        q.doc.getElementById("tipo").value = valor;
        q.doc.getElementById("tipo").dispatchEvent(new q.w.Event("change", { bubbles: true }));
    };

    p = await registrar("VENTAS-EJECUTIVOS");
    ok("ejecutivos: cobertura y cartera", opciones(p), ["COBERTURA", "CARTERA"]);
    ok("sin marcas, que no les toca",
       p.doc.getElementById("seccion-marcas").classList.contains("hidden"), true);

    elegirTipo(p, "CARTERA");
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(250);

    const reg1 = llamadas.filter((l) => l.url.endsWith("/login/registro/completado"));
    ok("registra con el tipo elegido y nada mas", reg1[0].cuerpo, { diferenciador: "CARTERA" });
    ok("y entra al panel, como siempre", p.destinos, ["/main.html"]);

    /* El backend no acepta WEB ni «TIO GASEOSA»: la pantalla no los ofrece. */
    p = await registrar("VENTAS-JEFES DE ZONA");
    ok("zona: solo zona", opciones(p), ["ZONA"]);
    /* Con una sola opcion no hay nada que elegir: queda puesta. */
    ok("y ya viene elegida", p.doc.getElementById("tipo").value, "ZONA");
    p = await registrar("VENTAS-JEFE DE PRODU");
    /* CHAKAL ya no se acepta, y «tio gaseosa» nunca fue valido. */
    ok("jefes de producto: solo HP", opciones(p), ["HP"]);
    ok("y ya viene elegido", p.doc.getElementById("tipo").value, "HP");

    p = await registrar("VENTAS-INVENTADO");
    ok("un grupo sin registro lo dice",
       p.doc.getElementById("estado").textContent.includes("sistemas"), true);
    ok("y no ofrece el formulario",
       p.doc.getElementById("form-registro").classList.contains("hidden"), true);

    console.log("\n— los tipos los dice el backend —");
    S.diferenciadores = ["ESPECIALISTA", "SUPERVISOR"];
    p = await registrar("VENTAS-JEFES DE PROD");
    /* registrar() reinicia el simulacro: se vuelve a fijar y se recarga. */
    S.diferenciadores = ["ESPECIALISTA", "SUPERVISOR"];
    p = await montar("autenticador.html");
    await pausa(200);
    /* Ni el catalogo ni la pantalla saben que existe SUPERVISOR: se ofrece
       porque el backend lo dice, y JEFATURA desaparece porque no lo dice. */
    ok("ofrece lo que dice el backend, no el catalogo", opciones(p), ["ESPECIALISTA", "SUPERVISOR"]);
    elegirTipo(p, "SUPERVISOR");
    ok("un tipo desconocido se ofrece con su clave",
       p.doc.querySelector("#tipo option[value=SUPERVISOR]").textContent, "SUPERVISOR");
    ok("sin marcas, que no sabe si las pide",
       p.doc.getElementById("seccion-marcas").classList.contains("hidden"), true);
    elegirTipo(p, "ESPECIALISTA");
    ok("el conocido conserva su leyenda",
       p.doc.getElementById("tipo-leyenda").textContent, "Jefe de una marca específica");

    /* Un grupo sin registro devuelve []. Aunque el catalogo conozca sus tipos. */
    S.diferenciadores = [];
    p = await montar("autenticador.html");
    await pausa(200);
    ok("con [] dice que no hay registro", p.doc.getElementById("estado").textContent.includes("sistemas"), true);
    ok("y no ofrece el formulario", p.doc.getElementById("form-registro").classList.contains("hidden"), true);

    /* Un despliegue anterior no manda el campo: se tira del catalogo. */
    S.diferenciadores = false;
    p = await montar("autenticador.html");
    await pausa(200);
    ok("sin el campo, recurre al catalogo", opciones(p).sort(), ["ESPECIALISTA", "JEFATURA"]);

    console.log("\n— el buscador antes de registrarse —");
    p = await registrar("VENTAS-JEFES DE PROD");
    S.cargadoComoJefatura = true;
    elegirTipo(p, "ESPECIALISTA");
    escribir(p, p.doc.getElementById("marcas-buscar"), "ep");
    await pausa(450);
    /* Cargada como jefatura de la 09, no ve la 11 aunque aun no figure. */
    ok("una jefatura aun sin alta solo ve su familia",
       p.doc.getElementById("marcas-resultados").textContent.includes("Ninguna marca libre"), true);
    escribir(p, p.doc.getElementById("marcas-buscar"), "tdk");
    await pausa(450);
    ok("las de su familia si", nombres(p.doc.getElementById("marcas-resultados")), ["TDK"]);

    p = await registrar("VENTAS-JEFES DE PROD");
    elegirTipo(p, "ESPECIALISTA");
    escribir(p, p.doc.getElementById("marcas-buscar"), "ep");
    await pausa(450);
    ok("y quien no esta cargado como jefatura, las de todas",
       nombres(p.doc.getElementById("marcas-resultados")), ["EP_IMPRESORAS"]);

    console.log("\n— el registro: sin sesion —");
    reiniciar("ESPECIALISTA");
    S.grupoRegistro = "VENTAS-JEFES DE PROD"; S.sinSesion = true; llamadas = [];
    p = await montar("autenticador.html");
    await pausa(200);
    ok("manda al login", p.destinos, ["/index.html"]);
    ok("sin intentar renovar la sesion",
       llamadas.some((l) => l.url.includes("/login/identificador")), false);

    console.log("\n— el registro del grupo 25 —");
    p = await registrar("VENTAS-JEFES DE PROD");
    ok("ofrece jefatura y especialista", opciones(p).sort(), ["ESPECIALISTA", "JEFATURA"]);

    /* El tipo no se cambia despues del alta: no se preselecciona ninguno, o
       quien guarda sin mirar acaba pidiendo JEFATURA y tropezando con un 403. */
    ok("no preselecciona ninguno", p.doc.getElementById("tipo").value, "");
    ok("y no enseña marcas hasta que elija",
       p.doc.getElementById("seccion-marcas").classList.contains("hidden"), true);

    llamadas = [];
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(150);
    ok("guardar sin elegir no manda nada",
       llamadas.some((l) => l.url.endsWith("/login/registro/completado")), false);
    ok("y pide que elija", toasts(p.doc).some((t) => t.includes("Elige tu tipo")), true);

    elegirTipo(p, "ESPECIALISTA");
    ok("al elegir, aparece la seccion de marcas",
       p.doc.getElementById("seccion-marcas").classList.contains("hidden"), false);
    ok("y la leyenda del tipo", p.doc.getElementById("tipo-leyenda").textContent, "Jefe de una marca específica");
    ok("que avisa de que elegir es confirmar",
       p.doc.getElementById("seccion-marcas").textContent.includes("quedan confirmadas"), true);
    ok("y de que se puede dejar para despues",
       p.doc.getElementById("seccion-marcas").textContent.includes("después"), true);
    ok("sin el atajo del mes pasado: no tiene", p.doc.getElementById("marcas-anterior"), null);

    /* ---- sin elegir marcas */
    elegirTipo(p, "ESPECIALISTA");
    llamadas = [];
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(250);

    const reg2 = llamadas.filter((l) => l.url.endsWith("/login/registro/completado"));
    ok("sin marcas no pide confirmar", !!p.doc.querySelector(".cdk-modal"), false);
    ok("y no manda el campo `marcas`", reg2[0].cuerpo, { diferenciador: "ESPECIALISTA" });
    ok("sin marcas no hay redireccion: dice como quedo", p.destinos, []);
    ok("explica que las confirma despues",
       p.doc.getElementById("registro-sin-marcas").textContent.includes("módulo Marcas"), true);
    ok("y ofrece ir al panel",
       p.doc.getElementById("registro-entrar").getAttribute("href"), "/main.html");

    /* ---- eligiendo marcas, con una que otro ya tomo */
    p = await registrar("VENTAS-JEFES DE PROD");
    buscarMarca("0008").dueno = "229";
    elegirTipo(p, "ESPECIALISTA");

    escribir(p, p.doc.getElementById("marcas-buscar"), "tdk");
    await pausa(450);
    clic(p, p.doc.querySelector("#marcas-resultados button.cdk-articulo--pulsable"));
    escribir(p, p.doc.getElementById("marcas-buscar"), "ep_");
    await pausa(450);
    clic(p, p.doc.querySelector("#marcas-resultados button.cdk-articulo--pulsable"));
    ok("arma el borrador igual que en el modulo",
       nombres(p.doc.getElementById("marcas-borrador")), ["TDK", "EP_IMPRESORAS"]);

    buscarMarca("0206").dueno = "229";          // se la llevan mientras tanto
    llamadas = [];
    enviar(p, p.doc.getElementById("form-registro"));
    ok("con marcas si pide confirmar", !!p.doc.querySelector(".cdk-modal"), true);
    ok("diciendo que quedan fijas",
       p.doc.querySelector(".cdk-modal__mensaje").textContent.includes("hasta el mes siguiente"), true);

    clic(p, botonModal(p.doc, "cancelar"));
    await pausa(80);
    ok("cancelar no registra", llamadas.some((l) => l.url.endsWith("/login/registro/completado")), false);

    /* Cancelar el dialogo no deja el formulario bloqueado. */
    enviar(p, p.doc.getElementById("form-registro"));
    ok("y se puede volver a intentar", !!p.doc.querySelector(".cdk-modal"), true);

    clic(p, botonModal(p.doc, "confirmar"));
    await pausa(300);

    const reg3 = llamadas.filter((l) => l.url.endsWith("/login/registro/completado"));
    ok("registra con el tipo y las marcas", reg3[0].cuerpo, { diferenciador: "ESPECIALISTA", marcas: ["0002", "0206"] });
    ok("no redirige solo: hay algo que leer", p.destinos, []);
    ok("enseña la que quedo", nombres(p.doc.getElementById("registro-asignadas")), ["TDK"]);
    ok("diciendo que quedo fija",
       p.doc.getElementById("resultado").textContent.includes("Quedan fijas"), true);
    const om = p.doc.getElementById("registro-omitidas").textContent;
    ok("y la que no, con el motivo y de quien es",
       om.includes("EP_IMPRESORAS") && om.includes("ya esta asignada a otro") && om.includes("SAUÑE MANUEL"), true);
    ok("quedando confirmado no manda a reintentar", om.includes("elige otras"), false);

    /* ---- el tipo se lee de `correcto` */
    console.log("\n— el tipo sale de la respuesta, no del formulario —");
    p = await registrar("VENTAS-JEFES DE PROD");
    S.cargadoComoJefatura = true;
    elegirTipo(p, "ESPECIALISTA");
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(250);

    const tipoDicho = p.doc.getElementById("registro-tipo").textContent;
    ok("dice que quedo como Jefatura", tipoDicho.includes("registrado como Jefatura"), true);
    /* Si dijera Especialista, la persona buscaria un panel que no tiene. */
    ok("y no como lo que pidio", tipoDicho.includes("registrado como Especialista"), false);
    ok("explicando por que", tipoDicho.includes("aunque hayas elegido Especialista"), true);

    /* ---- errores */
    console.log("\n— el registro: lo que puede salir mal —");
    p = await registrar("VENTAS-JEFES DE PROD");
    S.cargadoComoJefatura = false;
    elegirTipo(p, "JEFATURA");
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(250);

    ok("pedir jefatura sin serlo no registra a nadie", S.yaRegistrado, false);
    ok("lo dice con el mensaje del backend",
       toasts(p.doc).some((t) => t.includes("jefatura de ninguna familia")), true);
    ok("y deja corregir", p.doc.getElementById("btn-registrar").disabled, false);
    ok("sin pasar a la pantalla de exito", p.doc.getElementById("resultado").classList.contains("hidden"), true);

    elegirTipo(p, "ESPECIALISTA");
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(250);
    ok("corregido, registra", S.yaRegistrado, true);

    p = await registrar("VENTAS-JEFES DE PROD");
    S.yaRegistrado = true;
    elegirTipo(p, "ESPECIALISTA");
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(250);
    ok("si ya estaba registrado, al panel", p.destinos, ["/main.html"]);

    p = await registrar("VENTAS-JEFES DE PROD");
    llamadas = [];
    elegirTipo(p, "ESPECIALISTA");
    enviar(p, p.doc.getElementById("form-registro"));
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(250);
    /* El segundo envio daria 409 y mandaria al panel antes de leer el resultado. */
    ok("un doble clic registra una sola vez",
       llamadas.filter((l) => l.url.endsWith("/login/registro/completado")).length, 1);
    ok("y se queda en el resultado", p.destinos, []);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
