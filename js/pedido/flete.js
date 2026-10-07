/**
 * Flete de un pedido.
 *
 * Sustituye a js/pedido/ver_flete.js, que tenía tres problemas de fondo:
 *
 *   · **Pedía a una ruta que nunca funcionó.** `/pedido/flete` devolvía 500 en
 *     todas las llamadas —el procedimiento esperaba `@doc` y se mandaba
 *     `@numero`—, y la pantalla lo tragaba en un `catch` que solo decía
 *     «Error al aplicar flete». Nadie aplicó nunca un flete desde aquí.
 *   · **Decidía quién podía aplicarlo**, con `flag===0 && apro===1`, usando dos
 *     valores que venían del propio navegador. Eso dejaba fuera 8 923 de los
 *     9 284 pedidos de los últimos 90 días, y se podía saltar desde la consola.
 *     Ahora decide el backend y la pantalla enseña el motivo.
 *   · **Pintaba todo con `$`.** La moneda llega en la posición 13 y no se leía,
 *     así que un pedido en soles se mostraba entero en dólares.
 *
 * Ver docs/pedido.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    /* ---------------------------------------------------------------
     * Qué hay en cada posición de una línea
     *
     * Confirmadas contra el backend. `flag` y `apro` se leen para rotular el
     * pedido, no para decidir nada: lo segundo es trabajo del servidor.
     *
     * `dias` (2) no se usa, y está confirmado que no hace falta.
     * ------------------------------------------------------------- */
    var LINEA = {
        flag: 0, apro: 1, /* dias: 2 */ documento: 3, cliente: 4, item: 5,
        fabricante: 6, descripcion: 7, marca: 8, cantidad: 9,
        descuento: 10, precio: 11, total: 12, moneda: 13
    };

    /* `flag` es el estado del pedido. `apro` toma cinco valores distintos en
       90 días y nadie sabe qué significan 2, 3 y 4, así que no se interpreta:
       solo se rotula lo que sí está confirmado. */
    var ESTADOS = { "0": "aprobado", "1": "atendido", "*": "anulado" };

    var seccionBuscar = document.getElementById("seccion-buscar");
    var seccionPedido = document.getElementById("seccion-pedido");
    var formulario = document.getElementById("form-buscar");
    var entrada = document.getElementById("npedi");
    var buscando = document.getElementById("buscando");
    var titulo = document.getElementById("titulo-pedido");
    var resumen = document.getElementById("resumen");
    var productos = document.getElementById("productos");
    var resultado = document.getElementById("resultado");
    var btnFlete = document.getElementById("btn-flete");
    var btnVolver = document.getElementById("btn-volver");

    if (!formulario) return;

    var pedido = null;   // { numero, cliente, estado, moneda, lineas[] }

    /* ===============================================================
     * Leer
     * ============================================================= */

    function leerLinea(cruda) {
        if (!cruda || typeof cruda !== "object") return null;

        var l = {};
        Object.keys(LINEA).forEach(function (n) { l[n] = cruda[LINEA[n]]; });
        if (!l.descripcion && !l.item) return null;

        l.moneda = l.moneda === "S" ? "S" : "D";
        return l;
    }

    function leerPedido(respuesta, numero) {
        var crudas = respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
        var lineas = Object.keys(crudas || {})
            .map(function (k) { return leerLinea(crudas[k]); })
            .filter(Boolean);

        if (!lineas.length) return null;

        var primera = lineas[0];

        return {
            numero: primera.documento || numero,
            cliente: primera.cliente || "",
            estado: ESTADOS[String(primera.flag)] || null,
            moneda: primera.moneda,
            lineas: lineas
        };
    }

    /**
     * El total del pedido.
     *
     * Se suman las líneas porque `/pedido/mostrar` todavía no manda la
     * cabecera. **Los totales los gobierna un trigger del ERP**, así que esta
     * suma puede discrepar en cuanto haya un redondeo de por medio; está
     * pedido que la ruta los devuelva. Cuando lleguen, se leen de ahí y esta
     * función sobra.
     */
    function totalDeLasLineas(p) {
        return p.lineas.reduce(function (suma, l) {
            return suma + (parseFloat(l.total) || 0);
        }, 0);
    }

    /* ===============================================================
     * Buscar
     * ============================================================= */

    formulario.addEventListener("submit", function (ev) {
        ev.preventDefault();
        buscar(entrada.value.trim());
    });

    function buscar(numero) {
        if (!numero) {
            CDK.toast("Escribe el número de pedido", "aviso");
            entrada.focus();
            return;
        }

        CDK.estados.cargando(buscando, "Buscando el pedido…");

        CDK.http.post(CDK.rutas.api("/pedido/mostrar"), { npedi: numero })
            .then(function (respuesta) {
                CDK.estados.limpiar(buscando);

                pedido = leerPedido(respuesta, numero);
                if (!pedido) {
                    CDK.estados.vacio(buscando, "Ese pedido no tiene líneas.");
                    return;
                }
                abrir();
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                /* La ruta filtra por el vendedor, así que un pedido ajeno
                   responde igual que uno inexistente. El mensaje lo pone el
                   backend; aquí no se adivina cuál de las dos cosas es. */
                CDK.estados.error(buscando, err, function () { buscar(numero); });
            });
    }

    /* ===============================================================
     * Pintar
     * ============================================================= */

    function abrir() {
        seccionBuscar.classList.add("hidden");
        seccionPedido.classList.remove("hidden");
        resultado.innerHTML = "";
        pintar();
    }

    function pintar() {
        titulo.textContent = pedido.numero;
        resumen.innerHTML = "";
        productos.innerHTML = "";

        var filas = [];

        if (pedido.cliente) {
            filas.push(el("div", { clase: "cdk-total" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Cliente" }),
                el("span", { clase: "cdk-total__valor", texto: pedido.cliente })
            ]));
        }

        if (pedido.estado) {
            filas.push(el("div", { clase: "cdk-total" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Estado" }),
                el("span", { clase: "cdk-total__valor", texto: pedido.estado })
            ]));
        }

        filas.push(el("div", { clase: "cdk-total cdk-total--principal" }, [
            el("span", { clase: "cdk-total__etiqueta", texto: "Suma de las líneas" }),
            el("span", { clase: "cdk-total__valor",
                         texto: CDK.formato.moneda(totalDeLasLineas(pedido), pedido.moneda) })
        ]));

        resumen.appendChild(el("div", { clase: "cdk-totales" }, filas));

        /* Dicho como lo que es. El total de verdad lo lleva la cabecera del
           pedido, que esta ruta todavía no manda, y el mínimo del flete se
           mide ademas sobre el total SIN IGV. Llamar «Total» a esta suma
           invitaría a comparar dos números que no son el mismo. */
        resumen.appendChild(el("p", {
            clase: "cdk-pista",
            style: "margin:6px 0 0",
            texto: pedido.lineas.length + (pedido.lineas.length === 1 ? " línea" : " líneas") +
                   ". El total que vale es el de la cabecera del pedido."
        }));

        var lista = el("ul", { clase: "cdk-articulos" });

        pedido.lineas.forEach(function (l) {
            var datos = [{ etiqueta: "Cantidad", valor: l.cantidad }];

            if (l.precio !== undefined && l.precio !== null) {
                datos.push({ etiqueta: "Unitario",
                             valor: CDK.formato.moneda(l.precio, l.moneda) });
            }
            /* El descuento solo cuando lo hay. Antes salía siempre, suelto
               bajo la marca y sin etiqueta, así que un 0 parecía un código. */
            if (Number(l.descuento)) {
                datos.push({ etiqueta: "Dscto", valor: l.descuento, tono: "bien" });
            }

            lista.appendChild(CDK.articulo({
                nombre: l.descripcion || "(sin descripción)",
                detalle: l.marca || "",
                importe: l.total === undefined || l.total === null
                    ? ""
                    : CDK.formato.moneda(l.total, l.moneda),
                datos: datos
            }));
        });

        productos.appendChild(lista);
    }

    /* ===============================================================
     * Aplicar el flete
     * ============================================================= */

    btnFlete.addEventListener("click", function () {
        CDK.modal.confirmar({
            titulo: "¿Aplicar el flete?",
            mensaje: "Al pedido " + pedido.numero + " se le añadirá el descuento de flete " +
                     "de provincia, que es el 0,4 % del total sin IGV. Cambia los totales " +
                     "del pedido.",
            confirmar: "Aplicar"
        }).then(function (si) {
            if (si) aplicar();
        });
    });

    function aplicar() {
        btnFlete.disabled = true;
        CDK.estados.cargando(resultado, "Aplicando el flete…");

        /* Solo el número. Antes se mandaban también `flag` y `apro`, que
           venían del propio navegador y el procedimiento no usaba nunca. */
        CDK.http.post(CDK.rutas.api("/pedido/flete"), { npedi: pedido.numero })
            .then(function (respuesta) {
                btnFlete.disabled = false;
                pintarTotales(respuesta && respuesta.totales);
                CDK.toast("Flete aplicado al pedido " + pedido.numero, "exito");

                /* Se vuelve a pedir el pedido porque ahora tiene una línea
                   más —el descuento— y la lista de arriba se quedaría
                   mintiendo. Los totales no hacen falta pedirlos: vienen en
                   esta misma respuesta. */
                recargarLineas();
            })
            .catch(function (err) {
                btnFlete.disabled = false;
                if (CDK.http.esError(err) && err.status === 401) return;

                var falta = porCuantoNoLlega(err);
                if (falta) return pintarFalta(falta);

                /* Los demás motivos —ya lo tenía, no le corresponde por
                   departamento, el pedido no es modificable— son 409 con su
                   `msg`, y CDK.estados.error ya los enseña sin ofrecer
                   reintentar, que es lo correcto: insistir da lo mismo. */
                CDK.estados.error(resultado, err);
            });
    }

    /**
     * Si el pedido no llega al mínimo, el backend dice por cuánto.
     *
     * Es la más útil de las siete respuestas: deja decir «faltan 8,02» en vez
     * de solo «no se puede».
     */
    function porCuantoNoLlega(err) {
        if (!CDK.http.esError(err) || !err.datos) return null;
        var d = err.datos;
        if (d.status !== "flete monto insuficiente") return null;
        if (d.falta === undefined || d.falta === null) return null;

        return {
            moneda: d.moneda === "S" ? "S" : "D",
            falta: d.falta,
            total: d.total,
            minimo: d.minimo
        };
    }

    function pintarFalta(f) {
        resultado.innerHTML = "";
        resultado.appendChild(el("div", { clase: "cdk-aviso" }, [
            el("p", { clase: "cdk-aviso__texto",
                      texto: "Faltan " + CDK.formato.moneda(f.falta, f.moneda) +
                             " para que este pedido tenga flete." }),
            /* El mínimo se mide sobre el total SIN IGV, que no es el número
               grande de arriba. Sin decirlo, la cuenta no cuadra a ojo y
               parece que la pantalla se equivoca. */
            el("p", { clase: "cdk-pista",
                      texto: "Va por " + CDK.formato.moneda(f.total, f.moneda) +
                             " y el mínimo es " + CDK.formato.moneda(f.minimo, f.moneda) +
                             ", medidos sobre el total sin IGV." })
        ]));
    }

    function pintarTotales(totales) {
        resultado.innerHTML = "";
        if (!totales) return;

        var m = pedido.moneda;

        resultado.appendChild(el("div", { clase: "cdk-totales" }, [
            el("div", { clase: "cdk-total" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Sin IGV" }),
                el("span", { clase: "cdk-total__valor",
                             texto: CDK.formato.moneda(totales.tota, m) })
            ]),
            el("div", { clase: "cdk-total" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "IGV" }),
                el("span", { clase: "cdk-total__valor",
                             texto: CDK.formato.moneda(totales.toti, m) })
            ]),
            el("div", { clase: "cdk-total cdk-total--principal cdk-total--bien" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: "Total con flete" }),
                el("span", { clase: "cdk-total__valor",
                             texto: CDK.formato.moneda(totales.totn, m) })
            ])
        ]));
    }

    function recargarLineas() {
        CDK.http.post(CDK.rutas.api("/pedido/mostrar"), { npedi: pedido.numero })
            .then(function (respuesta) {
                var fresco = leerPedido(respuesta, pedido.numero);
                if (!fresco) return;

                /* Se conserva lo ya pintado en #resultado: pintar() solo
                   rehace el resumen y la lista. */
                pedido = fresco;
                pintar();
            })
            .catch(function () {
                /* Si falla, el flete YA se aplicó: lo que está en pantalla
                   sigue siendo cierto salvo por la línea nueva. No se
                   convierte en un error, que haría dudar de algo que salió
                   bien. */
            });
    }

    btnVolver.addEventListener("click", function () {
        seccionPedido.classList.add("hidden");
        seccionBuscar.classList.remove("hidden");
        pedido = null;
        entrada.select();
    });

})();
