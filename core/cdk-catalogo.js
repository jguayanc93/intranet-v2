/**
 * cdk-catalogo.js — Conocimiento declarativo del frontend. Sin logica.
 *
 * Dos catalogos:
 *   1. MODULOS  — etiqueta, icono, prioridad en el bottom nav y mapa permiso->pagina.
 *                 Reemplaza los 14 switch duplicados en los 7 hubs
 *                 (enlaces_de_permisos + direccionador_de_permisos).
 *   2. TIPOS    — tipos de vendedor y que grupo los ofrece.
 *                 Reemplaza los switch de autenticador.html.
 *
 * IMPORTANTE: esto NO autoriza nada. El backend decide que modulos y accesos tiene
 * cada usuario; aqui solo esta como se PINTAN. Nunca agregar reglas de permisos.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};

    /* ---------------------------------------------------------------
     * Iconos — SVG inline (paths de Heroicons outline).
     *
     * A proposito no son Font Awesome: solo 9 de las 45 paginas lo cargan, y el
     * shell tiene que verse igual en todas. Inline no depende de ningun CDN.
     * ------------------------------------------------------------- */
    var ICONOS = {
        cotizacion:  'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25Z',
        pedido:      'M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007Z',
        factura:     'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 0 0 2.25-2.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25v10.5A2.25 2.25 0 0 0 4.5 19.5Z',
        promocion:   'M21 11.25v8.25a1.5 1.5 0 0 1-1.5 1.5H5.25a1.5 1.5 0 0 1-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 1 0 9.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1 1 14.625 7.5H12m0 0V21m-8.625-9.75h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z',
        cuota:       'M10.5 6a7.5 7.5 0 1 0 7.5 7.5h-7.5V6Z M13.5 10.5H21A7.5 7.5 0 0 0 13.5 3v7.5Z',
        listas:      'M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
        programador: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5',
        reporte:     'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z',

        generico:    'M21 7.5V18M15 7.5V18M3 16.811V8.69c0-.864.933-1.406 1.683-.977l7.108 4.061a1.125 1.125 0 0 1 0 1.954l-7.108 4.061A1.125 1.125 0 0 1 3 16.811Z',
        mas:         'M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z',
        menu:        'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
        usuario:     'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
        salir:       'M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75',
        inicio:      'm2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25',
        atras:       'M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18',
        cerrar:      'M6 18 18 6M6 6l12 12',
        ajustes:     'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
        imagen:      'm2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z',
        subir:       'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3'
    };

    /* ---------------------------------------------------------------
     * MODULOS
     *
     * `prioridad`: orden de preferencia para los 4 slots del bottom nav.
     *              Menor numero = mas cerca del pulgar. Es una decision de
     *              diseño, NUNCA "los primeros que devuelva el backend".
     * `carpeta`:   donde viven las paginas del modulo. Ojo: el modulo "listas"
     *              usa la carpeta "lista", en singular.
     * `existe:false` en un acceso: el backend puede conceder ese permiso, pero no
     *              se ejecuta desde esta intranet (se gestiona en otro sistema) o
     *              la pantalla no vive aqui. No es deuda pendiente. Se pinta sin
     *              enlace en vez de mandar al usuario a un 404.
     * ------------------------------------------------------------- */
    /* La ficha de factura, a la que llevan sus siete permisos. Se declara
       aparte y se referencia siete veces para que se lea de un vistazo que
       son el mismo sitio, y no siete entradas casi iguales que alguien
       tendria que comparar linea a linea. */
    var FICHA_FACTURA = {
        pagina: "factura_campos",
        etiqueta: "Modificar factura",
        descripcion: "Despacho, transportista, atención, dirección, observación y orden de compra"
    };

    var MODULOS = {
        cotizacion: {
            etiqueta: "Cotización",
            icono: ICONOS.cotizacion,
            prioridad: 1,
            carpeta: "cotizacion",
            accesos: {
                "crear":  { pagina: "cotizacion_nuevo",      etiqueta: "Crear",     descripcion: "Crear una nueva cotización" },
                "leer":   { pagina: "cotizacion_observar",   etiqueta: "Ver",       descripcion: "Consultar una cotización" },
                "update": { pagina: "cotizacion_modificar",  etiqueta: "Modificar", descripcion: "Modificar una cotización reciente" },
                "delete": { pagina: "cotizacion_eliminar",   etiqueta: "Eliminar",  descripcion: "Dar de baja una cotización" },
                "alm":    { pagina: "cotizacion_almacen",    etiqueta: "Almacén",   descripcion: "Cambiar el almacén de una cotización" }
            }
        },

        pedido: {
            etiqueta: "Pedido",
            icono: ICONOS.pedido,
            prioridad: 2,
            carpeta: "pedido",
            accesos: {
                "flete": { pagina: "pedido_flete",   etiqueta: "Flete",   descripcion: "Aplicar flete a un pedido" },
                "alm":   { pagina: "pedido_almacen", etiqueta: "Almacén", descripcion: "Cambiar el almacén de un pedido" }
            }
        },

        factura: {
            etiqueta: "Factura",
            icono: ICONOS.factura,
            prioridad: 3,
            carpeta: "factura",
            /* Los siete permisos abren la MISMA pantalla.

               Eran siete pantallas, una por campo, y las siete empezaban
               obligando a buscar otra vez la misma factura. Ahora es una
               ficha: se busca una vez y se toca el campo que haga falta.

               Los permisos siguen siendo siete porque siguen decidiendo cosas
               distintas — `vendedor` es de jefatura de zona y los demás no—,
               pero quien decide qué fila se puede tocar es el bloque `puede`
               que devuelve /factura/campos. El hub los colapsa en una
               tarjeta. Ver docs/factura.md. */
            accesos: {
                "despacho":    FICHA_FACTURA,
                "transporte":  FICHA_FACTURA,
                "atencion":    FICHA_FACTURA,
                "direccion":   FICHA_FACTURA,
                "vendedor":    FICHA_FACTURA,
                "observacion": FICHA_FACTURA,
                "orden":       FICHA_FACTURA
            }
        },

        promocion: {
            etiqueta: "Promoción",
            icono: ICONOS.promocion,
            prioridad: 4,
            carpeta: "promocion",
            accesos: {
                "update":            { pagina: "promocion_acoplar", etiqueta: "Aplicar", descripcion: "Poner promociones a una cotización" },
                "delete cotizacion": { pagina: "promocion_quitar",  etiqueta: "Quitar",  descripcion: "Quitar promociones de una cotización" },

                /* Quitar de un PEDIDO no se puede todavía: no existe una ruta
                   que liste las líneas de promoción de un pedido, y
                   /promocion/eliminar nombra las tablas de cotización en sus
                   consultas. La pantalla que había leía `#ncoti` y preguntaba
                   por una cotización, así que prometía algo que no hacía.

                   El backend dice que construirlo no es grande; falta decidir
                   en qué estados de pedido se permite. Ver docs/promocion-modulo.md. */
                "delete pedido":     { pagina: "promocion_quitar_pedido", etiqueta: "Quitar de pedido", descripcion: "Quitar promociones de un pedido", existe: false },

                /* Sin pantalla y sin ruta detrás. En la matriz están con la
                   lista de grupos vacía, que el backend entiende como «sin
                   restringir», así que se conceden a todo el mundo. */
                "crear":             { pagina: "promocion_nuevo",    etiqueta: "Crear", descripcion: "Crear una nueva promoción", existe: false },
                "leer":              { pagina: "promocion_observar", etiqueta: "Ver",   descripcion: "Consultar una promoción",   existe: false }
            }
        },

        cuota: {
            etiqueta: "Cuota",
            icono: ICONOS.cuota,
            prioridad: 5,
            carpeta: "cuota",
            accesos: {
                "crear":  { pagina: "cuota_registrar", etiqueta: "Registrar", descripcion: "Registrar tu cuota mensual" },
                "leer":   { pagina: "cuota_observar",  etiqueta: "Ver",       descripcion: "Consultar tu avance" },
                /* Modificar y eliminar no existen, y probablemente no deban:
                   la cuota se registra UNA VEZ AL MES y no se cambia. El
                   backend lo hace cumplir con un 409 desde que se cerró el
                   hueco por el que entraban dos filas del mismo mes. */
                "update": { pagina: "cuota_modificar", etiqueta: "Modificar", descripcion: "Modificar tu cuota", existe: false },
                "delete": { pagina: "cuota_eliminar",  etiqueta: "Eliminar",  descripcion: "Eliminar tu cuota fijada", existe: false }
            }
        },

        listas: {
            etiqueta: "Listados",
            icono: ICONOS.listas,
            prioridad: 6,
            carpeta: "lista",
            accesos: {
                "cotizacion": { pagina: "lista_cotizacion", etiqueta: "Cotizaciones", descripcion: "Listar tus cotizaciones" },
                "pedido":     { pagina: "lista_pedido",     etiqueta: "Pedidos",      descripcion: "Listar tus pedidos" },
                "factura":    { pagina: "lista_factura",    etiqueta: "Facturas",     descripcion: "Listar tus facturas" },
                "clientes":   { pagina: "lista_clientes",   etiqueta: "Clientes",     descripcion: "Listar tus clientes" }
            }
        },

        programador: {
            etiqueta: "Programador",
            icono: ICONOS.programador,
            prioridad: 7,
            carpeta: "programador",
            accesos: {
                /* Las tres estan `existe:false` a proposito y el modulo se
                   queda sin accion operable. No es deuda escondida: entregar
                   se deja para mas adelante por decision de negocio, y las
                   otras dos nunca se construyeron —la de retirar era un
                   archivo de doce lineas con un "uppsi" dentro—.

                   La pantalla vieja de entregar sigue en el repositorio pero
                   no se enlaza desde aqui. Lo que hay que saber antes de
                   montarla esta en docs/programador.md: dos de las posiciones
                   que pinta no estan documentadas, y el limite de fechas no
                   se aplica nueve meses al año. */
                "entregar":    { pagina: "programador_entregar",    etiqueta: "Entrega",    descripcion: "Programar para despacho en almacén", existe: false },
                "retirar":     { pagina: "programador_retirar",     etiqueta: "Retira",     descripcion: "Retirar del despacho en almacén", existe: false },
                "reprogramar": { pagina: "programador_reprogramar", etiqueta: "Reprograma", descripcion: "Cambiar el día de despacho", existe: false }
            }
        },

        reporte: {
            etiqueta: "Reportes",
            icono: ICONOS.reporte,
            prioridad: 8,
            carpeta: "",          // reporte.html vive en la raiz
            accesos: {}           // no usa el patron de accesos dinamicos
        }
    };

    /* ---------------------------------------------------------------
     * ALMACENES
     *
     * El backend los devuelve por código ("01", "08"). Mostrar el código en
     * pantalla obliga a la persona a traducirlo de memoria.
     * Lo usan cotización, pedido y factura.
     * ------------------------------------------------------------- */
    /* Nombre de cada almacen, confirmados contra tbl01alm. El ERP guarda el
       stock de cada uno en su propia tabla, prd01 + codigo: prd0101, prd0108,
       prd0115, prd0116. Chorrillos figura porque durante un tiempo su stock se
       devolvia rotulado como Piura (prd0116 en vez de prd0115), y un dato
       antiguo con ese codigo tiene que poder leerse igual. */
    var ALMACENES = {
        "01": "Principal",
        "08": "M&M",
        "15": "Piura",
        "16": "Chorrillos"
    };

    /* A cuales se puede MOVER una cotizacion. Es una lista aparte a proposito:
       saber como se llama el almacen 15 no significa que sea un destino valido,
       y eso lo decide el negocio, no el catalogo. Mientras no se confirme, el
       desplegable ofrece los dos de siempre. */
    var ALMACENES_DESTINO = ["01", "08"];

    /* ---------------------------------------------------------------
     * TIPOS DE VENDEDOR
     *
     * El tipo se elige una vez en autenticador.html y se persiste en el backend
     * (POST /login/registro/completado). El `grupo` que devuelve el backend
     * determina que tipos puede elegir la persona.
     *
     * Dos ejes distintos, no confundirlos:
     *
     *   grupo  — de quien depende organizativamente. Lo da el backend.
     *   nivel  — que tan arriba esta en la jerarquia comercial:
     *              1 ejecutivo de venta
     *              2 jefe de linea o de marca
     *              3 jefe de los de nivel 2
     *            Dos tipos del MISMO grupo no son intercambiables (cobertura y
     *            cartera comparten grupo pero trabajan distinto), y un nivel mas
     *            alto puede estar en otro grupo (zona es jefe de jefatura y
     *            especialista, pero pertenece a VENTAS-JEFES DE ZONA).
     *
     *   vigente   — el negocio lo sigue usando.
     *   operativo — ya tiene modulos y tareas definidas en la intranet.
     *               ZONA y TIO GASEOSA son vigentes pero todavia no operativos:
     *               estan reconocidos, sin modulos asignados aun.
     * ------------------------------------------------------------- */
    var TIPOS = {
        "COBERTURA":    { etiqueta: "Cobertura",    descripcion: "Vendedor de cobertura",                 grupo: "VENTAS-EJECUTIVOS",    nivel: 1, vigente: true,  operativo: true },
        "CARTERA":      { etiqueta: "Cartera",      descripcion: "Vendedor de cartera",                   grupo: "VENTAS-EJECUTIVOS",    nivel: 1, vigente: true,  operativo: true },

        "JEFATURA":     { etiqueta: "Jefatura",     descripcion: "Jefe de línea",                         grupo: "VENTAS-JEFES DE PROD", nivel: 2, vigente: true,  operativo: true },
        "ESPECIALISTA": { etiqueta: "Especialista", descripcion: "Jefe de una marca específica",          grupo: "VENTAS-JEFES DE PROD", nivel: 2, vigente: true,  operativo: true, pideMarcas: true },

        // Jefe de jefatura y especialista, pero en otro grupo.
        "ZONA":         { etiqueta: "Zona",         descripcion: "Jefe de zona",                          grupo: "VENTAS-JEFES DE ZONA", nivel: 3, vigente: true,  operativo: false },
        "TIO GASEOSA":  { etiqueta: "Tío Gaseosa",  descripcion: "Jefe de HP y gaseosas",                 grupo: "VENTAS-JEFE DE PRODU", nivel: 2, vigente: true,  operativo: false },

        // Presentes en el switch de autenticador.html, fuera de uso.
        "WEB":          { etiqueta: "Web",          descripcion: "Vendedor de canal web",                 grupo: "VENTAS-JEFES DE ZONA", nivel: 1, vigente: false, operativo: false },
        "CHAKAL":       { etiqueta: "Chakal",       descripcion: "Chakal del tío gaseosa",                grupo: "VENTAS-JEFE DE PRODU", nivel: 1, vigente: false, operativo: false }
    };

    /* ---------------------------------------------------------------
     * API
     * ------------------------------------------------------------- */
    CDK.catalogo = {
        iconos: ICONOS,

        /** Metadatos de un modulo. Nunca devuelve null: cae a un generico. */
        modulo: function (clave) {
            return MODULOS[clave] || {
                etiqueta: String(clave || "").toUpperCase(),
                icono: ICONOS.generico,
                prioridad: 99,
                carpeta: "",
                accesos: {}
            };
        },

        /** true si el modulo esta declarado en el catalogo. */
        conocido: function (clave) {
            return Object.prototype.hasOwnProperty.call(MODULOS, clave);
        },

        /**
         * Metadatos de un acceso dentro de un modulo, con la URL ya resuelta.
         * Devuelve null si el backend manda un permiso que no conocemos.
         */
        acceso: function (claveModulo, clavePermiso) {
            var mod = MODULOS[claveModulo];
            if (!mod) return null;

            var acc = mod.accesos[clavePermiso];
            if (!acc) return null;

            var carpeta = mod.carpeta ? "/" + mod.carpeta : "";

            return {
                clave: clavePermiso,
                etiqueta: acc.etiqueta,
                descripcion: acc.descripcion,
                existe: acc.existe !== false,
                href: acc.existe === false ? null : CDK.rutas.app(carpeta + "/" + acc.pagina + ".html")
            };
        },

        /** URL del hub de un modulo (cotizacion.html, factura.html, ...). */
        hub: function (clave) {
            return CDK.rutas.app("/" + clave + ".html");
        },

        /**
         * Endpoint del que se piden los accesos de un modulo.
         * No siempre coincide con la clave: el modulo "listas" consulta "/lista".
         */
        endpointPermisos: function (clave) {
            var mod = MODULOS[clave];
            return CDK.rutas.api("/" + ((mod && mod.carpeta) || clave));
        },

        /**
         * Ordena claves de modulo por la prioridad declarada.
         * Los desconocidos van al final, alfabeticamente.
         */
        ordenar: function (claves) {
            return (claves || []).slice().sort(function (a, b) {
                var pa = CDK.catalogo.modulo(a).prioridad;
                var pb = CDK.catalogo.modulo(b).prioridad;
                if (pa !== pb) return pa - pb;
                return a.localeCompare(b);
            });
        },

        /**
         * Tipos de vendedor de un grupo (sin grupo, todos).
         * Solo los vigentes; con {soloOperativos:true}, solo los que ya tienen
         * modulos definidos.
         */
        tipos: function (grupo, opciones) {
            var soloOperativos = !!(opciones && opciones.soloOperativos);

            return Object.keys(TIPOS)
                .filter(function (clave) {
                    var t = TIPOS[clave];
                    if (!t.vigente) return false;
                    if (soloOperativos && !t.operativo) return false;
                    return !grupo || t.grupo === grupo;
                })
                .map(function (clave) {
                    return Object.assign({ clave: clave }, TIPOS[clave]);
                });
        },

        /** Metadatos de un tipo de vendedor concreto. */
        tipo: function (clave) {
            var t = TIPOS[clave];
            return t ? Object.assign({ clave: clave }, t) : null;
        },

        /**
         * Nombre de un almacén a partir de su código.
         * Si llega uno que no está en el catálogo se devuelve tal cual, para
         * que se vea que existe en vez de desaparecer.
         */
        almacen: function (codigo) {
            var clave = String(codigo === null || codigo === undefined ? "" : codigo).trim();
            return ALMACENES[clave] || clave;
        },

        /** Almacenes a los que se puede mover una cotizacion. */
        almacenes: function () {
            return ALMACENES_DESTINO.map(function (c) {
                return { codigo: c, nombre: ALMACENES[c] };
            });
        }
    };

    Object.freeze(CDK.catalogo);

})(window);
