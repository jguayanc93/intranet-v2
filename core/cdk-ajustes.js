/**
 * cdk-ajustes.js — Preferencias del usuario.
 *
 * Hoy se guardan SOLO en el navegador, por decision del equipo. Eso implica que
 * son por usuario y por equipo: quien entre desde otro telefono no vera sus
 * ajustes.
 *
 * Todo el acceso al almacenamiento pasa por el adaptador `almacen` de abajo.
 * Para pasar al backend solo hay que sustituir ese objeto: ni la pagina de
 * configuracion ni el shell se enteran.
 *
 * Contrato propuesto para cuando llegue ese momento:
 *   GET    /v1/vendedor            -> { ..., ajustes: { fondo, fondoAtenuar } }
 *   POST   /v1/vendedor/fondo      multipart, campo "imagen" -> { url }
 *   DELETE /v1/vendedor/fondo      -> { ok: true }
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};

    var CLAVE = "cdk.ajustes.v1";

    var POR_DEFECTO = {
        fondo: null,          // dataURL hoy; sera una URL cuando lo sirva el backend
        fondoAtenuar: 45      // % de velo sobre la imagen, para que el texto se lea
    };

    /* ---------------------------------------------------------------
     * Limites de la imagen
     *
     * Se reescala en el navegador ANTES de guardar. Sirve para dos cosas:
     * que quepa en localStorage, y que el dia que se suba al backend no se
     * manden 8 MB desde el movil de un vendedor con datos moviles.
     * ------------------------------------------------------------- */
    var MAX_ENTRADA   = 12 * 1024 * 1024;   // rechaza antes de procesar
    var MAX_ANCHO     = 2560;               // cubre pantallas anchas sin recortar
    var MAX_ALTO      = 1600;
    var PRESUPUESTO   = 1024 * 1024;        // 1 MB de imagen final
    var CALIDADES     = [0.92, 0.86, 0.80, 0.72, 0.62];
    var TIPOS_VALIDOS = ["image/jpeg", "image/png", "image/webp"];

    /* ===============================================================
     * Adaptador de almacenamiento — el unico punto a cambiar
     * ============================================================= */
    var almacen = {
        leer: function () {
            try {
                var crudo = localStorage.getItem(CLAVE);
                return crudo ? Object.assign({}, POR_DEFECTO, JSON.parse(crudo)) : Object.assign({}, POR_DEFECTO);
            } catch (e) {
                return Object.assign({}, POR_DEFECTO);
            }
        },

        escribir: function (ajustes) {
            try {
                localStorage.setItem(CLAVE, JSON.stringify(ajustes));
                return Promise.resolve(ajustes);
            } catch (e) {
                // QuotaExceededError con una imagen grande, o almacenamiento
                // bloqueado en navegacion privada.
                return Promise.reject(new Error(
                    "No hay espacio para guardar la imagen en este navegador. Prueba con una más ligera."
                ));
            }
        }
    };

    var cache = null;

    /**
     * Bytes reales que ocupa un dataURL una vez decodificado.
     * base64 abulta 4/3, y la cola "==" no son datos.
     */
    function bytesDe(dataUrl) {
        if (!dataUrl) return 0;

        var coma = dataUrl.indexOf(",");
        var base64 = coma === -1 ? dataUrl : dataUrl.slice(coma + 1);
        var relleno = base64.endsWith("==") ? 2 : (base64.endsWith("=") ? 1 : 0);

        return Math.max(Math.floor(base64.length * 3 / 4) - relleno, 0);
    }

    /* ===============================================================
     * Reescalado
     * ============================================================= */
    function reescalar(archivo) {
        return new Promise(function (resolver, rechazar) {
            if (TIPOS_VALIDOS.indexOf(archivo.type) === -1) {
                rechazar(new Error("Formato no admitido. Usa JPG, PNG o WebP."));
                return;
            }
            if (archivo.size > MAX_ENTRADA) {
                rechazar(new Error("La imagen pesa más de 12 MB. Elige una más ligera."));
                return;
            }

            var url = URL.createObjectURL(archivo);
            var img = new Image();

            img.onload = function () {
                URL.revokeObjectURL(url);

                if (!img.width || !img.height) {
                    rechazar(new Error("El archivo no es una imagen válida."));
                    return;
                }

                /**
                 * Se dibuja al maximo tamaño admitido y se va bajando la calidad
                 * hasta caber en el presupuesto. Asi una foto buena aprovecha el
                 * megabyte entero en vez de quedarse corta por una calidad fija,
                 * y una enorme se ajusta sola en lugar de fallar al guardar.
                 */
                function intentar(ancho, alto, vuelta) {
                    var lienzo = document.createElement("canvas");
                    lienzo.width = ancho;
                    lienzo.height = alto;

                    var ctx = lienzo.getContext("2d");
                    ctx.imageSmoothingQuality = "high";
                    // Fondo blanco: si el original es un PNG transparente, el JPEG
                    // resultante mostraria negro donde habia transparencia.
                    ctx.fillStyle = "#ffffff";
                    ctx.fillRect(0, 0, ancho, alto);
                    ctx.drawImage(img, 0, 0, ancho, alto);

                    for (var i = 0; i < CALIDADES.length; i++) {
                        var dataUrl = lienzo.toDataURL("image/jpeg", CALIDADES[i]);
                        if (bytesDe(dataUrl) <= PRESUPUESTO) {
                            return { dataUrl: dataUrl, ancho: ancho, alto: alto, calidad: CALIDADES[i] };
                        }
                    }

                    // Ni con la calidad mas baja cabe: se reduce el tamaño y se
                    // reintenta. Tope de vueltas para no quedarse dando vueltas
                    // con una imagen absurda.
                    if (vuelta < 4) {
                        return intentar(Math.round(ancho * 0.8), Math.round(alto * 0.8), vuelta + 1);
                    }

                    return null;
                }

                try {
                    var escala = Math.min(MAX_ANCHO / img.width, MAX_ALTO / img.height, 1);
                    var resultado = intentar(
                        Math.max(Math.round(img.width * escala), 1),
                        Math.max(Math.round(img.height * escala), 1),
                        0
                    );

                    if (!resultado) {
                        rechazar(new Error("No se pudo reducir la imagen por debajo de 1 MB. Prueba con otra."));
                        return;
                    }

                    resolver(resultado);
                } catch (e) {
                    rechazar(new Error("No se pudo procesar la imagen."));
                }
            };

            img.onerror = function () {
                URL.revokeObjectURL(url);
                rechazar(new Error("El archivo no es una imagen válida."));
            };

            img.src = url;
        });
    }

    /* ===============================================================
     * API
     * ============================================================= */
    CDK.ajustes = {
        /** Todos los ajustes. Sincrono. */
        leer: function () {
            if (!cache) cache = almacen.leer();
            return cache;
        },

        /** Valor de un ajuste concreto. */
        obtener: function (clave) {
            return CDK.ajustes.leer()[clave];
        },

        /** Guarda un ajuste. Devuelve promesa por el adaptador de backend futuro. */
        fijar: function (clave, valor) {
            var ajustes = Object.assign({}, CDK.ajustes.leer());
            ajustes[clave] = valor;
            cache = ajustes;
            return almacen.escribir(ajustes);
        },

        /**
         * Valida y reescala una imagen SIN guardarla.
         * Devuelve {dataUrl, ancho, alto}, para poder enseñar una vista previa
         * de exactamente lo que se guardara.
         */
        preparar: reescalar,

        /** Reescala la imagen y la guarda como fondo. */
        guardarFondo: function (archivo) {
            return reescalar(archivo).then(function (resultado) {
                return CDK.ajustes.fijar("fondo", resultado.dataUrl).then(function () {
                    return resultado;
                });
            });
        },

        quitarFondo: function () {
            return CDK.ajustes.fijar("fondo", null);
        },

        /**
         * Pinta el fondo sobre un elemento.
         *
         * La imagen va en un pseudo-contenedor propio y por encima se aplica un
         * velo blanco: sin el, un texto oscuro sobre una foto oscura queda
         * ilegible, y el nivel correcto depende de la imagen que suba cada
         * persona, no de algo que podamos fijar aqui.
         */
        aplicarFondo: function (elemento) {
            if (!elemento) return;

            var ajustes = CDK.ajustes.leer();

            if (!ajustes.fondo) {
                elemento.classList.remove("cdk-con-fondo");
                elemento.style.removeProperty("--cdk-fondo-img");
                elemento.style.removeProperty("--cdk-fondo-velo");
                return;
            }

            var atenuar = Number(ajustes.fondoAtenuar);
            if (!isFinite(atenuar)) atenuar = POR_DEFECTO.fondoAtenuar;

            elemento.classList.add("cdk-con-fondo");
            elemento.style.setProperty("--cdk-fondo-img", 'url("' + ajustes.fondo + '")');
            elemento.style.setProperty("--cdk-fondo-velo", (Math.min(Math.max(atenuar, 0), 95) / 100).toFixed(2));
        },

        /** Tamaño del fondo guardado, en KB. */
        pesoFondo: function () {
            return Math.round(bytesDe(CDK.ajustes.leer().fondo) / 1024);
        },

        /** Bytes de un dataURL. Lo usa la página de configuración. */
        bytesDe: bytesDe,

        /** Presupuesto máximo de la imagen, en bytes. */
        presupuesto: PRESUPUESTO
    };

})(window);
