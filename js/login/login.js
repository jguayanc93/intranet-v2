/**
 * Inicio de sesión.
 *
 * Un único manejador del submit: valida, envía y gobierna el indicador de carga
 * con la respuesta real. Antes había dos manejadores compitiendo (ver el
 * comentario de js/login/validacion.js).
 *
 * El envío sigue siendo FormData, como espera el backend. No se fija
 * Content-Type a propósito: lo pone el navegador con su boundary.
 */
;(function () {
    "use strict";

    var formulario = document.getElementById("cdk-logeo");
    if (!formulario) return;

    var validador = window.validadorLogin;

    function cargando(activo) {
        if (validador) validador.cargando(activo);
    }

    function error(mensaje) {
        if (validador) validador.mensaje(mensaje, "error");
        else document.getElementById("respuesta").textContent = mensaje;
    }

    formulario.addEventListener("submit", function (ev) {
        ev.preventDefault();

        // Ahora la validación sí frena el envío.
        if (validador && !validador.validarTodo()) return;
        if (validador) validador.ocultarMensaje();

        cargando(true);

        // sin401: aquí un 401 significa "credenciales incorrectas", no "sesión
        // expirada". Sin esto, el guard mandaría al login estando ya en el login.
        CDK.http.post(CDK.rutas.api("/login"), new FormData(formulario), { sin401: true })
            .then(function () {
                // No se quita el indicador: la página está a punto de cambiar y
                // devolver el botón a su estado normal produce un parpadeo.
                location.replace(CDK.rutas.inicio());
            })
            .catch(function (err) {
                cargando(false);

                document.getElementById("user").value = "";
                document.getElementById("pass").value = "";

                if (err.status === 0) {
                    error("No se pudo conectar con el servidor. Revisa tu conexión.");
                    return;
                }

                error("Usuario y/o contraseña incorrectos");

                if (err.detalles) manejarDetalle(err.detalles);
            });
    });

    /**
     * El backend acompaña el error de un campo `status` con texto propio, que no
     * es el código HTTP.
     */
    function manejarDetalle(detalle) {
        switch (detalle.status) {
            case "no identificado":
                // Cuenta válida que aún no ha completado su registro.
                location.assign(CDK.rutas.registro());
                break;

            case "no cdk user":
                error("Esta cuenta no está registrada en el sistema.");
                break;

            case "falsa galleta":
                error("Tu sesión anterior quedó en mal estado. Vuelve a intentarlo.");
                break;

            case "error query":
                error("Hubo un problema en el servidor. Avisa al equipo de sistemas.");
                break;

            default:
                console.error("[login] respuesta no contemplada:", detalle);
                break;
        }
    }
})();
