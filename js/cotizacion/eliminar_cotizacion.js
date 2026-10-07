/**
 * Dar de baja una cotización.
 *
 * Es la hermana pequeña de Modificar: se elige de la lista de las propias, pero
 * aquí no se abre el detalle. Para revisar qué lleva una cotización está «Ver»;
 * esta pantalla hace una sola cosa, y es irreversible.
 *
 * Antes la pantalla existía pero **no daba de baja nada**: sus dos scripts
 * estaban dentro de un comentario con la nota «cuando estén disponibles», y
 * ninguno de los dos archivos existía. El vendedor podía recorrer el flujo
 * entero sin que pasara nada.
 *
 * LA RUTA DEL BACKEND TODAVÍA NO EXISTE. Está declarada abajo en un solo sitio
 * para que conectarla sea cambiar una línea; mientras tanto la pantalla lo dice
 * con todas las letras en vez de fingir que funcionó.
 * Los requisitos están en docs/eliminar-cotizacion.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    var RUTA_BAJA = "/cotizacion/eliminar";

    /* El motivo es opcional: sin él el backend escribe «ANULADA DESDE
       INTRANET(01)». El ERP tiene un catálogo de dos entradas —01 Error
       (otros), 02 pruebas— y la convención es el texto con el código entre
       paréntesis al final. Si algún día el vendedor debe elegirlo, se añade
       aquí un campo y se manda en el cuerpo. */

    var listaCotis = document.getElementById("lista-cotis");
    var formulario = document.getElementById("form-buscar");
    var entrada = document.getElementById("ncoti");

    if (!listaCotis) return;

    /* ---------------------------------------------------------------
     * El permiso, antes que nada
     *
     * Dar de baja está restringido por grupo: hoy pueden las jefaturas (25) y
     * zona (34), pero NO los ejecutivos (20), que son 22 de los 27 vendedores.
     *
     * La lista de acciones que devuelve GET /cotizacion ya lo dice: `delete`
     * solo llega si el grupo lo tiene. Montar la pantalla sin mirarla deja a
     * esos 22 eligiendo una cotización, confirmando, y recibiendo un 403 por
     * algo que nunca pudieron hacer.
     *
     * Esto es presentación, no seguridad: el backend rechaza igual si alguien
     * dispara la petición a mano. Pero no ofrecer lo que no se puede es parte
     * de decir la verdad.
     * ------------------------------------------------------------- */
    CDK.permisos.accesos("cotizacion")
        .then(function (permisos) {
            if (permisos.indexOf("delete") === -1) return sinPermiso();
            montar();
        })
        .catch(function () {
            /* Si no se pudo saber, se monta igual: el backend sigue siendo
               quien decide, y dejar la pantalla en blanco por no poder
               consultar los permisos sería peor que ofrecer de más. */
            montar();
        });

    function sinPermiso() {
        CDK.estados.error(
            listaCotis,
            "Tu grupo no tiene permiso para dar de baja cotizaciones. " +
            "Si crees que debería tenerlo, avisa al equipo de sistemas.",
            null
        );

        // Buscar por número tampoco serviría de nada.
        var plegable = formulario.closest("details");
        if (plegable) plegable.classList.add("hidden");
    }

    var listaDia = null;

    function montar() {
        listaDia = CDK.coti.listaDelDia({
            destino: listaCotis,
            botonHoy: document.getElementById("btn-hoy"),
            botonDosDias: document.getElementById("btn-dos-dias"),
            // Una facturada, convertida o aprobada no se da de baja desde aquí.
            soloAbiertas: true,
            alElegir: confirmar,
            /* Cada fila lleva su propia acción en vez de ser pulsable entera:
               dar de baja es irreversible, y una fila que se activa al tocarla
               en cualquier punto es demasiado fácil de disparar sin querer en
               un móvil. */
            accionPorFila: {
                texto: "Dar de baja",
                peligro: true
            }
        });

        formulario.addEventListener("submit", function (ev) {
            ev.preventDefault();

            var numero = entrada.value.trim();
            if (!numero) {
                CDK.toast("Escribe el número de cotización", "aviso");
                entrada.focus();
                return;
            }

            /* Por número no hay cliente ni importe que mostrar, así que la
               confirmación va con lo único que se sabe. */
            confirmar({ documento: numero });
        });
    }

    /**
     * Pide confirmación antes de nada.
     *
     * Con el nombre del cliente y el importe dentro, no solo el número: un
     * «¿Seguro?» con un código de documento no le dice al vendedor si está a
     * punto de tirar la cotización correcta.
     */
    function confirmar(coti) {
        var detalle = coti.cliente || "";
        if (coti.total !== undefined && coti.total !== null) {
            detalle += (detalle ? " · " : "") +
                CDK.formato.moneda(coti.total, coti.moneda);
        }

        CDK.modal.confirmar({
            titulo: "Dar de baja la " + coti.documento,
            mensaje: (detalle ? detalle + ". " : "") +
                     "La cotización deja de estar disponible y esto no se puede deshacer.",
            confirmar: "Dar de baja",
            cancelar: "Cancelar",
            peligro: true
        }).then(function (si) {
            if (si) darDeBaja(coti.documento);
        });
    }

    function darDeBaja(documento) {
        CDK.http.post(CDK.rutas.api(RUTA_BAJA), { ndocu: documento })
            .then(function (respuesta) {
                if (respuesta && respuesta.status && respuesta.status !== "ok") {
                    return fallo(documento, { datos: respuesta });
                }

                CDK.toast("Cotización " + documento + " dada de baja.", "exito");
                listaDia.recargar();
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                fallo(documento, err);
            });
    }

    /* Cada rechazo trae su propio `status` y un `msg` que ya dice qué hacer, así
       que la pantalla no interpreta: solo pone el título que corresponde y
       muestra el mensaje del backend tal cual.

       Antes esto adivinaba por el texto, porque «aprobada» y «facturada»
       compartían el 409. Ya no hace falta. */
    var TITULOS = {
        "coti aprobada":     "La cotización está aprobada",
        "coti no anulable":  "Ya no se puede dar de baja",
        "coti ya anulada":   "Ya estaba dada de baja",
        "coti desconocida":  "No se encontró la cotización",
        "documento ambiguo": "Falta la serie",
        "sin permiso":       "No tienes permiso",
        "baja no aplicada":  "La baja no se aplicó"
    };

    function fallo(documento, err) {
        var datos = (err && err.datos) || {};
        var detalle = datos.msg || "";

        CDK.modal.alerta({
            titulo: TITULOS[datos.status] || "No se pudo dar de baja",
            mensaje: detalle || "El servidor no confirmó la baja de la cotización " +
                                documento + ". Vuelve a intentarlo en un momento.",
            confirmar: "Cerrar",
            peligro: true
        });
    }

})();
