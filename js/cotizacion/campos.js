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

    /**
     * Tipo de cambio de reserva.
     *
     * Provisional por decision del equipo: el backend lo expondra mas adelante.
     * El backend ya devuelve el real de cada documento (campo 5 de
     * /cotizacion/read; en el ejemplo, 3.362). Si este valor se desvia, el
     * vendedor ve un precio en soles y el sistema registra otro.
     */
    var TIPO_CAMBIO_FIJO = 3.408;

    /**
     * Tipo de cambio vigente.
     * Ya lee del backend si viene: el dia que /vendedor incluya `tipoCambio`,
     * empieza a usarse sin tocar esta funcion ni a quien la llama.
     */
    CDK.coti.tipoCambio = function () {
        var usuario = CDK.sesion && CDK.sesion.usuario ? CDK.sesion.usuario() : null;
        var delBackend = usuario && Number(usuario.tipoCambio);
        return delBackend > 0 ? delBackend : TIPO_CAMBIO_FIJO;
    };

    /** true si el tipo de cambio en uso es el de reserva, no el del backend. */
    CDK.coti.tipoCambioEsFijo = function () {
        return CDK.coti.tipoCambio() === TIPO_CAMBIO_FIJO;
    };

    /** Moneda elegida en la pantalla: "D" dolares, "S" soles. */
    CDK.coti.moneda = function () {
        var selector = document.getElementById("alm");
        return selector ? selector.value : "D";
    };

    /** Codigo ISO de una moneda, para mostrarlo junto al importe. */
    CDK.coti.codigoMoneda = function (id) {
        return id === "D" ? "USD" : "PEN";
    };

    /**
     * Convierte un importe a la moneda seleccionada en pantalla.
     * `monedaOrigen` es la moneda en la que viene el dato del backend.
     */
    CDK.coti.convertir = function (monto, monedaOrigen) {
        var actual = CDK.coti.moneda();
        var valor = Number(monto);

        if (!isFinite(valor)) return 0;
        if (monedaOrigen === actual) return valor;

        if (monedaOrigen === "D" && actual === "S") return valor * CDK.coti.tipoCambio();
        if (monedaOrigen === "S" && actual === "D") return valor / CDK.coti.tipoCambio();

        return valor;
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
