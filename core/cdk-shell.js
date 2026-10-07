/**
 * cdk-shell.js — Construye el chrome comun: navbar, sidebar (desktop),
 * bottom nav (movil), breadcrumb, menu de usuario y hoja "Más".
 *
 * La pagina solo declara:
 *   <body data-modulo="cotizacion" data-titulo="Crear Cotización">
 *
 * Se monta de forma SINCRONA al ejecutarse, sin esperar DOMContentLoaded: el
 * bloque core va al final del <body>, asi que document.body ya existe. Eso hace
 * que los elementos #cdk-* existan antes de que corra cualquier script de pagina,
 * incluidos los del codigo antiguo que enganchan listeners en top level.
 *
 * No hay riesgo de salto de layout: todo el chrome es position:fixed y el espacio
 * lo reserva cdk-shell.css desde el <head>, con selectores sobre [data-modulo],
 * un atributo que existe ya en tiempo de parseo.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var el = CDK.el;
    var svg = CDK.svg;

    var SLOTS_BOTTOM = 4;   // el quinto es siempre "Más"

    var moduloActivo = null;
    var firmaPintada = null;

    /* ---------------------------------------------------------------
     * Utilidades
     * ------------------------------------------------------------- */
    function firma(claves) {
        return claves.join("|");
    }

    /** true si la pagina actual es el hub del modulo, no una tarea dentro de el. */
    function esHub() {
        return new RegExp("/" + moduloActivo + "\\.html$").test(location.pathname);
    }

    /**
     * A donde lleva el boton de volver.
     *
     * Respeta los tres niveles reales (inicio -> hub del modulo -> tarea), que
     * hoy estan rotos: los 7 hubs no tienen salida ninguna y las tareas saltan
     * directas a main.html, saltandose el hub.
     */
    function destinoAtras() {
        // data-volver="/main.html" fuerza un destino concreto. Lo usan las
        // paginas que no son de modulo, como Configuracion.
        var forzado = document.body.getAttribute("data-volver");
        if (forzado) return CDK.rutas.app(forzado);

        if (!moduloActivo) return null;                        // panel principal
        return esHub() ? CDK.rutas.inicio() : CDK.catalogo.hub(moduloActivo);
    }

    function icono(path, clase) {
        return svg(path, "cdk-icono " + (clase || ""));
    }

    /* ---------------------------------------------------------------
     * Visibilidad por tipo de vendedor
     *
     * <section data-tipo="ESPECIALISTA">
     * <button  data-tipo="JEFATURA,ZONA">
     * <div     data-tipo-excepto="COBERTURA">
     *
     * Se ELIMINA el nodo, no se oculta: asi no quedan campos de formulario que
     * puedan enviarse por error ni markup que confunda al inspeccionar.
     *
     * Esto es presentacion, no seguridad. Quien quiera puede editar el DOM; lo
     * que protege de verdad es que el backend rechace la operacion.
     * ------------------------------------------------------------- */
    function aplicarVisibilidadPorTipo() {
        var tipo = CDK.sesion.tipo();
        if (!tipo) return;   // sin dato aun: no se oculta nada

        function lista(nodo, attr) {
            return (nodo.getAttribute(attr) || "")
                .split(",")
                .map(function (s) { return s.trim().toUpperCase(); })
                .filter(Boolean);
        }

        document.querySelectorAll("[data-tipo]").forEach(function (nodo) {
            var permitidos = lista(nodo, "data-tipo");
            if (permitidos.length && permitidos.indexOf(tipo.toUpperCase()) === -1) nodo.remove();
        });

        document.querySelectorAll("[data-tipo-excepto]").forEach(function (nodo) {
            var excluidos = lista(nodo, "data-tipo-excepto");
            if (excluidos.indexOf(tipo.toUpperCase()) !== -1) nodo.remove();
        });
    }

    /* ---------------------------------------------------------------
     * Navbar
     * ------------------------------------------------------------- */
    function construirNavbar() {
        var izquierda = [];

        var atras = destinoAtras();
        if (atras) {
            izquierda.push(el("a", {
                href: atras,
                clase: "cdk-navbar__atras",
                "aria-label": "Volver"
            }, [icono(CDK.catalogo.iconos.atras)]));
        }

        var titulo = document.body.getAttribute("data-titulo")
            || (moduloActivo ? CDK.catalogo.modulo(moduloActivo).etiqueta : "CDK");

        izquierda.push(el("div", { clase: "cdk-navbar__marca" }, [
            el("img", { src: CDK.rutas.app("/logotipo.png"), alt: "", clase: "cdk-navbar__logo" }),
            el("span", { clase: "cdk-navbar__titulo", texto: titulo })
        ]));

        /* --- menu de usuario --- */
        var nombre = el("span", { clase: "cdk-usuario__nombre", id: "cdk-usuario-nombre", texto: "" });

        var disparador = el("button", {
            type: "button",
            clase: "cdk-usuario__boton",
            id: "cdk-usuario-boton",
            "aria-label": "Menú de usuario",
            "aria-expanded": "false",
            "aria-haspopup": "true"
        }, [
            el("span", { clase: "cdk-usuario__avatar" }, [icono(CDK.catalogo.iconos.usuario)]),
            nombre
        ]);

        var menu = el("div", { clase: "cdk-usuario__menu", id: "cdk-usuario-menu", hidden: "hidden" }, [
            el("p", { clase: "cdk-usuario__detalle", id: "cdk-usuario-detalle", texto: "" }),
            el("button", {
                type: "button",
                id: "sesion-terminada",          // el id que ya usa el proyecto
                clase: "cdk-usuario__salir"
            }, [icono(CDK.catalogo.iconos.salir, "cdk-icono--sm"), el("span", { texto: "Cerrar sesión" })])
        ]);

        disparador.addEventListener("click", function (ev) {
            ev.stopPropagation();
            var abierto = !menu.hidden;
            menu.hidden = abierto;
            disparador.setAttribute("aria-expanded", String(!abierto));
        });

        document.addEventListener("click", function () {
            if (!menu.hidden) {
                menu.hidden = true;
                disparador.setAttribute("aria-expanded", "false");
            }
        });

        document.addEventListener("keydown", function (ev) {
            if (ev.key === "Escape" && !menu.hidden) {
                menu.hidden = true;
                disparador.setAttribute("aria-expanded", "false");
                disparador.focus();
            }
        });

        return el("header", { clase: "cdk-navbar", id: "cdk-navbar" }, [
            el("div", { clase: "cdk-navbar__izq" }, izquierda),
            el("div", { clase: "cdk-navbar__der" }, [
                el("div", { clase: "cdk-usuario" }, [disparador, menu])
            ])
        ]);
    }

    /* ---------------------------------------------------------------
     * Sidebar (desktop)
     * ------------------------------------------------------------- */
    /* Enlaces que no son modulos: viven separados, al pie del sidebar. */
    var SISTEMA = [
        { clave: "configuracion", etiqueta: "Configuración", icono: "ajustes", href: "/configuracion.html" }
    ];

    function enlaceSistema(entrada, variante) {
        var href = CDK.rutas.app(entrada.href);
        var activo = location.pathname === href || location.pathname.endsWith(entrada.href);

        var a = el("a", {
            href: href,
            clase: "cdk-" + variante + "__enlace" + (activo ? " es-activo" : ""),
            title: entrada.etiqueta
        }, [
            icono(CDK.catalogo.iconos[entrada.icono]),
            el("span", { clase: "cdk-" + variante + "__texto", texto: entrada.etiqueta })
        ]);

        if (activo) a.setAttribute("aria-current", "page");

        return el("li", {}, [a]);
    }

    function construirSidebar() {
        var sistema = el("ul", { clase: "cdk-sidebar__lista" });
        SISTEMA.forEach(function (entrada) {
            sistema.appendChild(enlaceSistema(entrada, "sidebar"));
        });

        return el("nav", {
            clase: "cdk-sidebar",
            id: "cdk-sidebar",
            "aria-label": "Navegación lateral"
        }, [
            el("p", { clase: "cdk-sidebar__epigrafe", texto: "Módulos" }),
            el("ul", { clase: "cdk-sidebar__lista", id: "cdk-sidebar-lista" }),
            el("div", { clase: "cdk-sidebar__pie" }, [sistema])
        ]);
    }

    function construirBottomNav() {
        return el("nav", {
            clase: "cdk-bottomnav",
            id: "cdk-bottomnav",
            "aria-label": "Navegación principal"
        }, [el("ul", { clase: "cdk-bottomnav__lista", id: "cdk-bottomnav-lista" })]);
    }

    /* ---------------------------------------------------------------
     * Pintado de los modulos
     * ------------------------------------------------------------- */
    function enlaceModulo(clave, activo, variante) {
        var meta = CDK.catalogo.modulo(clave);

        var a = el("a", {
            href: CDK.catalogo.hub(clave),
            clase: "cdk-" + variante + "__enlace" + (activo ? " es-activo" : ""),
            title: meta.etiqueta
        }, [
            icono(meta.icono),
            el("span", { clase: "cdk-" + variante + "__texto", texto: meta.etiqueta })
        ]);

        if (activo) a.setAttribute("aria-current", "page");

        return el("li", {}, [a]);
    }

    /**
     * Orden del bottom nav: prioridad declarada en el catalogo, nunca el orden en
     * que el backend devuelva las claves. Si el modulo activo no entra por
     * prioridad, se promueve al ultimo slot para que el usuario vea siempre donde
     * esta parado.
     */
    function ordenarParaBottom(claves) {
        var ordenadas = CDK.catalogo.ordenar(claves);
        if (ordenadas.length <= SLOTS_BOTTOM) return ordenadas;

        var visibles = ordenadas.slice(0, SLOTS_BOTTOM);

        if (moduloActivo && ordenadas.indexOf(moduloActivo) >= SLOTS_BOTTOM) {
            visibles[SLOTS_BOTTOM - 1] = moduloActivo;
        }

        return visibles;
    }

    function pintarModulos(modulos) {
        var claves = CDK.catalogo.ordenar(Object.keys(modulos || {}));
        var nueva = firma(claves);

        // Ya esta pintado esto mismo: no repintar (evita parpadeo al revalidar).
        if (nueva === firmaPintada) return;
        firmaPintada = nueva;

        /* --- sidebar: todos los modulos --- */
        var lista = document.getElementById("cdk-sidebar-lista");
        if (lista) {
            lista.innerHTML = "";
            claves.forEach(function (clave) {
                lista.appendChild(enlaceModulo(clave, clave === moduloActivo, "sidebar"));
            });
        }

        /* --- bottom nav: 4 + "Más" --- */
        var barra = document.getElementById("cdk-bottomnav-lista");
        if (!barra) return;

        barra.innerHTML = "";
        var visibles = ordenarParaBottom(claves);

        visibles.forEach(function (clave) {
            barra.appendChild(enlaceModulo(clave, clave === moduloActivo, "bottomnav"));
        });

        // El quinto slot es SIEMPRE "Más", aunque quepan todos los modulos:
        // es la unica via a Configuracion en movil, donde no hay sidebar.
        var btn = el("button", {
            type: "button",
            clase: "cdk-bottomnav__enlace",
            "aria-label": "Ver todos los módulos y ajustes"
        }, [
            icono(CDK.catalogo.iconos.mas),
            el("span", { clase: "cdk-bottomnav__texto", texto: "Más" })
        ]);

        btn.addEventListener("click", function (ev) {
            ev.stopPropagation();
            abrirHoja(claves);
        });

        barra.appendChild(el("li", {}, [btn]));
    }

    function pintarEsqueleto() {
        var lista = document.getElementById("cdk-sidebar-lista");
        var barra = document.getElementById("cdk-bottomnav-lista");

        function hueco() {
            return el("li", {}, [el("span", { clase: "cdk-esqueleto" })]);
        }

        for (var i = 0; i < 5; i++) { if (lista) lista.appendChild(hueco()); }
        for (var j = 0; j < 4; j++) { if (barra) barra.appendChild(hueco()); }
    }

    /* ---------------------------------------------------------------
     * Hoja "Más"
     * ------------------------------------------------------------- */
    function abrirHoja(claves) {
        var existente = document.getElementById("cdk-hoja");
        if (existente) existente.remove();

        var lista = el("ul", { clase: "cdk-hoja__lista" });
        claves.forEach(function (clave) {
            lista.appendChild(enlaceModulo(clave, clave === moduloActivo, "hoja"));
        });

        var sistema = el("ul", { clase: "cdk-hoja__lista" });
        SISTEMA.forEach(function (entrada) {
            sistema.appendChild(enlaceSistema(entrada, "hoja"));
        });

        var hoja = el("div", { clase: "cdk-hoja", id: "cdk-hoja", role: "dialog", "aria-modal": "true", "aria-label": "Módulos y ajustes" }, [
            el("div", { clase: "cdk-hoja__fondo" }),
            el("div", { clase: "cdk-hoja__panel" }, [
                el("div", { clase: "cdk-hoja__asa" }),
                el("h2", { clase: "cdk-hoja__titulo", texto: "Módulos" }),
                lista,
                el("h2", { clase: "cdk-hoja__titulo cdk-hoja__titulo--sep", texto: "Ajustes" }),
                sistema
            ])
        ]);

        function cerrar() {
            hoja.remove();
            document.removeEventListener("keydown", enTecla, true);
        }
        function enTecla(ev) { if (ev.key === "Escape") cerrar(); }

        hoja.querySelector(".cdk-hoja__fondo").addEventListener("click", cerrar);
        document.addEventListener("keydown", enTecla, true);

        document.body.appendChild(hoja);
    }

    /* ---------------------------------------------------------------
     * Datos del usuario en el navbar
     * ------------------------------------------------------------- */
    function pintarUsuario() {
        var usuario = CDK.sesion.usuario();
        if (!usuario) return;

        var nombre = document.getElementById("cdk-usuario-nombre");
        if (nombre) nombre.textContent = usuario.nombre;

        var detalle = document.getElementById("cdk-usuario-detalle");
        if (detalle) {
            var tipo = usuario.tipo ? CDK.catalogo.tipo(usuario.tipo) : null;
            detalle.textContent = tipo ? tipo.etiqueta : (usuario.tipo || "");
        }
    }

    /* ---------------------------------------------------------------
     * Montaje
     * ------------------------------------------------------------- */
    CDK.shell = {
        montar: function () {
            var body = document.body;
            if (!body) return;
            if (document.getElementById("cdk-navbar")) return;   // ya montado

            var modo = body.getAttribute("data-shell");
            if (modo === "none") return;   // login, registro, paginas de dev

            moduloActivo = body.getAttribute("data-modulo");

            // data-shell="inicio" es el panel principal: monta el shell, pero sin
            // modulo activo y sin boton de volver.
            if (!moduloActivo && modo !== "inicio") return;

            /* --- Fase 1: sincrona, sin red --- */
            var frag = document.createDocumentFragment();
            frag.appendChild(construirNavbar());
            frag.appendChild(construirSidebar());
            frag.appendChild(construirBottomNav());
            body.appendChild(frag);

            var cache = CDK.permisos.modulosCache();
            if (cache) { pintarModulos(cache); pintarUsuario(); aplicarVisibilidadPorTipo(); }
            else pintarEsqueleto();

            /* --- Fase 2: revalidacion en segundo plano ---
             * Esta peticion hace tambien de sonda de sesion: si devuelve 401,
             * CDK.http dispara CDK.sesion.expirar(). Por eso el guard no necesita
             * una peticion propia. */
            CDK.permisos.modulos({ forzar: !!cache })
                .then(function (modulos) {
                    pintarModulos(modulos);
                    pintarUsuario();
                    if (!cache) aplicarVisibilidadPorTipo();
                })
                .catch(function (err) {
                    if (CDK.http.esError(err) && err.status === 401) return;   // ya redirige
                    console.error("[CDK] no se pudieron cargar los módulos:", err);
                    if (!cache) {
                        firmaPintada = null;
                        pintarModulos({});
                        CDK.toast("No se pudieron cargar los módulos", "error");
                    }
                });
        },

        /** Cambia el titulo del navbar en caliente. */
        titulo: function (texto) {
            var nodo = document.querySelector(".cdk-navbar__titulo");
            if (nodo) nodo.textContent = texto;
        },

        /** Expuesto para paginas que pinten contenido propio tras cargar datos. */
        aplicarVisibilidadPorTipo: aplicarVisibilidadPorTipo
    };

    CDK.shell.montar();

})(window);
