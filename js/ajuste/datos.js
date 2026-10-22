/**
 * Ajuste de precios — acceso a `/v1/ajuste/*`.
 *
 * Un vendedor (grupo 20) envia una cotizacion o un pedido para que el
 * especialista o la jefatura de la marca (grupo 25) le ajuste el precio. Cada punta
 * tiene sus rutas, y la otra le responde `403 sin permiso`:
 *
 *   vendedor      enviar, enviadas
 *   responsable   recibidas, solicitud, confirmar, rechazar
 *
 * Las respuestas vienen en el sobre `{ status, codigo, data }`, sin doble
 * codificar; aqui se devuelve ya `data`. En un error HTTP el sobre queda en
 * `err.datos` (`status` para decidir en codigo, `msg` para mostrar), y se leen con
 * `CDK.marcas.statusDe` y `CDK.marcas.mensajeError`, que comparten la forma.
 *
 * Ver docs/ajuste-precios.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var ajuste = CDK.ajuste = CDK.ajuste || {};

    function desenvolver(r) { return r && r.data !== undefined ? r.data : r; }

    /** `?a=1&b=2` con lo que traiga valor, o nada. */
    function consulta(params) {
        var partes = Object.keys(params || {})
            .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ""; })
            .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]); });
        return partes.length ? "?" + partes.join("&") : "";
    }

    /**
     * Lo que pasaria si se enviara este documento, SIN enviarlo: a quien iria cada linea,
     * cuales no irian a nadie y cuantas promociones tiene, que se pierden si lo confirman.
     * Mismo cuerpo que `enviar`, y los mismos motivos por los que no se deja.
     *
     * **Es una propuesta nuestra: el backend todavia no tiene esta ruta** (docs/respuesta-ajuste-precios.md).
     * Quien la use tiene que estar listo para que no exista: `sinPrevia(err)` lo dice.
     *
     * Devuelve `{ tipo, ndocu, cliente, moneda, solicitudes[], sinResponsable[], promociones }`.
     */
    ajuste.previa = function (tipo, ndocu) {
        return CDK.http.post(CDK.rutas.api("/ajuste/previa"), { tipo: tipo, ndocu: ndocu }).then(desenvolver);
    };

    /** ¿El fallo es que el backend aun no tiene la vista previa? Una ruta que no existe, no un motivo de negocio. */
    ajuste.sinPrevia = function (err) {
        return CDK.http.esError(err) && (err.status === 404 || err.status === 405);
    };

    /**
     * Las cotizaciones y los pedidos del vendedor que todavia se pueden mandar a ajuste: los **abiertos y sin
     * aprobar**. No es una ruta de ajuste sino las listas del modulo Listas (`/lista/cotis` y
     * `/lista/pedidos`), que ya traen el numero con serie y un `editable` que vale 1 justo en ese caso (la de
     * pedidos, desde el 21/10: antes todo pedido abierto salia como aprobado). Solo se leen.
     *
     * Devuelve `[{ tipo, ndocu, cliente, fecha, total, moneda }]` —`tipo` es `COT` o `PED`—, los mas recientes
     * primero. Si alguna de las dos listas falla, falla todo: una lista a medias haria creer que no hay pedidos.
     */
    ajuste.documentosAbiertos = function () {
        function leer(ruta, tipo, c) {
            return CDK.http.post(CDK.rutas.api(ruta), {}).then(function (r) {
                var crudas = r && r.data !== undefined ? r.data : r;

                return Object.keys(crudas || {})
                    .map(function (k) { return crudas[k]; })
                    .filter(function (f) { return f && f[c.documento] && Number(f[c.editable]) === 1; })
                    .map(function (f) {
                        return {
                            tipo: tipo, ndocu: String(f[c.documento]), cliente: f[c.cliente], fecha: f[c.fecha],
                            total: f[c.total], moneda: f[c.moneda] === "S" ? "S" : "D"
                        };
                    });
            });
        }

        return Promise.all([
            leer("/lista/cotis", "COT", CDK.listas.CAMPOS.cotizacion),
            leer("/lista/pedidos", "PED", CDK.listas.CAMPOS.pedido)
        ]).then(function (listas) {
            /* Cada lista ya viene con la mas reciente primero; el orden es estable, asi que en un empate salen primero las cotizaciones. */
            return listas[0].concat(listas[1]).sort(function (a, b) {
                return a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0;
            });
        });
    };

    /**
     * El vendedor envia una cotizacion (`COT`) o un pedido (`PED`) suyo a ajuste.
     * `ndocu` lleva su serie (`009-00969476`): un numero suelto es ambiguo.
     *
     * Devuelve `{ tipo, ndocu, cliente, solicitudes[], sinResponsable[], promociones }`:
     * una solicitud por cada responsable, las lineas que no se enviaron a nadie, y
     * cuantas promociones tiene el documento, que se pierden si lo confirman.
     */
    ajuste.enviar = function (tipo, ndocu, mensaje) {
        var cuerpo = { tipo: tipo, ndocu: ndocu };
        if (mensaje) cuerpo.mensaje = mensaje;

        return CDK.http.post(CDK.rutas.api("/ajuste/enviar"), cuerpo).then(desenvolver);
    };

    /**
     * Las solicitudes que envio el vendedor, las mas recientes primero (hasta 100),
     * cada una con sus lineas: lo que habia (`antes`) y lo que quedo (`despues`,
     * `null` si no se ajusto). `{ estado }` y `{ ndocu }` filtran.
     */
    ajuste.enviadas = function (filtros) {
        return CDK.http.get(CDK.rutas.api("/ajuste/enviadas" + consulta(filtros)))
            .then(function (r) {
                var d = desenvolver(r);
                return d && Array.isArray(d.solicitudes) ? d.solicitudes : [];
            });
    };

    /**
     * Las solicitudes que le llegaron, las mas recientes primero (hasta 100).
     * `{ estado: "PENDIENTE" }` y `{ ndocu }` filtran. En cada una, `lineas` es
     * cuantas le tocan; el detalle esta en `solicitud`.
     */
    ajuste.recibidas = function (filtros) {
        return CDK.http.get(CDK.rutas.api("/ajuste/recibidas" + consulta(filtros)))
            .then(function (r) {
                var d = desenvolver(r);
                return d && Array.isArray(d.solicitudes) ? d.solicitudes : [];
            });
    };

    /** Una solicitud con todo para ajustar: la cabecera del documento y cada linea suya. */
    ajuste.solicitud = function (id) {
        return CDK.http.get(CDK.rutas.api("/ajuste/solicitud" + consulta({ id: id }))).then(desenvolver);
    };

    /**
     * Aplica el ajuste. `lineas`: solo las que se ajustan, cada una
     * `{ item, precio, cantidad? }`; las que no vienen no se tocan. La observacion
     * es opcional.
     */
    ajuste.confirmar = function (id, lineas, observacion) {
        var cuerpo = { id: id, lineas: lineas };
        if (observacion) cuerpo.observacion = observacion;

        return CDK.http.post(CDK.rutas.api("/ajuste/confirmar"), cuerpo).then(desenvolver);
    };

    /** Devuelve la solicitud sin cambios. La observacion es obligatoria: el vendedor tiene que saber por que. */
    ajuste.rechazar = function (id, observacion) {
        return CDK.http.post(CDK.rutas.api("/ajuste/rechazar"), { id: id, observacion: observacion }).then(desenvolver);
    };

    /* ---------------------------------------------------------------
     * Lectura de los datos
     * ------------------------------------------------------------- */

    /** «Cotización» o «Pedido», segun el `tipo` (`COT` o `PED`). */
    ajuste.tipoNombre = function (tipo) {
        return tipo === "PED" ? "Pedido" : "Cotización";
    };

    /**
     * Como se llama y que tono lleva cada estado. Los estados son del backend; si
     * llega uno que no conocemos se dice tal cual, sin inventarle un significado.
     */
    var ESTADOS = {
        PENDIENTE:  { texto: "Pendiente",  tono: "alerta" },
        CONFIRMADA: { texto: "Confirmada", tono: "bien" },
        RECHAZADA:  { texto: "Rechazada",  tono: "alerta" },
        VENCIDA:    { texto: "Vencida",    tono: "nulo" },
        CERRADA:    { texto: "Cerrada",    tono: "nulo" }
    };

    ajuste.estado = function (estado) {
        return ESTADOS[estado] || { texto: String(estado || ""), tono: "nulo" };
    };

})(window);
