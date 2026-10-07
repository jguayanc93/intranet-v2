/**
 * cdk-compat.js — Puentes hacia nombres del codigo antiguo.
 *
 * OPCIONAL y por pagina: NO forma parte del bloque core. Se carga solo donde se
 * este migrando y se pueda probar.
 *
 * Debe ir DESPUES de los scripts de pagina a los que pisa, no antes.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    if (!CDK || !CDK.http) {
        console.error("[CDK] cdk-compat.js requiere el bloque core cargado antes.");
        return;
    }

    /* ---------------------------------------------------------------
     * parseJSONResponse
     *
     * Hoy esta definida dos veces con semanticas opuestas y ambas se cargan en
     * cotizacion_nuevo.html:
     *   · buscar_promo_part4.js:79  devuelve null si el parseo falla
     *   · buscar_promo_part5.js:29  devuelve el valor crudo
     * part5 se carga despues, asi que gana, y los llamadores de part4 que
     * comprueban `=== null` nunca reciben null. El bug lleva ahi desde entonces.
     *
     * CDK.http.desempaquetar tiene la semantica de part5 (devuelve el crudo), que
     * es la que esta activa hoy. El puente NO cambia el comportamiento actual:
     * solo unifica el origen.
     *
     * Antes de apoyarse en esto, revisar los llamadores:
     *   grep -rn "parseJSONResponse(" js/cotizacion/
     */
    global.parseJSONResponse = CDK.http.desempaquetar;

})(window);
