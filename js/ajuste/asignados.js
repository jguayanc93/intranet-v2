/**
 * Asignados (grupo 25): lo que el especialista o la jefatura paso a un vendedor desde «Mis documentos».
 * Solo para consultar: el documento ya es del vendedor, asi que no se abre.
 *
 *   · Las mas recientes primero, hasta 100 (`hayMas` lo avisa). Un filtro por fecha de asignacion,
 *     plegado y vacio, para ver lo anterior.
 *   · `totalConIgv` es el total **al asignarlo**; `situacion`, en que quedo el documento **hoy**
 *     (sin aprobar, aprobado, convertida en pedido, facturado…).
 *   · `ajustes`: cuantas veces se ajusto antes de asignarlo.
 *
 * Ver docs/ajuste-directo.md (seccion 8).
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste;
    var M = CDK.marcas;              // statusDe(), mensajeError()

    var contenido = document.getElementById("contenido");
    if (!contenido) return;

    var respuesta = null;
    var desde = "";
    var hasta = "";
    var busqueda = "";
    var vez = 0;

    var lista, filtro;

    armar();
    cargar();

    function armar() {
        contenido.innerHTML = "";

        var buscador = el("input", { type: "search", id: "asignados-buscar", clase: "cdk-entrada", autocomplete: "off",
                                     placeholder: "Buscar por cliente, documento o vendedor", "aria-label": "Buscar asignados" });
        buscador.addEventListener("input", function () {
            busqueda = buscador.value.trim().toLowerCase();
            pintar();
        });

        filtro = A.filtroDeFechas({
            prefijo: "asignados", que: "por fecha de asignación", volver: "Quitar el filtro",
            alCambiar: function (d, h) { desde = d; hasta = h; cargar(); }
        });

        lista = el("div", { id: "asignados-lista", style: "margin-top:12px" });

        contenido.appendChild(el("section", { clase: "cdk-seccion" }, [
            el("div", { clase: "cdk-campo" }, [buscador]),
            filtro.nodo,
            lista
        ]));
        filtro.mostrar("", "");
    }

    function cargar() {
        var esta = ++vez;
        CDK.estados.cargando(lista, "Cargando lo que asignaste…");

        A.asignados({ desde: desde, hasta: hasta })
            .then(function (d) {
                if (esta !== vez) return;
                respuesta = d;
                filtro.error(null);
                filtro.mostrar(desde, hasta);
                pintar();
            })
            .catch(function (err) {
                if (esta !== vez) return;
                if (CDK.http.esError(err) && err.status === 401) return;           // ya redirige
                var estado = M.statusDe(err);
                if (estado === "no identificado") return pintarSinAlta();
                if (estado === "fechas invalidas") {
                    filtro.error(M.mensajeError(err));
                    CDK.estados.vacio(lista, "Corrige las fechas para ver lo que asignaste.");
                    return;
                }
                CDK.estados.error(lista, err, cargar);
            });
    }

    function pintarSinAlta() {
        contenido.innerHTML = "";
        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "ajuste-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para ver lo que asignaste primero tienes que completar tu registro en la intranet." }),
            el("a", { href: CDK.rutas.registro(), clase: "cdk-boton cdk-boton--primario", texto: "Completar mi registro" })
        ]));
    }

    function coincide(a) {
        if (!busqueda) return true;
        return [a.cliente, a.ndocu, a.vendedor && a.vendedor.nombre, a.vendedor && a.vendedor.codven].some(function (t) {
            return String(t || "").toLowerCase().indexOf(busqueda) !== -1;
        });
    }

    function pintar() {
        if (!respuesta) return;
        lista.innerHTML = "";

        var todos = respuesta.asignados;
        var visibles = todos.filter(coincide);

        if (!todos.length) {
            CDK.estados.vacio(lista, desde || hasta
                ? "No asignaste nada " + filtro.periodo(desde, hasta) + "."
                : "Todavía no has asignado ningún documento. Se hace desde «Mis documentos».");
            return;
        }
        if (!visibles.length) {
            CDK.estados.vacio(lista, "Nada de lo que asignaste coincide con lo que buscas.");
            return;
        }

        var ul = el("ul", { clase: "cdk-articulos", id: "asignados-documentos" });
        visibles.forEach(function (a) { ul.appendChild(fila(a)); });
        lista.appendChild(ul);

        if (respuesta.hayMas) {
            lista.appendChild(el("p", { clase: "cdk-pista", id: "asignados-hay-mas", style: "margin:10px 0 0",
                                        texto: "Hay más de 100: se muestran los 100 más recientes. Filtra por fecha para ver los demás." }));
        }
    }

    function fila(a) {
        var sit = A.situacion(a.situacion);
        var datos = [
            { etiqueta: "A", valor: a.vendedor ? a.vendedor.nombre : "—" },
            { etiqueta: "El", valor: CDK.formato.fecha(a.fecreg, "conHora") },
            { etiqueta: "Hoy", valor: sit.texto, tono: sit.tono }
        ];
        if (a.ajustes > 0) datos.push({ etiqueta: "Ajustado antes", valor: a.ajustes === 1 ? "1 vez" : a.ajustes + " veces" });

        /* Sin `alPulsar`: el documento ya es del vendedor y no se abre. El importe es el total al asignarlo, no el de hoy. */
        var item = CDK.articulo({
            nombre: A.tipoNombre(a.tipo) + " " + a.ndocu,
            importe: CDK.formato.moneda(a.totalConIgv, a.moneda),
            detalle: a.cliente,
            datos: datos
        });
        item.setAttribute("data-asignado", a.id);
        return item;
    }

})(window);
