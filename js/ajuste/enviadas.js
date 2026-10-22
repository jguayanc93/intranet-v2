/**
 * Mis ajustes (grupo 20): las solicitudes que el vendedor envio y lo que respondieron.
 *
 * Una solicitud por cada responsable: si un documento tenia marcas de dos personas,
 * cada una responde por su lado y una puede confirmar mientras la otra rechaza. Por
 * eso cada fila es una solicitud, con el nombre de a quien se envio.
 *
 * Cada una dice que le pasa al documento, porque es lo que el vendedor necesita
 * saber: mientras esta pendiente no lo puede modificar; si la confirman, el precio
 * nuevo ya esta en el y se quitaron todas sus promociones; si no, el documento sigue
 * como estaba. Y trae la observacion del responsable, tanto si confirmo como si
 * rechazo.
 *
 * La lista —pestañas por estado, buscador, tope de 100— es la de js/ajuste/lista.js.
 *
 * Ver docs/ajuste-precios.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste;
    var M = CDK.marcas;              // nombre()

    var contenido = document.getElementById("contenido");
    if (!contenido) return;

    /* El enlace a «Pedir un ajuste» respeta el subdirectorio donde se sirva la app. */
    var pedir = document.getElementById("ajuste-pedir");
    if (pedir) pedir.setAttribute("href", CDK.rutas.app("/ajuste/ajuste_enviar.html"));

    A.montarLista({
        contenido: contenido,
        pestanas: [
            { estado: "PENDIENTE",  etiqueta: "Pendientes",  vacio: "No tienes ajustes pendientes." },
            { estado: "CONFIRMADA", etiqueta: "Confirmadas", vacio: "Todavía no te han confirmado ningún ajuste." },
            { estado: "RECHAZADA",  etiqueta: "Rechazadas",  vacio: "No te han rechazado ningún ajuste." },
            { estado: "VENCIDA",    etiqueta: "Vencidas",    vacio: "No tienes ajustes vencidos." },
            { estado: "CERRADA",    etiqueta: "Cerradas",    vacio: "No tienes ajustes cerrados." }
        ],
        placeholder: "Buscar por cliente, documento o responsable",
        cargar: function (estado, filtros) { return A.enviadas(Object.assign({ estado: estado }, filtros)); },
        texto: function (s) { return [s.cliente, s.ndocu, s.recibe && s.recibe.nombre]; },
        fila: fila,
        sinAlta: pintarSinAlta
    });

    function pintarSinAlta() {
        contenido.innerHTML = "";
        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "ajuste-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para ver tus ajustes primero tienes que completar tu registro en la intranet." }),
            el("a", { href: CDK.rutas.registro(), clase: "cdk-boton cdk-boton--primario", texto: "Completar mi registro" })
        ]));
    }

    /** Que le pasa al documento, segun como va la solicitud. */
    function notaDe(s) {
        if (s.estado === "PENDIENTE") {
            return "Mientras esté pendiente no puedes modificar el documento." +
                   (s.vence ? " Si nadie responde, se libera el " + CDK.formato.fecha(s.vence, "conHora") : "");
        }
        if (s.estado === "CONFIRMADA") return "Confirmada: los precios nuevos ya están en el documento y se quitaron todas sus promociones.";
        if (s.estado === "RECHAZADA") return "Rechazada: el documento no cambió.";
        if (s.estado === "VENCIDA") return "Venció sin respuesta: el documento se liberó.";
        if (s.estado === "CERRADA") return "Cerrada: el documento avanzó (se aprobó, facturó o anuló) antes de que respondieran.";
        return "";
    }

    function medida(etiqueta, valor) {
        return el("div", { clase: "cdk-medida" }, [
            el("div", { clase: "cdk-medida__fila" }, [
                el("span", { clase: "cdk-medida__etiqueta", texto: etiqueta }),
                el("span", { clase: "cdk-medida__valor", style: "font-weight:500;text-align:right", texto: valor })
            ])
        ]);
    }

    /** Cada linea: como estaba y como quedo, o que no se toco. */
    function lineas(s) {
        var dinero = function (v) { return CDK.formato.moneda(v, s.moneda); };

        var cuerpo = s.lineas.map(function (l) {
            var antes = l.antes.cantidad + " × " + dinero(l.antes.precio) +
                        (l.antes.dsct ? " − " + CDK.formato.porcentaje(l.antes.dsct, 1) : "");
            var despues = l.despues
                ? l.despues.cantidad + " × " + dinero(l.despues.precio) + " (sin descuento)"
                : (s.estado === "CONFIRMADA" ? "Sin ajuste" : "Sin cambios");

            return el("div", { clase: "cdk-linea-ajuste", id: "solicitud-" + s.id + "-linea-" + l.item, style: "margin-top:12px" }, [
                el("div", { clase: "cdk-articulo__nombre", style: "overflow-wrap:anywhere", texto: l.descripcion }),
                el("div", { clase: "cdk-articulo__detalle", texto: M.nombre(l.marca) + " · " + l.codf }),
                medida("Antes", antes),
                medida("Ahora", despues)
            ]);
        });

        return el("details", { clase: "cdk-plegable", style: "margin-top:12px" }, [
            el("summary", { clase: "cdk-plegable__titulo",
                            texto: "Ver " + (s.lineas.length === 1 ? "la línea" : "las " + s.lineas.length + " líneas") })
        ].concat(cuerpo));
    }

    function fila(s) {
        var estado = A.estado(s.estado);
        var responsable = s.recibe ? s.recibe.nombre : "—";

        var datos = [
            { etiqueta: "Para", valor: responsable },
            { etiqueta: "Líneas", valor: s.lineas.length },
            { etiqueta: "", valor: estado.texto, tono: estado.tono }
        ];

        if (s.estado === "PENDIENTE" && s.vence) {
            datos.push({ etiqueta: "Vence", valor: CDK.formato.fecha(s.vence, "conHora"), tono: "alerta" });
        } else if (s.fecrespuesta) {
            datos.push({ etiqueta: "Respondida", valor: CDK.formato.fecha(s.fecrespuesta, "conHora") });
        }

        var detalle = [el("div", { texto: s.cliente })];
        if (s.mensaje) detalle.push(el("div", { clase: "cdk-pista", style: "margin-top:2px", texto: "Escribiste: «" + s.mensaje + "»" }));
        /* La observacion del responsable, tanto si confirmo como si rechazo. */
        if (s.observacion) {
            detalle.push(el("div", { clase: "cdk-pista", id: "solicitud-" + s.id + "-observacion", style: "margin-top:2px",
                                     texto: "Respuesta de " + responsable + ": «" + s.observacion + "»" }));
        }
        detalle.push(el("div", { clase: "cdk-pista", id: "solicitud-" + s.id + "-nota", style: "margin-top:6px", texto: notaDe(s) }));

        var item = CDK.articulo({
            nombre: A.tipoNombre(s.tipo) + " " + s.ndocu,
            importe: CDK.formato.moneda(s.montoEnviado, s.moneda),
            detalle: detalle,
            datos: datos
        });
        item.setAttribute("data-solicitud", s.id);
        item.querySelector(".cdk-articulo__cuerpo").appendChild(lineas(s));
        return item;
    }

})(window);
