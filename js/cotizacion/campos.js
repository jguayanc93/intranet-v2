/**
 * campos.js — Nombres para los datos de una cotización.
 *
 * El backend devuelve un objeto de filas, y cada fila es un objeto con claves
 * "0".."22" sin nombres. Hasta ahora eso obligaba a escribir `paso3[i][17]` por
 * todo el código, y había dos numeraciones distintas para los mismos datos:
 *
 *   · la respuesta de /cotizacion/read            -> fila[17]
 *   · la copia en la global cotimodi_tmpitems     -> tmpitems[i][16]
 *
 * La segunda existe porque se construye copiando DESDE LA POSICIÓN 1
 * (`[paso3[item][1], paso3[item][2], …]`), así que todos los índices quedan
 * desplazados en uno. Mezclar las dos numeraciones da valores equivocados sin
 * ningún error visible.
 *
 * Los nombres están contrastados contra una respuesta real del backend.
 *
 * Ejemplo de fila:
 *   0  "F"                        clase de documento
 *   1  "2026-09-23T00:00:00.000Z" fecha
 *   2  "31"                       tipo de documento
 *   3  "009-00969162"             número de documento
 *   4  "C12171"                   código de cliente
 *   5  3.362                      tipo de cambio
 *   6  "D"                        moneda del documento
 *   7  "D"                        moneda de la línea
 *   8  "S"                        POR CONFIRMAR
 *   9  "item"                     tipo de registro
 *   10 "0505-012610"              código interno
 *   11 "TIET544120-AL"            part number
 *   12 "EPSON"                    marca
 *   13 "UND"                      unidad
 *   14 "BOTELLA TINTA EPSON…"     descripción
 *   15 18                         cantidad
 *   16 7.97                       precio unitario
 *   17 140.58                     importe SIN IGV (cantidad × precio − descuento)
 *   18 2                          descuento %
 *   19 165.88                     importe CON IGV
 *   20 "01"                       almacén
 *   21 7.45                       POR CONFIRMAR (¿coste? ¿precio de lista?)
 *   22 "S"                        POR CONFIRMAR ("N" en las líneas de descuento)
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    CDK.coti = CDK.coti || {};

    /* Datos que se repiten en todas las filas: describen el documento. */
    var CABECERA = {
        clase:       0,
        fecha:       1,
        tipoDoc:     2,
        documento:   3,
        codcliente:  4,
        tipoCambio:  5,
        moneda:      6,
        monedaLinea: 7,
        almacen:     20,

        /* Añadidas al final por el backend para el documento del cliente, sin
           mover ninguna de las anteriores. Con ellas sobra la llamada a
           /cliente/id: la tabla de clientes ya estaba en el JOIN.

           `razonSocial` sale de la COTIZACIÓN, no del maestro de clientes. Son
           casi siempre lo mismo, pero difieren en 47 de 15 879 casos: clientes
           que cambiaron de nombre después. Así, un documento reimpreso dice lo
           que decía cuando se cotizó. */
        razonSocial: 23,
        direccion:   24,
        atte:        25
    };

    /* Datos propios de cada línea. */
    var LINEA = {
        afectoIgv:      8,    // "S" / "N"
        codigo:         10,
        partnumber:     11,
        marca:          12,
        unidad:         13,
        descripcion:    14,
        cantidad:       15,
        precioUnitario: 16,
        importe:        17,   // sin IGV
        descuento:      18,   // porcentaje
        importeConIgv:  19,
        coste:          21    // coste unitario
    };

    /**
     * Cliente, tal como lo devuelve /cliente/id.
     *
     *   0  "C10874"                    código
     *   1  "PC SUMINISTROS & SIST…"    razón social
     *   2  "20600828747"               RUC
     *   3  "V0345"                     codven: vendedor asignado
     *   4  "14"                        codcdv: PENDIENTE de confirmar con sistemas
     *   5  "F"                         tipocl: letra, decide el precio en /producto/buscar
     *
     * La letra es el campo crítico: si no se refresca al cambiar de cliente,
     * el paso 2 cotiza con los precios del cliente anterior.
     */
    var CLIENTE = {
        codigo:       0,
        razonSocial:  1,
        ruc:          2,
        vendedor:     3,   // codven
        /* Se llamó `condicionPago` un tiempo, pero la columna es `codcdv` y el
           backend avisó de que no está confirmado que sea eso. Mejor el nombre
           de la columna que un nombre bonito que resulte ser falso. */
        codcdv:       4,
        letra:        5

        // PENDIENTE: línea de crédito disponible ("S" / "N"). El paso 1 ya
        // sabe pintarlo (círculo verde o rojo junto al nombre); solo falta
        // que el backend lo envíe y añadir aquí su posición como `credito`.
    };

    /**
     * Producto, tal como lo devuelve /producto/buscar.
     *
     *   0  "0505-011055"                  código interno
     *   1  "BOTELLA TINTA EPSON T664…"    descripción
     *   2  2401                           stock en Principal (01)
     *   3  0                              stock en M&M (08)
     *   4  2                              descuento MÁXIMO permitido, en %
     *   5  7.97                           precio unitario para este cliente
     *   6  0                              stock en Piura
     *
     * Dos cosas que conviene no confundir:
     *
     *   · el precio [5] depende de la LETRA del cliente, así que la misma
     *     búsqueda da precios distintos según para quién se cotice;
     *   · el descuento [4] es el TECHO, no un descuento aplicado. Es el límite
     *     que protege el margen, y el frontend no debe dejar pasar de ahí.
     */
    var PRODUCTO_BUSCADO = {
        codigo:          0,
        descripcion:     1,
        stockPrincipal:  2,
        stockMym:        3,
        descuentoMaximo: 4,
        precioUnitario:  5,
        stockPiura:      6
    };

    /* Tipos de línea. Una cotización mezcla los tres. */
    var PRODUCTO  = "producto";
    var DESCUENTO = "descuento";   // DSCTO/PROM — importe negativo
    var OBSEQUIO  = "obsequio";    // GRATIS/PROM — importe cero

    function leer(fila, mapa, desplazamiento) {
        var salida = {};
        Object.keys(mapa).forEach(function (nombre) {
            salida[nombre] = fila[mapa[nombre] + desplazamiento];
        });
        return salida;
    }

    /**
     * Clasifica la línea por su precio, no por el texto de la descripción:
     * los prefijos "DSCTO/PROM:" y "GRATIS/PROM:" los compone el backend y
     * podrían cambiar de redacción, pero el signo del importe no.
     */
    function clasificar(linea) {
        var precio = Number(linea.precioUnitario);
        if (precio < 0) return DESCUENTO;
        if (precio === 0 && Number(linea.importe) === 0) return OBSEQUIO;
        return PRODUCTO;
    }

    function normalizar(linea) {
        linea.tipo = clasificar(linea);
        linea.esProducto = linea.tipo === PRODUCTO;

        // El backend antepone "DSCTO/PROM:" o "GRATIS/PROM:" a la descripción.
        // Se guarda aparte para poder mostrar la etiqueta sin repetir el texto.
        linea.descripcionLimpia = String(linea.descripcion || "")
            .replace(/^\s*(DSCTO|GRATIS)\/PROM:\s*/i, "");

        /* --- margen ---------------------------------------------------
         * El precio a comparar con el coste NO es el precio de lista, sino
         * el que se cobra de verdad: el importe ya lleva aplicado el
         * descuento de la línea. En la primera línea del ejemplo, 7.97 de
         * lista con 2 % de descuento se convierten en 7.81 efectivos, y
         * sobre ese hay que medir.
         *
         * Cálculo del frontend, no un dato del backend: si el negocio mide
         * el margen de otra forma, se ajusta aquí y en un solo sitio.
         * --------------------------------------------------------------- */
        var cantidad = Number(linea.cantidad) || 0;
        var coste = Number(linea.coste) || 0;

        linea.precioEfectivo = cantidad ? (Number(linea.importe) || 0) / cantidad
                                        : (Number(linea.precioUnitario) || 0);
        linea.costeTotal = coste * cantidad;
        linea.margen = (Number(linea.importe) || 0) - linea.costeTotal;
        linea.margenPct = linea.precioEfectivo
            ? ((linea.precioEfectivo - coste) / linea.precioEfectivo) * 100
            : 0;

        // Solo tiene sentido avisar en productos: un obsequio siempre está
        // "bajo coste" por definición, y un descuento no tiene coste propio.
        linea.bajoCoste = linea.esProducto && coste > 0 && linea.margen < 0;

        return linea;
    }

    CDK.coti.CABECERA = CABECERA;
    CDK.coti.LINEA = LINEA;
    CDK.coti.CLIENTE = CLIENTE;
    CDK.coti.PRODUCTO = PRODUCTO;
    CDK.coti.DESCUENTO = DESCUENTO;
    CDK.coti.OBSEQUIO = OBSEQUIO;

    /**
     * Cliente desde /cliente/id.
     *
     * `/cliente/buscar` devuelve las mismas primeras posiciones (código, razón
     * social y RUC), así que sirve para las dos respuestas: los campos que no
     * vengan quedan en undefined.
     */
    CDK.coti.cliente = function (fila) {
        return fila ? leer(fila, CLIENTE, 0) : null;
    };

    /**
     * Techo de descuento de un producto, normalizado.
     *
     * Existe porque el proyecto tenía CUATRO respaldos distintos para el mismo
     * dato: `|| 6` en tres sitios de buscar_cliente_part3.js y `: 100` en
     * buscar_cliente_part2.js. Como `0 || 6` da 6, un producto marcado por el
     * backend como "sin descuento permitido" acababa admitiendo hasta un 6 %,
     * y el tope existe justamente para proteger el margen.
     *
     * Ante la duda, cero: no dejar descontar es recuperable; haberlo dejado, no.
     */
    CDK.coti.topeDescuento = function (valor) {
        var n = Number(valor);
        return isFinite(n) && n > 0 ? n : 0;
    };

    /* ---------------------------------------------------------------
     * Moneda y tipo de cambio
     *
     * Vive aqui, junto al calculo, pero calcularLinea() ya no lo usa: convertir
     * es cosa de quien muestra el importe. Lo que se guarda y lo que se envia
     * al backend va siempre en dolares.
     *
     * El <select> se llama "alm" por herencia, pero NO es el almacen: son las
     * monedas "D" (dolares) y "S" (soles).
     * ------------------------------------------------------------- */

    /* ---------------------------------------------------------------
     * Aritmetica decimal exacta
     *
     * El ERP calcula con numeros decimales (SQL), no con coma flotante, y la regla de una cotizacion en soles redondea en TRES
     * pasos seguidos: el precio unitario a 3 decimales, la linea a 2, los totales a 2. En coma flotante el producto se desvia en
     * la ultima cifra (7.97 × 3.45 da 27.496499999999997, y el ERP redondea 27.4965 a 27.497), y eso, medido contra enteros
     * exactos en 300 000 carritos, cambia algun centimo en el 5 % de ellos. Aqui cada numero se toma por su forma corta
     * (`String(7.97)` es "7.97", la que escribio quien lo tecleo y la que guarda la base de datos) y se opera con enteros grandes.
     *
     * Necesita `BigInt`, que todo navegador de los ultimos años trae. Sin el, se cae al calculo en coma flotante de siempre.
     * (Solo la llamada `BigInt(…)`, nunca el literal `10n`: ese romperia el archivo entero en un navegador que no lo conozca.)
     * ------------------------------------------------------------- */
    var HAY_BIGINT = typeof BigInt === "function";

    function diez(k) { return BigInt("1" + new Array(k + 1).join("0")); }

    /** Un numero como { n, e }: n × 10^e, con n entero grande. */
    function decimal(x) {
        var m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/.exec(String(Number(x)).toLowerCase());
        if (!m) return { n: BigInt(0), e: 0 };
        var fraccion = m[3] || "";
        var n = BigInt(m[2] + fraccion);
        return { n: m[1] ? -n : n, e: (m[4] ? parseInt(m[4], 10) : 0) - fraccion.length };
    }

    function por(a, b) { return { n: a.n * b.n, e: a.e + b.e }; }

    function menos(a, b) {
        var e = Math.min(a.e, b.e);
        return { n: a.n * diez(a.e - e) - b.n * diez(b.e - e), e: e };
    }

    /** Redondea a `decimales`, la mitad hacia arriba (alejandose del cero), y lo devuelve como numero. */
    function redondeado(d, decimales) {
        var n = d.n;
        var negativo = n < BigInt(0);
        if (negativo) n = -n;

        var sobran = -d.e - decimales;
        if (sobran > 0) {
            var den = diez(sobran);
            n = (n * BigInt(2) + den) / (den * BigInt(2));
        } else if (sobran < 0) {
            n = n * diez(-sobran);
        }

        return Number((negativo && n !== BigInt(0) ? "-" : "") + n.toString() + "e-" + decimales);
    }

    /**
     * Redondeo al decimal pedido, la mitad hacia arriba, sin los errores de la coma flotante (1.005 × 100 da 100.49999999999999
     * y `Math.round` lo bajaria a 1.00).
     */
    CDK.coti.redondear = function (n, decimales) {
        var v = Number(n);
        if (!isFinite(v)) return 0;
        if (HAY_BIGINT) return redondeado(decimal(v), decimales);

        var r = Number(Math.round(Number(v + "e" + decimales)) + "e-" + decimales);
        return isFinite(r) ? r : v;
    };

    /**
     * El producto de varios factores, redondeado a `decimales` **sobre el valor exacto**: lo que hace el ERP. Es el paso que
     * `redondear(a * b, …)` no puede dar, porque `a * b` ya viene desviado.
     */
    CDK.coti.productoRedondeado = function (factores, decimales) {
        if (!HAY_BIGINT) {
            return CDK.coti.redondear(factores.reduce(function (a, f) { return a * (Number(f) || 0); }, 1), decimales);
        }
        var d = { n: BigInt(1), e: 0 };
        factores.forEach(function (f) { d = por(d, decimal(f)); });
        return redondeado(d, decimales);
    };

    /**
     * Tipo de cambio vigente: el de VENTA del dia, el que llega en `/vendedor` como `tipoCambio`. **`null` si hoy no esta cargado.**
     *
     * Antes habia uno fijo de reserva (3.408), que se usaba en silencio: el vendedor veia un precio en soles y el sistema
     * registraba otro. Sin tipo de cambio no se cotiza en soles, y el backend tambien lo rechaza
     * (`tipcambio no registrado`). No hay tipo de cambio inventado.
     */
    CDK.coti.tipoCambio = function () {
        var usuario = CDK.sesion && CDK.sesion.usuario ? CDK.sesion.usuario() : null;
        var delBackend = usuario && Number(usuario.tipoCambio);
        return delBackend > 0 ? delBackend : null;
    };

    /** ¿Se puede cotizar en soles? Solo si hoy hay tipo de cambio. */
    CDK.coti.haySoles = function () {
        return CDK.coti.tipoCambio() !== null;
    };

    /**
     * Moneda elegida en la pantalla: "D" dolares, "S" soles. Sin tipo de cambio no hay soles: aunque el selector dijera "S"
     * (el navegador restaura la ultima eleccion), se trabaja en dolares.
     */
    CDK.coti.moneda = function () {
        var selector = document.getElementById("alm");
        var elegida = selector ? selector.value : "D";
        return elegida === "S" && CDK.coti.haySoles() ? "S" : "D";
    };

    /** Codigo ISO de una moneda, para mostrarlo junto al importe. */
    CDK.coti.codigoMoneda = function (id) {
        return id === "D" ? "USD" : "PEN";
    };

    /**
     * Convierte un importe a la moneda seleccionada en pantalla. **Solo para lo que no es una linea de cotizacion** —los
     * descuentos de una promocion, que solo existen en dolares—: las lineas y los totales de una cotizacion en soles siguen la
     * regla del ERP (`lineaEnMoneda` y `totalesEnMoneda`), que no es multiplicar un importe ya redondeado en dolares.
     */
    CDK.coti.convertir = function (monto, monedaOrigen) {
        var actual = CDK.coti.moneda();
        var valor = Number(monto);

        if (!isFinite(valor)) return 0;
        if (monedaOrigen === actual) return valor;

        var tc = CDK.coti.tipoCambio();
        if (!tc) return valor;                      // sin tipo de cambio la moneda es D y esto no se llega a usar

        if (monedaOrigen === "D" && actual === "S") return valor * tc;
        if (monedaOrigen === "S" && actual === "D") return valor / tc;

        return valor;
    };

    /* ---------------------------------------------------------------
     * Una cotizacion en soles: la regla del ERP (docs/cotizacion-moneda.md, seccion 2)
     *
     * Los precios SIGUEN YENDO al backend en dolares, en cualquier moneda. Lo que sigue es solo lo que se ENSEÑA, y tiene que
     * coincidir al centimo con lo que el backend graba:
     *
     *     precio unitario S/  = redondear(precio US$ × tipo de cambio, 3)
     *     precio con dscto S/ = redondear(precio unitario S/ × (1 − descuento / 100), 2)      <- se redondea ANTES de multiplicar
     *     total de la linea   = redondear(precio con dscto S/ × cantidad, 2)
     *     total sin IGV       = suma de los totales de linea
     *     IGV                 = redondear(total sin IGV × 0.18, 2)
     *     total con IGV       = total sin IGV + IGV
     *
     * El backend corrigio la regla de la linea el 23/10 (la primera version decia redondear(unitario × cantidad × (1 − d/100), 2),
     * que solo explicaba el 51 % de las lineas en soles): comprobada contra todas las lineas de 2026, 0 sin explicar.
     *
     * Convertir el total en dolares ya redondeado (lo que se hacia) no da lo mismo: difiere en centimos en la mayoria de las
     * cotizaciones, porque el ERP convierte el PRECIO UNITARIO y recalcula desde ahi.
     * ------------------------------------------------------------- */

    /**
     * El precio unitario en una moneda. En soles, el del ERP: a 3 decimales. En dolares, tal cual.
     * `tc` es opcional: por defecto el del dia; una cotizacion ya grabada usa el suyo.
     */
    CDK.coti.precioEnMoneda = function (precioDolares, moneda, tc) {
        var p = Number(precioDolares);
        if (!isFinite(p)) return 0;
        if ((moneda || CDK.coti.moneda()) !== "S") return p;
        return CDK.coti.productoRedondeado([p, tc || CDK.coti.tipoCambio() || 0], 3);
    };

    /**
     * Un importe con su simbolo. El precio unitario en soles lleva **3 decimales**, como se graba: a 2, 143.24 × 100 no daria el
     * total que se ve.
     */
    CDK.coti.formatoPrecio = function (valor, moneda) {
        return (moneda || CDK.coti.moneda()) === "S" ? CDK.formato.moneda(valor, "S", 3) : CDK.formato.moneda(valor, "D");
    };

    /**
     * Una linea en la moneda pedida, a partir de lo que llega en dolares. `config` es el de `calcularLinea`
     * (`precio` en dolares, `cantidad`, `descuento`, `tope`). Devuelve `{ moneda, precioUnitario, importe, … }` en esa moneda, mas
     * lo que `calcularLinea` dice en dolares (`acotado`, `descuentoAplicado`, `dolares`).
     */
    CDK.coti.lineaEnMoneda = function (config, moneda, tc) {
        var d = CDK.coti.calcularLinea(config);
        var m = moneda || CDK.coti.moneda();

        if (m !== "S") {
            return { moneda: "D", precioUnitario: d.precioUnitario, importe: d.importe, cantidad: d.cantidad,
                     descuentoAplicado: d.descuentoAplicado, acotado: d.acotado, dolares: d };
        }

        var preu = CDK.coti.precioEnMoneda(config.precio, "S", tc);
        return {
            moneda: "S", precioUnitario: preu,
            precioConDescuento: CDK.coti.precioConDescuentoEnSoles(preu, d.descuentoAplicado),
            importe: CDK.coti.importeEnSoles(preu, d.cantidad, d.descuentoAplicado),
            cantidad: d.cantidad, descuentoAplicado: d.descuentoAplicado, acotado: d.acotado, dolares: d
        };
    };

    /**
     * Los totales de un documento, en su moneda. `importes` son los de cada linea YA en esa moneda; `descuentoPromo`, en dolares
     * (las promociones solo existen en dolares).
     *
     *   dolares: base = productos − promociones;  IGV = base × 0.18 (sin redondear);  total = base + IGV   (como siempre)
     *   soles:   el del ERP, arriba
     */
    CDK.coti.totalesEnMoneda = function (importes, moneda, descuentoPromo) {
        var suma = (importes || []).reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
        var promo = Number(descuentoPromo) || 0;

        if ((moneda || CDK.coti.moneda()) === "S") {
            var sinIgv = CDK.coti.redondear(suma, 2);      // la suma de importes de 2 decimales: su error de coma flotante es de 1e-13
            var igv = CDK.coti.productoRedondeado([sinIgv, 0.18], 2);
            return { productos: sinIgv, promociones: 0, sinIgv: sinIgv, igv: igv, total: CDK.coti.redondear(sinIgv + igv, 2) };
        }

        var base = suma - promo;
        return { productos: suma, promociones: promo, sinIgv: base, igv: base * 0.18, total: base + base * 0.18 };
    };

    /**
     * Una linea NUEVA en una cotizacion que ya esta en soles, convertida con el tipo de cambio **de esa cotizacion** (nunca el del
     * dia): `preu` y `cost` a 3 decimales, y el importe desde ahi. Es lo que `/cotizacion/update` espera de una linea nueva.
     */
    CDK.coti.lineaNuevaEnSoles = function (config) {
        var tcam = Number(config.tcam);
        var preu = CDK.coti.productoRedondeado([Number(config.precio) || 0, tcam], 3);
        var importe = CDK.coti.importeEnSoles(preu, config.cantidad, config.descuento);

        return {
            precioUnitario: preu,
            coste: CDK.coti.productoRedondeado([Number(config.coste) || 0, tcam], 3),
            importe: importe,
            importeConIgv: CDK.coti.productoRedondeado([importe, 1.18], 2)
        };
    };

    /**
     * El precio con descuento de una linea en soles: `redondear(precio unitario × (1 − descuento / 100), 2)`. El ERP no lo graba, pero
     * es el valor con el que calcula la linea, y el que enseña el impreso del cliente: cantidad × este precio da el total de la linea.
     */
    CDK.coti.precioConDescuentoEnSoles = function (precioUnitario, descuento) {
        var dsct = Math.min(Math.max(Number(descuento) || 0, 0), 100);
        var precio = Number(precioUnitario) || 0;

        if (!HAY_BIGINT) return CDK.coti.redondear(precio * (1 - dsct / 100), 2);

        /* precio × (100 − descuento) ÷ 100, con (100 − descuento) tambien exacto: 100 − 2.5 = 97.5, no 97.50000001. */
        var d = por(decimal(precio), menos(decimal(100), decimal(dsct)));
        return redondeado({ n: d.n, e: d.e - 2 }, 2);
    };

    /**
     * El importe de una linea en soles cuyo precio unitario YA esta en soles —una linea grabada, o recien convertida—: la regla
     * del ERP, sin pasar por dolares: **el precio con descuento a 2 decimales, por la cantidad**. Es lo que hace falta al cambiar la
     * cantidad de una linea de una cotizacion en soles.
     */
    CDK.coti.importeEnSoles = function (precioUnitario, cantidad, descuento) {
        var cant = Math.max(parseInt(cantidad, 10) || 0, 0);
        return CDK.coti.productoRedondeado([CDK.coti.precioConDescuentoEnSoles(precioUnitario, descuento), cant], 2);
    };

    /**
     * Importe de una línea de cotización. ÚNICO sitio donde se calcula.
     *
     * Antes había tres, y habían divergido en algo que no se ve: al AGREGAR un
     * producto se multiplicaba el precio tal cual, y al EDITARLO se convertía
     * antes a la moneda elegida. Con la moneda en soles, el mismo producto daba
     * 79.70 recién agregado y 271.62 al editarlo sin tocar nada.
     *
     * NO CONVIERTE DE MONEDA, a propósito. Devuelve los importes en la misma
     * moneda del precio que se le pasa, que es la del backend: dólares.
     *
     * Durante un tiempo sí convertía, y eso arreglaba la divergencia de arriba
     * pero creaba otra peor: lo que se GUARDABA en el carrito quedaba en la
     * moneda de la pantalla. Con soles elegidos, el carrito enviaba al backend
     * un importe 3.4 veces mayor que el precio unitario que iba a su lado, en
     * el mismo objeto. El backend trabaja solo en dólares.
     *
     * Convertir es cosa de quien muestra, no de quien calcula:
     *
     *   CDK.formato.moneda(CDK.coti.convertir(linea.importe, "D"), CDK.coti.moneda())
     *
     * El descuento se acota al tope aquí mismo: es el único punto por el que
     * pasan las tres pantallas, así que no puede saltárselo ninguna.
     *
     * Esto calcula para MOSTRAR. Al crear la cotización el backend recalcula y
     * su número es el que vale.
     *
     *   CDK.coti.calcularLinea({ precio: 7.97, cantidad: 10, descuento: 2, tope: 2 })
     *   → { precioUnitario: 7.97, bruto: 79.70, descuentoAplicado: 2,
     *       montoDescuento: 1.59, importe: 78.11, acotado: false }
     */
    CDK.coti.calcularLinea = function (config) {
        config = config || {};

        /* En la moneda que llegue, sin tocarla. El backend manda dólares. */
        var precio = Number(config.precio);
        if (!isFinite(precio) || precio < 0) precio = 0;

        var cantidad = Math.max(parseInt(config.cantidad, 10) || 0, 0);

        var pedido = Number(config.descuento) || 0;
        if (pedido < 0) pedido = 0;

        // Si no se pasa tope, no se acota: hay sitios que solo quieren el
        // importe y validan el tope por su cuenta.
        var tope = config.tope === undefined ? null : CDK.coti.topeDescuento(config.tope);
        var descuento = tope === null ? pedido : Math.min(pedido, tope);

        var bruto = precio * cantidad;
        var montoDescuento = bruto * (descuento / 100);

        function dos(n) { return Math.round(n * 100) / 100; }

        return {
            precioUnitario: dos(precio),
            cantidad: cantidad,
            descuentoAplicado: descuento,
            acotado: tope !== null && pedido > tope,
            bruto: dos(bruto),
            montoDescuento: dos(montoDescuento),
            importe: dos(bruto - montoDescuento)
        };
    };

    /**
     * Producto desde /producto/buscar.
     *
     * `stockTotal` se calcula aquí porque el vendedor necesita saber si hay
     * existencias en algún sitio antes de mirar en cuál.
     */
    CDK.coti.producto = function (fila) {
        if (!fila) return null;

        var p = leer(fila, PRODUCTO_BUSCADO, 0);

        p.stockPrincipal  = Number(p.stockPrincipal) || 0;
        p.stockMym        = Number(p.stockMym) || 0;
        p.stockPiura      = Number(p.stockPiura) || 0;
        p.stockTotal      = p.stockPrincipal + p.stockMym + p.stockPiura;
        p.precioUnitario  = Number(p.precioUnitario) || 0;

        // Sin dato se asume 0, no un valor de cortesía: el techo de descuento
        // protege el margen, y ante la duda lo correcto es no dejar descontar.
        p.descuentoMaximo = Number(p.descuentoMaximo) || 0;

        return p;
    };

    /** Cabecera del documento, desde cualquier fila (se repite en todas). */
    CDK.coti.cabecera = function (fila) {
        return fila ? leer(fila, CABECERA, 0) : null;
    };

    /** Una línea, desde la respuesta del backend. */
    CDK.coti.linea = function (fila) {
        return fila ? normalizar(leer(fila, LINEA, 0)) : null;
    };

    /**
     * Una línea, desde la copia guardada en cotimodi_tmpitems.
     * Ese array se construyó saltándose la posición 0, de ahí el -1.
     */
    CDK.coti.lineaGuardada = function (fila) {
        return fila ? normalizar(leer(fila, LINEA, -1)) : null;
    };

    /**
     * Convierte la respuesta completa en algo utilizable.
     *
     * El IGV se deduce restando (importeConIgv − importe) en vez de aplicar un
     * 18 % fijo: así sigue siendo correcto si cambia la tasa o si alguna línea
     * no está afecta.
     */
    CDK.coti.documento = function (respuesta) {
        var filas = Object.keys(respuesta || {}).map(function (k) { return respuesta[k]; });
        if (!filas.length) return null;

        var lineas = filas.map(CDK.coti.linea);

        var subtotal = 0, coste = 0;
        lineas.forEach(function (l) {
            subtotal += Number(l.importe) || 0;
            // Los obsequios cuestan aunque no se cobren: si no se sumaran, el
            // margen del documento saldría mejor de lo que es en realidad.
            coste    += l.costeTotal || 0;
        });

        /* El IGV se deriva del subtotal, NO sumando el importe con IGV de cada
           línea (la posición 19).

           Antes se restaba `conIgv − subtotal`, razonando que así seguiría
           siendo correcto si cambiaba la tasa o si una línea no estaba afecta.
           El backend avisó de que eso se desvía del ERP: la cabecera de la
           cotización la gobierna un trigger que hace `SUMA(17) × 0.18`, sin
           mirar las líneas. Sumando la 19 el total difiere por céntimos del que
           muestra el ERP, y durante las pruebas de promociones esa diferencia
           dejó una cotización descuadrada en dos céntimos.

           Entre ser teóricamente correcto y coincidir con el documento que el
           cliente ya tiene en la mano, manda lo segundo. */
        var IGV = 0.18;
        var igv = Math.round(subtotal * IGV * 100) / 100;

        return {
            cabecera: CDK.coti.cabecera(filas[0]),
            lineas: lineas,
            productos: lineas.filter(function (l) { return l.tipo === PRODUCTO; }),
            promociones: lineas.filter(function (l) { return l.tipo !== PRODUCTO; }),
            bajoCoste: lineas.filter(function (l) { return l.bajoCoste; }),
            subtotal: subtotal,
            igv: igv,
            total: Math.round((subtotal + igv) * 100) / 100,
            coste: coste,
            margen: subtotal - coste,
            margenPct: subtotal ? ((subtotal - coste) / subtotal) * 100 : 0
        };
    };

})(window);
