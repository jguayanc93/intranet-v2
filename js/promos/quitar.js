/**
 * Quitar promociones de una cotización.
 *
 * Sustituye a promocion_eliminar_cotizacion.html y a
 * promocion_eliminar_pedido.html, que cargaban los mismos tres archivos y
 * hacían exactamente lo mismo: la de pedido leía `#ncoti` y preguntaba por
 * una cotización. **Quitar de un pedido no es posible todavía** —no existe
 * `/pedido/readprom` y `/promocion/eliminar` solo sabe de cotizaciones—, así
 * que esa pantalla se retiró en vez de dejarla prometiendo algo que no hace.
 *
 * Ver docs/promocion-modulo.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    /* Posiciones de una línea con promoción, las mismas que en acoplar.js. */
    var LINEA = { documento: 3, item: 9, codigo: 11, marca: 12, descripcion: 14,
                  cantidad: 15, unitario: 16, descuento: 18, importe: 19 };

    var seccionElegir = document.getElementById("seccion-elegir");
    var seccionItems = document.getElementById("seccion-items");
    var formNumero = document.getElementById("form-numero");
    var entrada = document.getElementById("ncoti");
    var titulo = document.getElementById("titulo-coti");
    var subCoti = document.getElementById("sub-coti");
    var destino = document.getElementById("items");
    var marcar = document.getElementById("acciones-marcar");
    var acciones = document.getElementById("acciones");
    var btnQuitar = document.getElementById("btn-quitar");
    var resultado = document.getElementById("resultado");

    if (!destino) return;

    var coti = null;
    var items = [];     // [{ documento, item, descripcion, …, elegida }]

    /* ===============================================================
     * Elegir la cotización
     * ============================================================= */

    var lista = CDK.coti.listaDelDia({
        destino: document.getElementById("lista-cotis"),
        botonHoy: document.getElementById("btn-hoy"),
        botonDosDias: document.getElementById("btn-dos-dias"),
        soloAbiertas: true,
        alElegir: function (c) { abrir({ numero: c.documento, cliente: c.cliente }); }
    });

    formNumero.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var numero = entrada.value.trim();
        if (!numero) {
            CDK.toast("Escribe el número de cotización", "aviso");
            entrada.focus();
            return;
        }
        abrir({ numero: numero, cliente: "" });
    });

    function abrir(elegida) {
        coti = elegida;
        items = [];
        resultado.innerHTML = "";
        marcar.classList.add("hidden");
        acciones.classList.add("hidden");

        seccionElegir.classList.add("hidden");
        seccionItems.classList.remove("hidden");

        titulo.textContent = coti.numero;
        subCoti.textContent = coti.cliente || "";
        subCoti.classList.toggle("hidden", !coti.cliente);

        cargar();
    }

    /* ===============================================================
     * Las líneas con promoción
     * ============================================================= */

    function cargar() {
        CDK.estados.cargando(destino, "Buscando promociones…");

        CDK.http.post(CDK.rutas.api("/cotizacion/readprom"), { ncoti: coti.numero })
            .then(function (respuesta) {
                /* Cuatro situaciones distintas que antes respondían lo mismo.
                   Dos de ellas llegan con 200 y no son un error: la
                   cotización está bien, simplemente aquí no hay nada que
                   hacer, y conviene decir cuál de las dos es. */
                var estado = respuesta && respuesta.status;

                if (estado === "coti en soles" || estado === "promocion no tiene") {
                    return sinNada(respuesta);
                }

                var crudas = respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
                items = Object.keys(crudas || {})
                    .map(function (k) { return crudas[k]; })
                    .filter(function (l) { return l && typeof l === "object"; })
                    .map(function (l) {
                        return {
                            documento: l[LINEA.documento] || coti.numero,
                            item: l[LINEA.item],
                            descripcion: l[LINEA.descripcion] || "(sin descripción)",
                            marca: l[LINEA.marca] || "",
                            cantidad: l[LINEA.cantidad],
                            importe: l[LINEA.importe],
                            elegida: false
                        };
                    });

                if (!items.length) return sinNada(respuesta);
                pintar();
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                /* `coti desconocida` (403) y `coti no modificable` (409) traen
                   su propio mensaje y no se arreglan reintentando. */
                CDK.estados.error(destino, err);
            });
    }

    /**
     * No hay nada que quitar, y el motivo importa.
     *
     * Que una cotización vaya en soles no es «no tiene promociones»: es que
     * las promociones no se aplican en soles. Antes las dos cosas se veían
     * igual —una lista vacía— y no había manera de distinguirlas.
     */
    function sinNada(respuesta) {
        marcar.classList.add("hidden");
        acciones.classList.add("hidden");
        destino.innerHTML = "";

        var mensaje = respuesta && respuesta.msg
            ? respuesta.msg
            : "Esta cotización no tiene promociones aplicadas.";

        destino.appendChild(el("div", { clase: "cdk-estado" }, [
            el("p", { clase: "cdk-estado__texto", texto: mensaje })
        ]));
    }

    function pintar() {
        destino.innerHTML = "";
        marcar.classList.remove("hidden");
        acciones.classList.remove("hidden");

        var ul = el("ul", { clase: "cdk-articulos" });

        items.forEach(function (it) {
            var datos = [{ etiqueta: "Cantidad", valor: it.cantidad }];
            if (it.elegida) {
                datos.push({ etiqueta: "", valor: "se va a quitar", tono: "alerta" });
            }

            ul.appendChild(CDK.articulo({
                nombre: it.descripcion,
                detalle: it.marca,
                /* En dólares siempre: las promociones solo van en cotizaciones
                   en dólares, y el backend lo garantiza. */
                importe: it.importe === undefined || it.importe === null
                    ? ""
                    : CDK.formato.moneda(it.importe, "D"),
                datos: datos,
                alerta: it.elegida,
                alPulsar: function () {
                    it.elegida = !it.elegida;
                    pintar();
                }
            }));
        });

        destino.appendChild(ul);
        actualizarBoton();
    }

    function actualizarBoton() {
        var n = items.filter(function (i) { return i.elegida; }).length;
        btnQuitar.disabled = n === 0;
        btnQuitar.textContent = n
            ? "Quitar " + n + (n === 1 ? " promoción" : " promociones")
            : "Marca al menos una";
    }

    document.getElementById("btn-todas").addEventListener("click", function () {
        items.forEach(function (i) { i.elegida = true; });
        pintar();
    });

    document.getElementById("btn-ninguna").addEventListener("click", function () {
        items.forEach(function (i) { i.elegida = false; });
        pintar();
    });

    /* ===============================================================
     * Quitar
     * ============================================================= */

    btnQuitar.addEventListener("click", function () {
        var elegidas = items.filter(function (i) { return i.elegida; });
        if (!elegidas.length) return;

        CDK.modal.confirmar({
            titulo: elegidas.length === items.length
                ? "¿Quitar todas las promociones?"
                : "¿Quitar " + elegidas.length + (elegidas.length === 1 ? " promoción?" : " promociones?"),
            mensaje: "Se quitarán de la cotización " + coti.numero +
                     " y los totales se recalculan. No se puede deshacer, pero se pueden " +
                     "volver a aplicar desde la otra pantalla.",
            confirmar: "Quitar",
            peligro: true
        }).then(function (si) {
            if (si) quitar(elegidas);
        });
    });

    function quitar(elegidas) {
        btnQuitar.disabled = true;
        CDK.estados.cargando(resultado, "Quitando…");

        /* Solo el documento y el número de ítem. Antes se mandaba también la
           descripción, que es el texto que se pinta en la lista y que el
           servidor no lee. */
        var removeproms = elegidas.map(function (i) { return [i.documento, i.item]; });

        CDK.http.post(CDK.rutas.api("/promocion/eliminar"), { removeproms: removeproms })
            .then(function (respuesta) {
                btnQuitar.disabled = false;
                CDK.estados.limpiar(resultado);

                /* `removidas` son las líneas que de verdad se borraron. Se
                   enseña ese número y no el que marcamos: una promoción puede
                   ocupar más de una línea. */
                var n = respuesta && respuesta.removidas !== undefined
                    ? respuesta.removidas : elegidas.length;

                CDK.toast(n + (Number(n) === 1 ? " línea quitada" : " líneas quitadas"), "exito");
                cargar();
            })
            .catch(function (err) {
                btnQuitar.disabled = false;
                if (CDK.http.esError(err) && err.status === 401) return;
                /* Si no se borró ninguna, el backend revierte entero y
                   responde un rechazo: no hay estados a medias. */
                CDK.estados.error(resultado, err);
            });
    }

    document.getElementById("btn-volver").addEventListener("click", function () {
        seccionItems.classList.add("hidden");
        seccionElegir.classList.remove("hidden");
        coti = null;
        items = [];
        if (lista && lista.recargar) lista.recargar();
    });

})();
