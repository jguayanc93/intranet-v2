/* Moneda y tipo de cambio: ahora en js/cotizacion/moneda.js.
   Estaban definidos por triplicado en part2, part3 y part4; como las tres
   se cargan en la misma pagina, ganaba la ultima y editar las otras dos no
   tenia ningun efecto. Las llamadas siguen igual: moneda.js expone los
   mismos nombres en global. */

// ========================================
// ESTADO DEL PASO 2
// ========================================
let timeoutBusquedaProducto = null;
let busquedaProductoEnVuelo = null;   // AbortController de la busqueda en curso

/* Resultados de la ultima busqueda, en crudo. Se guardan porque la lista se
   repinta sola: al abrir una fila, al agregar y al cambiar de moneda. */
let productosEncontrados = [];
let terminoBusqueda = "";

/* La fila abierta y lo que lleva tecleado. Vive aqui y no dentro de la fila
   para que un repintado no borre la cantidad a medio escribir. */
let edicion = { codigo: null, cantidad: 1, descuento: 0 };

/* Cuantos van en esta pasada. El panel ya no se cierra al agregar, asi que
   sin esto no habria ninguna señal de que el producto entro. */
let agregadosEnSesion = 0;

// ========================================
// ELEMENTOS DEL DOM - PASO 2
// ========================================
const paso3 = document.getElementById("paso3");
const btnBuscarProducto = document.getElementById("btn-buscar-producto");
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
const conteoAgregados = document.getElementById("conteo-agregados");

// ========================================
// CAMBIO DE MONEDA
// ========================================
/* La llama moneda.js. Repinta la lista para que los precios de cada fila y el
   importe de la que este abierta queden en la moneda elegida; `edicion`
   conserva lo que el vendedor llevaba tecleado. */
function recalcularPreciosConMoneda() {
    if (productosEncontrados.length) pintarResultados();
}

// ========================================
btnBuscarProducto.addEventListener("click", () => {
    abrirModalBusquedaProducto();
});

function abrirModalBusquedaProducto() {
    modalBusquedaProducto.classList.remove("hidden");
    document.body.classList.add("cdk-sin-scroll");
    inputBusquedaProducto.focus();
    limpiarBusquedaProducto();
}

// ========================================
// CERRAR MODAL DE BÚSQUEDA DE PRODUCTOS
// ========================================
function cerrarModalBusquedaProducto() {
    // Se mira antes de limpiar, que es lo que decide si hay que bajar al paso 3.
    const hubo = agregadosEnSesion > 0;

    modalBusquedaProducto.classList.add("hidden");
    document.body.classList.remove("cdk-sin-scroll");
    recorrerProductos.innerHTML = "";
    inputBusquedaProducto.value = "";
    btnLimpiarBusquedaProducto.classList.add("hidden");

    productosEncontrados = [];
    terminoBusqueda = "";
    cerrarFila();
    agregadosEnSesion = 0;
    actualizarConteo();

    /* Cerrar el buscador es haber terminado de elegir, asi que se lleva al
       vendedor a lo que acaba de armar. Antes esto pasaba en cada producto,
       una vez por linea. */
    if (hubo) {
        paso3.classList.remove("hidden");
        setTimeout(() => {
            paso3.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 150);
    }
}

btnCerrarBusquedaProducto.addEventListener("click", cerrarModalBusquedaProducto);
btnCancelarBusquedaProducto.addEventListener("click", cerrarModalBusquedaProducto);
modalBackdropProducto.addEventListener("click", cerrarModalBusquedaProducto);

// ========================================
// CAMBIO DE TIPO DE BÚSQUEDA
// ========================================
/* Habia dos manejadores para este mismo evento: el primero borraba el texto y
   el segundo intentaba rebuscarlo, asi que leia siempre una cadena vacia y la
   rebusqueda no llegaba a ejecutarse nunca. Ahora es uno solo y conserva lo
   escrito: cambiar de descripcion a part number no deberia obligar a teclear
   de nuevo. */
tipoBusquedaProducto.addEventListener("change", () => {
    const texto = inputBusquedaProducto.value.trim();

    cancelarBusquedaProducto();
    recorrerProductos.innerHTML = "";
    productosEncontrados = [];
    cerrarFila();
    sinResultadosProducto.classList.add("hidden");
    indicadorBusquedaProducto.classList.add("hidden");

    if (texto.length < 3) {
        busquedaProductoLoading.classList.add("hidden");
        indicadorBusquedaProducto.classList.toggle("hidden", texto.length === 0);
        inputBusquedaProducto.focus();
        return;
    }

    busquedaProductoLoading.classList.remove("hidden");
    buscar_producto_nuevo(texto);
});

// ========================================
// INPUT DE BÚSQUEDA DE PRODUCTOS
// ========================================
inputBusquedaProducto.addEventListener("input", (ev) => {
    const busqueda = ev.target.value.trim();

    btnLimpiarBusquedaProducto.classList.toggle("hidden", busqueda.length === 0);

    cancelarBusquedaProducto();
    recorrerProductos.innerHTML = "";
    productosEncontrados = [];
    cerrarFila();
    sinResultadosProducto.classList.add("hidden");
    busquedaProductoLoading.classList.add("hidden");

    if (busqueda.length < 3) {
        indicadorBusquedaProducto.classList.toggle("hidden", busqueda.length === 0);
        return;
    }

    indicadorBusquedaProducto.classList.add("hidden");
    busquedaProductoLoading.classList.remove("hidden");

    timeoutBusquedaProducto = setTimeout(() => {
        buscar_producto_nuevo(busqueda);
    }, 400);
});

/* Cancela lo que este en vuelo. Sin esto, dos busquedas seguidas podian
   cruzarse: si la respuesta de "t6" llegaba despues que la de "t664", la
   lista acababa mostrando resultados que no correspondian a lo escrito. */
function cancelarBusquedaProducto() {
    clearTimeout(timeoutBusquedaProducto);
    if (busquedaProductoEnVuelo) {
        busquedaProductoEnVuelo.abort();
        busquedaProductoEnVuelo = null;
    }
}

// ========================================
// BOTÓN LIMPIAR BÚSQUEDA DE PRODUCTOS
// ========================================
btnLimpiarBusquedaProducto.addEventListener("click", (ev) => {
    ev.stopPropagation();
    limpiarBusquedaProducto();
});

function limpiarBusquedaProducto() {
    cancelarBusquedaProducto();
    productosEncontrados = [];
    terminoBusqueda = "";
    cerrarFila();
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
function buscar_producto_nuevo(descprod) {
    /* La letra del cliente decide QUE PRECIO devuelve el backend. Sin ella la
       busqueda traeria precios que no corresponden a este cliente, asi que es
       preferible parar y decirlo. */
    const letra = Array.isArray(cliente_data) ? cliente_data[5] : null;
    if (!letra) {
        busquedaProductoLoading.classList.add("hidden");
        CDK.toast("Vuelve a elegir el cliente: faltan sus datos de precio", "error", 0);
        return;
    }

    const control = new AbortController();
    busquedaProductoEnVuelo = control;

    CDK.http.post(CDK.rutas.api("/producto/buscar"), {
        letra: letra,
        sugerencia: descprod,
        tipbusq: tipoBusquedaProducto.value
    }, { senal: control.signal })
        .then((respuesta) => {
            if (control.signal.aborted) return;
            busquedaProductoEnVuelo = null;
            mostrarSugerenciasProductos(respuesta, descprod);
        })
        .catch((err) => {
            /* Se comprueba ESTE controlador: una busqueda cancelada al seguir
               tecleando no es un error que mostrar, pero un fallo al pintar si.
               Antes el catch enseñaba "sin resultados" para todo, asi que un
               servidor caido parecia un producto inexistente. */
            if (control.signal.aborted) return;
            busquedaProductoEnVuelo = null;

            busquedaProductoLoading.classList.add("hidden");
            if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige

            CDK.estados.error(recorrerProductos, err, () => {
                recorrerProductos.innerHTML = "";
                busquedaProductoLoading.classList.remove("hidden");
                buscar_producto_nuevo(descprod);
            });
        });
}

// ========================================
// MOSTRAR SUGERENCIAS DE PRODUCTOS
// ========================================
function mostrarSugerenciasProductos(productos, termino) {
    busquedaProductoLoading.classList.add("hidden");

    productosEncontrados = Object.keys(productos || {}).map((k) => productos[k]);
    terminoBusqueda = termino || "";
    cerrarFila();

    if (!productosEncontrados.length) {
        recorrerProductos.innerHTML = "";
        sinResultadosProducto.classList.remove("hidden");
        return;
    }

    sinResultadosProducto.classList.add("hidden");
    pintarResultados();
}

function abrirFila(codigo) {
    edicion = { codigo: codigo, cantidad: 1, descuento: 0 };
}

function cerrarFila() {
    edicion = { codigo: null, cantidad: 1, descuento: 0 };
}

/**
 * Pinta la lista de resultados.
 *
 * La fila elegida se abre en su sitio en lugar de llevar a otro dialogo. Asi
 * la busqueda se queda en pantalla y se pueden meter varios productos de la
 * misma consulta sin volver a teclearla, que era lo que costaba antes: cada
 * producto obligaba a reabrir el buscador y reescribir el termino.
 */
function pintarResultados() {
    recorrerProductos.innerHTML = "";

    const porPartNumber = tipoBusquedaProducto.value === "2";
    const lista = CDK.el("ul", { clase: "cdk-articulos" });

    productosEncontrados.forEach((fila) => {
        const p = CDK.coti.producto(fila);
        const abierta = edicion.codigo === p.codigo;
        const yaEsta = typeof CDK.coti.enCarrito === "function" && CDK.coti.enCarrito(p.codigo);

        /* Los tres almacenes SIEMPRE, aunque esten en cero: "M&M 0" y "no se
           muestra M&M" no significan lo mismo, y ocultarlo dejaba al vendedor
           sin saber si hay cero o si el dato no llego.
           Los vacios van atenuados para que se vea de un vistazo donde si hay. */
        const datos = [
            { etiqueta: "Principal", valor: p.stockPrincipal, tono: p.stockPrincipal ? "" : "nulo" },
            { etiqueta: "M&M",       valor: p.stockMym,       tono: p.stockMym       ? "" : "nulo" },
            { etiqueta: "Piura",     valor: p.stockPiura,     tono: p.stockPiura     ? "" : "nulo" }
        ];

        if (yaEsta) {
            datos.push({ etiqueta: "", valor: "En el carrito", tono: "bien" });
        } else if (p.stockTotal === 0) {
            // Se puede cotizar igual, pero que nadie diga que no lo sabia.
            datos.push({ etiqueta: "", valor: "Sin stock", tono: "alerta" });
        }

        /* Ni el codigo interno ni el tope de descuento van en la lista: el
           codigo no ayuda a elegir, y el tope se ve al abrir la fila, que es
           donde de verdad se usa. Aqui solo lo que sirve para decidir: que
           producto es, cuanto cuesta y si hay existencias. */
        const articulo = CDK.articulo({
            nombre: terminoBusqueda && !porPartNumber
                ? CDK.resaltar(p.descripcion, terminoBusqueda)
                : p.descripcion,
            importe: CDK.formato.moneda(CDK.coti.convertir(p.precioUnitario, "D"), CDK.coti.moneda()),
            datos: datos,
            alerta: p.stockTotal === 0,
            // Lo que ya esta en el carrito no se reabre: se edita en el paso 3.
            alPulsar: yaEsta ? null : () => {
                if (abierta) cerrarFila();
                else abrirFila(p.codigo);
                pintarResultados();
            }
        });

        const grupo = CDK.el("li", {
            clase: "cdk-grupo" + (abierta ? " cdk-grupo--abierto" : "")
        }, [articulo]);

        if (abierta) grupo.appendChild(configuradorProducto(p));

        lista.appendChild(grupo);
    });

    recorrerProductos.appendChild(lista);

    // Si la fila abierta quedo fuera de vista, se acerca lo justo.
    const enPantalla = recorrerProductos.querySelector(".cdk-grupo--abierto");
    if (enPantalla) enPantalla.scrollIntoView({ block: "nearest" });
}

// ========================================
// CONFIGURAR LA FILA ABIERTA
// ========================================
/**
 * Cantidad, descuento e importe del producto elegido.
 *
 * Es lo que antes ocupaba un segundo dialogo encima del buscador, y que ademas
 * repetia los mismos campos que el modal de editar del paso 3. El calculo
 * sigue siendo CDK.coti.calcularLinea, el punto unico que usan tambien el
 * paso 3 y el resumen.
 */
function configuradorProducto(p) {
    const avisoStock = CDK.el("p", { clase: "cdk-ficha__aviso hidden" });
    const errorDescuento = CDK.el("p", { clase: "cdk-campo__error hidden" });
    const valorUnitario = CDK.el("span", { clase: "cdk-total__valor" });
    const valorImporte = CDK.el("span", { clase: "cdk-total__valor" });

    const btnAgregar = CDK.el("button", {
        type: "button",
        clase: "cdk-boton cdk-boton--primario",
        texto: "Agregar al carrito",
        style: "width:100%"
    });

    const campoDescuento = CDK.el("input", {
        type: "number",
        id: "conf-descuento",
        clase: "cdk-entrada",
        inputmode: "decimal",
        min: "0",
        step: "0.01",
        value: Number(edicion.descuento).toFixed(2)
    });

    /* El limite de 500 unidades viene del codigo original; no lo impone el
       backend. */
    const contador = CDK.contador({
        valor: edicion.cantidad,
        min: 1,
        max: 500,
        etiqueta: "Cantidad",
        alCambiar: (n) => { edicion.cantidad = n; refrescar(); }
    });

    function calcular() {
        return CDK.coti.calcularLinea({
            precio: p.precioUnitario,
            cantidad: edicion.cantidad,
            descuento: edicion.descuento,
            tope: p.descuentoMaximo
        });
    }

    function refrescar() {
        const linea = calcular();
        const moneda = CDK.coti.moneda();

        // calcularLinea devuelve dolares, que es como los guarda el carrito.
        // La conversion es solo para ensenarlo en la moneda elegida.
        valorUnitario.textContent =
            CDK.formato.moneda(CDK.coti.convertir(linea.precioUnitario, "D"), moneda);
        valorImporte.textContent =
            CDK.formato.moneda(CDK.coti.convertir(linea.importe, "D"), moneda);

        /* El tope lo decide calcularLinea, no una comparacion escrita aqui:
           repetirla es como se llego a tener cuatro topes distintos conviviendo. */
        errorDescuento.classList.toggle("hidden", !linea.acotado);
        if (linea.acotado) {
            errorDescuento.textContent =
                `El máximo para este producto es ${p.descuentoMaximo.toFixed(2)} %.`;
        }
        btnAgregar.disabled = linea.acotado;

        avisarStock();
    }

    /* Avisa cuando se pide mas de lo que hay, sin bloquear: se acordo que una
       cotizacion puede incluir producto sin stock, porque a veces se cotiza lo
       que esta por llegar. Pero el vendedor tiene que verlo ANTES de prometer
       una entrega, no despues. */
    function avisarStock() {
        if (p.stockTotal === 0) {
            avisoStock.textContent = "Este producto no tiene stock en ningún almacén.";
            avisoStock.classList.remove("hidden");
            return;
        }
        if (edicion.cantidad > p.stockTotal) {
            avisoStock.textContent =
                `Estás pidiendo ${edicion.cantidad} y solo hay ${p.stockTotal} entre los tres almacenes.`;
            avisoStock.classList.remove("hidden");
            return;
        }
        avisoStock.classList.add("hidden");
    }

    campoDescuento.addEventListener("input", () => {
        const n = parseFloat(campoDescuento.value);
        edicion.descuento = isFinite(n) && n > 0 ? n : 0;
        refrescar();
    });

    // Al salir del campo queda en dos decimales, como lo guarda el carrito.
    campoDescuento.addEventListener("blur", () => {
        campoDescuento.value = Number(edicion.descuento).toFixed(2);
    });

    btnAgregar.addEventListener("click", () => agregarProducto(p));

    const bloque = CDK.el("div", { clase: "cdk-config" }, [
        avisoStock,
        CDK.el("div", { clase: "cdk-pareja" }, [
            CDK.el("div", { clase: "cdk-campo" }, [
                CDK.el("label", { clase: "cdk-campo__etiqueta", texto: "Cantidad" }),
                contador
            ]),
            CDK.el("div", { clase: "cdk-campo" }, [
                CDK.el("label", { clase: "cdk-campo__etiqueta", for: "conf-descuento" }, [
                    document.createTextNode("Descuento "),
                    CDK.el("span", {
                        clase: "cdk-campo__pista",
                        texto: `máx. ${p.descuentoMaximo.toFixed(2)} %`
                    })
                ]),
                campoDescuento,
                errorDescuento
            ])
        ]),
        CDK.el("div", { clase: "cdk-totales", style: "margin:12px 0" }, [
            CDK.el("div", { clase: "cdk-total" }, [
                CDK.el("span", { clase: "cdk-total__etiqueta", texto: "Precio unitario" }),
                valorUnitario
            ]),
            CDK.el("div", { clase: "cdk-total cdk-total--principal" }, [
                CDK.el("span", { clase: "cdk-total__etiqueta", texto: "Importe" }),
                valorImporte
            ])
        ]),
        btnAgregar
    ]);

    refrescar();
    return bloque;
}

// ========================================
// AGREGAR AL CARRITO
// ========================================
function agregarProducto(p) {
    const linea = CDK.coti.calcularLinea({
        precio: p.precioUnitario,
        cantidad: edicion.cantidad,
        descuento: edicion.descuento,
        tope: p.descuentoMaximo
    });

    // El boton ya esta deshabilitado en ese caso; esto es el cinturon.
    if (linea.acotado) return;

    // El carrito vive en el paso 3, que registra el enganche al cargar.
    if (typeof CDK.coti.agregarAlCarrito !== "function") {
        CDK.toast("No se pudo agregar el producto. Recarga la página.", "error", 0);
        return;
    }

    const producto = {
        id: p.codigo,
        descripcion: p.descripcion,
        stock1: p.stockPrincipal,
        stock2: p.stockMym,
        // El de Piura se perdia aqui: la lista lo mostraba pero al elegir el
        // producto se descartaba, asi que el carrito nunca lo supo.
        stock3: p.stockPiura,
        stockTotal: p.stockTotal,
        descuentoMaximo: p.descuentoMaximo,
        precioUnitario: p.precioUnitario,
        total: linea.importe
    };

    if (CDK.coti.agregarAlCarrito(producto, edicion.cantidad, linea.descuentoAplicado) === false) {
        CDK.toast("Ese producto ya estaba en el carrito. Edítalo desde la lista.", "aviso");
        return;
    }

    agregadosEnSesion++;
    actualizarConteo();

    // Se descubre por detras del panel, para que ya este ahi al cerrarlo.
    paso3.classList.remove("hidden");

    cerrarFila();
    pintarResultados();   // la busqueda sigue en pantalla
}

/* Unica señal de que el producto entro, ahora que el panel no se cierra. */
function actualizarConteo() {
    if (!conteoAgregados) return;

    conteoAgregados.classList.toggle("hidden", agregadosEnSesion === 0);
    conteoAgregados.textContent = agregadosEnSesion === 1
        ? "1 producto agregado"
        : `${agregadosEnSesion} productos agregados`;
}

// Escape cierra el buscador, como el resto de dialogos de la intranet.
document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    if (!modalBusquedaProducto.classList.contains("hidden")) cerrarModalBusquedaProducto();
});

// ========================================
// BÚSQUEDA POR VOZ
// ========================================
/* La busqueda por voz se retiro junto con su boton: los listeners solo
   cambiaban el texto a "Escuchando..." y no habia reconocimiento detras.
   El codigo que lo implementa esta en js/audio/, que no carga ninguna
   pagina desde que se borro promos.html. */
