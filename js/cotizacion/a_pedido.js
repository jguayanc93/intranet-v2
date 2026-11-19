/**
 * Pasar una cotización a pedido (grupos 20 y 25, desde el 18/11/2026).
 *
 * Contrato: docs/coti-a-pedido.md. Tres rutas, las tres POST:
 *
 *   /cotizacion/pedido/opciones        ¿se puede?, direcciones del cliente, tipos de entrega
 *   /cotizacion/pedido/transportista   buscar transportista, de cinco en cinco (solo provincia)
 *   /cotizacion/pedido                 convertir
 *
 * El flujo:
 *
 *   1. Se elige una cotización propia de la lista (o por número, con serie).
 *      La lista no sabe si está aprobada: su `editable` vale 1 solo si está
 *      abierta y SIN aprobar, así que se ofrecen todas las `cotizado` y se
 *      marcan las «sin aprobar». Quien decide es `opciones`.
 *   2. `opciones`: si `convertible` es false, se dice el motivo y no hay
 *      formulario. Si es true, se piden el tipo de entrega, el transportista
 *      (fijo en ventanilla y Lima, a elegir en provincia), una de las
 *      direcciones registradas, el consignatario y la observación.
 *   3. Se confirma, se convierte y se enseña el pedido: queda pendiente de
 *      aprobación en el ERP y no separa stock hasta entonces.
 *
 * Todo va en una sola operación del backend: un 400, 403 o 409 no grabó nada,
 * y un 500 se revirtió entero. Por eso reintentar nunca duplica: si el pedido
 * ya se hubiera creado, el segundo intento recibe `409 coti ya convertida`.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    var RUTA_OPCIONES = "/cotizacion/pedido/opciones";
    var RUTA_TRANSPORTISTA = "/cotizacion/pedido/transportista";
    var RUTA_CONVERTIR = "/cotizacion/pedido";

    var PROVINCIA = 4;

    /* Los nombres del ERP son «Desp.Ventanilla», «Desp. Local (Lima)» y
       «Desp. Provincia». En tres botones juntos se lee mejor la palabra que
       los distingue; uno que no esté aquí sale con el nombre del ERP. */
    var ENTREGAS = { 1: "Ventanilla", 3: "Lima", 4: "Provincia" };

    /* `opciones` trae el código del transportista fijo, no su nombre. */
    var TRANSPORTISTAS_FIJOS = { T0001: "COMPUDISKETT S.R.L." };

    /* `documento_generado.cdocu`: 32 pedido, 01 factura, 03 boleta. */
    var DOCUMENTOS = { "32": "el pedido", "01": "la factura", "03": "la boleta" };

    /* Por qué `convertible` es false. Son las mismas claves que daría el error
       al convertir, así que sirven a los dos. */
    var MOTIVOS = {
        "coti sin aprobar":    "Todavía no está aprobada. Cuando la aprueben en el ERP la podrás pasar a pedido.",
        "coti ya convertida":  "Ya generó un documento, así que no se puede volver a pasar a pedido.",
        "coti ya anulada":     "Fue dada de baja: ya no se puede pasar a pedido.",
        "coti fuera de plazo": "Tiene más de 5 días, sin contar el domingo: ya no se puede pasar a pedido. Si el cliente la quiere, haz una cotización nueva.",
        "documento en ajuste": "Está en ajuste de precio con el grupo 25. Cuando terminen el ajuste la podrás pasar a pedido."
    };

    /* El título de cada rechazo al convertir (sección 7). El texto es el `msg`
       del backend; si no viniera, el de respaldo. */
    var TITULOS = {
        "transportista invalido": "Elige el transportista",
        "direccion invalida":     "Elige una dirección de la lista",
        "tipo entrega invalido":  "Tipo de entrega no válido",
        "documento ambiguo":      "Falta la serie",
        "cotizacion vacia":       "La cotización no tiene líneas",
        "coti desconocida":       "No se encontró la cotización",
        "sin permiso":            "No tienes permiso",
        "coti sin aprobar":       "Todavía no está aprobada",
        "coti ya convertida":     "Ya se pasó a pedido",
        "coti ya anulada":        "La cotización fue dada de baja",
        "coti fuera de plazo":    "Se pasó el plazo",
        "documento en ajuste":    "Está en ajuste de precio",
        "pedido no creado":       "No se creó el pedido",
        "error query":            "No se creó el pedido"
    };

    var RESPALDO = {
        "transportista invalido": "Ese transportista no existe o ya no está activo.",
        "direccion invalida":     "La dirección tiene que ser una de las registradas del cliente.",
        "coti desconocida":       "La cotización no existe o no es tuya.",
        "sin permiso":            "Tu grupo no puede pasar cotizaciones a pedido."
    };

    /* Después de estos, lo que hay en pantalla ya no vale: se vuelve a
       preguntar a `opciones`, que dice en qué quedó la cotización. */
    var DESFASADOS = ["coti sin aprobar", "coti ya convertida", "coti ya anulada", "coti fuera de plazo", "documento en ajuste", "coti desconocida"];

    /* El backend lo revirtió todo: se puede reintentar sin miedo. */
    var DEL_SERVIDOR = ["pedido no creado", "error query"];

    var $ = function (id) { return document.getElementById(id); };

    var seccionElegir = $("seccion-elegir");
    var seccionPedido = $("seccion-pedido");
    var listaCotis = $("lista-cotis");
    var formBuscar = $("form-buscar");
    var entrada = $("ncoti");
    var rotCliente = $("pedido-cliente");
    var rotDocumento = $("pedido-documento");
    var cuerpo = $("pedido-cuerpo");

    if (!seccionElegir || !seccionPedido) return;

    var permisos = [];
    var listaDia = null;

    var actual = null;     // la cotización elegida: { documento, cliente, total, moneda }
    var opciones = null;   // la respuesta de `opciones`
    var eleccion = null;   // { tipo, tipent, transportista: { codigo, nombre, fijo } | null, direccion }
    var vuelta = 0;        // cada cotización abierta suma uno: una respuesta de otra vuelta se descarta
    var busquedaT = 0;     // lo mismo para el buscador de transportistas
    var esperaT = null;

    $("btn-otra").addEventListener("click", volver);

    /* ---------------------------------------------------------------
     * El permiso, antes que nada
     *
     * `pedido` solo llega a los grupos 20 y 25. El hub ya no pinta la tarjeta
     * sin él, pero a esta página también se llega por la dirección o desde
     * «Ver». Es presentación: el backend responde `403 sin permiso` igual.
     * ------------------------------------------------------------- */
    CDK.permisos.accesos("cotizacion")
        .then(function (lista) {
            permisos = lista || [];
            if (permisos.indexOf("pedido") === -1) return sinPermiso();
            montar();
        })
        .catch(function () {
            // Si no se pudo saber, se monta igual: decide el backend.
            montar();
        });

    function sinPermiso() {
        CDK.estados.error(listaCotis,
            "Tu grupo no puede pasar cotizaciones a pedido. Si crees que debería, avisa al equipo de sistemas.", null);

        var periodo = seccionElegir.querySelector("[role=group]");
        if (periodo) periodo.classList.add("hidden");
        var plegable = formBuscar.closest("details");
        if (plegable) plegable.classList.add("hidden");
    }

    function montar() {
        listaDia = CDK.coti.listaDelDia({
            destino: listaCotis,
            /* Se pasan hasta con 5 días de antigüedad, sin contar el domingo
               (contrato del 19/11): «6 días» es hoy y los 5 anteriores, todo
               el plazo. Más atrás no se ofrece nada: ya no se podría pasar. */
            periodos: [
                { boton: $("btn-hoy"), dias: 1 },
                { boton: $("btn-tres"), dias: 3 },
                { boton: $("btn-seis"), dias: 6 }
            ],
            diasIniciales: 6,
            sinDomingos: true,

            /* Las que siguen siendo cotización. Las que ya pasaron a pedido o
               se facturaron no se ofrecen; las anuladas no llegan. */
            filtro: function (c) { return String(c.estado || "").toLowerCase() === "cotizado"; },

            /* `editable` 1 = abierta y sin aprobar: esa seguro que no. Con 0 y
               `cotizado`, está aprobada (o, rara vez, en ajuste: lo dirá
               `opciones` al abrirla). */
            etiqueta: function (c) {
                return c.editable
                    ? { etiqueta: "", valor: "sin aprobar", tono: "nulo" }
                    : { etiqueta: "", valor: "aprobada", tono: "bien" };
            },

            textoVacio: function (llegaron, dias) {
                if (llegaron) return "Las cotizaciones de este periodo ya pasaron a pedido o se facturaron.";
                if (dias === 1) return "No tienes cotizaciones de hoy. Prueba con 6 días.";
                if (dias < 6) return "No tienes cotizaciones en los últimos " + dias + " días. Prueba con 6.";
                return "No tienes cotizaciones en los últimos 6 días, sin contar el domingo. " +
                       "Las más antiguas ya no se pueden pasar a pedido.";
            },

            alElegir: elegir
        });

        formBuscar.addEventListener("submit", function (ev) {
            ev.preventDefault();
            var numero = entrada.value.trim();

            /* Sin serie el backend no sabe cuál es (`400 documento ambiguo`):
               se dice aquí, sin viajar. */
            if (!/^\d+-\d+$/.test(numero)) {
                CDK.toast("Escribe el número con su serie, por ejemplo 098-00000055", "aviso");
                entrada.focus();
                return;
            }
            elegir({ documento: numero });
        });

        // Desde «Ver» se llega con ?ncoti=, y la cotización se abre directamente.
        var pedida = new URLSearchParams(location.search).get("ncoti");
        if (pedida) elegir({ documento: pedida });
    }

    /* ===============================================================
     * Elegir y volver
     * ============================================================= */

    function elegir(coti) {
        actual = {
            documento: String(coti.documento),
            cliente: coti.cliente || "",
            total: coti.total,
            moneda: coti.moneda === "S" ? "S" : "D"
        };

        seccionElegir.classList.add("hidden");
        seccionPedido.classList.remove("hidden");
        rotCliente.textContent = actual.cliente || "Cotización " + actual.documento;
        rotDocumento.textContent = rotuloDocumento();
        if (seccionPedido.scrollIntoView) seccionPedido.scrollIntoView({ block: "start" });

        cargarOpciones();
    }

    function rotuloDocumento() {
        var partes = [actual.documento];
        if (actual.total !== undefined && actual.total !== null && actual.total !== "") {
            partes.push(CDK.formato.moneda(actual.total, actual.moneda) + " con IGV");
        }
        return partes.join("  ·  ");
    }

    function volver() {
        vuelta++;
        actual = null;
        opciones = null;
        eleccion = null;
        cuerpo.innerHTML = "";
        seccionPedido.classList.add("hidden");
        seccionElegir.classList.remove("hidden");
    }

    /* ===============================================================
     * Opciones
     * ============================================================= */

    function cargarOpciones() {
        var mia = ++vuelta;
        opciones = null;
        eleccion = { tipo: null, tipent: null, transportista: null, direccion: null };

        CDK.estados.cargando(cuerpo, "Revisando si se puede pasar a pedido…");

        CDK.http.post(CDK.rutas.api(RUTA_OPCIONES), { ndocu: actual.documento })
            .then(function (r) {
                if (mia !== vuelta) return;
                if (!r || (r.status && r.status !== "ok")) {
                    return CDK.estados.error(cuerpo, (r && r.msg) || "El servidor no dijo si se puede pasar a pedido.", cargarOpciones);
                }
                pintarOpciones(r);
            })
            .catch(function (err) {
                if (mia !== vuelta) return;
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                CDK.estados.error(cuerpo, err, cargarOpciones);
            });
    }

    function pintarOpciones(r) {
        opciones = r;
        if (r.cliente && r.cliente.nomcli) rotCliente.textContent = r.cliente.nomcli;
        if (r.documento) actual.documento = String(r.documento);
        rotDocumento.textContent = rotuloDocumento();

        cuerpo.innerHTML = "";
        if (!r.convertible) return pintarNoConvertible(r);

        /* Con una sola dirección no hay nada que elegir. */
        var dirs = r.direcciones || [];
        if (dirs.length === 1) eleccion.direccion = dirs[0];

        pintarFormulario();
    }

    function textoMotivo(motivo) {
        if (MOTIVOS[motivo]) return MOTIVOS[motivo];
        // Un motivo que no conocemos se dice tal cual: mejor que callarlo.
        return motivo ? "No se puede pasar a pedido: " + motivo + "." : "No se puede pasar a pedido.";
    }

    function pintarNoConvertible(r) {
        var hijos = [el("p", { clase: "cdk-aviso__texto", texto: textoMotivo(r.motivo) })];

        var gen = r.documento_generado;
        if (gen && gen.ndocu) {
            hijos.push(el("p", { clase: "cdk-aviso__texto", id: "pedido-generado", style: "margin-top:6px",
                texto: "Generó " + (DOCUMENTOS[String(gen.cdocu)] || "el documento") + " " + gen.ndocu + "." }));
        }

        cuerpo.appendChild(el("div", { clase: "cdk-aviso", id: "pedido-motivo", role: "status" }, [
            el("div", { style: "flex:1;min-width:0" }, hijos)
        ]));
    }

    /* ===============================================================
     * El formulario
     * ============================================================= */

    /* Los días que le quedan a una convertible: `plazo` − `antiguedad`, los dos
       sin domingos. Con 0, hoy es el último. Sin los campos, null. */
    function textoPlazo(r) {
        if (typeof r.antiguedad !== "number" || typeof r.plazo !== "number") return null;
        var n = r.plazo - r.antiguedad;
        if (n < 0) return null;
        if (n === 0) return { ultimo: true, texto: "Hoy es el último día para pasarla a pedido." };
        return { ultimo: false, texto: "Te " + (n === 1 ? "queda 1 día más" : "quedan " + n + " días más") +
                                        " para pasarla a pedido, sin contar el domingo." };
    }

    function pintarFormulario() {
        var r = opciones;
        var form = el("form", { id: "form-pedido", novalidate: "novalidate" });

        /* --- cuánto le queda: `antiguedad` y `plazo` de `opciones` (19/11). El último
           día se destaca; si no vinieran, no se dice nada. --- */
        var plazo = textoPlazo(r);
        if (plazo) {
            form.appendChild(plazo.ultimo
                ? el("div", { clase: "cdk-aviso", id: "pedido-plazo", role: "status", style: "margin-bottom:12px" }, [
                      el("p", { clase: "cdk-aviso__texto", texto: plazo.texto })
                  ])
                : el("p", { clase: "cdk-pista", id: "pedido-plazo", style: "margin:0 0 12px", texto: plazo.texto }));
        }

        /* --- tipo de entrega --- */
        var pestanas = el("ul", { clase: "cdk-pestanas", id: "entregas", style: "margin-bottom:0" },
            (r.tipos_entrega || []).map(function (t) {
                var b = el("button", {
                    type: "button", clase: "cdk-pestana", id: "entrega-" + t.tipent,
                    "aria-pressed": "false", texto: ENTREGAS[t.tipent] || t.nombre
                });
                b.addEventListener("click", function () { elegirEntrega(t); });
                return el("li", null, [b]);
            }));

        form.appendChild(el("div", { clase: "cdk-campo", role: "group", "aria-labelledby": "etq-entrega" }, [
            el("p", { clase: "cdk-campo__etiqueta", id: "etq-entrega", texto: "Tipo de entrega" }),
            pestanas,
            el("p", { clase: "cdk-campo__error hidden", id: "error-entrega", role: "alert" })
        ]));

        /* --- transportista y dirección: se repintan solos --- */
        form.appendChild(el("div", { clase: "cdk-campo hidden", id: "campo-transportista" }));
        form.appendChild(el("div", { clase: "cdk-campo", id: "campo-direccion" }));

        /* --- consignatario --- */
        form.appendChild(el("div", { clase: "cdk-campo" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "consig", texto: "Consignatario (opcional)" }),
            el("input", { type: "text", id: "consig", clase: "cdk-entrada", maxlength: "60", autocomplete: "off",
                          value: r.consignatario_sugerido || "" }),
            el("p", { clase: "cdk-campo__ayuda", texto: "Quién recibe. Viene con la atención de la cotización; hasta 60 caracteres." })
        ]));

        /* --- observación --- */
        form.appendChild(el("div", { clase: "cdk-campo" }, [
            el("label", { clase: "cdk-campo__etiqueta", "for": "obse", texto: "Observación (opcional)" }),
            el("textarea", { id: "obse", clase: "cdk-entrada", rows: "3" }),
            el("p", { clase: "cdk-campo__ayuda",
                      texto: "Se graba junto al consignatario y, en provincia, el transportista, como en los pedidos de la web." })
        ]));

        /* --- lo que lleva el pedido --- */
        var pista = el("p", { clase: "cdk-pista", id: "pedido-lleva", style: "margin:0 0 12px" }, [
            document.createTextNode("El pedido lleva todas las líneas como están en la cotización: precios, descuentos, " +
                                    "promociones y el almacén de cada una.")
        ]);
        var almacen = CDK.catalogo.acceso("cotizacion", "alm");
        if (permisos.indexOf("alm") !== -1 && almacen && almacen.existe) {
            pista.appendChild(document.createTextNode(" "));
            pista.appendChild(el("a", { href: almacen.href + "?ncoti=" + encodeURIComponent(actual.documento),
                                        id: "pedido-almacen", texto: "Cambiar el almacén antes" }));
        }
        form.appendChild(pista);

        var boton = el("button", { type: "submit", id: "btn-convertir", clase: "cdk-boton cdk-boton--primario",
                                   style: "width:100%", texto: "Pasar a pedido" });
        form.appendChild(boton);

        form.addEventListener("submit", function (ev) {
            ev.preventDefault();
            validarYConfirmar();
        });

        cuerpo.appendChild(form);
        pintarTransportista();
        pintarDireccion();
    }

    function elegirEntrega(t) {
        eleccion.tipo = t;
        eleccion.tipent = Number(t.tipent);

        if (t.transportista) {
            eleccion.transportista = {
                codigo: t.transportista,
                nombre: TRANSPORTISTAS_FIJOS[t.transportista] || t.transportista,
                fijo: true
            };
        } else if (eleccion.transportista && eleccion.transportista.fijo) {
            // De Lima a provincia: el fijo no vale, hay que elegir.
            eleccion.transportista = null;
        }

        var pestanas = $("entregas").querySelectorAll(".cdk-pestana");
        Array.prototype.forEach.call(pestanas, function (b) {
            var activa = b.id === "entrega-" + t.tipent;
            b.classList.toggle("es-activa", activa);
            b.setAttribute("aria-pressed", String(activa));
        });

        ocultarError("entrega");
        pintarTransportista();
    }

    /* --- un dato ya elegido, con «Cambiar» si se puede cambiar --- */
    function elegido(id, nombre, detalle, alCambiar) {
        var hijos = [el("div", { clase: "cdk-elegido__datos" }, [
            el("div", { clase: "cdk-elegido__nombre", texto: nombre }),
            el("div", { clase: "cdk-elegido__detalle", texto: detalle || "" })
        ])];
        if (alCambiar) {
            var b = el("button", { type: "button", clase: "cdk-boton cdk-boton--suave", id: id + "-cambiar", texto: "Cambiar" });
            b.addEventListener("click", alCambiar);
            hijos.push(b);
        }
        return el("div", { clase: "cdk-elegido", id: id }, hijos);
    }

    function opcion(texto, detalle, termino, alPulsar) {
        var linea = el("span", { clase: "cdk-opcion__texto" });
        CDK.resaltar(texto, termino).forEach(function (n) { linea.appendChild(n); });

        var b = el("button", { type: "button", clase: "cdk-opcion" }, [
            linea,
            detalle ? el("span", { clase: "cdk-opcion__detalle", texto: detalle }) : null
        ]);
        b.addEventListener("click", alPulsar);
        return el("li", null, [b]);
    }

    function buscador(id, placeholder) {
        return el("input", { type: "search", id: id, clase: "cdk-entrada", autocomplete: "off",
                             placeholder: placeholder, enterkeyhint: "search" });
    }

    /* ===============================================================
     * Transportista
     * ============================================================= */

    function pintarTransportista() {
        var caja = $("campo-transportista");
        if (!caja) return;
        caja.innerHTML = "";

        if (!eleccion.tipo) {
            caja.classList.add("hidden");
            return;
        }
        caja.classList.remove("hidden");
        caja.appendChild(el("p", { clase: "cdk-campo__etiqueta", texto: "Transportista" }));

        var t = eleccion.transportista;

        if (t && t.fijo) {
            caja.appendChild(elegido("transportista-elegido", t.nombre,
                "En ventanilla y Lima va fijo (" + t.codigo + "): no se elige.", null));
        } else if (t) {
            caja.appendChild(elegido("transportista-elegido", t.nombre, t.codigo, function () {
                eleccion.transportista = null;
                pintarTransportista();
                var campo = $("buscar-transportista");
                if (campo) campo.focus();
            }));
        } else {
            var campo = buscador("buscar-transportista", "Nombre del transportista");
            campo.setAttribute("aria-label", "Buscar transportista");
            campo.addEventListener("input", function () {
                if (esperaT) clearTimeout(esperaT);
                esperaT = setTimeout(function () { buscarTransportista(campo.value.trim()); }, 300);
            });
            campo.addEventListener("keydown", function (ev) {
                // Enter busca ya, no envía el formulario.
                if (ev.key !== "Enter") return;
                ev.preventDefault();
                if (esperaT) clearTimeout(esperaT);
                buscarTransportista(campo.value.trim());
            });

            caja.appendChild(campo);
            caja.appendChild(el("p", { clase: "cdk-campo__ayuda", texto: "En provincia hay que elegirlo: los activos, por nombre." }));
            caja.appendChild(el("div", { id: "transportistas", style: "margin-top:8px" }));
            buscarTransportista("");
        }

        caja.appendChild(el("p", { clase: "cdk-campo__error hidden", id: "error-transportista", role: "alert" }));
    }

    function buscarTransportista(termino) {
        var mia = ++busquedaT;
        var destino = $("transportistas");
        if (!destino) return;

        CDK.estados.cargando(destino, "Buscando transportistas…");

        CDK.http.post(CDK.rutas.api(RUTA_TRANSPORTISTA), { sugerencia: termino })
            .then(function (r) {
                if (mia !== busquedaT || !$("transportistas")) return;

                var crudas = (r && r.data) || {};
                var lista = Object.keys(crudas).map(function (k) { return crudas[k]; })
                    .filter(function (f) { return f && f[0]; })
                    .map(function (f) { return { codigo: String(f[0]), nombre: String(f[1] || f[0]) }; });
                var total = r && r.total !== undefined ? Number(r.total) : lista.length;

                destino.innerHTML = "";

                if (!lista.length) {
                    destino.appendChild(el("p", { clase: "cdk-pista", id: "transportistas-vacio",
                        texto: termino ? "Ningún transportista activo con «" + termino + "»." : "No hay transportistas activos." }));
                    return;
                }

                destino.appendChild(el("ul", { clase: "cdk-opciones" }, lista.map(function (t) {
                    return opcion(t.nombre, t.codigo, termino, function () {
                        eleccion.transportista = { codigo: t.codigo, nombre: t.nombre, fijo: false };
                        pintarTransportista();
                    });
                })));

                /* `total` es cuántos hay con ese filtro aunque solo viajen cinco:
                   sin decirlo, quien no ve el suyo no sabe si seguir escribiendo. */
                if (total > lista.length) {
                    destino.appendChild(el("p", { clase: "cdk-pista", id: "transportistas-mas", style: "margin-top:6px",
                        texto: (termino ? "Hay " + total + " con ese nombre" : "Hay " + total + " activos") +
                               " y se muestran " + lista.length + ": escribe más del nombre para encontrar el tuyo." }));
                }
            })
            .catch(function (err) {
                if (mia !== busquedaT || !$("transportistas")) return;
                if (CDK.http.esError(err) && err.status === 401) return;
                CDK.estados.error(destino, err, function () { buscarTransportista(termino); });
            });
    }

    /* ===============================================================
     * Dirección
     *
     * Llegan todas, sin tope (C00904 tiene 25), y se filtran aquí: escribir
     * no cuesta un viaje por tecla. Se manda el texto TAL COMO VINO: el backend
     * lo compara exacto con las registradas.
     * ============================================================= */

    function normal(texto) {
        return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    }

    function pintarDireccion() {
        var caja = $("campo-direccion");
        if (!caja) return;
        caja.innerHTML = "";
        caja.appendChild(el("p", { clase: "cdk-campo__etiqueta", texto: "Dirección de entrega" }));

        var dirs = opciones.direcciones || [];

        if (!dirs.length) {
            caja.appendChild(el("div", { clase: "cdk-aviso", id: "sin-direcciones", style: "margin:0" }, [
                el("p", { clase: "cdk-aviso__texto", style: "flex:1;min-width:0",
                          texto: "El cliente no tiene direcciones registradas. Hay que registrarlas en el ERP antes de pasarla a pedido." })
            ]));
        } else if (eleccion.direccion) {
            caja.appendChild(elegido("direccion-elegida", eleccion.direccion,
                dirs.length === 1 ? "La única registrada del cliente." : "",
                dirs.length === 1 ? null : function () {
                    eleccion.direccion = null;
                    pintarDireccion();
                    var campo = $("filtro-direccion");
                    if (campo) campo.focus();
                }));
        } else {
            var campo = buscador("filtro-direccion", "Filtra por calle, distrito o ciudad");
            campo.setAttribute("aria-label", "Filtrar direcciones");
            campo.addEventListener("input", function () { pintarDirecciones(campo.value.trim()); });
            campo.addEventListener("keydown", function (ev) { if (ev.key === "Enter") ev.preventDefault(); });

            caja.appendChild(campo);
            caja.appendChild(el("p", { clase: "cdk-campo__ayuda",
                texto: dirs.length + " direcciones registradas del cliente. Solo se puede elegir una de ellas." }));
            caja.appendChild(el("div", { id: "direcciones", style: "margin-top:8px;max-height:320px;overflow:auto" }));
            pintarDirecciones("");
        }

        caja.appendChild(el("p", { clase: "cdk-campo__error hidden", id: "error-direccion", role: "alert" }));
    }

    function pintarDirecciones(termino) {
        var destino = $("direcciones");
        if (!destino) return;
        destino.innerHTML = "";

        var aguja = normal(termino);
        var halladas = (opciones.direcciones || []).filter(function (d) { return normal(d).indexOf(aguja) !== -1; });

        if (!halladas.length) {
            destino.appendChild(el("p", { clase: "cdk-pista", id: "direcciones-vacio",
                                          texto: "Ninguna dirección registrada con «" + termino + "»." }));
            return;
        }

        destino.appendChild(el("ul", { clase: "cdk-opciones" }, halladas.map(function (d) {
            return opcion(d, null, termino, function () {
                eleccion.direccion = d;
                pintarDireccion();
            });
        })));
    }

    /* ===============================================================
     * Validar, confirmar y convertir
     * ============================================================= */

    function mostrarError(campo, texto) {
        var p = $("error-" + campo);
        if (!p) return;
        p.textContent = texto;
        p.classList.remove("hidden");
    }

    function ocultarError(campo) {
        var p = $("error-" + campo);
        if (p) p.classList.add("hidden");
    }

    function validarYConfirmar() {
        ["entrega", "transportista", "direccion"].forEach(ocultarError);
        var errores = [];

        if (!eleccion.tipent) {
            errores.push("entrega");
            mostrarError("entrega", "Elige el tipo de entrega.");
        } else if (!eleccion.transportista) {
            errores.push("transportista");
            mostrarError("transportista", "En provincia hay que elegir el transportista.");
        }

        if (!eleccion.direccion) {
            errores.push("direccion");
            mostrarError("direccion", (opciones.direcciones || []).length
                ? "Elige la dirección de entrega."
                : "Sin una dirección registrada no se puede crear el pedido.");
        }

        if (errores.length) {
            var primero = $("error-" + errores[0]);
            if (primero && primero.scrollIntoView) primero.scrollIntoView({ block: "center" });
            return;
        }

        confirmar();
    }

    function nombreEntrega() {
        return ENTREGAS[eleccion.tipent] || (eleccion.tipo && eleccion.tipo.nombre) || String(eleccion.tipent);
    }

    function confirmar() {
        var total = actual.total !== undefined && actual.total !== null && actual.total !== ""
            ? ", por " + CDK.formato.moneda(actual.total, actual.moneda) + " con IGV"
            : "";
        var por = eleccion.tipent === PROVINCIA ? ", por " + eleccion.transportista.nombre : "";

        CDK.modal.confirmar({
            titulo: "¿Pasar la " + actual.documento + " a pedido?",
            mensaje: "Se crea un pedido con todas sus líneas y precios" + total + ". " +
                     "Entrega: " + nombreEntrega() + por + ", en " + eleccion.direccion + ". " +
                     "El pedido queda pendiente de aprobación, y la cotización ya no se podrá modificar, " +
                     "dar de baja ni volver a pasar.",
            confirmar: "Pasar a pedido",
            cancelar: "Revisar"
        }).then(function (si) { if (si) convertir(); });
    }

    function convertir() {
        var mia = vuelta;
        var boton = $("btn-convertir");
        var texto = boton.textContent;
        boton.disabled = true;
        boton.textContent = "Creando el pedido…";
        /* Mientras viaja no se puede cambiar de cotización: si se descartara la
           respuesta, un pedido creado pasaría sin que nadie lo viera. */
        $("btn-otra").disabled = true;

        var datos = {
            ndocu: actual.documento,
            tipent: eleccion.tipent,
            dirent: eleccion.direccion,
            consig: ($("consig").value || "").trim(),
            obse: ($("obse").value || "").trim()
        };
        // En ventanilla y Lima el backend pone T0001 e ignora lo que llegue: no se manda.
        if (eleccion.tipent === PROVINCIA) datos.codtra = eleccion.transportista.codigo;

        function soltar() {
            var b = $("btn-convertir");
            if (b) { b.disabled = false; b.textContent = texto; }
            $("btn-otra").disabled = false;
        }

        CDK.http.post(CDK.rutas.api(RUTA_CONVERTIR), datos)
            .then(function (r) {
                $("btn-otra").disabled = false;
                if (mia !== vuelta) return;
                if (!r || r.status !== "ok" || !r.pedido) { soltar(); return fallo({ datos: r || {} }); }
                exito(r);
            })
            .catch(function (err) {
                soltar();
                if (mia !== vuelta) return;
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                fallo(err);
            });
    }

    function sinPunto(texto) { return String(texto || "").trim().replace(/\.$/, ""); }

    function fallo(err) {
        var datos = (err && err.datos) || {};
        var clave = datos.status;
        var mensaje;

        if (DEL_SERVIDOR.indexOf(clave) !== -1 || (CDK.http.esError(err) && err.status >= 500 && !datos.msg)) {
            mensaje = (datos.msg ? sinPunto(datos.msg) + ". " : "") +
                      "No quedó nada a medias: la cotización está como estaba. Vuelve a intentarlo y, si se repite, avisa a sistemas.";
        } else if (CDK.http.esError(err) && err.status === 0) {
            /* Sin respuesta no se sabe si llegó. Reintentar es seguro: si ya
               se hubiera creado, el backend responde `coti ya convertida`. */
            mensaje = "No hubo respuesta del servidor. Revisa tu conexión y vuelve a intentarlo: " +
                      "si el pedido ya se hubiera creado, te lo diremos en vez de crear otro.";
        } else {
            mensaje = datos.msg || MOTIVOS[clave] || RESPALDO[clave] ||
                      "El servidor no confirmó el pedido. Vuelve a intentarlo en un momento.";
        }

        CDK.modal.alerta({
            titulo: TITULOS[clave] || "No se pudo crear el pedido",
            mensaje: mensaje,
            confirmar: "Entendido",
            peligro: true
        }).then(function () {
            if (!eleccion) return;

            if (clave === "transportista invalido") {
                if (eleccion.transportista && !eleccion.transportista.fijo) eleccion.transportista = null;
                pintarTransportista();
                mostrarError("transportista", "Elige otro transportista de la lista.");
            } else if (clave === "direccion invalida") {
                eleccion.direccion = null;
                pintarDireccion();
                mostrarError("direccion", "Elige una de las direcciones registradas.");
            } else if (DESFASADOS.indexOf(clave) !== -1) {
                // La cotización cambió por fuera: se pregunta en qué quedó.
                cargarOpciones();
                if (listaDia) listaDia.recargar();
            }
        });
    }

    /* ===============================================================
     * El pedido creado
     * ============================================================= */

    function fila(etiqueta, valor, id) {
        return el("div", { clase: "cdk-ficha-fila", id: id || null }, [
            el("span", { clase: "cdk-ficha-fila__etiqueta", texto: etiqueta }),
            el("span", { clase: "cdk-ficha-fila__valor", texto: valor })
        ]);
    }

    function exito(r) {
        var moneda = r.moneda === "S" ? "S" : "D";
        var t = r.totales || {};
        var d = r.despacho || {};
        var lineas = Number(r.lineas) || 0;

        rotDocumento.textContent = (r.cotizacion || actual.documento) + "  →  pedido " + r.pedido;
        cuerpo.innerHTML = "";

        var filas = [
            fila("Entrega", ENTREGAS[d.tipent] || nombreEntrega(), "creado-entrega"),
            fila("Transportista", [d.transportista, d.codtra].filter(Boolean).join("  ·  "), "creado-transportista"),
            fila("Dirección", d.dirent || eleccion.direccion, "creado-direccion")
        ];
        if (d.consig) filas.push(fila("Consignatario", d.consig, "creado-consig"));
        // Lo que quedó grabado, con la forma de los pedidos de la web: lo arma el backend.
        if (d.obse) filas.push(fila("Observación grabada", d.obse, "creado-obse"));

        cuerpo.appendChild(el("div", { clase: "cdk-ficha", id: "pedido-creado" }, [
            el("p", { clase: "cdk-ficha__titulo", id: "creado-numero", texto: "Pedido " + r.pedido + " creado" }),
            el("p", { clase: "cdk-pista", id: "creado-pendiente", style: "margin:4px 0 0",
                      texto: "Queda pendiente de aprobación: lo aprueban en el ERP, como cualquier pedido, y hasta entonces no separa stock." }),
            CDK.totales([
                { etiqueta: (lineas === 1 ? "1 línea" : lineas + " líneas") + " · sin IGV", valor: CDK.formato.moneda(t.tota, moneda) },
                { etiqueta: "IGV", valor: CDK.formato.moneda(t.toti, moneda) },
                { etiqueta: "Total", valor: CDK.formato.moneda(t.totn, moneda), principal: true }
            ]),
            el("div", { clase: "cdk-ficha__datos", style: "flex-direction:column;gap:10px" }, filas)
        ]));

        var otra = el("button", { type: "button", id: "btn-pasar-otra", clase: "cdk-boton cdk-boton--primario",
                                  style: "margin-top:14px", texto: "Pasar otra cotización" });
        otra.addEventListener("click", volver);
        cuerpo.appendChild(el("div", { clase: "cdk-acciones-fila" }, [otra]));

        CDK.toast("Pedido " + r.pedido + " creado. Queda pendiente de aprobación.", "exito");

        // La cotización ya dice `pedido`: la lista tiene que dejar de ofrecerla.
        if (listaDia) listaDia.recargar();
    }

})();
