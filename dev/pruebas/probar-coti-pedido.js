/**
 * Prueba de «Pasar una cotizacion a pedido» (docs/coti-a-pedido.md, 18/11/2026).
 *
 * Recorre las paginas reales (cotizacion/cotizacion_pedido.html y, por el cambio de la seccion 9,
 * cotizacion/cotizacion_almacen.html) contra el simulacro compartido dev/simulador-coti-pedido.js:
 *
 *   · la lista: Hoy / 3 / 6 dias sin contar el domingo (6, el plazo entero, por defecto), solo las `cotizado`,
 *     «aprobada» / «sin aprobar»; la de mas de 5 dias, `coti fuera de plazo`
 *   · `opciones`: el motivo cuando no se puede, el pedido que ya genero
 *   · el formulario: tipo de entrega, transportista fijo o buscado, direcciones filtradas, consignatario
 *   · lo que viaja al convertir, la confirmacion y el pedido creado
 *   · los rechazos: 400 transportista/direccion, 409 ya convertida, 500 reintentable, sin red
 *   · el permiso, ?ncoti=, y que Almacen ya ofrece las aprobadas
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const cpSim = require("../simulador-coti-pedido");

const S = marcasSim.estado;
const RAIZ = path.resolve(__dirname, "..", "..");
const HOY = "2026-11-18";

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
let sinRed = false;          // la proxima conversion no llega
let retener = null;          // { soltar }: la proxima conversion espera a que se suelte

const ACCESOS_COTI = ["crear", "leer", "update", "delete", "alm"];

function respuesta(obj, status) {
    const cuerpo = JSON.stringify(JSON.stringify(obj));     // doble, como el backend real
    return Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(cuerpo)
    });
}

function responder(url, opciones) {
    const ruta = url.replace(/^https?:\/\/[^/]+\/v1/, "").split("?")[0];
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : null;
    llamadas.push({ ruta, cuerpo });

    if (ruta === "/vendedor") {
        return respuesta({ status: "ok", codigo: 0, data: { cotizacion: "x" }, nombre: "FIORELLA BENITES", tipo: S.rol });
    }
    if (ruta === "/cotizacion") {
        return respuesta({ status: "ok", codigo: 0, data: S.rol === "ZONA" ? ACCESOS_COTI : ACCESOS_COTI.concat(["pedido"]) });
    }
    if (ruta === "/lista/cotisxdia") {
        /* Las del simulacro y una facturada, que ninguna de las dos pantallas debe ofrecer. */
        const enRango = !cuerpo.dia && cuerpo.desde <= "2026-11-17" && "2026-11-17" <= cuerpo.hasta;
        const filas = cpSim.filas(cuerpo, HOY).concat(
            enRango ? [{ 0: "2026/11/17", 1: "009-00970988", 2: "YA FACTURADA S.A.C.", 3: 3210, 4: "S",
                         5: "2026-11-17 09:40:22", 6: "facturado", 7: 0 }] : []);
        const salida = {};
        filas.forEach((f, i) => { salida[i] = f; });
        return respuesta(salida);
    }

    const RUTAS = {
        "/cotizacion/pedido/opciones": cpSim.opciones,
        "/cotizacion/pedido/transportista": cpSim.transportista,
        "/cotizacion/pedido": cpSim.convertir
    };
    if (RUTAS[ruta]) {
        if (ruta === "/cotizacion/pedido" && sinRed) {
            sinRed = false;
            return Promise.reject(new TypeError("Failed to fetch"));
        }
        if (ruta === "/cotizacion/pedido" && retener) {
            const r = retener;
            retener = null;
            return new Promise((res) => { r.soltar = () => { const x = RUTAS[ruta](cuerpo); res(respuesta(x.cuerpo, x.status)); }; });
        }
        const r = RUTAS[ruta](cuerpo);
        return respuesta(r.cuerpo, r.status);
    }

    return respuesta({ msg: "no simulado: " + ruta }, 404);
}

/* =====================================================================
 * Montar la pagina real
 * =================================================================== */
function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar(pagina, consulta, ahora) {
    let html = leer(pagina);
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, { url: "http://127.0.0.1:8080/" + pagina + (consulta || ""), runScripts: "outside-only", pretendToBeVisual: true });
    const w = dom.window;

    /* El miercoles 18/11/2026 a las 9 (u otro `ahora`): la lista pide fechas relativas a hoy. */
    const Real = w.Date;
    const t = (ahora || new Date(2026, 10, 18, 9)).getTime();
    w.Date = class extends Real {
        constructor(...a) { if (a.length) super(...a); else super(t); }
        static now() { return t; }
    };

    const avisos = [];
    w.console.warn = (...a) => { avisos.push(a.join(" ")); };
    w.console.error = () => {};
    w.fetch = (url, opciones) => responder(String(url), opciones);
    w.HTMLElement.prototype.scrollIntoView = function () {};

    for (const rel of scripts) {
        try { w.eval(leer(rel)); }
        catch (e) { console.log(`  FALLA  ${rel}: ${e.message}`); fallos++; }
    }

    await pausa(30);
    return { w, doc: w.document, avisos };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
const sinNbsp = (t) => t.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);
/** Etiqueta y valor van en dos span seguidos: se leen separados por un espacio. */
const partes = (n) => (n ? [...n.children].map((h) => texto(h)).join(" ") : null);
const $ = (p, id) => p.doc.getElementById(id);
const visible = (n) => !!n && !n.classList.contains("hidden");

const filas = (p) => [...p.doc.querySelectorAll("#lista-cotis .cdk-articulo")];
const ndocuDe = (f) => texto(f.querySelector(".cdk-articulo__detalle")).split(" ")[0];
const ndocus = (p) => filas(p).map(ndocuDe);
const marcaDe = (p, ndocu) => {
    const f = filas(p).find((x) => ndocuDe(x) === ndocu);
    return f ? [...f.querySelectorAll(".cdk-dato")].map((n) => texto(n)) : null;
};
async function abrirFila(p, ndocu) {
    clic(p, filas(p).find((x) => ndocuDe(x) === ndocu));
    await pausa(20);
}

const modal = (p) => ({ titulo: texto(p.doc.querySelector(".cdk-modal__titulo")), mensaje: texto(p.doc.querySelector(".cdk-modal__mensaje")) });
async function botonModal(p, cual) {
    const b = p.doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    clic(p, cual === "confirmar" ? b[b.length - 1] : b[0]);
    await pausa(30);
}
const hayModal = (p) => !!p.doc.querySelector(".cdk-modal__titulo");

const de = (ruta) => llamadas.filter((l) => l.ruta === ruta);
const ultima = (ruta) => { const l = de(ruta); return l.length ? l[l.length - 1].cuerpo : null; };
const opcionesDe = (p, id) => [...p.doc.querySelectorAll("#" + id + " .cdk-opcion__texto")].map((n) => texto(n));
async function elegirOpcion(p, id, textoOpcion) {
    const b = [...p.doc.querySelectorAll("#" + id + " .cdk-opcion")].find((n) => texto(n.querySelector(".cdk-opcion__texto")) === textoOpcion);
    clic(p, b);
    await pausa(10);
}
async function escribir(p, id, valor, espera) {
    const n = $(p, id);
    n.value = valor;
    n.dispatchEvent(new p.w.Event("input", { bubbles: true }));
    await pausa(espera || 10);
}
async function enviar(p) {
    $(p, "form-pedido").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(20);
}

function preparar(rol) {
    marcasSim.reiniciar(rol || "CARTERA");
    cpSim.reiniciar();
    llamadas = [];
    sinRed = false;
    retener = null;
}

const DIR_AREQUIPA = "CAL.GARCIA DE CARBAJAL 600 URB. IV CENTENARIO-AREQUIPA-AREQUIPA";
const SHALOM = "TRANSPORTES \"SHALOM EXPRESS S.A.C.\"";

(async () => {

    /* =================================================================
     * El catalogo
     * =============================================================== */
    console.log("\n— el acceso en el catalogo —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");
        const acc = p.w.CDK.catalogo.acceso("cotizacion", "pedido");
        ok("`pedido` existe en el modulo cotizacion", acc && acc.existe, true);
        ok("etiqueta", acc.etiqueta, "Pasar a pedido");
        ok("lleva a cotizacion/cotizacion_pedido.html", /\/cotizacion\/cotizacion_pedido\.html$/.test(acc.href), true);
        ok("la pagina existe", fs.existsSync(path.join(RAIZ, "cotizacion/cotizacion_pedido.html")), true);

        const ver = leer("js/cotizacion/ver_cotizacion.js");
        ok("«Ver» ofrece el atajo `pedido`", /var ATAJOS = \[[^\]]*"pedido"/.test(ver), true);
        ok("y ATAJOS se declara una sola vez", (ver.match(/var ATAJOS/g) || []).length, 1);
    }

    /* =================================================================
     * La lista
     * =============================================================== */
    console.log("\n— la lista: 6 dias sin domingo (el plazo), solo las que siguen siendo cotizacion —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");

        /* Miercoles 18/11: hoy y 5 dias atras saltando el domingo 15 -> mar 17, lun 16, sab 14, vie 13, jue 12. */
        ok("pide el plazo entero: desde el jueves 12 (el domingo 15 no cuenta)", de("/lista/cotisxdia")[0].cuerpo, { desde: "2026-11-12", hasta: HOY });
        ok("«6 dias» marcado", [$(p, "btn-seis").getAttribute("aria-pressed"), $(p, "btn-seis").className],
           ["true", "cdk-boton cdk-boton--primario"]);
        ok("«Hoy» y «3 dias» no", [$(p, "btn-hoy").getAttribute("aria-pressed"), $(p, "btn-tres").getAttribute("aria-pressed")], ["false", "false"]);
        ok("no quedan botones de 7 ni 30 dias", [$(p, "btn-siete"), $(p, "btn-treinta")], [null, null]);
        ok("solo las `cotizado`, la mas reciente primero (sin la convertida, la facturada ni la fuera de plazo)", ndocus(p),
           ["009-00971087", "009-00969917", "098-00000056", "098-00000055", "098-00000058", "098-00000057", "098-00000059"]);
        ok("el simulacro salta el domingo: la de 3 dias es del sabado 14", cpSim.filas({ dia: "2026-11-14" }, HOY).map((f) => f[1]), ["098-00000058"]);
        ok("y la fuera de plazo (con la convertida) es del miercoles 11", cpSim.filas({ dia: "2026-11-11" }, HOY).map((f) => f[1]), ["098-00000060", "098-00000050"]);
        ok("la sin aprobar se marca", marcaDe(p, "009-00971087"), ["sin aprobar"]);
        ok("las demas, aprobadas", marcaDe(p, "098-00000055"), ["aprobada"]);

        clic(p, $(p, "btn-hoy"));
        await pausa(20);
        ok("Hoy pide el dia", ultima("/lista/cotisxdia"), { dia: HOY });
        ok("Hoy: las dos de hoy", ndocus(p), ["009-00971087", "009-00969917"]);

        clic(p, $(p, "btn-tres"));
        await pausa(20);
        ok("3 dias: hoy, ayer y anteayer", ultima("/lista/cotisxdia"), { desde: "2026-11-16", hasta: HOY });
        ok("3 dias marcado", $(p, "btn-tres").getAttribute("aria-pressed"), "true");
        ok("3 dias: las de hasta 2 dias", ndocus(p), ["009-00971087", "009-00969917", "098-00000056", "098-00000055"]);
    }

    console.log("\n— 3 y 6 dias un lunes: el domingo no cuenta —");
    {
        preparar();
        cpSim.estado.cotis = {};      // solo interesa lo que se pide
        const p = await montar("cotizacion/cotizacion_pedido.html", "", new Date(2026, 10, 30, 9));
        ok("6 dias desde el lunes 30: sab 28, vie 27, jue 26, mie 25, mar 24", de("/lista/cotisxdia")[0].cuerpo, { desde: "2026-11-24", hasta: "2026-11-30" });
        clic(p, $(p, "btn-tres"));
        await pausa(20);
        ok("3 dias desde el lunes 30: sab 28, vie 27", ultima("/lista/cotisxdia"), { desde: "2026-11-27", hasta: "2026-11-30" });
        ok("sin ninguna, lo dice", texto($(p, "lista-cotis")), "No tienes cotizaciones en los últimos 3 días. Prueba con 6.");
        clic(p, $(p, "btn-seis"));
        await pausa(20);
        ok("y con 6, que las mas antiguas ya no se pasan", texto($(p, "lista-cotis")),
           "No tienes cotizaciones en los últimos 6 días, sin contar el domingo. Las más antiguas ya no se pueden pasar a pedido.");
    }

    /* =================================================================
     * Provincia, con transportista buscado: el ejemplo de la seccion 6
     * =============================================================== */
    console.log("\n— provincia: la 098-00000056 por SHALOM —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");
        await abrirFila(p, "098-00000056");

        ok("pregunta a opciones con el numero con serie", ultima("/cotizacion/pedido/opciones"), { ndocu: "098-00000056" });
        ok("se esconde la lista y se ve el despacho", [visible($(p, "seccion-elegir")), visible($(p, "seccion-pedido"))], [false, true]);
        ok("el cliente", texto($(p, "pedido-cliente")), "COMPUDISKETT S.R.L.");
        ok("el numero y el total", texto($(p, "pedido-documento")),
           sinNbsp("098-00000056 · " + p.w.CDK.formato.moneda(28.31, "D") + " con IGV"));
        ok("los tres tipos de entrega", [...p.doc.querySelectorAll("#entregas .cdk-pestana")].map((n) => texto(n)), ["Ventanilla", "Lima", "Provincia"]);
        ok("ninguno elegido de entrada", p.doc.querySelectorAll("#entregas .es-activa").length, 0);
        ok("sin tipo, no se pide transportista", visible($(p, "campo-transportista")), false);
        ok("el plazo: le quedan 4 (tiene 1 dia)", [texto($(p, "pedido-plazo")), $(p, "pedido-plazo").className],
           ["Te quedan 4 días más para pasarla a pedido, sin contar el domingo.", "cdk-pista"]);
        ok("el consignatario viene sugerido", $(p, "consig").value, "MARIA LOPEZ");
        ok("y se corta a 60", $(p, "consig").getAttribute("maxlength"), "60");
        ok("las 25 direcciones", opcionesDe(p, "direcciones").length, 25);
        ok("lo dice", texto($(p, "campo-direccion").querySelector(".cdk-campo__ayuda")),
           "25 direcciones registradas del cliente. Solo se puede elegir una de ellas.");
        ok("ofrece cambiar el almacen antes", /cotizacion_almacen\.html\?ncoti=098-00000056$/.test($(p, "pedido-almacen").href), true);

        await escribir(p, "filtro-direccion", "arequipa");
        ok("el filtro, sin distinguir mayusculas", opcionesDe(p, "direcciones").length, 3);
        await escribir(p, "filtro-direccion", "republica");
        ok("ni tildes", opcionesDe(p, "direcciones"), ["AV. REPÚBLICA DE CHILE NRO.504 JESUS MARIA (LIMA-PERU)"]);
        await escribir(p, "filtro-direccion", "zzz");
        ok("sin coincidencias lo dice", texto($(p, "direcciones-vacio")), "Ninguna dirección registrada con «zzz».");

        await enviar(p);
        ok("sin nada elegido: pide el tipo", [visible($(p, "error-entrega")), texto($(p, "error-entrega"))], [true, "Elige el tipo de entrega."]);
        ok("y la direccion", [visible($(p, "error-direccion")), texto($(p, "error-direccion"))], [true, "Elige la dirección de entrega."]);
        ok("no confirma ni convierte", [hayModal(p), de("/cotizacion/pedido").length], [false, 0]);

        clic(p, $(p, "entrega-4"));
        await pausa(20);
        ok("provincia queda marcada", [$(p, "entrega-4").classList.contains("es-activa"), $(p, "entrega-4").getAttribute("aria-pressed")], [true, "true"]);
        ok("se quita el error del tipo", visible($(p, "error-entrega")), false);
        ok("aparece el buscador de transportista", [visible($(p, "campo-transportista")), !!$(p, "buscar-transportista")], [true, true]);
        ok("busca sin texto de entrada", ultima("/cotizacion/pedido/transportista"), { sugerencia: "" });
        ok("cinco", opcionesDe(p, "transportistas").length, 5);
        ok("y dice que hay mas", texto($(p, "transportistas-mas")), "Hay 10 activos y se muestran 5: escribe más del nombre para encontrar el tuyo.");

        await escribir(p, "buscar-transportista", "shalom", 400);
        ok("busca lo escrito", ultima("/cotizacion/pedido/transportista"), { sugerencia: "shalom" });
        ok("encuentra a SHALOM", opcionesDe(p, "transportistas"), [SHALOM]);
        ok("sin aviso de mas", $(p, "transportistas-mas"), null);
        await escribir(p, "buscar-transportista", "antiguos", 400);
        ok("un inactivo no sale", texto($(p, "transportistas-vacio")), "Ningún transportista activo con «antiguos».");

        await enviar(p);
        ok("provincia sin transportista: lo pide", texto($(p, "error-transportista")), "En provincia hay que elegir el transportista.");

        await escribir(p, "buscar-transportista", "shalom", 400);
        await elegirOpcion(p, "transportistas", SHALOM);
        ok("queda elegido, con su codigo", [texto($(p, "transportista-elegido").querySelector(".cdk-elegido__nombre")),
                                            texto($(p, "transportista-elegido").querySelector(".cdk-elegido__detalle"))], [SHALOM, "T0106"]);
        ok("y se puede cambiar", !!$(p, "transportista-elegido-cambiar"), true);

        await escribir(p, "filtro-direccion", "garcia");
        await elegirOpcion(p, "direcciones", DIR_AREQUIPA);
        ok("la direccion elegida", texto($(p, "direccion-elegida").querySelector(".cdk-elegido__nombre")), DIR_AREQUIPA);
        ok("y se puede cambiar", !!$(p, "direccion-elegida-cambiar"), true);

        $(p, "obse").value = "  recoge en agencia ";
        await enviar(p);
        ok("confirma antes", modal(p).titulo, "¿Pasar la 098-00000056 a pedido?");
        ok("con lo que va a pasar", modal(p).mensaje, sinNbsp(
            "Se crea un pedido con todas sus líneas y precios, por " + p.w.CDK.formato.moneda(28.31, "D") + " con IGV. " +
            "Entrega: Provincia, por " + SHALOM + ", en " + DIR_AREQUIPA + ". El pedido queda pendiente de aprobación, " +
            "y la cotización ya no se podrá modificar, dar de baja ni volver a pasar."));
        await botonModal(p, "cancelar");
        ok("«Revisar» no convierte", de("/cotizacion/pedido").length, 0);

        await enviar(p);
        await botonModal(p, "confirmar");
        ok("lo que viaja: con codtra en provincia, el texto de la direccion tal cual", ultima("/cotizacion/pedido"),
           { ndocu: "098-00000056", tipent: 4, dirent: DIR_AREQUIPA, consig: "MARIA LOPEZ", obse: "recoge en agencia", codtra: "T0106" });

        ok("el pedido creado", texto($(p, "creado-numero")), "Pedido 098-00000003 creado");
        ok("pendiente de aprobacion", texto($(p, "creado-pendiente")),
           "Queda pendiente de aprobación: lo aprueban en el ERP, como cualquier pedido, y hasta entonces no separa stock.");
        ok("los totales", [...p.doc.querySelectorAll("#pedido-creado .cdk-total")].map((n) => partes(n)), [
            sinNbsp("2 líneas · sin IGV " + p.w.CDK.formato.moneda(23.99, "D")),
            sinNbsp("IGV " + p.w.CDK.formato.moneda(4.32, "D")),
            sinNbsp("Total " + p.w.CDK.formato.moneda(28.31, "D"))]);
        ok("el transportista", partes($(p, "creado-transportista")), "Transportista " + SHALOM + " · T0106");
        ok("la observacion grabada, como la arma el backend", partes($(p, "creado-obse")),
           "Observación grabada ATC.MARIA LOPEZ transporte. " + SHALOM + " obse.recoge en agencia");
        ok("la cabecera dice en que quedo", texto($(p, "pedido-documento")), "098-00000056 → pedido 098-00000003");
        ok("recarga la lista: ya no la ofrece", ndocus(p).indexOf("098-00000056"), -1);

        clic(p, $(p, "btn-pasar-otra"));
        await pausa(10);
        ok("«Pasar otra» vuelve a la lista", [visible($(p, "seccion-elegir")), visible($(p, "seccion-pedido"))], [true, false]);
    }

    /* =================================================================
     * Ventanilla y Lima: transportista fijo
     * =============================================================== */
    console.log("\n— Lima: T0001 fijo, sin codtra —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");
        await abrirFila(p, "098-00000055");

        clic(p, $(p, "entrega-3"));
        await pausa(10);
        ok("Compudiskett fijo", texto($(p, "transportista-elegido").querySelector(".cdk-elegido__nombre")), "COMPUDISKETT S.R.L.");
        ok("dice por que", texto($(p, "transportista-elegido").querySelector(".cdk-elegido__detalle")), "En ventanilla y Lima va fijo (T0001): no se elige.");
        ok("sin «Cambiar» ni buscador", [$(p, "transportista-elegido-cambiar"), $(p, "buscar-transportista")], [null, null]);
        ok("no busca transportistas", de("/cotizacion/pedido/transportista").length, 0);

        clic(p, $(p, "entrega-4"));
        await pausa(20);
        ok("de Lima a provincia el fijo se suelta", [!!$(p, "buscar-transportista"), $(p, "transportista-elegido")], [true, null]);
        clic(p, $(p, "entrega-1"));
        await pausa(10);
        ok("a ventanilla, fijo otra vez", texto($(p, "transportista-elegido").querySelector(".cdk-elegido__nombre")), "COMPUDISKETT S.R.L.");
        clic(p, $(p, "entrega-3"));
        await pausa(10);
        ok("una sola pestaña activa", [...p.doc.querySelectorAll("#entregas .es-activa")].map((n) => n.id), ["entrega-3"]);

        await elegirOpcion(p, "direcciones", "AV. JAVIER PRADO ESTE 4200 SANTIAGO DE SURCO (LIMA)");
        $(p, "consig").value = "";
        await enviar(p);
        ok("la confirmacion no nombra transportista", /Entrega: Lima, en AV\. JAVIER PRADO/.test(modal(p).mensaje), true);
        await botonModal(p, "confirmar");
        ok("Lima: sin codtra, consignatario vacio", ultima("/cotizacion/pedido"),
           { ndocu: "098-00000055", tipent: 3, dirent: "AV. JAVIER PRADO ESTE 4200 SANTIAGO DE SURCO (LIMA)", consig: "", obse: "" });
        ok("creado", texto($(p, "creado-numero")), "Pedido 098-00000003 creado");
        ok("transportista del backend", partes($(p, "creado-transportista")), "Transportista COMPUDISKETT S.R.L. · T0001");
        ok("sin consignatario: la observacion grabada va sin `ATC.`", partes($(p, "creado-obse")), "Observación grabada obse.");
        ok("y no se inventa la fila del consignatario", $(p, "creado-consig"), null);
    }

    /* =================================================================
     * Una sola direccion, y ninguna
     * =============================================================== */
    console.log("\n— una sola direccion; ninguna —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");
        await abrirFila(p, "009-00969917");
        ok("con una, ya elegida", texto($(p, "direccion-elegida").querySelector(".cdk-elegido__nombre")), "AV. LOS FRUTALES 220 ATE (LIMA)");
        ok("lo dice y no ofrece cambiar", [texto($(p, "direccion-elegida").querySelector(".cdk-elegido__detalle")), $(p, "direccion-elegida-cambiar")],
           ["La única registrada del cliente.", null]);
        ok("sin atencion, consignatario vacio", $(p, "consig").value, "");
        ok("de hoy: le quedan 5", texto($(p, "pedido-plazo")), "Te quedan 5 días más para pasarla a pedido, sin contar el domingo.");

        clic(p, $(p, "btn-otra"));
        await pausa(10);
        await abrirFila(p, "098-00000059");
        ok("con 5 dias, el ultimo: destacado", [texto($(p, "pedido-plazo")), $(p, "pedido-plazo").className],
           ["Hoy es el último día para pasarla a pedido.", "cdk-aviso"]);

        clic(p, $(p, "btn-otra"));
        await pausa(10);
        cpSim.estado.cotis["098-00000058"].dias = 4;
        await abrirFila(p, "098-00000058");
        ok("con 4, en singular", texto($(p, "pedido-plazo")), "Te queda 1 día más para pasarla a pedido, sin contar el domingo.");

        /* Un backend sin los campos nuevos: no se dice nada del plazo. */
        clic(p, $(p, "btn-otra"));
        await pausa(10);
        const original = cpSim.opciones;
        cpSim.opciones = (d) => { const r = original(d); delete r.cuerpo.antiguedad; delete r.cuerpo.plazo; return r; };
        try { await abrirFila(p, "098-00000055"); }
        finally { cpSim.opciones = original; }
        ok("sin `antiguedad` ni `plazo`, nada del plazo", [$(p, "pedido-plazo"), !!$(p, "form-pedido")], [null, true]);

        clic(p, $(p, "btn-otra"));
        await pausa(10);
        await abrirFila(p, "098-00000059");
        ok("sin direcciones: el aviso", texto($(p, "sin-direcciones")),
           "El cliente no tiene direcciones registradas. Hay que registrarlas en el ERP antes de pasarla a pedido.");
        clic(p, $(p, "entrega-1"));
        await enviar(p);
        ok("y no deja convertir", [texto($(p, "error-direccion")), hayModal(p)], ["Sin una dirección registrada no se puede crear el pedido.", false]);
    }

    /* =================================================================
     * Cuando no se puede
     * =============================================================== */
    console.log("\n— no convertibles: el motivo, sin formulario —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");

        await abrirFila(p, "009-00971087");
        ok("sin aprobar", texto($(p, "pedido-motivo")), "Todavía no está aprobada. Cuando la aprueben en el ERP la podrás pasar a pedido.");
        ok("sin formulario", $(p, "form-pedido"), null);

        clic(p, $(p, "btn-otra"));
        await abrirFila(p, "098-00000057");
        ok("en ajuste", texto($(p, "pedido-motivo")), "Está en ajuste de precio con el grupo 25. Cuando terminen el ajuste la podrás pasar a pedido.");

        clic(p, $(p, "btn-otra"));
        $(p, "ncoti").value = "098-00000050";
        $(p, "form-buscar").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
        await pausa(20);
        ok("por numero, la convertida", texto($(p, "pedido-motivo").querySelector("p")),
           "Ya generó un documento, así que no se puede volver a pasar a pedido.");
        ok("y lo que genero", texto($(p, "pedido-generado")), "Generó el pedido 098-00000001.");
        ok("sin lista, el cliente viene de opciones", texto($(p, "pedido-cliente")), "COMPUDISKETT S.R.L.");

        clic(p, $(p, "btn-otra"));
        $(p, "ncoti").value = "009-00969000";
        $(p, "form-buscar").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
        await pausa(20);
        ok("la facturada: la factura con su serie, como la guarda el ERP", texto($(p, "pedido-generado")), "Generó la factura F009-0648731.");

        clic(p, $(p, "btn-otra"));
        $(p, "ncoti").value = "009-00970100";
        $(p, "form-buscar").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
        await pausa(20);
        ok("la anulada", texto($(p, "pedido-motivo")), "Fue dada de baja: ya no se puede pasar a pedido.");

        clic(p, $(p, "btn-otra"));
        $(p, "ncoti").value = "098-00000060";
        $(p, "form-buscar").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
        await pausa(20);
        ok("por numero, la de 6 dias: fuera de plazo", texto($(p, "pedido-motivo")),
           "Tiene más de 5 días, sin contar el domingo: ya no se puede pasar a pedido. Si el cliente la quiere, haz una cotización nueva.");
        ok("sin formulario", $(p, "form-pedido"), null);

        clic(p, $(p, "btn-otra"));
        const antes = de("/cotizacion/pedido/opciones").length;
        $(p, "ncoti").value = "55";
        $(p, "form-buscar").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
        await pausa(20);
        ok("sin serie no viaja", de("/cotizacion/pedido/opciones").length, antes);
        ok("y lo dice", texto(p.doc.querySelector(".cdk-toast__texto")), "Escribe el número con su serie, por ejemplo 098-00000055");

        $(p, "ncoti").value = "009-00000001";
        $(p, "form-buscar").dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
        await pausa(20);
        ok("de otro vendedor: el msg del backend", texto($(p, "pedido-cuerpo").querySelector(".cdk-estado__texto")),
           "la cotizacion no existe o no pertenece a este vendedor");
        ok("sin «Reintentar» (es un 403)", $(p, "pedido-cuerpo").querySelector(".cdk-boton"), null);
    }

    /* =================================================================
     * Rechazos al convertir
     * =============================================================== */
    console.log("\n— 500 pedido no creado: se reintenta sin perder nada —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");
        await abrirFila(p, "098-00000058");
        clic(p, $(p, "entrega-1"));
        await elegirOpcion(p, "direcciones", "AV. EL SOL 120 WANCHAQ-CUSCO");
        await enviar(p);
        await botonModal(p, "confirmar");
        ok("el titulo", modal(p).titulo, "No se creó el pedido");
        ok("el msg y que no quedo nada a medias", modal(p).mensaje,
           "no se pudo grabar el pedido; se revirtio todo. No quedó nada a medias: la cotización está como estaba. " +
           "Vuelve a intentarlo y, si se repite, avisa a sistemas.");
        await botonModal(p, "confirmar");
        ok("lo elegido sigue ahi", [texto($(p, "direccion-elegida").querySelector(".cdk-elegido__nombre")),
                                    $(p, "entrega-1").classList.contains("es-activa"), $(p, "btn-convertir").disabled],
           ["AV. EL SOL 120 WANCHAQ-CUSCO", true, false]);
        await enviar(p);
        await botonModal(p, "confirmar");
        ok("al reintentar, sale", texto($(p, "creado-numero")), "Pedido 098-00000003 creado");
        ok("en soles", partes(p.doc.querySelector("#pedido-creado .cdk-total--principal")), sinNbsp("Total " + p.w.CDK.formato.moneda(3217, "S")));
    }

    console.log("\n— 409 ya convertida (otro la paso antes) —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");
        await abrirFila(p, "098-00000055");
        clic(p, $(p, "entrega-3"));
        await elegirOpcion(p, "direcciones", "AV. ARGENTINA 3093 CALLAO");
        cpSim.convertir({ ndocu: "098-00000055", tipent: 1, dirent: "AV. ARGENTINA 3093 CALLAO" });    // la paso alguien mas
        const listas = de("/lista/cotisxdia").length;
        await enviar(p);
        await botonModal(p, "confirmar");
        ok("lo dice", [modal(p).titulo, modal(p).mensaje], ["Ya se pasó a pedido", "la cotizacion ya genero un pedido, factura o boleta"]);
        await botonModal(p, "confirmar");
        await pausa(20);
        ok("vuelve a preguntar: el pedido que genero", texto($(p, "pedido-generado")), "Generó el pedido 098-00000003.");
        ok("y recarga la lista", de("/lista/cotisxdia").length, listas + 1);
    }

    console.log("\n— 409 fuera de plazo (se abrio a tiempo y se convirtio pasada la medianoche) —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");
        await abrirFila(p, "098-00000059");
        ok("la de 5 dias todavia se ofrece", visible($(p, "seccion-pedido")), true);
        clic(p, $(p, "btn-otra"));
        await abrirFila(p, "098-00000055");
        clic(p, $(p, "entrega-3"));
        await elegirOpcion(p, "direcciones", "AV. ARGENTINA 3093 CALLAO");
        cpSim.estado.cotis["098-00000055"].dias = 6;      // dieron las 12
        const listas = de("/lista/cotisxdia").length;
        await enviar(p);
        await botonModal(p, "confirmar");
        ok("lo dice", [modal(p).titulo, modal(p).mensaje], ["Se pasó el plazo", "la cotizacion tiene mas de 5 dias sin contar el domingo"]);
        await botonModal(p, "confirmar");
        await pausa(20);
        ok("vuelve a preguntar: el motivo, sin formulario", [texto($(p, "pedido-motivo")), $(p, "form-pedido")],
           ["Tiene más de 5 días, sin contar el domingo: ya no se puede pasar a pedido. Si el cliente la quiere, haz una cotización nueva.", null]);
        ok("y recarga la lista", de("/lista/cotisxdia").length, listas + 1);
    }

    console.log("\n— 400 transportista y direccion —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");
        await abrirFila(p, "098-00000055");
        clic(p, $(p, "entrega-4"));
        await pausa(20);
        await elegirOpcion(p, "transportistas", "OLVA COURIER S.A.C.");
        await elegirOpcion(p, "direcciones", DIR_AREQUIPA);

        cpSim.estado.forzar = { status: 400, nombre: "transportista invalido", msg: "el transportista no esta activo" };
        await enviar(p);
        await botonModal(p, "confirmar");
        ok("transportista: el titulo y el msg", [modal(p).titulo, modal(p).mensaje], ["Elige el transportista", "el transportista no esta activo"]);
        await botonModal(p, "confirmar");
        await pausa(20);
        ok("lo suelta y pide otro", [$(p, "transportista-elegido"), !!$(p, "buscar-transportista"), texto($(p, "error-transportista"))],
           [null, true, "Elige otro transportista de la lista."]);
        ok("la direccion sigue elegida", texto($(p, "direccion-elegida").querySelector(".cdk-elegido__nombre")), DIR_AREQUIPA);

        await elegirOpcion(p, "transportistas", "OLVA COURIER S.A.C.");
        cpSim.estado.forzar = { status: 400, nombre: "direccion invalida", msg: "" };
        await enviar(p);
        await botonModal(p, "confirmar");
        ok("direccion: sin msg, el de respaldo", [modal(p).titulo, modal(p).mensaje],
           ["Elige una dirección de la lista", "La dirección tiene que ser una de las registradas del cliente."]);
        await botonModal(p, "confirmar");
        ok("la suelta y pide otra", [$(p, "direccion-elegida"), !!$(p, "filtro-direccion"), texto($(p, "error-direccion"))],
           [null, true, "Elige una de las direcciones registradas."]);
        ok("el transportista sigue", texto($(p, "transportista-elegido").querySelector(".cdk-elegido__nombre")), "OLVA COURIER S.A.C.");
    }

    console.log("\n— sin red, y mientras viaja —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_pedido.html");
        await abrirFila(p, "098-00000055");
        clic(p, $(p, "entrega-1"));
        await elegirOpcion(p, "direcciones", "AV. ARGENTINA 3093 CALLAO");

        sinRed = true;
        await enviar(p);
        await botonModal(p, "confirmar");
        ok("sin respuesta: que reintentar no duplica", /si el pedido ya se hubiera creado, te lo diremos en vez de crear otro/.test(modal(p).mensaje), true);
        await botonModal(p, "confirmar");

        retener = {};
        const r = retener;
        await enviar(p);
        await botonModal(p, "confirmar");
        ok("mientras viaja: boton ocupado y sin «Elegir otra»", [$(p, "btn-convertir").disabled, texto($(p, "btn-convertir")), $(p, "btn-otra").disabled],
           [true, "Creando el pedido…", true]);
        r.soltar();
        await pausa(30);
        ok("al llegar, creado y «Elegir otra» de vuelta", [texto($(p, "creado-numero")), $(p, "btn-otra").disabled], ["Pedido 098-00000003 creado", false]);
    }

    /* =================================================================
     * Permiso y ?ncoti=
     * =============================================================== */
    console.log("\n— permiso y llegada desde «Ver» —");
    {
        preparar("ZONA");
        const p = await montar("cotizacion/cotizacion_pedido.html");
        ok("grupo 34: lo dice", texto($(p, "lista-cotis").querySelector(".cdk-estado__texto")),
           "Tu grupo no puede pasar cotizaciones a pedido. Si crees que debería, avisa al equipo de sistemas.");
        ok("no pide la lista", de("/lista/cotisxdia").length, 0);
        ok("ni ofrece periodo ni buscar", [visible(p.doc.querySelector("#seccion-elegir [role=group]")), visible(p.doc.querySelector("details"))], [false, false]);

        preparar("JEFATURA");
        const q = await montar("cotizacion/cotizacion_pedido.html", "?ncoti=098-00000055");
        ok("grupo 25 con ?ncoti=: abre esa", [ultima("/cotizacion/pedido/opciones"), visible($(q, "seccion-pedido")), !!$(q, "form-pedido")],
           [{ ndocu: "098-00000055" }, true, true]);
        ok("sin la lista, rotulo con el numero", texto($(q, "pedido-documento")), "098-00000055");
    }

    /* =================================================================
     * Almacen: desde el 18/11 tambien las aprobadas (seccion 9)
     * =============================================================== */
    console.log("\n— Almacen ofrece las aprobadas —");
    {
        preparar();
        const p = await montar("cotizacion/cotizacion_almacen.html");
        ok("sigue pidiendo el dia (Hoy / 2 dias de siempre)", de("/lista/cotisxdia")[0].cuerpo, { dia: HOY });
        ok("Hoy marcado como en el HTML", [$(p, "btn-hoy").getAttribute("aria-pressed"), $(p, "btn-hoy").className], ["true", "cdk-boton cdk-boton--primario"]);
        ok("la aprobada sale", ndocus(p), ["009-00971087", "009-00969917"]);
        ok("marcada como aprobada", marcaDe(p, "009-00969917"), ["aprobada"]);
        ok("la abierta, sin marca", marcaDe(p, "009-00971087"), []);
        clic(p, $(p, "btn-dos-dias"));
        await pausa(20);
        ok("2 dias: desde ayer", ultima("/lista/cotisxdia"), { desde: "2026-11-17", hasta: HOY });
        ok("ni la facturada ni la convertida", ndocus(p), ["009-00971087", "009-00969917", "098-00000056"]);
        ok("el texto ya no dice «aún no aprobadas»", /Se puede cambiar aunque la cotización ya esté aprobada/.test(texto(p.doc.querySelector(".cdk-seccion__sub"))), true);
    }

    console.log(fallos ? `\n${fallos} FALLA(S)` : "\nTodo bien");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.log(" FALLA", e && e.stack || e); process.exit(1); });
