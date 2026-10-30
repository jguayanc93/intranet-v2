/**
 * dev/simulador-quienvender.js — Simulacro de «¿A quien vender hoy?» del grupo 20 (docs/quienvender-grupo20.md).
 *
 *   GET /quienvender        sin parametros: el vendedor es el de la sesion
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-quienvender.js.
 *
 * Reproduce lo que importa del documento:
 *
 *   · son 3 por dia: los puestos 1 y 2 son REPONER y el 3 es LLAMAR; solo cuando no hay mas de esos entran los de respaldo
 *     (REACTIVAR, SIN_COMPRAS y, solo en cobertura, LIBRE)
 *   · se calculan LA PRIMERA VEZ que se abre el modulo en el dia, se graban, y **todo el dia reciben los mismos**
 *   · `valorUsd` quiere decir otra cosa en cada tipo, y `productos` trae otros campos (`cada`, `ultima`, `compras` solo en REPONER)
 *   · un vendedor sin clientes recibe `sugeridos: []` y un `aviso`, y **no se graba nada**
 *   · el grupo 25 y el 34 reciben `403 sin permiso`
 *
 * Los vendedores de abajo son inventados, salvo los codigos que el documento nombra (V0313 de cartera y V0278 de cobertura, con 2 REPONER
 * y 1 LLAMAR; V0360 sin historial, con 3 LIBRE; V0353 con clientes sin compras, con 3 SIN_COMPRAS). Los demas cubren los casos que el
 * documento enumera sin darles codigo. `usar(codven)` elige cual es el de la sesion.
 *
 * No hay telefono ni contacto, ni costo ni stock. Todo en dolares.
 */
"use strict";

const marcas = require("./simulador-marcas");

const S = marcas.estado;

const HOY = "2026-10-29";

const ok = (data) => ({ status: 200, cuerpo: { status: "ok", codigo: 0, data: data } });
const error = (status, nombre, msg, codigo) => ({ status: status, cuerpo: { status: nombre, codigo: codigo || 3, msg: msg } });

const MOTIVOS = {
    REPONER: "Productos que suele comprar y ya le tocan",
    LLAMAR: "Compro el mes pasado y este mes todavia no",
    REACTIVAR: "Hace 60 dias o mas que no compra",
    SIN_COMPRAS: "Cliente tuyo, sin compras en los ultimos 12 meses",
    LIBRE: "Cliente de la oficina o sin dueño que compro en los ultimos 12 meses"
};

/* --------------------------------------------------------------- las tarjetas, una por tipo */

/** [descripcion, partNumber, cantidad, cada, ultima, compras] -> lo que lleva un REPONER, con su ritmo. */
const productoDeReponer = (p) => ({ descripcion: p[0], partNumber: p[1], cantidad: p[2], cada: p[3], ultima: p[4], compras: p[5] });
/** [descripcion, partNumber, cantidad] -> lo que llevo, sin ritmo (LLAMAR y REACTIVAR). */
const productoSimple = (p) => ({ descripcion: p[0], partNumber: p[1], cantidad: p[2] });

const reponer = (codcli, cliente, valorUsd, ultimaCompra, productos) => ({
    tipo: "REPONER", motivo: MOTIVOS.REPONER, codcli: codcli, cliente: cliente, valorUsd: valorUsd, ultimaCompra: ultimaCompra,
    mesesConCompra: null, facturasMesPasado: null, productos: productos.map(productoDeReponer)
});

const llamar = (codcli, cliente, valorUsd, ultimaCompra, mesesConCompra, facturasMesPasado, productos) => ({
    tipo: "LLAMAR", motivo: MOTIVOS.LLAMAR, codcli: codcli, cliente: cliente, valorUsd: valorUsd, ultimaCompra: ultimaCompra,
    mesesConCompra: mesesConCompra, facturasMesPasado: facturasMesPasado, productos: productos.map(productoSimple)
});

const reactivar = (codcli, cliente, valorUsd, ultimaCompra, productos) => ({
    tipo: "REACTIVAR", motivo: MOTIVOS.REACTIVAR, codcli: codcli, cliente: cliente, valorUsd: valorUsd, ultimaCompra: ultimaCompra,
    mesesConCompra: null, facturasMesPasado: null, productos: productos.map(productoSimple)
});

const sinCompras = (codcli, cliente) => ({
    tipo: "SIN_COMPRAS", motivo: MOTIVOS.SIN_COMPRAS, codcli: codcli, cliente: cliente, valorUsd: null, ultimaCompra: null,
    mesesConCompra: null, facturasMesPasado: null, productos: []
});

const libre = (codcli, cliente, valorUsd) => ({
    tipo: "LIBRE", motivo: MOTIVOS.LIBRE, codcli: codcli, cliente: cliente, valorUsd: valorUsd, ultimaCompra: null,
    mesesConCompra: null, facturasMesPasado: null, productos: []
});

/* --------------------------------------------------------------- los vendedores */
const EPSON_NEGRO = "BOTELLA TINTA EPSON T544120-AL NEGRO PARA L3110";
const EPSON_CYAN = "BOTELLA TINTA EPSON T544220-AL CYAN PARA L3110";
const EPSON_MAGENTA = "BOTELLA TINTA EPSON T544320-AL MAGENTA PARA L3110";

const VENDEDORES = {
    /* Cartera, lo normal: 2 REPONER y 1 LLAMAR (el ejemplo del documento). */
    V0313: { tipo: "CARTERA", sugeridos: [
        reponer("C17450", "SIMAF E.I.R.L.", 2001.14, "2026-09-14", [
            [EPSON_NEGRO, "T544120-AL", 36, 10, "2026-09-14", 16], [EPSON_CYAN, "T544220-AL", 24, 12, "2026-09-14", 11], [EPSON_MAGENTA, "T544320-AL", 24, 12, "2026-09-02", 9]]),
        reponer("C14220", "DISTRIBUIDORA TECNOLOGICA ANDINA S.A.C.", 1340.8, "2026-09-22", [
            ["TECLADO LOGITECH K120 USB ESPAÑOL", "920-004422", 50, 21, "2026-09-22", 7], ["MOUSE LOGITECH M170 INALAMBRICO", "910-004940", 30, 21, "2026-09-22", 6]]),
        llamar("C16527", "SYSTEC CORP PERU S.A.C.", 16496.45, "2026-09-30", 6, 8, [
            ["MOTHERBOARD INTEL ASUS PRIME H610M-F D4 R2.0", "PRIME H610M-F D4 R2.0", 214], ["MEMORIA KINGSTON VALUERAM 8GB DDR4 3200", "KVR32N22S6/8", 180],
            ["SSD KINGSTON A400 480GB SATA", "SA400S37/480G", 96]])
    ] },

    /* Cobertura, lo normal. El tercero tiene un nombre larguisimo: tiene que caber. */
    V0278: { tipo: "COBERTURA", sugeridos: [
        reponer("C20118", "COMPUTEL PERU E.I.R.L.", 1860.5, "2026-09-18", [
            ["MONITOR TCL 24 FHD 75HZ 24E1H", "24E1H", 10, 28, "2026-09-18", 8], ["SUPRESOR DE PICOS OMEGA 6 TOMAS 1.8M", "OSP-6T", 40, 14, "2026-09-18", 12]]),
        reponer("C18873", "INVERSIONES QUISPE HUANCAYO S.R.L.", 920.3, "2026-09-25", [
            ["TONER BROTHER TN-1060 NEGRO", "TN1060", 12, 30, "2026-09-25", 5]]),
        llamar("C15402", "COMERCIALIZADORA E IMPORTADORA DE EQUIPOS Y SUMINISTROS INFORMATICOS DEL PERU S.A.C.", 8420.15, "2026-09-29", 5, 4, [
            ["IMPRESORA HP SMART TANK 580 MULTIFUNCIONAL WIFI", "1F3Y2A", 22], ["TINTA HP 1VV22AL BOTTLE (GT53)  BLACK 4000 PAG", "1VV22AL", 120],
            ["CASE ANTEC NX410 ARGB MID TOWER", "", 18]])
    ] },

    /* Cartera sin a quien llamar: un REPONER ocupa el puesto 3. */
    V0320: { tipo: "CARTERA", sugeridos: [
        reponer("C12011", "CORPORACION SAN BORJA S.A.", 3105.9, "2026-09-12", [[EPSON_NEGRO, "T544120-AL", 60, 15, "2026-09-12", 10]]),
        reponer("C12390", "SERVICIOS DIGITAL ICA S.A.C.", 1470, "2026-09-20", [["TECLADO LOGITECH K120 USB ESPAÑOL", "920-004422", 25, 18, "2026-09-20", 8]]),
        reponer("C13007", "MULTISERVICIOS CUSCO E.I.R.L.", 655.75, "2026-09-27", [["MOUSE LOGITECH B100 USB", "910-003357", 20, 20, "2026-09-27", 6]])
    ] },

    /* Menos de 3 candidatos y sin respaldo: llegan 2 tarjetas. */
    V0330: { tipo: "COBERTURA", sugeridos: [
        reponer("C19050", "GRUPO TRUJILLO S.A.C.", 780.4, "2026-09-16", [["SSD KINGSTON NV2 1TB M.2 NVME", "SNV2S/1000G", 8, 25, "2026-09-16", 5]]),
        llamar("C19311", "TECNOLOGIA PIURA S.R.L.", 2210.6, "2026-09-26", 4, 3, [["MEMORIA KINGSTON FURY BEAST 16GB DDR4 3200", "KF432C16BB/16", 40]])
    ] },

    /* Cobertura que dejo de facturar, un dia lejano: 3 REACTIVAR. */
    V0290: { tipo: "COBERTURA", sugeridos: [
        reactivar("C11620", "COMERCIAL ANDINA TECH S.A.C.", 14250.8, "2026-07-30", [
            ["PSU ANTEC CSK DC GB 550W 80+ BRONZE UK", "0-761345-20103-2", 64], ["CASE ANTEC NX200 ATX MID TOWER", "0-761345-81020-1", 40], ["COOLER ANTEC A30 PRO AIRE", "0-761345-10030-4", 30]]),
        reactivar("C11922", "SOLUCIONES INCA E.I.R.L.", 6320, "2026-08-14", [["MONITOR HP M24F 23.8 IPS FHD", "2D9K0AA", 28]]),
        reactivar("C12544", "IMPORTADORA PACIFICO S.A.", 2980.45, "2026-08-21", [["TONER BROTHER TN-660 NEGRO ALTO RENDIMIENTO", "TN660", 55], ["TAMBOR BROTHER DR-1060", "DR1060", 20]])
    ] },

    /* Cobertura con clientes asignados pero sin compras: 3 SIN_COMPRAS. */
    V0353: { tipo: "COBERTURA", sugeridos: [
        sinCompras("C30011", "REDES Y SISTEMAS TACNA E.I.R.L."), sinCompras("C30140", "DIGITAL LOS OLIVOS S.A.C."), sinCompras("C30275", "SUMINISTROS SAN MARTIN S.R.L.")
    ] },

    /* Cobertura sin historial: 3 LIBRE. El valor es lo que compraron a TODOS los vendedores, no a este. */
    V0360: { tipo: "COBERTURA", sugeridos: [
        libre("C40210", "COMERCIAL CHICLAYO S.A.C.", 48210.35), libre("C40377", "CORPORACION AREQUIPA E.I.R.L.", 22190), libre("C40618", "GRUPO PRADO S.A.", 9575.9)
    ] },

    /* Cartera que recien empieza y no tiene clientes asignados: sin tarjetas y con aviso. No se graba nada. */
    V0399: { tipo: "CARTERA", sugeridos: [], aviso: "todavia no hay clientes para sugerirte" }
};

const PREDETERMINADO = { CARTERA: "V0313", COBERTURA: "V0278" };

/* --------------------------------------------------------------- el estado: lo grabado del dia */
const E = { codven: null, grabado: {}, calculos: 0 };

/** El vendedor de la sesion. Sin elegir uno, el de siempre de su tipo. */
function usar(codven) { E.codven = codven || null; }

function reiniciar() { E.codven = null; E.grabado = {}; E.calculos = 0; }

/* --------------------------------------------------------------- la ruta */

/**
 * GET /quienvender. Devuelve `{ status, cuerpo }`, y ademas `primera: true` cuando es la primera vez que ese vendedor lo abre ese dia
 * (es lo que tarda un segundo en el backend; el servidor de desarrollo lo imita). `primera` no viaja en el cuerpo.
 */
function sugerir() {
    if (S.rol !== "CARTERA" && S.rol !== "COBERTURA") return error(403, "sin permiso", "esta ruta es del grupo 20");

    const codven = E.codven || PREDETERMINADO[S.rol];
    const v = VENDEDORES[codven];
    if (!v) return error(400, "no identificado", "la sesion no trae el usuario o el codigo de vendedor", 2);

    const sugeridos = v.sugeridos.map((x, i) => Object.assign({ puesto: i + 1 }, x));
    const cuerpo = ok({ fecha: HOY, vendedor: { codven: codven, tipo: v.tipo }, sugeridos: sugeridos, aviso: v.aviso || null });

    /* Sin nada que sugerir no se graba nada: se vuelve a intentar la proxima vez que abra el modulo. */
    if (!sugeridos.length) return cuerpo;

    const primera = !E.grabado[codven];
    if (primera) { E.grabado[codven] = true; E.calculos++; }
    return Object.assign(cuerpo, { primera: primera });
}

module.exports = { sugerir, usar, reiniciar, estado: E, VENDEDORES, MOTIVOS, HOY, PREDETERMINADO };
