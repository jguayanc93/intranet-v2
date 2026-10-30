/**
 * ¿A quien vender hoy? (grupo 20, cartera y cobertura): los 3 clientes del dia, 2 para reponer y 1 para llamar.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona entiende:
 *
 *   · **Es solo informacion.** No hay boton de cambiar ni de refrescar: si lo sugerido no le sirvio, espera al dia siguiente. Tampoco hay
 *     recarga automatica ni al volver a la pestaña. La ruta se pide UNA vez, cuando el vendedor abre la pantalla: la primera vez del dia
 *     el backend la calcula y la graba (cerca de un segundo), y todo el dia contesta lo mismo.
 *   · **`valorUsd` quiere decir otra cosa en cada tipo**, asi que cada tarjeta lo rotula segun su `tipo` (las frases las confirmo el
 *     backend el 29/10): lo que valdria reponer (REPONER: la SUMA, de todo lo que ya le toca, de lo que vale una compra tipica de cada
 *     producto; no sale de la lista de precios y NO es la suma de los productos de la tarjeta, que son solo los de mas valor), su
 *     compra media mensual (LLAMAR: los 6 meses completos anteriores al mes en curso, entre 6), lo que ESTE vendedor le vendio en 12
 *     meses (REACTIVAR), y en LIBRE lo que compro a TODOS los vendedores. En SIN_COMPRAS no hay valor. El motivo lo redactamos aqui
 *     segun el tipo (el documento lo permite); para un tipo que no conozcamos se usa el `motivo` del backend.
 *   · **Nada se calcula.** Ni sumas, ni dias, ni porcentajes: lo que llega se dice. El orden es el del `puesto`.
 *   · **Pueden llegar menos de 3**, o ninguna: con `sugeridos: []` viene un `aviso`, y no es un error.
 *   · **Sin telefono ni contacto, y sin el codigo del cliente**: el vendedor reconoce al cliente por su nombre. (El codigo viaja en la
 *     respuesta; no se muestra, decision del 29/10.)
 *   · Todo en dolares y sin IGV (el valor de venta de la factura, antes del impuesto): se dice una vez, en la nota de arriba.
 *
 * Ver docs/quienvender-grupo20.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var Q = CDK.quienvender;

    var contenido = document.getElementById("contenido");
    var titulo = document.getElementById("periodo");

    if (!contenido) return;

    /* ---------------------------------------------------------------
     * Formatos
     * ------------------------------------------------------------- */
    function dolares(v) { return CDK.formato.moneda(v, "D"); }
    function entero(v) { return CDK.formato.numero(v, 0); }
    function fecha(f) { return f ? CDK.formato.fecha(f) : ""; }
    function esSesionVencida(err) { return CDK.http.esError(err) && err.status === 401; }     // ya redirige
    function hay(v) { return v !== null && v !== undefined; }

    function rotulo(texto) { return el("span", { clase: "cdk-semaforo", texto: texto }); }

    /**
     * Cada tipo, dicho con sus palabras: el rotulo, el motivo, lo que significa `valorUsd`, y como se llama lo que llevo.
     * `lleva` es el titulo de la lista de productos.
     */
    var TIPOS = {
        REPONER: {
            rotulo: "Reponer", motivo: "Productos que suele comprar y ya le tocan.",
            valor: "Lo que valdría reponer", lleva: "Lo que más vale de lo que le toca"
        },
        LLAMAR: {
            rotulo: "Llamar", motivo: "Compró el mes pasado y este mes todavía no.",
            valor: "Compra media mensual", lleva: "Lo que más lleva"
        },
        REACTIVAR: {
            rotulo: "Reactivar", motivo: "Hace 60 días o más que no compra.",
            valor: "Le vendiste en 12 meses", lleva: "Lo que más llevaba"
        },
        SIN_COMPRAS: {
            rotulo: "Sin compras", motivo: "Cliente tuyo, sin compras en los últimos 12 meses.",
            valor: null, lleva: null
        },
        LIBRE: {
            rotulo: "Libre", motivo: "Cliente de la oficina o sin dueño que compró en los últimos 12 meses.",
            valor: "Compró en 12 meses a todos los vendedores", lleva: null
        }
    };

    /* ---------------------------------------------------------------
     * Una tarjeta
     * ------------------------------------------------------------- */

    /** Lo que se dice de un producto, segun el tipo: con ritmo (REPONER), o lo que llevo (LLAMAR y REACTIVAR). */
    function detalleDeProducto(x, tipo) {
        var partes = [];

        if (tipo === "REPONER") {
            if (hay(x.cantidad)) partes.push("Suele llevar " + entero(x.cantidad) + " por compra");
            if (hay(x.cada)) partes.push("cada " + entero(x.cada) + (x.cada === 1 ? " día" : " días"));
            if (x.ultima) partes.push("última " + fecha(x.ultima));
            if (hay(x.compras)) partes.push(entero(x.compras) + (x.compras === 1 ? " compra" : " compras") + " en 12 meses");
        } else if (hay(x.cantidad)) {
            partes.push((tipo === "LLAMAR" ? "Llevó " : "Llevaba ") + entero(x.cantidad) + (tipo === "LLAMAR" ? " en los últimos 3 meses" : " en los últimos 12 meses"));
        }

        return partes;
    }

    function listaDeProductos(x, t) {
        if (!Array.isArray(x.productos) || !x.productos.length) return null;

        var filas = x.productos.map(function (pr) {
            var datos = [];
            if (pr.partNumber) datos.push(el("span", { texto: "Part number " + pr.partNumber }));
            detalleDeProducto(pr, x.tipo).forEach(function (texto) { datos.push(el("span", { texto: texto })); });

            return el("li", { clase: "cdk-fila" }, [el("div", { clase: "cdk-fila__contenido" }, [
                el("div", { clase: "cdk-fila__nombre", texto: pr.descripcion }),
                datos.length ? el("div", { clase: "cdk-fila__datos" }, datos) : null
            ].filter(Boolean))]);
        });

        return el("div", { style: "margin-top:12px" }, [
            el("p", { clase: "cdk-pista", style: "margin:0 0 6px", texto: (t && t.lleva) || "Productos" }),
            el("ul", { clase: "cdk-filas" }, filas)
        ]);
    }

    /** ¿Esta tarjeta muestra un importe? En SIN_COMPRAS no hay; para un tipo que no conocemos, el que traiga. */
    function muestraImporte(x) {
        var t = TIPOS[x.tipo];
        return hay(x.valorUsd) && (!t || !!t.valor);
    }

    function tarjeta(x) {
        var t = TIPOS[x.tipo];
        var rotuloDelTipo = t ? t.rotulo : String(x.tipo || "");
        var motivo = t ? t.motivo : (x.motivo || "");

        var datos = [];
        if (muestraImporte(x)) datos.push({ etiqueta: t ? t.valor : "Valor", valor: dolares(x.valorUsd) });
        if (x.ultimaCompra) datos.push({ etiqueta: "Última compra", valor: fecha(x.ultimaCompra) });
        if (hay(x.mesesConCompra)) datos.push({ etiqueta: "Compró en", valor: entero(x.mesesConCompra) + " de los últimos 6 meses" });
        if (hay(x.facturasMesPasado)) datos.push({ etiqueta: "Mes pasado", valor: x.facturasMesPasado === 1 ? "1 factura" : entero(x.facturasMesPasado) + " facturas" });

        var cuerpo = [
            el("div", { style: "display:flex;align-items:flex-start;justify-content:space-between;gap:10px" }, [
                el("div", { style: "display:flex;align-items:flex-start;min-width:0;flex:1" }, [
                    el("span", { clase: "cdk-puesto" + (x.puesto === 1 ? " cdk-puesto--1" : ""), texto: String(x.puesto) }),
                    el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: x.cliente })
                ]),
                rotulo(rotuloDelTipo)
            ]),
            motivo ? el("p", { clase: "cdk-pista", style: "margin:6px 0 0", texto: motivo }) : null,
            datos.length ? el("div", { clase: "cdk-articulo__datos" }, datos.map(function (d) {
                return el("span", { clase: "cdk-dato" }, [document.createTextNode(d.etiqueta + " "), el("span", { clase: "cdk-dato__valor", texto: d.valor })]);
            })) : null,
            listaDeProductos(x, t)
        ].filter(Boolean);

        var li = el("li", { clase: "cdk-articulo" }, [el("div", { clase: "cdk-articulo__cuerpo" }, cuerpo)]);
        li.setAttribute("data-puesto", x.puesto);
        li.setAttribute("data-sugerencia", x.tipo);          // no `data-tipo`: el shell lo usa para ocultar por tipo de usuario
        return li;
    }

    /* ---------------------------------------------------------------
     * La pantalla
     * ------------------------------------------------------------- */
    function pintar(d) {
        titulo.textContent = "Para hoy, " + fecha(d.fecha);
        contenido.innerHTML = "";

        var hijos = [el("h2", { clase: "cdk-seccion__titulo", texto: "Tus clientes de hoy" })];

        if (!d.sugeridos.length) {
            /* No es un error: un vendedor que recien empieza todavia no tiene a quien sugerirle. El texto es del backend. */
            var aviso = String(d.aviso || "Hoy no hay clientes para sugerirte.");
            hijos.push(el("div", { clase: "cdk-aviso", id: "qv-aviso", style: "margin-top:12px" }, [
                el("p", { clase: "cdk-aviso__texto", texto: aviso.charAt(0).toUpperCase() + aviso.slice(1) })
            ]));
        } else {
            hijos.push(el("p", { clase: "cdk-seccion__sub", id: "qv-nota", texto: "Son los mismos todo el día. Mañana habrá otros." }));

            /* Los importes del backend son dolares sin IGV (el valor de venta de la factura, antes del impuesto). Solo se dice si hay alguno. */
            if (d.sugeridos.some(muestraImporte)) {
                hijos.push(el("p", { clase: "cdk-pista", id: "qv-importes", style: "margin:0 0 8px", texto: "Los importes están en dólares, sin IGV." }));
            }

            var ul = el("ul", { clase: "cdk-articulos", id: "qv-sugeridos" });
            d.sugeridos.forEach(function (x) { ul.appendChild(tarjeta(x)); });
            hijos.push(ul);
        }

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "qv-hoy" }, hijos));
    }

    /**
     * Se pide UNA vez. Un error de red o del servidor se puede reintentar (pedir de nuevo el mismo dia devuelve lo mismo y no graba de mas);
     * uno de permisos no.
     */
    function cargar() {
        CDK.estados.cargando(contenido, "Preparando tus clientes de hoy…");

        Q.hoy()
            .then(function (d) {
                if (!d || !Array.isArray(d.sugeridos)) {
                    CDK.estados.error(contenido, "La respuesta no trae los clientes de hoy.", cargar);
                    return;
                }
                pintar(d);
            })
            .catch(function (err) {
                if (esSesionVencida(err)) return;
                CDK.estados.error(contenido, err, cargar);
            });
    }

    cargar();

})();
