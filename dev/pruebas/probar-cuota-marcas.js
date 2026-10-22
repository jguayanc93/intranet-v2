/**
 * Prueba de integracion de la cuota por marca (grupo 25), sobre las paginas reales.
 *
 * Lo que mas importa:
 *
 *   · que quien es del grupo 25 llegue a SU vista por /cuota/mostrar, que es el
 *     direccionador: lo decide lo que llega, no el tipo. La cuota unica de cobertura
 *     y cartera sigue como estaba para los demas
 *   · que la pantalla diga que el avance es el de la MARCA en toda la empresa, no
 *     el personal: es lo que mas se malinterpreta
 *   · que NO se calcule nada: cumplimiento, proyeccion y totales llegan hechos
 *   · que el cumplimiento de un total cuente solo las marcas con meta, y se diga
 *   · que el boton de fijar meta salga solo con puedoFijarMeta, y que si no, se
 *     diga por que
 *   · que fijar una meta mande SOLO lo que cambio: lo que no viaja se conserva, y
 *     lo vaciado viaja en null y se borra. Una meta de 0 no existe
 *   · que una marca sin meta parta de la del mes pasado, sin guardarla sola
 *   · que se pueda ver el mes pasado y el anterior, y que sean de solo lectura
 *
 * El simulacro es dev/simulador-cuota.js, el mismo de dev/servidor.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const cuotaSim = require("../simulador-cuota");

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
let alterar = null;          // (ruta, cuerpo, resultado) -> resultado, para probar que no se calcula nada
let tipoVendedor;            // lo que dice /vendedor; sin tocar, el rol del simulacro
let destinoMostrar;          // a donde reenvia /cuota/mostrar: "marcas" o "cobertura"; sin tocar, segun el tipo
let accesosHub;              // lo que responde GET /cuota, para el hub

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

    if (ruta === "/vendedor") {
        return respuesta({
            status: "ok", codigo: 0,
            data: { cuota: "Ver el avance de las cuotas", marcas: "Elige y administra tus marcas del mes" },
            nombre: "JUAN CARLOS", grupo: "VENTAS-JEFES DE PROD",
            tipo: tipoVendedor === undefined ? S.rol : tipoVendedor, tipoCambio: 3.75
        });
    }

    const [camino, consulta] = ruta.split("?");
    let deMarcas = camino === "/cuota/marcas" && metodo === "GET";

    /* A donde manda el backend a quien pregunta: lo decide destinoMostrar y, si no se
       toca, el tipo que dice /vendedor. Es lo que la pantalla NO mira: el backend se lo dice. */
    const tipo = tipoVendedor === undefined ? S.rol : tipoVendedor;
    const como = destinoMostrar || (tipo === "ESPECIALISTA" || tipo === "JEFATURA" ? "marcas" : "cobertura");

    /* El direccionador. Para el grupo 25 el backend redirige a /cuota/marcas y lo que
       llega es esa respuesta; para los demas, la cuota unica de siempre. */
    if (camino === "/cuota/mostrar") {
        if (como === "cobertura") {
            return respuesta({ status: "cuota no existe", codigo: 0, msg: "todavia no registraste tu cuota de este mes",
                               debeRegistrar: true, meta: 0, avance: 0, porcentaje: null });
        }
        deMarcas = true;
    }

    /* Los accesos del hub. El grupo 25 no recibe crear. */
    if (camino === "/cuota") {
        return respuesta({ status: "ok", codigo: 0, data: accesosHub || ["crear", "leer"] });
    }
    if (ruta === "/cuota/revisar") {
        /* La entrada de «Registrar»: al grupo 25 le dice que su cuota se fija por marca. */
        if (como === "marcas") return respuesta(cuotaSim.revisar().cuerpo);

        return respuesta({ status: "ok", codigo: 0, simple: "registro permitido", puedeRegistrar: true,
                           yaRegistrada: false, monto: null });
    }

    const params = new URLSearchParams(consulta || "");
    let r = null;
    if (deMarcas) r = cuotaSim.ver({ anno: params.get("anno"), mes: params.get("mes") });
    else if (camino === "/cuota/marcas/meta") r = cuotaSim.fijarMeta(cuerpo);

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
    if (alterar) r = alterar(deMarcas ? "/cuota/marcas" : camino, cuerpo, r) || r;
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

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/" + pagina,
        runScripts: "outside-only", pretendToBeVisual: true
    });
    const w = dom.window;
    const destinos = [];

    /* Siempre el mismo dia: el selector de mes, cuando el servidor aun no ha dicho cual
       es el mes en curso, lo saca del reloj, y la prueba no puede depender del dia que se corra. */
    const Real = w.Date;
    w.Date = class extends Real {
        constructor(...a) { if (a.length) super(...a); else super(2026, 9, 20, 10); }
        static now() { return new Real(2026, 9, 20, 10).getTime(); }
    };

    /* Los avisos de consola: el hub avisa de un permiso sin declarar con console.warn. */
    const avisos = [];
    w.console.warn = (...a) => { avisos.push(a.join(" ")); };

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
const enviar = (p, f) => f.dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);
const posts = (ls) => ls.filter((l) => l.metodo === "POST").map((l) => l.cuerpo);
const gets = (ls) => ls.filter((l) => l.metodo === "GET" && l.url.endsWith("/cuota/marcas")).length;
const sinNbsp = (t) => t.replace(/ /g, " ");

const nombres = (nodo) => [...nodo.querySelectorAll(".cdk-articulo__nombre")].map((n) => n.textContent.trim());
const tarjeta = (p, codmar) => p.doc.getElementById("marca-" + codmar);
/** El texto de una medida dentro de una tarjeta o seccion, por su etiqueta. */
const medida = (nodo, etiqueta) => {
    const m = [...nodo.querySelectorAll(".cdk-medida")]
        .find((x) => x.querySelector(".cdk-medida__etiqueta").textContent.startsWith(etiqueta));
    return m ? sinNbsp(m.textContent) : null;
};

/** Pone una marca de por medio y deja confirmado al usuario. */
function preparar(rol, opciones) {
    opciones = opciones || {};
    marcasSim.reiniciar(rol);
    forzar = null; alterar = null; tipoVendedor = undefined; destinoMostrar = undefined; accesosHub = undefined;

    if (rol === "ESPECIALISTA") {
        (opciones.marcas || ["0002", "0206", "0008"]).forEach((c) => { marcasSim.buscarMarca(c).dueno = "233"; });
        S.confirmados["233"] = opciones.confirmado !== false;
    }
    if (rol === "JEFATURA") S.confirmados["071"] = opciones.confirmado !== false;
}

/** Abre el editor de la meta de una marca y lo deja listo. */
async function abrir(p, codmar) {
    clic(p, p.doc.getElementById("meta-abrir-" + codmar));
    return p.doc.getElementById("meta-form-" + codmar);
}
const campo = (p, codmar, clave) => p.doc.getElementById(`meta-${codmar}-${clave}`);

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Cuota por marca · grupo 25 ===\n");

    /* ============================================== a donde lleva cada tipo */
    console.log("— un especialista va a su vista —");
    preparar("ESPECIALISTA");
    llamadas = [];
    let p = await montar("cuota/cuota_observar.html");
    await pausa(250);

    ok("carga sin errores", fallos, 0);
    /* Entra siempre por /cuota/mostrar: el direccionador reenvia a /cuota/marcas, y lo
       que llega es la cuota por marca. No se vuelve a pedir lo que ya se tiene. */
    ok("entra por /cuota/mostrar, una vez", llamadas.filter((l) => l.url.includes("/cuota/mostrar")).length, 1);
    ok("y no vuelve a pedir /cuota/marcas", gets(llamadas), 0);
    ok("pinta la cuota por marca", !!p.doc.getElementById("cuota-marcas-total"), true);
    ok("oculta la seccion de la cuota unica", p.doc.getElementById("seccion-avance").classList.contains("hidden"), true);
    ok("y enseña la de por marca", p.doc.getElementById("por-marca").classList.contains("hidden"), false);

    /* ---------------------------------------------------------- la cabecera */
    console.log("\n— el periodo y lo que mide el avance —");
    ok("dice mes y dias", p.doc.getElementById("cuota-marcas-periodo").textContent,
       "octubre de 2026 · día 19 de 31 · quedan 12 días");

    /* El avance NO es personal: es lo que mas se malinterpreta. */
    const nota = p.doc.getElementById("cuota-marcas-nota").textContent;
    ok("dice que el avance es el de la marca en toda la empresa", nota.includes("toda la empresa"), true);
    ok("y que no son sus ventas personales", nota.includes("no tus ventas personales"), true);
    const calculo = p.doc.querySelector("#cuota-marcas-cabecera details").textContent;
    ok("explica que cuenta y que no",
       calculo.includes("transferencias gratuitas") && calculo.includes("Los descuentos de promoción no se restan"), true);
    ok("y en que moneda", calculo.includes("dólares y sin IGV"), true);
    ok("y que el total cuenta solo las marcas con meta", calculo.includes("cuenta solo las marcas que tienen meta"), true);
    ok("al especialista le dice que la meta la fija el", calculo.includes("la fijas tú"), true);

    /* -------------------------------------------------------------- total */
    console.log("\n— el total y las marcas —");
    const esperadas = cuotaSim.ver().cuerpo.data.marcas.map((m) => m.nombre);
    ok("titulo del total", p.doc.querySelector("#cuota-marcas-total .cdk-seccion__titulo").textContent, "Total de tus marcas");
    ok("cuenta las marcas", p.doc.querySelector("#cuota-marcas-total .cdk-seccion__sub").textContent, "3 marcas");
    ok("una tarjeta por marca, en el orden del backend", nombres(p.doc.getElementById("cuota-marcas-lista")), esperadas);
    ok("sin metas, lo dice", medida(p.doc.getElementById("cuota-marcas-total"), "Venta").includes("sin meta"), true);

    const epson = cuotaSim.ver().cuerpo.data.marcas.find((m) => m.codmar === "0008");
    ok("el avance de la marca es el que llega",
       medida(tarjeta(p, "0008"), "Venta").includes(sinNbsp(`$ ${epson.avance.venta.toLocaleString("en-US", { minimumFractionDigits: 2 })}`)), true);
    ok("con su proyeccion a fin de mes",
       medida(tarjeta(p, "0008"), "Venta").includes("A este ritmo, el mes cierra en"), true);
    /* TDK no vendio nada: el % de rentabilidad no existe, y se dice con un guion. */
    ok("una marca sin venta no inventa un porcentaje", medida(tarjeta(p, "0002"), "Rentabilidad en %").includes("—"), true);

    /* ---------------------------------------------- no se calcula nada */
    console.log("\n— nada se calcula aqui —");
    S.metas["0008"] = { monto: 50000, margen: null, margenPct: null, unidades: null };
    alterar = (ruta, cuerpo, r) => {
        if (ruta === "/cuota/marcas" && r.cuerpo.data) {
            r.cuerpo.data.total.cumplimiento.monto = 12.34;
            r.cuerpo.data.marcas.find((m) => m.codmar === "0008").cumplimiento.monto = 99.9;
            r.cuerpo.data.marcas.find((m) => m.codmar === "0008").proyeccion.venta = 777;
            r.cuerpo.data.marcas.find((m) => m.codmar === "0008").proyeccion.cumplimiento.monto = 321.5;
            r.cuerpo.data.total.proyeccion = { venta: 5555, cumplimiento: { monto: 44.4 } };
        }
        return r;
    };
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    /* Los numeros no cuadran a proposito: si la pantalla los recalculara, saldrian otros. */
    ok("el cumplimiento de la marca es el que llega, no uno recalculado",
       medida(tarjeta(p, "0008"), "Venta").includes("99.9 %"), true);
    ok("el del total tambien", medida(p.doc.getElementById("cuota-marcas-total"), "Venta").includes("12.3 %"), true);
    ok("y la proyeccion", medida(tarjeta(p, "0008"), "Venta").includes("$ 777.00"), true);
    ok("y cuanto de la meta seria, tal como llega", medida(tarjeta(p, "0008"), "Venta").includes("321.5 % de la meta"), true);
    ok("el total tambien",
       [medida(p.doc.getElementById("cuota-marcas-total"), "Venta").includes("$ 5,555.00"),
        medida(p.doc.getElementById("cuota-marcas-total"), "Venta").includes("44.4 % de la meta")], [true, true]);
    ok("con la meta a la vista", medida(tarjeta(p, "0008"), "Venta").includes("Meta $ 50,000.00"), true);
    ok("y de cuando es", tarjeta(p, "0008").textContent.includes("Meta actualizada el 19/10/2026"), true);
    alterar = null;

    /* ============================================================ fijar meta */
    console.log("\n— fijar una meta —");
    preparar("ESPECIALISTA");
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);

    ok("cada marca suya tiene su boton", ["0002", "0206", "0008"].every((c) => !!p.doc.getElementById("meta-abrir-" + c)), true);
    ok("que dice fijar, porque no hay meta", p.doc.getElementById("meta-abrir-0206").textContent, "Fijar meta");

    let form = await abrir(p, "0206");
    ok("abre el formulario", !!form, true);
    ok("con las cuatro medidas", ["monto", "margen", "margenPct", "unidades"].every((k) => !!campo(p, "0206", k)), true);
    ok("vacias, porque no hay meta", ["monto", "margen", "margenPct", "unidades"].every((k) => campo(p, "0206", k).value === ""), true);

    llamadas = [];
    enviar(p, form); await pausa(80);
    ok("sin tocar nada no manda nada", posts(llamadas).length, 0);
    ok("y lo dice", toasts(p.doc).some((t) => t.includes("No cambiaste nada")), true);

    campo(p, "0206", "monto").value = "50000";
    campo(p, "0206", "unidades").value = "3000";
    llamadas = [];
    enviar(p, form); await pausa(200);

    /* Solo lo que se lleno: lo demas no viaja. */
    ok("manda solo lo que se lleno", posts(llamadas), [{ codmar: "0206", monto: 50000, unidades: 3000 }]);
    ok("lo avisa como fijada", toasts(p.doc).some((t) => t.includes("Meta de EP_IMPRESORAS fijada")), true);
    ok("y repinta pidiendo todo de nuevo", gets(llamadas), 1);
    ok("la meta se ve contra el avance", medida(tarjeta(p, "0206"), "Venta").includes("Meta $ 50,000.00"), true);
    ok("y el boton ya dice corregir", p.doc.getElementById("meta-abrir-0206").textContent, "Corregir meta");
    ok("con el formulario cerrado", p.doc.getElementById("meta-form-0206"), null);

    /* ---- corregir: lo que no se toca NO se manda */
    console.log("\n— corregir una meta —");
    form = await abrir(p, "0206");
    ok("el formulario trae la meta actual",
       [campo(p, "0206", "monto").value, campo(p, "0206", "unidades").value], ["50000", "3000"]);

    campo(p, "0206", "unidades").value = "3500";
    llamadas = [];
    enviar(p, form); await pausa(200);
    /* El monto ya estaba: si viajara, se pisaria con lo mismo y, peor, con un valor
       desfasado si otra pestaña lo cambio. */
    ok("corregir las unidades manda solo las unidades", posts(llamadas), [{ codmar: "0206", unidades: 3500 }]);
    ok("lo avisa como actualizada", toasts(p.doc).some((t) => t.includes("Meta de EP_IMPRESORAS actualizada")), true);
    ok("y el monto se conserva", S.metas["0206"].monto, 50000);

    /* ---- vaciar un campo lo borra */
    form = await abrir(p, "0206");
    campo(p, "0206", "monto").value = "";
    llamadas = [];
    enviar(p, form); await pausa(200);
    ok("vaciar un campo lo manda en null", posts(llamadas), [{ codmar: "0206", monto: null }]);
    ok("y esa meta desaparece", medida(tarjeta(p, "0206"), "Venta").includes("sin meta"), true);
    ok("pero las demas siguen", medida(tarjeta(p, "0206"), "Unidades").includes("Meta 3,500"), true);

    /* ---- la rentabilidad, de una forma o de la otra */
    form = await abrir(p, "0206");
    campo(p, "0206", "margenPct").value = "12.5";
    llamadas = [];
    enviar(p, form); await pausa(200);
    ok("la rentabilidad en %", posts(llamadas), [{ codmar: "0206", margenPct: 12.5 }]);
    ok("sale con su propia barra", medida(tarjeta(p, "0206"), "Rentabilidad en %").includes("Meta 12.50 %"), true);

    /* ---- lo que no sirve ni se manda */
    console.log("\n— valores que no sirven —");
    form = await abrir(p, "0206");
    llamadas = [];

    campo(p, "0206", "monto").value = "-5";
    enviar(p, form); await pausa(60);
    ok("un negativo ni se manda", posts(llamadas).length, 0);
    ok("y se explica", toasts(p.doc).some((t) => t.includes("mayor que 0")), true);

    /* Una meta de 0 no existe: para quitarla se deja vacia. */
    campo(p, "0206", "monto").value = "0";
    enviar(p, form); await pausa(60);
    ok("una meta de 0 tampoco se manda", posts(llamadas).length, 0);
    ok("y dice como quitarla", toasts(p.doc).some((x) => x.includes("déjala vacía")), true);
    campo(p, "0206", "monto").value = "";

    campo(p, "0206", "unidades").value = "2.5";
    enviar(p, form); await pausa(60);
    ok("unidades con decimales tampoco", posts(llamadas).length, 0);
    ok("pide un entero", toasts(p.doc).some((t) => t.includes("número entero")), true);
    campo(p, "0206", "unidades").value = "3500";

    campo(p, "0206", "margenPct").value = "150";
    enviar(p, form); await pausa(60);
    ok("un porcentaje de mas de 100 tampoco", posts(llamadas).length, 0);
    ok("lo dice", toasts(p.doc).some((t) => t.includes("no puede pasar de 100")), true);
    ok("y el formulario sigue abierto para corregirlo", !!p.doc.getElementById("meta-form-0206"), true);

    /* ---- lo que el backend rechaza: su mensaje, y se queda el formulario */
    console.log("\n— lo que rechaza el backend —");
    campo(p, "0206", "margenPct").value = "12.5";
    campo(p, "0206", "unidades").value = "4000";
    forzar = (ruta) => ruta.endsWith("/meta")
        ? respuesta({ status: "meta invalida", codigo: 2, msg: "un valor es negativo o no es numerico" }, 400) : null;
    llamadas = [];
    enviar(p, form); await pausa(150);
    ok("se muestra su mensaje", toasts(p.doc).some((t) => t.includes("un valor es negativo o no es numerico")), true);
    ok("el formulario se queda, con lo escrito", campo(p, "0206", "unidades").value, "4000");
    ok("y el boton vuelve a servir", p.doc.querySelector("#meta-form-0206 button[type=submit]").disabled, false);
    ok("no repinta: nada cambio", gets(llamadas), 0);

    /* ---- confirmo desde otra pestaña o le quitaron la marca: pantalla desfasada */
    forzar = (ruta) => ruta.endsWith("/meta")
        ? respuesta({ status: "marcas sin confirmar", codigo: 3, msg: "confirma tus marcas del mes para poder fijar la meta" }, 409) : null;
    llamadas = [];
    enviar(p, form); await pausa(200);
    ok("`marcas sin confirmar`: lo dice", toasts(p.doc).some((t) => t.includes("confirma tus marcas del mes")), true);
    /* Es la pantalla la que esta desfasada, no el valor: se vuelve a pedir. */
    ok("y vuelve a pedir todo, porque la pantalla ya no esta al dia", gets(llamadas), 1);

    forzar = (ruta) => ruta.endsWith("/meta")
        ? respuesta({ status: "meta solo del dueno", codigo: 3, msg: "esta marca no es tuya este mes" }, 403) : null;
    form = await abrir(p, "0206");
    campo(p, "0206", "unidades").value = "4100";
    llamadas = [];
    enviar(p, form); await pausa(200);
    ok("`meta solo del dueno` tambien repinta", gets(llamadas), 1);
    forzar = null;

    /* ================================================== sin confirmar */
    console.log("\n— un especialista que aun no confirmo —");
    preparar("ESPECIALISTA", { marcas: ["0032"], confirmado: false });
    llamadas = [];
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);

    /* La pantalla pinta lo que dice `puedoFijarMeta`: el backend rechazaria el POST
       con `marcas sin confirmar`, y no se ofrece lo que se sabe que va a fallar. */
    ok("no ofrece fijar la meta", p.doc.getElementById("meta-abrir-0032"), null);
    ok("dice por que", p.doc.getElementById("meta-aviso-0032").textContent.includes("Confirma tus marcas del mes"), true);
    ok("y lleva a Marcas",
       tarjeta(p, "0032").querySelector("a[href='/marcas.html']") !== null, true);
    ok("pero el avance de la marca se ve igual", medida(tarjeta(p, "0032"), "Venta") !== null, true);

    /* ===================================================== la jefatura */
    console.log("\n— una jefatura —");
    preparar("JEFATURA");
    llamadas = [];
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);

    ok("el total es el de la familia",
       p.doc.querySelector("#cuota-marcas-total .cdk-seccion__titulo").textContent, "Total de las marcas de tu familia");
    ok("le dice que la meta de cada marca la fija su dueño",
       p.doc.querySelector("#cuota-marcas-cabecera details").textContent.includes("la fija su dueño"), true);

    /* La meta de % no se suma: su ausencia en un total no es «sin meta». */
    ok("el total no dice «sin meta» de lo que no se suma",
       medida(p.doc.getElementById("cuota-marcas-total"), "Rentabilidad en %").includes("sin meta"), false);
    ok("pero si de lo que si", medida(p.doc.getElementById("cuota-marcas-total"), "Venta").includes("sin meta"), true);

    ok("tiene el general de cada uno", !!p.doc.getElementById("cuota-por-dueno"), true);
    ok("con ella y con su especialista",
       nombres(p.doc.getElementById("cuota-por-dueno")), ["COSSIO JOANNA (tú)", "SAUÑE MANUEL"]);
    ok("diciendo cuantas marcas lleva cada uno",
       p.doc.getElementById("cuota-por-dueno").textContent.includes("1 marca"), true);

    ok("sus marcas y las de su especialista", nombres(p.doc.getElementById("cuota-marcas-lista")), ["ACER", "MEMOREX"]);
    ok("la de un especialista dice de quien es",
       tarjeta(p, "0003").textContent.includes("SAUÑE MANUEL"), true);
    ok("y que la meta la fija el", tarjeta(p, "0003").textContent.includes("La meta la fija SAUÑE MANUEL"), true);
    ok("sin boton para fijarla: no es suya", p.doc.getElementById("meta-abrir-0003"), null);
    ok("la suya, si", !!p.doc.getElementById("meta-abrir-0124"), true);

    const filtro = p.doc.getElementById("cuota-filtro");
    ok("el filtro por responsable", [...filtro.options].map((o) => o.textContent), ["Todas (2)", "Mías (1)", "SAUÑE MANUEL (1)"]);
    cambiar(p, filtro, "u:229");
    ok("filtrar por un especialista", nombres(p.doc.getElementById("cuota-marcas-lista")), ["MEMOREX"]);
    cambiar(p, filtro, "mias");
    ok("filtrar por las suyas", nombres(p.doc.getElementById("cuota-marcas-lista")), ["ACER"]);

    form = await abrir(p, "0124");
    campo(p, "0124", "monto").value = "30000";
    llamadas = [];
    enviar(p, form); await pausa(200);
    /* ACER tuvo meta el mes pasado (venta y rentabilidad en US$): el formulario partio de ella,
       y lo que no se toco viaja con lo nuevo porque este mes aun no tiene meta. */
    ok("fija la meta de la suya", posts(llamadas), [{ codmar: "0124", monto: 30000, margen: 900 }]);
    ok("y el filtro se queda donde estaba tras repintar", p.doc.getElementById("cuota-filtro").value, "mias");
    ok("el general de ella ya refleja su meta",
       medida(p.doc.getElementById("cuota-por-dueno"), "Venta") !== null &&
       sinNbsp(p.doc.getElementById("cuota-por-dueno").textContent).includes("Meta $ 30,000.00"), true);

    ok("el total dice en cuantas marcas hay meta",
       medida(p.doc.getElementById("cuota-marcas-total"), "Venta").includes("meta en 1 de 2"), true);

    /* ---- sin confirmar, la jefatura tampoco puede, ni con las suyas */
    preparar("JEFATURA", { confirmado: false });
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    ok("una jefatura sin confirmar no puede fijar la suya", p.doc.getElementById("meta-abrir-0124"), null);
    ok("se le dice que confirme", p.doc.getElementById("meta-aviso-0124") !== null, true);
    /* Y a la de su especialista no se le dice que confirme ELLA: no es suya. */
    ok("pero lo de su especialista sigue diciendo de quien es",
       tarjeta(p, "0003").textContent.includes("La meta la fija SAUÑE MANUEL"), true);

    /* ======================================= lo decide lo que llega, no el tipo */
    console.log("\n— lo decide lo que llega, no el tipo —");
    {
        preparar("ESPECIALISTA");
        tipoVendedor = "COBERTURA"; destinoMostrar = "marcas";
        const q = await montar("cuota/cuota_observar.html");
        await pausa(250);
        /* El backend redirige a /cuota/marcas: eso es lo que dice a donde va cada uno.
           Si alguien tiene un tipo que no conocemos y llegan marcas, se pintan. */
        ok("llegan marcas: cuota por marca, diga lo que diga el tipo", !!q.doc.getElementById("cuota-marcas-total"), true);

        tipoVendedor = "ESPECIALISTA"; destinoMostrar = "cobertura";
        const r = await montar("cuota/cuota_observar.html");
        await pausa(250);
        ok("y si no llegan, la cuota unica, aunque el tipo diga especialista",
           [!!r.doc.getElementById("cuota-marcas-total"), r.doc.getElementById("seccion-avance").classList.contains("hidden")],
           [false, false]);
    }

    /* =========================== el total cuenta solo las marcas que tienen meta */
    console.log("\n— el cumplimiento del total cuenta solo las marcas con meta —");
    preparar("ESPECIALISTA");
    S.metas["0008"] = { monto: 50000, margen: 2000, margenPct: null, unidades: null };
    S.metas["0206"] = { monto: 20000, margen: null, margenPct: null, unidades: null };
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    {
        const t = p.doc.getElementById("cuota-marcas-total");
        const delBackend = cuotaSim.ver().cuerpo.data.total;

        ok("dice en cuantas marcas hay meta de venta", medida(t, "Venta").includes("meta en 2 de 3"), true);
        ok("y en cuantas de rentabilidad", medida(t, "Rentabilidad en US$").includes("meta en 1 de 3"), true);
        ok("donde ninguna la tiene, que no la hay", medida(t, "Unidades").includes("sin meta"), true);
        /* La rentabilidad en % no se suma: que falte en un total no es «sin meta». */
        ok("la rentabilidad en % no dice nada de la meta", medida(t, "Rentabilidad en %").includes("meta"), false);
        ok("el cumplimiento es el que dice el backend",
           [medida(t, "Venta").includes(delBackend.cumplimiento.monto.toFixed(1) + " %"),
            medida(t, "Rentabilidad en US$").includes(delBackend.cumplimiento.margen.toFixed(1) + " %")],
           [true, true]);
        ok("y lo explica una vez, debajo",
           p.doc.getElementById("cuota-marcas-total-nota").textContent.includes("solo las marcas que tienen meta"), true);

        /* ---- a este ritmo, y cuanto de la meta seria */
        const sim = cuotaSim.ver().cuerpo.data;
        const epsonSim = sim.marcas.find((m) => m.codmar === "0008");
        const sinMeta = sim.marcas.find((m) => m.codmar === "0002");
        ok("con meta de venta, dice cuanto de ella seria a este ritmo",
           medida(tarjeta(p, "0008"), "Venta").includes(epsonSim.proyeccion.cumplimiento.monto.toFixed(1) + " % de la meta"), true);
        ok("sin ella, solo dice a cuanto cierra",
           [medida(tarjeta(p, "0002"), "Venta").includes("A este ritmo"),
            medida(tarjeta(p, "0002"), "Venta").includes("de la meta")], [true, false]);
        ok("el total tambien",
           medida(t, "Venta").includes(sim.total.proyeccion.cumplimiento.monto.toFixed(1) + " % de la meta"), true);
        ok("sin meta de venta en una marca, su proyeccion no inventa un %", sinMeta.proyeccion.cumplimiento.monto, null);
    }

    /* Con meta en todas, no hay nada que aclarar. */
    preparar("ESPECIALISTA");
    ["0002", "0206", "0008"].forEach((c) => { S.metas[c] = { monto: 1000, margen: 100, margenPct: null, unidades: 10 }; });
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    ok("con meta en todas, no dice «meta en»",
       ["Venta", "Rentabilidad en US$", "Unidades"].some((e) => medida(p.doc.getElementById("cuota-marcas-total"), e).includes("meta en ")), false);
    ok("ni «sin meta»",
       ["Venta", "Rentabilidad en US$", "Unidades"].some((e) => medida(p.doc.getElementById("cuota-marcas-total"), e).includes("sin meta")), false);
    ok("ni la nota", p.doc.getElementById("cuota-marcas-total-nota"), null);

    /* ============================================ partir de la meta del mes pasado */
    console.log("\n— partir de la meta del mes pasado —");
    preparar("ESPECIALISTA");
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);

    const previa = cuotaSim.META_MES_ANTERIOR["0008"];
    const claves = ["monto", "margen", "margenPct", "unidades"];
    const valoresDe = (codmar) => claves.map((k) => campo(p, codmar, k).value);

    llamadas = [];
    form = await abrir(p, "0008");
    ok("EPSON tuvo meta el mes pasado: el formulario parte de ella",
       valoresDe("0008"), claves.map((k) => (previa[k] === null ? "" : String(previa[k]))));
    ok("y lo dice", p.doc.getElementById("meta-precargada-0008").textContent.includes("mes pasado"), true);
    ok("aclarando que no se guarda sola", p.doc.getElementById("meta-precargada-0008").textContent.includes("no se guarda hasta"), true);
    ok("abrirlo no guarda nada", posts(llamadas).length, 0);

    clic(p, p.doc.getElementById("meta-abrir-0008"));
    ok("cerrarlo tampoco", [!!p.doc.getElementById("meta-form-0008"), posts(llamadas).length], [false, 0]);

    form = await abrir(p, "0206");
    ok("EP_IMPRESORAS no tuvo: el formulario va vacio", valoresDe("0206"), ["", "", "", ""]);
    ok("y no dice que parte de nada", p.doc.getElementById("meta-precargada-0206"), null);
    clic(p, p.doc.getElementById("meta-abrir-0206"));

    /* Guardar sin tocar lo precargado lo guarda: es la persona quien lo confirma. */
    form = await abrir(p, "0008");
    llamadas = [];
    enviar(p, form); await pausa(200);
    ok("guardar tal cual manda lo precargado", posts(llamadas), [{ codmar: "0008", monto: 12000, margenPct: 8, unidades: 60 }]);
    ok("lo avisa como fijada", toasts(p.doc).some((t) => t.includes("Meta de EPSON fijada")), true);
    ok("y ahora si es la de este mes", S.metas["0008"], { monto: 12000, margen: null, margenPct: 8, unidades: 60 });

    form = await abrir(p, "0008");
    ok("corregirla ya no parte del mes pasado: trae la de ahora",
       [valoresDe("0008"), p.doc.getElementById("meta-precargada-0008")], [["12000", "", "8", "60"], null]);

    /* Quitar algo de lo precargado no manda un `null`: no habia nada que borrar. */
    preparar("ESPECIALISTA");
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    form = await abrir(p, "0008");
    campo(p, "0008", "margenPct").value = "";
    campo(p, "0008", "unidades").value = "75";
    llamadas = [];
    enviar(p, form); await pausa(200);
    ok("lo que se quita o se cambia en el formulario manda lo que quedo",
       posts(llamadas), [{ codmar: "0008", monto: 12000, unidades: 75 }]);

    /* La jefatura tambien: su marca ACER tuvo meta el mes pasado. */
    preparar("JEFATURA");
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    form = await abrir(p, "0124");
    ok("la de la jefatura parte de la suya", valoresDe("0124"), ["20000", "900", "", ""]);

    /* ======================================================= ver otro mes */
    console.log("\n— ver otro mes —");
    preparar("ESPECIALISTA");
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);

    const mes = () => p.doc.getElementById("cuota-mes");
    const periodoTexto = () => p.doc.getElementById("cuota-marcas-periodo").textContent;

    ok("ofrece el mes en curso y los dos anteriores", [...mes().options].map((o) => o.textContent),
       ["octubre de 2026 (este mes)", "septiembre de 2026", "agosto de 2026"]);
    ok("empieza en el mes en curso", mes().value, "");

    /* `confirmada` de un mes cerrado puede ser false (el dueño nunca confirmo ese mes): eso no
       es el estado de hoy, y no puede decirle que confirme. */
    alterar = (ruta, cuerpo, r) => {
        if (ruta === "/cuota/marcas" && r.cuerpo.data && r.cuerpo.data.actual === false) {
            r.cuerpo.data.marcas.forEach((m) => { m.confirmada = false; });
        }
        return r;
    };
    llamadas = [];
    cambiar(p, mes(), "2026-09");
    await pausa(250);
    ok("pide ese mes al backend", llamadas.filter((l) => l.metodo === "GET").map((l) => l.url.replace(/^.*\/v1/, "")),
       ["/cuota/marcas?anno=2026&mes=9"]);

    {
        const sep = cuotaSim.ver({ anno: "2026", mes: "9" }).cuerpo.data;
        const epsonSep = sep.marcas.find((m) => m.codmar === "0008");

        ok("dice que es un mes cerrado", periodoTexto(), "septiembre de 2026 · mes cerrado");
        ok("y que solo se puede mirar",
           p.doc.getElementById("cuota-marcas-cerrado").textContent.includes("Solo se puede mirar"), true);
        ok("son las marcas de entonces", nombres(p.doc.getElementById("cuota-marcas-lista")), sep.marcas.map((m) => m.nombre));
        ok("sin la que todavia no existia", tarjeta(p, "0206"), null);
        ok("con la que se tuvo y hoy ya no se trabaja, y lo dice",
           tarjeta(p, "0161").textContent.includes("Esta marca ya no se trabaja"), true);
        ok("sin botones para fijar meta", p.doc.querySelectorAll("[id^='meta-abrir-']").length, 0);
        /* `confirmada` de un mes cerrado no es el estado de hoy: nada de «confirma tus marcas». */
        ok("ni avisos de confirmar", p.doc.querySelectorAll("[id^='meta-aviso-']").length, 0);
        ok("sin proyeccion: el mes ya cerro", p.doc.getElementById("por-marca").textContent.includes("A este ritmo"), false);
        ok("con la meta que tuvo entonces", medida(tarjeta(p, "0008"), "Venta").includes("Meta $ 12,000.00"), true);
        ok("y como cumplio", medida(tarjeta(p, "0008"), "Venta").includes(epsonSep.cumplimiento.monto.toFixed(1) + " %"), true);
        ok("el selector sigue en septiembre", mes().value, "2026-09");
        ok("y lo de «a este ritmo» ya no se explica",
           p.doc.querySelector("#cuota-marcas-cabecera details").textContent.includes("A este ritmo"), false);
    }

    alterar = null;
    cambiar(p, mes(), "");
    await pausa(250);
    ok("volver al mes en curso", periodoTexto(), "octubre de 2026 · día 19 de 31 · quedan 12 días");
    ok("devuelve los botones", !!p.doc.getElementById("meta-abrir-0008"), true);

    cambiar(p, mes(), "2026-08");
    await pausa(250);
    ok("hace dos meses no habia marcas: lo dice", !!p.doc.getElementById("cuota-marcas-sin-marcas-mes"), true);
    ok("con el mes",
       p.doc.querySelector("#cuota-marcas-sin-marcas-mes .cdk-seccion__titulo").textContent, "No tenías marcas en agosto de 2026");
    /* Entonces no habia marcas: no hay nada que elegir ni a donde ir. */
    ok("sin mandar a elegir marcas", p.doc.querySelector("#por-marca a[href='/marcas.html']"), null);
    ok("y se puede volver a otro mes", [mes().value, mes().options.length], ["2026-08", 3]);
    cambiar(p, mes(), "");
    await pausa(250);

    /* ---- un mes que no se pudo traer: la pantalla se queda como estaba */
    forzar = (ruta) => ruta.startsWith("/cuota/marcas?")
        ? respuesta({ status: "periodo invalido", codigo: 2, msg: "solo se puede pedir el mes en curso y los dos anteriores" }, 400) : null;
    cambiar(p, mes(), "2026-09");
    await pausa(250);
    ok("dice por que", toasts(p.doc).some((t) => t.includes("solo se puede pedir el mes en curso")), true);
    ok("la pantalla se queda como estaba", periodoTexto(), "octubre de 2026 · día 19 de 31 · quedan 12 días");
    ok("y el selector vuelve a donde estaba", [mes().value, mes().disabled], ["", false]);

    /* Una respuesta que no es lo que dice el contrato: no se pinta a ojo, ni se tapa lo bueno. */
    forzar = (ruta) => ruta.startsWith("/cuota/marcas?") ? respuesta({ status: "ok", codigo: 0, data: [] }) : null;
    cambiar(p, mes(), "2026-09");
    await pausa(250);
    ok("lo dice", toasts(p.doc).some((t) => t.includes("no trae las marcas")), true);
    ok("sin tapar la pantalla que ya estaba", !!p.doc.getElementById("cuota-marcas-total"), true);
    ok("y el selector no se queda en el mes que no llego", mes().value, "");
    forzar = null;

    /* ---- la jefatura: el general de cada uno es el de ese mes */
    preparar("JEFATURA");
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    cambiar(p, mes(), "2026-09");
    await pausa(250);
    ok("el general de cada uno, con las marcas de entonces",
       [nombres(p.doc.getElementById("cuota-por-dueno")), p.doc.getElementById("cuota-por-dueno").textContent.includes("2 marcas")],
       [["COSSIO JOANNA (tú)", "SAUÑE MANUEL"], true]);
    ok("y lo dice", p.doc.getElementById("cuota-marcas-por-dueno").textContent.includes("tenía entonces"), true);
    ok("conserva el filtro por responsable", !!p.doc.getElementById("cuota-filtro"), true);
    /* La marca de un especialista ya no dice «la meta la fija…»: en un mes cerrado nadie la fija. */
    ok("un mes cerrado no se toca: ni siquiera dice quien fija la meta",
       p.doc.getElementById("cuota-marcas-lista").textContent.includes("La meta la fija"), false);

    /* ---- sin marcas este mes, pero con el mes pasado se puede mirar */
    preparar("ESPECIALISTA", { marcas: [] });
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    ok("sin marcas este mes, el selector tambien esta", [...mes().options].map((o) => o.value), ["", "2026-09", "2026-08"]);
    cambiar(p, mes(), "2026-09");
    await pausa(250);
    ok("y deja ver el mes pasado", !!tarjeta(p, "0161"), true);

    /* ======================================================== el hub de Cuota */
    console.log("\n— el hub de Cuota —");
    accesosHub = ["leer", "marcas", "meta marca"];
    p = await montar("cuota.html");
    await pausa(200);
    ok("el grupo 25 ve solo «Ver»", [...p.doc.querySelectorAll("#cdk-acciones .cdk-tarjeta__titulo")].map((n) => n.textContent), ["Ver"]);
    ok("que lleva a la cuota", p.doc.querySelector("#cdk-acciones a").getAttribute("href"), "/cuota/cuota_observar.html");
    ok("sin el aviso de permisos sin declarar", p.avisos.some((a) => a.includes("sin declarar")), false);

    accesosHub = ["marcas", "meta marca", "leer"];
    p = await montar("cuota.html");
    await pausa(200);
    ok("el orden en que lleguen los permisos no cambia nada",
       [...p.doc.querySelectorAll("#cdk-acciones .cdk-tarjeta__titulo")].map((n) => n.textContent), ["Ver"]);

    accesosHub = ["crear", "leer"];
    p = await montar("cuota.html");
    await pausa(200);
    ok("cobertura y cartera siguen con las dos",
       [...p.doc.querySelectorAll("#cdk-acciones .cdk-tarjeta__titulo")].map((n) => n.textContent), ["Registrar", "Ver"]);
    accesosHub = undefined;

    /* ============================================== los demas estados */
    console.log("\n— sin marcas —");
    preparar("ESPECIALISTA", { marcas: [] });
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    ok("lo dice como lo que es: falta elegir marcas", !!p.doc.getElementById("cuota-marcas-sin-marcas"), true);
    ok("con el camino a Marcas", p.doc.querySelector("#cuota-marcas-sin-marcas a").getAttribute("href"), "/marcas.html");
    ok("sin total ni tarjetas", p.doc.getElementById("cuota-marcas-total"), null);
    ok("pero se puede mirar otro mes", p.doc.getElementById("cuota-mes").options.length, 3);

    console.log("\n— sin registrarse —");
    preparar("ESPECIALISTA");
    S.yaRegistrado = false;
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    ok("explica que falta el registro", !!p.doc.getElementById("cuota-marcas-sin-alta"), true);
    ok("con el camino al formulario",
       p.doc.querySelector("#cuota-marcas-sin-alta a").getAttribute("href"), "/autenticador.html");

    console.log("\n— una respuesta que no es lo que dice el contrato —");
    preparar("ESPECIALISTA");
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);
    S.metas["0008"] = { monto: 1000, margen: null, margenPct: null, unidades: null };
    forzar = (ruta) => ruta.startsWith("/cuota/marcas") && !ruta.includes("/meta") ? respuesta({ status: "ok", codigo: 0, data: [] }) : null;
    form = await abrir(p, "0206");
    campo(p, "0206", "monto").value = "5000";
    enviar(p, form); await pausa(250);
    /* Se guardo, pero al volver a pedir llego algo que no es lo que dice el contrato:
       no se pinta a ojo, y tampoco se tapa la pantalla que ya estaba. */
    ok("lo dice", toasts(p.doc).some((t) => t.includes("no trae las marcas")), true);
    ok("y la pantalla anterior se queda", !!p.doc.getElementById("cuota-marcas-total"), true);
    forzar = null;

    /* ============================================ cobertura y cartera igual */
    console.log("\n— cobertura y cartera siguen como estaban —");
    preparar("ESPECIALISTA");
    tipoVendedor = "COBERTURA";
    llamadas = [];
    p = await montar("cuota/cuota_observar.html");
    await pausa(250);

    ok("piden la cuota unica", llamadas.some((l) => l.url.includes("/cuota/mostrar")), true);
    ok("no la de por marca", llamadas.some((l) => l.url.endsWith("/cuota/marcas")), false);
    ok("con su seccion a la vista", p.doc.getElementById("seccion-avance").classList.contains("hidden"), false);
    ok("y siguen pudiendo registrar", !!p.doc.querySelector("#avance a[href*='cuota_registrar']"), true);

    /* ===================================================== registrar */
    console.log("\n— registrar la cuota —");
    preparar("ESPECIALISTA");
    llamadas = [];
    p = await montar("cuota/cuota_registrar.html");
    await pausa(250);

    /* Un especialista no registra un monto unico: fija una meta por marca. Ofrecerle
       el formulario seria llevarlo a una pantalla que no le sirve. */
    ok("a un especialista le dice que su cuota es por marca", !!p.doc.getElementById("cuota-por-marca-aviso"), true);
    ok("con el camino", p.doc.querySelector("#estado a").getAttribute("href"), "/cuota/cuota_observar.html");
    ok("sin ofrecerle el formulario", p.doc.getElementById("form-cuota").classList.contains("hidden"), true);
    /* Lo sabe porque /cuota/revisar se lo dice (status «cuota por marca»), no por su tipo. */
    ok("lo sabe preguntando a /cuota/revisar", llamadas.filter((l) => l.url.includes("/cuota/revisar")).length, 1);

    tipoVendedor = "CARTERA";
    llamadas = [];
    p = await montar("cuota/cuota_registrar.html");
    await pausa(250);
    ok("a cartera si le ofrece el formulario", p.doc.getElementById("form-cuota").classList.contains("hidden"), false);
    ok("preguntando antes si ya registro", llamadas.some((l) => l.url.includes("/cuota/revisar")), true);
    ok("sin el aviso de cuota por marca", p.doc.getElementById("cuota-por-marca-aviso"), null);

    /* Lo decide lo que responde el backend, no el tipo de /vendedor, en un sentido... */
    tipoVendedor = "CARTERA"; destinoMostrar = "marcas";
    p = await montar("cuota/cuota_registrar.html");
    await pausa(250);
    ok("si el backend dice cuota por marca, aunque el tipo diga cartera",
       [!!p.doc.getElementById("cuota-por-marca-aviso"), p.doc.getElementById("form-cuota").classList.contains("hidden")], [true, true]);

    /* ...y en el otro. */
    tipoVendedor = "ESPECIALISTA"; destinoMostrar = "cobertura";
    p = await montar("cuota/cuota_registrar.html");
    await pausa(250);
    ok("y si no lo dice, el formulario, aunque el tipo diga especialista",
       [p.doc.getElementById("cuota-por-marca-aviso"), p.doc.getElementById("form-cuota").classList.contains("hidden")], [null, false]);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
