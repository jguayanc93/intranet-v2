/**
 * Ver cotizacion: elegir una de las del dia y revisarla.
 *
 * Antes se tecleaba el numero a mano. Los vendedores pidieron lo contrario:
 * ver sus cotizaciones del dia y entrar desde ahi, porque nadie se acuerda del
 * numero y es el ultimo dato que miran. Buscar por numero sigue existiendo,
 * plegado, para una cotizacion vieja que no va a estar en la lista.
 *
 * La cotizacion se ve de dos maneras y la diferencia importa:
 *
 *   RESUMEN    lleva coste y margen. Es informacion interna.
 *   DOCUMENTO  es lo que se le manda al cliente, en formato imprimible.
 *
 * Estan separadas a proposito. Si el margen viviera en el mismo nodo que se
 * imprime, bastaria con olvidar una regla de CSS para que saliera en el PDF que
 * el vendedor le pasa a su cliente.
 */
;(function () {
    "use strict";

    var formulario = document.getElementById("form-buscar");
    var entrada = document.getElementById("ncoti");
    var destino = document.getElementById("contendor-final-final");

    var seccionElegir = document.getElementById("seccion-elegir");
    var seccionDetalle = document.getElementById("seccion-detalle");
    var listaCotis = document.getElementById("lista-cotis");
    var tituloCoti = document.getElementById("titulo-coti");
    var lienzoDoc = document.getElementById("lienzo-documento");

    var btnHoy = document.getElementById("btn-hoy");
    var btnDosDias = document.getElementById("btn-dos-dias");
    var btnVolver = document.getElementById("btn-volver");
    var btnResumen = document.getElementById("btn-vista-resumen");
    var btnDocumento = document.getElementById("btn-vista-documento");
    var btnPdf = document.getElementById("btn-pdf");

    if (!formulario) return;

    // La cotizacion abierta, para poder cambiar de vista sin volver a pedirla.
    var actual = null;   // { numero, doc, cliente }

    /* ===============================================================
     * La lista del dia
     * ============================================================= */

    var listaDia = CDK.coti.listaDelDia({
        destino: listaCotis,
        botonHoy: btnHoy,
        botonDosDias: btnDosDias,
        /* Aquí sí se ofrecen todas, incluso las facturadas: esta pantalla solo
           mira, y reimprimir el PDF de una ya facturada es justo lo que un
           cliente suele pedir. */
        soloAbiertas: false,
        alElegir: function (coti) { abrir(coti.documento); }
    });

    /* ===============================================================
     * Abrir una cotizacion
     * ============================================================= */

    function abrir(numero) {
        mostrarDetalle(true);
        tituloCoti.textContent = "Cotización " + numero;
        CDK.estados.cargando(destino, "Cargando la cotización…");

        CDK.http.post(CDK.rutas.api("/cotizacion/read"), { ncoti: numero })
            .then(function (respuesta) {
                var doc = CDK.coti.documento(respuesta);
                if (!doc) {
                    CDK.estados.error(destino, "La cotización " + numero + " no tiene líneas.", null);
                    return;
                }

                actual = { numero: numero, doc: doc };
                verResumen();
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;
                CDK.estados.error(destino, err, function () { abrir(numero); });
            });
    }

    function mostrarDetalle(si) {
        seccionElegir.classList.toggle("hidden", si);
        seccionDetalle.classList.toggle("hidden", !si);
        if (!si) {
            lienzoDoc.classList.add("hidden");
            actual = null;
        }
    }

    btnVolver.addEventListener("click", function () {
        mostrarDetalle(false);
        destino.innerHTML = "";
        lienzoDoc.innerHTML = "";
    });

    /* ===============================================================
     * Las dos vistas
     * ============================================================= */

    function fijarVista(esDocumento) {
        btnResumen.setAttribute("aria-pressed", String(!esDocumento));
        btnDocumento.setAttribute("aria-pressed", String(esDocumento));
        btnResumen.className = "cdk-boton " + (esDocumento ? "cdk-boton--suave" : "cdk-boton--primario");
        btnDocumento.className = "cdk-boton " + (esDocumento ? "cdk-boton--primario" : "cdk-boton--suave");
        btnPdf.classList.toggle("hidden", !esDocumento);

        destino.classList.toggle("hidden", esDocumento);
        lienzoDoc.classList.toggle("hidden", !esDocumento);
    }

    function verResumen() {
        fijarVista(false);
        if (actual) pintar(actual.doc, actual.numero);
    }

    function verDocumento() {
        if (!actual) return;
        fijarVista(true);

        var cab = actual.doc.cabecera || {};
        var usuario = CDK.sesion.usuario() || {};

        /* Razón social, dirección y ATTE llegan en la propia cabecera, así que
           ya no hace falta la segunda llamada a /cliente/id que había aquí. */
        lienzoDoc.innerHTML = "";
        lienzoDoc.appendChild(CDK.coti.documentoImprimible(actual.doc, {
            cliente: {
                razonSocial: cab.razonSocial,
                direccion: cab.direccion
            },
            atte: cab.atte,
            vendedor: usuario.nombre
        }));
    }

    btnResumen.addEventListener("click", verResumen);
    btnDocumento.addEventListener("click", verDocumento);
    btnPdf.addEventListener("click", CDK.coti.imprimirDocumento);

    // Acciones a las que se puede saltar desde una cotización ya encontrada.
    // Las claves son permisos del módulo: solo se ofrecen las que el backend
    // conceda a esa persona.
    var ATAJOS = ["update", "alm", "delete"];

    formulario.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var numero = entrada.value.trim();
        if (!numero) {
            CDK.toast("Escribe el número de cotización", "aviso");
            entrada.focus();
            return;
        }
        abrir(numero);
    });

    // Si se llega con ?ncoti= desde otra pantalla, se abre directamente.
    /* La lista ya se cargó sola al montarse; si se llega con ?ncoti= desde
       otra pantalla, la cotización se abre encima. */
    var pedida = new URLSearchParams(location.search).get("ncoti");
    if (pedida) abrir(pedida);

    // Acciones a las que se puede saltar desde una cotización ya encontrada.
    // Las claves son permisos del módulo: solo se ofrecen las que el backend
    // conceda a esa persona.
    var ATAJOS = ["update", "alm", "delete"];

    /* --- una línea de la cotización --------------------------------- */

    /**
     * La columna izquierda identifica la fila de un vistazo: en un producto
     * lleva la marca, y en una línea de promoción, de qué tipo es. El código
     * interno baja al detalle, donde se consulta pero no se busca con la vista.
     */
    function articulo(linea, moneda) {
        if (linea.tipo === CDK.coti.DESCUENTO) {
            return CDK.articulo({
                variante: "descuento",
                distintivo: "Descuento",
                nombre: linea.descripcionLimpia,
                importe: CDK.formato.moneda(linea.importe, moneda)
            });
        }

        if (linea.tipo === CDK.coti.OBSEQUIO) {
            return CDK.articulo({
                variante: "obsequio",
                distintivo: "Obsequio",
                nombre: linea.descripcionLimpia,
                detalle: detalleDe(linea),
                importe: "Sin costo",
                datos: [
                    { etiqueta: "Cant.", valor: linea.cantidad },
                    // El obsequio no se cobra, pero cuesta: conviene que se vea.
                    { etiqueta: "Coste", valor: CDK.formato.moneda(linea.costeTotal, moneda) }
                ]
            });
        }

        var datos = [
            { etiqueta: "Cant.", valor: linea.cantidad + (linea.unidad ? " " + linea.unidad : "") },
            { etiqueta: "P. unit.", valor: CDK.formato.moneda(linea.precioUnitario, moneda) }
        ];

        // El descuento solo se muestra si lo hay: una fila con "Dscto. 0 %" en
        // cada línea es ruido que dificulta ver dónde sí se aplicó.
        if (Number(linea.descuento) > 0) {
            datos.push({ etiqueta: "Dscto.", valor: CDK.formato.porcentaje(linea.descuento) });
        }

        if (Number(linea.coste) > 0) {
            datos.push({
                etiqueta: "Margen",
                valor: CDK.formato.porcentaje(linea.margenPct),
                tono: linea.bajoCoste ? "alerta" : "bien"
            });
        }

        // "no afecto a IGV" es una excepción: se señala solo cuando ocurre.
        if (String(linea.afectoIgv).toUpperCase() === "N") {
            datos.push({ etiqueta: "IGV", valor: "no afecto" });
        }

        return CDK.articulo({
            distintivo: linea.marca,
            nombre: linea.descripcion,
            detalle: detalleDe(linea),
            importe: CDK.formato.moneda(linea.importe, moneda),
            datos: datos,
            alerta: linea.bajoCoste
        });
    }

    function detalleDe(linea) {
        return [linea.codigo, linea.partnumber].filter(Boolean).join(" · ");
    }

    /* --- atajos a otras acciones ------------------------------------ */

    /**
     * Evita el camino de hoy: volver al hub, entrar en otra pantalla y teclear
     * otra vez el mismo número. El número viaja en la URL, así que la pantalla
     * de destino puede precargarlo.
     */
    function botonAcciones(numero) {
        var boton = CDK.el("button", {
            type: "button",
            clase: "cdk-boton cdk-boton--primario",
            texto: "¿Qué quieres hacer con esta cotización?"
        });

        boton.addEventListener("click", function () {
            CDK.permisos.accesos("cotizacion")
                .then(function (permisos) { abrirMenu(numero, permisos); })
                .catch(function () { abrirMenu(numero, []); });
        });

        return CDK.el("div", { clase: "cdk-acciones-fila" }, [boton]);
    }

    function abrirMenu(numero, permisos) {
        var opciones = ATAJOS
            .filter(function (clave) { return permisos.indexOf(clave) !== -1; })
            .map(function (clave) { return CDK.catalogo.acceso("cotizacion", clave); })
            .filter(function (acc) { return acc && acc.existe; })
            .map(function (acc) {
                return {
                    texto: acc.etiqueta,
                    descripcion: acc.descripcion,
                    href: acc.href + "?ncoti=" + encodeURIComponent(numero)
                };
            });

        if (!opciones.length) {
            CDK.toast("No tienes otras acciones habilitadas sobre esta cotización", "info");
            return;
        }

        CDK.menuAcciones({
            titulo: "Cotización " + numero,
            opciones: opciones
        });
    }

    /* --- documento completo ----------------------------------------- */

    /**
     * El resumen: lo que ve el vendedor, con coste y margen.
     *
     * Recibe el documento ya procesado y no la respuesta cruda, porque al
     * cambiar de vista se repinta sin volver a pedir nada al backend.
     */
    function pintar(doc, numero) {
        var moneda = doc.cabecera.monedaLinea || doc.cabecera.moneda;

        var lista = CDK.el("ul", { clase: "cdk-articulos" });
        doc.lineas.forEach(function (linea) {
            lista.appendChild(articulo(linea, moneda));
        });

        var contenido = [
            CDK.el("p", { clase: "cdk-seccion__sub", texto: resumen(doc) })
        ];

        var aviso = avisoMargen(doc, moneda);
        if (aviso) contenido.push(aviso);

        contenido.push(lista);
        contenido.push(CDK.totales(totalesDe(doc, moneda)));
        contenido.push(botonAcciones(doc.cabecera.documento || numero));

        destino.innerHTML = "";
        contenido.forEach(function (n) { destino.appendChild(n); });
    }

    function totalesDe(doc, moneda) {
        return [
            { etiqueta: "Subtotal", valor: CDK.formato.moneda(doc.subtotal, moneda) },
            { etiqueta: "IGV",      valor: CDK.formato.moneda(doc.igv, moneda) },
            { etiqueta: "Total",    valor: CDK.formato.moneda(doc.total, moneda), principal: true },
            { etiqueta: "Coste",    valor: CDK.formato.moneda(doc.coste, moneda) },
            {
                etiqueta: "Margen",
                valor: CDK.formato.moneda(doc.margen, moneda) + "   (" + CDK.formato.porcentaje(doc.margenPct) + ")",
                tono: doc.margen < 0 ? "alerta" : "bien"
            }
        ];
    }

    /**
     * Aviso cuando la cotización pierde dinero. Es el dato que el vendedor no
     * puede deducir de un vistazo: el total se ve bien y el margen no.
     */
    function avisoMargen(doc, moneda) {
        if (doc.margen >= 0 && !doc.bajoCoste.length) return null;

        var partes = [];

        if (doc.margen < 0) {
            partes.push("Esta cotización está " + CDK.formato.moneda(Math.abs(doc.margen), moneda) +
                        " por debajo de su coste.");
        }

        if (doc.bajoCoste.length) {
            partes.push(doc.bajoCoste.length === 1
                ? "1 producto se vende por debajo de coste."
                : doc.bajoCoste.length + " productos se venden por debajo de coste.");
        }

        return CDK.el("div", { clase: "cdk-aviso cdk-aviso--error", role: "alert" }, [
            CDK.el("p", { clase: "cdk-aviso__texto", texto: partes.join(" ") })
        ]);
    }

    function resumen(doc) {
        var c = doc.cabecera;

        var partes = [
            c.fecha ? CDK.formato.fecha(c.fecha) : null,
            // El almacén por nombre, no por código: "01" obliga a traducirlo
            // de memoria cada vez.
            c.almacen ? CDK.catalogo.almacen(c.almacen) : null,
            doc.productos.length + " producto" + (doc.productos.length === 1 ? "" : "s")
        ];

        // Solo se menciona si las hay: en la mayoría de cotizaciones no aplica.
        if (doc.promociones.length) {
            partes.push(doc.promociones.length + " línea" +
                        (doc.promociones.length === 1 ? "" : "s") + " de promoción");
        }

        // El tipo de cambio importa cuando el documento va en dólares.
        if (Number(c.tipoCambio)) {
            partes.push("T.C. " + CDK.formato.numero(c.tipoCambio, 3));
        }

        return partes.filter(Boolean).join("   ·   ");
    }
})();
