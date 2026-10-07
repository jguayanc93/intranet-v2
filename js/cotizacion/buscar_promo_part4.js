/* Moneda y tipo de cambio: ahora en js/cotizacion/moneda.js.
   Estaban definidos por triplicado en part2, part3 y part4; como las tres
   se cargan en la misma pagina, ganaba la ultima y editar las otras dos no
   tenia ningun efecto. Las llamadas siguen igual: moneda.js expone los
   mismos nombres en global. */

// ========================================
// PROMOCIONES - SEGMENTO 3 - PARTE 4
// ========================================

// ESTADO GLOBAL
let promocionesExitosas = []; // Almacena promociones que se cargaron correctamente
let promocionesAplicadas = []; // Promociones seleccionadas para aplicar

// ========================================
// ELEMENTOS DEL DOM - MODAL PROMOCIONES
// ========================================
const btnPromociones = document.getElementById("btn-promociones");
const modalPromociones = document.getElementById("modal-promociones");
const listaPromociones = document.getElementById("lista-promociones");
const btnCerrarPromociones = document.getElementById("btn-cerrar-promociones");
const btnCancelarPromo = document.getElementById("btn-cancelar-promo");
const btnAplicarPromo = document.getElementById("btn-aplicar-promo");
const modalBackdropPromociones = document.getElementById("modal-backdrop-promociones");
const promosLoading = document.getElementById("promos-loading");
const sinPromociones = document.getElementById("sin-promociones");
const contadorPromos = document.getElementById("contador-promos");
const promosTotal = document.getElementById("promos-totales-container");

// Elementos de totales
const promoValorVenta = document.getElementById("promo-valor-venta");
const promoMontDescuento = document.getElementById("promo-monto-descuento");
const promoTotalDescuento = document.getElementById("promo-total-descuento");
const promoMontoIgv = document.getElementById("promo-monto-igv");
const promoTotalConIgv = document.getElementById("promo-total-con-igv");
const promoAhorroTotal = document.getElementById("promo-ahorro-total");
const promoMonedasSpan = [
    document.getElementById("promo-moneda-venta"),
    document.getElementById("promo-moneda-descuento"),
    document.getElementById("promo-moneda-total-descuento"),
    document.getElementById("promo-moneda-igv"),
    document.getElementById("promo-moneda-total-igv"),
    document.getElementById("promo-moneda-ahorro")
];

// ========================================
// CONFIGURACIÓN
// ========================================

// ========================================
// FUNCIÓN: Obtener moneda y conversión
// ========================================



/* Las tres funciones que habia aqui -parseJSONResponse, normalizarDetalleLinea
   y normalizarPromoDetalle- intentaban adivinar la forma de la respuesta entre
   seis ramas distintas, porque nadie sabia cual era. Ya hay contrato escrito
   (docs/promociones.md), asi que leerlo es una sola operacion y vive en
   js/cotizacion/promociones.js, junto a las tres trampas que tiene. */

// ========================================
function abrirModalPromociones() {
    // 1) Resetear estado inicial al abrir el modal.
    //    Borrar resultados previos y mostrar el loader.
    // Solo los resultados: lo aceptado sigue en pie hasta que se acepte otra
    // cosa o cambie el carrito.
    promocionesExitosas = [];
    listaPromociones.innerHTML = "";
    promosLoading.classList.remove("hidden");
    sinPromociones.classList.add("hidden");
    promosTotal.classList.add("hidden");
    
    // 2) Mostrar modal en pantalla.
    modalPromociones.classList.remove("hidden");
    document.body.classList.add("modal-abierto");
    
    // 3) Iniciar el flujo de búsqueda de promociones.
    obtenerCodigosPromociones();
}

/**
 * Cierra el panel. NO descarta lo que el vendedor ya aceptó.
 *
 * Antes borraba las tres variables, y como el botón de aplicar termina
 * llamando aquí, lo aceptado se perdía en el mismo gesto que lo aceptaba: el
 * detalle no mostraba ninguna promoción y, peor, al crear la cotización no se
 * adjuntaba ninguna.
 *
 * Lo que sí se tira son los resultados de la consulta, que se rehace al
 * volver a abrir. Lo aceptado solo desaparece por dos vías: que el carrito
 * cambie (lo hace invalidarPromociones) o que se acepte otra cosa.
 */
function cerrarModalPromociones() {
    modalPromociones.classList.add("hidden");
    document.body.classList.remove("modal-abierto");
    promocionesExitosas = [];
}

btnPromociones.addEventListener("click", abrirModalPromociones);
btnCerrarPromociones.addEventListener("click", cerrarModalPromociones);
btnCancelarPromo.addEventListener("click", cerrarModalPromociones);
modalBackdropPromociones.addEventListener("click", cerrarModalPromociones);

/**
 * Olvida las promociones evaluadas, porque el carrito ya no es el mismo.
 *
 * Una promoción se calcula contra un carrito concreto: sus umbrales miran las
 * cantidades y los importes que había en ese momento. Si después se cambia una
 * cantidad o entra otro producto, lo evaluado deja de corresponder — y acoplar
 * eso a la cotización sería conceder un descuento que el carrito ya no gana, o
 * perder uno que ahora sí alcanzaría.
 *
 * No se recalcula solo a propósito: volver a consultar en cada cambio serían
 * dos llamadas por pulsación. Se olvida, se avisa, y el vendedor vuelve a abrir
 * promociones cuando haya terminado de armar el carrito.
 */
CDK.coti.invalidarPromociones = function (motivo) {
    const habia = promocionesAplicadas.length > 0 || promocionesExitosas.length > 0;

    promocionesExitosas = [];
    promocionesAplicadas = [];
    window.promocionesAplicadas = [];

    if (promosTotal) promosTotal.classList.add("hidden");
    if (contadorPromos) contadorPromos.textContent = "";
    if (listaPromociones) listaPromociones.innerHTML = "";

    // Y que se vayan tambien de la lista del carrito.
    if (typeof window.actualizarResumenProductos === "function") {
        window.actualizarResumenProductos();
    }

    // Solo se avisa si de verdad habia algo que perder.
    if (habia) {
        CDK.toast(
            `Se retiraron las promociones porque ${motivo || "cambió el carrito"}. ` +
            "Vuelve a consultarlas cuando termines.",
            "aviso"
        );
    }
};

/** Las promociones que el vendedor aceptó, para quien quiera mostrarlas. */
CDK.coti.promocionesAplicadas = function () {
    return promocionesAplicadas.slice();
};

// ========================================
// FUNCIÓN: Obtener códigos de promociones
// ========================================
async function obtenerCodigosPromociones() {
    // Sin productos no hay nada que recolectar.
    if (!window.productosSeleccionados || Object.keys(window.productosSeleccionados).length === 0) {
        mostrarSinPromociones();
        return;
    }

    try {
        /* El recolector solo lee `codigo` de cada producto, asi que no se le
           manda el objeto entero del carrito. Devuelve que promociones PODRIAN
           aplicar; cuales entran de verdad lo decide /detalle, una por una. */
        const respuesta = await CDK.http.post(
            CDK.rutas.api("/promocion/recolector"),
            CDK.promo.cuerpoRecolector(window.productosSeleccionados)
        );

        const codigosPromos = CDK.promo.codigos(respuesta);

        if (codigosPromos.length === 0) {
            mostrarSinPromociones();
            return;
        }

        await obtenerDetallesPromociones(codigosPromos);

    } catch (err) {
        if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige

        /* "Ningun producto del carrito tiene promocion" llega como 400, no
           como lista vacia. Es el caso mas normal que hay, asi que tratarlo
           como fallo del servidor seria alarmar por nada. */
        if (CDK.promo.esSinPromociones(err)) {
            mostrarSinPromociones();
            return;
        }

        /* Lo demas si es un fallo. Antes todo acababa en mostrarSinPromociones(),
           asi que un servidor caido, un 500 o una sesion vencida se veian igual
           que "no hay promociones": el vendedor cerraba la cotizacion convencido
           de que no habia ninguna, y se las perdia. */
        promosLoading.classList.add("hidden");
        sinPromociones.classList.add("hidden");
        promosTotal.classList.add("hidden");
        contadorPromos.textContent = "";

        CDK.estados.error(listaPromociones, err, () => {
            listaPromociones.innerHTML = "";
            promosLoading.classList.remove("hidden");
            obtenerCodigosPromociones();
        });
    }
}

// ========================================
// FUNCIÓN: Obtener detalles de cada promoción
// ========================================
/**
 * El recolector solo dice que promociones PODRIAN aplicar. Quien decide es
 * /detalle, una por una, asi que se piden todas a la vez.
 */
async function obtenerDetallesPromociones(codigosPromos) {
    promosLoading.classList.remove("hidden");
    listaPromociones.innerHTML = "";

    const resultados = await Promise.allSettled(
        codigosPromos.map((idprom) => obtenerDetallePromo(idprom))
    );

    const noAplican = [];
    let fallidas = 0;

    resultados.forEach((resultado) => {
        if (resultado.status === "rejected" || !resultado.value) {
            fallidas++;
            return;
        }
        if (resultado.value.aplica) {
            promocionesExitosas.push(resultado.value);
            mostrarPromoEnLista(resultado.value);
        } else {
            noAplican.push(resultado.value);
        }
    });

    promosLoading.classList.add("hidden");

    if (promocionesExitosas.length === 0) {
        listaPromociones.innerHTML = "";
        sinPromociones.classList.remove("hidden");
        promosTotal.classList.add("hidden");
        contadorPromos.textContent = "";

        // Aunque ninguna aplique, saber a cuanto se quedo es util.
        noAplican.forEach(mostrarNoAplicaEnLista);
        avisarFallidas(fallidas);
        return;
    }

    sinPromociones.classList.add("hidden");

    /* Las que no llegaron se muestran despues de las que si. Antes se
       descartaban en silencio, y con ellas el "faltan 7 unidades" que el
       backend ya calcula: eso es una venta a la vista, no ruido. */
    noAplican.forEach(mostrarNoAplicaEnLista);
    avisarFallidas(fallidas);

    const n = promocionesExitosas.length;
    const regalos = promocionesExitosas.reduce((suma, p) => suma + p.totalRegalos, 0);

    let texto = n === 1 ? "1 promoción disponible" : `${n} promociones disponibles`;
    if (regalos > 0) {
        texto += regalos === 1 ? " · 1 obsequio" : ` · ${regalos} obsequios`;
    }
    contadorPromos.textContent = texto;

    promosTotal.classList.remove("hidden");
    calcularTotalesPromociones();
}

/* Que una consulta falle no puede confundirse con que la promocion no aplique:
   son cosas distintas y la segunda es informacion, la primera es un problema. */
function avisarFallidas(cuantas) {
    if (cuantas > 0) {
        CDK.toast(
            cuantas === 1
                ? "No se pudo consultar una promoción. Vuelve a abrir para reintentar."
                : `No se pudieron consultar ${cuantas} promociones.`,
            "aviso"
        );
    }
}

// ========================================
// FUNCIÓN: Obtener detalle de una promoción
// ========================================
async function obtenerDetallePromo(idprom) {
    /* Los errores se dejan subir a Promise.allSettled: una promocion que falla
       no debe tumbar a las demas. El 401 ya lo gestiona CDK.http, y expirar()
       es de un solo disparo, asi que varias en paralelo no provocan varias
       redirecciones. */
    const respuesta = await CDK.http.post(
        CDK.rutas.api("/promocion/detalle"),
        CDK.promo.cuerpoDetalle(idprom, window.productosSeleccionados)
    );

    return CDK.promo.detalle(respuesta, idprom);
}

// ========================================
// FUNCIÓN: Mostrar promoción en lista
// ========================================
function mostrarPromoEnLista(promo) {
    const moneda = CDK.coti.moneda();

    const cabecera = CDK.el("div", { clase: "cdk-ficha" }, [
        CDK.el("p", { clase: "cdk-ficha__titulo", texto: promo.descripcion }),
        CDK.el("div", { clase: "cdk-ficha__datos" }, [
            CDK.el("span", { clase: "cdk-dato" }, [
                document.createTextNode("Promoción "),
                CDK.el("span", { clase: "cdk-dato__valor", texto: promo.idprom })
            ])
        ])
    ]);

    const lista = CDK.el("ul", { clase: "cdk-articulos" });

    promo.lineas.forEach((linea) => {
        const esRegalo = linea.tipo === CDK.promo.REGALO;

        /* `cantidad` del backend son las VECES que se alcanzo el umbral, no
           unidades de producto. Llamarlo "cantidad" aqui invitaba a leerlo
           como piezas. */
        const datos = [{ etiqueta: "Alcanzado", valor: linea.veces + "×" }];

        // Solo en ambito total venta.
        if (linea.acumulado !== null) {
            datos.push({ etiqueta: "Acumulado", valor: linea.acumulado });
        }
        if (linea.participantes && linea.participantes.length) {
            datos.push({ etiqueta: "Productos", valor: linea.participantes.length });
        }

        lista.appendChild(CDK.articulo({
            distintivo: esRegalo ? "Obsequio" : "Descuento",
            nombre: linea.itemdescr || promo.descripcion,
            importe: CDK.promo.textoBeneficio(linea, moneda),
            datos: datos,
            variante: esRegalo ? "obsequio" : "descuento"
        }));
    });

    listaPromociones.appendChild(CDK.el("div", { style: "margin-bottom:16px" }, [cabecera, lista]));
}

/**
 * Una promoción que existe para estos productos pero que todavía no se alcanza.
 *
 * El backend dice cuánto falta; enseñarlo convierte un "no aplica" en algo
 * accionable: el vendedor puede subir la cantidad y cerrarla.
 */
function mostrarNoAplicaEnLista(detalle) {
    const datos = [];

    if (detalle.motivo === "no_alcanza" && detalle.faltante !== null) {
        datos.push({
            etiqueta: "Faltan",
            // El valorizado se mide contra preciosinIGV, que va en dólares.
            valor: detalle.unidad === "monto"
                ? CDK.formato.moneda(detalle.faltante, "D")
                : detalle.faltante + " un.",
            tono: "alerta"
        });
    }

    listaPromociones.appendChild(CDK.articulo({
        distintivo: "No llega",
        nombre: detalle.mensaje,
        datos: datos
    }));
}

function mostrarSinPromociones() {
    promosLoading.classList.add("hidden");
    listaPromociones.innerHTML = "";
    sinPromociones.classList.remove("hidden");
    promosTotal.classList.add("hidden");
    contadorPromos.textContent = "";
}

// ========================================
// FUNCIÓN: Calcular totales de promociones
// ========================================
function calcularTotalesPromociones() {
    if (promocionesExitosas.length === 0) return;

    const moneda = CDK.coti.moneda();
    const simbolo = CDK.coti.codigoMoneda(moneda);

    // El carrito, en dolares, por el mismo calculo que usan los pasos 2 y 3.
    let valorVentaDolares = 0;
    Object.values(window.productosSeleccionados).forEach((producto) => {
        const linea = CDK.coti.calcularLinea({
            precio: producto.precioUnitario,
            cantidad: producto.cantidad,
            descuento: producto.descuento,
            tope: producto.descuentoMaximo
        });
        valorVentaDolares += linea.importe;
    });

    /* Solo las lineas de descuento suman dinero.
       Las de regalo traen UNIDADES en ese mismo campo montoDescuento, con
       monedaDescuento diciendo "D" igual: sumarlas aqui metia obsequios en el
       total como si fueran dolares. CDK.promo ya los separa en dos campos con
       nombre distinto para que no vuelva a pasar. */
    let descuentoDolares = 0;
    promocionesExitosas.forEach((promo) => {
        descuentoDolares += promo.totalDescuento;
    });

    /* Los montos del backend ya vienen SIN IGV: el motor divide entre 1.18 al
       leerlos de la base. El frontend no debe volver a dividir. */
    const valorVenta = CDK.coti.convertir(valorVentaDolares, "D");
    const descuento = CDK.coti.convertir(descuentoDolares, "D");
    const base = valorVenta - descuento;
    const igv = base * 0.18;

    promoValorVenta.textContent = valorVenta.toFixed(2);
    promoMontDescuento.textContent = descuento.toFixed(2);
    promoTotalDescuento.textContent = base.toFixed(2);
    promoMontoIgv.textContent = igv.toFixed(2);
    promoTotalConIgv.textContent = (base + igv).toFixed(2);
    promoAhorroTotal.textContent = (descuento * 1.18).toFixed(2);

    promoMonedasSpan.forEach((span) => {
        if (span) span.textContent = simbolo;
    });
}

// ========================================
// FUNCIÓN: Aplicar promociones
// ========================================
btnAplicarPromo.addEventListener("click", () => {
    // Al aplicar promociones, solo cerramos el modal y guardamos el estado actual.
    if (promocionesExitosas.length === 0) {
        CDK.toast("No hay promociones para aplicar", "aviso");
        return;
    }

    // Guardar promociones aplicadas para su uso posterior.
    promocionesAplicadas = [...promocionesExitosas];

    /* En global porque quien las usa es el paso 4, en otro archivo: al crear la
       cotizacion las adjunta una por una con /promocion/acoplar. Un `let` de
       primer nivel no queda en window, y sin esto el paso 4 no las veria. */
    window.promocionesAplicadas = promocionesAplicadas;

    // Notificar al usuario.
    CDK.toast(
        promocionesAplicadas.length === 1
            ? "Promoción aplicada"
            : `${promocionesAplicadas.length} promociones aplicadas`,
        "exito"
    );
    
    /* El carrito las muestra en su lista, asi que hay que repintarlo: si no,
       el vendedor acepta y no ve que haya cambiado nada. */
    if (typeof window.actualizarResumenProductos === "function") {
        window.actualizarResumenProductos();
    }

    // Cerrar modal y regresar al flujo principal.
    cerrarModalPromociones();

});

// ========================================
// RECALCULAR CUANDO CAMBIA MONEDA
// ========================================
const selectMoneda = document.getElementById("alm");
if (selectMoneda) {
    selectMoneda.addEventListener("change", () => {
        // Si el modal de promociones está visible y hay promociones, recalcular
        if (!modalPromociones.classList.contains("hidden") && promocionesExitosas.length > 0) {
            listaPromociones.innerHTML = "";
            promocionesExitosas.forEach((promo, index) => {
                mostrarPromoEnLista(promo, index);
            });
            calcularTotalesPromociones();
        }
    });
}
