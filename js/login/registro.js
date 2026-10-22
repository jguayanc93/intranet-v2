/**
 * Registro de un usuario nuevo.
 *
 * Sustituye al <script> de ~300 líneas que vivía dentro de autenticador.html, con
 * dos cambios de fondo:
 *
 *   · **Los tipos que se ofrecen los dice el backend** (`diferenciadores` en
 *     `GET /login/registro`), no un `switch` que había que mantener a mano. Eran
 *     valores que el backend rechaza: WEB y «TIO GASEOSA» (se llama `HP`).
 *
 *   · **`POST /login/registro/completado` ya no redirige**: responde
 *     directamente, con el tipo con el que quedó el usuario (`correcto`) y, en
 *     el grupo 25, qué marcas se asignaron y cuáles no (`marcas`, `confirmado`).
 *     Antes se seguía el redirect a /login/identificador y la respuesta no decía
 *     nada de las marcas.
 *
 * Elegir marcas aquí ES la confirmación del mes. Si se asignó alguna, quedan
 * fijas hasta fin de mes; si no se elige ninguna, se confirman después en el
 * módulo Marcas.
 *
 * Leer el tipo de `correcto`, no del formulario: una persona cargada como
 * jefatura queda como JEFATURA aunque haya elegido ESPECIALISTA.
 *
 * Ver docs/marcas-grupo25.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var M = CDK.marcas;

    var form = document.getElementById("form-registro");
    if (!form) return;

    var estado = document.getElementById("estado");
    var selector = document.getElementById("tipo");
    var leyenda = document.getElementById("tipo-leyenda");
    var seccionMarcas = document.getElementById("seccion-marcas");
    var destinoEditor = document.getElementById("editor-marcas");
    var boton = document.getElementById("btn-registrar");
    var resultado = document.getElementById("resultado");

    var tipos = [];
    var editor = null;
    var enviando = false;      // el doble clic mandaría dos registros: el 2.º da 409

    iniciar();

    function irAlLogin() {
        location.replace(CDK.rutas.login());
    }

    function esSesionVencida(err) {
        return CDK.http.esError(err) && err.status === 401;
    }

    /* ===============================================================
     * Qué se ofrece
     * ============================================================= */
    function iniciar() {
        CDK.estados.cargando(estado, "Preparando tu registro…");

        /* sin401: aquí un 401 es «no hay sesión», y renovarla pidiendo
           /login/identificador solo devolvería «no identificado». */
        CDK.http.get(CDK.rutas.api("/login/registro"), { sin401: true })
            .then(function (respuesta) {
                armar((respuesta && respuesta.data) || respuesta || {});
            })
            .catch(function (err) {
                if (esSesionVencida(err)) return irAlLogin();
                CDK.estados.error(estado, err, iniciar);
            });
    }

    /**
     * Qué tipos se ofrecen: **los que dice el backend** en `diferenciadores`,
     * que es la misma lista contra la que valida `/registro/completado`. Así un
     * tipo nuevo se ofrece sin tocar esta pantalla, y uno retirado deja de
     * ofrecerse. Un grupo sin registro devuelve `[]`.
     *
     * El catálogo solo pone la etiqueta, la descripción y si pide marcas. Un
     * tipo que no conoce se ofrece igual, con su clave como etiqueta y sin
     * marcas: mejor eso que dejar sin registrarse a quien lo necesite.
     *
     * Si la respuesta no trae `diferenciadores` —un despliegue anterior—, se
     * recurre a los tipos que el catálogo asocia al grupo.
     */
    function tiposDe(d) {
        if (!Array.isArray(d.diferenciadores)) return CDK.catalogo.tipos(d.grupo);

        return d.diferenciadores.map(function (clave) {
            return CDK.catalogo.tipo(clave) ||
                   { clave: clave, etiqueta: clave, descripcion: "", pideMarcas: false };
        });
    }

    function armar(d) {
        var grupo = d.grupo;
        tipos = tiposDe(d);

        if (!tipos.length) {
            CDK.estados.error(estado,
                "Tu grupo («" + (grupo || "sin grupo") + "») todavía no tiene registro disponible. " +
                "Avisa al equipo de sistemas.", null);
            return;
        }

        /* Con dos o más, no se preselecciona ninguno. El tipo no se puede
           cambiar después del registro, y arrancar en la primera opción
           invita a guardar sin haber mirado: en el grupo 25 eso es pedir
           JEFATURA siendo especialista y tropezar con un 403. Con uno solo
           (ZONA) no hay nada que elegir. */
        if (tipos.length > 1) {
            selector.appendChild(el("option", { value: "", texto: "Elige tu tipo…" }));
        }

        tipos.forEach(function (t) {
            selector.appendChild(el("option", { value: t.clave, texto: t.etiqueta }));
        });
        selector.addEventListener("change", alElegirTipo);

        CDK.estados.limpiar(estado);
        form.classList.remove("hidden");
        alElegirTipo();
    }

    function tipoElegido() {
        return tipos.filter(function (t) { return t.clave === selector.value; })[0] || null;
    }

    function alElegirTipo() {
        var tipo = tipoElegido();
        leyenda.textContent = tipo ? tipo.descripcion : "";

        var pideMarcas = !!(tipo && tipo.pideMarcas);
        seccionMarcas.classList.toggle("hidden", !pideMarcas);

        /* Se crea al primer uso y se conserva: pasar de Especialista a
           Jefatura y volver no debería borrar lo que ya se había elegido. */
        if (pideMarcas && !editor) {
            editor = M.editor({ anterior: false, alSesionVencida: irAlLogin });
            destinoEditor.appendChild(editor.nodo);
        }
    }

    /* ===============================================================
     * Guardar
     * ============================================================= */
    form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        if (enviando) return;

        var tipo = tipoElegido();
        if (!tipo) {
            CDK.toast("Elige tu tipo de vendedor para continuar.", "aviso");
            selector.focus();
            return;
        }

        /* Las marcas solo cuentan si el tipo las pide: un editor oculto puede
           traer una lista de cuando se había elegido otro. */
        var codigos = tipo.pideMarcas && editor ? editor.codigos() : [];

        /* Se marca ya, no cuando salga la peticion: entre el clic y el envio
           hay una promesa, y un segundo envio en ese hueco pasaba. Tambien
           cubre el tiempo que el diálogo está abierto. */
        enviando = true;

        var paso = codigos.length
            ? CDK.modal.confirmar({
                titulo: "¿Registrarte con estas marcas?",
                mensaje: "Elegir marcas aquí es tu confirmación de este mes: " +
                         (codigos.length === 1 ? "queda fija" : "quedan fijas") +
                         " y no podrás sumar, quitar ni cambiar marcas hasta el mes siguiente.",
                confirmar: "Registrarme"
            })
            : Promise.resolve(true);

        paso.then(function (si) {
            if (si) enviar(tipo, codigos);
            else enviando = false;
        });
    });

    function enviar(tipo, codigos) {
        boton.disabled = true;
        if (editor) editor.bloquear(true);

        var cuerpo = { diferenciador: tipo.clave };
        if (codigos.length) cuerpo.marcas = codigos;

        CDK.http.post(CDK.rutas.api("/login/registro/completado"), cuerpo, { sin401: true })
            .then(function (respuesta) { terminado(tipo, respuesta); })
            .catch(function (err) { fallo(err); });
    }

    function fallo(err) {
        enviando = false;
        boton.disabled = false;
        if (editor) editor.bloquear(false);

        if (esSesionVencida(err)) return irAlLogin();

        /* Ya figuraba: el primer envío sí llegó. No hay nada que corregir. */
        if (M.statusDe(err) === "usuario ya registrado") {
            CDK.toast("Ya estabas registrado. Te llevo al panel.", "info");
            location.replace(CDK.rutas.inicio());
            return;
        }

        /* `jefatura sin familia`: pidió ser jefatura sin estar cargado como tal.
           El `msg` del backend lo explica; si no viene, esto dice qué hacer. */
        if (M.statusDe(err) === "jefatura sin familia" && !(err.datos && err.datos.msg)) {
            CDK.toast("Tu usuario no figura como jefatura de ninguna familia. " +
                      "Elige Especialista, o avisa al equipo de sistemas.", "error", 8000);
            return;
        }

        CDK.toast(M.mensajeError(err), "error", 8000);
    }

    /* ===============================================================
     * Resultado
     * ============================================================= */
    function terminado(elegido, respuesta) {
        var d = respuesta && typeof respuesta === "object" ? respuesta : {};

        /* Los demás grupos no traen nada de marcas: se entra directo, como
           siempre. */
        if (d.marcas === undefined && d.confirmado === undefined) {
            location.replace(CDK.rutas.inicio());
            return;
        }

        var asignadas = (d.marcas && d.marcas.asignadas) || [];
        var omitidas = (d.marcas && d.marcas.omitidas) || [];
        var quedo = CDK.catalogo.tipo(d.correcto || elegido.clave);

        form.classList.add("hidden");
        resultado.classList.remove("hidden");
        resultado.innerHTML = "";

        var seccion = el("section", { clase: "cdk-seccion" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Registro completado" })
        ]);

        var texto = "Quedaste registrado como " + (quedo ? quedo.etiqueta : (d.correcto || elegido.clave)) + ".";
        if (d.correcto && d.correcto !== elegido.clave) {
            texto += " Es el tipo con el que figura tu usuario, aunque hayas elegido " +
                     elegido.etiqueta + ".";
        }
        seccion.appendChild(el("p", { clase: "cdk-seccion__sub", id: "registro-tipo", texto: texto }));

        if (asignadas.length) {
            seccion.appendChild(el("h3", { clase: "cdk-seccion__titulo", style: "margin:0 0 8px",
                texto: d.confirmado ? "Marcas confirmadas" : "Marcas asignadas" }));

            var lista = el("ul", { clase: "cdk-articulos", id: "registro-asignadas" });
            asignadas.forEach(function (m) {
                lista.appendChild(CDK.articulo({ distintivo: m.codmar, nombre: M.nombre(m) }));
            });
            seccion.appendChild(lista);

            if (d.confirmado) {
                seccion.appendChild(el("p", { clase: "cdk-pista",
                    texto: "Quedan fijas hasta el mes siguiente." }));
            }
        } else {
            seccion.appendChild(el("p", { clase: "cdk-pista", id: "registro-sin-marcas",
                texto: "Todavía no tienes marcas este mes. Elígelas y confírmalas en el módulo Marcas." }));
        }

        /* Si no quedó confirmado todavía puede elegir otras; si ya quedó, las
           omitidas se dicen pero no hay nada que reintentar. */
        var aviso = M.avisoOmitidas(
            d.confirmado ? "Estas marcas no se pudieron asignar:"
                         : "Estas marcas no se pudieron asignar, elige otras en el módulo Marcas:",
            omitidas);
        if (aviso) {
            aviso.id = "registro-omitidas";
            aviso.style.marginTop = "16px";
            seccion.appendChild(aviso);
        }

        seccion.appendChild(el("a", {
            href: CDK.rutas.inicio(), id: "registro-entrar",
            clase: "cdk-boton cdk-boton--primario", style: "margin-top:20px",
            texto: "Ir al panel"
        }));

        resultado.appendChild(seccion);
    }

})();
