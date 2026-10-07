/**
 * La ficha de factura: los siete campos editables en una sola pantalla.
 *
 * Sustituye a las siete pantallas de `factura/`, que eran la misma cosa siete
 * veces y las siete empezaban obligando a buscar otra vez la misma factura.
 *
 * De lo que había, poco sobrevivió sin tocar:
 *
 *   · **Cuatro campos no funcionaban.** Tres pedían a `127.0.0.1` —el propio
 *     equipo del vendedor— y el de dirección tenía la llamada comentada. Por
 *     eso cambiar la observación o la orden de compra no guardaba nada, y
 *     nadie se enteraba: el error moría en un `console.log`.
 *   · **Las siete rutas de lectura ya no existen.** Las reemplaza
 *     `/factura/campos`, que devuelve los siete valores de una vez, con
 *     nombres en vez de posiciones.
 *   · **El guardado no comprobaba nada en el servidor.** Cualquier usuario
 *     autenticado podía cambiarle los campos a cualquier factura sabiendo su
 *     número, y con la clave 5 quitársela a su dueño. Está corregido en el
 *     backend; aquí se deja de mandar nada que el servidor no deba decidir.
 *
 * Ver docs/factura.md y docs/respuesta-factura.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    /* ---------------------------------------------------------------
     * Los siete campos
     *
     * `id` vale a la vez como nombre del dato, clave del bloque `puede` y
     * nombre que se manda a /factura/cambiado. Los tres coinciden desde que
     * el backend unificó `transporte`, que era el único que no.
     *
     * Antes había que mandar una clave numérica —1 despacho, 2 transporte…—
     * porque el nombre no era el mismo en los tres sitios. Ya no.
     * ------------------------------------------------------------- */
    var CAMPOS = [
        { id: "despacho", etiqueta: "Despacho", tipo: "lista",
          ruta: "/factura/despacho/cambio" },

        { id: "transporte", etiqueta: "Transportista", tipo: "busca",
          ruta: "/factura/transporte/cambio",
          pista: "Escribe parte del nombre: hay 358 activos y llegan los 5 que mejor encajan." },

        { id: "atencion", etiqueta: "Atención", tipo: "busca",
          ruta: "/factura/atencion/cambio", porCliente: true,
          pista: "Quién recoge o recibe la mercadería." },

        { id: "direccion", etiqueta: "Dirección de entrega", tipo: "busca",
          ruta: "/factura/direccion/cambio", porCliente: true, filtroLocal: true,
          pista: "Las direcciones registradas de este cliente." },

        { id: "vendedor", etiqueta: "Vendedor asignado", tipo: "busca",
          ruta: "/factura/vendedor/cambio",
          pista: "La factura pasa a ser de otro vendedor." },

        { id: "observacion", etiqueta: "Observación", tipo: "texto",
          pista: "Lo que haya que decir sobre esta factura." },

        { id: "orden", etiqueta: "Orden de compra", tipo: "texto",
          pista: "Corto, letras y números." }
    ];

    var seccionBuscar = document.getElementById("seccion-buscar");
    var seccionFicha = document.getElementById("seccion-ficha");
    var formulario = document.getElementById("form-buscar");
    var entrada = document.getElementById("doc");
    var buscando = document.getElementById("buscando");
    var titulo = document.getElementById("titulo-doc");
    var subFicha = document.getElementById("sub-ficha");
    var destino = document.getElementById("campos");

    var panel = document.getElementById("panel-busca");
    var panelTitulo = document.getElementById("panel-titulo");
    var panelCampo = document.getElementById("panel-campo");
    var panelPista = document.getElementById("panel-pista");
    var panelLista = document.getElementById("panel-lista");

    if (!formulario) return;

    var ficha = null;        // { documento, cliente, valores, puede }
    var abierto = null;      // el id del campo desplegado, si lo hay
    var enPanel = null;      // el campo que está usando el panel
    var cacheLocal = null;   // opciones ya traídas, para el filtro local
    var espera = null;       // temporizador del teclado

    /* ===============================================================
     * Leer la ficha
     * ============================================================= */

    formulario.addEventListener("submit", function (ev) {
        ev.preventDefault();
        buscar(entrada.value.trim());
    });

    function buscar(doc) {
        if (!doc) {
            CDK.toast("Escribe el número de documento", "aviso");
            entrada.focus();
            return;
        }

        CDK.estados.cargando(buscando, "Buscando la factura…");

        CDK.http.post(CDK.rutas.api("/factura/campos"), { doc: doc })
            .then(function (respuesta) {
                CDK.estados.limpiar(buscando);

                var d = (respuesta && respuesta.data) || {};
                ficha = {
                    documento: d.documento || doc,
                    cliente: d.cliente || "",
                    clienteNombre: d.clienteNombre || "",
                    valores: d,
                    puede: respuesta && respuesta.puede ? respuesta.puede : {}
                };
                abrirFicha();
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                /* Un 403 `factura desconocida` cubre cuatro casos a la vez
                   —no existe, es de otro, está anulada o ya tiene guía— y es
                   a propósito: distinguirlos convertiría la ruta en un
                   confirmador de números ajenos. Se enseña su mensaje. */
                CDK.estados.error(buscando, err, function () { buscar(doc); });
            });
    }

    function abrirFicha() {
        seccionBuscar.classList.add("hidden");
        seccionFicha.classList.remove("hidden");
        abierto = null;
        pintar();
    }

    /* ===============================================================
     * Pintar
     * ============================================================= */

    /** El valor que se enseña, y el que se guarda, no siempre son el mismo. */
    function textoDe(campo) {
        var v = ficha.valores[campo.id];
        if (v === undefined || v === null || v === "") return "";
        // Los campos con código traen { codigo, texto }.
        if (typeof v === "object") return v.texto || String(v.codigo || "");
        return String(v);
    }

    /**
     * La atención llega como `NOMBRE|DOCUMENTO|`. Se enseña el nombre y el
     * documento aparte: la barra es de la base, no algo que deba leer quien
     * usa la pantalla. Si algún día deja de venir así, esto no estorba.
     */
    function legible(texto) {
        if (texto.indexOf("|") === -1) return { principal: texto, detalle: "" };
        var partes = texto.split("|").filter(function (p) { return p.trim() !== ""; });
        return { principal: partes[0] || texto, detalle: partes.slice(1).join(" · ") };
    }

    function pintar() {
        titulo.textContent = ficha.documento;

        /* El NOMBRE del cliente, nunca su código. «C13290» no le dice nada a
           quien mira la pantalla, y al cambiar una dirección de entrega lo
           que confirma que se está tocando la factura correcta es la razón
           social. El código se sigue usando por dentro: es lo que pide los
           contactos y las direcciones de ese cliente.

           Es la misma regla que sigue la búsqueda de clientes de Crear
           cotización. */
        subFicha.textContent = ficha.clienteNombre;
        subFicha.classList.toggle("hidden", !ficha.clienteNombre);

        destino.innerHTML = "";

        CAMPOS.forEach(function (campo) {
            var editable = ficha.puede[campo.id] === true;
            var texto = textoDe(campo);
            var partido = legible(texto);

            var grupo = el("div", {
                clase: "cdk-grupo" + (abierto === campo.id ? " cdk-grupo--abierto" : "")
            });

            /* Etiqueta arriba y valor debajo, no uno a cada lado: estos
               valores son direcciones y razones sociales, no importes. */
            var cuerpo = el("div", { clase: "cdk-articulo__cuerpo" }, [
                el("div", { clase: "cdk-ficha-fila" }, [
                    el("span", { clase: "cdk-ficha-fila__etiqueta", texto: campo.etiqueta }),
                    el("span", {
                        clase: "cdk-ficha-fila__valor" +
                               (partido.principal ? "" : " cdk-ficha-fila__valor--vacio"),
                        texto: partido.principal || "Sin asignar"
                    }),
                    partido.detalle
                        ? el("span", { clase: "cdk-ficha-fila__detalle", texto: partido.detalle })
                        : null
                ])
            ]);

            var fila;
            if (editable) {
                fila = el("button", { type: "button", clase: "cdk-articulo cdk-articulo--pulsable" }, [cuerpo]);
                fila.addEventListener("click", function () { alternar(campo); });
            } else {
                /* Sin permiso no desaparece: que no se pueda tocar no
                   significa que no interese verlo. Antes esto era una baldosa
                   que simplemente no salía en el hub. */
                fila = el("div", { clase: "cdk-articulo" }, [cuerpo]);
            }

            grupo.appendChild(fila);

            if (abierto === campo.id && campo.tipo !== "busca") {
                grupo.appendChild(editorEnLinea(campo));
            }

            destino.appendChild(grupo);
        });
    }

    function alternar(campo) {
        if (campo.tipo === "busca") return abrirPanel(campo);
        abierto = abierto === campo.id ? null : campo.id;
        pintar();
    }

    /* ===============================================================
     * Editores en la propia fila: texto libre y listas cortas
     * ============================================================= */

    function editorEnLinea(campo) {
        var caja = el("div", { clase: "cdk-config" });

        if (campo.tipo === "texto") {
            var c = el("div", { clase: "cdk-campo" });
            var input = el("input", { clase: "cdk-entrada", value: textoDe(campo),
                                      placeholder: "Sin " + campo.etiqueta.toLowerCase() });
            c.appendChild(input);
            c.appendChild(el("p", { clase: "cdk-campo__ayuda", texto: campo.pista || "" }));
            caja.appendChild(c);

            var btn = el("button", { type: "button", clase: "cdk-boton cdk-boton--primario",
                                     style: "width:100%", texto: "Guardar" });
            btn.addEventListener("click", function () {
                guardar(campo, input.value, input.value);
            });
            caja.appendChild(btn);
            return caja;
        }

        // Lista corta: despacho, que son tres y fijas.
        CDK.estados.cargando(caja, "Cargando opciones…");

        pedirOpciones(campo, "").then(function (resultado) {
            caja.innerHTML = "";
            var lista = el("div", { clase: "cdk-opciones" });
            resultado.opciones.forEach(function (o) {
                lista.appendChild(botonOpcion(campo, o, ""));
            });
            caja.appendChild(lista);
        }).catch(function (err) {
            if (CDK.http.esError(err) && err.status === 401) return;
            CDK.estados.error(caja, err);
        });

        return caja;
    }

    /* ===============================================================
     * Las opciones
     * ============================================================= */

    /**
     * Devuelve [{ guardar, texto }].
     *
     * Las formas no son iguales: despacho, transportista y vendedor traen
     * `[codigo, texto]`; atención y dirección traen solo el texto. En los dos
     * casos lo que se guarda es la posición 0, porque esas dos columnas
     * guardan texto y no hay nada que traducir.
     */
    function pedirOpciones(campo, termino) {
        var cuerpo = {};
        if (campo.porCliente) cuerpo.cli = ficha.cliente;
        if (!campo.filtroLocal) cuerpo.sugerencia = termino || "";

        return CDK.http.post(CDK.rutas.api(campo.ruta), cuerpo).then(function (respuesta) {
            var crudas = respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;

            var opciones = Object.keys(crudas || {}).map(function (k) {
                var fila = crudas[k];
                if (fila === null || fila === undefined) return null;
                if (typeof fila !== "object") return { guardar: String(fila), texto: String(fila) };
                var cero = fila[0];
                var uno = fila[1];
                return {
                    guardar: cero === undefined || cero === null ? "" : String(cero),
                    texto: uno === undefined || uno === null ? String(cero) : String(uno)
                };
            }).filter(function (o) { return o && o.texto !== ""; });

            /* `total` es cuántas hay con ese filtro, no cuántas vinieron. Es
               lo que permite decir «5 de 207»: sin él, cinco resultados se
               leen igual tanto si son todos como si hay doscientos detrás, y
               quien no encuentra el suyo no sabe si no existe o si tiene que
               seguir escribiendo. */
            return {
                opciones: opciones,
                total: respuesta && respuesta.total !== undefined
                    ? respuesta.total : opciones.length
            };
        });
    }

    function botonOpcion(campo, opcion, termino) {
        var partido = legible(opcion.texto);
        var esActual = opcion.texto === textoDe(campo);

        var linea = el("span", { clase: "cdk-opcion__texto" });
        CDK.resaltar(partido.principal, termino).forEach(function (n) { linea.appendChild(n); });

        var b = el("button", { type: "button", clase: "cdk-opcion" }, [
            linea,
            partido.detalle || esActual
                ? el("span", { clase: "cdk-opcion__detalle",
                               texto: [partido.detalle, esActual ? "el actual" : ""]
                                   .filter(Boolean).join("  ·  ") })
                : null
        ]);

        b.addEventListener("click", function () {
            guardar(campo, opcion.guardar, opcion.texto);
        });
        return b;
    }

    /* ===============================================================
     * El panel, para los campos con muchas opciones
     * ============================================================= */

    function abrirPanel(campo) {
        enPanel = campo;
        cacheLocal = null;
        panelTitulo.textContent = campo.etiqueta;
        panelCampo.value = "";
        panelCampo.placeholder = "Buscar en " + campo.etiqueta.toLowerCase();
        panelPista.textContent = campo.pista || "";
        panelLista.innerHTML = "";
        panel.classList.remove("hidden");
        panelCampo.focus();
        refrescarPanel();
    }

    function cerrarPanel() {
        panel.classList.add("hidden");
        enPanel = null;
        if (espera) { clearTimeout(espera); espera = null; }
    }

    function refrescarPanel() {
        var campo = enPanel;
        if (!campo) return;

        var termino = panelCampo.value.trim();

        /* Dirección es el único que llega entero —el backend no le pone tope—,
           así que se pide una vez y se filtra aquí: así escribir no cuesta un
           viaje por tecla. Los demás los filtra el servidor con LIKE y
           devuelve cinco. */
        if (campo.filtroLocal && cacheLocal) return pintarPanel(cacheLocal, termino);

        CDK.estados.cargando(panelLista, "Buscando…");

        pedirOpciones(campo, termino)
            .then(function (resultado) {
                if (enPanel !== campo) return;        // se cerró mientras llegaba
                if (campo.filtroLocal) cacheLocal = resultado;
                pintarPanel(resultado, termino);
            })
            .catch(function (err) {
                if (enPanel !== campo) return;
                if (CDK.http.esError(err) && err.status === 401) return;
                CDK.estados.error(panelLista, err, refrescarPanel);
            });
    }

    function pintarPanel(resultado, termino) {
        var campo = enPanel;
        var visibles = resultado.opciones;

        if (campo.filtroLocal && termino) {
            var t = termino.toUpperCase();
            visibles = resultado.opciones.filter(function (o) {
                return o.texto.toUpperCase().indexOf(t) !== -1;
            });
        }

        /* Con filtro local se tienen todas, así que lo que se ve ES el total.
           Con filtro en el servidor, no: vienen cinco de las que haya. */
        var hay = campo.filtroLocal ? visibles.length : resultado.total;

        panelPista.textContent = visibles.length < hay
            ? "Se muestran " + visibles.length + " de " + hay + ". Escribe más para acotar."
            : (visibles.length
                ? visibles.length + (visibles.length === 1 ? " opción" : " opciones")
                : (campo.pista || ""));

        panelLista.innerHTML = "";

        if (!visibles.length) {
            panelLista.appendChild(el("p", { clase: "cdk-estado__texto",
                texto: termino
                    ? "Ninguno coincide con «" + termino + "»."
                    : "No hay opciones para este campo." }));
            return;
        }

        var lista = el("div", { clase: "cdk-opciones" });
        visibles.forEach(function (o) { lista.appendChild(botonOpcion(campo, o, termino)); });
        panelLista.appendChild(lista);
    }

    panelCampo.addEventListener("input", function () {
        if (espera) clearTimeout(espera);
        /* Al servidor no se le pregunta por cada tecla. Con el filtro local
           no hace falta esperar nada. */
        espera = setTimeout(refrescarPanel, enPanel && enPanel.filtroLocal ? 0 : 250);
    });

    document.getElementById("panel-cerrar").addEventListener("click", cerrarPanel);
    document.getElementById("panel-fondo").addEventListener("click", cerrarPanel);
    document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape" && !panel.classList.contains("hidden")) cerrarPanel();
    });

    /* ===============================================================
     * Guardar
     * ============================================================= */

    /**
     * `valor` es lo que se manda; `visible` es cómo se llama.
     *
     * En los campos con código no son lo mismo: se guarda `T0001` y la fila
     * tiene que seguir diciendo «COMPUDISKETT S.R.L.». El backend devuelve lo
     * que quedó en la base, que es el código, así que el texto lo pone quien
     * sabe cuál se pulsó.
     */
    function guardar(campo, valor, visible) {
        /* Por nombre, no por clave numérica. Las dos formas conviven en el
           backend, pero `{"2": "T0210"}` no se puede leer sin tener delante
           una tabla que, además, solo existía porque alguien la reconstruyó
           leyendo siete archivos. */
        var cuerpo = { campo: campo.id, valor: valor, doc: ficha.documento };

        CDK.http.post(CDK.rutas.api("/factura/cambiado"), cuerpo)
            .then(function (respuesta) {
                cerrarPanel();
                abierto = null;

                /* Se pinta lo que quedó EN LA BASE, releído por el backend
                   después de guardar, no lo que mandamos. Si normaliza algo,
                   que se vea lo que hay. */
                var guardado = respuesta && respuesta.valor !== undefined
                    ? respuesta.valor : valor;

                var actual = ficha.valores[campo.id];
                if (actual && typeof actual === "object") {
                    ficha.valores[campo.id] = {
                        codigo: guardado,
                        texto: visible || String(guardado)
                    };
                } else {
                    ficha.valores[campo.id] = guardado;
                }

                pintar();
                CDK.toast(campo.etiqueta + " actualizada", "exito");
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;
                cerrarPanel();
                /* `sin permiso`, `factura desconocida` y `campo desconocido`
                   llegan como 4xx con su mensaje. Ninguno se arregla
                   repitiendo, así que no se ofrece reintentar. */
                CDK.estados.error(destino, err);
            });
    }

    document.getElementById("btn-volver").addEventListener("click", function () {
        seccionFicha.classList.add("hidden");
        seccionBuscar.classList.remove("hidden");
        ficha = null;
        entrada.select();
    });

})();
