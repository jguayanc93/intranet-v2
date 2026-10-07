/**
 * Corre las diez suites y resume.
 *
 *     node dev/pruebas/todas.js
 *
 * Cada suite se ejecuta en su propio proceso a proposito: comparten nombres
 * globales -`fallos`, `llamadas`, los fixtures- y en un solo proceso se
 * pisarian. Ademas, una que se rompa no se lleva por delante a las demas.
 *
 * Sale con codigo 1 si alguna falla, para que sirva tal cual en un gancho de
 * commit o en una tuberia.
 */
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const AQUI = __dirname;

const suites = fs.readdirSync(AQUI)
    .filter((f) => f.startsWith("probar-") && f.endsWith(".js"))
    .sort();

if (!suites.length) {
    console.log("No hay ninguna suite en", AQUI);
    process.exit(1);
}

let rotas = 0;
let comprobaciones = 0;

console.log("");

for (const suite of suites) {
    const etiqueta = suite.replace(/^probar-|\.js$/g, "").padEnd(12);
    let salida = "";
    let bien = true;

    try {
        salida = execFileSync(process.execPath, [path.join(AQUI, suite)],
                              { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e) {
        bien = false;
        salida = (e.stdout || "") + (e.stderr || "");
    }

    const ok = (salida.match(/^ {2}ok {2}/gm) || []).length;
    comprobaciones += ok;

    if (bien) {
        console.log(`  ${etiqueta} ${String(ok).padStart(3)} ok`);
    } else {
        rotas++;
        console.log(`  ${etiqueta} FALLA`);
        salida.split("\n")
              .filter((l) => / FALLA|esperado:|real:/.test(l))
              .slice(0, 9)
              .forEach((l) => console.log("      " + l.trim()));
    }
}

console.log("");
console.log(rotas
    ? `  ${rotas} de ${suites.length} suites fallaron · ${comprobaciones} comprobaciones\n`
    : `  ${suites.length} suites, ${comprobaciones} comprobaciones, todo correcto\n`);

process.exit(rotas ? 1 : 0);
