/* Moneda y tipo de cambio: ahora en js/cotizacion/moneda.js.
   Estaban definidos por triplicado en part2, part3 y part4; como las tres
   se cargan en la misma pagina, ganaba la ultima y editar las otras dos no
   tenia ningun efecto. Las llamadas siguen igual: moneda.js expone los
   mismos nombres en global. */

// ========================================
// ESTADO GLOBAL - PRODUCTOS SELECCIONADOS
// ========================================
var productosSeleccionados = {}; // Objeto con índices numéricos: {0: {...}, 1: {...}}
let idsProductosAgregados = []; // Array para rastrear IDs únicos y evitar duplicados
let contadorProductos = 0; // Contador para índices numéricos
let productoEnEdicion = null; // Producto seleccionado para modificar

// ========================================
// ELEMENTOS DEL DOM - PASO 3
// ========================================
const listaCarrito = document.getElementById("lista-carrito");
const totalesCarrito = document.getElementById("totales-carrito");
// const btnPromociones = document.getElementById("btn-promociones");
const cantidadProductos = document.getElementById("cantidad-productos");


// MODAL EDITAR PRODUCTO
const modalEditarProducto = document.getElementById("modal-editar-producto");
const editProductoNombre = document.getElementById("edit-producto-nombre");
const editCantidad = document.getElementById("edit-cantidad");
const editDescuento = document.getElementById("edit-descuento");
const editValorVenta = document.getElementById("edit-valor-venta");
const errorEditCantidad = document.getElementById("error-edit-cantidad");
const errorEditDescuento = document.getElementById("error-edit-descuento");
const btnGuardarCambios = document.getElementById("btn-guardar-cambios");
const btnCerrarEdicion = document.getElementById("btn-cerrar-edicion");
const editCantidadMenos = document.getElementById("edit-cantidad-menos");
const editCantidadMas = document.getElementById("edit-cantidad-mas");
const editDescuentoMaximo = document.getElementById("edit-descuento-maximo");
const editMonedaVenta = document.getElementById("edit-moneda-venta");
const editAvisoPromos = document.getElementById("edit-aviso-promos");
const btnCancelarEdicion = document.getElementById("btn-cancelar-edicion");
const modalBackdropEditar = document.getElementById("modal-backdrop-editar");

// VARIABLES DE CONTROL
let indiceProductoEnEdicion = null; // indice del producto en edicion
// ========================================
// FUNCIÓN: Obtener moneda seleccionada
// ========================================


// ========================================
// FUNCIÓN: Convertir moneda
// ========================================

// ========================================
// FUNCIÓN: Agregar producto (con validación de duplicados por ID)
// ========================================
function agregarProductoSeleccionado(producto, cantidad, descuento) {
    // Validar si el producto ya existe por ID
    if (idsProductosAgregados.includes(producto.id)) {
        console.warn(`Producto con ID ${producto.id} ya existe en la lista. Se ignorará.`);
        return false;
    }

    // Guardar el producto seleccionado con índice numérico
    productosSeleccionados[contadorProductos] = {
        codigo: producto.id,
        descripcion: producto.descripcion,
        cantidad: cantidad,
        descuento: descuento,
        precioUnitario: producto.precioUnitario,
        descuentoMaximo: CDK.coti.topeDescuento(producto.descuentoMaximo),
        preciosinIGV: producto.total,
        stock1: producto.stock1,
        stock2: producto.stock2,
        // El de Piura se perdía al pasar del buscador al carrito, aunque la
        // lista sí lo mostraba.
        stock3: producto.stock3,
        stockTotal: producto.stockTotal
    };

    // Rastrear ID para evitar duplicados
    idsProductosAgregados.push(producto.id);
    contadorProductos++;

    /* Un producto mas puede hacer que una promocion alcance su umbral, o que
       la ya evaluada se quede corta. Lo calculado antes ya no vale. */
    if (CDK.coti.invalidarPromociones) {
        CDK.coti.invalidarPromociones("se agregó un producto");
    }

    // Actualizar UI
    actualizarResumenProductos();
    return true;
}

// ========================================
// FUNCIÓN: Actualizar resumen de productos
// ========================================
/**
 * Pinta el carrito en la pagina.
 *
 * Antes esto solo escribia "3 productos" y lo demas vivia detras de dos
 * paneles: para saber que se estaba vendiendo habia que abrir uno, y para
 * cambiar una linea habia que abrir el otro, elegir el producto y recien
 * entonces editar. Tres toques para lo que ahora es uno.
 */
function actualizarResumenProductos() {
    const items = Object.entries(productosSeleccionados);
    const moneda = CDK.coti.moneda();

    cantidadProductos.textContent = items.length === 1
        ? "1 producto"
        : items.length + " productos";

    if (listaCarrito) pintarLineasCarrito(items, moneda);
    if (totalesCarrito) pintarTotalesCarrito(items, moneda);

    if (typeof window.actualizarBotonCreacion === "function") {
        window.actualizarBotonCreacion();
    }
}

function pintarLineasCarrito(items, moneda) {
    listaCarrito.innerHTML = "";

    if (!items.length) {
        listaCarrito.appendChild(CDK.el("div", { clase: "cdk-estado" }, [
            CDK.el("p", { clase: "cdk-estado__texto", texto: "Todavía no hay productos." })
        ]));
        return;
    }

    const lista = CDK.el("ul", { clase: "cdk-articulos" });

    items.forEach(([indice, producto]) => {
        const linea = CDK.coti.calcularLinea({
            precio: producto.precioUnitario,
            cantidad: producto.cantidad,
            descuento: producto.descuento,
            tope: producto.descuentoMaximo
        });

        /* El codigo interno no ayuda a revisar; lo que importa es que producto
           es, cuantos van y a cuanto sale. */
        let detalle = linea.cantidad + " × " +
            CDK.formato.moneda(CDK.coti.convertir(linea.precioUnitario, "D"), moneda);
        if (linea.descuentoAplicado > 0) {
            detalle += "  ·  desc. " + linea.descuentoAplicado.toFixed(2) + "%";
        }

        lista.appendChild(CDK.articulo({
            nombre: producto.descripcion,
            detalle: detalle,
            importe: CDK.formato.moneda(CDK.coti.convertir(linea.importe, "D"), moneda),
            // La fila entera es el objetivo: en un movil se acierta mucho mejor
            // que en un enlace pequeno dentro de ella.
            alPulsar: () => abrirModalEditarProducto(indice, producto)
        }));
    });

    // Las promociones aceptadas, en la misma lista: son parte de lo que se cotiza.
    const promos = CDK.coti.promocionesAplicadas ? CDK.coti.promocionesAplicadas() : [];
    promos.forEach((promo) => {
        promo.lineas.forEach((linea) => {
            const esRegalo = linea.tipo === CDK.promo.REGALO;
            lista.appendChild(CDK.articulo({
                distintivo: esRegalo ? "Obsequio" : "Descuento",
                nombre: linea.itemdescr || promo.descripcion,
                detalle: promo.descripcion,
                importe: CDK.promo.textoBeneficio(linea, moneda),
                variante: esRegalo ? "obsequio" : "descuento"
            }));
        });
    });

    listaCarrito.appendChild(lista);
}

function pintarTotalesCarrito(items, moneda) {
    totalesCarrito.innerHTML = "";
    if (!items.length) return;

    // Todo el calculo en dolares, como el backend; se convierte al mostrar.
    let productos = 0;
    items.forEach(([, producto]) => {
        productos += CDK.coti.calcularLinea({
            precio: producto.precioUnitario,
            cantidad: producto.cantidad,
            descuento: producto.descuento,
            tope: producto.descuentoMaximo
        }).importe;
    });

    const promos = CDK.coti.promocionesAplicadas ? CDK.coti.promocionesAplicadas() : [];
    let descuentoPromo = 0;
    promos.forEach((promo) => { descuentoPromo += promo.totalDescuento; });

    const base = productos - descuentoPromo;
    const igv = base * 0.18;

    function fila(etiqueta, dolares, clase, signo) {
        return CDK.el("div", { clase: "cdk-total" + (clase ? " " + clase : "") }, [
            CDK.el("span", { clase: "cdk-total__etiqueta", texto: etiqueta }),
            CDK.el("span", { clase: "cdk-total__valor",
                texto: (signo || "") + CDK.formato.moneda(CDK.coti.convertir(dolares, "D"), moneda) })
        ]);
    }

    // El desglose de la promocion solo aparece si hay alguna que descuente.
    if (descuentoPromo > 0) {
        totalesCarrito.appendChild(fila("Productos", productos));
        totalesCarrito.appendChild(fila("Promociones", descuentoPromo, "cdk-total--bien", "−"));
    }

    totalesCarrito.appendChild(fila("Sin IGV", base));
    totalesCarrito.appendChild(fila("IGV 18 %", igv));
    totalesCarrito.appendChild(fila("Total", base + igv, "cdk-total--principal"));
}

// ========================================
// FUNCIÓN: Calcular valor de venta de un producto
// ========================================
/* calcularValorVentaProducto se retiro: el calculo vive ahora en
   CDK.coti.calcularLinea (js/cotizacion/campos.js), que ademas convierte la
   moneda y acota el descuento al tope del producto. */


// ========================================
// FUNCIÓN: Abrir modal de edición de producto
// ========================================
function abrirModalEditarProducto(indice, producto) {
    indiceProductoEnEdicion = indice;
    productoEnEdicion = producto;
    
    editProductoNombre.textContent = producto.descripcion;
    editCantidad.value = producto.cantidad;
    editDescuento.value = producto.descuento.toFixed(2);

    /* El tope a la vista, no solo cuando se pasa: saber el margen de antemano
       evita teclear un numero que va a ser rechazado. */
    const tope = CDK.coti.topeDescuento(producto.descuentoMaximo);
    if (editDescuentoMaximo) editDescuentoMaximo.textContent = tope.toFixed(2) + "%";
    if (editMonedaVenta) editMonedaVenta.textContent = CDK.coti.codigoMoneda(CDK.coti.moneda());

    /* Si hay promociones aceptadas, se avisa ANTES de tocar nada: cambiar la
       linea las retira, y enterarse despues es peor. */
    if (editAvisoPromos) {
        const hayPromos = CDK.coti.promocionesAplicadas &&
                          CDK.coti.promocionesAplicadas().length > 0;
        editAvisoPromos.classList.toggle("hidden", !hayPromos);
        if (hayPromos) {
            editAvisoPromos.textContent =
                "Si cambias la cantidad o el descuento, las promociones se retiran " +
                "y habrá que volver a consultarlas.";
        }
    }
    
    // Limpiar errores
    errorEditCantidad.classList.add("hidden");
    errorEditDescuento.classList.add("hidden");
    
    // Calcular valor de venta inicial
    recalcularValorVentaEdicion();
    
    // Mostrar modal
    modalEditarProducto.classList.remove("hidden");
    document.body.classList.add("modal-abierto");
    editCantidad.focus();
}

function cerrarModalEditarProducto() {
    modalEditarProducto.classList.add("hidden");
    document.body.classList.remove("modal-abierto");
    productoEnEdicion = null;
    indiceProductoEnEdicion = null;
}

function recalcularValorVentaEdicion() {
    if (!productoEnEdicion) return;
    
    const linea = CDK.coti.calcularLinea({
        precio: productoEnEdicion.precioUnitario,
        cantidad: editCantidad.value,
        descuento: editDescuento.value,
        tope: productoEnEdicion.descuentoMaximo
    });

    // Se muestra en la moneda elegida...
    editValorVenta.textContent = CDK.coti.convertir(linea.importe, "D").toFixed(2);
    if (editMonedaVenta) editMonedaVenta.textContent = CDK.coti.codigoMoneda(CDK.coti.moneda());

    /* ...pero se guarda en dolares, junto a un precioUnitario que tambien lo
       esta. Antes aqui se guardaba el importe ya convertido, asi que con soles
       en pantalla el objeto salia hacia el backend con los dos campos en
       monedas distintas. */
    productoEnEdicion.preciosinIGV = linea.importe;
}

editCantidad.addEventListener("input", (ev) => {
    const valor = parseInt(ev.target.value);
    
    // Validar que sea un número entero
    if (isNaN(valor) || !Number.isInteger(parseFloat(ev.target.value))) {
        errorEditCantidad.textContent = "La cantidad debe ser un número entero";
        errorEditCantidad.classList.remove("hidden");
        return;
    }
    
    // Validar rango 1-500
    if (valor < 1) {
        errorEditCantidad.textContent = "La cantidad mínima es 1";
        errorEditCantidad.classList.remove("hidden");
        ev.target.value = "1";
        recalcularValorVentaEdicion();
        return;
    }
    
    if (valor > 500) {
        errorEditCantidad.textContent = "La cantidad máxima es 500";
        errorEditCantidad.classList.remove("hidden");
        ev.target.value = "500";
        recalcularValorVentaEdicion();
        return;
    }
    
    errorEditCantidad.classList.add("hidden");
    recalcularValorVentaEdicion();
});

editDescuento.addEventListener("blur", (ev) => {
    let valor = ev.target.value.trim();
    
    if (valor === "") {
        editDescuento.value = "0.00";
        errorEditDescuento.classList.add("hidden");
        recalcularValorVentaEdicion();
        return;
    }
    
    const numeroValor = parseFloat(valor);
    const descuentoMax = CDK.coti.topeDescuento(productoEnEdicion && productoEnEdicion.descuentoMaximo);
    
    // Validar que sea un número válido
    if (isNaN(numeroValor)) {
        errorEditDescuento.textContent = "Ingrese un número válido";
        errorEditDescuento.classList.remove("hidden");
        return;
    }
    
    // Validar rango
    if (numeroValor < 0) {
        errorEditDescuento.textContent = "El descuento no puede ser negativo";
        errorEditDescuento.classList.remove("hidden");
        return;
    }
    
    if (numeroValor > descuentoMax) {
        errorEditDescuento.textContent = `El descuento máximo es ${descuentoMax.toFixed(2)}%`;
        errorEditDescuento.classList.remove("hidden");
        return;
    }
    
    editDescuento.value = numeroValor.toFixed(2);
    errorEditDescuento.classList.add("hidden");
    recalcularValorVentaEdicion();
});

// Recalcular en tiempo real mientras se escribe descuento
editDescuento.addEventListener("input", () => {
    recalcularValorVentaEdicion();
});

btnGuardarCambios.addEventListener("click", () => {
    // Validar
    errorEditCantidad.classList.add("hidden");
    errorEditDescuento.classList.add("hidden");
    
    const cantidadStr = editCantidad.value.trim();
    const descuentoStr = editDescuento.value.trim();
    
    let tieneError = false;
    
    // Validar cantidad
    const cantidad = parseInt(cantidadStr);
    if (isNaN(cantidad) || cantidadStr === "") {
        errorEditCantidad.textContent = "Cantidad es requerida";
        errorEditCantidad.classList.remove("hidden");
        tieneError = true;
    } else if (cantidad < 1 || cantidad > 500) {
        errorEditCantidad.textContent = "La cantidad debe estar entre 1 y 500";
        errorEditCantidad.classList.remove("hidden");
        tieneError = true;
    }
    
    // Validar descuento
    let descuento = 0;
    if (descuentoStr !== "") {
        descuento = parseFloat(descuentoStr);
        const descuentoMax = CDK.coti.topeDescuento(productoEnEdicion && productoEnEdicion.descuentoMaximo);

        if (isNaN(descuento)) {
            errorEditDescuento.textContent = "Descuento inválido";
            errorEditDescuento.classList.remove("hidden");
            tieneError = true;
        } else if (descuento < 0) {
            errorEditDescuento.textContent = "El descuento no puede ser negativo";
            errorEditDescuento.classList.remove("hidden");
            tieneError = true;
        } else if (descuento > descuentoMax) {
            errorEditDescuento.textContent = `El descuento máximo es ${descuentoMax.toFixed(2)}%`;
            errorEditDescuento.classList.remove("hidden");
            tieneError = true;
        }
    }
    
    if (tieneError) return;
    
    // Guardar cambios usando el índice numérico
    if (indiceProductoEnEdicion !== null && productosSeleccionados[indiceProductoEnEdicion]) {
        const linea = productosSeleccionados[indiceProductoEnEdicion];
        const cambio = linea.cantidad !== cantidad || linea.descuento !== descuento;

        linea.cantidad = cantidad;
        linea.descuento = descuento;

        /* Los umbrales miran cantidad e importe, asi que tocar cualquiera de
           los dos invalida lo que se evaluo antes. Solo si de verdad cambio:
           abrir el modal y guardar sin tocar nada no deberia costarle al
           vendedor las promociones que ya tenia. */
        if (cambio && CDK.coti.invalidarPromociones) {
            CDK.coti.invalidarPromociones("cambiaste una línea del carrito");
        }
    }
    
    // Cerrar modales
    cerrarModalEditarProducto();
    
    // Actualizar resumen
    actualizarResumenProductos();
});

btnCancelarEdicion.addEventListener("click", cerrarModalEditarProducto);
modalBackdropEditar.addEventListener("click", cerrarModalEditarProducto);
if (btnCerrarEdicion) btnCerrarEdicion.addEventListener("click", cerrarModalEditarProducto);

/* Los - y + del contador. El campo sigue siendo escribible, asi que subir de 1
   a 40 no son 39 toques; el acotado va al salir y no en cada pulsacion, porque
   "40" pasa por "4" y acotar al teclear impediria escribirlo. */
function ajustarCantidadEdicion(paso) {
    const n = parseInt(editCantidad.value, 10);
    const actual = isFinite(n) ? n : 1;
    editCantidad.value = String(Math.min(Math.max(actual + paso, 1), 500));
    editCantidad.dispatchEvent(new Event("input", { bubbles: true }));
}

if (editCantidadMenos) editCantidadMenos.addEventListener("click", () => ajustarCantidadEdicion(-1));
if (editCantidadMas) editCantidadMas.addEventListener("click", () => ajustarCantidadEdicion(1));

// ========================================
// BOTÓN PROMOCIONES - Conectado a buscar_promo_part4.js
// ========================================
// El evento está manejado en buscar_promo_part4.js
// No agregar evento aquí para evitar conflictos

// ========================================
// INTEGRACIÓN CON BÚSQUEDA DE PRODUCTOS
// ========================================
// El paso 2 confirma el producto y lo entrega por aquí.
//
// Antes esto era un monkey-patch sobre window.agregarProductoAlCarrito: el
// paso 2 definía esa función, este archivo la envolvía y llamaba también a la
// original. La original intentaba usar tblprd2(), que vive en
// identificar_producto.js, un script que esta página tiene comentado. Es decir,
// media función que no hacía nada y nadie lo notaba.
//
// Ahora el enganche es explícito y el paso 2 comprueba que exista antes de
// usarlo: si este archivo no carga, el usuario ve un error en vez de perder el
// producto en silencio.
//
// Devuelve false si el producto ya estaba en el carrito.
CDK.coti.agregarAlCarrito = agregarProductoSeleccionado;

/* En global porque el paso 4 lo llama desde otro archivo: al aceptar o retirar
   promociones hay que repintar el carrito, que ahora las muestra en su lista.
   Funciona ya por ser declaracion de primer nivel, pero escribirlo deja la
   dependencia a la vista en vez de confiarla al azar del ambito. */
window.actualizarResumenProductos = actualizarResumenProductos;

/* Para que el buscador marque lo que ya esta dentro en vez de dejar que el
   vendedor lo vuelva a elegir y se lleve un aviso.
   Se lee de productosSeleccionados y no de idsProductosAgregados porque el
   objeto es la fuente real: si algun dia se puede quitar del carrito, el
   array de ids podria quedarse desfasado y este quedaria correcto igual. */
CDK.coti.enCarrito = function (codigo) {
    if (!codigo) return false;

    return Object.keys(productosSeleccionados).some(function (i) {
        return productosSeleccionados[i] && productosSeleccionados[i].codigo === codigo;
    });
};

// Inicializar
actualizarResumenProductos();

// ========================================
// FUNCIÓN: Reiniciar estado
// ========================================
function reiniciarSegmento3() {
    productosSeleccionados = {};
    idsProductosAgregados = [];
    contadorProductos = 0;
    productoEnEdicion = null;
    indiceProductoEnEdicion = null;
    actualizarResumenProductos();
}
