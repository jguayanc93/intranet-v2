/**
 * Revision previa al despliegue: que lo que se sirve este completo y no lleve restos.
 *
 *     node dev/revisar-despliegue.js
 *
 * Sale con codigo 1 si encuentra algo, para usarlo tal cual antes de un commit o una subida.
 * Revisa lo que SE DESPLIEGA, que es todo menos `dev/` y la documentacion (`docs/` y los `.md`):
 *
 *   1. Cada pagina carga solo archivos que existen, que git conoce, y ninguno de `dev/`.
 *   2. Cada script es sintacticamente valido.
 *   3. Nada lleva `debugger` ni algo que parezca una clave escrita en el codigo.
 *   4. Lo NUEVO no escribe a mano una direccion (`127.0.0.1`, `localhost`, el servidor de produccion) ni deja
 *      un `console.log` suelto: la API se resuelve con `CDK.rutas.api()` y las paginas con `CDK.rutas.app()`.
 *
 * No sustituye a las pruebas (`node dev/pruebas/todas.js`): comprueba otra cosa. Las pruebas dicen que las
 * pantallas hacen lo que deben; esto dice que no falta ningun archivo ni sobra nada de desarrollo.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const RAIZ = path.resolve(__dirname, "..");

/* Lo que ya estaba mal antes y que no se arregla aqui. Cada uno con su motivo: si se arregla, se quita de esta lista. */
const CONOCIDOS = [
    "programador/programador_entregar.html → ./js/funciones/factura_buscar.js no existe"      // el modulo Programador esta desactivado (`existe: false` en el catalogo)
];

const git = (args) => execSync("git " + args, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);

/* Lo que git conoce o va a conocer: lo rastreado y lo nuevo que no esta ignorado. */
const todos = git("ls-files --cached --others --exclude-standard").filter((f) => fs.existsSync(path.join(RAIZ, f)));
const rastreados = new Set(git("ls-files"));

const desplegados = todos.filter((f) => !f.startsWith("dev/") && !f.startsWith("docs/") && !f.endsWith(".md"));
const paginas = desplegados.filter((f) => f.endsWith(".html"));
const scripts = desplegados.filter((f) => f.endsWith(".js"));
const nuevos = desplegados.filter((f) => !rastreados.has(f) && /\.(js|html)$/.test(f));

let problemas = 0;
let conocidos = 0;
function mal(texto) {
    if (CONOCIDOS.indexOf(texto) !== -1) { conocidos++; return; }
    problemas++;
    console.log("  PROBLEMA " + texto);
}

const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
/** Una linea que es comentario no es codigo. */
const esComentario = (l) => l.startsWith("//") || l.startsWith("*") || l.startsWith("/*");

/* 1 · lo que carga cada pagina */
console.log("1 · lo que cargan las " + paginas.length + " paginas");
for (const pag of paginas) {
    const refs = [...leer(pag).matchAll(/(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)].map((m) => m[1])
        .filter((r) => !/^(https?:)?\/\//.test(r) && !/^(mailto:|javascript:|data:)/.test(r));

    for (const r of refs) {
        const destino = r.startsWith("/") ? r.slice(1) : path.posix.join(path.posix.dirname(pag), r);

        if (!fs.existsSync(path.join(RAIZ, destino))) mal(pag + " → " + r + " no existe");
        else if (destino.startsWith("dev/")) mal(pag + " carga algo de dev/: " + r);
        else if (!todos.includes(destino)) mal(pag + " → " + r + " existe pero git no lo conoce");
    }
}

/* 2 · sintaxis */
console.log("2 · sintaxis de los " + scripts.length + " scripts");
for (const s of scripts) {
    try { execSync(`node --check "${path.join(RAIZ, s)}"`, { stdio: "pipe" }); }
    catch (e) { mal("sintaxis: " + s); }
}

/* 3 · restos */
console.log("3 · restos en lo que se despliega");
for (const f of desplegados.filter((x) => /\.(js|html)$/.test(x))) {
    leer(f).split("\n").forEach((linea, i) => {
        const l = linea.trim();
        if (esComentario(l)) return;
        if (/\bdebugger\b/.test(l)) mal(`${f}:${i + 1} debugger`);
        if (/(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*["'][^"']{4,}["']/i.test(l)) mal(`${f}:${i + 1} parece una clave: ${l.slice(0, 80)}`);
    });
}

/* 4 · lo nuevo, sin direcciones a mano. Lo heredado (caminos/rutas.js y otras) no se mira: no es de esta entrega. */
console.log("4 · direcciones a mano en los " + nuevos.length + " archivos nuevos");
for (const f of nuevos) {
    leer(f).split("\n").forEach((linea, i) => {
        const l = linea.trim();
        if (esComentario(l)) return;
        if (/127\.0\.0\.1|localhost|pulpo\.compudiskett/.test(l)) mal(`${f}:${i + 1} direccion escrita a mano: ${l.slice(0, 90)}`);
        if (/console\.log\(/.test(l)) mal(`${f}:${i + 1} console.log suelto`);
    });
}

console.log(problemas
    ? `\n${problemas} problema(s)`
    : `\nSin problemas: ${desplegados.length} archivos que se despliegan (${nuevos.length} nuevos)` +
      (conocidos ? `, y ${conocidos} problema(s) ya conocido(s) que no son de esta entrega` : ""));
process.exit(problemas ? 1 : 0);
