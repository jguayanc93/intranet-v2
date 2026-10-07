/**
 * El avance de la cuota del mes.
 *
 * Sustituye a las ~390 líneas de <script> que vivían dentro de
 * cuota_observar.html, y cambia de qué habla la pantalla:
 *
 *   · **Los segmentos 2 y 3 se fueron.** El 2 medía el avance sobre una
 *     familia de producto pero nunca decía de qué familia, así que parecía
 *     repetir el segmento 1. El 3 se leía al revés: se titulaba «items
 *     especiales requeridos» y en realidad listaba los que el vendedor **ya
 *     había vendido**, sin cantidad ni meta, así que no decía qué faltaba.
 *   · **En su sitio van cuatro cosas accionables**: cuánto falta en dólares,
 *     cómo va de ritmo contra su propio cierre habitual, cuánto le restan las
 *     notas de crédito, y a qué clientes llamar.
 *
 * El avance es lo primordial: si alguno de los cuatro añadidos llega `null`
 * —porque falló su consulta— la pantalla se abre igual y ese bloque no sale.
 *
 * Ver docs/cuota.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    var avance = document.getElementById("avance");
    var secRitmo = document.getElementById("seccion-ritmo");
    var secNotas = document.getElementById("seccion-notas");
    var secRepo = document.getElementById("seccion-reposicion");

    if (!avance) return;

    cargar();

    function cargar() {
        CDK.estados.cargando(avance, "Cargando tu avance…");

        /* Es un GET y es un direccionador: según el tipo de vendedor que
           viaja en la galleta, el backend reenvía a /cobertura, /cartera o
           /especialista. Desde aquí es una sola ruta. */
        CDK.http.get(CDK.rutas.api("/cuota/mostrar"))
            .then(pintar)
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                CDK.estados.error(avance, err, cargar);
            });
    }

    function pintar(respuesta) {
        var d = (respuesta && respuesta.data) || respuesta || {};

        /* Todavía no registró su cuota de este mes. No es un error: es un
           estado normal del día 1, y el backend lo dice con un campo propio
           para no tener que adivinarlo comparando textos.

           Antes esto llegaba como un 500 y el vendedor veía una pantalla
           rota cuando lo único que pasaba es que le tocaba registrar. */
        /* Hay cuatro tipos de vendedor a los que la cuota no les toca
           —jefatura, zona, hp y, de hecho, el especialista, que nunca tuvo
           una meta cargada—. El direccionador lo dice con 200 y un campo
           propio, no con un 404, para que esto no tenga que adivinarlo. */
        if (d.aplica === false || d.status === "cuota no corresponde") {
            return noCorresponde(d);
        }

        if (d.debeRegistrar) return pedirRegistro(d);

        /* Los especialistas tienen cuota POR MARCA —no es el caso de
           cobertura ni de cartera, que son quienes usan esta pantalla— y el
           direccionador los manda a otra ruta, que responde
           `{ multiple: … }`. Esa forma no está documentada, así que no se
           pinta a ojo: se dice lo que pasa.

           Es una vista aparte y pendiente, no un fallo de esta.
           Ver docs/respuesta-cuota.md. */
        if (d.multiple !== undefined) return porMarcaPendiente();

        pintarAvance(d);
        pintarRitmo(d.ritmo);
        pintarNotas(d.notas);
        pintarReposicion(d.reposicion);
    }

    /* ===============================================================
     * Sin cuota registrada
     * ============================================================= */

    function pedirRegistro(d) {
        avance.innerHTML = "";

        avance.appendChild(el("div", { clase: "cdk-aviso" }, [
            el("p", { clase: "cdk-aviso__texto",
                      texto: d.msg || "Todavía no registraste tu cuota de este mes." }),
            el("p", { clase: "cdk-pista",
                      texto: "El avance aparece en cuanto la registres. Es una vez al mes." })
        ]));

        var ir = el("a", {
            href: CDK.rutas.app("/cuota/cuota_registrar.html"),
            clase: "cdk-boton cdk-boton--primario",
            style: "margin-top:12px",
            texto: "Registrar mi cuota"
        });
        avance.appendChild(ir);
    }

    function noCorresponde(d) {
        avance.innerHTML = "";
        avance.appendChild(el("div", { clase: "cdk-estado" }, [
            el("p", { clase: "cdk-estado__texto",
                      texto: d.msg || "Tu tipo de vendedor no lleva cuota mensual." }),
            /* Sin botón de reintentar ni de registrar: no es que falte algo,
               es que no aplica. Ofrecer una acción que no existe es peor que
               no ofrecer ninguna. */
            el("p", { clase: "cdk-pista",
                      texto: "Esta pantalla es para quienes tienen una cuota asignada." })
        ]));
    }

    function porMarcaPendiente() {
        avance.innerHTML = "";
        avance.appendChild(el("div", { clase: "cdk-aviso" }, [
            el("p", { clase: "cdk-aviso__texto",
                      texto: "Tu cuota va por marca, y esa vista todavía no está montada." }),
            el("p", { clase: "cdk-pista",
                      texto: "Es una vista distinta de la de cobertura y cartera, y está " +
                             "pedida al equipo de sistemas. Mientras tanto no se enseña " +
                             "nada antes que enseñarlo mal." })
        ]));
    }

    /* ===============================================================
     * Segmento 1 · el avance
     * ============================================================= */

    function pintarAvance(d) {
        avance.innerHTML = "";

        var pct = porcentaje(d.porcentaje);

        /* La frase va arriba y grande. Es lo que la gente lee primero, y
           para eso se pidieron las 61: un «vas al 38 %» no se recuerda, un
           «ya se te ve el potencial de Super Saiyajin» sí. */
        if (d.mensaje) {
            avance.appendChild(el("p", {
                clase: "cdk-seccion__titulo",
                style: "margin:0 0 14px; font-style:italic",
                texto: "«" + d.mensaje + "»"
            }));
        }

        avance.appendChild(barra(pct));

        var filas = [
            total("Meta del mes", d.meta),
            total("Llevas", d.avance)
        ];

        /* Cuánto falta, en dólares. Es el añadido más simple de los cuatro y
           probablemente el más útil: «te faltan 4.800» se acciona, «vas al
           76 %» se mira. */
        if (d.falta !== undefined && d.falta !== null) {
            filas.push(el("div", {
                clase: "cdk-total cdk-total--principal " +
                       (Number(d.falta) <= 0 ? "cdk-total--bien" : "")
            }, [
                el("span", { clase: "cdk-total__etiqueta",
                             texto: Number(d.falta) <= 0 ? "Pasaste la meta por" : "Te falta" }),
                el("span", { clase: "cdk-total__valor",
                             texto: CDK.formato.moneda(Math.abs(Number(d.falta)), "D") })
            ]));
        }

        avance.appendChild(el("div", { clase: "cdk-totales", style: "margin-top:14px" }, filas));
    }

    function total(etiqueta, valor) {
        return el("div", { clase: "cdk-total" }, [
            el("span", { clase: "cdk-total__etiqueta", texto: etiqueta }),
            el("span", { clase: "cdk-total__valor",
                         texto: valor === undefined || valor === null
                             ? "—" : CDK.formato.moneda(valor, "D") })
        ]);
    }

    /** El porcentaje llega como "38.40 %" o como número. */
    function porcentaje(valor) {
        if (valor === undefined || valor === null) return 0;
        var n = parseFloat(String(valor).replace("%", "").trim());
        return isNaN(n) ? 0 : n;
    }

    function barra(pct, etiquetaIzq, etiquetaDer) {
        var tono = pct >= 100 ? " cdk-progreso__relleno--bien"
                 : pct < 50 ? " cdk-progreso__relleno--alerta" : "";

        return el("div", { clase: "cdk-progreso" }, [
            el("div", { clase: "cdk-progreso__pista" }, [
                /* Nunca más del 100 % de ancho: una barra que se sale de su
                   pista parece un fallo, no un logro. Pasarse lo cuenta el
                   color y lo cuenta la cifra. */
                el("div", {
                    clase: "cdk-progreso__relleno" + tono,
                    style: "width:" + Math.max(0, Math.min(100, pct)) + "%"
                })
            ]),
            el("div", { clase: "cdk-progreso__pie" }, [
                el("span", { texto: etiquetaIzq || "Avance del mes" }),
                el("span", { texto: etiquetaDer || (pct.toFixed(1) + " %") })
            ])
        ]);
    }

    /* ===============================================================
     * Ritmo
     * ============================================================= */

    function pintarRitmo(r) {
        if (!r) return;                       // llegó null: su consulta falló
        secRitmo.classList.remove("hidden");

        var destino = document.getElementById("ritmo");
        destino.innerHTML = "";

        var real = Number(r.real) || 0;
        var esperado = Number(r.esperado) || 0;

        destino.appendChild(barra(real, "Va " + real.toFixed(1) + " %",
                                        "del mes transcurrido: " + esperado.toFixed(1) + " %"));

        var filas = [];

        if (r.estado) {
            filas.push(el("div", {
                clase: "cdk-total " + (r.estado === "detras" ? "cdk-total--alerta" : "cdk-total--bien")
            }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Contra el calendario" }),
                el("span", { clase: "cdk-total__valor",
                             texto: r.estado === "detras" ? "vas detrás" : "vas por delante" })
            ]));
        }

        /* Lo que hace útil al resto. «Vas al 50 % el día 20» asusta; «vas al
           50 % el día 20 y sueles cerrar al 86 %» no. */
        if (r.cierreTipico !== undefined && r.cierreTipico !== null) {
            filas.push(el("div", { clase: "cdk-total cdk-total--principal" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Sueles cerrar al" }),
                el("span", { clase: "cdk-total__valor",
                             texto: Number(r.cierreTipico).toFixed(1) + " %" })
            ]));
        }

        if (filas.length) destino.appendChild(el("div", { clase: "cdk-totales" }, filas));

        var historico = Array.isArray(r.historico) ? r.historico : [];
        if (!historico.length) return;

        destino.appendChild(el("p", {
            clase: "cdk-pista", style: "margin:12px 0 6px",
            texto: "Tus últimos meses:"
        }));

        var lista = el("ul", { clase: "cdk-articulos" });
        historico.forEach(function (m) {
            var p = Number(m.porcentaje) || 0;
            lista.appendChild(CDK.articulo({
                nombre: m.periodo,
                importe: p.toFixed(1) + " %",
                datos: [{ etiqueta: "", valor: p >= 100 ? "cumplida" : "no llegó",
                          tono: p >= 100 ? "bien" : "alerta" }]
            }));
        });
        destino.appendChild(lista);
    }

    /* ===============================================================
     * Notas de crédito
     * ============================================================= */

    function pintarNotas(n) {
        /* Solo cuando pesan. `avisar` se pone a true a partir del 10 %, que
           es cuando deja de ser ruido: enseñar un 0,3 % todos los meses
           acostumbraría a ignorar el bloque justo el mes que importa. */
        if (!n || !n.avisar) return;
        secNotas.classList.remove("hidden");

        var destino = document.getElementById("notas");
        destino.innerHTML = "";

        destino.appendChild(el("div", { clase: "cdk-totales" }, [
            el("div", { clase: "cdk-total" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Facturaste" }),
                el("span", { clase: "cdk-total__valor",
                             texto: CDK.formato.moneda(n.facturado, "D") })
            ]),
            el("div", { clase: "cdk-total cdk-total--alerta" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Te restaron" }),
                el("span", { clase: "cdk-total__valor",
                             texto: CDK.formato.moneda(n.restado, "D") })
            ]),
            el("div", { clase: "cdk-total cdk-total--principal cdk-total--alerta" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Es el" }),
                el("span", { clase: "cdk-total__valor",
                             texto: Number(n.porcentaje).toFixed(1) + " % de lo facturado" })
            ])
        ]));

        destino.appendChild(el("p", {
            clase: "cdk-pista", style: "margin-top:8px",
            texto: "Tu avance ya lleva esto descontado. Sale aquí porque el número de " +
                   "arriba no explicaba por qué no cuadraba con lo que recordabas haber vendido."
        }));
    }

    /* ===============================================================
     * A quién llamar
     * ============================================================= */

    function pintarReposicion(r) {
        if (!r) return;
        var top = Array.isArray(r.top) ? r.top : [];
        if (!top.length) return;

        secRepo.classList.remove("hidden");

        var destino = document.getElementById("reposicion");
        destino.innerHTML = "";

        destino.appendChild(el("div", { clase: "cdk-totales" }, [
            el("div", { clase: "cdk-total cdk-total--principal" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Entre todos suman" }),
                el("span", { clase: "cdk-total__valor",
                             texto: CDK.formato.moneda(r.total, "D") })
            ]),
            el("div", { clase: "cdk-total" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Clientes" }),
                el("span", { clase: "cdk-total__valor", texto: String(r.clientes) })
            ])
        ]));

        var lista = el("ul", { clase: "cdk-articulos", style: "margin-top:12px" });

        top.forEach(function (c) {
            lista.appendChild(CDK.articulo({
                nombre: c.cliente || c.codcli || "(sin nombre)",
                importe: c.vencido === undefined || c.vencido === null
                    ? "" : CDK.formato.moneda(c.vencido, "D"),
                datos: c.productos ? [{ etiqueta: "Productos", valor: c.productos }] : []
            }));
        });

        destino.appendChild(lista);
    }

})();
