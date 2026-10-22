/**
 * Cuota por marca (grupo 25): la meta del mes de cada marca y como va.
 *
 * Se pinta dentro de cuota_observar.html cuando `/cuota/mostrar` responde con la
 * cuota por marca (js/cuota/avance.js): el backend redirige ahi a especialistas
 * y jefaturas. Tres cosas:
 *
 *   · el TOTAL de sus marcas
 *   · una tarjeta por marca, con su meta, su avance, su cumplimiento y la
 *     proyeccion a fin de mes
 *   · la jefatura, ademas, el general de cada uno (`porDueno`) y un filtro
 *
 * **El avance es la venta de la marca en toda la empresa**, la haga quien la
 * haga: mide como va la MARCA, no las ventas personales de quien mira. Se dice con
 * esas palabras en pantalla, o un especialista lo leeria como lo suyo.
 *
 * **Nada se calcula aqui.** Cumplimiento, proyeccion y totales llegan hechos; la
 * pantalla los pinta. Lo unico que decide es que mostrar segun `puedoFijarMeta`.
 * El cumplimiento de un total cuenta solo las marcas con meta; `conMeta` dice
 * cuantas son, y la pantalla lo dice.
 *
 * Se puede ver el mes en curso y los dos anteriores. Un mes anterior es de solo
 * lectura: sin proyeccion y sin botones de meta.
 *
 * Fijar una meta manda **solo lo que cambio**: un campo que no viaja conserva lo
 * que tenia, y uno vaciado viaja en `null` y se borra. Una meta tiene que ser
 * mayor que 0. Si la marca aun no tiene meta y el mes pasado tuvo una, el
 * formulario parte de esa: la persona la revisa, y no se guarda sola.
 *
 * Ver docs/cuota-grupo25.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var C = CDK.cuota.marcas;
    var M = CDK.marcas;              // periodo(), nombre(), statusDe(), mensajeError()

    var destino = null;
    var datos = null;                // lo ultimo que dijo GET /cuota/marcas
    var filtro = "todas";            // sobrevive a repintar: tras fijar una meta se vuelve a pedir todo
    var periodo = null;              // null = el mes en curso; { anno, mes } = uno de los dos anteriores
    var actual = null;               // { anno, mes } del mes en curso, en cuanto el servidor lo dice

    /* ---------------------------------------------------------------
     * Las cuatro medidas
     *
     * `clave` es la de la meta y `avance` la del avance: no coinciden
     * (`monto` se mide contra `venta`).
     * ------------------------------------------------------------- */
    function dolares(v) { return CDK.formato.moneda(v, "D"); }
    function porciento(v) { return CDK.formato.porcentaje(v, 2); }
    function unidades(v) { return CDK.formato.numero(v, 0); }

    var MEDIDAS = [
        { clave: "monto",     etiqueta: "Venta",               campo: "Venta (US$, sin IGV)", avance: "venta",     formato: dolares },
        { clave: "margen",    etiqueta: "Rentabilidad en US$", campo: "Rentabilidad (US$)",   avance: "margen",    formato: dolares },
        { clave: "margenPct", etiqueta: "Rentabilidad en %",   campo: "Rentabilidad (%)",     avance: "margenPct", formato: porciento },
        { clave: "unidades",  etiqueta: "Unidades",            campo: "Unidades",             avance: "unidades",  formato: unidades }
    ];

    function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }
    function hay(v) { return v !== null && v !== undefined; }

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

    /** Un mes anterior es de solo lectura. */
    function cerrado() { return !!datos && datos.actual === false; }

    /* ---------------------------------------------------------------
     * Entrada
     *
     * `primera` es la respuesta de `/cuota/mostrar`, que ya se pidio para saber
     * a donde iba esta persona; `errorInicial`, su fallo si fue `no identificado`.
     * ------------------------------------------------------------- */
    C.iniciar = function (nodo, primera, errorInicial) {
        destino = nodo;

        if (errorInicial) { fallo(errorInicial, false); return; }
        if (primera !== undefined && primera !== null) { recibir(C.interpretar(primera), false); return; }
        cargar();
    };

    /**
     * `silencioso`: repinta tras una escritura, o al cambiar de mes, sin tapar la
     * pantalla con un spinner. Devuelve una promesa de si llego a pintar algo.
     */
    function cargar(silencioso) {
        if (!silencioso) CDK.estados.cargando(destino, "Cargando tu cuota por marca…");

        return C.ver(periodo)
            .then(function (d) { return recibir(d, silencioso); })
            .catch(function (err) { return fallo(err, silencioso); });
    }

    function recibir(d, silencioso) {
        if (d && d.sinMarcas) { pintarSinMarcas(d); return true; }

        /* Algo que no es lo que dice el contrato: no se pinta a ojo. Si ya habia una
           pantalla buena —se cambio de mes, o se guardo una meta— se deja como estaba. */
        if (!d || !Array.isArray(d.marcas)) {
            if (silencioso) {
                CDK.toast("No se pudo actualizar la pantalla. La respuesta no trae las marcas.", "error");
            } else {
                CDK.estados.error(destino, "La respuesta no trae las marcas.", function () { cargar(); });
            }
            return false;
        }

        datos = d;
        if (d.actual !== false) actual = { anno: d.anno, mes: d.mes };
        pintar();
        return true;
    }

    function fallo(err, silencioso) {
        if (CDK.http.esError(err) && err.status === 401) return false;     // ya redirige
        if (M.statusDe(err) === "no identificado") { pintarSinAlta(); return true; }

        if (silencioso) {
            CDK.toast("No se pudo actualizar la pantalla. " + M.mensajeError(err), "error");
            return false;
        }
        CDK.estados.error(destino, err, function () { cargar(); });
        return false;
    }

    /* ===============================================================
     * Otro mes
     * ============================================================= */

    /** El mes en curso y los dos anteriores: lo que el backend deja ver. */
    function selectorDeMes() {
        var base = mesEnCurso();
        var opciones = [{ valor: "", texto: M.periodo(base) + " (este mes)" }];
        [1, 2].forEach(function (n) {
            var p = mesesAtras(base, n);
            opciones.push({ valor: claveDe(p), texto: M.periodo(p) });
        });

        var elegida = periodo ? claveDe(periodo) : "";
        var s = el("select", { id: "cuota-mes", clase: "cdk-entrada" }, opciones.map(function (o) {
            var op = el("option", { value: o.valor, texto: o.texto });
            if (o.valor === elegida) op.selected = true;
            return op;
        }));
        s.addEventListener("change", function () { irA(s); });

        return el("div", { clase: "cdk-campo", style: "margin-top:12px" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "cuota-mes", texto: "Mes" }), s
        ]);
    }

    function irA(select) {
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
     * Estados sin datos
     * ============================================================= */

    /**
     * Sin marcas este mes no hay cuota que medir: lo que falta es elegirlas. En un
     * mes anterior es otra cosa —entonces no tenia—, y no hay nada que elegir. En
     * los dos casos se puede ir a otro mes.
     */
    function pintarSinMarcas(d) {
        destino.innerHTML = "";

        destino.appendChild(el("section", { clase: "cdk-seccion", id: "cuota-marcas-meses" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Cuota por marca" }),
            selectorDeMes()
        ]));

        if (d.enEseMes) {
            destino.appendChild(el("section", { clase: "cdk-seccion", id: "cuota-marcas-sin-marcas-mes" }, [
                el("h2", { clase: "cdk-seccion__titulo", texto: "No tenías marcas en " + M.periodo(periodo || {}) }),
                el("p", { clase: "cdk-seccion__sub", style: "margin:0",
                          texto: "Ese mes no tenías marcas asignadas, así que no hay cuota que ver." })
            ]));
            return;
        }

        destino.appendChild(el("section", { clase: "cdk-seccion", id: "cuota-marcas-sin-marcas" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no tienes marcas este mes" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Tu cuota se calcula sobre las marcas que confirmes. Elígelas primero." }),
            d.msg ? el("p", { clase: "cdk-pista", style: "margin:0 0 14px", texto: d.msg }) : null,
            el("a", { href: CDK.rutas.app("/marcas.html"), clase: "cdk-boton cdk-boton--primario",
                      texto: "Elegir mis marcas" })
        ]));
    }

    function pintarSinAlta() {
        destino.innerHTML = "";

        destino.appendChild(el("section", { clase: "cdk-seccion", id: "cuota-marcas-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para ver tu cuota primero tienes que completar tu registro en la intranet." }),
            el("a", { href: CDK.rutas.registro(), clase: "cdk-boton cdk-boton--primario",
                      texto: "Completar mi registro" })
        ]));
    }

    /* ===============================================================
     * Medidas: meta, avance y cumplimiento
     * ============================================================= */

    /** Sin pasarse del 100 % de ancho (una barra que se sale parece un fallo), y
        en verde al llegar. Sin color de alarma: a mitad de mes todo va «por
        debajo» y asustar con rojo no dice nada. */
    function barra(pct, izquierda, derecha) {
        return el("div", { clase: "cdk-progreso" }, [
            el("div", { clase: "cdk-progreso__pista" }, [
                el("div", {
                    clase: "cdk-progreso__relleno" + (pct >= 100 ? " cdk-progreso__relleno--bien" : ""),
                    style: "width:" + Math.max(0, Math.min(100, pct)) + "%"
                })
            ]),
            el("div", { clase: "cdk-progreso__pie" }, [
                el("span", { texto: izquierda }), el("span", { texto: derecha })
            ])
        ]);
    }

    /**
     * Lo que se dice junto a la etiqueta de una medida sobre su meta, o null.
     *
     * En un total, el cumplimiento cuenta solo las marcas que tienen meta en esa
     * medida: `conMeta` dice cuantas, y si no son todas, se dice. La meta de % no
     * se suma, asi que su ausencia ahi no es «sin meta».
     */
    function avisoDeMeta(x, md, tiene) {
        if (!x.sumada) return tiene ? null : "sin meta";
        if (md.clave === "margenPct") return null;

        var con = x.conMeta ? x.conMeta[md.clave] : undefined;
        if (!hay(con)) return tiene ? null : "sin meta";
        if (con === 0) return "sin meta";
        return con < x.marcas ? "meta en " + con + " de " + x.marcas : null;
    }

    /**
     * Las cuatro medidas de algo —una marca, un responsable o el total—.
     *
     *   x.meta           `null` si no hay ninguna; cada campo puede ser `null`
     *   x.avance         lo vendido
     *   x.cumplimiento   % de cada meta; `null` donde no hay meta
     *   x.proyeccion     a fin de mes, a este ritmo, y que % de la meta de monto
     *                    seria; `null` en un mes anterior
     *   x.sumada         el total y el general de cada uno
     *   x.conMeta        (sumada) cuantas marcas tienen meta en cada medida
     *   x.marcas         (sumada) cuantas marcas suma
     */
    function medidas(x) {
        return MEDIDAS.map(function (md) {
            var valor = x.avance[md.avance];
            var meta = x.meta ? x.meta[md.clave] : null;
            var tiene = hay(meta);
            var cumple = x.cumplimiento ? x.cumplimiento[md.clave] : null;

            /* Se dice en la propia linea, junto a la etiqueta: en su propia linea,
               cuatro medidas por marca alargaban la pantalla de un movil. */
            var etiqueta = el("span", { clase: "cdk-medida__etiqueta", texto: md.etiqueta });
            var aviso = avisoDeMeta(x, md, tiene);
            if (aviso) etiqueta.textContent += " · " + aviso;

            var hijos = [el("div", { clase: "cdk-medida__fila" }, [
                etiqueta,
                el("span", { clase: "cdk-medida__valor", texto: hay(valor) ? md.formato(valor) : "—" })
            ])];

            if (tiene) {
                hijos.push(barra(Number(cumple) || 0, "Meta " + md.formato(meta),
                                 hay(cumple) ? CDK.formato.porcentaje(cumple, 1) : "—"));
            }

            /* A este ritmo. Ya viene calculado, y el % de la meta tambien: la cuenta no es de aqui. */
            if (md.clave === "monto" && x.proyeccion && hay(x.proyeccion.venta)) {
                var linea = "A este ritmo, el mes cierra en " + dolares(x.proyeccion.venta);
                var pc = x.proyeccion.cumplimiento ? x.proyeccion.cumplimiento.monto : null;
                if (hay(pc)) linea += " · " + CDK.formato.porcentaje(pc, 1) + " de la meta";

                hijos.push(el("p", { clase: "cdk-pista", style: "margin:2px 0 0", texto: linea }));
            }

            return el("div", { clase: "cdk-medida" }, hijos);
        });
    }

    /* ===============================================================
     * Pintado
     * ============================================================= */
    function pintar() {
        destino.innerHTML = "";
        destino.appendChild(cabecera());
        destino.appendChild(total());
        if (datos.rol === "JEFATURA" && Array.isArray(datos.porDueno)) destino.appendChild(porDueno());
        destino.appendChild(listaDeMarcas());
    }

    function cabecera() {
        var d = datos;
        var dias = d.dias;
        var jefatura = d.rol === "JEFATURA";
        var pasado = cerrado();

        var sub = M.periodo(d);
        if (pasado) {
            sub += " · mes cerrado";
        } else if (dias && dias.mes) {
            sub += " · día " + dias.transcurridos + " de " + dias.mes + " · " +
                   (dias.restantes === 1 ? "queda 1 día" : "quedan " + dias.restantes + " días");
        }

        var calculo = [
            "Se cuentan las ventas de la marca de toda la empresa, hechas por quien sea.",
            "Solo mercadería y licitaciones: no cuentan la venta al exterior, los servicios ni las transferencias gratuitas.",
            "Suman facturas y boletas, y las notas de crédito restan (importe, unidades y costo). Los descuentos de promoción no se restan.",
            "Todo en dólares y sin IGV. Se calcula en el momento, con las facturas del mes.",
            pasado ? null : "«A este ritmo» es lo vendido hasta hoy, repartido por los días que han pasado, llevado a los días del mes.",
            "En el total y en el general de cada uno, el cumplimiento cuenta solo las marcas que tienen meta en esa medida.",
            jefatura
                ? "La meta de cada marca la fija su dueño, y solo después de confirmar sus marcas del mes. Tú fijas las tuyas."
                : "La meta de cada marca la fijas tú, después de confirmar tus marcas del mes, y la puedes corregir las veces que haga falta."
        ].filter(Boolean);

        return el("section", { clase: "cdk-seccion", id: "cuota-marcas-cabecera" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Cuota por marca" }),
            el("p", { clase: "cdk-seccion__sub", id: "cuota-marcas-periodo", style: "margin-bottom:10px", texto: sub }),
            /* Lo mas importante de la pantalla y lo que mas se malinterpreta. */
            el("p", { clase: "cdk-pista", id: "cuota-marcas-nota", style: "margin:0",
                      texto: "El avance es la venta de cada marca en toda la empresa, la haga quien la haga: " +
                             "mide cómo va la marca, no tus ventas personales." }),
            pasado ? el("p", { clase: "cdk-pista", id: "cuota-marcas-cerrado", style: "margin:8px 0 0",
                               texto: "Así cerró ese mes: las marcas de entonces con su meta y su avance. " +
                                      "Solo se puede mirar; las metas se fijan en el mes en curso." }) : null,
            selectorDeMes(),
            el("details", { clase: "cdk-plegable", style: "margin-top:14px" }, [
                el("summary", { clase: "cdk-plegable__titulo", texto: "Cómo se calcula" })
            ].concat(calculo.map(function (linea) {
                return el("p", { clase: "cdk-pista", style: "margin:8px 0 0", texto: linea });
            })))
        ]);
    }

    /** Cuando el cumplimiento de un total no cuenta todas sus marcas, se dice una vez. */
    function parcial(t) {
        return ["monto", "margen", "unidades"].some(function (k) {
            return t.conMeta && hay(t.conMeta[k]) && t.conMeta[k] > 0 && t.conMeta[k] < t.marcas;
        });
    }

    function total() {
        var t = datos.total;

        var hijos = [
            el("h2", { clase: "cdk-seccion__titulo",
                       texto: datos.rol === "JEFATURA" ? "Total de las marcas de tu familia" : "Total de tus marcas" }),
            el("p", { clase: "cdk-seccion__sub", style: "margin-bottom:6px", texto: plural(t.marcas, "marca", "marcas") })
        ].concat(medidas({ meta: t.meta, avance: t.avance, cumplimiento: t.cumplimiento, proyeccion: t.proyeccion,
                           conMeta: t.conMeta, marcas: t.marcas, sumada: true }));

        if (parcial(t)) {
            hijos.push(el("p", { clase: "cdk-pista", id: "cuota-marcas-total-nota", style: "margin:10px 0 0",
                                 texto: "El cumplimiento cuenta solo las marcas que tienen meta en esa medida." }));
        }

        return el("section", { clase: "cdk-seccion", id: "cuota-marcas-total" }, hijos);
    }

    /** La jefatura: lo que lleva cada uno con sus marcas, y ella con las suyas. */
    function porDueno() {
        var lista = el("ul", { clase: "cdk-articulos", id: "cuota-por-dueno" }, datos.porDueno.map(function (p) {
            return el("li", { clase: "cdk-articulo" }, [el("div", { clase: "cdk-articulo__cuerpo" }, [
                el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere",
                            texto: p.dueno.nombre + (p.dueno.soyYo ? " (tú)" : "") }),
                el("div", { clase: "cdk-articulo__detalle", texto: plural(p.marcas, "marca", "marcas") })
            ].concat(medidas({ meta: p.meta, avance: p.avance, cumplimiento: p.cumplimiento, proyeccion: p.proyeccion,
                               conMeta: p.conMeta, marcas: p.marcas, sumada: true })))]);
        }));

        return el("section", { clase: "cdk-seccion", id: "cuota-marcas-por-dueno" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "General de cada uno" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: cerrado() ? "Lo que llevó cada uno con las marcas que tenía entonces, y tú con las tuyas."
                                       : "Lo que lleva cada especialista con sus marcas, y tú con las tuyas." }),
            lista
        ]);
    }

    /* ---------------------------------------------------------------
     * La lista de marcas
     * ------------------------------------------------------------- */
    function pasaFiltro(m) {
        if (filtro === "mias") return m.dueno.soyYo;
        if (filtro.indexOf("u:") === 0) return m.dueno.codusu === filtro.slice(2);
        return true;
    }

    /** Solo la jefatura: a un especialista todas le salen suyas. Por `codusu`, nunca por nombre. */
    function selectorDeDuenos(alCambiar) {
        var cuentas = {};
        datos.marcas.forEach(function (m) {
            var c = cuentas[m.dueno.codusu] || (cuentas[m.dueno.codusu] = { nombre: m.dueno.nombre, n: 0, yo: m.dueno.soyYo });
            c.n++;
        });

        var opciones = [{ valor: "todas", texto: "Todas (" + datos.marcas.length + ")" }];
        var mias = datos.marcas.filter(function (m) { return m.dueno.soyYo; }).length;
        if (mias) opciones.push({ valor: "mias", texto: "Mías (" + mias + ")" });

        Object.keys(cuentas)
            .filter(function (u) { return !cuentas[u].yo; })
            .sort(function (a, b) { return cuentas[a].nombre.localeCompare(cuentas[b].nombre); })
            .forEach(function (u) { opciones.push({ valor: "u:" + u, texto: cuentas[u].nombre + " (" + cuentas[u].n + ")" }); });

        /* Si lo elegido ya no existe tras repintar, el filtro apuntaria a nada. */
        if (!opciones.some(function (o) { return o.valor === filtro; })) filtro = "todas";

        var s = el("select", { id: "cuota-filtro", clase: "cdk-entrada" }, opciones.map(function (o) {
            var op = el("option", { value: o.valor, texto: o.texto });
            if (o.valor === filtro) op.selected = true;
            return op;
        }));
        s.addEventListener("change", function () { filtro = s.value; alCambiar(); });
        return s;
    }

    function listaDeMarcas() {
        var jefatura = datos.rol === "JEFATURA";
        var pasado = cerrado();
        var lista = el("div", { id: "cuota-marcas-lista", style: "margin-top:12px" });

        function repintar() {
            lista.innerHTML = "";
            var visibles = datos.marcas.filter(pasaFiltro);

            if (!visibles.length) {
                CDK.estados.vacio(lista, "No hay marcas con ese filtro.");
                return;
            }

            var ul = el("ul", { clase: "cdk-articulos" });
            visibles.forEach(function (m) { ul.appendChild(tarjeta(m, jefatura)); });
            lista.appendChild(ul);
        }

        var hijos = [
            el("h2", { clase: "cdk-seccion__titulo", texto: jefatura ? "Marcas de la familia" : "Mis marcas" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: jefatura
                          ? (pasado ? "Las tuyas y las de tus especialistas que eran de tu familia entonces."
                                    : "Las tuyas y las de tus especialistas que son de tu familia.")
                          : (pasado ? "Las marcas que tenías ese mes." : "Las marcas que tienes este mes.") })
        ];

        if (jefatura) {
            hijos.push(el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "cuota-filtro", texto: "Ver las marcas de" }),
                selectorDeDuenos(repintar)
            ]));
        }
        hijos.push(lista);

        var seccion = el("section", { clase: "cdk-seccion", id: "cuota-marcas-marcas" }, hijos);
        repintar();
        return seccion;
    }

    function tarjeta(m, jefatura) {
        var cuerpo = [
            el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: M.nombre(m) }),
            /* A la jefatura le dice de quien es cada una. */
            el("div", { clase: "cdk-articulo__detalle",
                        texto: jefatura && !m.dueno.soyYo ? m.familia + " · " + m.dueno.nombre : m.familia })
        ];

        /* Una marca que se tuvo y hoy ya no se trabaja: en un mes anterior se dice, para que no extrañe. */
        if (m.trabajadaHoy === false) {
            cuerpo.push(el("p", { clase: "cdk-pista", id: "marca-ya-no-" + m.codmar, style: "margin:4px 0 0",
                                  texto: "Esta marca ya no se trabaja." }));
        }

        cuerpo = cuerpo.concat(medidas({ meta: m.meta, avance: m.avance, cumplimiento: m.cumplimiento, proyeccion: m.proyeccion }));

        if (m.meta && m.meta.actualizado) {
            cuerpo.push(el("p", { clase: "cdk-pista", style: "margin:10px 0 0",
                                  texto: "Meta actualizada el " + CDK.formato.fecha(m.meta.actualizado, "conHora") }));
        }
        if (!cerrado()) cuerpo.push(accion(m));            // un mes cerrado no se toca

        return el("li", { clase: "cdk-articulo", id: "marca-" + m.codmar }, [
            el("div", { clase: "cdk-articulo__cuerpo" }, cuerpo)
        ]);
    }

    /**
     * Que se ofrece con la meta. Decide `puedoFijarMeta`, no el rol ni nada
     * deducido: es el dueño, ya confirmo y es el mes en curso, o no. Cuando no, se
     * dice por que.
     */
    function accion(m) {
        var caja = el("div", { style: "margin-top:12px" });

        if (m.puedoFijarMeta) {
            var editorNodo = el("div", { id: "meta-editor-" + m.codmar });
            var abrir = el("button", { type: "button", id: "meta-abrir-" + m.codmar,
                                       clase: "cdk-boton cdk-boton--suave",
                                       texto: m.meta ? "Corregir meta" : "Fijar meta" });

            abrir.addEventListener("click", function () {
                if (editorNodo.firstChild) {                    // ya abierto: se cierra
                    editorNodo.innerHTML = "";
                    return;
                }
                editorNodo.appendChild(editor(m, function () { editorNodo.innerHTML = ""; }));
            });

            caja.appendChild(abrir);
            caja.appendChild(editorNodo);
        } else if (m.dueno.soyYo && !m.confirmada) {
            caja.appendChild(el("p", { clase: "cdk-pista", id: "meta-aviso-" + m.codmar, style: "margin:0 0 6px",
                                       texto: "Confirma tus marcas del mes para poder fijar la meta." }));
            caja.appendChild(el("a", { href: CDK.rutas.app("/marcas.html"), clase: "cdk-boton cdk-boton--suave",
                                       texto: "Ir a Marcas" }));
        } else if (!m.dueno.soyYo) {
            caja.appendChild(el("p", { clase: "cdk-pista", style: "margin:0",
                                       texto: "La meta la fija " + m.dueno.nombre + "." }));
        }

        return caja;
    }

    /* ===============================================================
     * Fijar o corregir una meta
     * ============================================================= */

    /** ¿Trae alguna medida con valor? Una meta con todo en `null` no es meta. */
    function conAlgo(meta) {
        return !!meta && MEDIDAS.some(function (md) { return hay(meta[md.clave]); });
    }

    function editor(m, cerrarEditor) {
        var entradas = {};

        /* Con meta este mes, se corrige esa. Sin meta, y con la del mes pasado, se
           parte de esa: se ve y se cambia, pero no se guarda hasta pulsar Guardar. */
        var precargada = !m.meta && conAlgo(m.metaMesAnterior);
        var base = m.meta || (precargada ? m.metaMesAnterior : null);

        var filas = MEDIDAS.map(function (md) {
            var actualValor = base ? base[md.clave] : null;
            var entera = md.clave === "unidades";

            var entrada = el("input", {
                type: "number", id: "meta-" + m.codmar + "-" + md.clave, clase: "cdk-entrada", style: "min-width:0",
                inputmode: entera ? "numeric" : "decimal", min: entera ? "1" : "0.01", step: entera ? "1" : "0.01",
                placeholder: "Sin meta", "aria-label": md.campo,
                value: hay(actualValor) ? String(actualValor) : ""
            });
            if (md.clave === "margenPct") entrada.setAttribute("max", "100");
            entradas[md.clave] = entrada;

            return el("div", { clase: "cdk-campo", style: "min-width:0" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": entrada.id, texto: md.campo }), entrada
            ]);
        });

        var guardar = el("button", { type: "submit", clase: "cdk-boton cdk-boton--primario", texto: "Guardar meta" });
        var cancelar = el("button", { type: "button", clase: "cdk-boton cdk-boton--suave", texto: "Cancelar" });
        cancelar.addEventListener("click", cerrarEditor);

        var form = el("form", { id: "meta-form-" + m.codmar, novalidate: "novalidate", style: "margin-top:12px" }, [
            precargada
                ? el("p", { clase: "cdk-pista", id: "meta-precargada-" + m.codmar, style: "margin:0 0 10px",
                            texto: "Partimos de la meta que tuvo esta marca el mes pasado. Revísala y cámbiala si quieres: " +
                                   "no se guarda hasta que pulses «Guardar meta»." })
                : null,
            el("p", { clase: "cdk-pista", style: "margin:0 0 10px",
                      texto: "Todas son opcionales y tienen que ser mayores que 0. Vacía una para quitar esa meta. " +
                             "La rentabilidad la puedes fijar en US$, en %, o en las dos." }),
            /* minmax(0, 1fr): un input numerico trae un ancho minimo propio y, con 1fr
               a secas, la columna no encoge y se sale de la tarjeta. */
            el("div", { clase: "cdk-pareja", style: "grid-template-columns:minmax(0,1fr) minmax(0,1fr)" }, filas),
            el("div", { clase: "cdk-acciones-fila" }, [guardar, cancelar])
        ]);

        form.addEventListener("submit", function (ev) {
            ev.preventDefault();

            var cambios = leerCambios(m, entradas);
            if (!cambios) return;                                    // ya aviso por que

            if (!Object.keys(cambios).length) {
                CDK.toast("No cambiaste nada.", "info");
                return;
            }

            guardar.disabled = true;
            guardar.textContent = "Guardando…";

            C.fijarMeta(m.codmar, cambios)
                .then(function (r) {
                    CDK.toast("Meta de " + M.nombre(m) + (r.nueva ? " fijada." : " actualizada."), "exito");
                    return cargar(true);
                })
                .catch(function (err) {
                    guardar.disabled = false;
                    guardar.textContent = "Guardar meta";

                    if (CDK.http.esError(err) && err.status === 401) return;
                    var estado = M.statusDe(err);
                    if (estado === "no identificado") return pintarSinAlta();

                    /* Estos dos dicen que la pantalla ya no esta al dia: quizas
                       confirmo desde otra pestaña, o le quitaron la marca. Se avisa
                       y se vuelve a pedir; lo demas (`meta invalida`…) se corrige aqui. */
                    var desfasada = estado === "marcas sin confirmar" || estado === "meta solo del dueno";
                    CDK.toast(M.mensajeError(err), desfasada ? "aviso" : "error", 6000);
                    if (desfasada) return cargar(true);
                });
        });

        return form;
    }

    /**
     * Lo que cambio respecto a la meta actual, listo para mandar: un campo que no
     * se toco NO viaja (conserva lo que tenia), y uno vaciado viaja en `null` (se
     * borra). Si la marca aun no tiene meta, todo lo que haya en el formulario es
     * nuevo —tambien lo que se precargo del mes pasado—. Devuelve null si algun
     * valor no sirve, tras avisar.
     *
     * Es lo que se ve a simple vista —un 0 o un negativo, unidades con decimales—;
     * la validacion de verdad es del backend, que responde `meta invalida`.
     */
    function leerCambios(m, entradas) {
        var cambios = {};

        for (var i = 0; i < MEDIDAS.length; i++) {
            var md = MEDIDAS[i];
            var texto = entradas[md.clave].value.trim();
            var antes = m.meta && hay(m.meta[md.clave]) ? m.meta[md.clave] : null;

            if (texto === "") {
                if (antes !== null) cambios[md.clave] = null;        // lo vacio: borra esa meta
                continue;
            }

            var n = Number(texto.replace(",", "."));

            /* Una meta de 0 no existe: para quitarla se deja vacia. */
            if (!isFinite(n) || n <= 0) {
                CDK.toast(md.campo + " tiene que ser un número mayor que 0. Para quitar esa meta, déjala vacía.", "aviso");
                entradas[md.clave].focus();
                return null;
            }
            if (md.clave === "unidades" && Math.floor(n) !== n) {
                CDK.toast("Las unidades tienen que ser un número entero.", "aviso");
                entradas[md.clave].focus();
                return null;
            }
            if (md.clave === "margenPct" && n > 100) {
                CDK.toast("La rentabilidad en % no puede pasar de 100.", "aviso");
                entradas[md.clave].focus();
                return null;
            }

            if (antes === null || n !== antes) cambios[md.clave] = n;
        }

        return cambios;
    }

})(window);
