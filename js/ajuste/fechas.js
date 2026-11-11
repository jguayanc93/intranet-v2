/**
 * El filtro por fechas de «Mis documentos» y de «Asignados»: plegado, con el periodo que se esta
 * viendo dicho en su titulo, desde, hasta y un boton para volver a lo de siempre.
 *
 *   var f = CDK.ajuste.filtroDeFechas({
 *       prefijo:   "directo",                       // ids: directo-desde, directo-hasta, directo-fechas…
 *       que:       "por fecha del documento",       // lo que se filtra, para el titulo
 *       volver:    "Volver a los últimos 30 días",  // el boton que quita el filtro
 *       alCambiar: function (desde, hasta) {}       // AAAA-MM-DD o "" — solo con un rango valido
 *   });
 *   f.nodo                                  // el <details>
 *   f.mostrar(desde, hasta, porDefecto)     // lo que dijo el backend: rellena los campos y el titulo
 *   f.error(texto) / f.error(null)          // `400 fechas invalidas`, junto a las fechas
 *
 * No deja pedir un `desde` posterior al `hasta`: lo dice y no llama a `alCambiar`.
 *
 * Ver docs/ajuste-directo.md (secciones 4 y 8).
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste = CDK.ajuste || {};

    A.filtroDeFechas = function (config) {
        var p = config.prefijo;

        var entradaDesde = el("input", { type: "date", id: p + "-desde", clase: "cdk-entrada", style: "min-width:0", "aria-label": "Desde" });
        var entradaHasta = el("input", { type: "date", id: p + "-hasta", clase: "cdk-entrada", style: "min-width:0", "aria-label": "Hasta" });
        var aviso = el("p", { id: p + "-fechas-error", clase: "cdk-campo__error", style: "margin:8px 0 0" });
        aviso.classList.add("hidden");

        var titulo = el("summary", { clase: "cdk-plegable__titulo", id: p + "-fechas-titulo", texto: "Fechas" });

        function error(texto) {
            aviso.textContent = texto || "";
            aviso.classList.toggle("hidden", !texto);
        }

        function cambio() {
            var desde = entradaDesde.value;
            var hasta = entradaHasta.value;

            if (desde && hasta && desde > hasta) {
                error("La fecha de inicio no puede ser posterior a la de fin.");
                return;
            }
            error(null);
            config.alCambiar(desde, hasta);
        }
        entradaDesde.addEventListener("change", cambio);
        entradaHasta.addEventListener("change", cambio);

        var quitar = el("button", { type: "button", id: p + "-fechas-quitar", clase: "cdk-boton cdk-boton--suave",
                                    style: "margin-top:8px", texto: config.volver });
        quitar.addEventListener("click", function () {
            entradaDesde.value = ""; entradaHasta.value = "";
            error(null);
            config.alCambiar("", "");
        });

        var nodo = el("details", { clase: "cdk-plegable", id: p + "-fechas", style: "margin-top:4px" }, [
            titulo,
            el("div", { clase: "cdk-pareja", style: "grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-top:10px" }, [
                el("div", { clase: "cdk-campo", style: "min-width:0" }, [
                    el("label", { clase: "cdk-campo__etiqueta", "for": entradaDesde.id, texto: "Desde" }), entradaDesde]),
                el("div", { clase: "cdk-campo", style: "min-width:0" }, [
                    el("label", { clase: "cdk-campo__etiqueta", "for": entradaHasta.id, texto: "Hasta" }), entradaHasta])
            ]),
            aviso,
            quitar
        ]);

        /** «del 07/10/2026 al 06/11/2026», «desde el …», «hasta el …» o nada. */
        function periodo(desde, hasta) {
            var f = function (x) { return CDK.formato.fecha(x); };
            if (desde && hasta) return "del " + f(desde) + " al " + f(hasta);
            if (desde) return "desde el " + f(desde);
            if (hasta) return "hasta el " + f(hasta);
            return "";
        }

        return {
            nodo: nodo,
            error: error,
            periodo: periodo,
            /**
             * Lo que se esta viendo, segun el backend: los campos quedan con esas fechas, para moverlas desde ahi. Con
             * `porDefecto` (p. ej. «últimos 30 días») no es un filtro elegido y no hay nada que quitar.
             */
            mostrar: function (desde, hasta, porDefecto) {
                var texto = periodo(desde, hasta);
                titulo.textContent = texto
                    ? "Fechas: " + texto + (porDefecto ? " (" + porDefecto + ")" : "")
                    : "Filtrar " + (config.que || "por fecha");
                entradaDesde.value = desde || "";
                entradaHasta.value = hasta || "";
                quitar.classList.toggle("hidden", !!porDefecto || (!desde && !hasta));
            }
        };
    };

})(window);
