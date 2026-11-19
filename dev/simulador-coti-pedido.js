/**
 * dev/simulador-coti-pedido.js — Simulacro de «Pasar una cotizacion a pedido» (docs/coti-a-pedido.md, 18/11/2026).
 *
 *   POST /cotizacion/pedido/opciones        { ndocu }                  ¿se puede?, direcciones, tipos de entrega
 *   POST /cotizacion/pedido/transportista   { sugerencia }             activos, de cinco en cinco, con `total`
 *   POST /cotizacion/pedido                 { ndocu, tipent, codtra, dirent, consig, obse }
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-coti-pedido.js. Tambien da las filas de estas cotizaciones para
 * /lista/cotisxdia (`filas`), asi lo que se convierte pasa a decir `pedido` en la lista, como en el backend.
 *
 * Reproduce lo que importa del documento:
 *
 *   · solo grupos 20 y 25: el 34 (y cualquier otro) recibe `403 sin permiso`
 *   · el numero va con serie: uno suelto es `400 documento ambiguo`; uno que no es del vendedor, `403 coti desconocida`
 *   · `convertible` y `motivo` con las mismas claves que el error al convertir; `documento_generado` si ya genero uno
 *   · ventanilla (1) y Lima (3) llevan T0001 fijo y se ignora `codtra`; provincia (4) lo exige activo
 *   · `dirent` tiene que ser EXACTAMENTE una de las direcciones (C00904 tiene 25, con tildes y una raya larga)
 *   · el consignatario se corta a 60; la observacion se graba como `ATC.<consig> [transporte. <nombre>] obse.<texto>`,
 *     sin `ATC.` si no hay consignatario (19/11)
 *   · `opciones` trae `antiguedad` (sin domingos) y `plazo` (5)
 *   · convertir dos veces la misma: la segunda da `409 coti ya convertida`
 *   · plazo (19/11): con mas de 5 dias sin contar el domingo, `coti fuera de plazo` (098-00000060)
 *   · todo o nada: un 500 `pedido no creado` deja la cotizacion como estaba (098-00000058 falla la primera vez)
 *
 * Los textos de `msg` son inventados: el documento no los da. Las pantallas no deben depender de ellos.
 */
"use strict";

const marcas = require("./simulador-marcas");

const S = marcas.estado;

const ok = (cuerpo) => ({ status: 200, cuerpo: Object.assign({ status: "ok", codigo: 0 }, cuerpo) });
const error = (status, nombre, msg) => ({ status: status, cuerpo: { status: nombre, codigo: 3, msg: msg } });

/* Grupos 20 (cobertura, cartera) y 25 (especialista, jefatura). */
const CON_PERMISO = ["COBERTURA", "CARTERA", "ESPECIALISTA", "JEFATURA"];

const FIJO = "T0001";

/* [codigo, nombre, activo] */
const TRANSPORTISTAS = [
    ["T0001", "COMPUDISKETT S.R.L.", true],
    ["T0106", "TRANSPORTES \"SHALOM EXPRESS S.A.C.\"", true],
    ["T0112", "MARVISUR EXPRESS E.I.R.L.", true],
    ["T0120", "OLVA COURIER S.A.C.", true],
    ["T0131", "TURISMO CIVA S.A.C.", true],
    ["T0140", "TRANSPORTES CRUZ DEL SUR S.A.C.", true],
    ["T0152", "EMPRESA DE TRANSPORTES FLORES HERMANOS S.R.L.", true],
    ["T0163", "TRANSPORTES LINEA S.A.", true],
    ["T0170", "EXPRESO MOLINA LIDER S.A.C.", true],
    ["T0185", "TRANSPORTES GOMEZ EXPRESS S.A.C.", true],
    ["T0099", "TRANSPORTES ANTIGUOS DEL SUR S.A.", false]
];

const TIPOS_ENTREGA = [
    { tipent: 1, nombre: "Desp.Ventanilla", transportista: FIJO },
    { tipent: 3, nombre: "Desp. Local (Lima)", transportista: FIJO },
    { tipent: 4, nombre: "Desp. Provincia", transportista: null }
];

/* Las tres primeras son las del documento, tal cual (con la tilde de REPÚBLICA y la raya larga de TRUJILLO): el texto
   tiene que volver identico. Las demas, inventadas, para llegar a las 25 de C00904. */
const DIRECCIONES_C00904 = [
    "AV. REPÚBLICA DE CHILE NRO.504 JESUS MARIA (LIMA-PERU)",
    "AV  LA MARINA 225 URB SAN VICENTE –LA LIBERTAD – TRUJILLO",
    "CAL.GARCIA DE CARBAJAL 600 URB. IV CENTENARIO-AREQUIPA-AREQUIPA",
    "AV. JAVIER PRADO ESTE 4200 SANTIAGO DE SURCO (LIMA)",
    "JR. CAMANÁ 1050 CERCADO DE LIMA",
    "AV. ARGENTINA 3093 CALLAO",
    "AV. BOLOGNESI 455 PIURA-PIURA",
    "CAL. SAN MARTÍN 312 CHICLAYO-LAMBAYEQUE",
    "AV. EJÉRCITO 710 YANAHUARA-AREQUIPA",
    "JR. PUNO 210 HUANCAYO-JUNÍN",
    "AV. LA CULTURA 1820 WANCHAQ-CUSCO",
    "CAL. LIMA 455 TACNA-TACNA",
    "AV. GRAU 120 ICA-ICA",
    "JR. AMAZONAS 870 IQUITOS-LORETO",
    "AV. ESPAÑA 1430 TRUJILLO-LA LIBERTAD",
    "CAL. MERCADERES 233 AREQUIPA-AREQUIPA",
    "AV. TACNA 560 CERCADO DE LIMA",
    "AV. PROCERES DE LA INDEPENDENCIA 1600 SAN JUAN DE LURIGANCHO (LIMA)",
    "AV. CIRCUNVALACION 1890 LA VICTORIA (LIMA)",
    "JR. HUALLAGA 345 HUÁNUCO-HUÁNUCO",
    "AV. SÁNCHEZ CERRO 1200 PIURA-PIURA",
    "CAL. AYACUCHO 98 CAJAMARCA-CAJAMARCA",
    "AV. PARDO 640 CHIMBOTE-ANCASH",
    "AV. LOS INCAS 302 JULIACA-PUNO",
    "AV. UNIVERSITARIA 9050 COMAS (LIMA)"
];

/**
 * Las cotizaciones que conoce el simulacro. `dias` es su antiguedad SIN CONTAR EL DOMINGO (0 = hoy): da la fecha
 * de la lista y, si pasa de PLAZO, `coti fuera de plazo`. `aprobada`, `anulada`, `enAjuste` y `convertida` deciden
 * `opciones`; `falla` es cuantas veces mas falla la conversion con 500.
 */
const PLAZO = 5;

function semilla() {
    return {
        "098-00000055": {
            cliente: { codcli: "C00904", nomcli: "COMPUDISKETT S.R.L." }, atencion: "AREA SISTEMAS",
            direcciones: DIRECCIONES_C00904, aprobada: true, dias: 2, hora: "10:14:02",
            lineas: 3, moneda: "D", totales: { tota: 1144.07, toti: 205.93, totn: 1350.00 }
        },
        /* La del ejemplo de la seccion 6: se convierte en provincia con SHALOM. */
        "098-00000056": {
            cliente: { codcli: "C00904", nomcli: "COMPUDISKETT S.R.L." }, atencion: "MARIA LOPEZ",
            direcciones: DIRECCIONES_C00904, aprobada: true, dias: 1, hora: "16:40:11",
            lineas: 2, moneda: "D", totales: { tota: 23.99, toti: 4.32, totn: 28.31 }
        },
        /* Aprobada con UNA sola direccion: no hay nada que elegir. */
        "009-00969917": {
            cliente: { codcli: "C01234", nomcli: "APROBADA S.A.C." }, atencion: "",
            direcciones: ["AV. LOS FRUTALES 220 ATE (LIMA)"], aprobada: true, dias: 0, hora: "10:05:11",
            lineas: 1, moneda: "D", totales: { tota: 381.36, toti: 68.64, totn: 450.00 }
        },
        /* En soles, y la primera conversion falla con 500: para ver que se puede reintentar. */
        "098-00000058": {
            cliente: { codcli: "C02210", nomcli: "DISTRIBUIDORA TECNOLOGICA ANDINA S.A.C." }, atencion: "JORGE RAMOS",
            direcciones: ["AV. INDUSTRIAL 455 INDEPENDENCIA (LIMA)", "AV. EL SOL 120 WANCHAQ-CUSCO"],
            aprobada: true, dias: 3, hora: "09:22:47", falla: 1,
            lineas: 4, moneda: "S", totales: { tota: 2726.27, toti: 490.73, totn: 3217.00 }
        },
        /* Aprobada pero sin direcciones registradas. */
        "098-00000059": {
            cliente: { codcli: "C03301", nomcli: "SIN DIRECCION E.I.R.L." }, atencion: "",
            direcciones: [], aprobada: true, dias: 5, hora: "12:00:00",
            lineas: 1, moneda: "D", totales: { tota: 100.00, toti: 18.00, totn: 118.00 }
        },
        /* Aprobada, pero el grupo 25 la esta ajustando. */
        "098-00000057": {
            cliente: { codcli: "C00904", nomcli: "COMPUDISKETT S.R.L." }, atencion: "AREA SISTEMAS",
            direcciones: DIRECCIONES_C00904, aprobada: true, enAjuste: true, dias: 4, hora: "11:31:09",
            lineas: 2, moneda: "D", totales: { tota: 500.00, toti: 90.00, totn: 590.00 }
        },
        /* Todavia sin aprobar: la lista la marca y `opciones` lo dice. */
        "009-00971087": {
            cliente: { codcli: "C00412", nomcli: "SERVICIOS INTERNET Y C.O. S.A.C." }, atencion: "",
            direcciones: ["AV. AREQUIPA 2450 LINCE (LIMA)"], aprobada: false, dias: 0, hora: "13:57:38",
            lineas: 3, moneda: "D", totales: { tota: 1394.08, toti: 250.93, totn: 1645.01 }
        },
        /* Aprobada, pero con 6 dias sin contar el domingo: un dia mas que el plazo (contrato del 19/11). No entra en
           la lista de «6 dias»; por numero, `coti fuera de plazo`. */
        "098-00000060": {
            cliente: { codcli: "C00904", nomcli: "COMPUDISKETT S.R.L." }, atencion: "AREA SISTEMAS",
            direcciones: DIRECCIONES_C00904, aprobada: true, dias: 6, hora: "17:02:44",
            lineas: 1, moneda: "D", totales: { tota: 80.00, toti: 14.40, totn: 94.40 }
        },
        /* Ya convertida: no sale en la lista de pasar a pedido; por numero, el motivo y el pedido que genero. */
        "098-00000050": {
            cliente: { codcli: "C00904", nomcli: "COMPUDISKETT S.R.L." }, atencion: "",
            direcciones: DIRECCIONES_C00904, aprobada: true, dias: 6, hora: "15:15:15",
            convertida: { cdocu: "32", ndocu: "098-00000001" },
            lineas: 1, moneda: "D", totales: { tota: 50.00, toti: 9.00, totn: 59.00 }
        },
        /* Facturada: `documento_generado` con la serie, como lo guarda el ERP (respuesta del 19/11). */
        "009-00969000": {
            cliente: { codcli: "C00412", nomcli: "SERVICIOS INTERNET Y C.O. S.A.C." }, atencion: "",
            direcciones: ["AV. AREQUIPA 2450 LINCE (LIMA)"], aprobada: true, dias: 2, hora: "08:30:00",
            convertida: { cdocu: "01", ndocu: "F009-0648731" },
            lineas: 1, moneda: "S", totales: { tota: 200.00, toti: 36.00, totn: 236.00 }
        },
        /* Dada de baja: las listas no la traen; por numero, el motivo. */
        "009-00970100": {
            cliente: { codcli: "C00412", nomcli: "SERVICIOS INTERNET Y C.O. S.A.C." }, atencion: "",
            direcciones: [], aprobada: true, anulada: true, dias: 8, hora: "08:00:00",
            lineas: 1, moneda: "D", totales: { tota: 10.00, toti: 1.80, totn: 11.80 }
        }
    };
}

const estado = {
    cotis: semilla(),
    siguiente: 3,          // 098-00000001 y 002 ya los uso el backend en bdnava08
    forzar: null,          // { status, nombre, msg }: la proxima conversion responde esto (para las pruebas)
    llamadas: []
};

function reiniciar() {
    estado.cotis = semilla();
    estado.siguiente = 3;
    estado.forzar = null;
    estado.llamadas = [];
}

const conSerie = (n) => /^\d+-\d+$/.test(String(n || "").trim());
const sinPermiso = () => error(403, "sin permiso", "tu grupo no puede pasar cotizaciones a pedido");

/** La cotizacion del vendedor, o el error que corresponde. */
function buscar(ndocu) {
    if (!conSerie(ndocu)) return { error: error(400, "documento ambiguo", "el numero de cotizacion debe incluir su serie, por ejemplo 098-00000055") };
    const c = estado.cotis[String(ndocu).trim()];
    if (!c) return { error: error(403, "coti desconocida", "la cotizacion no existe o no pertenece a este vendedor") };
    return { coti: c, ndocu: String(ndocu).trim() };
}

function motivo(c) {
    if (c.convertida) return "coti ya convertida";
    if (c.anulada) return "coti ya anulada";
    /* Antes que «sin aprobar»: eso se arregla esperando; el plazo, no (lo que proponemos al backend). */
    if (c.dias > PLAZO) return "coti fuera de plazo";
    if (!c.aprobada) return "coti sin aprobar";
    if (c.enAjuste) return "documento en ajuste";
    return null;
}

const MSG_MOTIVO = {
    "coti ya convertida": "la cotizacion ya genero un pedido, factura o boleta",
    "coti ya anulada": "la cotizacion fue dada de baja",
    "coti fuera de plazo": "la cotizacion tiene mas de 5 dias sin contar el domingo",
    "coti sin aprobar": "la cotizacion todavia no esta aprobada",
    "documento en ajuste": "la cotizacion esta en ajuste de precio"
};

/* --------------------------------------------------------------- opciones */

function opciones(d) {
    estado.llamadas.push({ ruta: "opciones", cuerpo: d });
    if (CON_PERMISO.indexOf(S.rol) === -1) return sinPermiso();

    const b = buscar(d && d.ndocu);
    if (b.error) return b.error;
    const c = b.coti;
    const m = motivo(c);

    return ok({
        documento: b.ndocu,
        convertible: !m,
        motivo: m,
        antiguedad: c.dias,
        plazo: PLAZO,
        documento_generado: c.convertida ? Object.assign({}, c.convertida) : null,
        cliente: Object.assign({}, c.cliente),
        consignatario_sugerido: c.atencion || null,
        direcciones: c.direcciones.slice(),
        tipos_entrega: TIPOS_ENTREGA.map((t) => Object.assign({}, t))
    });
}

/* --------------------------------------------------------------- transportista */

function transportista(d) {
    estado.llamadas.push({ ruta: "transportista", cuerpo: d });
    if (CON_PERMISO.indexOf(S.rol) === -1) return sinPermiso();

    const aguja = String((d && d.sugerencia) || "").trim().toUpperCase();
    const hallados = TRANSPORTISTAS.filter((t) => t[2] && t[1].toUpperCase().indexOf(aguja) !== -1);

    const data = {};
    hallados.slice(0, 5).forEach((t, i) => { data[i] = { 0: t[0], 1: t[1] }; });

    /* Sin `status`: es la misma forma que la busqueda de factura. */
    return { status: 200, cuerpo: { total: hallados.length, data: data } };
}

/* --------------------------------------------------------------- convertir */

function convertir(d) {
    d = d || {};
    estado.llamadas.push({ ruta: "convertir", cuerpo: d });
    if (CON_PERMISO.indexOf(S.rol) === -1) return sinPermiso();

    const b = buscar(d.ndocu);
    if (b.error) return b.error;
    const c = b.coti;

    if (estado.forzar) {
        const f = estado.forzar;
        estado.forzar = null;
        return error(f.status, f.nombre, f.msg);
    }

    const m = motivo(c);
    if (m) return error(409, m, MSG_MOTIVO[m]);

    const tipent = Number(d.tipent);
    if ([1, 3, 4].indexOf(tipent) === -1 || String(d.tipent).trim() === "") {
        return error(400, "tipo entrega invalido", "el tipo de entrega debe ser 1, 3 o 4");
    }

    let trans;
    if (tipent === 4) {
        trans = TRANSPORTISTAS.find((t) => t[0] === String(d.codtra || "").trim() && t[2]);
        if (!trans) return error(400, "transportista invalido", "en provincia hay que elegir un transportista activo");
    } else {
        trans = TRANSPORTISTAS.find((t) => t[0] === FIJO);   // `codtra` se ignora
    }

    if (!d.dirent || c.direcciones.indexOf(d.dirent) === -1) {
        return error(400, "direccion invalida", "la direccion de entrega no es una de las registradas del cliente");
    }

    if (!c.lineas) return error(400, "cotizacion vacia", "la cotizacion no tiene lineas");

    if (c.falla) {
        c.falla--;
        return error(500, "pedido no creado", "no se pudo grabar el pedido; se revirtio todo");
    }

    const pedido = "098-" + String(estado.siguiente++).padStart(8, "0");
    c.convertida = { cdocu: "32", ndocu: pedido };

    const consig = String(d.consig || "").slice(0, 60);
    /* Sin consignatario no va la parte `ATC.` (respuesta del 19/11): `obse.<texto>`, o `obse.` sin texto. */
    const obse = [consig ? "ATC." + consig : null, tipent === 4 ? "transporte. " + trans[1] : null, "obse." + String(d.obse || "")]
        .filter((x) => x !== null).join(" ");

    return ok({
        pedido: pedido,
        cotizacion: b.ndocu,
        aprobado: false,
        lineas: c.lineas,
        moneda: c.moneda,
        totales: Object.assign({}, c.totales),
        despacho: { tipent: tipent, codtra: trans[0], transportista: trans[1], dirent: d.dirent, consig: consig, obse: obse }
    });
}

/* --------------------------------------------------------------- la lista */

/**
 * Las filas de /lista/cotisxdia de estas cotizaciones, con las posiciones de siempre:
 * 0 fecha · 1 ndocu · 2 cliente · 3 total CON IGV · 4 moneda · 5 registrado · 6 estado · 7 editable.
 * `{ dia }` o `{ desde, hasta }` (YYYY-MM-DD); sin nada, todas. Las anuladas no salen.
 */
function filas(d, hoy) {
    d = d || {};
    const base = hoy ? new Date(hoy + "T12:00:00") : new Date();
    /* En hora local, como CDK.formato.aISO: con toISOString, en Lima por la tarde «hoy» seria manana. */
    const iso = (x) => x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0");

    return Object.keys(estado.cotis)
        .map((ndocu) => ({ ndocu: ndocu, c: estado.cotis[ndocu] }))
        .filter((x) => !x.c.anulada)
        .map((x) => {
            /* `dias` hacia atras, saltando los domingos. */
            const fecha = new Date(base.getTime());
            for (let faltan = x.c.dias; faltan > 0;) {
                fecha.setDate(fecha.getDate() - 1);
                if (fecha.getDay() !== 0) faltan--;
            }
            const f = iso(fecha);
            return {
                iso: f,
                fila: {
                    0: f.replace(/-/g, "/"), 1: x.ndocu, 2: x.c.cliente.nomcli, 3: x.c.totales.totn, 4: x.c.moneda,
                    5: f + " " + x.c.hora,
                    6: !x.c.convertida ? "cotizado" : { "32": "pedido", "01": "facturado", "03": "boleta" }[x.c.convertida.cdocu],
                    7: !x.c.convertida && !x.c.aprobada ? 1 : 0
                }
            };
        })
        .filter((x) => d.dia ? x.iso === d.dia : d.desde && d.hasta ? x.iso >= d.desde && x.iso <= d.hasta : true)
        .sort((a, b) => (a.fila[5] < b.fila[5] ? 1 : a.fila[5] > b.fila[5] ? -1 : 0))
        .map((x) => x.fila);
}

module.exports = { estado, reiniciar, opciones, transportista, convertir, filas, TRANSPORTISTAS, DIRECCIONES_C00904 };
