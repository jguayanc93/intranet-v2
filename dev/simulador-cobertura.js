/**
 * Simulacro de `/v1/cobertura/*` (grupo 25): a que clientes se les vendio cada marca.
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-cobertura.js, por la misma razon que los otros
 * simulacros: dos copias se desalinean. Reproduce el contrato de docs/cobertura-grupo25.md; no lo
 * inventa.
 *
 *   GET /cobertura/marcas                    → marcas({ anno, mes })      cada marca: clientes, unidades y venta
 *   GET /cobertura/clientes?codmar=0008      → clientes({ codmar, anno, mes })
 *
 * **No es la cobertura del grupo 20** (`/cuota/cobertura`): esa es la cuota de los vendedores de tipo
 * COBERTURA y no se toca.
 *
 * Las marcas son las mismas que en cuota y reportes (las asignadas del mes; la jefatura, ademas, las de
 * sus especialistas) y los meses, los mismos: el en curso y los dos anteriores, y el de hace dos meses no
 * tiene asignaciones (`sin marcas en ese mes`). Los clientes son inventados y deterministas. Lo que SI es
 * fiel al contrato:
 *
 *   · un cliente de la marca es uno al que **le quedaron unidades compradas** (mas de 0, ya descontadas
 *     las devoluciones). Quien solo devolvio sale en la lista, con unidades y venta negativas, y NO cuenta
 *     en `clientes`
 *   · `total.clientes` de la lista de marcas son clientes DISTINTOS: uno que compro dos marcas cuenta una
 *     vez, asi que no es la suma de los `clientes` de cada marca. Unidades y venta si son la suma
 *   · en la lista de clientes, `total.clientes` cuenta solo los de unidades > 0; unidades y venta suman a
 *     todos, tambien a los que solo devolvieron
 *   · `marcas` va ordenada por nombre y `clientes` por venta, de mayor a menor
 *   · una marca sin ventas viene con ceros, no se omite
 *   · todo en dolares y sin IGV
 *
 * Actualizado con docs/cobertura-grupo25.md del 21/10/2026: `/clientes` trae `columnas`, se exporta a Excel con
 * `&formato=xlsx` (todos los clientes, en el mismo orden que el JSON, y si algo falla la respuesta es el JSON de error,
 * nunca un archivo), `formato invalido` y `unidades` en 0 que no siempre es «devolvio todo»: tambien notas de credito
 * sin unidades o solo notas de debito. Sin tope de filas.
 *
 * No habla HTTP: devuelve `{ status, cuerpo }`, o `{ status, archivo }` para el Excel.
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

/** `sin marcas del mes`: en el primer nivel, sin `data` y con `debeAsignar`. */
const sinMarcas = () => ({ status: 200, cuerpo: {
    status: "sin marcas del mes", codigo: 0, msg: "no tienes marcas este mes; elige y confirma las tuyas",
    debeAsignar: true, marcas: {}
} });

/** `sin marcas en ese mes`: un mes anterior sin asignaciones. Primer nivel, sin `data` y sin `debeAsignar`. */
const sinMarcasEnEseMes = () => ({ status: 200, cuerpo: {
    status: "sin marcas en ese mes", codigo: 0, msg: "no tenias marcas asignadas en ese mes"
} });

/* ----------------------------------------------------------------- los clientes */
const CLIENTES_TOTAL = 150;

const NOMBRES_A = ["COMERCIAL", "INVERSIONES", "CORPORACION", "DISTRIBUIDORA", "IMPORTACIONES", "SERVICIOS", "TECNOLOGIA",
                   "GRUPO", "MULTISERVICIOS", "ELECTRONICA"];
const NOMBRES_B = ["ANDINA", "LIMA SUR", "DEL PACIFICO", "MEGAHARD", "NORTE", "CENTRAL", "PERU DIGITAL", "OK.COM", "ALFA",
                   "INNOVA", "ZENIT", "PRISMA", "TRADING", "SELVA", "CUSCO"];
const SUFIJOS = ["S.A.C.", "E.I.R.L.", "S.R.L.", "S.A."];

/** El cliente `i` del catalogo inventado: nombre, RUC y codigo del ERP, todos distintos. */
function clienteN(i) {
    return {
        codcli: "C" + String(10000 + i * 7),
        ruc: "20" + String(100000000 + i * 3917 + (i % 7) * 1000003).slice(0, 9),
        nombre: NOMBRES_A[i % NOMBRES_A.length] + " " + NOMBRES_B[(i * 7 + Math.floor(i / 10)) % NOMBRES_B.length] + " " +
                String(i + 1).padStart(3, "0") + " " + SUFIJOS[i % SUFIJOS.length]
    };
}
const CLIENTES = Array.from({ length: CLIENTES_TOTAL }, (_, i) => clienteN(i));

/* Marcas con un tamaño que prueba algo: EPSON es grande (hay mas de lo que se pinta de una vez) y TDK no vende. */
const CUANTOS = { "0008": 130, "0124": 17 };
const SIN_VENTA = ["0002"];
/* ADATA solo tuvo devoluciones: no tiene clientes, pero en la lista sale quien devolvio. */
const SOLO_DEVOLUCIONES = { "0032": [{ i: 5, unidades: -2, venta: -85.4, comprobantes: 1 }] };
/* Quien queda en 0 unidades sin haber «devuelto todo»: una nota de credito sin unidades (rebaja de precio: resta venta) y
   una nota de debito (suma venta, no mueve mercaderia). Ninguno cuenta como cliente. */
const CON_CERO = { "0124": [{ i: 9, venta: -15.2, comprobantes: 1 }, { i: 12, venta: 30.4, comprobantes: 1 }] };
/* Una marca con un cliente que devolvio de mas, entre los que si compraron. */
const CON_DEVOLUCION = { "0003": { i: 3, unidades: -3, venta: -120.5, comprobantes: 1 } };

/* Septiembre vendio mas por cliente que lo que octubre lleva hasta hoy: un mes cerrado se ve distinto. */
const FACTOR_MES_ANTERIOR = 1.15;

/**
 * Las filas de una marca en un mes: `{ cliente, unidades, venta, comprobantes, ultimaCompra }`, sin ordenar.
 * Una ventana del catalogo desde un punto que depende de la marca, asi dos marcas comparten clientes.
 */
function filasDe(m, atras) {
    const base = Number(m.codmar);
    if (SIN_VENTA.indexOf(m.codmar) !== -1) return [];

    if (SOLO_DEVOLUCIONES[m.codmar]) {
        return SOLO_DEVOLUCIONES[m.codmar].map((d) => ({
            cliente: CLIENTES[d.i], unidades: d.unidades, venta: d.venta, comprobantes: d.comprobantes,
            ultimaCompra: fecha(atras, 3 + d.i)
        }));
    }

    const n = CUANTOS[m.codmar] || 3 + ((base * 7) % 38);
    const inicio = (base * 11) % CLIENTES_TOTAL;
    const f = atras === 0 ? 1 : FACTOR_MES_ANTERIOR;

    const filas = [];
    for (let k = 0; k < n; k++) {
        const i = (inicio + k) % CLIENTES_TOTAL;
        /* En un mes anterior no compro el mismo grupo: se corre la ventana un poco. */
        if (atras > 0 && (k + base) % 5 === 0) continue;

        const unidades = Math.max(1, Math.round((1 + ((i * 13 + base) % 60)) * f));
        const precio = 5 + ((base * 3 + i * 7) % 180) + ((i % 9) / 10);
        filas.push({
            cliente: CLIENTES[i], unidades: unidades, venta: redondear(unidades * precio),
            comprobantes: 1 + (i % 4), ultimaCompra: fecha(atras, 1 + ((i * 5 + base) % 19))
        });
    }

    (CON_CERO[m.codmar] || []).forEach((z) => {
        const antes = filas.findIndex((x) => x.cliente === CLIENTES[z.i]);
        if (antes !== -1) filas.splice(antes, 1);
        filas.push({ cliente: CLIENTES[z.i], unidades: 0, venta: z.venta, comprobantes: z.comprobantes, ultimaCompra: fecha(atras, 7) });
    });

    const dev = CON_DEVOLUCION[m.codmar];
    if (dev) {
        const i = dev.i;
        const antes = filas.findIndex((x) => x.cliente === CLIENTES[i]);
        if (antes !== -1) filas.splice(antes, 1);
        filas.push({ cliente: CLIENTES[i], unidades: dev.unidades, venta: dev.venta, comprobantes: dev.comprobantes,
                     ultimaCompra: fecha(atras, 6) });
    }
    return filas;
}

/** `AAAA-MM-DD` del dia `d` del mes que esta `atras` meses del actual. */
function fecha(atras, d) {
    const t = ANNO * 12 + (MES - 1) - atras;
    const anno = Math.floor(t / 12), mes = (t % 12) + 1;
    return anno + "-" + String(mes).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}

const suma = (valores) => redondear(valores.reduce((a, b) => a + b, 0));

/** Los clientes de la marca: los que se quedaron con unidades. */
const cuentan = (filas) => filas.filter((f) => f.unidades > 0);

/* ------------------------------------------------------------------ lo que se puede ver */

/**
 * Las marcas de ese mes, con quien tenia cada una: las de ahora, o las de entonces. `null` si no hay
 * ninguna, y `false` si el periodo no vale.
 */
function marcasDelPeriodo(params) {
    const p = cuota.periodoPedido(params);
    if (!p) return { error: error(400, "periodo invalido", "solo se puede pedir el mes en curso y los dos anteriores", 2) };

    /* La historia empieza cuando empieza el modulo de marcas. */
    if (p.atras === 2) return { error: sinMarcasEnEseMes() };

    if (p.atras === 0) {
        const lista = reportes.consultables();
        if (!lista.length) return { error: sinMarcas() };
        return { p: p, marcas: lista.map((m) => ({ m: m, dueno: m.dueno })) };
    }

    const lista = cuota.marcasDelMesAnterior();
    if (!lista.length) return { error: sinMarcasEnEseMes() };
    return { p: p, marcas: lista };
}

const duenoDe = (dueno) => ({ codusu: dueno, nombre: marcas.NOMBRE_CORTO[dueno], soyYo: dueno === yo() });

const periodoDe = (p) => {
    const actual = p.atras === 0;
    return { anno: actual ? ANNO : p.anno, mes: actual ? MES : p.mes, actual: actual };
};

/** GET /v1/cobertura/marcas   (`?anno=2026&mes=9` para un mes anterior) */
function marcasDelMes(params) {
    if (!esGrupo25()) return sinPermiso();
    if (!S.yaRegistrado) return noIdentificado();

    const r = marcasDelPeriodo(params);
    if (r.error) return r.error;

    const porMarca = r.marcas.map((x) => ({ x: x, filas: filasDe(x.m, r.p.atras) }));

    const lista = porMarca.map(({ x, filas }) => ({
        codmar: x.m.codmar, abrmar: x.m.abrmar, nombre: x.m.nombre, familia: marcas.FAMILIAS[x.m.codfam],
        dueno: duenoDe(x.dueno),
        clientes: cuentan(filas).length, unidades: filas.reduce((a, f) => a + f.unidades, 0), venta: suma(filas.map((f) => f.venta))
    })).sort((a, b) => a.nombre.localeCompare(b.nombre));

    /* Clientes DISTINTOS entre todas las marcas: uno que compro dos cuenta una vez. */
    const distintos = new Set();
    porMarca.forEach(({ filas }) => cuentan(filas).forEach((f) => distintos.add(f.cliente.codcli)));

    return ok(Object.assign(periodoDe(r.p), {
        rol: S.rol,
        marcas: lista,
        total: { clientes: distintos.size, unidades: lista.reduce((a, m) => a + m.unidades, 0), venta: suma(lista.map((m) => m.venta)) }
    }));
}

/** Las columnas del Excel y de `columnas` en el JSON, en ese orden. */
const COLUMNAS = [
    { campo: "codcli", titulo: "CODIGO" }, { campo: "ruc", titulo: "RUC" }, { campo: "nombre", titulo: "CLIENTE" },
    { campo: "unidades", titulo: "UNIDADES" }, { campo: "venta", titulo: "VENTA US$ SIN IGV" },
    { campo: "comprobantes", titulo: "COMPROBANTES" }, { campo: "ultimaCompra", titulo: "ULTIMA COMPRA" }
];

/** GET /v1/cobertura/clientes?codmar=0008   (`&anno=2026&mes=9` para un mes anterior, `&formato=xlsx` para el Excel) */
function clientes(params) {
    params = params || {};
    if (!esGrupo25()) return sinPermiso();
    if (!S.yaRegistrado) return noIdentificado();

    if (!/^\d{4}$/.test(String(params.codmar || ""))) {
        return error(400, "codmar invalido", "falta el codmar o no tiene 4 digitos", 2);
    }

    /* `formato` es json (por defecto) o xlsx, mayusculas o minusculas. */
    const formato = params.formato === undefined || params.formato === null || params.formato === "" ? "json" : String(params.formato).toLowerCase();
    if (formato !== "json" && formato !== "xlsx") {
        return error(400, "formato invalido", "el formato es json o xlsx", 2);
    }

    const r = marcasDelPeriodo(params);
    if (r.error) {
        /* Con un codmar en la mano, un periodo malo sigue siendo un periodo malo; sin marcas, la marca no esta disponible. */
        if (r.error.cuerpo.status === "periodo invalido") return r.error;
        return error(403, "marca no disponible", "esa marca no esta entre las que puedes consultar ese mes");
    }

    const x = r.marcas.find((y) => y.m.codmar === params.codmar);
    if (!x) return error(403, "marca no disponible", "esa marca no esta entre las que puedes consultar ese mes");

    const filas = filasDe(x.m, r.p.atras)
        .sort((a, b) => b.venta - a.venta || a.cliente.nombre.localeCompare(b.cliente.nombre));

    const clientes = filas.map((f) => ({
        codcli: f.cliente.codcli, ruc: f.cliente.ruc, nombre: f.cliente.nombre,
        unidades: f.unidades, venta: f.venta, comprobantes: f.comprobantes, ultimaCompra: f.ultimaCompra
    }));

    if (formato === "xlsx") {
        const periodo = periodoDe(r.p);
        return { status: 200, archivo: {
            tipo: reportes.TIPO_XLSX,
            nombre: "clientes-" + x.m.abrmar + "-" + periodo.anno + "-" + String(periodo.mes).padStart(2, "0") + ".xlsx",
            contenido: reportes.crearXlsx("clientes", COLUMNAS, clientes)
        } };
    }

    return ok(Object.assign(periodoDe(r.p), {
        marca: { codmar: x.m.codmar, abrmar: x.m.abrmar, nombre: x.m.nombre, familia: marcas.FAMILIAS[x.m.codfam], dueno: duenoDe(x.dueno) },
        columnas: COLUMNAS,
        clientes: clientes,
        total: { clientes: cuentan(filas).length, unidades: filas.reduce((a, f) => a + f.unidades, 0), venta: suma(filas.map((f) => f.venta)) }
    }));
}

module.exports = { marcas: marcasDelMes, clientes, COLUMNAS, CLIENTES, ANNO, MES };
