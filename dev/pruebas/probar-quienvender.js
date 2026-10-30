/**
 * Prueba de integracion del modulo `quienvender` del grupo 20 (cartera y cobertura): «¿A quien vender hoy?», los 3 clientes del dia,
 * sobre la pagina real (quienvender.html).
 *
 * Lo que mas importa:
 *
 *   · que sea SOLO informacion: sin boton de cambiar ni de refrescar, sin recarga automatica ni al volver a la pestaña, y que la ruta
 *     se pida UNA vez, cuando el vendedor abre la pantalla (la primera vez del dia el backend la calcula y la graba)
 *   · que `valorUsd` se rotule segun el tipo, porque quiere decir otra cosa en cada uno: lo que vale lo que le toca (REPONER), su compra
 *     media mensual (LLAMAR), lo que compro en 12 meses (REACTIVAR), y en LIBRE lo que compro a TODOS los vendedores, no a este
 *   · cada tipo con lo suyo: el ritmo de los productos solo en REPONER, los meses con compra y las facturas del mes pasado solo en LLAMAR,
 *     y nada de productos en SIN_COMPRAS ni en LIBRE
 *   · que NADA se calcule, que el codigo del cliente NO se muestre (decision del 29/10), y que no haya telefono
 *   · que menos de 3 tarjetas, o ninguna (con su `aviso`), no sea un error; y que un tipo que no conozcamos se pinte igual
 *   · los errores, el menu del grupo 20 («Vender hoy» en la barra inferior del movil) y que el simulacro cumpla el documento
 *
 * El simulacro es dev/simulador-quienvender.js, el mismo de dev/servidor.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const qvSim = require("../simulador-quienvender");

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
let forzar = null;           // (ruta) -> respuesta armada, para probar errores y esperas
let alterar = null;          // (camino, resultado) -> resultado, para probar que no se calcula nada

function respuesta(obj, status) {
    const cuerpo = JSON.stringify(obj);
    return Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(cuerpo)
    });
}

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
        return respuesta({ status: "ok", codigo: 0, data: MENU, nombre: "FIORELLA BENITES", grupo: "VENTAS-EJECUTIVOS", tipo: S.rol, tipoCambio: 3.75 });
    }

    let r = null;
    if (camino === "/quienvender") {
        const { primera, ...resto } = qvSim.sugerir();          // `primera` no viaja: es solo para que el servidor de desarrollo se demore
        r = resto;
    }

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
        constructor(...a) { if (a.length) super(...a); else super(2026, 9, 29, 9); }
        static now() { return new Real(2026, 9, 29, 9).getTime(); }
    };

    /* Cualquier refresco automatico (un intervalo, o un temporizador de un minuto o mas) se anota: esta pantalla no tiene ninguno. */
    const relojes = [];
    const setReal = w.setTimeout.bind(w);
    w.setTimeout = (fn, ms, ...a) => { if (ms >= 60000) relojes.push({ tipo: "setTimeout", ms }); return setReal(fn, ms, ...a); };
    w.setInterval = (fn, ms) => { relojes.push({ tipo: "setInterval", ms }); return 0; };

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

    return { w, doc: w.document, destinos, avisos, relojes };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
const sinNbsp = (t) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);

const $ = (p, id) => p.doc.getElementById(id);
const rutas = () => llamadas.filter((l) => l.url.includes("/quienvender")).map((l) => l.url.replace(/^.*\/v1/, ""));

const tarjetas = (p) => [...p.doc.querySelectorAll("#qv-sugeridos > li")];
const nombreDe = (li) => texto(li.querySelector(".cdk-articulo__nombre"));
const rotuloDe = (li) => texto(li.querySelector(".cdk-semaforo"));
const motivoDe = (li) => texto(li.querySelector(".cdk-pista"));
const datosDe = (li) => [...li.querySelectorAll(".cdk-articulo__datos .cdk-dato")].map((n) => texto(n));
const productosDe = (li) => [...li.querySelectorAll(".cdk-filas > li")].map((f) => ({
    nombre: texto(f.querySelector(".cdk-fila__nombre")), datos: [...f.querySelectorAll(".cdk-fila__datos span")].map((n) => texto(n))
}));

/** Lo que el backend dice de un vendedor, para comparar con lo que sale en pantalla. */
function delBackend(rol, codven) {
    marcasSim.reiniciar(rol);
    qvSim.reiniciar();
    qvSim.usar(codven);
    const r = qvSim.sugerir();
    qvSim.reiniciar();
    qvSim.usar(codven);
    return r.cuerpo.data;
}

function preparar(rol, codven) {
    marcasSim.reiniciar(rol || "CARTERA");
    qvSim.reiniciar();
    qvSim.usar(codven || null);
    forzar = null; alterar = null;
}

const dolares = (n) => (n < 0 ? "-$ " : "$ ") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = (iso) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Grupo 20 · ¿A quien vender hoy? ===\n");

    /* ============================================================ el simulacro cumple el documento */
    console.log("— el simulacro cumple lo que dice el documento —");
    const TIPOS_ESPERADOS = {
        V0313: ["REPONER", "REPONER", "LLAMAR"], V0278: ["REPONER", "REPONER", "LLAMAR"], V0320: ["REPONER", "REPONER", "REPONER"],
        V0330: ["REPONER", "LLAMAR"], V0290: ["REACTIVAR", "REACTIVAR", "REACTIVAR"], V0353: ["SIN_COMPRAS", "SIN_COMPRAS", "SIN_COMPRAS"],
        V0360: ["LIBRE", "LIBRE", "LIBRE"], V0399: []
    };
    const de = {};
    for (const cod of Object.keys(TIPOS_ESPERADOS)) de[cod] = delBackend(qvSim.VENDEDORES[cod].tipo, cod);

    ok("cada vendedor trae los tipos que el documento dice, en el orden de sus puestos",
       Object.keys(TIPOS_ESPERADOS).map((cod) => de[cod].sugeridos.map((x) => x.tipo)), Object.keys(TIPOS_ESPERADOS).map((cod) => TIPOS_ESPERADOS[cod]));
    ok("los puestos son 1, 2 y 3, y vienen ordenados", Object.keys(TIPOS_ESPERADOS).every((cod) => de[cod].sugeridos.every((x, i) => x.puesto === i + 1)), true);
    ok("los dos primeros son REPONER y el tercero LLAMAR en lo normal: V0313 (cartera) y V0278 (cobertura)",
       ["V0313", "V0278"].map((cod) => de[cod].sugeridos.map((x) => x.tipo)), [["REPONER", "REPONER", "LLAMAR"], ["REPONER", "REPONER", "LLAMAR"]]);
    ok("un REPONER puede ocupar el puesto 3 (V0320), y llegan menos de 3 (V0330)", [de.V0320.sugeridos[2].tipo, de.V0330.sugeridos.length], ["REPONER", 2]);
    ok("`vendedor.tipo` es CARTERA o COBERTURA, y `fecha` es el dia del servidor",
       [de.V0313.vendedor, de.V0278.vendedor.tipo, de.V0313.fecha], [{ codven: "V0313", tipo: "CARTERA" }, "COBERTURA", "2026-10-29"]);
    ok("el ritmo (`cada`, `ultima`, `compras`) solo viene en REPONER",
       de.V0313.sugeridos.map((x) => x.productos.every((q) => ("cada" in q && "ultima" in q && "compras" in q) === (x.tipo === "REPONER"))), [true, true, true]);
    ok("`mesesConCompra` y `facturasMesPasado` solo en LLAMAR",
       de.V0313.sugeridos.map((x) => [x.mesesConCompra !== null, x.facturasMesPasado !== null]), [[false, false], [false, false], [true, true]]);
    ok("SIN_COMPRAS: sin valor ni productos. LIBRE: con valor, sin productos y sin ultima compra",
       [de.V0353.sugeridos[0].valorUsd, de.V0353.sugeridos[0].productos, de.V0360.sugeridos[0].valorUsd > 0, de.V0360.sugeridos[0].productos, de.V0360.sugeridos[0].ultimaCompra],
       [null, [], true, [], null]);
    ok("sin clientes: `sugeridos: []` y un `aviso`, no un error", [de.V0399.sugeridos, de.V0399.aviso], [[], "todavia no hay clientes para sugerirte"]);
    ok("no hay telefono ni contacto en ninguna tarjeta", /tel[eé]fono|celular|contacto|whatsapp|email|correo/i.test(JSON.stringify(de)), false);
    ok("todo el dia, los mismos: pedirlo de nuevo devuelve exactamente lo mismo",
       (() => { marcasSim.reiniciar("CARTERA"); qvSim.reiniciar(); qvSim.usar("V0313");
                const a = JSON.stringify(qvSim.sugerir().cuerpo); const b = JSON.stringify(qvSim.sugerir().cuerpo); return a === b; })(), true);
    ok("solo la primera vez del dia se calcula", (() => { marcasSim.reiniciar("CARTERA"); qvSim.reiniciar(); qvSim.usar("V0313");
                                                          return [qvSim.sugerir().primera, qvSim.sugerir().primera, qvSim.estado.calculos]; })(), [true, false, 1]);
    ok("sin nada que sugerir no se graba nada: se vuelve a intentar la proxima vez", (() => { marcasSim.reiniciar("CARTERA"); qvSim.reiniciar(); qvSim.usar("V0399");
                                                                                              qvSim.sugerir(); qvSim.sugerir(); return qvSim.estado.calculos; })(), 0);
    ok("el grupo 25 y el 34 reciben `403 sin permiso`",
       ["ESPECIALISTA", "JEFATURA", "ZONA"].map((rol) => { marcasSim.reiniciar(rol); const r = qvSim.sugerir(); return [r.status, r.cuerpo.status]; }),
       [[403, "sin permiso"], [403, "sin permiso"], [403, "sin permiso"]]);

    /* ============================================================ lo normal: cartera, 2 reponer y 1 llamar */
    console.log("\n— V0313, de cartera: 2 para reponer y 1 para llamar —");
    preparar("CARTERA", "V0313");
    llamadas = [];
    let p = await montar("quienvender.html");
    await pausa(250);
    const d = de.V0313;

    ok("carga sin errores", fallos, 0);
    ok("pide la ruta UNA vez, sin parametros: el vendedor es el de la sesion", rutas(), ["/quienvender"]);
    ok("el titulo completo, y a que dia corresponde (el del backend)",
       [texto(p.doc.querySelector("h1")), p.doc.title, texto($(p, "periodo"))], ["¿A quién vender hoy?", "CDK · A quién vender hoy", "Para hoy, 29/10/2026"]);
    ok("dice que son los mismos todo el dia", texto($(p, "qv-nota")), "Son los mismos todo el día. Mañana habrá otros.");
    ok("tres tarjetas, en el orden de los puestos", tarjetas(p).map((li) => [li.getAttribute("data-puesto"), li.getAttribute("data-sugerencia")]),
       [["1", "REPONER"], ["2", "REPONER"], ["3", "LLAMAR"]]);
    ok("cada una con su cliente (por nombre) y su rotulo, dicho con texto", tarjetas(p).map((li) => [nombreDe(li), rotuloDe(li)]),
       [["SIMAF E.I.R.L.", "Reponer"], ["DISTRIBUIDORA TECNOLOGICA ANDINA S.A.C.", "Reponer"], ["SYSTEC CORP PERU S.A.C.", "Llamar"]]);
    ok("el motivo, con nuestras palabras segun el tipo", tarjetas(p).map(motivoDe),
       ["Productos que suele comprar y ya le tocan.", "Productos que suele comprar y ya le tocan.", "Compró el mes pasado y este mes todavía no."]);

    const [r1, , l3] = tarjetas(p);
    ok("dice, una vez, que los importes son dolares sin IGV", [texto($(p, "qv-importes")), p.doc.querySelectorAll("#qv-importes").length], ["Los importes están en dólares, sin IGV.", 1]);
    ok("REPONER: `valorUsd` es lo que valdria reponer, y la ultima compra",
       datosDe(r1), [`Lo que valdría reponer ${dolares(d.sugeridos[0].valorUsd)}`, `Última compra ${fechaCorta(d.sugeridos[0].ultimaCompra)}`]);
    ok("REPONER: no se presenta como la suma de la lista (es de todo lo que le toca; la tarjeta trae solo los de mas valor)",
       [/\b(suma|total)\b/i.test(texto(r1)), texto(r1.querySelector(".cdk-filas").previousElementSibling)], [false, "Lo que más vale de lo que le toca"]);
    ok("REPONER: sus productos con su part number y su ritmo (cantidad, cada cuantos dias, ultima, compras)",
       productosDe(r1)[0], { nombre: d.sugeridos[0].productos[0].descripcion, datos: ["Part number T544120-AL", "Suele llevar 36 por compra", "cada 10 días", "última 14/09/2026", "16 compras en 12 meses"] });
    ok("REPONER: sus 3 productos (el backend manda de 1 a 5, los de mas valor)", productosDe(r1).length, 3);
    ok("LLAMAR: `valorUsd` es su compra media mensual; y en cuantos de los ultimos 6 meses compro y las facturas del mes pasado",
       datosDe(l3), [`Compra media mensual ${dolares(d.sugeridos[2].valorUsd)}`, `Última compra ${fechaCorta(d.sugeridos[2].ultimaCompra)}`, "Compró en 6 de los últimos 6 meses", "Mes pasado 8 facturas"]);
    ok("LLAMAR: sus productos, sin ritmo: lo que llevo en los ultimos 3 meses",
       [productosDe(l3).length, productosDe(l3)[0].datos], [3, ["Part number PRIME H610M-F D4 R2.0", "Llevó 214 en los últimos 3 meses"]]);
    ok("LLAMAR: el ritmo de REPONER no aparece", texto(l3).includes("Suele llevar"), false);

    ok("NO se muestra el codigo del cliente, en ninguna tarjeta", d.sugeridos.filter((x) => texto($(p, "contenido")).includes(x.codcli)).map((x) => x.codcli), []);
    ok("tampoco hay telefono ni contacto", /tel[eé]fono|celular|contacto|whatsapp/i.test(texto($(p, "contenido"))), false);

    /* ---- solo informacion */
    ok("sin ningun boton: ni de cambiar ni de refrescar ni de copiar", p.doc.querySelectorAll("#contenido button").length, 0);
    ok("sin un solo enlace: es solo para leer", p.doc.querySelectorAll("#contenido a").length, 0);
    ok("sin recarga automatica: ningun intervalo ni temporizador de un minuto o mas", p.relojes, []);
    p.doc.dispatchEvent(new p.w.Event("visibilitychange"));
    p.w.dispatchEvent(new p.w.Event("focus"));
    p.w.dispatchEvent(new p.w.Event("online"));
    p.w.dispatchEvent(new p.w.Event("pageshow"));
    await pausa(100);
    ok("ni al volver a la pestaña: la ruta se pidio una sola vez", rutas(), ["/quienvender"]);

    /* ---- la espera */
    console.log("\n— la primera vez del dia el backend calcula, y la pantalla espera —");
    preparar("CARTERA", "V0313");
    let soltar;
    const espera = new Promise((r) => { soltar = r; });
    forzar = (ruta) => (ruta === "/quienvender" ? espera.then(() => respuesta(qvSim.sugerir().cuerpo)) : null);
    llamadas = [];
    p = await montar("quienvender.html");
    await pausa(100);
    ok("mientras tanto lo dice, sin tarjetas", [texto($(p, "contenido")), p.doc.getElementById("qv-sugeridos")], ["Preparando tus clientes de hoy…", null]);
    soltar();
    await pausa(150);
    ok("y al llegar, pinta las tres, sin pedirla de nuevo", [tarjetas(p).length, rutas()], [3, ["/quienvender"]]);

    /* ============================================================ cobertura */
    console.log("\n— V0278, de cobertura: un cliente con un nombre larguisimo y un producto sin part number —");
    preparar("COBERTURA", "V0278");
    llamadas = [];
    p = await montar("quienvender.html");
    await pausa(250);
    const dc = de.V0278;

    ok("las tres, y la tercera es de llamar", tarjetas(p).map((li) => li.getAttribute("data-sugerencia")), ["REPONER", "REPONER", "LLAMAR"]);
    const largo = tarjetas(p)[2];
    ok("el nombre largo se dice completo, y se parte en vez de salirse", [nombreDe(largo), largo.querySelector(".cdk-articulo__nombre").getAttribute("style").includes("overflow-wrap:anywhere")],
       [dc.sugeridos[2].cliente, true]);
    const sinPn = productosDe(largo).find((q) => q.nombre.startsWith("CASE ANTEC NX410"));
    ok("un producto sin part number no dice «Part number» y se ve igual", sinPn.datos, ["Llevó 18 en los últimos 3 meses"]);

    const unSolo = tarjetas(p)[1];       // el segundo REPONER de V0278 trae UN solo producto, como en bdnava08
    ok("un REPONER con un solo producto: se ve igual, con su titulo y su ritmo",
       [productosDe(unSolo).length, texto(unSolo.querySelector(".cdk-filas").previousElementSibling), productosDe(unSolo)[0].datos],
       [1, "Lo que más vale de lo que le toca", ["Part number TN1060", "Suele llevar 12 por compra", "cada 30 días", "última 25/09/2026", "5 compras en 12 meses"]]);

    /* ============================================================ los respaldos */
    console.log("\n— los respaldos: reactivar, sin compras y libres —");
    preparar("COBERTURA", "V0290");
    p = await montar("quienvender.html");
    await pausa(250);
    const dr = de.V0290;
    ok("REACTIVAR: lo que ESTE vendedor le vendio en 12 meses, ultima compra, y lo que mas llevaba",
       [rotuloDe(tarjetas(p)[0]), motivoDe(tarjetas(p)[0]), datosDe(tarjetas(p)[0]), productosDe(tarjetas(p)[0])[0].datos],
       ["Reactivar", "Hace 60 días o más que no compra.", [`Le vendiste en 12 meses ${dolares(dr.sugeridos[0].valorUsd)}`, `Última compra ${fechaCorta(dr.sugeridos[0].ultimaCompra)}`],
        ["Part number 0-761345-20103-2", "Llevaba 64 en los últimos 12 meses"]]);
    ok("REACTIVAR: el titulo de la lista de productos", texto(tarjetas(p)[0].querySelector(".cdk-filas").previousElementSibling), "Lo que más llevaba");

    preparar("COBERTURA", "V0353");
    p = await montar("quienvender.html");
    await pausa(250);
    ok("SIN_COMPRAS: sin valor, sin ultima compra, sin productos", [tarjetas(p).length, datosDe(tarjetas(p)[0]), productosDe(tarjetas(p)[0]), rotuloDe(tarjetas(p)[0])],
       [3, [], [], "Sin compras"]);
    ok("SIN_COMPRAS: dice por que se sugiere", motivoDe(tarjetas(p)[0]), "Cliente tuyo, sin compras en los últimos 12 meses.");
    ok("SIN_COMPRAS: sin importes, no dice «dolares sin IGV» (no hay de que)", p.doc.getElementById("qv-importes"), null);

    preparar("COBERTURA", "V0360");
    p = await montar("quienvender.html");
    await pausa(250);
    ok("LIBRE: dice que lo comprado es a TODOS los vendedores, no a este; sin ultima compra ni productos",
       [rotuloDe(tarjetas(p)[0]), datosDe(tarjetas(p)[0]), productosDe(tarjetas(p)[0])],
       ["Libre", [`Compró en 12 meses a todos los vendedores ${dolares(de.V0360.sugeridos[0].valorUsd)}`], []]);
    ok("LIBRE: tiene importes, asi que la nota de «dolares sin IGV» esta", texto(p.doc.getElementById("qv-importes")), "Los importes están en dólares, sin IGV.");

    preparar("CARTERA", "V0320");
    p = await montar("quienvender.html");
    await pausa(250);
    ok("un REPONER en el puesto 3 se pinta como cualquier otro", tarjetas(p).map((li) => [li.getAttribute("data-puesto"), rotuloDe(li)]), [["1", "Reponer"], ["2", "Reponer"], ["3", "Reponer"]]);

    preparar("COBERTURA", "V0330");
    p = await montar("quienvender.html");
    await pausa(250);
    ok("con solo dos candidatos llegan dos tarjetas, y no es un error", [tarjetas(p).length, p.doc.querySelector(".cdk-aviso--error")], [2, null]);

    /* ============================================================ sin clientes */
    console.log("\n— un vendedor que recien empieza: sin clientes, y no es un error —");
    preparar("CARTERA", "V0399");
    llamadas = [];
    p = await montar("quienvender.html");
    await pausa(250);
    ok("dice el aviso del backend, sin errores, y todavia dice a que dia corresponde",
       [texto($(p, "qv-aviso")), texto($(p, "periodo")), p.doc.querySelector(".cdk-aviso--error"), p.doc.querySelector("#contenido .cdk-estado button")],
       ["Todavia no hay clientes para sugerirte", "Para hoy, 29/10/2026", null, null]);
    ok("sin tarjetas, ni la nota de «los mismos todo el dia» ni la de los importes", [p.doc.getElementById("qv-sugeridos"), p.doc.getElementById("qv-nota"), p.doc.getElementById("qv-importes")], [null, null, null]);

    preparar("CARTERA", "V0399");
    alterar = (camino, r) => { if (camino === "/quienvender") r.cuerpo.data.aviso = null; return r; };
    p = await montar("quienvender.html");
    await pausa(250);
    ok("sin `aviso`, igual dice algo: no deja la pantalla en blanco", texto($(p, "qv-aviso")), "Hoy no hay clientes para sugerirte.");

    /* ============================================================ nada se calcula */
    console.log("\n— nada se calcula, y un tipo nuevo se pinta igual —");
    preparar("CARTERA", "V0313");
    alterar = (camino, r) => {
        if (camino === "/quienvender") {
            const s = r.cuerpo.data.sugeridos;
            s[0].valorUsd = 1234.5; s[0].productos[0].cada = 1; s[0].productos[0].compras = 1;
            s[2].facturasMesPasado = 1; s[2].mesesConCompra = 2;
            s[1].tipo = "NUEVO_TIPO"; s[1].motivo = "Un motivo que escribio el backend"; s[1].valorUsd = 99.9;
            r.cuerpo.data.fecha = "2026-10-30";      // el dia lo dice el backend, no el reloj del equipo
        }
        return r;
    };
    p = await montar("quienvender.html");
    await pausa(250);
    const [a1, a2, a3] = tarjetas(p);
    ok("el dia sale de la fecha del backend, no del reloj del equipo", texto($(p, "periodo")), "Para hoy, 30/10/2026");
    ok("el valor sale como lo manda el backend", datosDe(a1)[0], "Lo que valdría reponer $ 1,234.50");
    ok("en singular: cada 1 dia, 1 compra", [productosDe(a1)[0].datos[2], productosDe(a1)[0].datos[4]], ["cada 1 día", "1 compra en 12 meses"]);
    ok("en singular: 1 factura, 2 de los ultimos 6 meses", datosDe(a3).slice(-2), ["Compró en 2 de los últimos 6 meses", "Mes pasado 1 factura"]);
    ok("un `tipo` que no conocemos: su rotulo tal cual y el motivo del backend; el valor, sin inventar que significa",
       [rotuloDe(a2), motivoDe(a2), datosDe(a2)[0]], ["NUEVO_TIPO", "Un motivo que escribio el backend", "Valor $ 99.90"]);
    ok("y se pinta igual que las demas", [a2.getAttribute("data-sugerencia"), a2.getAttribute("data-puesto")], ["NUEVO_TIPO", "2"]);

    /* ============================================================ errores */
    console.log("\n— errores —");
    preparar("CARTERA", "V0313");
    forzar = (ruta) => (ruta === "/quienvender" ? respuesta({ status: "error query", codigo: 1, msg: "fallo el calculo de las sugerencias" }, 500) : null);
    llamadas = [];
    p = await montar("quienvender.html");
    await pausa(250);
    ok("un 500: lo dice y ofrece reintentar",
       [texto(p.doc.querySelector("#contenido .cdk-estado__texto")), p.doc.querySelector("#contenido .cdk-estado button") !== null], ["fallo el calculo de las sugerencias", true]);
    forzar = null;
    clic(p, p.doc.querySelector("#contenido .cdk-estado button"));
    await pausa(250);
    ok("«Reintentar» la pide otra vez, y la pantalla sigue", [rutas(), tarjetas(p).length], [["/quienvender", "/quienvender"], 3]);

    forzar = (ruta) => (ruta === "/quienvender" ? respuesta({ status: "sin permiso", codigo: 3, msg: "esta ruta es del grupo 20" }, 403) : null);
    p = await montar("quienvender.html");
    await pausa(250);
    ok("un 403 `sin permiso`: lo dice, sin reintentar", [texto(p.doc.querySelector("#contenido .cdk-estado__texto")), p.doc.querySelector("#contenido .cdk-estado button")],
       ["esta ruta es del grupo 20", null]);

    forzar = (ruta) => (ruta === "/quienvender" ? respuesta({ status: "no identificado", codigo: 2, msg: "la sesion no trae el usuario o el codigo de vendedor" }, 400) : null);
    p = await montar("quienvender.html");
    await pausa(250);
    ok("un 400 `no identificado`: lo dice, sin reintentar", [texto(p.doc.querySelector("#contenido .cdk-estado__texto")), p.doc.querySelector("#contenido .cdk-estado button")],
       ["la sesion no trae el usuario o el codigo de vendedor", null]);

    forzar = (ruta) => (ruta === "/quienvender" ? respuesta({ status: "ok", codigo: 0, data: { fecha: "2026-10-29" } }) : null);
    p = await montar("quienvender.html");
    await pausa(250);
    ok("una respuesta rara no se pinta a ojo", texto(p.doc.querySelector("#contenido .cdk-estado__texto")), "La respuesta no trae los clientes de hoy.");

    /* ============================================================ el menu */
    console.log("\n— el menu del vendedor (grupo 20) —");
    preparar("CARTERA", "V0313");
    p = await montar("quienvender.html");
    await pausa(250);
    const activo = p.doc.querySelector("#cdk-sidebar-lista .cdk-sidebar__enlace[aria-current='page'], #cdk-sidebar-lista .cdk-sidebar__enlace.es-activo");

    ok("«Vender hoy» sale en el menu lateral, marcado, y lleva a su pagina", [texto(activo), activo && activo.getAttribute("href")], ["Vender hoy", "/quienvender.html"]);
    ok("el menu lateral: «Vender hoy» tercero (prioridad 2,5) y «Promos vigentes» al final",
       [...p.doc.querySelectorAll("#cdk-sidebar-lista .cdk-sidebar__enlace")].map((a) => texto(a)),
       ["Cotización", "Pedido", "Vender hoy", "Ajustes", "Factura", "Promoción", "Cuota", "Listados", "Programador", "Promos vigentes"]);
    ok("en la barra inferior del movil entra «Vender hoy» en el tercer lugar; Factura pasa a «Más» (decidido el 29/10)",
       [...p.doc.querySelectorAll(".cdk-bottomnav__enlace")].map((a) => texto(a)), ["Cotización", "Pedido", "Vender hoy", "Ajustes", "Más"]);

    console.log(fallos ? `\n${fallos} comprobacion(es) fallaron.` : "\nTodo correcto.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.log("\nLa prueba se rompio:", e.message); console.log(e.stack.split("\n").slice(1, 4).join("\n")); process.exit(1); });
