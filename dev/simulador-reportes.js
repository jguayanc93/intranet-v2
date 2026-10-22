/**
 * Simulacro de `/v1/reporte/marca*` (grupo 25).
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-reportes.js, por la misma
 * razon que dev/simulador-marcas.js: dos copias se desalinean. Reproduce el
 * contrato de docs/reportes-grupo25.md; no lo inventa.
 *
 * Depende del simulacro de marcas, porque **que marcas puede consultar alguien
 * es lo que tiene este mes**: se lee de ahi, no se repite.
 *
 *   GET  /reporte/marca            → listar()
 *   POST /reporte/marca/{stock|tiempo|precios|guias}   → informe(nombre, cuerpo)
 *
 * No habla HTTP. Devuelve `{ status, cuerpo }` para JSON, o
 * `{ status: 200, archivo: { tipo, nombre, contenido } }` para el Excel; quien
 * lo use pone las cabeceras. Los productos y las guias son inventados y
 * deterministas.
 *
 * El `.xlsx` es REAL, y se comporta como describe el backend: las fechas son
 * fechas de Excel (`dd/mm/yyyy`), los importes numeros con `#,##0.00`, y las
 * celdas sin dato llevan un texto que explica por que. Se ha abierto en Excel.
 */
"use strict";

const zlib = require("zlib");
const marcas = require("./simulador-marcas");

const S = marcas.estado;

/* Todo lo que depende del dia. Fijo, para que las pruebas no cambien con la fecha. */
const HOY = Date.UTC(2026, 9, 16);                 // 16/10/2026
const ANNO = 2026, MES = 10;
const GENERADO = "2026-10-16T20:14:03.512Z";

/* En bdnava08 las guias llegan hasta el 09/10/2026 (es una copia), asi que las
   de octubre aun no tienen su salida. */
const LIMITE_GUIAS = Date.UTC(2026, 9, 9);
const MES_EN_CURSO = { desde: "2026-10-01", hasta: "2026-10-31" };
const MAX_DIAS = 92;                               // «maximo 3 meses», contando los dos extremos

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Estado tocable, para armar escenarios. */
const R = {
    kardexDesde: 2023
};

/* ------------------------------------------------------------ columnas */
const BASE = [
    { campo: "codi", titulo: "CODIGO" },
    { campo: "codf", titulo: "CODF" },
    { campo: "descripcion", titulo: "DESCRIPCION" },
    { campo: "partNumber", titulo: "PART NUMBER" },
    { campo: "familia", titulo: "FAMILIA" }
];

const COLUMNAS = {
    stock: BASE.concat([
        { campo: "principal", titulo: "PRINCIPAL" },
        { campo: "mym", titulo: "M&M" },
        { campo: "piura", titulo: "PIURA" },
        { campo: "chorrillos", titulo: "CHORRILLOS" },
        { campo: "total", titulo: "TOTAL" },
        { campo: "ordenado", titulo: "ORDENADO" }
    ]),
    tiempo: BASE.concat([
        { campo: "stock", titulo: "STOCK" },
        { campo: "ultimaCompra", titulo: "ULTIMA COMPRA" },
        { campo: "dias", titulo: "DIAS" }
    ]),
    precios: BASE.concat([
        { campo: "costoPrincipal", titulo: "COSTO PRINCIPAL US$" },
        { campo: "ventaPrincipal", titulo: "VALOR VENTA PRINCIPAL US$" },
        { campo: "costoMym", titulo: "COSTO M&M US$" },
        { campo: "ventaMym", titulo: "VALOR VENTA M&M US$" }
    ]),
    /* Una fila por PRODUCTO de la marca dentro de cada guia, no una por guia. */
    guias: [
        { campo: "fecha", titulo: "FECHA" },
        { campo: "tipo", titulo: "TIPO" },
        { campo: "numero", titulo: "NUMERO" },
        { campo: "estado", titulo: "ESTADO" },
        { campo: "motivo", titulo: "MOTIVO" },
        { campo: "almacen", titulo: "ALMACEN" },
        { campo: "cliente", titulo: "CLIENTE" },
        { campo: "referencia", titulo: "DOC. REFERENCIA" },
        { campo: "numeroReferencia", titulo: "NRO. REFERENCIA" },
        { campo: "codi", titulo: "CODIGO" },
        { campo: "codf", titulo: "CODF" },
        { campo: "descripcion", titulo: "DESCRIPCION" },
        { campo: "cantidad", titulo: "CANTIDAD" }
    ]
};

const NOMBRE_HOJA = { stock: "Stock", tiempo: "Tiempo en almacen", precios: "Lista de precios", guias: "Guias",
                      clientes: "clientes" };            // la hoja de la cobertura (dev/simulador-cobertura.js)

/* ------------------------------------------------------------ productos */
const ARTICULOS = ["TARJETA SD", "DISCO EXTERNO", "MEMORIA USB", "CABLE HDMI", "TINTA NEGRO", "TONER LASER", "PARLANTE", "MOUSE OPTICO"];
const MODELOS = ["PRO", "LITE", "PLUS", "MAX", "ONE"];
const FAMILIA_DE = { "09": "ALMACENAMIENTO EXTERNO", "11": "IMPRESION", "06": "PARTES Y PIEZAS DE COMPUTADORA" };

/** Productos vigentes de una marca. ZOTAC (0036) no tiene ninguno: para probar el vacio. */
function productos(m) {
    if (m.codmar === "0036") return [];

    const base = Number(m.codmar);
    const lista = [];

    for (let i = 0; i < 8; i++) {
        const cost = Math.round((4 + i * 3.25 + (base % 7)) * 100) / 100;

        lista.push({
            codi: String(base).padStart(4, "0") + "-" + String(1000 + i * 7),
            codf: m.abrmar + "-" + (100 + i),
            descripcion: ARTICULOS[(base + i) % ARTICULOS.length] + " " + m.nombre + " " + MODELOS[i % MODELOS.length],
            partNumber: m.abrmar + base + "X" + i,
            familia: FAMILIA_DE[m.codfam] || m.codfam,

            /* El 1 queda en negativo: lo reservado supera al fisico, como pasa en
               los datos reales. El 2 no tiene nada en ningun almacen. */
            principal: i === 1 ? -4 : i === 2 ? 0 : 20 + ((base + i * 11) % 60),
            mym: i === 2 ? 0 : (base + i * 5) % 15,
            piura: i === 2 ? 0 : (base + i) % 9,
            chorrillos: i === 2 ? 0 : (i * 2) % 7,
            ordenado: (i % 3) * 10,

            costoPrincipal: cost,
            ventaPrincipal: Math.round(cost * 1.18 * 100) / 100,
            /* Sin alta en M&M: null. Y el 4 tiene un precio de verdad en 0. */
            costoMym: i % 3 === 2 ? null : Math.round(cost * 1.02 * 100) / 100,
            ventaMym: i % 3 === 2 ? null : i === 4 ? 0 : Math.round(cost * 1.2 * 100) / 100,

            /* Sin compra en los años revisados: null. */
            _compra: i % 4 === 3 ? null : new Date(HOY - (i * 37 + 5) * 86400000)
        });
    }
    return lista;
}

const totalDe = (p) => p.principal + p.mym + p.piura + p.chorrillos;
const fecha = (d) => d.toISOString().slice(0, 10);

/* --------------------------------------------------------------- guias */
const CLIENTES = ["HWT COMPUTERS E.I.R.L.", "PC SUMINISTROS DEL PERU S.A.C.", "INNOVA 2512 S.A.C.",
                  "DISTRIBUIDORA ANDINA S.A.C.", "SERVICIOS INTERNET Y C.O. S.A.C."];
const MOTIVOS = ["VENTA DE PRODUCTOS", "TRASLADO ESTAB.CIA", "DEVOLUCION A PROVEED"];
const ALMACENES = ["01", "08", "15"];

/**
 * Todas las lineas de guia de una marca entre julio y octubre. Una fila por
 * producto de la marca; la guia que lleva productos de otras marcas ya vendria
 * recortada. Las anuladas no existen aqui: el backend no las devuelve.
 */
function lineasDeGuias(m) {
    const prod = productos(m);
    if (!prod.length) return [];

    const base = Number(m.codmar);
    const lineas = [];

    for (let mes = 7; mes <= 10; mes++) {
        for (let g = 0; g < 6; g++) {
            const t = Date.UTC(2026, mes - 1, 2 + g * 4 + (base % 3));
            if (t > LIMITE_GUIAS) continue;

            const nota = g % 5 === 4;
            const numero = (nota ? "N009-" : "T009-") + String(79000 + mes * 100 + g * 7 + (base % 50)).padStart(7, "0");
            const sinReferencia = g % 3 === 2;
            const factura = g % 2 === 1;

            /* La guia lleva de 1 a 3 productos DE ESTA MARCA. */
            for (let k = 0; k < 1 + (g % 3); k++) {
                const p = prod[(g + k) % prod.length];

                lineas.push({
                    fecha: fecha(new Date(t)),
                    tipo: nota ? "NOTA DE DESPACHO" : "GUIA REMISION",
                    numero: numero,
                    /* Las de octubre aun no tienen su salida. */
                    estado: mes === 10 ? "PENDIENTE DE SALIDA" : "CON SALIDA",
                    motivo: nota ? "VENTA DE PRODUCTOS" : MOTIVOS[g % MOTIVOS.length],
                    almacen: ALMACENES[g % ALMACENES.length],
                    cliente: CLIENTES[(g + base) % CLIENTES.length],
                    referencia: sinReferencia ? null : factura ? "FACTURA" : "PEDIDOS",
                    numeroReferencia: sinReferencia ? null : (factura ? "F009-" : "P099-") + String(650000 + mes * 10 + g),
                    codi: p.codi, codf: p.codf, descripcion: p.descripcion,
                    cantidad: 1 + ((g * 3 + k * 2) % 9)
                });
            }
        }
    }

    /* La mas reciente primero. */
    return lineas.sort((a, b) => a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.numero < b.numero ? 1 : a.numero > b.numero ? -1 : 0);
}

function parseFecha(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return null;
    const [a, m, d] = String(s).split("-").map(Number);
    const t = Date.UTC(a, m - 1, d);
    const x = new Date(t);
    /* 2026-02-31 no existe: Date lo desplazaria en silencio a marzo. */
    return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? t : null;
}

/**
 * El periodo de las guias. Sin `desde` ni `hasta`: el mes en curso. Con solo una,
 * la otra toma el borde del mes en curso. null si no es valido: fecha mal escrita
 * o inexistente, `desde` posterior a `hasta`, o mas de 3 meses.
 */
function periodoDe(cuerpo) {
    const vacio = (v) => v === undefined || v === null || v === "";
    const desde = vacio(cuerpo.desde) ? MES_EN_CURSO.desde : cuerpo.desde;
    const hasta = vacio(cuerpo.hasta) ? MES_EN_CURSO.hasta : cuerpo.hasta;

    const d = parseFecha(desde), h = parseFecha(hasta);
    if (d === null || h === null || d > h) return null;
    if ((h - d) / 86400000 + 1 > MAX_DIAS) return null;

    return { desde: desde, hasta: hasta };
}

/* ------------------------------------------------------------- informes */
function filasDe(tipo, m, cuerpo) {
    const lista = productos(m);
    const base = (p) => ({ codi: p.codi, codf: p.codf, descripcion: p.descripcion,
                           partNumber: p.partNumber, familia: p.familia });

    if (tipo === "stock") {
        return lista.map((p) => Object.assign(base(p), {
            principal: p.principal, mym: p.mym, piura: p.piura, chorrillos: p.chorrillos,
            total: totalDe(p), ordenado: p.ordenado
        }));
    }

    if (tipo === "tiempo") {
        /* Solo con stock. Primero los sin compra, luego del mas antiguo al mas reciente. */
        return lista.filter((p) => totalDe(p) > 0)
            .map((p) => Object.assign(base(p), {
                stock: totalDe(p),
                ultimaCompra: p._compra ? fecha(p._compra) : null,
                dias: p._compra ? Math.round((HOY - p._compra.getTime()) / 86400000) : null
            }))
            .sort((a, b) => {
                if (a.ultimaCompra === null && b.ultimaCompra !== null) return -1;
                if (b.ultimaCompra === null && a.ultimaCompra !== null) return 1;
                return a.ultimaCompra < b.ultimaCompra ? -1 : a.ultimaCompra > b.ultimaCompra ? 1 : 0;
            });
    }

    if (tipo === "guias") {
        return lineasDeGuias(m).filter((l) => l.fecha >= cuerpo.desde && l.fecha <= cuerpo.hasta);
    }

    return lista.map((p) => Object.assign(base(p), {
        costoPrincipal: p.costoPrincipal, ventaPrincipal: p.ventaPrincipal,
        costoMym: p.costoMym, ventaMym: p.ventaMym
    }));
}

/* ------------------------------------------------------ marcas visibles */
const yo = () => marcas.yo();

/**
 * Las marcas que puede consultar, **de este mes** (docs/reportes-grupo25.md, secc. 1):
 *   · especialista: las que tiene asignadas, las haya confirmado o no
 *   · jefatura: las suyas y las de sus especialistas que son de su familia.
 *               Las de su familia que nadie tiene no entran.
 */
function consultables() {
    return S.catalogo
        .filter((m) => S.rol === "JEFATURA" ? (m.dueno && m.codfam === "09") : m.dueno === yo())
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/* El mismo nombre que en /marcas: lo estable es el codusu, pero ya coinciden. */
const NOMBRES = marcas.NOMBRE_CORTO;

const ok = (data) => ({ status: 200, cuerpo: { status: "ok", codigo: 0, data: data } });
const error = (status, nombre, msg, codigo) => ({ status: status, cuerpo: { status: nombre, codigo: codigo || 3, msg: msg } });

const noIdentificado = () => error(400, "no identificado", "el user no esta registrado en la intranet", 2);

/** `sin marcas del mes`: en el primer nivel, sin `data`, como en cuota. Solo en la lista. */
const sinMarcas = () => ({ status: 200, cuerpo: {
    status: "sin marcas del mes", codigo: 0, msg: "no tienes marcas este mes; elige y confirma las tuyas",
    debeAsignar: true, marcas: {}
} });

/* ----------------------------------------------------------------- rutas */

/** GET /v1/reporte/marca */
function listar() {
    if (!S.yaRegistrado) return noIdentificado();

    const lista = consultables();
    if (!lista.length) return sinMarcas();

    return ok({
        anno: ANNO, mes: MES, rol: S.rol,
        marcas: lista.map((m) => ({
            codmar: m.codmar, abrmar: m.abrmar, nombre: m.nombre, codfam: m.codfam,
            familia: FAMILIA_DE[m.codfam],
            productos: productos(m).length,
            dueno: { codusu: m.dueno, nombre: NOMBRES[m.dueno], soyYo: m.dueno === yo() }
        }))
    });
}

/** POST /v1/reporte/marca/{stock|tiempo|precios|guias} */
function informe(tipo, cuerpo) {
    cuerpo = cuerpo || {};
    if (!COLUMNAS[tipo]) return { status: 404, cuerpo: { msg: "no simulado: " + tipo } };
    if (!S.yaRegistrado) return noIdentificado();

    if (!/^\d{4}$/.test(String(cuerpo.codmar || ""))) {
        return error(400, "codmar invalido", "falta el codmar o no tiene 4 digitos", 2);
    }

    const formato = String(cuerpo.formato === undefined ? "json" : cuerpo.formato).toLowerCase();
    if (formato !== "json" && formato !== "xlsx") {
        return error(400, "formato invalido", "el formato es json o xlsx", 2);
    }

    /* Solo guias: el periodo. */
    let periodo = null;
    if (tipo === "guias") {
        periodo = periodoDe(cuerpo);
        if (!periodo) {
            return error(400, "rango invalido",
                "las fechas deben ser AAAA-MM-DD, desde no puede ser posterior a hasta, y el maximo es de 3 meses", 2);
        }
    }

    /* Tambien si no tiene NINGUNA marca: con un codmar en la mano la respuesta es
       esta y no `sin marcas del mes`. */
    const m = consultables().find((x) => x.codmar === cuerpo.codmar);
    if (!m) return error(403, "marca no disponible", "esa marca no esta entre las que puedes consultar este mes");

    const filas = filasDe(tipo, m, periodo || {});

    if (formato === "xlsx") {
        const sufijo = tipo === "guias" ? periodo.desde + "_" + periodo.hasta : ANNO + "-" + MES;
        return { status: 200, archivo: {
            tipo: TIPO_XLSX,
            nombre: tipo + "-" + m.abrmar + "-" + sufijo + ".xlsx",
            contenido: crearXlsx(tipo, COLUMNAS[tipo], filas)
        } };
    }

    const data = {
        informe: tipo,
        marca: { codmar: m.codmar, abrmar: m.abrmar, nombre: m.nombre, familia: FAMILIA_DE[m.codfam] },
        anno: ANNO, mes: MES, generado: GENERADO,
        columnas: COLUMNAS[tipo],
        filas: filas
    };
    if (tipo === "tiempo") data.kardexDesde = R.kardexDesde;
    if (tipo === "guias") { data.desde = periodo.desde; data.hasta = periodo.hasta; }

    return ok(data);
}

/* ------------------------------------------------------------------ xlsx */
/* Un .xlsx es un zip de XML. Aqui, sin compresion y con una sola hoja. Los textos
   van en linea (`inlineStr`). Tres estilos: 0 normal, 1 fecha `dd/mm/yyyy`, 2 importe
   `#,##0.00`. */

const ESTILO_FECHA = 1, ESTILO_IMPORTE = 2;

const CAMPOS_FECHA = ["fecha", "ultimaCompra"];
const CAMPOS_IMPORTE = ["costoPrincipal", "ventaPrincipal", "costoMym", "ventaMym", "venta"];

/** El texto que lleva una celda sin dato, en vez de quedar vacia. */
function textoSinDato(tipo, campo) {
    if (tipo === "tiempo" && campo === "ultimaCompra") return "SIN COMPRA DESDE " + R.kardexDesde;
    if (tipo === "precios" && (campo === "costoMym" || campo === "ventaMym")) return "SIN ALTA EN M&M";
    return null;
}

/** Dias desde el 30/12/1899, que es como Excel cuenta las fechas. */
function serialExcel(iso) {
    return (parseFecha(iso) - Date.UTC(1899, 11, 30)) / 86400000;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const letra = (i) => String.fromCharCode(65 + i);          // hasta 26 columnas, de sobra

function crearXlsx(tipo, columnas, filas) {
    const texto = (ref, v) => `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;

    function celda(ref, c, v) {
        if (v === null || v === undefined) {
            const t = textoSinDato(tipo, c.campo);
            return t ? texto(ref, t) : "";
        }
        if (CAMPOS_FECHA.indexOf(c.campo) !== -1) return `<c r="${ref}" s="${ESTILO_FECHA}"><v>${serialExcel(v)}</v></c>`;
        if (typeof v === "number") {
            const s = CAMPOS_IMPORTE.indexOf(c.campo) !== -1 ? ` s="${ESTILO_IMPORTE}"` : "";
            return `<c r="${ref}"${s}><v>${v}</v></c>`;
        }
        return texto(ref, v);
    }

    const cabecera = `<row r="1">${columnas.map((c, i) => texto(letra(i) + 1, c.titulo)).join("")}</row>`;
    const datos = filas.map((f, n) =>
        `<row r="${n + 2}">${columnas.map((c, i) => celda(letra(i) + (n + 2), c, f[c.campo])).join("")}</row>`);

    const cab = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
    const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
    const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

    return zip({
        "[Content_Types].xml": cab + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
            '<Default Extension="xml" ContentType="application/xml"/>' +
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
            "</Types>",
        "_rels/.rels": cab + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
        "xl/workbook.xml": cab + `<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="${esc(NOMBRE_HOJA[tipo])}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
        "xl/_rels/workbook.xml.rels": cab + `<Relationships xmlns="${PKG}">` +
            `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
            `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
        "xl/styles.xml": cab + `<styleSheet xmlns="${NS}">` +
            '<numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>' +
            '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
            '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
            '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
            '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
            '<cellXfs count="3">' +
            '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
            '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
            '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
            "</cellXfs>" +
            '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
        "xl/worksheets/sheet1.xml": cab + `<worksheet xmlns="${NS}"><sheetData>${[cabecera].concat(datos).join("")}</sheetData></worksheet>`
    });
}

/** Zip sin compresion (metodo 0). `zlib.crc32` existe desde Node 22.2. */
function zip(archivos) {
    const locales = [], centrales = [];
    let desplazamiento = 0;

    Object.keys(archivos).forEach((nombre) => {
        const n = Buffer.from(nombre, "utf8");
        const d = Buffer.from(archivos[nombre], "utf8");
        const crc = zlib.crc32(d);

        const l = Buffer.alloc(30);
        l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6);   // 0x0800 = nombres en UTF-8
        l.writeUInt16LE(0, 8); l.writeUInt16LE(0, 10); l.writeUInt16LE(0x21, 12);             // sin compresion, 1980-01-01
        l.writeUInt32LE(crc, 14); l.writeUInt32LE(d.length, 18); l.writeUInt32LE(d.length, 22);
        l.writeUInt16LE(n.length, 26); l.writeUInt16LE(0, 28);

        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
        c.writeUInt16LE(0, 10); c.writeUInt16LE(0, 12); c.writeUInt16LE(0x21, 14);
        c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(d.length, 24);
        c.writeUInt16LE(n.length, 28); c.writeUInt32LE(desplazamiento, 42);

        locales.push(l, n, d);
        centrales.push(c, n);
        desplazamiento += l.length + n.length + d.length;
    });

    const central = Buffer.concat(centrales);
    const fin = Buffer.alloc(22);
    fin.writeUInt32LE(0x06054b50, 0);
    fin.writeUInt16LE(Object.keys(archivos).length, 8); fin.writeUInt16LE(Object.keys(archivos).length, 10);
    fin.writeUInt32LE(central.length, 12); fin.writeUInt32LE(desplazamiento, 16);

    return Buffer.concat(locales.concat([central, fin]));
}

module.exports = { listar, informe, consultables, crearXlsx, estado: R, COLUMNAS, TIPO_XLSX };
