/**
 * Cobertura de clientes por marca (grupo 25) — acceso a `/v1/cobertura/*`.
 *
 * A qué clientes se les vendió cada marca en el mes, cuántas unidades y por cuánto.
 * **No es la cobertura del grupo 20**: `/cuota/cobertura` es la cuota de los vendedores
 * de tipo COBERTURA y no cambia; este módulo vive en `/v1/cobertura`.
 *
 * Las respuestas vienen en el sobre `{ status, codigo, data }`, sin doble codificar; aquí
 * se devuelve ya `data`. Excepción: **sin marcas** no trae `data` sino `{ status, msg, … }`
 * en el primer nivel, como en cuota y reportes; se devuelve como `{ sinMarcas: true, msg }`,
 * y con `enEseMes: true` si es un mes anterior (ahí no hay que elegir marcas: entonces no
 * había).
 *
 * Solo lectura. El mes lo pide quien consulta: el en curso, o uno de los dos anteriores.
 * Un mes anterior se ve con las marcas y los dueños que había ese mes.
 *
 * Los clientes de una marca también se exportan a Excel (`&formato=xlsx`), como los reportes.
 *
 * Ver docs/cobertura-grupo25.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var cobertura = CDK.cobertura = CDK.cobertura || {};

    function interpretar(r) {
        if (r && (r.debeAsignar === true || r.status === "sin marcas del mes")) {
            return { sinMarcas: true, msg: r.msg };
        }
        if (r && r.status === "sin marcas en ese mes") {
            return { sinMarcas: true, enEseMes: true, msg: r.msg };
        }
        return r && r.data !== undefined ? r.data : r;
    }

    cobertura.interpretar = interpretar;

    /** `?codmar=0008&anno=2026&mes=9&formato=xlsx`, solo con lo que hay. Sin periodo es el mes en curso. */
    function consulta(codmar, periodo, formato) {
        var partes = [];
        if (codmar) partes.push("codmar=" + encodeURIComponent(codmar));
        if (periodo && periodo.anno && periodo.mes) {
            partes.push("anno=" + encodeURIComponent(periodo.anno), "mes=" + encodeURIComponent(periodo.mes));
        }
        if (formato) partes.push("formato=" + encodeURIComponent(formato));
        return partes.length ? "?" + partes.join("&") : "";
    }

    /**
     * Cada marca con cuántos clientes la compraron, unidades y venta:
     * `{ anno, mes, actual, rol, marcas[], total }`. `total.clientes` son clientes
     * **distintos** —uno que compró dos marcas cuenta una vez—, así que no es la suma de los
     * de cada marca; unidades y venta sí.
     */
    cobertura.marcas = function (periodo) {
        return CDK.http.get(CDK.rutas.api("/cobertura/marcas" + consulta(null, periodo))).then(interpretar);
    };

    /**
     * Los clientes de una marca, por venta de mayor a menor:
     * `{ anno, mes, actual, marca, clientes[], total }`. Un cliente que en el mes solo devolvió
     * sale con unidades y venta negativas, y no cuenta en `total.clientes`.
     */
    cobertura.clientes = function (codmar, periodo) {
        return CDK.http.get(CDK.rutas.api("/cobertura/clientes" + consulta(codmar, periodo))).then(interpretar);
    };

    /**
     * Los clientes de una marca como Excel: `{ blob, nombre }`. Trae **todos** los clientes, en el mismo
     * orden que el JSON, también los que solo devolvieron.
     *
     * **Se pide la respuesta sin interpretar y se mira el `Content-Type`.** Si algo falla, la respuesta es el
     * JSON de error de siempre y nunca un archivo, así que lo que no sea la hoja de cálculo no se guarda:
     * un fallo y un Excel corrupto se verían igual. El nombre lo pone el servidor en `Content-Disposition`,
     * que expone por CORS.
     */
    cobertura.exportar = function (codmar, periodo) {
        var url = CDK.rutas.api("/cobertura/clientes" + consulta(codmar, periodo, "xlsx"));

        return CDK.http.enviar(url, { metodo: "GET", crudo: true }).then(function (respuesta) {
            var tipo = respuesta.headers.get("Content-Type") || "";

            /* `crudo` se salta el manejo de sesión de CDK.http, así que el 401 se trata aquí. No se intenta
               renovar `tip`: estas rutas solo piden `cdk`. */
            if (respuesta.status === 401) {
                if (CDK.sesion && CDK.sesion.expirar) CDK.sesion.expirar("401");
                throw CDK.HttpError("Sesion expirada", 401, null, url);
            }

            if (respuesta.ok && tipo.indexOf("spreadsheetml") !== -1) {
                var nombre = nombreDe(respuesta.headers.get("Content-Disposition"), codmar);
                return respuesta.blob().then(function (blob) { return { blob: blob, nombre: nombre }; });
            }

            /* Cualquier otra cosa es un error del backend, aunque venga con 200: se lee su JSON para que quien
               llame pueda mostrar el `msg` y decidir por el `status`. */
            return respuesta.text().then(function (texto) {
                var datos = null;
                try { datos = texto ? CDK.http.desempaquetar(JSON.parse(texto)) : null; }
                catch (e) { datos = null; }

                throw CDK.HttpError("HTTP " + respuesta.status, respuesta.status, datos, url);
            });
        });
    };

    /** `attachment; filename="clientes-EPSON-2026-10.xlsx"` → el nombre, o uno de respaldo. */
    function nombreDe(cabecera, codmar) {
        var m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cabecera || "");
        if (m) {
            try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
        }
        return "clientes-" + codmar + ".xlsx";
    }

})(window);
