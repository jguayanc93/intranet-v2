/**
 * Lista de precios del grupo 20 (cartera y cobertura): los precios de venta de los productos vigentes, en dolares, sin IGV y con IGV,
 * para consultarlos en pantalla o bajarlos a Excel. Solo lectura.
 *
 * Lo que hay que tener presente, porque cambia lo que la persona entiende:
 *
 *   · **La lista puede llegar a manos de los clientes.** Por eso no lleva costo, ni stock, ni codigos del sistema: lo que el backend no
 *     manda, aqui no se muestra ni se calcula. La disponibilidad dice lo mismo en todas las filas (`SUJETO A DISPONIBILIDAD`) y se dice
 *     UNA vez, arriba, en lugar de repetirla seis mil veces.
 *   · **Nada se calcula.** Los dos precios llegan hechos: `precioConIgv` ya es `precioSinIgv` por 1,18 con la regla del ERP, y quien lo
 *     recalcule en el navegador puede darse un centimo de diferencia. El orden es el del backend (familia, marca y descripcion).
 *   · **Son unas 6 400 filas y llegan todas de una vez**, asi que se muestran de a 50 («Mostrar 50 más») y se filtra aqui, en el navegador,
 *     sin volver a pedir: por familia, por marca y por texto (descripcion, part number o marca). Las familias y las marcas salen de las
 *     FILAS: la pantalla no tiene su propia lista (la del backend vive en `FAMILIAS_LISTA_PRECIOS`).
 *   · **El Excel trae siempre la lista completa**, aunque haya un filtro puesto: se dice junto al boton. Se pide aparte (no se arma con
 *     lo que se ve), y solo se guarda si lo que llega es de verdad una hoja de calculo.
 *   · No hay que registrar nada: el backend deja constancia de cada descarga por su cuenta.
 *
 * Ver docs/listaprecios-grupo20.md.
 */
;(function () {
    "use strict";

    var el = CDK.el;
    var L = CDK.listaprecios;

    var contenido = document.getElementById("contenido");
    var titulo = document.getElementById("periodo");

    if (!contenido) return;

    var PAGINA = 50;                     // cuantas filas se pintan por vez

    var filas = [];                      // todo, en el orden del backend
    var llaves = [];                     // el texto de busqueda de cada fila, normalizado una sola vez
    var marcasPorFamilia = {};           // familia → sus marcas, ordenadas
    var todasLasMarcas = [];

    var familia = "";                    // "" = todas
    var marca = "";
    var busqueda = "";
    var coincidencias = [];              // los indices de `filas` que pasan los filtros
    var pintadas = 0;                    // cuantas de las coincidencias ya estan en pantalla

    /* ---------------------------------------------------------------
     * Formatos
     * ------------------------------------------------------------- */
    function dolares(v) { return CDK.formato.moneda(v, "D"); }
    function entero(v) { return CDK.formato.numero(v, 0); }
    function fecha(f) { return f ? CDK.formato.fecha(f) : ""; }
    function esSesionVencida(err) { return CDK.http.esError(err) && err.status === 401; }     // ya redirige

    /* Las marcas de tilde que deja `normalize("NFD")` (U+0300 a U+036F). Se arman con codigos y no con un escape ni con los caracteres
       sueltos: asi el archivo se lee igual en cualquier editor. */
    var TILDES = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");

    /** Minusculas y sin tildes, para que «español» encuentre «ESPAÑOL» y «Epson» a «EPSON». */
    function normalizar(t) {
        return String(t === null || t === undefined ? "" : t).toLowerCase().normalize("NFD").replace(TILDES, "");
    }

    function comparar(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

    function pista(texto, idDelNodo) { return el("p", { clase: "cdk-pista", id: idDelNodo || null, style: "margin:8px 0 0", texto: texto }); }

    /** `SUJETO A DISPONIBILIDAD` → `Sujeto a disponibilidad`. */
    function frase(t) { var s = String(t || "").toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1); }

    /* ---------------------------------------------------------------
     * Cargar
     * ------------------------------------------------------------- */
    function cargar() {
        CDK.estados.cargando(contenido, "Cargando la lista de precios…");

        L.ver()
            .then(function (d) {
                if (!d || !Array.isArray(d.filas)) {
                    CDK.estados.error(contenido, "La respuesta no trae la lista de precios.", cargar);
                    return;
                }
                pintar(d);
            })
            .catch(function (err) {
                if (esSesionVencida(err)) return;
                CDK.estados.error(contenido, err, cargar);
            });
    }

    /** Lo que se prepara una sola vez, al llegar la lista: la llave de busqueda de cada fila y las marcas de cada familia. */
    function preparar(d) {
        filas = d.filas;
        llaves = filas.map(function (x) { return normalizar([x.descripcion, x.partNumber, x.marca].join(" ")); });

        var porFamilia = {};
        var todas = {};
        filas.forEach(function (x) {
            if (!porFamilia[x.familia]) porFamilia[x.familia] = {};
            porFamilia[x.familia][x.marca] = true;
            todas[x.marca] = true;
        });

        marcasPorFamilia = {};
        Object.keys(porFamilia).forEach(function (f) { marcasPorFamilia[f] = Object.keys(porFamilia[f]).sort(comparar); });
        todasLasMarcas = Object.keys(todas).sort(comparar);

        familia = "";
        marca = "";
        busqueda = "";
    }

    /** Las familias, en el orden en que llegan (ya vienen ordenadas): salen de las filas, no de una lista nuestra. */
    function familiasDeLasFilas() {
        var vistas = {};
        var lista = [];
        filas.forEach(function (x) { if (!vistas[x.familia]) { vistas[x.familia] = true; lista.push(x.familia); } });
        return lista;
    }

    /* ---------------------------------------------------------------
     * Una fila
     * ------------------------------------------------------------- */
    function fila(x, disponibilidadEnCadaFila) {
        var datos = [];

        datos.push(x.partNumber
            ? el("span", { clase: "cdk-dato" }, [document.createTextNode("Part number "), el("span", { clase: "cdk-dato__valor", texto: x.partNumber })])
            : el("span", { texto: "Sin part number" }));
        if (x.marca) datos.push(el("span", { texto: x.marca }));
        if (x.familia) datos.push(el("span", { texto: x.familia }));
        if (disponibilidadEnCadaFila && x.disponibilidad) datos.push(el("span", { texto: frase(x.disponibilidad) }));

        /* Los dos precios, dichos con TEXTO («sin IGV», «con IGV»): el de venta arriba y el otro debajo, mas chico. */
        var pequeno = "font-size:12px;font-weight:500;color:var(--cdk-texto-suave)";
        var precios = el("span", { clase: "cdk-fila__importe", style: "text-align:right" }, [
            el("span", { clase: "lp-sin-igv", texto: dolares(x.precioSinIgv) }),
            el("span", { style: pequeno, texto: " sin IGV" }),
            el("span", { clase: "lp-con-igv", style: pequeno + ";display:block", texto: dolares(x.precioConIgv) + " con IGV" })
        ]);

        return el("li", { clase: "cdk-fila" }, [el("div", { clase: "cdk-fila__contenido" }, [
            el("div", { clase: "cdk-fila__linea" }, [el("span", { clase: "cdk-fila__nombre", texto: x.descripcion }), precios]),
            el("div", { clase: "cdk-fila__datos" }, datos)
        ])]);
    }

    /* ---------------------------------------------------------------
     * La pantalla
     * ------------------------------------------------------------- */
    function pintar(d) {
        preparar(d);

        titulo.textContent = d.fecha ? "Lista del " + fecha(d.fecha) : "Precios de venta";
        contenido.innerHTML = "";

        if (!filas.length) {
            /* No es un error: simplemente no hay nada que mostrar. */
            CDK.estados.vacio(contenido, "La lista de precios no trae productos.");
            return;
        }

        /* La disponibilidad es la misma en todas las filas: se dice una vez. Si algun dia llegara distinta, se dice en cada una. */
        var disponibilidades = {};
        filas.forEach(function (x) { disponibilidades[x.disponibilidad || ""] = true; });
        var valores = Object.keys(disponibilidades).filter(Boolean);
        var unaSola = valores.length === 1 && Object.keys(disponibilidades).length === 1;

        var nota = "Precios de lista en dólares (US$), antes del descuento por tipo de cliente: son los mismos para todos los clientes." +
                   (unaSola ? " " + frase(valores[0]) + "." : "");

        /* ---- los filtros */
        var buscador = el("input", { type: "search", id: "lp-buscar", clase: "cdk-entrada", autocomplete: "off",
                                     placeholder: "Descripción, part number o marca", "aria-label": "Buscar un producto" });
        var selectFamilia = el("select", { id: "lp-familia", clase: "cdk-entrada", "aria-label": "Filtrar por familia" });
        var selectMarca = el("select", { id: "lp-marca", clase: "cdk-entrada", "aria-label": "Filtrar por marca" });

        function opciones(select, todas, lista) {
            select.innerHTML = "";
            select.appendChild(el("option", { value: "", texto: todas }));
            lista.forEach(function (t) { select.appendChild(el("option", { value: t, texto: t })); });
        }

        opciones(selectFamilia, "Todas las familias", familiasDeLasFilas());
        opciones(selectMarca, "Todas las marcas", todasLasMarcas);

        var cuenta = pista("", "lp-cuenta");
        var destino = el("div", { id: "lp-lista", style: "margin-top:12px" });
        var mas = el("button", { type: "button", id: "lp-mas", clase: "cdk-boton cdk-boton--suave", style: "margin-top:12px" });
        var ul = null;

        /* ---- pintar de a 50 */
        function actualizarCuenta() {
            var n = coincidencias.length;
            if (!n) cuenta.textContent = "";
            else if (pintadas >= n) cuenta.textContent = entero(n) + (n === 1 ? " producto." : " productos.");
            else cuenta.textContent = "Se muestran " + entero(pintadas) + " de " + entero(n) + ".";

            var faltan = n - pintadas;
            mas.textContent = "Mostrar " + entero(Math.min(PAGINA, Math.max(faltan, 0))) + " más";
            mas.style.display = faltan > 0 ? "" : "none";
        }

        function pintarSiguientes() {
            var hasta = Math.min(pintadas + PAGINA, coincidencias.length);
            for (var i = pintadas; i < hasta; i++) ul.appendChild(fila(filas[coincidencias[i]], !unaSola));
            pintadas = hasta;
            actualizarCuenta();
        }

        function refiltrar() {
            var terminos = normalizar(busqueda).split(/\s+/).filter(Boolean);

            coincidencias = [];
            for (var i = 0; i < filas.length; i++) {
                var x = filas[i];
                if (familia && x.familia !== familia) continue;
                if (marca && x.marca !== marca) continue;
                if (terminos.length && !terminos.every(function (t) { return llaves[i].indexOf(t) !== -1; })) continue;
                coincidencias.push(i);
            }

            pintadas = 0;
            destino.innerHTML = "";

            if (!coincidencias.length) {
                CDK.estados.vacio(destino, "Ningún producto coincide.");
                ul = null;
                actualizarCuenta();
                return;
            }

            ul = el("ul", { clase: "cdk-filas", id: "lp-productos" });
            destino.appendChild(ul);
            pintarSiguientes();
        }

        selectFamilia.addEventListener("change", function () {
            familia = selectFamilia.value;

            /* Las marcas que se ofrecen son las de esa familia; si la que estaba elegida no esta, se suelta. */
            var delaFamilia = familia ? marcasPorFamilia[familia] || [] : todasLasMarcas;
            if (marca && delaFamilia.indexOf(marca) === -1) marca = "";
            opciones(selectMarca, "Todas las marcas", delaFamilia);
            selectMarca.value = marca;

            refiltrar();
        });
        selectMarca.addEventListener("change", function () { marca = selectMarca.value; refiltrar(); });
        buscador.addEventListener("input", function () { busqueda = buscador.value; refiltrar(); });
        mas.addEventListener("click", pintarSiguientes);

        /* ---- el Excel */
        var exportar = el("button", { type: "button", id: "lp-exportar", clase: "cdk-boton cdk-boton--primario", texto: "Descargar Excel" });
        exportar.addEventListener("click", function () { descargar(exportar); });

        contenido.appendChild(el("section", { clase: "cdk-seccion", id: "lp-seccion" }, [
            el("h2", { clase: "cdk-seccion__titulo", texto: "Precios de venta" }),
            el("p", { clase: "cdk-seccion__sub", id: "lp-nota", texto: nota }),

            el("div", { clase: "cdk-campo" }, [el("label", { clase: "cdk-campo__etiqueta", "for": "lp-buscar", texto: "Buscar" }), buscador]),
            el("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px" }, [
                el("div", { clase: "cdk-campo" }, [el("label", { clase: "cdk-campo__etiqueta", "for": "lp-familia", texto: "Familia" }), selectFamilia]),
                el("div", { clase: "cdk-campo" }, [el("label", { clase: "cdk-campo__etiqueta", "for": "lp-marca", texto: "Marca" }), selectMarca])
            ]),

            el("div", { clase: "cdk-acciones-fila", style: "margin-top:12px" }, [exportar]),
            pista("El Excel trae la lista completa (" + entero(filas.length) + " productos), aunque tengas filtros puestos.", "lp-aviso-excel"),

            cuenta,
            destino,
            mas
        ]));

        refiltrar();
    }

    /* ---------------------------------------------------------------
     * Excel
     * ------------------------------------------------------------- */

    /**
     * Baja el Excel. Se pide aparte, no se arma con lo que se ve: lo que se descarga es exactamente lo que dice el backend. Mientras se
     * genera, el boton no deja pulsar otra vez.
     */
    function descargar(boton) {
        if (boton.disabled) return;

        var texto = boton.textContent;
        boton.disabled = true;
        boton.textContent = "Generando…";

        L.exportar()
            .then(function (r) {
                guardar(r.blob, r.nombre);
                CDK.toast("Se descargó " + r.nombre, "exito");
            })
            .catch(function (err) {
                if (esSesionVencida(err)) return;
                CDK.toast(L.mensajeError(err), "error", 6000);
            })
            .then(function () {
                boton.disabled = false;
                boton.textContent = texto;
            });
    }

    /** Guarda el archivo: un enlace con `download` sobre un blob, que es lo unico que dispara la descarga sin salir de la pagina. */
    function guardar(blob, nombre) {
        var url = window.URL.createObjectURL(blob);
        var a = el("a", { href: url, download: nombre, style: "display:none" });

        document.body.appendChild(a);
        a.click();
        a.remove();

        /* No se revoca ya: algunos navegadores empiezan a leer el blob despues del clic, y revocarlo antes corta la descarga. */
        setTimeout(function () { window.URL.revokeObjectURL(url); }, 2000);
    }

    cargar();

})();
