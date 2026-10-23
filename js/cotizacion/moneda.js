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

    var opcionSoles = selector.querySelector('option[value="S"]');
    var avisoSinCambio = document.getElementById("aviso-soles");
    var avisoPromos = document.getElementById("aviso-promos-soles");
    var botonPromos = document.getElementById("btn-promociones");

    /**
     * Pone la pantalla de acuerdo con la moneda y el tipo de cambio:
     *
     *   · SIN tipo de cambio de hoy no se cotiza en soles: la opcion se desactiva y se dice por que (el backend tambien lo
     *     rechaza, `tipcambio no registrado`). Antes se usaba uno fijo en silencio y el vendedor veia un precio que no era el
     *     que se grababa.
     *   · EN soles no hay promociones: solo existen en dolares, y acoplar una a una cotizacion en soles la dejaria con lineas en
     *     dos monedas. El boton se desactiva y se dice por que.
     *
     * `almc_id`, que es lo que se manda a /pegar, sale siempre de `CDK.coti.moneda()`: una sola fuente, la misma que usan los
     * importes de la pantalla. Se llama al arrancar, al cambiar el selector y cuando llega el usuario (con el tipo de cambio).
     */
    function sincronizar() {
        var usuario = CDK.sesion && CDK.sesion.usuario ? CDK.sesion.usuario() : null;
        var hay = CDK.coti.haySoles();

        if (opcionSoles) opcionSoles.disabled = !hay;
        if (!hay && selector.value === "S") selector.value = "D";        // el navegador restaura la ultima eleccion

        /* El aviso solo cuando ya se sabe que NO hay tipo de cambio: antes de que llegue el usuario tampoco hay soles, pero no
           es un problema que haya que decirle. */
        if (avisoSinCambio) avisoSinCambio.classList.toggle("hidden", !(usuario && !hay));

        almc_id = CDK.coti.moneda();

        var soles = almc_id === "S";
        if (botonPromos) botonPromos.disabled = soles;
        if (avisoPromos) avisoPromos.classList.toggle("hidden", !soles);
    }

    CDK.coti.sincronizarMoneda = sincronizar;

    sincronizar();
    document.addEventListener("cdk:usuario", sincronizar);

    selector.addEventListener("change", function () {
        sincronizar();

        /* Las promociones se calcularon en dolares: al pasar a soles se retiran —y no hay nada que volver a consultar—. */
        if (almc_id === "S" && CDK.coti.invalidarPromociones) {
            CDK.coti.invalidarPromociones("pasaste a soles, que no admite promociones", { definitivo: true });
        }

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
