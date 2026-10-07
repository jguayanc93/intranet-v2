/**
 * Contrato de /v1/promocion, en un solo sitio.
 *
 * Lo que entra son las respuestas crudas del backend; lo que sale son objetos
 * donde cada campo significa UNA cosa. El contrato completo esta en
 * docs/promociones.md.
 *
 * Existe por tres trampas del contrato que son faciles de pasar por alto y que
 * no fallan de forma ruidosa, sino dando numeros equivocados:
 *
 *   1. Las respuestas vienen envueltas en { status, codigo, data }. CDK.http
 *      desenvuelve el JSON-dentro-de-JSON, pero no este sobre.
 *
 *   2. En el detalle, `data` mezcla indices numericos con las claves `tipo` y
 *      `descripcion`. Un Object.entries() sin filtrar las trata como productos.
 *
 *   3. `montoDescuento` cambia de unidad segun `tipo`: con "descuento" son
 *      dolares sin IGV, con "regalo" son unidades de obsequio. Y
 *      `monedaDescuento` dice "D" en los dos casos, asi que un regalo de 3
 *      unidades se lee como "3 dolares" si uno se fia de ese campo.
 *
 * Aqui se deshacen las tres: el sobre se abre una vez, las claves se filtran
 * una vez, y el monto sale con nombre propio — montoDolares o unidadesRegalo —
 * para que no se pueda confundir mas abajo.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    CDK.promo = CDK.promo || {};

    /* Las claves de `data` que NO son productos. */
    var NO_PRODUCTO = { tipo: true, descripcion: true };

    var DESCUENTO = "descuento";
    var REGALO = "regalo";

    /**
     * `tipo` llega como arreglo de un elemento: ["descuento"] o ["regalo"].
     * Se acepta tambien el texto suelto por si alguna entrada viniera plana.
     */
    function tipoDe(valor) {
        if (Array.isArray(valor)) valor = valor[0];
        return valor === REGALO ? REGALO : DESCUENTO;
    }

    function numero(valor) {
        var n = Number(valor);
        return isFinite(n) ? n : 0;
    }

    /**
     * Abre el sobre { status, codigo, data }.
     * Devuelve undefined si la respuesta no tiene esa forma, para que quien
     * llame pueda distinguir "sin datos" de "esto no es lo que esperaba".
     */
    function abrirSobre(respuesta) {
        if (!respuesta || typeof respuesta !== "object") return undefined;
        if (!("data" in respuesta)) return undefined;
        return respuesta.data;
    }

    /**
     * Codigos de promocion candidatos, desde /promocion/recolector.
     *
     * Devuelve un arreglo de idprom en texto: ["15112", "14656"].
     * Lanza si la respuesta no trae el sobre, porque confundir eso con "no hay
     * promociones" es justo lo que hacia que no apareciera ninguna.
     */
    CDK.promo.codigos = function (respuesta) {
        var data = abrirSobre(respuesta);
        if (data === undefined) {
            throw new Error("El recolector no devolvio el sobre { status, codigo, data }");
        }
        if (!Array.isArray(data)) return [];

        return data
            .map(function (c) { return String(c); })
            .filter(function (c) { return c !== "" && c !== "null" && c !== "undefined"; });
    };

    /**
     * true si el error de /recolector significa "ninguno de estos productos
     * tiene promocion".
     *
     * El backend lo responde como 400, no como lista vacia, asi que sin esto
     * el caso mas normal del mundo se veria como un fallo del servidor.
     */
    CDK.promo.esSinPromociones = function (err) {
        if (!err || err.status !== 400) return false;
        var datos = err.datos;
        return !!datos && datos.status === "ninguna promocion";
    };

    /**
     * Cuerpo para /promocion/recolector.
     *
     * Solo lee `codigo` de cada producto; mandar el objeto entero del carrito
     * (descripciones, los tres stocks, precios, topes) no aporta nada.
     */
    CDK.promo.cuerpoRecolector = function (productos) {
        var salida = {};
        Object.keys(productos || {}).forEach(function (i) {
            var p = productos[i];
            if (p && p.codigo) salida[i] = { codigo: p.codigo };
        });
        return { productos: salida };
    };

    /**
     * Cuerpo para /promocion/detalle.
     *
     * De cada producto se usan cuatro campos. `preciosinIGV` es el total de la
     * linea CON el descuento del vendedor ya aplicado, y en dolares: es contra
     * ese monto rebajado contra el que se mide el umbral de una promocion
     * valorizada.
     */
    CDK.promo.cuerpoDetalle = function (idprom, productos) {
        var salida = {};
        Object.keys(productos || {}).forEach(function (i) {
            var p = productos[i];
            if (!p || !p.codigo) return;
            salida[i] = {
                codigo: p.codigo,
                descripcion: p.descripcion,
                cantidad: p.cantidad,
                preciosinIGV: p.preciosinIGV,
                descuento: p.descuento
            };
        });
        return { codigo: String(idprom), productos: salida };
    };

    /**
     * Resultado de /promocion/detalle, normalizado.
     *
     * Que NO aplique no es un error: el backend responde 200 con data null y el
     * motivo, y cuando el motivo es "no_alcanza" dice ademas cuanto falta. Eso
     * es informacion util para el vendedor, no algo que esconder.
     *
     *   { idprom, aplica, descripcion, tipo, lineas, totalDescuento,
     *     totalRegalos, motivo, mensaje, faltante, unidad }
     */
    CDK.promo.detalle = function (respuesta, idprom) {
        idprom = String(idprom);

        var data = abrirSobre(respuesta);
        if (data === undefined) {
            throw new Error("El detalle de " + idprom + " no devolvio el sobre { status, codigo, data }");
        }

        // No aplica: 200 con data null y el motivo al lado del sobre.
        if (data === null) {
            return {
                idprom: idprom,
                aplica: false,
                motivo: respuesta.motivo || null,
                mensaje: respuesta.msg || "Esta promocion no aplica al carrito.",
                // Puede ser null si el umbral es 0; no se fuerza a numero.
                faltante: respuesta.faltante === undefined ? null : respuesta.faltante,
                unidad: respuesta.unidad || null,
                lineas: [],
                totalDescuento: 0,
                totalRegalos: 0
            };
        }

        var tipoPromo = tipoDe(data.tipo);
        var lineas = [];

        Object.keys(data).forEach(function (clave) {
            // Aqui es donde `tipo` y `descripcion` dejarian de ser metadatos
            // para convertirse en dos productos fantasma.
            if (NO_PRODUCTO[clave]) return;

            var e = data[clave];
            if (!e || typeof e !== "object") return;

            var tipo = tipoDe(e.tipo || data.tipo);
            var monto = numero(e.montoDescuento);

            lineas.push({
                itemdescr: e.itemdescr || "",
                descripcion: e.descripcion || data.descripcion || "",
                tipo: tipo,
                // `cantidad` son las VECES que se alcanzo el umbral, no unidades.
                veces: numero(e.cantidad),

                /* El mismo montoDescuento, con el nombre de lo que de verdad es.
                   En descuento son dolares SIN IGV: el backend ya dividio entre
                   1.18, y volver a dividir aqui rebajaria el beneficio. */
                montoDolares: tipo === DESCUENTO ? monto : 0,
                unidadesRegalo: tipo === REGALO ? monto : 0,

                // Solo en ambito total venta.
                participantes: Array.isArray(e.participantes) ? e.participantes : null,
                acumulado: e.acumulado === undefined ? null : numero(e.acumulado)
            });
        });

        var totalDescuento = 0;
        var totalRegalos = 0;
        lineas.forEach(function (l) {
            totalDescuento += l.montoDolares;
            totalRegalos += l.unidadesRegalo;
        });

        return {
            idprom: idprom,
            aplica: lineas.length > 0,
            descripcion: data.descripcion || "",
            tipo: tipoPromo,
            lineas: lineas,
            totalDescuento: Math.round(totalDescuento * 100) / 100,
            totalRegalos: totalRegalos,
            motivo: null,
            mensaje: "",
            faltante: null,
            unidad: null
        };
    };

    /**
     * Texto de lo que otorga una linea, ya desambiguado.
     *
     * Un regalo no lleva simbolo de moneda por mucho que monedaDescuento diga
     * "D": son piezas. Un descuento si, convertido a la moneda de pantalla
     * desde los dolares en que lo da el backend.
     */
    CDK.promo.textoBeneficio = function (linea, moneda) {
        if (linea.tipo === REGALO) {
            return linea.unidadesRegalo === 1
                ? "1 obsequio"
                : linea.unidadesRegalo + " obsequios";
        }
        return CDK.formato.moneda(
            CDK.coti.convertir(linea.montoDolares, "D"),
            moneda || "D"
        );
    };

    CDK.promo.DESCUENTO = DESCUENTO;
    CDK.promo.REGALO = REGALO;

})(window);
