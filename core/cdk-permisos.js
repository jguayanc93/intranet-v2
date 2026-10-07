/**
 * cdk-permisos.js — Modulos y accesos del usuario. Unica pieza que habla con
 * /vendedor y con /<modulo>.
 *
 * El backend es la unica autoridad: aqui no hay ninguna regla de quien puede
 * hacer que. Solo se pide, se cachea y se entrega.
 *
 * Reemplaza las 8 copias de `manejar_acceso()` que hoy viven en <script> inline
 * dentro de main.html y de los 7 hubs.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};

    var CLAVE_MODULOS = "cdk.modulos.v" + CDK.config.cacheV;

    var enVuelo = null;   // promesa compartida: evita peticiones duplicadas por pagina

    /* ---------------------------------------------------------------
     * Cache
     *
     * sessionStorage, NUNCA localStorage: no podemos leer la cookie HttpOnly, asi
     * que no podemos asociar la cache a un usuario. En un terminal compartido,
     * localStorage mostraria el menu de quien uso el equipo antes.
     *
     * sessionStorage puede lanzar en modo privado o con el almacenamiento
     * bloqueado, asi que todo acceso va envuelto.
     * ------------------------------------------------------------- */
    function leerCache() {
        try {
            var crudo = sessionStorage.getItem(CLAVE_MODULOS);
            if (!crudo) return null;

            var caja = JSON.parse(crudo);
            if (!caja || typeof caja.t !== "number") return null;
            if (Date.now() - caja.t > CDK.config.cacheTTL) return null;

            return caja;
        } catch (e) { return null; }
    }

    function escribirCache(modulos, usuario) {
        try {
            sessionStorage.setItem(CLAVE_MODULOS, JSON.stringify({
                t: Date.now(),
                modulos: modulos,
                usuario: usuario || null
            }));
        } catch (e) { /* almacenamiento no disponible: se sigue sin cache */ }
    }

    /* ---------------------------------------------------------------
     * Normalizacion de la respuesta de /vendedor
     *
     * Hoy devuelve {clave: descripcion, ...}. Si algun dia trae tambien los datos
     * del usuario (nombre, grupo, tipo), se admiten dos formas sin romper nada:
     *   {cotizacion:"...", factura:"..."}
     *   {modulos:{...}, nombre:"...", grupo:"...", tipo:"..."}
     * ------------------------------------------------------------- */
    /**
     * Tres formas conviven y las tres se aceptan.
     *
     *   { status, codigo, data: {modulos}, nombre, grupo, tipo, tipoCambio }
     *      la actual. Los modulos van en `data`, y los datos de usuario FUERA
     *      del sobre, al mismo nivel que `status`.
     *
     *   { modulos: {...}, nombre, ... }   la anterior
     *   { cotizacion: "...", ... }        el mapa suelto, sin datos de usuario
     *
     * Se mantienen las viejas porque el backend migra pantalla por pantalla y
     * no conviene que el menu dependa de cual despliegue llego antes.
     */
    function normalizar(respuesta) {
        if (!respuesta || typeof respuesta !== "object") {
            return { modulos: {}, usuario: null };
        }

        var modulos = null;

        if (respuesta.data && typeof respuesta.data === "object" && !Array.isArray(respuesta.data)) {
            modulos = respuesta.data;
        } else if (respuesta.modulos && typeof respuesta.modulos === "object") {
            modulos = respuesta.modulos;
        }

        if (modulos) {
            return {
                modulos: modulos,
                usuario: {
                    nombre: respuesta.nombre || respuesta.usuario || respuesta.vendedor,
                    grupo:  respuesta.grupo,
                    tipo:   respuesta.tipo || respuesta.diferenciador,
                    marcas: respuesta.marcas,
                    /* Ya es el del dia, no el 3.408 fijo. Llega null si no hay
                       ninguno cargado para hoy; CDK.coti.tipoCambio() solo lo
                       usa si es mayor que cero, asi que el null vuelve al fijo
                       sin romper nada. */
                    tipoCambio: respuesta.tipoCambio
                }
            };
        }

        return { modulos: respuesta, usuario: null };
    }

    CDK.permisos = {
        /**
         * Modulos cacheados, de forma SINCRONA. null si no hay cache util.
         * Con esto el shell pinta el menu en su primera fase, sin flash.
         */
        modulosCache: function () {
            var caja = leerCache();
            if (caja && caja.usuario) CDK.sesion.fijarUsuario(caja.usuario);
            return caja ? caja.modulos : null;
        },

        /**
         * Modulos del usuario. Sirve ademas de sonda de sesion: si responde 401,
         * CDK.http dispara CDK.sesion.expirar(). Por eso el guard no necesita una
         * peticion propia.
         */
        modulos: function (opciones) {
            opciones = opciones || {};

            if (!opciones.forzar) {
                var caja = leerCache();
                if (caja) {
                    if (caja.usuario) CDK.sesion.fijarUsuario(caja.usuario);
                    return Promise.resolve(caja.modulos);
                }
            }

            if (enVuelo) return enVuelo;

            enVuelo = CDK.http.get(CDK.rutas.api("/vendedor"))
                .then(function (respuesta) {
                    var dato = normalizar(respuesta);
                    escribirCache(dato.modulos, dato.usuario);
                    if (dato.usuario) CDK.sesion.fijarUsuario(dato.usuario);
                    return dato.modulos;
                })
                .finally(function () { enVuelo = null; });

            return enVuelo;
        },

        /**
         * Accesos del usuario dentro de un modulo.
         * El backend responde {accesos:[...]}; se tolera tambien un array suelto.
         */
        accesos: function (modulo) {
            return CDK.http.get(CDK.catalogo.endpointPermisos(modulo))
                .then(function (respuesta) {
                    if (Array.isArray(respuesta)) return respuesta;
                    // La forma actual: el sobre { status, codigo, data }.
                    if (respuesta && Array.isArray(respuesta.data)) return respuesta.data;
                    // La anterior; se conserva mientras el backend migra.
                    if (respuesta && Array.isArray(respuesta.accesos)) return respuesta.accesos;
                    return [];
                });
        },

        invalidar: function () {
            enVuelo = null;
            try { sessionStorage.removeItem(CLAVE_MODULOS); } catch (e) { /* ignorado */ }
        }
    };

    Object.freeze(CDK.permisos);

})(window);
