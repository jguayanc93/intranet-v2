/**
 * Simulacro de `/v1/ajuste/*`: las solicitudes de ajuste de precio, por las dos
 * puntas. El vendedor (grupo 20) envia una cotizacion o pedido; el especialista o la
 * jefatura de la marca (grupo 25) la responde.
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-ajuste*.js, por la misma razon
 * que los otros simulacros: dos copias se desalinean. Reproduce el contrato de
 * docs/ajuste-precios.md; no lo inventa.
 *
 *   vendedor (grupo 20)
 *     POST /ajuste/previa                      → previa(cuerpo)   PROPUESTA nuestra: no existe en el backend
 *     POST /ajuste/enviar                      → enviar(cuerpo)
 *     GET  /ajuste/enviadas?estado=&ndocu=     → enviadas(params)
 *     POST /lista/cotis                        → listaCotizaciones()   no es de ajuste: las listas del modulo Listas
 *     POST /lista/pedidos                      → listaPedidos()
 *   responsable (grupo 25)
 *     GET  /ajuste/recibidas?estado=&ndocu=    → recibidas(params)
 *     GET  /ajuste/solicitud?id=               → solicitud(params)
 *     POST /ajuste/confirmar                   → confirmar(cuerpo)
 *     POST /ajuste/rechazar                    → rechazar(cuerpo)
 *
 * Quien pregunta sale del rol de dev/simulador-marcas.js: COBERTURA o CARTERA es el
 * vendedor 246; los demas son del grupo 25. Cada punta responde `403 sin permiso`
 * a las rutas de la otra.
 *
 * Actualizado con docs/ajuste-precios.md del 21/10/2026: el costo trae hasta 4 decimales y el precio
 * minimo es ese costo redondeado hacia arriba al centimo; `precioNeto`; las pendientes cuyo documento
 * avanzo se cierran al leer; filtros `desde`/`hasta`; `moneda` en enviar; `cantidad` en
 * `sinResponsable`; y la lista de pedidos distingue los sin aprobar.
 *
 * Segunda ronda (21/10/2026): el precio se **redondea al centimo, la mitad hacia arriba**, y se valida contra
 * `precioMinimo` ya redondeado; `desde`/`hasta` mal escritos, inexistentes o al reves dan `400 fechas invalidas`;
 * y `ajustesPendientes` (dev/servidor.js) cuenta solo lo que se puede responder.
 *
 * Que es fiel al contrato:
 *
 *   · enviar crea UNA solicitud por cada responsable —el dueño de la marca en el mes o,
 *     si no tiene, la jefatura de su familia—, cada una con SOLO las lineas de sus
 *     marcas; las de marcas sin responsable no van a nadie y la respuesta las lista
 *   · un documento con una solicitud pendiente no se puede volver a enviar, y uno ya
 *     aprobado, facturado o anulado tampoco
 *   · el precio nunca baja del costo actual (en la moneda del documento: un
 *     documento en soles trae el costo en soles)
 *   · al confirmar, en las lineas ajustadas el descuento pasa a 0, la cantidad
 *     cambia solo en cotizaciones, el costo se actualiza y se quitan TODAS las
 *     promociones del documento; las lineas que no vienen no se tocan
 *   · confirmar o rechazar una solicitud que ya no esta pendiente es 409; si el
 *     documento avanzo mientras tanto, la solicitud queda CERRADA
 *   · la observacion es obligatoria al rechazar y opcional al confirmar
 *
 * Es determinista: `reiniciar()` lo deja como al empezar, y hay que llamarlo
 * DESPUES de armar las marcas (quien responde cada linea sale de ahi).
 *
 * No habla HTTP: devuelve `{ status, cuerpo }`.
 */
"use strict";

const marcas = require("./simulador-marcas");

const S = marcas.estado;
const yo = () => marcas.yo();

const ahora = "2026-10-21T10:15:02";
const IGV = 0.18;

const redondear = (n) => Math.round(n * 100) / 100;

/** Al centimo, la mitad hacia arriba (8.204 → 8.20, 8.205 → 8.21): con el exponente en texto, que 8.205 × 100 da 820.4999999999999. */
const alCentimo = (n) => Number(Math.round(Number(n + "e2")) + "e-2");
const hay = (v) => v !== null && v !== undefined;

/** El vendedor del grupo 20 que usa la demo. Los otros dos envian solicitudes ya sembradas. */
const VENDEDOR = { codusu: "246", nombre: "GONZALES CRISTOPHER" };
const esVendedor = () => S.rol === "COBERTURA" || S.rol === "CARTERA";

/* ---------------------------------------------------------------- productos */
/* El costo esta en dolares; un documento en soles lo trae multiplicado por su tipo de cambio. */
const PRODUCTOS = {
    "0505-012401": { codmar: "0124", codf: "DG.E3AAL.004", descripcion: 'MONITOR ACER 21.5" V226HQL FHD',        costo: 62.30, stock: 148,  almacen: "01" },
    "0505-012402": { codmar: "0124", codf: "UM.QV6AA.001", descripcion: 'MONITOR ACER 27" KA272 IPS 100HZ',       costo: 98.10, stock: 35,   almacen: "01" },
    "0505-000301": { codmar: "0003", codf: "MEM-DVD-R47",  descripcion: "DVD-R MEMOREX 4.7GB (TORRE X50)",        costo: 14.20, stock: 920,  almacen: "08" },
    /* El costo de TDK trae 4 decimales, como puede pasar en el ERP: su precio minimo es 18.41. */
    "0505-000201": { codmar: "0002", codf: "TDK-CDR80",    descripcion: "CD-R TDK 80 MIN 700MB (TORRE X50)",      costo: 18.4033, stock: 410, almacen: "01" },
    "0505-020601": { codmar: "0206", codf: "C11CJ68301",   descripcion: "IMPRESORA EPSON ECOTANK L3210",          costo: 152.00, stock: 62,  almacen: "01" },
    "0505-020602": { codmar: "0206", codf: "C11CJ88301",   descripcion: "MULTIFUNCIONAL EPSON ECOTANK L5290",     costo: 231.50, stock: 0,   almacen: "01" },
    "0505-012610": { codmar: "0008", codf: "T664120-AL",   descripcion: "BOTELLA DE TINTA EPSON 664 NEGRO",       costo: 7.45,  stock: 3491, almacen: "01" },
    "0505-012615": { codmar: "0008", codf: "T664220-AL",   descripcion: "BOTELLA DE TINTA EPSON 664 CIAN",        costo: 7.45,  stock: 2210, almacen: "01" },
    "0505-003201": { codmar: "0032", codf: "AUV128-64G",   descripcion: "MEMORIA USB ADATA UV128 64GB",           costo: 4.10,  stock: 1200, almacen: "01" },
    "0505-003601": { codmar: "0036", codf: "ZT-GT1030",    descripcion: "TARJETA DE VIDEO ZOTAC GT1030 2GB",       costo: 88.00, stock: 14,   almacen: "01" }
};

/* ---------------------------------------------------------------- documentos */
/* Cada linea: [codi, cantidad, precio, descuento %]. Los precios van en la moneda del documento.
   `sinEnviar`: nadie lo ha mandado a ajuste todavia. */
const DOCUMENTOS = [
    /* Una cotizacion con lineas de varias marcas y una promocion, como la del ejemplo del contrato. */
    { tipo: "COT", ndocu: "009-00969476", vendedor: "246", cliente: "DISTRIBUIDORA OK.COM S.A.C.", moneda: "D", tcam: 3.385, fecha: "2026-09-24",
      promociones: 1, promoMonto: -12.5, envia: VENDEDOR,
      mensaje: "una ajustadita por favor", fecreg: "2026-10-21T09:40:11",
      lineas: [["0505-012401", 2, 74.90, 0], ["0505-020601", 2, 168.50, 2.5], ["0505-000201", 3, 21.90, 0],
               ["0505-012610", 18, 7.97, 2.5], ["0505-012615", 18, 7.97, 2.5], ["0505-003201", 5, 5.90, 0],
               ["0505-003601", 1, 119.00, 0]] },

    /* Un pedido, en soles: solo se cambia el precio. Es de otro vendedor. */
    { tipo: "PED", ndocu: "009-00774171", vendedor: "196", cliente: "INVERSIONES MEGAHARD E.I.R.L.", moneda: "S", tcam: 3.41, fecha: "2026-10-19",
      promociones: 0, promoMonto: 0, envia: { codusu: "196", nombre: "TORRES MILAGROS" },
      mensaje: "mejora el precio de estas impresoras", fecreg: "2026-10-21T10:15:02",
      lineas: [["0505-020601", 4, 603.00, 0], ["0505-000201", 10, 76.50, 0], ["0505-012401", 3, 267.00, 0],
               ["0505-000301", 6, 52.00, 0]] },

    /* Lo que el vendedor 246 todavia puede enviar... */
    { tipo: "COT", ndocu: "009-00970001", vendedor: "246", sinEnviar: true, cliente: "CORPORACION LIMA SUR S.A.C.", moneda: "D", tcam: 3.385,
      fecha: "2026-10-20", promociones: 2, promoMonto: -20,
      lineas: [["0505-012401", 3, 74.90, 0], ["0505-020601", 2, 168.50, 0], ["0505-000201", 5, 21.90, 0],
               ["0505-012610", 10, 7.97, 0], ["0505-003601", 1, 119.00, 0]] },
    { tipo: "PED", ndocu: "009-00775010", vendedor: "246", sinEnviar: true, cliente: "ABASTECEDORA DEL SUR S.A.C.", moneda: "S", tcam: 3.41,
      fecha: "2026-10-21", promociones: 0, promoMonto: 0,
      lineas: [["0505-020601", 2, 603.00, 0], ["0505-000201", 6, 76.50, 0], ["0505-003201", 12, 20.10, 0]] },

    /* Un pedido ya aprobado: sale en la lista de pedidos, pero no se puede enviar. */
    { tipo: "PED", ndocu: "009-00774194", vendedor: "246", sinEnviar: true, abierto: false, cliente: "COMERCIAL ANDINA S.A.C.", moneda: "S",
      tcam: 3.41, fecha: "2026-10-18", promociones: 0, promoMonto: 0, lineas: [["0505-020601", 1, 603.00, 0]] },

    /* ...y lo que no se deja: sin nadie que responda, y ya aprobado. */
    { tipo: "COT", ndocu: "009-00970222", vendedor: "246", sinEnviar: true, cliente: "TIENDA ZETA E.I.R.L.", moneda: "D", tcam: 3.385,
      fecha: "2026-10-20", promociones: 0, promoMonto: 0, lineas: [["0505-003601", 2, 119.00, 0]] },
    { tipo: "COT", ndocu: "009-00968800", vendedor: "246", sinEnviar: true, abierto: false, cliente: "FERRETERIA CENTRAL S.A.C.", moneda: "D",
      tcam: 3.385, fecha: "2026-10-02", promociones: 0, promoMonto: 0, lineas: [["0505-012401", 1, 74.90, 0]] }
];

/* ------------------------------------------------------------------- estado */
const A = { documentos: {}, solicitudes: [], siguiente: 1 };

const claveDoc = (tipo, ndocu) => tipo + " " + ndocu;

const redondear4 = (n) => Math.round(n * 10000) / 10000;
/* Hacia arriba al centimo; el `- 1e-9` evita que 7.45 × 100 = 745.0000000000001 suba a 7.46. */
const techo = (n) => Math.ceil(n * 100 - 1e-9) / 100;

/** El costo en la moneda del documento. Puede traer hasta 4 decimales. */
const costoEn = (doc, codi) => redondear4(PRODUCTOS[codi].costo * (doc.moneda === "S" ? doc.tcam : 1));

/** El precio no puede bajar de aqui: el costo redondeado HACIA ARRIBA al centimo (7.4533 → 7.46). */
const precioMinimoDe = (doc, codi) => techo(costoEn(doc, codi));

const marcaDe = (codmar) => S.catalogo.find((m) => m.codmar === codmar);

/** Quien responde por una marca este mes: su dueño, o la jefatura de su familia si no tiene. */
function responsableDe(codmar) {
    const m = marcaDe(codmar);
    if (!m) return null;
    if (m.dueno) return { codusu: m.dueno, como: "DUENO" };
    if (m.codfam === "09" && S.jefaturaConFamilia) return { codusu: "071", como: "JEFATURA" };
    return null;
}

const nombreDe = (codusu) => marcas.NOMBRE_CORTO[codusu] || codusu;

const marcaPlana = (codmar) => {
    const m = marcaDe(codmar);
    return { codmar: codmar, abrmar: m.abrmar, nombre: m.nombre };
};

/* Lo que vale una linea: cantidad × precio, menos su descuento. */
const importeDe = (l) => redondear(l.cantidad * l.precio * (1 - l.dsct / 100));

/** Los totales de TODO el documento: sin IGV, IGV y con IGV. */
function totalesDe(doc) {
    const tota = redondear(doc.lineas.reduce((a, l) => a + importeDe(l), 0) + doc.promoMonto);
    const toti = redondear(tota * IGV);
    return { tota: tota, toti: toti, totn: redondear(tota + toti) };
}

function crearDocumento(plantilla) {
    const doc = {
        tipo: plantilla.tipo, ndocu: plantilla.ndocu, vendedor: plantilla.vendedor, cliente: plantilla.cliente,
        moneda: plantilla.moneda, tcam: plantilla.tcam, fecha: plantilla.fecha, abierto: plantilla.abierto !== false,
        promociones: plantilla.promociones || 0, promoMonto: plantilla.promoMonto || 0,
        lineas: plantilla.lineas.map((l, i) => ({
            item: i + 1, codi: l[0], cantidad: l[1], precio: l[2], dsct: l[3], codmar: PRODUCTOS[l[0]].codmar
        }))
    };
    A.documentos[claveDoc(doc.tipo, doc.ndocu)] = doc;
    return doc;
}

const masTres = (iso) => {
    const d = new Date(iso + "Z");
    d.setUTCDate(d.getUTCDate() + 3);
    return d.toISOString().slice(0, 19);
};

/**
 * A quien le toca cada linea de un documento: una entrada por responsable, con solo las
 * lineas de sus marcas, y aparte las que no tienen a quien enviarse porque su marca no
 * tiene dueño ni jefatura.
 */
function repartir(doc) {
    const porResponsable = {};
    const sin = [];

    doc.lineas.forEach((l) => {
        const r = responsableDe(l.codmar);
        if (!r) { sin.push(l); return; }
        (porResponsable[r.codusu] = porResponsable[r.codusu] || { codusu: r.codusu, como: r.como, lineas: [] }).lineas.push(l);
    });

    return { responsables: Object.keys(porResponsable).map((k) => porResponsable[k]), sin: sin };
}

/**
 * Una solicitud por cada responsable, con solo las lineas de sus marcas. Devuelve
 * las que creo. `estadoDe(codusu)` permite sembrar solicitudes ya respondidas.
 */
function crearSolicitudes(doc, plantilla, estadoDe) {
    const creadas = [];

    repartir(doc).responsables.forEach((p) => {
        const codusu = p.codusu;
        const s = Object.assign({
            id: A.siguiente++, tipo: doc.tipo, ndocu: doc.ndocu, estado: "PENDIENTE",
            mensaje: plantilla.mensaje || null, observacion: null,
            fecreg: plantilla.fecreg, vence: masTres(plantilla.fecreg), fecrespuesta: null,
            envia: plantilla.envia, recibe: { codusu: codusu, nombre: nombreDe(codusu), como: p.como },
            items: p.lineas.map((l) => l.item),
            enviado: {}, ajuste: {},
            montoEnviado: redondear(p.lineas.reduce((a, l) => a + importeDe(l), 0))
        }, estadoDe ? estadoDe(codusu) : {});

        p.lineas.forEach((l) => { s.enviado[l.item] = { cantidad: l.cantidad, precio: l.precio, dsct: l.dsct }; });
        A.solicitudes.push(s);
        creadas.push(s);
    });

    return creadas;
}

/**
 * Lo ya respondido, para tener de todos los estados. Cada documento lleva una linea de
 * una marca de cada responsable de la demo —TDK, MEMOREX y ACER—, asi que a cada uno le
 * llega la suya; quien no tiene marcas no recibe nada.
 */
function sembrarHistoria() {
    const productos = ["0505-000201", "0505-000301", "0505-012401"];
    const historia = [
        { tipo: "COT", ndocu: "009-00851002", estado: "CONFIRMADA", fecreg: "2026-10-19T15:02:40",
          observacion: "listo, precio especial por volumen", mensaje: "una ajustadita" },
        { tipo: "PED", ndocu: "009-00851377", estado: "RECHAZADA", fecreg: "2026-10-16T11:20:05",
          observacion: "el cliente tiene que llevar al menos 50 unidades", mensaje: "se puede mejorar?" },
        { tipo: "COT", ndocu: "009-00850190", estado: "VENCIDA", fecreg: "2026-10-12T09:11:30", mensaje: null },
        { tipo: "PED", ndocu: "009-00849011", estado: "CERRADA", fecreg: "2026-10-09T16:45:12", mensaje: "urgente" }
    ];

    historia.forEach((h) => {
        const doc = crearDocumento({
            tipo: h.tipo, ndocu: h.ndocu, vendedor: "246", cliente: "COMERCIAL ANDINA S.A.C.", moneda: "D", tcam: 3.39,
            fecha: h.fecreg.slice(0, 10),
            lineas: productos.map((codi) => [codi, 4, redondear(PRODUCTOS[codi].costo * 1.2), 0])
        });

        const respondida = h.estado === "CONFIRMADA" || h.estado === "RECHAZADA";
        const creadas = crearSolicitudes(doc, { fecreg: h.fecreg, mensaje: h.mensaje, envia: VENDEDOR }, () => ({
            estado: h.estado, observacion: h.observacion || null,
            fecrespuesta: respondida ? masTres(h.fecreg).slice(0, 10) + "T10:20:40" : null
        }));

        if (h.estado === "CONFIRMADA") {
            /* Lo que quedo: el precio ajustado, sin descuento y con el costo de ese dia. */
            creadas.forEach((s) => s.items.forEach((item) => {
                const l = doc.lineas.find((x) => x.item === item);
                l.precio = redondear(l.precio * 0.97);
                l.dsct = 0;
                s.ajuste[item] = { cantidad: l.cantidad, precio: l.precio, dsct: 0, costo: costoEn(doc, l.codi) };
            }));
        }
        if (h.estado === "CERRADA") doc.abierto = false;
    });
}

function reiniciar() {
    A.documentos = {};
    A.solicitudes = [];
    A.siguiente = 1;

    DOCUMENTOS.forEach((d) => {
        const doc = crearDocumento(d);
        if (!d.sinEnviar) crearSolicitudes(doc, d);
    });
    sembrarHistoria();
}

reiniciar();

/* ------------------------------------------------------------------ ayudas */
const ok = (data) => ({ status: 200, cuerpo: { status: "ok", codigo: 0, data: data } });
const error = (status, nombre, msg, codigo) => ({ status: status, cuerpo: { status: nombre, codigo: codigo || 3, msg: msg } });

const noIdentificado = () => error(400, "no identificado", "el user no esta registrado en la intranet", 2);
const sinPermiso = () => error(403, "sin permiso", "esta ruta es del otro grupo");

const documentoDe = (s) => A.documentos[claveDoc(s.tipo, s.ndocu)];

/**
 * Una pendiente cuyo documento avanzo ya no se puede responder: pasa a CERRADA EN CUANTO ALGUIEN LA LEE
 * (enviadas, recibidas o solicitud), asi que una lista de pendientes nunca trae una muerta.
 */
function cerrarAvanzadas() {
    A.solicitudes.forEach((s) => {
        if (s.estado === "PENDIENTE" && !documentoDe(s).abierto) s.estado = "CERRADA";
    });
}

/** La solicitud con ese id, si le llego a quien pregunta (grupo 25). */
const delResponsable = (id) => A.solicitudes.find((s) => s.id === Number(id) && s.recibe.codusu === yo()) || null;

const margenDe = (precio, costo) => {
    const monto = redondear(precio - costo);
    return { monto: monto, sobreCosto: costo > 0 ? redondear(monto / costo * 100) : null,
             sobreVenta: precio > 0 ? redondear(monto / precio * 100) : null };
};

const recientesPrimero = (a, b) => (a.fecreg < b.fecreg ? 1 : a.fecreg > b.fecreg ? -1 : b.id - a.id);

/** `AAAA-MM-DD` que existe de verdad (2026-02-30 no). */
function fechaValida(texto) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(texto));
    if (!m) return false;
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

/** `400 fechas invalidas`: una fecha mal escrita, inexistente, o un `desde` posterior al `hasta`. No se ignora el filtro. */
function fechasInvalidas(params) {
    params = params || {};
    const hay = (v) => v !== undefined && v !== null && v !== "";
    const malas = (hay(params.desde) && !fechaValida(params.desde)) || (hay(params.hasta) && !fechaValida(params.hasta)) ||
                  (hay(params.desde) && hay(params.hasta) && params.desde > params.hasta);
    return malas ? error(400, "fechas invalidas", "desde y hasta son fechas AAAA-MM-DD que existen, y desde no puede ser posterior a hasta", 2) : null;
}

/** Lo que tienen en comun las listas: filtros opcionales, las mas recientes primero y hasta 100. */
function filtrar(lista, params) {
    params = params || {};
    if (params.estado) lista = lista.filter((s) => s.estado === String(params.estado).toUpperCase());
    if (params.ndocu) lista = lista.filter((s) => s.ndocu === params.ndocu);
    /* Por fecha de envio, dias completos, hora de Lima. Se aplican ANTES del tope de 100. */
    if (params.desde) lista = lista.filter((s) => s.fecreg.slice(0, 10) >= params.desde);
    if (params.hasta) lista = lista.filter((s) => s.fecreg.slice(0, 10) <= params.hasta);
    return lista.sort(recientesPrimero).slice(0, 100);
}

/** La forma de una solicitud en la lista del responsable. `lineas` es cuantas; el detalle esta en /solicitud. */
function resumen(s) {
    const doc = documentoDe(s);
    return {
        id: s.id, tipo: s.tipo, ndocu: s.ndocu, estado: s.estado, cliente: doc.cliente, moneda: doc.moneda,
        mensaje: s.mensaje, observacion: s.observacion,
        fecreg: s.fecreg, vence: s.vence, fecrespuesta: s.fecrespuesta,
        envia: s.envia, recibe: { codusu: s.recibe.codusu, nombre: s.recibe.nombre },
        lineas: s.items.length, montoEnviado: s.montoEnviado
    };
}

/** La forma de una solicitud en la lista del vendedor: igual, pero con cada linea y lo que paso con ella. */
function enviada(s) {
    const doc = documentoDe(s);
    return Object.assign(resumen(s), {
        lineas: s.items.map((item) => {
            const l = doc.lineas.find((x) => x.item === item);
            const p = PRODUCTOS[l.codi];
            return {
                item: item, codi: l.codi, codf: p.codf, descripcion: p.descripcion, marca: marcaPlana(l.codmar),
                antes: s.enviado[item], despues: s.ajuste[item] || null
            };
        })
    });
}

/* ------------------------------------------------- rutas del vendedor (grupo 20) */

/** Lo que se dice de una linea que va a un responsable: que es, y cuanto. */
function lineaConPrecio(l) {
    const p = PRODUCTOS[l.codi];
    return { item: l.item, codi: l.codi, codf: p.codf, descripcion: p.descripcion, marca: marcaPlana(l.codmar),
             cantidad: l.cantidad, precio: l.precio };
}

/** Una linea que no va a nadie: dice que es y cuanta cantidad, pero no su precio. */
function lineaSinPrecio(l) {
    const p = PRODUCTOS[l.codi];
    return { item: l.item, codi: l.codi, codf: p.codf, descripcion: p.descripcion, marca: marcaPlana(l.codmar),
             cantidad: l.cantidad };
}

/**
 * Lo que tienen en comun la vista previa y enviar: las mismas reglas, y los mismos motivos
 * por los que no se deja. Devuelve `{ error }` o `{ doc, tipo, ndocu, reparto }`.
 */
function revisarEnvio(cuerpo) {
    cuerpo = cuerpo || {};
    if (!esVendedor()) return { error: sinPermiso() };

    const tipo = String(cuerpo.tipo || "").toUpperCase();
    if (tipo !== "COT" && tipo !== "PED") return { error: error(400, "tipo invalido", "el tipo es COT o PED", 2) };

    const ndocu = String(cuerpo.ndocu || "").trim();
    if (!/^\d{3}-\d{8}$/.test(ndocu)) {
        return { error: error(400, "documento ambiguo", "el numero de documento lleva su serie: 009-00969476", 2) };
    }

    const doc = A.documentos[claveDoc(tipo, ndocu)];
    if (!doc || doc.vendedor !== VENDEDOR.codusu) {
        return { error: error(403, "documento desconocido", "el documento no existe o no es tuyo") };
    }
    if (!doc.abierto) {
        return { error: error(409, "documento no ajustable", "el documento ya esta aprobado, facturado o anulado") };
    }
    if (A.solicitudes.some((s) => s.tipo === tipo && s.ndocu === ndocu && s.estado === "PENDIENTE")) {
        return { error: error(409, "documento en ajuste", "el documento ya tiene una solicitud pendiente") };
    }

    const reparto = repartir(doc);
    if (!reparto.responsables.length) {
        return { error: error(409, "sin responsables", "ninguna marca del documento tiene especialista ni jefatura") };
    }

    return { doc: doc, tipo: tipo, ndocu: ndocu, reparto: reparto };
}

/**
 * POST /v1/ajuste/previa — **PROPUESTA nuestra, no existe en el backend.** Dice a quien iria
 * cada linea, cuales no irian a nadie y cuantas promociones tiene el documento, SIN crear nada.
 * Mismo cuerpo y mismos errores que enviar. Se pide para no enterarse de todo esto despues de
 * enviar. Ver docs/respuesta-ajuste-precios.md.
 */
function previa(cuerpo) {
    const v = revisarEnvio(cuerpo);
    if (v.error) return v.error;

    return ok({
        tipo: v.tipo, ndocu: v.ndocu, cliente: v.doc.cliente, moneda: v.doc.moneda,
        solicitudes: v.reparto.responsables.map((r) => ({
            recibe: { codusu: r.codusu, nombre: nombreDe(r.codusu), como: r.como },
            lineas: r.lineas.map(lineaConPrecio)
        })),
        sinResponsable: v.reparto.sin.map(lineaSinPrecio),
        promociones: v.doc.promociones
    });
}

/** POST /v1/ajuste/enviar */
function enviar(cuerpo) {
    cuerpo = cuerpo || {};
    const v = revisarEnvio(cuerpo);
    if (v.error) return v.error;

    const { doc, tipo, ndocu } = v;
    const creadas = crearSolicitudes(doc, {
        fecreg: ahora, mensaje: cuerpo.mensaje ? String(cuerpo.mensaje).trim() || null : null, envia: VENDEDOR
    });

    return ok({
        tipo: tipo, ndocu: ndocu, cliente: doc.cliente, moneda: doc.moneda,
        solicitudes: creadas.map((s) => ({
            id: s.id, recibe: s.recibe, vence: s.vence,
            lineas: s.items.map((item) => lineaConPrecio(doc.lineas.find((x) => x.item === item)))
        })),
        sinResponsable: v.reparto.sin.map(lineaSinPrecio),
        promociones: doc.promociones
    });
}

/**
 * La lista de cotizaciones del vendedor, como la devuelve /lista/cotis: un objeto con una fila
 * por cotizacion, y en cada una, por posicion, fecha, numero con serie, cliente, total con IGV,
 * moneda, registrado, estado y `editable` (1 si sigue abierta y sin aprobar). No es de ajuste:
 * es de Listas, y se simula aqui porque son los mismos documentos. Ver docs/listas-modulo.md.
 */
function listaCotizaciones() {
    if (!esVendedor()) return { status: 404, cuerpo: { msg: "endpoint no simulado: /lista/cotis" } };

    const filas = Object.keys(A.documentos)
        .map((k) => A.documentos[k])
        .filter((d) => d.tipo === "COT" && d.vendedor === VENDEDOR.codusu)
        .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (a.ndocu < b.ndocu ? 1 : -1)));

    const salida = {};
    filas.forEach((d, i) => {
        salida[i] = [d.fecha.replace(/-/g, "/"), d.ndocu, d.cliente, totalesDe(d).totn, d.moneda,
                     d.fecha + " 10:00:00", d.abierto ? "cotizado" : "pedido", d.abierto ? 1 : 0];
    });
    return { status: 200, cuerpo: salida };
}

/** GET /v1/ajuste/enviadas */
function enviadas(params) {
    if (!esVendedor()) return sinPermiso();
    cerrarAvanzadas();
    if (fechasInvalidas(params)) return fechasInvalidas(params);

    const lista = filtrar(A.solicitudes.filter((s) => s.envia.codusu === VENDEDOR.codusu), params);
    return ok({ solicitudes: lista.map(enviada) });
}

/**
 * La lista de pedidos del vendedor, como la devuelve /lista/pedidos: igual que la de cotizaciones, y desde el
 * 21/10 distingue los sin aprobar: el estado es `sin aprobar` / `aprobado` / `atendido`, y `editable` vale 1
 * si esta sin aprobar (es lo que acepta el ajuste) y 0 si no.
 */
function listaPedidos() {
    if (!esVendedor()) return { status: 404, cuerpo: { msg: "endpoint no simulado: /lista/pedidos" } };

    const filas = Object.keys(A.documentos)
        .map((k) => A.documentos[k])
        .filter((d) => d.tipo === "PED" && d.vendedor === VENDEDOR.codusu)
        .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : (a.ndocu < b.ndocu ? 1 : -1)));

    const salida = {};
    filas.forEach((d, i) => {
        salida[i] = [d.fecha.replace(/-/g, "/"), d.ndocu, d.cliente, totalesDe(d).totn, d.moneda,
                     d.fecha + " 10:00:00", d.abierto ? "sin aprobar" : "aprobado", d.abierto ? 1 : 0];
    });
    return { status: 200, cuerpo: salida };
}

/* ------------------------------------------- rutas del responsable (grupo 25) */

/** GET /v1/ajuste/recibidas */
function recibidas(params) {
    if (esVendedor()) return sinPermiso();
    if (!S.yaRegistrado) return noIdentificado();
    cerrarAvanzadas();

    if (fechasInvalidas(params)) return fechasInvalidas(params);
    return ok({ solicitudes: filtrar(A.solicitudes.filter((s) => s.recibe.codusu === yo()), params).map(resumen) });
}

/** GET /v1/ajuste/solicitud?id= */
function solicitud(params) {
    params = params || {};
    if (esVendedor()) return sinPermiso();
    if (!S.yaRegistrado) return noIdentificado();
    cerrarAvanzadas();

    const s = delResponsable(params.id);
    if (!s) return error(404, "solicitud desconocida", "esa solicitud no existe o no te fue enviada");

    const doc = documentoDe(s);
    const t = totalesDe(doc);
    const pendiente = s.estado === "PENDIENTE";

    return ok({
        id: s.id, tipo: s.tipo, ndocu: s.ndocu, estado: s.estado,
        mensaje: s.mensaje, observacion: s.observacion, fecreg: s.fecreg, vence: s.vence,
        envia: s.envia,
        puedoAjustar: pendiente && doc.abierto,
        cantidadAjustable: s.tipo === "COT",
        documento: { tipo: s.tipo === "COT" ? "COTIZACION" : "PEDIDO", ndocu: s.ndocu, fecha: doc.fecha,
                     cliente: doc.cliente, moneda: doc.moneda, tcam: doc.tcam,
                     total: t.tota, totalConIgv: t.totn, abierto: doc.abierto },
        promociones: doc.promociones,
        otrasLineas: doc.lineas.length - s.items.length,
        lineas: s.items.map((item) => {
            const l = doc.lineas.find((x) => x.item === item);
            const p = PRODUCTOS[l.codi];
            const costo = costoEn(doc, l.codi);
            return {
                item: l.item, codi: l.codi, codf: p.codf, descripcion: p.descripcion, marca: marcaPlana(l.codmar),
                enviado: s.enviado[item],
                /* `precio` es el de lista; `precioNeto`, lo que paga hoy el cliente por unidad (hasta 4 decimales). */
                actual: { cantidad: l.cantidad, precio: l.precio, dsct: l.dsct, total: importeDe(l),
                          precioNeto: redondear4(l.precio * (1 - l.dsct / 100)) },
                costo: costo, precioMinimo: precioMinimoDe(doc, l.codi), stock: p.stock, almacen: p.almacen,
                /* Con el precio actual SIN descuento, que es como queda al ajustar. */
                margen: margenDe(l.precio, costo),
                ajuste: s.ajuste[item] || null
            };
        })
    });
}

/** Lo que tienen en comun confirmar y rechazar: la solicitud tiene que estar pendiente y su documento abierto. */
function pendienteDe(cuerpo) {
    if (esVendedor()) return { error: sinPermiso() };
    if (!S.yaRegistrado) return { error: noIdentificado() };

    const s = delResponsable(cuerpo && cuerpo.id);
    if (!s) return { error: error(404, "solicitud desconocida", "esa solicitud no existe o no te fue enviada") };
    if (s.estado !== "PENDIENTE") {
        return { error: error(409, "solicitud cerrada", "esa solicitud ya fue respondida, vencio o se cerro") };
    }

    const doc = documentoDe(s);
    if (!doc.abierto) {
        s.estado = "CERRADA";
        return { error: error(409, "documento no ajustable",
            "el documento ya avanzo (aprobado, facturado o anulado): la solicitud queda cerrada") };
    }
    return { s: s, doc: doc };
}

/** POST /v1/ajuste/confirmar */
function confirmar(cuerpo) {
    cuerpo = cuerpo || {};
    const p = pendienteDe(cuerpo);
    if (p.error) return p.error;

    const { s, doc } = p;
    const lineas = cuerpo.lineas;

    if (!Array.isArray(lineas) || !lineas.length) {
        return error(400, "ajuste vacio", "no hay lineas que ajustar: si no hay cambios, rechaza la solicitud", 2);
    }

    const vistos = [];
    for (const l of lineas) {
        const item = Number(l && l.item);
        if (s.items.indexOf(item) === -1 || vistos.indexOf(item) !== -1) {
            return error(400, "linea ajena", "una linea no es de esta solicitud, o viene repetida", 2);
        }
        vistos.push(item);
    }

    /* Se valida todo antes de tocar nada: o se aplica entero, o nada. */
    const nuevas = [];
    for (const l of lineas) {
        const linea = doc.lineas.find((x) => x.item === Number(l.item));
        /* Se redondea al centimo ANTES de validar: es el precio que queda en el documento y en `despues.precio`. */
        const precio = alCentimo(Number(l.precio));

        if (!hay(l.precio) || String(l.precio).trim() === "" || !isFinite(precio) || precio <= 0) {
            return error(400, "precio invalido", "el precio tiene que ser un numero mayor que 0", 2);
        }

        let cantidad = linea.cantidad;
        if (hay(l.cantidad)) {
            const c = Number(l.cantidad);
            if (!Number.isInteger(c) || c < 1) {
                return error(400, "cantidad invalida", "la cantidad tiene que ser un entero de 1 o mas", 2);
            }
            if (s.tipo === "PED" && c !== linea.cantidad) {
                return error(400, "cantidad no ajustable", "en un pedido solo se cambia el precio", 2);
            }
            cantidad = c;
        }

        const costo = costoEn(doc, linea.codi);
        const minimo = precioMinimoDe(doc, linea.codi);
        if (precio < minimo) {
            return error(409, "precio bajo costo", "el precio no puede ser menor que el costo (" + minimo + ")");
        }

        nuevas.push({ linea: linea, precio: precio, cantidad: cantidad, costo: costo });
    }

    const respuesta = nuevas.map((n) => {
        const antes = { cantidad: n.linea.cantidad, precio: n.linea.precio, dsct: n.linea.dsct };
        const despues = { cantidad: n.cantidad, precio: n.precio, dsct: 0, costo: n.costo };

        n.linea.cantidad = n.cantidad;
        n.linea.precio = n.precio;
        n.linea.dsct = 0;                       // el precio ajustado ya es lo que paga el cliente
        s.ajuste[n.linea.item] = despues;

        return { item: n.linea.item, codi: n.linea.codi, antes: antes, despues: despues };
    });

    /* Se quitan TODAS las promociones del documento, de todas las marcas. */
    const promocionesQuitadas = doc.promociones;
    doc.promociones = 0;
    doc.promoMonto = 0;

    s.estado = "CONFIRMADA";
    s.observacion = cuerpo.observacion ? String(cuerpo.observacion).trim() || null : null;
    s.fecrespuesta = ahora;

    return ok({ id: s.id, estado: "CONFIRMADA", ndocu: s.ndocu, tipo: s.tipo, lineas: respuesta,
                promocionesQuitadas: promocionesQuitadas, totales: totalesDe(doc) });
}

/** POST /v1/ajuste/rechazar */
function rechazar(cuerpo) {
    cuerpo = cuerpo || {};
    const p = pendienteDe(cuerpo);
    if (p.error) return p.error;

    const observacion = String(cuerpo.observacion || "").trim();
    if (!observacion) {
        return error(400, "observacion requerida", "di por que la rechazas: el vendedor tiene que saberlo", 2);
    }

    const { s } = p;
    s.estado = "RECHAZADA";
    s.observacion = observacion;
    s.fecrespuesta = ahora;

    return ok({ id: s.id, estado: "RECHAZADA", ndocu: s.ndocu, tipo: s.tipo });
}

module.exports = { previa, enviar, enviadas, listaCotizaciones, listaPedidos, recibidas, solicitud, confirmar, rechazar, reiniciar,
                   estado: A, PRODUCTOS, responsableDe, costoEn, VENDEDOR };
