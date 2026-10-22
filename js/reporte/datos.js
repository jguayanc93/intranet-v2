/**
 * Reportes por marca — acceso a `/v1/reporte/marca*` y lo que describe cada informe.
 *
 * Sustituye a los cuatro scripts de la pantalla antigua (marcas.js, stoc.js,
 * tiempo.js y precios.js), que tenian tres problemas de fondo:
 *
 *   · mandaban la marca por su TEXTO. Con las marcas partidas —HP tintas 0007,
 *     HP impresoras 0190, HP computo 0160— un texto no dice cual, y 64 productos
 *     vigentes no salian en ningun informe porque el nombre de su marca estaba
 *     escrito distinto. Ahora va el `codmar`.
 *   · solo descargaban: no habia forma de ver el informe antes de exportarlo.
 *   · los errores iban a la consola y la persona no veia nada.
 *
 * Las respuestas de JSON vienen en el sobre `{ status, codigo, data }`; aqui se
 * devuelve ya `data`. Una excepcion: **sin marcas en el mes** no trae `data` sino
 * `{ status: "sin marcas del mes", debeAsignar: true, … }` en el primer nivel,
 * igual que en cuota. Se devuelve como `{ sinMarcas: true, msg }` para que quien
 * llame no tenga que adivinarlo.
 *
 * Ver docs/reportes-grupo25.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var reportes = CDK.reportes = CDK.reportes || {};

    /* ---------------------------------------------------------------
     * Los tres informes
     *
     * `ayuda` es lo que dice el backend sobre como se calcula cada uno
     * (docs/reportes-grupo25.md, seccion 4). Va en pantalla porque «disponible»
     * y «dias» no significan lo que parecen: una devolucion de cliente no
     * reinicia los dias, y el disponible puede ser negativo.
     * ------------------------------------------------------------- */
    reportes.INFORMES = [
        {
            clave: "stock",
            etiqueta: "Stock",
            buscar: "CODF, descripción o part number",
            vacio: "Esta marca no tiene productos vigentes.",
            ayuda: function () {
                return [
                    "Disponible = stock físico − lo reservado por pedidos de clientes − lo facturado " +
                        "que aún no sale del almacén. Las dos reservas son temporales: se liberan cuando " +
                        "el pedido se factura o cuando la factura tiene su salida.",
                    "Puede salir negativo cuando lo reservado supera al físico: se muestra tal cual. " +
                        "Un almacén donde el producto no está dado de alta cuenta 0.",
                    "Ordenado son las unidades pedidas al proveedor que aún no llegan, en los cuatro almacenes."
                ];
            }
        },
        {
            clave: "tiempo",
            etiqueta: "Tiempo en almacén",
            buscar: "CODF, descripción o part number",
            vacio: "Ningún producto de esta marca tiene stock.",
            ayuda: function (d) {
                var desde = d && d.kardexDesde;
                return [
                    "Solo los productos con stock. Es para conocer la antigüedad: no marca ningún umbral.",
                    "Los días se cuentan desde la última compra, en el país o en el exterior. Las " +
                        "devoluciones de clientes, los ajustes de inventario y la protección de precio " +
                        "no reinician la cuenta.",
                    desde
                        ? "Se revisan las compras de " + desde + " en adelante. Si no hay ninguna, el " +
                          "producto lleva más tiempo que eso o entró por otro camino."
                        : "Si no hay ninguna compra en los años revisados, el producto lleva más " +
                          "tiempo que eso o entró por otro camino."
                ];
            }
        },
        {
            clave: "precios",
            etiqueta: "Lista de precios",
            buscar: "CODF, descripción o part number",
            vacio: "Esta marca no tiene productos vigentes.",
            ayuda: function () {
                return [
                    "En dólares y sin IGV. Incluye el costo.",
                    "Valor venta es el precio de lista del producto, sin IGV y antes del descuento que " +
                        "se aplica en la cotización según el tipo de cliente. No corresponde a ningún " +
                        "cliente en particular.",
                    "Los precios cambian según el almacén, por eso M&M va aparte. Si el producto no " +
                        "está dado de alta en M&M se muestra «—»; un $ 0.00 es un precio real en 0."
                ];
            }
        },
        {
            /* Las guias son hechos con fecha, no una foto como el stock: llevan un
               PERIODO (hasta 3 meses; sin elegir, el mes en curso). Y una fila es un
               PRODUCTO de la marca dentro de una guia, no una guia. */
            clave: "guias",
            etiqueta: "Guías",
            periodo: true,
            buscar: "Guía, cliente, CODF o descripción",
            vacio: "No hay guías de esta marca en este periodo.",
            ayuda: function () {
                return [
                    "Los productos de esta marca que salieron, o están por salir, en guías dentro del periodo.",
                    "Entran las guías de remisión y las notas de despacho del local. Las anuladas no.",
                    "Una fila por producto de la marca dentro de cada guía: si una guía lleva productos " +
                        "de otras marcas, aquí solo salen los de esta.",
                    "Estado: «CON SALIDA» ya salió del almacén; «PENDIENTE DE SALIDA» la guía existe pero " +
                        "aún no tiene su salida.",
                    "No muestra importes. El periodo máximo es de 3 meses."
                ];
            }
        }
    ];

    reportes.informe = function (clave) {
        return reportes.INFORMES.filter(function (i) { return i.clave === clave; })[0] || null;
    };

    /* ---------------------------------------------------------------
     * Llamadas
     * ------------------------------------------------------------- */
    function esSinMarcas(r) {
        return !!r && (r.debeAsignar === true || r.status === "sin marcas del mes");
    }

    function desenvolver(r) {
        if (esSinMarcas(r)) return { sinMarcas: true, msg: r.msg };
        return r && r.data !== undefined ? r.data : r;
    }

    function ruta(clave) { return CDK.rutas.api("/reporte/marca/" + clave); }

    /**
     * Las marcas que puede consultar **este mes**, ordenadas por nombre. Un
     * especialista ve las que tiene asignadas, las haya confirmado o no; una
     * jefatura, las suyas y las de sus especialistas que son de su familia.
     * Sin ninguna: `{ sinMarcas: true, msg }`.
     */
    reportes.marcas = function () {
        return CDK.http.get(CDK.rutas.api("/reporte/marca")).then(desenvolver);
    };

    /**
     * El informe en pantalla: `{ informe, marca, generado, columnas, filas, … }`.
     * Las filas llegan con nombres y `columnas` dice el orden y el encabezado.
     */
    reportes.ver = function (clave, codmar, extra) {
        return CDK.http.post(ruta(clave), cuerpo(codmar, "json", extra)).then(desenvolver);
    };

    /**
     * El cuerpo de la peticion. `extra` lleva el periodo de las guias (`desde`,
     * `hasta`): solo se manda lo que viene, y sin el, el backend usa el mes en curso.
     */
    function cuerpo(codmar, formato, extra) {
        var c = { codmar: codmar, formato: formato };
        if (extra && extra.desde) c.desde = extra.desde;
        if (extra && extra.hasta) c.hasta = extra.hasta;
        return c;
    }

    /**
     * El informe como Excel: `{ blob, nombre }`.
     *
     * **Se pide la respuesta sin interpretar y se mira el `Content-Type`.** Un
     * error llega como JSON con su codigo http, no como un archivo, asi que lo
     * que no sea la hoja de calculo no se guarda: hoy un fallo y un Excel
     * corrupto se ven igual. El nombre lo pone el servidor en
     * `Content-Disposition` —que expone por CORS—.
     */
    reportes.exportar = function (clave, codmar, extra) {
        var url = ruta(clave);

        return CDK.http.enviar(url, {
            metodo: "POST",
            cuerpo: cuerpo(codmar, "xlsx", extra),
            crudo: true
        }).then(function (respuesta) {
            var tipo = respuesta.headers.get("Content-Type") || "";

            /* `crudo` se salta el manejo de sesion de CDK.http, asi que el 401 se
               trata aqui. No se intenta renovar `tip`: estas rutas solo piden `cdk`. */
            if (respuesta.status === 401) {
                if (CDK.sesion && CDK.sesion.expirar) CDK.sesion.expirar("401");
                throw CDK.HttpError("Sesion expirada", 401, null, url);
            }

            if (respuesta.ok && tipo.indexOf("spreadsheetml") !== -1) {
                var nombre = nombreDe(respuesta.headers.get("Content-Disposition"), clave, codmar);
                return respuesta.blob().then(function (blob) { return { blob: blob, nombre: nombre }; });
            }

            /* Cualquier otra cosa es un error del backend, aunque venga con 200
               (`sin marcas del mes`): se lee su JSON para que quien llame pueda
               mostrar el `msg` y decidir por el `status`. */
            return respuesta.text().then(function (texto) {
                var datos = null;
                try { datos = texto ? CDK.http.desempaquetar(JSON.parse(texto)) : null; }
                catch (e) { datos = null; }

                throw CDK.HttpError("HTTP " + respuesta.status, respuesta.status, datos, url);
            });
        });
    };

    /** `attachment; filename="stock-EPSON-2026-10.xlsx"` → el nombre, o uno de respaldo. */
    function nombreDe(cabecera, clave, codmar) {
        var m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cabecera || "");
        if (m) {
            try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
        }
        return clave + "-" + codmar + ".xlsx";
    }

})(window);
