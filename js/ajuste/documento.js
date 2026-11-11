/**
 * Un documento propio (grupo 25), desde «Mis documentos»: ajustar el precio de las lineas de sus
 * marcas y, si quiere, asignarlo a un vendedor del grupo 20.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona ve:
 *
 *   · **Solo el precio**: no hay cantidad (eso va por Cotizacion) ni se agregan o quitan lineas. Se
 *     puede ajustar aunque este aprobado, y la aprobacion no cambia.
 *   · **Al aplicar**, en las lineas ajustadas el descuento del cliente pasa a 0, y en TODO el documento
 *     se quitan todas las promociones, **incluido el descuento de flete de provincia**, que no vuelve
 *     solo: se avisa antes y se nombra el flete cuando lo hay (`flete`).
 *   · El precio, su redondeo y su minimo son los de js/ajuste/precio.js, los mismos que en «Recibidas».
 *     Una linea sin costo (`costo` en null) se ve sin controles.
 *   · Se puede ajustar **varias veces**; cada ajuste queda en el historial de abajo.
 *   · **Asignar no se deshace desde la intranet**: se pide confirmacion, y si es una cotizacion sin
 *     aprobar ya ajustada se avisa de que el vendedor, si la modifica, vuelve al precio de lista.
 *   · Lo que no se puede hacer lo dice el backend (`motivoAjustar`, `motivoAsignar`), y se dice por que.
 *   · `documento no ajustable`, `no asignable`, `en ajuste` y `costo desconocido` dicen que la pantalla ya
 *     no esta al dia: se dice el mensaje y se vuelve a pedir el documento.
 *
 * Ver docs/ajuste-directo.md (secciones 5 a 7).
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste;
    var M = CDK.marcas;              // statusDe(), mensajeError(), nombre()

    var destino = document.getElementById("contenido");
    if (!destino) return;

    var params = new URLSearchParams(location.search);
    var tipo = (params.get("tipo") || "").toUpperCase();
    var ndocu = params.get("ndocu") || "";

    var datos = null;                // el documento, tal como lo dijo el backend
    var tarjetas = [];               // una por linea que se puede ajustar
    var resultado = null;            // lo que respondio aplicar, para decirlo arriba
    var enCurso = false;

    var botonAplicar = null;
    var resumen = null;
    var observacion = null;

    var elegido = null;              // el vendedor elegido para asignar
    var botonAsignar = null;
    var sinAplicar = null;           // el aviso de asignar: hay precios marcados que no se aplicaron
    var vezVendedores = 0;

    if (!ndocu || (tipo !== "COT" && tipo !== "PED")) pintarNoExiste(null);
    else cargar();

    function moneda() { return datos.documento.moneda; }
    function dinero(v) { return A.dinero(v, moneda()); }
    function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }
    function nombreDelTipo() { return A.tipoNombre(tipo); }

    /* ===============================================================
     * Datos
     * ============================================================= */
    function cargar() {
        CDK.estados.cargando(destino, "Cargando el documento…");

        A.directoDocumento(tipo, ndocu)
            .then(function (d) {
                datos = d;
                pintar();
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;           // ya redirige
                var estado = M.statusDe(err);

                if (estado === "no identificado") return pintarSinAlta();
                if (estado === "documento desconocido" || estado === "documento ambiguo" || estado === "tipo invalido") {
                    return pintarNoExiste(err);
                }
                CDK.estados.error(destino, err, cargar);
            });
    }

    function volver() {
        return el("a", { href: CDK.rutas.app("/ajuste/ajuste_directo.html") + "?tipo=" + encodeURIComponent(tipo || "COT"),
                         id: "documento-volver", clase: "cdk-enlace-accion", style: "display:inline-block;margin:0 0 12px",
                         texto: "← Mis documentos" });
    }

    function pintarNoExiste(err) {
        destino.innerHTML = "";
        destino.appendChild(volver());
        destino.appendChild(el("section", { clase: "cdk-seccion", id: "documento-no-existe" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "No encontramos ese documento" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: err ? M.mensajeError(err) : "Falta indicar qué documento abrir." }),
            el("p", { clase: "cdk-pista", style: "margin:8px 0 0",
                      texto: "Si lo asignaste a un vendedor, ya es suyo: lo encuentras en «Asignados»." })
        ]));
    }

    function pintarSinAlta() {
        destino.innerHTML = "";
        destino.appendChild(el("section", { clase: "cdk-seccion", id: "ajuste-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para ajustar tus documentos primero tienes que completar tu registro en la intranet." }),
            el("a", { href: CDK.rutas.registro(), clase: "cdk-boton cdk-boton--primario", texto: "Completar mi registro" })
        ]));
    }

    /* ===============================================================
     * Pintado
     * ============================================================= */
    function pintar() {
        destino.innerHTML = "";
        tarjetas = [];
        botonAplicar = null;
        botonAsignar = null;
        sinAplicar = null;
        elegido = null;

        var d = datos;
        destino.appendChild(volver());
        destino.appendChild(cabecera());
        if (resultado) destino.appendChild(avisoDeResultado());

        var porque = motivos();
        if (porque) destino.appendChild(porque);

        if (d.puedoAjustar) destino.appendChild(avisos());
        if (d.lineas && d.lineas.length) destino.appendChild(seccionDeLineas());
        if (d.otrasLineas > 0) destino.appendChild(seccionDeOtras());
        if (d.puedoAjustar) destino.appendChild(seccionDeAplicar());
        if (d.puedoAsignar) destino.appendChild(seccionDeAsignar());
        if (d.ajustes && d.ajustes.length) destino.appendChild(seccionDeHistorial());
    }

    function dato(etiqueta, valor, tono) {
        return el("span", { clase: "cdk-dato" + (tono ? " cdk-dato--" + tono : "") }, [
            document.createTextNode(etiqueta ? etiqueta + " " : ""),
            el("span", { clase: "cdk-dato__valor", texto: String(valor) })
        ]);
    }

    function cabecera() {
        var doc = datos.documento;
        var sit = A.situacion(doc.situacion);

        return el("section", { clase: "cdk-seccion", id: "documento-cabecera" }, [
            el("h2", { clase: "cdk-seccion__titulo", id: "documento-titulo", texto: nombreDelTipo() + " " + datos.ndocu }),
            el("p", { clase: "cdk-seccion__sub", style: "margin-bottom:8px", id: "documento-cliente", texto: doc.cliente }),
            el("div", { clase: "cdk-articulo__datos" }, [
                dato("Fecha", CDK.formato.fecha(doc.fecha)),
                dato("Moneda", doc.moneda === "S" ? "Soles" : "Dólares"),
                dato("", sit.texto, sit.tono),
                dato("Total", dinero(doc.totalConIgv) + " con IGV")
            ])
        ]);
    }

    /** Lo que aplicar respondio: los totales nuevos de TODO el documento y las promociones que se fueron. */
    function avisoDeResultado() {
        var t = resultado.totales || {};
        var hijos = [el("p", { clase: "cdk-aviso__texto", texto: "Ajuste aplicado." })];

        if (resultado.promocionesQuitadas) {
            hijos.push(el("p", { clase: "cdk-pista", id: "documento-promos-quitadas",
                                 texto: "Se quitaron " + plural(resultado.promocionesQuitadas, "promoción", "promociones") +
                                        " del documento." }));
        }
        if (t.totn !== undefined) {
            hijos.push(el("p", { clase: "cdk-pista", id: "documento-totales", style: "margin-top:4px",
                                 texto: "Total del documento: " + dinero(t.tota) + " sin IGV · " +
                                        dinero(t.toti) + " de IGV · " + dinero(t.totn) + " con IGV." }));
        }
        /* Aplicar no cierra el documento: se puede asignar despues, y el vendedor lo recibe con este precio. */
        if (datos.puedoAsignar) {
            hijos.push(el("p", { clase: "cdk-pista", id: "documento-ahora-asignar", style: "margin-top:4px",
                                 texto: "Si ya quedó como querías, ahora puedes asignarlo a un vendedor (abajo): lo recibe con este precio." }));
        }

        return el("div", { clase: "cdk-aviso", id: "documento-resultado", style: "margin-bottom:14px" }, [
            el("div", { style: "flex:1;min-width:0" }, hijos)
        ]);
    }

    /** Por que no se puede ajustar o asignar, con las palabras de la persona. La lista es cerrada (contrato, seccion 5). */
    function textoDeMotivo(motivo) {
        if (motivo === "documento avanzado") {
            return "Este documento ya avanzó (" + A.situacion(datos.documento.situacion).texto.toLowerCase() +
                   "): ya no se puede ajustar ni asignar.";
        }
        if (motivo === "documento en ajuste") {
            return "Tiene una solicitud de ajuste de un vendedor sin responder: no se puede ajustar ni asignar hasta que " +
                   "la respondan o venza.";
        }
        if (motivo === "sin lineas propias") {
            return "Ninguna línea es de tus marcas este mes: no hay precio que ajustar" +
                   (datos.puedoAsignar ? ", pero puedes asignarlo a un vendedor." : ".");
        }
        return "No se puede " + (motivo ? "(" + motivo + ")" : "") + ".";
    }

    function motivos() {
        var d = datos;
        var textos = [];
        if (!d.puedoAjustar) textos.push(textoDeMotivo(d.motivoAjustar));
        /* Los dos motivos que bloquean ajustar y asignar se dicen una sola vez. */
        if (!d.puedoAsignar && d.motivoAsignar !== d.motivoAjustar) textos.push(textoDeMotivo(d.motivoAsignar));
        if (!textos.length) return null;

        return el("div", { clase: "cdk-aviso", id: "documento-motivo", style: "margin-bottom:14px" }, [
            el("div", { style: "flex:1;min-width:0" }, textos.map(function (t, i) {
                return el("p", { clase: i ? "cdk-pista" : "cdk-aviso__texto", style: i ? "margin:6px 0 0" : "margin:0", texto: t });
            }))
        ]);
    }

    /** Lo que hay que saber ANTES de ajustar: lo que se pierde y lo que no se toca. */
    function avisos() {
        var d = datos;
        var lineas = [];

        if (d.promociones > 0) {
            lineas.push(["documento-aviso-promos",
                "Al aplicar se quitan TODAS las promociones del documento, también las de otras marcas: tiene " +
                plural(d.promociones, "promoción", "promociones") +
                (d.flete ? ", entre ellas el descuento de flete de provincia, que no vuelve a aplicarse solo." : ".")]);
        }
        if (d.otrasLineas > 0) {
            lineas.push(["documento-aviso-otras",
                "Tiene " + plural(d.otrasLineas, "línea", "líneas") + " de otras marcas: las ves abajo, pero no las puedes tocar."]);
        }
        lineas.push(["documento-aviso-precio", "Aquí solo se cambia el precio: ni la cantidad ni las líneas."]);
        lineas.push(["documento-aviso-erp", "El precio del producto en el ERP no cambia: el ajuste es solo de este documento." +
                     (d.documento.situacion === "aprobado" ? " Y sigue aprobado." : "")]);

        return el("div", { clase: "cdk-aviso", id: "documento-avisos", style: "margin-bottom:14px" }, [
            el("div", { style: "flex:1;min-width:0" }, lineas.map(function (l, i) {
                return el("p", { id: l[0], clase: i === 0 && d.promociones > 0 ? "cdk-aviso__texto" : "cdk-pista",
                                 style: i ? "margin:6px 0 0" : "margin:0", texto: l[1] });
            }))
        ]);
    }

    /* ===============================================================
     * Las lineas
     * ============================================================= */
    function seccionDeLineas() {
        var d = datos;
        var ul = el("ul", { clase: "cdk-articulos", id: "documento-lineas" });

        d.lineas.forEach(function (l) {
            if (!d.puedoAjustar) {
                ul.appendChild(el("li", { clase: "cdk-articulo", id: "linea-" + l.item }, [
                    el("div", { clase: "cdk-articulo__cuerpo" }, A.datosDeLinea(l, moneda()))
                ]));
                return;
            }
            if (A.sinCosto(l)) return ul.appendChild(A.tarjetaSinCosto(l, moneda()));

            var t = A.tarjetaDePrecio(l, { moneda: moneda(), cantidad: false, alCambiar: revisar });
            tarjetas.push(t);
            ul.appendChild(t.nodo);
        });

        return el("section", { clase: "cdk-seccion", id: "documento-seccion-lineas" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Tus líneas" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: d.puedoAjustar
                          ? "Marca las que quieres ajustar. Las demás se quedan como están."
                          : plural(d.lineas.length, "línea", "líneas") + " de tus marcas." }),
            ul
        ]);
    }

    /** Las lineas de otras marcas: solo para verlas. Sin costo ni margen, que no son suyos. */
    function seccionDeOtras() {
        var d = datos;
        var otras = Array.isArray(d.otras) ? d.otras : [];
        var hijos = [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Otras marcas" }),
            el("p", { clase: "cdk-seccion__sub", texto: plural(d.otrasLineas, "línea", "líneas") + " que no son de tus marcas: no se tocan." })
        ];

        if (otras.length) {
            hijos.push(el("ul", { clase: "cdk-articulos", id: "documento-otras" }, otras.map(function (o) {
                return el("li", { clase: "cdk-articulo", id: "otra-" + o.item }, [
                    el("div", { clase: "cdk-articulo__cuerpo" }, [
                        el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: o.descripcion }),
                        el("div", { clase: "cdk-articulo__detalle", texto: M.nombre(o.marca) + " · " + o.codf }),
                        el("p", { clase: "cdk-pista", style: "margin:6px 0 0",
                                  texto: o.cantidad + " × " + dinero(o.precio) + (o.dsct ? " − " + CDK.formato.porcentaje(o.dsct, 1) : "") +
                                         " = " + dinero(o.total) })
                    ])
                ]);
            })));
        }

        return el("section", { clase: "cdk-seccion", id: "documento-seccion-otras" }, hijos);
    }

    /* ===============================================================
     * Aplicar
     * ============================================================= */
    function seccionDeAplicar() {
        observacion = el("textarea", {
            id: "documento-observacion", clase: "cdk-entrada", rows: "2", maxlength: "300",
            placeholder: "Opcional: por qué ajustas (queda en el historial)", "aria-label": "Observación"
        });

        resumen = el("p", { clase: "cdk-pista", id: "documento-resumen", style: "margin:12px 0 0" });
        botonAplicar = el("button", { type: "button", id: "documento-aplicar", clase: "cdk-boton cdk-boton--primario",
                                      texto: "Aplicar ajuste" });
        botonAplicar.addEventListener("click", pedirAplicar);

        revisar();

        return el("section", { clase: "cdk-seccion", id: "documento-seccion-aplicar" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Aplicar el ajuste" }),
            el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "documento-observacion", texto: "Observación" }),
                observacion
            ]),
            resumen,
            el("div", { clase: "cdk-acciones-fila", style: "margin-top:12px" }, [botonAplicar])
        ]);
    }

    function activas() {
        return tarjetas.filter(function (t) { return t.activa; });
    }

    /** Habilita aplicar solo con algo que ajustar y todo bien; lo dice en una linea. */
    function revisar() {
        if (botonAsignar) botonAsignar.disabled = enCurso || !elegido;

        /* Asignar despues de marcar y antes de aplicar pierde lo marcado: se dice al lado de asignar, no solo al confirmar. */
        var marcadas = activas().length;
        if (sinAplicar) {
            sinAplicar.style.display = marcadas ? "" : "none";
            sinAplicar.firstChild.textContent = marcadas === 1
                ? "Tienes 1 línea marcada sin aplicar: aplícala primero o se perderá al asignar."
                : "Tienes " + marcadas + " líneas marcadas sin aplicar: aplícalas primero o se perderán al asignar.";
        }
        if (!botonAplicar) return;

        var elegidas = activas();
        var malas = elegidas.filter(function (t) { return !t.valida; });

        botonAplicar.disabled = enCurso || !elegidas.length || malas.length > 0;

        if (!tarjetas.length) {
            resumen.textContent = "Ninguna línea se puede ajustar: no tienen costo cargado.";
        } else if (!elegidas.length) {
            resumen.textContent = "Marca las líneas que quieres ajustar.";
        } else if (malas.length) {
            resumen.textContent = "Corrige el precio de " + plural(malas.length, "línea", "líneas") + " para poder aplicar.";
        } else {
            resumen.textContent = "Vas a ajustar " + elegidas.length + " de " + plural(tarjetas.length, "línea", "líneas") + ".";
        }
    }

    function pedirAplicar() {
        if (enCurso || botonAplicar.disabled) return;

        /* Solo el precio, ya redondeado al centimo: la cantidad nunca viaja. */
        var lineas = activas().map(function (t) { return { item: t.item, precio: t.precio() }; });

        var mensaje = "Vas a ajustar " + plural(lineas.length, "línea", "líneas") + ". En ellas el descuento del cliente pasa a 0 " +
                      "y el precio que pusiste es el que paga.";
        if (datos.promociones > 0) {
            mensaje += " Se quitarán " + plural(datos.promociones, "promoción", "promociones") + " de todo el documento" +
                       (datos.flete ? ", incluido el descuento de flete de provincia, que no vuelve a aplicarse solo." : ".");
        }
        mensaje += " Podrás volver a ajustarlo después.";

        CDK.modal.confirmar({ titulo: "¿Aplicar el ajuste?", mensaje: mensaje, confirmar: "Aplicar ajuste" })
            .then(function (si) { if (si) aplicar(lineas); });
    }

    function ocupado(si) {
        enCurso = si;
        revisar();
    }

    function aplicar(lineas) {
        ocupado(true);

        A.directoAplicar(tipo, ndocu, lineas, observacion.value.trim())
            .then(function (r) {
                resultado = r;
                CDK.toast("Ajuste aplicado.", "exito");
                enCurso = false;
                cargar();
            })
            .catch(fallo);
    }

    /**
     * Lo que sale mal al aplicar o asignar. Cuatro casos dicen que la pantalla ya no esta al dia —el documento
     * avanzo, entro en ajuste o el costo se borro— y se vuelve a pedir; si ya no es suyo, no existe para el; el
     * resto se corrige aqui, con el mensaje del backend.
     */
    function fallo(err) {
        ocupado(false);

        if (CDK.http.esError(err) && err.status === 401) return;
        var estado = M.statusDe(err);
        if (estado === "no identificado") return pintarSinAlta();
        if (estado === "documento desconocido") return pintarNoExiste(err);

        var desfasada = ["documento no ajustable", "documento no asignable", "documento en ajuste", "costo desconocido"]
            .indexOf(estado) !== -1;
        CDK.toast(M.mensajeError(err), desfasada ? "aviso" : "error", 6000);
        if (desfasada) { resultado = null; cargar(); }
    }

    /* ===============================================================
     * Asignar
     * ============================================================= */
    function seccionDeAsignar() {
        var buscar = el("input", { type: "search", id: "asignar-buscar", clase: "cdk-entrada", autocomplete: "off",
                                   placeholder: "Nombre o código del vendedor", "aria-label": "Buscar vendedor" });
        var lista = el("div", { id: "asignar-lista", style: "margin-top:10px" });
        var elegidoTexto = el("p", { clase: "cdk-pista", id: "asignar-elegido", style: "margin:10px 0 0",
                                     texto: "Elige a quién se lo pasas." });

        botonAsignar = el("button", { type: "button", id: "documento-asignar-boton", clase: "cdk-boton cdk-boton--primario",
                                      texto: "Asignar" });
        botonAsignar.disabled = true;
        botonAsignar.addEventListener("click", pedirAsignar);

        var espera = null;
        buscar.addEventListener("input", function () {
            clearTimeout(espera);
            espera = setTimeout(function () { cargarVendedores(buscar.value.trim()); }, 300);
        });

        function cargarVendedores(pista) {
            var esta = ++vezVendedores;
            CDK.estados.cargando(lista, "Buscando vendedores…");

            A.directoVendedores(pista)
                .then(function (r) {
                    if (esta !== vezVendedores) return;
                    pintarVendedores(r, pista);
                })
                .catch(function (err) {
                    if (esta !== vezVendedores) return;
                    if (CDK.http.esError(err) && err.status === 401) return;
                    CDK.estados.error(lista, err, function () { cargarVendedores(pista); });
                });
        }

        function pintarVendedores(r, pista) {
            lista.innerHTML = "";
            if (!r.vendedores.length) {
                CDK.estados.vacio(lista, pista ? "Ningún vendedor del grupo 20 coincide con «" + pista + "»." : "No hay vendedores activos.");
                return;
            }

            var ul = el("ul", { clase: "cdk-articulos", id: "asignar-vendedores" });
            r.vendedores.forEach(function (v) {
                var b = el("button", { type: "button", clase: "cdk-articulo cdk-articulo--pulsable", "data-codven": v.codven,
                                       "aria-pressed": elegido && elegido.codven === v.codven ? "true" : "false" }, [
                    el("div", { clase: "cdk-articulo__cuerpo" }, [
                        el("div", { clase: "cdk-articulo__nombre", texto: v.nombre }),
                        el("div", { clase: "cdk-articulo__detalle",
                                    texto: v.codven + (v.tipo ? " · " + v.tipo.charAt(0) + v.tipo.slice(1).toLowerCase() : "") })
                    ])
                ]);
                b.addEventListener("click", function () { elegir(v); });
                ul.appendChild(el("li", {}, [b]));
            });
            lista.appendChild(ul);

            if (r.hayMas) {
                lista.appendChild(el("p", { clase: "cdk-pista", id: "asignar-hay-mas", style: "margin:8px 0 0",
                                            texto: "Hay más vendedores: escribe más del nombre para encontrarlo." }));
            }
        }

        function elegir(v) {
            elegido = v;
            [].forEach.call(lista.querySelectorAll("[data-codven]"), function (b) {
                var si = b.getAttribute("data-codven") === v.codven;
                b.setAttribute("aria-pressed", si ? "true" : "false");
                b.classList.toggle("es-activa", si);
            });
            elegidoTexto.textContent = "Lo pasarás a " + v.nombre + " (" + v.codven + ").";
            botonAsignar.textContent = "Asignar a " + v.nombre;
            revisar();
        }

        sinAplicar = el("div", { clase: "cdk-aviso", id: "asignar-sin-aplicar", style: "margin:0 0 10px" }, [
            el("p", { clase: "cdk-aviso__texto", style: "flex:1;min-width:0" })
        ]);
        sinAplicar.style.display = "none";       // .cdk-aviso es flex: `hidden` no lo ocultaria

        cargarVendedores("");
        revisar();

        /* El orden importa: ajustar despues de asignar ya no se puede, porque el documento deja de ser suyo. */
        var sub = "Pasa el documento a un vendedor del grupo 20, lo hayas ajustado o no. Desde ese momento es suyo: " +
                  "lo ve en sus listas y, si se factura, cuenta para su cuota. Tú lo verás en «Asignados».";
        var orden = tarjetas.length
            ? el("p", { clase: "cdk-pista", id: "asignar-orden", style: "margin:0 0 10px",
                        texto: "Si vas a ajustar el precio, aplícalo antes de asignar: después ya no podrás." })
            : null;

        return el("section", { clase: "cdk-seccion", id: "documento-seccion-asignar" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Asignar a un vendedor" }),
            el("p", { clase: "cdk-seccion__sub", texto: sub }),
            orden,
            sinAplicar,
            el("div", { clase: "cdk-campo" }, [buscar]),
            lista,
            elegidoTexto,
            el("div", { clase: "cdk-acciones-fila", style: "margin-top:12px" }, [botonAsignar])
        ]);
    }

    function pedirAsignar() {
        if (enCurso || !elegido) return;
        var v = elegido;
        var esCotizacion = tipo === "COT";

        var mensaje = "Vas a pasar " + (esCotizacion ? "la cotización " : "el pedido ") + datos.ndocu + " a " + v.nombre +
                      ". Desde ese momento es " + (esCotizacion ? "suya" : "suyo") + " y ya no " + (esCotizacion ? "la" : "lo") +
                      " verás en «Mis documentos». No se puede deshacer desde la intranet.";
        /* El precio ajustado no se protege: si el vendedor modifica la cotizacion, vuelve al de lista (contrato, seccion 1). */
        if (esCotizacion && datos.documento.situacion === "sin aprobar" && datos.ajustes && datos.ajustes.length) {
            mensaje += " Si la modifica, su pantalla vuelve al precio de lista y el precio que ajustaste se pierde.";
        }
        if (activas().length) mensaje += " Los precios que marcaste y no aplicaste no se guardan.";

        CDK.modal.confirmar({ titulo: "¿Asignar a " + v.nombre + "?", mensaje: mensaje, confirmar: "Asignar" })
            .then(function (si) { if (si) asignar(v); });
    }

    function asignar(v) {
        ocupado(true);

        A.directoAsignar(tipo, ndocu, v.codven)
            .then(function (r) {
                enCurso = false;
                CDK.toast("Asignado a " + ((r && r.vendedor && r.vendedor.nombre) || v.nombre) + ".", "exito");
                pintarAsignado(r || {}, v);
            })
            .catch(fallo);
    }

    /** Ya no es suyo: no hay nada mas que hacer aqui. Se dice a quien y donde lo encuentra. */
    function pintarAsignado(r, v) {
        var vendedor = r.vendedor || { codven: v.codven, nombre: v.nombre };
        var monedaDe = r.moneda || moneda();

        destino.innerHTML = "";
        destino.appendChild(el("section", { clase: "cdk-seccion", id: "documento-asignado" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: nombreDelTipo() + " " + (r.ndocu || ndocu) + " asignado" }),
            el("p", { clase: "cdk-seccion__sub", id: "documento-asignado-a",
                      texto: "Ahora es de " + vendedor.nombre + " (" + vendedor.codven + "): lo ve en sus listas como suyo." }),
            el("div", { clase: "cdk-articulo__datos", style: "margin-top:8px" }, [
                dato("", r.cliente || datos.documento.cliente),
                dato("Total", A.dinero(r.totalConIgv !== undefined ? r.totalConIgv : datos.documento.totalConIgv, monedaDe) + " con IGV")
            ]),
            el("div", { clase: "cdk-acciones-fila", style: "margin-top:14px" }, [
                el("a", { href: CDK.rutas.app("/ajuste/ajuste_asignados.html"), id: "documento-ir-asignados",
                          clase: "cdk-boton cdk-boton--primario", texto: "Ver asignados" }),
                el("a", { href: CDK.rutas.app("/ajuste/ajuste_directo.html") + "?tipo=" + encodeURIComponent(tipo),
                          clase: "cdk-boton cdk-boton--suave", texto: "Volver a Mis documentos" })
            ])
        ]));
    }

    /* ===============================================================
     * Historial
     * ============================================================= */
    function seccionDeHistorial() {
        var ul = el("ul", { clase: "cdk-articulos", id: "documento-historial" });

        datos.ajustes.forEach(function (j) {
            var hijos = [
                el("div", { clase: "cdk-articulo__nombre",
                            texto: CDK.formato.fecha(j.fecreg, "conHora") + (j.ajusta && j.ajusta.nombre ? " · " + j.ajusta.nombre : "") })
            ];
            if (j.observacion) hijos.push(el("div", { clase: "cdk-articulo__detalle", texto: "«" + j.observacion + "»" }));

            (j.lineas || []).forEach(function (l) {
                hijos.push(el("p", { clase: "cdk-pista", style: "margin:6px 0 0;overflow-wrap:anywhere",
                                     texto: l.descripcion + ": " + l.antes.cantidad + " × " + dinero(l.antes.precio) +
                                            (l.antes.dsct ? " − " + CDK.formato.porcentaje(l.antes.dsct, 1) : "") +
                                            "  →  " + dinero(l.despues.precio) + " sin descuento" }));
            });

            var pie = "Total con IGV " + dinero(j.totalConIgvAntes) + " → " + dinero(j.totalConIgvDespues);
            if (j.promocionesQuitadas) pie += " · se quitaron " + plural(j.promocionesQuitadas, "promoción", "promociones");
            hijos.push(el("p", { clase: "cdk-pista", style: "margin:6px 0 0", texto: pie + "." }));

            ul.appendChild(el("li", { clase: "cdk-articulo", "data-ajuste": j.id }, [
                el("div", { clase: "cdk-articulo__cuerpo" }, hijos)
            ]));
        });

        return el("section", { clase: "cdk-seccion", id: "documento-seccion-historial" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Ajustes anteriores" }),
            el("p", { clase: "cdk-seccion__sub", texto: plural(datos.ajustes.length, "ajuste", "ajustes") + ", el más reciente primero." }),
            ul
        ]);
    }

})(window);
