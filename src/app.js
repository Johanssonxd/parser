const textarea = document.querySelector('textarea');

textarea.addEventListener('keydown', function(e) {
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = this.selectionStart;
    const end = this.selectionEnd;
    const spaces = '  ';
    this.value = this.value.substring(0, start) + spaces + this.value.substring(end);
    this.selectionStart = this.selectionEnd = start + spaces.length;
  }
});

function analizarCodigo(texto) {
    const listaTokens = [];
    const tablaSimbolos = [];
    let lineaActual = 1;
    let i = 0;

    const mapaDelimitadores = { ';': 'SEMICOLON', ':': 'COLON', '(': 'LPAREN', ')': 'RPAREN' };
    const mapaOperadores = { '=': 'ASSIGN', '+': 'PLUS', '*': 'MULT' };
    const mapaReservadas = { 'program': 'PROGRAM', 'var': 'VAR', 'int': 'INT', 'float': 'FLOAT', 'begin': 'BEGIN', 'end': 'END' };

    while (i < texto.length) {
        let char = texto[i];

        if (char === ' ' || char === '\t' || char === '\r') {
            i++;
            continue;
        }

        if (char === '\n') {
            lineaActual++;
            i++;
            continue;
        }

        if (char === '/' && texto[i + 1] === '/') {
            while (i < texto.length && texto[i] !== '\n') {
                i++;
            }
            continue;
        }

        if (mapaDelimitadores[char]) {
            listaTokens.push({ lexema: char, token: mapaDelimitadores[char], linea: lineaActual });
            i++;
            continue;
        }

        if (mapaOperadores[char]) {
            listaTokens.push({ lexema: char, token: mapaOperadores[char], linea: lineaActual });
            i++;
            continue;
        }

        if (/[a-zA-Z]/.test(char)) {
            let palabra = '';
            while (i < texto.length && /[a-zA-Z0-9_]/.test(texto[i])) {
                palabra += texto[i];
                i++;
            }

            const lowerPalabra = palabra.toLowerCase();
            
            if (mapaReservadas[lowerPalabra]) {
                listaTokens.push({ lexema: palabra, token: mapaReservadas[lowerPalabra], linea: lineaActual });
            } else {
                listaTokens.push({ lexema: palabra, token: 'ID', linea: lineaActual });
                
                const existe = tablaSimbolos.some(simbolo => simbolo.lexema === palabra);
                if (!existe) {
                    tablaSimbolos.push({ lexema: palabra, token: 'ID', linea: lineaActual });
                }
            }
            continue;
        }

        if (/[0-9]/.test(char)) {
            let numero = '';
            while (i < texto.length && /[0-9.]/.test(texto[i])) {
                numero += texto[i];
                i++;
            }
            listaTokens.push({ lexema: numero, token: 'NUM', linea: lineaActual });
            continue;
        }

        listaTokens.push({ lexema: char, token: 'ERROR_LEXICO', linea: lineaActual });
        i++;
    }
    return { listaTokens, tablaSimbolos };
}

function ejecutarParser(listaTokens, tablaLL1, terminales) {
    let pila = ['$', 'P'];
    let tokens = [...listaTokens];
    
    let ultimaLinea = tokens.length > 0 ? tokens[tokens.length-1].linea : 1;
    tokens.push({ lexema: '$', token: '$', linea: ultimaLinea });

    let cursor = 0;
    let traza = [];
    let enDeclaracion = false;
    let variablesDeclaradas = new Set();
    let errores = [];

    const registrarTraza = (accion) => {
        const contenidoPila = pila.join(" ");
        const tokenActual = tokens[cursor].token;
        traza.push(`PILA: [ ${contenidoPila} ] | ENTRADA ACTUAL: ${tokenActual} | ACCIÓN: ${accion}`);
    };

    registrarTraza("Inicio del analisis");

    while (pila.length > 0) {
        let X = pila[pila.length - 1];
        let a = tokens[cursor];

        if (a.token === 'ERROR_LEXICO') {
            errores.push(`Error Léxico en línea ${a.linea}: Caracter inválido '${a.lexema}'`);
            registrarTraza("Detenido por error léxico");
            break;
        }

        if (X === a.token) {
            registrarTraza(`Match de terminal: ${X}`);
            pila.pop();

            if (a.token === 'VAR') enDeclaracion = true;
            if (a.token === 'BEGIN') enDeclaracion = false;

            if (a.token === 'ID' && enDeclaracion) {
                if (variablesDeclaradas.has(a.lexema)) {
                    errores.push(`Error Semántico en línea ${a.linea}: El identificador '${a.lexema}' ya fue declarado previamente.`);
                    registrarTraza("Detenido por error semántico (duplicado)");
                    break;
                } else {
                    variablesDeclaradas.add(a.lexema);
                }
            }
            cursor++;
        } else if (terminales.includes(X) || X === '$') {
            errores.push(`Error Sintáctico en línea ${a.linea}: se esperaba ${X}, se recibió ${a.token} ('${a.lexema}')`);
            registrarTraza("Detenido por error sintáctico (terminal no coincide)");
            break;
        } else {
            let celda = tablaLL1[X] ? tablaLL1[X][a.token] : undefined;
            
            if (!celda || celda.length === 0) {
                let esperados = [];
                if (tablaLL1[X]) {
                    for (let terminal in tablaLL1[X]) {
                        if (tablaLL1[X][terminal].length > 0) {
                            esperados.push(terminal);
                        }
                    }
                }
                
                let esperadosStr = esperados.join(" o ");
                errores.push(`Error Sintáctico en línea ${a.linea}: se esperaba ${esperadosStr}, se recibió ${a.token} ('${a.lexema}')`);
                registrarTraza("Detenido por error sintáctico (celda vacía)");
                break;
            }
            let produccionStr = celda[0];
            registrarTraza(`Aplicar regla: ${produccionStr}`);
            pila.pop();

            let rhs = produccionStr.split("->")[1].trim();
            if (rhs !== "EPS") { 
                let simbolos = rhs.split(" ").filter(s => s.length > 0);
                for (let j = simbolos.length - 1; j >= 0; j--) {
                    pila.push(simbolos[j]);
                }
            }
        }
    }

    if (errores.length === 0 && cursor === tokens.length) {
        traza.push("ANÁLISIS SINTÁCTICO EXITOSO");
        return { exito: true, traza, errores };
    } else {
        traza.push("ERROR: ANÁLISIS DETENIDO");
        return { exito: false, traza, errores };
    }
}

function generarArchivoDescarga(contenido, nombreArchivo) {
    const blob = new Blob([contenido], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
}

const btnAnalizar = document.getElementById("btn-analizar");
const codigoTexto = document.getElementById("codigo-fuente");
const divResultadoParser = document.getElementById("resultado-parser");
const btnDescargar = document.getElementById("btn-descargar");

let trazaGlobal = [];

btnAnalizar.addEventListener('click', () => {
    const codigo = codigoTexto.value;
    const resultadosLexer = analizarCodigo(codigo);
    
    const tbodyTokens = document.querySelector("#tabla-tokens tbody");
    const tbodySimbolos = document.querySelector("#tabla-simbolos tbody");
    const theadLL1 = document.querySelector("#tabla-ll1 thead");
    const tbodyLL1 = document.querySelector("#tabla-ll1 tbody");

    let htmlTokens = "";
    resultadosLexer.listaTokens.forEach(item => {
        const claseFila = (item.token === 'ERROR_LEXICO') ? 'class="error-lexico"' : '';
        htmlTokens += `
            <tr ${claseFila}>
                <td>${item.lexema}</td>
                <td>${item.token}</td>
                <td>${item.linea}</td>
            </tr>
        `;
    });
    tbodyTokens.innerHTML = htmlTokens;

    let htmlSimbolos = "";
    resultadosLexer.tablaSimbolos.forEach(simbolo => {
        htmlSimbolos += `
            <tr>
                <td>${simbolo.lexema}</td>
                <td>${simbolo.token}</td>
                <td>${simbolo.linea}</td>
            </tr>
        `;
    });
    tbodySimbolos.innerHTML = htmlSimbolos;

    const gramaticaProyecto = `
P -> PROGRAM ID SEMICOLON D B
D -> VAR L | EPS
L -> ID COLON T SEMICOLON L_PRIMA
L_PRIMA -> L | EPS
T -> INT | FLOAT
B -> BEGIN S END
S -> ID ASSIGN E SEMICOLON S_PRIMA
S_PRIMA -> S | EPS
E -> F E_PRIMA
E_PRIMA -> PLUS F E_PRIMA | EPS
F -> ID | NUM
    `;

    const resultadosGramatica = calcularGramaticaEstructurada(gramaticaProyecto);
    
    if (resultadosGramatica) {
        let htmlTheadLL1 = "<tr><th>NT</th>";
        resultadosGramatica.terminales.forEach(t => {
            htmlTheadLL1 += `<th>${t}</th>`;
        });
        htmlTheadLL1 += "</tr>";
        theadLL1.innerHTML = htmlTheadLL1;

        let htmlTbodyLL1 = "";
        resultadosGramatica.noTerminales.forEach(nt => {
            htmlTbodyLL1 += `<tr><td><strong>${nt}</strong></td>`;
            resultadosGramatica.terminales.forEach(t => {
                const celdas = resultadosGramatica.tablaExportable[nt][t] || [];
                const contenido = celdas.length > 0 ? celdas.join("<br>") : "";
                htmlTbodyLL1 += `<td>${contenido}</td>`;
            });
            htmlTbodyLL1 += "</tr>";
        });
        tbodyLL1.innerHTML = htmlTbodyLL1;

        const resultadoParser = ejecutarParser(resultadosLexer.listaTokens, resultadosGramatica.tablaExportable, resultadosGramatica.terminales);
        
        trazaGlobal = resultadoParser.traza;
        btnDescargar.classList.add("btn-visible");

        divResultadoParser.classList.remove("parser-exito", "parser-error");

        if (resultadoParser.exito) {
            divResultadoParser.classList.add("parser-exito");
            divResultadoParser.innerHTML = "Análisis sintáctico exitoso";
        } else {
            divResultadoParser.classList.add("parser-error");
            divResultadoParser.innerHTML = resultadoParser.errores.join("<br>");
        }
    }
});

btnDescargar.addEventListener('click', () => {
    if (trazaGlobal.length > 0) {
        generarArchivoDescarga(trazaGlobal.join('\n'), 'traza_analisis.txt');
    }
});