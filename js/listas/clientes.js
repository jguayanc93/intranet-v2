/**
 * Clientes: los de su cartera y todo lo que ha facturado este mes.
 *
 * Las dos vistas comparten ruta y se distinguen por `tipo`, que vale
 * `cartera` o `cobertura` — no `asignados` y `libres`, como se supuso antes de
 * preguntar. Importa acertar: cualquier otro valor devuelve lista vacía **sin
 * dar error**, así que equivocarse aquí no se nota. Ver docs/clientes.md.
 *
 * Y la diferencia entre las dos **no es «asignados contra no asignados»**, que
 * es lo que esta pantalla creyó durante un tiempo. Es qué campo de la factura
 * se mira. La factura guarda dos vendedores: de quién era el cliente
 * (`codven`) y quién hizo la venta (`codven_usu`), y en 12 meses no coinciden
 * en el 28 % de los casos.
 *
 *   cartera     sus clientes asignados. Salen TODOS, incluso los que llevan
 *               cero facturas, que es la gracia. Los conteos exigen que
 *               coincidan los dos campos.
 *   cobertura   todo lo que facturó este mes, sea de quien sea el cliente.
 *               Solo mira `codven_usu`, y solo salen los que tienen al menos
 *               una factura suya.
 *
 * Las dos se solapan a propósito: un cliente suyo al que le vendió sale en
 * las dos. No son conjuntos complementarios.
 *
 * Al tocar uno se ve cómo va el mes con él y qué le compra.
 *
 * Antes esto vivía en 200 líneas de <script> dentro del HTML, con dos bloques
 * casi idénticos —uno por cada tabla— y el `fetch` rodeado de comentarios
 * `TODO: IMPLEMENTAR EVENTO AL BACKEND`.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    var RUTA_DETALLE = "/lista/clientes/detalle";

    /* Cuántos clientes se pintan de una vez. La cartera trae TODOS los
       asignados y la cobertura todo lo facturado en el mes: con el
       procedimiento corregido, un vendedor pasó de ver 5 a 163. No hay
       filtro de fecha que lo acote, así que se parte el pintado. */
    var TANDA = 50;

    var seccionLista = document.getElementById("seccion-lista");
    var seccionCliente = document.getElementById("seccion-cliente");
    var destino = document.getElementById("lista-clientes");
    var detalle = document.getElementById("detalle-cliente");
    var tituloCliente = document.getElementById("titulo-cliente");

    var btnCartera = document.getElementById("btn-cartera");
    var btnCobertura = document.getElementById("btn-cobertura");
    var btnVolver = document.getElementById("btn-volver");
    var filtro = document.getElementById("filtro");
    var btnLimpiarFiltro = document.getElementById("btn-limpiar-filtro");

    if (!destino) return;

    var tipo = "cartera";
    var cargados = [];      // lo último que llegó, para filtrar sin volver a pedir
    var tope = TANDA;       // cuántos de los visibles se están pintando

    /* ===============================================================
     * La lista
     * ============================================================= */

    /**
     * Las dos vistas devuelven posiciones, no nombres, y no las mismas:
     *
     *     cartera     0 codcli · 1 nomcli · 2 facturas del mes · 3 notas de crédito
     *     cobertura   0 codcli · 1 nomcli · 2 facturas del mes
     *
     * El código de cliente siempre vino en la 0. Se dio por perdido —era lo
     * que más falta hacía, porque sin él no se puede pedir el detalle de
     * nadie— y lo que pasaba es que esto leía la respuesta como un objeto con
     * nombres de campo, así que no encontraba nada.
     */
    function leerCliente(cruda) {
        if (!cruda || typeof cruda !== "object") return null;

        var nombre = cruda[1];
        if (!nombre) return null;

        return {
            codigo: cruda[0] || null,
            nombre: String(nombre),
            facturas: cruda[2],
            // La cobertura no trae notas de crédito: son solo tres posiciones.
            nc: tipo === "cartera" ? cruda[3] : undefined
        };
    }

    function cargar() {
        CDK.estados.cargando(destino, "Cargando clientes…");

        CDK.http.post(CDK.rutas.api("/lista/clientes"), { tipo: tipo })
            .then(function (respuesta) {
                var crudas = respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
                cargados = Object.keys(crudas || {})
                    .map(function (k) { return leerCliente(crudas[k]); })
                    .filter(Boolean);
                tope = TANDA;
                pintar();
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                CDK.estados.error(destino, err, cargar);
            });
    }

    function pintar() {
        destino.innerHTML = "";

        var texto = (filtro.value || "").trim().toUpperCase();
        var visibles = texto
            ? cargados.filter(function (c) { return c.nombre.toUpperCase().indexOf(texto) !== -1; })
            : cargados;

        if (!visibles.length) {
            destino.appendChild(el("div", { clase: "cdk-estado" }, [
                el("p", { clase: "cdk-estado__texto",
                    texto: texto
                        ? "Ningún cliente coincide con «" + texto + "»."
                        : (tipo === "cartera"
                            ? "Todavía no aparece ningún cliente."
                            : "Este mes todavía no has facturado nada.") }),
                /* Se explica qué es cada vista en vez de afirmar que no hay
                   nada. «No tienes clientes asignados» —lo que decía antes—
                   es falso el día 1 de cada mes, que es cuando más asusta. */
                texto ? null : el("p", { clase: "cdk-pista",
                    texto: tipo === "cartera"
                        ? "Aquí salen tus clientes asignados, incluidos los que este mes " +
                          "no te han comprado nada."
                        : "Aquí sale todo lo que has facturado este mes, sea de quien sea " +
                          "el cliente." })
            ]));
            return;
        }

        var lista = el("ul", { clase: "cdk-articulos" });

        visibles.slice(0, tope).forEach(function (c) {
            var datos = [];

            /* Un cliente de la cartera con cero facturas es la información
               útil de esta pantalla: es a quien tiene abandonado. Sale dicho,
               y no como un «Facturas 0» que se lee igual que todo lo demás. */
            if (tipo === "cartera" && Number(c.facturas) === 0) {
                datos.push({ etiqueta: "", valor: "Sin ventas este mes", tono: "alerta" });
            } else if (c.facturas !== undefined && c.facturas !== null) {
                datos.push({ etiqueta: "Facturas", valor: c.facturas });
            }
            /* Las notas de crédito solo cuando las hay: una columna de ceros en
               todas las filas tapa justo las que sí tienen. */
            if (c.nc) datos.push({ etiqueta: "NC", valor: c.nc, tono: "alerta" });

            lista.appendChild(CDK.articulo({
                nombre: c.nombre,
                datos: datos,
                alPulsar: function () { abrir(c); }
            }));
        });

        destino.appendChild(lista);

        var restantes = visibles.length - tope;
        if (restantes > 0) {
            var mas = el("button", {
                type: "button",
                clase: "cdk-boton cdk-boton--suave",
                style: "width:100%;margin-top:12px",
                texto: "Ver más  ·  quedan " + restantes
            });

            mas.addEventListener("click", function () {
                tope += TANDA;
                pintar();

                /* El foco a la primera fila nueva: al repintar se vuelve al
                   principio, y con teclado o lector eso hace el botón inútil. */
                var pintados = destino.querySelectorAll(".cdk-articulo");
                var primeraNueva = pintados[tope - TANDA];
                if (primeraNueva && primeraNueva.scrollIntoView) {
                    primeraNueva.scrollIntoView({ block: "start" });
                }
            });

            destino.appendChild(mas);
        }
    }

    btnCartera.addEventListener("click", function () { fijarTipo("cartera"); });
    btnCobertura.addEventListener("click", function () { fijarTipo("cobertura"); });

    function fijarTipo(nuevo) {
        if (tipo === nuevo) return;
        tipo = nuevo;

        btnCartera.setAttribute("aria-pressed", String(nuevo === "cartera"));
        btnCobertura.setAttribute("aria-pressed", String(nuevo === "cobertura"));
        btnCartera.className = "cdk-boton " +
            (nuevo === "cartera" ? "cdk-boton--primario" : "cdk-boton--suave");
        btnCobertura.className = "cdk-boton " +
            (nuevo === "cobertura" ? "cdk-boton--primario" : "cdk-boton--suave");

        cargar();
    }

    filtro.addEventListener("input", function () {
        btnLimpiarFiltro.classList.toggle("hidden", filtro.value === "");
        /* De vuelta a la primera tanda: si alguien amplió la lista y luego
           filtra, lo que busca sale arriba y no detrás de un botón. */
        tope = TANDA;
        pintar();
    });

    btnLimpiarFiltro.addEventListener("click", function () {
        filtro.value = "";
        btnLimpiarFiltro.classList.add("hidden");
        tope = TANDA;
        pintar();
        filtro.focus();
    });

    /* ===============================================================
     * Un cliente
     * ============================================================= */

    function abrir(cliente) {
        seccionLista.classList.add("hidden");
        seccionCliente.classList.remove("hidden");
        tituloCliente.textContent = cliente.nombre;

        /* El código viene siempre en la posición 0. Si falta, algo se torció
           aguas arriba y pedir el detalle sin él solo daría un 403. */
        if (!cliente.codigo) {
            detalle.innerHTML = "";
            detalle.appendChild(el("div", { clase: "cdk-aviso" }, [
                el("p", { clase: "cdk-aviso__texto",
                    texto: "Esta fila llegó sin código de cliente, así que no se puede " +
                           "consultar su avance. No debería pasar: conviene avisarlo." })
            ]));
            return;
        }

        CDK.estados.cargando(detalle, "Cargando el avance…");

        CDK.http.post(CDK.rutas.api(RUTA_DETALLE), { codcli: cliente.codigo })
            .then(function (respuesta) {
                var d = (respuesta && respuesta.data) || respuesta;
                pintarDetalle(d || {});
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;
                /* Un cliente que no es suyo responde 403 «cliente ajeno».
                   CDK.estados.error ya hace lo correcto con eso: enseña el
                   mensaje del backend y no ofrece reintentar, porque insistir
                   con lo mismo daría lo mismo. */
                CDK.estados.error(detalle, err, function () { abrir(cliente); });
            });
    }

    /**
     * Los días que lleva sin pedir algo.
     *
     * Se calcula aquí y no en el backend a propósito: así la respuesta no
     * caduca si la ficha se queda abierta, o si alguien la mira mañana.
     */
    function diasSinPedir(ultima) {
        if (!ultima) return null;
        var d = new Date(String(ultima) + "T00:00:00");
        if (isNaN(d.getTime())) return null;
        return Math.floor((Date.now() - d.getTime()) / 86400000);
    }

    /**
     * El avance del mes y lo que más compra.
     *
     * No hay barra de progreso y no es un olvido: existe una tabla de cuota por
     * cliente, por marca y por mes —con la forma exacta que haría falta— pero
     * está vacía, cero filas. Sin meta no hay contra qué medir, así que el
     * avance es la cifra del mes junto a la del anterior. Si algún día se
     * cargan las cuotas, la barra es un campo más en la respuesta.
     *
     * Pinta solo lo que llega: si el backend todavía no manda el mes anterior o
     * la meta, esas filas no aparecen en vez de salir en blanco.
     */
    function pintarDetalle(d) {
        detalle.innerHTML = "";

        var mes = d.mes || {};
        var moneda = mes.moneda === "S" ? "S" : "D";

        if (mes.total !== undefined && mes.total !== null) {
            var filas = [
                el("div", { clase: "cdk-total cdk-total--principal" }, [
                    el("span", { clase: "cdk-total__etiqueta", texto: "Comprado este mes" }),
                    el("span", { clase: "cdk-total__valor",
                                 texto: CDK.formato.moneda(mes.total, moneda) })
                ])
            ];

            if (mes.documentos) {
                filas.push(el("div", { clase: "cdk-total" }, [
                    el("span", { clase: "cdk-total__etiqueta", texto: "Documentos" }),
                    el("span", { clase: "cdk-total__valor", texto: String(mes.documentos) })
                ]));
            }

            /* El mes anterior al lado, que es lo que convierte una cifra suelta
               en una señal de si va mejor o peor. */
            if (mes.anterior !== undefined && mes.anterior !== null) {
                var sube = Number(mes.total) >= Number(mes.anterior);
                filas.push(el("div", {
                    clase: "cdk-total " + (sube ? "cdk-total--bien" : "cdk-total--alerta")
                }, [
                    el("span", { clase: "cdk-total__etiqueta", texto: "Mes anterior" }),
                    el("span", { clase: "cdk-total__valor",
                                 texto: CDK.formato.moneda(mes.anterior, moneda) })
                ]));
            }

            detalle.appendChild(el("div", { clase: "cdk-totales" }, filas));

            /* El cliente compró en más de una moneda este mes. Sumarlas no
               significa nada, así que el backend manda la de más peso y avisa
               aparte. Decirlo es mejor que dar una cifra que parece el total
               y no lo es — es el mismo fallo del `$` escrito a mano, pero al
               revés: aquí el símbolo está bien y lo que falta es contexto. */
            if (mes.otrasMonedas) {
                detalle.appendChild(el("p", {
                    clase: "cdk-pista",
                    style: "margin:6px 0 0",
                    texto: "Este mes también te compró en otra moneda: esta cifra es " +
                           "solo la de " + (moneda === "S" ? "soles" : "dólares") + "."
                }));
            }
        }

        /* Lo que le toca reponer va antes que el top, y no por orden de
           importancia sino de uso: el top describe al cliente, esto dice con
           qué llamarle hoy. Ver docs/respuesta-clientes.md. */
        var reponer = Array.isArray(d.reponer) ? d.reponer : [];

        if (reponer.length) {
            detalle.appendChild(el("p", {
                clase: "cdk-seccion__titulo",
                style: "margin:16px 0 4px",
                texto: "Le toca reponer"
            }));
            /* Dicho así a propósito: es el ritmo con que lo viene pidiendo,
               no una previsión. Si cambió de proveedor, esto seguirá
               ofreciéndolo durante meses y el vendedor tiene que saberlo. */
            detalle.appendChild(el("p", {
                clase: "cdk-pista",
                style: "margin-bottom:8px",
                texto: "Según el ritmo con que lo viene pidiendo."
            }));

            var pendientes = el("ul", { clase: "cdk-articulos" });

            reponer.forEach(function (p) {
                var datos = [];
                var dias = diasSinPedir(p.ultima);

                if (p.cantidad !== undefined && p.cada) {
                    datos.push({ etiqueta: "Suele pedir",
                                 valor: p.cantidad + " cada " + p.cada + " días" });
                }
                if (dias !== null) {
                    datos.push({ etiqueta: "Lleva", valor: dias + " días",
                                 tono: p.cada && dias > Number(p.cada) ? "alerta" : "" });
                }
                /* Cuántas veces lo compró. Va a la vista porque es lo que deja
                   juzgar si fiarse del ritmo: tres compras y siete no se leen
                   igual, y redondear eso sería esconderlo. */
                if (p.compras) {
                    datos.push({ etiqueta: "Compras", valor: p.compras });
                }

                pendientes.appendChild(CDK.articulo({
                    nombre: p.descripcion || "(sin descripción)",
                    datos: datos
                }));
            });

            detalle.appendChild(pendientes);
        }

        var top = Array.isArray(d.top) ? d.top : [];
        if (!top.length) return;

        detalle.appendChild(el("p", {
            clase: "cdk-seccion__titulo",
            style: "margin:16px 0 8px",
            texto: "Lo que más te compra"
        }));
        /* Tres meses NATURALES anteriores, no noventa días hacia atrás: así
           la cifra no cambia según el día en que se mire. Y no es la misma
           ventana que `reponer`, que necesita doce meses para que un ritmo
           se sostenga — son dos preguntas distintas. */
        detalle.appendChild(el("p", {
            clase: "cdk-pista",
            style: "margin-bottom:8px",
            texto: "Los tres meses anteriores, por cantidad."
        }));

        var lista = el("ul", { clase: "cdk-articulos" });

        top.forEach(function (p) {
            var datos = [];
            if (p.importe !== undefined && p.importe !== null) {
                datos.push({
                    etiqueta: "Importe",
                    valor: CDK.formato.moneda(p.importe, p.moneda === "S" ? "S" : "D")
                });
            }

            lista.appendChild(CDK.articulo({
                nombre: p.descripcion || "(sin descripción)",
                /* La cifra grande es la CANTIDAD, al revés que en el resto de
                   la aplicación, donde la de la derecha es siempre dinero.

                   Aquí la lista va ordenada por cantidad, y poner el importe
                   donde salta la vista la hacía parecer mal ordenada: 1.860
                   encima de 1.915. La excepción se sostiene porque esta lista
                   no va de documentos, va de volumen. */
                importe: p.cantidad === undefined || p.cantidad === null
                    ? ""
                    : p.cantidad + " u.",
                datos: datos
            }));
        });

        detalle.appendChild(lista);
    }

    btnVolver.addEventListener("click", function () {
        seccionCliente.classList.add("hidden");
        seccionLista.classList.remove("hidden");
        detalle.innerHTML = "";
    });

    cargar();

})();
