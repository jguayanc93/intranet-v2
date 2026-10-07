/**
 * cdk-formato.js — Formateo de moneda, fechas y numeros.
 *
 * Hoy hay ~30 `.toFixed(2)` sueltos repartidos por el proyecto y un unico
 * formatMoney, en cuota/cuota_observar.html:195, que formatea PESOS CHILENOS
 * (es-CL / CLP) en una intranet que maneja soles y dolares.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};

    var LOCALE = "es-PE";

    // El proyecto usa "D" y "S" como identificadores de moneda
    // (ver el <select id="alm"> de cotizacion_nuevo.html).
    var MONEDAS = {
        "D":   { codigo: "USD", simbolo: "$"  },
        "USD": { codigo: "USD", simbolo: "$"  },
        "S":   { codigo: "PEN", simbolo: "S/" },
        "PEN": { codigo: "PEN", simbolo: "S/" }
    };

    function aNumero(valor) {
        if (typeof valor === "number") return isFinite(valor) ? valor : 0;
        var n = parseFloat(String(valor === null || valor === undefined ? "" : valor).replace(/[^\d.,-]/g, "").replace(",", "."));
        return isFinite(n) ? n : 0;
    }

    CDK.formato = {
        /**
         * Importe con su simbolo.
         *   CDK.formato.moneda(1234.5, "D")  -> "$ 1,234.50"
         *   CDK.formato.moneda(1234.5, "S")  -> "S/ 1,234.50"
         */
        moneda: function (valor, moneda) {
            var m = MONEDAS[moneda] || MONEDAS.D;
            var n = aNumero(valor);

            // narrowSymbol da "$" y "S/". Sin el, es-PE escribe "USD 1,234.50"
            // para desambiguar del sol, y el proyecto usa "$" en todas partes.
            try {
                return new Intl.NumberFormat(LOCALE, {
                    style: "currency",
                    currency: m.codigo,
                    currencyDisplay: "narrowSymbol",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(n);
            } catch (e) {
                // narrowSymbol no existe en navegadores antiguos.
                return m.simbolo + " " + CDK.formato.numero(n, 2);
            }
        },

        /** Numero con separador de miles y decimales fijos. */
        numero: function (valor, decimales) {
            var d = decimales === undefined ? 2 : decimales;
            try {
                return new Intl.NumberFormat(LOCALE, {
                    minimumFractionDigits: d,
                    maximumFractionDigits: d
                }).format(aNumero(valor));
            } catch (e) {
                return aNumero(valor).toFixed(d);
            }
        },

        /** Porcentaje ya expresado en base 100. `12.5` -> "12.5 %" */
        porcentaje: function (valor, decimales) {
            return CDK.formato.numero(valor, decimales === undefined ? 1 : decimales) + " %";
        },

        /**
         * Fecha legible. Acepta Date, timestamp o string ISO / "YYYY-MM-DD".
         * `corta` (por defecto) -> 22/09/2026
         * `larga`               -> 22 de septiembre de 2026
         * `conHora`             -> 22/09/2026 14:30
         */
        fecha: function (valor, estilo) {
            var d = CDK.formato.aFecha(valor);
            if (!d) return "";

            var opciones = { day: "2-digit", month: "2-digit", year: "numeric" };
            if (estilo === "larga")   opciones = { day: "numeric", month: "long", year: "numeric" };
            if (estilo === "conHora") opciones = { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" };

            try { return d.toLocaleDateString(LOCALE, opciones); }
            catch (e) { return d.toISOString().slice(0, 10); }
        },

        /**
         * Convierte a Date sin sorpresas de zona horaria.
         *
         * Dos trampas distintas, las dos reales en este proyecto:
         *
         * 1. "2026-09-22" se interpreta como UTC segun el estandar, asi que en
         *    Peru (UTC-5) `new Date("2026-09-22")` cae en el dia 21. Es el
         *    formato que devuelven los <input type="date">.
         *
         * 2. El backend serializa las fechas de negocio como medianoche UTC:
         *    "2026-09-23T00:00:00.000Z". Convertirlo a hora local da las 19:00
         *    del dia ANTERIOR, asi que una cotizacion del 23 se mostraba con
         *    fecha 22. Cuando la hora es exactamente medianoche UTC se trata
         *    como fecha de calendario, no como instante.
         *
         * Una marca de tiempo con hora real si se convierte a local, que es lo
         * correcto para un instante.
         */
        aFecha: function (valor) {
            if (!valor) return null;
            if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;

            if (typeof valor === "string") {
                var texto = valor.trim();

                // "2026-09-22" o "2026-09-23T00:00:00.000Z"
                var calendario = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00:00(?:\.000)?Z?)?$/.exec(texto);
                if (calendario) {
                    return new Date(+calendario[1], +calendario[2] - 1, +calendario[3]);
                }
            }

            var d = new Date(valor);
            return isNaN(d.getTime()) ? null : d;
        },

        /**
         * Una fecha como "YYYY-MM-DD".
         *
         * Se arma con getFullYear/getMonth/getDate y no con toISOString(), que
         * convierte a UTC: en Lima son cinco horas menos, así que una fecha de
         * la tarde saldría con el día siguiente.
         */
        aISO: function (valor) {
            var d = valor instanceof Date ? valor : CDK.formato.aFecha(valor);
            if (!d || isNaN(d.getTime())) return "";
            var mes = String(d.getMonth() + 1).padStart(2, "0");
            var dia = String(d.getDate()).padStart(2, "0");
            return d.getFullYear() + "-" + mes + "-" + dia;
        },

        /** Fecha de hoy como "YYYY-MM-DD", lista para un <input type="date">. */
        hoyISO: function () {
            return CDK.formato.aISO(new Date());
        },

        /** Recorta un texto largo sin cortar a media palabra si se puede evitar. */
        truncar: function (texto, largo) {
            var t = String(texto === null || texto === undefined ? "" : texto);
            var n = largo || 60;
            if (t.length <= n) return t;

            var corte = t.slice(0, n);
            var espacio = corte.lastIndexOf(" ");
            if (espacio > n * 0.6) corte = corte.slice(0, espacio);

            return corte + "…";
        }
    };

    Object.freeze(CDK.formato);

})(window);
