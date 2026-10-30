/**
 * Promociones vigentes del grupo 20 (cartera y cobertura) — acceso a `/v1/promocion/vigentes`.
 *
 * Es para OFRECER, no para aplicar: aplicar una promocion a una cotizacion sigue siendo el modulo `promocion` de siempre. Solo lectura.
 *
 *   GET /promocion/vigentes             lo que esta en promocion hoy, las que vencen antes primero
 *   GET /promocion/vigentes/15221       el detalle de una, con los productos que se compran
 *
 * Las respuestas vienen en el sobre `{ status, codigo, data }`; aqui se devuelve ya `data`, y en un error HTTP el sobre queda en
 * `err.datos` (`status` para decidir en codigo, `msg` para mostrar). Un `404 promocion no vigente` es normal: la promocion pudo vencer
 * entre la lista y el detalle.
 *
 * No hay montos: ni el porcentaje del descuento ni cuanto se regala (lo resuelve el motor al cotizar), y el stock es solo
 * `DISPONIBLE` o `AGOTADO`, nunca el numero.
 *
 * Ver docs/promovigentes-grupo20.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var promovigentes = CDK.promovigentes = CDK.promovigentes || {};

    function desenvolver(respuesta) {
        return respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
    }

    /**
     * Las promociones vigentes hoy: `{ fecha, total, promociones[] }`. Cada una trae `idprom` (texto), `nombre`, `descripcion`, `tipo`
     * (`DESCUENTO`, `REGALO` o `null`), `venceEl`, `diasRestantes` (0 el ultimo dia), `soloAlgunosClientes`, `marca`, `familia`,
     * `productos` y `disponibles`. Sin ninguna, `total: 0` y `promociones: []`: no es un error.
     */
    promovigentes.lista = function () {
        return CDK.http.get(CDK.rutas.api("/promocion/vigentes")).then(desenvolver);
    };

    /**
     * El detalle de una: `{ fecha, promocion, productos[] }`. `promocion` es la misma fila de la lista; cada producto trae
     * `descripcion`, `partNumber` (`""` si no tiene), `marca`, `familia` y `disponibilidad` (`DISPONIBLE` o `AGOTADO`). Si ya no esta
     * vigente, o el id no es un numero, responde `404 promocion no vigente`.
     */
    promovigentes.detalle = function (idprom) {
        return CDK.http.get(CDK.rutas.api("/promocion/vigentes/" + encodeURIComponent(idprom))).then(desenvolver);
    };

})(window);
