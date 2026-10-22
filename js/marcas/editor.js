/**
 * Editor del borrador de marcas.
 *
 * El borrador vive aquí, en la pantalla: el backend no guarda nada hasta que se
 * confirma. Quien lo use pide `codigos()` y los manda de una vez a
 * `CDK.marcas.confirmar`.
 *
 * Lo usan el registro y la pantalla del módulo, con la misma forma de elegir:
 * un buscador de marcas libres, la lista de lo elegido y, si se pide, el atajo
 * de mantener las del mes pasado.
 *
 *   var ed = CDK.marcas.editor({
 *       yaTiene:   [{ codmar: "0003" }],   // ya son suyas: no se ofrecen
 *       anterior:  true,                   // botón «mantener las del mes pasado»
 *       alCambiar: function (codigos) {},
 *       alSesionVencida: function () {}    // solo donde no hay armazón que redirija
 *   });
 *   destino.appendChild(ed.nodo);
 *   ed.codigos();   // ["0206", "0008"]
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var marcas = CDK.marcas = CDK.marcas || {};
    var el = CDK.el;

    /* Con una letra el backend devolvería casi todo el catálogo. Con dos ya
       acota, y un código de cuatro dígitos pasa siempre. */
    var MINIMO = 2;
    var ESPERA = 300;

    var LUPA = "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z";

    marcas.editor = function (config) {
        config = config || {};

        var suyas = {};                       // codmar -> true, ya son del usuario
        (config.yaTiene || []).forEach(function (m) { suyas[m.codmar] = true; });

        var borrador = [];                    // [{ codmar, abrmar, nombre, familia }]
        var ultimos = null;                   // última búsqueda pintada: [lista, texto]
        var ticket = 0;                       // descarta respuestas de búsquedas viejas
        var reloj = null;

        /* ===============================================================
         * Nodos
         * ============================================================= */
        var campo = el("input", {
            type: "search",
            id: "marcas-buscar",
            clase: "cdk-entrada",
            placeholder: "Nombre o código",
            autocomplete: "off",
            enterkeyhint: "search",
            "aria-describedby": "marcas-pista"
        });

        var pista = el("p", {
            id: "marcas-pista",
            clase: "cdk-pista",
            texto: "Escribe al menos " + MINIMO + " letras, o el código de 4 dígitos. " +
                   "Solo salen marcas que nadie tiene este mes."
        });

        var resultados = el("div", { id: "marcas-resultados", style: "margin-top:12px" });
        var listaBorrador = el("div", { id: "marcas-borrador" });
        var avisoAnterior = el("div", { id: "marcas-anterior-aviso" });

        var botonAnterior = null;
        if (config.anterior) {
            botonAnterior = el("button", {
                type: "button",
                id: "marcas-anterior",
                clase: "cdk-boton cdk-boton--suave",
                texto: "Mantener las del mes anterior"
            });
            botonAnterior.addEventListener("click", mantenerAnteriores);
        }

        var nodo = el("div", { clase: "cdk-marcas-editor" }, [
            el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "marcas-buscar",
                              texto: "Buscar marcas" }),
                el("div", { clase: "cdk-busca" }, [
                    CDK.svg(LUPA, "cdk-busca__lupa"),
                    campo
                ]),
                pista
            ]),
            resultados,
            el("h3", { clase: "cdk-seccion__titulo", style: "margin:20px 0 8px",
                       texto: "Tu lista" }),
            botonAnterior ? el("div", { style: "margin-bottom:12px" }, [botonAnterior]) : null,
            avisoAnterior,
            listaBorrador
        ]);

        /* ===============================================================
         * El borrador
         * ============================================================= */
        function esta(codmar) {
            return borrador.some(function (m) { return m.codmar === codmar; });
        }

        function avisar() {
            if (config.alCambiar) config.alCambiar(codigos());
        }

        function codigos() {
            return borrador.map(function (m) { return m.codmar; });
        }

        /** Mete una marca sin repintar. Devuelve false si no hacía falta. */
        function meter(m) {
            if (!m || !m.codmar || suyas[m.codmar] || esta(m.codmar)) return false;

            borrador.push({
                codmar: m.codmar,
                abrmar: m.abrmar,
                nombre: m.nombre,
                familia: m.familia || null
            });
            return true;
        }

        function pintarBorrador() {
            listaBorrador.innerHTML = "";

            if (!borrador.length) {
                listaBorrador.appendChild(el("p", {
                    clase: "cdk-pista", style: "margin:0",
                    texto: "Todavía no elegiste ninguna marca."
                }));
                return;
            }

            var lista = el("ul", { clase: "cdk-articulos" });
            borrador.forEach(function (m) {
                lista.appendChild(CDK.articulo({
                    distintivo: m.codmar,
                    nombre: marcas.nombre(m),
                    detalle: m.familia,
                    acciones: [{
                        texto: "Quitar", peligro: true,
                        alPulsar: function () { quitar(m.codmar); }
                    }]
                }));
            });
            listaBorrador.appendChild(lista);
        }

        function agregar(m) {
            if (!meter(m)) return;
            pintarBorrador();
            repintarResultados();
            avisar();
        }

        function quitar(codmar) {
            var antes = borrador.length;
            borrador = borrador.filter(function (m) { return m.codmar !== codmar; });
            if (borrador.length === antes) return;

            pintarBorrador();
            repintarResultados();
            avisar();
        }

        /* ===============================================================
         * Búsqueda
         * ============================================================= */
        function limpiarResultados() {
            ultimos = null;
            resultados.innerHTML = "";
            pista.classList.remove("hidden");
        }

        function pintarResultados(lista, texto) {
            ultimos = [lista, texto];
            pista.classList.add("hidden");
            resultados.innerHTML = "";

            if (!lista.length) {
                resultados.appendChild(el("p", {
                    clase: "cdk-pista", style: "margin:0",
                    texto: "Ninguna marca libre coincide con «" + texto + "»."
                }));
                return;
            }

            var ul = el("ul", { clase: "cdk-articulos" });
            lista.forEach(function (m) {
                var yaEsta = esta(m.codmar) || suyas[m.codmar];

                ul.appendChild(CDK.articulo({
                    distintivo: m.codmar,
                    nombre: CDK.resaltar(marcas.nombre(m), texto),
                    detalle: m.familia,
                    /* Una marca ya elegida se queda en la lista, pero sin
                       poder pulsarse: así se ve que se encontró y por qué no
                       se vuelve a ofrecer. */
                    datos: yaEsta ? [{ etiqueta: "", valor: "En tu lista", tono: "bien" }] : [],
                    alPulsar: yaEsta ? null : function () { agregar(m); }
                }));
            });
            resultados.appendChild(ul);
        }

        function repintarResultados() {
            if (ultimos) pintarResultados(ultimos[0], ultimos[1]);
        }

        function buscar(texto) {
            var mio = ++ticket;
            CDK.estados.cargando(resultados, "Buscando…");
            pista.classList.add("hidden");

            marcas.disponibles(texto)
                .then(function (lista) {
                    if (mio !== ticket) return;      // el usuario ya escribió otra cosa
                    pintarResultados(Array.isArray(lista) ? lista : [], texto);
                })
                .catch(function (err) {
                    if (mio !== ticket) return;

                    if (CDK.http.esError(err) && err.status === 401) {
                        if (config.alSesionVencida) config.alSesionVencida();
                        return;                      // donde hay armazón, ya redirige
                    }
                    CDK.estados.error(resultados, err, function () { buscar(texto); });
                });
        }

        campo.addEventListener("input", function () {
            clearTimeout(reloj);
            var texto = campo.value.trim();

            if (texto.length < MINIMO) {
                ticket++;                            // lo que venga en vuelo ya no sirve
                limpiarResultados();
                return;
            }

            reloj = setTimeout(function () { buscar(texto); }, ESPERA);
        });

        /* ===============================================================
         * Las del mes anterior
         *
         * No asigna nada: precarga el borrador con las que siguen libres y el
         * usuario confirma. Las demás se dicen, porque la gente espera
         * encontrarlas y su ausencia sin explicación parece un fallo.
         * ============================================================= */
        function mantenerAnteriores() {
            botonAnterior.disabled = true;

            marcas.anterior()
                .then(function (d) {
                    var lista = (d && d.marcas) || [];
                    avisoAnterior.innerHTML = "";

                    if (!lista.length) {
                        CDK.toast("El mes pasado no tenías marcas.", "info");
                        return;
                    }

                    var nuevas = 0;
                    var fuera = [];

                    lista.forEach(function (m) {
                        if (!m.disponible) { fuera.push(m); return; }
                        if (meter(m)) nuevas++;
                    });

                    if (nuevas) { pintarBorrador(); repintarResultados(); avisar(); }

                    var aviso = marcas.avisoOmitidas(
                        "Estas marcas del mes pasado ya no se pueden tomar:", fuera);
                    if (aviso) avisoAnterior.appendChild(aviso);

                    if (nuevas) {
                        CDK.toast(nuevas === 1 ? "Se sumó 1 marca del mes pasado."
                                               : "Se sumaron " + nuevas + " marcas del mes pasado.",
                                  "exito");
                    } else if (!fuera.length) {
                        CDK.toast("Las del mes pasado ya estaban en tu lista.", "info");
                    }
                })
                .catch(function (err) {
                    if (CDK.http.esError(err) && err.status === 401) {
                        if (config.alSesionVencida) config.alSesionVencida();
                        return;
                    }
                    CDK.toast(marcas.mensajeError(err), "error");
                })
                .then(function () { botonAnterior.disabled = false; });
        }

        pintarBorrador();

        return {
            nodo: nodo,
            codigos: codigos,
            cantidad: function () { return borrador.length; },
            agregar: agregar,
            quitar: quitar,

            /** Congela el editor mientras se confirma, para que el borrador no
                cambie entre el clic y la respuesta. */
            bloquear: function (si) {
                Array.prototype.forEach.call(
                    nodo.querySelectorAll("input, button"),
                    function (n) { n.disabled = !!si; }
                );
            }
        };
    };

})(window);
