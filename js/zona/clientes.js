/**
 * Clientes de un vendedor del grupo 20 (grupo 34, jefe de zona): su cartera, si es de CARTERA, o su cobertura, si es de COBERTURA.
 *
 * El módulo se llama **Cobertura** en pantalla (la clave del menú sigue siendo `clientes`). Tres pasos: sin nada elegido, **cartera o
 * cobertura**; con `?tipo=CARTERA`, la lista de los vendedores de ese tipo (la misma del avance); y con `?codusu=293` —y `&tipo=CARTERA`,
 * que es solo una pista— los clientes de ese vendedor en el mes: cuántos atendió, de quién eran, cuáles se le están yendo, y cómo va
 * frente a los 3 meses anteriores a esta misma altura. El código del cliente no se muestra en ninguna parte.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona entiende:
 *
 *   · **Una clave del menú, dos rutas.** El menú trae `clientes` y no dice cuál: `/zona/cartera` o `/zona/cobertura` la elige la
 *     pantalla por el `tipo` del vendedor. Y **el tipo es el de la cuota que registró ESE mes** (o, si no registró, el de hoy): un
 *     vendedor puede ser de COBERTURA en agosto y de CARTERA hoy. Por eso, si la ruta responde `400 vendedor de otro tipo`, se pide
 *     a la otra, una sola vez; el `tipo` de la dirección es solo la primera apuesta.
 *   · **Nada se calcula aquí.** Los totales, los porcentajes, los desgloses, la concentración, el riesgo y la comparación vienen
 *     del backend; la pantalla los pinta y dice qué significan. Ninguna suma sale de las filas: no tienen por qué cuadrar.
 *   · **Lo que le cuenta a un vendedor de CARTERA** es lo que facturó **él** a clientes de **cualquier** vendedor de cartera. Lo que
 *     otros les facturan a sus clientes **no le cuenta** (se muestra para que se vea), y lo que él factura a clientes que no son de
 *     cartera no le cuenta a nadie. Los **libres** (oficina o sin dueño) son la excepción: su monto no cuenta, pero el cliente sí
 *     cuenta como atendido en su cobertura de clientes.
 *   · **`porDueno` de la cobertura no cierra con lo facturado**: solo suma los clientes atendidos, y quedan fuera los que terminaron
 *     el mes en 0 o en negativo por notas de crédito. Tampoco `suyos` es lo mismo que `asignados atendidos`: uno mira el dueño que
 *     figura en SUS facturas y el otro su cartera de hoy. La pantalla rotula cada uno por lo que es.
 *   · **En un mes anterior la lista de asignados puede estar incompleta**: el maestro de clientes no guarda historia, y un cliente
 *     que tuvo entonces, que hoy ya no tiene y que no compró ese mes, no se puede saber. La pantalla lo avisa.
 *   · La lista de la cobertura trae a los atendidos **y** a los que terminaron en 0 o en negativo: no se cuenta con `length`.
 *   · **La lista principal es compacta** (la opción D de dev/cobertura-variantes.html, elegida el 27/10): pestañas de filtro de a una
 *     —no los dos desplegables de antes, que se combinaban— y dos líneas por cliente, con el resto al tocar la fila. Lo que se ve
 *     en la fila es lo que manda el backend; lo único que se hace aquí es filtrar y ordenar como viene. Las listas plegables de
 *     abajo (en riesgo, de otra cartera, fuera de cartera) siguen con su tarjeta.
 *   · Es en dólares CON IGV. Cada llamada se calcula al vuelo y recorre las facturas del mes: se actualiza con un botón (no solo,
 *     porque una lista larga que se repinta sola te quita el lugar).
 *
 * Ver docs/zona-grupo34.md, sección 8.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var Z = CDK.zona;
    var M = CDK.marcas;                 // periodo(), statusDe(), mensajeError()

    var contenido = document.getElementById("contenido");
    var titulo = document.getElementById("periodo");

    if (!contenido) return;

    var consulta = new URLSearchParams(location.search);
    var codusu = (consulta.get("codusu") || "").trim();

    var tipoDePista = (consulta.get("tipo") || "").trim().toUpperCase();   // solo CARTERA o COBERTURA; si no, vacio
    if (tipoDePista !== "CARTERA" && tipoDePista !== "COBERTURA") tipoDePista = "";
    var tipo = tipoDePista || "CARTERA";                                   // la primera apuesta; la respuesta dice cual era

    var datos = null;                   // lo ultimo que dijo GET /zona/cartera o /zona/cobertura
    var periodo = null;                 // null = el mes en curso; { anno, mes } = uno de los tres anteriores
    var actual = null;                  // { anno, mes } del mes en curso, en cuanto el servidor lo dice
    var ticket = 0;                     // descarta respuestas de pedidos viejos

    var busqueda = "";
    var filtroLista = "todos";          // la pestaña de la lista principal. Cartera: todos | atendidos | sin. Cobertura: todos | nuevos | propio | cartera | libre | otro | no

    /* ---------------------------------------------------------------
     * Formatos
     * ------------------------------------------------------------- */
    function dolares(v) { return CDK.formato.moneda(v, "D"); }
    function porciento(v) { return CDK.formato.porcentaje(v, 1); }
    function entero(v) { return CDK.formato.numero(v, 0); }
    function plural(n, uno, varios) { return entero(n) + " " + (n === 1 ? uno : varios); }
    function fecha(f) { return f ? CDK.formato.fecha(f) : ""; }
    function esSesionVencida(err) { return CDK.http.esError(err) && err.status === 401; }     // ya redirige

    var TIPOS = { COBERTURA: "Cobertura", CARTERA: "Cartera" };

    /** `2026-10-22 18:47:06` → `18:47`. */
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

    /** Un rótulo corto, con TEXTO: el color solo acompaña. */
    function rotulo(texto, estado, id) {
        return el("span", { clase: "cdk-semaforo" + (estado ? " cdk-semaforo--" + estado : ""), id: id || null, texto: texto });
    }

    /** Filas de «etiqueta … valor». Cada una: [etiqueta, valor, id, principal?]. */
    function totales(filas) {
        return el("div", { clase: "cdk-totales" }, filas.map(function (f) {
            return el("div", { clase: "cdk-total" + (f[3] ? " cdk-total--principal" : "") }, [
                el("span", { clase: "cdk-total__etiqueta", texto: f[0] }),
                el("span", { clase: "cdk-total__valor", id: f[2] || null, texto: f[1] })
            ]);
        }));
    }

    function pista(texto, id) { return el("p", { clase: "cdk-pista", id: id || null, style: "margin:8px 0 0", texto: texto }); }

    /** Vuelve a la lista de vendedores del mismo tipo; si no se sabe cual es, a elegir entre cartera y cobertura. */
    function enlaceAElegir(texto) {
        var conocido = datos ? tipo : tipoDePista;
        return el("a", { href: CDK.rutas.app("/clientes.html" + (conocido ? "?tipo=" + conocido : "")), id: "zc-elegir-otro",
                         clase: "cdk-boton cdk-boton--suave", texto: texto || "Elegir otro vendedor" });
    }

    /* ===============================================================
     * Primero: cartera o cobertura
     * ============================================================= */
    var OPCIONES = [
        { tipo: "CARTERA", nombre: "Cartera",
          detalle: "Vendedores con una cartera de clientes: cuántos de sus clientes atendió, cuáles se le están yendo y qué le cuenta." },
        { tipo: "COBERTURA", nombre: "Cobertura",
          detalle: "Vendedores que le venden a cualquier cliente: a cuántos atendió, de quién eran y cuáles son nuevos." }
    ];

    function elegirTipo() {
        titulo.textContent = "¿Qué vendedores quieres ver?";
        contenido.innerHTML = "";

        var ul = el("ul", { clase: "cdk-articulos", id: "zc-tipos" });
        OPCIONES.forEach(function (o) {
            var item = CDK.articulo({
                nombre: o.nombre,
                detalle: o.detalle,
                alPulsar: function () { location.assign(CDK.rutas.app("/clientes.html?tipo=" + o.tipo)); }
            });
            item.setAttribute("data-opcion", o.tipo);          // no `data-tipo`: el shell lo usa para ocultar por tipo de usuario y borraria la fila
            ul.appendChild(item);
        });

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "zc-elegir-tipo" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Elige cartera o cobertura" }),
            el("p", { clase: "cdk-seccion__sub", texto: "Cada tipo de vendedor se mira distinto. Después eliges al vendedor." }),
            ul
        ]));
    }

    /* ===============================================================
     * Luego: el vendedor, de ese tipo
     * ============================================================= */
    function elegir() {
        var mio = ++ticket;
        titulo.textContent = "Vendedores de " + TIPOS[tipoDePista].toLowerCase();
        CDK.estados.cargando(contenido, "Buscando a los vendedores…");

        Z.avance(null)
            .then(function (d) {
                if (mio !== ticket) return;
                if (!d || !Array.isArray(d.vendedores)) {
                    CDK.estados.error(contenido, "La respuesta no trae los vendedores.", elegir);
                    return;
                }
                pintarVendedores(d);
            })
            .catch(function (err) {
                if (mio !== ticket) return;
                if (esSesionVencida(err)) return;
                CDK.estados.error(contenido, err, elegir);
            });
    }

    function pintarVendedores(d) {
        contenido.innerHTML = "";

        var buscador = el("input", { type: "search", id: "zc-elegir-buscar", clase: "cdk-entrada", autocomplete: "off",
                                     placeholder: "Buscar un vendedor", "aria-label": "Buscar un vendedor" });
        var destino = el("div", { id: "zc-elegir-lista", style: "margin-top:12px" });

        /* Los que tienen cuota este mes y los que no: los clientes se pueden pedir de cualquiera del grupo 20. Solo los del tipo
           elegido: el `tipo` de cada uno es el de su cuota de este mes o, si no la registro, el de hoy. */
        var todos = d.vendedores.concat(d.sinCuota || []).filter(function (v) { return v.tipo === tipoDePista; });

        function repintar() {
            destino.innerHTML = "";
            var aguja = buscador.value.trim().toLowerCase();
            var visibles = todos.filter(function (v) {
                return !aguja || String(v.nombre || "").toLowerCase().indexOf(aguja) !== -1 || String(v.codven || "").toLowerCase().indexOf(aguja) !== -1;
            });

            if (!visibles.length) {
                CDK.estados.vacio(destino, todos.length ? "Ningún vendedor coincide." : "No hay vendedores de " + TIPOS[tipoDePista].toLowerCase() + ".");
                return;
            }

            var ul = el("ul", { clase: "cdk-articulos", id: "zc-vendedores" });
            visibles.forEach(function (v) {
                var item = CDK.articulo({
                    nombre: v.nombre,
                    detalle: v.codven,
                    alPulsar: function () {
                        location.assign(CDK.rutas.app("/clientes.html?codusu=" + encodeURIComponent(v.codusu) + "&tipo=" + encodeURIComponent(v.tipo || "")));
                    }
                });
                item.setAttribute("data-codusu", v.codusu);
                ul.appendChild(item);
            });
            destino.appendChild(ul);
        }

        buscador.addEventListener("input", repintar);

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "zc-elegir" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Elige un vendedor de " + TIPOS[tipoDePista].toLowerCase() }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: tipoDePista === "CARTERA"
                          ? "Verás su cartera: cuántos de sus clientes atendió, cuáles se le están yendo y qué le cuenta."
                          : "Verás su cobertura: a cuántos clientes atendió, de quién eran y cuáles son nuevos." }),
            el("div", { clase: "cdk-acciones-fila" }, [
                el("a", { href: CDK.rutas.app("/clientes.html"), id: "zc-cambiar-tipo", clase: "cdk-boton cdk-boton--suave", texto: "Ver otro tipo" })
            ]),
            el("div", { clase: "cdk-campo", style: "margin-top:12px" }, [el("label", { clase: "cdk-campo__etiqueta", "for": "zc-elegir-buscar", texto: "Buscar" }), buscador]),
            destino
        ]));

        repintar();
    }

    /* ---------------------------------------------------------------
     * Meses: el en curso y los tres anteriores
     * ------------------------------------------------------------- */
    var MESES_ATRAS = 3;                // lo que acepta el backend; un mes mas atras es `400 periodo invalido`

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
        for (var n = 1; n <= MESES_ATRAS; n++) {
            var p = mesesAtras(base, n);
            opciones.push({ valor: claveDe(p), texto: M.periodo(p) });
        }

        var elegida = periodo ? claveDe(periodo) : "";
        var s = el("select", { id: "zc-mes", clase: "cdk-entrada" }, opciones.map(function (o) {
            var op = el("option", { value: o.valor, texto: o.texto });
            if (o.valor === elegida) op.selected = true;
            return op;
        }));
        s.addEventListener("change", function () { irAlMes(s); });

        return el("div", { clase: "cdk-campo", style: "margin-top:12px" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "zc-mes", texto: "Mes" }), s
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
    function pedir(t) {
        return (t === "CARTERA" ? Z.cartera : Z.cobertura)(codusu, periodo).then(function (d) { return { d: d, tipo: t }; });
    }

    /**
     * El tipo de un vendedor es el de la cuota que registro ESE mes, y puede no ser el de la ultima vez que se miro: si la ruta
     * dice que es de otro tipo, se pide a la otra, una sola vez. Devuelve `{ d, tipo }` con la ruta que contesto.
     */
    function traer() {
        var primero = tipo;
        return pedir(primero).catch(function (err) {
            if (M.statusDe(err) !== "vendedor de otro tipo") throw err;
            return pedir(primero === "CARTERA" ? "COBERTURA" : "CARTERA");
        });
    }

    /**
     * `silencioso`: al cambiar de mes o al actualizar se pide sin tapar la pantalla con un spinner, y si no se puede, la pantalla
     * buena se queda como estaba. Devuelve una promesa de si pinto.
     */
    function cargar(silencioso) {
        var mio = ++ticket;
        if (!silencioso) CDK.estados.cargando(contenido, "Calculando los clientes de este vendedor…");

        return traer()
            .then(function (r) {
                if (mio !== ticket) return false;
                var d = r.d;

                /* Algo que no es lo que dice el contrato no se pinta a ojo. */
                if (!d || !d.vendedor || !d.resumen || !Array.isArray(d.clientes)) {
                    if (silencioso) CDK.toast("No se pudo actualizar la pantalla. La respuesta no trae los clientes.", "error");
                    else CDK.estados.error(contenido, "La respuesta no trae los clientes.", function () { cargar(); });
                    return false;
                }

                datos = d;
                tipo = r.tipo;
                if (d.actual !== false) actual = { anno: d.anno, mes: d.mes };
                pintar();
                return true;
            })
            .catch(function (err) {
                if (mio !== ticket) return false;
                if (esSesionVencida(err)) return false;

                /* Un `codusu` que no es de un vendedor del grupo 20: no hay nada que reintentar, se elige otro. */
                if (M.statusDe(err) === "vendedor desconocido" || M.statusDe(err) === "vendedor requerido") {
                    titulo.textContent = "Vendedor no encontrado";
                    contenido.innerHTML = "";
                    contenido.appendChild(el("section", { clase: "cdk-seccion", id: "zc-desconocido" }, [
                        el("h2", { clase: "cdk-seccion__titulo", texto: "No encontramos a ese vendedor" }),
                        el("p", { clase: "cdk-seccion__sub", texto: M.mensajeError(err) }),
                        enlaceAElegir()
                    ]));
                    return false;
                }

                if (silencioso) {
                    CDK.toast("No se pudo actualizar la pantalla. " + M.mensajeError(err), "error");
                    return false;
                }
                CDK.estados.error(contenido, err, function () { cargar(); });
                return false;
            });
    }

    /* ===============================================================
     * La pantalla
     * ============================================================= */
    function pintar() {
        contenido.innerHTML = "";

        var d = datos;
        var vivo = d.actual !== false;
        var cartera = tipo === "CARTERA";

        titulo.textContent = d.vendedor.nombre + " · " + (vivo ? "actualizado a las " + hora(d.actualizado) : M.periodo(d) + " · mes cerrado");

        contenido.appendChild(cabecera(d, vivo));

        (cartera ? seccionesDeCartera(d) : seccionesDeCobertura(d)).forEach(function (s) { contenido.appendChild(s); });

        if (Array.isArray(d.comparacion) && d.comparacion.length) contenido.appendChild(comparacion(d, vivo));
        if (d.riesgo && Array.isArray(d.riesgo.lista)) contenido.appendChild(riesgo(d, cartera));

        contenido.appendChild(listaDeClientes(d, cartera));

        if (cartera) {
            if (Array.isArray(d.reemplazo) && d.reemplazo.length) contenido.appendChild(listaDeReemplazo(d));
            if (Array.isArray(d.fueraDeCartera) && d.fueraDeCartera.length) contenido.appendChild(listaFueraDeCartera(d));
        }
    }

    /**
     * Los reemplazos por vacaciones de este vendedor: quien atendio su cartera, y a quienes atendio el. Todo viene del backend, que
     * los deduce de las facturas (no estan registrados en ninguna parte): por eso se dice «parece» y no se da por hecho.
     */
    function notasDeReemplazo(x) {
        var notas = [];

        function detalle(r) { return "el " + porciento(r.porcentaje) + " de lo facturado a sus clientes: " + dolares(r.venta); }

        if (x.reemplazadoPor) {
            notas.push(el("p", { clase: "cdk-pista", id: "zc-reemplazado", "data-reemplazo": "reemplazado", style: "margin:10px 0 0",
                                 texto: "Parece estar de vacaciones: su cartera la atendió " + x.reemplazadoPor.nombre + " (" + detalle(x.reemplazadoPor) + ")." }));
        }

        (Array.isArray(x.reemplazaA) ? x.reemplazaA : []).forEach(function (r) {
            notas.push(el("p", { clase: "cdk-pista", id: "zc-reemplaza-" + r.codven, "data-reemplazo": "reemplaza", style: "margin:10px 0 0",
                                 texto: "Reemplaza a " + r.nombre + ": atendió su cartera (" + detalle(r) + ")." }));
        });

        return notas;
    }

    /** Quien es, el mes, hasta cuando se cuenta, y lo que hay que saber de un mes anterior. */
    function cabecera(d, vivo) {
        var actualizar = el("button", { type: "button", id: "zc-actualizar", clase: "cdk-boton cdk-boton--suave", texto: "Actualizar" });
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
            el("div", { clase: "cdk-elegido" }, [
                el("div", { clase: "cdk-elegido__datos" }, [
                    el("div", { clase: "cdk-elegido__nombre", id: "zc-nombre", style: "overflow-wrap:anywhere", texto: d.vendedor.nombre }),
                    el("div", { clase: "cdk-elegido__detalle", id: "zc-detalle",
                                texto: (TIPOS[d.vendedor.tipo] || d.vendedor.tipo || "") + " · " + d.vendedor.codven })
                ]),
                enlaceAElegir("Cambiar")
            ]),
            selectorDeMes(),
            pista(vivo ? "Hasta hoy, " + fecha(d.corte) + ". Todo en dólares y con IGV."
                       : "Mes cerrado: hasta el " + fecha(d.corte) + ". Todo en dólares y con IGV.", "zc-corte")
        ];

        /* El maestro de clientes no guarda historia: en un mes anterior los asignados se arman con lo que dicen las facturas. */
        if (!vivo) {
            hijos.push(el("div", { clase: "cdk-aviso", id: "zc-aviso-historia", style: "margin:12px 0 0" }, [
                el("p", { clase: "cdk-aviso__texto",
                          texto: "Los clientes asignados de un mes anterior pueden estar incompletos: el maestro de clientes no guarda historia, así que la " +
                                 "lista se completa con las facturas de ese mes. Un cliente que tuvo entonces, que hoy ya no tiene y que no compró ese mes, no aparece." })
            ]));
        }

        notasDeReemplazo(d).forEach(function (n) { hijos.push(n); });

        if (vivo) {
            hijos.push(pista("Se calcula en el momento. Toca «Actualizar» para volver a calcularlo.", "zc-refresco"));
        }
        hijos.push(el("div", { clase: "cdk-acciones-fila", style: "margin-top:10px" }, [actualizar]));

        return el("section", { clase: "cdk-seccion", id: "zc-vendedor" }, hijos);
    }

    function seccion(id, encabezado, sub, hijos) {
        return el("section", { clase: "cdk-seccion", id: id }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: encabezado }),
            sub ? el("p", { clase: "cdk-seccion__sub", texto: sub }) : null
        ].filter(Boolean).concat(hijos));
    }

    /** Que parte de su venta sale de sus 5 clientes mas grandes. Con 70 % o mas, depende de muy pocos. */
    function concentracion(r) {
        var c = r.concentracion;
        if (!c) return null;

        if (!c.clientes) return seccion("zc-concentracion", "De cuántos clientes depende", null, [pista("No hay clientes con venta este mes.", "zc-concentracion-texto")]);

        var texto = (c.clientes === 1 ? "Su único cliente con venta suma " : "Sus " + entero(c.clientes) + " clientes más grandes suman ") + dolares(c.venta) +
                    (c.porcentaje === null || c.porcentaje === undefined ? "." : ", el " + porciento(c.porcentaje) + " de su venta.");
        var hijos = [pista(texto, "zc-concentracion-texto")];

        if (c.porcentaje >= 70) {
            hijos.push(el("p", { clase: "cdk-pista", id: "zc-concentracion-alto", style: "margin:4px 0 0;font-weight:600",
                                 texto: "Depende de muy pocos clientes." }));
        }
        return seccion("zc-concentracion", "De cuántos clientes depende", null, hijos);
    }

    /* ---------------------------------------------------------------
     * Cartera
     * ------------------------------------------------------------- */
    function seccionesDeCartera(d) {
        var r = d.resumen;
        var fuera = r.ventaFueraDeCartera;
        var cob = r.coberturaClientes;
        var secciones = [];

        secciones.push(seccion("zc-cartera", "Su cartera",
            "Los clientes que tiene asignados y cuántos atendió en el mes. «Atendido» es un cliente al que le quedó venta mayor a 0: " +
            "uno que solo tuvo notas de crédito no cuenta.", [
            el("div", { style: "margin-top:12px" }, [barra(r.porcentaje)]),
            totales([
                ["Clientes en su cartera", entero(r.asignados), "zc-asignados"],
                ["Atendidos", entero(r.atendidos) + " · " + porciento(r.porcentaje), "zc-atendidos", true],
                ["Sin atender", entero(r.sinAtender), "zc-sin-atender"]
            ])
        ]));

        secciones.push(seccion("zc-cuenta", "Lo que le cuenta",
            "Lo que facturó él a clientes de cualquier vendedor de cartera: los suyos y los de sus compañeros de cartera (por ejemplo, " +
            "cuando reemplaza a uno de vacaciones), haya un reemplazo detectado o no. Es el mismo número de su avance.", [
            totales([
                ["Lo que le cuenta (su avance)", dolares(r.venta), "zc-venta", true],
                ["Facturado a sus clientes", dolares(r.ventaPropia), "zc-venta-propia"],
                ["Facturado a clientes de otra cartera", dolares(r.ventaReemplazo), "zc-venta-reemplazo"]
            ])
        ]));

        var noCuenta = [["Facturado a sus clientes por otros vendedores", dolares(r.ventaDeOtros), "zc-venta-otros"]];
        if (fuera) noCuenta.push(["Facturado por él a clientes que no son de cartera", dolares(fuera.venta), "zc-fuera-venta"]);

        var hijosNoCuenta = [totales(noCuenta)];
        if (fuera && fuera.libres && fuera.conDueno) {
            hijosNoCuenta.push(pista("Libres (de la oficina o sin dueño): " + plural(fuera.libres.clientes, "cliente", "clientes") + ", " +
                                     entero(fuera.libres.atendidos) + " atendidos · " + dolares(fuera.libres.venta) + ".", "zc-fuera-libres"));
            hijosNoCuenta.push(pista("De un vendedor de cobertura: " + plural(fuera.conDueno.clientes, "cliente", "clientes") + " · " +
                                     dolares(fuera.conDueno.venta) + ".", "zc-fuera-con-dueno"));
        }
        hijosNoCuenta.push(pista("Lo que otros les facturan a sus clientes no le cuenta, tampoco si es de cobertura. Y lo que él factura a clientes que no son de " +
                                 "cartera no le cuenta a nadie: el dueño de cobertura solo suma lo que factura él.", "zc-nocuenta-nota"));
        secciones.push(seccion("zc-nocuenta", "Lo que no le cuenta", "Se muestra para que se vea.", hijosNoCuenta));

        if (cob) {
            secciones.push(seccion("zc-cobertura-clientes", "Su cobertura de clientes",
                "A cuántos clientes atendió en total, sumando los suyos, los de un compañero de cartera y los libres.", [
                totales([["Clientes atendidos", entero(cob.total), "zc-cobertura-total", true]]),
                pista(plural(cob.cartera, "cliente", "clientes") + " de su cartera, " + plural(cob.reemplazo, "de otra cartera", "de otra cartera") + " y " +
                      plural(cob.libres, "libre", "libres") + ".", "zc-cobertura-detalle"),
                pista("Los libres (de la oficina o sin dueño) cuentan como cliente atendido, pero su monto no cuenta. Los de un vendedor de cobertura no cuentan " +
                      "de ninguna forma: ni monto ni cliente.", "zc-cobertura-nota")
            ]));
        }

        var c = concentracion(r);
        if (c) secciones.push(c);
        return secciones;
    }

    /* ---------------------------------------------------------------
     * Cobertura
     * ------------------------------------------------------------- */
    var DUENOS = {
        propio:  "Suyos",
        cartera: "De un vendedor de cartera",
        libre:   "Libres (de la oficina o sin dueño)",
        otro:    "De otro vendedor (que no es de cartera)"
    };

    function seccionesDeCobertura(d) {
        var r = d.resumen;
        var secciones = [];

        secciones.push(seccion("zc-atendidos-seccion", "Lo que facturó",
            "Todo lo que facturó él, sea de quien sea el cliente. Es el mismo número de su avance.", [
            totales([
                ["Clientes atendidos", entero(r.atendidos), "zc-atendidos", true],
                ["Lo que facturó (su avance)", dolares(r.venta), "zc-venta"]
            ]),
            pista("«Atendido» es un cliente al que le dejó venta en el mes, sea de quien sea.", "zc-atendidos-nota")
        ]));

        if (r.porDueno) {
            secciones.push(seccion("zc-por-dueno", "De quién eran los clientes que atendió",
                "Venta a los clientes atendidos, según la factura: de quién era cada cliente en las facturas del mes.",
                [totales(["propio", "cartera", "libre", "otro"].filter(function (k) { return r.porDueno[k]; }).map(function (k) {
                    return [DUENOS[k], plural(r.porDueno[k].clientes, "cliente", "clientes") + " · " + dolares(r.porDueno[k].venta), "zc-dueno-" + k];
                })),
                pista("No cierra con lo que facturó: aquí solo van los clientes atendidos, y quedan fuera los que terminaron el mes en 0 o en negativo por notas de crédito.",
                      "zc-por-dueno-nota")]));
        }

        secciones.push(seccion("zc-asignados-seccion", "Sus clientes asignados",
            "Según su cartera de hoy, más los que figuran a su nombre en cualquier factura del mes, los haya facturado él u otro. " +
            "Dice si, además de vender, cuida a los suyos.", [
            el("div", { style: "margin-top:12px" }, [barra(r.porcentajeAsignados)]),
            totales([
                ["Clientes asignados", entero(r.asignados), "zc-asignados"],
                ["Atendió", entero(r.asignadosAtendidos) + " · " + porciento(r.porcentajeAsignados), "zc-asignados-atendidos", true],
                ["Sin atender", entero(r.asignadosSinAtender), "zc-asignados-sin-atender"]
            ]),
            pista("No es lo mismo que «Suyos», que mira el dueño que figura en las facturas que hizo él: un cliente que hoy es suyo y al que facturó con otro " +
                  "dueño cuenta aquí y no allá.", "zc-asignados-nota")
        ]));

        if (r.nuevos) {
            secciones.push(seccion("zc-nuevos", "Clientes nuevos",
                "Atendidos en el mes que no tenían ninguna factura ni boleta en la empresa en los 12 meses anteriores.", [
                totales([["Clientes nuevos", plural(r.nuevos.clientes, "cliente", "clientes") + " · " + dolares(r.nuevos.venta), "zc-nuevos-total", true]])
            ]));
        }

        var c = concentracion(r);
        if (c) secciones.push(c);
        return secciones;
    }

    /* ---------------------------------------------------------------
     * Este mes y los tres anteriores
     * ------------------------------------------------------------- */
    function comparacion(d, vivo) {
        var filas = d.comparacion.map(function (c, i) {
            var datosDeFila = [
                el("span", { clase: "cdk-dato" }, [document.createTextNode("Clientes "), el("span", { clase: "cdk-dato__valor", texto: entero(c.clientes) })])
            ];
            if (c.libres !== undefined && c.libres !== null) {
                datosDeFila.push(el("span", { clase: "cdk-dato" }, [document.createTextNode("Libres "), el("span", { clase: "cdk-dato__valor", texto: entero(c.libres) })]));
            }
            datosDeFila.push(el("span", { clase: "cdk-dato" }, [document.createTextNode("Venta "), el("span", { clase: "cdk-dato__valor", texto: dolares(c.venta) })]));

            var li = el("li", { clase: "cdk-articulo" }, [el("div", { clase: "cdk-articulo__cuerpo" }, [
                el("div", { style: "display:flex;align-items:baseline;justify-content:space-between;gap:10px" }, [
                    el("div", { clase: "cdk-articulo__nombre", texto: M.periodo(c) + (i === 0 ? (vivo ? " · este mes" : " · el que ves") : "") }),
                    el("div", { clase: "cdk-articulo__detalle", texto: "hasta el " + fecha(c.corte) })
                ]),
                el("div", { clase: "cdk-articulo__datos" }, datosDeFila)
            ])]);
            li.setAttribute("data-mes", claveDe(c));
            return li;
        });

        return seccion("zc-comparacion", "Este mes y los tres anteriores",
            vivo ? "Cada mes, hasta el mismo día: ¿a esta altura voy mejor o peor que antes?"
                 : "Cada mes, entero.", [
            el("ul", { clase: "cdk-articulos", id: "zc-comparacion-lista", style: "margin-top:10px" }, filas)
        ].concat(d.comparacion.some(function (c) { return c.libres !== undefined && c.libres !== null; })
            ? [pista("Su cobertura de clientes de cada mes es «Clientes» más «Libres».", "zc-comparacion-nota")] : []));
    }

    /* ---------------------------------------------------------------
     * Clientes en riesgo
     * ------------------------------------------------------------- */
    function riesgo(d, cartera) {
        var ri = d.riesgo;

        var filas = ri.lista.map(function (c) {
            var datosDeFila = [];
            if (c.promedioMensual !== null && c.promedioMensual !== undefined) {
                datosDeFila.push(el("span", { clase: "cdk-dato" }, [document.createTextNode("Compraba por mes "), el("span", { clase: "cdk-dato__valor", texto: dolares(c.promedioMensual) })]));
            }
            if (c.mesesConCompra) {
                datosDeFila.push(el("span", { clase: "cdk-dato" }, [document.createTextNode("Compró en "),
                                                                    el("span", { clase: "cdk-dato__valor", texto: c.mesesConCompra + " de los 3 meses anteriores" })]));
            }
            if (c.ultimaCompra) {
                datosDeFila.push(el("span", { clase: "cdk-dato" }, [document.createTextNode("Última compra "), el("span", { clase: "cdk-dato__valor", texto: fecha(c.ultimaCompra) })]));
            }

            var li = el("li", { clase: "cdk-articulo" }, [el("div", { clase: "cdk-articulo__cuerpo" }, [
                el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: c.nombre }),
                el("div", { clase: "cdk-articulo__datos" }, datosDeFila)
            ])]);
            li.setAttribute("data-codcli", c.codcli);
            return li;
        });

        var hijos = [
            el("p", { clase: "cdk-pista", style: "margin:10px 0 0",
                      texto: "Le compraron en alguno de los 3 meses anteriores y en este todavía no. " +
                             (ri.clientes ? "Entre todos compraban " + dolares(ri.promedioMensual) + " por mes: es la venta en juego. " : "") +
                             (cartera ? "Solo de entre sus clientes asignados."
                                      : "Sin los clientes que hoy son de la cartera de alguien: a esos los cuida su dueño, aunque este vendedor los haya atendido un tiempo.") })
        ];
        hijos.push(filas.length ? el("ul", { clase: "cdk-articulos", id: "zc-riesgo-lista", style: "margin-top:10px" }, filas)
                                : el("p", { clase: "cdk-pista", id: "zc-riesgo-vacio", style: "margin:10px 0 0", texto: "Ningún cliente en riesgo." }));

        return el("section", { clase: "cdk-seccion", id: "zc-riesgo-seccion" }, [
            el("details", { clase: "cdk-plegable", id: "zc-riesgo" }, [
                el("summary", { clase: "cdk-plegable__titulo", texto: "Clientes en riesgo (" + entero(ri.clientes) + ")" })
            ].concat(hijos))
        ]);
    }

    /* ---------------------------------------------------------------
     * Las listas de clientes
     * ------------------------------------------------------------- */

    /** Lo que otros vendedores le facturaron a un cliente que es suyo: no le cuenta, pero se ve. */
    function notaDeOtros(c) {
        if (!Array.isArray(c.otros) || !c.otros.length) return null;
        return el("p", { clase: "cdk-pista", "data-otros": "1", style: "margin:8px 0 0",
                         texto: "Otros vendedores le facturaron este mes: " +
                                c.otros.map(function (o) { return o.nombre + " (" + dolares(o.venta) + ")"; }).join(", ") + ". No le cuenta." });
    }

    /** Un cliente: su nombre (nunca su codigo), sus rotulos, sus numeros del mes y sus notas. */
    function filaDeCliente(c, o) {
        var datosDeFila = [];
        function dato(etiqueta, valor) {
            datosDeFila.push(el("span", { clase: "cdk-dato" }, [document.createTextNode(etiqueta + " "), el("span", { clase: "cdk-dato__valor", texto: valor })]));
        }

        dato("Venta", dolares(c.venta));
        if (c.docs) dato("Facturas", entero(c.docs));
        if (c.promedioMensual) dato("Compraba por mes", dolares(c.promedioMensual));
        if (c.ultimaCompra) dato("Última compra", fecha(c.ultimaCompra));

        var cuerpo = [
            el("div", { style: "display:flex;align-items:flex-start;justify-content:space-between;gap:10px" }, [
                el("div", { style: "min-width:0;flex:1" }, [
                    el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: c.nombre }),
                    o.detalle ? el("div", { clase: "cdk-articulo__detalle", texto: o.detalle }) : null
                ].filter(Boolean)),
                el("div", { style: "display:flex;flex-direction:column;align-items:flex-end;gap:4px" }, o.rotulos || [])
            ]),
            el("div", { clase: "cdk-articulo__datos" }, datosDeFila)
        ];

        (o.notas || []).forEach(function (n) { if (n) cuerpo.push(n); });

        var li = el("li", { clase: "cdk-articulo" }, [el("div", { clase: "cdk-articulo__cuerpo" }, cuerpo)]);
        li.setAttribute("data-codcli", c.codcli);
        return li;
    }

    /** De quien era un cliente de cobertura, segun las facturas del mes. `null` es sin dueño, y tambien es libre. */
    function textoDeDueno(c) {
        var d = c.dueno;
        if (!d) return "Sin dueño (libre)";
        if (d.tipo === "propio") return "Suyo";
        if (d.tipo === "libre") return (d.nombre || "Libre") + " (libre)";
        if (d.tipo === "cartera") return "De cartera: " + d.nombre;
        return "De otro vendedor: " + d.nombre;
    }

    function categoriaDe(c) { return c.dueno ? c.dueno.tipo : "libre"; }

    function buscadoEn(c) {
        var aguja = busqueda.toLowerCase();
        return !aguja || String(c.nombre || "").toLowerCase().indexOf(aguja) !== -1;       // por nombre: el codigo no se muestra
    }

    /**
     * De quien era un cliente, en pocas palabras, para el rotulo de la fila de cobertura. El detalle completo sale al tocarla.
     * `null` es sin dueño, y tambien es libre.
     */
    function duenoCorto(c) {
        var d = c.dueno;
        if (!d || d.tipo === "libre") return "Libre";
        if (d.tipo === "propio") return "Suyo";
        return (d.tipo === "cartera" ? "Cartera" : "Otro") + " · " + d.nombre;
    }

    /**
     * Las pestañas de la lista principal, de a una. En cobertura, de quien eran los clientes (solo los atendidos, como `porDueno`),
     * los nuevos, y los que no cuentan (los que terminaron en 0 o en negativo). En cartera, atendidos o no.
     */
    function filtrosDe(cartera) {
        function todos() { return true; }
        function noAtendido(c) { return c.atendido !== true; }
        function atendidosDe(k) { return function (c) { return c.atendido === true && categoriaDe(c) === k; }; }

        if (cartera) {
            return [
                { clave: "todos", rotulo: "Todos", pasa: todos },
                { clave: "atendidos", rotulo: "Atendidos", pasa: function (c) { return c.atendido === true; } },
                { clave: "sin", rotulo: "Sin atender", pasa: noAtendido }
            ];
        }
        return [
            { clave: "todos", rotulo: "Todos", pasa: todos },
            { clave: "nuevos", rotulo: "Nuevos", pasa: function (c) { return c.nuevo === true; } },
            { clave: "propio", rotulo: "Suyos", pasa: atendidosDe("propio") },
            { clave: "cartera", rotulo: "De cartera", pasa: atendidosDe("cartera") },
            { clave: "libre", rotulo: "Libres", pasa: atendidosDe("libre") },
            { clave: "otro", rotulo: "De otro", pasa: atendidosDe("otro") },
            { clave: "no", rotulo: "No cuentan", pasa: noAtendido }
        ];
    }

    /**
     * Un cliente de la lista principal, en dos lineas: su nombre y su venta, y debajo sus rotulos y un dato corto. Lo demas sale al
     * tocar la fila. Nunca lleva su codigo.
     */
    function filaCompacta(c, cartera) {
        var rotulos = [];
        var mas = [];

        if (cartera) {
            rotulos.push(c.atendido ? rotulo("Atendido", "logrado") : rotulo("Sin atender"));
            if (c.enCarteraHoy === false) rotulos.push(rotulo("Hoy es de otro"));
        } else {
            rotulos.push(el("span", { clase: "cdk-etiqueta", texto: duenoCorto(c) }));
            if (c.nuevo) rotulos.push(rotulo("Nuevo"));
            if (!c.atendido) rotulos.push(rotulo("No cuenta como atendido"));
            mas.push(el("div", {}, [el("span", { texto: "De quién era" }), el("span", { texto: textoDeDueno(c) })]));
        }

        var corto = [];
        if (c.docs) corto.push(c.docs === 1 ? "1 factura" : entero(c.docs) + " facturas");
        if (c.ultimaCompra) corto.push("última compra " + fecha(c.ultimaCompra));
        if (corto.length) rotulos.push(el("span", { texto: corto.join(" · ") }));

        if (c.promedioMensual) mas.push(el("div", {}, [el("span", { texto: "Compraba por mes" }), el("span", { texto: dolares(c.promedioMensual) })]));
        var otros = notaDeOtros(c);
        if (otros) mas.push(otros);
        if (cartera && c.enCarteraHoy === false) mas.push(pista("Hoy este cliente ya es de otro vendedor: figura aquí por las facturas del mes.", null));
        if (!mas.length) mas.push(pista("No hay más datos de este cliente.", null));

        var importe = "cdk-fila__importe" + (c.venta < 0 ? " cdk-fila__importe--negativo" : (!c.atendido ? " cdk-fila__importe--apagado" : ""));
        var boton = el("button", { type: "button", clase: "cdk-fila__boton", "aria-expanded": "false" }, [
            el("div", { clase: "cdk-fila__linea" }, [
                el("span", { clase: "cdk-fila__nombre", texto: c.nombre }),
                el("span", { clase: importe, texto: dolares(c.venta) })
            ]),
            el("div", { clase: "cdk-fila__datos" }, rotulos),
            el("div", { clase: "cdk-fila__mas" }, mas)
        ]);
        boton.addEventListener("click", function () {
            boton.setAttribute("aria-expanded", boton.getAttribute("aria-expanded") === "true" ? "false" : "true");
        });

        var li = el("li", { clase: "cdk-fila" }, [boton]);
        li.setAttribute("data-codcli", c.codcli);
        return li;
    }

    /**
     * La lista principal. De la cartera: todos sus asignados, atendidos o no. De la cobertura: a los que les facturo en el mes, y tambien
     * los que terminaron en 0 o en negativo por notas de credito (que no cuentan como atendidos).
     */
    function listaDeClientes(d, cartera) {
        var filtros = filtrosDe(cartera);
        if (!filtros.some(function (f) { return f.clave === filtroLista; })) filtroLista = "todos";       // venia de la pantalla del otro tipo

        var buscador = el("input", { type: "search", id: "zc-buscar", clase: "cdk-entrada", autocomplete: "off",
                                     placeholder: "Buscar un cliente", "aria-label": "Buscar un cliente", value: busqueda });
        var pestanas = el("div", { clase: "cdk-pestanas cdk-pestanas--cortas", id: "zc-filtros", role: "group", "aria-label": "Filtrar los clientes" });
        var destino = el("div", { id: "zc-lista", style: "margin-top:12px" });
        var cuenta = pista("", "zc-lista-cuenta");

        function pasa(c) {
            if (!buscadoEn(c)) return false;
            return filtros.filter(function (f) { return f.clave === filtroLista; })[0].pasa(c);
        }

        function pintarPestanas() {
            pestanas.innerHTML = "";
            filtros.forEach(function (f) {
                var activa = f.clave === filtroLista;
                var b = el("button", { type: "button", clase: "cdk-pestana" + (activa ? " es-activa" : ""), "data-filtro": f.clave,
                                       "aria-pressed": activa ? "true" : "false", texto: f.rotulo });
                b.addEventListener("click", function () { filtroLista = f.clave; pintarPestanas(); repintar(); });
                pestanas.appendChild(b);
            });
        }

        function repintar() {
            busqueda = buscador.value.trim();
            destino.innerHTML = "";

            if (!d.clientes.length) {
                cuenta.textContent = "";
                CDK.estados.vacio(destino, cartera ? "Este vendedor no tiene clientes asignados." : "Este vendedor no le facturó a ningún cliente este mes.");
                return;
            }

            var visibles = d.clientes.filter(pasa);
            cuenta.textContent = visibles.length === d.clientes.length ? "" : "Se muestran " + entero(visibles.length) + " de " + entero(d.clientes.length) + ".";

            if (!visibles.length) {
                CDK.estados.vacio(destino, "Ningún cliente coincide.");
                return;
            }

            var ul = el("ul", { clase: "cdk-filas", id: "zc-clientes" });
            visibles.forEach(function (c) { ul.appendChild(filaCompacta(c, cartera)); });
            destino.appendChild(ul);
        }

        buscador.addEventListener("input", repintar);

        var seccionLista = el("section", { clase: "cdk-seccion", id: "zc-clientes-seccion" }, [
            el("h2", { clase: "cdk-seccion__titulo", id: "zc-clientes-titulo", texto: cartera ? "Sus clientes" : "Sus clientes del mes" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: cartera ? "Todos sus clientes asignados, atendidos o no, del que más compró al que menos. Toca un cliente para ver el detalle."
                                     : "Los clientes a los que les facturó en el mes, del que más compró al que menos. Incluye a los que terminaron en 0 o en negativo por " +
                                       "notas de crédito: no cuentan como atendidos. Los asignados sin atender no vienen en la lista, solo su cuenta; para esos sirve «Clientes en riesgo». " +
                                       "Toca un cliente para ver el detalle." }),
            el("div", { clase: "cdk-campo" }, [el("label", { clase: "cdk-campo__etiqueta", "for": "zc-buscar", texto: "Buscar" }), buscador]),
            el("div", { style: "margin-top:12px" }, [pestanas]),
            cuenta,
            destino
        ]);

        pintarPestanas();
        repintar();
        return seccionLista;
    }

    /** Un bloque plegable con su explicacion y su lista. */
    function plegable(id, resumen, explicacion, filas) {
        return el("section", { clase: "cdk-seccion", id: id + "-seccion" }, [
            el("details", { clase: "cdk-plegable", id: id }, [
                el("summary", { clase: "cdk-plegable__titulo", texto: resumen }),
                el("p", { clase: "cdk-pista", style: "margin:10px 0 0", texto: explicacion }),
                el("ul", { clase: "cdk-articulos", id: id + "-lista", style: "margin-top:10px" }, filas)
            ])
        ]);
    }

    /** Los clientes de otras carteras que atendio: le cuentan, haya un reemplazo detectado o no. */
    function listaDeReemplazo(d) {
        var filas = d.reemplazo.map(function (c) {
            return filaDeCliente(c, { detalle: c.dueno ? "Cliente de " + c.dueno.nombre : "", rotulos: [rotulo("Atendido", "logrado")], notas: [notaDeOtros(c)] });
        });
        return plegable("zc-reemplazo", "Clientes de otra cartera que atendió (" + entero(d.reemplazo.length) + ")",
                        "Clientes de otro vendedor de cartera a los que les facturó este mes. Le cuentan, haya un reemplazo detectado o no.", filas);
    }

    /** Lo que facturo a clientes que no son de cartera: el monto no le cuenta a nadie; los libres, ademas, cuentan como cliente atendido. */
    function listaFueraDeCartera(d) {
        var filas = d.fueraDeCartera.map(function (c) {
            var rotulos = [];
            if (c.libre) rotulos.push(rotulo("Libre"));
            if (c.libre && c.atendido) rotulos.push(rotulo("Cuenta como atendido", "logrado"));
            else rotulos.push(rotulo("No cuenta como atendido"));

            return filaDeCliente(c, { detalle: c.dueno ? "De " + c.dueno.nombre : "Sin dueño", rotulos: rotulos });
        });
        var fuera = d.resumen && d.resumen.ventaFueraDeCartera;
        return plegable("zc-fuera", "Clientes que no son de cartera (" + entero(fuera && fuera.clientes !== undefined ? fuera.clientes : d.fueraDeCartera.length) + ")",
                        "A estos clientes les facturó él, pero no son de cartera. El monto no le cuenta a nadie. Los libres —de la oficina o sin dueño— sí cuentan como " +
                        "cliente atendido en su cobertura de clientes; los de un vendedor de cobertura, de ninguna forma.", filas);
    }

    if (codusu) cargar(); else if (tipoDePista) elegir(); else elegirTipo();

})();
