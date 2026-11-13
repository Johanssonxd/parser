"use strict";

const EPSILON = "EPS";
const FIN = "$";
const EPSILON_PALABRAS = new Set(["null", "EPS", "eps"]);

class Gramatica {
  constructor() {
    this.reglas = new Map();
    this.simboloInicial = null;
  }

  agregarProduccion(noTerminal, produccion) {
    if (this.simboloInicial === null) this.simboloInicial = noTerminal;
    if (!this.reglas.has(noTerminal)) this.reglas.set(noTerminal, []);
    this.reglas.get(noTerminal).push(produccion);
  }

  estaVacia() {
    return this.reglas.size === 0;
  }

  esNoTerminal(s) {
    if (!s || s === EPSILON || s === FIN) return false;
    return this.reglas.has(s); // Eliminamos la expresión regular
  }
}

class CalculadorFirst {
  constructor(gramatica) {
    this.gramatica = gramatica;
    this.conjuntos = new Map();
  }

  calcular() {
    for (const nt of this.gramatica.reglas.keys())
      this.conjuntos.set(nt, new Set());

    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const [nt, prods] of this.gramatica.reglas) {
        const conj = this.conjuntos.get(nt);
        for (const prod of prods) {
          const antes = conj.size;
          this.agregarPrimeroDeSecuencia(prod, conj);
          if (conj.size !== antes) cambio = true;
        }
      }
    }
    return this.conjuntos;
  }

  agregarPrimeroDeSecuencia(secuencia, dest) {
    if (secuencia.length === 1 && secuencia[0] === EPSILON) {
      dest.add(EPSILON);
      return true;
    }

    let todoPuedeSerVacio = true;

    for (const s of secuencia) {
      if (s === EPSILON) continue;

      if (!this.gramatica.esNoTerminal(s)) {
        dest.add(s);
        todoPuedeSerVacio = false;
        break;
      }

      const primS = this.conjuntos.get(s) || new Set();
      for (const t of primS) if (t !== EPSILON) dest.add(t);

      if (!primS.has(EPSILON)) {
        todoPuedeSerVacio = false;
        break;
      }
    }

    if (todoPuedeSerVacio) dest.add(EPSILON);
    return todoPuedeSerVacio;
  }
}

class CalculadorFollow {
  constructor(gramatica, calcFirst) {
    this.gramatica = gramatica;
    this.calcFirst = calcFirst;
    this.conjuntos = new Map();
  }

  calcular() {
    for (const nt of this.gramatica.reglas.keys())
      this.conjuntos.set(nt, new Set());

    this.conjuntos.get(this.gramatica.simboloInicial).add(FIN);

    let cambio = true;
    while (cambio) {
      cambio = false;
      for (const [cabeza, prods] of this.gramatica.reglas) {
        for (const prod of prods) {
          for (let i = 0; i < prod.length; i++) {
            const B = prod[i];
            if (!this.gramatica.esNoTerminal(B) || B === EPSILON || !this.conjuntos.has(B))
              continue;

            const sigB  = this.conjuntos.get(B);
            const antes = sigB.size;
            const beta  = prod.slice(i + 1);

            if (beta.length === 0) {
              for (const x of this.conjuntos.get(cabeza)) sigB.add(x);
            } else {
              const primBeta  = new Set();
              const betaVacio = this.calcFirst.agregarPrimeroDeSecuencia(beta, primBeta);
              for (const t of primBeta) if (t !== EPSILON) sigB.add(t);
              if (betaVacio) for (const x of this.conjuntos.get(cabeza)) sigB.add(x);
            }

            if (sigB.size !== antes) cambio = true;
          }
        }
      }
    }
    return this.conjuntos;
  }
}

class TablaSintactica {
  constructor(gramatica, calcFirst, primero, siguiente) {
    this.gramatica = gramatica;
    this.calcFirst = calcFirst;
    this.primero = primero;
    this.siguiente = siguiente;
    this.tabla = new Map();
    this.terminales = [];
  }

  construir() {
    this._recolectarTerminales();
    this._llenarTabla();
    return { tabla: this.tabla, terminales: this.terminales };
  }

  _recolectarTerminales() {
    const vistos = new Set();
    for (const prods of this.gramatica.reglas.values())
      for (const prod of prods)
        for (const s of prod)
          if (!this.gramatica.esNoTerminal(s) && s !== EPSILON)
            vistos.add(s);
    if (!vistos.has(FIN)) vistos.add(FIN);
    this.terminales = [...vistos];
  }

  _llenarTabla() {
    for (const nt of this.gramatica.reglas.keys())
      this.tabla.set(nt, new Map());

    for (const [A, prods] of this.gramatica.reglas) {
      for (const prod of prods) {
        const primAlpha  = new Set();
        const tieneEpsilon = this.calcFirst.agregarPrimeroDeSecuencia(prod, primAlpha);

        for (const a of primAlpha) {
          if (a !== EPSILON) this._agregarCelda(A, a, prod);
        }

        if (tieneEpsilon) {
          for (const b of (this.siguiente.get(A) || []))
            this._agregarCelda(A, b, prod);
        }
      }
    }
  }

  _agregarCelda(nt, terminal, prod) {
    const entrada = `${nt} -> ${prod.join(" ")}`;
    const fila = this.tabla.get(nt);
    if (!fila.has(terminal)) fila.set(terminal, []);
    fila.get(terminal).push(entrada);
  }

  exportarTablaEstructurada() {
    const tablaObjeto = {};
    for (const [nt, fila] of this.tabla.entries()) {
      tablaObjeto[nt] = {};
      for (const [terminal, celdas] of fila.entries()) {
        tablaObjeto[nt][terminal] = celdas;
      }
    }
    return tablaObjeto;
  }
}

class Parser {
  static parsear(texto) {
    const gramatica = new Gramatica();
    const lineas = texto.split("\n").map(l => l.trim()).filter(Boolean);

    for (const linea of lineas) {
      if (!linea.includes("->")) continue;
      const idx = linea.indexOf("->");
      const nt  = linea.slice(0, idx).trim();
      const rhs = linea.slice(idx + 2);

      for (const alt of rhs.split("|")) {
        const tokens = alt.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) continue;
        const prod = tokens.map(t => EPSILON_PALABRAS.has(t) ? EPSILON : t);
        gramatica.agregarProduccion(nt, prod);
      }
    }
    return gramatica;
  }
}

function calcularGramaticaEstructurada(textoGramatica) {
  const gramatica = Parser.parsear(textoGramatica);
  if (gramatica.estaVacia()) return null;

  const calcFirst = new CalculadorFirst(gramatica);
  const primero   = calcFirst.calcular();

  const calcFollow = new CalculadorFollow(gramatica, calcFirst);
  const siguiente  = calcFollow.calcular();

  const ts = new TablaSintactica(gramatica, calcFirst, primero, siguiente);
  const { terminales } = ts.construir();
  const tablaExportable = ts.exportarTablaEstructurada();

  return { terminales, tablaExportable, noTerminales: [...gramatica.reglas.keys()] };
}