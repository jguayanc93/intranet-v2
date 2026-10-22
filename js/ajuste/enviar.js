/**
 * Pedir un ajuste de precio (grupo 20): un asistente de tres pasos.
 *
 *   1 · Documento   se elige de la lista de cotizaciones y pedidos abiertos, o se escribe el numero
 *   2 · Revisa      se ve lo que se va a enviar, y se escribe el mensaje
 *   3 · Enviado     a quien fue
 *
 * Es un modulo aparte, no una accion dentro de cotizacion ni de pedido.
 *
 * **Elegir y no teclear.** Las cotizaciones y los pedidos salen de las listas de Listas (los
 * abiertos y sin aprobar, que es lo unico que acepta ajuste), con el numero y su serie ya
 * puestos. Desde el 21/10 la lista de pedidos distingue los sin aprobar (`editable` = 1), asi
 * que ya se pueden elegir igual que una cotizacion. Lo que no se ve —uno viejo, o de otra
 * lista— queda escribiendo el numero.
 *
 * **El paso 2 existe para no enterarse despues.** Pide una vista previa al backend: a quien iria
 * cada linea, cuales no irian a nadie y cuantas promociones se pierden. Y cualquier motivo por el
 * que no se pueda enviar —ya esta en ajuste, ya esta aprobada, ninguna marca tiene responsable—
 * sale ahi, antes de escribir el mensaje. **Esa ruta es una propuesta nuestra: si el backend
 * responde que no existe, el paso 2 sigue —con el documento y los avisos que se saben— y se
 * puede enviar igual**; lo de a quien fue se cuenta al final.
 *
 * Lo que hay que decirle ANTES de enviar, porque no se deshace solo: si el ajuste se confirma el
 * documento pierde TODAS sus promociones; mientras haya una solicitud pendiente no lo puede
 * modificar; y si nadie responde en 3 dias, se libera.
 *
 * Ver docs/ajuste-precios.md y docs/respuesta-ajuste-precios.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste;
    var M = CDK.marcas;              // statusDe(), mensajeError(), nombre()

    var contenido = document.getElementById("contenido");
    if (!contenido) return;

    var FRASES = ["una ajustadita", "mejora el precio", "precio para cerrar hoy"];

    /* Lo que el asistente va sabiendo; lo que se escribio no se pierde al ir y volver. */
    var doc = null;              // el elegido: { tipo, ndocu, cliente?, fecha?, total?, moneda? }
    var previa = null;           // lo que dijo la vista previa, o null si no la hay
    var mensaje = "";
    var filtro = "";
    var documentos = null;       // las cotizaciones y pedidos abiertos; null: sin pedir todavia; [] ninguno
    var enCurso = false;

    iniciar();

    /** Con ?tipo= y ?ndocu= en la URL se salta el paso 1: es la puerta para llegar desde otro sitio. */
    function iniciar() {
        var consulta = new URLSearchParams(location.search);
        var ndocu = (consulta.get("ndocu") || "").trim();

        if (ndocu) elegir({ tipo: consulta.get("tipo") === "PED" ? "PED" : "COT", ndocu: ndocu });
        else pasoDocumento();
    }

    function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

    function dinero(valor, moneda) {
        return moneda ? CDK.formato.moneda(valor, moneda) : CDK.formato.numero(valor, 2);
    }

    function enlaceAMisAjustes(texto, clase) {
        return el("a", { href: CDK.rutas.app("/ajuste/ajuste_enviadas.html"), id: "ajuste-ver-mis-ajustes",
                         clase: clase || "cdk-boton cdk-boton--suave", texto: texto });
    }

    /** Donde va la persona: informa, no navega. */
    function indicador(actual) {
        var hijos = [];
        ["Documento", "Revisa", "Enviado"].forEach(function (nombre, i) {
            var k = i + 1;
            hijos.push(el("span", {
                clase: "cdk-pasos__paso" + (k === actual ? " cdk-pasos__paso--actual" : k < actual ? " cdk-pasos__paso--hecho" : ""),
                "aria-current": k === actual ? "step" : null
            }, [
                el("span", { clase: "cdk-pasos__numero", texto: k < actual ? "✓" : String(k) }),
                document.createTextNode(nombre)
            ]));
            if (k < 3) hijos.push(el("span", { clase: "cdk-pasos__raya", texto: "—" }));
        });
        return el("div", { clase: "cdk-pasos", id: "ajuste-pasos" }, hijos);
    }

    /* ===============================================================
     * Paso 1 · Documento
     * ============================================================= */
    function pasoDocumento() {
        previa = null;
        contenido.innerHTML = "";

        var buscador = el("input", {
            type: "search", id: "ajuste-buscar-doc", clase: "cdk-entrada", autocomplete: "off",
            placeholder: "Buscar por cliente o número", "aria-label": "Buscar una cotización o un pedido", value: filtro
        });
        var lista = el("div", { id: "ajuste-documentos" });
        var manual = el("div", { id: "ajuste-manual-caja" });

        buscador.addEventListener("input", function () {
            filtro = buscador.value.trim().toLowerCase();
            pintarDocumentos(lista);
        });

        var abrir = el("button", { type: "button", id: "ajuste-manual-abrir", clase: "cdk-enlace-accion",
                                   texto: "¿No lo ves? Escribe su número ›" });
        abrir.addEventListener("click", function () {
            if (manual.firstChild) { manual.innerHTML = ""; return; }
            manual.appendChild(formularioManual());
            document.getElementById("ajuste-ndocu").focus();
        });

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "ajuste-paso-documento" }, [
            indicador(1),
            el("h2", { clase: "cdk-seccion__titulo", texto: "¿Cuál quieres ajustar?" }),
            el("p", { clase: "cdk-seccion__sub", texto: "Tus cotizaciones y pedidos abiertos, los que todavía no están aprobados." }),
            el("div", { clase: "cdk-campo" }, [buscador]),
            lista,
            el("div", { style: "margin-top:14px" }, [abrir, manual])
        ]));

        if (documentos) return pintarDocumentos(lista);
        cargarDocumentos(lista);
    }

    function cargarDocumentos(lista) {
        CDK.estados.cargando(lista, "Cargando tus cotizaciones y pedidos…");

        A.documentosAbiertos()
            .then(function (d) {
                documentos = d;
                if (document.body.contains(lista)) pintarDocumentos(lista);
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;           // ya redirige
                /* Sin la lista no se pierde nada: queda escribir el numero. */
                if (document.body.contains(lista)) CDK.estados.error(lista, err, function () { cargarDocumentos(lista); });
            });
    }

    function pintarDocumentos(lista) {
        lista.innerHTML = "";
        if (!documentos) return;

        var visibles = documentos.filter(function (c) {
            return !filtro || (c.cliente + " " + c.ndocu).toLowerCase().indexOf(filtro) !== -1;
        });

        if (!documentos.length) { CDK.estados.vacio(lista, "No tienes cotizaciones ni pedidos abiertos."); return; }
        if (!visibles.length) { CDK.estados.vacio(lista, "Ningún documento coincide con lo que buscas."); return; }

        var ul = el("ul", { clase: "cdk-articulos", id: "ajuste-cotizaciones" });
        visibles.forEach(function (c) {
            var item = CDK.articulo({
                nombre: c.cliente,
                importe: CDK.formato.moneda(c.total, c.moneda),
                detalle: A.tipoNombre(c.tipo) + " " + c.ndocu + " · " + CDK.formato.fecha(c.fecha),
                alPulsar: function () {
                    elegir({ tipo: c.tipo, ndocu: c.ndocu, cliente: c.cliente, fecha: c.fecha, total: c.total, moneda: c.moneda });
                }
            });
            item.setAttribute("data-ndocu", c.ndocu);
            ul.appendChild(item);
        });
        lista.appendChild(ul);
    }

    /** Para lo que no esta en la lista: un documento que no sale, o uno que se tiene a mano por su numero. */
    function formularioManual() {
        var tipo = el("select", { id: "ajuste-tipo", clase: "cdk-entrada" }, [
            el("option", { value: "COT", texto: "Cotización" }),
            el("option", { value: "PED", texto: "Pedido" })
        ]);
        var ndocu = el("input", {
            type: "text", id: "ajuste-ndocu", clase: "cdk-entrada", autocomplete: "off", autocapitalize: "off",
            placeholder: "009-00969476", "aria-label": "Número del documento"
        });
        var error = el("div", { id: "ajuste-manual-error", clase: "cdk-campo__error", style: "margin-top:8px" });
        error.classList.add("hidden");

        ndocu.addEventListener("input", function () { error.classList.add("hidden"); });

        var form = el("form", { id: "ajuste-manual", novalidate: "novalidate", style: "margin-top:12px" }, [
            el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "ajuste-tipo", texto: "Qué es" }), tipo
            ]),
            el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "ajuste-ndocu", texto: "Número, con su serie" }), ndocu,
                el("p", { clase: "cdk-campo__pista", texto: "Por ejemplo 009-00969476. Sin la serie, el número es ambiguo." })
            ]),
            error,
            el("div", { clase: "cdk-acciones-fila", style: "margin-top:12px" }, [
                el("button", { type: "submit", id: "ajuste-manual-continuar", clase: "cdk-boton cdk-boton--primario", texto: "Continuar" })
            ])
        ]);

        form.addEventListener("submit", function (ev) {
            ev.preventDefault();

            var numero = ndocu.value.trim();
            if (!numero) {
                error.textContent = "Escribe el número del documento, con su serie.";
                error.classList.remove("hidden");
                ndocu.focus();
                return;
            }
            elegir({ tipo: tipo.value, ndocu: numero });
        });

        return form;
    }

    function elegir(d) {
        doc = d;
        pasoRevisa();
    }

    /* ===============================================================
     * Paso 2 · Revisa
     * ============================================================= */
    function pasoRevisa() {
        previa = null;
        contenido.innerHTML = "";

        var cuerpo = el("div", { id: "ajuste-revisa" });
        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "ajuste-paso-revisa" }, [indicador(2), cuerpo]));
        CDK.estados.cargando(cuerpo, "Revisando el documento…");

        A.previa(doc.tipo, doc.ndocu)
            .then(function (d) {
                previa = d;
                pintarRevisa(cuerpo, false);
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;           // ya redirige

                /* El backend aun no tiene la vista previa: se sigue sin ella. */
                if (A.sinPrevia(err)) return pintarRevisa(cuerpo, true);

                /* Un motivo de negocio (un 4xx con su `status`): no se puede enviar, y se dice aqui, antes de
                   escribir nada. Un 500 no lo es, aunque traiga cuerpo: eso se reintenta. */
                if (M.statusDe(err) && err.status >= 400 && err.status < 500) return pintarMotivo(cuerpo, err);

                CDK.estados.error(cuerpo, err, pasoRevisa);
                cuerpo.appendChild(el("div", { clase: "cdk-acciones-fila", style: "margin-top:12px" }, [botonAtras()]));
            });
    }

    function botonAtras() {
        var atras = el("button", { type: "button", id: "ajuste-atras", clase: "cdk-boton cdk-boton--suave", texto: "Atrás" });
        atras.addEventListener("click", pasoDocumento);
        return atras;
    }

    function cuantasLineas() {
        if (!previa) return null;
        return previa.solicitudes.reduce(function (n, s) { return n + s.lineas.length; }, 0) + (previa.sinResponsable || []).length;
    }

    /** El documento, con lo que se sabe de el: lo de la lista y, si la hay, lo de la vista previa. */
    function resumenDoc() {
        var moneda = monedaDe(previa) || doc.moneda || null;
        var cliente = doc.cliente || (previa && previa.cliente) || null;

        function fila(etiqueta, valor, clase) {
            return el("div", { clase: "cdk-medida" }, [el("div", { clase: "cdk-medida__fila" }, [
                el("span", { clase: "cdk-medida__etiqueta", texto: etiqueta }),
                el("span", { clase: "cdk-medida__valor", style: "font-weight:600;text-align:right" + (clase || ""), texto: valor })
            ])]);
        }

        var hijos = [el("div", { style: "font-weight:700;font-size:15px", id: "ajuste-resumen-titulo",
                                 texto: A.tipoNombre(doc.tipo) + " " + doc.ndocu })];
        if (cliente) hijos.push(el("div", { clase: "cdk-pista", style: "margin:2px 0 8px", texto: cliente }));
        if (doc.fecha) hijos.push(fila("Fecha", CDK.formato.fecha(doc.fecha)));
        if (doc.total !== undefined && doc.total !== null) hijos.push(fila("Total con IGV", CDK.formato.moneda(doc.total, moneda)));
        if (previa) hijos.push(fila("Líneas", String(cuantasLineas())));
        if (previa && previa.promociones > 0) hijos.push(fila("Promociones", String(previa.promociones), ";color:var(--cdk-error)"));

        return el("div", { clase: "cdk-seccion", id: "ajuste-resumen-doc", style: "padding:12px 14px;margin:0 0 12px" }, hijos);
    }

    /** No se puede enviar: lo dice el backend, con su mensaje. Se vuelve a elegir. */
    function pintarMotivo(cuerpo, err) {
        cuerpo.innerHTML = "";
        cuerpo.appendChild(resumenDoc());

        var hijos = [el("p", { clase: "cdk-aviso__texto", id: "ajuste-motivo-texto", style: "margin:0", texto: M.mensajeError(err) })];
        if (M.statusDe(err) === "documento en ajuste") {
            hijos.push(el("p", { style: "margin:8px 0 0" }, [enlaceAMisAjustes("Ver mis ajustes", "cdk-enlace-accion")]));
        }
        cuerpo.appendChild(el("div", { clase: "cdk-aviso cdk-aviso--error", id: "ajuste-motivo", style: "margin-bottom:12px" }, [
            el("div", { style: "flex:1;min-width:0" }, hijos)
        ]));

        var otro = el("button", { type: "button", id: "ajuste-elegir-otro", clase: "cdk-boton cdk-boton--primario", texto: "Elegir otro documento" });
        otro.addEventListener("click", pasoDocumento);
        cuerpo.appendChild(el("div", { clase: "cdk-acciones-fila" }, [otro]));
    }

    /** Una linea que va a un responsable: cuanto y de que. */
    function lineaConPrecio(l, moneda) {
        return el("li", { style: "margin:6px 0 0" }, [
            el("span", { texto: l.cantidad + " × " + dinero(l.precio, moneda) + "  " + l.descripcion }),
            el("span", { clase: "cdk-pista", texto: "  (" + M.nombre(l.marca) + ")" })
        ]);
    }

    /** La moneda que dice el backend (la vista previa y el envio la traen desde el 21/10); si no, la que se sabia. */
    function monedaDe(respuesta) {
        return respuesta && (respuesta.moneda === "S" || respuesta.moneda === "D") ? respuesta.moneda : null;
    }

    /** Una linea que no va a nadie: dice que es y cuanta cantidad, pero no su precio (no hay quien lo ajuste). */
    function lineaSinEnviar(l) {
        var cantidad = typeof l.cantidad === "number" ? l.cantidad + " × " : "";
        return el("li", { style: "margin:6px 0 0" }, [
            el("span", { texto: cantidad + l.descripcion }),
            el("span", { clase: "cdk-pista", texto: "  (" + M.nombre(l.marca) + ")" })
        ]);
    }

    function rolDe(recibe) {
        return recibe.como === "JEFATURA" ? "Jefatura de la familia: la marca no tiene dueño" : "Dueño de la marca";
    }

    function avisoFijo() {
        var promos = previa && previa.promociones > 0
            ? "Tiene " + plural(previa.promociones, "promoción", "promociones") + ": si el ajuste se confirma, " +
              (previa.promociones === 1 ? "la pierde." : "las pierde todas.")
            : "Si el ajuste se confirma, el documento pierde todas sus promociones.";

        return el("div", { clase: "cdk-aviso", id: "ajuste-aviso-previo", style: "margin:0 0 12px" }, [
            el("div", { style: "flex:1;min-width:0" }, [
                el("p", { clase: "cdk-aviso__texto", style: "margin:0", texto: promos }),
                el("p", { clase: "cdk-pista", style: "margin:6px 0 0",
                          texto: "Mientras haya una solicitud pendiente no podrás modificarlo. Si nadie responde en 3 días, se libera." })
            ])
        ]);
    }

    function campoMensaje() {
        var caja = el("textarea", {
            id: "ajuste-mensaje", clase: "cdk-entrada", rows: "3", maxlength: "300",
            placeholder: "Cuéntales qué buscas", "aria-label": "Mensaje"
        });
        caja.value = mensaje;
        caja.addEventListener("input", function () { mensaje = caja.value; });

        var chips = el("div", { id: "ajuste-frases", style: "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px" }, FRASES.map(function (f) {
            var b = el("button", { type: "button", clase: "cdk-boton cdk-boton--suave", style: "min-height:34px;padding:0 12px;font-size:13px", texto: f });
            b.addEventListener("click", function () { caja.value = f; mensaje = f; });
            return b;
        }));

        return el("div", { clase: "cdk-campo" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "ajuste-mensaje", texto: "Mensaje (opcional)" }), caja, chips
        ]);
    }

    function pintarRevisa(cuerpo, sinPrevia) {
        cuerpo.innerHTML = "";
        var moneda = monedaDe(previa) || doc.moneda || null;

        cuerpo.appendChild(el("h2", { clase: "cdk-seccion__titulo", texto: "Revisa lo que se enviará" }));
        cuerpo.appendChild(resumenDoc());

        if (previa) {
            cuerpo.appendChild(el("div", { clase: "cdk-seccion", id: "ajuste-se-enviara", style: "padding:12px 14px;margin:0 0 12px" }, [
                el("div", { style: "font-weight:700;font-size:14px;margin-bottom:4px", texto: "Se enviará así" })
            ].concat(previa.solicitudes.map(function (s, i) {
                return el("div", { clase: "ajuste-responsable", id: "ajuste-responsable-" + i,
                                   style: "padding:10px 0;border-top:1px solid var(--cdk-borde)" }, [
                    el("div", { style: "font-weight:700;font-size:14px;overflow-wrap:anywhere", texto: s.recibe.nombre }),
                    el("div", { clase: "cdk-pista", texto: rolDe(s.recibe) + " · " + plural(s.lineas.length, "línea", "líneas") }),
                    el("ul", { style: "margin:6px 0 0;padding-left:18px" }, s.lineas.map(function (l) { return lineaConPrecio(l, moneda); }))
                ]);
            }))));

            /* Lo que NO se enviara a nadie, que el vendedor se entera de que no se va a ajustar. */
            var sin = previa.sinResponsable || [];
            if (sin.length) {
                cuerpo.appendChild(el("div", { clase: "cdk-aviso", id: "ajuste-sin-responsable", style: "margin:0 0 12px" }, [
                    el("div", { style: "flex:1;min-width:0" }, [
                        el("p", { clase: "cdk-aviso__texto", style: "margin:0",
                                  texto: plural(sin.length, "línea NO se enviará", "líneas NO se enviarán") + " a nadie: no se " +
                                         (sin.length === 1 ? "va" : "van") + " a ajustar." }),
                        el("p", { clase: "cdk-pista", style: "margin:6px 0 0", texto: "Su marca no tiene dueño ni jefatura que la responda." }),
                        el("ul", { id: "ajuste-sin-responsable-lineas", style: "margin:8px 0 0;padding-left:18px" }, sin.map(lineaSinEnviar))
                    ])
                ]));
            }
        }

        cuerpo.appendChild(avisoFijo());

        if (sinPrevia) {
            cuerpo.appendChild(el("p", { clase: "cdk-pista", id: "ajuste-sin-previa", style: "margin:0 0 12px",
                                         texto: "Cuando la envíes verás a quién le llegó y si alguna línea se quedó sin responsable." }));
        }

        cuerpo.appendChild(campoMensaje());

        var error = el("div", { id: "ajuste-enviar-error", clase: "cdk-campo__error", style: "margin-top:8px" });
        error.classList.add("hidden");
        cuerpo.appendChild(error);

        var boton = el("button", { type: "button", id: "ajuste-enviar", clase: "cdk-boton cdk-boton--primario", texto: "Enviar a ajuste" });
        boton.addEventListener("click", function () { enviar(boton, error); });

        cuerpo.appendChild(el("div", { clase: "cdk-acciones-fila", style: "margin-top:14px" }, [boton, botonAtras()]));
    }

    /* ===============================================================
     * Enviar
     * ============================================================= */
    function decir(error, texto, enlace) {
        error.innerHTML = "";
        error.appendChild(document.createTextNode(texto));
        if (enlace) {
            error.appendChild(document.createTextNode(" "));
            error.appendChild(enlace);
        }
        error.classList.remove("hidden");
    }

    function enviar(boton, error) {
        if (enCurso) return;

        enCurso = true;
        boton.disabled = true;
        boton.textContent = "Enviando…";
        error.classList.add("hidden");

        A.enviar(doc.tipo, doc.ndocu, mensaje.trim())
            .then(function (r) {
                enCurso = false;
                CDK.toast("Solicitud enviada.", "exito");
                /* Una pendiente mas: el numerito del menu se actualiza ahora, no en la siguiente pagina. */
                if (CDK.shell && CDK.shell.actualizarMenu) CDK.shell.actualizarMenu();
                pasoEnviado(r);
            })
            .catch(function (err) {
                enCurso = false;
                boton.disabled = false;
                boton.textContent = "Enviar a ajuste";

                if (CDK.http.esError(err) && err.status === 401) return;           // ya redirige

                /* Algo cambio desde la vista previa —alguien lo aprobo, otra pestaña lo envio—: se dice aqui. */
                var enAjuste = M.statusDe(err) === "documento en ajuste";
                decir(error, M.mensajeError(err), enAjuste ? enlaceAMisAjustes("Ver mis ajustes", "cdk-enlace-accion") : null);
            });
    }

    /* ===============================================================
     * Paso 3 · Enviado
     * ============================================================= */
    function tarjetaDeResponsable(s, moneda) {
        return el("li", { clase: "cdk-articulo", id: "solicitud-" + s.id }, [el("div", { clase: "cdk-articulo__cuerpo" }, [
            el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: s.recibe.nombre }),
            el("div", { clase: "cdk-articulo__detalle", texto: rolDe(s.recibe) }),
            el("div", { clase: "cdk-articulo__datos" }, [
                el("span", { clase: "cdk-dato" }, [document.createTextNode("Líneas "),
                    el("span", { clase: "cdk-dato__valor", texto: String(s.lineas.length) })]),
                el("span", { clase: "cdk-dato cdk-dato--alerta" }, [document.createTextNode("Vence "),
                    el("span", { clase: "cdk-dato__valor", texto: CDK.formato.fecha(s.vence, "conHora") })])
            ]),
            el("ul", { style: "margin:8px 0 0;padding-left:18px" }, s.lineas.map(function (l) { return lineaConPrecio(l, moneda); }))
        ])]);
    }

    function pasoEnviado(r) {
        contenido.innerHTML = "";

        /* Desde el 21/10 `enviar` dice la moneda; si no la dijera, se usa la que se sabia de la lista. */
        var moneda = monedaDe(r) || (doc && doc.moneda) || null;

        var hijos = [
            indicador(3),
            el("h2", { clase: "cdk-seccion__titulo", id: "ajuste-enviada-titulo", texto: "Enviada a ajuste" }),
            el("p", { clase: "cdk-seccion__sub", id: "ajuste-enviada-doc",
                      texto: A.tipoNombre(r.tipo) + " " + r.ndocu + " · " + r.cliente }),
            el("p", { clase: "cdk-pista", style: "margin:0 0 12px",
                      texto: "Cada responsable recibe solo las líneas de sus marcas y responde por su lado." }),
            el("ul", { clase: "cdk-articulos", id: "ajuste-responsables" }, r.solicitudes.map(function (s) { return tarjetaDeResponsable(s, moneda); }))
        ];

        /* Lo que no se envio a nadie: el vendedor tiene que saber que esas no se van a ajustar. */
        var sin = r.sinResponsable || [];
        if (sin.length) {
            hijos.push(el("div", { clase: "cdk-aviso", id: "ajuste-sin-responsable", style: "margin-top:14px" }, [
                el("div", { style: "flex:1;min-width:0" }, [
                    el("p", { clase: "cdk-aviso__texto", style: "margin:0",
                              texto: plural(sin.length, "línea no se envió", "líneas no se enviaron") +
                                     " a nadie: no se " + (sin.length === 1 ? "va" : "van") + " a ajustar." }),
                    el("p", { clase: "cdk-pista", style: "margin:6px 0 0", texto: "Su marca no tiene dueño ni jefatura que la responda." }),
                    el("ul", { id: "ajuste-sin-responsable-lineas", style: "margin:8px 0 0;padding-left:18px" }, sin.map(lineaSinEnviar))
                ])
            ]));
        }

        if (r.promociones > 0) {
            hijos.push(el("p", { clase: "cdk-pista", id: "ajuste-enviada-promos", style: "margin:14px 0 0",
                                 texto: "El documento tiene " + plural(r.promociones, "promoción", "promociones") +
                                        ": si confirman el ajuste, se quitan todas." }));
        }

        var otro = el("button", { type: "button", id: "ajuste-pedir-otro", clase: "cdk-boton cdk-boton--suave", texto: "Pedir otro ajuste" });
        otro.addEventListener("click", function () {
            /* Lo enviado ya no se puede volver a enviar: la lista se pide de nuevo. */
            doc = null; previa = null; mensaje = ""; filtro = ""; documentos = null;
            pasoDocumento();
        });

        hijos.push(el("div", { clase: "cdk-acciones-fila", style: "margin-top:16px" }, [
            enlaceAMisAjustes("Ver mis ajustes", "cdk-boton cdk-boton--primario"), otro
        ]));

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "ajuste-enviada" }, hijos));
    }

})(window);
