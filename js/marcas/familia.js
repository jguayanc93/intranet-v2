/**
 * Panel de la familia — lo que ve la jefatura.
 *
 * Una jefatura lleva UNA familia (Equipos informáticos, Impresión, Movilidad…)
 * y ve todas sus marcas: las de sus especialistas, las suyas y las que nadie
 * tiene. A diferencia de un especialista, **puede dar, pasar y quitar marcas en
 * cualquier momento, aunque ya hayan confirmado**, y puede declarar una marca
 * como no trabajada para que nadie la tome.
 *
 * Aquí no hay reglas de quién puede qué: el backend las aplica y devuelve en
 * `omitidas` lo que no pudo hacer. Lo único que decide esta pantalla es qué
 * botones ofrece según el estado de cada marca, para no proponer lo que va a
 * rechazarse de todas formas.
 *
 *   CDK.marcas.panelFamilia(estado, {
 *       alCambiar: function () -> Promise,        // vuelve a pedir y repinta
 *       omitidas:  function (titulo, lista) {}    // enseña lo que no se pudo
 *   })
 *
 * Tras cada acción que escribe se vuelve a pedir `GET /v1/marcas` entero: es lo
 * que pide el contrato, y evita que la pantalla discrepe de lo que quedó.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var marcas = CDK.marcas = CDK.marcas || {};
    var el = CDK.el;

    /* El filtro sobrevive a los repintados: cada acción repinta todo el
       panel, y volver a «todas» después de dar una marca obligaría a buscar
       otra vez dónde se estaba. */
    var filtro = "todas";

    marcas.panelFamilia = function (d, ganchos) {
        var fam = d && d.familia;
        var contenedor = el("div", { id: "marcas-familia" });

        if (!fam) {
            contenedor.appendChild(el("section", { clase: "cdk-seccion" }, [
                el("h2", { clase: "cdk-seccion__titulo", texto: "Tu familia" }),
                el("div", { clase: "cdk-aviso" }, [
                    el("p", { clase: "cdk-aviso__texto",
                              texto: "Todavía no tienes una familia cargada, así que no hay marcas que administrar. " +
                                     "Avisa al equipo de sistemas." })
                ])
            ]));
            return contenedor;
        }

        var todas = fam.marcas || [];
        var especialistas = fam.especialistas || [];

        /* ===============================================================
         * Escribir
         * ============================================================= */

        /** Ejecuta una escritura y repinta. Tras un error también repinta:
            lo más probable es que otra persona haya movido la marca. */
        function ejecutar(peticion, alTerminar) {
            ganchos.omitidas(null, []);

            return peticion
                .then(alTerminar)
                .catch(function (err) {
                    if (CDK.http.esError(err) && err.status === 401) throw err;
                    CDK.toast(marcas.mensajeError(err), "error", 6000);
                })
                .then(function () { return ganchos.alCambiar(); })
                .catch(function () { /* 401: ya redirige */ });
        }

        function asignar(m, esp) {
            var previo = m.dueno && !m.dueno.soyYo ? m.dueno.nombre : null;

            /* Mover una marca que ya tiene dueño es quitársela a alguien. Se
               pide confirmación; darle una marca libre a un especialista no. */
            var paso = previo
                ? CDK.modal.confirmar({
                    titulo: "¿Pasar la marca?",
                    mensaje: marcas.nombre(m) + " es de " + previo + ". ¿Pasarla a " + esp.nombre + "?",
                    confirmar: "Pasar"
                })
                : Promise.resolve(true);

            paso.then(function (si) {
                if (!si) return;

                ejecutar(marcas.asignar(esp.codusu, [m.codmar]), function (r) {
                    var hecha = (r.asignadas || [])[0];

                    if (hecha) {
                        CDK.toast(hecha.movidaDe
                            ? marcas.nombre(m) + " pasó de " + hecha.movidaDe + " a " + esp.nombre + "."
                            : marcas.nombre(m) + " es ahora de " + esp.nombre + ".", "exito");
                    } else if ((r.yaTenia || []).length) {
                        CDK.toast(esp.nombre + " ya tenía " + marcas.nombre(m) + ".", "info");
                    }

                    ganchos.omitidas("No se pudo dar la marca a " + esp.nombre + ":", r.omitidas);
                });
            });
        }

        function retirar(m) {
            var quien = m.dueno.nombre;

            CDK.modal.confirmar({
                titulo: "¿Quitar la marca?",
                mensaje: "Vas a quitarle " + marcas.nombre(m) + " a " + quien +
                         ". Queda sin asignar.",
                confirmar: "Quitar",
                peligro: true
            }).then(function (si) {
                if (!si) return;

                ejecutar(marcas.retirar(m.dueno.codusu, [m.codmar]), function (r) {
                    if ((r.retiradas || []).length) {
                        CDK.toast(marcas.nombre(m) + " quedó sin asignar.", "exito");
                    }
                    ganchos.omitidas("No se pudo quitar la marca:", r.omitidas);
                });
            });
        }

        function cambiarTrabajada(m, trabajada) {
            var nombre = marcas.nombre(m);

            var paso = trabajada
                ? Promise.resolve(true)
                : CDK.modal.confirmar({
                    titulo: "¿Dejar de trabajar " + nombre + "?",
                    mensaje: "Desde ahora nadie podrá tomarla." +
                             (m.dueno ? " " + (m.dueno.soyYo ? "Tú" : m.dueno.nombre) +
                                        " la conserva hasta fin de mes." : ""),
                    confirmar: "Dejar de trabajarla",
                    peligro: true
                });

            paso.then(function (si) {
                if (!si) return;

                ejecutar(marcas.fijarTrabajada(m.codmar, trabajada), function (r) {
                    /* El nombre, en texto, o null: docs/marcas-grupo25.md, secc. 5. */
                    var quien = r && r.asignadaEsteMesA;

                    if (!trabajada && quien) {
                        CDK.toast(quien + " la conserva hasta fin de mes.", "aviso", 6000);
                    } else {
                        CDK.toast(trabajada ? nombre + " se vuelve a trabajar."
                                            : nombre + " ya no se trabaja.", "exito");
                    }
                });
            });
        }

        function elegirEspecialista(m, excluir) {
            var lista = especialistas.filter(function (e) { return e.codusu !== excluir; });

            if (!lista.length) {
                CDK.toast("No hay otros especialistas registrados.", "aviso");
                return;
            }

            CDK.menuAcciones({
                titulo: (excluir ? "Pasar " : "Dar ") + marcas.nombre(m) + " a…",
                opciones: lista.map(function (e) {
                    return {
                        texto: e.nombre,
                        descripcion: e.marcasDeMiFamilia + " de tu familia · " + e.marcasTotal +
                                     " en total · " + (e.confirmado ? "ya confirmó" : "sin confirmar"),
                        alPulsar: function () { asignar(m, e); }
                    };
                })
            });
        }

        /* ===============================================================
         * Una marca
         * ============================================================= */
        function acciones(m) {
            var dueno = m.dueno;

            /* No trabajada: lo único que se ofrece es reactivarla. Si alguien la
               tiene, la conserva; tocarla ahora sería inventarse una excepción. */
            if (!m.trabajada) {
                return [{ texto: "Volver a trabajarla",
                          alPulsar: function () { cambiarTrabajada(m, true); } }];
            }

            var lista = [];

            /* Las propias se pueden ceder mientras ella no haya confirmado. Una
               vez confirmadas el backend las devuelve en `omitidas`, y no se
               ofrece lo que se sabe que va a rechazarse. */
            var cedible = !dueno || (dueno.soyYo && !d.confirmado);

            if (cedible) {
                lista.push({ texto: "Dar a un especialista",
                             alPulsar: function () { elegirEspecialista(m, null); } });
            } else if (!dueno.soyYo) {
                lista.push({ texto: "Pasar a otro",
                             alPulsar: function () { elegirEspecialista(m, dueno.codusu); } });
                lista.push({ texto: "Quitar", peligro: true,
                             alPulsar: function () { retirar(m); } });
            }

            lista.push({ texto: "Dejar de trabajarla", peligro: true,
                         alPulsar: function () { cambiarTrabajada(m, false); } });

            return lista;
        }

        function filaMarca(m) {
            var dueno = m.dueno;
            var datos = [{
                etiqueta: "Dueño",
                valor: !dueno ? "sin asignar" : dueno.soyYo ? "tú" : dueno.nombre,
                tono: dueno ? null : "nulo"
            }];

            if (!m.trabajada) {
                datos.push({ etiqueta: "", valor: dueno ? "ya no se trabaja · la conserva hasta fin de mes"
                                                        : "ya no se trabaja", tono: "nulo" });
            }

            return CDK.articulo({
                distintivo: m.codmar,
                nombre: marcas.nombre(m),
                detalle: m.abrmar && m.abrmar !== m.nombre ? m.abrmar : null,
                datos: datos,
                acciones: acciones(m)
            });
        }

        /* ===============================================================
         * Resumen y especialistas
         * ============================================================= */
        var trabajadas = todas.filter(function (m) { return m.trabajada; });
        var libres = trabajadas.filter(function (m) { return !m.dueno; });
        var noTrabajadas = todas.filter(function (m) { return !m.trabajada; });

        var resumen = el("section", { clase: "cdk-seccion", id: "marcas-resumen" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Tu familia: " + fam.nombre }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Aquí están todas las marcas de tu familia: las de tus especialistas, " +
                             "las tuyas y las que nadie tiene. Puedes darlas, pasarlas o quitarlas " +
                             "aunque ya hayan confirmado." }),
            CDK.totales([
                { etiqueta: "Marcas que se trabajan", valor: String(trabajadas.length) },
                { etiqueta: "Sin asignar", valor: String(libres.length), tono: libres.length ? "alerta" : null },
                { etiqueta: "Ya no se trabajan", valor: String(noTrabajadas.length) }
            ])
        ]);

        var filasEsp = el("ul", { clase: "cdk-articulos", style: "margin-top:16px" });
        especialistas.forEach(function (e) {
            filasEsp.appendChild(CDK.articulo({
                nombre: e.nombre,
                datos: [
                    { etiqueta: "De tu familia", valor: String(e.marcasDeMiFamilia) },
                    { etiqueta: "En total", valor: String(e.marcasTotal) },
                    { etiqueta: "", valor: e.confirmado ? "confirmó" : "sin confirmar",
                      tono: e.confirmado ? "bien" : "alerta" }
                ]
            }));
        });

        if (especialistas.length) {
            resumen.appendChild(el("h3", { clase: "cdk-seccion__titulo", style: "margin:20px 0 0",
                                           texto: "Tus especialistas" }));
            resumen.appendChild(filasEsp);
        }

        contenedor.appendChild(resumen);

        /* ===============================================================
         * Las marcas, con filtro
         * ============================================================= */
        var opciones = [
            { valor: "todas", texto: "Todas (" + todas.length + ")" },
            { valor: "libres", texto: "Sin asignar (" + libres.length + ")" },
            { valor: "mias", texto: "Mías (" + todas.filter(function (m) { return m.dueno && m.dueno.soyYo; }).length + ")" },
            { valor: "no", texto: "Ya no se trabajan (" + noTrabajadas.length + ")" }
        ];
        especialistas.forEach(function (e) {
            opciones.push({
                valor: "e:" + e.codusu,
                texto: e.nombre + " (" + todas.filter(function (m) { return m.dueno && m.dueno.codusu === e.codusu; }).length + ")"
            });
        });

        /* Si el especialista elegido ya no existe, el filtro se quedaría
           apuntando a nada y la lista saldría vacía sin explicación. */
        if (!opciones.some(function (o) { return o.valor === filtro; })) filtro = "todas";

        var selector = el("select", { id: "marcas-filtro", clase: "cdk-entrada" },
            opciones.map(function (o) {
                var op = el("option", { value: o.valor, texto: o.texto });
                if (o.valor === filtro) op.selected = true;
                return op;
            }));

        var lista = el("div", { id: "marcas-familia-lista", style: "margin-top:12px" });

        function pasaFiltro(m) {
            if (filtro === "libres") return m.trabajada && !m.dueno;
            if (filtro === "mias")   return !!(m.dueno && m.dueno.soyYo);
            if (filtro === "no")     return !m.trabajada;
            if (filtro.indexOf("e:") === 0) return !!(m.dueno && m.dueno.codusu === filtro.slice(2));
            return true;
        }

        function pintarLista() {
            lista.innerHTML = "";
            var visibles = todas.filter(pasaFiltro);

            if (!visibles.length) {
                CDK.estados.vacio(lista, "No hay marcas con ese filtro.");
                return;
            }

            var ul = el("ul", { clase: "cdk-articulos" });
            visibles.forEach(function (m) { ul.appendChild(filaMarca(m)); });
            lista.appendChild(ul);
        }

        selector.addEventListener("change", function () {
            filtro = selector.value;
            pintarLista();
        });

        /* Una marca que existe en el ERP pero no está en el catálogo se agrega
           declarándola trabajada: queda incorporada a la familia. */
        var codigoNuevo = el("input", {
            type: "text", id: "marcas-incorporar", clase: "cdk-entrada",
            inputmode: "numeric", maxlength: "4", autocomplete: "off",
            placeholder: "Código de 4 dígitos"
        });

        var formNuevo = el("form", { id: "marcas-form-incorporar", clase: "cdk-buscador",
                                     style: "margin-top:12px" }, [
            el("div", { clase: "cdk-buscador__campo" }, [codigoNuevo]),
            el("button", { type: "submit", clase: "cdk-boton cdk-boton--suave", texto: "Incorporar" })
        ]);

        formNuevo.addEventListener("submit", function (ev) {
            ev.preventDefault();
            var codigo = codigoNuevo.value.trim();

            if (!/^\d{4}$/.test(codigo)) {
                CDK.toast("El código de una marca tiene 4 dígitos.", "aviso");
                codigoNuevo.focus();
                return;
            }

            ejecutar(marcas.fijarTrabajada(codigo, true), function (r) {
                var nombre = marcas.nombre(r) || codigo;
                CDK.toast(r && r.incorporada ? nombre + " quedó incorporada a tu familia."
                                             : nombre + " ya estaba en tu familia.", "exito");
            });
        });

        contenedor.appendChild(el("section", { clase: "cdk-seccion", id: "marcas-familia-marcas" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Marcas de la familia" }),
            el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "marcas-filtro", texto: "Ver" }),
                selector
            ]),
            lista,
            el("details", { clase: "cdk-plegable", style: "margin-top:16px" }, [
                el("summary", { clase: "cdk-plegable__titulo", texto: "Incorporar una marca nueva" }),
                el("p", { clase: "cdk-pista", style: "margin:12px 0 0",
                          texto: "Para una marca que existe en el ERP pero todavía no figura en tu familia. " +
                                 "Escribe su código y queda incorporada." }),
                formNuevo
            ])
        ]));

        pintarLista();
        return contenedor;
    };

})(window);
