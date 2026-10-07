/**
 * Registrar la cuota del mes.
 *
 * Sustituye a las ~310 líneas de <script> que vivían dentro de
 * cuota_registrar.html.
 *
 * La regla es una vez al mes, y hasta hace poco **solo la cumplía el
 * navegador**: `/cuota/update` era un `INSERT` a secas, así que un segundo
 * envío —o dos pestañas abiertas— metía una segunda fila con otra meta, y el
 * avance se quedaba con la que SQL Server devolviera primero. Ahora lo
 * comprueba el servidor dentro de una transacción y responde 409.
 *
 * Esta pantalla sigue preguntando antes, pero por cortesía: para enseñar la
 * cuota ya registrada en vez de dejar escribir para nada. Quien decide es el
 * backend.
 *
 * Ver docs/cuota.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;

    var estado = document.getElementById("estado");
    var formulario = document.getElementById("form-cuota");
    var monto = document.getElementById("monto");
    var boton = document.getElementById("btn-guardar");
    var resultado = document.getElementById("resultado");

    if (!formulario) return;

    revisar();

    /* ===============================================================
     * ¿Ya la registró?
     * ============================================================= */

    function revisar() {
        CDK.estados.cargando(estado, "Comprobando…");

        // Es un GET, aunque el nombre no lo parezca.
        CDK.http.get(CDK.rutas.api("/cuota/revisar"))
            .then(function (respuesta) {
                var d = (respuesta && respuesta.data) || respuesta || {};
                var registrada = d.debeRegistrar === false ||
                                 (d.meta !== undefined && d.meta !== null && Number(d.meta) > 0);

                if (registrada) return yaEstaba(d);

                CDK.estados.limpiar(estado);
                formulario.classList.remove("hidden");
                monto.focus();
            })
            .catch(function (err) {
                if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige

                /* Si la comprobación falla, se deja registrar igual: el
                   servidor va a rechazar el duplicado de todos modos, y
                   bloquear la pantalla por una consulta de cortesía sería
                   impedir lo único que se puede hacer aquí. */
                CDK.estados.limpiar(estado);
                formulario.classList.remove("hidden");
                console.warn("[cuota] no se pudo comprobar si ya estaba registrada:", err);
            });
    }

    function yaEstaba(d) {
        estado.innerHTML = "";
        formulario.classList.add("hidden");

        estado.appendChild(el("div", { clase: "cdk-aviso" }, [
            el("p", { clase: "cdk-aviso__texto",
                      texto: "Ya registraste tu cuota de este mes." }),
            el("p", { clase: "cdk-pista",
                      texto: "Solo se puede una vez al mes." })
        ]));

        if (d.meta !== undefined && d.meta !== null) {
            estado.appendChild(el("div", { clase: "cdk-totales", style: "margin-top:12px" }, [
                el("div", { clase: "cdk-total cdk-total--principal" }, [
                    el("span", { clase: "cdk-total__etiqueta", texto: "Tu cuota" }),
                    el("span", { clase: "cdk-total__valor",
                                 texto: CDK.formato.moneda(d.meta, "D") })
                ])
            ]));
        }

        estado.appendChild(el("a", {
            href: CDK.rutas.app("/cuota/cuota_observar.html"),
            clase: "cdk-boton cdk-boton--primario",
            style: "margin-top:12px",
            texto: "Ver mi avance"
        }));
    }

    /* ===============================================================
     * Registrar
     * ============================================================= */

    formulario.addEventListener("submit", function (ev) {
        ev.preventDefault();

        var valor = Number(monto.value);

        /* La validación de verdad la hace el servidor —responde `cuota
           invalida`—; esto solo evita un viaje para algo que se ve aquí. */
        if (!valor || valor <= 0) {
            CDK.toast("La cuota tiene que ser un número mayor que cero", "aviso");
            monto.focus();
            return;
        }

        CDK.modal.confirmar({
            titulo: "¿Registrar esta cuota?",
            mensaje: "Vas a registrar " + CDK.formato.moneda(valor, "D") +
                     " como tu cuota de este mes. Solo se puede una vez y no se puede cambiar.",
            confirmar: "Registrar"
        }).then(function (si) {
            if (si) guardar(valor);
        });
    });

    function guardar(valor) {
        boton.disabled = true;
        CDK.estados.cargando(resultado, "Registrando…");

        /* El campo se llama `fijado`, no `monto`. Viene del backend original
           y se mantuvo para no romper lo que ya lo usaba.

           Mandarlo con otro nombre no da «falta el campo»: da «el monto debe
           ser mayor que cero», porque la validación del monto es la primera
           que nota que el valor no existe. Costó un rato encontrarlo, y por
           eso el backend separó los dos mensajes.

           Los otros dos campos del contrato —`porcentaje` y
           `objetivo_especial`— no se mandan: eran el objetivo específico por
           familia, que es lo que enseñaba el segmento 2, y ese segmento se
           retiró. El backend les pone 0 y COMPONENTES. */
        CDK.http.post(CDK.rutas.api("/cuota/update"), { fijado: valor })
            .then(function (respuesta) {
                boton.disabled = false;
                CDK.estados.limpiar(resultado);
                CDK.toast("Cuota registrada", "exito");

                /* Lo que quedó guardado, no lo que mandamos. */
                var guardada = respuesta && respuesta.cuota !== undefined
                    ? respuesta.cuota : valor;
                yaEstaba({ meta: guardada });
            })
            .catch(function (err) {
                boton.disabled = false;
                if (CDK.http.esError(err) && err.status === 401) return;

                /* `cuota ya registrada` (409) no es un error del que haya que
                   recuperarse: es que alguien la registró ya, quizá en otra
                   pestaña. Se enseña la que hay en vez de dejar un mensaje
                   rojo y un formulario que no va a funcionar. */
                if (CDK.http.esError(err) && err.datos &&
                    err.datos.status === "cuota ya registrada") {
                    CDK.estados.limpiar(resultado);
                    return revisar();
                }

                /* `cuota no enviada` significa que el cuerpo no trae `fijado`:
                   es un fallo de este archivo, no del vendedor. Se deja dicho
                   en consola para que la próxima vez se vea en un segundo. */
                if (CDK.http.esError(err) && err.datos &&
                    err.datos.status === "cuota no enviada") {
                    console.error("[cuota] el POST no llevó `fijado`. Ver docs/cuota-registrar.md");
                }

                CDK.estados.error(resultado, err);
            });
    }

})();
