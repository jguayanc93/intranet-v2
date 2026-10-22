/**
 * Prueba de integracion de Reportes por marca (grupo 25), sobre la pagina real.
 *
 * Lo que mas importa:
 *
 *   · que sin marcas en el mes NO haya reportes, y que se diga por que: es una
 *     regla de negocio, no un fallo
 *   · que cada informe se pida por `codmar` —el texto de la marca no dice cual
 *     de las marcas partidas es— y con el formato correcto
 *   · que la tabla pinte lo que llega y NO sume nada: `total` es del backend
 *   · que un `null` signifique cada cosa donde corresponde (sin compra desde
 *     2023, sin alta en M&M) y que un 0 siga siendo un 0
 *   · que el Excel se distinga de un error por el Content-Type, y que un error
 *     no se guarde como si fuera una hoja
 *   · que lo que llega tarde de un informe viejo no pise al que se pidio despues
 *
 * El simulacro es dev/simulador-reportes.js —el mismo de dev/servidor.js— y lee
 * las marcas de dev/simulador-marcas.js: lo que ve cada quien es lo que tiene.
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const marcasSim = require("../simulador-marcas");
const reportesSim = require("../simulador-reportes");

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
let forzar = null;          // (ruta, cuerpo) -> respuesta ya armada, para probar errores
let alterar = null;         // (ruta, cuerpo, resultado) -> resultado, para probar que no se suma
let retardo = {};           // "ruta:formato" -> ms, para que unas respuestas lleguen tarde

const esperar = (ms, valor) => new Promise((r) => setTimeout(() => r(valor), ms));

function respuesta(obj, status, tipo) {
    const cuerpo = typeof obj === "string" ? obj : JSON.stringify(obj);
    return {
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        headers: { get: (n) => (n.toLowerCase() === "content-type" ? (tipo || "application/json") : null) },
        /* Con blob() a proposito: una implementacion que guardara cualquier 200
           tiene que poder hacerlo, o la prueba pasaria por otra razon. */
        blob: () => Promise.resolve(new Blob([cuerpo])),
        text: () => Promise.resolve(cuerpo)
    };
}

function archivo(a) {
    return {
        status: 200, ok: true, statusText: "",
        headers: { get: (n) => ({ "content-type": a.tipo,
                                  "content-disposition": `attachment; filename="${a.nombre}"` })[n.toLowerCase()] || null },
        blob: () => Promise.resolve(new Blob([a.contenido])),
        text: () => Promise.resolve("")
    };
}

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    const metodo = (opciones && opciones.method) || "GET";
    llamadas.push({ url, cuerpo, metodo });

    const ruta = url.replace(/^https?:\/\/[^/]+\/v1/, "");
    const demora = retardo[ruta + ":" + (cuerpo.formato || "")] || 0;
    const entregar = (r) => (demora ? esperar(demora, r) : Promise.resolve(r));

    const forzada = forzar && forzar(ruta, cuerpo);
    if (forzada) return entregar(forzada);

    if (ruta === "/vendedor") {
        return Promise.resolve(respuesta({
            status: "ok", codigo: 0,
            data: { cotizacion: "x", factura: "x", promocion: "x", cuota: "x",
                    reporte: "Permite sacar reportes de marcas", marcas: "Elige y administra tus marcas del mes" },
            nombre: "JUAN CARLOS", grupo: "VENTAS-JEFES DE PROD", tipo: S.rol, tipoCambio: 3.75
        }));
    }

    let r = null;
    if (ruta === "/reporte/marca") r = reportesSim.listar();
    else if (ruta.indexOf("/reporte/marca/") === 0) r = reportesSim.informe(ruta.slice("/reporte/marca/".length), cuerpo);
    if (!r) return Promise.resolve(respuesta({ msg: "no simulado: " + ruta }, 404));

    if (r.archivo) return entregar(archivo(r.archivo));

    if (alterar) r = alterar(ruta, cuerpo, r) || r;
    return entregar(respuesta(r.cuerpo, r.status));
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
    const destinos = [], descargas = [];

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

    return { w, doc: w.document, destinos, descargas };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
const escribir = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("input", { bubbles: true })); };
const cambiar = (p, n, valor) => { n.value = valor; n.dispatchEvent(new p.w.Event("change", { bubbles: true })); };
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);

const nombres = (nodo) => [...nodo.querySelectorAll(".cdk-articulo__nombre")].map((n) => n.textContent.trim());
const filaDeMarca = (p, nombre) => [...p.doc.querySelectorAll("#reporte-lista button.cdk-articulo--pulsable")]
    .find((b) => b.querySelector(".cdk-articulo__nombre").textContent.trim() === nombre);
/* El codigo interno (codi) llega pero la tabla no lo enseña. El de fabrica (codf), si. */
const OCULTAS = ["codi"];
const titulosVisibles = (tipo) => reportesSim.COLUMNAS[tipo]
    .filter((c) => OCULTAS.indexOf(c.campo) === -1).map((c) => c.titulo);
const encabezados = (p) => [...p.doc.querySelectorAll("#reporte-tabla thead th")].map((t) => t.textContent);
const filas = (p) => [...p.doc.querySelectorAll("#reporte-tabla tbody tr")];
const celdas = (tr) => [...tr.querySelectorAll("td")].map((t) => t.textContent);
const visibles = (p) => filas(p).filter((tr) => !tr.classList.contains("hidden")).length;
const posts = (ls) => ls.filter((l) => l.metodo === "POST");
const informes = (ls) => posts(ls).map((l) => l.cuerpo);

/** Entra a una marca y a un informe. */
async function ver(p, marca, informe) {
    clic(p, filaDeMarca(p, marca));
    clic(p, p.doc.getElementById("pestana-" + informe));
    await pausa(120);
}

/** El estado de partida: un especialista con TDK, EP_IMPRESORAS y ZOTAC. */
function especialista() {
    marcasSim.reiniciar("ESPECIALISTA");
    reportesSim.estado.kardexDesde = 2023;
    forzar = null; alterar = null; retardo = {};
    ["0002", "0206", "0036"].forEach((c) => { marcasSim.buscarMarca(c).dueno = "233"; });
}

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Reportes por marca · grupo 25 ===\n");

    /* ----------------------------------------------------------- menu */
    console.log("— la pagina —");
    especialista();
    llamadas = [];
    let p = await montar("reporte.html");
    await pausa(200);

    ok("carga sin errores", fallos, 0);
    const enlace = [...p.doc.querySelectorAll("#cdk-sidebar-lista a")].find((a) => a.title === "Reportes");
    ok("Reportes sale en el menu y lleva a reporte.html", enlace && enlace.getAttribute("href"), "/reporte.html");
    ok("marcado como la pagina actual", enlace && enlace.getAttribute("aria-current"), "page");

    const html = leer("reporte.html");
    /* La pantalla antigua traia Tailwind por CDN y cuatro scripts que mandaban
       la marca por texto. */
    ok("ya no carga los cuatro scripts antiguos", /js\/reporte\/(marcas|stoc|tiempo|precios)\.js/.test(html), false);
    ok("ni Tailwind", /tailwind/i.test(html), false);
    ok("ni quedan sus rutas en caminos/rutas.js",
       /rutastock|rutatiempo|rutamarcaprecios|rutamarcas\b/.test(leer("caminos/rutas.js").replace(/\/\*[\s\S]*?\*\//g, "")), false);

    /* ------------------------------------------------- el especialista */
    console.log("\n— un especialista: sus marcas —");
    ok("dice mes y rol", p.doc.getElementById("periodo").textContent, "octubre de 2026 · Especialista");
    ok("pide las marcas una vez", llamadas.filter((l) => l.url.endsWith("/reporte/marca")).length, 1);
    /* Las tiene asignadas SIN haber confirmado: cuentan igual. */
    ok("las tiene sin confirmar y salen igual",
       S.confirmados["233"], false);
    ok("ordenadas por nombre", nombres(p.doc.getElementById("reporte-lista")), ["EP_IMPRESORAS", "TDK", "ZOTAC"]);
    ok("sin filtro por especialista: todas son suyas", p.doc.getElementById("reporte-filtro"), null);
    ok("sin pedir ningun informe todavia", posts(llamadas).length, 0);

    llamadas = [];
    escribir(p, p.doc.getElementById("reporte-buscar-marca"), "td");
    ok("buscar filtra la lista", nombres(p.doc.getElementById("reporte-lista")), ["TDK"]);
    escribir(p, p.doc.getElementById("reporte-buscar-marca"), "0206");
    ok("tambien por codigo", nombres(p.doc.getElementById("reporte-lista")), ["EP_IMPRESORAS"]);
    escribir(p, p.doc.getElementById("reporte-buscar-marca"), "xyz");
    ok("sin coincidencias lo dice", p.doc.getElementById("reporte-lista").textContent.includes("Ninguna marca"), true);
    escribir(p, p.doc.getElementById("reporte-buscar-marca"), "");
    ok("filtrar no llama al backend", llamadas.length, 0);

    /* ------------------------------------------------------- elegir marca */
    console.log("\n— elegir una marca —");
    clic(p, filaDeMarca(p, "TDK"));
    ok("enseña la marca elegida", p.doc.getElementById("reporte-marca-nombre").textContent, "TDK");
    ok("con los cuatro informes",
       [...p.doc.querySelectorAll("#reporte-pestanas .cdk-pestana")].map((b) => b.textContent),
       ["Stock", "Tiempo en almacén", "Lista de precios", "Guías"]);
    ok("ninguno elegido todavia",
       p.doc.querySelectorAll("#reporte-pestanas .es-activa").length, 0);
    ok("elegir la marca no pide ningun informe", posts(llamadas).length, 0);
    ok("dice que hay que elegir", !!p.doc.getElementById("reporte-pista"), true);

    /* ---------------------------------------------------------------- stock */
    console.log("\n— stock —");
    clic(p, p.doc.getElementById("pestana-stock"));
    await pausa(120);

    ok("lo pide por codmar y en json", informes(llamadas), [{ codmar: "0002", formato: "json" }]);
    /* El texto de la marca no dice cual de las partidas es: nunca se manda. */
    ok("sin el texto de la marca", Object.keys(informes(llamadas)[0]).sort(), ["codmar", "formato"]);
    ok("la pestana queda marcada", p.doc.getElementById("pestana-stock").getAttribute("aria-selected"), "true");
    ok("encabezados en el orden y con los titulos del backend, sin el codigo interno",
       encabezados(p), titulosVisibles("stock"));
    /* El codigo interno no le sirve a quien consulta; el de fabrica si, y es con el
       que se reconoce el producto. */
    ok("no se ve CODIGO", encabezados(p).includes("CODIGO"), false);
    ok("pero si CODF", encabezados(p).includes("CODF"), true);
    ok("y es la primera columna, la que queda fija", encabezados(p)[0], "CODF");
    ok("la busqueda dice por que se puede buscar",
       p.doc.getElementById("reporte-buscar").getAttribute("placeholder"), "CODF, descripción o part number");
    ok("una fila por producto", filas(p).length, 8);

    const cel = (tr, i) => celdas(tr)[i];
    /* La fila 1 tiene el principal en negativo: hay mas separado que fisico. */
    const negativa = filas(p).find((tr) => cel(tr, 4) === "-4");
    ok("el stock negativo se muestra tal cual", !!negativa, true);
    ok("y en rojo", negativa.querySelectorAll("td")[4].classList.contains("cdk-tabla__negativo"), true);
    ok("las cifras van a la derecha", negativa.querySelectorAll("td")[4].classList.contains("cdk-tabla__num"), true);
    ok("el texto no", filas(p)[0].querySelectorAll("td")[1].classList.contains("cdk-tabla__num"), false);
    ok("y la descripcion envuelve", filas(p)[0].querySelectorAll("td")[1].classList.contains("cdk-tabla__texto"), true);
    ok("una fila sin stock en ningun almacen sigue ahi con ceros",
       filas(p).some((tr) => celdas(tr).slice(4, 9).every((c) => c === "0")), true);
    ok("dice cuantos y cuando se genero",
       /^8 productos · generado el \d\d\/\d\d\/2026/.test(p.doc.getElementById("reporte-cuenta").textContent), true);
    ok("explica el calculo del disponible, con las dos reservas",
       p.doc.querySelector("details.cdk-plegable").textContent.includes("pedidos de clientes") &&
       p.doc.querySelector("details.cdk-plegable").textContent.includes("lo facturado que aún no sale del almacén"), true);
    ok("y que ordenado es lo pedido al proveedor que aun no llega",
       p.doc.querySelector("details.cdk-plegable").textContent.includes("pedidas al proveedor que aún no llegan"), true);

    /* ---- la tabla no suma nada */
    console.log("\n— el total es del backend —");
    alterar = (ruta, cuerpo, r) => {
        if (ruta.endsWith("/stock") && r.cuerpo.data) r.cuerpo.data.filas[0].total = 99999;
        return r;
    };
    clic(p, p.doc.getElementById("pestana-tiempo")); await pausa(100);
    clic(p, p.doc.getElementById("pestana-stock")); await pausa(150);
    ok("pinta el total que llega, aunque no cuadre con la suma", cel(filas(p)[0], 8), "99,999");
    alterar = null;

    /* ---- buscar dentro del informe */
    console.log("\n— buscar dentro del informe —");
    clic(p, p.doc.getElementById("pestana-tiempo")); await pausa(100);
    clic(p, p.doc.getElementById("pestana-stock")); await pausa(150);
    llamadas = [];
    const primeraDescripcion = celdas(filas(p)[0])[1];
    escribir(p, p.doc.getElementById("reporte-buscar"), primeraDescripcion.split(" ")[0].toLowerCase());
    ok("filtra las filas sin pedir nada", llamadas.length, 0);
    ok("y dice cuantas de cuantas",
       p.doc.getElementById("reporte-cuenta").textContent.startsWith(`Mostrando ${visibles(p)} de 8 productos`), true);
    escribir(p, p.doc.getElementById("reporte-buscar"), "zzzz");
    ok("sin coincidencias, ninguna visible", visibles(p), 0);
    /* Solo se busca lo que se ve: el codigo interno no aparece en pantalla, asi que
       no tiene sentido que encuentre algo. El de fabrica si. */
    const primerProducto = reportesSim.informe("stock", { codmar: "0002" }).cuerpo.data.filas[0];
    escribir(p, p.doc.getElementById("reporte-buscar"), primerProducto.codi);
    ok("el codigo interno, que no se ve, tampoco se busca", visibles(p), 0);
    escribir(p, p.doc.getElementById("reporte-buscar"), primerProducto.codf.toLowerCase());
    ok("el de fabrica si", visibles(p) >= 1, true);
    escribir(p, p.doc.getElementById("reporte-buscar"), "");
    ok("vaciar el campo las devuelve todas", visibles(p), 8);

    /* ---------------------------------------------------------------- tiempo */
    console.log("\n— tiempo en almacen —");
    llamadas = [];
    clic(p, p.doc.getElementById("pestana-tiempo")); await pausa(120);

    ok("cambiar de informe lo vuelve a pedir", informes(llamadas), [{ codmar: "0002", formato: "json" }]);
    ok("encabezados del informe de tiempo, sin el codigo interno", encabezados(p), titulosVisibles("tiempo"));
    ok("sin CODIGO y con CODF", [encabezados(p).includes("CODIGO"), encabezados(p).includes("CODF")], [false, true]);
    ok("la pestana activa cambia", p.doc.getElementById("pestana-stock").getAttribute("aria-selected"), "false");
    ok("solo los productos con stock", filas(p).length, 7);

    const primera = celdas(filas(p)[0]);
    /* Los sin compra van primero. Alli el `null` quiere decir que el producto
       lleva mas tiempo que los años revisados o entro por otro camino. */
    ok("sin compra: lo dice con el año desde el que se revisa", primera[5], "sin compra desde 2023");
    ok("y los dias igual", primera[6], "sin compra desde 2023");
    ok("el stock se muestra como numero", /^\d+$/.test(primera[4]), true);

    const conCompra = celdas(filas(p).find((tr) => /^\d\d\/\d\d\/\d{4}$/.test(celdas(tr)[5])));
    ok("la fecha de la ultima compra va en formato local", /^\d\d\/\d\d\/\d{4}$/.test(conCompra[5]), true);
    ok("los dias son un numero", /^\d+$/.test(conCompra[6]), true);

    /* El año sale de la respuesta, no esta escrito a mano. */
    reportesSim.estado.kardexDesde = 2021;
    clic(p, p.doc.getElementById("pestana-stock")); await pausa(100);
    clic(p, p.doc.getElementById("pestana-tiempo")); await pausa(150);
    ok("el año de «sin compra» es el que manda el backend", celdas(filas(p)[0])[5], "sin compra desde 2021");
    ok("la ayuda tambien", p.doc.querySelector("details.cdk-plegable").textContent.includes("2021"), true);
    ok("y que no hay umbral de stock viejo",
       p.doc.querySelector("details.cdk-plegable").textContent.includes("no marca ningún umbral"), true);
    ok("y aclara que una devolucion no reinicia los dias",
       p.doc.querySelector("details.cdk-plegable").textContent.includes("devoluciones de clientes"), true);
    reportesSim.estado.kardexDesde = 2023;

    /* --------------------------------------------------------------- precios */
    console.log("\n— lista de precios —");
    clic(p, p.doc.getElementById("pestana-precios")); await pausa(150);

    ok("encabezados de precios, sin el codigo interno", encabezados(p), titulosVisibles("precios"));
    ok("sin CODIGO y con CODF", [encabezados(p).includes("CODIGO"), encabezados(p).includes("CODF")], [false, true]);
    /* Intl separa el simbolo con un espacio duro: se normaliza, como en probar-core. */
    const todas = filas(p).map((tr) => celdas(tr).map((t) => t.replace(/ /g, " ")));
    ok("los importes van en dolares", todas.every((f) => /^\$ /.test(f[4])), true);
    /* Importes en dolares con simbolo; el backend dice «en dolares y sin IGV». */
    ok("con dos decimales", /^\$ \d+\.\d\d$/.test(todas[0][4]), true);
    ok("sin alta en M&M: guion", todas.some((f) => f[6] === "—" && f[7] === "—"), true);
    /* Un 0 es un precio real en 0; un null es «no esta dado de alta». */
    ok("un precio en 0 sigue siendo un 0", todas.some((f) => f[7] === "$ 0.00"), true);
    ok("dice que incluye el costo",
       p.doc.querySelector("details.cdk-plegable").textContent.includes("Incluye el costo"), true);
    /* Sin esto, quien lee VALOR VENTA se pregunta si es de lista o de un cliente. */
    ok("y que valor venta es el precio de lista, antes del descuento por cliente",
       p.doc.querySelector("details.cdk-plegable").textContent.includes("precio de lista") &&
       p.doc.querySelector("details.cdk-plegable").textContent.includes("No corresponde a ningún cliente"), true);

    /* --------------------------------------------------------------- exportar */
    console.log("\n— exportar a Excel —");
    llamadas = [];
    const exportar = p.doc.getElementById("reporte-exportar");
    clic(p, exportar);
    ok("mientras se genera, el boton no deja pulsar otra vez", exportar.disabled, true);
    clic(p, exportar);
    await pausa(150);

    ok("pide el archivo una sola vez", informes(llamadas), [{ codmar: "0002", formato: "xlsx" }]);
    ok("lo guarda con el nombre que pone el servidor", p.descargas.map((d) => d.nombre), ["precios-TDK-2026-10.xlsx"]);
    ok("sin salir de la pagina", p.destinos, []);
    ok("lo avisa", toasts(p.doc).some((t) => t.includes("precios-TDK-2026-10.xlsx")), true);
    ok("y el boton vuelve a estar libre", exportar.disabled === false && exportar.textContent === "Exportar a Excel", true);
    ok("sin tocar la tabla que se veia", filas(p).length, 8);

    console.log("\n— si en vez de un Excel llega un error —");
    p.descargas.length = 0;
    forzar = (ruta, cuerpo) => cuerpo.formato === "xlsx"
        ? respuesta({ status: "formato invalido", codigo: 2, msg: "el formato es json o xlsx" }, 400) : null;
    clic(p, exportar); await pausa(150);
    ok("no se guarda nada", p.descargas.length, 0);
    ok("se muestra el mensaje del backend", toasts(p.doc).some((t) => t.includes("el formato es json o xlsx")), true);

    /* Un 200 que no es la hoja tampoco se guarda: un fallo y un Excel
       corrupto se veian igual. */
    forzar = (ruta, cuerpo) => cuerpo.formato === "xlsx" ? respuesta("<html>mantenimiento</html>", 200, "text/html") : null;
    clic(p, exportar); await pausa(150);
    ok("un 200 que no es la hoja de calculo no se guarda", p.descargas.length, 0);
    ok("y el boton sigue funcionando", exportar.disabled, false);
    forzar = null;

    /* ------------------------------------------------- cambiar de marca */
    console.log("\n— volver a la lista —");
    clic(p, p.doc.getElementById("reporte-cambiar"));
    ok("vuelve a las marcas", nombres(p.doc.getElementById("reporte-lista")), ["EP_IMPRESORAS", "TDK", "ZOTAC"]);
    ok("sin informe a medias", p.doc.getElementById("reporte-tabla"), null);

    /* ------------------------------------------------------- sin filas */
    console.log("\n— una marca sin productos —");
    clic(p, filaDeMarca(p, "ZOTAC"));
    clic(p, p.doc.getElementById("pestana-stock")); await pausa(120);
    ok("lo dice", p.doc.getElementById("reporte-vacio").textContent, "Esta marca no tiene productos vigentes.");
    /* Exportar una hoja con solo los encabezados no sirve de nada. */
    ok("y no ofrece exportar una hoja vacia", p.doc.getElementById("reporte-exportar"), null);
    clic(p, p.doc.getElementById("pestana-tiempo")); await pausa(120);
    ok("cada informe dice lo suyo", p.doc.getElementById("reporte-vacio").textContent, "Ningún producto de esta marca tiene stock.");

    /* ================================================================ guias */
    console.log("\n— guias —");
    especialista();
    p = await montar("reporte.html");
    await pausa(150);

    llamadas = [];
    clic(p, filaDeMarca(p, "TDK"));
    clic(p, p.doc.getElementById("pestana-guias")); await pausa(150);

    /* Sin fechas el backend usa el mes en curso, y devuelve cual uso: eso es lo que
       se enseña en las dos fechas. */
    ok("pide las guias sin fechas", informes(llamadas), [{ codmar: "0002", formato: "json" }]);
    ok("y enseña el periodo que el backend uso",
       [p.doc.getElementById("reporte-desde").value, p.doc.getElementById("reporte-hasta").value],
       ["2026-10-01", "2026-10-31"]);
    ok("encabezados sin el codigo interno", encabezados(p), titulosVisibles("guias"));
    ok("sin CODIGO y con CODF", [encabezados(p).includes("CODIGO"), encabezados(p).includes("CODF")], [false, true]);
    ok("la primera columna es la fecha, la que queda fija", encabezados(p)[0], "FECHA");

    const delBackend = reportesSim.informe("guias", { codmar: "0002" }).cuerpo.data.filas;
    const guiasDelBackend = [...new Set(delBackend.map((f) => f.numero))];
    ok("una fila por producto de la marca, como llega", filas(p).length, delBackend.length);

    /* Una guia con dos productos ocupa dos filas: la primera abre el grupo y la
       segunda repite los datos de la guia, atenuados. */
    const abren = filas(p).filter((tr) => tr.classList.contains("cdk-tabla__grupo"));
    ok("cada guia abre un grupo", abren.length, guiasDelBackend.length);
    const siguiente = filas(p).find((tr) => !tr.classList.contains("cdk-tabla__grupo"));
    ok("las filas que siguen atenuan lo que es de la guia",
       siguiente.querySelectorAll("td")[0].classList.contains("cdk-tabla__repetido"), true);
    ok("pero no lo que es del producto",
       siguiente.querySelectorAll("td")[encabezados(p).indexOf("DESCRIPCION")].classList.contains("cdk-tabla__repetido"), false);
    ok("el conteo es de guias y de productos",
       p.doc.getElementById("reporte-cuenta").textContent.startsWith(`${guiasDelBackend.length} guías · ${delBackend.length} productos`), true);

    const fila0 = celdas(filas(p)[0]);
    ok("la fecha va en formato local", /^\d\d\/\d\d\/\d{4}$/.test(fila0[0]), true);
    ok("el estado, como lo dice el ERP", fila0[encabezados(p).indexOf("ESTADO")], "PENDIENTE DE SALIDA");
    /* Un codigo de almacen no le dice nada a quien consulta. */
    ok("el almacen sale con nombre y no con codigo",
       filas(p).every((tr) => ["Principal", "M&M", "Piura"].includes(celdas(tr)[encabezados(p).indexOf("ALMACEN")])), true);
    ok("explica que entra y que no",
       p.doc.querySelector("details.cdk-plegable").textContent.includes("Las anuladas no"), true);
    ok("y que no muestra importes",
       p.doc.querySelector("details.cdk-plegable").textContent.includes("No muestra importes"), true);
    ok("la busqueda dice por que se puede buscar",
       p.doc.getElementById("reporte-buscar").getAttribute("placeholder"), "Guía, cliente, CODF o descripción");

    /* ---- buscar por cliente o por numero de guia */
    llamadas = [];
    const cliente = delBackend[0].cliente;
    escribir(p, p.doc.getElementById("reporte-buscar"), cliente.split(" ")[0].toLowerCase());
    ok("buscar por cliente filtra sin pedir nada", llamadas.length, 0);
    ok("y deja solo sus guias", visibles(p), delBackend.filter((f) => f.cliente.toLowerCase().includes(cliente.split(" ")[0].toLowerCase())).length);
    escribir(p, p.doc.getElementById("reporte-buscar"), delBackend[0].numero.toLowerCase());
    ok("o por el numero de guia", visibles(p), delBackend.filter((f) => f.numero === delBackend[0].numero).length);
    escribir(p, p.doc.getElementById("reporte-buscar"), "");

    /* ---- cambiar el periodo */
    console.log("\n— el periodo de las guias —");
    llamadas = [];
    p.doc.getElementById("reporte-desde").value = "2026-07-01";
    p.doc.getElementById("reporte-hasta").value = "2026-09-30";
    clic(p, p.doc.getElementById("reporte-aplicar"));
    ok("mientras busca, el boton no deja pulsar otra vez", p.doc.getElementById("reporte-aplicar").disabled, true);
    await pausa(150);

    ok("manda las dos fechas", informes(llamadas),
       [{ codmar: "0002", formato: "json", desde: "2026-07-01", hasta: "2026-09-30" }]);
    ok("y las fechas siguen siendo las elegidas",
       [p.doc.getElementById("reporte-desde").value, p.doc.getElementById("reporte-hasta").value],
       ["2026-07-01", "2026-09-30"]);
    ok("ahora si hay guias con salida", celdas(filas(p)[0])[encabezados(p).indexOf("ESTADO")], "CON SALIDA");
    const trimestre = reportesSim.informe("guias", { codmar: "0002", desde: "2026-07-01", hasta: "2026-09-30" }).cuerpo.data.filas;
    ok("con todas las filas del trimestre", filas(p).length, trimestre.length);
    /* El trimestre si trae guias sin documento de origen: se dice con un guion, no con
       una celda vacia ni con la palabra null. */
    ok("el dato de partida incluye guias sin documento de origen", trimestre.some((f) => f.numeroReferencia === null), true);
    ok("y se ven con un guion",
       filas(p).filter((tr) => celdas(tr)[encabezados(p).indexOf("NRO. REFERENCIA")] === "—").length,
       trimestre.filter((f) => f.numeroReferencia === null).length);
    ok("sin la palabra null en ninguna celda", filas(p).some((tr) => celdas(tr).some((c) => /null|undefined/i.test(c))), false);

    /* ---- fechas que no valen: ni se mandan */
    llamadas = [];
    p.doc.getElementById("reporte-desde").value = "2026-09-30";
    p.doc.getElementById("reporte-hasta").value = "2026-09-01";
    clic(p, p.doc.getElementById("reporte-aplicar")); await pausa(80);
    ok("«desde» posterior a «hasta» ni se manda", posts(llamadas).length, 0);
    ok("y lo dice", toasts(p.doc).some((t) => t.includes("no puede ser posterior")), true);

    p.doc.getElementById("reporte-hasta").value = "";
    clic(p, p.doc.getElementById("reporte-aplicar")); await pausa(80);
    ok("con una fecha vacia tampoco", posts(llamadas).length, 0);
    ok("y pide las dos", toasts(p.doc).some((t) => t.includes("las dos fechas")), true);

    /* ---- mas de 3 meses: lo dice el backend, y la tabla de antes se queda */
    llamadas = [];
    p.doc.getElementById("reporte-desde").value = "2026-06-01";
    p.doc.getElementById("reporte-hasta").value = "2026-10-31";
    clic(p, p.doc.getElementById("reporte-aplicar")); await pausa(150);

    ok("el rango largo si se manda: el maximo lo decide el backend", posts(llamadas).length, 1);
    ok("y su mensaje se muestra", toasts(p.doc).some((t) => t.includes("el maximo es de 3 meses")), true);
    /* Borrar la tabla dejaria sin fechas que corregir a quien acaba de equivocarse. */
    ok("la tabla de antes sigue ahi", filas(p).length, trimestre.length);
    ok("y las fechas tambien, para corregirlas", p.doc.getElementById("reporte-desde").value, "2026-06-01");
    ok("el boton vuelve a funcionar",
       p.doc.getElementById("reporte-aplicar").disabled === false &&
       p.doc.getElementById("reporte-aplicar").textContent === "Ver periodo", true);

    /* ---- exportar: el periodo de la tabla que se VE, no el de las fechas tocadas */
    llamadas = [];
    p.descargas.length = 0;
    clic(p, p.doc.getElementById("reporte-exportar")); await pausa(150);

    ok("el Excel lleva el periodo de la tabla, no el de las fechas sin aplicar", informes(llamadas),
       [{ codmar: "0002", formato: "xlsx", desde: "2026-07-01", hasta: "2026-09-30" }]);
    ok("y el nombre trae el periodo", p.descargas.map((d) => d.nombre), ["guias-TDK-2026-07-01_2026-09-30.xlsx"]);

    /* ---- una marca sin guias: el periodo no desaparece */
    clic(p, p.doc.getElementById("reporte-cambiar"));
    clic(p, filaDeMarca(p, "ZOTAC"));
    clic(p, p.doc.getElementById("pestana-guias")); await pausa(150);
    ok("lo dice", p.doc.getElementById("reporte-vacio").textContent, "No hay guías de esta marca en este periodo.");
    /* Si no, quien eligio un rango sin guias no tendria como probar con otro. */
    ok("pero deja cambiar el periodo", !!p.doc.getElementById("reporte-aplicar"), true);
    ok("y no ofrece exportar una hoja vacia", p.doc.getElementById("reporte-exportar"), null);

    /* ---- los productos de cada marca, en la lista */
    console.log("\n— cuantos productos tiene cada marca —");
    clic(p, p.doc.getElementById("reporte-cambiar"));
    ok("la lista dice cuantos productos tiene cada una", filaDeMarca(p, "TDK").textContent.includes("8 productos"), true);
    ok("y una marca sin ninguno lo dice ya aqui", filaDeMarca(p, "ZOTAC").textContent.includes("sin productos vigentes"), true);
    clic(p, filaDeMarca(p, "TDK"));
    ok("la marca elegida tambien", p.doc.querySelector(".cdk-elegido__detalle").textContent.includes("8 productos"), true);

    /* ---- sin ninguna marca, con un codmar en la mano */
    console.log("\n— se queda sin marcas mientras mira —");
    especialista();
    p = await montar("reporte.html");
    await pausa(150);
    clic(p, filaDeMarca(p, "TDK"));
    ["0002", "0206", "0036"].forEach((c) => { marcasSim.buscarMarca(c).dueno = null; });

    llamadas = [];
    clic(p, p.doc.getElementById("pestana-stock")); await pausa(200);
    /* Con un codmar la respuesta es `403 marca no disponible`, tambien sin marcas; al
       volver a pedir la lista, esa si dice que no tiene ninguna. */
    ok("el informe responde que la marca no esta disponible", toasts(p.doc).some((t) => t.includes("no esta entre las que puedes consultar")), true);
    ok("y la pantalla acaba explicando que no tiene marcas", !!p.doc.getElementById("reporte-sin-marcas"), true);

    /* ------------------------------------------- lo que llega tarde */
    console.log("\n— un informe lento no pisa al que se pidio despues —");
    especialista();
    retardo["/reporte/marca/stock:json"] = 250;
    p = await montar("reporte.html");
    await pausa(150);
    clic(p, filaDeMarca(p, "TDK"));
    clic(p, p.doc.getElementById("pestana-stock"));        // tarda 250 ms
    await pausa(30);
    clic(p, p.doc.getElementById("pestana-tiempo"));       // llega antes
    await pausa(450);

    ok("queda el informe que se pidio ultimo", encabezados(p), titulosVisibles("tiempo"));
    ok("con su pestana marcada", p.doc.getElementById("pestana-tiempo").getAttribute("aria-selected"), "true");

    /* ======================================================== la jefatura */
    console.log("\n— una jefatura: las suyas y las de sus especialistas —");
    marcasSim.reiniciar("JEFATURA");
    forzar = null; alterar = null; retardo = {};
    p = await montar("reporte.html");
    await pausa(200);

    ok("dice el rol", p.doc.getElementById("periodo").textContent, "octubre de 2026 · Jefatura");
    /* Entran las suyas (ACER) y las de su familia que tienen sus especialistas
       (MEMOREX). NO entran EPSON, de un especialista pero de otra familia, ni
       las libres de su familia (ADATA, TDK). */
    ok("ve las suyas y las de sus especialistas de su familia",
       nombres(p.doc.getElementById("reporte-lista")), ["ACER", "MEMOREX"]);
    ok("el dueño de una ajena se dice en la fila",
       filaDeMarca(p, "MEMOREX").textContent.includes("SAUÑE MANUEL"), true);
    ok("el de una propia no hace falta", filaDeMarca(p, "ACER").textContent.includes("COSSIO"), false);

    const filtro = p.doc.getElementById("reporte-filtro");
    ok("tiene el filtro por especialista", !!filtro, true);
    ok("con sus opciones", [...filtro.options].map((o) => o.textContent),
       ["Todas (2)", "Mías (1)", "SAUÑE MANUEL (1)"]);
    cambiar(p, filtro, "u:229");
    ok("filtrar por un especialista", nombres(p.doc.getElementById("reporte-lista")), ["MEMOREX"]);
    cambiar(p, filtro, "mias");
    ok("filtrar por las mias", nombres(p.doc.getElementById("reporte-lista")), ["ACER"]);

    llamadas = [];
    cambiar(p, filtro, "todas");
    clic(p, filaDeMarca(p, "MEMOREX"));
    clic(p, p.doc.getElementById("pestana-stock")); await pausa(120);
    ok("pide el informe de una marca de su especialista", informes(llamadas), [{ codmar: "0003", formato: "json" }]);
    ok("y lo pinta", filas(p).length, 8);

    /* ----------------------------------------------- sin marcas en el mes */
    console.log("\n— sin marcas en el mes —");
    marcasSim.reiniciar("ESPECIALISTA");
    llamadas = [];
    p = await montar("reporte.html");
    await pausa(200);

    /* Sin marcas no hay reportes, ni los del mes pasado: una regla de negocio. */
    ok("lo dice como regla, no como error", !!p.doc.getElementById("reporte-sin-marcas"), true);
    ok("explicando que ni las del mes pasado",
       p.doc.getElementById("reporte-sin-marcas").textContent.includes("ni siquiera las del mes pasado"), true);
    ok("con el camino a Marcas",
       p.doc.querySelector("#reporte-sin-marcas a").getAttribute("href"), "/marcas.html");
    ok("sin lista ni informes", p.doc.getElementById("reporte-lista"), null);
    ok("sin boton de reintentar", p.doc.querySelectorAll("#contenido button").length, 0);

    /* --------------------------------------------------- sin alta */
    console.log("\n— alguien que aun no se registro —");
    marcasSim.reiniciar("ESPECIALISTA");
    S.yaRegistrado = false;
    p = await montar("reporte.html");
    await pausa(200);
    ok("explica que falta el registro", !!p.doc.getElementById("reporte-sin-alta"), true);
    ok("con el camino al formulario",
       p.doc.querySelector("#reporte-sin-alta a").getAttribute("href"), "/autenticador.html");

    /* ------------------------------------- la lista se quedo desfasada */
    console.log("\n— la marca ya no esta entre las que puede consultar —");
    especialista();
    p = await montar("reporte.html");
    await pausa(150);
    clic(p, filaDeMarca(p, "TDK"));
    marcasSim.buscarMarca("0002").dueno = null;           // se la quitaron mientras tanto

    llamadas = [];
    clic(p, p.doc.getElementById("pestana-stock")); await pausa(200);
    ok("dice el motivo", toasts(p.doc).some((t) => t.includes("no esta entre las que puedes consultar")), true);
    ok("vuelve a pedir la lista", llamadas.filter((l) => l.url.endsWith("/reporte/marca")).length, 1);
    ok("y ya no sale", nombres(p.doc.getElementById("reporte-lista")), ["EP_IMPRESORAS", "ZOTAC"]);

    /* Lo mismo al exportar, que es donde mas probable es que pase: se tarda mas. */
    especialista();
    p = await montar("reporte.html");
    await pausa(150);
    await ver(p, "TDK", "precios");
    marcasSim.buscarMarca("0002").dueno = null;
    llamadas = [];
    clic(p, p.doc.getElementById("reporte-exportar")); await pausa(200);
    ok("al exportar tambien", p.descargas.length, 0);
    ok("se actualiza la lista", nombres(p.doc.getElementById("reporte-lista")), ["EP_IMPRESORAS", "ZOTAC"]);

    /* ---------------------------------------------------- un fallo de verdad */
    console.log("\n— un fallo del servidor —");
    especialista();
    p = await montar("reporte.html");
    await pausa(150);
    clic(p, filaDeMarca(p, "TDK"));
    forzar = (ruta) => ruta.endsWith("/stock") ? respuesta({ status: "error", msg: "se cayo" }, 500) : null;
    clic(p, p.doc.getElementById("pestana-stock")); await pausa(150);

    ok("no se queda en blanco: lo dice", p.doc.getElementById("reporte-resultado").textContent.includes("se cayo"), true);
    ok("con un boton para reintentar",
       !!p.doc.querySelector("#reporte-resultado .cdk-boton"), true);
    ok("y la pestana no queda como si hubiera funcionado",
       p.doc.getElementById("pestana-stock").getAttribute("aria-selected"), "false");

    forzar = null;
    llamadas = [];
    clic(p, p.doc.querySelector("#reporte-resultado .cdk-boton")); await pausa(150);
    ok("reintentar lo vuelve a pedir", informes(llamadas), [{ codmar: "0002", formato: "json" }]);
    ok("y ahora si", filas(p).length, 8);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
