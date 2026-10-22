/**
 * La lista de solicitudes de ajuste, la misma para quien las recibe y para quien las
 * envia: una pestaña por estado, un buscador y las solicitudes de ese estado.
 *
 * Lo unico que cambia entre las dos puntas es de donde salen las solicitudes y como se
 * pinta cada una, y eso lo pone quien monta la lista:
 *
 *   CDK.ajuste.montarLista({
 *       contenido:    nodo donde se pinta,
 *       pestanas:     [{ estado: "PENDIENTE", etiqueta: "Pendientes", vacio: "No tienes…" }, …],
 *       placeholder:  texto del buscador,
 *       cargar:       function (estado, filtros) -> promesa de la lista del backend; `filtros` trae
 *                     `desde` y `hasta` (AAAA-MM-DD) solo si se eligieron,
 *       fila:         function (solicitud) -> el <li> de esa solicitud,
 *       texto:        function (solicitud) -> los textos en los que busca el buscador,
 *       sinAlta:      function () que pinta «todavia no estas registrado»
 *   })
 *
 * Una pestaña por estado, y no una que los mezcle, porque cada estado pide algo
 * distinto: las pendientes piden actuar y las demas son historial. El historial no
 * tiene ventana de tiempo: son las 100 mas recientes **de ese estado**. Para ver lo
 * anterior hay un filtro por fecha de envio (`desde` y `hasta`, dias completos).
 *
 * Ver docs/ajuste-precios.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste = CDK.ajuste || {};
    var M = CDK.marcas;              // statusDe()

    A.montarLista = function (config) {
        var contenido = config.contenido;
        var pestanas = config.pestanas;

        var elegida = pestanas[0];
        var solicitudes = [];            // lo ultimo que llego, sin filtrar por la busqueda
        var busqueda = "";
        var desde = "";                  // filtro por fecha de envio, AAAA-MM-DD; vacio es sin filtro
        var hasta = "";

        var lista = null;
        var buscador = null;
        var aviso = null;

        armar();
        cargar();

        /* ===============================================================
         * La pantalla
         * ============================================================= */
        function armar() {
            contenido.innerHTML = "";

            var tabs = el("ul", { clase: "cdk-pestanas", role: "tablist", id: "ajuste-pestanas" },
                pestanas.map(function (p) {
                    var b = el("button", {
                        type: "button", role: "tab", clase: "cdk-pestana", id: "pestana-" + p.estado,
                        "aria-selected": "false", texto: p.etiqueta
                    });
                    b.addEventListener("click", function () { elegir(p); });
                    return el("li", {}, [b]);
                }));

            buscador = el("input", {
                type: "search", id: "ajuste-buscar", clase: "cdk-entrada", autocomplete: "off",
                placeholder: config.placeholder, "aria-label": "Buscar solicitudes"
            });
            buscador.addEventListener("input", function () {
                busqueda = buscador.value.trim().toLowerCase();
                pintar();
            });

            lista = el("div", { id: "ajuste-lista", style: "margin-top:12px" });

            contenido.appendChild(el("section", { clase: "cdk-seccion" }, [
                tabs,
                el("div", { clase: "cdk-campo" }, [buscador]),
                filtroDeFechas(),
                lista
            ]));

            marcarPestana();
        }

        /**
         * Para ver lo anterior a las 100 mas recientes: por fecha de envio, dias completos. Plegado y vacio por
         * defecto; si se usa, se pide de nuevo al backend, que lo aplica ANTES del tope de 100.
         */
        function filtroDeFechas() {
            var entradaDesde = el("input", { type: "date", id: "ajuste-desde", clase: "cdk-entrada", style: "min-width:0",
                                             "aria-label": "Desde" });
            var entradaHasta = el("input", { type: "date", id: "ajuste-hasta", clase: "cdk-entrada", style: "min-width:0",
                                             "aria-label": "Hasta" });
            aviso = el("p", { id: "ajuste-fechas-error", clase: "cdk-campo__error", style: "margin:8px 0 0" });
            aviso.classList.add("hidden");

            function cambio() {
                desde = entradaDesde.value;
                hasta = entradaHasta.value;

                if (desde && hasta && desde > hasta) {
                    aviso.textContent = "La fecha de inicio no puede ser posterior a la de fin.";
                    aviso.classList.remove("hidden");
                    return;
                }
                aviso.classList.add("hidden");
                cargar();
            }
            entradaDesde.addEventListener("change", cambio);
            entradaHasta.addEventListener("change", cambio);

            var quitar = el("button", { type: "button", id: "ajuste-fechas-quitar", clase: "cdk-boton cdk-boton--suave",
                                        style: "margin-top:8px", texto: "Quitar el filtro" });
            quitar.addEventListener("click", function () {
                entradaDesde.value = ""; entradaHasta.value = "";
                if (desde || hasta) { desde = ""; hasta = ""; aviso.classList.add("hidden"); cargar(); }
            });

            return el("details", { clase: "cdk-plegable", id: "ajuste-filtro-fechas", style: "margin-top:4px" }, [
                el("summary", { clase: "cdk-plegable__titulo", texto: "Filtrar por fecha de envío" }),
                el("div", { clase: "cdk-pareja", style: "grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:10px" }, [
                    el("div", { clase: "cdk-campo", style: "min-width:0" }, [
                        el("label", { clase: "cdk-campo__etiqueta", "for": "ajuste-desde", texto: "Desde" }), entradaDesde]),
                    el("div", { clase: "cdk-campo", style: "min-width:0" }, [
                        el("label", { clase: "cdk-campo__etiqueta", "for": "ajuste-hasta", texto: "Hasta" }), entradaHasta])
                ]),
                aviso,
                quitar
            ]);
        }

        function marcarPestana() {
            pestanas.forEach(function (p) {
                var b = document.getElementById("pestana-" + p.estado);
                var activa = p === elegida;
                b.classList.toggle("es-activa", activa);
                b.setAttribute("aria-selected", activa ? "true" : "false");
            });
        }

        function elegir(pestana) {
            if (pestana === elegida) return;
            elegida = pestana;
            marcarPestana();
            cargar();
        }

        /* ===============================================================
         * Datos
         * ============================================================= */
        function cargar() {
            CDK.estados.cargando(lista, "Cargando solicitudes…");

            /* Una carga lenta no puede pisar a la de la pestaña que se eligio despues. */
            var pedida = elegida;

            var filtros = {};
            if (desde) filtros.desde = desde;
            if (hasta) filtros.hasta = hasta;

            config.cargar(pedida.estado, filtros)
                .then(function (datos) {
                    if (pedida !== elegida) return;
                    solicitudes = datos;
                    pintar();
                })
                .catch(function (err) {
                    if (pedida !== elegida) return;
                    if (CDK.http.esError(err) && err.status === 401) return;           // ya redirige
                    if (M.statusDe(err) === "no identificado") return config.sinAlta();

                    /* `400 fechas invalidas`: una fecha mal escrita, inexistente, o un `desde` posterior al `hasta`. No se ignora
                       el filtro: se dice con el mensaje del backend, donde estan las fechas, y no se enseña una lista que no
                       es la de esas fechas. Con el selector de fechas no deberia llegar; es por si acaso. */
                    if (M.statusDe(err) === "fechas invalidas" && aviso) {
                        aviso.textContent = M.mensajeError(err);
                        aviso.classList.remove("hidden");
                        CDK.estados.vacio(lista, "Corrige las fechas para ver las solicitudes.");
                        return;
                    }

                    CDK.estados.error(lista, err, cargar);
                });
        }

        /* ===============================================================
         * La lista
         * ============================================================= */
        function coincide(s) {
            if (!busqueda) return true;
            return config.texto(s).some(function (t) {
                return String(t || "").toLowerCase().indexOf(busqueda) !== -1;
            });
        }

        function pintar() {
            lista.innerHTML = "";

            var visibles = solicitudes.filter(coincide);

            if (!solicitudes.length) {
                /* Con fechas elegidas, lo que falta es de ese periodo, no de todo el estado. */
                CDK.estados.vacio(lista, desde || hasta ? "No hay solicitudes de este estado en esas fechas." : elegida.vacio);
                return;
            }
            if (!visibles.length) {
                CDK.estados.vacio(lista, "Ninguna solicitud coincide con lo que buscas.");
                return;
            }

            var ul = el("ul", { clase: "cdk-articulos", id: "ajuste-solicitudes" });
            visibles.forEach(function (s) { ul.appendChild(config.fila(s)); });
            lista.appendChild(ul);

            if (solicitudes.length >= 100) {
                lista.appendChild(el("p", { clase: "cdk-pista", style: "margin:10px 0 0",
                                            texto: "Se muestran las 100 más recientes." }));
            }
        }
    };

})(window);
