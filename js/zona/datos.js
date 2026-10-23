/**
 * Jefe de zona (grupo 34) — acceso a `/v1/zona/*`.
 *
 * Por ahora el jefe de zona mira **todo el grupo 20** (cobertura y cartera): el avance de la cuota de todos los
 * vendedores y, de uno en uno, la probabilidad de que lleguen a la suya. Solo lectura.
 *
 *   GET /zona/avance                         el mes en curso
 *   GET /zona/avance?anno=2026&mes=9         uno de los dos meses anteriores (`anno` y `mes` van juntos)
 *   GET /zona/probabilidad?codusu=196        de UN vendedor: el mes actual y los 3 anteriores, cada uno al mismo dia
 *
 * Las respuestas vienen en el sobre `{ status, codigo, data }`, sin doble codificar; aquí se devuelve ya `data`, y
 * en un error HTTP el sobre queda en `err.datos` (`status` para decidir en código, `msg` para mostrar).
 *
 * **El avance es en dólares CON IGV**, el mismo número que cada vendedor ve en su pantalla de cuota. No es la regla de la
 * cuota por marca del grupo 25 (sin IGV): no hay que comparar las dos cifras.
 *
 * Cada llamada se calcula en el momento, y recorre las facturas del mes: se recomienda refrescar cada 2 a 5 minutos, o
 * con un botón, y no más seguido.
 *
 * Ver docs/zona-grupo34.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var zona = CDK.zona = CDK.zona || {};

    function desenvolver(respuesta) {
        return respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
    }

    /**
     * El avance de la cuota de todos los vendedores del grupo 20 que la registraron, y aparte los que no:
     * `{ anno, mes, actual, ventasHasta, actualizado, esperado, total, vendedores[], sinCuota[] }`.
     * Sin argumento, el mes en curso; con `{ anno, mes }`, uno de los dos anteriores.
     */
    zona.avance = function (periodo) {
        var consulta = periodo && periodo.anno && periodo.mes
            ? "?anno=" + encodeURIComponent(periodo.anno) + "&mes=" + encodeURIComponent(periodo.mes)
            : "";

        return CDK.http.get(CDK.rutas.api("/zona/avance" + consulta)).then(desenvolver);
    };

    /**
     * La probabilidad de que UN vendedor llegue a su cuota este mes, y como iba en los 3 meses anteriores a esta misma
     * altura del mes: `{ vendedor, hoy, actualizado, meses[4] }`. El `codusu` sale de la lista de avance.
     */
    zona.probabilidad = function (codusu) {
        return CDK.http.get(CDK.rutas.api("/zona/probabilidad?codusu=" + encodeURIComponent(codusu))).then(desenvolver);
    };

})(window);
