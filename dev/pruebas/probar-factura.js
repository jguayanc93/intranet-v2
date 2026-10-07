/**
 * Prueba de integracion de la ficha de factura, sobre la pagina real.
 *
 * Lo que mas importa aqui:
 *   · que un campo sin permiso salga de SOLO LECTURA y no desaparezca
 *   · que los campos de muchas opciones abran el panel con buscador y que al
 *     teclear se le pregunte al servidor (que filtra con LIKE y devuelve 5)
 *   · que direccion se pida UNA vez y se filtre aqui, porque llega entera
 *   · que la fila acabe enseñando el nombre y no el codigo que se guarda
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

const FACTURA = {
    cliente: "C13290", clienteNombre: "KEYNERS COMPANY S.A.C.",
    despacho:   { codigo: 3, texto: "Desp. Local (Lima)" },
    transporte: { codigo: "T0001", texto: "COMPUDISKETT S.R.L." },
    // nombre | documento | telefono. El tercero suele venir vacio.
    atencion:   "CONTACTO DE EJEMPLO UNO|00000000|900000000",
    direccion:     "JR. GENERAL JOSE CANTERAC 545 - LIMA - JESUS MARIA",
    vendedor:      { codigo: "V0235", texto: "WILLIAM MELENDEZ HUAMAN" },
    observacion:   "",
    orden:         ""
};

// Ejecutivo: todo menos reasignar la factura a otro vendedor.
const PUEDE = { despacho: true, transporte: true, atencion: true, direccion: true,
                vendedor: false, observacion: true, orden: true };

const DESPACHOS = [["1", "Desp.Ventanilla"], ["3", "Desp. Local (Lima)"], ["4", "Desp. Provincia"]];
const TRANSPORTISTAS = [
    ["T0001", "COMPUDISKETT S.R.L."], ["T0042", "SHALOM EMPRESARIAL S.A.C."],
    ["T0103", "OLVA COURIER S.A.C."], ["T0210", "TRANSPORTES CRUZ DEL SUR S.A.C."],
    ["T0311", "MARVISUR E.I.R.L."], ["T0355", "TRANSPORTES LINEA S.A."],
    ["T0401", "SCHARFF INTERNATIONAL COURIER S.A."], ["T0455", "DHL EXPRESS PERU S.A.C."],
    // Seis contienen "TRANS": con tope de 5, uno se queda fuera y hay que decirlo.
    ["T0501", "TRANSPORTES ITTSA S.A."], ["T0502", "TRANSPORTES PAKATNAMU S.A.C."],
    ["T0503", "TRANSPORTES RODRIGO CARRANZA S.A.C."], ["T0504", "TRANSPORTES CHICLAYO S.A."]
];
// Direccion y atencion devuelven SOLO el texto.
const DIRECCIONES = ["JR. GENERAL JOSE CANTERAC 545 - LIMA - JESUS MARIA",
                     "AV. ARENALES 1302 - LIMA - LINCE",
                     "CAL. LOS NOGALES 88 - LIMA - SURQUILLO"];

function listar(filas, sugerencia, tope) {
    const t = String(sugerencia || "").trim().toUpperCase();
    let hallados = filas;
    if (t) hallados = filas.filter(f => String(Array.isArray(f) ? f[1] : f).toUpperCase().includes(t));
    // `total` es cuantas hay CON ESE FILTRO, no cuantas viajan.
    const cuantas = hallados.length;
    if (tope) hallados = hallados.slice(0, tope);
    const data = {};
    hallados.forEach((f, i) => { data[i] = Array.isArray(f) ? { 0: f[0], 1: f[1] } : { 0: f }; });
    return { status: "ok", codigo: 0, total: cuantas, data };
}

function responder(url, opciones) {
    const cuerpo = opciones && opciones.body ? JSON.parse(opciones.body) : {};
    llamadas.push({ url, cuerpo });

    const r = (obj, status) => Promise.resolve({
        status: status || 200, ok: (status || 200) < 400, statusText: "",
        text: () => Promise.resolve(JSON.stringify(JSON.stringify(obj)))
    });

    if (url.includes("/vendedor")  && !url.includes("/factura/")) {
        return r({ status: "ok", codigo: 0, data: { factura: "x" }, nombre: "JUAN" });
    }

    if (url.includes("/factura/campos")) {
        if (cuerpo.doc !== "F009-0649171") {
            return r({ status: "factura desconocida", codigo: 3, data: null,
                       msg: "la factura no existe, no es tuya, esta anulada o ya tiene guia emitida" }, 403);
        }
        return r({ status: "ok", codigo: 0,
                   data: Object.assign({ documento: cuerpo.doc }, FACTURA), puede: PUEDE });
    }

    if (url.includes("/factura/despacho/cambio"))   return r(listar(DESPACHOS, cuerpo.sugerencia, 0));
    if (url.includes("/factura/transporte/cambio")) return r(listar(TRANSPORTISTAS, cuerpo.sugerencia, 5));
    if (url.includes("/factura/direccion/cambio"))  return r(listar(DIRECCIONES, null, 0));
    if (url.includes("/factura/atencion/cambio"))   return r(listar([FACTURA.atencion], cuerpo.sugerencia, 5));
    if (url.includes("/factura/vendedor/cambio"))   return r(listar([["V0004", "CESAR CAMPOS"]], cuerpo.sugerencia, 5));

    if (url.includes("/factura/cambiado")) {
        const CLAVES = { 1: "despacho", 2: "transporte", 3: "atencion", 4: "direccion",
                         5: "vendedor", 6: "observacion", 7: "orden" };
        let nombre = cuerpo.campo || null, valor = cuerpo.valor;
        if (!nombre) {
            for (const k of Object.keys(cuerpo)) {
                if (CLAVES[k] !== undefined) { nombre = CLAVES[k]; valor = cuerpo[k]; break; }
            }
        }
        if (!nombre) return r({ status: "campo desconocido", codigo: 3, msg: "no se indico campo" }, 400);
        if (PUEDE[nombre] !== true) {
            return r({ status: "sin permiso", codigo: 3, msg: "tu grupo no puede cambiar ese campo" }, 403);
        }
        if (FACTURA[nombre] && typeof FACTURA[nombre] === "object") FACTURA[nombre].codigo = valor;
        else FACTURA[nombre] = valor;
        return r({ status: "ok", codigo: 0, documento: cuerpo.doc, campo: nombre, valor: valor });
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
const clic = (p, nodo) => nodo.dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));

function fila(p, etiqueta) {
    return [...p.doc.querySelectorAll("#campos .cdk-grupo")].find(g =>
        g.querySelector(".cdk-ficha-fila__etiqueta").textContent === etiqueta);
}
const valorDe = (f) => f.querySelector(".cdk-ficha-fila__valor").textContent;

(async function () {
    console.log("\n=== Factura · la ficha de los siete campos ===\n");

    console.log("— buscar la factura —");
    llamadas = [];
    const p = await montar("factura/factura_campos.html");
    await pausa(80);
    ok("sin errores al cargar", fallos, 0);

    p.doc.getElementById("doc").value = "F009-0649171";
    p.doc.getElementById("form-buscar")
     .dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(150);

    const pedida = llamadas.find(l => l.url.includes("/factura/campos"));
    ok("pidio /factura/campos", !!pedida, true);
    ok("con el documento", pedida.cuerpo.doc, "F009-0649171");
    /* UNA llamada para los siete campos. Antes eran siete rutas de lectura,
       y el backend las retiro justo por esto. */
    ok("una sola vez", llamadas.filter(l => l.url.includes("/factura/campos")).length, 1);
    ok("pinta los siete campos", p.doc.querySelectorAll("#campos .cdk-grupo").length, 7);

    console.log("\n— lo que no se puede tocar se ve igual —");
    const fVendedor = fila(p, "Vendedor asignado");
    ok("la fila de vendedor existe", !!fVendedor, true);
    ok("con su valor a la vista",
       fVendedor.textContent.includes("WILLIAM MELENDEZ"), true);
    /* `puede.vendedor` es false: la fila no es pulsable. Antes esto era una
       baldosa que simplemente no salia en el hub, y no habia forma de ver
       quien tenia asignada la factura. */
    ok("pero no es pulsable",
       fVendedor.querySelector(".cdk-articulo--pulsable") !== null, false);
    const fDespacho = fila(p, "Despacho");
    ok("y las que si, lo son",
       fDespacho.querySelector(".cdk-articulo--pulsable") !== null, true);

    console.log("\n— la atencion, sin las barras de la base —");
    const fAtencion = fila(p, "Atención");
    ok("ensena el nombre", valorDe(fAtencion), "CONTACTO DE EJEMPLO UNO");
    /* Son TRES campos: nombre, documento y telefono. El tercero suele venir
       vacio, pero cuando viene es un numero util. */
    ok("con el documento y el telefono debajo",
       fAtencion.querySelector(".cdk-ficha-fila__detalle").textContent,
       "00000000 · 900000000");
    ok("sin la barra a la vista", fAtencion.textContent.includes("|"), false);

    console.log("\n— lo que se desbordaba en el movil —");
    /* El valor NO puede ir en .cdk-articulo__importe: esa clase lleva
       `white-space: nowrap` y `flex: 0 0 auto` porque esta hecha para
       importes, y una direccion de cincuenta caracteres se salia de la
       tarjeta. En jsdom no hay maquetacion, asi que se comprueba la
       estructura, que es lo que lo causaba. */
    ok("ningun valor usa la clase de importes",
       p.doc.querySelectorAll("#campos .cdk-articulo__importe").length, 0);
    ok("todos usan la fila de ficha",
       p.doc.querySelectorAll("#campos .cdk-ficha-fila__valor").length, 7);
    ok("y la direccion entera esta ahi",
       valorDe(fila(p, "Dirección de entrega")),
       "JR. GENERAL JOSE CANTERAC 545 - LIMA - JESUS MARIA");

    console.log("\n— la cabecera: el nombre, no el codigo —");
    /* "C13290" no le dice nada a quien mira la pantalla. La razon social si:
       es lo que confirma que se esta tocando la factura correcta al cambiar
       una direccion de entrega. */
    const cabecera = p.doc.getElementById("seccion-ficha").textContent;
    ok("ensena la razon social", cabecera.includes("KEYNERS COMPANY S.A.C."), true);
    ok("y no el codigo", cabecera.includes("C13290"), false);

    console.log("\n— despacho: tres opciones, lista en la propia fila —");
    clic(p, fDespacho.querySelector(".cdk-articulo--pulsable"));
    await pausa(150);
    ok("no abre el panel",
       p.doc.getElementById("panel-busca").classList.contains("hidden"), true);
    ok("y ofrece las tres",
       fila(p, "Despacho").querySelectorAll(".cdk-opcion").length, 3);
    ok("marcando cual es la actual",
       fila(p, "Despacho").textContent.includes("el actual"), true);

    console.log("\n— transportista: panel con buscador —");
    clic(p, fila(p, "Transportista").querySelector(".cdk-articulo--pulsable"));
    await pausa(150);
    ok("abre el panel",
       p.doc.getElementById("panel-busca").classList.contains("hidden"), false);
    ok("con su titulo", p.doc.getElementById("panel-titulo").textContent, "Transportista");
    ok("y los cinco del servidor",
       p.doc.querySelectorAll("#panel-lista .cdk-opcion").length, 5);

    llamadas = [];
    const campoPanel = p.doc.getElementById("panel-campo");
    campoPanel.value = "cruz";
    campoPanel.dispatchEvent(new p.w.Event("input", { bubbles: true }));
    await pausa(400);

    const conTermino = llamadas.filter(l => l.url.includes("/transporte/cambio")).pop();
    ok("al teclear pregunta al servidor", !!conTermino, true);
    ok("mandandole lo tecleado", conTermino.cuerpo.sugerencia, "cruz");
    ok("y queda uno", p.doc.querySelectorAll("#panel-lista .cdk-opcion").length, 1);
    ok("con la parte tecleada resaltada",
       !!p.doc.querySelector("#panel-lista mark.cdk-marca"), true);

    /* Sin decir de cuantas son, cinco resultados se leen igual tanto si son
       todos como si hay doscientos detras. */
    console.log("\n— y dice de cuantas —");
    campoPanel.value = "trans";
    campoPanel.dispatchEvent(new p.w.Event("input", { bubbles: true }));
    await pausa(400);
    ok("ensena cinco", p.doc.querySelectorAll("#panel-lista .cdk-opcion").length, 5);
    ok("diciendo que hay mas",
       p.doc.getElementById("panel-pista").textContent.includes("de 6"), true);

    console.log("\n— elegir uno —");
    llamadas = [];
    clic(p, p.doc.querySelector("#panel-lista .cdk-opcion"));
    await pausa(200);

    const guardado = llamadas.filter(l => l.url.includes("/factura/cambiado")).pop();
    ok("guarda", !!guardado, true);
    /* Por NOMBRE, no por clave numerica: `{"2": "T0210"}` no se puede leer
       sin una tabla delante. */
    ok("diciendo que campo es", guardado.cuerpo.campo, "transporte");
    ok("con su valor",          guardado.cuerpo.valor, "T0210");
    ok("sin claves numericas",  guardado.cuerpo["2"], undefined);
    ok("y el documento",        guardado.cuerpo.doc, "F009-0649171");
    ok("cierra el panel",
       p.doc.getElementById("panel-busca").classList.contains("hidden"), true);
    /* Se guarda el codigo pero la fila tiene que seguir diciendo el nombre. */
    ok("la fila ensena el nombre, no el codigo",
       valorDe(fila(p, "Transportista")), "TRANSPORTES CRUZ DEL SUR S.A.C.");

    console.log("\n— direccion: llega entera y se filtra aqui —");
    llamadas = [];
    clic(p, fila(p, "Dirección de entrega").querySelector(".cdk-articulo--pulsable"));
    await pausa(150);
    ok("trae las tres", p.doc.querySelectorAll("#panel-lista .cdk-opcion").length, 3);
    /* Aqui si: el codigo de cliente viaja al backend aunque no se ensene. */
    ok("pidiendolas con el codigo de cliente",
       llamadas.filter(l => l.url.includes("/direccion/cambio")).pop().cuerpo.cli, "C13290");

    const pedidasAntes = llamadas.filter(l => l.url.includes("/direccion/cambio")).length;
    const campoDir = p.doc.getElementById("panel-campo");
    campoDir.value = "nogales";
    campoDir.dispatchEvent(new p.w.Event("input", { bubbles: true }));
    await pausa(200);

    ok("al teclear queda una", p.doc.querySelectorAll("#panel-lista .cdk-opcion").length, 1);
    /* Esta es la diferencia con transportista: el backend no le pone tope, asi
       que se pide una vez y escribir no cuesta un viaje por tecla. */
    ok("sin volver a preguntar al servidor",
       llamadas.filter(l => l.url.includes("/direccion/cambio")).length, pedidasAntes);

    p.doc.getElementById("panel-cerrar")
     .dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);

    console.log("\n— un campo de texto libre —");
    llamadas = [];
    clic(p, fila(p, "Orden de compra").querySelector(".cdk-articulo--pulsable"));
    await pausa(80);
    const entradaOC = fila(p, "Orden de compra").querySelector("input.cdk-entrada");
    ok("abre un campo de texto", !!entradaOC, true);
    entradaOC.value = "OC-2026-9001";
    clic(p, fila(p, "Orden de compra").querySelector(".cdk-boton"));
    await pausa(200);

    const oc = llamadas.filter(l => l.url.includes("/factura/cambiado")).pop();
    ok("guarda la orden por su nombre", oc.cuerpo.campo, "orden");
    ok("con su valor", oc.cuerpo.valor, "OC-2026-9001");
    ok("y la fila lo refleja", valorDe(fila(p, "Orden de compra")), "OC-2026-9001");

    console.log("\n— una factura que no es suya —");
    p.doc.getElementById("btn-volver")
     .dispatchEvent(new p.w.MouseEvent("click", { bubbles: true }));
    await pausa(60);
    p.doc.getElementById("doc").value = "F009-0000001";
    p.doc.getElementById("form-buscar")
     .dispatchEvent(new p.w.Event("submit", { bubbles: true, cancelable: true }));
    await pausa(200);

    const aviso = p.doc.getElementById("buscando").textContent;
    ok("ensena el motivo del backend", aviso.includes("no existe, no es tuya"), true);
    ok("y no un generico", aviso.includes("No tienes permiso"), false);

    console.log(fallos === 0 ? "\nTodo correcto.\n" : `\n${fallos} comprobacion(es) fallaron.\n`);
    process.exit(fallos === 0 ? 0 : 1);
})().catch(e => {
    console.log("\nLa prueba se rompio:", e.message);
    console.log(e.stack.split("\n").slice(1, 4).join("\n"));
    process.exit(1);
});
