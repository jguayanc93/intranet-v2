/**
 * Paso 1 — Buscar y elegir el cliente.
 *
 * Se busca por razón social o por RUC (11 dígitos), y el backend devuelve
 * `{ n: { 0: código, 1: razón social } }`.
 *
 * Cambios respecto a la versión anterior:
 *
 *   · Se cancela la petición en vuelo al seguir tecleando. Antes no, y con el
 *     retardo de 400 ms dos búsquedas podían cruzarse: si la respuesta de
 *     "pc su" llegaba después que la de "pc sumi", la lista acababa mostrando
 *     resultados que no correspondían a lo escrito.
 *   · Un RUC completo busca de inmediato, sin esperar el retardo: son 11
 *     dígitos exactos, no hay nada que seguir escribiendo.
 *   · Un fallo de red ya no se muestra como "sin resultados". Antes el catch
 *     enseñaba el mismo mensaje, así que un servidor caído parecía un cliente
 *     inexistente.
 *   · Se retiró `buscar_cliente2Original`, que intentaba guardar una función
 *     "original" declarada más abajo en el mismo archivo: por el hoisting
 *     capturaba siempre la nueva, nunca se usaba y solo despistaba.
 */
;(function () {
    "use strict";

    var MIN_CARACTERES = 3;
    var RETARDO = 400;
    var RUC = /^\d{11}$/;

    var btnBuscar        = document.getElementById("btn-buscar-cliente");
    var modal            = document.getElementById("modal-busqueda-cliente");
    var entrada          = document.getElementById("input-busqueda");
    var btnCerrar        = document.getElementById("btn-cerrar-busqueda");
    var btnCancelar      = document.getElementById("btn-cancelar-busqueda");
    var btnLimpiar       = document.getElementById("btn-limpiar-busqueda");
    var resultados       = document.getElementById("recorrer-clientes");
    var fondo            = document.getElementById("modal-backdrop");
    var cajaCliente      = document.getElementById("cliente-seleccionado");
    var nombreCliente    = document.getElementById("nombre-cliente");
    var btnCambiar       = document.getElementById("btn-cambiar-cliente");
    var indicador        = document.getElementById("indicador-busqueda");
    var cargando         = document.getElementById("busqueda-loading");
    var sinResultados    = document.getElementById("sin-resultados");
    var paso2            = document.getElementById("paso2");

    if (!btnBuscar || !modal) return;

    var reloj = null;
    var enVuelo = null;   // AbortController de la búsqueda en curso

    // Lo lee el resto de la pantalla.
    window.clienteSeleccionado = null;

    /* --- modal ------------------------------------------------------ */

    function abrir() {
        modal.classList.remove("hidden");
        // La del armazón, la misma que usan los diálogos del resto de la
        // intranet. Antes era "modal-abierto", que hace lo mismo pero está
        // definida en un <style> dentro de esta página. Los modales de los
        // pasos 2, 3 y 4 la siguen usando hasta que se migren.
        document.body.classList.add("cdk-sin-scroll");
        limpiar();
        entrada.focus();
    }

    function cerrar() {
        cancelarBusqueda();
        modal.classList.add("hidden");
        document.body.classList.remove("cdk-sin-scroll");
        resultados.innerHTML = "";
        entrada.value = "";
        btnLimpiar.classList.add("hidden");
    }

    btnBuscar.addEventListener("click", abrir);
    btnCerrar.addEventListener("click", cerrar);
    btnCancelar.addEventListener("click", cerrar);
    fondo.addEventListener("click", cerrar);

    // Escape cierra, como en el resto de la intranet.
    document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && !modal.classList.contains("hidden")) cerrar();
    });

    /* --- estados de la lista ---------------------------------------- */

    function ocultarEstados() {
        indicador.classList.add("hidden");
        cargando.classList.add("hidden");
        sinResultados.classList.add("hidden");
    }

    function limpiar() {
        cancelarBusqueda();
        entrada.value = "";
        btnLimpiar.classList.add("hidden");
        resultados.innerHTML = "";
        ocultarEstados();
        entrada.focus();
    }

    btnLimpiar.addEventListener("click", function (ev) {
        ev.stopPropagation();
        limpiar();
    });

    function cancelarBusqueda() {
        clearTimeout(reloj);
        if (enVuelo) { enVuelo.abort(); enVuelo = null; }
    }

    /* --- teclear ---------------------------------------------------- */

    entrada.addEventListener("input", function (ev) {
        var texto = ev.target.value.trim();

        btnLimpiar.classList.toggle("hidden", texto.length === 0);

        cancelarBusqueda();
        resultados.innerHTML = "";
        ocultarEstados();

        if (!texto) return;

        // Un RUC son 11 dígitos exactos: no hay nada más que teclear.
        if (RUC.test(texto)) {
            cargando.classList.remove("hidden");
            buscar(texto);
            return;
        }

        if (texto.length < MIN_CARACTERES) {
            indicador.classList.remove("hidden");
            return;
        }

        cargando.classList.remove("hidden");
        reloj = setTimeout(function () { buscar(texto); }, RETARDO);
    });

    /* --- búsqueda --------------------------------------------------- */

    function buscar(texto) {
        var control = new AbortController();
        enVuelo = control;

        CDK.http.post(CDK.rutas.api("/cliente/buscar"), { sugerencia: texto }, { senal: control.signal })
            .then(function (respuesta) {
                if (control.signal.aborted) return;
                enVuelo = null;
                pintar(respuesta, texto);
            })
            .catch(function (err) {
                // Se comprueba ESTE controlador, no una bandera compartida: una
                // búsqueda cancelada al seguir tecleando no es un error que
                // mostrar, pero un fallo al pintar sí, y con una bandera común
                // los dos acababan descartados por igual.
                if (control.signal.aborted) return;
                enVuelo = null;

                cargando.classList.add("hidden");

                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige

                CDK.estados.error(resultados, err, function () {
                    resultados.innerHTML = "";
                    cargando.classList.remove("hidden");
                    buscar(texto);
                });
            });
    }

    function pintar(clientes, termino) {
        cargando.classList.add("hidden");
        resultados.innerHTML = "";

        var filas = Object.keys(clientes || {}).map(function (k) { return clientes[k]; });

        if (!filas.length) {
            sinResultados.classList.remove("hidden");
            return;
        }

        var porRuc = RUC.test(termino);
        var lista = CDK.el("ul", { clase: "cdk-articulos" });

        filas.forEach(function (fila) {
            var cli = CDK.coti.cliente(fila);

            // Se resalta donde está la coincidencia: en el nombre si se buscó
            // por texto, en el RUC si se buscó por RUC. Con razones sociales
            // tan parecidas entre sí ("PC SUMINISTROS…", "HPC SUMINISTROS…",
            // "APC SUMINISTROS…"), es lo que permite distinguirlas de un vistazo.
            var nombre = porRuc
                ? [document.createTextNode(cli.razonSocial)]
                : CDK.resaltar(cli.razonSocial, termino);

            // Solo el RUC. El código de cliente es un identificador interno
            // que no ayuda a decidir cuál es el correcto: se sigue usando por
            // dentro para pedir la ficha, pero no se muestra.
            var detalle = [];
            if (cli.ruc) {
                detalle.push(document.createTextNode("RUC "));
                detalle = detalle.concat(porRuc ? CDK.resaltar(cli.ruc, termino)
                                                : [document.createTextNode(cli.ruc)]);
            }

            lista.appendChild(CDK.articulo({
                nombre: nombre,
                detalle: detalle,
                alPulsar: function () { elegir(cli); }
            }));
        });

        resultados.appendChild(lista);
    }

    /* --- elegir ----------------------------------------------------- */

    function elegir(cli) {
        window.clienteSeleccionado = { id: cli.codigo, nombre: cli.razonSocial, ruc: cli.ruc };

        cerrar();

        nombreCliente.textContent = cli.razonSocial;

        // El RUC confirma que es el cliente correcto. Con razones sociales tan
        // parecidas, el nombre solo no basta.
        var detalle = document.getElementById("detalle-cliente");
        if (detalle) {
            detalle.textContent = cli.ruc ? "RUC " + cli.ruc : "";
        }

        // Queda en "sin dato" hasta que llegue la ficha completa; si esa
        // petición falla, mejor un guion neutro que una "S" inventada.
        pintarCredito(null);

        cajaCliente.classList.remove("hidden");

        // El paso 2 se abre solo cuando la ficha llegó. Contiene la letra que
        // decide qué precio ve este cliente, y sin ella la búsqueda de
        // productos devolvería precios que no le corresponden. Antes se abría
        // de inmediato y, si la petición fallaba, quedaba disponible igual.
        if (typeof cliente !== "function") { abrirPaso2(); return; }

        cliente(cli.codigo).then(function (datos) {
            if (!datos) return;   // el fallo ya se avisó en pantalla
            pintarCredito(datos.credito);
            abrirPaso2();
        });
    }

    /**
     * Estado de la línea de crédito del cliente.
     *
     *   "S" → disponible      "N" → no disponible      null → aún sin dato
     *
     * El backend todavía no envía este campo; mientras tanto se muestra el
     * estado neutro. En cuanto lo incluya en /cliente/id, esto funciona sin
     * tocar nada más: solo hay que darle nombre en js/cotizacion/campos.js.
     */
    function pintarCredito(valor) {
        var nodo = document.getElementById("credito-cliente");
        if (!nodo) return;

        var estado = String(valor || "").trim().toUpperCase();

        var mapa = {
            "S": { clase: "si", letra: "S", titulo: "Con línea de crédito disponible" },
            "N": { clase: "no", letra: "N", titulo: "Sin línea de crédito disponible" }
        };

        var e = mapa[estado] || { clase: "nd", letra: "–", titulo: "Sin información de crédito" };

        nodo.className = "cdk-credito cdk-credito--" + e.clase;
        nodo.textContent = e.letra;
        nodo.title = e.titulo;

        // El color por sí solo no comunica a quien no lo distingue: la letra
        // y el título lo dicen igualmente.
        nodo.setAttribute("aria-label", e.titulo);
    }

    function abrirPaso2() {
        paso2.classList.remove("hidden");
        setTimeout(function () {
            paso2.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 300);
    }

    /**
     * Cambiar de cliente invalida el carrito.
     *
     * El precio de cada producto sale de la letra del cliente, así que un
     * carrito armado para otro cliente lleva importes que ya no corresponden.
     * Antes se cambiaba sin avisar y los productos se quedaban con los precios
     * del cliente anterior; la cotización salía mal sin ninguna señal.
     */
    btnCambiar.addEventListener("click", function (ev) {
        ev.stopPropagation();

        var enCarrito = typeof window.contarProductosCarrito === "function"
            ? window.contarProductosCarrito()
            : 0;

        // Sin productos no hay nada que perder: no se molesta con un diálogo.
        if (!enCarrito) { cambiar(); return; }

        CDK.modal.confirmar({
            titulo: "¿Cambiar de cliente?",
            mensaje: "Se quitará" + (enCarrito === 1 ? " el producto" : "n los " + enCarrito + " productos") +
                     " del carrito: los precios dependen del cliente y dejarían de ser válidos.",
            confirmar: "Cambiar",
            peligro: true
        }).then(function (si) {
            if (!si) return;
            if (typeof window.vaciarCarritoCotizacion === "function") window.vaciarCarritoCotizacion();
            cambiar();
        });
    });

    function cambiar() {
        window.clienteSeleccionado = null;
        cliente_data = [];
        cajaCliente.classList.add("hidden");
        paso2.classList.add("hidden");
        abrir();
    }
})();
