/**
 * Prueba de integracion del modulo Cuota, sobre las paginas reales.
 *
 * Lo que mas importa:
 *   · que «sin cuota registrada» mande a registrar y NO parezca un error
 *     —era un 500 y el vendedor veia una pantalla rota—
 *   · que los cuatro anadidos (falta, ritmo, notas, reposicion) se pinten, y
 *     que si alguno llega null la pantalla se abra igual
 *   · que registrar dos veces lo rechace el servidor, no solo el navegador
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const RAIZ = path.resolve(__dirname, "..", "..");

let fallos = 0;
function ok(etiqueta, real, esperado) {
    const bien = JSON.stringify(real) === JSON.stringify(esperado);
    if (!bien) fallos++;
    console.log(`${bien ? "  ok  " : " FALLA"} ${etiqueta}`);
    if (!bien) console.log(`         esperado: ${JSON.stringify(esperado)}\n         real:     ${JSON.stringify(real)}`);
}

let llamadas = [];
let registrada = null;      // la cuota del mes, null hasta registrarla
let conAnadidos = true;     // para probar que la pantalla aguanta sin ellos
let porMarca = false;       // el caso del especialista
let sinCuota = false;       // jefatura, zona y hp: no les toca

const AVANCE = {
    meta: 380000, avance: 288420,
    porcentaje: "75.90 %",
    mensaje: "la Genkidama ya esta cargada, solo falta lanzarla",
    falta: 91580,
    ritmo: { esperado: 60.0, real: 75.9, estado: "adelante", cierreTipico: 85.8,
             historico: [ { periodo: "2026-09", porcentaje: 42.3 },
                          { periodo: "2026-07", porcentaje: 101.1 } ] },
    notas: { facturado: 543410, restado: 205047, porcentaje: 37.7, avisar: true },
    reposicion: { total: 187514.34, clientes: 49,
                  top: [ { codcli: "C01525", cliente: "MEMORY KINGS PERU S.A.C.",
                           productos: 97, vencido: 106570.07 } ] }
};

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo, metodo: (opciones && opciones.method) || "GET" });

    const r = (obj, status) => Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });

    if (url.includes("/vendedor")) {
        return r({ status: "ok", codigo: 0, data: { cuota: "x" }, nombre: "JUAN" });
    }

    if (url.includes("/cuota/mostrar") || url.includes("/cuota/revisar")) {
        if (porMarca) return r({ status: "ok", codigo: 0, multiple: { HEWL: {}, EPSO: {} } });

        /* A jefatura, zona y hp la cuota no les toca. Llega con 200 y un
           campo propio, no con un 404. */
        if (sinCuota) {
            return r({ status: "cuota no corresponde", codigo: 0,
                       msg: "tu tipo de vendedor no lleva cuota mensual", aplica: false });
        }

        /* 200, no error: no haber registrado todavia es un estado normal. */
        if (!registrada) {
            return r({ status: "cuota no existe", codigo: 0,
                       msg: "todavia no registraste tu cuota de este mes",
                       debeRegistrar: true, meta: 0, avance: 0, porcentaje: null });
        }

        const base = Object.assign({ status: "ok", codigo: 0, debeRegistrar: false },
                                   AVANCE, { meta: registrada });
        if (!conAnadidos) { base.ritmo = null; base.notas = null; base.reposicion = null; }
        return r(base);
    }

    if (url.includes("/cuota/update")) {
        /* El campo se llama `fijado`. Si llega con otro nombre el backend
           responde `cuota no enviada`, no «monto invalido»: son dos cosas
           distintas y antes se veian igual. */
        if (cuerpo.fijado === undefined || cuerpo.fijado === null || cuerpo.fijado === "") {
            return r({ status: "cuota no enviada", codigo: 3,
                       msg: "el cuerpo no trae el campo `fijado`" }, 400);
        }
        if (registrada) {
            return r({ status: "cuota ya registrada", codigo: 3,
                       msg: "ya registraste tu cuota de este mes; solo se puede una vez" }, 409);
        }
        const monto = Number(cuerpo.fijado);
        if (!monto || monto <= 0) {
            return r({ status: "cuota invalida", codigo: 3,
                       msg: "el monto de la cuota debe ser un numero mayor que cero" }, 400);
        }
        registrada = monto;
        return r({ status: "ok", codigo: 0, permitido: true,
                   cuota: monto, family: "06", objetivo: 0 });
    }

    if (url.includes("/v1/")) return r({ status: "ok", codigo: 0, data: [] });
    return r({ msg: "no simulado: " + url }, 404);
}

function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar(pagina) {
    let html = leer(pagina);
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "");

    const dom = new JSDOM(html, {
        url: "http://127.0.0.1:8080/" + pagina,
        runScripts: "outside-only", pretendToBeVisual: true
    });
    const w = dom.window;
    w.fetch = (url, opciones) => responder(String(url), opciones);
    w.HTMLElement.prototype.scrollIntoView = function () {};

    for (const rel of scripts) {
        try { w.eval(leer(rel)); }
        catch (e) { console.log(`  FALLA  ${rel}: ${e.message}`); fallos++; }
    }
    return { w, doc: w.document };
}

const pausa = (ms) => new Promise(r => setTimeout(r, ms));
const clic = (p, n) => n.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
function botonModal(doc, cual) {
    const b = doc.querySelectorAll(".cdk-modal__acciones .cdk-boton");
    return cual === "confirmar" ? b[b.length - 1] : b[0];
}

(async function () {
    console.log("\n=== Cuota · registrar y ver el avance ===\n");

    /* ================================================ sin registrar */
    console.log("— sin cuota registrada —");
    registrada = null;
    llamadas = [];
    let p = await montar("cuota/cuota_observar.html");
    await pausa(150);

    ok("sin errores al cargar", fallos, 0);
    const vacio = p.doc.getElementById("avance").textContent;
    /* Esto llegaba como 500 y se veia una pantalla rota. Es un estado normal. */
    ok("dice que falta registrar", vacio.includes("todavia no registraste"), true);
    ok("y no parece un error", vacio.includes("error"), false);
    ok("con un enlace a registrar",
       !!p.doc.querySelector("#avance a[href*='cuota_registrar']"), true);
    ok("sin pintar los bloques de abajo",
       p.doc.getElementById("seccion-ritmo").classList.contains("hidden"), true);

    /* ==================================================== registrar */
    console.log("\n— registrar la cuota —");
    llamadas = [];
    let reg = await montar("cuota/cuota_registrar.html");
    await pausa(150);

    ok("comprueba si ya estaba",
       llamadas.some(l => l.url.includes("/cuota/revisar")), true);
    ok("y ofrece el formulario",
       reg.doc.getElementById("form-cuota").classList.contains("hidden"), false);

    reg.doc.getElementById("monto").value = "0";
    reg.doc.getElementById("form-cuota")
       .dispatchEvent(new reg.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(80);
    ok("un monto de cero ni se manda",
       llamadas.some(l => l.url.includes("/cuota/update")), false);

    reg.doc.getElementById("monto").value = "380000";
    reg.doc.getElementById("form-cuota")
       .dispatchEvent(new reg.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(80);
    ok("pide confirmacion", !!reg.doc.querySelector(".cdk-modal__titulo"), true);
    ok("avisando de que es una vez",
       reg.doc.querySelector(".cdk-modal__mensaje").textContent.includes("una vez"), true);

    clic(reg, botonModal(reg.doc, "confirmar"));
    await pausa(200);

    const guardada = llamadas.filter(l => l.url.includes("/cuota/update")).pop();
    ok("registra", !!guardada, true);
    /* El campo se llama `fijado`. Mandarlo como `monto` no daba «falta el
       campo», daba «el monto debe ser mayor que cero», asi que el fallo
       parecia del formulario. */
    ok("en el campo `fijado`", guardada.cuerpo.fijado, 380000);
    ok("y no en `monto`", guardada.cuerpo.monto, undefined);
    ok("y ya no deja volver a registrar",
       reg.doc.getElementById("form-cuota").classList.contains("hidden"), true);
    ok("enseñando la que quedo",
       reg.doc.getElementById("estado").textContent.includes("380,000"), true);

    /* ---------------------------------------- el segundo intento */
    console.log("\n— y si lo intenta otra vez —");
    registrada = null;                       // el navegador cree que no hay
    llamadas = [];
    reg = await montar("cuota/cuota_registrar.html");
    await pausa(150);
    registrada = 380000;                     // pero el servidor sabe que si

    reg.doc.getElementById("monto").value = "999999";
    reg.doc.getElementById("form-cuota")
       .dispatchEvent(new reg.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(80);
    clic(reg, botonModal(reg.doc, "confirmar"));
    await pausa(250);

    /* Quien decide es el servidor. Antes /cuota/update era un INSERT a secas
       y la regla la cumplia solo el navegador: dos pestañas metian dos filas. */
    ok("el servidor lo rechaza",
       llamadas.some(l => l.url.includes("/cuota/update")), true);
    ok("y la pantalla enseña la que ya habia",
       reg.doc.getElementById("estado").textContent.includes("Ya registraste"), true);
    ok("sin dejar un error rojo",
       reg.doc.getElementById("resultado").textContent.includes("error"), false);

    /* ================================================== el avance */
    console.log("\n— el avance, con los cuatro anadidos —");
    registrada = 380000;
    conAnadidos = true;
    llamadas = [];
    p = await montar("cuota/cuota_observar.html");
    await pausa(200);

    const texto = p.doc.getElementById("avance").textContent;
    ok("la frase arriba", texto.includes("Genkidama"), true);
    ok("la meta", texto.includes("380,000"), true);
    /* A · cuanto falta en dolares: «te faltan 91.580» se acciona. */
    ok("y cuanto falta", texto.includes("91,580"), true);
    ok("con barra de progreso",
       !!p.doc.querySelector("#avance .cdk-progreso__relleno"), true);

    /* B · el ritmo, con su cierre tipico, que es lo que lo hace util. */
    ok("el bloque de ritmo sale",
       p.doc.getElementById("seccion-ritmo").classList.contains("hidden"), false);
    ok("diciendo como suele cerrar",
       p.doc.getElementById("ritmo").textContent.includes("85.8"), true);
    ok("y sus meses anteriores",
       p.doc.querySelectorAll("#ritmo .cdk-articulo").length, 2);

    /* C · las notas de credito, que el numero de arriba no explicaba. */
    ok("el bloque de notas sale",
       p.doc.getElementById("seccion-notas").classList.contains("hidden"), false);
    ok("con el porcentaje que resta",
       p.doc.getElementById("notas").textContent.includes("37.7"), true);

    /* D · a quien llamar. */
    ok("el bloque de reposicion sale",
       p.doc.getElementById("seccion-reposicion").classList.contains("hidden"), false);
    ok("con el cliente de arriba",
       p.doc.getElementById("reposicion").textContent.includes("MEMORY KINGS"), true);
    ok("y sin prometer que es una venta",
       p.doc.getElementById("seccion-reposicion").textContent.includes("candidatos"), true);

    /* ------------------------------- si los anadidos fallan */
    console.log("\n— y si los cuatro anadidos llegan null —");
    conAnadidos = false;
    p = await montar("cuota/cuota_observar.html");
    await pausa(200);

    /* El avance es lo primordial: no se cae porque un anadido no cargue. */
    ok("el avance se pinta igual",
       p.doc.getElementById("avance").textContent.includes("380,000"), true);
    ok("y los bloques simplemente no salen",
       p.doc.getElementById("seccion-ritmo").classList.contains("hidden"), true);

    /* --------------------------------- el especialista */
    console.log("\n— un especialista, que va por marca —");
    porMarca = true;
    p = await montar("cuota/cuota_observar.html");
    await pausa(200);

    /* La forma de esa respuesta no esta documentada. Pintarla a ojo seria
       enseñarle mal la cuota a alguien. */
    ok("lo dice en vez de inventarse la pantalla",
       p.doc.getElementById("avance").textContent.includes("por marca"), true);
    porMarca = false;

    console.log("\n— un tipo de vendedor al que no le toca —");
    sinCuota = true;
    p = await montar("cuota/cuota_observar.html");
    await pausa(200);

    const nada = p.doc.getElementById("avance").textContent;
    ok("lo explica", nada.includes("no lleva cuota mensual"), true);
    /* No es que falte registrar: es que no aplica. Ofrecer un boton de
       registrar aqui seria mandar a una pantalla que no sirve de nada. */
    ok("sin mandar a registrar",
       !!p.doc.querySelector("#avance a[href*='cuota_registrar']"), false);
    ok("y sin boton de reintentar",
       !!p.doc.querySelector("#avance .cdk-boton"), false);
    sinCuota = false;

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});
