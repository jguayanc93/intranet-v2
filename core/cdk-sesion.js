/**
 * cdk-sesion.js — Guard de sesion, datos del usuario y cierre de sesion.
 *
 * La sesion es una cookie HttpOnly que el JS no puede leer, asi que el frontend
 * no sabe si hay sesion hasta que el backend responde mal. El guard se apoya en
 * eso: la peticion de modulos que el shell necesita de todas formas hace tambien
 * de sonda de sesion, sin round-trips extra.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};

    var COOKIE_CENTINELA = "cdk_sesion";

    var usuario = null;      // {nombre, grupo, tipo, marcas}
    var expirando = false;   // un solo disparo de redireccion

    /** true si esta pagina se declara fuera del shell (login, registro). */
    function fueraDelShell() {
        var body = document.body;
        return !body || body.getAttribute("data-shell") === "none";
    }

    function leerCookie(nombre) {
        var partes = ("; " + document.cookie).split("; " + nombre + "=");
        return partes.length === 2 ? partes.pop().split(";").shift() : null;
    }

    CDK.sesion = {
        /**
         * Pista sincrona de si hay sesion, sin red.
         *
         * Depende de una cookie centinela SIN HttpOnly y sin secreto, que el backend
         * deberia emitir junto a la de sesion. Si no existe devuelve true, de modo
         * que el codigo funciona igual con o sin ella y el 401 sigue siendo la
         * autoridad real.
         *
         * Nunca se usa para autorizar: es solo una pista de UX para poder redirigir
         * antes del primer pintado en vez de despues.
         */
        hayIndicio: function () {
            var centinela = leerCookie(COOKIE_CENTINELA);
            return centinela === null ? true : centinela === "1";
        },

        /** Datos del usuario, o null si aun no llegaron. Sincrono. */
        usuario: function () {
            return usuario;
        },

        /** Lo alimenta cdk-permisos.js con la respuesta de /vendedor. */
        fijarUsuario: function (datos) {
            if (!datos) return;
            usuario = {
                nombre: datos.nombre || datos.usuario || datos.vendedor || "Usuario",
                grupo:  datos.grupo  || null,
                tipo:   datos.tipo   || datos.diferenciador || null,
                marcas: datos.marcas || [],
                // Aún no lo envía el backend. Se acepta desde ya para que el día
                // que lo incluya empiece a usarse sin tocar nada: hoy las
                // conversiones a soles tiran de un valor fijo en el código.
                tipoCambio: Number(datos.tipoCambio) || null
            };
        },

        /** Tipo de vendedor, o null si el backend aun no lo ha informado. */
        tipo: function () {
            return usuario ? usuario.tipo : null;
        },

        /**
         * Marca la sesion como terminada y manda al login.
         *
         * Idempotente: si hay varias peticiones en vuelo y todas dan 401, solo la
         * primera redirige. Sin esta guarda y sin la de fueraDelShell() se entra
         * en bucle de redireccion, que es el fallo clasico de esta pieza.
         */
        expirar: function (motivo) {
            if (expirando) return;
            expirando = true;

            if (CDK.permisos && CDK.permisos.invalidar) CDK.permisos.invalidar();
            usuario = null;

            if (fueraDelShell()) return;

            console.warn("[CDK] sesion terminada:", motivo || "desconocido");
            location.replace(CDK.rutas.login());
        },

        /** Cierra sesion contra el backend y vuelve al login. */
        salir: function () {
            return CDK.http
                .post(CDK.rutas.api("/logout"), { msg: "terminar sesion" }, { sin401: true })
                .catch(function (err) {
                    // Si el backend falla igual hay que sacar al usuario de aqui,
                    // pero dejando rastro. El logout actual se traga el error en
                    // un catch vacio y deja a la persona dentro sin aviso.
                    console.error("[CDK] fallo al cerrar sesion:", err);
                })
                .then(function () {
                    if (CDK.permisos && CDK.permisos.invalidar) CDK.permisos.invalidar();
                    usuario = null;
                    expirando = true;   // evita que un 401 en vuelo redirija tambien
                    location.replace(CDK.rutas.login());
                });
        }
    };

    /* ---------------------------------------------------------------
     * Logout por delegacion de eventos.
     *
     * js/login/logout.js:2 hace getElementById("sesion-terminada").addEventListener
     * en top level, sin guarda de null: si el boton no existe todavia, lanza
     * TypeError y mata el archivo entero. Con delegacion da igual cuando se
     * inyecte el boton o cuantos haya.
     * ------------------------------------------------------------- */
    document.addEventListener("click", function (ev) {
        // ev.target puede no ser un Element (el propio document, un nodo de texto).
        if (!ev.target || typeof ev.target.closest !== "function") return;

        var disparador = ev.target.closest("#sesion-terminada, [data-accion='salir']");
        if (!disparador) return;

        ev.preventDefault();
        CDK.sesion.salir();
    });

})(window);
