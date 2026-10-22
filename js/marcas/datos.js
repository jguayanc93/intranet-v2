/**
 * Marcas del mes — acceso a `/v1/marcas` y utilidades comunes.
 *
 * Lo comparten el registro (autenticador.html) y la pantalla del módulo
 * (marcas.html). Extiende `CDK.marcas`; ni el editor ni las pantallas hablan con
 * el backend por su cuenta.
 *
 * Las respuestas de `/v1/marcas` vienen en el sobre `{ status, codigo, data }` y
 * NO van doblemente codificadas, a diferencia de /login/identificador. Aquí se
 * devuelve ya `data`, y en un error HTTP el sobre queda en `err.datos`
 * (`status` para decidir en código, `msg` para mostrar).
 *
 * El borrador no vive en el backend: la pantalla lo arma y lo manda entero a
 * `confirmar`, una sola vez al mes. El mes lo decide el servidor, así que nunca
 * se manda mes ni año.
 *
 * Ver docs/marcas-grupo25.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var marcas = CDK.marcas = CDK.marcas || {};
    var el = CDK.el;

    var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
                 "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

    /* ---------------------------------------------------------------
     * Llamadas
     * ------------------------------------------------------------- */
    function desenvolver(respuesta) {
        return respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
    }

    function pedir(camino, cuerpo) {
        var url = CDK.rutas.api("/marcas" + camino);
        var peticion = cuerpo === undefined
            ? CDK.http.get(url)
            : CDK.http.post(url, cuerpo);
        return peticion.then(desenvolver);
    }

    /** Estado del mes: mis marcas, si confirmé y, si soy jefatura, mi familia. */
    marcas.estado = function () { return pedir(""); };

    /** Mis marcas del mes pasado, cada una con `disponible` según está hoy. */
    marcas.anterior = function () { return pedir("/anterior"); };

    /**
     * Marcas que se trabajan y nadie tiene este mes. Máximo 50. Una lista vacía
     * es «no hay coincidencias», no un error.
     */
    marcas.disponibles = function (sugerencia) {
        return pedir("/disponibles", { sugerencia: sugerencia || "" });
    };

    /** Guarda la lista del borrador y la bloquea hasta el mes siguiente. */
    marcas.confirmar = function (codigos) {
        return pedir("/confirmar", { marcas: codigos || [] });
    };

    /** Jefatura: da o pasa marcas de su familia a un especialista. */
    marcas.asignar = function (codusu, codigos) {
        return pedir("/asignar", { codusu: codusu, marcas: codigos });
    };

    /** Jefatura: le quita marcas de su familia a un especialista. */
    marcas.retirar = function (codusu, codigos) {
        return pedir("/retirar", { codusu: codusu, marcas: codigos });
    };

    /** Jefatura: marca una marca de su familia como trabajada o no. */
    marcas.fijarTrabajada = function (codmar, trabajada) {
        return pedir("/estado", { codmar: codmar, trabajada: !!trabajada });
    };

    /* ---------------------------------------------------------------
     * Lectura de los datos
     * ------------------------------------------------------------- */

    /** «octubre de 2026», a partir de lo que dice el servidor. */
    marcas.periodo = function (d) {
        if (!d || !d.mes || !d.anno) return "";
        return (MESES[d.mes - 1] || "mes " + d.mes) + " de " + d.anno;
    };

    /** Nombre para mostrar de una marca: el completo, o la abreviatura. */
    marcas.nombre = function (m) {
        return (m && (m.nombre || m.abrmar || m.codmar)) || "";
    };

    /**
     * Mensaje de un error de `/v1/marcas`. El `msg` del backend manda: está
     * escrito para leerse y dice qué hacer. Los textos de abajo solo cubren
     * cuando no llega.
     */
    marcas.mensajeError = function (err) {
        if (CDK.http.esError(err)) {
            if (err.datos && err.datos.msg) return err.datos.msg;
            if (err.status === 0)   return "No se pudo conectar con el servidor. Revisa tu conexión.";
            if (err.status === 403) return "No tienes permiso para esta operación.";
            if (err.status >= 500)  return "El servidor tuvo un problema. Intenta de nuevo en un momento.";
        }
        return "Ocurrió un error inesperado.";
    };

    /** El `status` estable del backend, o null si el error no lo trae. */
    marcas.statusDe = function (err) {
        return (CDK.http.esError(err) && err.datos && err.datos.status) || null;
    };

    /* ---------------------------------------------------------------
     * Marcas que no se pudieron asignar
     *
     * Las rutas que asignan no fallan por una marca mala: asignan las que
     * pueden y devuelven el resto en `omitidas`, cada una con su `motivo`.
     * La pantalla tiene que mostrarlas: sin eso la persona cree que tiene
     * una marca que en realidad no se le dio.
     * ------------------------------------------------------------- */

    /**
     * Aviso con las omitidas, o null si no hay ninguna.
     * `titulo` dice qué se estaba haciendo («No se pudieron confirmar…»).
     */
    marcas.avisoOmitidas = function (titulo, omitidas) {
        if (!omitidas || !omitidas.length) return null;

        var lineas = omitidas.map(function (o) {
            var motivo = o.motivo || "no se pudo asignar";
            /* `asignadaA` viene solo cuando el motivo es que ya tiene dueño. */
            if (o.asignadaA) motivo += " (" + o.asignadaA + ")";

            return el("li", {}, [
                el("strong", { texto: marcas.nombre(o) }),
                document.createTextNode(" — " + motivo)
            ]);
        });

        return el("div", { clase: "cdk-aviso", role: "status" }, [
            el("div", { style: "flex:1;min-width:0" }, [
                el("p", { clase: "cdk-aviso__texto", texto: titulo }),
                el("ul", { style: "margin:8px 0 0;padding-left:18px" }, lineas)
            ])
        ]);
    };

})(window);
