/**
 * Cuota por marca (grupo 25) — acceso a `/v1/cuota/marcas*`.
 *
 * Reemplaza, para el grupo 25, a las rutas antiguas de cuota por marca
 * (`/cuota/especialista`, `/multiple`, `/marcarevisar`, `/marcaupdate` y
 * `/marcamostrar`). La cuota de cobertura y cartera no cambia.
 *
 * Las respuestas vienen en el sobre `{ status, codigo, data }`, sin doble
 * codificar; aqui se devuelve ya `data`. Excepcion: **sin marcas** no trae `data`
 * sino `{ status, msg, … }` en el primer nivel, como en reportes; se devuelve como
 * `{ sinMarcas: true, msg }`, y con `enEseMes: true` si es un mes anterior (ahi
 * no hay `debeAsignar`: no es que falte elegir marcas, es que entonces no habia).
 *
 * Ver docs/cuota-grupo25.md.
 */
;(function (global) {
    "use strict";

    var CDK = global.CDK = global.CDK || {};
    var cuota = CDK.cuota = CDK.cuota || {};
    var marcas = cuota.marcas = cuota.marcas || {};

    /**
     * Lo que dice una respuesta de la cuota por marca, ya sea de `/cuota/marcas` o
     * de `/cuota/mostrar` —que para el grupo 25 redirige a aquella—.
     */
    function interpretar(r) {
        if (r && (r.debeAsignar === true || r.status === "sin marcas del mes")) {
            return { sinMarcas: true, msg: r.msg };
        }
        if (r && r.status === "sin marcas en ese mes") {
            return { sinMarcas: true, enEseMes: true, msg: r.msg };
        }
        return r && r.data !== undefined ? r.data : r;
    }

    marcas.interpretar = interpretar;

    /**
     * Metas y avance de un mes: `{ anno, mes, actual, rol, dias, marcas[], total, porDueno? }`.
     * `porDueno` solo lo trae la jefatura.
     *
     * Sin argumento, el mes en curso. Con `{ anno, mes }`, uno de los **dos meses
     * anteriores**: solo lectura, sin proyeccion, y las marcas que estaban entonces.
     */
    marcas.ver = function (periodo) {
        var consulta = periodo && periodo.anno && periodo.mes
            ? "?anno=" + encodeURIComponent(periodo.anno) + "&mes=" + encodeURIComponent(periodo.mes)
            : "";

        return CDK.http.get(CDK.rutas.api("/cuota/marcas" + consulta)).then(interpretar);
    };

    /**
     * Fija o corrige la meta de una marca. **Solo se cambia lo que se manda**: un
     * campo que no viene conserva lo que tenia, y uno en `null` lo borra. Una meta
     * tiene que ser mayor que 0: para quitarla se manda `null`.
     *
     *   fijarMeta("0008", { unidades: 3500 })      cambia solo las unidades
     *   fijarMeta("0008", { monto: null })         borra la meta de venta
     *
     * Devuelve `{ codmar, nueva, meta }` con la meta como quedo.
     */
    marcas.fijarMeta = function (codmar, campos) {
        var cuerpo = { codmar: codmar };
        Object.keys(campos || {}).forEach(function (k) { cuerpo[k] = campos[k]; });

        return CDK.http.post(CDK.rutas.api("/cuota/marcas/meta"), cuerpo)
            .then(function (r) { return r && r.data !== undefined ? r.data : r; });
    };

})(window);
