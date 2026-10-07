/**
 * cdk.js — Semilla del namespace.
 *
 * Es el UNICO archivo que crea `window.CDK`. Todos los demas lo extienden.
 * Debe cargarse primero; el resto del bloque core depende de el.
 *
 * Regla del core: ningun archivo declara nada en scope global salvo `CDK`.
 * El proyecto ya tiene `const` y `class` sueltos en global (js/global/variables.js,
 * js/global/toast-notifications.js) y una redeclaracion lanza SyntaxError que mata
 * el archivo entero, no solo la linea.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};

    /* ---------------------------------------------------------------
     * Base de la aplicacion
     *
     * Se deduce del propio <script src>, asi funciona igual servido en la
     * raiz del dominio o bajo un subdirectorio (/demo1/), sin configuracion.
     * Ejemplos:
     *   http://127.0.0.1/demo1/core/cdk.js  -> "/demo1"
     *   https://landing.../core/cdk.js      -> ""
     *   ../core/cdk.js desde /cotizacion/   -> ""
     * ------------------------------------------------------------- */
    function deducirBase() {
        var script = document.currentScript;

        // document.currentScript es null si el script se inyecta dinamicamente.
        if (!script) {
            var todos = document.getElementsByTagName("script");
            for (var i = todos.length - 1; i >= 0; i--) {
                if (/\/cdk\.js(\?|$)/.test(todos[i].src)) { script = todos[i]; break; }
            }
        }
        if (!script || !script.src) return "";

        var ruta = new URL(script.src, location.href).pathname;
        return ruta.replace(/\/core\/cdk\.js$/, "");
    }

    CDK.base = deducirBase();

    /* ---------------------------------------------------------------
     * Entorno
     * ------------------------------------------------------------- */

    /** 10.x, 192.168.x y 172.16–31.x: los rangos privados de una red local. */
    function esPrivada(host) {
        return /^10\./.test(host)
            || /^192\.168\./.test(host)
            || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    }

    /**
     * Antes solo valian 127.0.0.1 y localhost, y eso dejaba fuera el caso de
     * abrir la pagina desde el movil por la IP de red: con 192.168.x.x se daba
     * por produccion y el login iba contra el backend real.
     *
     * Se exige ADEMAS el puerto 8080, el del servidor de pruebas. Solo con mirar
     * si la IP es privada no bastaria: la intranet podria servirse algun dia
     * desde una IP interna, y entonces produccion acabaria hablando con la API
     * simulada, que es un fallo mucho peor que el que esto arregla.
     */
    function esDesarrollo() {
        var host = location.hostname;
        if (host === "127.0.0.1" || host === "localhost" || host === "::1") return true;
        return location.port === "8080" && esPrivada(host);
    }

    CDK.env = esDesarrollo() ? "dev" : "prod";

    /* ---------------------------------------------------------------
     * Configuracion
     * ------------------------------------------------------------- */
    CDK.config = {
        // Envuelve window.fetch para detectar 401 en el codigo aun no migrado.
        // Apagado a proposito: es la unica pieza que cambia el comportamiento de
        // los ~92 call sites de golpe. Se activa cuando el resto este estable.
        interceptar401: false,

        /* Ante un 401, intentar renovar la sesion una vez antes de rendirse.
           Existe por un desajuste del backend: la galleta de sesion `cdk` dura
           24 horas pero `tip` solo 1, y /vendedor necesita las dos. Pasada la
           hora devuelve 401 con la sesion perfectamente viva, y tratarlo como
           "sesion vencida" expulsaria al vendedor cada 60 minutos.
           /login/identificador repone `tip` leyendo solo `cdk`, asi que la
           renovacion es barata y no molesta a nadie. */
        renovarSesion: true,

        // Vigencia de la cache de modulos en sessionStorage.
        cacheTTL: 10 * 60 * 1000,

        // Subir esto invalida la cache de todos los usuarios tras un despliegue.
        cacheV: "1",

        // Corta las peticiones colgadas en vez de dejar la UI esperando.
        timeout: 20000
    };

    /* ---------------------------------------------------------------
     * Utilidades minimas compartidas por el resto del core
     * ------------------------------------------------------------- */

    /** Ejecuta `fn` cuando el <body> esta disponible. */
    CDK.listo = function (fn) {
        if (document.body) { fn(); return; }
        document.addEventListener("DOMContentLoaded", fn, { once: true });
    };

    /** Crea un elemento con clase, texto y atributos en una sola llamada. */
    CDK.el = function (etiqueta, props, hijos) {
        var nodo = document.createElement(etiqueta);
        props = props || {};

        Object.keys(props).forEach(function (clave) {
            var valor = props[clave];
            if (valor === null || valor === undefined) return;

            if (clave === "clase") nodo.className = valor;
            else if (clave === "texto") nodo.textContent = valor;
            else if (clave === "html") nodo.innerHTML = valor;
            else if (clave.indexOf("on") === 0 && typeof valor === "function") {
                nodo.addEventListener(clave.slice(2).toLowerCase(), valor);
            }
            else nodo.setAttribute(clave, valor);
        });

        (hijos || []).forEach(function (hijo) {
            if (hijo) nodo.appendChild(hijo);
        });

        return nodo;
    };

    /** Escapa texto que vaya a interpolarse en innerHTML. */
    CDK.escapar = function (valor) {
        return String(valor === null || valor === undefined ? "" : valor)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    };

})(window);
