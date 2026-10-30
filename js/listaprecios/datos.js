/**
 * Lista de precios del grupo 20 (cartera y cobertura) — acceso a `POST /v1/reporte/listaprecios`.
 *
 * Una sola ruta con dos formatos: `json` para ver la lista en pantalla y `xlsx` para bajarla. Es de solo lectura (no cambia nada en la
 * base). **No lleva costo, ni stock real, ni codigos del sistema**: la lista puede llegar a manos de los clientes, y por eso es distinta
 * del reporte de precios por marca del grupo 25 (`js/reporte/`), que si trae el costo. No se comparte codigo con ese: esta pantalla es
 * de otro grupo y debe poder vivir sola.
 *
 * El JSON viene en el sobre `{ status, codigo, data }`; aqui se devuelve ya `data`. Con el Excel se pide la respuesta SIN interpretar y
 * se mira el `Content-Type`: un error llega como JSON con su codigo http, no como un archivo, y no se guarda nada que no sea la hoja.
 *
 * Ver docs/listaprecios-grupo20.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var listaprecios = CDK.listaprecios = CDK.listaprecios || {};

    function ruta() { return CDK.rutas.api("/reporte/listaprecios"); }

    function desenvolver(respuesta) {
        return respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
    }

    /**
     * La lista completa, para ver en pantalla: `{ informe, fecha, generado, columnas[], filas[] }`. Cada fila trae `descripcion`,
     * `partNumber` (`""` si no lo tiene), `marca`, `familia` (con su nombre, no su codigo), `precioSinIgv` y `precioConIgv` (numeros, en
     * dolares) y `disponibilidad` (la misma en todas las filas). Llega ya ordenada por familia, marca y descripcion, sin paginar.
     */
    listaprecios.ver = function () {
        return CDK.http.post(ruta(), { formato: "json" }).then(desenvolver);
    };

    /**
     * La lista como Excel: `{ blob, nombre }`. Trae **siempre la lista completa**, aunque en pantalla haya un filtro puesto. El nombre lo
     * pone el servidor en `Content-Disposition` (`lista-precios-AAAA-MM-DD.xlsx`), que expone por CORS.
     */
    listaprecios.exportar = function () {
        var url = ruta();

        return CDK.http.enviar(url, {
            metodo: "POST",
            cuerpo: { formato: "xlsx" },
            crudo: true
        }).then(function (respuesta) {
            var tipo = respuesta.headers.get("Content-Type") || "";

            /* `crudo` se salta el manejo de sesion de CDK.http, asi que el 401 se trata aqui. */
            if (respuesta.status === 401) {
                if (CDK.sesion && CDK.sesion.expirar) CDK.sesion.expirar("401");
                throw CDK.HttpError("Sesion expirada", 401, null, url);
            }

            if (respuesta.ok && tipo.indexOf("spreadsheetml") !== -1) {
                var nombre = nombreDe(respuesta.headers.get("Content-Disposition"));
                return respuesta.blob().then(function (blob) { return { blob: blob, nombre: nombre }; });
            }

            /* Cualquier otra cosa es un error del backend, aunque venga con 200: se lee su JSON para poder mostrar el `msg`. */
            return respuesta.text().then(function (texto) {
                var datos = null;
                try { datos = texto ? CDK.http.desempaquetar(JSON.parse(texto)) : null; }
                catch (e) { datos = null; }

                throw CDK.HttpError("HTTP " + respuesta.status, respuesta.status, datos, url);
            });
        });
    };

    /** `attachment; filename="lista-precios-2026-10-30.xlsx"` → el nombre, o uno de respaldo. */
    function nombreDe(cabecera) {
        var m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cabecera || "");
        if (m) {
            try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
        }
        return "lista-precios.xlsx";
    }

    /** El texto de un error para mostrarlo: el `msg` del backend, o uno nuestro segun el codigo http. */
    listaprecios.mensajeError = function (err) {
        if (CDK.http.esError(err)) {
            if (err.datos && err.datos.msg) return err.datos.msg;
            if (err.status === 0)   return "No se pudo conectar con el servidor. Revisa tu conexión.";
            if (err.status === 403) return "No tienes permiso para esta operación.";
            if (err.status >= 500)  return "El servidor tuvo un problema. Intenta de nuevo en un momento.";
        }
        return "Ocurrió un error inesperado.";
    };

})(window);
