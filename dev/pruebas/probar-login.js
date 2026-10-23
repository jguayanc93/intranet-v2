/**
 * Prueba de integracion del inicio de sesion y del recorrido del grupo 25.
 *
 * Carga las paginas reales —index.html, autenticador.html, marcas.html— y las
 * encadena sobre UN mismo simulacro, como las encadenaria una persona: entra,
 * a veces se la manda a registrarse, se registra, y llega al menu.
 *
 * Los usuarios son los de dev/usuarios-prueba.js, los mismos que se usan a mano
 * en el servidor de desarrollo. Si dejan de comportarse como cuenta ahi, aqui
 * salta.
 *
 * Lo que mas importa:
 *   · que quien aun no figura en la intranet vaya al formulario SIN ver un
 *     «contraseña incorrecta» —lo veia un instante, y le decia lo contrario de
 *     lo que pasaba—
 *   · que entrar borre el menu cacheado de quien estuvo antes
 *   · que una persona cargada como jefatura quede como jefatura aunque elija
 *     especialista
 *   · que sin alta el panel mande al login y no se quede en blanco
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const sim = require("../simulador-marcas");
const usuarios = require("../usuarios-prueba");

const RAIZ = path.resolve(__dirname, "..", "..");

let fallos = 0;
function ok(etiqueta, real, esperado) {
    const bien = JSON.stringify(real) === JSON.stringify(esperado);
    if (!bien) fallos++;
    console.log(`${bien ? "  ok  " : " FALLA"} ${etiqueta}`);
    if (!bien) console.log(`         esperado: ${JSON.stringify(esperado)}\n         real:     ${JSON.stringify(real)}`);
}

/* =====================================================================
 * El backend simulado
 * =================================================================== */
let llamadas = [];
let perfil = null;          // quien tiene la sesion ahora
let azar = Math.random;
let sinRed = false;

function respuesta(obj, status, doble) {
    const cuerpo = doble ? JSON.stringify(JSON.stringify(obj)) : JSON.stringify(obj);
    return Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(cuerpo)
    });
}

const NO_IDENTIFICADO = { status: "no identificado", codigo: 2, msg: "el user no esta registrado en la intranet" };

function responder(url, opciones) {
    const metodo = (opciones && opciones.method) || "GET";
    llamadas.push({ url, metodo });

    if (sinRed) return Promise.reject(new TypeError("Failed to fetch"));

    const ruta = url.replace(/^https?:\/\/[^/]+\/v1/, "");
    const registrado = sim.estado.yaRegistrado;

    /* El formulario viaja como FormData; el resto, como JSON. */
    if (ruta === "/login" && metodo === "POST") {
        const cuenta = opciones.body.get("cuenta");
        if (cuenta === "malo") return respuesta({ status: "no cdk user", msg: "usuario no registrado" }, 401);

        perfil = usuarios.entrar(cuenta, sim, { azar: azar });

        /* Un usuario del grupo 34 que aun no puede entrar (el 297): acerto su contraseña, pero el login le responde 403 y sin sesion. */
        if (sim.estado.sinAcceso) {
            return respuesta({ status: "usuario sin acceso", codigo: 3, msg: "este usuario todavia no tiene acceso a la intranet" }, 403);
        }

        /* Lo que el navegador ve al final del redirect a /login/identificador. */
        if (!sim.estado.yaRegistrado) return respuesta(NO_IDENTIFICADO, 400, true);
        return respuesta({ msg: "sesion creada" }, 200, true);
    }

    if (ruta === "/login/identificador") {
        if (!registrado) return respuesta(NO_IDENTIFICADO, 400);
        return respuesta({ correcto: sim.estado.rol }, 200, true);
    }

    if (ruta === "/vendedor") {
        if (!registrado) return respuesta({ status: "falsa galleta", codigo: 3 }, 401);
        return respuesta({
            status: "ok", codigo: 0,
            data: { cotizacion: "Permite manejar cotizaciones", factura: "Modifica ciertos campos de la factura",
                    promocion: "Permite adjuntar y retirar promociones", cuota: "Ver el avance de las cuotas",
                    reporte: "Permite sacar reportes de marcas", marcas: "Elige y administra tus marcas del mes" },
            nombre: perfil.nombre, grupo: perfil.grupo, tipo: sim.estado.rol, tipoCambio: 3.75
        });
    }

    const cuerpo = opciones && typeof opciones.body === "string" ? JSON.parse(opciones.body) : {};
    let r = null;
    if (ruta.indexOf("/marcas") === 0) r = sim.marcas(ruta.slice("/marcas".length), cuerpo);
    else if (ruta.indexOf("/login/registro") === 0) r = sim.registro(ruta, cuerpo);

    if (!r) return respuesta({ msg: "no simulado: " + ruta }, 404);
    return respuesta(r.cuerpo, r.status, r.doble);
}

/* =====================================================================
 * Montar una pagina real
 * =================================================================== */
function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

/** Como en probar-marcas.js: `location` propio para anotar a donde se sale. */
async function montar(pagina, antes) {
    let html = leer(pagina);
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map((m) => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/" + pagina,
        runScripts: "outside-only", pretendToBeVisual: true
    });
    const w = dom.window;
    const destinos = [];

    const real = w.location;
    w.__location = new Proxy({}, {
        get(_, clave) {
            if (clave === "replace" || clave === "assign") return (u) => { destinos.push(String(u)); };
            const v = real[clave];
            return typeof v === "function" ? v.bind(real) : v;
        }
    });
    w.fetch = (url, opciones) => responder(String(url), opciones);
    w.HTMLElement.prototype.scrollIntoView = function () {};

    if (antes) antes(w);

    for (const rel of scripts) {
        try { w.eval("(function (location) {\n" + leer(rel) + "\n})(window.__location)"); }
        catch (e) { console.log(`  FALLA  ${rel}: ${e.message}`); fallos++; }
    }

    return { w, doc: w.document, destinos };
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const enviar = (p, f) => f.dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
const toasts = (doc) => [...doc.querySelectorAll("#cdk-toasts .cdk-toast__texto")].map((n) => n.textContent);

/** Escribe usuario y contraseña en index.html y envia. */
async function entrarComo(cuenta, clave, antes) {
    const p = await montar("index.html", antes);
    p.doc.getElementById("user").value = cuenta;
    p.doc.getElementById("pass").value = clave === undefined ? "clave1234" : clave;
    enviar(p, p.doc.getElementById("cdk-logeo"));
    await pausa(200);
    return p;
}

function elegirTipo(p, valor) {
    const s = p.doc.getElementById("tipo");
    s.value = valor;
    s.dispatchEvent(new p.w.Event("change", { bubbles: true }));
}

/** Registra en autenticador.html con el tipo dado, sin marcas. */
async function registrarse(tipo) {
    const p = await montar("autenticador.html");
    await pausa(200);
    elegirTipo(p, tipo);
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(250);
    return p;
}

const jefaturaSinMarcas = (p) => !!p.doc.getElementById("marcas-familia");

/* =====================================================================
 * Las pruebas
 * =================================================================== */
(async function () {
    console.log("\n=== Inicio de sesion y recorrido del grupo 25 ===\n");

    /* ---------------------------------------------------- el login a secas */
    console.log("— entrar con una cuenta ya registrada —");
    llamadas = [];
    let p = await entrarComo("especialista25", "clave1234", (w) => {
        /* El menu de quien estuvo antes en este mismo equipo. */
        w.sessionStorage.setItem("cdk.modulos.v1", JSON.stringify({ t: Date.now(), modulos: { pedido: "x" }, usuario: { nombre: "OTRO" } }));
        w.sessionStorage.setItem("cdk.ajustes.v1", "{}");
    });

    ok("va al panel", p.destinos, ["/main.html"]);
    ok("no muestra ningun error", p.doc.getElementById("respuesta").classList.contains("hidden"), true);
    /* Entrar sin haber cerrado sesion dejaba el menu del anterior hasta
       revalidar, con su nombre en la barra. */
    ok("olvida el menu de la persona de antes",
       p.w.sessionStorage.getItem("cdk.modulos.v1"), null);
    ok("pero no toca lo que no es el menu", p.w.sessionStorage.getItem("cdk.ajustes.v1"), "{}");

    console.log("\n— contraseña incorrecta —");
    p = await entrarComo("malo", "clave1234");
    ok("no sale de la pagina", p.destinos, []);
    /* Para `no cdk user` la pantalla cambia el mensaje generico por uno propio
       (login.js, manejarDetalle). Cualquier otro rechazo deja el generico. */
    ok("lo dice", p.doc.getElementById("respuesta").textContent, "Esta cuenta no está registrada en el sistema.");
    ok("vacia los campos", p.doc.getElementById("user").value + p.doc.getElementById("pass").value, "");
    ok("y deja volver a intentar", p.doc.getElementById("loggin").disabled, false);

    console.log("\n— sin conexion —");
    sinRed = true;
    p = await entrarComo("especialista25", "clave1234");
    sinRed = false;
    ok("lo dice con otras palabras, no como contraseña mala",
       p.doc.getElementById("respuesta").textContent.includes("No se pudo conectar"), true);

    console.log("\n— campos demasiado cortos —");
    llamadas = [];
    p = await entrarComo("ab", "xy");
    ok("ni se envia", llamadas.length, 0);

    /* ------------------------------------------- quien aun no se registro */
    console.log("\n— una cuenta del grupo 25 que aun no figura en la intranet —");
    llamadas = [];
    p = await entrarComo("nuevo25");

    ok("va al formulario de registro, no al panel", p.destinos, ["/autenticador.html"]);
    /* Antes salia «usuario y/o contraseña incorrectos» un instante y recien
       despues se redirigia: a quien acerto su contraseña le decia lo contrario. */
    ok("sin decirle que su contraseña esta mal", p.doc.getElementById("respuesta").classList.contains("hidden"), true);
    ok("ni vaciarle los campos", p.doc.getElementById("user").value, "nuevo25");
    ok("y sigue mostrando que carga: la pagina va a cambiar", p.doc.getElementById("loggin").disabled, true);

    console.log("\n— sin alta, el panel manda al login —");
    llamadas = [];
    p = await montar("marcas.html");
    await pausa(250);
    ok("no se queda en blanco: vuelve al inicio de sesion", p.destinos, ["/index.html"]);
    ok("intentando antes renovar la sesion, una vez",
       llamadas.filter((l) => l.url.includes("/login/identificador")).length, 1);

    /* ------------------------------------------ el recorrido, de punta a punta */
    console.log("\n— nuevo25: entra, se registra de especialista y llega a sus marcas —");
    await entrarComo("nuevo25");
    p = await registrarse("ESPECIALISTA");

    const dicho = p.doc.getElementById("registro-tipo").textContent;
    ok("queda registrado como especialista", dicho.includes("registrado como Especialista"), true);
    ok("y sin marcas lo explica", !!p.doc.getElementById("registro-sin-marcas"), true);

    p = await montar("marcas.html");
    await pausa(250);
    ok("ya no lo echa: el panel carga", p.destinos, []);
    ok("llega a sus marcas como especialista",
       p.doc.getElementById("periodo").textContent, "octubre de 2026 · Especialista");
    ok("con su nombre en la barra", p.doc.getElementById("cdk-usuario-nombre").textContent, "Ana Quispe");
    ok("con el borrador, porque aun no confirmo", !!p.doc.getElementById("marcas-buscar"), true);
    ok("y Marcas en su menu",
       [...p.doc.querySelectorAll("#cdk-sidebar-lista a")].some((a) => a.title === "Marcas"), true);

    console.log("\n— nuevo25 pidiendo jefatura sin serlo —");
    await entrarComo("nuevo25");
    p = await registrarse("JEFATURA");
    ok("no queda registrado", sim.estado.yaRegistrado, false);
    ok("lo dice", toasts(p.doc).some((t) => t.includes("jefatura de ninguna familia")), true);

    p = await montar("autenticador.html");
    await pausa(200);
    elegirTipo(p, "ESPECIALISTA");
    enviar(p, p.doc.getElementById("form-registro"));
    await pausa(250);
    ok("y eligiendo especialista, entra", sim.estado.yaRegistrado, true);

    console.log("\n— nuevajefa25: pide especialista y el backend la deja jefatura —");
    await entrarComo("nuevajefa25");
    p = await registrarse("ESPECIALISTA");

    const tipoDicho = p.doc.getElementById("registro-tipo").textContent;
    ok("lo dice con el tipo de la respuesta", tipoDicho.includes("registrado como Jefatura"), true);
    ok("explicando por que", tipoDicho.includes("aunque hayas elegido Especialista"), true);

    p = await montar("marcas.html");
    await pausa(250);
    ok("y en el modulo tiene el panel de jefatura",
       p.doc.getElementById("periodo").textContent, "octubre de 2026 · Jefatura");
    ok("de su familia", jefaturaSinMarcas(p), true);

    console.log("\n— quien ya estaba registrado y vuelve al formulario —");
    await entrarComo("especialista25");
    p = await registrarse("ESPECIALISTA");
    ok("se le manda al panel, sin un error", p.destinos, ["/main.html"]);

    /* --------------------------------------------------- los otros perfiles */
    console.log("\n— jefatura25 y confirmado25 llegan a lo suyo —");
    p = await entrarComo("jefatura25");
    ok("la jefatura va al panel", p.destinos, ["/main.html"]);
    p = await montar("marcas.html");
    await pausa(250);
    ok("y ve el panel de su familia", jefaturaSinMarcas(p), true);
    ok("con su nombre", p.doc.getElementById("cdk-usuario-nombre").textContent, "Joanna Cossio");

    p = await entrarComo("confirmado25");
    ok("quien ya confirmo va al panel", p.destinos, ["/main.html"]);
    p = await montar("marcas.html");
    await pausa(250);
    ok("y ve sus marcas en solo lectura", !!p.doc.getElementById("marcas-confirmadas"), true);
    ok("sin editor", p.doc.getElementById("marcas-buscar"), null);
    ok("con las dos que ya tenia",
       [...p.doc.querySelectorAll("#marcas-mias .cdk-articulo__nombre")].map((n) => n.textContent), ["TDK", "EP_IMPRESORAS"]);

    console.log("\n— cada ingreso empieza de cero —");
    p = await entrarComo("especialista25");
    p = await montar("marcas.html");
    await pausa(250);
    ok("el que habia confirmado no arrastra sus marcas",
       !!p.doc.getElementById("marcas-buscar") && !p.doc.getElementById("marcas-confirmadas"), true);

    /* -------------------------------------------------------------- al azar */
    console.log("\n— random25 —");
    azar = () => 0.99;
    p = await entrarComo("random25");
    ok("el ultimo de la lista es la jefatura registrada", perfil.clave, "jefatura25");
    ok("con un nombre inventado, no el fijo", perfil.nombre, "Sergio Ccori");
    ok("y entra al panel", p.destinos, ["/main.html"]);
    p = await montar("marcas.html");
    await pausa(250);
    ok("donde se ve ese nombre", p.doc.getElementById("cdk-usuario-nombre").textContent, "Sergio Ccori");

    azar = () => 0;
    p = await entrarComo("random25");
    ok("el primero es el que debe registrarse", perfil.clave, "nuevo25");
    ok("y lo manda al alta", p.destinos, ["/autenticador.html"]);
    ok("con su nombre inventado", perfil.nombre, "Lucía Rojas");

    azar = Math.random;
    const vistos = new Set();
    for (let i = 0; i < 400; i++) vistos.add(usuarios.entrar("random25", sim).clave);
    /* Es del grupo 25: un vendedor del 20 (vendedor20) no puede salir por azar. */
    ok("de verdad reparte entre los perfiles del grupo 25", [...vistos].sort(),
       Object.keys(usuarios.PERFILES).filter((c) => usuarios.PERFILES[c].grupo === "VENTAS-JEFES DE PROD").sort());

    console.log("\n— cualquier otro nombre —");
    p = await entrarComo("juan.perez");
    ok("entra como especialista ya registrado", [p.destinos, perfil.tipo], [["/main.html"], "ESPECIALISTA"]);
    /* ---------------------------------------------------- el jefe de zona (grupo 34) */
    console.log("\n— jefe de zona: quien puede entrar y quien no —");
    p = await entrarComo("zona126");
    ok("el usuario 126 entra y va al panel, como ZONA", [p.destinos, perfil.tipo, perfil.grupo], [["/main.html"], "ZONA", "VENTAS-JEFES DE ZONA"]);

    p = await entrarComo("zona297", "clave1234");
    ok("el 297 no sale de la pagina: no recibe sesion", p.destinos, []);
    ok("se le dice que todavia no tiene acceso —acerto su contraseña—, no que sea incorrecta",
       [p.doc.getElementById("respuesta").classList.contains("hidden"), p.doc.getElementById("respuesta").textContent.trim()],
       [false, "Tu usuario todavía no tiene acceso a la intranet. Consulta con tu jefatura o con sistemas."]);
    ok("y los campos quedan vacios", [p.doc.getElementById("user").value, p.doc.getElementById("pass").value], ["", ""]);
    ok("el menu cacheado de quien estuvo antes no se toca: no entro nadie", p.w.sessionStorage.length, 0);

    const jefe = usuarios.entrar("otro", sim, { tipoPorDefecto: "jefatura" });
    ok("y con TIPO=JEFATURA, como jefatura", [jefe.tipo, sim.estado.rol, sim.estado.cargadoComoJefatura], ["JEFATURA", "JEFATURA", true]);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 5).join("\n"));
    process.exit(1);
});
