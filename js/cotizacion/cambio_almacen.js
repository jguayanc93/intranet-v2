/**
 * Cambio de almacén de una cotización.
 *
 * Reúne lo que antes estaba repartido entre js/cotizacion/cambio_almacen.js y
 * js/funciones/coti_cambiar_almacen.js.
 *
 * Cambios de comportamiento, a propósito:
 *
 *   · Pide confirmación. Es una operación que afecta a la disponibilidad de
 *     producto y antes se disparaba con un solo toque, sin vuelta atrás.
 *   · Informa del resultado en pantalla. Antes tanto el éxito como el error
 *     iban a console.log y la persona no veía absolutamente nada.
 *   · No se apoya en la global `almc_id`: el almacén se lee del propio select.
 *
 * `rutacotizacioncambiaralmacen` ya apuntaba a producción, así que usar
 * CDK.rutas.api() da la misma URL allí y además funciona en local.
 */
;(function () {
    "use strict";

    var formulario = document.getElementById("form-almacen");
    var entrada = document.getElementById("busqueda");
    var selector = document.getElementById("alm");
    var boton = document.getElementById("cambio");
    var destino = document.getElementById("resultado");
    var elegida = document.getElementById("coti-elegida");

    if (!formulario) return;

    // Los almacenes salen del catálogo, no escritos a mano en el HTML: así el
    // nombre que se ve aquí es el mismo que en el detalle de la cotización.
    CDK.catalogo.almacenes().forEach(function (a) {
        selector.appendChild(CDK.el("option", { value: a.codigo, texto: a.nombre }));
    });

    /* La lista de las propias, que es el camino normal: nadie se acuerda del
       número. Viene filtrada por el vendedor de la galleta, así que por aquí es
       imposible llegar a la de otro.

       Solo las abiertas: a una facturada ya no se le cambia el almacén. */
    CDK.coti.listaDelDia({
        destino: document.getElementById("lista-cotis"),
        botonHoy: document.getElementById("btn-hoy"),
        botonDosDias: document.getElementById("btn-dos-dias"),
        soloAbiertas: true,
        alElegir: function (coti) {
            entrada.value = coti.documento;
            elegida.textContent = coti.cliente
                ? coti.documento + "  ·  " + coti.cliente
                : coti.documento;
            elegida.classList.remove("hidden");
            // Lo único que queda por decidir es el almacén.
            selector.focus();
        }
    });

    // Se admite ?ncoti=… para llegar desde el detalle de una cotización sin
    // volver a teclear el número.
    (function precargar() {
        var numero = new URLSearchParams(location.search).get("ncoti");
        if (!numero) return;

        entrada.value = numero;
        elegida.textContent = numero;
        elegida.classList.remove("hidden");
        selector.focus();
    })();

    formulario.addEventListener("submit", function (ev) {
        ev.preventDefault();
        confirmarYCambiar();
    });

    function nombreAlmacen() {
        return CDK.catalogo.almacen(selector.value);
    }

    function confirmarYCambiar() {
        var numero = entrada.value.trim();

        if (!numero) {
            CDK.toast("Escribe el número de cotización", "aviso");
            entrada.focus();
            return;
        }

        CDK.modal.confirmar({
            titulo: "¿Cambiar el almacén?",
            mensaje: "La cotización " + numero + " pasará al almacén " + nombreAlmacen() +
                     ". Esto afecta a la disponibilidad de los productos y no se puede deshacer.",
            confirmar: "Cambiar",
            peligro: true
        }).then(function (si) {
            if (si) cambiar(numero);
        });
    }

    function cambiar(numero) {
        boton.disabled = true;
        CDK.estados.cargando(destino, "Aplicando el cambio…");

        CDK.http.post(CDK.rutas.api("/cotizacion/almacen"), {
            ncoti: numero,
            alm: selector.value
        })
            .then(function (respuesta) {
                boton.disabled = false;
                CDK.estados.limpiar(destino);
                CDK.toast("Cotización " + numero + " movida al almacén " + nombreAlmacen(), "exito");

                formulario.reset();
                entrada.focus();

                if (respuesta && respuesta.msg) console.info("[almacen]", respuesta.msg);
            })
            .catch(function (err) {
                boton.disabled = false;
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                CDK.estados.error(destino, err, function () { cambiar(numero); });
            });
    }
})();
