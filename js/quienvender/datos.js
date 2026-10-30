/**
 * ¿A quien vender hoy? (grupo 20, cartera y cobertura) — acceso a `GET /v1/quienvender`.
 *
 * El vendedor entra y el sistema le dice **3 clientes para hoy**: 2 para reponer y 1 para llamar. Una sola ruta, sin parametros (el
 * vendedor es el de la sesion), de solo lectura para la pantalla.
 *
 * **Se calcula la primera vez que el vendedor abre el modulo en el dia** (cerca de un segundo) y se graba: todo el dia recibe los
 * mismos, y al dia siguiente, otros. Por eso quien llama a esto lo hace **solo cuando el vendedor abre la pantalla**: nunca por
 * adelantado, ni desde otra pantalla, ni en un refresco. Pedirlo dos veces el mismo dia devuelve lo mismo.
 *
 * La respuesta viene en el sobre `{ status, codigo, data }`; aqui se devuelve ya `data`, y en un error HTTP el sobre queda en
 * `err.datos` (`status` para decidir en codigo, `msg` para mostrar).
 *
 * Ver docs/quienvender-grupo20.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var quienvender = CDK.quienvender = CDK.quienvender || {};

    function desenvolver(respuesta) {
        return respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
    }

    /**
     * Los clientes de hoy: `{ fecha, vendedor: { codven, tipo }, sugeridos[], aviso }`. Cada sugerido trae `puesto` (1, 2 y 3, ya
     * ordenados), `tipo` (`REPONER`, `LLAMAR`, `REACTIVAR`, `SIN_COMPRAS` o `LIBRE`), `motivo`, `codcli`, `cliente`, `valorUsd` (lo que
     * significa depende del `tipo`; `null` si no aplica), `ultimaCompra`, `mesesConCompra` y `facturasMesPasado` (solo `LLAMAR`) y
     * `productos[]`. Pueden llegar menos de 3; sin ninguno, `sugeridos: []` y un `aviso` (no es un error).
     */
    quienvender.hoy = function () {
        return CDK.http.get(CDK.rutas.api("/quienvender")).then(desenvolver);
    };

})(window);
