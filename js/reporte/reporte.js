/**
 * Reportes por marca (grupo 25).
 *
 * Tres pasos, todos en esta pagina:
 *
 *   1. las marcas que la persona puede consultar ESTE MES
 *   2. un informe de los tres: stock, tiempo en almacen, lista de precios
 *   3. verlo en una tabla y, si quiere, exportarlo a Excel
 *
 * **Sin marcas en el mes no hay reportes**, ni los del mes pasado: es una regla
 * de negocio, y lo que se le dice a quien llega sin marcas es justo eso, con el
 * camino a Marcas. Ni la lista ni el informe se calculan aqui: la pantalla
 * pinta lo que llega y **no suma nada** —`total` y `stock` vienen del backend—.
 *
 * Las filas llegan con nombres y cada informe trae su lista de `columnas`, asi
 * que una sola tabla sirve para los tres.
 *
 * Ver docs/reportes-grupo25.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var R = CDK.reportes;
    var M = CDK.marcas;                 // periodo(), statusDe(), mensajeError()

    var contenido = document.getElementById("contenido");
    var periodo = document.getElementById("periodo");

    if (!contenido) return;

    var lista = null;                   // lo ultimo que dijo GET /reporte/marca
    var marca = null;                   // la marca elegida
    var informeActual = null;           // la clave del informe en pantalla
    var ticket = 0;                     // descarta respuestas de pedidos viejos
    var filtro = "todas";               // sobrevive a recargar la lista

    cargar();

    /* ===============================================================
     * 1 · La lista de marcas
     * ============================================================= */
    function cargar() {
        var mio = ++ticket;
        CDK.estados.cargando(contenido, "Cargando tus marcas…");

        return R.marcas()
            .then(function (d) {
                if (mio !== ticket) return;
                if (d.sinMarcas) return pintarSinMarcas(d);

                lista = d;
                periodo.textContent = M.periodo(d) + " · " + (d.rol === "JEFATURA" ? "Jefatura" : "Especialista");
                pintarMarcas();
            })
            .catch(function (err) {
                if (mio !== ticket) return;
                if (esSesionVencida(err)) return;
                if (M.statusDe(err) === "no identificado") return pintarSinAlta();

                CDK.estados.error(contenido, err, cargar);
            });
    }

    function esSesionVencida(err) {
        return CDK.http.esError(err) && err.status === 401;      // ya redirige
    }

    /** Sin marcas: es una regla, no un fallo. Se dice cual y se ofrece el camino. */
    function pintarSinMarcas(d) {
        periodo.textContent = "Sin marcas este mes";
        contenido.innerHTML = "";

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "reporte-sin-marcas" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no tienes marcas este mes" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Los reportes salen de las marcas que tienes en el mes en curso: sin ellas no hay " +
                             "nada que consultar, ni siquiera las del mes pasado." }),
            d.msg ? el("p", { clase: "cdk-pista", style: "margin:0 0 14px", texto: d.msg }) : null,
            el("a", { href: CDK.rutas.app("/marcas.html"), clase: "cdk-boton cdk-boton--primario",
                      texto: "Elegir mis marcas" })
        ]));
    }

    function pintarSinAlta() {
        periodo.textContent = "Falta completar tu registro";
        contenido.innerHTML = "";

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "reporte-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para ver tus reportes primero tienes que completar tu registro en la intranet." }),
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

    /** Un `<select>` con quien tiene cada marca. Solo para la jefatura: a un
        especialista todas le salen suyas y filtrar no le diria nada. */
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

        /* Si lo que estaba elegido ya no existe tras recargar, el filtro se
           quedaria apuntando a nada y la lista saldria vacia sin explicacion. */
        if (!opciones.some(function (o) { return o.valor === filtro; })) filtro = "todas";

        var s = el("select", { id: "reporte-filtro", clase: "cdk-entrada" }, opciones.map(function (o) {
            var op = el("option", { value: o.valor, texto: o.texto });
            if (o.valor === filtro) op.selected = true;
            return op;
        }));
        s.addEventListener("change", function () { filtro = s.value; alCambiar(); });
        return s;
    }

    /**
     * La segunda linea de una marca: su familia, de quien es (a la jefatura le
     * dice cual es de cada especialista) y cuantos productos vigentes tiene. Una
     * marca sin ninguno se dice ya aqui, antes de abrirla.
     */
    function detalleDe(m, jefatura) {
        var partes = [m.familia];
        if (jefatura && !m.dueno.soyYo) partes.push(m.dueno.nombre);
        if (typeof m.productos === "number") {
            partes.push(m.productos === 0 ? "sin productos vigentes"
                                          : m.productos + (m.productos === 1 ? " producto" : " productos"));
        }
        return partes.join(" · ");
    }

    function pintarMarcas() {
        marca = null;
        informeActual = null;
        contenido.innerHTML = "";

        var jefatura = lista.rol === "JEFATURA";
        var buscador = el("input", {
            type: "search", id: "reporte-buscar-marca", clase: "cdk-entrada",
            placeholder: "Buscar una marca", autocomplete: "off", "aria-label": "Buscar una marca"
        });
        var destino = el("div", { id: "reporte-lista", style: "margin-top:12px" });

        function repintar() {
            destino.innerHTML = "";
            var visibles = lista.marcas.filter(function (m) { return pasaFiltro(m, buscador.value.trim()); });

            if (!visibles.length) {
                CDK.estados.vacio(destino, "Ninguna marca coincide.");
                return;
            }

            var ul = el("ul", { clase: "cdk-articulos" });
            visibles.forEach(function (m) {
                ul.appendChild(CDK.articulo({
                    distintivo: m.codmar,
                    nombre: CDK.resaltar(M.nombre(m), buscador.value.trim()),
                    detalle: detalleDe(m, jefatura),
                    alPulsar: function () { elegir(m); }
                }));
            });
            destino.appendChild(ul);
        }

        buscador.addEventListener("input", repintar);

        var campos = [];
        if (jefatura) {
            campos.push(el("div", { clase: "cdk-campo" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": "reporte-filtro", texto: "Ver las marcas de" }),
                selectorDeDuenos(repintar)
            ]));
        }
        campos.push(el("div", { clase: "cdk-campo" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "reporte-buscar-marca", texto: "Buscar" }),
            buscador
        ]));

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "reporte-marcas" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Elige una marca" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: jefatura
                          ? "Las tuyas y las de tus especialistas que son de tu familia."
                          : "Las marcas que tienes este mes, las hayas confirmado o no." })
        ].concat(campos, [destino])));

        repintar();
    }

    /* ===============================================================
     * 2 · Una marca y sus tres informes
     * ============================================================= */
    function elegir(m) {
        marca = m;
        informeActual = null;
        ticket++;

        contenido.innerHTML = "";

        var pestanas = el("ul", { clase: "cdk-pestanas", role: "tablist", id: "reporte-pestanas" },
            R.INFORMES.map(function (inf) {
                var b = el("button", {
                    type: "button", role: "tab", clase: "cdk-pestana", id: "pestana-" + inf.clave,
                    "aria-selected": "false", texto: inf.etiqueta
                });
                b.addEventListener("click", function () { verInforme(inf.clave); });
                return el("li", {}, [b]);
            }));

        /* Corto a proposito: «Cambiar de marca» se llevaba la mitad del ancho en
           un movil y el nombre de la marca quedaba cortado. */
        var cambiar = el("button", { type: "button", id: "reporte-cambiar", "aria-label": "Cambiar de marca",
                                     clase: "cdk-boton cdk-boton--suave", texto: "Cambiar" });
        cambiar.addEventListener("click", function () { ticket++; pintarMarcas(); });

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "reporte-informe" }, [
            el("div", { clase: "cdk-elegido", style: "margin-bottom:16px" }, [
                el("div", { clase: "cdk-elegido__datos" }, [
                    /* Un nombre como EP_IMPRESORAS no tiene un espacio donde partir. */
                    el("div", { clase: "cdk-elegido__nombre", id: "reporte-marca-nombre",
                                style: "overflow-wrap:anywhere", texto: M.nombre(m) }),
                    el("div", { clase: "cdk-elegido__detalle", texto: m.codmar + " · " + detalleDe(m, false) })
                ]),
                cambiar
            ]),
            el("h2", { clase: "cdk-seccion__titulo", texto: "¿Qué informe quieres?" }),
            el("div", { style: "margin-top:10px" }, [pestanas]),
            el("div", { id: "reporte-resultado" }, [
                el("p", { clase: "cdk-pista", id: "reporte-pista",
                          texto: "Elige un informe para verlo aquí. Después puedes exportarlo a Excel." })
            ])
        ]));
    }

    function marcarPestana(clave) {
        R.INFORMES.forEach(function (inf) {
            var b = document.getElementById("pestana-" + inf.clave);
            if (!b) return;
            var activa = inf.clave === clave;
            b.classList.toggle("es-activa", activa);
            b.setAttribute("aria-selected", String(activa));
        });
    }

    /**
     * Pide un informe y lo pinta. Con `periodo` (`{ desde, hasta }`) es el mismo
     * informe de las guias en otro periodo: la tabla de antes se queda a la vista
     * mientras llega, y si el rango no vale se avisa sin borrarla. Borrarla
     * dejaria sin fechas que corregir a quien acaba de equivocarse en una.
     */
    function verInforme(clave, periodo) {
        if (!marca || (clave === informeActual && !periodo)) return;

        var mio = ++ticket;
        informeActual = clave;
        marcarPestana(clave);

        var destino = document.getElementById("reporte-resultado");
        var aplicar = periodo ? document.getElementById("reporte-aplicar") : null;

        if (aplicar) { aplicar.disabled = true; aplicar.textContent = "Buscando…"; }
        else CDK.estados.cargando(destino, "Preparando el informe…");

        R.ver(clave, marca.codmar, periodo)
            .then(function (d) {
                if (mio !== ticket) return;                 // eligieron otro mientras llegaba
                if (d.sinMarcas) return pintarSinMarcas(d);
                pintarInforme(destino, clave, d);
            })
            .catch(function (err) {
                if (mio !== ticket) return;
                if (esSesionVencida(err)) return;

                /* Si la marca ya no esta entre las que puede consultar, la lista
                   que se enseño esta desfasada: se vuelve a pedir. */
                if (manejarEstado(err)) return;

                if (aplicar) {
                    CDK.toast(M.mensajeError(err), "aviso", 6000);
                    aplicar.disabled = false;
                    aplicar.textContent = "Ver periodo";
                    return;
                }

                informeActual = null;
                marcarPestana(null);
                CDK.estados.error(destino, err, function () { verInforme(clave); });
            });
    }

    /** Errores que significan «lo que se enseña ya no vale». true si lo trato. */
    function manejarEstado(err) {
        var estado = M.statusDe(err);

        if (estado === "no identificado") { pintarSinAlta(); return true; }

        if (err.datos && (err.datos.debeAsignar || estado === "sin marcas del mes")) {
            pintarSinMarcas({ msg: err.datos.msg });
            return true;
        }

        if (estado === "marca no disponible") {
            CDK.toast(M.mensajeError(err), "aviso", 6000);
            cargar();
            return true;
        }

        return false;
    }

    /* ===============================================================
     * 3 · La tabla y la exportacion
     * ============================================================= */

    /** Una columna es numerica si algun valor suyo lo es: los `null` no dicen nada. */
    function esNumerica(filas, campo) {
        return filas.some(function (f) { return typeof f[campo] === "number"; });
    }

    /**
     * El texto y el estilo de una celda.
     *
     *   · `null` no es lo mismo en todos los sitios. En tiempo, «sin compra desde
     *     2023»: el producto lleva mas que eso o entro por otro camino. En
     *     precios, «—»: no esta dado de alta en ese almacen. Un 0 es un 0.
     *   · el stock negativo se pinta tal cual, en rojo: hay mas separado que fisico.
     */
    function formatear(inf, campo, valor, d) {
        if (valor === null || valor === undefined) {
            var tiempo = inf === "tiempo" && (campo === "ultimaCompra" || campo === "dias");
            return { texto: tiempo ? "sin compra" + (d.kardexDesde ? " desde " + d.kardexDesde : "") : "—",
                     clase: "cdk-tabla__vacio" };
        }

        /* Fechas `AAAA-MM-DD`: en formato local. */
        if (campo === "ultimaCompra" || campo === "fecha") return { texto: CDK.formato.fecha(valor), clase: "" };

        /* El almacen de una guia llega como codigo (01, 08, 15…). Un codigo no le
           dice nada a quien consulta; un codigo que el catalogo no conozca sale tal cual. */
        if (campo === "almacen") return { texto: CDK.catalogo.almacen(valor), clase: "" };

        if (typeof valor === "number") {
            /* Todo lo de precios es dolares y sin IGV, como dice el backend. */
            if (inf === "precios") {
                return { texto: CDK.formato.moneda(valor, "D"), clase: valor < 0 ? "cdk-tabla__negativo" : "" };
            }
            return { texto: CDK.formato.numero(valor, valor % 1 === 0 ? 0 : 2),
                     clase: valor < 0 ? "cdk-tabla__negativo" : "" };
        }

        return { texto: String(valor), clase: "" };
    }

    /**
     * Columnas que llegan pero NO se enseñan: el codigo interno del producto
     * (`codi`). A quien consulta no le sirve. El de fabrica (`codf`) SI se
     * enseña: es el que se reconoce y se busca.
     *
     * Es solo de la tabla. **El Excel conserva todas las columnas**: es la
     * exportacion de datos, y alli el codigo interno sirve para cruzar con el
     * ERP. Si se quisiera verlo, basta quitarlo de aqui.
     */
    var OCULTAS = ["codi"];

    /* Lo que es de la GUIA y no del producto. Una guia con tres productos repite estas
       celdas en tres filas; las repetidas se atenuan para que se lea de un vistazo
       donde acaba una guia y empieza otra. */
    var DE_LA_GUIA = ["fecha", "tipo", "numero", "estado", "motivo", "almacen", "cliente",
                      "referencia", "numeroReferencia"];

    function construirTabla(inf, d) {
        var columnas = d.columnas.filter(function (c) { return OCULTAS.indexOf(c.campo) === -1; });

        var numericas = {};
        columnas.forEach(function (c) { numericas[c.campo] = esNumerica(d.filas, c.campo); });

        function clase(c) {
            return numericas[c.campo] ? "cdk-tabla__num" : c.campo === "descripcion" ? "cdk-tabla__texto" : "";
        }

        var cabecera = el("tr", {}, columnas.map(function (c) {
            return el("th", { scope: "col", clase: clase(c), texto: c.titulo });
        }));

        var filas = d.filas.map(function (f, i) {
            var esGuias = inf === "guias";
            var nueva = esGuias && (i === 0 || f.numero !== d.filas[i - 1].numero);

            var tr = el("tr", { clase: nueva ? "cdk-tabla__grupo" : "" }, columnas.map(function (c) {
                var cel = formatear(inf, c.campo, f[c.campo], d);
                var repetida = esGuias && !nueva && DE_LA_GUIA.indexOf(c.campo) !== -1;
                return el("td", {
                    clase: (clase(c) + " " + cel.clase + (repetida ? " cdk-tabla__repetido" : "")).trim(),
                    texto: cel.texto
                });
            }));
            /* Lo que se puede buscar, listo: filtrar 700 filas tecla a tecla no
               debe reconstruir nada, solo esconder. Solo lo que se ve: buscar por
               el codigo interno, que no aparece en pantalla, no tendria sentido. */
            tr.setAttribute("data-buscar", [f.codf, f.descripcion, f.partNumber, f.numero, f.cliente, f.numeroReferencia]
                .filter(Boolean).join(" ").toLowerCase());
            if (esGuias) tr.setAttribute("data-guia", f.numero);
            return tr;
        });

        return {
            nodo: el("div", { clase: "cdk-tabla-caja", id: "reporte-tabla-caja" }, [
                el("table", { clase: "cdk-tabla", id: "reporte-tabla" }, [
                    el("thead", {}, [cabecera]),
                    el("tbody", {}, filas)
                ])
            ]),
            filas: filas
        };
    }

    function plural(n, uno, varios) { return n + " " + (n === 1 ? uno : varios); }

    /**
     * El periodo de las guias: dos fechas y un boton. Salen con lo que el backend
     * dice que uso de verdad (`desde`, `hasta`), que sin elegir es el mes en curso.
     * Se comprueba lo que se ve a simple vista —las dos fechas, y que no esten al
     * reves—; el maximo de 3 meses lo dice el backend con su propio mensaje.
     */
    function controlesDePeriodo(clave, d) {
        var desde = el("input", { type: "date", id: "reporte-desde", clase: "cdk-entrada", style: "min-width:0",
                                  value: d.desde || "", "aria-label": "Desde" });
        var hasta = el("input", { type: "date", id: "reporte-hasta", clase: "cdk-entrada", style: "min-width:0",
                                  value: d.hasta || "", "aria-label": "Hasta" });
        var aplicar = el("button", { type: "button", id: "reporte-aplicar",
                                     clase: "cdk-boton cdk-boton--suave", texto: "Ver periodo" });

        aplicar.addEventListener("click", function () {
            if (!desde.value || !hasta.value) {
                CDK.toast("Elige las dos fechas.", "aviso");
                return;
            }
            if (desde.value > hasta.value) {
                CDK.toast("«Desde» no puede ser posterior a «Hasta».", "aviso");
                return;
            }
            verInforme(clave, { desde: desde.value, hasta: hasta.value });
        });

        function campo(etiqueta, id, input) {
            return el("div", { clase: "cdk-campo", style: "min-width:0" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": id, texto: etiqueta }), input
            ]);
        }

        return el("div", { id: "reporte-periodo", style: "margin-bottom:14px" }, [
            /* Siempre en dos columnas: apiladas, en un movil el periodo ocupaba media pantalla
                   y la tabla quedaba fuera de la vista. */
            /* minmax(0, 1fr): un input de fecha trae un ancho minimo propio y, con 1fr a
               secas, la columna no encoge y el campo se sale de la tarjeta. */
            el("div", { clase: "cdk-pareja", style: "grid-template-columns:minmax(0,1fr) minmax(0,1fr)" },
               [campo("Desde", "reporte-desde", desde), campo("Hasta", "reporte-hasta", hasta)]),
            el("div", { style: "margin-top:10px" }, [aplicar]),
            el("p", { clase: "cdk-pista", texto: "Como máximo 3 meses. Sin tocar nada, el mes en curso." })
        ]);
    }

    function pintarInforme(destino, clave, d) {
        var inf = R.informe(clave);
        destino.innerHTML = "";

        var generado = d.generado ? " · generado el " + CDK.formato.fecha(d.generado, "conHora") : "";

        /* El periodo va SIEMPRE, tambien sin filas: si no, quien eligio un rango sin
           guias no tendria como probar con otro. */
        var periodo = inf.periodo ? controlesDePeriodo(clave, d) : null;

        /* ---- sin filas: se dice por que, y no se ofrece exportar una hoja vacia */
        if (!d.filas.length) {
            destino.appendChild(el("div", { style: "margin-top:14px" }, [
                periodo,
                el("p", { clase: "cdk-pista", id: "reporte-vacio", texto: inf.vacio })
            ]));
            return;
        }

        var tabla = construirTabla(clave, d);
        var cuenta = el("p", { clase: "cdk-pista", id: "reporte-cuenta", style: "margin:10px 0" });

        /* Cuantas se ven. En las guias hay dos cuentas distintas —guias y
           productos— porque una guia ocupa tantas filas como productos lleve. */
        function contar(visibles) {
            var texto;

            if (clave === "guias") {
                var guias = {};
                tabla.filas.forEach(function (tr) {
                    if (!tr.classList.contains("hidden")) guias[tr.getAttribute("data-guia")] = true;
                });
                var n = Object.keys(guias).length;

                texto = visibles === d.filas.length
                    ? plural(n, "guía", "guías") + " · " + plural(d.filas.length, "producto", "productos")
                    : "Mostrando " + plural(n, "guía", "guías") + " · " + visibles + " de " +
                      plural(d.filas.length, "producto", "productos");
            } else {
                texto = visibles === d.filas.length
                    ? plural(d.filas.length, "producto", "productos")
                    : "Mostrando " + visibles + " de " + d.filas.length + " productos";
            }

            cuenta.textContent = texto + generado;
        }

        var buscador = el("input", {
            type: "search", id: "reporte-buscar", clase: "cdk-entrada",
            placeholder: inf.buscar, autocomplete: "off",
            "aria-label": "Buscar en el informe"
        });
        buscador.addEventListener("input", function () {
            var aguja = buscador.value.trim().toLowerCase();
            var visibles = 0;
            tabla.filas.forEach(function (tr) {
                var ve = !aguja || tr.getAttribute("data-buscar").indexOf(aguja) !== -1;
                tr.classList.toggle("hidden", !ve);
                if (ve) visibles++;
            });
            contar(visibles);
        });

        var exportar = el("button", { type: "button", id: "reporte-exportar",
                                      clase: "cdk-boton cdk-boton--primario", texto: "Exportar a Excel" });
        /* El Excel lleva el periodo de la tabla que se VE (`d.desde`, `d.hasta`), no el
           de las fechas que alguien haya tocado sin aplicar. */
        exportar.addEventListener("click", function () {
            descargar(exportar, clave, inf.periodo ? { desde: d.desde, hasta: d.hasta } : null);
        });

        var ayuda = el("details", { clase: "cdk-plegable", style: "margin-top:14px" }, [
            el("summary", { clase: "cdk-plegable__titulo", texto: "Cómo se calcula" })
        ].concat(inf.ayuda(d).map(function (linea) {
            return el("p", { clase: "cdk-pista", style: "margin:8px 0 0", texto: linea });
        })));

        destino.appendChild(el("div", { style: "margin-top:14px" }, [
            periodo,
            el("div", { clase: "cdk-buscador" }, [
                el("div", { clase: "cdk-buscador__campo" }, [buscador]),
                exportar
            ]),
            cuenta,
            tabla.nodo,
            ayuda
        ]));

        contar(d.filas.length);
    }

    /**
     * Exporta a Excel. El archivo se pide aparte, no se arma con la tabla que se
     * ve: lo que se descarga es exactamente lo que dice el backend.
     */
    function descargar(boton, clave, periodo) {
        if (boton.disabled) return;

        var texto = boton.textContent;
        boton.disabled = true;
        boton.textContent = "Generando…";

        R.exportar(clave, marca.codmar, periodo)
            .then(function (r) {
                guardar(r.blob, r.nombre);
                CDK.toast("Se descargó " + r.nombre, "exito");
            })
            .catch(function (err) {
                if (esSesionVencida(err)) return;

                /* Un 403 `marca no disponible` o un `sin marcas del mes` dejan
                   la pantalla desfasada: se tratan como al ver el informe. */
                if (manejarEstado(err)) return;
                CDK.toast(M.mensajeError(err), "error", 6000);
            })
            .then(function () {
                boton.disabled = false;
                boton.textContent = texto;
            });
    }

    /** Guarda el archivo: un enlace con `download` sobre un blob, que es lo unico
        que dispara la descarga sin salir de la pagina. */
    function guardar(blob, nombre) {
        var url = window.URL.createObjectURL(blob);
        var a = el("a", { href: url, download: nombre, style: "display:none" });

        document.body.appendChild(a);
        a.click();
        a.remove();

        /* No se revoca ya: algunos navegadores empiezan a leer el blob despues
           del clic, y revocarlo antes corta la descarga. */
        setTimeout(function () { window.URL.revokeObjectURL(url); }, 2000);
    }

})();
