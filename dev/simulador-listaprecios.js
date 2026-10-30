/**
 * dev/simulador-listaprecios.js — Simulacro de la lista de precios del grupo 20 (docs/listaprecios-grupo20.md).
 *
 *   POST /reporte/listaprecios   { formato: "json" | "xlsx" }
 *
 * Lo comparten dev/servidor.js y dev/pruebas/probar-listaprecios.js, para que lo que se ve en el navegador y lo que prueba la suite
 * salga del mismo sitio.
 *
 * Reproduce lo que el documento dice de bdnava08: **6 396 filas** de **8 familias** (las cifras por familia son las del documento) y 135
 * marcas, de las que 21 llevan la linea (`HP-IMPRESORAS`, `EP_IMPRESORAS`, `HW-ADATA`…); 42 productos sin part number (`""`); la
 * descripcion mas larga de 80 caracteres; precios de lista del almacen principal en dolares y `precioConIgv` = `precioSinIgv` por 1,18
 * redondeado a dos decimales con la regla del ERP. Ya ordenado por familia, marca y descripcion. **Sin costo, sin stock y sin codigos del
 * sistema**: la columna de disponibilidad dice lo mismo en todas las filas.
 *
 * Solo grupo 20 (cartera y cobertura): el grupo 25 y el 34 reciben `403 sin permiso`. Con el Excel, `{ status: 200, archivo }` (un .xlsx
 * de verdad, hecho con el de dev/simulador-reportes.js; ahi las celdas de importe no llevan el formato `#,##0.00` que el backend real
 * si pone). Los datos son inventados: los nombres de marca de relleno son «MARCA 001»…, y solo unas pocas filas estan escritas a mano
 * para que las pruebas tengan de donde agarrarse.
 */
"use strict";

const marcas = require("./simulador-marcas");
const reportes = require("./simulador-reportes");

const S = marcas.estado;

/** El dia del ejemplo del documento. Es el mismo del nombre del archivo. */
const FECHA = "2026-10-30";
const GENERADO = "2026-10-30T15:14:03.512Z";
const DISPONIBILIDAD = "SUJETO A DISPONIBILIDAD";

const ok = (data) => ({ status: 200, cuerpo: { status: "ok", codigo: 0, data: data } });
const error = (status, nombre, msg, codigo) => ({ status: status, cuerpo: { status: nombre, codigo: codigo || 3, msg: msg } });
const esGrupo20 = () => S.rol === "COBERTURA" || S.rol === "CARTERA";

const COLUMNAS = [
    { campo: "descripcion", titulo: "DESCRIPCION" },
    { campo: "partNumber", titulo: "PART NUMBER" },
    { campo: "marca", titulo: "MARCA" },
    { campo: "familia", titulo: "FAMILIA" },
    { campo: "precioSinIgv", titulo: "PRECIO SIN IGV US$" },
    { campo: "precioConIgv", titulo: "PRECIO CON IGV US$" },
    { campo: "disponibilidad", titulo: "DISPONIBILIDAD" }
];

/* --------------------------------------------------------------- las familias: cuantas filas tiene cada una (las del documento) */
const FAMILIAS = [
    // [nombre, filas, desde que marca y hasta cual (indices de MARCAS), precio minimo y maximo, lo que son sus productos]
    ["SUMINISTROS",              1865, 0, 41,   4,  420, ["TINTA", "TONER", "BOTELLA DE TINTA", "CARTUCHO", "TAMBOR"]],
    ["MOVILIDAD",                1405, 20, 71,  9,  650, ["CARGADOR PARA LAPTOP", "BATERIA", "MOCHILA PARA LAPTOP", "ADAPTADOR", "BASE REFRIGERANTE"]],
    ["PARTES Y PIEZAS",          1167, 40, 101, 6,  1500, ["MEMORIA RAM", "DISCO SOLIDO", "PLACA MADRE", "FUENTE DE PODER", "COOLER", "CASE"]],
    ["ACCESORIOS Y PERIFERICOS", 1031, 60, 135, 2,  380, ["MOUSE", "TECLADO", "AUDIFONO", "CABLE", "WEBCAM", "PARLANTE"]],
    ["ALMACENAMIENTO EXTERNO",   597,  90, 135, 14, 520, ["DISCO EXTERNO", "MEMORIA USB", "TARJETA SD", "ESTUCHE PARA DISCO"]],
    ["IMPRESION",                300,  0, 31,   85, 2300, ["IMPRESORA MULTIFUNCIONAL", "IMPRESORA LASER", "PLOTTER", "ETIQUETADORA"]],
    ["EQUIPOS INFORMATICOS",     24,   0, 9,    290, 3400, ["LAPTOP", "COMPUTADORA DE ESCRITORIO", "WORKSTATION"]],
    ["EQUIPOS MULTIMEDIA",       7,    100, 105, 140, 900, ["PROYECTOR", "PANTALLA DE PROYECCION", "PARLANTE BLUETOOTH"]]
];

/* --------------------------------------------------------------- las 135 marcas: 24 reales de la intranet, 21 con linea y 90 de relleno */
const MARCAS_BASE = ["ADATA", "EPSON", "HEWLETT PACKARD", "CANON", "BROTHER", "KINGSTON", "LOGITECH", "ASUS", "TCL", "OMEGA", "ANTEC", "TDK",
                     "LENOVO", "DELL", "SAMSUNG", "LG", "ACER", "XEROX", "KODAK", "GENIUS", "SEAGATE", "WESTERN DIGITAL", "SANDISK", "TPLINK"];
const MARCAS_CON_LINEA = ["HP-IMPRESORAS", "HP-MONITORES", "HP-COMPUTO", "HP-TINTAS", "HP-SUMINISTROS", "EP_IMPRESORAS", "EP_TINTAS", "EP_PROYECTORES",
                          "EP_ESCANERES", "HW-ADATA", "HW-KINGSTON", "HW-SEAGATE", "HW-SANDISK", "LG-MONITORES", "LG-AUDIO", "BR_IMPRESORAS", "BR_TONER",
                          "CN-IMPRESORAS", "CN-TINTAS", "AS-PLACAS", "AS-MONITORES"];

/** Las 135: se entremezclan para que cada familia agarre de todo tipo (lo que importa es que sean 135 y que 21 lleven linea). */
const MARCAS = (function () {
    const todas = [];
    const relleno = [];
    for (let i = 1; i <= 90; i++) relleno.push("MARCA " + String(i).padStart(3, "0"));

    const a = MARCAS_BASE.slice(), b = MARCAS_CON_LINEA.slice(), c = relleno.slice();
    while (a.length || b.length || c.length) {
        if (a.length) todas.push(a.shift());
        if (b.length) todas.push(b.shift());
        if (c.length) todas.push(c.shift(), c.length ? c.shift() : null);
    }
    return todas.filter(Boolean);
})();

/* --------------------------------------------------------------- un generador de numeros que no cambia entre corridas */
function semilla(n) {
    let x = n >>> 0;
    return function () {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        return x / 4294967296;
    };
}

/** Redondeo del ERP: la mitad hacia arriba, sin los errores de la coma flotante. */
const redondear = (n, d) => Number(Math.round(Number(n + "e" + d)) + "e-" + d);
const conIgv = (sinIgv) => redondear(sinIgv * 1.18, 2);

const PREFIJOS = ["AX", "BK", "CT", "DL", "EN", "FG", "HT", "JK", "LM", "NP", "QR", "ST", "VW", "XZ"];

/* --------------------------------------------------------------- las filas */
function armarFilas() {
    const azar = semilla(30102026);
    const filas = [];

    FAMILIAS.forEach((fam) => {
        const nombre = fam[0], cuantas = fam[1], desde = fam[2], hasta = Math.min(fam[3], MARCAS.length), minimo = fam[4], maximo = fam[5], cosas = fam[6];
        const deEstaFamilia = MARCAS.slice(desde, hasta);

        for (let k = 0; k < cuantas; k++) {
            const marca = deEstaFamilia[Math.floor(Math.pow(azar(), 1.4) * deEstaFamilia.length)];
            const cosa = cosas[Math.floor(azar() * cosas.length)];
            const modelo = PREFIJOS[Math.floor(azar() * PREFIJOS.length)] + "-" + String(100 + Math.floor(azar() * 9000));
            const precio = redondear(minimo + azar() * (maximo - minimo), 2);

            filas.push({
                descripcion: (cosa + " " + marca.replace(/[-_ ]/g, " ") + " " + modelo).slice(0, 80),
                partNumber: modelo + "#" + String(Math.floor(azar() * 900) + 100),
                marca: marca,
                familia: nombre,
                precioSinIgv: precio,
                precioConIgv: conIgv(precio),
                disponibilidad: DISPONIBILIDAD
            });
        }
    });

    return filas;
}

/** Unas pocas filas escritas a mano, para que las pruebas tengan de donde agarrarse. Reemplazan a las primeras de su familia. */
const A_MANO = [
    /* el ejemplo del documento */
    { descripcion: "HEADSET 3.5MM PRECOG S-WHCWW", partNumber: "PRECOG S-WHCWW", marca: "ADATA", familia: "ACCESORIOS Y PERIFERICOS", precioSinIgv: 18 },
    /* una descripcion de 80 caracteres justos, para ver como se parte en un movil */
    { descripcion: "CABLE HDMI 2.1 8K 60HZ 4K 120HZ CON ETHERNET Y RETORNO DE AUDIO BLINDADO 3M ROJO", partNumber: "HDMI21-3M-RD", marca: "GENIUS", familia: "ACCESORIOS Y PERIFERICOS", precioSinIgv: 24.9 },
    /* un producto sin part number */
    { descripcion: "ESTUCHE RIGIDO PARA DISCO EXTERNO 2.5 PULGADAS", partNumber: "", marca: "SEAGATE", familia: "ALMACENAMIENTO EXTERNO", precioSinIgv: 9.5 },
    /* con eñe: el buscador no puede fallar por la tilde */
    { descripcion: "TECLADO USB ESPAÑOL CON LECTOR DE DNI", partNumber: "KB-DNI-ES", marca: "LOGITECH", familia: "ACCESORIOS Y PERIFERICOS", precioSinIgv: 31.25 },
    /* un precio con muchos decimales de IGV, para que se vea que la pantalla no recalcula */
    { descripcion: "BOTELLA DE TINTA EPSON T544120-AL NEGRO PARA L3110", partNumber: "T544120-AL", marca: "EPSON", familia: "SUMINISTROS", precioSinIgv: 12.34 },
    { descripcion: "TINTA HP 1VV22AL BOTTLE (GT53) BLACK 4000 PAG", partNumber: "1VV22AL", marca: "HEWLETT PACKARD", familia: "SUMINISTROS", precioSinIgv: 27.5 },
    { descripcion: "LAPTOP LENOVO IDEAPAD 15 CORE I5 16GB 512GB", partNumber: "82XB00A1LM", marca: "LENOVO", familia: "EQUIPOS INFORMATICOS", precioSinIgv: 689 }
];

function construir() {
    const filas = armarFilas();

    /* Los 42 sin part number del documento: uno de cada 152, empezando por el 7 (con los de A_MANO, 42 en total de 6 396). */
    let sin = 0;
    for (let i = 7; i < filas.length && sin < 41; i += 152) { filas[i].partNumber = ""; sin++; }

    /* Las de A_MANO reemplazan a la primera fila de su familia, una por una. */
    const siguiente = {};
    A_MANO.forEach((m) => {
        const de = filas.map((f, i) => f.familia === m.familia ? i : -1).filter((i) => i >= 0);
        const i = de[siguiente[m.familia] = (siguiente[m.familia] || 0) + 1] || de[0];
        filas[i] = Object.assign({ precioConIgv: conIgv(m.precioSinIgv), disponibilidad: DISPONIBILIDAD }, m);
    });

    /* Ya ordenado por familia, marca y descripcion, como el backend. Comparacion simple, no la del idioma. */
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    filas.sort((a, b) => cmp(a.familia, b.familia) || cmp(a.marca, b.marca) || cmp(a.descripcion, b.descripcion));
    return filas;
}

const FILAS = construir();

/* --------------------------------------------------------------- la ruta */

/** POST /reporte/listaprecios. `cuerpo.formato`: `json` (o sin ponerlo) o `xlsx`, en mayusculas o minusculas. */
function lista(cuerpo) {
    if (!esGrupo20()) return error(403, "sin permiso", "esta ruta es del grupo 20");

    const formato = String(cuerpo && cuerpo.formato !== undefined && cuerpo.formato !== null ? cuerpo.formato : "json").toLowerCase();
    if (formato !== "json" && formato !== "xlsx") return error(400, "formato invalido", "el formato es json o xlsx", 2);

    if (formato === "xlsx") {
        return { status: 200, archivo: {
            tipo: reportes.TIPO_XLSX,
            nombre: "lista-precios-" + FECHA + ".xlsx",
            contenido: reportes.crearXlsx("precios", COLUMNAS, FILAS)
        } };
    }

    return ok({ informe: "listaprecios", fecha: FECHA, generado: GENERADO, columnas: COLUMNAS, filas: FILAS });
}

module.exports = { lista, FILAS, COLUMNAS, FECHA, GENERADO, DISPONIBILIDAD, FAMILIAS, MARCAS, conIgv, redondear };
