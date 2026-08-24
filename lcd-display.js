// lcd-display.js — authentic fx-82MS LCD renderer.
// Draws the two-line LCD (5x7 dot-matrix top row + 7-segment bottom row)
// onto a canvas, with the faint "ghost" pixels of a real LCD always visible.
// The hidden #input / #main-display elements remain the source of truth;
// a MutationObserver re-renders whenever calculator.js updates them.
(function () {
  "use strict";

  const screen = document.querySelector(".screen");
  const inputEl = document.getElementById("input");
  const mainEl = document.getElementById("main-display");
  const indicatorsEl = document.getElementById("indicators");
  if (!screen || !inputEl || !mainEl) return;

  const ind = {};
  ["shift", "alpha", "hyp", "sto", "m", "mode", "deg", "fixsci"].forEach(k => {
    ind[k] = document.getElementById("ind-" + k);
  });

  const canvas = document.createElement("canvas");
  canvas.className = "lcd";
  screen.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const CELLS = 12;      // dot-matrix characters on the top line
  const DIGITS = 12;     // 7-segment positions on the bottom line
  const INK = "8,18,10"; // LCD ink color
  const GHOST = 0.06;    // opacity of inactive (ghost) pixels
  const ON = 0.92;       // opacity of active pixels

  /* ------------- 5x7 dot-matrix font (bit 4 = leftmost column) ---------- */
  const F = {
    " ": [0, 0, 0, 0, 0, 0, 0],
    "0": [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
    "1": [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "2": [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F],
    "3": [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
    "4": [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
    "5": [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
    "6": [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
    "7": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
    "8": [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
    "9": [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],
    "A": [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    "B": [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
    "C": [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
    "D": [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
    "E": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
    "F": [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
    "G": [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0F],
    "H": [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
    "I": [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "J": [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
    "K": [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
    "L": [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
    "M": [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
    "N": [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
    "O": [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    "P": [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
    "Q": [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
    "R": [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
    "S": [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
    "T": [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
    "U": [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
    "V": [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
    "W": [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0A],
    "X": [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
    "Y": [0x11, 0x11, 0x11, 0x0A, 0x04, 0x04, 0x04],
    "Z": [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],
    "a": [0x00, 0x00, 0x0E, 0x01, 0x0F, 0x11, 0x0F],
    "b": [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x1E],
    "c": [0x00, 0x00, 0x0E, 0x10, 0x10, 0x11, 0x0E],
    "d": [0x01, 0x01, 0x0D, 0x13, 0x11, 0x11, 0x0F],
    "e": [0x00, 0x00, 0x0E, 0x11, 0x1F, 0x10, 0x0E],
    "f": [0x06, 0x09, 0x08, 0x1C, 0x08, 0x08, 0x08],
    "g": [0x00, 0x00, 0x0F, 0x11, 0x0F, 0x01, 0x0E],
    "h": [0x10, 0x10, 0x16, 0x19, 0x11, 0x11, 0x11],
    "i": [0x04, 0x00, 0x0C, 0x04, 0x04, 0x04, 0x0E],
    "j": [0x02, 0x00, 0x06, 0x02, 0x02, 0x12, 0x0C],
    "k": [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
    "l": [0x0C, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
    "m": [0x00, 0x00, 0x1A, 0x15, 0x15, 0x11, 0x11],
    "n": [0x00, 0x00, 0x16, 0x19, 0x11, 0x11, 0x11],
    "o": [0x00, 0x00, 0x0E, 0x11, 0x11, 0x11, 0x0E],
    "p": [0x00, 0x00, 0x1E, 0x11, 0x1E, 0x10, 0x10],
    "q": [0x00, 0x00, 0x0D, 0x13, 0x0F, 0x01, 0x01],
    "r": [0x00, 0x00, 0x16, 0x19, 0x10, 0x10, 0x10],
    "s": [0x00, 0x00, 0x0E, 0x10, 0x0E, 0x01, 0x1E],
    "t": [0x08, 0x08, 0x1C, 0x08, 0x08, 0x09, 0x06],
    "u": [0x00, 0x00, 0x11, 0x11, 0x11, 0x13, 0x0D],
    "v": [0x00, 0x00, 0x11, 0x11, 0x11, 0x0A, 0x04],
    "w": [0x00, 0x00, 0x11, 0x11, 0x15, 0x15, 0x0A],
    "x": [0x00, 0x00, 0x11, 0x0A, 0x04, 0x0A, 0x11],
    "y": [0x00, 0x00, 0x11, 0x11, 0x0F, 0x01, 0x0E],
    "z": [0x00, 0x00, 0x1F, 0x02, 0x04, 0x08, 0x1F],
    "+": [0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00],
    "-": [0x00, 0x00, 0x00, 0x1F, 0x00, 0x00, 0x00],
    "\u00D7": [0x00, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x00], // ×
    "\u00F7": [0x00, 0x04, 0x00, 0x1F, 0x00, 0x04, 0x00], // ÷
    "^": [0x04, 0x0A, 0x11, 0x00, 0x00, 0x00, 0x00],
    "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
    ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
    ".": [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C],
    ",": [0x00, 0x00, 0x00, 0x00, 0x0C, 0x04, 0x08],
    ":": [0x00, 0x0C, 0x0C, 0x00, 0x0C, 0x0C, 0x00],
    ";": [0x00, 0x0C, 0x0C, 0x00, 0x0C, 0x04, 0x08],
    "=": [0x00, 0x00, 0x1F, 0x00, 0x1F, 0x00, 0x00],
    "!": [0x04, 0x04, 0x04, 0x04, 0x00, 0x00, 0x04],
    "?": [0x0E, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
    "%": [0x18, 0x19, 0x02, 0x04, 0x08, 0x13, 0x03],
    "~": [0x00, 0x00, 0x08, 0x15, 0x02, 0x00, 0x00],
    "#": [0x0A, 0x0A, 0x1F, 0x0A, 0x1F, 0x0A, 0x0A],
    "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
    "_": [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F],
    "\u00B0": [0x0C, 0x12, 0x12, 0x0C, 0x00, 0x00, 0x00], // °
    "\u221A": [0x07, 0x04, 0x04, 0x04, 0x14, 0x0C, 0x04], // √
    "\u03C0": [0x00, 0x00, 0x1F, 0x0A, 0x0A, 0x0A, 0x13], // π
    "\u03A3": [0x1F, 0x10, 0x08, 0x04, 0x08, 0x10, 0x1F], // Σ
    "\u03C3": [0x00, 0x00, 0x0F, 0x12, 0x12, 0x12, 0x0C], // σ
    "\u2518": [0x02, 0x02, 0x02, 0x02, 0x02, 0x1E, 0x00], // ┘ fraction mark
    "\u25C4": [0x02, 0x06, 0x0E, 0x1E, 0x0E, 0x06, 0x02], // left overflow arrow
    "►": [0x08, 0x0C, 0x0E, 0x0F, 0x0E, 0x0C, 0x08], // ► overflow arrow
    "\u00B2": [0x07, 0x01, 0x07, 0x04, 0x07, 0x00, 0x00], // ²
    "\u00B3": [0x07, 0x01, 0x07, 0x01, 0x07, 0x00, 0x00], // ³
    "\u00B9": [0x02, 0x06, 0x02, 0x02, 0x07, 0x00, 0x00], // ¹
    "\u02E3": [0x0A, 0x04, 0x0A, 0x00, 0x00, 0x00, 0x00], // ˣ
    "\uE001": [0x1F, 0x00, 0x11, 0x0A, 0x04, 0x0A, 0x11], // x̄
    "\uE002": [0x1F, 0x00, 0x11, 0x11, 0x0F, 0x01, 0x0E], // ȳ
    "\uE003": [0x04, 0x0A, 0x11, 0x0A, 0x04, 0x0A, 0x11], // x̂
    "\uE004": [0x04, 0x0A, 0x11, 0x11, 0x0F, 0x01, 0x0E], // ŷ
    "\uE005": [0x00, 0x06, 0x1A, 0x02, 0x02, 0x00, 0x00], // ⁻¹ superscript
  };

  // Map the calculator's strings to single display glyphs.
  function toGlyphs(str) {
    let s = (str || "")
      .replace(/x\u0304/g, "\uE001")
      .replace(/\u0233|y\u0304/g, "\uE002")
      .replace(/x\u0302/g, "\uE003")
      .replace(/\u0177|y\u0302/g, "\uE004")
      .replace(/\u207B\u00B9/g, "\uE005")
      .replace(/\u2211/g, "\u03A3")
      .replace(/\u221B/g, "\u00B3\u221A");
    return Array.from(s);
  }

  /* --------------------- 7-segment patterns (abcdefg) ------------------- */
  const SEG_A = 1, SEG_B = 2, SEG_C = 4, SEG_D = 8, SEG_E = 16, SEG_F = 32, SEG_G = 64;
  const SEG = {
    "0": 0x3F, "1": 0x06, "2": 0x5B, "3": 0x4F, "4": 0x66,
    "5": 0x6D, "6": 0x7D, "7": 0x07, "8": 0x7F, "9": 0x6F,
    "-": 0x40,
    "\u2518": SEG_B | SEG_C | SEG_D, // ┘ fraction separator
  };

  /* ----------------------------- state ---------------------------------- */
  let cursorVisible = true;
  let cursorApplies = false;

  function txt(el) {
    return el ? (el.textContent || "").trim() : "";
  }

  // "1:COMP 2:SD 3:REG" -> [{d:"1", label:"COMP"}, ...]
  function parseMenu(s) {
    if (!/^\d:/.test(s)) return null;
    const items = [];
    const re = /(\d):(\S+)/g;
    let m;
    while ((m = re.exec(s))) items.push({ d: m[1], label: m[2] });
    return items.length ? items : null;
  }

  // "-1.23e-5", "123", "5┘1┘2", "1.2×10^3" -> {neg, mant, exp} | null
  function parseNumeric(s) {
    const m = s.match(/^(-?)([0-9.\u2518]+)(?:(?:e|\u00D710\^)(-?\d+))?$/);
    if (!m || !/[0-9]/.test(m[2])) return null;
    return { neg: m[1] === "-", mant: m[2], exp: m[3] || null };
  }

  // First item left-aligned, last right-aligned, middles centered — like
  // the original's mode menus (COMP....SD...REG).
  function menuStarts(items) {
    const lens = items.map(it => toGlyphs(it.label).length);
    const n = items.length;
    const starts = new Array(n);
    starts[0] = 0;
    if (n === 1) return starts;
    starts[n - 1] = Math.max(lens[0] + 1, CELLS - lens[n - 1]);
    for (let k = 1; k < n - 1; k++) {
      const lo = starts[k - 1] + lens[k - 1] + 1;
      const hi = starts[n - 1] - 1;
      starts[k] = Math.max(lo, Math.round((lo + hi - lens[k]) / 2));
    }
    // Fallback to sequential packing if anything overlaps
    for (let k = 1; k < n; k++) {
      if (starts[k] < starts[k - 1] + lens[k - 1] + 1) {
        starts[k] = starts[k - 1] + lens[k - 1] + 1;
      }
    }
    return starts;
  }

  /* ----------------------------- drawing -------------------------------- */
  let L = null; // layout, recomputed every render

  function computeLayout() {
    const W = screen.clientWidth;
    const H = screen.clientHeight;
    const mX = W * 0.035;
    const innerW = W - mX * 2;
    // Dot pitch of the matrix row, capped so the 7 rows always clear the
    // segment row on short screens.
    const pitch = Math.min(innerW / (CELLS * 6 - 1), (H * 0.36) / 7);
    return {
      W, H, mX, innerW, pitch,
      dot: pitch * 0.82,
      cellW: pitch * 6,
      matTop: H * 0.215,
      indTop: H * 0.025,
      dPitch: innerW / DIGITS,
      segTop: H * 0.585,
      segH: H * 0.395,
    };
  }

  function ink(alpha) {
    ctx.fillStyle = "rgba(" + INK + "," + alpha + ")";
  }

  function drawGlyph(glyph, x, y, pitch, dot, alpha) {
    const rows = F[glyph] || F["?"];
    ink(alpha);
    for (let r = 0; r < 7; r++) {
      const bits = rows[r];
      for (let c = 0; c < 5; c++) {
        if (bits & (1 << (4 - c))) {
          ctx.fillRect(x + c * pitch, y + r * pitch, dot, dot);
        }
      }
    }
  }

  function drawMiniText(glyphs, x, y, pitch, alpha) {
    for (let i = 0; i < glyphs.length; i++) {
      drawGlyph(glyphs[i], x + i * pitch * 6, y, pitch, pitch * 0.85, alpha);
    }
  }

  function matrixX(cell) {
    return L.mX + cell * L.cellW;
  }

  function drawMatrixGhost() {
    ink(GHOST);
    for (let cell = 0; cell < CELLS; cell++) {
      const x = matrixX(cell);
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 5; c++) {
          ctx.fillRect(x + c * L.pitch, L.matTop + r * L.pitch, L.dot, L.dot);
        }
      }
    }
  }

  function drawMatrixText(glyphs, startCell, alpha) {
    for (let i = 0; i < glyphs.length; i++) {
      const cell = startCell + i;
      if (cell < 0 || cell >= CELLS) continue;
      drawGlyph(glyphs[i], matrixX(cell), L.matTop, L.pitch, L.dot, alpha);
    }
  }

  /* 7-segment digit box at position i (0..11) */
  function segGeom(i) {
    const w = L.dPitch * 0.62;
    const h = L.segH;
    const x = L.mX + i * L.dPitch + (L.dPitch - w) * 0.35;
    return { x, y: L.segTop, w, h, t: w * 0.22 };
  }

  function hexH(cx, cy, len, t) {
    ctx.beginPath();
    ctx.moveTo(cx - len / 2, cy);
    ctx.lineTo(cx - len / 2 + t / 2, cy - t / 2);
    ctx.lineTo(cx + len / 2 - t / 2, cy - t / 2);
    ctx.lineTo(cx + len / 2, cy);
    ctx.lineTo(cx + len / 2 - t / 2, cy + t / 2);
    ctx.lineTo(cx - len / 2 + t / 2, cy + t / 2);
    ctx.closePath();
    ctx.fill();
  }

  function hexV(cx, cy, len, t) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - len / 2);
    ctx.lineTo(cx + t / 2, cy - len / 2 + t / 2);
    ctx.lineTo(cx + t / 2, cy + len / 2 - t / 2);
    ctx.lineTo(cx, cy + len / 2);
    ctx.lineTo(cx - t / 2, cy + len / 2 - t / 2);
    ctx.lineTo(cx - t / 2, cy - len / 2 + t / 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawSegDigit(g, mask, alpha) {
    const { x, y, w, h, t } = g;
    const hl = w - t * 1.15;   // horizontal segment length
    const vl = h / 2 - t * 1.15; // vertical segment length
    const upperY = y + h / 4 + t / 4;
    const lowerY = y + (3 * h) / 4 - t / 4;
    ink(alpha);
    ctx.save();
    // Slight rightward lean, like Casio's digits
    const cy = y + h / 2;
    ctx.transform(1, 0, -0.09, 1, 0.09 * cy, 0);
    if (mask & SEG_A) hexH(x + w / 2, y + t / 2, hl, t);
    if (mask & SEG_G) hexH(x + w / 2, y + h / 2, hl, t);
    if (mask & SEG_D) hexH(x + w / 2, y + h - t / 2, hl, t);
    if (mask & SEG_F) hexV(x + t / 2, upperY, vl, t);
    if (mask & SEG_B) hexV(x + w - t / 2, upperY, vl, t);
    if (mask & SEG_E) hexV(x + t / 2, lowerY, vl, t);
    if (mask & SEG_C) hexV(x + w - t / 2, lowerY, vl, t);
    ctx.restore();
  }

  function drawDecimalPoint(g, alpha) {
    ink(alpha);
    const s = g.t * 1.05;
    ctx.fillRect(g.x + g.w + s * 0.3, g.y + g.h - s, s, s);
  }

  function drawSegGhost() {
    for (let i = 0; i < DIGITS; i++) {
      const g = segGeom(i);
      drawSegDigit(g, 0x7F, GHOST);
      drawDecimalPoint(g, GHOST);
    }
  }

  // Build 7-seg cells from a mantissa string; '.' becomes a point on the
  // previous digit; integers get the trailing point of the original.
  function buildCells(neg, mant) {
    const cells = [];
    if (neg) cells.push({ ch: "-", dp: false });
    for (const ch of mant) {
      if (ch === ".") {
        if (cells.length) cells[cells.length - 1].dp = true;
      } else {
        cells.push({ ch, dp: false });
      }
    }
    // Integers carry a trailing point, as on the original; fractions don't
    if (cells.length && !mant.includes(".") && !mant.includes("┘")) {
      cells[cells.length - 1].dp = true;
    }
    return cells;
  }

  function drawNumber(num) {
    const hasExp = num.exp !== null;
    // The exponent takes the rightmost cells; the mantissa gets the rest and
    // is rounded down to that many significant digits rather than clipped.
    const expCells = hasExp ? Array.from(num.exp).length : 0;
    const room = DIGITS - expCells;
    let mant = num.mant;
    if (hasExp && mant.indexOf("┘") === -1) {
      const sigRoom = room - (num.neg ? 1 : 0);
      const digits = mant.replace(/[^0-9]/g, "").length;
      if (digits > sigRoom && sigRoom >= 1 && sigRoom <= 21) {
        mant = parseFloat(mant).toPrecision(sigRoom);
      }
    }
    let cells = buildCells(num.neg, mant);
    if (cells.length > room) cells = cells.slice(0, room);
    const start = room - cells.length;
    for (let i = 0; i < cells.length; i++) {
      const g = segGeom(start + i);
      const mask = SEG[cells[i].ch];
      if (mask !== undefined) drawSegDigit(g, mask, ON);
      if (cells[i].dp) drawDecimalPoint(g, ON);
    }
    if (hasExp) drawExponent(num.exp);
  }

  // Exponent digits fill the rightmost cells, as on the fx-82MS
  function drawExponent(expStr) {
    const glyphs = Array.from(expStr);
    const start = DIGITS - glyphs.length;
    for (let i = 0; i < glyphs.length; i++) {
      const mask = SEG[glyphs[i]];
      if (mask !== undefined) drawSegDigit(segGeom(start + i), mask, ON);
    }
  }

  /* --------------------------- indicators -------------------------------- */
  const GAP_IN = 1;    // char widths between labels inside a group
  const GAP_OUT = 2.5; // char widths between groups

  // Annunciator row, in the fx-82MS order. Grouped so related flags sit
  // together, with the angle-unit group pushed to the right edge.
  function indicatorGroups() {
    const modeTxt = txt(ind.mode);
    const fsTxt = txt(ind.fixsci);
    const degTxt = txt(ind.deg);
    return [
      [
        { label: "S", lit: txt(ind.shift) === "S" },
        { label: "A", lit: txt(ind.alpha) === "A" },
        { label: "M", lit: txt(ind.m) === "M" },
        { label: "STO", lit: txt(ind.sto) === "STO" },
        { label: "hyp", lit: txt(ind.hyp) === "HYP" },
      ],
      [
        { label: "SD", lit: modeTxt === "SD" },
        { label: "REG", lit: modeTxt === "REG" },
      ],
      [
        { label: "FIX", lit: fsTxt === "FIX" },
        { label: "SCI", lit: fsTxt === "SCI" },
      ],
      [
        { label: "D", lit: degTxt === "DEG" },
        { label: "R", lit: degTxt === "RAD" },
        { label: "G", lit: degTxt === "GRA" },
      ],
    ];
  }

  function drawIndicators(off) {
    const groups = indicatorGroups();
    // Total width in character cells, then a pitch that makes the row fit exactly
    let chars = 0;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      for (let i = 0; i < g.length; i++) chars += g[i].label.length;
      chars += (g.length - 1) * GAP_IN;
      if (gi < groups.length - 1) chars += GAP_OUT;
    }
    const pitch = L.innerW / (chars * 6);
    const adv = pitch * 6;

    let x = L.mX;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      for (let i = 0; i < g.length; i++) {
        const alpha = g[i].lit && !off ? ON : GHOST * 0.9;
        drawMiniText(toGlyphs(g[i].label), x, L.indTop, pitch, alpha);
        x += g[i].label.length * adv;
        if (i < g.length - 1) x += GAP_IN * adv;
      }
      x += GAP_OUT * adv;
    }
  }

  /* ------------------------------ render --------------------------------- */
  function render() {
    const dpr = window.devicePixelRatio || 1;
    const cw = screen.clientWidth, ch = screen.clientHeight;
    if (!cw || !ch) return;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    L = computeLayout();

    const off = screen.classList.contains("off");

    // Ghost (inactive) pixels — always faintly visible, like a real LCD
    drawMatrixGhost();
    drawSegGhost();
    drawIndicators(off);

    cursorApplies = false;
    if (off) return;

    const I = txt(inputEl);
    const M = txt(mainEl);
    const menu = parseMenu(I);

    if (/ERROR/i.test(M)) {
      // Errors take over the dot-matrix line, like the original
      const g = toGlyphs(M);
      drawMatrixText(g, Math.max(0, Math.floor((CELLS - g.length) / 2)), ON);
      return;
    }

    if (menu) {
      // Menu: labels on the matrix line, choice digits lit on the 7-seg line
      const starts = menuStarts(menu);
      for (let k = 0; k < menu.length; k++) {
        drawMatrixText(toGlyphs(menu[k].label), starts[k], ON);
        const di = Math.min(DIGITS - 1, Math.max(0, starts[k]));
        const mask = SEG[menu[k].d];
        if (mask !== undefined) drawSegDigit(segGeom(di), mask, ON);
      }
      return;
    }

    // The result line is either a bare number or a labelled one, such as
    // "n= 4" after DT or "A = 5" after STO. Split the two: the label belongs
    // on the matrix row, the value on the segment row.
    let numeric = parseNumeric(M);
    let label = null;
    if (!numeric && M) {
      const lv = M.match(/^(.*?=)\s*(-?[0-9.┘]+(?:(?:e|×10\^)-?\d+)?)$/);
      if (lv) {
        label = lv[1];
        numeric = parseNumeric(lv[2]);
      }
    }

    if (I) {
      // Something is being entered, so it owns the matrix row — even while
      // the segment row still shows the count from the last DT. Without this,
      // digits typed after DT are stored but never drawn.
      const isPrompt = /\?$/.test(I);
      const g = toGlyphs(I);

      if (isPrompt) {
        drawMatrixText(g.slice(0, CELLS), 0, ON);
        if (numeric) drawNumber(numeric);
        return;
      }

      // Where the editing cursor sits, in glyphs. calculator.js publishes it as
      // a character offset on a token boundary, alongside the entry it belongs
      // to; an offset left over from a replaced entry falls back to the end.
      const ds = inputEl ? inputEl.dataset : {};
      const live = ds.cursorText === I;
      const off = live ? Math.max(0, Math.min(parseInt(ds.cursor, 10) || 0, I.length)) : I.length;
      const cur = toGlyphs(I.slice(0, off)).length;

      // Scroll a CELLS-wide window so the cursor stays inside it, keeping one
      // spare cell past the last glyph for the cursor to rest on.
      const maxStart = Math.max(0, g.length + 1 - CELLS);
      const start = Math.min(maxStart, Math.max(0, cur - (CELLS - 2)));
      const view = g.slice(start, start + CELLS);

      // Overflow arrows take the edge cells when the entry runs off either side.
      if (start > 0) view[0] = "\u25C4";
      if (g.length > start + CELLS) view[CELLS - 1] = "\u25BA";
      drawMatrixText(view, 0, ON);

      // The cursor is an underline over the glyph it would insert in front of.
      cursorApplies = true;
      if (cursorVisible) drawMatrixText(["_"], cur - start, ON);
      if (numeric) drawNumber(numeric);
      return;
    }

    // Nothing being entered: a label such as "n=" sits on the matrix row,
    // plain messages are centred, otherwise only the cursor shows.
    if (label) {
      drawMatrixText(toGlyphs(label), 0, ON);
    } else if (M && !numeric) {
      const g = toGlyphs(M);
      drawMatrixText(g, Math.max(0, Math.floor((CELLS - g.length) / 2)), ON);
      return;
    } else {
      cursorApplies = true;
      if (cursorVisible) drawMatrixText(["_"], 0, ON);
    }
    if (numeric) drawNumber(numeric);
  }

  /* --------------------------- wiring ------------------------------------ */
  const mo = new MutationObserver(render);
  [inputEl, mainEl, indicatorsEl].forEach(el => {
    if (el) {
      mo.observe(el, {
        childList: true,
        characterData: true,
        subtree: true,
        // the entry also carries the editing cursor, as data-cursor(-text)
        attributes: true,
        attributeFilter: ["data-cursor", "data-cursor-text"]
      });
    }
  });
  new MutationObserver(render).observe(screen, { attributes: true, attributeFilter: ["class"] });
  if (window.ResizeObserver) {
    new ResizeObserver(render).observe(screen);
  } else {
    window.addEventListener("resize", render);
  }
  setInterval(() => {
    cursorVisible = !cursorVisible;
    if (cursorApplies) render();
  }, 530);
  render();
})();
