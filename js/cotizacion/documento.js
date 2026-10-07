/**
 * La cotización como documento para el cliente.
 *
 * Reproduce el formato impreso de siempre. El PDF lo genera la impresión del
 * navegador: no hace falta ninguna librería, el texto queda seleccionable, y
 * tanto Android como iOS ofrecen guardar o compartir desde ese mismo diálogo.
 *
 * Lo que se ve en pantalla y lo que sale impreso son el MISMO nodo con la misma
 * hoja de estilos (core/cdk-documento.css). Si fueran dos, acabarían
 * divergiendo y el vendedor enviaría algo distinto de lo que revisó.
 *
 * La tabla se arma con las líneas que traiga la cotización, sean las que sean.
 *
 * Razón social, dirección y ATTE llegan ya en la cabecera de /cotizacion/read
 * (posiciones 23, 24 y 25). Lo que falte no se dibuja, en vez de salir vacío:
 * una etiqueta sin valor parece un error de la cotización, y no lo es. ATTE no
 * lo tienen 30 de cada 7 128, así que ese caso ocurre de verdad.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    CDK.coti = CDK.coti || {};

    var el = CDK.el;

    /* Datos de la empresa que emite. Son fijos y no cambian por cotización.
       PENDIENTE de confirmar: ¿hay más de una razón social emisora? */
    var EMISOR = {
        nombre: "COMPUDISKETT S.R.L",
        ruc: "20123053037",
        direccion: "AV. REPUBLICA DE CHILE NRO. 504",
        telefono: "614-3800"
    };

    CDK.coti.EMISOR = EMISOR;

    function texto(valor) {
        return valor === null || valor === undefined ? "" : String(valor).trim();
    }

    /** Par etiqueta-valor. Devuelve null si no hay valor, y así no se dibuja. */
    function dato(etiqueta, valor, ancho) {
        var v = texto(valor);
        if (!v) return null;
        return [
            el("dt", { texto: etiqueta }),
            el("dd", { clase: ancho ? "cdk-doc__ancho" : "", texto: v })
        ];
    }

    function celda(contenido, clase) {
        return el("td", { clase: clase || "", texto: contenido });
    }

    /**
     * Arma el documento.
     *
     *   CDK.coti.documentoImprimible(doc, {
     *       cliente: { razonSocial, ruc, direccion },
     *       atte: "...", vendedor: "..."
     *   })
     *
     * `doc` es lo que devuelve CDK.coti.documento() con la respuesta de
     * /cotizacion/read. El segundo argumento trae lo que no viene en esa
     * respuesta; lo que falte se omite.
     */
    CDK.coti.documentoImprimible = function (doc, extra) {
        extra = extra || {};
        var cliente = extra.cliente || {};
        var cab = doc.cabecera || {};

        var moneda = cab.moneda === "S" ? "S" : "D";
        var simbolo = moneda === "S" ? "S/" : "US$";

        /* --- cabecera --- */
        var cabecera = el("div", { clase: "cdk-doc__cabecera" }, [
            el("div", { clase: "cdk-doc__numero", texto: "COTIZACION: " + texto(cab.documento) }),
            el("div", { clase: "cdk-doc__emisor" }, [
                el("p", { clase: "cdk-doc__marca", texto: EMISOR.nombre }),
                el("p", { clase: "cdk-doc__ruc", texto: "RUC: " + EMISOR.ruc }),
                el("p", { clase: "cdk-doc__emisor-datos",
                          texto: EMISOR.direccion + " Telf: " + EMISOR.telefono })
            ])
        ]);

        /* --- datos del cliente --- */
        var pares = [
            dato("FECHA", CDK.formato.fecha(cab.fecha)),
            dato("SEÑOR", cliente.razonSocial),
            dato("RUC", cliente.ruc),
            dato("DIRECCION", cliente.direccion, true),
            dato("ATTE", extra.atte),
            dato("VENDEDOR", extra.vendedor)
        ];

        var datos = el("dl", { clase: "cdk-doc__datos" });
        pares.forEach(function (par) {
            if (!par) return;
            par.forEach(function (n) { datos.appendChild(n); });
        });

        /* --- tabla --- */
        var COLUMNAS = [
            { titulo: "ITM",           clase: "num" },
            { titulo: "CODIGO" },
            { titulo: "MARCA" },
            { titulo: "DESCRIPCION",   clase: "desc" },
            { titulo: "U.M.",          clase: "centro" },
            { titulo: "CANT.",         clase: "num" },
            { titulo: "Precio LISTA",  clase: "num" },
            { titulo: "Precio DSCTO",  clase: "num" },
            { titulo: "TOTAL",         clase: "num" }
        ];

        var cabeceraTabla = el("tr", {}, COLUMNAS.map(function (c) {
            return el("th", { clase: c.clase || "", texto: c.titulo });
        }));

        var cuerpo = el("tbody");

        /* Solo los productos: los descuentos y obsequios de promoción se
           muestran aparte, porque en el documento del cliente van como líneas
           propias y el formato actual no las contempla todavía. */
        var lineas = doc.productos && doc.productos.length ? doc.productos : doc.lineas;

        lineas.forEach(function (linea, i) {
            var precio = Number(linea.precioUnitario) || 0;
            var descuento = Number(linea.descuento) || 0;

            /* Precio con descuento: lo que el documento llama "Precio DSCTO".
               Se redondea a céntimos ANTES de mostrarlo, porque es un precio
               real y no un resultado intermedio: 79.71 con 5 % da 75.7245, y
               el documento de siempre dice 75.72. Sin el redondeo saldría
               75.725 y no cuadraría con el impreso que el cliente ya conoce.

               Las tres cifras decimales de la columna son dos decimales con un
               cero de relleno, como en el formato original. */
            var conDescuento = Math.round(precio * (1 - descuento / 100) * 100) / 100;

            cuerpo.appendChild(el("tr", {}, [
                celda(i + 1, "num"),
                celda(texto(linea.partnumber) || texto(linea.codigo)),
                celda(texto(linea.marca)),
                celda(texto(linea.descripcion), "desc"),
                celda(texto(linea.unidad), "centro"),
                celda(CDK.formato.numero(linea.cantidad, 2), "num"),
                celda(CDK.formato.numero(precio, 3), "num"),
                celda(CDK.formato.numero(conDescuento, 3), "num"),
                celda(CDK.formato.numero(linea.importe, 2), "num")
            ]));
        });

        var tabla = el("table", { clase: "cdk-doc__tabla" }, [
            el("thead", {}, [cabeceraTabla]),
            cuerpo
        ]);

        /* --- totales --- */
        function total(etiqueta, valor, fin) {
            return el("dl", { clase: "cdk-doc__total" + (fin ? " cdk-doc__total--fin" : "") }, [
                el("dt", { texto: etiqueta }),
                el("dd", { texto: simbolo + " " + CDK.formato.numero(valor, 2) })
            ]);
        }

        var cierre = el("div", { clase: "cdk-doc__cierre" }, [
            el("div", { clase: "cdk-doc__moneda",
                        texto: "EN : " + (moneda === "S" ? "SOLES" : "DOLARES AMERICANOS") }),
            el("div", { clase: "cdk-doc__totales" }, [
                total("VALOR VENTA :", doc.subtotal),
                total("IGV :", doc.igv),
                total("TOTAL NETO :", doc.total, true)
            ])
        ]);

        return el("div", { clase: "cdk-doc cdk-doc--previa" }, [
            cabecera,
            datos,
            el("div", { clase: "cdk-doc__saludo" }, [
                el("p", { texto: "Estimados señores:" }),
                el("p", { texto: "Por medio de la presente nos es grato cotizarles lo siguiente:" })
            ]),
            tabla,
            cierre
        ]);
    };

    /**
     * Manda a imprimir.
     *
     * La hoja de estilos ya oculta todo lo que no es el documento, así que no
     * hace falta abrir otra ventana ni duplicar el contenido en un iframe: lo
     * que se imprime es el mismo nodo que se está viendo.
     */
    CDK.coti.imprimirDocumento = function () {
        global.print();
    };

})(window);
