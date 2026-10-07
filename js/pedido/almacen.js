/**
 * Cambio de almacén de un pedido.
 *
 * Pantalla nueva: el hub ya ofrecía la acción —el catálogo la declaraba con
 * `existe:false`— pero apuntaba a `/pedido/cotizacion_almacen.html`, que no
 * existía. La ruta tampoco; ahora sí.
 *
 * Sigue el mismo guion que el cambio de almacén de cotización, porque para
 * quien lo usa es la misma tarea: elegir documento, elegir almacén, confirmar.
 *
 * **Una diferencia con cotización que importa**: el pedido guarda el almacén
 * en la cabecera Y en cada línea, y la ruta actualiza los dos dentro de una
 * transacción. Por eso la respuesta dice cuántas líneas tocó: es la señal de
 * que no quedaron descuadradas.
 *
 * Ver docs/pedido.md.
 */
;(function () {
    "use strict";

    var formulario = document.getElementById("form-almacen");
    var entrada = document.getElementById("npedi");
    var selector = document.getElementById("alm");
    var boton = document.getElementById("btn-cambiar");
    var destino = document.getElementById("resultado");

    if (!formulario) return;

    CDK.catalogo.almacenes().forEach(function (a) {
        selector.appendChild(CDK.el("option", { value: a.codigo, texto: a.nombre }));
    });

    /* Se admite ?npedi=… para llegar desde otra pantalla sin volver a teclear
       el número, igual que la de cotización acepta ?ncoti=… */
    (function precargar() {
        var numero = new URLSearchParams(location.search).get("npedi");
        if (!numero) return;
        entrada.value = numero;
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
            CDK.toast("Escribe el número de pedido", "aviso");
            entrada.focus();
            return;
        }

        CDK.modal.confirmar({
            titulo: "¿Cambiar el almacén?",
            mensaje: "El pedido " + numero + " pasará al almacén " + nombreAlmacen() +
                     ". Se mueven la cabecera y todas sus líneas, y no se puede deshacer.",
            confirmar: "Cambiar",
            peligro: true
        }).then(function (si) {
            if (si) cambiar(numero);
        });
    }

    function cambiar(numero) {
        boton.disabled = true;
        CDK.estados.cargando(destino, "Aplicando el cambio…");

        CDK.http.post(CDK.rutas.api("/pedido/almacen"), {
            npedi: numero,
            alm: selector.value
        })
            .then(function (respuesta) {
                boton.disabled = false;
                pintarResultado(numero, respuesta);
                CDK.toast("Pedido " + numero + " movido al almacén " + nombreAlmacen(), "exito");
                entrada.value = "";
                entrada.focus();
            })
            .catch(function (err) {
                boton.disabled = false;
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige

                /* Los cuatro motivos posibles —no es suyo o ya está atendido,
                   almacén inválido, pedido sin líneas, falta el número— llegan
                   como 4xx con su `msg`. CDK.estados.error los enseña tal cual
                   y no ofrece reintentar, que es lo correcto: ninguno se
                   arregla repitiendo la misma petición. */
                CDK.estados.error(destino, err);
            });
    }

    function pintarResultado(numero, respuesta) {
        destino.innerHTML = "";

        var lineas = respuesta && respuesta.lineas;

        destino.appendChild(CDK.el("div", { clase: "cdk-aviso" }, [
            CDK.el("p", { clase: "cdk-aviso__texto",
                texto: "Pedido " + (respuesta && respuesta.documento || numero) +
                       " movido al almacén " + nombreAlmacen() + "." }),
            /* Cuántas líneas se movieron. No es adorno: el almacén vive en la
               cabecera y en cada línea, y lo que puede salir mal es que se
               actualice una cosa y no la otra. */
            lineas === undefined || lineas === null ? null : CDK.el("p", {
                clase: "cdk-pista",
                texto: lineas + (Number(lineas) === 1 ? " línea actualizada." : " líneas actualizadas.")
            })
        ]));
    }
})();
