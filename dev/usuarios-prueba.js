/**
 * Usuarios de prueba del servidor de desarrollo.
 *
 * Con el login simulado, entrar como uno u otro decide en que punto del flujo se
 * está: si ya está registrado o debe pasar por el alta, si es jefatura o
 * especialista, si ya confirmó sus marcas. Se elige con el campo «usuario» de
 * index.html, y la contraseña es cualquiera de 4 o más caracteres.
 *
 * Lo usan dev/servidor.js y dev/pruebas/probar-login.js. Los datos son
 * inventados.
 *
 * Trabajan sobre dev/simulador-marcas.js: aquí se decide QUIEN es, y el
 * simulacro lleva lo que pasa con sus marcas.
 */
"use strict";

const GRUPO_25 = "VENTAS-JEFES DE PROD";
const GRUPO_20 = "VENTAS-EJECUTIVOS";

/**
 * `registrado: false` es el caso de quien existe en el ERP pero no figura en la
 * intranet: el login responde `no identificado` y debe pasar por el registro.
 * `cargadoComoJefatura` es lo que el backend sabe de el, y manda sobre lo que
 * elija en el formulario.
 */
const PERFILES = {
    nuevo25: {
        nombre: "Ana Quispe", grupo: GRUPO_25, registrado: false, cargadoComoJefatura: false,
        nota: "grupo 25 sin registrar. Pasa por el alta; pedir JEFATURA le da 403"
    },
    nuevajefa25: {
        nombre: "Rosa Cossio", grupo: GRUPO_25, registrado: false, cargadoComoJefatura: true,
        nota: "grupo 25 sin registrar, cargada como jefatura. Queda JEFATURA aunque elija ESPECIALISTA"
    },
    especialista25: {
        nombre: "Luis Mendoza", grupo: GRUPO_25, registrado: true, tipo: "ESPECIALISTA",
        nota: "especialista registrado, aun sin confirmar sus marcas"
    },
    confirmado25: {
        nombre: "Marta Huamán", grupo: GRUPO_25, registrado: true, tipo: "ESPECIALISTA",
        nota: "especialista que ya confirmó: sus marcas, en solo lectura",
        preparar(sim) {
            sim.buscarMarca("0002").dueno = "233";
            sim.buscarMarca("0206").dueno = "233";
            sim.estado.confirmados["233"] = true;
        }
    },
    pendiente25: {
        nombre: "Pedro Salas", grupo: GRUPO_25, registrado: true, tipo: "ESPECIALISTA",
        nota: "especialista con una marca que le dio la jefatura y sin confirmar: Reportes la ve, Cuota no le deja fijar meta",
        preparar(sim) {
            sim.buscarMarca("0032").dueno = "233";
            sim.estado.dioLaJefatura["0032"] = "COSSIO JOANNA";
        }
    },
    jefatura25: {
        nombre: "Joanna Cossio", grupo: GRUPO_25, registrado: true, tipo: "JEFATURA",
        nota: "jefatura registrada, con el panel de su familia"
    },
    /* Del grupo 20, no del 25: para ver el otro lado del ajuste de precios. Las marcas de su
       alrededor tienen dueño, asi que lo que envie le llega a tres responsables. */
    vendedor20: {
        nombre: "Cristopher Gonzales", grupo: GRUPO_20, registrado: true, tipo: "COBERTURA",
        nota: "vendedor del grupo 20: pide ajustes de precio y ve sus respuestas. Sin marcas ni reportes",
        preparar(sim) {
            sim.buscarMarca("0002").dueno = "233";
            sim.buscarMarca("0206").dueno = "233";
            sim.estado.confirmados["233"] = true;
        }
    }
};

const NOMBRES = ["Lucía", "Mateo", "Valeria", "Diego", "Camila", "Renzo", "Fiorella", "Álvaro", "Mónica", "Sergio"];
const APELLIDOS = ["Rojas", "Paredes", "Salazar", "Tapia", "Villanueva", "Quiroz", "Benites", "Zegarra", "Valdivia", "Ccori"];

/**
 * El perfil de quien entra con `cuenta`, y deja el simulacro de marcas como le
 * corresponde. Devuelve el perfil: { nombre, grupo, tipo, registrado, … }.
 *
 *   random25      uno de los seis de arriba, al azar, con un nombre inventado
 *   cualquier otro   un especialista registrado (el de siempre); con la variable
 *                 TIPO=JEFATURA, una jefatura
 *
 * `opciones.azar` sustituye a Math.random, para que las pruebas no dependan de
 * la suerte; `opciones.tipoPorDefecto`, a la variable TIPO.
 */
function entrar(cuenta, sim, opciones) {
    opciones = opciones || {};
    const azar = opciones.azar || Math.random;
    const nombre = String(cuenta || "").trim().toLowerCase();

    let perfil;
    let clave = nombre;

    if (nombre === "random25") {
        const del25 = Object.keys(PERFILES).filter((c) => PERFILES[c].grupo === GRUPO_25);
        clave = del25[Math.floor(azar() * del25.length)];
        perfil = Object.assign({}, PERFILES[clave], {
            nombre: NOMBRES[Math.floor(azar() * NOMBRES.length)] + " " +
                    APELLIDOS[Math.floor(azar() * APELLIDOS.length)]
        });
    } else if (PERFILES[nombre]) {
        perfil = Object.assign({}, PERFILES[nombre]);
    } else {
        const tipo = String(opciones.tipoPorDefecto || "ESPECIALISTA").toUpperCase();
        perfil = {
            nombre: "Juan Carlos", grupo: GRUPO_25, registrado: true, tipo: tipo,
            cargadoComoJefatura: tipo === "JEFATURA",
            nota: "cualquier otro usuario: especialista ya registrado"
        };
        clave = "(por defecto)";
    }

    perfil.clave = clave;
    perfil.cargadoComoJefatura = !!perfil.cargadoComoJefatura || perfil.tipo === "JEFATURA";

    /* Reiniciar ANTES de preparar: reiniciar() deja todo como al empezar. */
    sim.reiniciar(["JEFATURA", "COBERTURA", "CARTERA"].indexOf(perfil.tipo) !== -1 ? perfil.tipo : "ESPECIALISTA");

    const S = sim.estado;
    S.grupoRegistro = perfil.grupo;
    S.cargadoComoJefatura = perfil.cargadoComoJefatura;
    S.yaRegistrado = perfil.registrado;

    if (perfil.preparar) perfil.preparar(sim);
    return perfil;
}

/** [cuenta, descripcion] de los fijos, para enseñarlos al arrancar. */
function lista() {
    return Object.keys(PERFILES).map((c) => [c, PERFILES[c].nota])
        .concat([["random25", "uno de los seis anteriores, al azar"]]);
}

module.exports = { entrar, lista, PERFILES };
