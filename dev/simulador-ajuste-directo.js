/**
 * Simulacro de ajuste directo y asignacion (grupo 25): el jefe de marca ajusta el precio de SUS
 * cotizaciones y pedidos, sin que un vendedor se los envie, y si quiere los asigna a un vendedor del
 * grupo 20. Reproduce docs/ajuste-directo.md (06/11/2026, con las respuestas de su seccion 11); no lo
 * inventa.
 *
 *     GET  /ajuste/directo/documentos?tipo=&desde=&hasta=&ndocu=   → documentos(params)
 *     GET  /ajuste/directo/documento?tipo=&ndocu=                  → documento(params)
 *     POST /ajuste/directo/aplicar                                 → aplicar(cuerpo)
 *     GET  /ajuste/directo/vendedores?pista=                       → vendedores(params)
 *     POST /ajuste/directo/asignar                                 → asignar(cuerpo)
 *     GET  /ajuste/asignados?desde=&hasta=                         → asignados(params)
 *
 * Vive sobre los documentos de dev/simulador-ajuste.js (mismo almacen, mismos productos, mismas cuentas):
 * asi un documento asignado al vendedor de la demo (246) le aparece en sus listas y lo puede mandar a
 * ajuste, como en el backend. Por eso `reiniciar()` va DESPUES del de ajuste, que vacia los documentos.
 *
 * Que es fiel al contrato:
 *
 *   · los documentos son de quien pregunta (el grupo 25 de la demo, jefatura o especialista) hasta que
 *     los asigna; despues, del vendedor, y para el que asigno son `403 documento desconocido`
 *   · «sus lineas» son las de las marcas de las que responde este mes: su dueño o, si no tiene, la
 *     jefatura de su familia. Las demas llegan en `otras[]`, solo para verlas
 *   · se ajusta solo el precio, aunque el documento este aprobado; el descuento pasa a 0, el costo se
 *     actualiza y se quitan TODAS las promociones, flete incluido
 *   · sin costo (0) la linea llega con `costo`, `precioMinimo` y `margen` en null, y aplicarla da 409
 *   · la lista sin filtros son los ultimos 30 dias, y lo dice en `desde`/`hasta`; con `ndocu`, las
 *     fechas se ignoran; hasta 100 y `hayMas`
 *   · `motivoAjustar` / `motivoAsignar`: `documento avanzado` > `documento en ajuste` > `sin lineas propias`
 *
 * El dia es fijo (06/11/2026): las pruebas no pueden depender del dia en que se corran.
 *
 * No habla HTTP: devuelve `{ status, cuerpo }`.
 */
"use strict";

const marcas = require("./simulador-marcas");
const ajuste = require("./simulador-ajuste");

const S = marcas.estado;
const yo = () => marcas.yo();
const H = ajuste.ayudas;
const { ok, error } = H;

/** «Hoy» para el servidor: los 30 dias por defecto se cuentan desde aqui. */
const HOY = "2026-11-06";
const HACE_30 = "2026-10-07";

/** Lo que se puede ajustar o asignar. Lo demas es un documento que ya avanzo. */
const ABIERTAS = ["sin aprobar", "aprobado"];

/* ---------------------------------------------------------------- vendedores */
/* Los activos del grupo 20. GONZALES CRISTOPHER es el vendedor de la demo (246): lo que se le asigna le aparece en sus listas. */
const VENDEDORES = [
    { codven: "V0278", nombre: "HUAMANI ANTHONY",                tipo: "COBERTURA", codusu: "196" },
    { codven: "V0251", nombre: "UBILLUZ ZEGARRA ANTHONY JUNIOR", tipo: "CARTERA",   codusu: "251" },
    { codven: "V0246", nombre: "GONZALES CRISTOPHER",            tipo: "CARTERA",   codusu: "246" },
    { codven: "V0212", nombre: "MENDOZA RIVERA LUIS",            tipo: "CARTERA",   codusu: "212" },
    { codven: "V0260", nombre: "QUISPE ROSARIO",                 tipo: "COBERTURA", codusu: "260" },
    { codven: "V0231", nombre: "TORRES MILAGROS",                tipo: "COBERTURA", codusu: "231" }
].sort((a, b) => (a.nombre < b.nombre ? -1 : 1));

/* ---------------------------------------------------------------- documentos */
/*
 * Cada linea: [codi, cantidad, precio, descuento %]. Para la jefatura de la demo (071) son suyas ACER (dueña), ADATA y TDK
 * (familia 09 sin dueño); para el especialista de las pruebas (233), las que se le asignen. MEMOREX y EPSON son de 229 y ZOTAC
 * no es de nadie: esas son siempre «otras».
 */
const DOCUMENTOS = [
    /* Sin aprobar, con flete: la linea de TDK tiene el precio de lista bajo el costo (15.00 contra 18.4033, minimo 18.41). */
    { tipo: "COT", ndocu: "009-00969333", situacion: "sin aprobar", fecha: "2026-11-03", cliente: "MAGIC STAR S.R.L.", moneda: "D", tcam: 3.362,
      promociones: 1, flete: true, promoMonto: -15,
      lineas: [["0505-000201", 10, 15.00, 0], ["0505-012401", 2, 74.90, 2.5], ["0505-012610", 12, 7.97, 0]] },
    /* Aprobada: se ajusta igual. Una linea sin costo cargado. */
    { tipo: "COT", ndocu: "009-00971194", situacion: "aprobado", fecha: "2026-10-28", cliente: "CORPORACION GRAFICA DEL SUR S.A.C.", moneda: "D", tcam: 3.362,
      promociones: 0, flete: false, promoMonto: 0,
      lineas: [["0505-003201", 20, 5.90, 0], ["0505-000202", 5, 9.50, 0]] },
    /* Ninguna linea suya: no se ajusta, pero se asigna. */
    { tipo: "COT", ndocu: "009-00962947", situacion: "sin aprobar", fecha: "2026-10-15", cliente: "INVERSIONES TAKANA E.I.R.L.", moneda: "D", tcam: 3.362,
      promociones: 0, flete: false, promoMonto: 0,
      lineas: [["0505-012610", 30, 7.97, 0], ["0505-003601", 1, 119.00, 0]] },
    /* Con una solicitud de un vendedor sin responder: ni ajustar ni asignar. */
    { tipo: "COT", ndocu: "009-00971500", situacion: "sin aprobar", fecha: "2026-10-20", cliente: "TIENDA ZETA E.I.R.L.", moneda: "D", tcam: 3.362,
      enAjuste: true, promociones: 0, flete: false, promoMonto: 0,
      lineas: [["0505-003201", 8, 5.90, 0]] },
    /* Ya se convirtio en pedido: no sale en la lista; el detalle llega con `documento avanzado`. */
    { tipo: "COT", ndocu: "009-00971426", situacion: "pedido", fecha: "2026-10-30", cliente: "FERRETERIA CENTRAL S.A.C.", moneda: "D", tcam: 3.362,
      promociones: 0, flete: false, promoMonto: 0,
      lineas: [["0505-012401", 1, 74.90, 0]] },
    /* De 2024: no sale en los ultimos 30 dias; se encuentra por su numero. */
    { tipo: "COT", ndocu: "009-00821916", situacion: "sin aprobar", fecha: "2024-08-14", cliente: "DISTRIBUIDORA OK.COM S.A.C.", moneda: "D", tcam: 3.75,
      promociones: 0, flete: false, promoMonto: 0,
      lineas: [["0505-000201", 4, 21.90, 0], ["0505-003201", 10, 5.90, 0]] },

    /* Pedido aprobado: 3 de 4 lineas suyas (para la jefatura). */
    { tipo: "PED", ndocu: "009-00773963", situacion: "aprobado", fecha: "2026-10-26", cliente: "TECEMIP S.A.C.", moneda: "D", tcam: 3.362,
      promociones: 0, flete: false, promoMonto: 0,
      lineas: [["0505-003601", 2, 119.00, 0], ["0505-012401", 4, 74.90, 0], ["0505-000201", 6, 21.90, 0], ["0505-003201", 12, 5.90, 0]] },
    /* Pedido en soles, sin aprobar. */
    { tipo: "PED", ndocu: "009-00774500", situacion: "sin aprobar", fecha: "2026-11-04", cliente: "ABASTECEDORA DEL SUR S.A.C.", moneda: "S", tcam: 3.41,
      promociones: 1, flete: false, promoMonto: -30,
      lineas: [["0505-003201", 12, 20.10, 0], ["0505-020601", 2, 603.00, 0]] }
];

/** Cotizaciones antiguas, aprobadas, para que un rango amplio pase de 100 (`hayMas`). */
function relleno() {
    const salida = [];
    for (let i = 0; i < 105; i++) {
        const mes = String(1 + (i % 6)).padStart(2, "0");
        const dia = String(1 + (i % 27)).padStart(2, "0");
        salida.push({ tipo: "COT", ndocu: "009-0090" + String(1000 + i), situacion: "aprobado", fecha: "2025-" + mes + "-" + dia,
                      cliente: "CLIENTE DE ARCHIVO " + (i + 1), moneda: "D", tcam: 3.75, promociones: 0, flete: false, promoMonto: 0,
                      lineas: [["0505-003201", 5, 5.90, 0]] });
    }
    return salida;
}

/* ------------------------------------------------------------------- estado */
const D = { claves: [], asignaciones: [], siguienteAjuste: 1, siguienteAsignacion: 1, reloj: 0 };

const almacen = () => ajuste.estado.documentos;
const docDe = (tipo, ndocu) => almacen()[H.claveDoc(tipo, ndocu)] || null;

/** Una hora de registro que avanza: dos ajustes seguidos no comparten segundo. */
function ahora() {
    const s = 30 * 60 + D.reloj++;
    return HOY + "T15:" + String(Math.floor(s / 60) % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}

function reiniciar() {
    D.claves.forEach((k) => { delete almacen()[k]; });
    D.claves = [];
    D.asignaciones = [];
    D.siguienteAjuste = 1;
    D.siguienteAsignacion = 1;
    D.reloj = 0;

    DOCUMENTOS.concat(relleno()).forEach((p) => {
        const doc = {
            tipo: p.tipo, ndocu: p.ndocu, vendedor: null, directo: true, cliente: p.cliente, moneda: p.moneda, tcam: p.tcam,
            fecha: p.fecha, situacion: p.situacion, abierto: p.situacion === "sin aprobar", enAjuste: !!p.enAjuste,
            promociones: p.promociones, flete: p.flete, promoMonto: p.promoMonto, ajustesDirectos: [],
            lineas: p.lineas.map((l, i) => ({
                item: i + 1, codi: l[0], cantidad: l[1], precio: l[2], dsct: l[3], codmar: ajuste.PRODUCTOS[l[0]].codmar
            }))
        };
        const k = H.claveDoc(doc.tipo, doc.ndocu);
        almacen()[k] = doc;
        D.claves.push(k);
    });
}

reiniciar();

/* ------------------------------------------------------------------ reglas */
const abierto = (doc) => ABIERTAS.indexOf(doc.situacion) !== -1;

/** ¿Tiene una solicitud de ajuste de un vendedor sin responder? */
const enAjuste = (doc) => doc.enAjuste ||
    ajuste.estado.solicitudes.some((s) => s.tipo === doc.tipo && s.ndocu === doc.ndocu && s.estado === "PENDIENTE");

/** Las lineas de las marcas de las que responde quien pregunta: su dueño o, sin dueño, la jefatura de la familia. */
const esMia = (l) => {
    const r = ajuste.responsableDe(l.codmar);
    return !!r && r.codusu === yo();
};

const motivoDe = (doc, paraAjustar) => {
    if (!abierto(doc)) return "documento avanzado";
    if (enAjuste(doc)) return "documento en ajuste";
    if (paraAjustar && !doc.lineas.some(esMia)) return "sin lineas propias";
    return null;
};

const totalConIgv = (doc) => H.totalesDe(doc).totn;

/** Lo que tienen en comun todas las rutas: quien pregunta, el tipo y el numero. Devuelve `{ error }` o `{ doc }`. */
function revisar(datos, opciones) {
    datos = datos || {};
    if (H.esVendedor()) return { error: H.sinPermiso() };
    if (!S.yaRegistrado) return { error: H.noIdentificado() };

    const tipo = String(datos.tipo || "").toUpperCase();
    if (tipo !== "COT" && tipo !== "PED") return { error: error(400, "tipo invalido", "el tipo es COT o PED", 2) };
    if (opciones && opciones.soloTipo) return { tipo: tipo };

    const ndocu = String(datos.ndocu || "").trim();
    if (!/^\d{3}-\d{8}$/.test(ndocu)) {
        return { error: error(400, "documento ambiguo", "el numero de documento lleva su serie: 009-00969333", 2) };
    }

    const doc = docDe(tipo, ndocu);
    if (!doc || !doc.directo) return { error: error(403, "documento desconocido", "el documento no existe o no es tuyo") };
    return { tipo: tipo, doc: doc };
}

/* ------------------------------------------------------------------- rutas */

/** GET /v1/ajuste/directo/documentos */
function documentos(params) {
    params = params || {};
    const v = revisar(params, { soloTipo: true });
    if (v.error) return v.error;

    const ndocu = params.ndocu ? String(params.ndocu).trim() : "";
    if (ndocu && !/^\d{3}-\d{8}$/.test(ndocu)) {
        return error(400, "documento ambiguo", "el numero de documento lleva su serie: 009-00969333", 2);
    }

    /* Con `ndocu`, las fechas se ignoran (ni se validan). Sin filtros, los ultimos 30 dias, y se dice cuales. */
    let desde = null, hasta = null, ultimosDias = null;
    if (!ndocu) {
        const f = H.fechasInvalidas(params);
        if (f) return f;
        if (!params.desde && !params.hasta) { desde = HACE_30; hasta = HOY; ultimosDias = 30; }
        else { desde = params.desde || null; hasta = params.hasta || null; }
    }

    const todos = D.claves.map((k) => almacen()[k])
        .filter((d) => d && d.directo && d.tipo === v.tipo && abierto(d))
        .filter((d) => (ndocu ? d.ndocu === ndocu : (!desde || d.fecha >= desde) && (!hasta || d.fecha <= hasta)))
        .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (a.ndocu < b.ndocu ? 1 : -1)));

    return ok({
        tipo: v.tipo, ndocu: ndocu || null, desde: desde, hasta: hasta, ultimosDias: ultimosDias,
        hayMas: todos.length > 100,
        documentos: todos.slice(0, 100).map((d) => {
            const t = H.totalesDe(d);
            return {
                ndocu: d.ndocu, fecha: d.fecha, cliente: d.cliente, moneda: d.moneda, total: t.tota, totalConIgv: t.totn,
                situacion: d.situacion, lineas: d.lineas.length, lineasMias: d.lineas.filter(esMia).length,
                promociones: d.promociones, flete: d.flete, ajustes: d.ajustesDirectos.length
            };
        })
    });
}

/** Una linea de otra marca: solo para verla, sin costo ni margen. */
function otra(l) {
    const p = ajuste.PRODUCTOS[l.codi];
    return { item: l.item, codi: l.codi, codf: p.codf, descripcion: p.descripcion, marca: H.marcaPlana(l.codmar),
             cantidad: l.cantidad, precio: l.precio, dsct: l.dsct, total: H.importeDe(l) };
}

/** GET /v1/ajuste/directo/documento */
function documento(params) {
    const v = revisar(params);
    if (v.error) return v.error;

    const doc = v.doc;
    const t = H.totalesDe(doc);
    const motivoAjustar = motivoDe(doc, true);
    const motivoAsignar = motivoDe(doc, false);
    const mias = doc.lineas.filter(esMia);
    const otras = doc.lineas.filter((l) => !esMia(l));

    return ok({
        tipo: doc.tipo, ndocu: doc.ndocu,
        puedoAjustar: !motivoAjustar, motivoAjustar: motivoAjustar,
        puedoAsignar: !motivoAsignar, motivoAsignar: motivoAsignar,
        documento: { tipo: doc.tipo === "COT" ? "COTIZACION" : "PEDIDO", ndocu: doc.ndocu, fecha: doc.fecha,
                     cliente: doc.cliente, moneda: doc.moneda, tcam: doc.tcam,
                     total: t.tota, totalConIgv: t.totn, situacion: doc.situacion },
        promociones: doc.promociones,
        flete: doc.flete,
        otrasLineas: otras.length,
        otras: otras.map(otra),
        lineas: mias.map((l) => {
            const p = ajuste.PRODUCTOS[l.codi];
            return Object.assign({ item: l.item, codi: l.codi, codf: p.codf, descripcion: p.descripcion,
                                   marca: H.marcaPlana(l.codmar), actual: H.actualDe(l) }, H.costoDeLinea(doc, l));
        }),
        ajustes: doc.ajustesDirectos.slice().reverse()
    });
}

/** POST /v1/ajuste/directo/aplicar */
function aplicar(cuerpo) {
    cuerpo = cuerpo || {};
    const v = revisar(cuerpo);
    if (v.error) return v.error;

    const doc = v.doc;
    if (!abierto(doc)) return error(409, "documento no ajustable", "el documento ya se convirtio, se facturo, se anulo o fue desaprobado");
    if (enAjuste(doc)) return error(409, "documento en ajuste", "el documento tiene una solicitud de ajuste pendiente");

    const lineas = cuerpo.lineas;
    if (!Array.isArray(lineas) || !lineas.length) return error(400, "ajuste vacio", "no hay lineas que ajustar", 2);

    const vistos = [];
    for (const l of lineas) {
        const item = Number(l && l.item);
        const linea = doc.lineas.find((x) => x.item === item);
        if (!linea || !esMia(linea) || vistos.indexOf(item) !== -1) {
            return error(400, "linea ajena", "una linea no es de tus marcas, no existe o viene repetida", 2);
        }
        vistos.push(item);
    }

    /* Se valida todo antes de tocar nada: o se aplica entero, o nada. */
    const nuevas = [];
    for (const l of lineas) {
        const linea = doc.lineas.find((x) => x.item === Number(l.item));
        const precio = H.alCentimo(Number(l.precio));

        if (l.precio === null || l.precio === undefined || String(l.precio).trim() === "" || !isFinite(precio) || precio <= 0) {
            return error(400, "precio invalido", "el precio tiene que ser un numero mayor que 0", 2);
        }
        if (l.cantidad !== null && l.cantidad !== undefined && Number(l.cantidad) !== linea.cantidad) {
            return error(400, "cantidad no ajustable", "en el ajuste directo solo se cambia el precio", 2);
        }

        const costo = H.costoEn(doc, linea.codi);
        if (!(costo > 0)) return H.costoDesconocido();
        const minimo = H.precioMinimoDe(doc, linea.codi);
        if (precio < minimo) return error(409, "precio bajo costo", "el precio no puede ser menor que el costo (" + minimo + ")");

        nuevas.push({ linea: linea, precio: precio, costo: costo });
    }

    const antesTotal = totalConIgv(doc);
    const cambios = nuevas.map((n) => {
        const p = ajuste.PRODUCTOS[n.linea.codi];
        const antes = { cantidad: n.linea.cantidad, precio: n.linea.precio, dsct: n.linea.dsct };
        const despues = { cantidad: n.linea.cantidad, precio: n.precio, dsct: 0, costo: n.costo };
        n.linea.precio = n.precio;
        n.linea.dsct = 0;
        return { item: n.linea.item, codi: n.linea.codi, descripcion: p.descripcion, marca: H.marcaPlana(n.linea.codmar),
                 antes: antes, despues: despues };
    });

    /* TODAS las promociones del documento, flete incluido; el flete no vuelve solo. */
    const promocionesQuitadas = doc.promociones;
    doc.promociones = 0;
    doc.flete = false;
    doc.promoMonto = 0;

    const registro = {
        id: D.siguienteAjuste++, fecreg: ahora(), ajusta: { codusu: yo(), nombre: H.nombreDe(yo()) },
        observacion: cuerpo.observacion ? String(cuerpo.observacion).trim().slice(0, 300) || null : null,
        promocionesQuitadas: promocionesQuitadas, totalConIgvAntes: antesTotal, totalConIgvDespues: totalConIgv(doc),
        lineas: cambios.map((c) => ({ item: c.item, codi: c.codi, descripcion: c.descripcion,
                                      marca: { codmar: c.marca.codmar, abrmar: c.marca.abrmar }, antes: c.antes, despues: c.despues }))
    };
    doc.ajustesDirectos.push(registro);

    return ok({
        id: registro.id, tipo: doc.tipo, ndocu: doc.ndocu,
        lineas: cambios.map((c) => ({ item: c.item, codi: c.codi, antes: c.antes, despues: c.despues })),
        promocionesQuitadas: promocionesQuitadas,
        totales: H.totalesDe(doc)
    });
}

/** GET /v1/ajuste/directo/vendedores — los activos del grupo 20, sin restriccion de cartera ni de zona. Hasta 50, por nombre. */
function vendedores(params) {
    params = params || {};
    if (H.esVendedor()) return H.sinPermiso();
    if (!S.yaRegistrado) return H.noIdentificado();

    const pista = String(params.pista || "").trim().toLowerCase();
    const todos = VENDEDORES.filter((x) => !pista || x.nombre.toLowerCase().indexOf(pista) !== -1 ||
                                            x.codven.toLowerCase().indexOf(pista) !== -1);
    return ok({ hayMas: todos.length > 50,
                vendedores: todos.slice(0, 50).map((x) => ({ codven: x.codven, nombre: x.nombre, tipo: x.tipo })) });
}

/** POST /v1/ajuste/directo/asignar */
function asignar(cuerpo) {
    cuerpo = cuerpo || {};
    const v = revisar(cuerpo);
    if (v.error) return v.error;

    const doc = v.doc;
    if (!abierto(doc)) return error(409, "documento no asignable", "el documento ya se convirtio, se facturo, se anulo o fue desaprobado");
    if (enAjuste(doc)) return error(409, "documento en ajuste", "el documento tiene una solicitud de ajuste pendiente");

    const vendedor = VENDEDORES.find((x) => x.codven === String(cuerpo.codven || "").trim());
    if (!vendedor) return error(400, "vendedor invalido", "el codigo no es de un vendedor activo del grupo 20", 2);

    const a = {
        id: D.siguienteAsignacion++, fecreg: ahora(), tipo: doc.tipo, ndocu: doc.ndocu, asigno: yo(),
        cliente: doc.cliente, moneda: doc.moneda, totalConIgv: totalConIgv(doc),
        vendedor: { codven: vendedor.codven, nombre: vendedor.nombre }, ajustes: doc.ajustesDirectos.length
    };
    D.asignaciones.push(a);

    /* Desde ahora es del vendedor: lo ve en sus listas, y para quien lo asigno ya no existe. */
    doc.directo = false;
    doc.vendedor = vendedor.codusu;

    return ok({ id: a.id, fecreg: a.fecreg, tipo: a.tipo, ndocu: a.ndocu, cliente: a.cliente, moneda: a.moneda,
                totalConIgv: a.totalConIgv, vendedor: a.vendedor });
}

/** GET /v1/ajuste/asignados — por fecha de asignacion; la `situacion` es la de HOY. */
function asignados(params) {
    params = params || {};
    if (H.esVendedor()) return H.sinPermiso();
    if (!S.yaRegistrado) return H.noIdentificado();
    const f = H.fechasInvalidas(params);
    if (f) return f;

    const todos = D.asignaciones
        .filter((a) => a.asigno === yo())
        .filter((a) => (!params.desde || a.fecreg.slice(0, 10) >= params.desde) && (!params.hasta || a.fecreg.slice(0, 10) <= params.hasta))
        .sort((a, b) => (a.fecreg < b.fecreg ? 1 : a.fecreg > b.fecreg ? -1 : b.id - a.id));

    return ok({
        hayMas: todos.length > 100,
        asignados: todos.slice(0, 100).map((a) => ({
            id: a.id, tipo: a.tipo, ndocu: a.ndocu, fecreg: a.fecreg, totalConIgv: a.totalConIgv, vendedor: a.vendedor,
            cliente: a.cliente, moneda: a.moneda, situacion: (docDe(a.tipo, a.ndocu) || {}).situacion || "otro", ajustes: a.ajustes
        }))
    });
}

module.exports = { documentos, documento, aplicar, vendedores, asignar, asignados, reiniciar,
                   estado: D, docDe, VENDEDORES, HOY };
