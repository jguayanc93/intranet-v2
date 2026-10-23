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
                olvidarMenu();
                // No se quita el indicador: la página está a punto de cambiar y
                // devolver el botón a su estado normal produce un parpadeo.
                location.replace(CDK.rutas.inicio());
            })
            .catch(function (err) {
                /* Una cuenta válida que aún no figura en la intranet no es un
                   error de credenciales: el backend lo dice con `no
                   identificado` y el camino es el alta. Se comprueba ANTES de
                   pintar nada: antes salía un instante «usuario y/o contraseña
                   incorrectos» y recién después se redirigía, que a quien
                   acertó su contraseña le dice justo lo contrario de lo que
                   pasa. Tampoco se quita el indicador: la página va a cambiar. */
                if (err.detalles && err.detalles.status === "no identificado") {
                    location.assign(CDK.rutas.registro());
                    return;
                }

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
     * El menú de módulos se guarda en sessionStorage y se revalida al abrir el
     * panel, pero hasta entonces se pinta el guardado. Si quien entra no es
     * quien lo guardó —un equipo compartido donde nadie cerró sesión—, vería un
     * instante el menú y el nombre de otra persona. Cerrar sesión ya lo borra;
     * esto cubre entrar sin haber cerrado.
     *
     * Se borran todas las claves `cdk.modulos.*` en vez de una concreta: la
     * clave lleva la versión de la caché (core/cdk-permisos.js), y este archivo
     * no carga ese módulo.
     */
    function olvidarMenu() {
        try {
            Object.keys(sessionStorage)
                .filter(function (clave) { return clave.indexOf("cdk.modulos.") === 0; })
                .forEach(function (clave) { sessionStorage.removeItem(clave); });
        } catch (e) { /* almacenamiento no disponible: no había nada que borrar */ }
    }

    /**
     * El backend acompaña el error de un campo `status` con texto propio, que no
     * es el código HTTP.
     */
    function manejarDetalle(detalle) {
        switch (detalle.status) {
            case "no cdk user":
                error("Esta cuenta no está registrada en el sistema.");
                break;

            /* Del grupo 34: el backend deja entrar solo a un usuario hasta que se decida, y a los demas les responde 403. No es
               un error de credenciales —acertaron— ni algo que reintentar: se dice que todavia no tiene acceso. */
            case "usuario sin acceso":
                error("Tu usuario todavía no tiene acceso a la intranet. Consulta con tu jefatura o con sistemas.");
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
