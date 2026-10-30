/**
 * dev/simulador-promovigentes.js — Simulacro de las promociones vigentes del grupo 20 (docs/promovigentes-grupo20.md).
 *
 *   GET /promocion/vigentes            la lista: lo que esta en promocion hoy, las que vencen antes primero
 *   GET /promocion/vigentes/15221      el detalle de una, con sus productos
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-promovigentes.js, para que lo que se ve en el navegador y lo que prueba la suite
 * salga del mismo sitio.
 *
 * Reproduce lo que el documento dice de bdnava08: 20 vigentes, la primera vence el 2026-10-31, la 15221 es solo para algunos clientes,
 * la 14106 es de regalo con 6 productos (2 agotados y 4 disponibles), y las cinco encendidas que ya vencieron (14898, 15124, 15217,
 * 15218 y 15227) NO salen. Ademas hay tres que el documento menciona pero no nombra: una apagada, una que aun no empieza y una sin
 * productos, para comprobar que tampoco salen.
 *
 * Solo grupo 20 (cartera y cobertura): el grupo 25 y el 34 reciben `403 sin permiso`. No hay montos en ninguna parte: ni el porcentaje
 * del descuento ni cuanto se regala. El stock es `DISPONIBLE` o `AGOTADO`, nunca el numero; el detalle ademas dice en que almacenes hay
 * (`almacenes`, respuesta del backend del 29/10: ver docs/cierre-promovigentes-quienvender.md).
 */
"use strict";

const marcas = require("./simulador-marcas");

const S = marcas.estado;

const HOY = "2026-10-29";

const ok = (data) => ({ status: 200, cuerpo: { status: "ok", codigo: 0, data: data } });
const error = (status, nombre, msg, codigo) => ({ status: status, cuerpo: { status: nombre, codigo: codigo || 3, msg: msg } });
const esGrupo20 = () => S.rol === "COBERTURA" || S.rol === "CARTERA";
const sinPermiso = () => error(403, "sin permiso", "esta ruta es del grupo 20");

/* --------------------------------------------------------------- los productos
 * De cada grupo de productos salen la marca y la familia: llegan de los PRODUCTOS, no del nombre de la promocion. La marca va tal
 * cual esta en el sistema (`HEWLETT PACKARD`, `HP-IMPRESORAS`, `HP-MONITORES`). El part number puede venir `""`.
 */
const POOL = {
    HP_BOTELLAS: { marca: "HEWLETT PACKARD", familia: "SUMINISTROS", items: [
        ["TINTA HP 1VV22AL BOTTLE (GT53)  BLACK 4000 PAG", "1VV22AL"], ["TINTA HP 1VV21AL BOTTLE (GT52)  CYAN 8000 PAG", "1VV21AL"],
        ["TINTA HP 1VV23AL BOTTLE (GT52)  MAGENTA 8000 PAG", "1VV23AL"], ["TINTA HP 1VV24AL BOTTLE (GT52)  YELLOW 8000 PAG", "1VV24AL"]] },
    HP_IMPRESORAS: { marca: "HP-IMPRESORAS", familia: "IMPRESORAS", items: [
        ["IMPRESORA HP SMART TANK 580 MULTIFUNCIONAL WIFI", "1F3Y2A"], ["IMPRESORA HP LASERJET PRO M404DN", "W1A53A"],
        ["IMPRESORA HP NEVERSTOP LASER 1020W", "5HG80A"], ["IMPRESORA HP OFFICEJET PRO 9010E", "257G4A"]] },
    HP_MONITORES: { marca: "HP-MONITORES", familia: "MONITORES", items: [
        ["MONITOR HP M24F 23.8 IPS FHD", "2D9K0AA"], ["MONITOR HP P24 G5 23.8 FHD", "64X66AA"], ["MONITOR HP M27F 27 IPS FHD", "2H0N1AA"]] },
    TCL: { marca: "TCL", familia: "MONITORES", items: [
        ["MONITOR TCL 24 FHD 75HZ 24E1H", "24E1H"], ["MONITOR TCL 27 FHD 100HZ 27E2H", "27E2H"], ["MONITOR TCL 32 CURVO 32R1C", "32R1C"]] },
    EPSON: { marca: "EPSON", familia: "SUMINISTROS", items: [
        ["BOTELLA TINTA EPSON T544120-AL NEGRO PARA L3110", "T544120-AL"], ["BOTELLA TINTA EPSON T544220-AL CYAN PARA L3110", "T544220-AL"],
        ["BOTELLA TINTA EPSON T544320-AL MAGENTA PARA L3110", "T544320-AL"], ["BOTELLA TINTA EPSON T544420-AL AMARILLO PARA L3110", "T544420-AL"],
        ["BOTELLA TINTA EPSON T504 NEGRO PARA L4150", "T504120-AL"]] },
    OMEGA: { marca: "OMEGA", familia: "ESTABILIZADORES Y SUPRESORES", items: [
        ["SUPRESOR DE PICOS OMEGA 6 TOMAS 1.8M", "OSP-6T"], ["SUPRESOR DE PICOS OMEGA 8 TOMAS USB", "OSP-8TU"], ["SUPRESOR DE PICOS OMEGA 4 TOMAS", "OSP-4T"]] },
    ANTEC: { marca: "ANTEC", familia: "PARTES Y PIEZAS DE COMPUTADORA", items: [
        ["PSU ANTEC CSK DC GB 550W 80+ BRONZE UK", "0-761345-20118-6"], ["PSU ANTEC CSK 650W 80+ BRONZE", "0-761345-20104-9"],
        ["CASE ANTEC NX200 ATX MID TOWER", "0-761345-81020-1"], ["CASE ANTEC NX410 ARGB MID TOWER", ""],
        ["COOLER ANTEC A30 PRO AIRE", "0-761345-10030-4"], ["VENTILADOR ANTEC PRIZM 120 ARGB X3", "0-761345-10060-1"]] },
    KINGSTON: { marca: "KINGSTON", familia: "MEMORIAS", items: [
        ["MEMORIA KINGSTON FURY BEAST 16GB DDR4 3200", "KF432C16BB/16"], ["MEMORIA KINGSTON VALUERAM 8GB DDR4 3200", "KVR32N22S6/8"],
        ["SSD KINGSTON NV2 1TB M.2 NVME", "SNV2S/1000G"], ["SSD KINGSTON A400 480GB SATA", "SA400S37/480G"]] },
    LOGITECH: { marca: "LOGITECH", familia: "PERIFERICOS", items: [
        ["TECLADO LOGITECH K120 USB ESPAÑOL", "920-004422"], ["MOUSE LOGITECH M170 INALAMBRICO", "910-004940"],
        ["COMBO LOGITECH MK270 INALAMBRICO", "920-004430"], ["MOUSE LOGITECH B100 USB", "910-003357"], ["AUDIFONO LOGITECH H111 ESTEREO", "981-000612"]] },
    ASUS: { marca: "ASUS", familia: "PARTES Y PIEZAS DE COMPUTADORA", items: [
        ["MOTHERBOARD INTEL ASUS PRIME H610M-F D4 R2.0", "PRIME H610M-F D4 R2.0"], ["MOTHERBOARD AMD ASUS PRIME A520M-K", "PRIME A520M-K"],
        ["MOTHERBOARD INTEL ASUS PRIME B760M-A D4", "PRIME B760M-A D4"]] },
    BROTHER: { marca: "BROTHER", familia: "SUMINISTROS", items: [
        ["TONER BROTHER TN-1060 NEGRO", "TN1060"], ["TONER BROTHER TN-660 NEGRO ALTO RENDIMIENTO", "TN660"], ["TAMBOR BROTHER DR-1060", "DR1060"]] },
    CANON: { marca: "CANON", familia: "IMPRESORAS", items: [
        ["IMPRESORA CANON PIXMA G3110 MULTIFUNCIONAL", "2315C004AA"], ["IMPRESORA CANON PIXMA G4110", "2316C004AA"], ["IMPRESORA CANON PIXMA G2110", "2313C004AA"]] }
};

/* --------------------------------------------------------------- las promociones
 * [idprom, nombre, descripcion, tipo, desde, hasta, soloAlgunosClientes, grupo de productos, cuantos, indices de los agotados].
 * Los nombres del ERP a veces no dicen nada: la descripcion es la que explica.
 */
const VIGENTES = [
    ["15221", "HP BOTELLAS Q42026 DSCTO (CDK)", "Por la compra de 100 botellas GT52 y GT53, llevas un descuento especial.", "DESCUENTO", "2026-10-01", "2026-10-31", true, "HP_BOTELLAS", 4, []],
    ["15231", "TCL PROMO MNT 15231 OCT26", "Descuento por la compra de monitores TCL de 24, 27 y 32 pulgadas.", "DESCUENTO", "2026-10-05", "2026-10-31", false, "TCL", 3, []],
    ["15190", "EPSON TINTAS OCT26 LLEVA 5 PAGA 4", "Lleva 5 botellas de tinta EPSON de la misma serie y la quinta va de regalo.", "REGALO", "2026-10-10", "2026-11-05", false, "EPSON", 5, [4]],
    ["14218", "ALMAC. 14218 CDK 5+1 OMEGA SUPRESOR DF", "Por la compra de 5 supresores OMEGA, el sexto va de regalo.", "REGALO", "2026-09-20", "2026-11-15", false, "OMEGA", 3, []],
    ["15204", "BROTHER TONER NOV26", "Descuento en toners y tambores BROTHER por volumen.", "DESCUENTO", "2026-10-15", "2026-11-15", false, "BROTHER", 3, []],
    ["14106", "ALMAC. 14106 CDK PSU ANTEC + CABLE", "Por la compra de una fuente o un case ANTEC, te regalamos un cable de poder.", "REGALO", "2026-10-01", "2026-11-30", false, "ANTEC", 6, [1, 4]],
    ["15242", "HP IMPRESORAS NOV26 DSCTO", "Descuento en impresoras HP seleccionadas.", "DESCUENTO", "2026-10-20", "2026-11-30", false, "HP_IMPRESORAS", 4, [2]],
    ["15244", "HP MONITORES NOV26 DSCTO", "Descuento en monitores HP de 24 y 27 pulgadas.", "DESCUENTO", "2026-10-20", "2026-11-30", false, "HP_MONITORES", 3, []],
    ["15250", "KINGSTON MEMORIAS BLACK FRIDAY", "Descuento en memorias y discos de estado sólido KINGSTON.", "DESCUENTO", "2026-10-20", "2026-11-30", false, "KINGSTON", 4, []],
    ["15255", "CANON PIXMA G-SERIES CDK", "Descuento en impresoras multifuncionales CANON de tanque de tinta.", "DESCUENTO", "2026-10-12", "2026-11-30", false, "CANON", 3, []],
    ["15251", "LOGITECH PERIFERICOS Q4", "Descuento por la compra de teclados, mouse y combos LOGITECH.", "DESCUENTO", "2026-10-01", "2026-12-15", false, "LOGITECH", 5, [3]],
    ["15260", "ASUS PLACAS NAVIDAD 26", "Descuento en placas madre ASUS PRIME.", "DESCUENTO", "2026-10-22", "2026-12-24", false, "ASUS", 3, []],
    ["15262", "EPSON NAVIDAD L-SERIES", "Con la compra de botellas EPSON, te llevas un descuento adicional.", "DESCUENTO", "2026-10-27", "2026-12-24", false, "EPSON", 4, []],
    ["15266", "OMEGA SUPRESORES NAVIDAD", "Descuento en supresores de picos OMEGA.", "DESCUENTO", "2026-10-25", "2026-12-24", false, "OMEGA", 2, []],
    ["15270", "HP BOTELLAS FIN DE AÑO", "Descuento por volumen en botellas de tinta HP GT52 y GT53 hasta fin de año.", "DESCUENTO", "2026-10-26", "2027-01-01", false, "HP_BOTELLAS", 4, []],
    ["15271", "KINGSTON SSD FIN DE AÑO", "Descuento en discos de estado sólido KINGSTON hasta fin de año.", "DESCUENTO", "2026-10-26", "2027-01-01", false, "KINGSTON", 2, []],
    ["15272", "ANTEC CASES FIN DE AÑO", "Por la compra de dos cases ANTEC, el tercero va de regalo.", "REGALO", "2026-10-26", "2027-01-01", false, "ANTEC", 2, []],
    ["15273", "LOGITECH COMBOS FIN DE AÑO", "Por la compra de combos LOGITECH, un mouse de regalo.", "REGALO", "2026-10-26", "2027-01-01", false, "LOGITECH", 3, []],
    ["15274", "TCL MONITORES FIN DE AÑO", "Descuento en monitores TCL hasta fin de año.", "DESCUENTO", "2026-10-26", "2027-01-01", false, "TCL", 2, []],
    ["15275", "BROTHER TAMBORES FIN DE AÑO", "Descuento en tambores y toners BROTHER hasta fin de año.", "DESCUENTO", "2026-10-26", "2027-01-01", false, "BROTHER", 2, []]
];

/* Encendidas que ya vencieron: NO salen de la lista, aunque la cotizacion si puede ofrecerlas (seccion 4 del documento). Y tres que el
   documento menciona sin nombrar: una apagada, una que aun no empieza y una sin ningun producto vigente. */
const NO_VIGENTES = [
    ["14898", "ALMAC. 14898 CDK SSD KINGSTON", "Promoción vencida.", "DESCUENTO", "2026-08-01", "2026-10-15", false, "KINGSTON", 2, []],
    ["15124", "EPSON TINTAS SEP26", "Promoción vencida.", "DESCUENTO", "2026-09-01", "2026-09-30", false, "EPSON", 2, []],
    ["15217", "HP MONITORES OCT26 A", "Promoción vencida.", "DESCUENTO", "2026-10-01", "2026-10-20", false, "HP_MONITORES", 2, []],
    ["15218", "HP MONITORES OCT26 B", "Promoción vencida.", "DESCUENTO", "2026-10-01", "2026-10-20", false, "HP_MONITORES", 2, []],
    ["15227", "LOGITECH OCT26", "Promoción que venció ayer.", "DESCUENTO", "2026-10-10", "2026-10-28", false, "LOGITECH", 2, []],
    ["15300", "ASUS PRUEBA APAGADA", "Está apagada.", "DESCUENTO", "2026-10-01", "2026-12-31", false, "ASUS", 2, [], { apagada: true }],
    ["15301", "CANON PROXIMA NOV26", "Empieza en noviembre.", "DESCUENTO", "2026-11-02", "2026-12-31", false, "CANON", 2, []],
    ["15302", "ANTEC SIN PRODUCTOS", "Vigente, pero sin ningún producto vigente.", "REGALO", "2026-10-01", "2026-12-31", false, "ANTEC", 0, []]
];

const TODAS = VIGENTES.concat(NO_VIGENTES).map((x) => ({
    idprom: x[0], nombre: x[1], descripcion: x[2], tipo: x[3], desde: x[4], hasta: x[5], solo: x[6], grupo: x[7], cuantos: x[8], agotados: x[9],
    encendida: !(x[10] && x[10].apagada)
}));

/* --------------------------------------------------------------- los almacenes
 * Solo el DETALLE los trae (la lista no): donde hay stock hoy, sin cantidades, con los rotulos del reporte de stock del grupo 25 y
 * SIEMPRE en este orden: PRINCIPAL, M&M, PIURA, CHORRILLOS. Un producto AGOTADO trae []. Casi todo esta en el principal; unos pocos
 * productos muestran las variantes. La 15221 es el caso del documento: el `1VV22AL` esta DISPONIBLE pero solo en Piura.
 */
const ALMACENES_DE = {
    "1VV22AL": ["PIURA"],
    "0-761345-20118-6": ["PRINCIPAL", "M&M"],
    "T544120-AL": ["PRINCIPAL", "M&M", "PIURA"],
    "KF432C16BB/16": ["M&M"],
    "2D9K0AA": ["CHORRILLOS"],
    "TN660": ["PIURA", "CHORRILLOS"]
};
const almacenesDe = (partNumber, disponible) => disponible ? (ALMACENES_DE[partNumber] || ["PRINCIPAL"]).slice() : [];

/* --------------------------------------------------------------- las cuentas */
const dias = (desde, hasta) => Math.round((Date.parse(hasta + "T00:00:00Z") - Date.parse(desde + "T00:00:00Z")) / 86400000);

/** Los productos de una promocion, ya con su marca, su familia, si hay stock y en que almacenes. Ordenados por marca y descripcion. */
function productosDe(p) {
    const g = POOL[p.grupo];
    return g.items.slice(0, p.cuantos).map((it, i) => {
        const disponible = p.agotados.indexOf(i) === -1;
        return {
            descripcion: it[0], partNumber: it[1], marca: g.marca, familia: g.familia,
            disponibilidad: disponible ? "DISPONIBLE" : "AGOTADO", almacenes: almacenesDe(it[1], disponible)
        };
    }).sort((a, b) => a.marca.localeCompare(b.marca) || a.descripcion.localeCompare(b.descripcion));
}

/** Marca o familia de la promocion: una sola, o varias juntas con « / » (la de mas productos primero). */
function juntar(productos, campo) {
    const cuenta = {};
    productos.forEach((x) => { cuenta[x[campo]] = (cuenta[x[campo]] || 0) + 1; });
    return Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a] || a.localeCompare(b)).join(" / ");
}

/** Vigente: encendida, hoy entre su inicio y su fin (por DIA: se ve todo su ultimo dia) y con algun producto. */
const vigente = (p) => p.encendida && p.desde <= HOY && HOY <= p.hasta && p.cuantos > 0;

function fila(p) {
    const productos = productosDe(p);
    return {
        idprom: p.idprom, nombre: p.nombre, descripcion: p.descripcion, tipo: p.tipo,
        venceEl: p.hasta, diasRestantes: dias(HOY, p.hasta), soloAlgunosClientes: p.solo,
        marca: juntar(productos, "marca"), familia: juntar(productos, "familia"),
        productos: productos.length, disponibles: productos.filter((x) => x.disponibilidad === "DISPONIBLE").length
    };
}

/* --------------------------------------------------------------- las rutas */

/** GET /promocion/vigentes: las que vencen antes primero; a igual vencimiento, por familia, marca y nombre. */
function lista() {
    if (!esGrupo20()) return sinPermiso();

    const promociones = TODAS.filter(vigente).map(fila).sort((a, b) =>
        a.venceEl.localeCompare(b.venceEl) || a.familia.localeCompare(b.familia) || a.marca.localeCompare(b.marca) || a.nombre.localeCompare(b.nombre));

    return ok({ fecha: HOY, total: promociones.length, promociones: promociones });
}

/** GET /promocion/vigentes/:idprom. Un id que no es numero, o que no esta vigente, es `404 promocion no vigente`. */
function detalle(id) {
    if (!esGrupo20()) return sinPermiso();

    const p = /^\d+$/.test(String(id)) ? TODAS.filter((x) => x.idprom === String(id) && vigente(x))[0] : null;
    if (!p) return error(404, "promocion no vigente", "la promocion no existe, esta apagada, ya vencio, aun no empieza o no tiene productos vigentes");

    return ok({ fecha: HOY, promocion: fila(p), productos: productosDe(p) });
}

module.exports = { lista, detalle, HOY, TODAS, vigente };
