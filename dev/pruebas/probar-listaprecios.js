/**
 * Prueba de integracion del modulo `listaprecios` del grupo 20 (cartera y cobertura): la lista de precios de venta, para ver en pantalla
 * o bajar a Excel, sobre la pagina real (listaprecios.html).
 *
 * Lo que mas importa:
 *
 *   · que NO se cuele nada que el backend no manda: la lista puede llegar a manos de los clientes, asi que ni costo, ni stock, ni codigos
 *     del sistema; y que NADA se calcule (los dos precios y el orden son los del backend)
 *   · que unas 6 400 filas no traben la pagina: se pintan de a 50, y los filtros (familia, marca y texto, sin tildes y con varias
 *     palabras) se hacen aqui, sin volver a pedir
 *   · que las familias y las marcas salgan de las FILAS, no de una lista propia
 *   · el Excel: se pide aparte y trae SIEMPRE la lista completa aunque haya un filtro, se guarda solo si es de verdad una hoja de
 *     calculo, el boton no deja pulsar dos veces, y los errores se dicen
 *   · errores: un 500 se puede reintentar, un 403 no; una respuesta rara no se pinta a ojo
 *   · el menu del grupo 20: «Lista de precios» al final, en «Mas»
 *
 * El simulacro es dev/simulador-listaprecios.js, el mismo de dev/servidor.js.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const listaSim = require("../simulador-listaprecios");

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
let retardo = 0;             // ms que tarda el Excel, para ver el boton «Generando…»
let sinLaClave = false;      // el menu NO trae `listaprecios`: asi sale del backend hasta que la pantalla este publicada

function respuesta(obj, status, tipo) {
    const cuerpo = typeof obj === "string" ? obj : JSON.stringify(obj);
    return {
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        headers: { get: (n) => (n.toLowerCase() === "content-type" ? (tipo || "application/json") : null) },
        /* Con blob() a proposito: una implementacion que guardara cualquier 200 tiene que poder hacerlo, o la prueba pasaria por otra razon. */
        blob: () => Promise.resolve(new Blob([cuerpo])),
        text: () => Promise.resolve(cuerpo)
    };
}

function archivo(a) {
    return {
        status: 200, ok: true, statusText: "",
        headers: { get: (n) => ({ "content-type": a.tipo, "content-disposition": `attachment; filename="${a.nombre}"` })[n.toLowerCase()] || null },
        blob: () => Promise.resolve(new Blob([a.contenido])),
        text: () => Promise.resolve("")
    };
}

/* Lo que recibe un vendedor del grupo 20 en el menu (dev/servidor.js, `modulosDe`): todo lo suyo mas las claves nuevas. */
const MENU = {
    cotizacion: "Crear, consultar y modificar cotizaciones", pedido: "Gestión de pedidos y flete", factura: "Modificación de datos de facturas",
    promocion: "Aplicar y quitar promociones", cuota: "Registro y avance de tu cuota mensual", listas: "Listados de cotizaciones, pedidos, facturas y clientes",
    programador: "Programación de entregas en almacén", ajuste: "Ajuste de precio de cotizaciones y pedidos",
    promovigentes: "Mira las promociones vigentes para ofrecer a tus clientes", quienvender: "Los 3 clientes de hoy: 2 para reponer y 1 para llamar",
    listaprecios: "Descarga la lista de precios de venta, sin IGV y con IGV"
};

/** Una copia del resultado del simulacro: el simulacro devuelve SUS filas, y cambiarlas ahi dejaria el cambio para las demas pruebas. */
const clonar = (r) => ({ status: r.status, cuerpo: JSON.parse(JSON.stringify(r.cuerpo)) });

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo, metodo: (opciones && opciones.method) || "GET" });

    const ruta = url.replace(/^https?:\/\/[^/]+\/v1/, "");
    const entregar = (r, ms) => (ms ? new Promise((res) => setTimeout(() => res(r), ms)) : Promise.resolve(r));

    const forzada = forzar && forzar(ruta, cuerpo);
    if (forzada) return entregar(forzada, cuerpo.formato === "xlsx" ? retardo : 0);

    if (ruta === "/vendedor") {
        const menu = sinLaClave ? Object.fromEntries(Object.entries(MENU).filter((e) => e[0] !== "listaprecios")) : MENU;
        return Promise.resolve(respuesta({ status: "ok", codigo: 0, data: menu, nombre: "CRISTOPHER GONZALES", grupo: "VENTAS-EJECUTIVOS", tipo: S.rol, tipoCambio: 3.75 }));
    }

    let r = null;
    if (ruta === "/reporte/listaprecios") r = listaSim.lista(cuerpo);
    if (!r) return Promise.resolve(respuesta({ msg: "no simulado: " + ruta }, 404));

    if (r.archivo) return entregar(archivo(r.archivo), retardo);

    if (alterar) r = alterar(ruta, cuerpo, clonar(r)) || r;
    return Promise.resolve(respuesta(r.cuerpo, r.status));
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
    const destinos = [], descargas = [];

    /* Siempre el mismo dia: la prueba no puede depender del dia que se corra. */
    const Real = w.Date;
    w.Date = class extends Real {
        constructor(...a) { if (a.length) super(...a); else super(2026, 9, 30, 12); }
        static now() { return new Real(2026, 9, 30, 12).getTime(); }
    };

    w.console.warn = () => {};
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
    w.HTMLAnchorElement.prototype.click = function () { descargas.push({ href: this.getAttribute("href"), nombre: this.getAttribute("download") }); };

    for (const rel of scripts) {
        try { w.eval("(function (location) {\n" + leer(rel) + "\n})(window.__location)"); }
        catch (e) { console.log(`  FALLA  ${rel}: ${e.message}`); fallos++; }
    }

    return { w, doc: w.document, destinos, descargas };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
const escribir = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("input", { bubbles: true })); };
const elegir = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("change", { bubbles: true })); };
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);
const sinNbsp = (t) => t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const texto = (n) => (n ? sinNbsp(n.textContent) : null);

const $ = (p, id) => p.doc.getElementById(id);
const lista = () => listaSim.lista({}).cuerpo.data;           // lo que el backend dice, para comparar con lo que sale en pantalla
const dolares = (n) => "$ " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const filasPantalla = (p) => [...p.doc.querySelectorAll("#lp-productos > li")];
const nombreDe = (li) => texto(li.querySelector(".cdk-fila__nombre"));
const sinIgvDe = (li) => texto(li.querySelector(".lp-sin-igv"));
const conIgvDe = (li) => texto(li.querySelector(".lp-con-igv"));
const datosDe = (li) => [...li.querySelectorAll(".cdk-fila__datos > *")].map((n) => texto(n));
const opcionesDe = (select) => [...select.options].map((o) => o.textContent);
const llamadasALaLista = () => llamadas.filter((l) => l.url.includes("/reporte/listaprecios"));

function preparar(rol) {
    marcasSim.reiniciar(rol || "CARTERA");
    forzar = null; alterar = null; retardo = 0; sinLaClave = false;
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Grupo 20 · lista de precios ===\n");

    /* ============================================================ el simulacro cumple el contrato */
    console.log("— el simulacro cumple lo que dice el documento —");
    preparar();
    const d = lista();
    const f = d.filas;
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const familiasDelSim = [...new Set(f.map((x) => x.familia))];

    ok("6 396 filas, de 8 familias, y 135 marcas", [f.length, familiasDelSim.length, new Set(f.map((x) => x.marca)).size], [6396, 8, 135]);
    ok("las cifras por familia son las del documento",
       Object.fromEntries(familiasDelSim.map((x) => [x, f.filter((y) => y.familia === x).length])),
       { "ACCESORIOS Y PERIFERICOS": 1031, "ALMACENAMIENTO EXTERNO": 597, "EQUIPOS INFORMATICOS": 24, "EQUIPOS MULTIMEDIA": 7, "IMPRESION": 300, "MOVILIDAD": 1405, "PARTES Y PIEZAS": 1167, "SUMINISTROS": 1865 });
    ok("siete columnas, en el orden del Excel", d.columnas.map((c) => c.campo),
       ["descripcion", "partNumber", "marca", "familia", "precioSinIgv", "precioConIgv", "disponibilidad"]);
    ok("sin costo, sin stock y sin codigos del sistema: cada fila trae solo esos siete campos",
       f.every((x) => Object.keys(x).sort().join() === ["descripcion", "disponibilidad", "familia", "marca", "partNumber", "precioConIgv", "precioSinIgv"].join()), true);
    ok("ya ordenada por familia, marca y descripcion",
       f.every((x, i) => i === 0 || (cmp(f[i - 1].familia, x.familia) || cmp(f[i - 1].marca, x.marca) || cmp(f[i - 1].descripcion, x.descripcion)) <= 0), true);
    ok("`precioConIgv` es `precioSinIgv` por 1,18 a un centimo, en todas", f.every((x) => Math.abs(x.precioConIgv - x.precioSinIgv * 1.18) <= 0.0051), true);
    ok("los precios son numeros, y ninguno es cero", f.every((x) => typeof x.precioSinIgv === "number" && typeof x.precioConIgv === "number" && x.precioSinIgv > 0), true);
    ok("la disponibilidad es la misma en todas las filas", [...new Set(f.map((x) => x.disponibilidad))], ["SUJETO A DISPONIBILIDAD"]);
    ok("42 sin part number (`\"\"`), y la descripcion mas larga es de 80 caracteres",
       [f.filter((x) => x.partNumber === "").length, Math.max(...f.map((x) => x.descripcion.length))], [42, 80]);
    ok("«formato» json, sin ponerlo, o en mayusculas: la lista", [listaSim.lista({}).status, listaSim.lista({ formato: "JSON" }).status, listaSim.lista().status], [200, 200, 200]);
    ok("`pdf`: `400 formato invalido`", [listaSim.lista({ formato: "pdf" }).status, listaSim.lista({ formato: "pdf" }).cuerpo.status], [400, "formato invalido"]);
    ok("`xlsx` (tambien en mayusculas) trae un archivo, con el nombre del dia",
       [listaSim.lista({ formato: "XLSX" }).archivo.nombre, listaSim.lista({ formato: "xlsx" }).archivo.contenido.slice(0, 2).toString()], ["lista-precios-2026-10-30.xlsx", "PK"]);
    ok("el grupo 25 y el 34 reciben `403 sin permiso`, en json y en xlsx",
       ["ESPECIALISTA", "JEFATURA", "ZONA"].map((rol) => { marcasSim.reiniciar(rol); return [listaSim.lista({}).status, listaSim.lista({ formato: "xlsx" }).status, listaSim.lista({}).cuerpo.status]; }),
       [[403, 403, "sin permiso"], [403, 403, "sin permiso"], [403, 403, "sin permiso"]]);

    /* ============================================================ la pantalla */
    console.log("\n— la pantalla: lo primero que se ve —");
    preparar("CARTERA");
    llamadas = [];
    let p = await montar("listaprecios.html");
    await pausa(500);

    ok("carga sin errores", fallos, 0);
    ok("pide la lista UNA vez, en json, y nada mas", llamadasALaLista().map((l) => [l.metodo, l.cuerpo]), [["POST", { formato: "json" }]]);
    ok("el titulo, y a que dia corresponde (el del backend)", [texto(p.doc.querySelector("h1")), p.doc.title, texto($(p, "periodo"))],
       ["Lista de precios", "CDK · Lista de precios", "Lista del 30/10/2026"]);
    ok("dice en que moneda y que no depende del cliente, y la disponibilidad UNA sola vez",
       [texto($(p, "lp-nota")).includes("dólares (US$), antes del descuento por tipo de cliente"), texto($(p, "lp-nota")).includes("mismos para todos los clientes"),
        texto($(p, "lp-nota")).endsWith("Sujeto a disponibilidad.")], [true, true, true]);
    ok("se pintan 50 filas, no 6 396", filasPantalla(p).length, 50);
    ok("y dice cuantas hay", texto($(p, "lp-cuenta")), "Se muestran 50 de 6,396.");
    ok("con su boton para ver mas", texto($(p, "lp-mas")), "Mostrar 50 más");

    const primeras = filasPantalla(p);
    ok("las filas van en el orden del backend (la pantalla no ordena)", primeras.map(nombreDe), f.slice(0, 50).map((x) => sinNbsp(x.descripcion)));
    ok("cada una con sus dos precios, dichos con TEXTO: sin IGV y con IGV, tal cual los manda el backend",
       primeras.slice(0, 3).map((li, i) => [sinIgvDe(li), conIgvDe(li)]), f.slice(0, 3).map((x) => [dolares(x.precioSinIgv), dolares(x.precioConIgv) + " con IGV"]));
    ok("y la leyenda «sin IGV» junto al precio de venta", primeras.slice(0, 3).every((li) => texto(li.querySelector(".cdk-fila__importe")).includes("sin IGV")), true);
    ok("con part number, marca y familia", datosDe(primeras[0]), [f[0].partNumber ? `Part number ${f[0].partNumber}` : "Sin part number", f[0].marca, f[0].familia]);

    const todoElTexto = texto($(p, "lp-productos"));
    ok("nada de costo, de stock ni de codigos del sistema, en ninguna fila", /costo|stock|\bcodi\b|\bcodf\b/i.test(todoElTexto), false);
    ok("la disponibilidad no se repite en cada fila (ya se dijo arriba)", /disponibilidad/i.test(todoElTexto), false);
    ok("ni ningun boton ni enlace que modifique algo en la lista", p.doc.querySelectorAll("#lp-productos button, #lp-productos a").length, 0);

    /* ---- ver mas */
    clic(p, $(p, "lp-mas"));
    ok("«Mostrar 50 más» agrega 50, sin borrar las anteriores", [filasPantalla(p).length, nombreDe(filasPantalla(p)[0]), texto($(p, "lp-cuenta"))],
       [100, sinNbsp(f[0].descripcion), "Se muestran 100 de 6,396."]);
    ok("las nuevas siguen el orden del backend", filasPantalla(p).slice(50).map(nombreDe), f.slice(50, 100).map((x) => sinNbsp(x.descripcion)));

    /* ============================================================ los filtros */
    console.log("\n— familia, marca y busqueda —");
    ok("las familias del selector salen de las filas, en su orden", opcionesDe($(p, "lp-familia")), ["Todas las familias"].concat(familiasDelSim));
    ok("las marcas del selector: todas, ordenadas", opcionesDe($(p, "lp-marca")).length === 136 && opcionesDe($(p, "lp-marca"))[0] === "Todas las marcas", true);
    ok("las marcas estan ordenadas",
       opcionesDe($(p, "lp-marca")).slice(1).every((m, i, a) => i === 0 || a[i - 1] <= m), true);

    llamadas = [];
    elegir(p, $(p, "lp-familia"), "EQUIPOS INFORMATICOS");
    const portatiles = f.filter((x) => x.familia === "EQUIPOS INFORMATICOS");
    ok("una familia de 24 filas: salen las 24, todas de esa familia, y dice cuantas",
       [filasPantalla(p).length, filasPantalla(p).every((li) => datosDe(li).includes("EQUIPOS INFORMATICOS")), texto($(p, "lp-cuenta"))], [24, true, "24 productos."]);
    ok("y ya no ofrece «Mostrar más»", $(p, "lp-mas").style.display, "none");
    ok("en el orden del backend", filasPantalla(p).map(nombreDe), portatiles.map((x) => sinNbsp(x.descripcion)));
    ok("las marcas del selector son solo las de esa familia",
       opcionesDe($(p, "lp-marca")).slice(1), [...new Set(portatiles.map((x) => x.marca))].sort(cmp));

    const unaMarca = portatiles[0].marca;
    elegir(p, $(p, "lp-marca"), unaMarca);
    ok("una marca dentro de la familia: solo las suyas",
       [filasPantalla(p).length, filasPantalla(p).every((li) => datosDe(li).includes(unaMarca))], [portatiles.filter((x) => x.marca === unaMarca).length, true]);

    elegir(p, $(p, "lp-familia"), "SUMINISTROS");
    ok("al cambiar de familia, si la marca no esta en la nueva, se suelta (no deja la lista vacia por un filtro escondido)",
       $(p, "lp-marca").value === (f.some((x) => x.familia === "SUMINISTROS" && x.marca === unaMarca) ? unaMarca : "") && filasPantalla(p).length > 0, true);

    /* Una marca que la familia nueva NO tiene se suelta: si no, quedaria un filtro escondido y la lista saldria vacia sin decir por que. */
    elegir(p, $(p, "lp-marca"), "");
    elegir(p, $(p, "lp-familia"), "EQUIPOS MULTIMEDIA");
    elegir(p, $(p, "lp-marca"), opcionesDe($(p, "lp-marca"))[1]);
    elegir(p, $(p, "lp-familia"), "IMPRESION");
    ok("una marca que la nueva familia no tiene se suelta: no queda un filtro escondido que vacie la lista",
       [$(p, "lp-marca").value, texto($(p, "lp-cuenta"))], ["", "Se muestran 50 de 300."]);

    elegir(p, $(p, "lp-marca"), "");
    elegir(p, $(p, "lp-familia"), "");
    ok("«Todas las familias» y «Todas las marcas» devuelven la lista entera", [filasPantalla(p).length, texto($(p, "lp-cuenta"))], [50, "Se muestran 50 de 6,396."]);

    /* ---- busqueda */
    escribir(p, $(p, "lp-buscar"), "precog");
    ok("buscar por descripcion: encuentra la del ejemplo del documento, con sus dos precios",
       [filasPantalla(p).length, nombreDe(filasPantalla(p)[0]), sinIgvDe(filasPantalla(p)[0]), conIgvDe(filasPantalla(p)[0])],
       [1, "HEADSET 3.5MM PRECOG S-WHCWW", "$ 18.00", "$ 21.24 con IGV"]);
    ok("1 resultado, en singular", texto($(p, "lp-cuenta")), "1 producto.");

    escribir(p, $(p, "lp-buscar"), "1vv22al");
    ok("por part number, sin importar mayusculas", filasPantalla(p).map((li) => datosDe(li)[0]), ["Part number 1VV22AL"]);

    escribir(p, $(p, "lp-buscar"), "español");
    ok("«español» encuentra ESPAÑOL", filasPantalla(p).some((li) => nombreDe(li) === "TECLADO USB ESPAÑOL CON LECTOR DE DNI"), true);
    escribir(p, $(p, "lp-buscar"), "ESPANOL dni");
    ok("sin la eñe y con varias palabras (todas tienen que estar): tambien", filasPantalla(p).map(nombreDe), ["TECLADO USB ESPAÑOL CON LECTOR DE DNI"]);

    escribir(p, $(p, "lp-buscar"), "adata");
    ok("por marca", filasPantalla(p).length > 0 && filasPantalla(p).every((li) => /adata/i.test(texto(li))), true);

    /* Estas dos buscan algo que SOLO esta en el part number, o SOLO en la marca: si no, la busqueda pasaria aunque no mirara esos campos. */
    escribir(p, $(p, "lp-buscar"), "kb-dni-es");
    ok("por part number, cuando el texto no esta en la descripcion", filasPantalla(p).map(nombreDe), ["TECLADO USB ESPAÑOL CON LECTOR DE DNI"]);
    escribir(p, $(p, "lp-buscar"), "adata precog");
    ok("por marca, cuando su nombre no esta en la descripcion (y junto con otra palabra)", filasPantalla(p).map(nombreDe), ["HEADSET 3.5MM PRECOG S-WHCWW"]);

    escribir(p, $(p, "lp-buscar"), "tinta epson");
    ok("varias palabras: todas, en cualquier orden (no solo la frase pegada)",
       filasPantalla(p).length > 0 && filasPantalla(p).every((li) => /tinta/i.test(nombreDe(li)) && /epson/i.test(texto(li))), true);

    escribir(p, $(p, "lp-buscar"), "   ");
    ok("solo espacios: no filtra", filasPantalla(p).length, 50);

    elegir(p, $(p, "lp-familia"), "MOVILIDAD");
    escribir(p, $(p, "lp-buscar"), "adaptador");
    ok("busqueda y familia juntas: las dos se cumplen",
       filasPantalla(p).length > 0 && filasPantalla(p).every((li) => datosDe(li).includes("MOVILIDAD") && /adaptador/i.test(nombreDe(li))), true);

    escribir(p, $(p, "lp-buscar"), "zzzzzz");
    ok("sin coincidencias: lo dice, sin filas y sin boton de ver mas",
       [filasPantalla(p).length, texto($(p, "lp-lista")), $(p, "lp-mas").style.display, texto($(p, "lp-cuenta"))], [0, "Ningún producto coincide.", "none", ""]);
    ok("ningun filtro volvio a pedir nada al backend", llamadas.length, 0);

    escribir(p, $(p, "lp-buscar"), "");
    elegir(p, $(p, "lp-familia"), "");
    ok("al limpiar vuelve todo", filasPantalla(p).length, 50);

    /* ---- sin part number */
    escribir(p, $(p, "lp-buscar"), "estuche rigido");
    ok("un producto sin part number lo dice y no inventa uno",
       [filasPantalla(p).map(nombreDe), datosDe(filasPantalla(p)[0])], [["ESTUCHE RIGIDO PARA DISCO EXTERNO 2.5 PULGADAS"], ["Sin part number", "SEAGATE", "ALMACENAMIENTO EXTERNO"]]);

    /* ============================================================ nada se calcula */
    console.log("\n— nada se calcula —");
    preparar("COBERTURA");
    alterar = (ruta, cuerpo, r) => {
        if (cuerpo.formato !== "xlsx") {
            const ff = r.cuerpo.data.filas;
            ff[0].precioConIgv = 99.99;                // no es el precio sin IGV por 1,18
            ff[1].precioSinIgv = 10; ff[1].precioConIgv = 11.8;
            ff[2].familia = "FAMILIA NUEVA DEL BACKEND";
            ff[3].disponibilidad = "SOLO HOY";
            r.cuerpo.data.fecha = "2026-10-31";        // el dia lo dice el backend, no el reloj del equipo
        }
        return r;
    };
    p = await montar("listaprecios.html");
    await pausa(500);
    const alt = filasPantalla(p);

    ok("el precio con IGV sale como lo manda el backend, aunque no coincida con el por 1,18", [conIgvDe(alt[0]), sinIgvDe(alt[1]), conIgvDe(alt[1])],
       ["$ 99.99 con IGV", "$ 10.00", "$ 11.80 con IGV"]);
    ok("el dia sale del backend, no del reloj del equipo", texto($(p, "periodo")), "Lista del 31/10/2026");
    ok("una familia nueva del backend aparece en el selector (la pantalla no tiene su propia lista)", opcionesDe($(p, "lp-familia")).includes("FAMILIA NUEVA DEL BACKEND"), true);
    ok("y si la disponibilidad deja de ser la misma en todas, se dice en cada fila y no arriba",
       [alt[3].textContent.includes("Solo hoy"), texto($(p, "lp-nota")).includes("Sujeto a disponibilidad")], [true, false]);

    /* ============================================================ excel */
    console.log("\n— Excel: la lista completa, aunque haya un filtro —");
    preparar("CARTERA");
    retardo = 200;
    llamadas = [];
    p = await montar("listaprecios.html");
    await pausa(500);

    elegir(p, $(p, "lp-familia"), "IMPRESION");
    escribir(p, $(p, "lp-buscar"), "laser");
    const exportar = $(p, "lp-exportar");

    ok("hay un boton de Excel, y dice que trae la lista completa aunque haya filtros", [texto(exportar), texto($(p, "lp-aviso-excel"))],
       ["Descargar Excel", "El Excel trae la lista completa (6,396 productos), aunque tengas filtros puestos."]);

    llamadas = [];
    clic(p, exportar);
    ok("mientras se genera, el boton no deja pulsar otra vez", [exportar.disabled, texto(exportar)], [true, "Generando…"]);
    clic(p, exportar);
    await pausa(450);

    ok("pide el archivo UNA vez, sin ningun dato del filtro (el filtro es de la pantalla)", llamadasALaLista().map((l) => l.cuerpo), [{ formato: "xlsx" }]);
    ok("lo guarda con el nombre que pone el servidor", p.descargas.map((x) => x.nombre), ["lista-precios-2026-10-30.xlsx"]);
    ok("lo avisa", toasts(p.doc), ["Se descargó lista-precios-2026-10-30.xlsx"]);
    ok("y el boton vuelve a estar libre", [exportar.disabled, texto(exportar)], [false, "Descargar Excel"]);
    ok("el filtro de la pantalla sigue como estaba", [$(p, "lp-familia").value, $(p, "lp-buscar").value], ["IMPRESION", "laser"]);

    /* ---- si en vez de un Excel llega un error */
    console.log("\n— si en vez de un Excel llega un error —");
    retardo = 0;
    p.descargas.length = 0;
    forzar = (ruta, cuerpo) => cuerpo.formato === "xlsx" ? respuesta({ status: "error query", codigo: 1, msg: "fallo la consulta de la lista" }, 500) : null;
    clic(p, exportar); await pausa(200);
    ok("un 500: se muestra el mensaje del backend y no se guarda nada", [toasts(p.doc).slice(-1)[0], p.descargas.length], ["fallo la consulta de la lista", 0]);

    forzar = (ruta, cuerpo) => cuerpo.formato === "xlsx" ? respuesta({ status: "formato invalido", codigo: 2, msg: "el formato es json o xlsx" }, 400) : null;
    clic(p, exportar); await pausa(200);
    ok("un 400 `formato invalido`: tambien", [toasts(p.doc).slice(-1)[0], p.descargas.length], ["el formato es json o xlsx", 0]);

    /* Un 200 que no es la hoja tampoco se guarda: un fallo y un Excel corrupto se verian igual. */
    forzar = (ruta, cuerpo) => cuerpo.formato === "xlsx" ? respuesta("<html>mantenimiento</html>", 200, "text/html") : null;
    clic(p, exportar); await pausa(200);
    ok("un 200 que no es una hoja de calculo no se guarda como si lo fuera", p.descargas.length, 0);
    ok("y el boton sigue funcionando", [exportar.disabled, texto(exportar)], [false, "Descargar Excel"]);

    forzar = (ruta, cuerpo) => cuerpo.formato === "xlsx" ? respuesta({ status: "sin permiso", codigo: 3, msg: "esta ruta es del grupo 20" }, 403) : null;
    clic(p, exportar); await pausa(200);
    ok("un 403: el mensaje, y nada guardado", [toasts(p.doc).slice(-1)[0], p.descargas.length], ["esta ruta es del grupo 20", 0]);

    forzar = (ruta, cuerpo) => cuerpo.formato === "xlsx" ? respuesta({ status: "falsa galleta", codigo: 1, msg: "la galleta no existe" }, 401) : null;
    let expiradas = 0;
    p.w.CDK.sesion.expirar = () => { expiradas++; };
    const avisosAntes = toasts(p.doc).length;
    clic(p, exportar); await pausa(200);
    ok("sesion vencida al bajar el Excel: se da por vencida (va al login) y no se guarda ni se avisa de un error",
       [expiradas, p.descargas.length, toasts(p.doc).length], [1, 0, avisosAntes]);

    /* ============================================================ errores */
    console.log("\n— errores —");
    preparar("CARTERA");
    forzar = (ruta) => (ruta === "/reporte/listaprecios" ? respuesta({ status: "error query", codigo: 1, msg: "fallo la consulta" }, 500) : null);
    llamadas = [];
    p = await montar("listaprecios.html");
    await pausa(300);
    ok("un 500 en la lista: lo dice y ofrece reintentar",
       [texto(p.doc.querySelector("#contenido .cdk-estado__texto")), p.doc.querySelector("#contenido .cdk-estado button") !== null], ["fallo la consulta", true]);
    forzar = null;
    clic(p, p.doc.querySelector("#contenido .cdk-estado button"));
    await pausa(500);
    ok("«Reintentar» la pide otra vez, y la pantalla sigue", [llamadasALaLista().length, filasPantalla(p).length], [2, 50]);

    forzar = (ruta) => (ruta === "/reporte/listaprecios" ? respuesta({ status: "sin permiso", codigo: 3, msg: "esta ruta es del grupo 20" }, 403) : null);
    p = await montar("listaprecios.html");
    await pausa(300);
    ok("un 403 `sin permiso`: lo dice, sin reintentar (no hay nada que reintentar)",
       [texto(p.doc.querySelector("#contenido .cdk-estado__texto")), p.doc.querySelector("#contenido .cdk-estado button")], ["esta ruta es del grupo 20", null]);

    forzar = (ruta) => (ruta === "/reporte/listaprecios" ? respuesta({ status: "ok", codigo: 0, data: { fecha: "2026-10-30" } }) : null);
    p = await montar("listaprecios.html");
    await pausa(300);
    ok("una respuesta rara no se pinta a ojo", texto(p.doc.querySelector("#contenido .cdk-estado__texto")), "La respuesta no trae la lista de precios.");

    forzar = (ruta) => (ruta === "/reporte/listaprecios" ? respuesta({ status: "ok", codigo: 0, data: { fecha: "2026-10-30", columnas: [], filas: [] } }) : null);
    p = await montar("listaprecios.html");
    await pausa(300);
    ok("sin ninguna fila: lo dice, y no es un error", [texto($(p, "contenido")), p.doc.querySelector(".cdk-aviso--error")], ["La lista de precios no trae productos.", null]);

    /* ============================================================ el menu */
    console.log("\n— el menu del vendedor (grupo 20) —");
    preparar("CARTERA");
    llamadas = [];
    p = await montar("listaprecios.html");
    await pausa(500);
    const activo = p.doc.querySelector("#cdk-sidebar-lista .cdk-sidebar__enlace[aria-current='page'], #cdk-sidebar-lista .cdk-sidebar__enlace.es-activo");

    ok("«Lista de precios» sale en el menu lateral, marcada, y lleva a su pagina", [texto(activo), activo && activo.getAttribute("href")], ["Lista de precios", "/listaprecios.html"]);
    ok("el menu lateral: «Lista de precios» es lo ultimo, y no mueve a nadie",
       [...p.doc.querySelectorAll("#cdk-sidebar-lista .cdk-sidebar__enlace")].map((a) => texto(a)),
       ["Cotización", "Pedido", "Vender hoy", "Ajustes", "Factura", "Promoción", "Cuota", "Listados", "Programador", "Promos vigentes", "Lista de precios"]);
    ok("en el movil: es la pagina abierta, asi que ocupa el ultimo espacio de la barra",
       [...p.doc.querySelectorAll(".cdk-bottomnav__enlace")].map((a) => texto(a)), ["Cotización", "Pedido", "Vender hoy", "Lista de precios", "Más"]);

    /* ---- con la clave APAGADA: asi sale del backend hasta que la pantalla este publicada, y asi se recorre en el servidor de prueba */
    console.log("\n— con la clave apagada (el menu no trae «Lista de precios») —");
    preparar("CARTERA");
    sinLaClave = true;
    llamadas = [];
    p = await montar("listaprecios.html");
    await pausa(500);

    ok("entrando directo a la pagina, abre igual: pide la lista y la pinta, sin error ni redireccion",
       [llamadasALaLista().length, filasPantalla(p).length, p.doc.querySelector(".cdk-aviso--error"), p.destinos], [1, 50, null, []]);
    ok("el menu no la ofrece (nadie ve una entrada que lleve a otra parte), y no marca nada como activo por ella",
       [[...p.doc.querySelectorAll("#cdk-sidebar-lista .cdk-sidebar__enlace")].map((a) => texto(a)).includes("Lista de precios"),
        p.doc.querySelectorAll("#cdk-sidebar-lista .cdk-sidebar__enlace.es-activo, #cdk-sidebar-lista .cdk-sidebar__enlace[aria-current='page']").length], [false, 0]);
    ok("la barra del movil queda como siempre, sin dejarla en «Más» a la fuerza",
       [...p.doc.querySelectorAll(".cdk-bottomnav__enlace")].map((a) => texto(a)), ["Cotización", "Pedido", "Vender hoy", "Ajustes", "Más"]);
    ok("y el Excel se baja igual (la ruta responde a cualquier vendedor del grupo 20)", await (async () => {
        clic(p, $(p, "lp-exportar")); await pausa(300); return p.descargas.map((x) => x.nombre); })(), ["lista-precios-2026-10-30.xlsx"]);

    console.log(fallos ? `\n${fallos} comprobacion(es) fallaron.` : "\nTodo correcto.");
    process.exit(fallos ? 1 : 0);
})().catch((e) => { console.log("\nLa prueba se rompio:", e.message); console.log(e.stack.split("\n").slice(1, 4).join("\n")); process.exit(1); });
