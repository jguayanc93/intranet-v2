/**
 * Prueba de integracion de las tres listas.
 *
 * Carga las paginas reales y comprueba que la implementacion compartida sirve
 * a las tres, que el filtro por fecha cambia de ruta, y que el monto sale con
 * SU moneda -el fallo que arrastraban las tres copias.
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
// Para probar el mes recien empezado, que es cuando las dos vistas salen
// vacias para todo el mundo.
let clientesVacio = false;
/* Para probar el pintado por tandas. 163 clientes no es un numero inventado:
   es lo que vio V0343 en cobertura al corregirse el procedimiento. */
let listasLargas = false;

/* Una fecha de hace n dias, en hora LOCAL. Con toISOString la prueba fallaria
   por la tarde segun el huso: la pantalla lee "AAAA-MM-DD" como medianoche
   local, asi que hay que generarla igual. */
function haceDias(n) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - n);
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo });

    const r = (obj, status) => Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });

    if (url.includes("/vendedor")) {
        return r({ status: "ok", codigo: 0, data: { listas: "x" }, nombre: "JUAN" });
    }

    // Las "por dia" devuelven vacio: es el caso que antes daba un 400.
    if (/xdia$/.test(url.split("?")[0])) return r({});

    if (url.includes("/lista/cotis") && listasLargas) {
        const muchas = {};
        for (let i = 0; i < 120; i++) {
            muchas[i] = { 0: "2026/10/03", 1: "009-00" + (900000 + i), 2: "CLIENTE " + i,
                          3: 100 + i, 4: "D", 5: "2026-10-03 12:00:00", 6: "cotizado", 7: 1 };
        }
        return r(muchas);
    }

    if (url.includes("/lista/cotis")) {
        // Una en dolares y otra en SOLES: ahi estaba el fallo del simbolo.
        return r({
            0: { 0: "2026/10/03", 1: "009-00971087", 2: "SERVICIOS INTERNET S.A.C.",
                 3: 1645.01, 4: "D", 5: "2026-10-03 13:57:38", 6: "cotizado", 7: 1 },
            1: { 0: "2026/10/02", 1: "009-00970988", 2: "DISTRIBUIDORA ANDINA S.A.C.",
                 3: 3210.00, 4: "S", 5: "2026-10-02 09:40:22", 6: "cotizado", 7: 1 }
        });
    }

    if (url.includes("/lista/facturas")) {
        /* Renumerado: la moneda es la 4, como en las otras dos. El estado y
           el editable llegan null SIN correr las posiciones, y los dos datos
           propios de facturas van al final, en la 8 y la 9.

           Va en SOLES a proposito: es la fila que delata a quien lea mal la
           moneda, porque ninguna de las otras posiciones vale "S". */
        return r({
            0: { 0: "2026/09/23", 1: "F009-0649171", 2: "KEYNERS COMPANY S.A.C.",
                 3: 881.04, 4: "S", 5: "2026-09-23 15:02:10",
                 6: null, 7: null, 8: "Provincia", 9: "N.DESPACHO" }
        });
    }

    if (url.includes("/lista/pedidos")) {
        /* Un pedido solo esta `aprobado` o `atendido` —no "pedido", que era
           lo que esta prueba suponia— y no trae `editable`: la 7 llega null.
           Su numero tampoco tiene el formato de cotizacion. */
        return r({
            0: { 0: "2026/09/17", 1: "099-00132184", 2: "INNOVA 2512 S.A.C.",
                 3: 144.05, 4: "S", 5: "2026-09-17 11:59:54", 6: "atendido", 7: null }
        });
    }

    if (url.includes("/lista/clientes/detalle")) {
        /* El cliente tiene que ser suyo: asignado, o facturado por el en el
           ultimo anio. Si no, 403 y no devuelve nada. */
        if (cuerpo.codcli === "C09988") {
            return r({ status: "cliente ajeno", codigo: 3, data: null,
                       msg: "este cliente no esta asignado a tu cartera ni lo has facturado" },
                     403);
        }
        return r({ status: "ok", codigo: 0, data: {
            /* otrasMonedas: compro en soles y en dolares. Sumarlas no
               significa nada, asi que llega la de mas peso y un aviso. */
            mes: { total: 4820.50, moneda: "D", documentos: 3, anterior: 3100.00,
                   otrasMonedas: true },
            /* El tercer dato del historial: el ritmo con que repone, no una
               prevision. Ver docs/respuesta-clientes.md. */
            reponer: [
                { descripcion: "TONER HP CF283A", cantidad: 2, cada: 38,
                  ultima: haceDias(51), compras: 7 }
            ],
            top: [
                { descripcion: "TONER HP CF283A", cantidad: 24, importe: 1915.00, moneda: "D" },
                { descripcion: "BOTELLA TINTA T544", cantidad: 60, importe: 1710.00, moneda: "D" }
            ]
        }});
    }

    if (url.includes("/lista/clientes")) {
        if (clientesVacio) return r({});
        /* Posiciones, no nombres de campo. Y los unicos dos valores validos de
           `tipo` son estos: cualquier otro devuelve lista vacia SIN error, que
           es por lo que "asignados" y "libres" no se notaban mal. */
        if (cuerpo.tipo === "cartera" && listasLargas) {
            const muchos = {};
            for (let i = 0; i < 163; i++) {
                muchos[i] = ["C" + (20000 + i), "CLIENTE NUMERO " + i, i % 4, 0];
            }
            // Uno reconocible MUY por detras de la primera tanda.
            muchos[150] = ["C99999", "ZZZ DISTRIBUIDORA UNICA S.A.C.", 2, 0];
            return r(muchos);
        }

        if (cuerpo.tipo === "cartera") {
            return r({
                0: ["C12171", "SERVICIOS INTERNET S.A.C.", 4, 1],
                1: ["C10874", "PC SUMINISTROS S.A.C.", 0, 0]   // cero: abandonado
            });
        }
        if (cuerpo.tipo === "cobertura") {
            /* TODO lo que facturo este mes, suyo o no. C12171 sale aqui Y en
               la cartera: las dos vistas NO son complementarias. */
            return r({
                0: ["C12171", "SERVICIOS INTERNET S.A.C.", 4],
                1: ["C09988", "DISTRIBUIDORA ANDINA S.A.C.", 2]
            });
        }
        return r({});
    }

    if (url.includes("/lista")) return r({ status: "ok", codigo: 0, data: ["leer"] });
    return r({ msg: "no simulado: " + url }, 404);
}

function leer(rel) { return fs.readFileSync(path.join(RAIZ, rel), "utf8"); }

async function montar(pagina) {
    let html = leer(pagina);
    const scripts = [...html.matchAll(/<script src="\/([^"]+)"><\/script>/g)].map(m => m[1]);
    const enLinea = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    html = html.replace(/<script src="\/[^"]+"><\/script>/g, "").replace(/<script>[\s\S]*?<\/script>/g, "");

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
    for (const codigo of enLinea) {
        try { w.eval(codigo); }
        catch (e) { console.log(`  FALLA  <script> de ${pagina}: ${e.message}`); fallos++; }
    }
    return { w, doc: w.document };
}

const pausa = (ms) => new Promise(r => setTimeout(r, ms));

(async function () {
    console.log("\n=== Listas · las tres sobre una sola implementacion ===\n");

    /* ------------------------------------------------- cotizaciones */
    console.log("— cotizaciones —");
    llamadas = [];
    const coti = await montar("lista/lista_cotizacion.html");
    await pausa(100);

    ok("sin errores al cargar", fallos, 0);
    ok("pidio la lista completa",
       llamadas.some(l => l.url.endsWith("/lista/cotis")), true);

    const filas = coti.doc.querySelectorAll("#ncotis .cdk-articulo");
    ok("pinto las dos", filas.length, 2);
    ok("con el cliente",
       coti.doc.querySelector("#ncotis .cdk-articulo__nombre").textContent,
       "SERVICIOS INTERNET S.A.C.");

    /* EL FALLO QUE ARRASTRABAN LAS TRES: el simbolo iba escrito a mano, asi
       que una cotizacion en soles se mostraba como "$3,210". */
    const importes = [...coti.doc.querySelectorAll("#ncotis .cdk-articulo__importe")]
        .map(n => n.textContent);
    ok("la de dolares con $",  importes[0].includes("$"), true);
    ok("la de SOLES con S/",   importes[1].includes("S/"), true);
    ok("y la de soles NO con $", /^\$|US\$/.test(importes[1]), false);

    console.log("\n— el filtro por fecha —");
    const campo = coti.doc.getElementById("fecha-dia");
    campo.value = "2026-10-01";
    campo.dispatchEvent(new coti.w.Event("change", { bubbles: true }));
    await pausa(80);

    const porDia = llamadas.filter(l => l.url.includes("cotisxdia")).pop();
    ok("cambia a la ruta del dia", !!porDia, true);
    ok("mandando esa fecha", porDia.cuerpo.dia, "2026-10-01");
    /* Un dia sin nada es lista vacia, no un error. */
    ok("dice que no hay nada ese dia",
       coti.doc.getElementById("ncotis").textContent.includes("No hay cotizaciones de ese día"), true);

    console.log("\n— quitar el filtro —");
    coti.doc.getElementById("btn-limpiar")
        .dispatchEvent(new coti.w.MouseEvent("click", { bubbles: true }));
    await pausa(80);
    ok("vuelve a la lista completa",
       coti.doc.querySelectorAll("#ncotis .cdk-articulo").length, 2);
    ok("y limpia el campo", campo.value, "");

    /* ------------------------------------------------------ facturas */
    console.log("\n— facturas, la misma implementacion —");
    llamadas = [];
    const fact = await montar("lista/lista_factura.html");
    await pausa(100);

    ok("pide SU ruta",
       llamadas.some(l => l.url.endsWith("/lista/facturas")), true);
    ok("pinta la factura",
       fact.doc.querySelectorAll("#nfactus .cdk-articulo").length, 1);

    /* EL FALLO QUE HABRIA INTRODUCIDO LA UNIFICACION: dar por hecho que la
       posicion 5 era la moneda, como en cotizaciones. Nunca lo fue. */
    const impFact = fact.doc.querySelector("#nfactus .cdk-articulo__importe").textContent;
    ok("el importe en SOLES", impFact.includes("S/"), true);
    ok("y no en dolares", /\$/.test(impFact), false);

    const textoFact = fact.doc.getElementById("nfactus").textContent;
    ok("marca que es nota de despacho", textoFact.includes("N.DESPACHO"), true);
    ok("y dice adonde va la entrega",   textoFact.includes("Provincia"), true);
    /* "Referencia" era la etiqueta del codigo viejo sobre ese mismo dato: la
       etiqueta estaba mal, el dato no. */
    ok("sin la etiqueta equivocada de antes", textoFact.includes("Referencia"), false);

    /* ------------------------------------------------------- pedidos */
    console.log("\n— pedidos, la misma implementacion —");
    llamadas = [];
    const ped = await montar("lista/lista_pedido.html");
    await pausa(100);

    ok("pide SU ruta",
       llamadas.some(l => l.url.endsWith("/lista/pedidos")), true);
    ok("pinta el pedido",
       ped.doc.querySelectorAll("#npedis .cdk-articulo").length, 1);
    const impPed = ped.doc.querySelector("#npedis .cdk-articulo__importe").textContent;
    ok("con su importe", impPed.includes("144.05"), true);
    ok("y en soles",     impPed.includes("S/"), true);
    /* Aqui el estado SI se pinta siempre: un pedido solo puede estar
       aprobado o atendido, y la diferencia es justo lo que se viene a ver.
       Ocultar uno por "normal" escondería la mitad de la informacion. */
    ok("y se ve si esta atendido",
       ped.doc.getElementById("npedis").textContent.includes("atendido"), true);

    /* ------------------------------------------------------ clientes */
    console.log("\n— clientes —");
    llamadas = [];
    const cli = await montar("lista/lista_clientes.html");
    await pausa(100);

    ok("pide la cartera, con ese nombre",
       llamadas.find(l => l.url.includes("/lista/clientes")).cuerpo.tipo, "cartera");
    ok("pinta los dos", cli.doc.querySelectorAll("#lista-clientes .cdk-articulo").length, 2);
    /* La 0 es el codigo y la 1 el nombre. Leerlas al reves pinta "C12171". */
    ok("con el nombre, no el codigo",
       cli.doc.querySelector("#lista-clientes .cdk-articulo__nombre").textContent,
       "SERVICIOS INTERNET S.A.C.");
    /* Un cliente de la cartera sin ventas es lo que esta pantalla sirve para
       ver. Sale dicho, no como un "Facturas 0" entre los demas. */
    ok("dice a quien tiene abandonado",
       cli.doc.getElementById("lista-clientes").textContent.includes("Sin ventas este mes"), true);
    /* Las notas de credito solo cuando las hay: una columna de ceros tapa las
       filas que si tienen. */
    ok("marca la nota de credito",
       cli.doc.getElementById("lista-clientes").textContent.includes("NC"), true);

    console.log("\n— filtrar sin ir al backend —");
    const antes = llamadas.length;
    cli.doc.getElementById("filtro").value = "PC SUMI";
    cli.doc.getElementById("filtro").dispatchEvent(new cli.w.Event("input", { bubbles: true }));
    await pausa(40);
    ok("queda uno", cli.doc.querySelectorAll("#lista-clientes .cdk-articulo").length, 1);
    ok("sin pedir nada al backend", llamadas.length, antes);

    cli.doc.getElementById("btn-limpiar-filtro")
        .dispatchEvent(new cli.w.MouseEvent("click", { bubbles: true }));
    await pausa(40);
    ok("y vuelven los dos", cli.doc.querySelectorAll("#lista-clientes .cdk-articulo").length, 2);

    console.log("\n— cambiar a fuera de cartera —");
    cli.doc.getElementById("btn-cobertura")
        .dispatchEvent(new cli.w.MouseEvent("click", { bubbles: true }));
    await pausa(80);
    ok("pide la cobertura",
       llamadas.filter(l => l.url.includes("/lista/clientes")).pop().cuerpo.tipo, "cobertura");
    ok("pinta los dos", cli.doc.querySelectorAll("#lista-clientes .cdk-articulo").length, 2);
    /* El solapamiento es la parte que se entendio mal durante un tiempo: un
       cliente suyo al que le vendio sale en las DOS vistas. */
    ok("y uno de ellos es de su cartera",
       cli.doc.getElementById("lista-clientes").textContent.includes("SERVICIOS INTERNET"), true);
    /* La cobertura son tres posiciones: no hay notas de credito que pintar. */
    ok("sin NC, que no vienen",
       cli.doc.getElementById("lista-clientes").textContent.includes("NC"), false);

    /* El dia 1 de cada mes las dos vistas salen vacias para todo el mundo,
       porque solo miran el mes en curso. Antes se leia "No tienes clientes
       asignados", que es falso justo el dia en que mas asusta leerlo. */
    console.log("\n— el mes recien empezado —");
    clientesVacio = true;
    cli.doc.getElementById("btn-cartera")
        .dispatchEvent(new cli.w.MouseEvent("click", { bubbles: true }));
    await pausa(80);

    const vacio = cli.doc.getElementById("lista-clientes").textContent;
    ok("no dice que no tengas clientes", /No tienes clientes/.test(vacio), false);
    ok("explica que hay en esta vista", vacio.includes("clientes asignados"), true);

    clientesVacio = false;
    cli.doc.getElementById("btn-cobertura")
        .dispatchEvent(new cli.w.MouseEvent("click", { bubbles: true }));
    await pausa(80);
    ok("y se recupera al volver a haber datos",
       cli.doc.querySelectorAll("#lista-clientes .cdk-articulo").length, 2);

    console.log("\n— tocar un cliente —");
    cli.doc.getElementById("btn-cartera")
        .dispatchEvent(new cli.w.MouseEvent("click", { bubbles: true }));
    await pausa(80);
    cli.doc.querySelector("#lista-clientes .cdk-articulo")
        .dispatchEvent(new cli.w.MouseEvent("click", { bubbles: true }));
    await pausa(150);

    ok("abre la ficha",
       cli.doc.getElementById("seccion-cliente").classList.contains("hidden"), false);

    const ficha = cli.doc.getElementById("detalle-cliente").textContent;
    ok("pidio el detalle",
       llamadas.some(l => l.url.includes("/clientes/detalle")), true);
    /* El codigo venia en la posicion 0 desde el principio. */
    ok("con el codigo del cliente",
       llamadas.filter(l => l.url.includes("/clientes/detalle")).pop().cuerpo.codcli, "C12171");
    ok("con el total del mes", ficha.includes("4,820.50"), true);
    ok("el mes anterior",      ficha.includes("3,100.00"), true);
    ok("y lo que mas compra",  ficha.includes("TONER HP CF283A"), true);
    /* La cifra grande del top es la CANTIDAD, porque es por lo que esta
       ordenado. Con el importe ahi, la lista parecia mal ordenada. */
    const grande = cli.doc.querySelector("#detalle-cliente .cdk-articulo__importe");
    ok("con la cantidad como cifra grande", /\d+ u\./.test(grande.textContent), true);
    ok("y el importe como dato, no al reves", ficha.includes("Importe"), true);

    /* La linea de reponer tiene que poder defenderse por telefono: el ritmo,
       lo que lleva pasado, y de cuantas compras sale ese ritmo. */
    ok("dice que le toca reponer",   ficha.includes("Le toca reponer"), true);
    ok("con su ritmo",               ficha.includes("2 cada 38 días"), true);
    ok("lo que lleva sin pedirlo",   ficha.includes("Lleva 51 días"), true);
    ok("y de cuantas compras sale",  ficha.includes("Compras 7"), true);
    /* Marcado como atrasado: 51 dias sobre un ritmo de 38. */
    ok("marcado como pasado de fecha",
       !!cli.doc.querySelector("#detalle-cliente .cdk-dato--alerta"), true);
    /* No es una prevision y la pantalla no dice que lo sea. */
    ok("sin prometer lo que va a comprar",
       /va a comprar|comprará|predic/i.test(ficha), false);
    /* Lo accionable primero: el top describe al cliente, esto dice que hacer. */
    ok("y va antes que el top",
       ficha.indexOf("Le toca reponer") < ficha.indexOf("Lo que más te compra"), true);

    /* La cifra del mes es solo de una moneda: decirlo es lo que impide que se
       lea como el total. */
    ok("avisa de que compro en otra moneda", ficha.includes("otra moneda"), true);

    console.log("\n— un cliente que no es suyo —");
    cli.doc.getElementById("btn-volver")
        .dispatchEvent(new cli.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    cli.doc.getElementById("btn-cobertura")
        .dispatchEvent(new cli.w.MouseEvent("click", { bubbles: true }));
    await pausa(120);
    // El segundo de la cobertura es el que el backend rechaza con 403.
    cli.doc.querySelectorAll("#lista-clientes .cdk-articulo")[1]
        .dispatchEvent(new cli.w.MouseEvent("click", { bubbles: true }));
    await pausa(150);

    const ajeno = cli.doc.getElementById("detalle-cliente").textContent;
    ok("ensena el motivo del backend", ajeno.includes("no esta asignado a tu cartera"), true);
    ok("y no el generico de permisos", ajeno.includes("No tienes permiso"), false);
    /* Un 403 no se arregla insistiendo. */
    ok("sin boton de reintentar",
       !!cli.doc.querySelector("#detalle-cliente .cdk-boton"), false);

    /* ------------------------------------------------ listas largas */
    /* Antes se construia un nodo por fila antes de enseñar nada. El coste no
       esta en traerlo —viene todo en la misma respuesta— sino en el DOM. */
    console.log("\n— una lista larga —");
    listasLargas = true;
    llamadas = [];
    const larga = await montar("lista/lista_cotizacion.html");
    await pausa(150);

    const verMas = () => [...larga.doc.querySelectorAll("#ncotis button")]
        .find(b => /Ver más/.test(b.textContent));

    ok("no pinta las 120 de golpe",
       larga.doc.querySelectorAll("#ncotis .cdk-articulo").length, 50);
    ok("ofrece ver mas", !!verMas(), true);
    ok("diciendo cuantas quedan", verMas().textContent.includes("70"), true);

    verMas().dispatchEvent(new larga.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    ok("al pulsar van 100", larga.doc.querySelectorAll("#ncotis .cdk-articulo").length, 100);
    /* Lo importante: NO vuelve al backend. Ya estaban todas aqui. */
    ok("sin pedir nada mas",
       llamadas.filter(l => l.url.includes("/lista/cotis")).length, 1);

    verMas().dispatchEvent(new larga.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    ok("y a la tercera estan las 120",
       larga.doc.querySelectorAll("#ncotis .cdk-articulo").length, 120);
    ok("y deja de ofrecer mas", !!verMas(), false);

    console.log("\n— y una lista larga de clientes —");
    llamadas = [];
    const cliL = await montar("lista/lista_clientes.html");
    await pausa(150);

    ok("tampoco pinta los 163",
       cliL.doc.querySelectorAll("#lista-clientes .cdk-articulo").length, 50);

    const verMasCli = () => [...cliL.doc.querySelectorAll("#lista-clientes button")]
        .find(b => /Ver más/.test(b.textContent));
    verMasCli().dispatchEvent(new cliL.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    ok("y amplia a 100",
       cliL.doc.querySelectorAll("#lista-clientes .cdk-articulo").length, 100);

    /* La parte sutil: quien amplio la lista y luego filtra tiene que ver lo
       que busca ARRIBA, no detras de un boton. El cliente 150 esta mucho mas
       alla de la primera tanda. */
    cliL.doc.getElementById("filtro").value = "UNICA";
    cliL.doc.getElementById("filtro")
        .dispatchEvent(new cliL.w.Event("input", { bubbles: true }));
    await pausa(60);

    ok("al filtrar queda uno",
       cliL.doc.querySelectorAll("#lista-clientes .cdk-articulo").length, 1);
    ok("y es el que se buscaba",
       cliL.doc.querySelector("#lista-clientes .cdk-articulo__nombre").textContent,
       "ZZZ DISTRIBUIDORA UNICA S.A.C.");
    ok("sin boton de ver mas, que ya no hace falta", !!verMasCli(), false);

    listasLargas = false;

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});
