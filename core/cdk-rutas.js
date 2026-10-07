/**
 * cdk-rutas.js — Resolucion de URLs.
 *
 * Sustituye el patron de caminos/rutas.js, donde cada endpoint es una constante
 * global que concatena a mano una de dos bases. Ese archivo tiene hoy 36 de 110
 * rutas apuntando a 127.0.0.1:3000 aunque se sirva en produccion.
 *
 * Aqui la base se elige UNA vez segun el entorno y los endpoints se componen.
 *
 * caminos/rutas.js sigue cargandose y no se toca: las paginas migradas usan
 * CDK.rutas.api(), las no migradas siguen con sus constantes. Coexisten.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};

    /* En desarrollo la API vive en el mismo equipo que sirve la pagina, asi que
       se toma su mismo nombre de host. Escribir 127.0.0.1 a secas rompia la
       prueba desde el movil: ahi 127.0.0.1 es el propio telefono. */
    var BASES_API = {
        dev:  "http://" + location.hostname + ":3000/v1",
        prod: "https://pulpo.compudiskett.com.pe/v1"
    };

    var baseApi = BASES_API[CDK.env] || BASES_API.prod;

    function normalizar(camino) {
        if (!camino) return "";
        return camino.charAt(0) === "/" ? camino : "/" + camino;
    }

    CDK.rutas = {
        /** Base de la API ya resuelta segun entorno. */
        base: baseApi,

        /**
         * URL de un endpoint del backend.
         *   CDK.rutas.api("/cotizacion/create")
         *   -> "https://pulpo.compudiskett.com.pe/v1/cotizacion/create"
         */
        api: function (camino) {
            return baseApi + normalizar(camino);
        },

        /**
         * URL de una pagina de esta misma aplicacion, respetando el
         * subdirectorio donde este servida.
         *   CDK.rutas.app("/cotizacion/cotizacion_nuevo.html")
         *   -> "/demo1/cotizacion/cotizacion_nuevo.html"  (o sin prefijo en produccion)
         *
         * Usar SIEMPRE esto en vez de location.assign con el dominio escrito a mano,
         * que es lo que hacen hoy js/login/login.js:64 y js/login/logout.js:18 y por
         * lo que el login local redirige a produccion.
         */
        app: function (camino) {
            return CDK.base + normalizar(camino);
        },

        /** Pagina de inicio de sesion. */
        login: function () {
            return CDK.rutas.app("/index.html");
        },

        /** Pagina de registro / identificacion. */
        registro: function () {
            return CDK.rutas.app("/registro.html");
        },

        /** Panel principal. */
        inicio: function () {
            return CDK.rutas.app("/main.html");
        }
    };

    Object.freeze(CDK.rutas);

})(window);
