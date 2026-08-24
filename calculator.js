// DOM Elements
const inputElement = document.getElementById("input");
const displayElement = document.getElementById("main-display");
const screenElement = document.querySelector(".screen");
const indShift = document.getElementById("ind-shift");
const indAlpha = document.getElementById("ind-alpha");
const indHyp = document.getElementById("ind-hyp");
const indSto = document.getElementById("ind-sto");
const indM = document.getElementById("ind-m");
const indMode = document.getElementById("ind-mode");
const indDeg = document.getElementById("ind-deg");
const indFixSci = document.getElementById("ind-fixsci");

// Calculator State
let shiftActive = false;
let alphaActive = false;
let hypActive = false;
let stoActive = false;
let rclActive = false;
let calculatorOn = true;
let calcMode = "COMP"; // COMP, SD, REG_LIN, REG_LOG, REG_EXP
let degMode = "DEG"; // DEG, RAD, GRA
let fixDigits = null; // null or 0-9
let sciDigits = null; // null or 0-9
let modeMenuState = 0; // 0: Normal, 1: Mode P1, 2: Mode P2 (Deg), 3: Mode P3 (Fix/Sci), 13: Reg menu P1, 14: Reg menu P2 (Pwr/Inv/Quad), 31: Fix prompt, 32: Sci prompt, 33: Norm prompt, 99: CLR menu, 101: S-SUM menu, 102: S-VAR P1, 103: S-VAR P2, 104: S-VAR P3 (a,b,r), 105: S-VAR SD P2 (Med, minX, maxX), 106: S-SUM REG P2 (∑y², ∑y, ∑xy), 107: S-VAR REG P4 (x̂, ŷ), 108: DRG▸ unit menu
let lastAns = 0;
let isErrorState = false;
let normMode = 1; // Norm1: sci below 1e-2, Norm2: sci below 1e-9 (like the fx-82MS)
let justEvaluated = false; // display currently shows a finished result for lastAns
let fracShown = false; // that result is currently displayed as a fraction
let drgValue = 0; // value captured when the DRG▸ menu was opened

// Statistics Store
let statData = []; // Single-variable statistics data array
let regData = []; // Pairs {x, y} for regression

// Variables Memory Store (A, B, C, D, E, F, X, Y, M)
const variables = {
  A: 0,
  B: 0,
  C: 0,
  D: 0,
  E: 0,
  F: 0,
  X: 0,
  Y: 0,
  M: 0
};

// Calculation History (Replay)
const history = [];
let historyIndex = -1;

// Helper to reliably extract key character regardless of CSS pseudo-elements
function getKeyChar(btn) {
  const keyAttr = btn.getAttribute("data-key");
  if (keyAttr && !isNaN(parseInt(keyAttr, 10))) {
    const code = parseInt(keyAttr, 10);
    if (code >= 48 && code <= 57) {
      return String.fromCharCode(code);
    }
  }
  const rawText = btn.innerText.trim();
  const match = rawText.match(/[0-9]$/);
  if (match) return match[0];
  return rawText;
}

// Update mode/state indicators on screen
function updateIndicators() {
  if (indShift) indShift.innerText = shiftActive && calculatorOn ? "S" : "";
  if (indAlpha) indAlpha.innerText = alphaActive && calculatorOn ? "A" : "";
  if (indHyp) indHyp.innerText = hypActive && calculatorOn ? "HYP" : "";
  if (indSto) indSto.innerText = stoActive && calculatorOn ? "STO" : "";
  if (indM) indM.innerText = variables.M !== 0 && calculatorOn ? "M" : "";
  if (indDeg) indDeg.innerText = calculatorOn ? degMode : "";
  if (indMode) {
    if (!calculatorOn || calcMode === "COMP") indMode.innerText = "";
    else if (calcMode === "SD") indMode.innerText = "SD";
    else if (calcMode.startsWith("REG")) indMode.innerText = "REG";
  }
  if (indFixSci) {
    if (!calculatorOn) indFixSci.innerText = "";
    else if (fixDigits !== null) indFixSci.innerText = "FIX";
    else if (sciDigits !== null) indFixSci.innerText = "SCI";
    else indFixSci.innerText = "";
  }
}

// Power Management
function turnOn() {
  calculatorOn = true;
  if (screenElement) screenElement.classList.remove("off");
  displayElement.innerText = "CASIO";
  setTimeout(() => {
    clearDisplay();
  }, 450);
}

function turnOff() {
  calculatorOn = false;
  inputElement.innerText = "";
  displayElement.innerText = "";
  if (screenElement) screenElement.classList.add("off");
  shiftActive = false;
  alphaActive = false;
  hypActive = false;
  stoActive = false;
  rclActive = false;
  modeMenuState = 0;
  updateIndicators();
}

// Clear display & reset transient states
function clearDisplay() {
  if (!calculatorOn) return;
  inputElement.innerText = "";
  displayElement.innerText = "0";
  isErrorState = false;
  justEvaluated = false;
  fracShown = false;
  shiftActive = false;
  alphaActive = false;
  hypActive = false;
  stoActive = false;
  rclActive = false;
  modeMenuState = 0;
  updateIndicators();
}

// Delete last character or complete function token
function deleteLastChar() {
  if (!calculatorOn) return;
  justEvaluated = false;
  let text = inputElement.innerText;
  if (!text) return;

  const multiCharTokens = [
    "sin⁻¹(", "cos⁻¹(", "tan⁻¹(", "sinh⁻¹(", "cosh⁻¹(", "tanh⁻¹(",
    "sinh(", "cosh(", "tanh(", "10^(", "e^(", "Pol(", "Rec(",
    "sin(", "cos(", "tan(", "log(", "ln(", "√(", "∛(", "(-)", "Ans", "Ran#", "ˣ√"
  ];

  for (const token of multiCharTokens) {
    if (text.endsWith(token)) {
      inputElement.innerText = text.slice(0, text.length - token.length);
      return;
    }
  }

  inputElement.innerText = text.slice(0, -1);
}

// Tokens that continue from a finished result. Pressing one of these right
// after "=" turns the entry into "Ans <token>"; pressing anything else starts
// a fresh calculation, as on the original.
const ANS_CONTINUATIONS = [
  "+", "-", "×", "÷", "^", "ˣ√", "C", "P", "⁻¹", "^2", "^3", "!", "°", "%", ",", ";"
];

// Append token to input
function appendInput(str) {
  if (!calculatorOn) return;
  if (justEvaluated) {
    inputElement.innerText = ANS_CONTINUATIONS.includes(str) ? "Ans" : "";
    fracShown = false;
  }
  justEvaluated = false;
  inputElement.innerText += str;
}

// A key that isn't a valid choice for the current page closes the menu and is
// then handled as ordinary input, so no page can trap the keyboard.
function cancelMenu() {
  exitMenu();
  return false;
}

// Menu Selection Handler. Returns true when the key was consumed as a menu
// choice, false when the caller should go on to handle it as normal input.
function handleMenuChoice(keyStr) {
  if (modeMenuState === 1) {
    if (keyStr === "1") calcMode = "COMP";
    else if (keyStr === "2") calcMode = "SD";
    else if (keyStr === "3") {
      modeMenuState = 13;
      inputElement.innerText = "1:Lin 2:Log 3:Exp";
      displayElement.innerText = "";
      return true;
    } else return cancelMenu();
    exitMenu();
    return true;
  }

  if (modeMenuState === 13) {
    if (keyStr === "1") calcMode = "REG_LIN";
    else if (keyStr === "2") calcMode = "REG_LOG";
    else if (keyStr === "3") calcMode = "REG_EXP";
    else return cancelMenu();
    exitMenu();
    return true;
  }

  if (modeMenuState === 14) {
    if (keyStr === "1") calcMode = "REG_PWR";
    else if (keyStr === "2") calcMode = "REG_INV";
    else if (keyStr === "3") calcMode = "REG_QUAD";
    else return cancelMenu();
    exitMenu();
    return true;
  }

  if (modeMenuState === 2) {
    if (keyStr === "1") degMode = "DEG";
    else if (keyStr === "2") degMode = "RAD";
    else if (keyStr === "3") degMode = "GRA";
    else return cancelMenu();
    exitMenu();
    return true;
  }

  if (modeMenuState === 3) {
    if (keyStr === "1") {
      modeMenuState = 31;
      inputElement.innerText = "FIX 0~9?";
      displayElement.innerText = "";
    } else if (keyStr === "2") {
      modeMenuState = 32;
      inputElement.innerText = "SCI 0~9?";
      displayElement.innerText = "";
    } else if (keyStr === "3") {
      modeMenuState = 33;
      inputElement.innerText = "NORM 1~2?";
      displayElement.innerText = "";
    } else return cancelMenu();
    return true;
  }

  if (modeMenuState === 31) {
    const n = parseInt(keyStr, 10);
    if (isNaN(n) || n < 0 || n > 9) return cancelMenu();
    fixDigits = n;
    sciDigits = null;
    exitMenu();
    return true;
  }

  if (modeMenuState === 32) {
    const n = parseInt(keyStr, 10);
    if (isNaN(n) || n < 0 || n > 9) return cancelMenu();
    sciDigits = n;
    fixDigits = null;
    exitMenu();
    return true;
  }

  if (modeMenuState === 33) {
    if (keyStr !== "1" && keyStr !== "2") return cancelMenu();
    normMode = parseInt(keyStr, 10);
    fixDigits = null;
    sciDigits = null;
    exitMenu();
    return true;
  }

  if (modeMenuState === 99) {
    if (keyStr === "1") {
      statData = [];
      regData = [];
      exitMenu("Stat Clear");
    } else if (keyStr === "2") {
      calcMode = "COMP";
      degMode = "DEG";
      fixDigits = null;
      sciDigits = null;
      normMode = 1;
      exitMenu("Mode Clear");
    } else if (keyStr === "3") {
      resetAll();
      exitMenu("Reset All");
    } else return cancelMenu();
    return true;
  }

  if (modeMenuState === 101) {
    exitMenu();
    if (keyStr === "1") computeSumX2();
    else if (keyStr === "2") computeSumX();
    else if (keyStr === "3") computeN();
    else return false;
    return true;
  }

  if (modeMenuState === 102) {
    exitMenu();
    if (keyStr === "1") computeMeanX();
    else if (keyStr === "2") computeSigmaXn();
    else if (keyStr === "3") computeSigmaXn1();
    else return false;
    return true;
  }

  if (modeMenuState === 103) {
    exitMenu();
    if (keyStr === "1") computeMeanY();
    else if (keyStr === "2") computeSigmaYn();
    else if (keyStr === "3") computeSigmaYn1();
    else return false;
    return true;
  }

  if (modeMenuState === 104) {
    exitMenu();
    if (keyStr === "1") computeRegA();
    else if (keyStr === "2") computeRegB();
    else if (keyStr === "3") computeRegR();
    else return false;
    return true;
  }

  if (modeMenuState === 105) {
    exitMenu();
    if (keyStr === "1") computeMedianX();
    else if (keyStr === "2") computeMinX();
    else if (keyStr === "3") computeMaxX();
    else return false;
    return true;
  }

  if (modeMenuState === 106) {
    exitMenu();
    if (keyStr === "1") computeSumY2();
    else if (keyStr === "2") computeSumY();
    else if (keyStr === "3") computeSumXY();
    else return false;
    return true;
  }

  if (modeMenuState === 108) {
    exitMenu();
    let deg = null;
    if (keyStr === "1") deg = drgValue;
    else if (keyStr === "2") deg = (drgValue * 180) / Math.PI;
    else if (keyStr === "3") deg = drgValue * 0.9;
    else return false;
    if (deg !== null) {
      const out = degMode === "DEG" ? deg : degMode === "RAD" ? (deg * Math.PI) / 180 : deg / 0.9;
      lastAns = out;
      displayElement.innerText = formatResult(out);
      justEvaluated = true;
    }
    return true;
  }

  if (modeMenuState === 107) {
    exitMenu();
    if (calcMode === "REG_QUAD") {
      if (keyStr === "1") computeEstX();
      else if (keyStr === "2") computeEstX2();
      else if (keyStr === "3") computeEstY();
      else return false;
    } else {
      if (keyStr === "1") computeEstX();
      else if (keyStr === "2") computeEstY();
      else return false;
    }
    return true;
  }

  return false;
}

function exitMenu(msg) {
  modeMenuState = 0;
  inputElement.innerText = "";
  displayElement.innerText = msg !== undefined ? msg : "0";
  justEvaluated = false; // the previous result is no longer on screen
  fracShown = false;
  updateIndicators();
}

function resetAll() {
  calcMode = "COMP";
  degMode = "DEG";
  fixDigits = null;
  sciDigits = null;
  normMode = 1;
  statData = [];
  regData = [];
  lastAns = 0;
  for (let k in variables) variables[k] = 0;
  history.length = 0;
  historyIndex = -1;
}

// Variable Memory Handlers
function handleVar(varName) {
  if (!calculatorOn) return;

  if (stoActive) {
    let valToStore = lastAns;
    const rawInput = inputElement.innerText.trim();
    if (rawInput) {
      const res = evaluateExpression(rawInput);
      if (res !== "Syntax ERROR" && res !== "Math ERROR") {
        valToStore = parseFloat(res);
      }
    }
    variables[varName] = valToStore;
    stoActive = false;
    shiftActive = false;
    alphaActive = false;
    inputElement.innerText = "";
    displayElement.innerText = `${varName} = ${formatResult(valToStore)}`;
    updateIndicators();
    return;
  }

  if (rclActive) {
    appendInput(varName);
    rclActive = false;
    shiftActive = false;
    alphaActive = false;
    updateIndicators();
    return;
  }

  appendInput(varName);
}

// Memory M+ / M- / Stat Data Input Handler
function executeMemory(op) {
  if (!calculatorOn) return;

  // Stat Mode Data Entry — supports "value;freq" like the original's x;n DT entry
  if (calcMode === "SD") {
    let rawInput = inputElement.innerText.trim();
    let val = lastAns;
    let freq = 1;
    if (rawInput.includes(";")) {
      const fParts = rawInput.split(";");
      rawInput = fParts[0].trim();
      const resF = evaluateExpression(fParts[1]);
      freq = Math.round(parseFloat(resF));
      if (resF === "Syntax ERROR" || resF === "Math ERROR" || !(freq >= 1)) {
        displayElement.innerText = "Syntax ERROR";
        isErrorState = true;
        return;
      }
    }
    if (rawInput) {
      const res = evaluateExpression(rawInput);
      if (res === "Syntax ERROR" || res === "Math ERROR") {
        displayElement.innerText = res;
        isErrorState = true;
        return;
      }
      val = parseFloat(res);
    }
    for (let i = 0; i < freq; i++) statData.push(val);
    inputElement.innerText = "";
    displayElement.innerText = `n= ${statData.length}`;
    shiftActive = false;
    alphaActive = false;
    updateIndicators();
    return;
  }

  if (calcMode.startsWith("REG")) {
    let rawInput = inputElement.innerText.trim();
    let xVal = 0, yVal = 0;
    let freq = 1;
    if (rawInput.includes(";")) {
      const fParts = rawInput.split(";");
      rawInput = fParts[0].trim();
      const resF = evaluateExpression(fParts[1]);
      freq = Math.round(parseFloat(resF));
      if (resF === "Syntax ERROR" || resF === "Math ERROR" || !(freq >= 1)) {
        displayElement.innerText = "Syntax ERROR";
        isErrorState = true;
        return;
      }
    }
    if (rawInput.includes(",")) {
      const parts = rawInput.split(",");
      const resX = evaluateExpression(parts[0]);
      const resY = evaluateExpression(parts[1]);
      if (resX === "Syntax ERROR" || resY === "Syntax ERROR" || resX === "Math ERROR" || resY === "Math ERROR") {
        displayElement.innerText = "Syntax ERROR";
        isErrorState = true;
        return;
      }
      xVal = parseFloat(resX);
      yVal = parseFloat(resY);
    } else {
      xVal = lastAns;
      yVal = parseFloat(evaluateExpression(rawInput)) || 0;
    }
    for (let i = 0; i < freq; i++) regData.push({ x: xVal, y: yVal });
    inputElement.innerText = "";
    displayElement.innerText = `n= ${regData.length}`;
    shiftActive = false;
    alphaActive = false;
    updateIndicators();
    return;
  }

  // Normal Memory Store
  const rawInput = inputElement.innerText.trim();
  let val = lastAns;

  if (rawInput) {
    const res = evaluateExpression(rawInput);
    if (res === "Syntax ERROR" || res === "Math ERROR") {
      displayElement.innerText = res;
      isErrorState = true;
      return;
    }
    val = parseFloat(res);
  }

  if (op === "M+") {
    variables.M += val;
  } else if (op === "M-") {
    variables.M -= val;
  }

  lastAns = val;
  displayElement.innerText = formatResult(val);
  inputElement.innerText = "";
  shiftActive = false;
  alphaActive = false;
  updateIndicators();
}

// Statistics Computations
function getStatList() {
  if (calcMode === "SD") return statData;
  if (calcMode.startsWith("REG")) return regData.map(d => d.x);
  return [];
}

function computeSumX2() {
  const list = getStatList();
  if (list.length === 0) { displayElement.innerText = "0"; return; }
  const sum2 = list.reduce((acc, v) => acc + v * v, 0);
  lastAns = sum2;
  displayElement.innerText = formatResult(sum2);
}

function computeSumX() {
  const list = getStatList();
  if (list.length === 0) { displayElement.innerText = "0"; return; }
  const sum = list.reduce((acc, v) => acc + v, 0);
  lastAns = sum;
  displayElement.innerText = formatResult(sum);
}

function computeN() {
  const n = calcMode === "SD" ? statData.length : regData.length;
  lastAns = n;
  displayElement.innerText = formatResult(n);
}

function computeMeanX() {
  const list = getStatList();
  if (list.length === 0) { displayElement.innerText = "0"; return; }
  const mean = list.reduce((acc, v) => acc + v, 0) / list.length;
  lastAns = mean;
  displayElement.innerText = formatResult(mean);
}

function computeMedianX() {
  const list = getStatList();
  if (list.length === 0) { displayElement.innerText = "0"; return; }
  const sorted = [...list].sort((a, b) => a - b);
  const len = sorted.length;
  let median = 0;
  if (len % 2 === 1) {
    median = sorted[Math.floor(len / 2)];
  } else {
    median = (sorted[len / 2 - 1] + sorted[len / 2]) / 2;
  }
  lastAns = median;
  displayElement.innerText = formatResult(median);
}

function computeMinX() {
  const list = getStatList();
  if (list.length === 0) { displayElement.innerText = "0"; return; }
  const minVal = Math.min(...list);
  lastAns = minVal;
  displayElement.innerText = formatResult(minVal);
}

function computeMaxX() {
  const list = getStatList();
  if (list.length === 0) { displayElement.innerText = "0"; return; }
  const maxVal = Math.max(...list);
  lastAns = maxVal;
  displayElement.innerText = formatResult(maxVal);
}

function computeSigmaXn() {
  const list = getStatList();
  if (list.length === 0) { displayElement.innerText = "0"; return; }
  const mean = list.reduce((acc, v) => acc + v, 0) / list.length;
  const variance = list.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / list.length;
  const std = Math.sqrt(variance);
  lastAns = std;
  displayElement.innerText = formatResult(std);
}

function computeSigmaXn1() {
  const list = getStatList();
  if (list.length < 2) { displayElement.innerText = "Math ERROR"; isErrorState = true; return; }
  const mean = list.reduce((acc, v) => acc + v, 0) / list.length;
  const variance = list.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (list.length - 1);
  const std = Math.sqrt(variance);
  lastAns = std;
  displayElement.innerText = formatResult(std);
}

function computeMeanY() {
  if (regData.length === 0) { displayElement.innerText = "0"; return; }
  const mean = regData.reduce((acc, d) => acc + d.y, 0) / regData.length;
  lastAns = mean;
  displayElement.innerText = formatResult(mean);
}

function computeSigmaYn() {
  if (regData.length === 0) { displayElement.innerText = "0"; return; }
  const mean = regData.reduce((acc, d) => acc + d.y, 0) / regData.length;
  const variance = regData.reduce((acc, d) => acc + Math.pow(d.y - mean, 2), 0) / regData.length;
  const std = Math.sqrt(variance);
  lastAns = std;
  displayElement.innerText = formatResult(std);
}

function computeSigmaYn1() {
  if (regData.length < 2) { displayElement.innerText = "Math ERROR"; isErrorState = true; return; }
  const mean = regData.reduce((acc, d) => acc + d.y, 0) / regData.length;
  const variance = regData.reduce((acc, d) => acc + Math.pow(d.y - mean, 2), 0) / (regData.length - 1);
  const std = Math.sqrt(variance);
  lastAns = std;
  displayElement.innerText = formatResult(std);
}

function computeSumY2() {
  if (regData.length === 0) { displayElement.innerText = "0"; return; }
  const sum = regData.reduce((a, d) => a + d.y * d.y, 0);
  lastAns = sum;
  displayElement.innerText = formatResult(sum);
}

function computeSumY() {
  if (regData.length === 0) { displayElement.innerText = "0"; return; }
  const sum = regData.reduce((a, d) => a + d.y, 0);
  lastAns = sum;
  displayElement.innerText = formatResult(sum);
}

function computeSumXY() {
  if (regData.length === 0) { displayElement.innerText = "0"; return; }
  const sum = regData.reduce((a, d) => a + d.x * d.y, 0);
  lastAns = sum;
  displayElement.innerText = formatResult(sum);
}

// Least-squares fit for the current regression model.
// Lin: y = a + b·x | Log: y = a + b·ln(x), needs x > 0 | Exp: y = a·e^(b·x), needs y > 0
// Pwr: y = a·x^b, needs x,y > 0 | Inv: y = a + b/x, needs x ≠ 0
// Non-linear models are fitted linearly on transformed data. Returns {a, b, r} or null.
function regFit() {
  if (regData.length < 2) return null;

  let pairs;
  if (calcMode === "REG_LOG") {
    if (regData.some(d => d.x <= 0)) return null;
    pairs = regData.map(d => ({ x: Math.log(d.x), y: d.y }));
  } else if (calcMode === "REG_EXP") {
    if (regData.some(d => d.y <= 0)) return null;
    pairs = regData.map(d => ({ x: d.x, y: Math.log(d.y) }));
  } else if (calcMode === "REG_PWR") {
    if (regData.some(d => d.x <= 0 || d.y <= 0)) return null;
    pairs = regData.map(d => ({ x: Math.log(d.x), y: Math.log(d.y) }));
  } else if (calcMode === "REG_INV") {
    if (regData.some(d => d.x === 0)) return null;
    pairs = regData.map(d => ({ x: 1 / d.x, y: d.y }));
  } else {
    pairs = regData;
  }

  const n = pairs.length;
  const sumX = pairs.reduce((a, d) => a + d.x, 0);
  const sumY = pairs.reduce((a, d) => a + d.y, 0);
  const sumX2 = pairs.reduce((a, d) => a + d.x * d.x, 0);
  const sumY2 = pairs.reduce((a, d) => a + d.y * d.y, 0);
  const sumXY = pairs.reduce((a, d) => a + d.x * d.y, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;

  const b = (n * sumXY - sumX * sumY) / denom;
  let a = (sumY - b * sumX) / n;
  if (calcMode === "REG_EXP" || calcMode === "REG_PWR") a = Math.exp(a);

  const rDen = Math.sqrt(denom * (n * sumY2 - sumY * sumY));
  const r = rDen === 0 ? null : (n * sumXY - sumX * sumY) / rDen;

  return { a, b, r };
}

function showStatResult(val) {
  if (val === null || isNaN(val) || !isFinite(val)) {
    displayElement.innerText = "Math ERROR";
    isErrorState = true;
    return;
  }
  lastAns = val;
  displayElement.innerText = formatResult(val);
}

// Quad: y = a + b·x + c·x², solved via 3x3 normal equations (Cramer's rule). Needs n >= 3.
function quadFit() {
  const n = regData.length;
  if (n < 3) return null;
  const S1 = regData.reduce((a, d) => a + d.x, 0);
  const S2 = regData.reduce((a, d) => a + d.x * d.x, 0);
  const S3 = regData.reduce((a, d) => a + d.x * d.x * d.x, 0);
  const S4 = regData.reduce((a, d) => a + d.x * d.x * d.x * d.x, 0);
  const Sy = regData.reduce((a, d) => a + d.y, 0);
  const Sxy = regData.reduce((a, d) => a + d.x * d.y, 0);
  const Sx2y = regData.reduce((a, d) => a + d.x * d.x * d.y, 0);

  const det3 = (m) =>
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

  const D = det3([[n, S1, S2], [S1, S2, S3], [S2, S3, S4]]);
  if (D === 0) return null;
  const a = det3([[Sy, S1, S2], [Sxy, S2, S3], [Sx2y, S3, S4]]) / D;
  const b = det3([[n, Sy, S2], [S1, Sxy, S3], [S2, Sx2y, S4]]) / D;
  const c = det3([[n, S1, Sy], [S1, S2, Sxy], [S2, S3, Sx2y]]) / D;
  return { a, b, c };
}

function computeRegA() {
  if (calcMode === "REG_QUAD") { const f = quadFit(); showStatResult(f ? f.a : null); return; }
  const fit = regFit();
  showStatResult(fit ? fit.a : null);
}

function computeRegB() {
  if (calcMode === "REG_QUAD") { const f = quadFit(); showStatResult(f ? f.b : null); return; }
  const fit = regFit();
  showStatResult(fit ? fit.b : null);
}

function computeRegR() {
  if (calcMode === "REG_QUAD") { const f = quadFit(); showStatResult(f ? f.c : null); return; }
  const fit = regFit();
  showStatResult(fit ? fit.r : null);
}

// Estimation: uses Ans as the known value (type the value, press =, then pick x̂ or ŷ)
function computeEstY() {
  const x = lastAns;
  if (calcMode === "REG_QUAD") {
    const f = quadFit();
    showStatResult(f ? f.a + f.b * x + f.c * x * x : null);
    return;
  }
  const fit = regFit();
  if (!fit) { showStatResult(null); return; }
  let y;
  if (calcMode === "REG_LOG") y = x > 0 ? fit.a + fit.b * Math.log(x) : NaN;
  else if (calcMode === "REG_EXP") y = fit.a * Math.exp(fit.b * x);
  else if (calcMode === "REG_PWR") y = x > 0 ? fit.a * Math.pow(x, fit.b) : NaN;
  else if (calcMode === "REG_INV") y = x !== 0 ? fit.a + fit.b / x : NaN;
  else y = fit.a + fit.b * x;
  showStatResult(y);
}

// Quad estimation solves c·x² + b·x + (a − y) = 0; sign picks x̂1 (+) or x̂2 (−)
function quadEstX(sign) {
  const f = quadFit();
  if (!f) { showStatResult(null); return; }
  const y = lastAns;
  if (f.c === 0) {
    showStatResult(f.b !== 0 ? (y - f.a) / f.b : null);
    return;
  }
  const disc = f.b * f.b - 4 * f.c * (f.a - y);
  if (disc < 0) { showStatResult(null); return; }
  showStatResult((-f.b + sign * Math.sqrt(disc)) / (2 * f.c));
}

function computeEstX() {
  if (calcMode === "REG_QUAD") { quadEstX(1); return; }
  const fit = regFit();
  if (!fit || fit.b === 0) { showStatResult(null); return; }
  const y = lastAns;
  let x;
  if (calcMode === "REG_LOG") x = Math.exp((y - fit.a) / fit.b);
  else if (calcMode === "REG_EXP") x = y / fit.a > 0 ? Math.log(y / fit.a) / fit.b : NaN;
  else if (calcMode === "REG_PWR") x = y / fit.a > 0 ? Math.pow(y / fit.a, 1 / fit.b) : NaN;
  else if (calcMode === "REG_INV") x = y !== fit.a ? fit.b / (y - fit.a) : NaN;
  else x = (y - fit.a) / fit.b;
  showStatResult(x);
}

function computeEstX2() {
  quadEstX(-1);
}

// Main button click dispatcher
function handleButtonClick(btn) {
  const btnId = btn.id;
  const func = btn.getAttribute("data-func");
  const keyAttr = btn.getAttribute("data-key");
  const rawText = btn.innerText.trim();
  const keyChar = getKeyChar(btn);

  // If calculator is off, only ON / AC turns it on
  if (!calculatorOn) {
    if (btnId === "btn-on" || btn.classList.contains("on") || rawText === "AC") {
      turnOn();
    }
    return;
  }

  // Navigation / Replay keys
  if (btn.classList.contains("nav")) {
    if (btn.classList.contains("up") || rawText === "▲") {
      if (history.length > 0) {
        if (historyIndex < history.length - 1) historyIndex++;
        inputElement.innerText = history[history.length - 1 - historyIndex];
        justEvaluated = false; // the recalled entry is now editable
      }
    } else if (btn.classList.contains("down") || rawText === "▼") {
      if (historyIndex > 0) {
        historyIndex--;
        inputElement.innerText = history[history.length - 1 - historyIndex];
        justEvaluated = false;
      } else if (historyIndex === 0) {
        historyIndex = -1;
        inputElement.innerText = "";
        justEvaluated = false;
      }
    } else if (btn.classList.contains("left") || rawText === "◀︎" || rawText === "◀") {
      if (isErrorState) {
        isErrorState = false;
        displayElement.innerText = "0";
      } else {
        inputElement.scrollLeft -= 30;
      }
    } else if (btn.classList.contains("right") || rawText === "▶︎" || rawText === "▶") {
      if (isErrorState) {
        isErrorState = false;
        displayElement.innerText = "0";
      } else if (modeMenuState === 13) {
        modeMenuState = 14;
        inputElement.innerText = "1:Pwr 2:Inv 3:Quad";
      } else if (modeMenuState === 101 && calcMode.startsWith("REG")) {
        modeMenuState = 106;
        inputElement.innerText = "1:∑y² 2:∑y 3:∑xy";
      } else if (modeMenuState === 102) {
        if (calcMode === "SD") {
          modeMenuState = 105;
          inputElement.innerText = "1:Med 2:minX 3:maxX";
        } else if (calcMode.startsWith("REG")) {
          modeMenuState = 103;
          inputElement.innerText = "1:ȳ 2:σy 3:sy";
        }
      } else if (modeMenuState === 103 && calcMode.startsWith("REG")) {
        modeMenuState = 104;
        inputElement.innerText = "1:a 2:b 3:r";
      } else if (modeMenuState === 104 && calcMode.startsWith("REG")) {
        modeMenuState = 107;
        inputElement.innerText = "1:x̂ 2:ŷ";
      } else {
        inputElement.scrollLeft += 30;
      }
      // Quad regression pages use c instead of r, and two x-roots for estimation
      if (calcMode === "REG_QUAD") {
        if (modeMenuState === 104) inputElement.innerText = "1:a 2:b 3:c";
        else if (modeMenuState === 107) inputElement.innerText = "1:x̂1 2:x̂2 3:ŷ";
      }
    }
    return;
  }

  // Modifiers
  if (btnId === "btn-shift" || btn.classList.contains("shift")) {
    shiftActive = !shiftActive;
    if (shiftActive) alphaActive = false;
    updateIndicators();
    return;
  }

  if (btnId === "btn-alpha" || btn.classList.contains("alpha")) {
    alphaActive = !alphaActive;
    if (alphaActive) shiftActive = false;
    updateIndicators();
    return;
  }

  if (btnId === "btn-mode" || btn.classList.contains("mode")) {
    if (shiftActive) {
      // CLR Menu: Shift + Mode
      modeMenuState = 99;
      inputElement.innerText = "1:Scl 2:Mode 3:All";
      displayElement.innerText = "";
      shiftActive = false;
      updateIndicators();
      return;
    }

    // Normal Mode Menu Navigation
    if (modeMenuState === 0 || modeMenuState === 3 || modeMenuState === 33) {
      modeMenuState = 1;
      inputElement.innerText = "1:COMP 2:SD 3:REG";
      displayElement.innerText = "";
    } else if (modeMenuState === 1 || modeMenuState === 13) {
      modeMenuState = 2;
      inputElement.innerText = "1:DEG 2:RAD 3:GRA";
      displayElement.innerText = "";
    } else if (modeMenuState === 2) {
      modeMenuState = 3;
      inputElement.innerText = "1:FIX 2:SCI 3:NORM";
      displayElement.innerText = "";
    }
    updateIndicators();
    return;
  }

  if (btnId === "btn-on" || btn.classList.contains("on")) {
    turnOn();
    return;
  }

  // Control Keys (AC, DEL, =)
  if (keyAttr === "27" || rawText === "AC") {
    if (shiftActive) {
      turnOff();
    } else {
      clearDisplay();
    }
    return;
  }

  if (keyAttr === "8" || rawText === "DEL") {
    if (isErrorState) {
      isErrorState = false;
      displayElement.innerText = "0";
    }
    deleteLastChar();
    shiftActive = false;
    alphaActive = false;
    updateIndicators();
    return;
  }

  // Shift + 1 (S-SUM) or Shift + 2 (S-VAR)
  if (shiftActive && keyChar === "1") {
    modeMenuState = 101;
    inputElement.innerText = "1:∑x² 2:∑x 3:n";
    displayElement.innerText = "";
    shiftActive = false;
    updateIndicators();
    return;
  }

  // Shift + 0 (Rnd): round Ans to the currently displayed precision
  if (shiftActive && keyChar === "0" && modeMenuState === 0) {
    lastAns = parseFloat(formatResult(lastAns));
    displayElement.innerText = formatResult(lastAns);
    justEvaluated = true;
    fracShown = false;
    shiftActive = false;
    updateIndicators();
    return;
  }

  if (shiftActive && keyChar === "2") {
    modeMenuState = 102;
    inputElement.innerText = "1:x̄ 2:σx 3:sx";
    displayElement.innerText = "";
    shiftActive = false;
    updateIndicators();
    return;
  }

  // If inside an active Menu:
  if (modeMenuState !== 0) {
    if (handleMenuChoice(keyChar)) {
      shiftActive = false;
      alphaActive = false;
      updateIndicators();
      return;
    }
  }

  if (keyAttr === "13" || rawText === "=") {
    if (shiftActive) {
      appendInput("%");
      operate();
    } else {
      operate();
    }
    shiftActive = false;
    alphaActive = false;
    updateIndicators();
    return;
  }

  // If calculator is currently displaying an Error state, clear error display and input before starting new input
  if (isErrorState) {
    isErrorState = false;
    displayElement.innerText = "0";
    inputElement.innerText = "";
  }

  // Function Keys & Special Buttons
  if (func) {
    handleFuncKey(func);
    shiftActive = false;
    alphaActive = false;
    updateIndicators();
    return;
  }

  // Basic Keys / Numbers / Operators
  if (rawText === "x") {
    appendInput("×");
  } else if (rawText === "÷") {
    appendInput("÷");
  } else if (rawText === "+") {
    appendInput("+");
  } else if (rawText === "-") {
    appendInput("-");
  } else if (rawText === ".") {
    if (shiftActive) appendInput("Ran#");
    else appendInput(".");
  } else if (!isNaN(keyChar)) {
    appendInput(keyChar);
  } else {
    appendInput(rawText);
  }

  shiftActive = false;
  alphaActive = false;
  updateIndicators();
}

// Function key mapping logic
function handleFuncKey(func) {
  switch (func) {
    case "reciprocal":
      if (shiftActive) appendInput("!");
      else appendInput("⁻¹");
      break;
    case "combin":
      if (shiftActive) appendInput("P");
      else appendInput("C");
      break;
    case "pol":
      if (shiftActive) appendInput("Rec(");
      else appendInput("Pol(");
      break;
    case "cube":
      if (shiftActive) appendInput("∛(");
      else appendInput("^3");
      break;
    case "frac":
      // After a result: a b/c toggles fraction<->decimal, SHIFT (d/c) shows improper form
      if (justEvaluated && !isErrorState) {
        if (fracShown && !shiftActive) {
          displayElement.innerText = formatResult(lastAns);
          fracShown = false;
        } else {
          showFractionResult(!shiftActive);
        }
      } else {
        appendInput("┘");
      }
      break;
    case "sqrt":
      appendInput("√(");
      break;
    case "square":
      appendInput("^2");
      break;
    case "pow":
      if (shiftActive) appendInput("ˣ√");
      else appendInput("^");
      break;
    case "log":
      if (shiftActive) appendInput("10^(");
      else appendInput("log(");
      break;
    case "ln":
      if (shiftActive) appendInput("e^(");
      else if (alphaActive) appendInput("e");
      else appendInput("ln(");
      break;
    case "minus":
      if (alphaActive || stoActive || rclActive) handleVar("A");
      else appendInput("(-)");
      break;
    case "deg":
      if (alphaActive || stoActive || rclActive) handleVar("B");
      else appendInput("°");
      break;
    case "hyp":
      if (alphaActive || stoActive || rclActive) {
        handleVar("C");
      } else {
        hypActive = !hypActive;
        updateIndicators();
      }
      break;
    case "sin":
      if (alphaActive || stoActive || rclActive) {
        handleVar("D");
      } else if (hypActive) {
        appendInput(shiftActive ? "sinh⁻¹(" : "sinh(");
        hypActive = false;
      } else {
        appendInput(shiftActive ? "sin⁻¹(" : "sin(");
      }
      break;
    case "cos":
      if (alphaActive || stoActive || rclActive) {
        handleVar("E");
      } else if (hypActive) {
        appendInput(shiftActive ? "cosh⁻¹(" : "cosh(");
        hypActive = false;
      } else {
        appendInput(shiftActive ? "cos⁻¹(" : "cos(");
      }
      break;
    case "tan":
      if (alphaActive || stoActive || rclActive) {
        handleVar("F");
      } else if (hypActive) {
        appendInput(shiftActive ? "tanh⁻¹(" : "tanh(");
        hypActive = false;
      } else {
        appendInput(shiftActive ? "tan⁻¹(" : "tan(");
      }
      break;
    case "rcl":
      if (shiftActive) {
        stoActive = !stoActive;
        rclActive = false;
      } else {
        rclActive = !rclActive;
        stoActive = false;
      }
      updateIndicators();
      break;
    case "eng": {
      let val = lastAns;
      const currentDisp = displayElement.innerText.trim();
      if (!isNaN(parseFloat(currentDisp))) {
        val = parseFloat(currentDisp);
      }
      if (!isNaN(val) && isFinite(val)) {
        displayElement.innerText = formatEng(val, shiftActive);
      }
      break;
    }
    case "open-paren":
      if (shiftActive) appendInput(",");
      else appendInput("(");
      break;
    case "close-paren":
      if (alphaActive || stoActive || rclActive) handleVar("X");
      else appendInput(")");
      break;
    case "comma":
      if (alphaActive || stoActive || rclActive) handleVar("Y");
      else if (shiftActive) appendInput(";");
      else appendInput(",");
      break;
    case "mem-plus":
      if (alphaActive || stoActive || rclActive) handleVar("M");
      else if (shiftActive) executeMemory("M-");
      else executeMemory("M+");
      break;
    case "exp":
      if (shiftActive) appendInput("π");
      else appendInput("E");
      break;
    case "ans":
      if (shiftActive) {
        // DRG▸: convert the entered value (or Ans) from a chosen unit to the current angle mode
        let v = lastAns;
        const raw = inputElement.innerText.trim();
        if (raw && modeMenuState === 0) {
          const r = evaluateExpression(raw);
          if (r !== "Syntax ERROR" && r !== "Math ERROR") v = parseFloat(r);
        }
        drgValue = v;
        modeMenuState = 108;
        inputElement.innerText = "1:D 2:R 3:G";
        displayElement.innerText = "";
      } else {
        appendInput("Ans");
      }
      break;
  }
}

function formatEng(val, shift) {
  if (val === 0) return "0";
  let exp = Math.floor(Math.log10(Math.abs(val)));
  let engExp = Math.floor(exp / 3) * 3;
  if (shift) engExp += 3;
  let mantissa = val / Math.pow(10, engExp);
  let mantStr = parseFloat(mantissa.toFixed(6)).toString();
  if (engExp === 0) return mantStr;
  return `${mantStr}×10^${engExp}`;
}

// Best rational approximation via continued fractions; null if val isn't a clean fraction
function toFraction(val, maxDen) {
  maxDen = maxDen || 100000;
  if (!isFinite(val)) return null;
  const sign = val < 0 ? -1 : 1;
  const v = Math.abs(val);
  let h1 = 1, h0 = 0, k1 = 0, k0 = 1, b = v;
  for (let i = 0; i < 40; i++) {
    const a = Math.floor(b);
    const h2 = a * h1 + h0, k2 = a * k1 + k0;
    if (k2 > maxDen) break;
    h0 = h1; h1 = h2; k0 = k1; k1 = k2;
    const rest = b - a;
    if (rest < 1e-12) break;
    b = 1 / rest;
  }
  if (Math.abs(v - h1 / k1) > 1e-9 * Math.max(1, v)) return null;
  return { num: sign * h1, den: k1 };
}

// Show lastAns as a fraction: mixed (a┘b┘c) or improper (b┘c, the d/c form)
function showFractionResult(mixed) {
  const f = toFraction(lastAns);
  if (!f) return; // no clean fraction — keep the decimal display
  if (f.den === 1) {
    displayElement.innerText = formatResult(f.num);
    fracShown = false;
    return;
  }
  const sign = f.num < 0 ? "-" : "";
  const n = Math.abs(f.num);
  if (mixed && n > f.den) {
    displayElement.innerText = `${sign}${Math.floor(n / f.den)}┘${n % f.den}┘${f.den}`;
  } else {
    displayElement.innerText = `${sign}${n}┘${f.den}`;
  }
  fracShown = true;
}

// Perform calculation
function operate() {
  if (!calculatorOn) return;
  const rawInput = inputElement.innerText.trim();
  if (!rawInput) {
    displayElement.innerText = "0";
    isErrorState = false;
    return;
  }

  // Push to history
  if (history.length === 0 || history[history.length - 1] !== rawInput) {
    history.push(rawInput);
    if (history.length > 20) history.shift();
  }
  historyIndex = -1;

  const res = evaluateExpression(rawInput);
  displayElement.innerText = res;
  isErrorState = (res === "Syntax ERROR" || res === "Math ERROR");
  justEvaluated = !isErrorState;
  fracShown = false;
  // Like the original: expressions entered with a b/c show a fraction result
  if (!isErrorState && rawInput.includes("┘")) {
    showFractionResult(true);
  }
}

// -------------------------------------------------------------
// Scientific Expression Tokenizer & Evaluator
// -------------------------------------------------------------
function evaluateExpression(raw) {
  try {
    const tokens = tokenize(raw);
    if (!tokens || tokens.length === 0) return "0";

    const parser = new Parser(tokens, degMode, lastAns, variables);
    const val = parser.parse();

    if (val === null || isNaN(val) || !isFinite(val)) {
      return "Math ERROR";
    }

    lastAns = val;
    return formatResult(val);
  } catch (err) {
    console.error("Evaluation error:", err);
    return "Syntax ERROR";
  }
}

function formatResult(val) {
  if (val === null || isNaN(val) || !isFinite(val)) return "Math ERROR";
  if (Math.abs(val) < 1e-12) val = 0;

  if (fixDigits !== null) {
    return val.toFixed(fixDigits);
  }
  if (sciDigits !== null) {
    return val.toExponential(sciDigits).replace("+", "");
  }

  if (Number.isInteger(val) && Math.abs(val) < 1e12) return val.toString();
  const sciBelow = normMode === 1 ? 1e-2 : 1e-9;
  if (Math.abs(val) >= 1e10 || Math.abs(val) < sciBelow) {
    // 10 significant digits like the fx-82MS, trailing zeros trimmed
    const [m, e] = val.toExponential(9).split("e");
    return parseFloat(m) + "e" + e.replace("+", "");
  }
  let str = val.toPrecision(10);
  return parseFloat(str).toString();
}

function tokenize(raw) {
  let str = (raw || "").normalize("NFC")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/\(-\)/g, "-")
    .replace(/(?:sinh|asinh)(?:[⁻\^]-?1|⁻¹)\(/gi, "asinh(")
    .replace(/(?:cosh|acosh)(?:[⁻\^]-?1|⁻¹)\(/gi, "acosh(")
    .replace(/(?:tanh|atanh)(?:[⁻\^]-?1|⁻¹)\(/gi, "atanh(")
    .replace(/(?:sin|asin)(?:[⁻\^]-?1|⁻¹)\(/gi, "asin(")
    .replace(/(?:cos|acos)(?:[⁻\^]-?1|⁻¹)\(/gi, "acos(")
    .replace(/(?:tan|atan)(?:[⁻\^]-?1|⁻¹)\(/gi, "atan(")
    .replace(/ˣ√/g, "~")
    .replace(/√\(/g, "sqrt(")
    .replace(/∛\(/g, "cbrt(")
    .replace(/10\^\(/g, "tenpow(")
    .replace(/e\^\(/g, "exp(")
    .replace(/⁻¹/g, "^-1")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, "PI");

  if (str.includes("┘")) {
    str = str.replace(/(\d+(?:\.\d+)?)\s*┘\s*(\d+(?:\.\d+)?)\s*┘\s*(\d+(?:\.\d+)?)/g, "($1+($2/$3))");
    str = str.replace(/(\d+(?:\.\d+)?)\s*┘\s*(\d+(?:\.\d+)?)/g, "($1/$2)");
    str = str.replace(/┘/g, "/");
  }

  if (str.includes("%")) {
    str = str.replace(/([0-9.]+)\s*\*\s*([0-9.]+)\s*%/g, "($1*($2/100))");
    str = str.replace(/([0-9.]+)\s*\+\s*([0-9.]+)\s*%/g, "($1+($1*($2/100)))");
    str = str.replace(/([0-9.]+)\s*-\s*([0-9.]+)\s*%/g, "($1-($1*($2/100)))");
    str = str.replace(/([0-9.]+)\s*%/g, "($1/100)");
    str = str.replace(/%/g, "/100");
  }

  const tokenList = [];
  let i = 0;

  while (i < str.length) {
    let ch = str[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (str.startsWith("Ran#", i)) {
      tokenList.push({ type: "RAND" });
      i += 4;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let numStr = "";
      while (i < str.length && /[0-9.]/.test(str[i])) {
        numStr += str[i];
        i++;
      }
      if (i < str.length && str[i] === "E") {
        numStr += "E";
        i++;
        if (i < str.length && (str[i] === "+" || str[i] === "-")) {
          numStr += str[i];
          i++;
        }
        while (i < str.length && /[0-9]/.test(str[i])) {
          numStr += str[i];
          i++;
        }
      }
      tokenList.push({ type: "NUM", val: parseFloat(numStr) });
      continue;
    }

    if (ch === "C" || ch === "P") {
      const nextChar = str[i + 1];
      if (!nextChar || !/[a-zA-Z_]/.test(nextChar)) {
        tokenList.push({ type: "OP", val: ch });
        i++;
        continue;
      }
    }

    if (str.startsWith("EXP", i)) {
      tokenList.push({ type: "OP", val: "E" });
      i += 3;
      continue;
    }
    if (ch === "E" && (i === str.length - 1 || !/[a-zA-Z_]/.test(str[i + 1]))) {
      tokenList.push({ type: "OP", val: "E" });
      i++;
      continue;
    }

    if (ch === "°") {
      tokenList.push({ type: "OP", val: "°" });
      i++;
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let idStr = "";
      while (i < str.length && /[a-zA-Z_]/.test(str[i])) {
        idStr += str[i];
        i++;
      }
      tokenList.push({ type: "IDENT", val: idStr });
      continue;
    }

    if ("+-*/^~!(),".includes(ch)) {
      tokenList.push({ type: "OP", val: ch });
      i++;
      continue;
    }

    i++;
  }

  const dmsList = [];
  let dIdx = 0;
  while (dIdx < tokenList.length) {
    if (
      dIdx + 1 < tokenList.length &&
      tokenList[dIdx].type === "NUM" &&
      tokenList[dIdx + 1].type === "OP" &&
      tokenList[dIdx + 1].val === "°"
    ) {
      let degrees = tokenList[dIdx].val;
      let minutes = 0;
      let seconds = 0;
      dIdx += 2;

      if (
        dIdx + 1 < tokenList.length &&
        tokenList[dIdx].type === "NUM" &&
        tokenList[dIdx + 1].type === "OP" &&
        tokenList[dIdx + 1].val === "°"
      ) {
        minutes = tokenList[dIdx].val;
        dIdx += 2;
        if (
          dIdx + 1 < tokenList.length &&
          tokenList[dIdx].type === "NUM" &&
          tokenList[dIdx + 1].type === "OP" &&
          tokenList[dIdx + 1].val === "°"
        ) {
          seconds = tokenList[dIdx].val;
          dIdx += 2;
        }
      }

      let totalDeg = degrees + minutes / 60 + seconds / 3600;
      dmsList.push({ type: "NUM", val: totalDeg });
    } else {
      dmsList.push(tokenList[dIdx]);
      dIdx++;
    }
  }

  const implicitList = [];
  for (let k = 0; k < dmsList.length; k++) {
    const curr = dmsList[k];
    implicitList.push(curr);

    if (k < dmsList.length - 1) {
      const next = dmsList[k + 1];
      const isCurrValue =
        curr.type === "NUM" ||
        curr.type === "RAND" ||
        curr.val === ")" ||
        curr.val === "!" ||
        (curr.type === "IDENT" &&
          ["PI", "e", "Ans", "A", "B", "C", "D", "E", "F", "X", "Y", "M"].includes(curr.val));

      const isNextValue =
        next.type === "NUM" ||
        next.type === "RAND" ||
        next.val === "(" ||
        (next.type === "IDENT" &&
          [
            "sin", "cos", "tan", "asin", "acos", "atan",
            "sinh", "cosh", "tanh", "asinh", "acosh", "atanh",
            "log", "ln", "sqrt", "cbrt", "tenpow", "exp",
            "Pol", "Rec", "PI", "e", "Ans",
            "A", "B", "C", "D", "E", "F", "X", "Y", "M"
          ].includes(next.val));

      if (isCurrValue && isNextValue) {
        implicitList.push({ type: "OP", val: "*" });
      }
    }
  }

  return implicitList;
}

class Parser {
  constructor(tokens, degMode, lastAns, variables) {
    this.tokens = tokens;
    this.pos = 0;
    this.degMode = degMode;
    this.lastAns = lastAns;
    this.variables = variables;
  }

  peek() {
    return this.tokens[this.pos] || null;
  }

  get() {
    return this.tokens[this.pos++] || null;
  }

  parse() {
    if (this.tokens.length === 0) return 0;
    const res = this.parseExpression();
    return res;
  }

  parseExpression() {
    let left = this.parseTerm();

    while (this.peek() && (this.peek().val === "+" || this.peek().val === "-")) {
      const op = this.get().val;
      const right = this.parseTerm();
      if (op === "+") left = left + right;
      else left = left - right;
    }
    return left;
  }

  parseTerm() {
    let left = this.parsePower();

    while (
      this.peek() &&
      (this.peek().val === "*" ||
        this.peek().val === "/" ||
        this.peek().val === "C" ||
        this.peek().val === "P" ||
        this.peek().val === "E")
    ) {
      const op = this.get().val;
      const right = this.parsePower();

      if (op === "*") left = left * right;
      else if (op === "/") {
        left = left / right; // x/0 -> Infinity -> "Math ERROR", matching the real calc
      } else if (op === "C") {
        left = this.nCr(left, right);
      } else if (op === "P") {
        left = this.nPr(left, right);
      } else if (op === "E") {
        left = left * Math.pow(10, right);
      }
    }
    return left;
  }

  parsePower() {
    let left = this.parseUnary();

    if (this.peek() && (this.peek().val === "^" || this.peek().val === "~")) {
      const op = this.get().val;
      const right = this.parsePower();
      if (op === "^") {
        left = Math.pow(left, right);
      } else {
        // x-th root: left ˣ√ right = right^(1/left); odd roots of negatives are real
        if (right < 0 && Number.isInteger(left) && Math.abs(left % 2) === 1) {
          left = -Math.pow(-right, 1 / left);
        } else {
          left = Math.pow(right, 1 / left);
        }
      }
    }
    return left;
  }

  parseUnary() {
    if (this.peek() && (this.peek().val === "-" || this.peek().val === "+")) {
      const op = this.get().val;
      const val = this.parseUnary();
      return op === "-" ? -val : val;
    }
    return this.parseFactorial();
  }

  parseFactorial() {
    let val = this.parsePrimary();

    while (this.peek() && this.peek().val === "!") {
      this.get();
      val = this.factorial(val);
    }
    return val;
  }

  parsePrimary() {
    const token = this.get();
    if (!token) throw new Error("Unexpected end of expression");

    if (token.type === "NUM") {
      return token.val;
    }

    if (token.type === "RAND") {
      return Math.random();
    }

    if (token.type === "IDENT") {
      const name = token.val;

      if (name === "PI") return Math.PI;
      if (name === "e") return Math.E;
      if (name === "Ans") return this.lastAns;
      if (name in this.variables) return this.variables[name];

      if (this.peek() && this.peek().val === "(") {
        this.get();
        const arg = this.parseExpression();

        let secondArg = null;
        if (this.peek() && this.peek().val === ",") {
          this.get();
          secondArg = this.parseExpression();
        }

        if (this.peek() && this.peek().val === ")") {
          this.get();
        }

        return this.evalFunc(name, arg, secondArg);
      }

      throw new Error(`Unknown identifier ${name}`);
    }

    if (token.type === "OP" && token.val === "E") {
      const expVal = this.parsePower();
      return Math.pow(10, expVal);
    }

    if (token.type === "OP" && token.val === "(") {
      const val = this.parseExpression();
      if (this.peek() && this.peek().val === ")") {
        this.get();
      }
      return val;
    }

    throw new Error(`Unexpected token ${token.val}`);
  }

  evalFunc(name, arg, arg2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toGrad = (grad) => (grad * Math.PI) / 200;
    const fromRad = (rad) => {
      if (this.degMode === "DEG") return (rad * 180) / Math.PI;
      if (this.degMode === "GRA") return (rad * 200) / Math.PI;
      return rad;
    };

    switch (name) {
      case "sin": {
        let angle = arg;
        if (this.degMode === "DEG") angle = toRad(arg);
        else if (this.degMode === "GRA") angle = toGrad(arg);
        return Math.sin(angle);
      }
      case "cos": {
        let angle = arg;
        if (this.degMode === "DEG") angle = toRad(arg);
        else if (this.degMode === "GRA") angle = toGrad(arg);
        return Math.cos(angle);
      }
      case "tan": {
        let angle = arg;
        if (this.degMode === "DEG") angle = toRad(arg);
        else if (this.degMode === "GRA") angle = toGrad(arg);
        return Math.tan(angle);
      }
      case "asin": {
        if (arg < -1 || arg > 1) return NaN;
        return fromRad(Math.asin(arg));
      }
      case "acos": {
        if (arg < -1 || arg > 1) return NaN;
        return fromRad(Math.acos(arg));
      }
      case "atan": {
        return fromRad(Math.atan(arg));
      }
      case "sinh":
        return Math.sinh(arg);
      case "cosh":
        return Math.cosh(arg);
      case "tanh":
        return Math.tanh(arg);
      case "asinh":
        return Math.asinh(arg);
      case "acosh":
        return Math.acosh(arg);
      case "atanh":
        return Math.atanh(arg);
      case "log": {
        if (arg <= 0) return NaN;
        return Math.log10(arg);
      }
      case "ln": {
        if (arg <= 0) return NaN;
        return Math.log(arg);
      }
      case "sqrt": {
        if (arg < 0) return NaN;
        return Math.sqrt(arg);
      }
      case "cbrt": {
        return Math.cbrt(arg);
      }
      case "tenpow": {
        return Math.pow(10, arg);
      }
      case "exp": {
        return Math.exp(arg);
      }
      case "Pol": {
        // Displays r; r and θ are also stored in E and F like the original
        const r = Math.hypot(arg, arg2 || 0);
        const theta = fromRad(Math.atan2(arg2 || 0, arg));
        this.variables.E = r;
        this.variables.F = theta;
        return r;
      }
      case "Rec": {
        // Displays x; x and y are also stored in E and F like the original
        let angle = arg2 || 0;
        if (this.degMode === "DEG") angle = toRad(angle);
        else if (this.degMode === "GRA") angle = toGrad(angle);
        const x = arg * Math.cos(angle);
        const y = arg * Math.sin(angle);
        this.variables.E = x;
        this.variables.F = y;
        return x;
      }
      default:
        throw new Error(`Unknown function ${name}`);
    }
  }

  factorial(n) {
    if (n < 0 || !Number.isInteger(n) || n > 170) return NaN;
    if (n === 0 || n === 1) return 1;
    let res = 1;
    for (let i = 2; i <= n; i++) res *= i;
    return res;
  }

  nCr(n, r) {
    if (n < 0 || r < 0 || r > n) return NaN;
    return this.factorial(n) / (this.factorial(r) * this.factorial(n - r));
  }

  nPr(n, r) {
    if (n < 0 || r < 0 || r > n) return NaN;
    return this.factorial(n) / this.factorial(n - r);
  }
}

// -------------------------------------------------------------
// Initialization & Event Listeners
// -------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  const calc = document.querySelector(".calculator");
  if (calc) {
    calc.addEventListener("click", (e) => {
      let btn = e.target;
      while (btn && btn.tagName !== "BUTTON") {
        btn = btn.parentElement;
      }
      if (!btn) return;

      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);

      handleButtonClick(btn);
    });
  }

  // Power-on state: a lone "0" on the result line, like the original
  clearDisplay();
});

// Keyboard Support
let shiftUsedAsModifier = false;

window.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.target && e.target.tagName === "INPUT") return;

  const key = e.key;

  // Physical Shift: a plain tap toggles calculator SHIFT (applied on keyup).
  // Holding Shift to type a symbol (e.g. ^ via Shift+6) must not toggle it.
  if (key === "Shift") {
    if (!e.repeat) shiftUsedAsModifier = false;
    return;
  }
  if (e.shiftKey) shiftUsedAsModifier = true;

  // Handle active menus first (when modeMenuState !== 0)
  if (modeMenuState !== 0) {
    let menuChoice = null;
    if (key >= "1" && key <= "9") menuChoice = key;
    else if (key === "!") menuChoice = "1";
    else if (key === "@") menuChoice = "2";
    else if (key === "#") menuChoice = "3";

    if (menuChoice) {
      if (handleMenuChoice(menuChoice)) {
        shiftActive = false;
        alphaActive = false;
        updateIndicators();
        return;
      }
    }
  }

  const isShift = shiftActive || e.shiftKey;

  // Shift + 1 (S-SUM)
  if (isShift && (key === "1" || key === "!" || e.code === "Digit1" || e.code === "Numpad1")) {
    e.preventDefault();
    shiftActive = true;
    const btn1 = document.querySelector('button[data-key="49"]');
    if (btn1) {
      btn1.classList.add("active");
      setTimeout(() => btn1.classList.remove("active"), 150);
      handleButtonClick(btn1);
    }
    return;
  }

  // Shift + 2 (S-VAR)
  if (isShift && (key === "2" || key === "@" || e.code === "Digit2" || e.code === "Numpad2")) {
    e.preventDefault();
    shiftActive = true;
    const btn2 = document.querySelector('button[data-key="50"]');
    if (btn2) {
      btn2.classList.add("active");
      setTimeout(() => btn2.classList.remove("active"), 150);
      handleButtonClick(btn2);
    }
    return;
  }

  // Digits 0-9
  if (key >= "0" && key <= "9") {
    const btn = document.querySelector(`button[data-key="${48 + parseInt(key, 10)}"]`);
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      appendInput(key);
    }
    return;
  } else if (key === ".") {
    const btn = document.querySelector('.period');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      appendInput(isShift ? "Ran#" : ".");
      shiftActive = false;
      updateIndicators();
    }
  } else if (key === "+") {
    appendInput("+");
  } else if (key === "-") {
    appendInput("-");
  } else if (key === "*" || key === "x" || key === "X") {
    appendInput("×");
  } else if (key === "/") {
    appendInput("÷");
  } else if (key === "(" || key === ")") {
    appendInput(key);
  } else if (key === "^") {
    const btn = document.querySelector('.pow');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      appendInput(shiftActive ? "ˣ√" : "^");
      shiftActive = false;
      updateIndicators();
    }
  } else if (key === "!") {
    const btn = document.querySelector('.reciprocal');
    if (btn) {
      shiftActive = true;
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      appendInput("!");
    }
  } else if (key === "%") {
    appendInput("%");
  } else if (key === ";") {
    appendInput(";");
  } else if (key === ",") {
    appendInput(",");
  } else if (key === "Enter" || key === "=") {
    e.preventDefault();
    operate();
  } else if (key === "Backspace") {
    const btn = document.querySelector('.del');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      deleteLastChar();
    }
  } else if (key === "Escape") {
    const btn = document.querySelector('.ac');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      clearDisplay();
    }
  } else if (key === "ArrowUp") {
    const navUp = document.querySelector('.nav.up');
    if (navUp) {
      navUp.classList.add("active");
      setTimeout(() => navUp.classList.remove("active"), 150);
      handleButtonClick(navUp);
    }
  } else if (key === "ArrowDown") {
    const navDown = document.querySelector('.nav.down');
    if (navDown) {
      navDown.classList.add("active");
      setTimeout(() => navDown.classList.remove("active"), 150);
      handleButtonClick(navDown);
    }
  } else if (key === "ArrowLeft") {
    const navLeft = document.querySelector('.nav.left');
    if (navLeft) {
      navLeft.classList.add("active");
      setTimeout(() => navLeft.classList.remove("active"), 150);
      handleButtonClick(navLeft);
    }
  } else if (key === "ArrowRight") {
    const navRight = document.querySelector('.nav.right');
    if (navRight) {
      navRight.classList.add("active");
      setTimeout(() => navRight.classList.remove("active"), 150);
      handleButtonClick(navRight);
    }
  } else if (key.toLowerCase() === "s") {
    const btn = document.querySelector('.sin');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      appendInput(isShift ? "sin⁻¹(" : "sin(");
    }
  } else if (key.toLowerCase() === "c") {
    const btn = document.querySelector('.cos');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      appendInput(isShift ? "cos⁻¹(" : "cos(");
    }
  } else if (key.toLowerCase() === "t") {
    const btn = document.querySelector('.tan');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      appendInput(isShift ? "tan⁻¹(" : "tan(");
    }
  } else if (key.toLowerCase() === "l") {
    const btn = document.querySelector('.log');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      appendInput(isShift ? "10^(" : "log(");
    }
  } else if (key.toLowerCase() === "n") {
    const btn = document.querySelector('.ln');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    } else {
      appendInput(isShift ? "e^(" : "ln(");
    }
  } else if (key.toLowerCase() === "r") {
    appendInput("√(");
  } else if (key.toLowerCase() === "p") {
    appendInput("π");
  } else if (key.toLowerCase() === "m") {
    const btn = document.querySelector('#btn-mode');
    if (btn) {
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 150);
      handleButtonClick(btn);
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.key !== "Shift" || shiftUsedAsModifier) return;
  if (e.target && e.target.tagName === "INPUT") return;
  shiftActive = !shiftActive;
  if (shiftActive) alphaActive = false;
  updateIndicators();
});
