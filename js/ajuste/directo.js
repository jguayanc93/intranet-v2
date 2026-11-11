/**
 * Mis documentos (grupo 25): las cotizaciones y pedidos que llevan el codigo de vendedor de quien
 * entra, para ajustarles el precio sin que nadie se los envie o asignarlos a un vendedor. Aqui se ve
 * la lista; ajustar y asignar se hace en el documento (ajuste_documento.html).
 *
 *   · **Una pestaña para cotizaciones y otra para pedidos**: el backend las pide por separado
 *     (`tipo`), y la pestaña elegida va en la direccion (`?tipo=PED`) para volver a ella.
 *   · **Sin filtros llegan los ultimos 30 dias**, y el backend dice que fechas son: se dicen en el
 *     titulo del filtro (*«Fechas: del 07/10/2026 al 06/11/2026 (últimos 30 días)»*).
 *   · **Uno mas antiguo se encuentra por su numero**: el buscador filtra lo que ya llego (cliente o
 *     numero) y, si se escribe un numero con serie que no esta, ofrece buscarlo en todas las fechas
 *     (`?ndocu=`, que ignora las fechas). Si no llega es que ya no se puede ajustar ni asignar.
 *   · Solo llegan los que todavia se pueden ajustar o asignar, hasta 100; `hayMas` lo avisa.
 *
 * Ver docs/ajuste-directo.md (seccion 4).
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste;
    var M = CDK.marcas;              // statusDe(), mensajeError()

    var contenido = document.getElementById("contenido");
    if (!contenido) return;

    var NUMERO = /^\d{3}-\d{8}$/;
    var PESTANAS = [
        { tipo: "COT", etiqueta: "Cotizaciones", vacio: "No tienes cotizaciones para ajustar o asignar en estas fechas." },
        { tipo: "PED", etiqueta: "Pedidos",      vacio: "No tienes pedidos para ajustar o asignar en estas fechas." }
    ];

    var pedida = new URLSearchParams(location.search).get("tipo");
    var elegida = PESTANAS.filter(function (p) { return p.tipo === pedida; })[0] || PESTANAS[0];

    var respuesta = null;            // lo ultimo que llego: { desde, hasta, ultimosDias, hayMas, documentos }
    var desde = "";                  // fechas elegidas; vacias son los ultimos 30 dias
    var hasta = "";
    var porNumero = "";              // con un numero buscado en todas las fechas, las fechas no cuentan
    var busqueda = "";
    var vez = 0;                     // una carga lenta no pisa a la que se pidio despues

    var lista, buscador, filtro, avisoNumero;

    armar();
    cargar();

    /* ===============================================================
     * La pantalla
     * ============================================================= */
    function armar() {
        contenido.innerHTML = "";

        var tabs = el("ul", { clase: "cdk-pestanas", role: "tablist", id: "directo-pestanas" },
            PESTANAS.map(function (p) {
                var b = el("button", { type: "button", role: "tab", clase: "cdk-pestana", id: "pestana-" + p.tipo,
                                       "aria-selected": "false", texto: p.etiqueta });
                b.addEventListener("click", function () { elegir(p); });
                return el("li", {}, [b]);
            }));

        buscador = el("input", { type: "search", id: "directo-buscar", clase: "cdk-entrada", autocomplete: "off",
                                 placeholder: "Buscar por cliente o número (009-00969333)", "aria-label": "Buscar documentos" });
        buscador.addEventListener("input", function () {
            busqueda = buscador.value.trim();
            pintar();
        });

        filtro = A.filtroDeFechas({
            prefijo: "directo", que: "por fecha del documento", volver: "Volver a los últimos 30 días",
            alCambiar: function (d, h) { desde = d; hasta = h; cargar(); }
        });

        avisoNumero = el("div", { id: "directo-por-numero", clase: "cdk-aviso hidden", style: "margin-top:10px" });
        lista = el("div", { id: "directo-lista", style: "margin-top:12px" });

        contenido.appendChild(el("section", { clase: "cdk-seccion" }, [
            tabs,
            el("div", { clase: "cdk-campo" }, [buscador]),
            filtro.nodo,
            avisoNumero,
            lista
        ]));

        marcarPestana();
    }

    function marcarPestana() {
        PESTANAS.forEach(function (p) {
            var b = document.getElementById("pestana-" + p.tipo);
            b.classList.toggle("es-activa", p === elegida);
            b.setAttribute("aria-selected", p === elegida ? "true" : "false");
        });
    }

    function elegir(p) {
        if (p === elegida) return;
        elegida = p;
        marcarPestana();
        /* Que «volver» desde un documento traiga a esta pestaña. */
        if (global.history && history.replaceState) history.replaceState(null, "", "?tipo=" + p.tipo);
        cargar();
    }

    /* ===============================================================
     * Datos
     * ============================================================= */
    function cargar() {
        var esta = ++vez;
        CDK.estados.cargando(lista, "Cargando documentos…");

        var filtros = porNumero ? { ndocu: porNumero } : { desde: desde, hasta: hasta };

        A.directoDocumentos(elegida.tipo, filtros)
            .then(function (d) {
                if (esta !== vez) return;
                respuesta = d;
                filtro.error(null);
                if (!porNumero) filtro.mostrar(d.desde, d.hasta, d.ultimosDias ? "últimos " + d.ultimosDias + " días" : "");
                pintar();
            })
            .catch(function (err) {
                if (esta !== vez) return;
                if (CDK.http.esError(err) && err.status === 401) return;           // ya redirige
                var estado = M.statusDe(err);
                if (estado === "no identificado") return pintarSinAlta();

                /* Con el selector no deberia llegar; si llega, se dice donde estan las fechas y no se enseña otra lista. */
                if (estado === "fechas invalidas") {
                    filtro.error(M.mensajeError(err));
                    CDK.estados.vacio(lista, "Corrige las fechas para ver los documentos.");
                    return;
                }
                if (estado === "documento ambiguo") {
                    respuesta = { documentos: [] };
                    CDK.estados.vacio(lista, "Escribe el número con su serie, por ejemplo 009-00969333.");
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
                      texto: "Para ajustar tus documentos primero tienes que completar tu registro en la intranet." }),
            el("a", { href: CDK.rutas.registro(), clase: "cdk-boton cdk-boton--primario", texto: "Completar mi registro" })
        ]));
    }

    /* ---- buscar uno por su numero, en todas las fechas */
    function buscarPorNumero(n) {
        porNumero = n;
        filtro.nodo.classList.add("hidden");
        avisoNumero.innerHTML = "";
        var volver = el("button", { type: "button", id: "directo-por-numero-quitar", clase: "cdk-enlace-accion",
                                    texto: "Volver a la lista" });
        volver.addEventListener("click", quitarNumero);
        avisoNumero.appendChild(el("div", { style: "flex:1;min-width:0" }, [
            el("p", { clase: "cdk-aviso__texto", texto: "Buscando el " + n + " en todas las fechas." }),
            volver
        ]));
        avisoNumero.classList.remove("hidden");
        buscador.value = ""; busqueda = "";
        cargar();
    }

    function quitarNumero() {
        porNumero = "";
        filtro.nodo.classList.remove("hidden");
        avisoNumero.classList.add("hidden");
        cargar();
    }

    /* ===============================================================
     * La lista
     * ============================================================= */
    function coincide(d) {
        if (!busqueda) return true;
        var b = busqueda.toLowerCase();
        return [d.cliente, d.ndocu].some(function (t) { return String(t || "").toLowerCase().indexOf(b) !== -1; });
    }

    function pintar() {
        if (!respuesta) return;
        lista.innerHTML = "";

        var documentos = respuesta.documentos;
        var visibles = documentos.filter(coincide);

        if (!documentos.length) {
            CDK.estados.vacio(lista, porNumero
                ? "No encontramos el " + porNumero + " entre tus " + elegida.etiqueta.toLowerCase() +
                  " que se pueden ajustar o asignar: no existe, no es tuyo o ya avanzó (se convirtió, se facturó o se anuló)."
                : elegida.vacio);
            return;
        }

        if (!visibles.length) {
            CDK.estados.vacio(lista, "Ningún documento de estas fechas coincide con lo que buscas.");
        } else {
            var ul = el("ul", { clase: "cdk-articulos", id: "directo-documentos" });
            visibles.forEach(function (d) { ul.appendChild(fila(d)); });
            lista.appendChild(ul);
        }

        /* Un numero con serie que no esta aqui puede ser de otras fechas: se ofrece buscarlo en todas. */
        if (!porNumero && NUMERO.test(busqueda) && !documentos.some(function (d) { return d.ndocu === busqueda; })) {
            var buscar = el("button", { type: "button", id: "directo-buscar-numero", clase: "cdk-boton cdk-boton--suave",
                                        style: "margin-top:10px", texto: "Buscar el " + busqueda + " en todas las fechas" });
            var n = busqueda;
            buscar.addEventListener("click", function () { buscarPorNumero(n); });
            lista.appendChild(buscar);
        }

        if (respuesta.hayMas) {
            lista.appendChild(el("p", { clase: "cdk-pista", id: "directo-hay-mas", style: "margin:10px 0 0",
                                        texto: "Hay más de 100: se muestran los 100 más recientes. Acota las fechas para ver los demás." }));
        }
    }

    function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

    function fila(d) {
        var sit = A.situacion(d.situacion);

        var datos = [
            { etiqueta: "Fecha", valor: CDK.formato.fecha(d.fecha) },
            { etiqueta: "", valor: sit.texto, tono: sit.tono },
            d.lineasMias
                ? { etiqueta: "Tuyas", valor: d.lineasMias + " de " + d.lineas }
                : { etiqueta: "", valor: "Ninguna línea tuya", tono: "nulo" }
        ];
        /* Lo que se pierde al ajustar, a la vista antes de abrirlo. */
        if (d.promociones > 0) {
            datos.push({ etiqueta: "", tono: "alerta",
                         valor: plural(d.promociones, "promoción", "promociones") + (d.flete ? " · con flete" : "") });
        }
        if (d.ajustes > 0) datos.push({ etiqueta: "Ajustado", valor: plural(d.ajustes, "vez", "veces") });

        var item = CDK.articulo({
            nombre: d.ndocu,
            importe: CDK.formato.moneda(d.totalConIgv, d.moneda),
            detalle: d.cliente,
            datos: datos,
            alPulsar: function () { abrir(d); }
        });
        item.setAttribute("data-ndocu", d.ndocu);
        return item;
    }

    function abrir(d) {
        location.assign(CDK.rutas.app("/ajuste/ajuste_documento.html") +
                        "?tipo=" + encodeURIComponent(elegida.tipo) + "&ndocu=" + encodeURIComponent(d.ndocu));
    }

})(window);
