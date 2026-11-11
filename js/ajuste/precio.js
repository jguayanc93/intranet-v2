/**
 * La tarjeta de una linea para ajustarle el precio, y las cuentas que hay detras. La usan las
 * dos pantallas que ajustan: la de una solicitud recibida (ajuste_solicitud) y la de un documento
 * propio (ajuste_documento, «Mis documentos»). Una sola copia para que las dos redondeen y validen
 * igual que el backend.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona ve:
 *
 *   · **El precio se redondea al centimo, la mitad hacia arriba, ANTES de validar**: 18.405 se guarda
 *     como 18.41 y es valido con un minimo de 18.41; 18.404 queda en 18.40 y no. Se dice como queda.
 *   · **El precio no puede quedar por debajo de `precioMinimo`**: el costo redondeado HACIA ARRIBA al
 *     centimo (costo 7.4533 → minimo 7.46). El costo puede traer hasta 4 decimales y se muestra con
 *     ellos: a 2 decimales un costo de 18.4033 diria 18.40, y el minimo 18.41 pareceria un error.
 *   · **Una linea sin costo** (el producto no tiene costo en su almacen, o es 0) llega con `costo`,
 *     `precioMinimo` y `margen` en `null`: se muestra sin controles de precio, porque el backend la
 *     rechazaria con `409 costo desconocido` (desde el 06/11/2026).
 *   · El descuento del cliente pasa a 0 en la linea ajustada: el precio que se escribe es el que paga.
 *
 *     ganancia        = precio − costo
 *     % sobre costo   = ganancia / costo × 100
 *     % sobre venta   = ganancia / precio × 100
 *     precio desde %  = costo × (1 + % / 100)
 *
 * Si se mueve el precio se recalcula el %, y si se mueve el %, se recalcula el precio.
 *
 * Ver docs/ajuste-precios.md (seccion 4) y docs/ajuste-directo.md (seccion 5).
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste = CDK.ajuste || {};
    var M = CDK.marcas;              // nombre()

    /* ===============================================================
     * Las cuentas
     * ============================================================= */
    function redondear(n) { return Math.round(n * 100) / 100; }
    function techo(n) { return Math.ceil(n * 100 - 1e-9) / 100; }

    /**
     * El precio al centimo, **la mitad hacia arriba** (8.204 → 8.20, 8.205 → 8.21, 8.206 → 8.21): lo que hace el backend
     * al aplicar, que valida contra `precioMinimo` el precio ya redondeado. Se hace con el exponente en texto porque
     * 8.205 × 100 da 820.4999999999999 y `Math.round` lo bajaria.
     */
    function alCentimo(n) {
        var r = Number(Math.round(Number(n + "e2")) + "e-2");
        return isFinite(r) ? r : n;
    }

    function sobreCosto(precio, costo) { return costo > 0 ? (precio - costo) / costo * 100 : null; }
    function sobreVenta(precio, costo) { return precio > 0 ? (precio - costo) / precio * 100 : null; }

    /** El precio que da un % sobre el costo, a centavos. Con un costo de mas de dos decimales, sin quedar por debajo de el. */
    function precioDesde(pct, costo) {
        var p = costo * (1 + pct / 100);
        var r = redondear(p);
        return r < p - 1e-9 && r < costo ? techo(p) : r;
    }

    /** El numero escrito en un campo, o null si no hay o no es un numero. */
    function numero(texto) {
        var t = String(texto === undefined || texto === null ? "" : texto).trim().replace(",", ".");
        if (t === "") return null;
        var n = Number(t);
        return isFinite(n) ? n : null;
    }

    A.cuentas = { redondear: redondear, alCentimo: alCentimo, sobreCosto: sobreCosto, sobreVenta: sobreVenta,
                  precioDesde: precioDesde, numero: numero };

    /* ===============================================================
     * Montos
     * ============================================================= */
    A.dinero = function (v, moneda) { return CDK.formato.moneda(v, moneda); };

    /** Un monto con sus decimales de verdad, hasta 4: el costo y el precio neto los traen, y a 2 enganan. */
    A.dineroFino = function (v, moneda) {
        var n = Number(v);
        if (!isFinite(n)) return A.dinero(v, moneda);

        var decimales = (String(Math.round(n * 10000) / 10000).split(".")[1] || "").length;
        if (decimales <= 2) return A.dinero(v, moneda);

        return (moneda === "S" ? "S/" : "$") + " " + CDK.formato.numero(n, decimales);
    };

    A.pct = function (v) { return v === null || v === undefined ? "—" : CDK.formato.porcentaje(v, 2); };

    /** ¿La linea llego sin costo? El backend la manda con `costo` en null; un 0 tambien lo es (no hay minimo contra el que validar). */
    A.sinCosto = function (l) {
        return !(typeof l.costo === "number" && l.costo > 0);
    };

    /** Lo que paga hoy el cliente por unidad: lo dice el backend (`precioNeto`); si no, sale del total de la linea. */
    function netoDe(actual) {
        return typeof actual.precioNeto === "number" ? actual.precioNeto : actual.total / actual.cantidad;
    }

    /* ===============================================================
     * Lo que se sabe de una linea
     * ============================================================= */

    /** Nombre, marca, como esta hoy, costo, stock y margen. Igual se pueda ajustar o no. */
    A.datosDeLinea = function (l, moneda) {
        var a = l.actual;
        var dinero = function (v) { return A.dinero(v, moneda); };
        var sinCosto = A.sinCosto(l);

        var hijos = [
            el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: l.descripcion }),
            el("div", { clase: "cdk-articulo__detalle", texto: M.nombre(l.marca) + " · " + l.codf })
        ];

        var filas = [
            ["Hoy", a.cantidad + " × " + dinero(a.precio) + (a.dsct ? " − " + CDK.formato.porcentaje(a.dsct, 1) : "") +
                    " = " + dinero(a.total)],
            ["Costo", sinCosto
                ? "Sin costo en este almacén"
                : A.dineroFino(l.costo, moneda) + (l.precioMinimo > l.costo + 1e-9 ? " · mínimo " + dinero(l.precioMinimo) : "")],
            ["Stock", CDK.formato.numero(l.stock, 0) + " · " + CDK.catalogo.almacen(l.almacen)]
        ];

        if (l.margen && !sinCosto) {
            filas.push(["Margen sin descuento", dinero(l.margen.monto) + " · " + A.pct(l.margen.sobreCosto) + " sobre costo"]);
        }

        filas.forEach(function (f) {
            hijos.push(el("div", { clase: "cdk-medida" }, [
                el("div", { clase: "cdk-medida__fila" }, [
                    el("span", { clase: "cdk-medida__etiqueta", texto: f[0] }),
                    el("span", { clase: "cdk-medida__valor", style: "font-weight:500;text-align:right", texto: f[1] })
                ])
            ]));
        });

        return hijos;
    };

    /** Una linea que no se puede ajustar porque no tiene costo: se ve, y se dice por que. */
    A.tarjetaSinCosto = function (l, moneda) {
        var hijos = A.datosDeLinea(l, moneda);
        hijos.push(el("p", { clase: "cdk-pista", id: "linea-" + l.item + "-sin-costo", style: "margin:10px 0 0",
                             texto: "Este producto no tiene costo cargado en su almacén: su precio no se puede ajustar." }));

        return el("li", { clase: "cdk-articulo", id: "linea-" + l.item }, [
            el("div", { clase: "cdk-articulo__cuerpo" }, hijos)
        ]);
    };

    /* ===============================================================
     * La tarjeta para ajustar
     * ============================================================= */

    /**
     * Una linea con su casilla «Ajustar esta línea», el precio, el % sobre costo y, si se pide, la cantidad.
     *
     *   A.tarjetaDePrecio(linea, {
     *       moneda:    "D" o "S",
     *       cantidad:  true si la cantidad tambien se ajusta (solo en una cotizacion recibida),
     *       alCambiar: function () cada vez que cambia algo, para habilitar o no el boton
     *   })
     *
     * Devuelve `{ nodo, item, linea, activa, valida, precio(), cantidad() }`. `activa` y `valida` se leen
     * como propiedades; `precio()` es el escrito, ya redondeado al centimo (el que se valida y el que viaja).
     */
    A.tarjetaDePrecio = function (l, opciones) {
        var moneda = opciones.moneda;
        var alCambiar = opciones.alCambiar || function () {};
        var dinero = function (v) { return A.dinero(v, moneda); };
        var costo = l.costo;
        var minimo = l.precioMinimo;
        var t = { item: l.item, linea: l, activa: false, valida: true };

        /* ---- lo que se escribe */
        var entradaPrecio = el("input", {
            type: "text", id: "linea-" + l.item + "-precio", clase: "cdk-entrada", style: "min-width:0",
            inputmode: "decimal", autocomplete: "off", "aria-label": "Precio",
            value: String(l.actual.precio)
        });
        var entradaPct = el("input", {
            type: "text", id: "linea-" + l.item + "-pct", clase: "cdk-entrada", style: "min-width:0",
            inputmode: "decimal", autocomplete: "off", "aria-label": "Porcentaje sobre el costo"
        });

        var listo = false;               // el contador avisa al crearse, antes de que exista lo que refrescar usa
        var contador = opciones.cantidad
            ? CDK.contador({ valor: l.actual.cantidad, min: 1, max: 99999, etiqueta: "Cantidad",
                             alCambiar: function () { if (listo) refrescar(); } })
            : null;
        if (contador) contador.campo.id = "linea-" + l.item + "-cantidad";

        var calculo = el("p", { clase: "cdk-pista", id: "linea-" + l.item + "-calculo", style: "margin:10px 0 0" });
        var error = el("p", { clase: "cdk-campo__error", id: "linea-" + l.item + "-error", style: "margin:8px 0 0" });
        error.classList.add("hidden");

        var campos = [
            el("div", { clase: "cdk-campo", style: "min-width:0" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": entradaPrecio.id,
                              texto: "Precio (" + (moneda === "S" ? "S/" : "US$") + ")" }), entradaPrecio
            ]),
            el("div", { clase: "cdk-campo", style: "min-width:0" }, [
                el("label", { clase: "cdk-campo__etiqueta", "for": entradaPct.id, texto: "% sobre costo" }), entradaPct
            ])
        ];

        var editor = el("div", { id: "linea-" + l.item + "-editor", style: "margin-top:10px" }, [
            el("div", { clase: "cdk-pareja", style: "grid-template-columns:minmax(0,1fr) minmax(0,1fr)" }, campos),
            contador
                ? el("div", { clase: "cdk-campo", style: "margin-top:10px" }, [
                      el("label", { clase: "cdk-campo__etiqueta", texto: "Cantidad" }), contador
                  ])
                : null,
            calculo,
            l.actual.dsct
                ? el("p", { clase: "cdk-pista", id: "linea-" + l.item + "-dscto", style: "margin:8px 0 0",
                            texto: "Hoy el cliente paga " + A.dineroFino(netoDe(l.actual), moneda) + " c/u (precio " +
                                   dinero(l.actual.precio) + " con " + CDK.formato.porcentaje(l.actual.dsct, 1) +
                                   " de descuento). Al ajustar, el descuento pasa a 0: el precio que pongas es el que paga." })
                : null,
            error
        ]);
        editor.classList.add("hidden");

        var casilla = el("input", { type: "checkbox", id: "linea-" + l.item + "-activa", style: "width:20px;height:20px;margin:0" });
        var etiquetaCasilla = el("label", {
            "for": casilla.id, clase: "cdk-campo__etiqueta",
            style: "display:flex;align-items:center;gap:10px;margin-top:12px;cursor:pointer",
            texto: ""
        }, [casilla, el("span", { texto: "Ajustar esta línea" })]);

        /* ---- lo que se calcula */
        /* El precio que se guardaria: lo escrito, redondeado al centimo. Es contra ESTE que se valida y el que viaja. */
        t.precio = function () {
            var escrito = numero(entradaPrecio.value);
            return escrito === null ? null : alCentimo(escrito);
        };
        t.cantidad = function () { return contador ? contador.valor() : l.actual.cantidad; };

        function refrescar() {
            var p = t.precio();
            var escrito = numero(entradaPrecio.value);
            var texto;

            if (p === null || p <= 0) {
                texto = "Escribe el precio.";
            } else if (p < minimo - 1e-9) {
                /* Con un costo de mas de dos decimales el minimo no es el costo, y se dicen los dos. */
                texto = "El precio no puede ser menor que el costo (" +
                        (minimo > costo + 1e-9 ? "costo " + A.dineroFino(costo, moneda) + ", mínimo " + dinero(minimo) : dinero(minimo)) + ").";
            }

            t.valida = !texto;
            error.classList.toggle("hidden", !texto);
            error.textContent = texto || "";
            entradaPrecio.setAttribute("aria-invalid", texto ? "true" : "false");

            if (p !== null && p > 0) {
                /* Con mas de dos decimales se dice como queda: es el que queda en el documento. */
                calculo.textContent = (escrito !== p ? "Se guarda como " + dinero(p) + ". " : "") +
                    "Ganancia " + dinero(p - costo) + " por unidad · " +
                    A.pct(sobreCosto(p, costo)) + " sobre costo · " + A.pct(sobreVenta(p, costo)) + " sobre venta · " +
                    "total de la línea " + dinero(p * t.cantidad());
            } else {
                calculo.textContent = "";
            }

            alCambiar();
        }

        entradaPrecio.addEventListener("input", function () {
            var p = t.precio();
            var c = p !== null ? sobreCosto(p, costo) : null;
            entradaPct.value = c === null ? "" : String(redondear(c));
            refrescar();
        });

        entradaPct.addEventListener("input", function () {
            var x = numero(entradaPct.value);
            if (x !== null && costo > 0) entradaPrecio.value = String(precioDesde(x, costo));
            refrescar();
        });

        casilla.addEventListener("change", function () {
            t.activa = casilla.checked;
            editor.classList.toggle("hidden", !t.activa);
            if (t.activa) {
                var c = sobreCosto(l.actual.precio, costo);
                entradaPct.value = c === null ? "" : String(redondear(c));
                refrescar();
                entradaPrecio.focus();
            } else {
                alCambiar();
            }
        });

        listo = true;

        var cuerpo = A.datosDeLinea(l, moneda).concat([etiquetaCasilla, editor]);
        t.nodo = el("li", { clase: "cdk-articulo", id: "linea-" + l.item }, [
            el("div", { clase: "cdk-articulo__cuerpo" }, cuerpo)
        ]);
        return t;
    };

})(window);
