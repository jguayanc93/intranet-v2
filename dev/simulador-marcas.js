/**
 * Simulacro de `/v1/marcas` y del registro del grupo 25.
 *
 * Lo comparten dev/servidor.js —para ver las pantallas a mano— y
 * dev/pruebas/probar-marcas.js, a proposito: dos copias se desalinean, y un
 * simulacro que ya no se parece al backend hace pasar pruebas que no prueban
 * nada. Es lo que ya paso con /cuota/revisar y /cuota/mostrar.
 *
 * Lleva ESTADO —duenos, confirmaciones, familia— porque las reglas que importan
 * dependen de el: «la marca ya tiene dueño» solo se puede probar si alguien la
 * tiene. Reproduce el contrato de docs/marcas-grupo25.md; no lo inventa.
 *
 * No habla HTTP: devuelve `{ status, cuerpo, doble }` y quien lo use decide como
 * enviarlo. `doble` marca las rutas que el backend real codifica dos veces
 * (las de /login), a diferencia de /v1/marcas.
 */
"use strict";

const NOMBRE_CORTO = { "071": "COSSIO JOANNA", "229": "SAUÑE MANUEL", "233": "SAMUEL HUARANCCA" };
const NOMBRE_LARGO = { "229": "MANUEL SAUÑE INOCENTE", "233": "SAMUEL HUARANCCA MEZA" };
const FAMILIAS = { "09": "ALMACENAMIENTO EXTERNO", "11": "IMPRESION", "06": "PARTES Y PIEZAS DE COMPUTADORA" };

/* La marca 0999 existe en el ERP pero no esta en el catalogo: se incorpora. */
const SOLO_ERP = { "0999": { abrmar: "NUEVA", nombre: "NUEVA MARCA" } };

/* Que diferenciadores acepta el backend en cada grupo. CHAKAL ya no: el grupo 39
   solo acepta HP (docs/marcas-grupo25.md, secc. 9). */
const DIFERENCIADORES = {
    "VENTAS-JEFES DE PROD": ["ESPECIALISTA", "JEFATURA"],
    "VENTAS-EJECUTIVOS": ["COBERTURA", "CARTERA"],
    "VENTAS-JEFES DE ZONA": ["ZONA"],
    "VENTAS-JEFE DE PRODU": ["HP"]
};

/**
 * El estado vivo. Quien lo use puede tocarlo directamente para armar un
 * escenario: `S.confirmados["233"] = true`, `S.jefaturaConFamilia = false`…
 * `reiniciar()` lo deja todo como al empezar.
 */
const S = {
    rol: "ESPECIALISTA",
    catalogo: [],
    confirmados: {},
    dioLaJefatura: {},        // codmar -> quien se la dio, para `asignadaPor`
    metas: {},                // codmar -> la meta de cuota del mes (dev/simulador-cuota.js)
    jefaturaConFamilia: true,

    /* registro */
    grupoRegistro: "VENTAS-JEFES DE PROD",
    yaRegistrado: true,
    cargadoComoJefatura: false,
    sinSesion: false,

    /* Lo que devuelve GET /login/registro en `diferenciadores`:
         undefined  la tabla de arriba, segun el grupo
         [...]      esa lista, para probar que la pantalla obedece al backend
         false      sin el campo, como un despliegue anterior */
    diferenciadores: undefined
};

/** Los tipos que el backend acepta para este grupo: los de `diferenciadores`. */
function permitidos() {
    return Array.isArray(S.diferenciadores) ? S.diferenciadores : (DIFERENCIADORES[S.grupoRegistro] || []);
}

function reiniciar(rol) {
    S.rol = rol || "ESPECIALISTA";
    S.jefaturaConFamilia = true;
    S.dioLaJefatura = {};
    S.metas = {};
    S.confirmados = { "071": false, "229": true, "233": false };
    S.catalogo = [
        { codmar: "0124", abrmar: "ACER",  nombre: "ACER",          codfam: "09", trabajada: true,  dueno: "071" },
        { codmar: "0003", abrmar: "MEMOR", nombre: "MEMOREX",       codfam: "09", trabajada: true,  dueno: "229" },
        { codmar: "0032", abrmar: "ADATA", nombre: "ADATA",         codfam: "09", trabajada: true,  dueno: null },
        { codmar: "0002", abrmar: "TDK",   nombre: "TDK",           codfam: "09", trabajada: true,  dueno: null },
        { codmar: "0161", abrmar: "HIKVI", nombre: "HIKVISION",     codfam: "09", trabajada: false, dueno: null },
        { codmar: "0021", abrmar: "SONY",  nombre: "SONY",          codfam: "09", trabajada: false, dueno: null },
        { codmar: "0206", abrmar: "EP_IM", nombre: "EP_IMPRESORAS", codfam: "11", trabajada: true,  dueno: null },
        { codmar: "0008", abrmar: "EPSON", nombre: "EPSON",         codfam: "11", trabajada: true,  dueno: "229" },
        { codmar: "0036", abrmar: "ZOTAC", nombre: "ZOTAC",         codfam: "06", trabajada: true,  dueno: null }
    ];

    /* Por defecto el usuario YA esta registrado: es lo normal en el modulo.
       Quien pruebe el alta lo pone en false. */
    S.grupoRegistro = "VENTAS-JEFES DE PROD";
    S.yaRegistrado = true;
    S.cargadoComoJefatura = false;
    S.sinSesion = false;
    S.diferenciadores = undefined;
}

reiniciar();

/* ------------------------------------------------------------ ayudas */
const yo = () => (S.rol === "JEFATURA" ? "071" : "233");
const buscarMarca = (c) => S.catalogo.find((m) => m.codmar === c);
const resumen = (m) => ({ codmar: m.codmar, abrmar: m.abrmar, nombre: m.nombre });
const familiaDe = (m) => FAMILIAS[m.codfam];
const validos = (lista) => Array.isArray(lista) && lista.length <= 50 &&
                           lista.every((c) => /^\d{4}$/.test(String(c)));

const ok = (data) => ({ status: 200, cuerpo: { status: "ok", codigo: 0, data: data } });
const error = (status, nombre, msg, data, codigo) => ({
    status: status,
    cuerpo: Object.assign({ status: nombre, codigo: codigo || 3, msg: msg }, data ? { data: data } : {})
});

/** Lo que el backend hace con una lista de marcas al confirmar o al registrar. */
function tomarMarcas(codigos, quien, esJefatura) {
    const asignadas = [], yaTenia = [], omitidas = [];

    [...new Set(codigos)].forEach((c) => {
        const m = buscarMarca(c);
        if (!m) return omitidas.push({ codmar: c, abrmar: c, nombre: c, motivo: "la marca no existe" });

        const base = resumen(m);
        if (m.dueno === quien)  return yaTenia.push(base);
        if (!m.trabajada)       return omitidas.push(Object.assign(base, { motivo: "la marca ya no se trabaja" }));
        if (m.dueno)            return omitidas.push(Object.assign(base, {
            motivo: "la marca ya esta asignada a otro este mes", asignadaA: NOMBRE_CORTO[m.dueno] }));
        if (esJefatura && m.codfam !== "09") {
            return omitidas.push(Object.assign(base, { motivo: "la marca no es de la familia de su jefatura" }));
        }

        m.dueno = quien;
        asignadas.push(base);
    });

    return { asignadas, yaTenia, omitidas };
}

/* ------------------------------------------------------- /v1/marcas */
function marcas(camino, cuerpo) {
    cuerpo = cuerpo || {};

    /* Quien aun no esta registrado recibe 400 `no identificado`, igual que en
       /login/identificador. La unica que funciona antes del alta es /disponibles,
       para el buscador del formulario de registro. */
    if (!S.yaRegistrado && camino !== "/disponibles") {
        return error(400, "no identificado", "el user no esta registrado en la intranet", null, 2);
    }

    /* Antes del alta tampoco consta el diferenciador: ve las marcas de todas las
       familias, salvo que ya este cargado como jefatura. Entonces solo la suya. */
    const jefa = S.rol === "JEFATURA" || (!S.yaRegistrado && S.cargadoComoJefatura);

    if (camino === "") {
        const mias = S.catalogo.filter((m) => m.dueno === yo()).map((m) => ({
            codmar: m.codmar, abrmar: m.abrmar, nombre: m.nombre, codfam: m.codfam,
            familia: familiaDe(m), trabajada: m.trabajada,
            asignadaPor: S.dioLaJefatura[m.codmar] || "yo"
        }));

        const d = { anno: 2026, mes: 10, rol: S.rol, confirmado: S.confirmados[yo()],
                    confirmadoEn: S.confirmados[yo()] ? "2026-10-14T15:20:11.000Z" : null,
                    marcas: mias, familia: null };

        if (jefa && S.jefaturaConFamilia) {
            const deLaFamilia = S.catalogo.filter((m) => m.codfam === "09")
                .sort((a, b) => Number(b.trabajada) - Number(a.trabajada));

            d.familia = {
                codfam: "09", nombre: FAMILIAS["09"],
                marcas: deLaFamilia.map((m) => ({
                    codmar: m.codmar, abrmar: m.abrmar, nombre: m.nombre, trabajada: m.trabajada,
                    dueno: m.dueno ? { codusu: m.dueno, nombre: NOMBRE_CORTO[m.dueno], soyYo: m.dueno === yo() } : null
                })),
                especialistas: ["229", "233"].map((u) => ({
                    codusu: u, nombre: NOMBRE_LARGO[u],
                    marcasDeMiFamilia: S.catalogo.filter((m) => m.dueno === u && m.codfam === "09").length,
                    marcasTotal: S.catalogo.filter((m) => m.dueno === u).length,
                    confirmado: S.confirmados[u]
                }))
            };
        }
        return ok(d);
    }

    if (camino === "/anterior") {
        return ok({ anno: 2026, mes: 9, marcas: ["0032", "0021", "0003"].map((c) => {
            const m = buscarMarca(c);
            const ajena = m.dueno && m.dueno !== yo();
            return Object.assign(resumen(m), {
                disponible: m.trabajada && !ajena,
                motivo: !m.trabajada ? "la marca ya no se trabaja"
                      : ajena ? "la marca ya esta asignada a otro este mes" : null,
                asignadaA: ajena ? NOMBRE_CORTO[m.dueno] : null
            });
        }) });
    }

    if (camino === "/disponibles") {
        const q = String(cuerpo.sugerencia || "").toLowerCase();
        return ok(S.catalogo
            .filter((m) => m.trabajada && !m.dueno && (!jefa || m.codfam === "09"))
            .filter((m) => !q || m.nombre.toLowerCase().includes(q) ||
                           m.abrmar.toLowerCase().includes(q) || m.codmar === q)
            .slice(0, 50)
            .map((m) => Object.assign(resumen(m), { codfam: m.codfam, familia: familiaDe(m) })));
    }

    if (camino === "/confirmar") {
        if (S.confirmados[yo()]) {
            return error(409, "marcas ya confirmadas",
                         "ya confirmaste tus marcas de este mes; solo se puede una vez");
        }
        if (!validos(cuerpo.marcas)) return error(400, "marcas invalidas", "la lista de marcas no es valida", null, 2);

        const r = tomarMarcas(cuerpo.marcas, yo(), jefa);
        const total = S.catalogo.filter((m) => m.dueno === yo()).length;

        if (!total) {
            return error(409, "sin marcas asignables", "ninguna de las marcas se pudo asignar",
                         { confirmado: false, total: 0, omitidas: r.omitidas });
        }

        S.confirmados[yo()] = true;
        return ok({ confirmado: true, anno: 2026, mes: 10, total: total,
                    asignadas: r.asignadas, yaTenia: r.yaTenia, omitidas: r.omitidas });
    }

    /* --- de aqui en adelante, solo jefatura --- */
    if (!jefa) return error(403, "solo jefatura", "esta accion es solo para jefaturas");

    const esp = () => {
        if (!cuerpo.codusu || cuerpo.codusu === yo()) return error(400, "destino invalido", "falta el especialista", null, 2);
        if (!NOMBRE_LARGO[cuerpo.codusu]) return error(400, "destino no especialista", "no es un especialista", null, 2);
        return null;
    };

    if (camino === "/asignar") {
        const malo = esp(); if (malo) return malo;
        if (!validos(cuerpo.marcas)) return error(400, "marcas invalidas", "la lista de marcas no es valida", null, 2);

        const asignadas = [], yaTenia = [], omitidas = [];
        cuerpo.marcas.forEach((c) => {
            const m = buscarMarca(c);
            if (!m) return omitidas.push({ codmar: c, abrmar: c, nombre: c, motivo: "la marca no existe" });
            const base = resumen(m);

            if (m.codfam !== "09") return omitidas.push(Object.assign(base, { motivo: "la marca no es de tu familia" }));
            if (!m.trabajada)      return omitidas.push(Object.assign(base, { motivo: "la marca ya no se trabaja" }));
            if (m.dueno === cuerpo.codusu) return yaTenia.push(base);
            if (m.dueno === yo() && S.confirmados[yo()]) {
                return omitidas.push(Object.assign(base, {
                    motivo: "la marca es tuya y ya confirmaste tus marcas del mes" }));
            }

            const antes = m.dueno && m.dueno !== yo() ? NOMBRE_CORTO[m.dueno] : null;
            m.dueno = cuerpo.codusu;
            S.dioLaJefatura[m.codmar] = NOMBRE_CORTO["071"];
            asignadas.push(antes ? Object.assign(base, { movidaDe: antes }) : base);
        });

        return ok({ especialista: { codusu: cuerpo.codusu, nombre: NOMBRE_LARGO[cuerpo.codusu] },
                    asignadas, yaTenia, omitidas });
    }

    if (camino === "/retirar") {
        const malo = esp(); if (malo) return malo;
        if (!validos(cuerpo.marcas)) return error(400, "marcas invalidas", "la lista de marcas no es valida", null, 2);

        const retiradas = [], omitidas = [];
        cuerpo.marcas.forEach((c) => {
            const m = buscarMarca(c);
            if (m && m.dueno === cuerpo.codusu) { m.dueno = null; retiradas.push(resumen(m)); }
            else omitidas.push(Object.assign(m ? resumen(m) : { codmar: c, abrmar: c, nombre: c },
                                             { motivo: "el especialista no tiene esta marca este mes" }));
        });

        return ok({ especialista: { codusu: cuerpo.codusu, nombre: NOMBRE_LARGO[cuerpo.codusu] },
                    retiradas, omitidas });
    }

    if (camino === "/estado") {
        if (!/^\d{4}$/.test(String(cuerpo.codmar))) return error(400, "marcas invalidas", "codigo mal formado", null, 2);

        let m = buscarMarca(cuerpo.codmar);
        let incorporada = false;

        if (!m) {
            const erp = SOLO_ERP[cuerpo.codmar];
            if (!erp) return error(400, "marca desconocida", "esa marca no existe en el ERP", null, 2);
            m = { codmar: cuerpo.codmar, abrmar: erp.abrmar, nombre: erp.nombre, codfam: "09", trabajada: true, dueno: null };
            S.catalogo.push(m);
            incorporada = true;
        }
        if (m.codfam !== "09") return error(403, "marca de otra familia", "esa marca no es de tu familia");

        m.trabajada = cuerpo.trabajada === true;
        return ok({ codmar: m.codmar, abrmar: m.abrmar, nombre: m.nombre, codfam: m.codfam,
                    trabajada: m.trabajada, incorporada: incorporada,
                    asignadaEsteMesA: !m.trabajada && m.dueno ? NOMBRE_CORTO[m.dueno] : null });
    }

    return { status: 404, cuerpo: { msg: "no simulado: /marcas" + camino } };
}

/* ---------------------------------------------------- registro (login) */
function registro(camino, cuerpo) {
    cuerpo = cuerpo || {};

    if (camino === "/login/registro") {
        if (S.sinSesion) return { status: 401, cuerpo: { status: "falsa galleta", codigo: 3 } };
        const cuerpo = { grupo: S.grupoRegistro };
        if (S.diferenciadores !== false) cuerpo.diferenciadores = permitidos();
        return { status: 200, cuerpo: cuerpo, doble: true };
    }

    /* /login/registro/completado */
    if (S.yaRegistrado) return error(409, "usuario ya registrado", "ya estabas registrado");

    const dif = String(cuerpo.diferenciador || "").toUpperCase();
    if (!permitidos().includes(dif)) {
        return error(400, "diferenciador invalido", "el tipo no corresponde a tu grupo", null, 2);
    }
    if (dif === "JEFATURA" && !S.cargadoComoJefatura) {
        return error(403, "jefatura sin familia", "no figuras como jefatura de ninguna familia");
    }
    if (cuerpo.marcas !== undefined && !validos(cuerpo.marcas)) {
        return error(400, "marcas invalidas", "la lista de marcas no es valida", null, 2);
    }

    S.yaRegistrado = true;

    /* Quien esta cargado como jefatura queda como JEFATURA aunque pida otra:
       la pantalla tiene que leer el tipo de `correcto`, no del formulario. */
    const esDelGrupo25 = S.grupoRegistro === "VENTAS-JEFES DE PROD";
    const correcto = esDelGrupo25 && S.cargadoComoJefatura ? "JEFATURA" : dif;
    const salida = { correcto: correcto };

    if (esDelGrupo25) {
        S.rol = correcto;
        const r = tomarMarcas(cuerpo.marcas || [], yo(), correcto === "JEFATURA");
        salida.marcas = { asignadas: r.asignadas, omitidas: r.omitidas };
        salida.confirmado = r.asignadas.length > 0;
        if (salida.confirmado) S.confirmados[yo()] = true;
    }

    return { status: 200, cuerpo: salida, doble: true };
}

module.exports = { estado: S, reiniciar, marcas, registro, buscarMarca, yo, NOMBRE_CORTO, FAMILIAS };
