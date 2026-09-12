// ========================================
// ESTADO GLOBAL
// ========================================
let productoSeleccionadoParaConfirmar = null;
let timeoutBusquedaProducto = null;

// ========================================
// ELEMENTOS DEL DOM - PASO 2
// ========================================
const paso3 = document.getElementById("paso3");
const btnBuscarProducto = document.getElementById("btn-buscar-producto");
const btnBuscarVoz = document.getElementById("btn-buscar-voz");
const estadoVoz = document.getElementById("estado-voz");
const modalBusquedaProducto = document.getElementById("modal-busqueda-producto");
const tipoBusquedaProducto = document.getElementById("tipo-busqueda-producto");
const inputBusquedaProducto = document.getElementById("input-busqueda-producto");
const btnCerrarBusquedaProducto = document.getElementById("btn-cerrar-busqueda-producto");
const btnCancelarBusquedaProducto = document.getElementById("btn-cancelar-busqueda-producto");
const btnLimpiarBusquedaProducto = document.getElementById("btn-limpiar-busqueda-producto");
const recorrerProductos = document.getElementById("recorrer-productos");
const modalBackdropProducto = document.getElementById("modal-backdrop-producto");
const indicadorBusquedaProducto = document.getElementById("indicador-busqueda-producto");
const busquedaProductoLoading = document.getElementById("busqueda-producto-loading");
const sinResultadosProducto = document.getElementById("sin-resultados-producto");

// ELEMENTOS DEL DOM - MODAL CONFIRMACIÓN
const modalConfirmacionProducto = document.getElementById("modal-confirmacion-producto");
const confProductoDescripcion = document.getElementById("conf-producto-descripcion");
const confProductoStock1 = document.getElementById("conf-producto-stock1");
const confProductoStock2 = document.getElementById("conf-producto-stock2");
const confDescuentoMaximo = document.getElementById("conf-descuento-maximo");
const confPrecioUnitario = document.getElementById("conf-precio-unitario");
const confMonedaPrecio = document.getElementById("conf-moneda-precio");
const confValorVenta = document.getElementById("conf-valor-venta");
const confMonedaVenta = document.getElementById("conf-moneda-venta");
const confCantidad = document.getElementById("conf-cantidad");
const confDescuento = document.getElementById("conf-descuento");
const errorCantidad = document.getElementById("error-cantidad");
const errorDescuento = document.getElementById("error-descuento");
const btnConfirmarProducto = document.getElementById("btn-confirmar-producto");
const btnCancelarConfirmacionProducto = document.getElementById("btn-cancelar-confirmacion-producto");
const modalBackdropConfirmacion = document.getElementById("modal-backdrop-confirmacion");

// ========================================
// FUNCIÓN DE CONVERSIÓN DE MONEDA
// ========================================
const tipoCambioUSDPEN = 3.408; // Tasa de cambio fija (ajustable según necesidad)

function obtenerMonedaSeleccionada() {
    const selectMoneda = document.getElementById("alm");
    return selectMoneda ? selectMoneda.value : "D";
}

function obtenerSímboloMoneda(monedaId) {
    return monedaId === "D" ? "USD" : "PEN";
}

function convertirMoneda(monto, monedaOrigen) {
    const monedaActual = obtenerMonedaSeleccionada();
    
    // Si la moneda origen es la misma que la actual, no convertir
    if (monedaOrigen === monedaActual) {
        return monto;
    }
    
    // Si viene en USD y necesita convertir a PEN
    if (monedaOrigen === "D" && monedaActual === "S") {
        return monto * tipoCambioUSDPEN;
    }
    
    // Si viene en PEN y necesita convertir a USD
    if (monedaOrigen === "S" && monedaActual === "D") {
        return monto / tipoCambioUSDPEN;
    }
    
    return monto;
}

// ========================================
// CALCULAR VALOR DE VENTA
// ========================================
function calcularValorVenta() {
    if (!productoSeleccionadoParaConfirmar) return;
    
    const precioUnitario = productoSeleccionadoParaConfirmar.precioUnitario;
    const cantidad = parseInt(confCantidad.value) || 0;
    const descuento = parseFloat(confDescuento.value) || 0;
    
    // Calcular valor sin descuento
    const valorSinDescuento = precioUnitario * cantidad;
    
    // Calcular descuento aplicado
    const montoDescuento = valorSinDescuento * (descuento / 100);
    
    // Calcular valor final
    const valorFinal = valorSinDescuento - montoDescuento;
    
    // Mostrar valor de venta formateado a 2 decimales
    confValorVenta.textContent = valorFinal.toFixed(2);
    // Guardando el valor del monto total con descuento para usarlo despues
    productoSeleccionadoParaConfirmar["total"] = Number(valorFinal.toFixed(2));
}

// ========================================
// ACTUALIZAR ESTADO DEL BOTÓN CONFIRMAR
// ========================================
function actualizarEstadoBotón() {
    if (!productoSeleccionadoParaConfirmar) return;
    
    const descuento = parseFloat(confDescuento.value) || 0;
    const descuentoMax = productoSeleccionadoParaConfirmar.descuentoMaximo;
    const cantidad = parseInt(confCantidad.value) || 0;
    
    // Desabilitar si: descuento > máximo O cantidad < 1 O cantidad > 500
    const debeDesabilitar = descuento > descuentoMax || cantidad < 1 || cantidad > 500;
    
    btnConfirmarProducto.disabled = debeDesabilitar;
}

// ========================================
// RECALCULAR PRECIOS CUANDO SE CAMBIA MONEDA
// ========================================
function recalcularPreciosConMoneda() {
    // Solo recalcular si hay un producto seleccionado y el modal está visible
    if (!productoSeleccionadoParaConfirmar || modalConfirmacionProducto.classList.contains("hidden")) {
        return;
    }
    
    const monedaActual = obtenerMonedaSeleccionada();
    const monedaActualSimbolo = obtenerSímboloMoneda(monedaActual);
    
    // Convertir precio unitario a la moneda actual
    const precioConvertido = convertirMoneda(productoSeleccionadoParaConfirmar.precioUnitario, "D");
    
    // Actualizar símbolos y precio unitario
    confPrecioUnitario.textContent = precioConvertido.toFixed(2);
    confMonedaPrecio.textContent = monedaActualSimbolo;
    confMonedaVenta.textContent = monedaActualSimbolo;
    
    // Recalcular valor de venta
    calcularValorVenta();
}

// ========================================
btnBuscarProducto.addEventListener("click", () => {
    abrirModalBusquedaProducto();
});

function abrirModalBusquedaProducto() {
    modalBusquedaProducto.classList.remove("hidden");
    document.body.classList.add("modal-abierto");
    inputBusquedaProducto.focus();
    limpiarBusquedaProducto();
}

// ========================================
// CERRAR MODAL DE BÚSQUEDA DE PRODUCTOS
// ========================================
function cerrarModalBusquedaProducto() {
    modalBusquedaProducto.classList.add("hidden");
    document.body.classList.remove("modal-abierto");
    recorrerProductos.innerHTML = "";
    inputBusquedaProducto.value = "";
    btnLimpiarBusquedaProducto.classList.add("hidden");
}

btnCerrarBusquedaProducto.addEventListener("click", cerrarModalBusquedaProducto);
btnCancelarBusquedaProducto.addEventListener("click", cerrarModalBusquedaProducto);
modalBackdropProducto.addEventListener("click", cerrarModalBusquedaProducto);

// ========================================
// CAMBIO DE TIPO DE BÚSQUEDA
// ========================================
tipoBusquedaProducto.addEventListener("change", () => {
    inputBusquedaProducto.value = "";
    inputBusquedaProducto.focus();
    recorrerProductos.innerHTML = "";
    sinResultadosProducto.classList.add("hidden");
    busquedaProductoLoading.classList.add("hidden");
    indicadorBusquedaProducto.classList.add("hidden");
    btnLimpiarBusquedaProducto.classList.add("hidden");
});

// ========================================
// INPUT DE BÚSQUEDA DE PRODUCTOS
// ========================================
inputBusquedaProducto.addEventListener("input", (ev) => {
    const busqueda = ev.target.value.trim();
    
    // Mostrar/ocultar botón limpiar
    if (busqueda.length > 0) {
        btnLimpiarBusquedaProducto.classList.remove("hidden");
    } else {
        btnLimpiarBusquedaProducto.classList.add("hidden");
    }

    // Limpiar timeout anterior
    clearTimeout(timeoutBusquedaProducto);
    recorrerProductos.innerHTML = "";
    sinResultadosProducto.classList.add("hidden");
    busquedaProductoLoading.classList.add("hidden");

    // Si es menor a 3 caracteres
    if (busqueda.length < 3) {
        if (busqueda.length > 0) {
            indicadorBusquedaProducto.classList.remove("hidden");
        } else {
            indicadorBusquedaProducto.classList.add("hidden");
        }
        return;
    }

    // Ocultar indicador y mostrar loading
    indicadorBusquedaProducto.classList.add("hidden");
    busquedaProductoLoading.classList.remove("hidden");

    // Buscar después de 400ms (debounce)
    timeoutBusquedaProducto = setTimeout(() => {
        buscar_producto_nuevo(busqueda);
    }, 400);
});

// ========================================
// BOTÓN LIMPIAR BÚSQUEDA DE PRODUCTOS
// ========================================
btnLimpiarBusquedaProducto.addEventListener("click", (ev) => {
    ev.stopPropagation();
    limpiarBusquedaProducto();
});

function limpiarBusquedaProducto() {
    inputBusquedaProducto.value = "";
    btnLimpiarBusquedaProducto.classList.add("hidden");
    recorrerProductos.innerHTML = "";
    indicadorBusquedaProducto.classList.add("hidden");
    busquedaProductoLoading.classList.add("hidden");
    sinResultadosProducto.classList.add("hidden");
    inputBusquedaProducto.focus();
}

// ========================================
// BUSCAR PRODUCTOS (nueva función)
// ========================================
async function buscar_producto_nuevo(descprod) {
    let dataenviar = new Object();
    dataenviar.letra = cliente_data[5];
    dataenviar.sugerencia = descprod;
    dataenviar.tipbusq = tipoBusquedaProducto.value;
    let fetchobj = new Object();
    fetchobj.method = "POST";
    fetchobj.headers = { "Content-Type": "application/json" };
    fetchobj.mode = "cors";
    fetchobj.credentials = "include";
    fetchobj.body = JSON.stringify(dataenviar);

    try {
        let paso1 = await fetch(rutaproductobuscar, fetchobj);
        let paso2 = await paso1.json();
        let paso3 = await JSON.parse(paso2);
        
        mostrarSugerenciasProductos(paso3);
    } catch (err) {
        console.log(err);
        busquedaProductoLoading.classList.add("hidden");
        sinResultadosProducto.classList.remove("hidden");
    }
}

// ========================================
// MOSTRAR SUGERENCIAS DE PRODUCTOS
// ========================================
function mostrarSugerenciasProductos(productos) {
    console.log("Productos encontrados:", productos);
    busquedaProductoLoading.classList.add("hidden");
    recorrerProductos.innerHTML = "";

    if (!productos || Object.keys(productos).length === 0) {
        sinResultadosProducto.classList.remove("hidden");
        return;
    }

    Object.values(productos).forEach((producto) => {
        // producto[0] = ID
        // producto[1] = Descripción
        // producto[2] = Stock Principal
        // producto[3] = Stock Secundario
        // producto[4] = Descuento máximo (si viene en los datos)
        
        const contenedor = document.createElement("div");
        contenedor.className = "p-3 border border-gray-200 rounded-lg cursor-pointer transition-colors hover:bg-green-50 active:bg-green-100";
        
        const nombre = document.createElement("p");
        nombre.className = "font-medium text-gray-900 text-sm";
        nombre.textContent = producto[1]; // descripción
        
        const stockContainer = document.createElement("div");
        stockContainer.className = "grid grid-cols-2 gap-2 mt-2 text-xs";
        
        const stock1 = document.createElement("p");
        stock1.className = "text-gray-600";
        stock1.innerHTML = `<span class="font-semibold text-blue-600">${producto[2]}</span> Princ.`;
        
        const stock2 = document.createElement("p");
        stock2.className = "text-gray-600";
        stock2.innerHTML = `<span class="font-semibold text-blue-600">${producto[3]}</span> MYM.`;
        /////revisar parte de inclusion de alm piura
        const stock3 = document.createElement("p");
        stock2.className = "text-gray-600";
        stock2.innerHTML = `<span class="font-semibold text-blue-600">${producto[6]}</span> Piura.`;
        
        stockContainer.appendChild(stock1);
        stockContainer.appendChild(stock2);
        stockContainer.appendChild(stock3);
        
        contenedor.appendChild(nombre);
        contenedor.appendChild(stockContainer);
        
        contenedor.addEventListener("click", () => {
            seleccionarProducto(producto);
        });
        
        recorrerProductos.appendChild(contenedor);
    });
}

// ========================================
// SELECCIONAR PRODUCTO
// ========================================
function seleccionarProducto(producto) {
    productoSeleccionadoParaConfirmar = {
        id: producto[0],
        descripcion: producto[1],
        stock1: producto[2],
        stock2: producto[3],
        descuentoMaximo: producto[4] || 0, // descuento máximo del backend
        precioUnitario: parseFloat(producto[5]) || 0 // precio unitario del backend (posición 5)
    };
    
    // Cerrar modal de búsqueda
    cerrarModalBusquedaProducto();
    
    // Mostrar modal de confirmación
    mostrarModalConfirmacionProducto();
}

// ========================================
// MODAL DE CONFIRMACIÓN DE PRODUCTO
// ========================================
function mostrarModalConfirmacionProducto() {
    const prod = productoSeleccionadoParaConfirmar;
    const monedaActual = obtenerMonedaSeleccionada();
    const monedaActualSimbolo = obtenerSímboloMoneda(monedaActual);
    
    // Convertir precio unitario a la moneda actual (el precio viene en USD)
    const precioConvertido = convertirMoneda(prod.precioUnitario, "D"); // Asumimos que viene en USD
    
    // Llenar datos del producto
    confProductoDescripcion.textContent = prod.descripcion;
    confProductoStock1.textContent = prod.stock1;
    confProductoStock2.textContent = prod.stock2;
    confDescuentoMaximo.textContent = `${prod.descuentoMaximo.toFixed(2)}%`;
    confPrecioUnitario.textContent = precioConvertido.toFixed(2);
    confMonedaPrecio.textContent = monedaActualSimbolo;
    confMonedaVenta.textContent = monedaActualSimbolo;
    
    // Reset de campos
    confCantidad.value = "1";
    confDescuento.value = "0.00";
    errorCantidad.classList.add("hidden");
    errorDescuento.classList.add("hidden");
    
    // Calcular valor de venta inicial
    calcularValorVenta();
    
    // Actualizar estado del botón
    actualizarEstadoBotón();
    
    // Mostrar modal
    modalConfirmacionProducto.classList.remove("hidden");
    document.body.classList.add("modal-abierto");
    confCantidad.focus();
}

// ========================================
// CERRAR MODAL DE CONFIRMACIÓN
// ========================================
function cerrarModalConfirmacionProducto() {
    modalConfirmacionProducto.classList.add("hidden");
    document.body.classList.remove("modal-abierto");
    productoSeleccionadoParaConfirmar = null;
}

btnCancelarConfirmacionProducto.addEventListener("click", cerrarModalConfirmacionProducto);
modalBackdropConfirmacion.addEventListener("click", cerrarModalConfirmacionProducto);

// ========================================
// VALIDACIÓN DE CANTIDAD
// ========================================
confCantidad.addEventListener("input", (ev) => {
    const valor = parseInt(ev.target.value);
    
    // Validar que sea un número entero
    if (isNaN(valor) || !Number.isInteger(parseFloat(ev.target.value))) {
        errorCantidad.textContent = "La cantidad debe ser un número entero";
        errorCantidad.classList.remove("hidden");
        return;
    }
    
    // Validar rango 1-500
    if (valor < 1) {
        errorCantidad.textContent = "La cantidad mínima es 1";
        errorCantidad.classList.remove("hidden");
        ev.target.value = "1";
        calcularValorVenta();
        actualizarEstadoBotón();
        return;
    }
    
    if (valor > 500) {
        errorCantidad.textContent = "La cantidad máxima es 500";
        errorCantidad.classList.remove("hidden");
        ev.target.value = "500";
        calcularValorVenta();
        actualizarEstadoBotón();
        return;
    }
    
    errorCantidad.classList.add("hidden");
    // Recalcular valor de venta y actualizar estado del botón
    calcularValorVenta();
    actualizarEstadoBotón();
});

// ========================================
// VALIDACIÓN DE DESCUENTO
// ========================================
confDescuento.addEventListener("blur", (ev) => {
    let valor = ev.target.value.trim();
    
    // Si está vacío, asumir 0
    if (valor === "") {
        confDescuento.value = "0.00";
        errorDescuento.classList.add("hidden");
        calcularValorVenta();
        actualizarEstadoBotón();
        return;
    }
    
    const numeroValor = parseFloat(valor);
    const descuentoMax = productoSeleccionadoParaConfirmar.descuentoMaximo;
    
    // Validar que sea un número válido
    if (isNaN(numeroValor)) {
        errorDescuento.textContent = "Ingrese un número válido";
        errorDescuento.classList.remove("hidden");
        confDescuento.value = "0.00";
        calcularValorVenta();
        actualizarEstadoBotón();
        return;
    }
    
    // Validar rango
    if (numeroValor < 0) {
        errorDescuento.textContent = "El descuento no puede ser negativo";
        errorDescuento.classList.remove("hidden");
        confDescuento.value = "0.00";
        calcularValorVenta();
        actualizarEstadoBotón();
        return;
    }
    
    if (numeroValor > descuentoMax) {
        errorDescuento.innerHTML = `El descuento máximo permitido es <strong>${descuentoMax.toFixed(2)}%</strong>`;
        errorDescuento.classList.remove("hidden");
        confDescuento.value = descuentoMax.toFixed(2);
        calcularValorVenta();
        actualizarEstadoBotón();
        return;
    }
    
    // Si todo es válido, formatear a 2 decimales
    confDescuento.value = numeroValor.toFixed(2);
    errorDescuento.classList.add("hidden");
    calcularValorVenta();
    actualizarEstadoBotón();
});

// Validar mientras escribe para feedback inmediato
confDescuento.addEventListener("input", (ev) => {
    let valor = ev.target.value;
    const descuentoMax = productoSeleccionadoParaConfirmar ? productoSeleccionadoParaConfirmar.descuentoMaximo : 100;
    
    // Solo validar el formato mientras escribe
    if (valor === "" || valor === "-") {
        calcularValorVenta();
        actualizarEstadoBotón();
        return;
    }
    
    const numeroValor = parseFloat(valor);
    
    // Mostrar advertencia si excede el máximo (pero permitir escribir)
    if (!isNaN(numeroValor) && numeroValor > descuentoMax) {
        errorDescuento.innerHTML = `⚠️ Excede máximo de ${descuentoMax.toFixed(2)}%`;
        errorDescuento.classList.remove("hidden");
    } else {
        errorDescuento.classList.add("hidden");
    }
    
    // Recalcular valor de venta en tiempo real
    if (!isNaN(numeroValor)) {
        calcularValorVenta();
        actualizarEstadoBotón();
    }
});

// ========================================
// CONFIRMAR PRODUCTO
// ========================================
btnConfirmarProducto.addEventListener("click", () => {
    // Limpiar errores previos
    errorCantidad.classList.add("hidden");
    errorDescuento.classList.add("hidden");
    
    const cantidadStr = confCantidad.value.trim();
    const descuentoStr = confDescuento.value.trim();
    const prod = productoSeleccionadoParaConfirmar;
    
    let tieneError = false;
    
    // Validar cantidad
    const cantidad = parseInt(cantidadStr);
    if (isNaN(cantidadStr) || cantidadStr === "") {
        errorCantidad.textContent = "Ingrese una cantidad";
        errorCantidad.classList.remove("hidden");
        tieneError = true;
    } else if (cantidad < 1) {
        errorCantidad.textContent = "La cantidad mínima es 1";
        errorCantidad.classList.remove("hidden");
        tieneError = true;
    } else if (cantidad > 500) {
        errorCantidad.textContent = "La cantidad máxima es 500";
        errorCantidad.classList.remove("hidden");
        tieneError = true;
    } else if (!Number.isInteger(cantidad)) {
        errorCantidad.textContent = "La cantidad debe ser un número entero";
        errorCantidad.classList.remove("hidden");
        tieneError = true;
    }
    
    // Validar descuento
    let descuento = 0;
    if (descuentoStr !== "") {
        descuento = parseFloat(descuentoStr);
        if (isNaN(descuento)) {
            errorDescuento.textContent = "Ingrese un número válido";
            errorDescuento.classList.remove("hidden");
            tieneError = true;
        } else if (descuento < 0) {
            errorDescuento.textContent = "El descuento no puede ser negativo";
            errorDescuento.classList.remove("hidden");
            tieneError = true;
        } else if (descuento > prod.descuentoMaximo) {
            errorDescuento.innerHTML = `El descuento máximo permitido es <strong>${prod.descuentoMaximo.toFixed(2)}%</strong>`;
            errorDescuento.classList.remove("hidden");
            tieneError = true;
        }
    }
    
    // Si hay errores, no continuar
    if (tieneError) {
        return;
    }
    
    // Todo válido - agregar al carrito
    agregarProductoAlCarrito(prod, cantidad, descuento);
    
    // Cerrar modal
    cerrarModalConfirmacionProducto();
    
    // Mostrar Paso 3 y scroll
    const paso3 = document.getElementById("paso3");
    paso3.classList.remove("hidden");
    setTimeout(() => {
        paso3.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
});

// ========================================
// AGREGAR AL CARRITO
// ========================================
function agregarProductoAlCarrito(producto, cantidad, descuento) {
    // Crear un objeto con los datos del producto para el carrito
    const datoProducto = {
        id: producto.id,
        descripcion: producto.descripcion,
        cantidad: cantidad,
        descuento: descuento,
        stock1: producto.stock1,
        stock2: producto.stock2
    };
    
    // Guardar datos en variable global para que tblprd2 pueda acceder
    window.productoConfirmado = datoProducto;
    
    // Llamar a tblprd2 si existe (función que agrega al carrito)
    if (typeof tblprd2 !== "undefined") {
        // tblprd2 espera (codi, cantidad)
        // El descuento debe manejarse aparte
        tblprd2(producto.id, cantidad);
    } else if (typeof agregarCarrito !== "undefined") {
        // Alternativa si hay otra función de carrito
        agregarCarrito(datoProducto);
    }
}

// ========================================
// BOTÓN BÚSQUEDA POR VOZ (UI only)
// ========================================
let escuchandoVoz = false;

btnBuscarVoz.addEventListener("mousedown", () => {
    escuchandoVoz = true;
    estadoVoz.textContent = "Escuchando...";
    estadoVoz.classList.add("opacity-100");
});

btnBuscarVoz.addEventListener("mouseup", () => {
    escuchandoVoz = false;
    estadoVoz.textContent = "Comenzar a escuchar";
    estadoVoz.classList.remove("opacity-100");
});

btnBuscarVoz.addEventListener("mouseleave", () => {
    if (escuchandoVoz) {
        escuchandoVoz = false;
        estadoVoz.textContent = "Comenzar a escuchar";
        estadoVoz.classList.remove("opacity-100");
    }
});

// Para mobile: touch events
btnBuscarVoz.addEventListener("touchstart", () => {
    escuchandoVoz = true;
    estadoVoz.textContent = "Escuchando...";
    estadoVoz.classList.add("opacity-100");
});

btnBuscarVoz.addEventListener("touchend", () => {
    escuchandoVoz = false;
    estadoVoz.textContent = "Comenzar a escuchar";
    estadoVoz.classList.remove("opacity-100");
});