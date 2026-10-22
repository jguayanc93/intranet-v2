/**
 * Cobertura de clientes por marca (grupo 25).
 *
 * Dos vistas, las dos en esta página:
 *
 *   1. las marcas del mes, cada una con cuántos clientes la compraron, unidades y venta
 *   2. los clientes de una marca, de los que más compraron a los que menos
 *
 * **Nada se calcula aquí.** Los totales, los clientes de cada marca y el orden vienen del
 * backend. En particular el total de clientes de la lista son clientes DISTINTOS —uno que
 * compró dos marcas cuenta una vez—: sumar los de cada marca daría otro número, y por eso
 * la pantalla dice de dónde sale.
 *
 * Se puede mirar el mes en curso y los dos anteriores, con las marcas y los dueños que había
 * entonces. Un cliente que no tiene unidades netas en el mes —solo devolvió, o solo tuvo notas de
 * crédito sin unidades (rebajas de precio) o de débito— sale con 0 o con negativos y no cuenta como
 * cliente de la marca; se dice en la fila, para que el número no extrañe. Un 0 no siempre es «devolvió
 * todo», así que el texto es neutro.
 *
 * Los clientes de una marca se exportan a Excel: el archivo lo arma el backend, con todos los clientes
 * y en el mismo orden, y es lo que se descarga; no se arma con lo que se ve.
 *
 * Sin marcas en el mes no hay cobertura que ver: es la misma regla que en cuota y reportes.
 *
 * Ver docs/cobertura-grupo25.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var C = CDK.cobertura;
    var M = CDK.marcas;                 // periodo(), nombre(), statusDe(), mensajeError()

    var contenido = document.getElementById("contenido");
    var titulo = document.getElementById("periodo");

    if (!contenido) return;

    /* De la lista de clientes de una marca se pintan estos de una vez: la marca grande de la
       demo tiene 130 y la real, mas. Un boton muestra el resto. */
    var TOPE = 100;

    var lista = null;                   // lo ultimo que dijo GET /cobertura/marcas
    var periodo = null;                 // null = el mes en curso; { anno, mes } = uno de los dos anteriores
    var actual = null;                  // { anno, mes } del mes en curso, en cuanto el servidor lo dice
    var filtro = "todas";               // sobrevive a volver de una marca y a cambiar de mes
    var busquedaMarca = "";
    var ticket = 0;                     // descarta respuestas de pedidos viejos

    cargar();

    /* ---------------------------------------------------------------
     * Formatos
     * ------------------------------------------------------------- */
    function dolares(v) { return CDK.formato.moneda(v, "D"); }
    function entero(v) { return CDK.formato.numero(v, 0); }
    function esSesionVencida(err) { return CDK.http.esError(err) && err.status === 401; }     // ya redirige

    /* ---------------------------------------------------------------
     * Meses
     * ------------------------------------------------------------- */
    function claveDe(p) { return p.anno + "-" + (p.mes < 10 ? "0" : "") + p.mes; }

    /** El mes en curso segun el servidor; el reloj solo mientras no lo haya dicho (sin marcas este mes). */
    function mesEnCurso() {
        if (actual) return actual;
        var hoy = new Date();
        return { anno: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
    }

    function mesesAtras(base, n) {
        var t = base.anno * 12 + (base.mes - 1) - n;
        return { anno: Math.floor(t / 12), mes: (t % 12) + 1 };
    }

    /** El mes en curso y los dos anteriores: lo que el backend deja ver. */
    function selectorDeMes() {
        var base = mesEnCurso();
        var opciones = [{ valor: "", texto: M.periodo(base) + " (este mes)" }];
        [1, 2].forEach(function (n) {
            var p = mesesAtras(base, n);
            opciones.push({ valor: claveDe(p), texto: M.periodo(p) });
        });

        var elegida = periodo ? claveDe(periodo) : "";
        var s = el("select", { id: "cobertura-mes", clase: "cdk-entrada" }, opciones.map(function (o) {
            var op = el("option", { value: o.valor, texto: o.texto });
            if (o.valor === elegida) op.selected = true;
            return op;
        }));
        s.addEventListener("change", function () { irAlMes(s); });

        return el("div", { clase: "cdk-campo", style: "margin-top:12px" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "cobertura-mes", texto: "Mes" }), s
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
     * 1 · Las marcas del mes
     * ============================================================= */

    /**
     * `silencioso`: al cambiar de mes se pide sin tapar la pantalla con un spinner, y si no
     * se puede, la pantalla buena se queda como estaba. Devuelve una promesa de si pinto.
     */
    function cargar(silencioso) {
        var mio = ++ticket;
        if (!silencioso) CDK.estados.cargando(contenido, "Cargando la cobertura de tus marcas…");

        return C.marcas(periodo)
            .then(function (d) {
                if (mio !== ticket) return false;
                if (d.sinMarcas) { pintarSinMarcas(d); return true; }

                /* Algo que no es lo que dice el contrato no se pinta a ojo. */
                if (!Array.isArray(d.marcas)) {
                    if (silencioso) CDK.toast("No se pudo actualizar la pantalla. La respuesta no trae las marcas.", "error");
                    else CDK.estados.error(contenido, "La respuesta no trae las marcas.", function () { cargar(); });
                    return false;
                }

                lista = d;
                if (d.actual !== false) actual = { anno: d.anno, mes: d.mes };
                pintarMarcas();
                return true;
            })
            .catch(function (err) {
                if (mio !== ticket) return false;
                if (esSesionVencida(err)) return false;
                if (M.statusDe(err) === "no identificado") { pintarSinAlta(); return true; }

                if (silencioso) {
                    CDK.toast("No se pudo actualizar la pantalla. " + M.mensajeError(err), "error");
                    return false;
                }
                CDK.estados.error(contenido, err, function () { cargar(); });
                return false;
            });
    }

    /**
     * Sin marcas este mes no hay cobertura que ver: lo que falta es elegirlas. En un mes
     * anterior es otra cosa —entonces no tenías—, y no hay nada que elegir. En los dos casos
     * se puede ir a otro mes.
     */
    function pintarSinMarcas(d) {
        lista = null;
        titulo.textContent = d.enEseMes ? M.periodo(periodo || {}) + " · sin marcas" : "Sin marcas este mes";
        contenido.innerHTML = "";

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "cobertura-meses" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Cobertura de clientes" }),
            selectorDeMes()
        ]));

        if (d.enEseMes) {
            contenido.appendChild(el("section", { clase: "cdk-seccion", id: "cobertura-sin-marcas-mes" }, [
                el("h2", { clase: "cdk-seccion__titulo", texto: "No tenías marcas en " + M.periodo(periodo || {}) }),
                el("p", { clase: "cdk-seccion__sub", style: "margin:0",
                          texto: "Ese mes no tenías marcas asignadas, así que no hay cobertura que ver." })
            ]));
            return;
        }

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "cobertura-sin-marcas" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no tienes marcas este mes" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "La cobertura sale de las marcas que tienes en el mes en curso: sin ellas no hay " +
                             "nada que consultar." }),
            d.msg ? el("p", { clase: "cdk-pista", style: "margin:0 0 14px", texto: d.msg }) : null,
            el("a", { href: CDK.rutas.app("/marcas.html"), clase: "cdk-boton cdk-boton--primario",
                      texto: "Elegir mis marcas" })
        ]));
    }

    function pintarSinAlta() {
        titulo.textContent = "Falta completar tu registro";
        contenido.innerHTML = "";

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "cobertura-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para ver la cobertura de tus marcas primero tienes que completar tu registro en la intranet." }),
            el("a", { href: CDK.rutas.registro(), clase: "cdk-boton cdk-boton--primario",
                      texto: "Completar mi registro" })
        ]));
    }

    /* ---------------------------------------------------------------
     * Filtros de la lista
     * ------------------------------------------------------------- */
    function pasaFiltro(m, texto) {
        if (filtro === "mias" && !m.dueno.soyYo) return false;
        if (filtro.indexOf("u:") === 0 && m.dueno.codusu !== filtro.slice(2)) return false;

        if (!texto) return true;
        var aguja = texto.toLowerCase();
        return [m.nombre, m.abrmar, m.codmar].some(function (c) {
            return String(c || "").toLowerCase().indexOf(aguja) !== -1;
        });
    }

    /** Un `<select>` con quien tiene cada marca. Solo para la jefatura: a un especialista
        todas le salen suyas y filtrar no le diria nada. */
    function selectorDeDuenos(alCambiar) {
        var cuentas = {};
        lista.marcas.forEach(function (m) {
            var c = cuentas[m.dueno.codusu] || (cuentas[m.dueno.codusu] = { nombre: m.dueno.nombre, n: 0, yo: m.dueno.soyYo });
            c.n++;
        });

        var opciones = [{ valor: "todas", texto: "Todas (" + lista.marcas.length + ")" }];
        var mias = lista.marcas.filter(function (m) { return m.dueno.soyYo; }).length;
        if (mias) opciones.push({ valor: "mias", texto: "Mías (" + mias + ")" });

        Object.keys(cuentas)
            .filter(function (u) { return !cuentas[u].yo; })
            .sort(function (a, b) { return cuentas[a].nombre.localeCompare(cuentas[b].nombre); })
            .forEach(function (u) {
                opciones.push({ valor: "u:" + u, texto: cuentas[u].nombre + " (" + cuentas[u].n + ")" });
            });

        /* Si lo que estaba elegido ya no existe tras cambiar de mes, el filtro se quedaria
           apuntando a nada y la lista saldria vacia sin explicacion. */
        if (!opciones.some(function (o) { return o.valor === filtro; })) filtro = "todas";

        var s = el("select", { id: "cobertura-filtro", clase: "cdk-entrada" }, opciones.map(function (o) {
            var op = el("option", { value: o.valor, texto: o.texto });
            if (o.valor === filtro) op.selected = true;
            return op;
        }));
        s.addEventListener("change", function () { filtro = s.value; alCambiar(); });
        return s;
    }

    /** Los tres numeros de una lista o de una marca, tal como los dice el backend. */
    function totales(t, etiquetaClientes, id) {
        return el("div", { clase: "cdk-totales", id: id }, [
            el("div", { clase: "cdk-total cdk-total--principal" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: etiquetaClientes }),
                el("span", { clase: "cdk-total__valor", id: id + "-clientes", texto: entero(t.clientes) })
            ]),
            el("div", { clase: "cdk-total" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Unidades" }),
                el("span", { clase: "cdk-total__valor", id: id + "-unidades", texto: entero(t.unidades) })
            ]),
            el("div", { clase: "cdk-total" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Venta (US$, sin IGV)" }),
                el("span", { clase: "cdk-total__valor", id: id + "-venta", texto: dolares(t.venta) })
            ])
        ]);
    }

    /** La segunda linea de una marca: su familia y, a la jefatura, de quien es. */
    function detalleDe(m, jefatura) {
        var partes = [m.familia];
        if (jefatura && !m.dueno.soyYo) partes.push(m.dueno.nombre);
        return partes.join(" · ");
    }

    function rolTexto(rol) { return rol === "JEFATURA" ? "Jefatura" : "Especialista"; }

    function pintarMarcas() {
        ticket++;
        contenido.innerHTML = "";

        var pasado = lista.actual === false;
        var jefatura = lista.rol === "JEFATURA";
        titulo.textContent = M.periodo(lista) + " · " + rolTexto(lista.rol) + (pasado ? " · mes cerrado" : "");

        var buscador = el("input", {
            type: "search", id: "cobertura-buscar-marca", clase: "cdk-entrada", autocomplete: "off",
            placeholder: "Buscar una marca", "aria-label": "Buscar una marca", value: busquedaMarca
        });
        var destino = el("div", { id: "cobertura-lista", style: "margin-top:12px" });

        function repintar() {
            busquedaMarca = buscador.value.trim();
            destino.innerHTML = "";
            var visibles = lista.marcas.filter(function (m) { return pasaFiltro(m, busquedaMarca); });

            if (!visibles.length) {
                CDK.estados.vacio(destino, "Ninguna marca coincide.");
                return;
            }

            var ul = el("ul", { clase: "cdk-articulos", id: "cobertura-marcas" });
            visibles.forEach(function (m) {
                var item = CDK.articulo({
                    distintivo: m.codmar,
                    nombre: CDK.resaltar(M.nombre(m), busquedaMarca),
                    importe: dolares(m.venta),
                    detalle: detalleDe(m, jefatura),
                    /* Una marca sin clientes se dice ya aqui, atenuada: «0» y «sin dato» no son lo mismo. */
                    datos: [
                        { etiqueta: "Clientes", valor: entero(m.clientes), tono: m.clientes === 0 ? "nulo" : null },
                        { etiqueta: "Unidades", valor: entero(m.unidades), tono: m.unidades === 0 ? "nulo" : (m.unidades < 0 ? "alerta" : null) }
                    ],
                    alPulsar: function () { verClientes(m); }
                });
                item.setAttribute("data-codmar", m.codmar);
                ul.appendChild(item);
            });
            destino.appendChild(ul);
        }

        buscador.addEventListener("input", repintar);

        var campos = [];
        if (jefatura) {
            campos.push(el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "cobertura-filtro", texto: "Ver las marcas de" }),
                selectorDeDuenos(repintar)
            ]));
        }
        campos.push(el("div", { clase: "cdk-campo" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "cobertura-buscar-marca", texto: "Buscar" }),
            buscador
        ]));

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "cobertura-resumen" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Cobertura de clientes" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "A qué clientes se les vendió cada marca en el mes. Todo en dólares y sin IGV, " +
                             "con lo mismo que cuenta como venta en la cuota." }),
            selectorDeMes(),
            totales(lista.total, "Clientes", "cobertura-total"),
            lista.marcas.length > 1
                ? el("p", { clase: "cdk-pista", id: "cobertura-nota-distintos", style: "margin:10px 0 0",
                            texto: "Son clientes distintos: uno que compró dos marcas cuenta una sola vez, por eso no es la suma " +
                                   "de los clientes de cada marca." })
                : null
        ]));

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "cobertura-marcas-seccion" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Elige una marca" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: jefatura
                          ? (pasado ? "Las tuyas y las de tus especialistas de ese mes." : "Las tuyas y las de tus especialistas que son de tu familia.")
                          : (pasado ? "Las marcas que tenías ese mes." : "Las marcas que tienes este mes, las hayas confirmado o no.") })
        ].concat(campos, [destino])));

        repintar();
    }

    /* ===============================================================
     * 2 · Los clientes de una marca
     * ============================================================= */
    function verClientes(m) {
        var mio = ++ticket;
        var elegida = periodo;

        contenido.innerHTML = "";
        contenido.appendChild(cabeceraDeMarca(m, null));

        var destino = el("div", { id: "cobertura-clientes-caja" });
        contenido.appendChild(destino);
        CDK.estados.cargando(destino, "Cargando los clientes de " + M.nombre(m) + "…");

        C.clientes(m.codmar, elegida)
            .then(function (d) {
                if (mio !== ticket) return;                    // eligieron otra cosa mientras llegaba
                if (d.sinMarcas) return pintarSinMarcas(d);

                if (!Array.isArray(d.clientes)) {
                    CDK.estados.error(destino, "La respuesta no trae los clientes.", function () { verClientes(m); });
                    return;
                }
                pintarClientes(m, d);
            })
            .catch(function (err) {
                if (mio !== ticket) return;
                if (esSesionVencida(err)) return;

                var estado = M.statusDe(err);
                if (estado === "no identificado") return pintarSinAlta();

                /* La marca ya no esta entre las que puede consultar: la lista que se enseño esta
                   desfasada (le quitaron la marca, o cambio de mes). Se dice y se vuelve a pedir. */
                if (estado === "marca no disponible") {
                    CDK.toast(M.mensajeError(err), "aviso", 6000);
                    cargar();
                    return;
                }

                CDK.estados.error(destino, err, function () { verClientes(m); });
            });
    }

    /** La marca elegida, con el camino de vuelta, y los numeros de la marca en cuanto llegan. */
    function cabeceraDeMarca(m, d) {
        var cambiar = el("button", { type: "button", id: "cobertura-cambiar", "aria-label": "Volver a las marcas",
                                     clase: "cdk-boton cdk-boton--suave", texto: "Marcas" });
        cambiar.addEventListener("click", function () { ticket++; pintarMarcas(); });

        var jefatura = lista && lista.rol === "JEFATURA";
        var dueno = (d && d.marca && d.marca.dueno) || m.dueno;

        return el("section", { clase: "cdk-seccion", id: "cobertura-marca" }, [
            el("div", { clase: "cdk-elegido" }, [
                el("div", { clase: "cdk-elegido__datos" }, [
                    /* Un nombre como EP_IMPRESORAS no tiene un espacio donde partir. */
                    el("div", { clase: "cdk-elegido__nombre", id: "cobertura-marca-nombre",
                                style: "overflow-wrap:anywhere", texto: M.nombre(m) }),
                    el("div", { clase: "cdk-elegido__detalle",
                                texto: m.codmar + " · " + detalleDe({ familia: m.familia, dueno: dueno }, jefatura) })
                ]),
                cambiar
            ]),
            el("p", { clase: "cdk-pista", id: "cobertura-marca-mes", style: "margin:10px 0 0",
                      texto: d ? M.periodo(d) + (d.actual === false ? " · mes cerrado" : "")
                               : (periodo ? M.periodo(periodo) : M.periodo(mesEnCurso())) })
        ]);
    }

    function pintarClientes(m, d) {
        ticket++;
        contenido.innerHTML = "";
        contenido.appendChild(cabeceraDeMarca(m, d));

        var hayDevoluciones = d.clientes.some(function (c) { return c.unidades <= 0; });
        var consulta = "";
        var verTodos = false;

        /* El Excel lleva el mes que se VE, no el que esta elegido en otra parte. */
        var exportar = el("button", { type: "button", id: "cobertura-exportar",
                                      clase: "cdk-boton cdk-boton--primario", texto: "Exportar a Excel" });
        exportar.addEventListener("click", function () {
            descargar(exportar, m, d.actual === false ? { anno: d.anno, mes: d.mes } : null);
        });

        var buscador = el("input", {
            type: "search", id: "cobertura-buscar-cliente", clase: "cdk-entrada", autocomplete: "off",
            placeholder: "Buscar por nombre o RUC", "aria-label": "Buscar un cliente"
        });
        var destino = el("div", { id: "cobertura-clientes", style: "margin-top:12px" });

        function pasa(c) {
            if (!consulta) return true;
            var aguja = consulta.toLowerCase();
            return String(c.nombre || "").toLowerCase().indexOf(aguja) !== -1 || String(c.ruc || "").indexOf(aguja) !== -1;
        }

        function repintar() {
            destino.innerHTML = "";

            if (!d.clientes.length) {
                CDK.estados.vacio(destino, "Nadie compró " + M.nombre(m) + " en " + M.periodo(d) + ".");
                return;
            }

            var visibles = d.clientes.filter(pasa);
            if (!visibles.length) {
                CDK.estados.vacio(destino, "Ningún cliente coincide.");
                return;
            }

            var pintados = verTodos ? visibles : visibles.slice(0, TOPE);

            var ul = el("ul", { clase: "cdk-articulos", id: "cobertura-lista-clientes" });
            pintados.forEach(function (c) { ul.appendChild(filaDeCliente(c, consulta)); });
            destino.appendChild(ul);

            if (pintados.length < visibles.length) {
                var mas = el("button", { type: "button", id: "cobertura-ver-todos", clase: "cdk-boton cdk-boton--suave",
                                         style: "margin-top:12px",
                                         texto: "Mostrar los " + entero(visibles.length - pintados.length) + " restantes" });
                mas.addEventListener("click", function () { verTodos = true; repintar(); });
                destino.appendChild(mas);
            }
        }

        buscador.addEventListener("input", function () {
            consulta = buscador.value.trim();
            repintar();
        });

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "cobertura-clientes-seccion" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Clientes de " + M.nombre(m) }),
            el("p", { clase: "cdk-seccion__sub", style: "margin:0 0 4px",
                      texto: "De los que más compraron a los que menos. Venta en dólares y sin IGV, ya descontadas las notas de crédito." }),
            totales(d.total, "Clientes", "cobertura-marca-total"),
            hayDevoluciones
                ? el("p", { clase: "cdk-pista", id: "cobertura-nota-devoluciones", style: "margin:10px 0 0",
                            texto: "Quien en el mes no tiene unidades netas —solo devolvió, o solo tuvo notas de crédito o de débito— " +
                                   "sale con 0 o con negativos, y no cuenta como cliente de la marca." })
                : null,
            /* Sin clientes no hay nada que buscar ni que exportar: una hoja vacia no sirve. */
            d.clientes.length
                ? el("div", { clase: "cdk-campo", style: "margin-top:14px" }, [
                      el("label", { clase: "cdk-campo__etiqueta", "for": "cobertura-buscar-cliente", texto: "Buscar" }),
                      el("div", { clase: "cdk-buscador" }, [
                          el("div", { clase: "cdk-buscador__campo" }, [buscador]),
                          exportar
                      ])
                  ])
                : null,
            destino
        ]));

        repintar();
    }

    function filaDeCliente(c, consulta) {
        var cuenta = c.unidades > 0;
        var detalle = CDK.resaltar("RUC " + c.ruc, consulta);
        /* Un 0 no siempre es «devolvio todo»: tambien notas de credito sin unidades o solo notas de debito. */
        if (!cuenta) detalle.push(document.createTextNode(" · no cuenta: " + (c.unidades < 0 ? "solo devoluciones" : "sin unidades netas en el mes")));

        var item = CDK.articulo({
            nombre: CDK.resaltar(c.nombre, consulta),
            importe: dolares(c.venta),
            detalle: detalle,
            datos: [
                { etiqueta: "Unidades", valor: entero(c.unidades), tono: cuenta ? null : "alerta" },
                { etiqueta: "Comprobantes", valor: entero(c.comprobantes) },
                { etiqueta: "Última compra", valor: CDK.formato.fecha(c.ultimaCompra) }
            ]
        });
        item.setAttribute("data-codcli", c.codcli);
        return item;
    }

    /**
     * Exporta a Excel. El archivo se pide aparte, no se arma con la lista que se ve: lo que se descarga es
     * exactamente lo que dice el backend, con todos los clientes.
     */
    function descargar(boton, m, periodoVisto) {
        if (boton.disabled) return;

        var texto = boton.textContent;
        boton.disabled = true;
        boton.textContent = "Generando…";

        C.exportar(m.codmar, periodoVisto)
            .then(function (r) {
                guardar(r.blob, r.nombre);
                CDK.toast("Se descargó " + r.nombre, "exito");
            })
            .catch(function (err) {
                if (esSesionVencida(err)) return;

                var estado = M.statusDe(err);
                if (estado === "no identificado") return pintarSinAlta();

                /* Si la marca ya no esta entre las que puede consultar, la lista esta desfasada: se dice y se vuelve a pedir. */
                if (estado === "marca no disponible") {
                    CDK.toast(M.mensajeError(err), "aviso", 6000);
                    cargar();
                    return;
                }

                CDK.toast(M.mensajeError(err), "error", 6000);
            })
            .then(function () {
                boton.disabled = false;
                boton.textContent = texto;
            });
    }

    /** Guarda el archivo: un enlace con `download` sobre un blob, que es lo unico que dispara la descarga sin salir de la pagina. */
    function guardar(blob, nombre) {
        var url = window.URL.createObjectURL(blob);
        var a = el("a", { href: url, download: nombre, style: "display:none" });

        document.body.appendChild(a);
        a.click();
        a.remove();

        /* No se revoca ya: algunos navegadores empiezan a leer el blob despues del clic, y revocarlo antes corta la descarga. */
        setTimeout(function () { window.URL.revokeObjectURL(url); }, 2000);
    }

})();
