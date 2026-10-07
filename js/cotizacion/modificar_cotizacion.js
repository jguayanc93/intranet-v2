/**
 * Modificar cotización.
 *
 * Se elige una de las del día, se cambian cantidades, se quitan líneas o se
 * agregan productos, y se guarda todo de una vez.
 *
 * Antes: 658 líneas de createElement con variables cuerpo1…cuerpo5 y
 * contenedor1…contenedor5, `fetch` crudo con doble JSON.parse, sin manejo de
 * 401, y la conversión de moneda escrita a mano dentro de la lógica de datos.
 *
 * LO QUE VIAJA AL BACKEND NO CAMBIA. `/cotizacion/update` sigue recibiendo
 * `{ item: { … } }` con las claves como código de producto y cada valor como el
 * arreglo de 22 posiciones que corresponde a las posiciones 1-22 de
 * /cotizacion/read, saltándose la 0. Eso ya estaba modelado en campos.js como
 * CDK.coti.lineaGuardada, así que aquí se lee con nombres y se vuelve a escribir
 * en el mismo orden al guardar.
 *
 * Una cotización aprobada (flag = 1) no se puede modificar: hay que desaprobarla
 * por fuera. La lista todavía no distingue esas, ver docs/modificar-cotizacion.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    /* --- pantalla --- */
    var seccionElegir = document.getElementById("seccion-elegir");
    var seccionDetalle = document.getElementById("seccion-detalle");
    var listaCotis = document.getElementById("lista-cotis");
    var tituloCoti = document.getElementById("titulo-coti");
    var resumenCoti = document.getElementById("resumen-coti");
    var datosCliente = document.getElementById("datos-cliente");
    var destino = document.getElementById("aqui-nuevos");
    var totalesCoti = document.getElementById("totales-coti");
    var zonaPromos = document.getElementById("promos-de-la-coti");

    var btnHoy = document.getElementById("btn-hoy");
    var btnDosDias = document.getElementById("btn-dos-dias");
    var btnVolver = document.getElementById("btn-volver");
    var btnGuardar = document.getElementById("crear-modificacion");
    var btnAgregar = document.getElementById("cotimodificar-buscarnuevoproducto");
    var formulario = document.getElementById("form-buscar");
    var entrada = document.getElementById("ncoti");

    /* --- panel de búsqueda --- */
    var panelBusqueda = document.getElementById("modal-busqueda-producto");
    var fondoBusqueda = document.getElementById("modal-backdrop-producto");
    var tipoBusqueda = document.getElementById("currency2");
    var campoProducto = document.getElementById("producto");
    var btnLimpiar = document.getElementById("btn-limpiar-producto");
    var indicador = document.getElementById("indicador-producto");
    var cargandoProducto = document.getElementById("busqueda-producto-loading");
    var resultados = document.getElementById("recorrer-productos");
    var sinResultados = document.getElementById("sin-resultados-producto");
    var btnCerrarBusqueda = document.getElementById("btn-cerrar-busqueda-producto");
    var btnListo = document.getElementById("encontrar");

    /* --- panel de cantidad --- */
    var panelCantidad = document.getElementById("modal-cantidad");
    var fondoCantidad = document.getElementById("modal-backdrop-cantidad");
    var nombreCantidad = document.getElementById("cantidad-producto-nombre");
    var campoCantidad = document.getElementById("cantidad-valor");
    var cantidadMenos = document.getElementById("cantidad-menos");
    var cantidadMas = document.getElementById("cantidad-mas");
    var errorCantidad = document.getElementById("error-cantidad");
    var btnCancelarCantidad = document.getElementById("btn-cancelar-cantidad");
    var btnCerrarCantidad = document.getElementById("btn-cerrar-cantidad");
    var btnConfirmarCantidad = document.getElementById("btn-confirmar-cantidad");

    if (!seccionElegir) return;

    /* ===============================================================
     * Estado
     * ============================================================= */

    var dias = 1;
    var cabecera = null;      // la cabecera de la cotización abierta
    var lineas = {};          // codigo -> producto, lo editable
    var promociones = [];     // descuentos y obsequios: ni se editan ni se guardan
    var numero = null;
    var huboCambios = false;

    // Lo que se está por confirmar en el panel de cantidad.
    var enCurso = null;       // { codigo, descripcion, esNuevo }

    var tiempoBusqueda = null;
    var enVuelo = null;

    var listaDia = CDK.coti.listaDelDia({
        destino: listaCotis,
        botonHoy: btnHoy,
        botonDosDias: btnDosDias,
        // Una facturada o convertida ya no se modifica.
        soloAbiertas: true,
        alElegir: function (coti) { abrir(coti.documento); }
    });

    /* ===============================================================
     * Abrir una cotización
     * ============================================================= */

    function abrir(ncoti) {
        numero = String(ncoti);
        mostrarDetalle(true);
        tituloCoti.textContent = "Cotización " + numero;
        CDK.estados.cargando(destino, "Cargando la cotización…");

        CDK.http.post(CDK.rutas.api("/cotizacion/read"), { ncoti: numero })
            .then(function (respuesta) {
                var filas = Object.keys(respuesta || {}).map(function (k) { return respuesta[k]; });

                if (!filas.length) {
                    CDK.estados.error(destino, "La cotización " + numero + " no tiene líneas.", null);
                    return;
                }

                cabecera = CDK.coti.cabecera(filas[0]);

                /* Los productos van por código, que es como los espera
                   /cotizacion/update. Las promociones NO: dos descuentos
                   distintos comparten el código 0303-010001, así que agruparlas
                   por código perdería una. Van en una lista aparte, que además
                   es lo que les corresponde: no se editan y no se guardan. */
                lineas = {};
                promociones = [];

                filas.forEach(function (fila) {
                    var l = CDK.coti.linea(fila);
                    if (!l) return;
                    if (l.esProducto && l.codigo) lineas[l.codigo] = l;
                    else if (!l.esProducto) promociones.push(l);
                });

                huboCambios = false;
                pintarCliente();
                pintarLineas();
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
            cabecera = null;
            lineas = {};
            numero = null;
            huboCambios = false;
        }
    }

    btnVolver.addEventListener("click", function () {
        if (!huboCambios) return salir();

        CDK.modal.confirmar({
            titulo: "Hay cambios sin guardar",
            mensaje: "Si vuelves ahora, los cambios de esta cotización se pierden.",
            confirmar: "Volver igual",
            peligro: true
        }).then(function (si) { if (si) salir(); });
    });

    function salir() {
        mostrarDetalle(false);
        destino.innerHTML = "";
        totalesCoti.innerHTML = "";
    }

    formulario.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var n = entrada.value.trim();
        if (!n) {
            CDK.toast("Escribe el número de cotización", "aviso");
            entrada.focus();
            return;
        }
        abrir(n);
    });

    /* ===============================================================
     * Las líneas
     * ============================================================= */

    function moneda() {
        return cabecera && (cabecera.monedaLinea || cabecera.moneda) === "S" ? "S" : "D";
    }

    function pintarCliente() {
        var partes = [];
        if (cabecera.razonSocial) partes.push(cabecera.razonSocial);
        else if (cabecera.codcliente) partes.push(cabecera.codcliente);
        if (cabecera.fecha) partes.push(CDK.formato.fecha(cabecera.fecha));
        datosCliente.textContent = partes.join("  ·  ");
    }

    function pintarLineas() {
        destino.innerHTML = "";

        var codigos = Object.keys(lineas);

        if (!codigos.length) {
            destino.appendChild(el("div", { clase: "cdk-estado" }, [
                el("p", { clase: "cdk-estado__texto",
                          texto: "La cotización se quedó sin líneas. Agrega al menos un producto." })
            ]));
            pintarTotales();
            return;
        }

        var lista = el("ul", { clase: "cdk-articulos" });

        codigos.forEach(function (codigo) {
            var l = lineas[codigo];

            var datos = [{ etiqueta: "P. unit.", valor: CDK.formato.moneda(l.precioUnitario, moneda()) }];
            if (Number(l.descuento) > 0) {
                datos.push({ etiqueta: "Dscto.", valor: CDK.formato.porcentaje(l.descuento) });
            }

            var quitar = el("button", {
                type: "button", clase: "cdk-enlace-accion cdk-enlace-accion--peligro", texto: "Quitar"
            });
            quitar.addEventListener("click", function (ev) {
                ev.stopPropagation();
                quitarLinea(codigo, l.descripcion);
            });

            /* La fila entera abre el cambio de cantidad, que es lo que se hace
               casi siempre; quitar va aparte para que no se pulse sin querer. */
            var fila = CDK.articulo({
                distintivo: l.marca,
                nombre: l.descripcion,
                detalle: l.cantidad + (l.unidad ? " " + l.unidad : ""),
                importe: CDK.formato.moneda(l.importe, moneda()),
                datos: datos
            });

            var cuerpo = fila.querySelector(".cdk-articulo__cuerpo");
            var acciones = el("div", { clase: "cdk-articulo__acciones" });

            var cambiar = el("button", {
                type: "button", clase: "cdk-enlace-accion", texto: "Cambiar cantidad"
            });
            cambiar.addEventListener("click", function () {
                abrirCantidad(codigo, l.descripcion, l.cantidad, false);
            });

            acciones.appendChild(cambiar);
            acciones.appendChild(quitar);
            cuerpo.appendChild(acciones);

            lista.appendChild(fila);
        });

        destino.appendChild(lista);
        pintarPromociones();
        pintarTotales();
    }

    /**
     * Los descuentos y obsequios que trae la cotización.
     *
     * No se editan y **se pierden al guardar**: /cotizacion/update borra el
     * detalle entero y lo reescribe con lo que se le mande, y aquí solo se le
     * mandan los productos. Volver a calcularlas tendría que pasar por
     * /promocion otra vez, con el carrito ya cambiado.
     *
     * Se muestran, en vez de ocultarlas, para que el vendedor sepa qué va a
     * perder ANTES de ponerse a modificar. Enterarse después es peor.
     */
    function pintarPromociones() {
        zonaPromos.innerHTML = "";
        zonaPromos.classList.toggle("hidden", !promociones.length);
        if (!promociones.length) return;

        zonaPromos.appendChild(el("div", { clase: "cdk-aviso cdk-aviso--error" }, [
            el("p", { clase: "cdk-aviso__texto",
                texto: promociones.length === 1
                    ? "Esta cotización tiene una promoción. Si guardas cambios se retira, " +
                      "y habrá que volver a aplicarla desde el módulo de promociones."
                    : "Esta cotización tiene " + promociones.length + " líneas de promoción. " +
                      "Si guardas cambios se retiran todas, y habrá que volver a aplicarlas " +
                      "desde el módulo de promociones." })
        ]));

        var lista = el("ul", { clase: "cdk-articulos" });

        promociones.forEach(function (l) {
            var esObsequio = l.tipo === CDK.coti.OBSEQUIO;
            lista.appendChild(CDK.articulo({
                distintivo: esObsequio ? "Obsequio" : "Descuento",
                nombre: l.descripcionLimpia || l.descripcion,
                detalle: esObsequio ? l.cantidad + " un." : "",
                importe: esObsequio ? "Sin costo" : CDK.formato.moneda(l.importe, moneda()),
                variante: esObsequio ? "obsequio" : "descuento"
            }));
        });

        zonaPromos.appendChild(lista);
    }

    function pintarTotales() {
        totalesCoti.innerHTML = "";

        var subtotal = 0;
        Object.keys(lineas).forEach(function (c) {
            subtotal += Number(lineas[c].importe) || 0;
        });
        subtotal = Math.round(subtotal * 100) / 100;

        /* El mismo criterio que el resto del módulo: el IGV sale del subtotal,
           no de sumar el importe con IGV de cada línea. El trigger del ERP hace
           eso mismo y sumarlo línea a línea se desvía por céntimos. */
        var igv = Math.round(subtotal * 0.18 * 100) / 100;

        function fila(etiqueta, valor, clase) {
            return el("div", { clase: "cdk-total" + (clase ? " " + clase : "") }, [
                el("span", { clase: "cdk-total__etiqueta", texto: etiqueta }),
                el("span", { clase: "cdk-total__valor", texto: CDK.formato.moneda(valor, moneda()) })
            ]);
        }

        totalesCoti.appendChild(fila("Sin IGV", subtotal));
        totalesCoti.appendChild(fila("IGV 18 %", igv));
        totalesCoti.appendChild(fila("Total", subtotal + igv, "cdk-total--principal"));

        resumenCoti.textContent = Object.keys(lineas).length +
            (Object.keys(lineas).length === 1 ? " línea" : " líneas");

        btnGuardar.disabled = !huboCambios || !Object.keys(lineas).length;
    }

    function quitarLinea(codigo, descripcion) {
        CDK.modal.confirmar({
            titulo: "Quitar de la cotización",
            mensaje: "Se quitará «" + descripcion + "». El cambio se guarda al pulsar «Guardar cambios».",
            confirmar: "Quitar",
            peligro: true
        }).then(function (si) {
            if (!si) return;
            delete lineas[codigo];
            huboCambios = true;
            pintarLineas();
        });
    }

    /* ===============================================================
     * El panel de cantidad
     * ============================================================= */

    function abrirCantidad(codigo, descripcion, cantidad, esNuevo) {
        enCurso = { codigo: codigo, descripcion: descripcion, esNuevo: !!esNuevo };

        nombreCantidad.textContent = descripcion;
        campoCantidad.value = String(cantidad || 1);
        errorCantidad.classList.add("hidden");

        panelCantidad.classList.remove("hidden");
        document.body.classList.add("cdk-sin-scroll");
        campoCantidad.focus();
        campoCantidad.select();
    }

    function cerrarCantidad() {
        panelCantidad.classList.add("hidden");
        document.body.classList.remove("cdk-sin-scroll");
        enCurso = null;
    }

    function ajustarCantidad(paso) {
        var n = parseInt(campoCantidad.value, 10);
        var actual = isFinite(n) ? n : 1;
        campoCantidad.value = String(Math.min(Math.max(actual + paso, 1), 500));
        errorCantidad.classList.add("hidden");
    }

    cantidadMenos.addEventListener("click", function () { ajustarCantidad(-1); });
    cantidadMas.addEventListener("click", function () { ajustarCantidad(1); });
    btnCancelarCantidad.addEventListener("click", cerrarCantidad);
    btnCerrarCantidad.addEventListener("click", cerrarCantidad);
    fondoCantidad.addEventListener("click", cerrarCantidad);

    campoCantidad.addEventListener("input", function () {
        var limpio = campoCantidad.value.replace(/[^\d]/g, "");
        if (limpio !== campoCantidad.value) campoCantidad.value = limpio;
        errorCantidad.classList.add("hidden");
    });

    btnConfirmarCantidad.addEventListener("click", function () {
        if (!enCurso) return;

        var cantidad = parseInt(campoCantidad.value, 10);

        if (!isFinite(cantidad) || cantidad < 1) {
            errorCantidad.textContent = "La cantidad mínima es 1.";
            errorCantidad.classList.remove("hidden");
            return;
        }
        if (cantidad > 500) {
            errorCantidad.textContent = "La cantidad máxima es 500.";
            errorCantidad.classList.remove("hidden");
            return;
        }

        var tarea = enCurso;
        cerrarCantidad();

        if (tarea.esNuevo) traerProducto(tarea.codigo, cantidad);
        else cambiarCantidad(tarea.codigo, cantidad);
    });

    /**
     * Cambia la cantidad de una línea que ya está.
     *
     * El precio y el descuento no se tocan: son los que el backend fijó cuando
     * se creó la cotización, y recalcularlos aquí con el precio de hoy cambiaría
     * lo que ya se le cotizó al cliente.
     */
    function cambiarCantidad(codigo, cantidad) {
        var l = lineas[codigo];
        if (!l) return;

        var calculo = CDK.coti.calcularLinea({
            precio: l.precioUnitario,
            cantidad: cantidad,
            descuento: l.descuento
        });

        l.cantidad = cantidad;
        l.importe = calculo.importe;
        l.importeConIgv = Math.round(calculo.importe * 1.18 * 100) / 100;

        huboCambios = true;
        pintarLineas();
    }

    /* ===============================================================
     * Agregar un producto
     * ============================================================= */

    btnAgregar.addEventListener("click", function () {
        panelBusqueda.classList.remove("hidden");
        document.body.classList.add("cdk-sin-scroll");
        limpiarBusqueda();
        campoProducto.focus();
    });

    function cerrarBusqueda() {
        panelBusqueda.classList.add("hidden");
        document.body.classList.remove("cdk-sin-scroll");
        limpiarBusqueda();
    }

    btnCerrarBusqueda.addEventListener("click", cerrarBusqueda);
    btnListo.addEventListener("click", cerrarBusqueda);
    fondoBusqueda.addEventListener("click", cerrarBusqueda);

    function limpiarBusqueda() {
        cancelarBusqueda();
        campoProducto.value = "";
        resultados.innerHTML = "";
        btnLimpiar.classList.add("hidden");
        indicador.classList.add("hidden");
        cargandoProducto.classList.add("hidden");
        sinResultados.classList.add("hidden");
    }

    btnLimpiar.addEventListener("click", function (ev) {
        ev.stopPropagation();
        limpiarBusqueda();
        campoProducto.focus();
    });

    /* Cancela lo que esté en vuelo: sin esto, dos búsquedas seguidas pueden
       cruzarse y pintar resultados que no son los de lo escrito. */
    function cancelarBusqueda() {
        clearTimeout(tiempoBusqueda);
        if (enVuelo) {
            enVuelo.abort();
            enVuelo = null;
        }
    }

    campoProducto.addEventListener("input", function (ev) {
        var texto = ev.target.value.trim();

        btnLimpiar.classList.toggle("hidden", texto.length === 0);
        cancelarBusqueda();
        resultados.innerHTML = "";
        sinResultados.classList.add("hidden");
        cargandoProducto.classList.add("hidden");

        if (texto.length < 3) {
            indicador.classList.toggle("hidden", texto.length === 0);
            return;
        }

        indicador.classList.add("hidden");
        cargandoProducto.classList.remove("hidden");
        tiempoBusqueda = setTimeout(function () { buscarProducto(texto); }, 400);
    });

    tipoBusqueda.addEventListener("change", function () {
        var texto = campoProducto.value.trim();
        cancelarBusqueda();
        resultados.innerHTML = "";
        sinResultados.classList.add("hidden");

        if (texto.length < 3) {
            cargandoProducto.classList.add("hidden");
            campoProducto.focus();
            return;
        }
        cargandoProducto.classList.remove("hidden");
        buscarProducto(texto);
    });

    /**
     * Busca el producto. Va SIN `letra` a propósito: aquí la búsqueda solo sirve
     * para encontrarlo, y el precio que le corresponde a este cliente lo trae
     * después /producto/encontrado con su letra y su código.
     */
    function buscarProducto(texto) {
        var control = new AbortController();
        enVuelo = control;

        CDK.http.post(CDK.rutas.api("/producto/buscar"), {
            sugerencia: texto,
            tipbusq: tipoBusqueda.value
        }, { senal: control.signal })
            .then(function (respuesta) {
                if (control.signal.aborted) return;
                enVuelo = null;
                pintarProductos(respuesta, texto);
            })
            .catch(function (err) {
                if (control.signal.aborted) return;
                enVuelo = null;
                cargandoProducto.classList.add("hidden");
                if (CDK.http.esError(err) && err.status === 401) return;
                CDK.estados.error(resultados, err, function () { buscarProducto(texto); });
            });
    }

    function pintarProductos(respuesta, termino) {
        cargandoProducto.classList.add("hidden");
        resultados.innerHTML = "";

        var filas = Object.keys(respuesta || {}).map(function (k) { return respuesta[k]; });

        if (!filas.length) {
            sinResultados.classList.remove("hidden");
            return;
        }

        var lista = el("ul", { clase: "cdk-articulos" });

        filas.forEach(function (fila) {
            var p = CDK.coti.producto(fila);
            var yaEsta = !!lineas[p.codigo];

            var datos = [
                { etiqueta: "Principal", valor: p.stockPrincipal, tono: p.stockPrincipal ? "" : "nulo" },
                { etiqueta: "M&M",       valor: p.stockMym,       tono: p.stockMym       ? "" : "nulo" },
                { etiqueta: "Piura",     valor: p.stockPiura,     tono: p.stockPiura     ? "" : "nulo" }
            ];

            if (yaEsta) datos.push({ etiqueta: "", valor: "Ya está en la cotización", tono: "bien" });

            lista.appendChild(CDK.articulo({
                nombre: termino ? CDK.resaltar(p.descripcion, termino) : p.descripcion,
                datos: datos,
                alerta: p.stockTotal === 0,
                /* El precio no se muestra aquí: el de esta búsqueda es genérico y
                   el que vale lo trae /producto/encontrado con la letra del
                   cliente. Enseñar uno y cobrar otro sería peor que no enseñarlo. */
                alPulsar: yaEsta ? null : function () {
                    cerrarBusqueda();
                    abrirCantidad(p.codigo, p.descripcion, 1, true);
                }
            }));
        });

        resultados.appendChild(lista);
    }

    /**
     * Trae el producto con el precio que le toca a ESTE cliente y lo agrega.
     *
     * /producto/encontrado devuelve 12 posiciones que encajan con las de
     * /cotizacion/read: así la línea nueva queda igual que las que ya estaban.
     */
    function traerProducto(codigo, cantidad) {
        CDK.toast("Agregando el producto…", "info", 1500);

        CDK.http.post(CDK.rutas.api("/producto/encontrado"), {
            sugerencia: codigo,
            cctl: cabecera.clase,        // la letra del cliente
            ccli: cabecera.codcliente
        })
            .then(function (p) {
                if (!p) {
                    CDK.toast("No se pudo traer el precio de ese producto.", "error", 0);
                    return;
                }

                var precio = Number(p[8]) || 0;
                var descuento = Number(p[9]) || 0;

                var calculo = CDK.coti.calcularLinea({
                    precio: precio, cantidad: cantidad, descuento: descuento
                });

                lineas[p[2]] = {
                    afectoIgv: p[0],
                    tipoCrudo: p[1],
                    codigo: p[2],
                    partnumber: p[3],
                    marca: p[4],
                    unidad: p[5],
                    descripcion: p[6],
                    cantidad: cantidad,
                    precioUnitario: precio,
                    importe: calculo.importe,
                    descuento: descuento,
                    importeConIgv: Math.round(calculo.importe * 1.18 * 100) / 100,
                    almacen: cabecera.almacen,
                    coste: Number(p[10]) || 0,
                    extra: p[11]
                };

                huboCambios = true;
                pintarLineas();
                CDK.toast("Producto agregado.", "exito");
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;
                CDK.toast(
                    (err && err.datos && err.datos.msg) || "No se pudo agregar el producto.",
                    "error", 0
                );
            });
    }

    /* ===============================================================
     * Guardar
     * ============================================================= */

    /**
     * Rearma el arreglo de 22 posiciones que espera /cotizacion/update.
     *
     * Son las posiciones 1-22 de /cotizacion/read, así que la 0 de este arreglo
     * es la 1 de aquella. Las siete primeras vienen de la cabecera y se repiten
     * en todas las líneas, igual que las devuelve el backend.
     */
    function aFilaGuardada(l) {
        return [
            cabecera.fecha,          // 1  fecha
            cabecera.tipoDoc,        // 2  tipo de documento
            cabecera.documento,      // 3  documento
            cabecera.codcliente,     // 4  cliente
            cabecera.tipoCambio,     // 5  tipo de cambio
            cabecera.moneda,         // 6  moneda del documento
            cabecera.monedaLinea,    // 7  moneda de la línea
            l.afectoIgv,             // 8
            l.tipoCrudo,             // 9  tipo de línea
            l.codigo,                // 10
            l.partnumber,            // 11
            l.marca,                 // 12
            l.unidad,                // 13
            l.descripcion,           // 14
            l.cantidad,              // 15
            l.precioUnitario,        // 16
            l.importe,               // 17
            l.descuento,             // 18
            l.importeConIgv,         // 19
            cabecera.almacen,        // 20
            l.coste,                 // 21
            l.extra                  // 22
        ];
    }

    btnGuardar.addEventListener("click", function () {
        var codigos = Object.keys(lineas);
        if (!codigos.length) {
            CDK.toast("La cotización no puede quedarse sin líneas.", "aviso");
            return;
        }

        /* Si hay promociones, el aviso de arriba ya estaba a la vista, pero este
           es el momento en que se pierden de verdad: conviene decirlo una vez
           más, cuando la decisión se vuelve irreversible. */
        if (!promociones.length) return guardar();

        CDK.modal.confirmar({
            titulo: promociones.length === 1 ? "Se perderá la promoción" : "Se perderán las promociones",
            mensaje: "Al guardar, la cotización se queda solo con sus productos y los cambios " +
                     "que hiciste. " +
                     (promociones.length === 1
                        ? "El descuento u obsequio de promoción se retira"
                        : "Los " + promociones.length + " descuentos y obsequios de promoción se retiran") +
                     ", y habrá que volver a aplicarlos desde el módulo de promociones.",
            confirmar: "Guardar igual",
            peligro: true
        }).then(function (si) { if (si) guardar(); });
    });

    function guardar() {
        var codigos = Object.keys(lineas);
        var item = {};
        codigos.forEach(function (c) { item[c] = aFilaGuardada(lineas[c]); });

        var textoOriginal = btnGuardar.textContent;
        btnGuardar.disabled = true;
        btnGuardar.textContent = "Guardando…";

        CDK.http.post(CDK.rutas.api("/cotizacion/update"), { item: item })
            .then(function () {
                huboCambios = false;
                promociones = [];   // el backend ya las borró
                CDK.modal.alerta({
                    titulo: "Cotización actualizada",
                    mensaje: "Los cambios de la cotización " + numero + " se guardaron.",
                    confirmar: "Cerrar"
                }).then(function () {
                    salir();
                    listaDia.recargar();
                });
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;

                /* Una cotización aprobada no se puede modificar, y eso no se
                   arregla reintentando: hay que desaprobarla por fuera. Se dice
                   así en vez de con un error genérico. */
                var detalle = (err && err.datos && err.datos.msg) || "";
                var aprobada = /aprob/i.test(detalle) ||
                               /aprob/i.test((err && err.datos && err.datos.status) || "");

                CDK.modal.alerta({
                    titulo: aprobada ? "La cotización está aprobada" : "No se pudo guardar",
                    mensaje: aprobada
                        ? "Esta cotización ya fue aceptada, así que no se puede modificar. " +
                          "Hay que desaprobarla primero, y eso se hace fuera de esta pantalla."
                        : (detalle || "El backend no confirmó los cambios. El trabajo sigue aquí; " +
                           "vuelve a intentarlo."),
                    confirmar: "Cerrar",
                    peligro: true
                });
            })
            .then(function () {
                btnGuardar.textContent = textoOriginal;
                btnGuardar.disabled = !huboCambios || !Object.keys(lineas).length;
            });
    }

    // Escape cierra el panel que esté abierto.
    document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape") return;
        if (!panelCantidad.classList.contains("hidden")) cerrarCantidad();
        else if (!panelBusqueda.classList.contains("hidden")) cerrarBusqueda();
    });

    // Si se llega con ?ncoti= desde Ver cotización, se abre directamente.
    /* Si se llega con ?ncoti= desde Ver cotización, se abre directamente. La
       lista ya se cargó sola al montarse, así que queda detrás. */
    var pedida = new URLSearchParams(location.search).get("ncoti");
    if (pedida) abrir(pedida);

})();
