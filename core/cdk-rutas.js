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

    /**
     * Apuntar la pagina a otro servidor, sin tocar codigo: el de PRUEBA del backend
     * (base bdnava08), para recorrer lo construido con datos reales.
     *
     *     localStorage.setItem("cdk.api", "https://<direccion del servidor de prueba>")
     *     localStorage.removeItem("cdk.api")          // para volver al simulador
     *
     * Solo existe en desarrollo, y solo acepta https bajo compudiskett.com.pe: es lo
     * que el servidor de prueba exige para que viajen las cookies (son Secure y de
     * ese dominio). En produccion no hace nada. Ver docs/servidor-prueba-grupo25.md.
     */
    function baseDePrueba() {
        if (CDK.env !== "dev") return null;

        var v;
        try { v = global.localStorage.getItem("cdk.api"); } catch (e) { return null; }

        var m = /^(https:\/\/([a-z0-9-]+\.)*compudiskett\.com\.pe(:\d{1,5})?)(\/v1)?\/?$/i.exec(String(v || "").trim());
        return m ? m[1] + "/v1" : null;
    }

    var prueba = baseDePrueba();
    if (prueba && global.console) console.info("[CDK] La API apunta al servidor de prueba: " + prueba);

    var baseApi = prueba || BASES_API[CDK.env] || BASES_API.prod;

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

        /**
         * Pagina de registro, a donde va quien tiene cuenta pero no figura en la
         * intranet. Antes pasaba por registro.html, un menu intermedio cuya unica
         * salida util era un enlace a este formulario; se retiro.
         */
        registro: function () {
            return CDK.rutas.app("/autenticador.html");
        },

        /** Panel principal. */
        inicio: function () {
            return CDK.rutas.app("/main.html");
        }
    };

    Object.freeze(CDK.rutas);

})(window);
