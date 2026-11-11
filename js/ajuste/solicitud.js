/**
 * Ajustar una solicitud (grupo 25): ver las lineas que le tocan, poner los
 * precios nuevos y confirmar, o devolverla con una observacion.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona ve:
 *
 *   · **Al confirmar, en cada linea ajustada el descuento del cliente pasa a 0.**
 *     El precio que se escribe es lo que paga el cliente. Por eso el margen se
 *     calcula sin descuento, y por eso la pantalla dice lo que paga hoy.
 *   · **Se quitan TODAS las promociones del documento**, tambien las de otras
 *     marcas. Se avisa antes, con cuantas son.
 *   · **El precio no puede quedar por debajo de `precioMinimo`**, y se redondea al centimo
 *     ANTES de validar. Una linea sin costo (`costo` en null) se ve sin controles.
 *   · En un pedido solo se cambia el precio; en una cotizacion, tambien la cantidad.
 *   · Las lineas que no se tocan no se mandan, y se quedan como estaban.
 *
 * Las cuentas (redondeo, minimo, % sobre costo) y la tarjeta de cada linea son de
 * js/ajuste/precio.js, que comparte con «Mis documentos» (ajuste_documento): una sola copia
 * para que las dos pantallas redondeen y validen igual que el backend.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste;
    var M = CDK.marcas;              // statusDe(), mensajeError()

    var destino = document.getElementById("contenido");
    if (!destino) return;

    var id = new URLSearchParams(location.search).get("id");

    var datos = null;                // la solicitud, tal como la dijo el backend
    var tarjetas = [];               // una por linea, mientras se puede ajustar
    var resultado = null;            // lo que respondio confirmar, para decirlo arriba
    var enCurso = false;

    var botonConfirmar = null;
    var botonRechazar = null;
    var resumen = null;
    var observacion = null;
    var errorObservacion = null;

    if (!id) pintarNoExiste(null);
    else cargar();

    /* Las cuentas y la tarjeta de precio son de js/ajuste/precio.js: las comparte con «Mis documentos». */
    function dinero(v) { return A.dinero(v, datos.documento.moneda); }

    /* ===============================================================
     * Datos
     * ============================================================= */
    function cargar() {
        CDK.estados.cargando(destino, "Cargando la solicitud…");

        A.solicitud(id)
            .then(function (d) {
                datos = d;
                pintar();
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;           // ya redirige
                var estado = M.statusDe(err);

                if (estado === "no identificado") return pintarSinAlta();
                if (estado === "solicitud desconocida") return pintarNoExiste(err);

                CDK.estados.error(destino, err, cargar);
            });
    }

    function volver() {
        return el("a", { href: CDK.rutas.app("/ajuste/ajuste_recibidas.html"), id: "ajuste-volver",
                         clase: "cdk-enlace-accion", style: "display:inline-block;margin:0 0 12px",
                         texto: "← Ajustes recibidos" });
    }

    function pintarNoExiste(err) {
        destino.innerHTML = "";
        destino.appendChild(volver());
        destino.appendChild(el("section", { clase: "cdk-seccion", id: "ajuste-no-existe" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "No encontramos esa solicitud" }),
            el("p", { clase: "cdk-seccion__sub", texto: err ? M.mensajeError(err) : "Falta indicar qué solicitud abrir." })
        ]));
    }

    function pintarSinAlta() {
        destino.innerHTML = "";
        destino.appendChild(el("section", { clase: "cdk-seccion", id: "ajuste-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para responder solicitudes de ajuste primero tienes que completar tu registro en la intranet." }),
            el("a", { href: CDK.rutas.registro(), clase: "cdk-boton cdk-boton--primario", texto: "Completar mi registro" })
        ]));
    }

    /* ===============================================================
     * Pintado
     * ============================================================= */
    function pintar() {
        destino.innerHTML = "";
        tarjetas = [];

        destino.appendChild(volver());
        destino.appendChild(cabecera());
        if (resultado) destino.appendChild(avisoDeResultado());

        if (datos.puedoAjustar) destino.appendChild(avisos());
        destino.appendChild(seccionDeLineas());
        if (datos.puedoAjustar) destino.appendChild(seccionDeRespuesta());
    }

    /** Que le pasa a la solicitud, dicho para quien la mira. */
    function textoDeEstado() {
        var d = datos;

        if (d.estado === "PENDIENTE" && !d.puedoAjustar) {
            return "El documento ya avanzó (aprobado, facturado o anulado): ya no se puede ajustar.";
        }
        /* Sin punto final: la hora sale como «09:40 a. m.» y quedaria un punto doble. */
        if (d.estado === "PENDIENTE") return "Pendiente: vence el " + CDK.formato.fecha(d.vence, "conHora");
        if (d.estado === "CONFIRMADA") return "Confirmada: el ajuste ya está en el documento.";
        if (d.estado === "RECHAZADA") return "Rechazada: el documento no cambió.";
        if (d.estado === "VENCIDA") return "Venció: pasaron 3 días sin respuesta.";
        if (d.estado === "CERRADA") return "Cerrada: el documento avanzó antes de que se respondiera.";
        return A.estado(d.estado).texto;
    }

    function cabecera() {
        var d = datos;
        var doc = d.documento;
        var estado = A.estado(d.estado);

        var hijos = [
            el("h2", { clase: "cdk-seccion__titulo", id: "ajuste-titulo",
                       texto: A.tipoNombre(d.tipo) + " " + d.ndocu }),
            el("p", { clase: "cdk-seccion__sub", style: "margin-bottom:8px", id: "ajuste-cliente", texto: doc.cliente }),
            el("div", { clase: "cdk-articulo__datos" }, [
                dato("De", d.envia ? d.envia.nombre : "—"),
                dato("Fecha", CDK.formato.fecha(doc.fecha)),
                dato("Moneda", doc.moneda === "S" ? "Soles" : "Dólares"),
                dato("", estado.texto, estado.tono)
            ]),
            el("p", { clase: "cdk-pista", id: "ajuste-estado", style: "margin:10px 0 0", texto: textoDeEstado() })
        ];

        if (d.mensaje) {
            hijos.push(el("p", { clase: "cdk-pista", id: "ajuste-mensaje", style: "margin:8px 0 0",
                                 texto: "El vendedor escribió: «" + d.mensaje + "»" }));
        }
        if (d.observacion) {
            hijos.push(el("p", { clase: "cdk-pista", id: "ajuste-observacion-previa", style: "margin:8px 0 0",
                                 texto: "Tu observación: «" + d.observacion + "»" }));
        }

        return el("section", { clase: "cdk-seccion", id: "ajuste-cabecera" }, hijos);
    }

    function dato(etiqueta, valor, tono) {
        return el("span", { clase: "cdk-dato" + (tono ? " cdk-dato--" + tono : "") }, [
            document.createTextNode(etiqueta ? etiqueta + " " : ""),
            el("span", { clase: "cdk-dato__valor", texto: String(valor) })
        ]);
    }

    /** Lo que confirmar respondio: los totales nuevos de TODO el documento y las promociones que se fueron. */
    function avisoDeResultado() {
        var t = resultado.totales || {};
        var hijos = [el("p", { clase: "cdk-aviso__texto", texto: "Ajuste confirmado." })];

        if (resultado.promocionesQuitadas) {
            hijos.push(el("p", { clase: "cdk-pista", id: "ajuste-promos-quitadas",
                                 texto: "Se quitaron " + plural(resultado.promocionesQuitadas, "promoción", "promociones") +
                                        " del documento." }));
        }
        if (t.totn !== undefined) {
            hijos.push(el("p", { clase: "cdk-pista", id: "ajuste-totales", style: "margin-top:4px",
                                 texto: "Total del documento: " + dinero(t.tota) + " sin IGV · " +
                                        dinero(t.toti) + " de IGV · " + dinero(t.totn) + " con IGV." }));
        }

        return el("div", { clase: "cdk-aviso", id: "ajuste-resultado", style: "margin-bottom:14px" }, [
            el("div", { style: "flex:1;min-width:0" }, hijos)
        ]);
    }

    function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

    /** Lo que hay que saber ANTES de ajustar: lo que se pierde y lo que no se toca. */
    function avisos() {
        var d = datos;
        var lineas = [];

        if (d.promociones > 0) {
            lineas.push(["ajuste-aviso-promos",
                "Al confirmar se quitan TODAS las promociones del documento, también las de otras marcas: tiene " +
                plural(d.promociones, "promoción", "promociones") + "."]);
        }
        if (d.otrasLineas > 0) {
            lineas.push(["ajuste-aviso-otras",
                "El documento tiene " + plural(d.otrasLineas, "línea", "líneas") +
                " de otras marcas: no las puedes tocar."]);
        }
        if (!d.cantidadAjustable) {
            lineas.push(["ajuste-aviso-pedido", "En un pedido solo se cambia el precio, no la cantidad."]);
        }
        lineas.push(["ajuste-aviso-erp", "El precio del producto en el ERP no cambia: el ajuste es solo de esta venta."]);

        return el("div", { clase: "cdk-aviso", id: "ajuste-avisos", style: "margin-bottom:14px" }, [
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
        var ul = el("ul", { clase: "cdk-articulos", id: "ajuste-lineas" });

        d.lineas.forEach(function (l) {
            if (!d.puedoAjustar) return ul.appendChild(tarjetaDeLectura(l));
            /* Sin costo no hay minimo contra el que validar: el backend la rechazaria. Se ve, sin controles. */
            if (A.sinCosto(l)) return ul.appendChild(A.tarjetaSinCosto(l, d.documento.moneda));

            var t = A.tarjetaDePrecio(l, { moneda: d.documento.moneda, cantidad: !!d.cantidadAjustable, alCambiar: revisar });
            tarjetas.push(t);
            ul.appendChild(t.nodo);
        });

        return el("section", { clase: "cdk-seccion", id: "ajuste-seccion-lineas" }, [
            el("h2", { clase: "cdk-seccion__titulo",
                       texto: d.puedoAjustar ? "Tus líneas" : "Las líneas de esta solicitud" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: d.puedoAjustar
                          ? "Marca las que quieres ajustar. Las demás se quedan como están."
                          : plural(d.lineas.length, "línea", "líneas") + " de tus marcas." }),
            ul
        ]);
    }

    /** Una linea que ya no se puede ajustar: lo que quedo, si se ajusto. */
    function tarjetaDeLectura(l) {
        var hijos = A.datosDeLinea(l, datos.documento.moneda);
        var j = l.ajuste;

        hijos.push(el("p", { clase: "cdk-pista", id: "linea-" + l.item + "-ajuste", style: "margin:10px 0 0",
            texto: j
                ? "Ajustada: " + l.enviado.cantidad + " × " + dinero(l.enviado.precio) +
                  (l.enviado.dsct ? " − " + CDK.formato.porcentaje(l.enviado.dsct, 1) : "") +
                  "  →  " + j.cantidad + " × " + dinero(j.precio) + " sin descuento"
                : "Sin ajuste." }));

        return el("li", { clase: "cdk-articulo", id: "linea-" + l.item }, [
            el("div", { clase: "cdk-articulo__cuerpo" }, hijos)
        ]);
    }

    /* ===============================================================
     * Responder
     * ============================================================= */
    function seccionDeRespuesta() {
        observacion = el("textarea", {
            id: "ajuste-observacion", clase: "cdk-entrada", rows: "3", maxlength: "300",
            placeholder: "Opcional al confirmar; obligatoria al rechazar", "aria-label": "Observación"
        });
        observacion.addEventListener("input", function () {
            errorObservacion.classList.add("hidden");
        });

        errorObservacion = el("p", { clase: "cdk-campo__error", id: "ajuste-observacion-error", style: "margin:6px 0 0" });
        errorObservacion.classList.add("hidden");

        resumen = el("p", { clase: "cdk-pista", id: "ajuste-resumen", style: "margin:12px 0 0" });

        botonConfirmar = el("button", { type: "button", id: "ajuste-confirmar", clase: "cdk-boton cdk-boton--primario",
                                        texto: "Confirmar ajuste" });
        botonRechazar = el("button", { type: "button", id: "ajuste-rechazar", clase: "cdk-boton cdk-boton--peligro",
                                       texto: "Rechazar" });

        botonConfirmar.addEventListener("click", pedirConfirmacion);
        botonRechazar.addEventListener("click", pedirRechazo);

        revisar();

        return el("section", { clase: "cdk-seccion", id: "ajuste-respuesta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Tu respuesta" }),
            el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "ajuste-observacion", texto: "Observación para el vendedor" }),
                observacion, errorObservacion
            ]),
            resumen,
            el("div", { clase: "cdk-acciones-fila", style: "margin-top:12px" }, [botonConfirmar, botonRechazar])
        ]);
    }

    function activas() {
        return tarjetas.filter(function (t) { return t.activa; });
    }

    /** Habilita confirmar solo con algo que ajustar y todo bien; lo dice en una linea. */
    function revisar() {
        if (!botonConfirmar) return;

        var elegidas = activas();
        var malas = elegidas.filter(function (t) { return !t.valida; });

        botonConfirmar.disabled = enCurso || !elegidas.length || malas.length > 0;
        botonRechazar.disabled = enCurso;

        if (!tarjetas.length) {
            /* Todas sus lineas llegaron sin costo: no hay ninguna que marcar. */
            resumen.textContent = "Ninguna línea se puede ajustar: no tienen costo cargado. Si no hay nada que ajustar, rechaza la solicitud.";
        } else if (!elegidas.length) {
            resumen.textContent = "Marca las líneas que quieres ajustar. Si no hay nada que ajustar, rechaza la solicitud.";
        } else if (malas.length) {
            resumen.textContent = "Corrige el precio de " + plural(malas.length, "línea", "líneas") + " para poder confirmar.";
        } else {
            resumen.textContent = "Vas a ajustar " + elegidas.length + " de " + plural(tarjetas.length, "línea", "líneas") + ".";
        }
    }

    function lineasAjustadas() {
        return activas().map(function (t) {
            var o = { item: t.item, precio: t.precio() };
            /* La cantidad solo viaja si cambio, y solo en cotizaciones. */
            if (datos.cantidadAjustable && t.cantidad() !== t.linea.actual.cantidad) o.cantidad = t.cantidad();
            return o;
        });
    }

    function pedirConfirmacion() {
        if (enCurso || botonConfirmar.disabled) return;

        var lineas = lineasAjustadas();
        var mensaje = "Vas a ajustar " + plural(lineas.length, "línea", "líneas") + ". En ellas el descuento pasa a 0 y el " +
                      "precio que pusiste es el que paga el cliente.";
        if (datos.promociones > 0) {
            mensaje += " Se quitarán " + plural(datos.promociones, "promoción", "promociones") + " de todo el documento.";
        }
        mensaje += " Después no podrás volver a tocar esta solicitud.";

        CDK.modal.confirmar({ titulo: "¿Confirmar el ajuste?", mensaje: mensaje, confirmar: "Confirmar ajuste" })
            .then(function (si) { if (si) confirmar(lineas); });
    }

    function pedirRechazo() {
        if (enCurso) return;

        var texto = observacion.value.trim();
        if (!texto) {
            errorObservacion.textContent = "Escribe por qué la rechazas: el vendedor lo va a leer.";
            errorObservacion.classList.remove("hidden");
            observacion.focus();
            return;
        }

        CDK.modal.confirmar({
            titulo: "¿Rechazar la solicitud?",
            mensaje: "El documento no cambia y el vendedor verá tu observación. Después no podrás volver a tocar esta solicitud.",
            confirmar: "Rechazar", peligro: true
        }).then(function (si) { if (si) rechazar(texto); });
    }

    function ocupado(si) {
        enCurso = si;
        revisar();
    }

    function confirmar(lineas) {
        ocupado(true);

        A.confirmar(datos.id, lineas, observacion.value.trim())
            .then(function (r) {
                resultado = r;
                CDK.toast("Ajuste confirmado.", "exito");
                enCurso = false;
                menuAlDia();
                cargar();
            })
            .catch(fallo);
    }

    function rechazar(texto) {
        ocupado(true);

        A.rechazar(datos.id, texto)
            .then(function () {
                resultado = null;
                CDK.toast("Solicitud rechazada.", "exito");
                enCurso = false;
                menuAlDia();
                cargar();
            })
            .catch(fallo);
    }

    /**
     * Lo que sale mal al responder. Dos casos dicen que la pantalla ya no esta al dia
     * —alguien respondio antes, o el documento avanzo— y se vuelve a pedir todo; el
     * resto se corrige aqui, con el mensaje del backend.
     */
    function fallo(err) {
        ocupado(false);

        if (CDK.http.esError(err) && err.status === 401) return;
        var estado = M.statusDe(err);
        if (estado === "no identificado") return pintarSinAlta();

        /* `costo desconocido`: el costo se borro despues de abrirla; al volver a pedirla esa linea llega sin controles. */
        var desfasada = estado === "solicitud cerrada" || estado === "documento no ajustable" || estado === "costo desconocido";
        CDK.toast(M.mensajeError(err), desfasada ? "aviso" : "error", 6000);
        if (desfasada) { menuAlDia(); cargar(); }
    }

    /** Una pendiente menos: el numerito del menu se actualiza ahora, no en la siguiente pagina. */
    function menuAlDia() {
        if (CDK.shell && CDK.shell.actualizarMenu) CDK.shell.actualizarMenu();
    }

})(window);
