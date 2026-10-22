/**
 * Ajustes recibidos (grupo 25): las cotizaciones y pedidos que los vendedores
 * enviaron para que se les ajuste el precio.
 *
 * Cada solicitud trae solo las lineas de las marcas de quien la recibe: el dueño de
 * la marca este mes o, si no tiene, la jefatura de su familia. Aqui se ve la lista;
 * ajustar se hace en la solicitud (ajuste_solicitud.html).
 *
 * La lista —pestañas por estado, buscador, tope de 100— es la de js/ajuste/lista.js.
 * Se entra por las pendientes, que son las que piden algo: a los 3 dias sin respuesta
 * se pierden, asi que llevan la fecha en que vencen.
 *
 * Ver docs/ajuste-precios.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    var el = CDK.el;
    var A = CDK.ajuste;

    var contenido = document.getElementById("contenido");
    if (!contenido) return;

    A.montarLista({
        contenido: contenido,
        pestanas: [
            { estado: "PENDIENTE",  etiqueta: "Pendientes",  vacio: "No tienes solicitudes pendientes." },
            { estado: "CONFIRMADA", etiqueta: "Confirmadas", vacio: "Todavía no has confirmado ninguna solicitud." },
            { estado: "RECHAZADA",  etiqueta: "Rechazadas",  vacio: "No has rechazado ninguna solicitud." },
            { estado: "VENCIDA",    etiqueta: "Vencidas",    vacio: "No tienes solicitudes vencidas." },
            { estado: "CERRADA",    etiqueta: "Cerradas",    vacio: "No tienes solicitudes cerradas." }
        ],
        placeholder: "Buscar por cliente, documento o vendedor",
        cargar: function (estado, filtros) { return A.recibidas(Object.assign({ estado: estado }, filtros)); },
        texto: function (s) { return [s.cliente, s.ndocu, s.envia && s.envia.nombre]; },
        fila: fila,
        sinAlta: pintarSinAlta
    });

    function pintarSinAlta() {
        contenido.innerHTML = "";
        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "ajuste-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para recibir solicitudes de ajuste primero tienes que completar tu registro en la intranet." }),
            el("a", { href: CDK.rutas.registro(), clase: "cdk-boton cdk-boton--primario", texto: "Completar mi registro" })
        ]));
    }

    function fila(s) {
        var estado = A.estado(s.estado);

        var datos = [
            { etiqueta: "De", valor: s.envia ? s.envia.nombre : "—" },
            { etiqueta: "Líneas", valor: s.lineas },
            { etiqueta: "", valor: estado.texto, tono: estado.tono }
        ];

        /* A los 3 dias sin respuesta se pierde: lo que importa de una pendiente es cuando. */
        if (s.estado === "PENDIENTE" && s.vence) {
            datos.push({ etiqueta: "Vence", valor: CDK.formato.fecha(s.vence, "conHora"), tono: "alerta" });
        } else if (s.fecrespuesta) {
            datos.push({ etiqueta: "Respondida", valor: CDK.formato.fecha(s.fecrespuesta, "conHora") });
        }

        var detalle = [el("div", { texto: s.cliente })];
        if (s.mensaje) detalle.push(el("div", { clase: "cdk-pista", style: "margin-top:2px", texto: "«" + s.mensaje + "»" }));
        /* Lo que se le dijo al vendedor al responder, para no tener que abrirla. */
        if (s.observacion) detalle.push(el("div", { clase: "cdk-pista", style: "margin-top:2px", texto: "Tu observación: «" + s.observacion + "»" }));

        var item = CDK.articulo({
            nombre: A.tipoNombre(s.tipo) + " " + s.ndocu,
            importe: CDK.formato.moneda(s.montoEnviado, s.moneda),
            detalle: detalle,
            datos: datos,
            alPulsar: function () { abrir(s); }
        });
        item.setAttribute("data-solicitud", s.id);
        return item;
    }

    function abrir(s) {
        location.assign(CDK.rutas.app("/ajuste/ajuste_solicitud.html") + "?id=" + encodeURIComponent(s.id));
    }

})(window);
