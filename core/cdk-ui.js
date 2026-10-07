/**
 * cdk-ui.js — Toast, modal y estados de contenido.
 *
 * Reemplaza lo que hoy esta repetido:
 *   · 4 sistemas de toast incompatibles
 *   · 9+ implementaciones de modal, ninguna con Escape, foco atrapado ni aria-modal
 *   · 6 spinners distintos
 *   · showLoader / showEmpty / showError triplicados en js/listas/
 *
 * Todo se construye con clases propias de cdk-shell.css, no con Tailwind: el CDN
 * genera reglas en runtime escaneando el DOM, asi que el markup inyectado por JS
 * se veria sin estilo durante varios frames.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var el = CDK.el;

    function svg(path, clase) {
        var ns = "http://www.w3.org/2000/svg";
        var nodo = document.createElementNS(ns, "svg");
        nodo.setAttribute("viewBox", "0 0 24 24");
        nodo.setAttribute("fill", "none");
        nodo.setAttribute("stroke", "currentColor");
        nodo.setAttribute("stroke-width", "1.5");
        nodo.setAttribute("stroke-linecap", "round");
        nodo.setAttribute("stroke-linejoin", "round");
        nodo.setAttribute("aria-hidden", "true");
        if (clase) nodo.setAttribute("class", clase);

        var d = document.createElementNS(ns, "path");
        d.setAttribute("d", path);
        nodo.appendChild(d);

        return nodo;
    }

    CDK.svg = svg;

    /**
     * Parte un texto en nodos resaltando lo que coincide con lo buscado.
     * Útil en listas de resultados parecidos entre sí, donde lo que distingue
     * a uno de otro es justo la parte que se tecleó.
     *
     * Devuelve nodos, no HTML: el texto viene del backend y nunca se interpreta.
     */
    CDK.resaltar = function (texto, termino) {
        var cadena = String(texto === null || texto === undefined ? "" : texto);
        var aguja = String(termino || "").trim();

        if (!aguja) return [document.createTextNode(cadena)];

        var pos = cadena.toUpperCase().indexOf(aguja.toUpperCase());
        if (pos === -1) return [document.createTextNode(cadena)];

        return [
            document.createTextNode(cadena.slice(0, pos)),
            el("mark", { clase: "cdk-marca", texto: cadena.slice(pos, pos + aguja.length) }),
            document.createTextNode(cadena.slice(pos + aguja.length))
        ];
    };

    /* ===============================================================
     * TOAST
     * ============================================================= */
    var ICONOS_TOAST = {
        exito:  "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
        error:  "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z",
        aviso:  "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z",
        info:   "m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
    };

    function contenedorToast() {
        var c = document.getElementById("cdk-toasts");
        if (!c) {
            c = el("div", { id: "cdk-toasts", clase: "cdk-toasts", "aria-live": "polite", "aria-atomic": "false" });
            document.body.appendChild(c);
        }
        return c;
    }

    /**
     * CDK.toast("Cotización creada", "exito")
     * Duracion 0 = permanece hasta cerrarlo. Devuelve el nodo, con .cerrar().
     */
    CDK.toast = function (mensaje, tipo, duracion) {
        tipo = ICONOS_TOAST[tipo] ? tipo : "info";
        var ms = duracion === undefined ? 4000 : duracion;

        var cerrarBtn = el("button", {
            clase: "cdk-toast__cerrar",
            type: "button",
            "aria-label": "Cerrar aviso"
        }, [svg(CDK.catalogo.iconos.cerrar, "cdk-icono cdk-icono--sm")]);

        var nodo = el("div", {
            clase: "cdk-toast cdk-toast--" + tipo,
            role: tipo === "error" ? "alert" : "status"
        }, [
            svg(ICONOS_TOAST[tipo], "cdk-icono cdk-toast__icono"),
            el("p", { clase: "cdk-toast__texto", texto: mensaje }),
            cerrarBtn
        ]);

        var reloj = null;

        function cerrar() {
            if (reloj) clearTimeout(reloj);
            nodo.classList.add("cdk-toast--saliendo");
            setTimeout(function () { nodo.remove(); }, 200);
        }

        cerrarBtn.addEventListener("click", cerrar);
        nodo.cerrar = cerrar;

        contenedorToast().appendChild(nodo);
        if (ms > 0) reloj = setTimeout(cerrar, ms);

        return nodo;
    };

    /* ===============================================================
     * MODAL
     * ============================================================= */
    var SELECTOR_FOCO = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function abrirModal(config) {
        return new Promise(function (resolver) {
            var focoPrevio = document.activeElement;
            var resuelto = false;

            function terminar(valor) {
                if (resuelto) return;
                resuelto = true;

                document.removeEventListener("keydown", enTecla, true);
                capa.remove();
                document.body.classList.remove("cdk-sin-scroll");

                // Devolver el foco a donde estaba: sin esto, quien navega con
                // teclado vuelve al principio del documento al cerrar.
                if (focoPrevio && focoPrevio.focus) focoPrevio.focus();

                resolver(valor);
            }

            function enTecla(ev) {
                if (ev.key === "Escape") {
                    ev.stopPropagation();
                    terminar(false);
                    return;
                }

                // Foco atrapado dentro del dialogo.
                if (ev.key !== "Tab") return;

                var focos = Array.prototype.filter.call(
                    dialogo.querySelectorAll(SELECTOR_FOCO),
                    function (n) { return n.offsetParent !== null; }
                );
                if (!focos.length) return;

                var primero = focos[0];
                var ultimo = focos[focos.length - 1];

                if (ev.shiftKey && document.activeElement === primero) {
                    ev.preventDefault(); ultimo.focus();
                } else if (!ev.shiftKey && document.activeElement === ultimo) {
                    ev.preventDefault(); primero.focus();
                }
            }

            var acciones = [];

            if (config.cancelar !== null) {
                var btnCancelar = el("button", {
                    type: "button",
                    clase: "cdk-boton cdk-boton--suave",
                    texto: config.cancelar || "Cancelar"
                });
                btnCancelar.addEventListener("click", function () { terminar(false); });
                acciones.push(btnCancelar);
            }

            var btnConfirmar = el("button", {
                type: "button",
                clase: "cdk-boton " + (config.peligro ? "cdk-boton--peligro" : "cdk-boton--primario"),
                texto: config.confirmar || "Aceptar"
            });
            btnConfirmar.addEventListener("click", function () { terminar(true); });
            acciones.push(btnConfirmar);

            var dialogo = el("div", {
                clase: "cdk-modal__dialogo",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "cdk-modal-titulo"
            }, [
                el("h2", { id: "cdk-modal-titulo", clase: "cdk-modal__titulo", texto: config.titulo || "" }),
                el("p",  { clase: "cdk-modal__mensaje", texto: config.mensaje || "" }),
                el("div", { clase: "cdk-modal__acciones" }, acciones)
            ]);

            var capa = el("div", { clase: "cdk-modal" }, [
                el("div", { clase: "cdk-modal__fondo" }),
                dialogo
            ]);

            capa.querySelector(".cdk-modal__fondo").addEventListener("click", function () {
                if (config.cancelar !== null) terminar(false);
            });

            document.body.appendChild(capa);
            document.body.classList.add("cdk-sin-scroll");
            document.addEventListener("keydown", enTecla, true);

            btnConfirmar.focus();
        });
    }

    CDK.modal = {
        /** Promesa que resuelve true si confirma, false si cancela o pulsa Escape. */
        confirmar: function (config) {
            return abrirModal(config || {});
        },

        /** Como confirmar, pero sin boton de cancelar. Resuelve siempre true. */
        alerta: function (config) {
            return abrirModal(Object.assign({}, config, { cancelar: null }));
        }
    };

    /* ===============================================================
     * LISTA DE ARTICULOS
     *
     * Una linea de producto de un documento. La comparten cotizacion,
     * pedido, factura y promociones, que hasta ahora la construian cada
     * una con su propio createElement.
     * ============================================================= */

    /**
     * CDK.articulo({
     *     codigo, nombre, detalle, importe,
     *     datos:    [{ etiqueta: "Cant.", valor: 3 }, …],
     *     acciones: [{ texto: "Remover", alPulsar: fn, peligro: true }, …]
     * })  ->  <li>
     */
    CDK.articulo = function (config) {
        config = config || {};

        // `nombre` y `detalle` aceptan texto o una lista de nodos, para poder
        // resaltar la parte que coincide con lo buscado.
        function contenido(clase, valor) {
            var nodo = el("div", { clase: clase });
            if (Array.isArray(valor)) valor.forEach(function (n) { if (n) nodo.appendChild(n); });
            else nodo.textContent = valor || "";
            return nodo;
        }

        var cabecera = el("div", { clase: "cdk-articulo__cabecera" }, [
            contenido("cdk-articulo__nombre", config.nombre),
            config.importe ? el("div", { clase: "cdk-articulo__importe", texto: config.importe }) : null
        ]);

        var cuerpo = [cabecera];

        if (config.detalle) {
            cuerpo.push(contenido("cdk-articulo__detalle", config.detalle));
        }

        if (config.datos && config.datos.length) {
            cuerpo.push(el("div", { clase: "cdk-articulo__datos" }, config.datos.map(function (d) {
                return el("span", { clase: "cdk-dato" + (d.tono ? " cdk-dato--" + d.tono : "") }, [
                    document.createTextNode(d.etiqueta + " "),
                    el("span", { clase: "cdk-dato__valor", texto: String(d.valor) })
                ]);
            })));
        }

        if (config.acciones && config.acciones.length) {
            cuerpo.push(el("div", { clase: "cdk-articulo__acciones" }, config.acciones.map(function (a) {
                var btn = el("button", {
                    type: "button",
                    clase: "cdk-enlace-accion" + (a.peligro ? " cdk-enlace-accion--peligro" : ""),
                    texto: a.texto
                });
                if (a.alPulsar) btn.addEventListener("click", a.alPulsar);
                return btn;
            })));
        }

        var partes = [
            config.distintivo
                ? el("span", { clase: "cdk-articulo__distintivo", texto: String(config.distintivo), title: config.distintivo })
                : null,
            el("div", { clase: "cdk-articulo__cuerpo" }, cuerpo)
        ];

        var clase = "cdk-articulo"
            + (config.variante ? " cdk-articulo--" + config.variante : "")
            + (config.alerta ? " cdk-articulo--alerta" : "");

        // Con `alPulsar` la fila entera es el objetivo, no un enlace pequeño
        // dentro de ella: en un móvil se acierta mucho mejor.
        if (config.alPulsar) {
            var boton = el("button", { type: "button", clase: clase + " cdk-articulo--pulsable" }, partes);
            boton.addEventListener("click", config.alPulsar);
            return el("li", {}, [boton]);
        }

        return el("li", { clase: clase }, partes);
    };

    /**
     * Cantidad: campo escribible con - y + a los lados.
     *
     * Los dos a la vez y no uno u otro a proposito. Con solo los botones,
     * pedir 40 unidades son 39 toques; con solo el campo, subir de 1 a 2 en un
     * movil obliga a abrir el teclado numerico y acertar en un cursor.
     *
     * CDK.contador({ valor: 1, min: 1, max: 500, alCambiar: function (n) {} })
     *
     * Devuelve el nodo, con .valor() para leer y .fijar(n) para escribir.
     */
    CDK.contador = function (config) {
        config = config || {};

        var min = config.min === undefined ? 1 : config.min;
        var max = config.max === undefined ? 999 : config.max;

        var campo = el("input", {
            type: "text",
            clase: "cdk-contador__campo",
            inputmode: "numeric",
            autocomplete: "off",
            "aria-label": config.etiqueta || "Cantidad",
            value: String(config.valor === undefined ? min : config.valor)
        });

        var menos = el("button", { type: "button", clase: "cdk-contador__boton",
                                   "aria-label": "Quitar uno", texto: "−" });
        var mas = el("button", { type: "button", clase: "cdk-contador__boton",
                                 "aria-label": "Agregar uno", texto: "+" });

        function leer() {
            var n = parseInt(campo.value, 10);
            return isFinite(n) ? n : min;
        }

        function avisar() {
            var n = leer();
            menos.disabled = n <= min;
            mas.disabled = n >= max;
            if (config.alCambiar) config.alCambiar(n);
        }

        function fijar(n) {
            campo.value = String(Math.min(Math.max(n, min), max));
            avisar();
        }

        /* Mientras teclea se deja pasar cualquier cifra y solo se limpia lo que
           no es un digito: acotar en cada pulsacion impide escribir "40", que
           pasa por "4" y por un instante parece fuera de rango. El acotado va
           al salir del campo. */
        campo.addEventListener("input", function () {
            var limpio = campo.value.replace(/[^\d]/g, "");
            if (limpio !== campo.value) campo.value = limpio;
            avisar();
        });

        campo.addEventListener("blur", function () { fijar(leer()); });

        menos.addEventListener("click", function () { fijar(leer() - 1); });
        mas.addEventListener("click", function () { fijar(leer() + 1); });

        var nodo = el("div", { clase: "cdk-contador" }, [menos, campo, mas]);
        nodo.valor = leer;
        nodo.fijar = fijar;
        nodo.campo = campo;

        avisar();
        return nodo;
    };

    /**
     * Desglose de importes.
     *
     * CDK.totales([
     *     { etiqueta: "Subtotal", valor: "$ 565.48" },
     *     { etiqueta: "IGV",      valor: "$ 101.78" },
     *     { etiqueta: "Total",    valor: "$ 667.26", principal: true }
     * ])
     */
    CDK.totales = function (filas) {
        return el("div", { clase: "cdk-totales" }, (filas || []).map(function (f) {
            return el("div", {
                clase: "cdk-total"
                    + (f.principal ? " cdk-total--principal" : "")
                    + (f.tono ? " cdk-total--" + f.tono : "")
            }, [
                el("span", { clase: "cdk-total__etiqueta", texto: f.etiqueta }),
                el("span", { clase: "cdk-total__valor", texto: f.valor })
            ]);
        }));
    };

    /* ===============================================================
     * MENU DE ACCIONES
     *
     * Atajo desde un documento a lo que se puede hacer con el, sin
     * volver al hub y teclear otra vez el numero.
     * ============================================================= */

    /**
     * CDK.menuAcciones({
     *     titulo: "¿Qué quieres hacer?",
     *     opciones: [{ texto, descripcion, href }  |  { texto, alPulsar }]
     * })
     */
    CDK.menuAcciones = function (config) {
        config = config || {};

        var existente = document.getElementById("cdk-acciones-menu");
        if (existente) existente.remove();

        var focoPrevio = document.activeElement;

        function cerrar() {
            hoja.remove();
            document.removeEventListener("keydown", enTecla, true);
            document.body.classList.remove("cdk-sin-scroll");
            if (focoPrevio && focoPrevio.focus) focoPrevio.focus();
        }

        function enTecla(ev) { if (ev.key === "Escape") cerrar(); }

        var lista = el("ul", { clase: "cdk-opciones" }, (config.opciones || []).map(function (op) {
            var contenido = [
                el("span", { clase: "cdk-opcion__texto", texto: op.texto }),
                op.descripcion ? el("span", { clase: "cdk-opcion__detalle", texto: op.descripcion }) : null
            ];

            var nodo;
            if (op.href) {
                nodo = el("a", { href: op.href, clase: "cdk-opcion" }, contenido);
            } else {
                nodo = el("button", { type: "button", clase: "cdk-opcion" }, contenido);
                nodo.addEventListener("click", function () { cerrar(); if (op.alPulsar) op.alPulsar(); });
            }

            return el("li", {}, [nodo]);
        }));

        var hoja = el("div", {
            clase: "cdk-hoja",
            id: "cdk-acciones-menu",
            role: "dialog",
            "aria-modal": "true",
            "aria-label": config.titulo || "Acciones"
        }, [
            el("div", { clase: "cdk-hoja__fondo" }),
            el("div", { clase: "cdk-hoja__panel" }, [
                el("div", { clase: "cdk-hoja__asa" }),
                el("h2", { clase: "cdk-hoja__titulo", texto: config.titulo || "Acciones" }),
                lista
            ])
        ]);

        hoja.querySelector(".cdk-hoja__fondo").addEventListener("click", cerrar);
        document.addEventListener("keydown", enTecla, true);
        document.body.appendChild(hoja);
        document.body.classList.add("cdk-sin-scroll");

        var primera = hoja.querySelector(".cdk-opcion");
        if (primera) primera.focus();

        return { cerrar: cerrar };
    };

    /* ===============================================================
     * ESTADOS DE CONTENIDO
     * ============================================================= */
    function resolver(contenedor) {
        return typeof contenedor === "string"
            ? document.getElementById(contenedor)
            : contenedor;
    }

    function pintar(contenedor, nodo) {
        var destino = resolver(contenedor);
        if (!destino) return null;
        destino.innerHTML = "";
        destino.appendChild(nodo);
        return destino;
    }

    CDK.estados = {
        cargando: function (contenedor, texto) {
            return pintar(contenedor, el("div", { clase: "cdk-estado", role: "status" }, [
                el("div", { clase: "cdk-spinner" }),
                el("p", { clase: "cdk-estado__texto", texto: texto || "Cargando…" })
            ]));
        },

        vacio: function (contenedor, texto, icono) {
            return pintar(contenedor, el("div", { clase: "cdk-estado" }, [
                svg(icono || CDK.catalogo.iconos.generico, "cdk-icono cdk-estado__icono"),
                el("p", { clase: "cdk-estado__texto", texto: texto || "No hay nada que mostrar" })
            ]));
        },

        /**
         * Muestra un error legible. Si se pasa `reintentar`, añade el boton.
         *
         * Existe para sustituir los `catch(err){console.log(err)}` repartidos por
         * el proyecto, que dejan al usuario ante una pantalla vacia sin explicacion.
         */
        error: function (contenedor, err, reintentar) {
            var mensaje = "Ocurrió un error inesperado.";
            var sirveReintentar = true;

            if (CDK.http.esError(err)) {
                /* El `msg` del backend manda sobre cualquier texto genérico.
                   Antes se miraba al final, después del código HTTP, y eso
                   tapaba mensajes escritos a propósito: un 403 mostraba "no
                   tienes permiso" en vez de "la cotización no existe o no
                   pertenece a este vendedor", que es justo lo que el vendedor
                   necesita leer para no llamar a sistemas. */
                if (err.datos && err.datos.msg) {
                    mensaje = err.datos.msg;
                }
                else if (err.status === 0)   mensaje = "No se pudo conectar con el servidor. Revisa tu conexión.";
                else if (err.status === 403) mensaje = "No tienes permiso para esta operación.";
                else if (err.status === 404) mensaje = "No se encontró lo que buscabas.";
                else if (err.status >= 500)  mensaje = "El servidor tuvo un problema. Intenta de nuevo en un momento.";

                /* Un 4xx dice que el problema está en lo que se pidió, no en el
                   servidor: insistir con lo mismo da lo mismo. Ofrecer el botón
                   sería invitar a pulsarlo en vano. El 408 y el 429 sí se
                   reintentan, que son los de "ahora no, prueba luego". */
                if (err.status >= 400 && err.status < 500 &&
                    err.status !== 408 && err.status !== 429) {
                    sirveReintentar = false;
                }
            } else if (typeof err === "string") {
                mensaje = err;
            }

            var hijos = [
                svg(ICONOS_TOAST.error, "cdk-icono cdk-estado__icono cdk-estado__icono--error"),
                el("p", { clase: "cdk-estado__texto", texto: mensaje })
            ];

            if (reintentar && sirveReintentar) {
                var btn = el("button", { type: "button", clase: "cdk-boton cdk-boton--primario", texto: "Reintentar" });
                btn.addEventListener("click", reintentar);
                hijos.push(btn);
            }

            if (err && err.stack) console.error("[CDK]", err);

            return pintar(contenedor, el("div", { clase: "cdk-estado", role: "alert" }, hijos));
        },

        limpiar: function (contenedor) {
            var destino = resolver(contenedor);
            if (destino) destino.innerHTML = "";
            return destino;
        }
    };

})(window);
