/*
  Paso 4 - Crear cotización
  Lógica de la nueva ruta rutacotizacionnewcrear.
  - Activa/desactiva el botón CREAR según el carrito.
  - Envía el detalle completo de los productos al backend.
  - Reinicia el estado luego de recibir respuesta válida o inválida.
*/

function obtenerCantidadProductosCarrito() {
    return window.productosSeleccionados ? Object.keys(window.productosSeleccionados).length : 0;
}

function actualizarBotonCreacion() {
    const boton = document.getElementById("creacion");
    if (!boton) return;

    /* Antes alternaba ocho clases de Tailwind -verde contra rojo, opacidad,
       cursor- para decir lo mismo que `disabled` ya dice. El estilo del boton
       deshabilitado lo pone el CSS del armazon, en un solo sitio. */
    boton.disabled = obtenerCantidadProductosCarrito() === 0;
}

/* parseJSONResponse se retiro: solo lo usaba la creacion, que ahora pasa por
   CDK.http y desempaqueta en un unico sitio. Estaba ademas duplicada con una
   version de semantica opuesta en part4, y ganaba esta por orden de carga. */

function mostrarModalResultadoCreacion(tipo, titulo, mensaje) {
    /* Era un modal montado a mano, con sus propias clases y sin Escape ni
       trampa de foco: quien navegaba con teclado quedaba atrapado detras.
       CDK.modal ya resuelve las dos cosas y devuelve el foco al cerrar. */
    CDK.modal.alerta({
        titulo: titulo,
        mensaje: mensaje,
        confirmar: "Cerrar",
        peligro: tipo === "error"
    });
}

function limpiarEstadoDespuesDeCreacion() {
    if (Array.isArray(cliente_data)) {
        cliente_data.length = 0;
    } else {
        cliente_data = [];
    }

    almc_id = "D";

    if (typeof promos_insertadas === "object" && promos_insertadas !== null) {
        promos_insertadas = {};
    }

    /* Sin esto, la siguiente cotizacion heredaria las promociones de la
       anterior y se las acoplaria a un documento que no les toca. */
    window.promocionesAplicadas = [];

    if (typeof reiniciarSegmento3 === "function") {
        reiniciarSegmento3();
    } else if (window.productosSeleccionados) {
        window.productosSeleccionados = {};
    }

    if (window.idsProductosAgregados) {
        window.idsProductosAgregados = [];
    }

    const paso2 = document.getElementById("paso2");
    if (paso2) paso2.classList.add("hidden");

    const paso3 = document.getElementById("paso3");
    if (paso3) paso3.classList.add("hidden");

    const clienteSeleccionado = document.getElementById("cliente-seleccionado");
    if (clienteSeleccionado) clienteSeleccionado.classList.add("hidden");



    const recorrerProductos = document.getElementById("recorrer-productos");
    if (recorrerProductos) recorrerProductos.innerHTML = "";

    if (typeof actualizarBotonCreacion === "function") {
        actualizarBotonCreacion();
    }
}

/**
 * Vacía SOLO el carrito: productos, promociones y lo que se ve del paso 3.
 *
 * Distinto de limpiarEstadoDespuesDeCreacion(), que además borra el cliente y
 * la moneda porque allí la cotización ya se creó.
 *
 * Lo usa el paso 1 al cambiar de cliente: el precio de cada producto depende de
 * la letra del cliente (cliente_data[5], que va a /producto/buscar), así que un
 * carrito armado para otro cliente lleva importes que ya no corresponden.
 */
/* `agrupacion` ya no se barre aqui: ese global solo lo llenaban tblprd() y
   tblprd2(), de js/funciones/identificar_producto.js, que esta pagina no carga.
   Limpiar algo que nadie llena sugiere que importa, y no importa. */
window.vaciarCarritoCotizacion = function () {
    if (typeof promos_insertadas === "object" && promos_insertadas !== null) {
        promos_insertadas = {};
    }

    /* Sin esto, la siguiente cotizacion heredaria las promociones de la
       anterior y se las acoplaria a un documento que no les toca. */
    window.promocionesAplicadas = [];

    if (typeof reiniciarSegmento3 === "function") reiniciarSegmento3();
    else if (window.productosSeleccionados) window.productosSeleccionados = {};

    if (window.idsProductosAgregados) window.idsProductosAgregados = [];

    var paso3 = document.getElementById("paso3");
    if (paso3) paso3.classList.add("hidden");

    /* Quedan solo los que existen: #productos-listados se fue con el panel
       lateral del carrito, y #seleccionar-productos nunca estuvo en esta
       pagina. */
    ["recorrer-productos"].forEach(function (id) {
        var nodo = document.getElementById(id);
        if (nodo) nodo.innerHTML = "";
    });

    if (typeof actualizarBotonCreacion === "function") actualizarBotonCreacion();
};

/** Cuántos productos hay en el carrito. */
window.contarProductosCarrito = obtenerCantidadProductosCarrito;

window.crearCotizacion = async function () {
    const boton = document.getElementById("creacion");
    if (!boton || boton.disabled) return;

    const botonContenido = boton.textContent;
    boton.disabled = true;
    boton.textContent = "Creando…";

    try {
        /* `promos` ya no se envia: el backend confirmo que /pegar nunca lo leyo.
           Las promociones se acoplan despues, con el numero que devuelve. */
        const respuesta = await CDK.http.post(CDK.rutas.api("/cotizacion/pegar"), {
            cliente: cliente_data,
            productos: window.productosSeleccionados || {},
            // Solo se registra en la cabecera. El backend quito la conversion
            // que hacia antes, asi que los importes van siempre en dolares.
            moneda: almc_id
        });

        /* Antes habia que adivinar el exito entre siete campos distintos
           -success, valid, estado, resultado, numero, id, o un texto con
           "valida" dentro- porque la respuesta no estaba definida. Ahora lo
           dice `status`. */
        const esValida = respuesta && respuesta.status === "ok";
        const documento = respuesta && respuesta.documento;

        if (esValida) {
            // El numero llega con serie (098-00000037), que es como lo exige
            // /promocion/acoplar y como hay que ensenarselo al vendedor.
            const texto = documento
                ? `Cotización ${documento} generada correctamente.`
                : "La cotización se generó correctamente.";

            await acoplarPromociones(documento);

            mostrarModalResultadoCreacion("success", "Cotización generada", texto);

            /* Vaciar solo cuando la cotización existe de verdad.
               Esto estaba en el `finally`, asi que un servidor caido o un error
               del backend borraban igual el cliente, el carrito y los pasos 2 y
               3: el vendedor perdia todo lo que acababa de armar y tenia que
               rehacerlo desde cero, justo cuando menos ganas tenia. */
            limpiarEstadoDespuesDeCreacion();
        } else {
            mostrarModalResultadoCreacion(
                "error",
                "No se pudo crear",
                (respuesta && respuesta.msg) || "El backend no confirmó la creación."
            );
        }
    } catch (err) {
        if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige

        /* El catalogo de errores del backend trae un `msg` legible; vale mas
           que un "intente nuevamente" generico, que no dice si el problema es
           del vendedor o del servidor. */
        const detalle = (err && err.datos && err.datos.msg) || null;

        mostrarModalResultadoCreacion(
            "error",
            detalle ? "No se pudo crear" : "Error de conexión",
            detalle || "No se pudo completar la solicitud. El carrito sigue intacto; vuelve a intentarlo."
        );
    } finally {
        // El boton siempre se restaura: si no, un fallo lo dejaba en "ENVIANDO..."
        boton.textContent = botonContenido;
        if (typeof actualizarBotonCreacion === "function") {
            actualizarBotonCreacion();
        }
    }
};

/**
 * Adjunta a la cotización recién creada las promociones que el vendedor aceptó.
 *
 * Hasta ahora esto no existía: el paso 3 recolectaba, evaluaba y mostraba las
 * promociones, el vendedor las "aplicaba"… y ahí se quedaban, en memoria. El
 * campo `promos` que /pegar recibía no lo leía nadie, así que **ninguna
 * promoción llegó nunca a una cotización** por esta pantalla.
 *
 * El backend confirmó el camino: una llamada a /promocion/acoplar por cada
 * promoción, con el número de documento CON SERIE que devuelve /pegar. Un
 * número suelto lo rechaza como "documento ambiguo", porque conviven la serie
 * 009- y la 098- que crea /pegar.
 *
 * Van en serie y no en paralelo a propósito: /acoplar escribe y recalcula la
 * cabecera dentro de una transacción. Dos a la vez sobre el mismo documento es
 * pedirle al ERP que resuelva una carrera.
 */
async function acoplarPromociones(documento) {
    const promos = window.promocionesAplicadas || [];
    if (!documento || !promos.length) return;

    const fallidas = [];

    for (const promo of promos) {
        try {
            const r = await CDK.http.post(CDK.rutas.api("/promocion/acoplar"), {
                ndocu: documento,
                nprom: String(promo.idprom)
            });
            if (!r || r.status !== "ok") fallidas.push(promo);
        } catch (err) {
            if (CDK.http.esError(err) && err.status === 401) throw err;
            fallidas.push(promo);
        }
    }

    /* La cotización ya existe, así que esto no es un fallo de creación: es una
       promoción que no entró. Se dice cuál, porque se puede adjuntar luego
       desde el módulo de promociones sin rehacer nada. */
    if (fallidas.length) {
        CDK.toast(
            fallidas.length === 1
                ? `La cotización se creó, pero la promoción ${fallidas[0].idprom} no se pudo adjuntar.`
                : `La cotización se creó, pero ${fallidas.length} promociones no se pudieron adjuntar.`,
            "aviso",
            0
        );
    }
}

window.actualizarBotonCreacion = actualizarBotonCreacion;
actualizarBotonCreacion();
