/**
 * Probabilidad de que un vendedor del grupo 20 llegue a su cuota (grupo 34, jefe de zona).
 *
 * Sin vendedor elegido, la lista para elegirlo (la misma del avance). Con `?codusu=196` —o tocando «Ver su
 * probabilidad» en una fila del avance—, **la probabilidad de este mes y como iba en los 3 meses anteriores a esta misma
 * altura del mes, con como termino cada uno**: *«en septiembre, a esta altura, llevaba 82 % y tenia 98,6 % de llegar;
 * termino en 105,7 %»*. Lo que interesa es si este mes, a esta altura, va mejor o peor que los anteriores.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona entiende:
 *
 *   · **Nada se calcula aquí.** La probabilidad, los escenarios, el ritmo, los días que quedan y el cierre vienen del
 *     backend; la pantalla los pinta.
 *   · **Los escenarios no llevan la corrección de la probabilidad**: dicen como cerraría el mes si sigue vendiendo como en sus
 *     últimos 90 días, sin contar con que el atrasado suele apretar al final. Por eso la probabilidad puede ser alta y el
 *     «probable» quedar por debajo de la meta. Se rotulan *«a su ritmo habitual»*.
 *   · **Un mes sin cuota** viene sin meta ni probabilidad, pero con lo que facturó: se muestra, diciendo que no hay cuota.
 *   · Un vendedor nuevo (menos de 20 días con datos) no tiene probabilidad ni escenarios: se dice, no se inventa.
 *   · Es en dólares CON IGV.
 *
 * Ver docs/zona-grupo34.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var Z = CDK.zona;
    var M = CDK.marcas;                 // periodo(), statusDe(), mensajeError()

    var contenido = document.getElementById("contenido");
    var titulo = document.getElementById("periodo");

    if (!contenido) return;

    var codusu = (new URLSearchParams(location.search).get("codusu") || "").trim();
    var ticket = 0;                     // descarta respuestas de pedidos viejos

    if (codusu) cargar(); else elegir();

    /* ---------------------------------------------------------------
     * Formatos
     * ------------------------------------------------------------- */
    function dolares(v) { return CDK.formato.moneda(v, "D"); }
    function porciento(v) { return CDK.formato.porcentaje(v, 1); }
    function entero(v) { return CDK.formato.numero(v, 0); }
    function plural(n, uno, varios) { return entero(n) + " " + (n === 1 ? uno : varios); }
    function esSesionVencida(err) { return CDK.http.esError(err) && err.status === 401; }     // ya redirige

    var TIPOS = { COBERTURA: "Cobertura", CARTERA: "Cartera" };

    function hora(texto) {
        var m = /(\d{2}:\d{2})/.exec(String(texto || ""));
        return m ? m[1] : "";
    }

    function barra(porcentaje) {
        var ancho = Math.max(0, Math.min(100, porcentaje || 0));
        return el("div", { clase: "cdk-progreso" }, [el("div", { clase: "cdk-progreso__pista" }, [
            el("div", { clase: "cdk-progreso__relleno" + (porcentaje >= 100 ? " cdk-progreso__relleno--bien" : ""), style: "width:" + ancho + "%" })
        ])]);
    }

    function enlaceAElegir(texto) {
        return el("a", { href: CDK.rutas.app("/probabilidad.html"), id: "zp-elegir-otro", clase: "cdk-boton cdk-boton--suave", texto: texto || "Elegir otro vendedor" });
    }

    /* ===============================================================
     * Sin vendedor: elegirlo
     * ============================================================= */
    function elegir() {
        var mio = ++ticket;
        titulo.textContent = "De que un vendedor llegue a su cuota";
        CDK.estados.cargando(contenido, "Buscando a los vendedores…");

        Z.avance(null)
            .then(function (d) {
                if (mio !== ticket) return;
                if (!d || !Array.isArray(d.vendedores)) {
                    CDK.estados.error(contenido, "La respuesta no trae los vendedores.", elegir);
                    return;
                }
                pintarLista(d);
            })
            .catch(function (err) {
                if (mio !== ticket) return;
                if (esSesionVencida(err)) return;
                CDK.estados.error(contenido, err, elegir);
            });
    }

    function pintarLista(d) {
        contenido.innerHTML = "";

        var buscador = el("input", { type: "search", id: "zp-buscar", clase: "cdk-entrada", autocomplete: "off",
                                     placeholder: "Buscar un vendedor", "aria-label": "Buscar un vendedor" });
        var destino = el("div", { id: "zp-lista", style: "margin-top:12px" });

        /* Los que tienen cuota este mes y los que no: la probabilidad se puede pedir de cualquiera del grupo 20. */
        var todos = d.vendedores.map(function (v) { return { v: v, cuota: true }; })
            .concat((d.sinCuota || []).map(function (v) { return { v: v, cuota: false }; }));

        function repintar() {
            destino.innerHTML = "";
            var aguja = buscador.value.trim().toLowerCase();
            var visibles = todos.filter(function (x) {
                return !aguja || String(x.v.nombre || "").toLowerCase().indexOf(aguja) !== -1 || String(x.v.codven || "").toLowerCase().indexOf(aguja) !== -1;
            });

            if (!visibles.length) { CDK.estados.vacio(destino, todos.length ? "Ningún vendedor coincide." : "No hay vendedores."); return; }

            var ul = el("ul", { clase: "cdk-articulos", id: "zp-vendedores" });
            visibles.forEach(function (x) {
                var item = CDK.articulo({
                    nombre: x.v.nombre,
                    detalle: (TIPOS[x.v.tipo] || x.v.tipo || "") + " · " + x.v.codven + (x.cuota ? "" : " · sin cuota este mes"),
                    alPulsar: function () { location.assign(CDK.rutas.app("/probabilidad.html?codusu=" + encodeURIComponent(x.v.codusu))); }
                });
                item.setAttribute("data-codusu", x.v.codusu);
                ul.appendChild(item);
            });
            destino.appendChild(ul);
        }

        buscador.addEventListener("input", repintar);

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "zp-elegir" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Elige un vendedor" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Verás la probabilidad de que llegue a su cuota este mes y cómo iba, a esta misma altura, en los 3 meses anteriores." }),
            el("div", { clase: "cdk-campo" }, [el("label", { clase: "cdk-campo__etiqueta", "for": "zp-buscar", texto: "Buscar" }), buscador]),
            destino
        ]));

        repintar();
    }

    /* ===============================================================
     * Un vendedor
     * ============================================================= */
    function cargar(silencioso) {
        var mio = ++ticket;
        if (!silencioso) CDK.estados.cargando(contenido, "Calculando la probabilidad…");

        return Z.probabilidad(codusu)
            .then(function (d) {
                if (mio !== ticket) return;
                if (!d || !d.vendedor || !Array.isArray(d.meses)) {
                    CDK.estados.error(contenido, "La respuesta no trae los meses.", function () { cargar(); });
                    return;
                }
                pintar(d);
            })
            .catch(function (err) {
                if (mio !== ticket) return;
                if (esSesionVencida(err)) return;

                /* Un `codusu` que no es de un vendedor del grupo 20: no hay nada que reintentar, se elige otro. */
                if (M.statusDe(err) === "vendedor desconocido" || M.statusDe(err) === "vendedor requerido") {
                    titulo.textContent = "Vendedor no encontrado";
                    contenido.innerHTML = "";
                    contenido.appendChild(el("section", { clase: "cdk-seccion", id: "zp-desconocido" }, [
                        el("h2", { clase: "cdk-seccion__titulo", texto: "No encontramos a ese vendedor" }),
                        el("p", { clase: "cdk-seccion__sub", texto: M.mensajeError(err) }),
                        enlaceAElegir()
                    ]));
                    return;
                }

                if (silencioso) { CDK.toast("No se pudo actualizar. " + M.mensajeError(err), "error"); return; }
                CDK.estados.error(contenido, err, function () { cargar(); });
            });
    }

    function pintar(d) {
        contenido.innerHTML = "";
        titulo.textContent = d.vendedor.nombre + " · actualizado a las " + hora(d.actualizado);

        var actualizar = el("button", { type: "button", id: "zp-actualizar", clase: "cdk-boton cdk-boton--suave", texto: "Actualizar" });
        actualizar.addEventListener("click", function () {
            actualizar.disabled = true;
            actualizar.textContent = "Actualizando…";
            cargar(true).then(function () { actualizar.disabled = false; actualizar.textContent = "Actualizar"; });
        });

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "zp-vendedor" }, [
            el("div", { clase: "cdk-elegido" }, [
                el("div", { clase: "cdk-elegido__datos" }, [
                    el("div", { clase: "cdk-elegido__nombre", id: "zp-nombre", style: "overflow-wrap:anywhere", texto: d.vendedor.nombre }),
                    el("div", { clase: "cdk-elegido__detalle", id: "zp-detalle",
                                texto: (TIPOS[d.vendedor.tipo] || d.vendedor.tipo || "") + " · " + d.vendedor.codven })
                ]),
                enlaceAElegir("Cambiar")
            ]),
            el("p", { clase: "cdk-pista", id: "zp-hoy", style: "margin:10px 0 0",
                      texto: "Hoy es " + CDK.formato.fecha(d.hoy) + ". Cada mes se mira cortado en el mismo día. Todo en dólares y con IGV." }),
            el("div", { clase: "cdk-acciones-fila", style: "margin-top:10px" }, [actualizar])
        ]));

        var lista = el("ul", { clase: "cdk-articulos", id: "zp-meses" }, d.meses.map(filaDeMes));
        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "zp-comparacion" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Este mes y los tres anteriores, a esta altura" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "La comparación que interesa: este mes, a esta altura, ¿va mejor o peor que los anteriores?" }),
            lista
        ]));

        contenido.appendChild(comoSeCalcula());
    }

    /** Lo que se dice de la probabilidad de un mes: el numero, o por que no hay. */
    function textoDeProbabilidad(m) {
        if (m.motivo === "sin cuota") return { texto: "Sin cuota registrada ese mes", grande: false };
        if (m.motivo === "historia insuficiente") return { texto: "Vendedor nuevo: todavía no hay historia para calcularla", grande: false };
        if (m.motivo === "meta alcanzada") return { texto: m.actual ? "Ya llegó a su meta" : "Ya había llegado a su meta", grande: false };
        if (m.motivo === "mes cerrado") return { texto: "Mes cerrado", grande: false };
        if (m.probabilidad === null || m.probabilidad === undefined) return { texto: "Sin dato", grande: false };
        return { texto: porciento(m.probabilidad) + " de llegar", grande: true };
    }

    /** `2026-09`: la clave de un mes, igual en el `data-mes` y en los identificadores. */
    function claveDeMes(m) { return m.anno + "-" + (m.mes < 10 ? "0" : "") + m.mes; }

    function fila(etiqueta, valor, id) {
        return el("div", { clase: "cdk-medida" }, [el("div", { clase: "cdk-medida__fila" }, [
            el("span", { clase: "cdk-medida__etiqueta", texto: etiqueta }),
            el("span", { clase: "cdk-medida__valor", id: id || null, style: "font-weight:500;text-align:right", texto: valor })
        ])]);
    }

    function filaDeMes(m) {
        var p = textoDeProbabilidad(m);
        var tieneMeta = m.meta !== null && m.meta !== undefined;
        var cuerpo = [];

        /* El mes en curso se dice en presente («lleva», «quedan») y los pasados en pasado: eran lo que llevaba a esa altura. */
        function t(presente, pasado) { return m.actual ? presente : pasado; }

        cuerpo.push(el("div", { style: "display:flex;align-items:baseline;justify-content:space-between;gap:10px" }, [
            el("div", { clase: "cdk-articulo__nombre", texto: M.periodo(m) + (m.actual ? " · este mes" : "") }),
            el("div", { clase: "cdk-articulo__detalle", texto: "visto el " + CDK.formato.fecha(m.corte) })
        ]));

        /* La probabilidad, grande: es lo que se compara de un mes a otro. */
        var clave = claveDeMes(m);

        cuerpo.push(el("div", { id: "zp-prob-" + clave,
                                style: "margin-top:8px;font-weight:700;" + (p.grande ? "font-size:22px" : "font-size:14px;font-weight:600"),
                                texto: p.texto }));

        if (tieneMeta) {
            cuerpo.push(el("div", { style: "margin-top:8px" }, [barra(m.porcentaje)]));
            cuerpo.push(el("div", { clase: "cdk-articulo__detalle", style: "margin-top:6px", id: "zp-corte-" + clave,
                                    texto: t("Lleva ", "Llevaba ") + dolares(m.avance) + " de " + dolares(m.meta) + " · " + porciento(m.porcentaje) +
                                           (m.falta ? t(" · le faltan ", " · le faltaban ") + dolares(m.falta) : "") }));
        } else {
            cuerpo.push(el("div", { clase: "cdk-articulo__detalle", style: "margin-top:8px", id: "zp-corte-" + clave,
                                    texto: t("Lleva facturados ", "Llevaba facturados ") + dolares(m.avance) + " (sin cuota que medir)." }));
        }

        var quedan = m.quedan || {};
        var medidas = [fila(t("Quedan", "Quedaban"), plural(quedan.habiles || 0, "día hábil", "días hábiles") + " y " + plural(quedan.sabados || 0, "sábado", "sábados"))];

        if (tieneMeta && m.ritmo && m.ritmo.necesario !== null && m.ritmo.necesario !== undefined) {
            medidas.push(fila(t("Tiene que facturar por día", "Tenía que facturar por día"), dolares(m.ritmo.necesario)));
        }
        if (m.ritmo && m.ritmo.habitual !== null && m.ritmo.habitual !== undefined) {
            medidas.push(fila("Suele facturar por día", dolares(m.ritmo.habitual)));
        }
        cuerpo.push(el("div", { style: "margin-top:8px" }, medidas));

        /* Los escenarios: a su ritmo habitual, SIN la correccion de la probabilidad. */
        if (m.escenarios) {
            cuerpo.push(el("div", { id: "zp-escenarios-" + clave, style: "margin-top:8px" }, [
                el("div", { clase: "cdk-articulo__detalle", texto: "A su ritmo habitual, el mes cerraría" }),
                fila("Lo más probable", dolares(m.escenarios.probable)),
                fila("Entre", dolares(m.escenarios.pesimista) + " y " + dolares(m.escenarios.optimista))
            ]));
        }

        /* Como termino de verdad: en los meses pasados. */
        if (m.cierre) {
            var c = m.cierre;
            cuerpo.push(el("p", { clase: "cdk-pista", id: "zp-cierre-" + clave, style: "margin:8px 0 0;font-weight:600",
                                  texto: tieneMeta
                                      ? "Terminó en " + porciento(c.porcentaje) + " de su meta (" + dolares(c.avance) + ") · " + (c.logro ? "la logró." : "no la logró.")
                                      : "Terminó el mes con " + dolares(c.avance) + " facturados." }));
        }

        var li = el("li", { clase: "cdk-articulo" }, [el("div", { clase: "cdk-articulo__cuerpo" }, cuerpo)]);
        li.setAttribute("data-mes", clave);
        return li;
    }

    /** Como se calcula, dicho para quien lo lee: el numero no es magia, y conviene saber que no es una promesa. */
    function comoSeCalcula() {
        var pasos = [
            "Lo facturado hasta ayer no se mueve.",
            "Hoy y cada día de venta que queda se rellenan con un día real del propio vendedor, sacado al azar de sus últimos 90 días (los sábados con " +
                "sábados, porque un sábado se vende menos). Hoy nunca cuenta menos de lo que ya facturó hoy.",
            "Se repite 10 000 veces, y se cuenta en cuántos de esos finales de mes llega a la meta.",
            "Ese número se corrige con lo que pasó de verdad: el vendedor atrasado suele apretar al final del mes y un día sacado al azar no lo sabe.",
            "Si para llegar tiene que facturar por día más de 2,5 veces lo que suele, no se corrige: en esos casos nadie llegó."
        ];

        return el("details", { clase: "cdk-plegable", id: "zp-como", style: "margin-top:4px" }, [
            el("summary", { clase: "cdk-plegable__titulo", texto: "Cómo se calcula" }),
            el("ol", { style: "margin:10px 0 0;padding-left:20px" }, pasos.map(function (t) { return el("li", { clase: "cdk-pista", style: "margin:4px 0", texto: t }); })),
            el("p", { clase: "cdk-pista", style: "margin:10px 0 0",
                      texto: "Los escenarios dicen cómo cerraría el mes si sigue vendiendo como en sus últimos 90 días, sin contar con que apriete: por eso " +
                             "la probabilidad puede ser alta y el «probable» quedar algo por debajo de la meta. Con los mismos datos el número no cambia " +
                             "entre dos lecturas: solo se mueve cuando entra una venta." })
        ]);
    }

})();
