/**
 * Selector de moneda al crear una cotización.
 *
 * La lógica de moneda (tipo de cambio, conversión, código ISO) vive en
 * js/cotizacion/campos.js, junto al cálculo de importes: separarlas obligaba a
 * un respaldo silencioso que devolvía dólares con la moneda puesta en soles.
 * Aquí solo queda lo que es propio de ESTA pantalla: el selector y los puentes
 * hacia los nombres que ya usa el código anterior.
 *
 * Cuidado con los nombres heredados, que despistan:
 *   · el <select> se llama `alm`, pero aquí NO es el almacén: son las monedas
 *     "D" (dólares) y "S" (soles);
 *   · la global se llama `almc_id`, y js/global/variables.js ya lo admite en su
 *     comentario ("identificador para la seleccion del almacen // ahora la
 *     moneda").
 *
 * Se conserva `almc_id` porque buscar_promo_part5.js lo lee para decidir en qué
 * moneda se registra la cotización. Renombrarlo es un cambio aparte.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    if (!CDK || !CDK.coti) {
        console.error("[CDK] moneda.js requiere js/cotizacion/campos.js cargado antes.");
        return;
    }

    /* ---------------------------------------------------------------
     * Puentes hacia los nombres que usan part2, part3 y part4.
     *
     * Así se eliminaron las tres copias de estas funciones sin tocar sus ~30
     * llamadas. Van en global porque ese código son scripts clásicos que las
     * esperan ahí.
     * ------------------------------------------------------------- */
    global.obtenerMonedaSeleccionada = CDK.coti.moneda;
    global.obtenerSímboloMoneda = CDK.coti.codigoMoneda;
    global.convertirMoneda = CDK.coti.convertir;

    /* ---------------------------------------------------------------
     * Selector
     * ------------------------------------------------------------- */
    var selector = document.getElementById("alm");
    if (!selector) return;

    // Arranca sincronizado: si el navegador restaura la selección anterior al
    // recargar, la global se quedaría con el valor por defecto.
    almc_id = selector.value;

    selector.addEventListener("change", function () {
        almc_id = selector.value;

        // El panel de producto puede estar abierto mostrando precios en la
        // moneda anterior.
        if (typeof recalcularPreciosConMoneda === "function") {
            recalcularPreciosConMoneda();
        }

        /* Y el carrito del paso 3, que ahora muestra sus lineas y totales en la
           pagina: sin esto quedaban en la moneda anterior hasta el siguiente
           cambio del carrito. */
        if (typeof window.actualizarResumenProductos === "function") {
            window.actualizarResumenProductos();
        }
    });

})(window);
