/**
 * cdk-http.js — Capa unica de acceso al backend.
 *
 * Reemplaza ~92 llamadas a fetch que repiten el mismo boilerplate
 * (mode:"cors", credentials:"include", headers JSON) y 63 dobles
 * decodificaciones (`JSON.parse()` justo despues de `.json()`).
 *
 * Resuelve ademas algo que hoy no existe en ninguna parte del proyecto:
 * el manejo de 401. Sin sesion, las paginas renderizan completas y vacias
 * con un console.log.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};

    /* ---------------------------------------------------------------
     * Error tipado
     * ------------------------------------------------------------- */
    function HttpError(mensaje, status, datos, url) {
        var err = new Error(mensaje);
        err.name = "HttpError";
        err.status = status;
        err.datos = datos;
        // Alias: js/login/login.js:71 ya hace `if(err.detalles)`.
        err.detalles = datos;
        err.url = url;
        return err;
    }

    CDK.HttpError = HttpError;

    /* ---------------------------------------------------------------
     * Desempaquetado
     *
     * El backend devuelve hoy un JSON cuyo contenido es un string JSON, de ahi
     * las 63 llamadas a JSON.parse() despues de .json() repartidas por el proyecto.
     * Aqui se normaliza en un solo sitio.
     *
     * No es recursivo a proposito: si algun dia llega triple codificado es un bug
     * del backend y debe verse, no taparse.
     *
     * Delta respecto al codigo actual: el `JSON.parse(x)` de hoy convierte "123"
     * en 123 y "true" en true. La guarda de forma no lo hace, porque un string
     * suelto casi siempre es un mensaje, no un dato. Revisar los call sites que
     * esperen un escalar envuelto antes de migrarlos.
     * ------------------------------------------------------------- */
    function desempaquetar(valor) {
        if (typeof valor !== "string") return valor;

        var texto = valor.trim();
        if (texto.charAt(0) !== "{" && texto.charAt(0) !== "[") return valor;

        try { return JSON.parse(texto); }
        catch (e) { return valor; }
    }

    /* ---------------------------------------------------------------
     * Cuerpo de la peticion
     * ------------------------------------------------------------- */
    function prepararCuerpo(cuerpo, cabeceras) {
        if (cuerpo === undefined || cuerpo === null) return undefined;

        // FormData pone su propio Content-Type con el boundary.
        // Escribirlo a mano rompe el envio; js/login/login.js:36 depende de esto.
        if (cuerpo instanceof FormData) return cuerpo;

        if (typeof cuerpo === "string" || cuerpo instanceof Blob || cuerpo instanceof URLSearchParams) {
            return cuerpo;
        }

        cabeceras["Content-Type"] = "application/json";
        return JSON.stringify(cuerpo);
    }

    /* ---------------------------------------------------------------
     * Renovacion de sesion
     *
     * El backend emite dos galletas con vigencias distintas: `cdk` dura 24
     * horas y `tip` solo 1, y /vendedor necesita las dos. Pasada la hora
     * responde 401 con la sesion viva, asi que tratar todo 401 como "vencida"
     * expulsaria al vendedor cada 60 minutos — el tipo de fallo que se reporta
     * como "se cayo el sistema".
     *
     * /login/identificador repone `tip` leyendo solo `cdk`, de modo que ante un
     * 401 se intenta una vez y se reintenta la peticion original. Si tambien
     * falla, entonces si: la sesion se acabo de verdad.
     *
     * Una sola renovacion en vuelo aunque fallen diez peticiones a la vez: se
     * comparte la misma promesa.
     * ------------------------------------------------------------- */
    var renovacion = null;

    function renovarSesion() {
        if (renovacion) return renovacion;

        renovacion = enviar(CDK.rutas.api("/login/identificador"), {
            metodo: "GET",
            // Sin estas dos, un 401 aqui se renovaria a si mismo sin fin.
            sin401: true,
            sinRenovar: true
        })
            .then(function () { return true; })
            .catch(function () { return false; })
            .then(function (bien) {
                renovacion = null;
                return bien;
            });

        return renovacion;
    }

    /* ---------------------------------------------------------------
     * Primitiva
     * ------------------------------------------------------------- */
    function enviar(url, opciones) {
        opciones = opciones || {};

        var cabeceras = Object.assign({}, opciones.headers || {});
        var cuerpo = prepararCuerpo(opciones.cuerpo, cabeceras);

        var control = new AbortController();
        var limite = opciones.timeout === undefined ? CDK.config.timeout : opciones.timeout;
        var reloj = limite > 0 ? setTimeout(function () { control.abort(); }, limite) : null;

        // Si quien llama trae su propia señal, la encadenamos con la del timeout.
        if (opciones.senal) {
            if (opciones.senal.aborted) control.abort();
            else opciones.senal.addEventListener("abort", function () { control.abort(); }, { once: true });
        }

        return fetch(url, {
            method: opciones.metodo || "GET",
            headers: cabeceras,
            body: cuerpo,
            mode: "cors",
            credentials: "include",
            signal: control.signal
        })
        .catch(function (err) {
            if (reloj) clearTimeout(reloj);
            if (err && err.name === "AbortError") {
                throw HttpError("La peticion tardo demasiado", 0, null, url);
            }
            throw HttpError("No se pudo conectar con el servidor", 0, null, url);
        })
        .then(function (respuesta) {
            if (reloj) clearTimeout(reloj);

            if (opciones.crudo) return respuesta;

            return respuesta.text().then(function (texto) {
                var datos = null;

                if (texto) {
                    try { datos = desempaquetar(JSON.parse(texto)); }
                    catch (e) { datos = texto; }   // el backend devolvio texto plano
                }

                if (respuesta.status === 401 && !opciones.sin401) {
                    function rendirse() {
                        if (CDK.sesion && CDK.sesion.expirar) CDK.sesion.expirar("401");
                        throw HttpError("Sesion expirada", 401, datos, url);
                    }

                    /* Un 401 no reaccion no significa siempre que la sesion
                       murio: puede ser solo `tip`, que caduca en una hora.
                       Reintentar un POST es seguro porque la autorizacion se
                       comprueba antes de ejecutar nada. */
                    if (CDK.config.renovarSesion && !opciones.sinRenovar) {
                        return renovarSesion().then(function (bien) {
                            if (!bien) return rendirse();

                            var reintento = {};
                            Object.keys(opciones).forEach(function (k) { reintento[k] = opciones[k]; });
                            reintento.sinRenovar = true;   // una sola vez

                            return enviar(url, reintento);
                        });
                    }

                    return rendirse();
                }

                if (!respuesta.ok) {
                    throw HttpError(
                        "HTTP " + respuesta.status + " " + respuesta.statusText,
                        respuesta.status, datos, url
                    );
                }

                return datos;
            });
        });
    }

    /* ---------------------------------------------------------------
     * API publica
     * ------------------------------------------------------------- */
    CDK.http = {
        enviar: enviar,
        desempaquetar: desempaquetar,

        get: function (url, opciones) {
            return enviar(url, Object.assign({}, opciones, { metodo: "GET" }));
        },

        post: function (url, cuerpo, opciones) {
            return enviar(url, Object.assign({}, opciones, { metodo: "POST", cuerpo: cuerpo }));
        },

        put: function (url, cuerpo, opciones) {
            return enviar(url, Object.assign({}, opciones, { metodo: "PUT", cuerpo: cuerpo }));
        },

        del: function (url, cuerpo, opciones) {
            return enviar(url, Object.assign({}, opciones, { metodo: "DELETE", cuerpo: cuerpo }));
        },

        esError: function (err) {
            return !!err && err.name === "HttpError";
        },

        /**
         * Envuelve window.fetch para detectar 401 en el codigo aun no migrado,
         * sin tocar sus ~92 call sites.
         *
         * Estrictamente pasivo: no consume el body, no altera la Response ni el
         * valor devuelto. Solo observa el status.
         *
         * Apagado por defecto (CDK.config.interceptar401). Es la unica pieza que
         * cambia el comportamiento de todo el proyecto de golpe, asi que se activa
         * cuando el resto este estable.
         */
        instalarInterceptor: function () {
            if (CDK.http._interceptado) return;
            CDK.http._interceptado = true;

            var original = global.fetch;

            global.fetch = function () {
                return original.apply(this, arguments).then(function (respuesta) {
                    if (respuesta && respuesta.status === 401) {
                        if (CDK.sesion && CDK.sesion.expirar) CDK.sesion.expirar("401-interceptor");
                    }
                    return respuesta;
                });
            };
        }
    };

})(window);
