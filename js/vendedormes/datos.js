/**
 * Vendedor del mes (grupo 25) — acceso a `GET /v1/vendedormes/top`.
 *
 * De cada marca, **los 3 vendedores del grupo 20 que más la vendieron en el mes**. Solo
 * lectura. Solo el mes en curso o el anterior: otro mes es `400 mes no disponible`.
 *
 * Las respuestas vienen en el sobre `{ status, codigo, data }`, sin doble codificar; aquí se
 * devuelve ya `data`. Excepción: **sin marcas** no trae `data` sino `{ status, msg, … }` en el
 * primer nivel, como en cuota, reportes y cobertura; se devuelve como `{ sinMarcas: true, msg }`,
 * y con `enEseMes: true` si es el mes anterior (ahí no hay que elegir marcas: entonces no había).
 *
 * **`total.venta` de aquí no es el avance de la cuota**: la cuota mide la marca en toda la
 * empresa y este total es solo lo que vendió el grupo 20.
 *
 * Ver docs/vendedor-mes-grupo25.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var vendedormes = CDK.vendedormes = CDK.vendedormes || {};

    function interpretar(r) {
        if (r && (r.debeAsignar === true || r.status === "sin marcas del mes")) {
            return { sinMarcas: true, msg: r.msg };
        }
        if (r && r.status === "sin marcas en ese mes") {
            return { sinMarcas: true, enEseMes: true, msg: r.msg };
        }
        return r && r.data !== undefined ? r.data : r;
    }

    vendedormes.interpretar = interpretar;

    /**
     * El top 3 de cada marca: `{ anno, mes, actual, rol, marcas[] }`. Cada marca trae `dueno`,
     * `total: { venta, vendedores }` y `top[]` (hasta 3, del que más vendió al que menos; vacío si
     * nadie la vendió). Sin argumento, el mes en curso; con `{ anno, mes }`, el anterior.
     */
    vendedormes.top = function (periodo) {
        var consulta = periodo && periodo.anno && periodo.mes
            ? "?anno=" + encodeURIComponent(periodo.anno) + "&mes=" + encodeURIComponent(periodo.mes)
            : "";

        return CDK.http.get(CDK.rutas.api("/vendedormes/top" + consulta)).then(interpretar);
    };

})(window);
