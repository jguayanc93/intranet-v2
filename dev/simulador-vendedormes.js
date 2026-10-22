/**
 * Simulacro de `/v1/vendedormes/top` (grupo 25): el vendedor del mes.
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-vendedormes.js, por la misma razon que los otros
 * simulacros: dos copias se desalinean. Reproduce el contrato de docs/vendedor-mes-grupo25.md (22/10/2026, segunda
 * version); no lo inventa.
 *
 *   GET /vendedormes/top                    → top({})                  el mes en curso
 *   GET /vendedormes/top?anno=2026&mes=9    → top({ anno, mes })       el mes anterior, y nada mas
 *
 * De cada marca, **los 3 vendedores del grupo 20 que mas la vendieron en el mes**. Las marcas son las mismas
 * que en cuota, reportes y cobertura (las asignadas del mes; la jefatura, ademas, las de sus especialistas),
 * y el mes anterior sale de las marcas de entonces, como en cuota. Los vendedores y sus ventas son
 * inventados y deterministas. Lo que SI es fiel al contrato:
 *
 *   · el ranking es solo de **vendedores del grupo 20** (cobertura o cartera); `tipo` es `null` si el
 *     vendedor aun no se registro en la intranet
 *   · `total.venta` es lo que vendio TODO el grupo 20 de esa marca: **no es el avance de la cuota**, que mide la
 *     marca en toda la empresa. `total.vendedores` son todos los que la vendieron, no solo los 3 del top
 *   · el top son los 3 de mayor venta; si la vendieron menos de 3 vienen menos, y si nadie, `top: []`
 *   · `participacion` es el % de `total.venta`; `unidades` son netas y `clientes`, distintos
 *   · `anterior` es el puesto y la venta de ese vendedor en esa marca **el mes anterior al que se mira**
 *     (viendo octubre, septiembre; viendo septiembre, agosto). El puesto puede ser mayor que 3 y es `null` si
 *     entonces no la vendio. `tendencia`: `sube` (antes estaba mas abajo), `baja`, `igual` o `nuevo`
 *   · solo el mes en curso y el anterior: otro mes, uno futuro, o `anno` sin `mes`, es `400 mes no disponible`
 *   · **solo vendedores con venta neta mayor que 0**: el que devolvio igual o mas de lo que vendio de esa marca no
 *     entra en el top, ni en `total.vendedores`, ni en `total.venta`. Asi el total, el numero de vendedores y la
 *     participacion salen del mismo grupo, y nunca llega una venta ni una participacion en cero o negativa
 *   · **desempate**: con la misma venta (al centimo) va primero el de mas unidades, luego el de mas clientes y, si
 *     todo empata, el de menor codigo de vendedor. Es fijo: no cambia entre dos lecturas
 *   · `ventasHasta`: el ultimo dia del mes con ventas registradas (de todas las marcas), `AAAA-MM-DD`; `null` si el
 *     mes no tiene ventas
 *
 * No habla HTTP: devuelve `{ status, cuerpo }`.
 */
"use strict";

const marcas = require("./simulador-marcas");
const reportes = require("./simulador-reportes");
const cuota = require("./simulador-cuota");

const S = marcas.estado;

const ANNO = cuota.ANNO, MES = cuota.MES;

const redondear = (n) => Math.round(n * 100) / 100;
const yo = () => marcas.yo();
const esGrupo25 = () => S.rol === "ESPECIALISTA" || S.rol === "JEFATURA";

const ok = (data) => ({ status: 200, cuerpo: { status: "ok", codigo: 0, data: data } });
const error = (status, nombre, msg, codigo) => ({ status: status, cuerpo: { status: nombre, codigo: codigo || 3, msg: msg } });

const noIdentificado = () => error(400, "no identificado", "el user no esta registrado en la intranet", 2);
const sinPermiso = () => error(403, "sin permiso", "esta ruta es del grupo 25");

const sinMarcas = () => ({ status: 200, cuerpo: {
    status: "sin marcas del mes", codigo: 0, msg: "no tienes marcas este mes; elige y confirma las tuyas",
    debeAsignar: true, marcas: {}
} });

const sinMarcasEnEseMes = () => ({ status: 200, cuerpo: {
    status: "sin marcas en ese mes", codigo: 0, msg: "no tenias marcas asignadas en ese mes"
} });

/* ------------------------------------------------------------ los vendedores del grupo 20 */
const VENDEDORES = [
    { codven: "V0229", nombre: "GUTIERREZ ALINA", tipo: "CARTERA" },
    { codven: "V0334", nombre: "GONZALES JUAN", tipo: "COBERTURA" },
    { codven: "V0336", nombre: "JIMENEZ VILLANUEVA FERNANDO", tipo: "CARTERA" },
    { codven: "V0241", nombre: "ROJAS QUISPE LUZ MARINA", tipo: "COBERTURA" },
    { codven: "V0198", nombre: "TORRES AGUIRRE CARLOS", tipo: "CARTERA" },
    { codven: "V0275", nombre: "MENDOZA DEL CARPIO ROSA", tipo: "COBERTURA" },
    { codven: "V0312", nombre: "CASTILLO FLORES DIEGO", tipo: "CARTERA" },
    /* Aun no se registro en la intranet: vende, pero no se sabe de que tipo es. */
    { codven: "V0350", nombre: "VARGAS SALAS PEDRO", tipo: null },
    { codven: "V0187", nombre: "SALAZAR PAREDES ANA", tipo: "COBERTURA" },
    { codven: "V0263", nombre: "HUAMAN CCORI JESUS", tipo: "CARTERA" },
    { codven: "V0301", nombre: "LOPEZ GARCIA MARIA ELENA", tipo: "COBERTURA" },
    { codven: "V0222", nombre: "RAMIREZ SOTO JORGE", tipo: "CARTERA" }
];

/* Marcas con un reparto que prueba algo: TDK no la vendio nadie, y ADATA solo dos. */
const SIN_VENTA = ["0002"];
const SOLO_DOS = ["0032"];

/* Quien devolvio mas de lo que vendio de una marca: su neta es negativa, y no entra en nada. */
const NETO_NEGATIVO = { "0008": ["V0241"] };

/* Hasta que dia hay ventas registradas, de todas las marcas: el en curso llega hasta el 19 (como la cuota), el anterior esta cerrado. */
const VENTAS_HASTA = { actual: ANNO + "-" + String(MES).padStart(2, "0") + "-19", anterior: ANNO + "-" + String(MES - 1).padStart(2, "0") + "-30" };

/**
 * El desempate: la misma venta (al centimo) → mas unidades → mas clientes → menor codigo de vendedor. `a` y `b` son
 * filas `{ vendedor, venta, unidades, clientes }`; devuelve lo que pide `Array.sort`.
 */
function comparar(a, b) {
    return (Math.round(b.venta * 100) - Math.round(a.venta * 100)) ||
           (b.unidades - a.unidades) ||
           (b.clientes - a.clientes) ||
           (a.vendedor.codven < b.vendedor.codven ? -1 : a.vendedor.codven > b.vendedor.codven ? 1 : 0);
}

/**
 * Lo que vendio cada vendedor del grupo 20 de una marca en un mes (`atras` meses antes del actual), de mayor a
 * menor: `[{ vendedor, venta, unidades, clientes }]`. Solo los que vendieron algo.
 */
function ventasDe(m, atras) {
    if (SIN_VENTA.indexOf(m.codmar) !== -1) return [];

    const base = Number(m.codmar);
    const filas = [];

    VENDEDORES.forEach((v, i) => {
        if ((base + i * 5 + atras * 2) % 3 === 0) return;                // un tercio no la vendio ese mes

        let venta = redondear((400 + ((base * 53 + i * 1291 + atras * 733) % 12000)) * (1 + ((i * 5 + base + atras) % 7) / 8) + i * 0.01);
        if ((NETO_NEGATIVO[m.codmar] || []).indexOf(v.codven) !== -1) venta = -redondear(venta / 10);

        filas.push({ vendedor: v, venta: venta, unidades: 5 + Math.floor(venta / 37), clientes: 1 + ((i * 3 + base) % 40) });
    });

    /* Solo los de venta neta mayor que 0: ni en el top, ni en el total, ni en el numero de vendedores. */
    const positivas = filas.filter((f) => f.venta > 0).sort(comparar);
    return SOLO_DOS.indexOf(m.codmar) !== -1 ? positivas.slice(0, 2) : positivas;
}

const suma = (valores) => redondear(valores.reduce((a, b) => a + b, 0));

/** El puesto y la venta de un vendedor en el ranking de otro mes, o `null`. */
function enRanking(filas, codven) {
    const i = filas.findIndex((f) => f.vendedor.codven === codven);
    return i === -1 ? { puesto: null, venta: null } : { puesto: i + 1, venta: filas[i].venta };
}

/** La marca con su total y su top, comparado con el mes anterior al que se mira. */
function marcaDe(m, dueno, atras) {
    const filas = ventasDe(m, atras);
    const anteriores = ventasDe(m, atras + 1);
    const total = suma(filas.map((f) => f.venta));

    const top = filas.slice(0, 3).map((f, i) => {
        const antes = enRanking(anteriores, f.vendedor.codven);
        const tendencia = antes.puesto === null ? "nuevo" : antes.puesto > i + 1 ? "sube" : antes.puesto < i + 1 ? "baja" : "igual";

        return {
            puesto: i + 1, codven: f.vendedor.codven, nombre: f.vendedor.nombre, tipo: f.vendedor.tipo,
            venta: f.venta, participacion: total > 0 ? redondear(f.venta / total * 100) : 0,
            unidades: f.unidades, clientes: f.clientes,
            anterior: antes, tendencia: tendencia
        };
    });

    return {
        codmar: m.codmar, abrmar: m.abrmar, nombre: m.nombre, familia: marcas.FAMILIAS[m.codfam],
        dueno: { codusu: dueno, nombre: marcas.NOMBRE_CORTO[dueno], soyYo: dueno === yo() },
        total: { venta: total, vendedores: filas.length },
        top: top
    };
}

/* ------------------------------------------------------------------------------ la ruta */

/** El periodo pedido: `{ atras: 0 }` o `{ atras: 1, anno, mes }`; `false` si no vale (otro mes, futuro, `anno` sin `mes`). */
function periodoPedido(params) {
    const p = cuota.periodoPedido(params);
    if (!p || p.atras > 1) return false;
    return p;
}

/** GET /v1/vendedormes/top   (`?anno=2026&mes=9` para el mes anterior) */
function top(params) {
    if (!esGrupo25()) return sinPermiso();
    if (!S.yaRegistrado) return noIdentificado();

    const p = periodoPedido(params);
    if (!p) return error(400, "mes no disponible", "solo se puede pedir el mes en curso y el anterior", 2);

    const actual = p.atras === 0;
    let lista;

    if (actual) {
        lista = reportes.consultables().map((m) => ({ m: m, dueno: m.dueno }));
        if (!lista.length) return sinMarcas();
    } else {
        lista = cuota.marcasDelMesAnterior().map((x) => ({ m: x.m, dueno: x.dueno }));
        if (!lista.length) return sinMarcasEnEseMes();
    }

    return ok({
        anno: actual ? ANNO : p.anno, mes: actual ? MES : p.mes, actual: actual, rol: S.rol,
        ventasHasta: actual ? VENTAS_HASTA.actual : VENTAS_HASTA.anterior,
        marcas: lista.map((x) => marcaDe(x.m, x.dueno, p.atras))
    });
}

/** Lo que vendio cada vendedor de una marca, ya sin los de venta neta menor o igual a 0, para comparar con el total. */
const vendedoresDe = (codmar, atras) => ventasDe({ codmar: codmar }, atras || 0);

module.exports = { top, comparar, vendedoresDe, VENDEDORES, NETO_NEGATIVO, ANNO, MES };
