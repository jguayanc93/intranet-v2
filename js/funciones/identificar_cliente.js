/**
 * Datos completos del cliente elegido.
 *
 * Se llama al seleccionar un cliente en el paso 1 y deja el resultado en la
 * global `cliente_data`, que leen:
 *   · buscar_cliente_part2.js -> cliente_data[5] como `letra` en /producto/buscar
 *   · buscar_promo_part5.js   -> el array entero al crear la cotización
 *
 * El campo [5] (la letra) decide QUÉ PRECIO ve ese cliente. Por eso aquí un
 * fallo no puede pasar en silencio: antes el catch era un console.log, así que
 * si la petición fallaba, `cliente_data` conservaba la del cliente ANTERIOR y
 * el paso 2 cotizaba con precios que no correspondían. Nada en pantalla lo
 * delataba.
 *
 * Se conserva el nombre `cliente_data` porque lo leen esos dos archivos;
 * renombrarlo es un cambio aparte.
 */
;(function (global) {
    "use strict";

    global.cliente = function (idcliente) {
        // Se vacía antes de pedir: si la petición falla, es preferible quedarse
        // sin letra (y que el paso 2 avise) a arrastrar la del cliente anterior.
        cliente_data = [];

        return CDK.http.post(CDK.rutas.api("/cliente/id"), { idcliente: idcliente })
            .then(function (respuesta) {
                var fila = respuesta && respuesta[0];

                if (!fila) {
                    CDK.toast("No se pudieron cargar los datos del cliente", "error", 0);
                    return null;
                }

                cliente_data = [fila[0], fila[1], fila[2], fila[3], fila[4], fila[5]];

                var datos = CDK.coti.cliente(fila);

                if (!datos.letra) {
                    // Sin letra, /producto/buscar no puede devolver el precio
                    // correcto para este cliente.
                    CDK.toast("Este cliente no tiene categoría de precio asignada", "aviso", 0);
                }

                var contenedor = document.getElementById("recorrer-clientes");
                if (contenedor) contenedor.innerHTML = "";

                return datos;
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return null;   // ya redirige

                // Duración 0: permanece hasta que se cierre. Seguir cotizando
                // sin estos datos daría precios equivocados.
                CDK.toast("No se pudieron cargar los datos del cliente. Vuelve a elegirlo.", "error", 0);
                console.error("[cliente]", err);
                return null;
            });
    };

})(window);
