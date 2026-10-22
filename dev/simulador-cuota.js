/**
 * Simulacro de `/v1/cuota/marcas*` (grupo 25): la cuota por marca.
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-cuota-marcas.js, por la misma
 * razon que los otros simulacros: dos copias se desalinean. Reproduce el contrato
 * de docs/cuota-grupo25.md (actualizado el 20/10/2026); no lo inventa.
 *
 *   GET  /cuota/marcas        → ver({ anno, mes })     el mes en curso, o uno de los dos anteriores
 *   POST /cuota/marcas/meta   → fijarMeta(cuerpo)
 *   GET  /cuota/revisar       → revisar()              solo lo que responde al grupo 25
 *
 * Las marcas son **las mismas que en reportes** (las asignadas del mes; la
 * jefatura, ademas, las de sus especialistas de su familia), y se leen de
 * dev/simulador-reportes.js. Las metas viven en el estado de marcas
 * (`estado.metas`), asi que se reinician con cada ingreso.
 *
 * El avance es inventado y determinista. Lo que SI es fiel al contrato:
 *
 *   · es la venta de la marca de TODA LA EMPRESA, no la del usuario
 *   · solo el dueño fija la meta, y solo despues de confirmar sus marcas, y solo
 *     en el mes en curso (`puedoFijarMeta`)
 *   · la meta se corrige por partes: un campo que no viene conserva lo que tenia,
 *     y uno en `null` (o "") lo borra. Una meta tiene que ser mayor que 0
 *   · el cumplimiento de `total` y de `porDueno` cuenta SOLO las marcas que tienen
 *     meta en esa medida, y `conMeta` dice cuantas son
 *   · cada marca trae la proyeccion y cuanto de su meta de monto seria
 *   · `metaMesAnterior`: la meta que tuvo esa marca el mes pasado, para precargar
 *   · meses anteriores: hasta dos atras, solo lectura, sin proyeccion. La historia
 *     empieza cuando empieza el modulo de marcas: el mes de hace dos meses no tiene
 *     asignaciones (`sin marcas en ese mes`)
 *
 * No habla HTTP: devuelve `{ status, cuerpo }`.
 */
"use strict";

const marcas = require("./simulador-marcas");
const reportes = require("./simulador-reportes");

const S = marcas.estado;

const ANNO = 2026, MES = 10;
const DIAS = { mes: 31, transcurridos: 19, restantes: 12 };      // 19/10/2026
const ACTUALIZADO = "2026-10-19T16:02:11.000Z";
const ACTUALIZADO_ANTERIOR = "2026-09-04T15:31:57.190Z";

/* Marcas sin venta en el mes: TDK y ADATA, como en bdnava08. */
const SIN_VENTA = ["0002", "0032"];

/* Septiembre vendio mas que lo que octubre lleva hasta hoy: un mes cerrado se ve distinto. */
const FACTOR_MES_ANTERIOR = 1.15;

/* Una marca que no existia en septiembre, y una que se tuvo y ya no se trabaja. */
const NUEVAS_ESTE_MES = ["0206"];
const EX_MARCA = "0161";                     // HIKVISION: en el catalogo, sin dueño y `trabajada: false`

/* La meta que tuvo cada marca en septiembre, la pusiera quien la pusiera. */
const META_MES_ANTERIOR = {
    "0002": { monto: 4000, margen: null, margenPct: null, unidades: 150 },
    "0008": { monto: 12000, margen: null, margenPct: 8, unidades: 60 },
    "0124": { monto: 20000, margen: 900, margenPct: null, unidades: null },
    "0161": { monto: 15000, margen: null, margenPct: null, unidades: null }
};

const redondear = (n) => Math.round(n * 100) / 100;
const yo = () => marcas.yo();

const ok = (data) => ({ status: 200, cuerpo: { status: "ok", codigo: 0, data: data } });
const error = (status, nombre, msg, codigo) => ({ status: status, cuerpo: { status: nombre, codigo: codigo || 3, msg: msg } });

const noIdentificado = () => error(400, "no identificado", "el user no esta registrado en la intranet", 2);

/** `sin marcas del mes`: en el primer nivel, sin `data`. */
const sinMarcas = () => ({ status: 200, cuerpo: {
    status: "sin marcas del mes", codigo: 0, msg: "no tienes marcas este mes; elige y confirma las tuyas",
    debeAsignar: true, marcas: {}
} });

/** `sin marcas en ese mes`: un mes anterior sin asignaciones. Primer nivel, sin `data` y sin `debeAsignar`. */
const sinMarcasEnEseMes = () => ({ status: 200, cuerpo: {
    status: "sin marcas en ese mes", codigo: 0, msg: "no tenias marcas asignadas en ese mes"
} });

/* ------------------------------------------------------------- el avance */
/** Lo vendido en el mes por la marca en TODA la empresa. Determinista. */
function avanceDe(m, factor) {
    if (SIN_VENTA.indexOf(m.codmar) !== -1) return { venta: 0, costo: 0, unidades: 0 };

    const base = Number(m.codmar);
    const f = factor || 1;
    const venta = redondear((8000 + ((base * 37) % 40000) + (base % 7) * 913.37) * f);
    const costo = redondear(venta * (0.88 + (base % 9) / 100));
    return { venta: venta, costo: costo, unidades: Math.round((20 + ((base * 3) % 900)) * f) };
}

/** Porcentaje `a / b × 100`; null si no hay con que comparar. */
const porcentaje = (a, b) => (a === null || a === undefined || !b ? null : redondear(a / b * 100));

const suma = (valores) => redondear(valores.reduce((a, b) => a + b, 0));
const hay = (v) => v !== null && v !== undefined;

/**
 * El resumen de un conjunto de filas `{ meta, avance, proyeccion }`: meta, avance,
 * cumplimiento y proyeccion. **El cumplimiento cuenta solo las marcas que tienen
 * meta en cada medida**, y `conMeta` dice cuantas son. No hay meta de `margenPct`:
 * no se suman porcentajes.
 */
function resumen(filas) {
    const venta = suma(filas.map((f) => f.avance.venta));
    const costo = suma(filas.map((f) => f.avance.costo));
    const unidades = filas.reduce((a, f) => a + f.avance.unidades, 0);
    const margen = redondear(venta - costo);

    const medidas = [["monto", (f) => f.avance.venta], ["margen", (f) => f.avance.venta - f.avance.costo],
                     ["unidades", (f) => f.avance.unidades]];
    const conMeta = {}, meta = {}, cumplimiento = {};

    medidas.forEach(([clave, logrado]) => {
        const con = filas.filter((f) => f.meta && hay(f.meta[clave]));
        conMeta[clave] = con.length;
        meta[clave] = con.length ? suma(con.map((f) => f.meta[clave])) : null;
        cumplimiento[clave] = con.length ? porcentaje(suma(con.map(logrado)), meta[clave]) : null;
    });

    let proyeccion = null;
    if (filas.every((f) => f.proyeccion)) {
        const con = filas.filter((f) => f.meta && hay(f.meta.monto));
        proyeccion = {
            venta: suma(filas.map((f) => f.proyeccion.venta)),
            cumplimiento: { monto: con.length ? porcentaje(suma(con.map((f) => f.proyeccion.venta)), meta.monto) : null }
        };
    }

    return {
        conMeta: conMeta, meta: meta,
        avance: { venta: venta, costo: costo, margen: margen,
                  margenPct: venta > 0 ? redondear(margen / venta * 100) : null, unidades: unidades },
        cumplimiento: cumplimiento, proyeccion: proyeccion
    };
}

/**
 * Una marca. `ctx`: `{ actual, factor, meta, metaMesAnterior, dueno }`.
 * `meta` es la del mes que se mira; en un mes anterior no hay proyeccion.
 */
function marcaDe(m, ctx) {
    const meta = ctx.meta || null;
    const av = avanceDe(m, ctx.factor);
    const margen = redondear(av.venta - av.costo);
    const margenPct = av.venta > 0 ? redondear(margen / av.venta * 100) : null;
    const propia = ctx.dueno === yo();
    const proyectada = redondear(av.venta / DIAS.transcurridos * DIAS.mes);

    return {
        codmar: m.codmar, abrmar: m.abrmar, nombre: m.nombre, familia: marcas.FAMILIAS[m.codfam],
        dueno: { codusu: ctx.dueno, nombre: marcas.NOMBRE_CORTO[ctx.dueno], soyYo: propia },
        confirmada: ctx.actual ? !!S.confirmados[ctx.dueno] : true,
        trabajadaHoy: m.trabajada !== false,
        /* Solo el dueño, solo si ya confirmo y solo este mes: la pantalla muestra el boton segun esto. */
        puedoFijarMeta: ctx.actual && propia && !!S.confirmados[yo()],
        meta: meta ? { monto: meta.monto, margen: meta.margen, margenPct: meta.margenPct,
                       unidades: meta.unidades, actualizado: ctx.actualizado || ACTUALIZADO } : null,
        metaMesAnterior: ctx.metaMesAnterior
            ? Object.assign({}, ctx.metaMesAnterior, { actualizado: ACTUALIZADO_ANTERIOR }) : null,
        avance: { venta: av.venta, costo: av.costo, margen: margen, margenPct: margenPct, unidades: av.unidades },
        cumplimiento: {
            monto: porcentaje(av.venta, meta && meta.monto),
            margen: porcentaje(margen, meta && meta.margen),
            margenPct: porcentaje(margenPct, meta && meta.margenPct),
            unidades: porcentaje(av.unidades, meta && meta.unidades)
        },
        proyeccion: ctx.actual
            ? { venta: proyectada, cumplimiento: { monto: porcentaje(proyectada, meta && meta.monto) } }
            : null
    };
}

/* ----------------------------------------------------------------- rutas */

const HOY = ANNO * 12 + (MES - 1);

/** El periodo pedido: `null` si no hay (el mes en curso), o `{ atras }`; `false` si no vale. */
function periodoPedido(params) {
    params = params || {};
    const sinAnno = params.anno === undefined || params.anno === null || params.anno === "";
    const sinMes = params.mes === undefined || params.mes === null || params.mes === "";

    if (sinAnno && sinMes) return { atras: 0 };
    if (sinAnno || sinMes) return false;

    const anno = Number(params.anno), mes = Number(params.mes);
    if (!Number.isInteger(anno) || !Number.isInteger(mes) || mes < 1 || mes > 12) return false;

    const atras = HOY - (anno * 12 + (mes - 1));
    if (atras < 0 || atras > 2) return false;

    return { atras: atras, anno: anno, mes: mes };
}

const diasDelMes = (anno, mes) => new Date(anno, mes, 0).getDate();

/** Las marcas del mes anterior y de quien eran: las de ahora, salvo lo que cambio con los meses. */
function marcasDelMesAnterior() {
    const ahora = reportes.consultables().filter((m) => NUEVAS_ESTE_MES.indexOf(m.codmar) === -1)
        .map((m) => ({ m: m, dueno: m.dueno }));
    const ex = marcas.buscarMarca(EX_MARCA);
    return ahora.concat(ex ? [{ m: ex, dueno: yo() }] : [])
        .sort((a, b) => a.m.nombre.localeCompare(b.m.nombre));
}

/** GET /v1/cuota/marcas   (`?anno=2026&mes=9` para un mes anterior) */
function ver(params) {
    if (!S.yaRegistrado) return noIdentificado();

    const p = periodoPedido(params);
    if (!p) {
        return error(400, "periodo invalido", "solo se puede pedir el mes en curso y los dos anteriores", 2);
    }

    const actual = p.atras === 0;

    /* La historia empieza cuando empieza el modulo de marcas. */
    if (p.atras === 2) return sinMarcasEnEseMes();

    let filas;     // `{ m, dueno, meta, metaMesAnterior, ... }` por marca
    if (actual) {
        const lista = reportes.consultables();
        if (!lista.length) return sinMarcas();
        filas = lista.map((m) => ({ m: m, dueno: m.dueno }));
    } else {
        filas = marcasDelMesAnterior();
        if (!filas.length) return sinMarcasEnEseMes();
    }

    const marcasPintadas = filas.map((f) => marcaDe(f.m, {
        actual: actual, dueno: f.dueno,
        factor: actual ? 1 : FACTOR_MES_ANTERIOR,
        meta: actual ? S.metas[f.m.codmar] : META_MES_ANTERIOR[f.m.codmar],
        actualizado: actual ? ACTUALIZADO : ACTUALIZADO_ANTERIOR,
        metaMesAnterior: actual ? META_MES_ANTERIOR[f.m.codmar] : null
    }));

    const datos = (lista) => resumen(lista.map((x) => ({ meta: x.meta, avance: x.avance, proyeccion: x.proyeccion })));

    const anno = actual ? ANNO : p.anno, mes = actual ? MES : p.mes;
    const data = {
        anno: anno, mes: mes, actual: actual, rol: S.rol,
        dias: actual ? DIAS : { mes: diasDelMes(anno, mes), transcurridos: diasDelMes(anno, mes), restantes: 0 },
        marcas: marcasPintadas,
        total: Object.assign({ marcas: marcasPintadas.length }, datos(marcasPintadas))
    };

    /* La jefatura, ademas, el general de cada uno: sus especialistas y ella misma,
       con quien tenia cada marca EN ESE MES. */
    if (S.rol === "JEFATURA") {
        const porUsuario = {};
        marcasPintadas.forEach((x) => { (porUsuario[x.dueno.codusu] = porUsuario[x.dueno.codusu] || []).push(x); });

        data.porDueno = Object.keys(porUsuario)
            .map((codusu) => Object.assign(
                { dueno: { codusu: codusu, nombre: marcas.NOMBRE_CORTO[codusu], soyYo: codusu === yo() },
                  marcas: porUsuario[codusu].length },
                datos(porUsuario[codusu])))
            .sort((a, b) => a.dueno.nombre.localeCompare(b.dueno.nombre));
    }

    return ok(data);
}

/**
 * GET /v1/cuota/revisar para el grupo 25: la entrada de «Registrar» cuota es de
 * cobertura y cartera, y a este grupo le dice que su cuota se fija por marca. La
 * pantalla decide por este `status`, no por el tipo de /vendedor.
 */
function revisar() {
    return { status: 200, cuerpo: {
        status: "cuota por marca", codigo: 0, aplica: false, ruta: "/v1/cuota/marcas",
        msg: "tu cuota no se registra aqui: se fija por marca, en tu cuota por marca"
    } };
}

const CAMPOS = ["monto", "margen", "margenPct", "unidades"];

/** POST /v1/cuota/marcas/meta */
function fijarMeta(cuerpo) {
    cuerpo = cuerpo || {};
    if (!S.yaRegistrado) return noIdentificado();

    if (!/^\d{4}$/.test(String(cuerpo.codmar || ""))) {
        return error(400, "codmar invalido", "falta el codmar o no tiene 4 digitos", 2);
    }

    /* «Vino» es que la clave este, aunque sea en null: asi se borra una meta. */
    const vienen = CAMPOS.filter((k) => Object.prototype.hasOwnProperty.call(cuerpo, k));
    if (!vienen.length) {
        return error(400, "meta vacia", "no vino ninguno de monto, margen, margenPct ni unidades", 2);
    }

    const nuevo = {};
    for (const k of vienen) {
        const v = cuerpo[k];

        if (v === null || String(v).trim() === "") { nuevo[k] = null; continue; }

        /* Una meta de 0 no existe: «sin meta» y «meta cero» no se confunden. */
        const n = Number(v);
        const malo = !isFinite(n) || n <= 0 || (k === "unidades" && !Number.isInteger(n)) || (k === "margenPct" && n > 100);
        if (malo) {
            return error(400, "meta invalida",
                "un valor es 0 o negativo, o no es numerico, las unidades llevan decimales, o margenPct pasa de 100", 2);
        }
        nuevo[k] = k === "unidades" ? n : redondear(n);
    }

    const m = reportes.consultables().find((x) => x.codmar === cuerpo.codmar);
    if (!m || m.dueno !== yo()) {
        return error(403, "meta solo del dueno", "la meta la fija el dueño de la marca, y esta no es tuya este mes");
    }
    if (!S.confirmados[yo()]) {
        return error(409, "marcas sin confirmar", "confirma tus marcas del mes para poder fijar la meta");
    }

    const antes = S.metas[m.codmar] || null;
    const meta = Object.assign({ monto: null, margen: null, margenPct: null, unidades: null }, antes || {}, nuevo);
    S.metas[m.codmar] = meta;

    return ok({ codmar: m.codmar, anno: ANNO, mes: MES, nueva: !antes,
                meta: { monto: meta.monto, margen: meta.margen, margenPct: meta.margenPct, unidades: meta.unidades } });
}

/* `periodoPedido` y `marcasDelMesAnterior` tambien los usa la cobertura: las marcas y los meses que se pueden ver son los mismos. */
module.exports = { ver, fijarMeta, revisar, periodoPedido, marcasDelMesAnterior, DIAS, ANNO, MES, META_MES_ANTERIOR };
