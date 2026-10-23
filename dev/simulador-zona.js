/**
 * Simulacro de `/v1/zona/*` (grupo 34, jefe de zona): el avance de la cuota de todos los vendedores del grupo 20 y la
 * probabilidad de que uno llegue a la suya.
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-zona.js, por la misma razon que los otros simulacros: dos copias
 * se desalinean. Reproduce el contrato de docs/zona-grupo34.md (22/10/2026); no lo inventa.
 *
 *   GET /zona/avance                                el mes en curso
 *   GET /zona/avance?anno=2026&mes=9                uno de los dos meses anteriores
 *   GET /zona/probabilidad?codusu=196               de UN vendedor: los 4 meses, cada uno cortado al mismo dia
 *
 * Hoy es el 22/10/2026 a las 18:47 (como en el documento). Los vendedores y sus ventas son inventados y deterministas.
 * Lo que SI es fiel al contrato:
 *
 *   · salen los vendedores del grupo 20 **que registraron su cuota** ese mes; los que no, van aparte en `sinCuota`
 *   · el avance es en dolares CON IGV (no es la regla de la cuota por marca, que va sin IGV)
 *   · `esperado` es cuanto del mes ya paso (22 de 31 = 71); en un mes cerrado, 100
 *   · `estado` es el semaforo: `logrado`, `adelantado` (igual o por encima de lo esperado), `justo` (hasta 10 puntos por
 *     debajo) o `atrasado` (mas de 10 puntos por debajo). En un mes cerrado, `null`: ahi manda `logro`
 *   · en un mes cerrado `hoy`, `estado`, `proyeccion`, `probabilidad` y `total.hoy` / `total.estados` vienen en `null`
 *   · `mesAnterior` es como cerro el mes anterior AL QUE SE MIRA, o `null` si ese mes no registro cuota
 *   · `motivo`: `historia insuficiente` (vendedor nuevo), `meta alcanzada` (100), `mes cerrado` (0) o `sin cuota`
 *   · la probabilidad trae SIEMPRE 4 meses (el actual y los 3 anteriores, del mas reciente al mas antiguo), cada uno
 *     cortado el mismo dia; un mes sin cuota viene con `meta: null` pero con su avance, escenarios y cierre
 *   · `ritmo.necesario` es lo que falta entre los dias de venta que quedan (habiles y sabados, sin domingos)
 *   · los `escenarios` van de menos a mas (pesimista, probable, optimista) y no llevan la correccion de la probabilidad
 *
 * Solo entra el usuario 126; el 297 recibe `403 usuario sin acceso` (lo decide dev/servidor.js, en el login y en todas
 * las rutas). Un usuario de otro grupo recibe `403 sin permiso`. No habla HTTP: devuelve `{ status, cuerpo }`.
 */
"use strict";

const marcas = require("./simulador-marcas");

const S = marcas.estado;

const ANNO = 2026, MES = 10, DIA = 22, DIAS_DEL_MES = 31;
const HOY = "2026-10-22";
const ACTUALIZADO = "2026-10-22 18:47:06";
const VENTAS_HASTA = { actual: "2026-10-21", 9: "2026-09-30", 8: "2026-08-31", 7: "2026-07-31" };

const redondear = (n) => Math.round(n * 100) / 100;
const un_decimal = (n) => Math.round(n * 10) / 10;
const esZona = () => S.rol === "ZONA";

const ok = (data) => ({ status: 200, cuerpo: { status: "ok", codigo: 0, data: data } });
const error = (status, nombre, msg, codigo) => ({ status: status, cuerpo: { status: nombre, codigo: codigo || 3, msg: msg } });
const sinPermiso = () => error(403, "sin permiso", "esta ruta es del grupo 34");

/* --------------------------------------------------------------- los vendedores del grupo 20
 *
 * Por mes, de el actual a hace 3 meses (oct, sep, ago, jul): `meta` (null si no registro cuota), `corte` (lo facturado
 * hasta el dia 22) y `cierre` (lo facturado en todo el mes; null en el actual). `habitual` es lo que suele facturar por
 * dia de venta, y `hoy` lo que facturo hoy.
 */
const VENDEDORES = [
    { codusu: "196", codven: "V0278", nombre: "HUAMANI ANTHONY", tipo: "COBERTURA", habitual: 7964.13, hoy: 0,
      meta: [220000, 220000, 220000, 220000], corte: [26152.29, 180446.49, 172700, 200860], cierre: [null, 232520.11, 218240, 246400] },
    { codusu: "412", codven: "V0343", nombre: "GUEVARA SANTOS ABRAHAM", tipo: "COBERTURA", habitual: 17850.4, hoy: 12480.5,
      meta: [400000, 380000, 350000, null], corte: [412350.6, 330200, 290100, 310500], cierre: [null, 527563.35, 448900, 470100] },
    { codusu: "400", codven: "V0301", nombre: "ROJAS QUISPE LUZ MARINA", tipo: "COBERTURA", habitual: 6100.75, hoy: 3210.1,
      meta: [180000, 170000, 160000, null], corte: [133800.4, 118650, 109400, 98000], cierre: [null, 171300.5, 150200, 140000] },
    { codusu: "246", codven: "V0287", nombre: "CASTILLO FLORES DIEGO", tipo: "CARTERA", habitual: 9420.3, hoy: 0,
      meta: [250000, null, null, null], corte: [149500.8, 189300, 172800, 160100], cierre: [null, 243800.4, 229900, 214000] },
    { codusu: "269", codven: "V0265", nombre: "TORRES AGUIRRE CARLOS", tipo: "CARTERA", habitual: 12700.9, hoy: 5600,
      meta: [300000, null, null, null], corte: [118900.2, 201400, 190500, 187000], cierre: [null, 271900, 262000, 251000] },
    { codusu: "406", codven: "V0319", nombre: "MENDOZA DEL CARPIO ROSA", tipo: "COBERTURA", habitual: 7800.2, hoy: 1980.75,
      meta: [210000, null, null, null], corte: [131200.7, 140200, 133400, 120000], cierre: [null, 186500, 178800, 168000] },
    /* Un vendedor nuevo: menos de 20 dias con datos, asi que no hay historia para proyectar ni para calcular una probabilidad. */
    { codusu: "420", codven: "V0361", nombre: "VARGAS SALAS PEDRO", tipo: "COBERTURA", habitual: 0, nuevo: true, hoy: 840,
      meta: [120000, null, null, null], corte: [24100.3, 0, 0, 0], cierre: [null, 0, 0, 0] },
    /* Devolvio mas de lo que vendio: su avance es negativo. */
    { codusu: "421", codven: "V0355", nombre: "BENITES ZEGARRA FIORELLA", tipo: "CARTERA", habitual: 2100, hoy: 0,
      meta: [90000, null, null, null], corte: [-1250.4, 31500, 28800, 26000], cierre: [null, 48000, 42500, 40000] },
    /* Sin cuota este mes: salen aparte, para saber a quien pedirsela. */
    { codusu: "293", codven: "V0261", nombre: "UTANI FERNANDO", tipo: "CARTERA", habitual: 14950.6, hoy: 0,
      meta: [null, 300000, 280000, null], corte: [138694.84, 241800, 226500, 210900], cierre: [null, 312200, 301000, 280700] },
    { codusu: "399", codven: "V0334", nombre: "GONZALES JUAN", tipo: "COBERTURA", habitual: 11300.2, hoy: 0,
      meta: [null, null, null, 240000], corte: [115071.62, 177300, 188400, 247800], cierre: [null, 262500, 268900, 331200] },
    { codusu: "414", codven: "V0372", nombre: "SALAZAR PAREDES ANA", tipo: "CARTERA", habitual: 4200.6, hoy: 760.4,
      meta: [null, null, 150000, null], corte: [62300.1, 58700, 91500, 71000], cierre: [null, 88000, 128900, 99500] },
    /* Recien registrado: avance 0 y sin proyeccion. */
    { codusu: "422", codven: "V0380", nombre: "HUAMAN CCORI JESUS", tipo: "COBERTURA", habitual: 0, nuevo: true, hoy: 0,
      meta: [null, null, null, null], corte: [0, 0, 0, 0], cierre: [null, 0, 0, 0] }
];

const porCodusu = (c) => VENDEDORES.find((v) => v.codusu === String(c));

/* ------------------------------------------------------------------ el calendario */

/** Los meses: 0 = el actual, 1..3 = hace 1..3 meses. */
function mesDe(atras) {
    const t = ANNO * 12 + (MES - 1) - atras;
    return { anno: Math.floor(t / 12), mes: (t % 12) + 1 };
}

const diasDel = (anno, mes) => new Date(anno, mes, 0).getDate();

/**
 * Los dias de venta que quedan desde el dia de corte (incluido) hasta fin de mes: habiles (lunes a viernes) y sabados.
 * Sin domingos ni feriados.
 */
function quedan(anno, mes, corte) {
    let habiles = 0, sabados = 0;
    for (let d = corte; d <= diasDel(anno, mes); d++) {
        const dia = new Date(anno, mes - 1, d).getDay();
        if (dia === 6) sabados++;
        else if (dia !== 0) habiles++;
    }
    return { habiles: habiles, sabados: sabados };
}

/** El dia de corte de un mes: el mismo numero de dia que hoy, o el ultimo si el mes es mas corto. */
const corteDe = (anno, mes) => Math.min(DIA, diasDel(anno, mes));
const iso = (anno, mes, dia) => anno + "-" + String(mes).padStart(2, "0") + "-" + String(dia).padStart(2, "0");

/* ----------------------------------------------------------------- las cuentas */
const pct = (a, b) => (b ? un_decimal(a / b * 100) : null);

/** Cuanto del mes ya paso, en %: 22 de 31 = 71. En un mes cerrado, 100. */
const ESPERADO = Math.round(DIA / DIAS_DEL_MES * 100);

/** El semaforo: comparando el % que lleva con lo que ya paso del mes. */
function semaforo(porcentaje, logro) {
    if (logro) return "logrado";
    if (porcentaje >= ESPERADO) return "adelantado";
    if (porcentaje >= ESPERADO - 10) return "justo";
    return "atrasado";
}

/** Los escenarios si sigue vendiendo como en sus ultimos 90 dias. No llevan la correccion de la probabilidad. */
function escenarios(v, avance, q) {
    if (v.nuevo || !v.habitual) return null;
    const dias = q.habiles + q.sabados;
    return {
        pesimista: redondear(avance + dias * v.habitual * 0.69),
        probable: redondear(avance + dias * v.habitual * 0.93),
        optimista: redondear(avance + dias * v.habitual * 1.35)
    };
}

/**
 * La probabilidad de llegar a la meta a fin de mes, vista desde el corte. Si para llegar tiene que facturar por dia mas de
 * 2,5 veces lo que suele, no se corrige: ahi nadie llego, y es 0.
 */
function probabilidadDe(v, meta, avance, q) {
    const falta = Math.max(0, meta - avance);
    const necesario = falta / (q.habiles + q.sabados);
    const r = necesario / v.habitual;
    if (r > 2.5) return 0;
    return Math.max(0, Math.min(100, un_decimal(100 / (1 + Math.exp(10 * (r - 0.98))))));
}

/** Como cerro un mes de un vendedor, o `null` si ese mes no registro cuota. */
function cierreDeMes(v, atras) {
    if (v.meta[atras] === null || v.meta[atras] === undefined) return null;
    const avance = v.cierre[atras];
    return { meta: v.meta[atras], avance: avance, porcentaje: pct(avance, v.meta[atras]), logro: avance >= v.meta[atras] };
}

/* ------------------------------------------------------------------------ el avance */

function periodoPedido(params) {
    params = params || {};
    const sinAnno = params.anno === undefined || params.anno === null || params.anno === "";
    const sinMes = params.mes === undefined || params.mes === null || params.mes === "";

    if (sinAnno && sinMes) return { atras: 0 };
    if (sinAnno || sinMes) return false;

    const anno = Number(params.anno), mes = Number(params.mes);
    if (!Number.isInteger(anno) || !Number.isInteger(mes) || mes < 1 || mes > 12) return false;

    const atras = (ANNO * 12 + (MES - 1)) - (anno * 12 + (mes - 1));
    return atras < 0 || atras > 2 ? false : { atras: atras };
}

/** Un vendedor con cuota, en el mes que se mira. */
function filaConCuota(v, atras) {
    const actual = atras === 0;
    const meta = v.meta[atras];
    const avance = actual ? v.corte[0] : v.cierre[atras];
    const logro = avance >= meta;
    const porcentaje = pct(avance, meta);
    const m = mesDe(atras);
    const q = quedan(m.anno, m.mes, corteDe(m.anno, m.mes));
    const esc = actual ? escenarios(v, avance, q) : null;

    let probabilidad = null, motivo = null;
    if (actual) {
        if (v.nuevo) { motivo = "historia insuficiente"; }
        else if (logro) { probabilidad = 100; motivo = "meta alcanzada"; }
        else probabilidad = probabilidadDe(v, meta, avance, q);
    }

    return {
        codusu: v.codusu, codven: v.codven, nombre: v.nombre, tipo: v.tipo,
        meta: meta, avance: avance, porcentaje: porcentaje, falta: Math.max(0, redondear(meta - avance)), logro: logro,
        hoy: actual ? v.hoy : null,
        estado: actual ? semaforo(porcentaje, logro) : null,
        proyeccion: actual && esc ? esc.probable : null,
        probabilidad: probabilidad, motivo: motivo,
        mesAnterior: cierreDeMes(v, atras + 1)
    };
}

/** GET /v1/zona/avance */
function avance(params) {
    if (!esZona()) return sinPermiso();

    const p = periodoPedido(params);
    if (!p) return error(400, "periodo invalido", "solo se puede pedir el mes en curso y los dos anteriores", 2);

    const atras = p.atras, actual = atras === 0, m = mesDe(atras);

    const conCuota = VENDEDORES.filter((v) => v.meta[atras] !== null && v.meta[atras] !== undefined)
        .map((v) => filaConCuota(v, atras))
        .sort((a, b) => b.porcentaje - a.porcentaje);

    const sinCuota = VENDEDORES.filter((v) => v.meta[atras] === null || v.meta[atras] === undefined)
        /* Solo los que ya facturaron o estan registrados y activos; el recien llegado sale con 0. */
        .map((v) => {
            const av = actual ? v.corte[0] : v.cierre[atras];
            const q = quedan(m.anno, m.mes, corteDe(m.anno, m.mes));
            const esc = actual ? escenarios(v, av, q) : null;
            return { codusu: v.codusu, codven: v.codven, nombre: v.nombre, tipo: v.tipo, avance: av,
                     hoy: actual ? v.hoy : null, proyeccion: actual && esc ? esc.probable : null };
        })
        .sort((a, b) => b.avance - a.avance);

    const meta = redondear(conCuota.reduce((s, f) => s + f.meta, 0));
    const av = redondear(conCuota.reduce((s, f) => s + f.avance, 0));

    const estados = actual ? { logrado: 0, adelantado: 0, justo: 0, atrasado: 0 } : null;
    if (actual) conCuota.forEach((f) => { estados[f.estado]++; });

    return ok({
        anno: m.anno, mes: m.mes, actual: actual,
        ventasHasta: actual ? VENTAS_HASTA.actual : VENTAS_HASTA[m.mes],
        actualizado: ACTUALIZADO,
        esperado: actual ? ESPERADO : 100,
        total: {
            vendedores: conCuota.length, meta: meta, avance: av, porcentaje: pct(av, meta),
            logrados: conCuota.filter((f) => f.logro).length,
            hoy: actual ? redondear(conCuota.reduce((s, f) => s + f.hoy, 0)) : null,
            estados: estados,
            sinCuota: sinCuota.length
        },
        vendedores: conCuota,
        sinCuota: sinCuota
    });
}

/* ------------------------------------------------------------------ la probabilidad */

/** Un mes de la probabilidad de un vendedor, cortado el dia 22. */
function mesDeProbabilidad(v, atras) {
    const m = mesDe(atras), actual = atras === 0;
    const corte = corteDe(m.anno, m.mes);
    const q = quedan(m.anno, m.mes, corte);
    const meta = v.meta[atras] === undefined ? null : v.meta[atras];
    const av = v.corte[atras];
    const esc = escenarios(v, av, q);

    let probabilidad = null, motivo = null;
    if (meta === null) motivo = "sin cuota";
    else if (v.nuevo) motivo = "historia insuficiente";
    else if (av >= meta) { probabilidad = 100; motivo = "meta alcanzada"; }
    else probabilidad = probabilidadDe(v, meta, av, q);

    return {
        anno: m.anno, mes: m.mes, actual: actual, tipo: v.tipo, meta: meta, corte: iso(m.anno, m.mes, corte),
        avance: av, porcentaje: meta ? pct(av, meta) : null, falta: meta ? Math.max(0, redondear(meta - av)) : null,
        quedan: q,
        ritmo: { necesario: meta && !(av >= meta) ? redondear(Math.max(0, meta - av) / (q.habiles + q.sabados)) : null,
                 habitual: v.nuevo ? null : v.habitual },
        probabilidad: probabilidad, motivo: motivo,
        escenarios: esc,
        cierre: actual ? null : { avance: v.cierre[atras], porcentaje: meta ? pct(v.cierre[atras], meta) : null,
                                  logro: meta ? v.cierre[atras] >= meta : false }
    };
}

/** GET /v1/zona/probabilidad?codusu=196 */
function probabilidad(params) {
    params = params || {};
    if (!esZona()) return sinPermiso();

    if (!params.codusu) return error(400, "vendedor requerido", "falta el codusu del vendedor", 2);

    const v = porCodusu(params.codusu);
    if (!v) return error(404, "vendedor desconocido", "ese usuario no es un vendedor del grupo 20", 2);

    return ok({
        vendedor: { codusu: v.codusu, codven: v.codven, nombre: v.nombre, tipo: v.tipo },
        hoy: HOY, actualizado: ACTUALIZADO,
        meses: [0, 1, 2, 3].map((a) => mesDeProbabilidad(v, a))
    });
}

module.exports = { avance, probabilidad, VENDEDORES, ESPERADO, quedan, probabilidadDe, semaforo, ANNO, MES, DIA, HOY, ACTUALIZADO };
