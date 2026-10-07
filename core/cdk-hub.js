/**
 * cdk-hub.js — Pinta las acciones disponibles dentro de un modulo.
 *
 * Es el reemplazo de las 7 copias de `manejar_acceso()` + `permisos_dinamicos()`
 * + `enlaces_de_permisos()` + `direccionador_de_permisos()` que vivian en
 * <script> inline dentro de cotizacion.html, factura.html, cuota.html,
 * listas.html, pedido.html, programador.html y promocion.html.
 *
 * Los 7 hubs pasan a ser el mismo archivo con otro `data-modulo`: el unico
 * <script> propio que necesitan es este.
 *
 * Se carga DESPUES del bloque core, solo en las paginas hub.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK;
    if (!CDK || !CDK.shell) {
        console.error("[CDK] cdk-hub.js requiere el bloque core cargado antes.");
        return;
    }

    var modulo = document.body.getAttribute("data-modulo");
    var destino = document.getElementById("cdk-acciones");

    if (!modulo || !destino) return;

    function tarjeta(acceso) {
        var contenido = [
            CDK.el("span", { clase: "cdk-tarjeta__icono" }, [CDK.svg(CDK.catalogo.iconos.generico, "cdk-icono")]),
            CDK.el("span", { clase: "cdk-tarjeta__titulo", texto: acceso.etiqueta }),
            CDK.el("span", { clase: "cdk-tarjeta__texto", texto: acceso.descripcion || "" })
        ];

        // Acceso concedido por el backend pero que no se opera desde esta
        // intranet: se muestra sin enlace, no se manda al usuario a un 404.
        if (!acceso.existe) {
            contenido.push(CDK.el("span", { clase: "cdk-tarjeta__pie", texto: "No disponible aquí" }));
            return CDK.el("li", {}, [
                CDK.el("div", { clase: "cdk-tarjeta cdk-tarjeta--inerte" }, contenido)
            ]);
        }

        contenido.push(CDK.el("span", { clase: "cdk-tarjeta__pie", texto: "Abrir →" }));
        return CDK.el("li", {}, [
            CDK.el("a", { href: acceso.href, clase: "cdk-tarjeta" }, contenido)
        ]);
    }

    function pintar(claves) {
        var accesos = (claves || [])
            .map(function (clave) { return CDK.catalogo.acceso(modulo, clave); })
            .filter(Boolean);

        /* Dos permisos que abren la MISMA pantalla son una sola tarjeta.
           Pasa en factura: sus siete permisos no son siete acciones, son
           siete campos de una misma ficha, y el backend dice dentro de ella
           cuáles puede tocar cada uno. Sin esto el hub pintaría siete
           baldosas idénticas al mismo sitio. */
        var vistas = {};
        accesos = accesos.filter(function (a) {
            var clave = a.href || a.etiqueta;
            if (vistas[clave]) return false;
            vistas[clave] = true;
            return true;
        });

        // Un permiso que el backend concede y el catalogo no conoce: se avisa en
        // consola en vez de desaparecer en silencio.
        var desconocidos = (claves || []).filter(function (clave) {
            return !CDK.catalogo.acceso(modulo, clave);
        });
        if (desconocidos.length) {
            console.warn("[CDK] permisos sin declarar en cdk-catalogo.js para '" + modulo + "':", desconocidos);
        }

        if (!accesos.length) {
            CDK.estados.vacio(destino, "No tienes acciones habilitadas en este módulo.");
            return;
        }

        /* Todas concedidas pero ninguna operable desde aquí. Pasa en
           Programador, cuyas tres acciones están pendientes de construir.
           Tres baldosas apagadas una al lado de otra parecen un fallo; una
           frase dice lo mismo y no promete nada. */
        if (accesos.every(function (a) { return !a.existe; })) {
            CDK.estados.vacio(destino,
                "Este módulo todavía no se opera desde la intranet. Está previsto.");
            return;
        }

        var lista = CDK.el("ul", { clase: "cdk-tarjetas" });
        accesos.forEach(function (acceso) { lista.appendChild(tarjeta(acceso)); });

        destino.innerHTML = "";
        destino.appendChild(lista);
    }

    function cargar() {
        CDK.estados.cargando(destino, "Cargando acciones…");

        CDK.permisos.accesos(modulo)
            .then(pintar)
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                // Antes esto era un console.log y la pagina quedaba en blanco.
                CDK.estados.error(destino, err, cargar);
            });
    }

    cargar();

})(window);
