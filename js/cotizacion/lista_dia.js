/**
 * La lista de «mis cotizaciones», compartida.
 *
 * La usan Ver, Modificar y Cambiar almacén: las tres necesitan lo mismo —elegir
 * una cotización propia sin teclear el número, porque nadie se lo acuerda—.
 * Estaba escrita dos veces y a punto de escribirse una tercera.
 *
 * **Filtra por el vendedor de la galleta, y eso es lo que la hace segura.**
 * /lista/cotisxdia no acepta un código de vendedor: usa el `codven` que viaja
 * dentro de `cdk`, así que por este camino es imposible llegar a la cotización
 * de otro. Buscar por número, que cada pantalla ofrece aparte, no tiene esa
 * garantía, pero el backend ya la valida igual: ver docs/autorizacion-cotizacion.md.
 *
 *   CDK.coti.listaDelDia({
 *       destino:      document.getElementById("lista-cotis"),
 *       botonHoy:     document.getElementById("btn-hoy"),
 *       botonDosDias: document.getElementById("btn-dos-dias"),
 *       // true deja fuera las que el backend no va a aceptar: facturadas,
 *       // convertidas y aprobadas
 *       soloAbiertas: true,
 *       alElegir:     function (coti) { … },
 *
 *       // opcional: la elección va en un botón de la fila, no en la fila
 *       accionPorFila: { texto: "Dar de baja", peligro: true }
 *   });
 *
 * Devuelve { recargar } por si hay que repetirla después de guardar algo.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    CDK.coti = CDK.coti || {};

    var el = CDK.el;

    /* Posiciones de cada fila. Son las mismas que usa el módulo Listas: las
       seis primeras valen igual para cotizaciones, facturas y pedidos, y de
       la 6 en adelante va lo que solo tiene cotización.

       Este mapa y el de js/listas/lista.js son los dos únicos sitios del
       frontend donde viven estas posiciones. Si el backend las vuelve a
       mover, son dos archivos. Ver docs/listas-modulo.md. */
    var LISTA = {
        fecha:      0,
        documento:  1,
        cliente:    2,
        total:      3,   // CON IGV
        moneda:     4,
        registrado: 5,
        estado:     6,   // cotizado · facturado · boleta · pedido

        /* 1 si la cotización sigue abierta y SIN APROBAR. Es un booleano ya
           resuelto por el backend, no el `flag` crudo: vale 1 exactamente
           cuando /update, /almacen y /eliminar la van a aceptar.

           Hace falta porque el estado de la posición 6 no basta. Una
           cotización aprobada se rotula igual, `cotizado`, y antes se colaba
           en las listas de las pantallas que escriben: el vendedor hacía el
           trabajo para que el backend lo rechazara al guardar. Hay 626 así. */
        editable:   7
    };

    /**
     * La hora de "2026-09-26 13:57:38".
     *
     * Se usa la posición 5 y no la 0 porque la fecha siempre viene a las
     * 00:00:00 y no distingue dos cotizaciones del mismo día. Las listas ya
     * vienen ordenadas por esta misma, la última primero.
     */
    function horaDe(registrado) {
        var partes = String(registrado).split(" ");
        return partes.length > 1 ? partes[1].slice(0, 5) : "";
    }

    function leerFila(cruda) {
        if (!cruda || typeof cruda !== "object") return null;

        var f = {};
        Object.keys(LISTA).forEach(function (nombre) { f[nombre] = cruda[LISTA[nombre]]; });

        if (!f.documento) return null;
        f.documento = String(f.documento);
        f.moneda = f.moneda === "S" ? "S" : "D";

        /* Si el backend manda la posición 7, manda ella. Si no viniera -un
           despliegue anterior-, se cae al texto del estado, que es lo que se
           usaba antes: peor, pero no deja la lista vacía. */
        f.editable = f.editable === undefined || f.editable === null
            ? String(f.estado || "").toLowerCase() === "cotizado"
            : String(f.editable) === "1";

        return f;
    }

    CDK.coti.listaDelDia = function (config) {
        var destino = config.destino;
        var dias = 1;

        function cuerpoPeriodo() {
            if (dias === 1) return { dia: CDK.formato.hoyISO() };
            var ayer = new Date(Date.now() - 86400000);
            return { desde: CDK.formato.aISO(ayer), hasta: CDK.formato.hoyISO() };
        }

        function cargar() {
            CDK.estados.cargando(destino, "Buscando tus cotizaciones…");

            CDK.http.post(CDK.rutas.api("/lista/cotisxdia"), cuerpoPeriodo())
                .then(pintar)
                .catch(function (err) {
                    if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                    CDK.estados.error(destino, err, cargar);
                });
        }

        function pintar(respuesta) {
            // Por si algún día estas rutas pasan al sobre { status, codigo, data }.
            var crudas = respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
            var filas = Object.keys(crudas || {}).map(function (k) { return crudas[k]; });
            var cotis = filas.map(leerFila).filter(Boolean);

            /* Una facturada o convertida en pedido ya no se toca, así que las
               pantallas que escriben no la ofrecen: prometerla sería dejar que
               el vendedor haga el trabajo para que el backend lo rechace. */
            var visibles = config.soloAbiertas
                ? cotis.filter(function (c) { return c.editable; })
                : cotis;

            destino.innerHTML = "";

            if (!visibles.length) {
                destino.appendChild(el("div", { clase: "cdk-estado" }, [
                    el("p", { clase: "cdk-estado__texto", texto: textoVacio(filas.length) })
                ]));
                return;
            }

            var lista = el("ul", { clase: "cdk-articulos" });

            // Ya vienen ordenadas, la última primero, así que no se reordenan.
            visibles.forEach(function (c) {
                var datos = [];

                /* El estado solo se señala cuando NO está abierta: una etiqueta
                   "cotizado" en todas las filas es ruido, y la ya facturada es
                   justo la que conviene distinguir. */
                if (!c.editable && c.estado) {
                    datos.push({ etiqueta: "", valor: c.estado, tono: "bien" });
                }

                /* Con `accionPorFila` la elección va en un botón dentro de la
                   fila, no en la fila entera. Lo usa «Dar de baja»: la acción
                   es irreversible, y una fila que se dispara al tocarla en
                   cualquier punto es demasiado fácil de activar sin querer en
                   un móvil. */
                var accion = config.accionPorFila;

                lista.appendChild(CDK.articulo({
                    nombre: c.cliente || "(cliente sin nombre)",
                    detalle: c.documento + (c.registrado ? "  ·  " + horaDe(c.registrado) : ""),
                    importe: c.total === undefined || c.total === null
                        ? ""
                        : CDK.formato.moneda(c.total, c.moneda),
                    datos: datos,
                    acciones: accion ? [{
                        texto: accion.texto,
                        peligro: accion.peligro,
                        alPulsar: function () { config.alElegir(c); }
                    }] : null,
                    alPulsar: accion ? null : function () { config.alElegir(c); }
                }));
            });

            destino.appendChild(lista);
        }

        function textoVacio(cuantasLlegaron) {
            if (!cuantasLlegaron) {
                return dias === 1
                    ? "No tienes cotizaciones de hoy. Prueba con 2 días."
                    : "No tienes cotizaciones en los últimos 2 días.";
            }
            // Llegaron, pero ninguna sirve para lo que hace esta pantalla.
            return "Tus cotizaciones de este periodo ya están facturadas o convertidas, " +
                   "así que no se pueden cambiar.";
        }

        function fijarDias(n) {
            dias = n;
            [[config.botonHoy, 1], [config.botonDosDias, 2]].forEach(function (par) {
                if (!par[0]) return;
                par[0].setAttribute("aria-pressed", String(n === par[1]));
                par[0].className = "cdk-boton " +
                    (n === par[1] ? "cdk-boton--primario" : "cdk-boton--suave");
            });
            cargar();
        }

        if (config.botonHoy) {
            config.botonHoy.addEventListener("click", function () { fijarDias(1); });
        }
        if (config.botonDosDias) {
            config.botonDosDias.addEventListener("click", function () { fijarDias(2); });
        }

        cargar();

        return { recargar: cargar };
    };

})(window);
