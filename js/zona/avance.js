/**
 * Avance de cuota de todos los vendedores del grupo 20 (grupo 34, jefe de zona).
 *
 * Una vista: arriba el total —cuánto llevan, qué parte del mes ya pasó, y cuántos van adelantados, justos o
 * atrasados— y debajo cada vendedor con su semáforo, su barra y su proyección. Aparte, los que **no registraron
 * su cuota**, para saber a quién pedírsela.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona entiende:
 *
 *   · **Es en dólares CON IGV**, el mismo número que el vendedor ve en su propia pantalla de cuota. No es la regla de la
 *     cuota por marca del grupo 25 (sin IGV): no hay que comparar las dos cifras. La pantalla lo dice.
 *   · **Nada se calcula aquí.** El porcentaje, el semáforo, lo que ya pasó del mes (`esperado`), la proyección, la
 *     probabilidad y el mes anterior vienen del backend; la pantalla los pinta. El semáforo se dice con TEXTO y el color
 *     solo acompaña.
 *   · **Es del momento.** Cada llamada se calcula al vuelo y recorre las facturas del mes: se actualiza sola cada 3
 *     minutos mientras la pantalla se ve y es el mes en curso, y con un botón, nunca más seguido.
 *   · Un mes cerrado no tiene semáforo, ni lo de hoy, ni proyección ni probabilidad: ahí manda si **logró** la meta.
 *   · Un vendedor sin cuota ese mes no sale en la lista: va aparte. Sin ningún vendedor con cuota no es un error.
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

    /* Cada lectura recorre las facturas del mes: no cambia tan rapido, y no se pide mas seguido que cada 2 a 5 minutos. */
    var REFRESCO_MS = 3 * 60 * 1000;

    var datos = null;                   // lo ultimo que dijo GET /zona/avance
    var periodo = null;                 // null = el mes en curso; { anno, mes } = uno de los dos anteriores
    var actual = null;                  // { anno, mes } del mes en curso, en cuanto el servidor lo dice
    var filtroEstado = "todos";
    var filtroTipo = "todos";
    var busqueda = "";
    var ticket = 0;                     // descarta respuestas de pedidos viejos
    var reloj = null;                   // el siguiente refresco automatico

    cargar();

    /* ---------------------------------------------------------------
     * Formatos
     * ------------------------------------------------------------- */
    function dolares(v) { return CDK.formato.moneda(v, "D"); }
    function porciento(v) { return CDK.formato.porcentaje(v, 1); }
    function entero(v) { return CDK.formato.numero(v, 0); }
    function esSesionVencida(err) { return CDK.http.esError(err) && err.status === 401; }     // ya redirige

    var TIPOS = { COBERTURA: "Cobertura", CARTERA: "Cartera" };
    var ESTADOS = { logrado: "Logrado", adelantado: "Adelantado", justo: "Justo", atrasado: "Atrasado" };

    /** `2026-10-22 18:47:06` → `18:47`. */
    function hora(texto) {
        var m = /(\d{2}:\d{2})/.exec(String(texto || ""));
        return m ? m[1] : "";
    }

    /** Una barra de avance; con `esperado`, la marca de cuanto del mes ya paso. */
    function barra(porcentaje, esperado) {
        var ancho = Math.max(0, Math.min(100, porcentaje || 0));
        var relleno = el("div", {
            clase: "cdk-progreso__relleno" + (porcentaje >= 100 ? " cdk-progreso__relleno--bien" : ""),
            style: "width:" + ancho + "%"
        });

        var hijos = [el("div", { clase: "cdk-progreso" }, [el("div", { clase: "cdk-progreso__pista" }, [relleno])])];
        if (typeof esperado === "number") {
            hijos.push(el("div", { clase: "cdk-ritmo__marca", style: "left:" + Math.max(0, Math.min(100, esperado)) + "%",
                                   title: "Ya pasó el " + esperado + " % del mes" }));
        }
        return el("div", { clase: "cdk-ritmo" }, hijos);
    }

    /* ---------------------------------------------------------------
     * Meses: el en curso y los dos anteriores
     * ------------------------------------------------------------- */
    function claveDe(p) { return p.anno + "-" + (p.mes < 10 ? "0" : "") + p.mes; }

    function mesEnCurso() {
        if (actual) return actual;
        var hoy = new Date();
        return { anno: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
    }

    function mesesAtras(base, n) {
        var t = base.anno * 12 + (base.mes - 1) - n;
        return { anno: Math.floor(t / 12), mes: (t % 12) + 1 };
    }

    function selectorDeMes() {
        var base = mesEnCurso();
        var opciones = [{ valor: "", texto: M.periodo(base) + " (este mes)" }];
        [1, 2].forEach(function (n) {
            var p = mesesAtras(base, n);
            opciones.push({ valor: claveDe(p), texto: M.periodo(p) });
        });

        var elegida = periodo ? claveDe(periodo) : "";
        var s = el("select", { id: "za-mes", clase: "cdk-entrada" }, opciones.map(function (o) {
            var op = el("option", { value: o.valor, texto: o.texto });
            if (o.valor === elegida) op.selected = true;
            return op;
        }));
        s.addEventListener("change", function () { irAlMes(s); });

        return el("div", { clase: "cdk-campo", style: "margin-top:12px" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "za-mes", texto: "Mes" }), s
        ]);
    }

    function irAlMes(select) {
        var antes = periodo;
        var v = select.value;
        periodo = v ? { anno: Number(v.slice(0, 4)), mes: Number(v.slice(5)) } : null;
        select.disabled = true;

        cargar(true).then(function (pinto) {
            if (pinto) return;                                   // se repinto todo, con un selector nuevo
            periodo = antes;                                     // no se pudo: se queda donde estaba
            select.value = antes ? claveDe(antes) : "";
            select.disabled = false;
        });
    }

    /* ===============================================================
     * Datos
     * ============================================================= */

    /**
     * `silencioso`: al cambiar de mes o al refrescar se pide sin tapar la pantalla con un spinner, y si no se puede, la
     * pantalla buena se queda como estaba. Devuelve una promesa de si pinto.
     */
    function cargar(silencioso) {
        var mio = ++ticket;
        if (!silencioso) CDK.estados.cargando(contenido, "Calculando el avance de los vendedores…");

        return Z.avance(periodo)
            .then(function (d) {
                if (mio !== ticket) return false;

                /* Algo que no es lo que dice el contrato no se pinta a ojo. */
                if (!d || !Array.isArray(d.vendedores)) {
                    if (silencioso) CDK.toast("No se pudo actualizar la pantalla. La respuesta no trae los vendedores.", "error");
                    else CDK.estados.error(contenido, "La respuesta no trae los vendedores.", function () { cargar(); });
                    programarRefresco();
                    return false;
                }

                datos = d;
                if (d.actual !== false) actual = { anno: d.anno, mes: d.mes };
                pintar();
                programarRefresco();
                return true;
            })
            .catch(function (err) {
                if (mio !== ticket) return false;
                if (esSesionVencida(err)) return false;

                programarRefresco();
                if (silencioso) {
                    CDK.toast("No se pudo actualizar la pantalla. " + M.mensajeError(err), "error");
                    return false;
                }
                CDK.estados.error(contenido, err, function () { cargar(); });
                return false;
            });
    }

    /** Solo el mes en curso cambia con las facturas del dia, y solo tiene sentido si la pantalla se esta mirando. */
    function programarRefresco() {
        if (reloj) clearTimeout(reloj);
        reloj = null;
        if (!datos || datos.actual === false) return;

        reloj = setTimeout(function () {
            reloj = null;
            if (document.hidden) return programarRefresco();      // en segundo plano no se gasta una lectura
            cargar(true);
        }, REFRESCO_MS);
    }

    /* ===============================================================
     * La pantalla
     * ============================================================= */
    function pasaFiltros(v) {
        if (filtroTipo !== "todos" && v.tipo !== filtroTipo) return false;
        if (filtroEstado !== "todos" && v.estado !== filtroEstado) return false;
        return !busqueda || String(v.nombre || "").toLowerCase().indexOf(busqueda.toLowerCase()) !== -1 ||
               String(v.codven || "").toLowerCase().indexOf(busqueda.toLowerCase()) !== -1;
    }

    function pintar() {
        contenido.innerHTML = "";

        var d = datos;
        var vivo = d.actual !== false;

        titulo.textContent = vivo
            ? M.periodo(d) + " · actualizado a las " + hora(d.actualizado)
            : M.periodo(d) + " · mes cerrado";

        contenido.appendChild(resumen(d, vivo));
        contenido.appendChild(listaDeVendedores(d, vivo));
        if (d.sinCuota && d.sinCuota.length) contenido.appendChild(sinCuota(d, vivo));
    }

    /** El total: cuanto llevan todos, cuanto del mes ya paso, y cuantos van bien o mal. */
    function resumen(d, vivo) {
        var t = d.total;

        var actualizar = el("button", { type: "button", id: "za-actualizar", clase: "cdk-boton cdk-boton--suave", texto: "Actualizar" });
        actualizar.addEventListener("click", function () {
            actualizar.disabled = true;
            actualizar.textContent = "Actualizando…";
            cargar(true).then(function (pinto) {
                if (pinto) return;                               // se repinto todo: este boton ya es otro
                actualizar.disabled = false;
                actualizar.textContent = "Actualizar";
            });
        });

        var hijos = [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Avance de cuota" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "De todos los vendedores del grupo 20 que registraron su cuota. Todo en dólares y con IGV, el mismo número " +
                             "que cada uno ve en su pantalla de cuota." }),
            selectorDeMes()
        ];

        if (!t.vendedores) {
            hijos.push(el("p", { clase: "cdk-pista", id: "za-sin-cuotas", style: "margin:12px 0 0",
                                 texto: "Nadie registró su cuota en " + M.periodo(d) + "." }));
        } else {
            hijos.push(el("div", { style: "margin-top:14px", id: "za-total-barra" }, [barra(t.porcentaje, vivo ? d.esperado : null)]));
            hijos.push(el("p", { clase: "cdk-pista", id: "za-ritmo-texto", style: "margin:8px 0 0",
                                 texto: vivo
                                     ? "Llevan el " + porciento(t.porcentaje) + " de la meta, y ya pasó el " + d.esperado + " % del mes."
                                     : "Cerraron en el " + porciento(t.porcentaje) + " de la meta." }));

            var filas = [
                ["Avance", dolares(t.avance), "za-total-avance", true],
                ["Meta", dolares(t.meta), "za-total-meta"],
                ["Vendedores con cuota", entero(t.vendedores), "za-total-vendedores"],
                ["Ya llegaron a su meta", entero(t.logrados) + " de " + entero(t.vendedores), "za-total-logrados"]
            ];
            if (vivo && t.hoy !== null && t.hoy !== undefined) filas.push(["Facturado hoy", dolares(t.hoy), "za-total-hoy"]);
            filas.push(["No registraron su cuota", entero(t.sinCuota || 0), "za-total-sincuota"]);

            hijos.push(el("div", { clase: "cdk-totales" }, filas.map(function (f) {
                return el("div", { clase: "cdk-total" + (f[3] ? " cdk-total--principal" : "") }, [
                    el("span", { clase: "cdk-total__etiqueta", texto: f[0] }),
                    el("span", { clase: "cdk-total__valor", id: f[2], texto: f[1] })
                ]);
            })));

            /* El semaforo, contado: cuantos hay en cada color. Solo en el mes en curso. */
            if (vivo && t.estados) {
                hijos.push(el("div", { id: "za-estados", style: "display:flex;flex-wrap:wrap;gap:6px;margin-top:12px" },
                    Object.keys(ESTADOS).map(function (k) {
                        return el("span", { clase: "cdk-semaforo cdk-semaforo--" + k, "data-estado": k,
                                            texto: ESTADOS[k] + " " + entero(t.estados[k] || 0) });
                    })));
            }
        }

        /* Hasta cuando hay facturas: si el mes empezo hace poco, el avance es de pocos dias. */
        if (d.ventasHasta !== undefined) {
            hijos.push(el("p", { clase: "cdk-pista", id: "za-ventas-hasta", style: "margin:10px 0 0",
                                 texto: d.ventasHasta ? "Con facturas hasta el " + CDK.formato.fecha(d.ventasHasta) + "."
                                                      : "Todavía no hay facturas de estos vendedores en este mes." }));
        }

        if (vivo) {
            hijos.push(el("p", { clase: "cdk-pista", id: "za-refresco", style: "margin:8px 0 0",
                                 texto: "Se calcula en el momento, y se actualiza solo cada 3 minutos mientras tengas la pantalla abierta." }));
            hijos.push(el("div", { clase: "cdk-acciones-fila", style: "margin-top:10px" }, [actualizar]));
        }

        return el("section", { clase: "cdk-seccion", id: "za-resumen" }, hijos);
    }

    function listaDeVendedores(d, vivo) {
        var buscador = el("input", {
            type: "search", id: "za-buscar", clase: "cdk-entrada", autocomplete: "off",
            placeholder: "Buscar un vendedor", "aria-label": "Buscar un vendedor", value: busqueda
        });
        var destino = el("div", { id: "za-lista", style: "margin-top:12px" });

        function repintar() {
            busqueda = buscador.value.trim();
            destino.innerHTML = "";

            if (!d.vendedores.length) {
                CDK.estados.vacio(destino, "Ningún vendedor registró su cuota este mes.");
                return;
            }

            var visibles = d.vendedores.filter(pasaFiltros);
            if (!visibles.length) {
                CDK.estados.vacio(destino, "Ningún vendedor coincide.");
                return;
            }

            var ul = el("ul", { clase: "cdk-articulos", id: "za-vendedores" });
            visibles.forEach(function (v) { ul.appendChild(filaDeVendedor(v, d, vivo)); });
            destino.appendChild(ul);
        }

        buscador.addEventListener("input", repintar);

        var tipo = el("select", { id: "za-filtro-tipo", clase: "cdk-entrada" }, [
            el("option", { value: "todos", texto: "Todos" }),
            el("option", { value: "COBERTURA", texto: "Cobertura" }),
            el("option", { value: "CARTERA", texto: "Cartera" })
        ]);
        tipo.value = filtroTipo;
        tipo.addEventListener("change", function () { filtroTipo = tipo.value; repintar(); });

        var campos = [el("div", { clase: "cdk-campo" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "za-buscar", texto: "Buscar" }), buscador
        ])];

        var filtros = [el("div", { clase: "cdk-campo", style: "min-width:0" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "za-filtro-tipo", texto: "Tipo" }), tipo
        ])];

        /* El semaforo solo existe en el mes en curso. */
        if (vivo) {
            var estado = el("select", { id: "za-filtro-estado", clase: "cdk-entrada" }, [el("option", { value: "todos", texto: "Todos" })]
                .concat(Object.keys(ESTADOS).map(function (k) { return el("option", { value: k, texto: ESTADOS[k] }); })));
            estado.value = filtroEstado;
            estado.addEventListener("change", function () { filtroEstado = estado.value; repintar(); });
            filtros.push(el("div", { clase: "cdk-campo", style: "min-width:0" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "za-filtro-estado", texto: "Semáforo" }), estado
            ]));
        } else {
            filtroEstado = "todos";
        }

        var seccion = el("section", { clase: "cdk-seccion", id: "za-vendedores-seccion" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Los vendedores" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: vivo ? "Del que más lleva de su meta al que menos. Toca uno para ver su probabilidad de llegar."
                                  : "Cómo cerró cada uno. Toca uno para ver su probabilidad en los meses anteriores." })
        ].concat(campos, [el("div", { clase: "cdk-pareja", style: "grid-template-columns:minmax(0,1fr) minmax(0,1fr)" }, filtros), destino]));

        repintar();
        return seccion;
    }

    /** Lo que se dice de la probabilidad: el numero, o por que no hay. */
    function textoDeProbabilidad(v) {
        if (v.motivo === "historia insuficiente") return "Vendedor nuevo: todavía no hay historia para calcular su probabilidad.";
        if (v.motivo === "meta alcanzada") return "Ya llegó a su meta.";
        if (v.motivo === "mes cerrado") return "Mes cerrado.";
        if (v.probabilidad === null || v.probabilidad === undefined) return null;
        return "Probabilidad de llegar a su meta: " + porciento(v.probabilidad);
    }

    function textoDelMesAnterior(v) {
        if (!v.mesAnterior) return "El mes anterior no registró cuota.";
        var a = v.mesAnterior;
        return "El mes anterior cerró en " + porciento(a.porcentaje) + " de su meta de " + dolares(a.meta) + " · " + (a.logro ? "la logró." : "no la logró.");
    }

    function filaDeVendedor(v, d, vivo) {
        var cabeza = [
            el("div", { style: "min-width:0;flex:1" }, [
                el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: v.nombre }),
                el("div", { clase: "cdk-articulo__detalle", texto: (TIPOS[v.tipo] || v.tipo || "") + " · " + v.codven })
            ])
        ];

        /* El semaforo en el mes en curso; en uno cerrado, si la logro o no. Con texto: el color solo acompaña. */
        if (vivo && v.estado) {
            cabeza.push(el("span", { clase: "cdk-semaforo cdk-semaforo--" + v.estado, "data-estado": v.estado, texto: ESTADOS[v.estado] || v.estado }));
        } else {
            cabeza.push(el("span", { clase: "cdk-semaforo" + (v.logro ? " cdk-semaforo--logrado" : ""), "data-estado": v.logro ? "logrado" : "no logrado",
                                     texto: v.logro ? "Logró su meta" : "No llegó" }));
        }

        var cuerpo = [
            el("div", { style: "display:flex;align-items:flex-start;justify-content:space-between;gap:10px" }, cabeza),
            el("div", { style: "margin-top:10px" }, [barra(v.porcentaje, vivo ? d.esperado : null)]),
            el("div", { clase: "cdk-articulo__cabecera", style: "margin-top:6px" }, [
                el("span", { clase: "cdk-articulo__detalle", id: "za-avance-" + v.codusu,
                             texto: dolares(v.avance) + " de " + dolares(v.meta) + " · " + porciento(v.porcentaje) }),
            ])
        ];

        var datosDeFila = [];
        if (!v.logro) datosDeFila.push(["Le falta", dolares(v.falta)]);
        if (vivo && v.hoy !== null && v.hoy !== undefined) datosDeFila.push(["Hoy", dolares(v.hoy)]);
        if (datosDeFila.length) {
            cuerpo.push(el("div", { clase: "cdk-articulo__datos" }, datosDeFila.map(function (x) {
                return el("span", { clase: "cdk-dato" }, [document.createTextNode(x[0] + " "), el("span", { clase: "cdk-dato__valor", texto: x[1] })]);
            })));
        }

        if (vivo && v.proyeccion !== null && v.proyeccion !== undefined) {
            cuerpo.push(el("p", { clase: "cdk-pista", id: "za-proyeccion-" + v.codusu, style: "margin:8px 0 0",
                                  texto: "A su ritmo de los últimos 90 días cerraría en " + dolares(v.proyeccion) + "." }));
        }

        var prob = textoDeProbabilidad(v);
        if (prob) cuerpo.push(el("p", { clase: "cdk-pista", id: "za-probabilidad-" + v.codusu, style: "margin:4px 0 0", texto: prob }));

        cuerpo.push(el("p", { clase: "cdk-pista", id: "za-anterior-" + v.codusu, style: "margin:4px 0 0", texto: textoDelMesAnterior(v) }));

        cuerpo.push(el("div", { style: "margin-top:10px" }, [
            el("a", { href: CDK.rutas.app("/probabilidad.html?codusu=" + encodeURIComponent(v.codusu)), clase: "cdk-enlace-accion",
                      id: "za-ver-probabilidad-" + v.codusu, texto: "Ver su probabilidad ›" })
        ]));

        var li = el("li", { clase: "cdk-articulo" }, [el("div", { clase: "cdk-articulo__cuerpo" }, cuerpo)]);
        li.setAttribute("data-codusu", v.codusu);
        return li;
    }

    /** Los que no registraron su cuota ese mes: del que mas factura al que menos, para saber a quien pedirsela. */
    function sinCuota(d, vivo) {
        var filas = d.sinCuota.map(function (s) {
            var detalle = [el("span", { clase: "cdk-dato" }, [document.createTextNode("Facturó "), el("span", { clase: "cdk-dato__valor", texto: dolares(s.avance) })])];
            if (vivo && s.hoy !== null && s.hoy !== undefined) {
                detalle.push(el("span", { clase: "cdk-dato" }, [document.createTextNode("Hoy "), el("span", { clase: "cdk-dato__valor", texto: dolares(s.hoy) })]));
            }
            if (vivo && s.proyeccion !== null && s.proyeccion !== undefined) {
                detalle.push(el("span", { clase: "cdk-dato" }, [document.createTextNode("A su ritmo cerraría en "),
                                                                  el("span", { clase: "cdk-dato__valor", texto: dolares(s.proyeccion) })]));
            }

            var li = el("li", { clase: "cdk-articulo" }, [el("div", { clase: "cdk-articulo__cuerpo" }, [
                el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: s.nombre }),
                el("div", { clase: "cdk-articulo__detalle", texto: (TIPOS[s.tipo] || s.tipo || "") + " · " + s.codven }),
                el("div", { clase: "cdk-articulo__datos" }, detalle),
                el("div", { style: "margin-top:8px" }, [
                    el("a", { href: CDK.rutas.app("/probabilidad.html?codusu=" + encodeURIComponent(s.codusu)), clase: "cdk-enlace-accion",
                              texto: "Ver su probabilidad ›" })
                ])
            ])]);
            li.setAttribute("data-codusu", s.codusu);
            return li;
        });

        var caja = el("details", { clase: "cdk-plegable", id: "za-sincuota" }, [
            el("summary", { clase: "cdk-plegable__titulo", texto: "No registraron su cuota (" + entero(d.sinCuota.length) + ")" }),
            el("p", { clase: "cdk-pista", style: "margin:10px 0 0",
                      texto: "Vendedores del grupo 20, registrados y activos, que no registraron su cuota " + (vivo ? "este mes" : "ese mes") +
                             ". Del que más factura al que menos: sirve para saber a quién pedírsela." }),
            el("ul", { clase: "cdk-articulos", id: "za-sincuota-lista", style: "margin-top:10px" }, filas)
        ]);

        return el("section", { clase: "cdk-seccion", id: "za-sincuota-seccion" }, [caja]);
    }

})();
