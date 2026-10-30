/**
 * Simulacro de `/v1/zona/*` (grupo 34, jefe de zona): el avance de la cuota de todos los vendedores del grupo 20 y la
 * probabilidad de que uno llegue a la suya.
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-zona.js, por la misma razon que los otros simulacros: dos copias
 * se desalinean. Reproduce el contrato de docs/zona-grupo34.md (24/10/2026); no lo inventa.
 *
 *   GET /zona/avance                                el mes en curso
 *   GET /zona/avance?anno=2026&mes=9                uno de los TRES meses anteriores (hasta el 24/10 eran dos)
 *   GET /zona/probabilidad?codusu=196               de UN vendedor: los 4 meses, cada uno cortado al mismo dia
 *   GET /zona/cartera?codusu=293[&anno=&mes=]       los clientes de un vendedor de CARTERA (modulo `clientes`)
 *   GET /zona/cobertura?codusu=399[&anno=&mes=]     los clientes de un vendedor de COBERTURA (modulo `clientes`)
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
 *   · cada fila del avance —con cuota o en `sinCuota`— trae `reemplazadoPor` (`null` o `{codven, nombre, venta, porcentaje}`
 *     del que atendio su cartera) y `reemplazaA` (`[]` o la lista de a quienes reemplazo, con la misma forma, cuyos
 *     `codven` y `nombre` son los del reemplazado). El reemplazado siempre es de CARTERA; el que reemplaza, de cualquiera
 *   · las cifras de los reemplazos son inventadas, pero se cruzan con los clientes: lo que el reemplazo facturo a los clientes del
 *     dueño es exactamente la suma de esos clientes en la cartera (`reemplazo`) o en la cobertura (`dueno.tipo = cartera`) de
 *     quien los atendio. No se cruzan con el `avance` del reemplazado (en el simulacro sigue vendiendo)
 *   · `cartera` y `cobertura`: la `venta` de cada una es el `avance` de ese vendedor en ese mes, al centimo; el `tipo` es el de la
 *     cuota que registro ESE mes o, si no registro, el de hoy (SALAZAR fue de COBERTURA en agosto), y la ruta equivocada
 *     responde `400 vendedor de otro tipo`
 *   · cada lista de clientes suma exacto lo que dice su `resumen`; `porDueno` solo suma los atendidos, asi que NO cierra con
 *     `venta` (los clientes que terminaron el mes en 0 o en negativo, por notas de credito, van en la lista y no cuentan como
 *     atendidos)
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
    /* Cambio de tipo: hoy es de CARTERA, pero en agosto (cuando si registro cuota) era de COBERTURA. El tipo de un mes es el de la
       cuota que registro ese mes, asi que la pantalla de clientes no puede dar por hecho que un vendedor sigue siendo del mismo. */
    { codusu: "414", codven: "V0372", nombre: "SALAZAR PAREDES ANA", tipo: "CARTERA", tipoEn: { 2: "COBERTURA" }, habitual: 4200.6, hoy: 760.4,
      meta: [null, null, 150000, null], corte: [62300.1, 58700, 91500, 71000], cierre: [null, 88000, 128900, 99500] },
    /* Recien registrado: avance 0 y sin proyeccion. */
    { codusu: "422", codven: "V0380", nombre: "HUAMAN CCORI JESUS", tipo: "COBERTURA", habitual: 0, nuevo: true, hoy: 0,
      meta: [null, null, null, null], corte: [0, 0, 0, 0], cierre: [null, 0, 0, 0] }
];

const porCodusu = (c) => VENDEDORES.find((v) => v.codusu === String(c));

/** El tipo de un vendedor en un mes: el de la cuota que registro ESE mes (`tipoEn`) o, si no, el de hoy. */
const tipoDe = (v, atras) => (v.tipoEn && v.tipoEn[atras]) || v.tipo;

/* ------------------------------------------------------- los reemplazos por vacaciones
 *
 * Un registro por reemplazo, y de el salen los dos lados (`reemplazadoPor` en el dueño de la cartera y `reemplazaA` en el
 * que la atendio), para que nunca se desalineen. `atras` es el mes (0 = octubre ... 3 = julio), `de` el dueño de la cartera
 * (siempre CARTERA), `por` el que la atendio, `venta` lo que facturo a esos clientes y `porcentaje` que parte fue de lo que
 * todos facturaron a ellos.
 *
 * Cubren cada forma en que puede salir: los dos en `sinCuota` (el caso normal), el que reemplaza con cuota y el reemplazado
 * sin ella, los dos con cuota, un reemplazo que atiende a dos carteras, un mes cerrado, y una CARTERA que reemplaza a otra
 * CARTERA (ahi lo que facturo le cuenta, y sale en el `reemplazo` de su cartera).
 *
 * `venta` tiene que caber en lo que facturo el que reemplaza ese mes: los clientes del dueño salen de ahi, y no pueden sumar mas
 * que su `avance`.
 */
const REEMPLAZOS = [
    { atras: 0, de: "293", por: "399", venta: 60515.45, porcentaje: 99.9 },     // UTANI <- GONZALES JUAN: los dos en `sinCuota`
    { atras: 0, de: "414", por: "399", venta: 21300.4, porcentaje: 72.4 },      // SALAZAR <- GONZALES JUAN: dos carteras para el mismo
    { atras: 0, de: "421", por: "406", venta: 24850.6, porcentaje: 96.4 },      // BENITES <- MENDOZA: los dos con cuota
    { atras: 2, de: "421", por: "246", venta: 18420.3, porcentaje: 61.5 },      // BENITES <- CASTILLO en agosto: cartera que reemplaza a cartera
    { atras: 3, de: "246", por: "399", venta: 238400.5, porcentaje: 71.8 }      // CASTILLO <- GONZALES JUAN, en julio (mes cerrado)
];

const aviso = (v, venta, porcentaje) => ({ codven: v.codven, nombre: v.nombre, venta: venta, porcentaje: porcentaje });

/** Quien atendio la cartera de `v` ese mes, o `null`. Solo un vendedor de CARTERA puede ser reemplazado. */
function reemplazadoPorDe(v, atras) {
    const r = REEMPLAZOS.find((x) => x.atras === atras && x.de === v.codusu);
    return r ? aviso(porCodusu(r.por), r.venta, r.porcentaje) : null;
}

/** A quienes reemplazo `v` ese mes, o `[]`. */
function reemplazaADe(v, atras) {
    return REEMPLAZOS.filter((x) => x.atras === atras && x.por === v.codusu).map((x) => aviso(porCodusu(x.de), x.venta, x.porcentaje));
}

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
    return atras < 0 || atras > 3 ? false : { atras: atras };
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
        codusu: v.codusu, codven: v.codven, nombre: v.nombre, tipo: tipoDe(v, atras),
        meta: meta, avance: avance, porcentaje: porcentaje, falta: Math.max(0, redondear(meta - avance)), logro: logro,
        hoy: actual ? v.hoy : null,
        estado: actual ? semaforo(porcentaje, logro) : null,
        proyeccion: actual && esc ? esc.probable : null,
        probabilidad: probabilidad, motivo: motivo,
        mesAnterior: cierreDeMes(v, atras + 1),
        reemplazadoPor: reemplazadoPorDe(v, atras),
        reemplazaA: reemplazaADe(v, atras)
    };
}

/** GET /v1/zona/avance */
function avance(params) {
    if (!esZona()) return sinPermiso();

    const p = periodoPedido(params);
    if (!p) return error(400, "periodo invalido", "solo se puede pedir el mes en curso y los tres anteriores", 2);

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
            /* Aqui es donde suele salir el reemplazado: normalmente no registro cuota ese mes. */
            return { codusu: v.codusu, codven: v.codven, nombre: v.nombre, tipo: v.tipo, avance: av,
                     hoy: actual ? v.hoy : null, proyeccion: actual && esc ? esc.probable : null,
                     reemplazadoPor: reemplazadoPorDe(v, atras), reemplazaA: reemplazaADe(v, atras) };
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
        anno: m.anno, mes: m.mes, actual: actual, tipo: tipoDe(v, atras), meta: meta, corte: iso(m.anno, m.mes, corte),
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

/* --------------------------------------------------------------------- los clientes
 *
 * `cartera` y `cobertura`: los clientes de UN vendedor en un mes. Todo es inventado y determinista (un generador con semilla por
 * vendedor y mes: dos lecturas dan lo mismo), pero cumple lo que promete el contrato y se puede comprobar:
 *
 *   · `resumen.venta` es el `avance` de ese vendedor en ese mes, al centimo; en la cartera, `ventaPropia` + `ventaReemplazo`
 *   · las listas suman exacto lo que dice el resumen (la cartera: `clientes` = `ventaPropia`, `reemplazo` = `ventaReemplazo`)
 *   · en la cobertura, `clientes` trae a los atendidos y tambien a los que terminaron el mes en 0 o en negativo por notas de
 *     credito (`atendido: false`), asi que tiene mas filas que `atendidos`; y `porDueno` solo suma los atendidos
 *   · un cliente de la oficina viene con `dueno: { codven: "V0000", nombre: "OFICINA", tipo: "libre" }`; uno sin dueño, con `null`
 */
const EMPRESAS = ["FERRETERIA EL PROGRESO", "CONSTRUCTORA ANDINA", "DISTRIBUIDORA LIMA NORTE", "COMERCIAL SANTA ROSA", "INVERSIONES MIRAFLORES",
                  "SERVICIOS GENERALES DEL SUR", "TECNOLOGIA Y REDES", "IMPORTACIONES PACIFICO", "CORPORACION INCA", "ELECTRONICA CENTRAL",
                  "MULTISERVICIOS CHAVIN", "GRUPO COMERCIAL ORIENTE", "SISTEMAS INTEGRADOS", "REPRESENTACIONES ARIAS", "ALMACENES UNIDOS",
                  "COMPUTEC", "INFORMATICA MODERNA", "SOLUCIONES DIGITALES", "OFICINAS Y MAS", "PAPELERA EL SOL"];
const SUFIJOS = ["SAC", "EIRL", "SRL", "SA"];
const nombreDeCliente = (i) => EMPRESAS[i % EMPRESAS.length] + " " + SUFIJOS[Math.floor(i / EMPRESAS.length) % SUFIJOS.length] +
                               (i >= 80 ? " " + (Math.floor(i / 80) + 1) : "");
const clienteDelPozo = (i) => ({ codcli: "C" + String(20000 + i), nombre: nombreDeCliente(i) });

/* Cada vendedor tiene su tramo del pozo de clientes, distinto del de los demas: el mismo cliente conserva su codigo en cualquier mes. */
const pozoDe = (v) => VENDEDORES.indexOf(v) * 300;
const POZO_LIBRES = 15000, POZO_RIESGO = 17000;

/** Un generador de numeros entre 0 y 1 que siempre da la misma serie para la misma semilla (mulberry32). */
function azar(semilla) {
    let a = semilla >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Reparte `total` en `n` partes del mismo signo, de mayor a menor mas o menos, y que suman EXACTO (lo que sobra va a la ultima). */
function repartir(total, n, rnd) {
    if (n <= 0) return [];
    const pesos = [];
    let suma = 0;
    for (let i = 0; i < n; i++) {
        const p = (1 / Math.pow(i + 1, 0.85)) * (0.75 + 0.5 * rnd());
        pesos.push(p);
        suma += p;
    }
    const partes = pesos.map((p) => redondear(total * p / suma));
    partes[n - 1] = redondear(partes[n - 1] + redondear(total - partes.reduce((s, x) => s + x, 0)));
    return partes;
}

const sumar = (xs, f) => redondear(xs.reduce((s, x) => s + f(x), 0));
const porVenta = (a, b) => b.venta - a.venta;

/** Cuanto vendio un vendedor en un mes (el en curso, hasta hoy; uno cerrado, entero): es su `avance`. */
const ventaDe = (v, atras) => (atras === 0 ? v.corte[0] : v.cierre[atras]);

/** Una fecha de un mes, entre el dia 1 y `tope`. */
const fechaDe = (m, rnd, tope) => iso(m.anno, m.mes, 1 + Math.floor(rnd() * tope));

/** Lo que traen en comun los clientes de una cartera, de una cobertura y de las listas de riesgo. */
const comun = (c) => ({ codcli: c.codcli, nombre: c.nombre, venta: c.venta, docs: c.docs, atendido: c.atendido,
                        ultimaCompra: c.ultimaCompra, promedioMensual: c.promedioMensual, otros: c.otros });

/** Clientes en riesgo: le compraron en alguno de los 3 meses anteriores y en este todavia no. Del que mas compraba al que menos. */
function riesgoDe(lista) {
    lista.sort((a, b) => b.promedioMensual - a.promedioMensual);
    return { clientes: lista.length, promedioMensual: sumar(lista, (c) => c.promedioMensual), lista: lista };
}

/** El mes pedido y los tres anteriores, cada uno hasta el mismo dia (en el en curso, el de hoy; en uno cerrado, el mes entero). */
function comparacionDe(v, atras, clientes, libres) {
    const actual = atras === 0;
    return [0, 1, 2, 3].map((i) => {
        const k = atras + i, m = mesDe(k);
        const venta = i === 0 ? ventaDe(v, atras)
                    : actual ? v.corte[k]
                    : (k <= 3 ? v.cierre[k] : redondear(v.cierre[3] * (1 - 0.06 * (k - 3))));
        const n = i === 0 ? clientes : v.nuevo ? 0 : Math.max(0, Math.round(clientes * (0.9 + 0.05 * ((Number(v.codusu) + k) % 5))));
        const fila = { anno: m.anno, mes: m.mes,
                       corte: iso(m.anno, m.mes, actual ? corteDe(m.anno, m.mes) : diasDel(m.anno, m.mes)),
                       clientes: n, venta: venta };
        if (libres !== undefined) fila.libres = i === 0 ? libres : v.nuevo ? 0 : (Number(v.codusu) + k) % 3;
        return fila;
    });
}

/** Los clientes de un vendedor de CARTERA ese mes. */
function carteraDe(v, atras) {
    const m = mesDe(atras), actual = atras === 0;
    const num = Number(v.codusu);
    const rnd = azar(num * 1000 + atras * 10 + 1);
    const tope = actual ? 21 : diasDel(m.anno, m.mes);                  // hasta donde hay facturas

    const venta = ventaDe(v, atras);
    const entrantes = REEMPLAZOS.filter((r) => r.atras === atras && r.por === v.codusu);        // las carteras ajenas que atendio
    const ventaReemplazo = sumar(entrantes, (r) => r.venta);
    const ventaPropia = redondear(venta - ventaReemplazo);

    const asignados = v.nuevo ? 12 : 40 + (num * 13) % 61;
    const atendidos = ventaPropia > 0 ? Math.max(1, Math.min(asignados, Math.round(asignados * (0.3 + 0.25 * ((num % 7) / 7))))) : 0;
    const sinAtender = asignados - atendidos;

    /* Las notas de credito: unos cuantos sin atender terminan el mes en negativo. Si todo su mes es negativo, esos negativos
       suman su venta; si no, se restan de lo que suman los atendidos, para que la lista siga sumando `ventaPropia`. */
    let negativos = [];
    if (ventaPropia > 0) for (let j = 0; j < Math.floor((sinAtender + 8) / 9); j++) negativos.push(-redondear(20 + rnd() * 180));
    else if (ventaPropia < 0) negativos = repartir(ventaPropia, Math.min(4, asignados), rnd);
    const montos = atendidos ? repartir(redondear(ventaPropia - sumar(negativos, (x) => x)), atendidos, rnd) : [];

    const mesesDe = new Map();                                          // en cuantos de los 3 meses anteriores compro (solo los de riesgo)
    const propios = [];
    for (let i = 0; i < asignados; i++) {
        const c = clienteDelPozo(pozoDe(v) + i);
        let ventaC = 0, docs = 0, ultimaCompra = null, promedio = 0;

        if (i < atendidos) {
            ventaC = montos[i];
            docs = 1 + Math.floor(rnd() * 6);
            ultimaCompra = fechaDe(m, rnd, tope);
            promedio = v.nuevo ? 0 : redondear(ventaC * (0.5 + rnd()));
        } else {
            const j = i - atendidos;
            if (ventaPropia > 0 ? j % 9 === 0 : (ventaPropia < 0 && j < negativos.length)) {
                ventaC = negativos[ventaPropia > 0 ? j / 9 : j];
                docs = 1;
            }
            if (!v.nuevo && j % 3 === 0) {                              // compraba y este mes no: esta en riesgo
                promedio = redondear(300 + rnd() * 3500);
                ultimaCompra = fechaDe(mesDe(atras + 1 + Math.floor(rnd() * 3)), rnd, 28);
                mesesDe.set(c, 1 + Math.floor(rnd() * 3));
            } else if (!v.nuevo && j % 4 === 1) {
                ultimaCompra = fechaDe(mesDe(atras + 3), rnd, 28);
            }
        }

        const cli = { codcli: c.codcli, nombre: c.nombre, venta: ventaC, docs: docs, atendido: ventaC > 0, ultimaCompra: ultimaCompra,
                      promedioMensual: promedio, otros: [], suyo: true,
                      enCarteraHoy: actual || i % 17 !== 5,             // en un mes cerrado, alguno ya es de otro y solo figura en las facturas
                      dueno: null };
        propios.push(cli);
        if (mesesDe.has(c)) mesesDe.set(cli, mesesDe.get(c));
    }

    /* Lo que otros le facturaron a sus clientes: no le cuenta, pero se ve. En la cartera de un vendedor de vacaciones, ahi esta
       su reemplazo, repartido entre unos cuantos clientes. */
    const reemplazadoPor = reemplazadoPorDe(v, atras);
    const coberturas = VENDEDORES.filter((x) => tipoDe(x, atras) === "COBERTURA" && x.codusu !== v.codusu);
    let ventaDeOtros = 0;
    if (reemplazadoPor) {
        const n = Math.min(12, asignados), paso = Math.max(1, Math.floor(asignados / n));
        repartir(reemplazadoPor.venta, n, rnd).forEach((parte, k) => {
            propios[k * paso].otros = [{ codven: reemplazadoPor.codven, nombre: reemplazadoPor.nombre, venta: parte }];
        });
        ventaDeOtros = reemplazadoPor.venta;
    } else if (!v.nuevo) {
        const partes = [];
        for (let k = 0; k < 2; k++) {
            const o = coberturas[(num + k) % coberturas.length], parte = redondear(400 + rnd() * 2200);
            propios[k * 5 + 1].otros = [{ codven: o.codven, nombre: o.nombre, venta: parte }];
            partes.push(parte);
        }
        ventaDeOtros = sumar(partes, (x) => x);
    }

    /* Los clientes de otras carteras que atendio: le cuentan, haya reemplazo detectado o no. */
    const reemplazo = [];
    entrantes.forEach((r) => {
        const de = porCodusu(r.de);
        repartir(r.venta, 8, rnd).forEach((ventaC, i) => {
            const c = clienteDelPozo(pozoDe(de) + i);
            reemplazo.push({ codcli: c.codcli, nombre: c.nombre, venta: ventaC, docs: 1 + Math.floor(rnd() * 4), atendido: true,
                             ultimaCompra: fechaDe(m, rnd, tope), promedioMensual: redondear(ventaC * (0.4 + rnd())), otros: [],
                             suyo: false, dueno: { codven: de.codven, nombre: de.nombre } });
        });
    });
    reemplazo.sort(porVenta);

    /* Lo que facturo a clientes que NO son de cartera: no le cuenta a nadie. Los libres (oficina o sin dueño) cuentan como cliente
       atendido; los de un vendedor de cobertura, de ninguna forma. */
    const fuera = [];
    if (!v.nuevo) {
        const nLibres = 1 + num % 3, nConDueno = 3 + num % 5;
        const libres = repartir(redondear(1800 + rnd() * 3000), nLibres, rnd);
        if (nLibres > 1) libres[nLibres - 1] = -redondear(40 + rnd() * 90);          // un libre que solo tuvo una nota de credito
        libres.forEach((ventaC, i) => {
            const c = clienteDelPozo(POZO_LIBRES + (num % 20) * 100 + i);
            fuera.push({ codcli: c.codcli, nombre: c.nombre, venta: ventaC, docs: ventaC > 0 ? 1 + Math.floor(rnd() * 3) : 1,
                         dueno: i % 2 === 0 ? { codven: "V0000", nombre: "OFICINA" } : null, libre: true, atendido: ventaC > 0 });
        });
        repartir(redondear(2500 + rnd() * 5000), nConDueno, rnd).forEach((ventaC, i) => {
            const d = coberturas[(num + i) % coberturas.length], c = clienteDelPozo(pozoDe(d) + 250 + i);
            fuera.push({ codcli: c.codcli, nombre: c.nombre, venta: ventaC, docs: 1 + Math.floor(rnd() * 3),
                         dueno: { codven: d.codven, nombre: d.nombre }, libre: false, atendido: false });
        });
        fuera.sort(porVenta);
    }
    const libresF = fuera.filter((f) => f.libre), conDuenoF = fuera.filter((f) => !f.libre);

    /* Los 5 clientes que mas pesan en lo que le cuenta. */
    const grandes = propios.concat(reemplazo).filter((c) => c.venta > 0).sort(porVenta).slice(0, 5);
    const lista = propios.slice().sort(porVenta);

    return {
        resumen: {
            asignados: asignados, atendidos: atendidos, sinAtender: sinAtender, porcentaje: pct(atendidos, asignados),
            venta: venta, ventaPropia: ventaPropia, ventaReemplazo: ventaReemplazo, ventaDeOtros: ventaDeOtros,
            ventaFueraDeCartera: {
                clientes: fuera.length, venta: sumar(fuera, (f) => f.venta),
                libres: { clientes: libresF.length, atendidos: libresF.filter((f) => f.atendido).length, venta: sumar(libresF, (f) => f.venta) },
                conDueno: { clientes: conDuenoF.length, venta: sumar(conDuenoF, (f) => f.venta) }
            },
            coberturaClientes: { total: atendidos + reemplazo.length + libresF.filter((f) => f.atendido).length, cartera: atendidos,
                                 reemplazo: reemplazo.length, libres: libresF.filter((f) => f.atendido).length },
            concentracion: { clientes: grandes.length, venta: sumar(grandes, (c) => c.venta),
                             porcentaje: venta > 0 && grandes.length ? un_decimal(sumar(grandes, (c) => c.venta) / venta * 100) : null }
        },
        comparacion: comparacionDe(v, atras, atendidos, libresF.filter((f) => f.atendido).length),
        riesgo: riesgoDe(propios.filter((c) => mesesDe.has(c)).map((c) => Object.assign(comun(c), { mesesConCompra: mesesDe.get(c) }))),
        clientes: lista,
        reemplazo: reemplazo,
        fueraDeCartera: fuera
    };
}

/** De quien era el cliente, repetido en cada diez, para que haya de todo: propios, libres, de otro vendedor y de cartera. */
const CICLO_DUENOS = ["propio", "libre", "otro", "propio", "cartera", "libre", "propio", "otro", "libre", "propio"];

/** Los clientes de un vendedor de COBERTURA ese mes. */
function coberturaDe(v, atras) {
    const m = mesDe(atras), actual = atras === 0;
    const num = Number(v.codusu);
    const rnd = azar(num * 1000 + atras * 10 + 2);
    const tope = actual ? 21 : diasDel(m.anno, m.mes);

    const venta = ventaDe(v, atras);
    const entrantes = REEMPLAZOS.filter((r) => r.atras === atras && r.por === v.codusu);        // las carteras que atendio
    const asignados = v.nuevo ? 25 : 150 + (num * 17) % 120;

    /* Los que dejaron venta, y los que terminaron el mes en 0 o en negativo: estos ultimos suman un 10 % de lo facturado, en negativo,
       asi que los atendidos suman mas que `venta` y `porDueno` no cierra con ella. */
    let atendidos = 0, sinVenta = 0, sumaSinVenta = 0;
    if (venta > 0) {
        atendidos = v.nuevo ? 9 : 60 + (num * 11) % 120;
        sinVenta = v.nuevo ? 0 : 6 + num % 5;
        sumaSinVenta = sinVenta ? -redondear(venta * 0.1) : 0;
    } else if (venta < 0) {
        sinVenta = 4;
        sumaSinVenta = venta;
    }
    const negativos = sinVenta ? repartir(sumaSinVenta, sinVenta, rnd) : [];
    const sumaAtendidos = venta > 0 ? redondear(venta - sumaSinVenta) : 0;

    /* Los de «cartera» de relleno no son de las carteras que reemplazo: esos clientes ya estan, con su suma exacta. */
    const carteras = VENDEDORES.filter((x) => tipoDe(x, atras) === "CARTERA" && !entrantes.some((r) => r.de === x.codusu));
    const coberturas = VENDEDORES.filter((x) => tipoDe(x, atras) === "COBERTURA" && x.codusu !== v.codusu);
    const contador = { propio: 0, cartera: 0, libre: 0, otro: 0 };

    /* Un cliente de esa categoria, con su dueño segun las facturas del mes. */
    function deCategoria(categoria) {
        const n = contador[categoria]++;
        if (categoria === "propio") return { c: clienteDelPozo(pozoDe(v) + n), dueno: { codven: v.codven, nombre: v.nombre, tipo: "propio" } };
        if (categoria === "libre") {
            return { c: clienteDelPozo(POZO_LIBRES + (num % 20) * 100 + n),
                     dueno: n % 2 === 0 ? { codven: "V0000", nombre: "OFICINA", tipo: "libre" } : null };      // la oficina, o nadie
        }
        const otros = categoria === "cartera" ? carteras : coberturas;
        const d = otros[(num + n) % otros.length];
        return { c: clienteDelPozo(pozoDe(d) + 100 + n), dueno: { codven: d.codven, nombre: d.nombre, tipo: categoria } };
    }

    const fila = (c, ventaC, dueno, nuevo) => ({
        codcli: c.codcli, nombre: c.nombre, venta: ventaC, docs: ventaC > 0 ? 1 + Math.floor(rnd() * 6) : 1 + Math.floor(rnd() * 2),
        atendido: ventaC > 0,
        ultimaCompra: ventaC > 0 ? fechaDe(m, rnd, tope) : fechaDe(mesDe(atras + 1), rnd, 28),
        promedioMensual: nuevo ? 0 : redondear(Math.abs(ventaC) * (0.4 + rnd())),
        otros: [], dueno: dueno, nuevo: nuevo
    });

    const lista = [];

    /* Los clientes de una cartera ajena que atendio (un reemplazo): su suma es lo que dice `reemplazaA`. */
    let deReemplazo = 0, sumaReemplazo = 0;
    entrantes.forEach((r) => {
        const de = porCodusu(r.de);
        repartir(r.venta, 8, rnd).forEach((ventaC, i) => {
            lista.push(fila(clienteDelPozo(pozoDe(de) + i), ventaC, { codven: de.codven, nombre: de.nombre, tipo: "cartera" }, false));
            deReemplazo++;
        });
        sumaReemplazo += r.venta;
    });

    const resto = atendidos - deReemplazo;
    if (atendidos && (resto < 1 || sumaAtendidos - sumaReemplazo <= 0)) throw new Error("simulador-zona: el reemplazo de " + v.nombre + " no cabe en lo que facturo");
    repartir(redondear(sumaAtendidos - sumaReemplazo), resto, rnd).forEach((ventaC, i) => {
        const d = deCategoria(CICLO_DUENOS[(i + num) % 10]);
        lista.push(fila(d.c, ventaC, d.dueno, (i * 5 + num) % 11 === 4));
    });
    negativos.forEach((ventaC, i) => {
        const d = deCategoria(CICLO_DUENOS[(i + 3 + num) % 10]);
        lista.push(fila(d.c, ventaC, d.dueno, false));
    });

    /* Lo que otros le facturaron a un cliente que es suyo segun las facturas: casi nunca, en cuatro. */
    lista.filter((c) => c.atendido && c.dueno && c.dueno.tipo === "propio").filter((c, k) => k % 3 === 0).slice(0, 4).forEach((c, k) => {
        const o = coberturas[(num + k) % coberturas.length];
        c.otros = [{ codven: o.codven, nombre: o.nombre, venta: redondear(250 + rnd() * 2150) }];
    });
    lista.sort(porVenta);

    const atendidosLista = lista.filter((c) => c.atendido);
    const categoriaDe = (c) => (c.dueno ? c.dueno.tipo : "libre");           // sin dueño tambien es libre
    const porDueno = {};
    ["propio", "cartera", "libre", "otro"].forEach((k) => {
        const xs = atendidosLista.filter((c) => categoriaDe(c) === k);
        porDueno[k] = { clientes: xs.length, venta: sumar(xs, (c) => c.venta) };
    });
    const asignadosAtendidos = atendidos ? Math.min(asignados, porDueno.propio.clientes + 1 + num % 4) : 0;
    const nuevos = atendidosLista.filter((c) => c.nuevo);
    const grandes = atendidosLista.slice(0, 5);

    /* En riesgo: sin los clientes que hoy son de la cartera de alguien (a esos los cuida su dueño). */
    const enRiesgo = [];
    for (let i = 0; i < (v.nuevo || !atendidos ? 0 : 8 + num % 12); i++) {
        const c = clienteDelPozo(POZO_RIESGO + (num % 20) * 100 + i);
        enRiesgo.push({ codcli: c.codcli, nombre: c.nombre, venta: 0, docs: 0, atendido: false,
                        ultimaCompra: fechaDe(mesDe(atras + 1 + Math.floor(rnd() * 3)), rnd, 28),
                        promedioMensual: redondear(300 + rnd() * 3500), otros: [], mesesConCompra: 1 + Math.floor(rnd() * 3) });
    }

    return {
        resumen: {
            atendidos: atendidos, porDueno: porDueno,
            asignados: asignados, asignadosAtendidos: asignadosAtendidos, asignadosSinAtender: asignados - asignadosAtendidos,
            porcentajeAsignados: pct(asignadosAtendidos, asignados),
            venta: venta,
            nuevos: { clientes: nuevos.length, venta: sumar(nuevos, (c) => c.venta) },
            concentracion: { clientes: grandes.length, venta: sumar(grandes, (c) => c.venta),
                             porcentaje: venta > 0 && grandes.length ? un_decimal(sumar(grandes, (c) => c.venta) / venta * 100) : null }
        },
        comparacion: comparacionDe(v, atras, atendidos),
        riesgo: riesgoDe(enRiesgo),
        clientes: lista
    };
}

/** GET /v1/zona/cartera y /v1/zona/cobertura: la ruta equivocada para el tipo de ese mes es `400 vendedor de otro tipo`. */
function clientes(tipoRuta, params) {
    params = params || {};
    if (!esZona()) return sinPermiso();

    if (!params.codusu) return error(400, "vendedor requerido", "falta el codusu del vendedor", 2);

    const p = periodoPedido(params);
    if (!p) return error(400, "periodo invalido", "solo se puede pedir el mes en curso y los tres anteriores", 2);

    const v = porCodusu(params.codusu);
    if (!v) return error(404, "vendedor desconocido", "ese usuario no es un vendedor del grupo 20", 2);

    const tipo = tipoDe(v, p.atras);
    if (tipo !== tipoRuta) return error(400, "vendedor de otro tipo", "ese vendedor es de " + tipo.toLowerCase() + " ese mes", 2);

    const m = mesDe(p.atras), actual = p.atras === 0;
    return ok(Object.assign({
        vendedor: { codusu: v.codusu, codven: v.codven, nombre: v.nombre, tipo: tipo },
        anno: m.anno, mes: m.mes, actual: actual,
        corte: actual ? HOY : iso(m.anno, m.mes, diasDel(m.anno, m.mes)),
        actualizado: ACTUALIZADO,
        reemplazadoPor: reemplazadoPorDe(v, p.atras), reemplazaA: reemplazaADe(v, p.atras)
    }, tipoRuta === "CARTERA" ? carteraDe(v, p.atras) : coberturaDe(v, p.atras)));
}

const cartera = (params) => clientes("CARTERA", params);
const cobertura = (params) => clientes("COBERTURA", params);

module.exports = { avance, probabilidad, cartera, cobertura, VENDEDORES, REEMPLAZOS, ESPERADO, quedan, probabilidadDe, semaforo, tipoDe, ANNO, MES, DIA, HOY, ACTUALIZADO };
