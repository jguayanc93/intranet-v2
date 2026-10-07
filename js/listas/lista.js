/**
 * Listas de documentos: cotizaciones, facturas y pedidos.
 *
 * Las tres pantallas eran el mismo archivo repetido: 102 líneas de HTML
 * idénticas salvo el texto, y 1 125 líneas de JavaScript entre tres copias que
 * se diferenciaban en poco más que el nombre de la ruta. Corregir algo en una
 * dejaba las otras dos como estaban, que es justo lo que pasó con la moneda.
 *
 * Ahora es una sola implementación y cada pantalla declara lo suyo:
 *
 *     CDK.listas.montar({
 *         titulo:   "Cotizaciones",
 *         ruta:     "/lista/cotis",
 *         rutaDia:  "/lista/cotisxdia",
 *         campos:   CDK.listas.CAMPOS.cotizacion,
 *         destino:  "ncotis"
 *     });
 *
 * El mapa de posiciones va aparte a propósito: las tres rutas comparten las
 * seis primeras y se separan a partir de ahí. Ver docs/listas-modulo.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var el = CDK.el;

    /* ---------------------------------------------------------------
     * Qué hay en cada posición
     *
     * Renumerado por el backend a petición nuestra: las **seis primeras son
     * idénticas en las tres rutas**, con la moneda pegada al monto y la hora
     * justo detrás. Lo demás va ordenado por cuántos módulos lo comparten —
     * el estado lo tienen dos de tres, `editable` uno, y los dos datos
     * propios de facturas quedan al final.
     *
     * En facturas la 6 y la 7 llegan `null` en vez de correr las posiciones,
     * que es lo que pedimos. Quedan fuera del mapa porque no hay nada que
     * pintar con ellas.
     *
     * Antes de renumerar, la trampa era que la posición 5 de facturas parecía
     * la moneda y era el tipo de documento: leerla como moneda ponía `$` a
     * las facturas en soles, justo el fallo que esta pantalla venía a
     * corregir. Ya no puede volver a pasar — la moneda es la 4 en las tres.
     *
     * Ver docs/listas-modulo.md.
     * ------------------------------------------------------------- */
    var COMUNES = {
        fecha: 0, documento: 1, cliente: 2, total: 3, moneda: 4, registrado: 5
    };

    function mapa(propios) {
        var m = {};
        Object.keys(COMUNES).forEach(function (k) { m[k] = COMUNES[k]; });
        Object.keys(propios).forEach(function (k) { m[k] = propios[k]; });
        return m;
    }

    var CAMPOS = {
        cotizacion: mapa({ estado: 6, editable: 7 }),
        factura:    mapa({ entrega: 8, tipoDoc: 9 }),
        pedido:     mapa({ estado: 6 })
    };

    /* Cuántas filas se pintan de una vez.

       Las rutas generales no llevan límite: devuelven todo lo que el vendedor
       tiene, y hasta ahora se construía un nodo por cada una antes de enseñar
       nada. El coste no está en traerlo —ya vino en la misma respuesta— sino
       en el DOM, así que se parte el pintado y no la petición. */
    var TANDA = 50;

    function horaDe(registrado) {
        var partes = String(registrado || "").split(" ");
        return partes.length > 1 ? partes[1].slice(0, 5) : "";
    }

    CDK.listas = {
        CAMPOS: CAMPOS,

        montar: function (config) {
            var campos = config.campos;
            var destino = document.getElementById(config.destino);
            var campoFecha = document.getElementById("fecha-dia");
            var btnLimpiar = document.getElementById("btn-limpiar");

            var cargadas = [];          // todo lo que llegó
            var visibles = TANDA;       // cuánto de eso se está pintando

            if (!destino) return;

            function leerFila(cruda) {
                if (!cruda || typeof cruda !== "object") return null;

                var f = {};
                Object.keys(campos).forEach(function (n) { f[n] = cruda[campos[n]]; });
                if (!f.documento) return null;

                f.documento = String(f.documento);
                f.moneda = f.moneda === "S" ? "S" : "D";
                return f;
            }

            function cargar() {
                var dia = campoFecha ? campoFecha.value : "";

                CDK.estados.cargando(destino, "Cargando…");

                /* Sin fecha, la ruta general; con fecha, la del día. Son dos
                   rutas distintas y no un parámetro, que es como está hoy.

                   Las cuatro rutas `xdia` aceptan además un rango
                   `{ desde, hasta }` —cruzando meses, que antes era
                   imposible—. No se usa todavía porque la pantalla solo
                   ofrece un día suelto; queda apuntado para no volver a
                   preguntarlo. Ver docs/listas-modulo.md. */
                var ruta = dia ? config.rutaDia : config.ruta;
                var cuerpo = dia ? { dia: dia } : {};

                CDK.http.post(CDK.rutas.api(ruta), cuerpo)
                    .then(pintar)
                    .catch(function (err) {
                        if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                        CDK.estados.error(destino, err, cargar);
                    });
            }

            function pintar(respuesta) {
                // Por si algún día pasan al sobre { status, codigo, data }.
                var crudas = respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
                var filas = Object.keys(crudas || {}).map(function (k) { return crudas[k]; });

                cargadas = filas.map(leerFila).filter(Boolean);
                visibles = TANDA;
                render();
            }

            function render() {
                destino.innerHTML = "";

                if (!cargadas.length) {
                    var dia = campoFecha && campoFecha.value;
                    destino.appendChild(el("div", { clase: "cdk-estado" }, [
                        el("p", { clase: "cdk-estado__texto",
                            texto: dia
                                ? "No hay " + config.plural + " de ese día."
                                : "Todavía no tienes " + config.plural + "." })
                    ]));
                    return;
                }

                var lista = el("ul", { clase: "cdk-articulos" });

                cargadas.slice(0, visibles).forEach(function (it) {
                    var datos = [];

                    /* El estado solo cuando es excepcional. Una etiqueta igual
                       en todas las filas no distingue nada. */
                    if (it.estado && String(it.estado).toLowerCase() !== config.estadoNormal) {
                        datos.push({ etiqueta: "", valor: it.estado, tono: "bien" });
                    }

                    /* Los dos datos que solo trae facturas. El tipo de
                       documento con el mismo criterio que el estado: una guía
                       o una nota de despacho entre facturas salta a la vista,
                       y «FACTURA» repetido en todas las filas no dice nada. */
                    if (it.tipoDoc && String(it.tipoDoc).toLowerCase() !== config.docNormal) {
                        datos.push({ etiqueta: "", valor: it.tipoDoc, tono: "bien" });
                    }

                    /* La entrega siempre: que sea de provincia cambia lo que
                       el vendedor tiene que hacer después. */
                    if (it.entrega) {
                        datos.push({ etiqueta: "Entrega", valor: it.entrega });
                    }

                    lista.appendChild(CDK.articulo({
                        nombre: it.cliente || "(sin cliente)",
                        detalle: it.documento +
                                 (it.registrado ? "  ·  " + horaDe(it.registrado) : ""),
                        /* Con su moneda. Antes el símbolo iba escrito a mano en
                           la plantilla, así que una cotización en soles se
                           mostraba como "$3,210" — el dato correcto llegaba y
                           nadie lo leía. */
                        importe: it.total === undefined || it.total === null
                            ? ""
                            : CDK.formato.moneda(it.total, it.moneda),
                        datos: datos
                    }));
                });

                destino.appendChild(lista);

                var restantes = cargadas.length - visibles;
                if (restantes > 0) {
                    var mas = el("button", {
                        type: "button",
                        clase: "cdk-boton cdk-boton--suave",
                        style: "width:100%;margin-top:12px",
                        texto: "Ver más  ·  quedan " + restantes
                    });

                    mas.addEventListener("click", function () {
                        visibles += TANDA;
                        render();

                        /* Al repintar se pierde el sitio. Se lleva el foco a la
                           primera fila nueva: con teclado o lector de pantalla,
                           sin esto se vuelve al principio de la lista cada vez
                           que se pulsa, que es peor que no tener el botón. */
                        var pintadas = destino.querySelectorAll(".cdk-articulo");
                        var primeraNueva = pintadas[visibles - TANDA];
                        if (primeraNueva && primeraNueva.scrollIntoView) {
                            primeraNueva.scrollIntoView({ block: "start" });
                        }
                    });

                    destino.appendChild(mas);
                }
            }

            if (campoFecha) campoFecha.addEventListener("change", cargar);

            if (btnLimpiar) {
                btnLimpiar.addEventListener("click", function () {
                    if (campoFecha) campoFecha.value = "";
                    cargar();
                });
            }

            cargar();
        }
    };

})(window);
