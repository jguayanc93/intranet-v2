/**
 * Arnes temporal: carga el core de CDK en Node con stubs minimos de DOM
 * y comprueba la logica pura (rutas, desempaquetado, catalogo, formato).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.resolve(__dirname, "..", "..");

function crearEntorno(hostname, srcScript, puerto) {
    const oyentes = [];
    const documento = {
        currentScript: { src: srcScript },
        body: { getAttribute: () => null, classList: { add() {}, remove() {} }, appendChild() {} },
        addEventListener: (tipo, fn) => oyentes.push([tipo, fn]),
        removeEventListener() {},
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({ setAttribute() {}, appendChild() {}, addEventListener() {}, style: {}, classList: { add() {}, remove() {} } }),
        createElementNS: () => ({ setAttribute() {}, appendChild() {} }),
        createDocumentFragment: () => ({ appendChild() {} }),
        getElementsByTagName: () => []
    };

    const almacen = {};
    const ventana = {
        location: { hostname, port: puerto || "", href: `http://${hostname}/`, pathname: "/" },
        document: documento,
        console,
        setTimeout, clearTimeout,
        URL, AbortController, Promise, Intl, Date, JSON, Object, Array, Math, isFinite, parseFloat, String, Number,
        FormData: class {}, Blob: class {}, URLSearchParams: class {},
        sessionStorage: {
            getItem: (k) => (k in almacen ? almacen[k] : null),
            setItem: (k, v) => { almacen[k] = String(v); },
            removeItem: (k) => { delete almacen[k]; }
        },
        fetch: () => Promise.reject(new Error("sin red en el arnes"))
    };
    ventana.window = ventana;
    ventana.global = ventana;

    return ventana;
}

function cargar(ventana, archivos) {
    const contexto = vm.createContext(ventana);
    for (const rel of archivos) {
        const codigo = fs.readFileSync(path.join(RAIZ, rel), "utf8");
        vm.runInContext(codigo, contexto, { filename: rel });
    }
    return ventana.CDK;
}

/* --------------------------------------------------------------- */
let fallos = 0;
function ok(etiqueta, real, esperado) {
    const bien = JSON.stringify(real) === JSON.stringify(esperado);
    if (!bien) fallos++;
    console.log(`${bien ? "  ok  " : " FALLA"} ${etiqueta}`);
    if (!bien) console.log(`         esperado: ${JSON.stringify(esperado)}\n         real:     ${JSON.stringify(real)}`);
}

const ARCHIVOS = [
    "core/cdk.js", "core/cdk-rutas.js", "core/cdk-http.js",
    "core/cdk-sesion.js", "core/cdk-catalogo.js", "core/cdk-permisos.js",
    "core/cdk-formato.js"
];

/* === Entorno de produccion, servido en la raiz =================== */
console.log("\n— produccion, servido en la raiz —");
let CDK = cargar(
    crearEntorno("landing.compudiskett.com.pe", "https://landing.compudiskett.com.pe/core/cdk.js"),
    ARCHIVOS
);

ok("CDK.base vacio",            CDK.base, "");
ok("CDK.env prod",              CDK.env, "prod");
ok("api() usa host de prod",    CDK.rutas.api("/vendedor"), "https://pulpo.compudiskett.com.pe/v1/vendedor");
ok("api() normaliza sin barra", CDK.rutas.api("vendedor"), "https://pulpo.compudiskett.com.pe/v1/vendedor");
ok("app() sin prefijo",         CDK.rutas.app("/main.html"), "/main.html");
ok("login()",                   CDK.rutas.login(), "/index.html");

/* === Entorno local bajo /demo1/ ================================== */
console.log("\n— local bajo /demo1/ —");
CDK = cargar(
    crearEntorno("127.0.0.1", "http://127.0.0.1/demo1/core/cdk.js"),
    ARCHIVOS
);

ok("CDK.base detecta /demo1",   CDK.base, "/demo1");
ok("CDK.env dev",               CDK.env, "dev");
ok("api() usa localhost",       CDK.rutas.api("/vendedor"), "http://127.0.0.1:3000/v1/vendedor");
ok("app() lleva el prefijo",    CDK.rutas.app("/main.html"), "/demo1/main.html");

/* === Desempaquetado ============================================== */
console.log("\n— desempaquetado de respuestas —");
const d = CDK.http.desempaquetar;

ok("objeto ya decodificado",    d({ a: 1 }), { a: 1 });
ok("string con objeto JSON",    d('{"a":1}'), { a: 1 });
ok("string con array JSON",     d('[1,2]'), [1, 2]);
ok("mensaje suelto intacto",    d("sesion creada"), "sesion creada");
ok("numero en texto intacto",   d("123"), "123");
ok("JSON malformado intacto",   d('{"a":'), '{"a":');
ok("no es recursivo",           d('"{\\"a\\":1}"'), '"{\\"a\\":1}"');
ok("null pasa igual",           d(null), null);

/* === Catalogo ==================================================== */
console.log("\n— catalogo —");
ok("modulo conocido",           CDK.catalogo.modulo("cotizacion").etiqueta, "Cotización");
ok("modulo desconocido",        CDK.catalogo.modulo("inventado").etiqueta, "INVENTADO");
ok("conocido() false",          CDK.catalogo.conocido("inventado"), false);

ok("acceso resuelve href",      CDK.catalogo.acceso("cotizacion", "crear").href, "/demo1/cotizacion/cotizacion_nuevo.html");
ok("acceso inexistente",        CDK.catalogo.acceso("cuota", "update").existe, false);
ok("href null si no existe",    CDK.catalogo.acceso("cuota", "update").href, null);
ok("permiso desconocido",       CDK.catalogo.acceso("cotizacion", "volar"), null);

ok("listas usa carpeta lista",  CDK.catalogo.acceso("listas", "cotizacion").href, "/demo1/lista/lista_cotizacion.html");
ok("endpoint de listas",        CDK.catalogo.endpointPermisos("listas"), "http://127.0.0.1:3000/v1/lista");
ok("endpoint de cotizacion",    CDK.catalogo.endpointPermisos("cotizacion"), "http://127.0.0.1:3000/v1/cotizacion");

ok("ordenar por prioridad",     CDK.catalogo.ordenar(["cuota", "cotizacion", "factura"]), ["cotizacion", "factura", "cuota"]);
ok("desconocidos al final",     CDK.catalogo.ordenar(["zzz", "cotizacion"]), ["cotizacion", "zzz"]);

ok("tipos de un grupo",         CDK.catalogo.tipos("VENTAS-EJECUTIVOS").map(t => t.clave), ["COBERTURA", "CARTERA"]);
ok("WEB fuera de uso",          CDK.catalogo.tipos("VENTAS-JEFES DE ZONA").map(t => t.clave), ["ZONA"]);
ok("solo operativos",           CDK.catalogo.tipos(null, {soloOperativos:true}).map(t => t.clave), ["COBERTURA","CARTERA","JEFATURA","ESPECIALISTA"]);
ok("zona es nivel 3",           CDK.catalogo.tipo("ZONA").nivel, 3);
ok("especialista pide marcas",  CDK.catalogo.tipo("ESPECIALISTA").pideMarcas, true);

/* === Formato ===================================================== */
console.log("\n— formato —");
const f = CDK.formato;

ok("moneda en dolares",         f.moneda(1234.5, "D").replace(/\u00a0/g, " "), "$ 1,234.50");
ok("moneda en soles",           f.moneda(1234.5, "S").replace(/\u00a0/g, " "), "S/ 1,234.50");
ok("moneda desde texto",        f.moneda("1234.5", "D").replace(/\u00a0/g, " "), "$ 1,234.50");
ok("moneda con basura",         f.moneda(undefined, "D").replace(/\u00a0/g, " "), "$ 0.00");
ok("numero con decimales",      f.numero(1234.567, 2), "1,234.57");
ok("porcentaje",                f.porcentaje(12.34), "12.3 %");

// El bug clasico: new Date("2026-09-22") es UTC y en Peru (UTC-5) muestra el 21.
ok("fecha ISO sin desfase",     f.fecha("2026-09-22"), "22/09/2026");
ok("fecha vacia",               f.fecha(""), "");
ok("truncar respeta palabra",   f.truncar("teclado mecanico retroiluminado", 20), "teclado mecanico…");
ok("truncar no toca lo corto",  f.truncar("mouse", 20), "mouse");

/* --------------------------------------------------------------- */

/* === Ajustes ===================================================== */
console.log("\n— ajustes —");
{
    const ventana = crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js");
    const guardado = {};
    ventana.localStorage = {
        getItem: (k) => (k in guardado ? guardado[k] : null),
        setItem: (k, v) => { guardado[k] = String(v); },
        removeItem: (k) => { delete guardado[k]; }
    };
    const A = cargar(ventana, ARCHIVOS.concat("core/cdk-ajustes.js")).ajustes;

    ok("velo por defecto",      A.obtener("fondoAtenuar"), 45);
    ok("sin fondo al inicio",   A.obtener("fondo"), null);
    ok("peso 0 sin fondo",      A.pesoFondo(), 0);

    A.fijar("fondoAtenuar", 70);
    ok("fija el velo",          A.obtener("fondoAtenuar"), 70);
    ok("persiste en el almacen", JSON.parse(guardado["cdk.ajustes.v1"]).fondoAtenuar, 70);

    A.fijar("fondo", "data:image/jpeg;base64," + "x".repeat(4096));
    ok("peso en KB",            A.pesoFondo(), 3);

    // aplicarFondo sobre un elemento simulado con la API real del DOM
    const props = {}; const clases = [];
    const nodo = {
        classList: { add: (c) => clases.push(c), remove: (c) => { const i = clases.indexOf(c); if (i >= 0) clases.splice(i, 1); } },
        style: { setProperty: (k, v) => { props[k] = v; }, removeProperty: (k) => { delete props[k]; } }
    };

    A.aplicarFondo(nodo);
    ok("marca la clase",        clases, ["cdk-con-fondo"]);
    ok("velo como fraccion",    props["--cdk-fondo-velo"], "0.70");

    A.quitarFondo();
    A.aplicarFondo(nodo);
    ok("quita la clase",        clases, []);
    ok("limpia las variables",  Object.keys(props), []);

    A.fijar("fondoAtenuar", 999);
    A.fijar("fondo", "data:image/jpeg;base64,zz");
    A.aplicarFondo(nodo);
    ok("acota el velo al 95%",  props["--cdk-fondo-velo"], "0.95");

    A.aplicarFondo(null);   // no debe lanzar
    ok("tolera elemento nulo",  true, true);
}

/* --------------------------------------------------------------- */

/* === Tamaño de dataURL =========================================== */
console.log("\n— tamaño de imagen —");
{
    const ventana = crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js");
    const g = {};
    ventana.localStorage = { getItem: k => (k in g ? g[k] : null), setItem: (k, v) => { g[k] = String(v); }, removeItem: k => { delete g[k]; } };
    const A = cargar(ventana, ARCHIVOS.concat("core/cdk-ajustes.js")).ajustes;

    const b = A.bytesDe;
    ok("dataURL vacio",          b(null), 0);
    ok("4 chars base64 = 3 B",   b("data:image/jpeg;base64,AAAA"), 3);
    ok("descuenta un '='",       b("data:image/jpeg;base64,AAA="), 2);
    ok("descuenta '=='",         b("data:image/jpeg;base64,AA=="), 1);
    ok("sin cabecera tambien",   b("AAAA"), 3);

    ok("presupuesto de 1 MB",    A.presupuesto, 1024 * 1024);

    // 1 MB exacto de binario -> 1024 KB declarados
    A.fijar("fondo", "data:image/jpeg;base64," + "A".repeat(1024 * 1024 / 3 * 4));
    ok("informa 1024 KB",        A.pesoFondo(), 1024);
}

/* --------------------------------------------------------------- */

/* === Cotizacion: datos REALES del backend ======================== */
console.log("\n— cotizacion (respuesta real) —");
{
    const ventana = crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js");
    const C = cargar(ventana, ARCHIVOS.concat("js/cotizacion/campos.js"));
    const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "cotizacion-ejemplo.json"), "utf8"));

    const doc = C.coti.documento(datos);

    ok("16 lineas",              doc.lineas.length, 16);
    ok("13 productos",           doc.productos.length, 13);
    ok("3 lineas de promocion",  doc.promociones.length, 3);

    /* El IGV sale del subtotal x 0.18, que es lo que hace el trigger del ERP,
       y NO de sumar el importe con IGV de cada linea.

       Con esta cotizacion real los dos metodos difieren en un centimo:
         sumando la posicion 19  ->  101.78 e igv, total 667.26
         565.48 x 0.18           ->  101.79 e igv, total 667.27
       Justo la clase de desvio que el backend pidio evitar. */
    ok("subtotal",               Number(doc.subtotal.toFixed(2)), 565.48);
    ok("igv = subtotal x 0.18",  Number(doc.igv.toFixed(2)), 101.79);
    ok("total",                  Number(doc.total.toFixed(2)), 667.27);
    ok("total = subtotal + igv", Number((doc.subtotal + doc.igv).toFixed(2)), Number(doc.total.toFixed(2)));

    // Clasificacion por signo del importe, no por el texto.
    ok("fila 0 es producto",     doc.lineas[0].tipo, "producto");
    ok("fila 13 es descuento",   doc.lineas[13].tipo, "descuento");
    ok("fila 14 es obsequio",    doc.lineas[14].tipo, "obsequio");
    ok("fila 15 es descuento",   doc.lineas[15].tipo, "descuento");

    // Campos de linea contrastados contra la respuesta real.
    const l0 = doc.lineas[0];
    ok("codigo",                 l0.codigo, "0505-012610");
    ok("partnumber",             l0.partnumber, "TIET544120-AL");
    ok("marca",                  l0.marca, "EPSON");
    ok("unidad",                 l0.unidad, "UND");
    ok("cantidad",               l0.cantidad, 18);
    ok("precio unitario",        l0.precioUnitario, 7.97);
    ok("importe sin igv",        l0.importe, 140.58);
    ok("descuento %",            l0.descuento, 2);
    ok("importe con igv",        l0.importeConIgv, 165.88);

    // 18 x 7.97 = 143.46; con 2% de descuento = 140.59 ~ 140.58
    ok("importe coherente",      Math.abs(18 * 7.97 * 0.98 - l0.importe) < 0.02, true);

    // Cabecera: se repite en todas las filas.
    ok("documento",              doc.cabecera.documento, "009-00969162");
    ok("cliente",                doc.cabecera.codcliente, "C12171");
    ok("moneda dolares",         doc.cabecera.monedaLinea, "D");
    ok("tipo de cambio",         doc.cabecera.tipoCambio, 3.362);
    ok("almacen",                doc.cabecera.almacen, "01");

    // El prefijo del backend se separa para poder etiquetarlo en pantalla.
    ok("quita DSCTO/PROM:",      doc.lineas[13].descripcionLimpia, "EPSON T664X20 DSCTO SETIEMBRE 26");
    ok("quita GRATIS/PROM:",     doc.lineas[14].descripcionLimpia, "(P#15023POLO EPSON MANGA CORTA (EPSON)(BON)");

    // La fecha ISO con hora no debe desplazarse un dia en Peru (UTC-5).
    ok("fecha sin desfase",      C.formato.fecha(doc.cabecera.fecha), "23/09/2026");

    ok("documento vacio",        C.coti.documento({}), null);
}

/* --------------------------------------------------------------- */

/* === Almacenes =================================================== */
console.log("\n— almacenes —");
{
    const C = cargar(crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js"), ARCHIVOS);
    ok("01 es Principal",        C.catalogo.almacen("01"), "Principal");
    ok("08 es M&M",              C.catalogo.almacen("08"), "M&M");
    ok("tolera espacios",        C.catalogo.almacen(" 01 "), "Principal");
    ok("desconocido tal cual",   C.catalogo.almacen("99"), "99");
    ok("vacio no rompe",         C.catalogo.almacen(null), "");
    ok("lista para desplegable", C.catalogo.almacenes().map(a => a.nombre), ["Principal", "M&M"]);
}

/* --------------------------------------------------------------- */

/* === Margen ====================================================== */
console.log("\n— margen —");
{
    const C = cargar(crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js"),
                     ARCHIVOS.concat("js/cotizacion/campos.js"));
    const datos = JSON.parse(fs.readFileSync(path.join(__dirname, "cotizacion-ejemplo.json"), "utf8"));
    const doc = C.coti.documento(datos);

    const l0 = doc.lineas[0];
    // El margen se mide sobre el precio EFECTIVO (con el descuento ya aplicado),
    // no sobre el de lista: 140.58/18 = 7.81, no 7.97.
    ok("precio efectivo",        Number(l0.precioEfectivo.toFixed(2)), 7.81);
    ok("coste total de linea",   Number(l0.costeTotal.toFixed(2)), 134.10);
    ok("margen de linea",        Number(l0.margen.toFixed(2)), 6.48);
    ok("margen % sobre efectivo", Number(l0.margenPct.toFixed(1)), 4.6);
    ok("linea 0 no esta bajo coste", l0.bajoCoste, false);

    // Brother: se vende a 7.50 con coste 8.70.
    const brother = doc.lineas[10];
    ok("brother bajo coste",     brother.bajoCoste, true);
    ok("brother margen negativo", Number(brother.margenPct.toFixed(1)), -16.0);

    ok("2 productos bajo coste", doc.bajoCoste.length, 2);

    // El obsequio no se cobra pero cuesta: 2 x 4.898.
    const obsequio = doc.lineas[14];
    ok("obsequio cuesta",        Number(obsequio.costeTotal.toFixed(3)), 9.796);
    ok("obsequio no se avisa",   obsequio.bajoCoste, false);

    // Los descuentos no tienen coste propio.
    ok("descuento sin coste",    doc.lineas[13].costeTotal, 0);

    // Documento completo: esta cotizacion real pierde dinero.
    ok("coste del documento",    Number(doc.coste.toFixed(2)), 608.86);
    ok("margen del documento",   Number(doc.margen.toFixed(2)), -43.38);
    ok("margen % del documento", Number(doc.margenPct.toFixed(1)), -7.7);
    ok("margen = subtotal-coste", Number((doc.subtotal - doc.coste).toFixed(2)), Number(doc.margen.toFixed(2)));

    ok("afecto a igv leido",     l0.afectoIgv, "S");
}

/* --------------------------------------------------------------- */

/* === Moneda y tipo de cambio ===================================== */
console.log("\n— moneda —");
{
    const ventana = crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js");
    const selectSimulado = { value: "D", addEventListener() {} };
    ventana.document.getElementById = (id) => (id === "alm" ? selectSimulado : null);
    ventana.almc_id = "D";

    const C = cargar(ventana, ARCHIVOS.concat(["js/cotizacion/campos.js", "js/cotizacion/moneda.js"]));

    ok("moneda por defecto",     C.coti.moneda(), "D");
    ok("codigo USD",             C.coti.codigoMoneda("D"), "USD");
    ok("codigo PEN",             C.coti.codigoMoneda("S"), "PEN");
    ok("tipo de cambio fijo",    C.coti.tipoCambio(), 3.408);
    ok("avisa que es fijo",      C.coti.tipoCambioEsFijo(), true);

    // En dolares no convierte.
    ok("misma moneda",           C.coti.convertir(100, "D"), 100);
    ok("NaN da 0",               C.coti.convertir("x", "D"), 0);
    ok("null da 0",              C.coti.convertir(null, "D"), 0);

    // Cambiando a soles.
    selectSimulado.value = "S";
    ok("moneda cambiada",        C.coti.moneda(), "S");
    ok("USD -> PEN",             Number(C.coti.convertir(100, "D").toFixed(4)), 340.8);
    ok("PEN -> PEN",             C.coti.convertir(100, "S"), 100);

    selectSimulado.value = "D";
    ok("PEN -> USD",             Number(C.coti.convertir(340.8, "S").toFixed(2)), 100);

    // Los puentes que usan part2, part3 y part4.
    ok("puente moneda",          ventana.obtenerMonedaSeleccionada(), "D");
    ok("puente simbolo",         ventana.obtenerSímboloMoneda("S"), "PEN");
    ok("puente convertir",       ventana.convertirMoneda(100, "D"), 100);

    // El dia que /vendedor traiga tipoCambio, se usa sin tocar nada mas.
    C.sesion.fijarUsuario({ nombre: "Juan", tipoCambio: 3.362 });
    ok("usa el del backend",     C.coti.tipoCambio(), 3.362);
    ok("ya no es fijo",          C.coti.tipoCambioEsFijo(), false);

    selectSimulado.value = "S";
    ok("convierte con el real",  Number(C.coti.convertir(100, "D").toFixed(2)), 336.2);
}

/* --------------------------------------------------------------- */

/* === Producto y tope de descuento ================================ */
console.log("\n— producto —");
{
    const C = cargar(crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js"),
                     ARCHIVOS.concat("js/cotizacion/campos.js"));

    // Respuesta real de /producto/buscar para "t66".
    const p = C.coti.producto({0:"0505-011055", 1:"BOTELLA TINTA EPSON T664120-AL NEGRO PARA L200",
                               2:2401, 3:0, 4:2, 5:7.97, 6:0});

    ok("codigo",            p.codigo, "0505-011055");
    ok("stock principal",   p.stockPrincipal, 2401);
    ok("stock mym",         p.stockMym, 0);
    ok("stock piura",       p.stockPiura, 0);
    ok("stock total",       p.stockTotal, 2401);
    ok("precio",            p.precioUnitario, 7.97);
    ok("tope de descuento", p.descuentoMaximo, 2);

    // Suma de los tres almacenes.
    const m = C.coti.producto({0:"X", 1:"Y", 2:150, 3:42, 4:2, 5:7.97, 6:18});
    ok("suma los 3 almacenes", m.stockTotal, 210);

    /* El fallo que traia el proyecto: `0 || 6` daba 6, asi que un producto
       marcado "sin descuento" admitia hasta un 6 %. */
    const t = C.coti.topeDescuento;
    ok("tope 2 se respeta",    t(2), 2);
    ok("tope 0 NO sube a 6",   t(0), 0);
    ok("sin dato es 0",        t(undefined), 0);
    ok("null es 0",            t(null), 0);
    ok("texto numerico vale",  t("3"), 3);
    ok("negativo es 0",        t(-5), 0);
    ok("basura es 0",          t("x"), 0);

    const sinDscto = C.coti.producto({0:"X", 1:"Y", 2:340, 3:15, 4:0, 5:4.2, 6:0});
    ok("producto sin descuento", sinDscto.descuentoMaximo, 0);

    const sinStock = C.coti.producto({0:"X", 1:"Y", 2:0, 3:0, 4:3, 5:58.4, 6:0});
    ok("producto sin stock",     sinStock.stockTotal, 0);
}

/* --------------------------------------------------------------- */

/* === Calculo de linea ============================================ */
console.log("\n— calculo de linea —");
{
    const ventana = crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js");
    const sel = { value: "D", addEventListener() {} };
    ventana.document.getElementById = (id) => (id === "alm" ? sel : null);
    ventana.almc_id = "D";

    const C = cargar(ventana, ARCHIVOS.concat(["js/cotizacion/campos.js"]));
    const calc = C.coti.calcularLinea;

    /* --- en dolares: no convierte --- */
    let l = calc({ precio: 7.97, cantidad: 10, descuento: 0 });
    ok("dolares, sin dscto",   l.importe, 79.70);
    ok("precio unitario",      l.precioUnitario, 7.97);

    l = calc({ precio: 7.97, cantidad: 10, descuento: 2 });
    ok("dolares, 2% dscto",    l.importe, 78.11);
    ok("monto del descuento",  l.montoDescuento, 1.59);

    /* --- el calculo NO convierte, aunque la pantalla este en soles ---
       El backend trabaja solo en dolares, y esto es lo que se guarda en el
       carrito y se le envia. Convertir es cosa de quien muestra el importe.

       Durante un tiempo convertia aqui dentro, y entonces con soles elegidos
       el carrito mandaba preciosinIGV en soles junto a un precioUnitario en
       dolares: los dos campos del mismo objeto con 3.4x de diferencia. */
    sel.value = "S";
    l = calc({ precio: 7.97, cantidad: 10, descuento: 0 });
    ok("soles en pantalla, calculo en dolares", l.importe, 79.70);
    ok("precio unit. sin convertir",            l.precioUnitario, 7.97);

    l = calc({ precio: 7.97, cantidad: 10, descuento: 2 });
    ok("con dscto, sigue en dolares",           l.importe, 78.11);

    /* Y la conversion, cuando toca mostrar.
       Da 266.20 donde antes salia 266.19: convertir al final redondea una vez
       en lugar de dos (antes se redondeaba el precio unitario a 27.16 y se
       multiplicaba). El centimo solo afecta a lo que se ensena en soles; el
       numero que viaja al backend es el de dolares, y ese no cambia. */
    ok("convertir() para mostrar",  C.coti.convertir(l.importe, "D").toFixed(2), "266.20");

    sel.value = "D";
    ok("en dolares convertir no toca nada", C.coti.convertir(79.70, "D"), 79.70);

    /* --- el tope acota, no falla en silencio --- */
    l = calc({ precio: 10, cantidad: 1, descuento: 5, tope: 2 });
    ok("acota al tope",        l.descuentoAplicado, 2);
    ok("avisa que acoto",      l.acotado, true);
    ok("importe con el tope",  l.importe, 9.80);

    l = calc({ precio: 10, cantidad: 1, descuento: 5, tope: 0 });
    ok("tope 0 no deja dscto", l.descuentoAplicado, 0);
    ok("tope 0: importe pleno", l.importe, 10);

    l = calc({ precio: 10, cantidad: 1, descuento: 1, tope: 2 });
    ok("bajo el tope pasa",    l.descuentoAplicado, 1);
    ok("no marca acotado",     l.acotado, false);

    /* --- entradas sucias del formulario --- */
    ok("cantidad vacia",       calc({ precio: 10, cantidad: "", descuento: 0 }).importe, 0);
    ok("cantidad negativa",    calc({ precio: 10, cantidad: -5, descuento: 0 }).cantidad, 0);
    ok("descuento negativo",   calc({ precio: 10, cantidad: 1, descuento: -3 }).descuentoAplicado, 0);
    ok("cantidad con texto",   calc({ precio: 10, cantidad: "7", descuento: 0 }).importe, 70);
    ok("sin precio",           calc({ cantidad: 5, descuento: 0 }).importe, 0);
    ok("sin argumentos",       calc().importe, 0);

    /* --- sin tope no acota (hay sitios que validan aparte) --- */
    ok("sin tope no acota",    calc({ precio: 10, cantidad: 1, descuento: 50 }).descuentoAplicado, 50);
}


/* === CDK.contador ================================================ */
/* Necesita un DOM algo mas real que el resto: hay que poder teclear en el
   campo y pulsar los botones. */
function crearEntornoConDom(hostname, srcScript) {
    const ventana = crearEntorno(hostname, srcScript);

    ventana.document.createElement = (etiqueta) => {
        const oyentes = {};
        const clases = [];
        const el = {
            etiqueta,
            hijos: [],
            atributos: {},
            className: "",
            textContent: "",
            disabled: false,
            style: {},
            oyentes,
            // En un input real, setAttribute("value", v) tambien fija .value
            setAttribute(k, v) { this.atributos[k] = v; if (k === "value") this.value = v; },
            getAttribute(k) { return k in this.atributos ? this.atributos[k] : null; },
            appendChild(h) { this.hijos.push(h); return h; },
            addEventListener(tipo, fn) { (oyentes[tipo] = oyentes[tipo] || []).push(fn); },
            removeEventListener() {},
            focus() {}, select() {},
            classList: {
                add: (c) => { if (clases.indexOf(c) < 0) clases.push(c); },
                remove: (c) => { const i = clases.indexOf(c); if (i >= 0) clases.splice(i, 1); },
                contains: (c) => clases.indexOf(c) >= 0,
                toggle: (c, on) => { if (on) { if (clases.indexOf(c) < 0) clases.push(c); }
                                     else { const i = clases.indexOf(c); if (i >= 0) clases.splice(i, 1); } }
            }
        };
        return el;
    };

    return ventana;
}

function disparar(el, tipo) {
    (el.oyentes[tipo] || []).forEach((fn) => fn({ target: el, preventDefault() {}, stopPropagation() {} }));
}

console.log("\n— contador de cantidad —");
{
    const C = cargar(
        crearEntornoConDom("127.0.0.1", "http://127.0.0.1/core/cdk.js"),
        ARCHIVOS.concat("core/cdk-ui.js")
    );

    let ultima = null;
    const c = C.contador({ valor: 1, min: 1, max: 500, alCambiar: (n) => { ultima = n; } });
    const menos = c.hijos[0];
    const campo = c.hijos[1];
    const mas   = c.hijos[2];

    ok("arranca en el valor dado",  c.valor(), 1);
    ok("menos apagado en el minimo", menos.disabled, true);
    ok("mas encendido",              mas.disabled, false);

    disparar(mas, "click");
    ok("el mas sube",                c.valor(), 2);
    ok("avisa del cambio",           ultima, 2);
    ok("el menos se enciende",       menos.disabled, false);

    disparar(menos, "click");
    ok("el menos baja",              c.valor(), 1);

    /* Tecleado: "40" pasa por "4", y acotar en cada pulsacion impediria
       escribirlo. Por eso el acotado va al salir del campo, no al teclear. */
    campo.value = "40";
    disparar(campo, "input");
    ok("acepta lo tecleado",         c.valor(), 40);

    campo.value = "4a0";
    disparar(campo, "input");
    ok("descarta lo que no es digito", campo.value, "40");

    campo.value = "900";
    disparar(campo, "input");
    ok("mientras teclea no acota",   c.valor(), 900);
    disparar(campo, "blur");
    ok("acota al salir del campo",   c.valor(), 500);
    ok("mas apagado en el tope",     mas.disabled, true);

    campo.value = "";
    disparar(campo, "blur");
    ok("vacio vuelve al minimo",     c.valor(), 1);

    c.fijar(7);
    ok("fijar escribe",              c.valor(), 7);
    c.fijar(9999);
    ok("fijar tambien acota",        c.valor(), 500);
    c.fijar(-5);
    ok("fijar acota por abajo",      c.valor(), 1);
}


/* === Contrato de /v1/promocion =================================== */
/* Los ejemplos salen literalmente de docs/promociones.md. */
console.log("\n— promociones —");
{
    const ventana = crearEntornoConDom("127.0.0.1", "http://127.0.0.1/core/cdk.js");
    const sel = { value: "D", addEventListener() {} };
    ventana.document.getElementById = (id) => (id === "alm" ? sel : null);

    const C = cargar(ventana, ARCHIVOS.concat([
        "core/cdk-ui.js", "js/cotizacion/campos.js", "js/cotizacion/promociones.js"
    ]));

    /* --- el sobre { status, codigo, data } --- */
    const sobre = { status: "ok", codigo: 0, data: ["15112", "14656"] };
    ok("recolector: abre el sobre", C.promo.codigos(sobre), ["15112", "14656"]);

    /* Sin sobre tiene que fallar, no devolver vacio: confundir "no entiendo la
       respuesta" con "no hay promociones" era justo lo que las ocultaba todas. */
    let reviento = false;
    try { C.promo.codigos(["15112"]); } catch (e) { reviento = true; }
    ok("recolector: sin sobre lanza", reviento, true);

    ok("recolector: data no-arreglo", C.promo.codigos({ data: null }), []);
    ok("recolector: normaliza a texto", C.promo.codigos({ data: [15112] }), ["15112"]);

    /* --- "ninguna promocion" llega como 400, no como lista vacia --- */
    ok("400 ninguna promocion",
       C.promo.esSinPromociones({ status: 400, datos: { status: "ninguna promocion" } }), true);
    ok("otro 400 no lo es",
       C.promo.esSinPromociones({ status: 400, datos: { status: "promocion no registrada" } }), false);
    ok("500 no lo es",
       C.promo.esSinPromociones({ status: 500, datos: null }), false);

    /* --- el cuerpo del recolector: solo codigos --- */
    const carrito = {
        "0": { codigo: "0115-010338", descripcion: "MONITOR TCL", cantidad: 10,
               precioUnitario: 88.86, descuento: 0, preciosinIGV: 861.94,
               descuentoMaximo: 6, stock1: 3, stock2: 0, stock3: 1, stockTotal: 4 }
    };
    ok("cuerpo recolector",
       C.promo.cuerpoRecolector(carrito), { productos: { "0": { codigo: "0115-010338" } } });

    /* --- el cuerpo del detalle: los cuatro campos que lee, mas descuento --- */
    const cuerpo = C.promo.cuerpoDetalle("15112", carrito);
    ok("detalle: idprom en texto", cuerpo.codigo, "15112");
    ok("detalle: campos del producto",
       Object.keys(cuerpo.productos["0"]).sort(),
       ["cantidad", "codigo", "descripcion", "descuento", "preciosinIGV"]);
    ok("detalle: no manda stock", cuerpo.productos["0"].stock1, undefined);

    /* --- caso 2 del documento: item / descuento / unidades --- */
    const d2 = C.promo.detalle({ status: "ok", codigo: 0, data: {
        "0": { codigo: "15112", descripcion: "TCL PROMO REBATE MNT SEPT2026",
               cantidad: 10, montoDescuento: 238.39, monedaDescuento: "D",
               itemdescr: "MONITOR TCL 24G54", tipo: ["descuento"] },
        tipo: ["descuento"], descripcion: "TCL PROMO REBATE MNT SEPT2026" } }, "15112");

    ok("caso 2: aplica",           d2.aplica, true);
    ok("caso 2: una sola linea",   d2.lineas.length, 1);
    ok("caso 2: tipo",             d2.tipo, "descuento");
    ok("caso 2: veces",            d2.lineas[0].veces, 10);
    ok("caso 2: son dolares",      d2.lineas[0].montoDolares, 238.39);
    ok("caso 2: no son regalos",   d2.lineas[0].unidadesRegalo, 0);
    ok("caso 2: total",            d2.totalDescuento, 238.39);

    /* LA TRAMPA: `tipo` y `descripcion` viven entre los indices numericos.
       Sin filtrarlas aparecerian como dos productos fantasma. */
    const d2b = C.promo.detalle({ status: "ok", codigo: 0, data: {
        "0": { cantidad: 10, montoDescuento: 238.39, itemdescr: "MONITOR TCL 24G54", tipo: ["descuento"] },
        "1": { cantidad: 4,  montoDescuento: 67.59,  itemdescr: "TONER BROTHER TN1060", tipo: ["descuento"] },
        tipo: ["descuento"], descripcion: "TCL PROMO REBATE MNT SEPT2026" } }, "15112");

    ok("dos productos, dos lineas", d2b.lineas.length, 2);
    ok("suma de las dos",           d2b.totalDescuento, 305.98);

    /* --- caso 4: item / regalo / unidades. montoDescuento son PIEZAS --- */
    const d4 = C.promo.detalle({ status: "ok", codigo: 0, data: {
        "0": { cantidad: 3, montoDescuento: 3, monedaDescuento: "D",
               itemdescr: "PSU ANTEC CSK 550W", tipo: ["regalo"] },
        tipo: ["regalo"], descripcion: "TCL PROMO REBATE MNT SEPT2026" } }, "14656");

    ok("caso 4: tipo regalo",        d4.tipo, "regalo");
    ok("caso 4: son obsequios",      d4.lineas[0].unidadesRegalo, 3);
    ok("caso 4: NO son dolares",     d4.lineas[0].montoDolares, 0);
    ok("caso 4: no suma dinero",     d4.totalDescuento, 0);
    ok("caso 4: suma obsequios",     d4.totalRegalos, 3);

    /* --- caso 6: total venta. Trae participantes y acumulado --- */
    const d6 = C.promo.detalle({ status: "ok", codigo: 0, data: {
        "0": { cantidad: 2, montoDescuento: 20.34, monedaDescuento: "D",
               itemdescr: "2 producto(s) del conjunto",
               participantes: ["A1", "A2"], acumulado: 100, tipo: ["descuento"] },
        tipo: ["descuento"], descripcion: "TCL PROMO REBATE MNT SEPT2026" } }, "15112");

    ok("caso 6: participantes",  d6.lineas[0].participantes, ["A1", "A2"]);
    ok("caso 6: acumulado",      d6.lineas[0].acumulado, 100);
    ok("caso 6: monto",          d6.lineas[0].montoDolares, 20.34);

    /* En ambito item no hay participantes ni acumulado: null, no 0, para poder
       distinguir "no aplica a este ambito" de "acumulo cero". */
    ok("item: sin participantes", d2.lineas[0].participantes, null);
    ok("item: sin acumulado",     d2.lineas[0].acumulado, null);

    /* --- no aplica: 200 con data null. No es un error --- */
    const noAlcanza = C.promo.detalle({ status: "no aplica", codigo: 0, data: null,
        motivo: "no_alcanza", faltante: 7, unidad: "unidades",
        msg: "faltan 7 unidades para alcanzar la promocion" }, "15112");

    ok("no alcanza: no aplica",  noAlcanza.aplica, false);
    ok("no alcanza: motivo",     noAlcanza.motivo, "no_alcanza");
    ok("no alcanza: faltante",   noAlcanza.faltante, 7);
    ok("no alcanza: unidad",     noAlcanza.unidad, "unidades");
    ok("no alcanza: sin lineas", noAlcanza.lineas.length, 0);

    const noParticipa = C.promo.detalle({ status: "no aplica", codigo: 0, data: null,
        motivo: "no_participa",
        msg: "ninguno de los productos del carrito participa en esta promocion" }, "15112");
    ok("no participa: faltante null", noParticipa.faltante, null);

    // El umbral puede ser 0 y entonces faltante viene null: no se fuerza a 0.
    const sinUmbral = C.promo.detalle({ status: "no aplica", codigo: 0, data: null,
        motivo: "no_alcanza", faltante: null, unidad: "monto", msg: "x" }, "15112");
    ok("faltante null se respeta", sinUmbral.faltante, null);

    /* --- el texto del beneficio, que es donde se notaria la confusion --- */
    ok("texto descuento en dolares", C.promo.textoBeneficio(d2.lineas[0], "D"), "$ 238.39");
    ok("texto regalo: sin moneda",   C.promo.textoBeneficio(d4.lineas[0], "D"), "3 obsequios");

    sel.value = "S";
    ok("texto descuento en soles",   C.promo.textoBeneficio(d2.lineas[0], "S"), "S/ 812.43");
    /* Un regalo NO se convierte aunque monedaDescuento diga "D": son 3 piezas,
       no 3 dolares. Convertirlo daba "10.22" obsequios. */
    ok("texto regalo en soles",      C.promo.textoBeneficio(d4.lineas[0], "S"), "3 obsequios");
    sel.value = "D";

    const unoSolo = C.promo.detalle({ status: "ok", codigo: 0, data: {
        "0": { cantidad: 1, montoDescuento: 1, itemdescr: "X", tipo: ["regalo"] },
        tipo: ["regalo"], descripcion: "Y" } }, "1");
    ok("singular del obsequio", C.promo.textoBeneficio(unoSolo.lineas[0], "D"), "1 obsequio");
}


/* === Deteccion de entorno ======================================== */
/* El login desde el movil iba contra produccion: la pagina se abre por la IP
   de red y solo valian 127.0.0.1 y localhost. */
console.log("\n— entorno —");
{
    function env(host, puerto) {
        return cargar(crearEntorno(host, "http://" + host + "/core/cdk.js", puerto), ARCHIVOS);
    }

    ok("loopback es dev",        env("127.0.0.1", "8080").env, "dev");
    ok("localhost es dev",       env("localhost", "").env, "dev");
    ok("IP de red en 8080 es dev", env("192.168.1.192", "8080").env, "dev");
    ok("10.x en 8080 es dev",    env("10.0.0.5", "8080").env, "dev");
    ok("172.16 en 8080 es dev",  env("172.16.3.9", "8080").env, "dev");
    ok("172.31 en 8080 es dev",  env("172.31.0.1", "8080").env, "dev");

    /* 172.32 ya esta fuera del rango privado. */
    ok("172.32 no es privada",   env("172.32.0.1", "8080").env, "prod");

    /* La red privada SIN el puerto del servidor de pruebas sigue siendo
       produccion: si la intranet se sirviera desde una IP interna, mandarla
       contra la API simulada seria peor que el fallo original. */
    ok("IP privada en 80 es prod",  env("192.168.1.192", "").env, "prod");
    ok("IP privada en 443 es prod", env("192.168.1.192", "443").env, "prod");
    ok("dominio publico es prod",   env("landing.compudiskett.com.pe", "").env, "prod");

    /* Y la API de desarrollo acompana al host de la pagina: con 127.0.0.1 fijo,
       desde el telefono apuntaria al propio telefono. */
    ok("api dev sigue al host",
       env("192.168.1.192", "8080").rutas.api("/login"),
       "http://192.168.1.192:3000/v1/login");
    ok("api dev en local",
       env("127.0.0.1", "8080").rutas.api("/login"),
       "http://127.0.0.1:3000/v1/login");
    ok("api prod no cambia",
       env("landing.compudiskett.com.pe", "").rutas.api("/login"),
       "https://pulpo.compudiskett.com.pe/v1/login");
}


/* === El sobre en /vendedor y /cotizacion ========================= */
/* Se prueba por el camino real -CDK.permisos.modulos()- con la peticion
   simulada, en vez de exponer la funcion privada solo para esto. */
async function probarRespuestas() {
    console.log("\n— respuestas del backend —");

    async function modulosCon(respuesta) {
        const ventana = crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js");
        const C = cargar(ventana, ARCHIVOS);
        C.http.get = () => Promise.resolve(respuesta);
        const modulos = await C.permisos.modulos();
        return { modulos: modulos, usuario: C.sesion.usuario() };
    }

    /* La forma actual: modulos dentro de `data`, usuario FUERA del sobre. */
    const hoy = await modulosCon({
        status: "ok", codigo: 0,
        data: { cotizacion: "Permite manejar cotizaciones", factura: "..." },
        nombre: "JUAN CARLOS", grupo: "VENTAS-JEFES DE PROD",
        tipo: "ESPECIALISTA", tipoCambio: 3.437
    });
    ok("sobre: modulos de data",  Object.keys(hoy.modulos), ["cotizacion", "factura"]);
    ok("sobre: nombre",           hoy.usuario.nombre, "JUAN CARLOS");
    ok("sobre: tipo",             hoy.usuario.tipo, "ESPECIALISTA");
    ok("sobre: tipo de cambio",   hoy.usuario.tipoCambio, 3.437);

    /* La anterior sigue valiendo: el backend migra pantalla por pantalla. */
    const antes = await modulosCon({ modulos: { cuota: "..." }, nombre: "X", tipo: "COBERTURA" });
    ok("forma anterior",          Object.keys(antes.modulos), ["cuota"]);
    ok("forma anterior: tipo",    antes.usuario.tipo, "COBERTURA");

    /* Y el mapa suelto, sin datos de usuario. */
    const suelto = await modulosCon({ cotizacion: "...", pedido: "..." });
    ok("mapa suelto",             Object.keys(suelto.modulos), ["cotizacion", "pedido"]);

    /* Accesos: pasaron de `accesos` a `data`; se aceptan las dos y el arreglo. */
    async function accesosCon(respuesta) {
        const C = cargar(crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js"), ARCHIVOS);
        C.http.get = () => Promise.resolve(respuesta);
        return C.permisos.accesos("cotizacion");
    }

    ok("accesos en data",
       await accesosCon({ status: "ok", codigo: 0, data: ["crear", "leer", "update", "delete", "alm"] }),
       ["crear", "leer", "update", "delete", "alm"]);
    ok("accesos en accesos (anterior)",
       await accesosCon({ accesos: ["crear"] }), ["crear"]);
    ok("accesos como arreglo suelto",
       await accesosCon(["crear"]), ["crear"]);
    ok("respuesta rara no inventa accesos",
       await accesosCon({ status: "ok", data: null }), []);
}

/* === tipoCambio: el backend ya manda el real ===================== */
console.log("\n— tipo de cambio —");
{
    const ventana = crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js");
    const sel = { value: "D", addEventListener() {} };
    ventana.document.getElementById = (id) => (id === "alm" ? sel : null);
    const C = cargar(ventana, ARCHIVOS.concat(["js/cotizacion/campos.js"]));

    ok("sin usuario usa el fijo",     C.coti.tipoCambio(), 3.408);
    ok("y lo dice",                   C.coti.tipoCambioEsFijo(), true);

    C.sesion.fijarUsuario({ nombre: "X", tipoCambio: 3.437 });
    ok("usa el del backend",          C.coti.tipoCambio(), 3.437);
    ok("ya no es el fijo",            C.coti.tipoCambioEsFijo(), false);

    /* Llega null cuando no hay tipo de cambio cargado para hoy. */
    C.sesion.fijarUsuario({ nombre: "X", tipoCambio: null });
    ok("null vuelve al fijo",         C.coti.tipoCambio(), 3.408);
    C.sesion.fijarUsuario({ nombre: "X", tipoCambio: 0 });
    ok("cero vuelve al fijo",         C.coti.tipoCambio(), 3.408);
}

/* === Almacenes =================================================== */
console.log("\n— almacenes —");
{
    const C = cargar(crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js"), ARCHIVOS);

    ok("nombre del 15", C.catalogo.almacen("15"), "Piura");
    ok("nombre del 16", C.catalogo.almacen("16"), "Chorrillos");
    ok("nombre del 01", C.catalogo.almacen("01"), "Principal");

    /* Saber como se llama el 15 no lo hace destino valido: eso es negocio. */
    ok("destinos del desplegable",
       C.catalogo.almacenes().map((a) => a.codigo), ["01", "08"]);
}


/* === Renovacion de sesion ante un 401 ============================ */
/* `cdk` dura 24 h y `tip` solo 1, y /vendedor necesita las dos: pasada la hora
   responde 401 con la sesion viva. Sin esto el vendedor seria expulsado cada
   60 minutos. */
async function probarRenovacion() {
    console.log("\n— renovacion de sesion —");

    /** Monta un entorno cuyo fetch responde segun un guion. */
    function conGuion(guion) {
        const ventana = crearEntorno("127.0.0.1", "http://127.0.0.1/core/cdk.js");
        const llamadas = [];

        ventana.fetch = function (url, opciones) {
            llamadas.push({ url: String(url), metodo: (opciones || {}).method || "GET" });
            const paso = guion.shift() || { status: 500, cuerpo: "" };
            return Promise.resolve({
                status: paso.status,
                ok: paso.status >= 200 && paso.status < 300,
                statusText: "",
                text: function () { return Promise.resolve(paso.cuerpo || ""); }
            });
        };

        const C = cargar(ventana, ARCHIVOS);
        // Para no depender de que expirar() intente redirigir en el arnes.
        let expiro = false;
        C.sesion.expirar = function () { expiro = true; };

        return { C: C, llamadas: llamadas, expirada: () => expiro };
    }

    /* --- caso normal: 401, se repone `tip`, y el reintento trae el dato --- */
    {
        const e = conGuion([
            { status: 401, cuerpo: JSON.stringify({ status: "falsa galleta" }) },
            { status: 200, cuerpo: JSON.stringify(JSON.stringify({ correcto: "ESPECIALISTA" })) },
            { status: 200, cuerpo: JSON.stringify({ status: "ok", data: { cotizacion: "x" } }) }
        ]);

        const r = await e.C.http.get(e.C.rutas.api("/vendedor"));
        ok("el 401 no se propaga",        r.status, "ok");
        ok("trae el dato del reintento",  Object.keys(r.data), ["cotizacion"]);
        ok("tres peticiones",             e.llamadas.length, 3);
        ok("la segunda repone tip",       e.llamadas[1].url.indexOf("/login/identificador") >= 0, true);
        ok("la tercera repite la original", e.llamadas[2].url.indexOf("/vendedor") >= 0, true);
        ok("la sesion NO se cerro",       e.expirada(), false);
    }

    /* --- la renovacion tambien falla: ahi si se acabo --- */
    {
        const e = conGuion([
            { status: 401, cuerpo: "" },
            { status: 401, cuerpo: "" }
        ]);

        let hubo = null;
        try { await e.C.http.get(e.C.rutas.api("/vendedor")); }
        catch (err) { hubo = err; }

        ok("lanza el error",          hubo && hubo.status, 401);
        ok("dos peticiones, no mas",  e.llamadas.length, 2);
        ok("la sesion SI se cerro",   e.expirada(), true);
    }

    /* --- no se renueva dos veces: el reintento ya va marcado --- */
    {
        const e = conGuion([
            { status: 401, cuerpo: "" },
            { status: 200, cuerpo: JSON.stringify({ correcto: "X" }) },
            { status: 401, cuerpo: "" }
        ]);

        let hubo = null;
        try { await e.C.http.get(e.C.rutas.api("/vendedor")); }
        catch (err) { hubo = err; }

        ok("se rinde al segundo 401", hubo && hubo.status, 401);
        ok("no reintenta en bucle",   e.llamadas.length, 3);
    }

    /* --- el login lleva sin401: ahi un 401 es "contrasena mala" --- */
    {
        const e = conGuion([{ status: 401, cuerpo: JSON.stringify({ status: "no cdk user" }) }]);

        let hubo = null;
        try { await e.C.http.post(e.C.rutas.api("/login"), {}, { sin401: true }); }
        catch (err) { hubo = err; }

        ok("sin401 no renueva",       e.llamadas.length, 1);
        ok("sin401 no cierra sesion", e.expirada(), false);
        ok("el detalle llega",        hubo.detalles.status, "no cdk user");
    }

    /* --- un POST tambien se reintenta: el 401 ocurre antes de ejecutar nada --- */
    {
        const e = conGuion([
            { status: 401, cuerpo: "" },
            { status: 200, cuerpo: JSON.stringify({ correcto: "X" }) },
            { status: 200, cuerpo: JSON.stringify({ status: "ok", documento: "098-00000037" }) }
        ]);

        const r = await e.C.http.post(e.C.rutas.api("/cotizacion/pegar"), { productos: {} });
        ok("el POST se reintenta",  r.documento, "098-00000037");
        ok("y conserva el metodo",  e.llamadas[2].metodo, "POST");
    }

    /* --- apagado por configuracion --- */
    {
        const e = conGuion([{ status: 401, cuerpo: "" }]);
        e.C.config.renovarSesion = false;

        let hubo = null;
        try { await e.C.http.get(e.C.rutas.api("/vendedor")); }
        catch (err) { hubo = err; }

        ok("apagado: una sola peticion", e.llamadas.length, 1);
        ok("apagado: cierra sesion",     e.expirada(), true);
    }
}

/* --------------------------------------------------------------- */
/* Lo asincrono va al final y el resumen espera por ello, para que no se
   imprima antes de que las comprobaciones terminen. */
probarRespuestas().then(probarRenovacion).then(function () {
    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
});
