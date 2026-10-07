/**
 * Aplicar promociones a una cotización.
 *
 * Sustituye a promocion_adjuntar.html y a sus cuatro archivos de JavaScript.
 * De lo que había, casi nada se pudo conservar:
 *
 *   · **Empezaba por una ruta que no existe.** `/coti/buscar` no está en el
 *     backend —ni en producción ni en ningún sitio—, así que el buscador con
 *     el que arrancaba la pantalla nunca funcionó. En su lugar se usa la
 *     lista del día, que es la misma de Ver, Modificar y Dar de baja.
 *   · **Aplicaba todas o ninguna.** Recorría las promociones que aplican,
 *     las acumulaba en un solo objeto y lo mandaba entero. No había forma de
 *     elegir. Ahora se marcan las que se quieran.
 *   · **Calculaba el descuento y su IGV en el navegador**, con un `0.18`
 *     escrito a mano, y los mandaba a guardar. El servidor ya no mira nada de
 *     eso: `/promocion/acoplar` recibe `{ndocu, nprom}` y calcula él.
 *
 * Ver docs/promocion-modulo.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    /* Posiciones de una línea de promoción, las mismas que usa el detalle de
       cotización. No están documentadas aparte; se leen igual en las dos
       pantallas del módulo. */
    var LINEA = { codigo: 11, marca: 12, descripcion: 14, cantidad: 15,
                  unitario: 16, descuento: 18, importe: 19 };

    var seccionElegir = document.getElementById("seccion-elegir");
    var seccionPromos = document.getElementById("seccion-promos");
    var formNumero = document.getElementById("form-numero");
    var entrada = document.getElementById("ncoti");
    var titulo = document.getElementById("titulo-coti");
    var subCoti = document.getElementById("sub-coti");
    var destino = document.getElementById("promos");
    var acciones = document.getElementById("acciones");
    var btnAplicar = document.getElementById("btn-aplicar");
    var resultado = document.getElementById("resultado");

    if (!destino) return;

    var coti = null;        // { numero, cliente }
    var promos = [];        // [{ id, lineas, aplicada, elegida }]

    /* ===============================================================
     * Elegir la cotización
     * ============================================================= */

    var lista = CDK.coti.listaDelDia({
        destino: document.getElementById("lista-cotis"),
        botonHoy: document.getElementById("btn-hoy"),
        botonDosDias: document.getElementById("btn-dos-dias"),
        /* Solo las abiertas: a una facturada o aprobada ya no se le ponen
           promociones, y el backend las rechazaría igual. */
        soloAbiertas: true,
        alElegir: function (c) {
            abrir({ numero: c.documento, cliente: c.cliente });
        }
    });

    formNumero.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var numero = entrada.value.trim();
        if (!numero) {
            CDK.toast("Escribe el número de cotización", "aviso");
            entrada.focus();
            return;
        }
        abrir({ numero: numero, cliente: "" });
    });

    function abrir(elegida) {
        coti = elegida;
        promos = [];
        resultado.innerHTML = "";
        acciones.classList.add("hidden");

        seccionElegir.classList.add("hidden");
        seccionPromos.classList.remove("hidden");

        titulo.textContent = coti.numero;
        subCoti.textContent = coti.cliente || "";
        subCoti.classList.toggle("hidden", !coti.cliente);

        revisar();
    }

    /* ===============================================================
     * Qué promociones aplican
     * ============================================================= */

    function revisar() {
        CDK.estados.cargando(destino, "Buscando promociones…");

        CDK.http.post(CDK.rutas.api("/promocion/revisar"), { ncoti: coti.numero })
            .then(function (respuesta) {
                var ids = (respuesta && respuesta.data) || [];

                if (!ids.length) {
                    CDK.estados.vacio(destino,
                        "Ninguna promoción activa alcanza a los productos de esta cotización.");
                    return;
                }

                promos = ids.map(function (id) {
                    return { id: String(id), lineas: null, aplicada: false, elegida: false };
                });

                /* Una llamada por promoción para ver qué traería. Van en
                   serie y no en paralelo a propósito: son pocas, y así el
                   servidor no recibe una ráfaga por cada cotización que
                   alguien abra. */
                CDK.estados.cargando(destino,
                    "Mirando " + promos.length + (promos.length === 1 ? " promoción…" : " promociones…"));

                return promos.reduce(function (cadena, promo) {
                    return cadena.then(function () { return mirar(promo); });
                }, Promise.resolve()).then(pintar);
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                CDK.estados.error(destino, err, revisar);
            });
    }

    /** Lo que esa promoción le pondría a esta cotización. */
    function mirar(promo) {
        return CDK.http.post(CDK.rutas.api("/promocion/mostrar"), {
            ncoti: coti.numero,
            nprom: promo.id
            /* `grupos` no se manda: el servidor nunca lo leyó. Se mandaba un
               acumulador que el navegador iba llenando con lo que la propia
               ruta devolvía. */
        })
            .then(function (respuesta) {
                if (respuesta && respuesta.status === "promo ya aplicada") {
                    promo.aplicada = true;
                    return;
                }
                var crudas = respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
                promo.lineas = Object.keys(crudas || {})
                    .map(function (k) { return crudas[k]; })
                    .filter(function (l) { return l && typeof l === "object"; });
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) throw err;
                /* Que una promoción no se pueda previsualizar no debe tumbar
                   la pantalla entera: se marca y se sigue con las demás. */
                promo.error = CDK.http.esError(err) && err.datos && err.datos.msg
                    ? err.datos.msg : "No se pudo consultar esta promoción.";
            });
    }

    /* ===============================================================
     * Pintar
     * ============================================================= */

    function pintar() {
        destino.innerHTML = "";

        var ponibles = promos.filter(function (p) { return !p.aplicada && !p.error; });

        promos.forEach(function (promo) {
            var caja = el("div", { clase: "cdk-grupo" + (promo.elegida ? " cdk-grupo--abierto" : "") });

            var datos = [];
            if (promo.aplicada) {
                datos.push({ etiqueta: "", valor: "ya aplicada", tono: "bien" });
            } else if (promo.error) {
                datos.push({ etiqueta: "", valor: promo.error, tono: "alerta" });
            } else if (promo.lineas) {
                datos.push({ etiqueta: "Líneas", valor: promo.lineas.length });
            }

            var cabecera = CDK.articulo({
                nombre: "Promoción " + promo.id,
                datos: datos,
                /* Una ya aplicada no se puede volver a poner, y una que no se
                   pudo consultar tampoco: se pintan, pero no se pulsan. */
                alPulsar: promo.aplicada || promo.error ? null : function () {
                    promo.elegida = !promo.elegida;
                    pintar();
                }
            });

            caja.appendChild(cabecera);

            if (promo.elegida && promo.lineas) {
                caja.appendChild(lineasDe(promo));
            }

            destino.appendChild(caja);
        });

        var elegidas = promos.filter(function (p) { return p.elegida; }).length;
        acciones.classList.toggle("hidden", !ponibles.length);
        btnAplicar.disabled = elegidas === 0;
        btnAplicar.textContent = elegidas
            ? "Aplicar " + elegidas + (elegidas === 1 ? " promoción" : " promociones")
            : "Elige al menos una";
    }

    function lineasDe(promo) {
        var caja = el("div", { clase: "cdk-config" });
        var lista = el("ul", { clase: "cdk-articulos" });

        promo.lineas.forEach(function (l) {
            var datos = [{ etiqueta: "Cantidad", valor: l[LINEA.cantidad] }];
            if (Number(l[LINEA.descuento])) {
                datos.push({ etiqueta: "Dscto", valor: l[LINEA.descuento] + " %", tono: "bien" });
            }

            lista.appendChild(CDK.articulo({
                nombre: l[LINEA.descripcion] || "(sin descripción)",
                detalle: l[LINEA.marca] || "",
                /* En dólares siempre: las promociones solo se aplican a
                   cotizaciones en dólares, y el backend lo garantiza. */
                importe: l[LINEA.importe] === undefined || l[LINEA.importe] === null
                    ? ""
                    : CDK.formato.moneda(l[LINEA.importe], "D"),
                datos: datos
            }));
        });

        caja.appendChild(lista);
        return caja;
    }

    /* ===============================================================
     * Aplicar
     * ============================================================= */

    btnAplicar.addEventListener("click", function () {
        var elegidas = promos.filter(function (p) { return p.elegida; });
        if (!elegidas.length) return;

        CDK.modal.confirmar({
            titulo: elegidas.length === 1 ? "¿Aplicar la promoción?" : "¿Aplicar las promociones?",
            mensaje: "Se añadirán a la cotización " + coti.numero + ". Los importes los " +
                     "calcula el servidor, y para deshacerlo hay que quitarlas desde la " +
                     "otra pantalla.",
            confirmar: "Aplicar"
        }).then(function (si) {
            if (si) aplicar(elegidas);
        });
    });

    function aplicar(elegidas) {
        btnAplicar.disabled = true;
        CDK.estados.cargando(resultado, "Aplicando…");

        var puestas = [];
        var fallos = [];

        /* Una llamada por promoción, en serie. El backend garantiza que
           aplicarlas por separado da el mismo resultado que juntas: al
           evaluar una, las líneas que dejaron las otras no entran en el
           cálculo. */
        elegidas.reduce(function (cadena, promo) {
            return cadena.then(function () {
                return CDK.http.post(CDK.rutas.api("/promocion/acoplar"), {
                    ndocu: coti.numero,
                    nprom: promo.id
                })
                    .then(function () { puestas.push(promo.id); })
                    .catch(function (err) {
                        if (CDK.http.esError(err) && err.status === 401) throw err;
                        fallos.push({
                            id: promo.id,
                            motivo: CDK.http.esError(err) && err.datos && err.datos.msg
                                ? err.datos.msg : "No se pudo aplicar."
                        });
                    });
            });
        }, Promise.resolve()).then(function () {
            btnAplicar.disabled = false;
            informar(puestas, fallos);
            /* Se vuelve a mirar: las que entraron pasan a «ya aplicada» y
               deja de ofrecerlas. */
            revisar();
        }).catch(function (err) {
            btnAplicar.disabled = false;
            if (CDK.http.esError(err) && err.status === 401) return;
            CDK.estados.error(resultado, err);
        });
    }

    /**
     * Qué entró y qué no.
     *
     * Se dicen las dos cosas porque van en llamadas separadas: que falle una
     * no impide que las otras se hayan puesto, y callarlo dejaría al vendedor
     * sin saber en qué estado quedó la cotización.
     */
    function informar(puestas, fallos) {
        resultado.innerHTML = "";

        if (puestas.length) {
            CDK.toast(puestas.length === 1
                ? "Promoción aplicada"
                : puestas.length + " promociones aplicadas", "exito");
        }

        if (!fallos.length) return;

        resultado.appendChild(el("div", { clase: "cdk-aviso cdk-aviso--error" }, [
            el("p", { clase: "cdk-aviso__texto",
                texto: fallos.length === 1
                    ? "Una no se pudo aplicar:"
                    : fallos.length + " no se pudieron aplicar:" })
        ].concat(fallos.map(function (f) {
            return el("p", { clase: "cdk-pista", texto: "Promoción " + f.id + " · " + f.motivo });
        }))));
    }

    document.getElementById("btn-volver").addEventListener("click", function () {
        seccionPromos.classList.add("hidden");
        seccionElegir.classList.remove("hidden");
        coti = null;
        promos = [];
        if (lista && lista.recargar) lista.recargar();
    });

})();
