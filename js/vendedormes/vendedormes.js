/**
 * Vendedor del mes (grupo 25).
 *
 * De cada una de tus marcas, **los 3 vendedores del grupo 20 que más la vendieron en el mes**, con
 * lo que vendió, qué parte del total es, y si sube o baja respecto al mes anterior. Una sola
 * vista: una tarjeta por marca.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona entiende:
 *
 *   · **El total de cada marca no es el avance de la cuota.** La cuota mide la marca en toda la
 *     empresa y con todas sus devoluciones; aquí el total es solo lo que vendieron los vendedores del
 *     grupo 20 **con venta mayor que 0**. Puede quedar por debajo (ventas de otros grupos) o por encima
 *     (devoluciones de vendedores que no entran). Lo dice la pantalla, porque los dos números se parecen
 *     (EPSON: 35 835,86 de cuota y 35 670,42 aquí) y alguien los va a comparar.
 *   · **Hasta qué día hay ventas.** `ventasHasta` dice el último día con ventas registradas: a principios de
 *     mes el top es de pocos días, y sin decirlo se lee como el del mes completo.
 *   · **Nada se calcula aquí.** El puesto, la participación, el total, el número de vendedores y
 *     la tendencia vienen del backend; la pantalla los pinta.
 *   · **Pueden venir menos de 3**, o ninguno: una marca que no vendió nadie se dice, no se omite.
 *   · Un vendedor sin `tipo` es uno que aún no se registró en la intranet: se dice, no se inventa.
 *   · Solo el mes en curso y el anterior. La tendencia compara con el mes anterior **al que se mira**.
 *
 * Sin marcas en el mes no hay nada que ver: es la misma regla que en cuota, reportes y cobertura.
 *
 * Ver docs/vendedor-mes-grupo25.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var V = CDK.vendedormes;
    var M = CDK.marcas;                 // periodo(), nombre(), statusDe(), mensajeError()

    var contenido = document.getElementById("contenido");
    var titulo = document.getElementById("periodo");

    if (!contenido) return;

    var lista = null;                   // lo ultimo que dijo GET /vendedormes/top
    var periodo = null;                 // null = el mes en curso; { anno, mes } = el anterior
    var actual = null;                  // { anno, mes } del mes en curso, en cuanto el servidor lo dice
    var filtro = "todas";               // sobrevive a cambiar de mes
    var busquedaMarca = "";
    var ticket = 0;                     // descarta respuestas de pedidos viejos

    cargar();

    /* ---------------------------------------------------------------
     * Formatos
     * ------------------------------------------------------------- */
    function dolares(v) { return CDK.formato.moneda(v, "D"); }
    function entero(v) { return CDK.formato.numero(v, 0); }
    function plural(n, uno, varios) { return entero(n) + " " + (n === 1 ? uno : varios); }
    function esSesionVencida(err) { return CDK.http.esError(err) && err.status === 401; }     // ya redirige

    var TIPOS = { COBERTURA: "Cobertura", CARTERA: "Cartera" };

    /** `COBERTURA` o `CARTERA`; `null` es un vendedor que aun no se registro en la intranet. */
    function tipoTexto(tipo) { return TIPOS[tipo] || "Sin registrar en la intranet"; }

    /**
     * Lo que dice la tendencia, con el puesto y la venta de entonces. El simbolo ayuda a ver de un vistazo, pero no es lo
     * unico: el texto lo dice, y el color solo acompaña.
     */
    function tendenciaTexto(v) {
        var a = v.anterior || {};
        var antes = a.puesto !== null && a.puesto !== undefined
            ? "antes puesto " + a.puesto + (a.venta !== null && a.venta !== undefined ? " · " + dolares(a.venta) : "")
            : "";

        if (v.tendencia === "sube") return "▲ Sube (" + antes + ")";
        if (v.tendencia === "baja") return "▼ Baja (" + antes + ")";
        if (v.tendencia === "igual") return "= Igual (" + antes + ")";
        return "Nuevo: no la vendió el mes anterior";
    }

    var TONO_TENDENCIA = { sube: "bien", baja: "alerta", igual: "nulo" };

    /**
     * Hasta que dia hay ventas registradas. Un backend que aun no lo manda no se inventa; `null` es un mes sin ventas.
     * En el mes en curso se dice que el top es de esos dias; en uno cerrado, no hace falta.
     */
    function ventasHastaTexto(d, pasado) {
        if (d.ventasHasta === undefined) return null;
        if (!d.ventasHasta) return pasado ? "Ese mes no tuvo ventas registradas." : "Este mes todavía no tiene ventas registradas.";
        return "Con ventas hasta el " + CDK.formato.fecha(d.ventasHasta) + "." + (pasado ? "" : " El top es de esos días.");
    }

    /* ---------------------------------------------------------------
     * Meses: el en curso y el anterior, nada mas
     * ------------------------------------------------------------- */
    function claveDe(p) { return p.anno + "-" + (p.mes < 10 ? "0" : "") + p.mes; }

    /** El mes en curso segun el servidor; el reloj solo mientras no lo haya dicho (sin marcas este mes). */
    function mesEnCurso() {
        if (actual) return actual;
        var hoy = new Date();
        return { anno: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
    }

    function mesAnterior(base) {
        var t = base.anno * 12 + (base.mes - 1) - 1;
        return { anno: Math.floor(t / 12), mes: (t % 12) + 1 };
    }

    function selectorDeMes() {
        var base = mesEnCurso();
        var opciones = [{ valor: "", texto: M.periodo(base) + " (este mes)" },
                        { valor: claveDe(mesAnterior(base)), texto: M.periodo(mesAnterior(base)) }];

        var elegida = periodo ? claveDe(periodo) : "";
        var s = el("select", { id: "vm-mes", clase: "cdk-entrada" }, opciones.map(function (o) {
            var op = el("option", { value: o.valor, texto: o.texto });
            if (o.valor === elegida) op.selected = true;
            return op;
        }));
        s.addEventListener("change", function () { irAlMes(s); });

        return el("div", { clase: "cdk-campo", style: "margin-top:12px" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "vm-mes", texto: "Mes" }), s
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
     * `silencioso`: al cambiar de mes se pide sin tapar la pantalla con un spinner, y si no se
     * puede, la pantalla buena se queda como estaba. Devuelve una promesa de si pinto.
     */
    function cargar(silencioso) {
        var mio = ++ticket;
        if (!silencioso) CDK.estados.cargando(contenido, "Buscando a los vendedores del mes…");

        return V.top(periodo)
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
                pintar();
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
     * Sin marcas este mes no hay a quien mirar: lo que falta es elegirlas. En el mes anterior es otra cosa
     * —entonces no tenías—, y no hay nada que elegir. En los dos casos se puede ir al otro mes.
     */
    function pintarSinMarcas(d) {
        lista = null;
        titulo.textContent = d.enEseMes ? M.periodo(periodo || {}) + " · sin marcas" : "Sin marcas este mes";
        contenido.innerHTML = "";

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "vm-meses" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Vendedor del mes" }),
            selectorDeMes()
        ]));

        if (d.enEseMes) {
            contenido.appendChild(el("section", { clase: "cdk-seccion", id: "vm-sin-marcas-mes" }, [
                el("h2", { clase: "cdk-seccion__titulo", texto: "No tenías marcas en " + M.periodo(periodo || {}) }),
                el("p", { clase: "cdk-seccion__sub", style: "margin:0",
                          texto: "Ese mes no tenías marcas asignadas, así que no hay vendedores que ver." })
            ]));
            return;
        }

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "vm-sin-marcas" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no tienes marcas este mes" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Los vendedores del mes se miran por marca: sin las tuyas no hay nada que consultar." }),
            d.msg ? el("p", { clase: "cdk-pista", style: "margin:0 0 14px", texto: d.msg }) : null,
            el("a", { href: CDK.rutas.app("/marcas.html"), clase: "cdk-boton cdk-boton--primario",
                      texto: "Elegir mis marcas" })
        ]));
    }

    function pintarSinAlta() {
        titulo.textContent = "Falta completar tu registro";
        contenido.innerHTML = "";

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "vm-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para ver los vendedores de tus marcas primero tienes que completar tu registro en la intranet." }),
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

    /** Un `<select>` con quien tiene cada marca. Solo para la jefatura: a un especialista todas le salen suyas. */
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

        /* Si lo que estaba elegido ya no existe tras cambiar de mes, el filtro se quedaria apuntando a nada. */
        if (!opciones.some(function (o) { return o.valor === filtro; })) filtro = "todas";

        var s = el("select", { id: "vm-filtro", clase: "cdk-entrada" }, opciones.map(function (o) {
            var op = el("option", { value: o.valor, texto: o.texto });
            if (o.valor === filtro) op.selected = true;
            return op;
        }));
        s.addEventListener("change", function () { filtro = s.value; alCambiar(); });
        return s;
    }

    /* ===============================================================
     * La lista de marcas, con su top
     * ============================================================= */
    function rolTexto(rol) { return rol === "JEFATURA" ? "Jefatura" : "Especialista"; }

    function pintar() {
        ticket++;
        contenido.innerHTML = "";

        var pasado = lista.actual === false;
        var jefatura = lista.rol === "JEFATURA";
        titulo.textContent = M.periodo(lista) + " · " + rolTexto(lista.rol) + (pasado ? " · mes cerrado" : "");

        var buscador = el("input", {
            type: "search", id: "vm-buscar-marca", clase: "cdk-entrada", autocomplete: "off",
            placeholder: "Buscar una marca", "aria-label": "Buscar una marca", value: busquedaMarca
        });
        var destino = el("div", { id: "vm-lista", style: "margin-top:12px" });

        function repintar() {
            busquedaMarca = buscador.value.trim();
            destino.innerHTML = "";
            var visibles = lista.marcas.filter(function (m) { return pasaFiltro(m, busquedaMarca); });

            if (!visibles.length) {
                CDK.estados.vacio(destino, "Ninguna marca coincide.");
                return;
            }
            visibles.forEach(function (m) { destino.appendChild(tarjetaDeMarca(m, jefatura)); });
        }

        buscador.addEventListener("input", repintar);

        var campos = [];
        if (jefatura) {
            campos.push(el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "vm-filtro", texto: "Ver las marcas de" }),
                selectorDeDuenos(repintar)
            ]));
        }
        campos.push(el("div", { clase: "cdk-campo" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "vm-buscar-marca", texto: "Buscar" }),
            buscador
        ]));

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "vm-resumen" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Vendedor del mes" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Los 3 vendedores del grupo 20 que más vendieron cada una de tus marcas. Todo en dólares y sin IGV, con lo " +
                             "mismo que cuenta como venta en la cuota." }),
            selectorDeMes(),
            /* Los dos numeros se parecen y alguien los va a comparar: se dice por que no son el mismo. */
            ventasHastaTexto(lista, pasado)
                ? el("p", { clase: "cdk-pista", id: "vm-ventas-hasta", style: "margin:10px 0 0", texto: ventasHastaTexto(lista, pasado) })
                : null,
            el("p", { clase: "cdk-pista", id: "vm-nota-total", style: "margin:10px 0 0",
                      texto: "El total de cada marca es solo lo que vendieron los vendedores del grupo 20 con venta mayor que 0: no es el avance " +
                             "de la cuota, que mide la marca en toda la empresa y con todas sus devoluciones, así que puede quedar por debajo o por " +
                             "encima. La tendencia compara con " +
                             (pasado ? "el mes anterior a este." : "el mes pasado.") })
        ]));

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "vm-marcas-seccion" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Tus marcas" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: jefatura
                          ? (pasado ? "Las tuyas y las de tus especialistas de ese mes." : "Las tuyas y las de tus especialistas que son de tu familia.")
                          : (pasado ? "Las marcas que tenías ese mes." : "Las marcas que tienes este mes, las hayas confirmado o no.") })
        ].concat(campos, [destino])));

        repintar();
    }

    /** Una marca: quien es, cuanto vendio el grupo 20 en total y sus tres mejores. */
    function tarjetaDeMarca(m, jefatura) {
        var partes = [m.codmar, m.familia];
        if (jefatura && !m.dueno.soyYo) partes.push(m.dueno.nombre);

        var cuerpo;
        if (!m.top.length) {
            /* Una marca que nadie vendio se dice, no se omite: «sin dato» y «nadie» no son lo mismo. */
            cuerpo = el("p", { clase: "cdk-pista", style: "margin:12px 0 0", id: "vm-vacio-" + m.codmar,
                               texto: "Nadie del grupo 20 la vendió este mes." });
        } else {
            cuerpo = el("ul", { clase: "cdk-articulos", id: "vm-top-" + m.codmar, style: "margin-top:12px" },
                        m.top.map(function (v) { return filaDeVendedor(v); }));
        }

        var seccion = el("section", { clase: "cdk-seccion", id: "vm-marca-" + m.codmar }, [
            el("h2", { clase: "cdk-seccion__titulo", style: "overflow-wrap:anywhere", texto: M.nombre(m) }),
            el("p", { clase: "cdk-seccion__sub", style: "margin:0", texto: partes.join(" · ") }),
            el("p", { clase: "cdk-pista", id: "vm-total-" + m.codmar, style: "margin:8px 0 0",
                      texto: "El grupo 20 vendió " + dolares(m.total.venta) + " · " + plural(m.total.vendedores, "vendedor", "vendedores") }),
            cuerpo
        ]);
        seccion.setAttribute("data-codmar", m.codmar);
        return seccion;
    }

    function filaDeVendedor(v) {
        var item = CDK.articulo({
            nombre: [el("span", { clase: "cdk-puesto cdk-puesto--" + v.puesto, "aria-label": "Puesto " + v.puesto, texto: String(v.puesto) }),
                     document.createTextNode(v.nombre)],
            importe: dolares(v.venta),
            detalle: tipoTexto(v.tipo) + " · " + CDK.formato.numero(v.participacion, 2) + " % del total",
            datos: [
                { etiqueta: "Unidades", valor: entero(v.unidades) },
                { etiqueta: "Clientes", valor: entero(v.clientes) },
                { etiqueta: "Tendencia", valor: tendenciaTexto(v), tono: TONO_TENDENCIA[v.tendencia] || null }
            ]
        });
        item.setAttribute("data-codven", v.codven);
        item.setAttribute("data-puesto", String(v.puesto));
        return item;
    }

})();
