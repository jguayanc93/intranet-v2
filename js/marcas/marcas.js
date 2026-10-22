/**
 * Pantalla de marcas del mes (grupo 25: jefaturas y especialistas).
 *
 * Se pinta entera con `GET /v1/marcas`. Lo que decide qué mostrar es `rol` y
 * `confirmado` de esa respuesta, **no** el `tipo` del menú: el backend puede
 * dejar a alguien como JEFATURA aunque haya elegido ESPECIALISTA en el registro.
 *
 *   · sin confirmar  → el borrador: buscador, lista, y un botón que fija todo
 *   · confirmado     → las marcas en solo lectura; hasta el mes siguiente no
 *                      se suma, quita ni cambia nada, porque la cuota se
 *                      calcula sobre ellas
 *   · jefatura       → además el panel de su familia (js/marcas/familia.js)
 *
 * El borrador vive en el editor, no aquí: el backend no guarda nada hasta
 * confirmar. Después de cada escritura se vuelve a pedir `GET /v1/marcas`.
 *
 * Ver docs/marcas-grupo25.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var M = CDK.marcas;

    var contenido = document.getElementById("contenido");
    var periodo = document.getElementById("periodo");
    var avisos = document.getElementById("avisos");

    if (!contenido) return;

    /* El editor se crea una vez y se reutiliza entre repintados. Si cada
       repintado lo reconstruyera, una jefatura que está armando su lista y da
       una marca a un especialista perdería el borrador. */
    var editor = null;

    var botonConfirmar = null;
    var pistaConfirmar = null;
    var existentes = 0;                 // marcas que ya tiene, aparte del borrador

    cargar();

    /* ===============================================================
     * Carga
     * ============================================================= */
    function cargar() {
        CDK.estados.cargando(contenido, "Cargando tus marcas…");

        return M.estado()
            .then(pintar)
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige

                /* Del grupo 25 pero sin alta en la intranet: el backend responde
                   `no identificado`, lo mismo que /login/identificador. No es un
                   fallo ni sirve reintentar: lo que falta es registrarse. */
                if (M.statusDe(err) === "no identificado") return sinAlta();

                CDK.estados.error(contenido, err, cargar);
            });
    }

    function sinAlta() {
        periodo.textContent = "Falta completar tu registro";
        contenido.innerHTML = "";

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "marcas-sin-alta" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Todavía no estás registrado" }),
            el("p", { clase: "cdk-seccion__sub",
                      texto: "Para elegir tus marcas primero tienes que completar tu registro en la intranet." }),
            el("a", { href: CDK.rutas.registro(), clase: "cdk-boton cdk-boton--primario",
                      texto: "Completar mi registro" })
        ]));
    }

    /** Repinta tras una escritura, sin tapar la pantalla con un spinner. */
    function refrescar() {
        return M.estado()
            .then(pintar)
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;
                CDK.toast("No se pudo actualizar la pantalla. " + M.mensajeError(err), "error");
            });
    }

    /* ===============================================================
     * Avisos que sobreviven al repintado
     *
     * Las marcas omitidas se dicen después de confirmar o de asignar, y justo
     * entonces se repinta todo. Si vivieran dentro del contenido, se
     * borrarían antes de poder leerse.
     * ============================================================= */
    function avisarOmitidas(titulo, lista) {
        avisos.innerHTML = "";

        var aviso = M.avisoOmitidas(titulo, lista);
        if (!aviso) return;

        var cerrar = el("button", { type: "button", clase: "cdk-enlace-accion",
                                    style: "margin:8px 0 0", texto: "Entendido" });
        cerrar.addEventListener("click", function () { avisos.innerHTML = ""; });

        aviso.firstChild.appendChild(cerrar);
        avisos.appendChild(aviso);

        if (avisos.scrollIntoView) avisos.scrollIntoView({ block: "nearest" });
    }

    /* ===============================================================
     * Pintado
     * ============================================================= */
    function pintar(d) {
        var jefatura = d.rol === "JEFATURA";

        periodo.textContent = M.periodo(d) + " · " + (jefatura ? "Jefatura" : "Especialista");

        contenido.innerHTML = "";
        contenido.appendChild(misMarcas(d));

        if (jefatura) {
            contenido.appendChild(M.panelFamilia(d, {
                alCambiar: refrescar,
                omitidas: avisarOmitidas
            }));
        }
    }

    function listaSoloLectura(lista) {
        var ul = el("ul", { clase: "cdk-articulos" });

        lista.forEach(function (m) {
            var datos = [];

            if (m.asignadaPor) {
                /* `yo` es que la tomó el propio usuario; cualquier otro valor es
                   el nombre de quien se la dio, normalmente la jefatura. */
                datos.push({ etiqueta: "Asignada por",
                             valor: m.asignadaPor === "yo" ? "ti" : m.asignadaPor });
            }
            if (m.trabajada === false) {
                datos.push({ etiqueta: "", valor: "ya no se trabaja", tono: "nulo" });
            }

            ul.appendChild(CDK.articulo({
                distintivo: m.codmar,
                nombre: M.nombre(m),
                detalle: m.familia,
                datos: datos
            }));
        });

        return ul;
    }

    function misMarcas(d) {
        var marcas = d.marcas || [];
        var seccion = el("section", { clase: "cdk-seccion", id: "marcas-mias" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Mis marcas de este mes" })
        ]);

        /* ---------------------------------------------- ya confirmadas */
        if (d.confirmado) {
            editor = null;

            var cuando = d.confirmadoEn ? " el " + CDK.formato.fecha(d.confirmadoEn) : "";
            seccion.appendChild(el("p", {
                clase: "cdk-seccion__sub", id: "marcas-confirmadas",
                texto: "Confirmaste tus marcas" + cuando + ". Quedan fijas hasta el mes siguiente: " +
                       "tu cuota se calcula sobre ellas."
            }));

            seccion.appendChild(marcas.length
                ? listaSoloLectura(marcas)
                : el("p", { clase: "cdk-pista", texto: "No tienes marcas este mes." }));

            return seccion;
        }

        /* ------------------------------------------------ el borrador */
        existentes = marcas.length;

        seccion.appendChild(el("p", {
            clase: "cdk-seccion__sub",
            texto: "Todavía no confirmaste tus marcas de este mes. Arma tu lista y confírmala: " +
                   "desde ese momento no podrás sumar, quitar ni cambiar marcas hasta el mes " +
                   "siguiente, porque tu cuota se calcula sobre ellas."
        }));

        if (marcas.length) {
            seccion.appendChild(el("h3", { clase: "cdk-seccion__titulo", style: "margin:0 0 4px",
                                           texto: "Ya asignadas" }));
            /* Una jefatura no recibe marcas de nadie: para ella «te las dio tu
               jefatura» seria falso. */
            seccion.appendChild(el("p", { clase: "cdk-seccion__sub", style: "margin-bottom:8px",
                texto: (d.rol === "JEFATURA" ? "Ya son tuyas. " : "Te las dio tu jefatura. ") +
                       "Se conservan aunque no las incluyas en tu lista." }));
            seccion.appendChild(el("div", { style: "margin-bottom:20px" }, [listaSoloLectura(marcas)]));
        }

        if (!editor) {
            editor = M.editor({
                yaTiene: marcas,
                anterior: true,
                alCambiar: actualizarBoton
            });
        }
        seccion.appendChild(editor.nodo);

        botonConfirmar = el("button", {
            type: "button", id: "marcas-confirmar",
            clase: "cdk-boton cdk-boton--primario", style: "margin-top:20px",
            texto: "Confirmar mis marcas"
        });
        botonConfirmar.addEventListener("click", function () { confirmar(d); });

        pistaConfirmar = el("p", { clase: "cdk-pista", id: "marcas-confirmar-pista" });

        seccion.appendChild(botonConfirmar);
        seccion.appendChild(pistaConfirmar);
        actualizarBoton();

        return seccion;
    }

    /** Confirmar sin ninguna marca no tiene sentido: el servidor lo rechaza. */
    function actualizarBoton() {
        if (!botonConfirmar || !editor) return;

        var vacio = existentes + editor.cantidad() === 0;
        botonConfirmar.disabled = vacio;
        pistaConfirmar.textContent = vacio ? "Elige al menos una marca para poder confirmar." : "";
    }

    /* ===============================================================
     * Confirmar
     * ============================================================= */
    function confirmar(d) {
        var codigos = editor.codigos();
        var total = existentes + codigos.length;

        CDK.modal.confirmar({
            titulo: "¿Confirmar tus marcas?",
            mensaje: "Vas a confirmar " + total + (total === 1 ? " marca" : " marcas") +
                     " para " + M.periodo(d) + ". Desde ese momento no podrás sumar, quitar ni " +
                     "cambiar marcas hasta el mes siguiente: tu cuota se calcula sobre ellas.",
            confirmar: "Confirmar"
        }).then(function (si) {
            if (si) enviar(codigos);
        });
    }

    function enviar(codigos) {
        editor.bloquear(true);
        botonConfirmar.disabled = true;
        avisarOmitidas(null, []);

        M.confirmar(codigos).then(
            function (r) {
                editor = null;

                CDK.toast("Marcas confirmadas: " + r.total + ".", "exito");

                /* El usuario ya quedó confirmado con el resto: lo que no se pudo
                   asignar se dice, pero no impide nada. */
                avisarOmitidas("Estas marcas no se pudieron asignar:", r.omitidas);

                return refrescar();
            },
            function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;

                var estado = M.statusDe(err);

                /* Otra pestaña o la jefatura ya lo hicieron: no hay nada que
                   corregir aquí, solo enseñar cómo quedó. */
                if (estado === "marcas ya confirmadas") {
                    editor = null;
                    CDK.toast(M.mensajeError(err), "aviso", 6000);
                    return refrescar();
                }

                editor.bloquear(false);

                /* Ninguna se pudo asignar y NO quedó confirmado: puede volver a
                   intentarlo. Se quitan del borrador las que fallaron, que
                   volverían a fallar. */
                if (estado === "sin marcas asignables") {
                    var omitidas = (err.datos.data && err.datos.data.omitidas) || [];
                    omitidas.forEach(function (o) { editor.quitar(o.codmar); });
                    avisarOmitidas("Ninguna de estas marcas se pudo asignar:", omitidas);
                    CDK.toast(M.mensajeError(err), "aviso", 6000);
                } else {
                    CDK.toast(M.mensajeError(err), "error", 6000);
                }

                actualizarBoton();
            }
        );
    }

})();
