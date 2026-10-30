/**
 * Promociones vigentes del grupo 20 (cartera y cobertura): lo que esta en promocion hoy, para OFRECER. Sin `?id=`, la lista; con
 * `?id=15221`, el detalle de una, con los productos que se compran.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona entiende:
 *
 *   · **Es para ofrecer, no para aplicar.** Aplicar una promocion a una cotizacion sigue siendo el modulo `promocion`. Esta pantalla no
 *     tiene ningun boton que modifique nada.
 *   · **No hay montos.** Ni el porcentaje del descuento ni cuanto se regala: lo resuelve el motor al cotizar. La pantalla dice si es un
 *     descuento o un regalo, y nada mas. En una de regalo, la descripcion explica que se regala (el detalle solo lista lo que se compra).
 *   · **Nada se calcula aqui.** Los dias que quedan, cuantos productos hay y cuantos tienen stock vienen del backend, y el orden es el
 *     suyo: las que vencen antes primero. Los dias se leen de `diasRestantes`, no del reloj del equipo.
 *   · **El stock es `DISPONIBLE` o `AGOTADO`, nunca un numero**, y se dice con TEXTO, no solo con color. Los agotados se ven, atenuados:
 *     el vendedor tiene que poder decir que existen aunque hoy no haya.
 *   · **Almacenes (solo en el detalle).** Cada producto trae `almacenes`: donde hay stock hoy, sin cantidades, siempre en el orden
 *     PRINCIPAL, M&M, PIURA, CHORRILLOS, y `[]` si esta agotado. El backend dice DONDE hay, no cuales se pueden cotizar: eso lo sabe la
 *     cotizacion (`CDK.catalogo.almacenes()`, hoy Principal y M&M). Un producto disponible solo fuera de esos se marca con un aviso.
 *   · **`soloAlgunosClientes`** se dice con la etiqueta «Solo algunos clientes», sin decir cuales (el backend no lo dice).
 *   · Una promocion puede vencer entre que se abre la lista y el detalle: el `404 promocion no vigente` es normal, y se explica.
 *   · Para cotizar no viajan los codigos del sistema: el vendedor busca por part number o descripcion. Por eso cada part number tiene su
 *     boton «Copiar».
 *
 * Ver docs/promovigentes-grupo20.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var P = CDK.promovigentes;
    var M = CDK.marcas;                 // statusDe(), mensajeError()

    var contenido = document.getElementById("contenido");
    var titulo = document.getElementById("periodo");

    if (!contenido) return;

    var consulta = new URLSearchParams(location.search);
    var id = (consulta.get("id") || "").trim();

    var busqueda = "";
    var filtroTipo = "todas";           // lista: todas | DESCUENTO | REGALO
    var filtroStock = "todos";          // detalle: todos | stock
    var ticket = 0;                     // descarta respuestas de pedidos viejos

    var TIPOS = { DESCUENTO: "Descuento", REGALO: "Regalo" };

    /* ---------------------------------------------------------------
     * Formatos
     * ------------------------------------------------------------- */
    function entero(v) { return CDK.formato.numero(v, 0); }
    function fecha(f) { return f ? CDK.formato.fecha(f) : ""; }
    function esSesionVencida(err) { return CDK.http.esError(err) && err.status === 401; }     // ya redirige

    /** Un rotulo corto, con TEXTO: el color solo acompaña. */
    function rotulo(texto, estado) {
        return el("span", { clase: "cdk-semaforo" + (estado ? " cdk-semaforo--" + estado : ""), texto: texto });
    }

    function pista(texto, idDelNodo) { return el("p", { clase: "cdk-pista", id: idDelNodo || null, style: "margin:8px 0 0", texto: texto }); }

    function enlaceALista(texto) {
        return el("a", { href: CDK.rutas.app("/promovigentes.html"), id: "pv-volver", clase: "cdk-boton cdk-boton--suave", texto: texto || "Ver las promociones vigentes" });
    }

    /** `hoy (29/10/2026)`, `mañana (30/10/2026)`, `en 2 días (31/10/2026)`. Los dias salen de `diasRestantes`: 0 es el ultimo dia. */
    function vence(p) {
        var f = fecha(p.venceEl);
        if (p.diasRestantes === 0) return "hoy (" + f + ")";
        if (p.diasRestantes === 1) return "mañana (" + f + ")";
        if (typeof p.diasRestantes === "number") return "en " + entero(p.diasRestantes) + " días (" + f + ")";
        return f;
    }

    /** El tono de «vence»: hoy y mañana llaman la atencion; el resto, no. */
    function tonoDeVence(p) { return p.diasRestantes === 0 || p.diasRestantes === 1 ? "alerta" : null; }

    /** Cuantos de los productos tienen stock, dicho con palabras. `disponibles: 0` es una promocion que hoy no se puede ofrecer. */
    function stockDe(p) {
        if (p.disponibles === 0) return { etiqueta: "Stock", valor: "sin stock hoy", tono: "alerta" };
        return { etiqueta: "Con stock", valor: entero(p.disponibles) + " de " + entero(p.productos) + (p.productos === 1 ? " producto" : " productos"),
                 tono: p.disponibles === p.productos ? "bien" : null };
    }

    /** Los datos de una promocion, en pares `{ etiqueta, valor, tono }`, sin los vacios. */
    function datosDe(p) {
        var datos = [{ etiqueta: "Vence", valor: vence(p), tono: tonoDeVence(p) }];
        if (p.marca) datos.push({ etiqueta: "Marca", valor: p.marca });
        if (p.familia) datos.push({ etiqueta: "Familia", valor: p.familia });
        datos.push(stockDe(p));
        return datos;
    }

    /** Los rotulos de una promocion: su tipo (si lo trae) y si es solo para algunos clientes. */
    function rotulosDe(p) {
        var rotulos = [];
        if (TIPOS[p.tipo]) rotulos.push(rotulo(TIPOS[p.tipo]));
        if (p.soloAlgunosClientes) rotulos.push(rotulo("Solo algunos clientes"));
        return rotulos;
    }

    function filaDeRotulos(rotulos) {
        return rotulos.length ? el("div", { style: "display:flex;flex-wrap:wrap;gap:6px;margin-top:6px" }, rotulos) : null;
    }

    /** Copia texto al portapapeles. Devuelve una promesa de si se pudo. Sin la API moderna (una pagina sin https) cae a `execCommand`. */
    function copiar(texto) {
        function respaldo() {
            var area = el("textarea", { readonly: "", "aria-hidden": "true", style: "position:fixed;top:0;left:0;opacity:0" });
            area.value = texto;
            document.body.appendChild(area);
            area.select();
            var bien = false;
            try { bien = !!document.execCommand && !!document.execCommand("copy"); } catch (e) { bien = false; }
            document.body.removeChild(area);
            return bien;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(texto).then(function () { return true; }, function () { return respaldo(); });
        }
        return Promise.resolve(respaldo());
    }

    function seccion(idDeLaSeccion, encabezado, sub, hijos) {
        return el("section", { clase: "cdk-seccion", id: idDeLaSeccion }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: encabezado }),
            sub ? el("p", { clase: "cdk-seccion__sub", texto: sub }) : null
        ].filter(Boolean).concat(hijos));
    }

    /** Pestañas de a una: cada `[clave, rotulo]`. `alElegir(clave)` repinta lo que haga falta. */
    function pestanas(idDelNodo, opciones, activa, alElegir) {
        var contenedor = el("div", { clase: "cdk-pestanas cdk-pestanas--cortas", id: idDelNodo, role: "group", "aria-label": "Filtrar" });
        opciones.forEach(function (o) {
            var esta = o[0] === activa;
            var b = el("button", { type: "button", clase: "cdk-pestana" + (esta ? " es-activa" : ""), "data-filtro": o[0], "aria-pressed": esta ? "true" : "false", texto: o[1] });
            b.addEventListener("click", function () { alElegir(o[0]); });
            contenedor.appendChild(b);
        });
        return contenedor;
    }

    /* ===============================================================
     * La lista
     * ============================================================= */
    function cargarLista() {
        var mio = ++ticket;
        titulo.textContent = "Lo que está en promoción para ofrecer";
        CDK.estados.cargando(contenido, "Buscando las promociones vigentes…");

        P.lista()
            .then(function (d) {
                if (mio !== ticket) return;
                if (!d || !Array.isArray(d.promociones)) {
                    CDK.estados.error(contenido, "La respuesta no trae las promociones.", cargarLista);
                    return;
                }
                pintarLista(d);
            })
            .catch(function (err) {
                if (mio !== ticket) return;
                if (esSesionVencida(err)) return;
                CDK.estados.error(contenido, err, cargarLista);
            });
    }

    /** Una promocion de la lista. Tocarla abre su detalle. */
    function tarjeta(p) {
        var detalle = [];
        if (p.descripcion) detalle.push(el("div", { clase: "pv-descripcion", texto: p.descripcion }));
        var rotulos = filaDeRotulos(rotulosDe(p));
        if (rotulos) detalle.push(rotulos);

        var item = CDK.articulo({
            nombre: p.nombre,
            detalle: detalle.length ? detalle : null,
            datos: datosDe(p),
            alPulsar: function () { location.assign(CDK.rutas.app("/promovigentes.html?id=" + encodeURIComponent(p.idprom))); }
        });
        item.setAttribute("data-idprom", p.idprom);
        return item;
    }

    function pintarLista(d) {
        titulo.textContent = "Vigentes hoy, " + fecha(d.fecha);
        contenido.innerHTML = "";

        if (!d.promociones.length) {
            CDK.estados.vacio(contenido, "Hoy no hay promociones vigentes.");
            return;
        }

        var buscador = el("input", { type: "search", id: "pv-buscar", clase: "cdk-entrada", autocomplete: "off",
                                     placeholder: "Buscar por nombre, marca o familia", "aria-label": "Buscar una promoción", value: busqueda });
        var filtros = el("div", { id: "pv-filtros-caja", style: "margin-top:12px" });
        var cuenta = pista("", "pv-cuenta");
        var destino = el("div", { id: "pv-lista", style: "margin-top:12px" });

        function pasa(p) {
            if (filtroTipo !== "todas" && p.tipo !== filtroTipo) return false;
            var aguja = busqueda.toLowerCase();
            if (!aguja) return true;
            return [p.nombre, p.descripcion, p.marca, p.familia].some(function (t) { return String(t || "").toLowerCase().indexOf(aguja) !== -1; });
        }

        function repintar() {
            busqueda = buscador.value.trim();
            destino.innerHTML = "";

            var visibles = d.promociones.filter(pasa);
            cuenta.textContent = visibles.length === d.promociones.length ? "" : "Se muestran " + entero(visibles.length) + " de " + entero(d.promociones.length) + ".";

            if (!visibles.length) { CDK.estados.vacio(destino, "Ninguna promoción coincide."); return; }

            var ul = el("ul", { clase: "cdk-articulos", id: "pv-promociones" });
            visibles.forEach(function (p) { ul.appendChild(tarjeta(p)); });
            destino.appendChild(ul);
        }

        function pintarFiltros() {
            filtros.innerHTML = "";
            filtros.appendChild(pestanas("pv-filtros", [["todas", "Todas"], ["DESCUENTO", "Descuento"], ["REGALO", "Regalo"]], filtroTipo, function (clave) {
                filtroTipo = clave;
                pintarFiltros();
                repintar();
            }));
        }

        buscador.addEventListener("input", repintar);

        contenido.appendChild(seccion("pv-lista-seccion", "Promociones vigentes",
            "Las que vencen antes van primero. Es para ofrecer: aplicar una promoción a una cotización se hace desde el módulo Promoción. " +
            "Toca una para ver sus productos.", [
                el("div", { clase: "cdk-campo" }, [el("label", { clase: "cdk-campo__etiqueta", "for": "pv-buscar", texto: "Buscar" }), buscador]),
                filtros,
                cuenta,
                destino
            ]));

        pintarFiltros();
        repintar();
    }

    /* ===============================================================
     * El detalle
     * ============================================================= */
    function cargarDetalle() {
        var mio = ++ticket;
        titulo.textContent = "Promoción";
        CDK.estados.cargando(contenido, "Buscando la promoción…");

        P.detalle(id)
            .then(function (d) {
                if (mio !== ticket) return;
                if (!d || !d.promocion || !Array.isArray(d.productos)) {
                    CDK.estados.error(contenido, "La respuesta no trae la promoción.", cargarDetalle);
                    return;
                }
                pintarDetalle(d);
            })
            .catch(function (err) {
                if (mio !== ticket) return;
                if (esSesionVencida(err)) return;

                /* Normal: pudo vencer entre la lista y el detalle, o el id es otro. No hay nada que reintentar: se vuelve a la lista. */
                if (M.statusDe(err) === "promocion no vigente") {
                    titulo.textContent = "Promoción no vigente";
                    contenido.innerHTML = "";
                    contenido.appendChild(el("section", { clase: "cdk-seccion", id: "pv-no-vigente" }, [
                        el("h2", { clase: "cdk-seccion__titulo", texto: "Esa promoción ya no está vigente" }),
                        el("p", { clase: "cdk-seccion__sub", texto: M.mensajeError(err) }),
                        enlaceALista()
                    ]));
                    return;
                }

                CDK.estados.error(contenido, err, cargarDetalle);
            });
    }

    /** Los rotulos del backend (`PRINCIPAL`, `M&M`…) como se leen en pantalla. Uno que no conozcamos se dice tal cual. */
    var ALMACENES = { "PRINCIPAL": "Principal", "M&M": "M&M", "PIURA": "Piura", "CHORRILLOS": "Chorrillos" };
    function nombreDeAlmacen(a) { return ALMACENES[a] || String(a); }

    /** `A`, `A y B`, `A, B y C`. */
    function unir(lista, y) {
        if (lista.length < 2) return lista.join("");
        return lista.slice(0, -1).join(", ") + " " + y + " " + lista[lista.length - 1];
    }

    /** Los almacenes desde los que la cotizacion deja tomar stock, con el rotulo del backend: `PRINCIPAL`, `M&M`. */
    function almacenesDeCotizacion() {
        return CDK.catalogo.almacenes().map(function (a) { return String(a.nombre).toUpperCase(); });
    }

    /** Un producto de la promocion: su descripcion, su disponibilidad dicha con texto, y su part number con un boton para copiarlo. */
    function filaDeProducto(x) {
        var disponible = x.disponibilidad === "DISPONIBLE";
        var enAlmacenes = disponible && Array.isArray(x.almacenes) ? x.almacenes : [];
        var cotizables = almacenesDeCotizacion();
        var soloFuera = enAlmacenes.length > 0 && cotizables.length > 0 && !enAlmacenes.some(function (a) { return cotizables.indexOf(a) !== -1; });

        var datos = [];
        if (x.partNumber) {
            var copiarPn = el("button", { type: "button", clase: "cdk-enlace-accion", "data-copiar": x.partNumber,
                                          "aria-label": "Copiar el part number " + x.partNumber, texto: "Copiar" });
            copiarPn.addEventListener("click", function () {
                copiar(x.partNumber).then(function (bien) {
                    CDK.toast(bien ? "Part number copiado: " + x.partNumber : "No se pudo copiar. Selecciónalo y cópialo a mano.", bien ? "exito" : "error");
                });
            });
            datos.push(el("span", { clase: "cdk-dato" }, [document.createTextNode("Part number "), el("span", { clase: "cdk-dato__valor", texto: x.partNumber })]));
            datos.push(copiarPn);
        } else {
            datos.push(el("span", { texto: "Sin part number" }));
        }
        if (x.marca) datos.push(el("span", { texto: x.marca }));
        if (x.familia) datos.push(el("span", { texto: x.familia }));
        if (enAlmacenes.length) {
            datos.push(el("span", { clase: "cdk-dato", "data-almacenes": enAlmacenes.join("|") }, [
                document.createTextNode("Stock en "), el("span", { clase: "cdk-dato__valor", texto: enAlmacenes.map(nombreDeAlmacen).join(", ") })
            ]));
        }

        var li = el("li", { clase: "cdk-fila" + (disponible ? "" : " cdk-fila--apagada") }, [el("div", { clase: "cdk-fila__contenido" }, [
            el("div", { clase: "cdk-fila__linea" }, [
                el("span", { clase: "cdk-fila__nombre", texto: x.descripcion }),
                rotulo(disponible ? "Disponible" : "Agotado", disponible ? "logrado" : "atrasado")
            ]),
            el("div", { clase: "cdk-fila__datos" }, datos),
            soloFuera ? el("p", { clase: "cdk-pista", "data-solo-fuera": "1", style: "margin:6px 0 0",
                                  texto: "Solo hay stock en " + unir(enAlmacenes.map(nombreDeAlmacen), "y") + ", y al cotizar solo se puede elegir " +
                                         unir(cotizables.map(nombreDeAlmacen), "o") + ". Consúltalo antes de ofrecerlo." }) : null
        ].filter(Boolean))]);
        li.setAttribute("data-disponibilidad", x.disponibilidad || "");
        return li;
    }

    function pintarDetalle(d) {
        var p = d.promocion;
        titulo.textContent = p.nombre;
        contenido.innerHTML = "";

        /* La promocion */
        var cabecera = [el("div", { clase: "cdk-acciones-fila" }, [enlaceALista("Volver a las promociones")])];
        if (p.descripcion) cabecera.push(el("p", { id: "pv-descripcion", style: "margin:12px 0 0", texto: p.descripcion }));
        var rotulos = filaDeRotulos(rotulosDe(p));
        if (rotulos) cabecera.push(rotulos);

        cabecera.push(el("div", { clase: "cdk-totales", style: "margin-top:12px" }, datosDe(p).map(function (x, i) {
            return el("div", { clase: "cdk-total" }, [
                el("span", { clase: "cdk-total__etiqueta", texto: x.etiqueta }),
                el("span", { clase: "cdk-total__valor", id: "pv-dato-" + i, texto: x.valor })
            ]);
        })));

        if (p.soloAlgunosClientes) cabecera.push(pista("Solo es para ciertas categorías de cliente.", "pv-solo-algunos"));
        cabecera.push(pista("Es para ofrecer: aplicar la promoción a una cotización se hace desde el módulo Promoción.", "pv-ofrecer"));

        contenido.appendChild(seccion("pv-promocion", p.nombre, null, cabecera));

        /* Sus productos */
        var cuenta = pista("", "pv-productos-cuenta");
        var destino = el("div", { id: "pv-productos-lista", style: "margin-top:12px" });
        var filtros = el("div", { id: "pv-stock-caja", style: "margin-top:12px" });

        function repintar() {
            destino.innerHTML = "";
            var visibles = d.productos.filter(function (x) { return filtroStock !== "stock" || x.disponibilidad === "DISPONIBLE"; });
            cuenta.textContent = visibles.length === d.productos.length ? "" : "Se muestran " + entero(visibles.length) + " de " + entero(d.productos.length) + ".";

            if (!d.productos.length) { CDK.estados.vacio(destino, "Esta promoción no trae productos."); return; }
            if (!visibles.length) { CDK.estados.vacio(destino, "Ningún producto tiene stock hoy."); return; }

            var ul = el("ul", { clase: "cdk-filas", id: "pv-productos" });
            visibles.forEach(function (x) { ul.appendChild(filaDeProducto(x)); });
            destino.appendChild(ul);
        }

        function pintarFiltros() {
            filtros.innerHTML = "";
            filtros.appendChild(pestanas("pv-stock", [["todos", "Todos"], ["stock", "Con stock"]], filtroStock, function (clave) {
                filtroStock = clave;
                pintarFiltros();
                repintar();
            }));
        }

        var sub = "Los que se compran, en el orden del sistema. Los agotados se ven, atenuados." +
                  (p.tipo === "REGALO" ? " Lo que se regala lo explica la descripción: aquí no aparece." : "");

        contenido.appendChild(seccion("pv-productos-seccion", "Productos de la promoción", sub, [filtros, cuenta, destino]));

        pintarFiltros();
        repintar();
    }

    if (id) cargarDetalle(); else cargarLista();

})();
