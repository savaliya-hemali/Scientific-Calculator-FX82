// recorder.js — record a run of key presses as a named "worked example" and
// play it back one step at a time.
//
// Recording works by snapshotting the whole calculator state (the two display
// lines plus every state variable in calculator.js) right after each press, so
// replay never re-runs the calculator logic — it just restores the state each
// press produced and lights up the key that produced it. Mouse clicks and the
// keyboard shortcuts are both picked up: the "before" state is read in the
// capture phase and the "after" state once calculator.js has handled the event.
//
// Examples are kept in localStorage, so they are still there after a reload.
(function () {
  "use strict";

  const STORAGE_KEY = "fx82ms_examples";
  const AUTOPLAY_MS = 1400;
  const FLASH_MS = 550;

  const calcEl = document.querySelector(".calculator");
  const panel = document.getElementById("recorder");
  if (!calcEl || !panel) return;

  const el = {
    toggle: document.getElementById("rec-toggle"),
    toggleLabel: document.getElementById("rec-toggle-label"),
    count: document.getElementById("rec-count"),
    naming: document.getElementById("rec-naming"),
    name: document.getElementById("rec-name"),
    save: document.getElementById("rec-save"),
    discard: document.getElementById("rec-discard"),
    list: document.getElementById("rec-list"),
    replay: document.getElementById("rec-replay"),
    replayTitle: document.getElementById("rec-replay-title"),
    replayStep: document.getElementById("rec-replay-step"),
    replayDots: document.getElementById("rec-replay-dots"),
    prev: document.getElementById("rec-prev"),
    play: document.getElementById("rec-play"),
    next: document.getElementById("rec-next"),
    exit: document.getElementById("rec-exit")
  };

  let recording = false;
  let steps = [];
  let startState = null;
  let examples = [];
  let replayExample = null;
  let replayIndex = -1;
  let replayReturn = null; // live state to put back when the replay ends
  let autoplayTimer = null;
  let splashTimer = null;

  /* --------------------------- state snapshots --------------------------- */

  // Everything calculator.js keeps between presses. `history` and `variables`
  // are const in calculator.js, so they are refilled in place on restore.
  function captureState() {
    return {
      input: inputElement.innerText,
      cursorPos,
      display: displayElement.innerText,
      shiftActive, alphaActive, hypActive, stoActive, rclActive,
      calculatorOn, calcMode, degMode, fixDigits, sciDigits,
      modeMenuState, lastAns, isErrorState, normMode,
      justEvaluated, fracShown, drgValue, historyIndex,
      variables: Object.assign({}, variables),
      statData: statData.slice(),
      regData: regData.map((d) => ({ x: d.x, y: d.y })),
      history: history.slice()
    };
  }

  function restoreState(s) {
    shiftActive = s.shiftActive;
    alphaActive = s.alphaActive;
    hypActive = s.hypActive;
    stoActive = s.stoActive;
    rclActive = s.rclActive;
    calculatorOn = s.calculatorOn;
    calcMode = s.calcMode;
    degMode = s.degMode;
    fixDigits = s.fixDigits;
    sciDigits = s.sciDigits;
    modeMenuState = s.modeMenuState;
    lastAns = s.lastAns;
    isErrorState = s.isErrorState;
    normMode = s.normMode;
    justEvaluated = s.justEvaluated;
    fracShown = s.fracShown;
    drgValue = s.drgValue;
    historyIndex = s.historyIndex;

    Object.keys(variables).forEach((k) => {
      variables[k] = s.variables && k in s.variables ? s.variables[k] : 0;
    });
    statData = (s.statData || []).slice();
    regData = (s.regData || []).map((d) => ({ x: d.x, y: d.y }));
    history.length = 0;
    (s.history || []).forEach((h) => history.push(h));

    if (screenElement) screenElement.classList.toggle("off", !calculatorOn);
    inputElement.innerText = s.input;
    setCursor(s.cursorPos === undefined ? s.input.length : s.cursorPos);
    displayElement.innerText = s.display;
    updateIndicators();
  }

  function sameState(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /* ------------------------------ key labels ----------------------------- */

  // face = what is printed on the key; the other entries are what that key
  // produces under SHIFT / ALPHA / hyp.
  const FUNC_KEYS = {
    reciprocal: { face: "x⁻¹", shift: "x!" },
    combin: { face: "nCr", shift: "nPr" },
    pol: { face: "Pol(", shift: "Rec(" },
    cube: { face: "x³", shift: "∛(" },
    frac: { face: "a b/c", shift: "d/c" },
    sqrt: { face: "√(" },
    square: { face: "x²" },
    pow: { face: "^", shift: "ˣ√" },
    log: { face: "log", shift: "10^(" },
    ln: { face: "ln", shift: "e^(", alpha: "e" },
    minus: { face: "(−)", alpha: "A" },
    deg: { face: "°′″", alpha: "B" },
    hyp: { face: "hyp", alpha: "C" },
    sin: { face: "sin", shift: "sin⁻¹(", alpha: "D", hyp: "sinh(", shiftHyp: "sinh⁻¹(" },
    cos: { face: "cos", shift: "cos⁻¹(", alpha: "E", hyp: "cosh(", shiftHyp: "cosh⁻¹(" },
    tan: { face: "tan", shift: "tan⁻¹(", alpha: "F", hyp: "tanh(", shiftHyp: "tanh⁻¹(" },
    rcl: { face: "RCL", shift: "STO" },
    eng: { face: "ENG" },
    "open-paren": { face: "(", shift: "," },
    "close-paren": { face: ")", alpha: "X" },
    comma: { face: ",", shift: ";", alpha: "Y" },
    "mem-plus": { face: "M+", shift: "M−", alpha: "M" },
    exp: { face: "EXP", shift: "π" },
    ans: { face: "Ans", shift: "DRG▸" }
  };

  const BASIC_KEYS = {
    8: { face: "DEL", shift: "INS" },
    27: { face: "AC", shift: "OFF" },
    13: { face: "=", shift: "%" },
    106: { face: "×" },
    191: { face: "÷" },
    187: { face: "+" },
    189: { face: "−" },
    48: { face: "0", shift: "Rnd" },
    49: { face: "1", shift: "S-SUM" },
    50: { face: "2", shift: "S-VAR" },
    190: { face: ".", shift: "Ran#" }
  };

  function keyInfo(btn) {
    const func = btn.getAttribute("data-func");
    if (func && FUNC_KEYS[func]) return FUNC_KEYS[func];
    const key = btn.getAttribute("data-key");
    if (key && BASIC_KEYS[key]) return BASIC_KEYS[key];
    return { face: btn.innerText.trim() };
  }

  // Reads the pre-press modifier flags plus the post-press globals, so a
  // modifier key can be labelled with the state it just switched to.
  function describe(btn, pre) {
    if (btn.id === "btn-shift") return "SHIFT " + (shiftActive ? "(on)" : "(off)");
    if (btn.id === "btn-alpha") return "ALPHA " + (alphaActive ? "(on)" : "(off)");
    if (btn.id === "btn-mode") return pre.shift ? "SHIFT + MODE  →  CLR" : "MODE";
    if (btn.id === "btn-on") return "ON";
    if (btn.classList.contains("nav")) {
      if (btn.classList.contains("up")) return "▲  (recall previous entry)";
      if (btn.classList.contains("down")) return "▼  (recall next entry)";
      return (btn.classList.contains("left") ? "◀" : "▶") + "  (move cursor)";
    }

    const info = keyInfo(btn);
    let prefix = "";
    let produced = null;

    if (pre.shift && pre.hyp && info.shiftHyp) {
      prefix = "SHIFT + hyp + ";
      produced = info.shiftHyp;
    } else if (pre.shift) {
      prefix = "SHIFT + ";
      produced = info.shift;
    } else if (pre.alpha) {
      prefix = "ALPHA + ";
      produced = info.alpha;
    } else if (pre.hyp && info.hyp) {
      prefix = "hyp + ";
      produced = info.hyp;
    }

    return prefix + info.face + (produced ? "  →  " + produced : "");
  }

  // A selector is stored rather than an index, so saved examples keep working
  // if keys are moved around in the markup.
  function selectorFor(btn) {
    if (btn.id) return "#" + btn.id;
    const func = btn.getAttribute("data-func");
    if (func) return 'button[data-func="' + func + '"]';
    const key = btn.getAttribute("data-key");
    if (key) return 'button[data-key="' + key + '"]';
    if (btn.classList.contains("nav")) {
      return "." + Array.prototype.slice.call(btn.classList)
        .filter((c) => c !== "active" && c !== "rec-flash").join(".");
    }
    return null;
  }

  /* ------------------------- catching the presses ------------------------ */

  function preState() {
    return {
      shift: shiftActive,
      alpha: alphaActive,
      hyp: hypActive,
      on: calculatorOn,
      state: captureState()
    };
  }

  function afterPress(btn, pre, fallbackLabel) {
    if (replayExample) exitReplay(false); // a live press takes over from the replay
    if (!recording || !pre) return;

    const state = captureState();
    if (sameState(state, pre.state)) return; // key did nothing — not worth a step

    const step = {
      sel: btn ? selectorFor(btn) : null,
      label: btn ? describe(btn, pre) : fallbackLabel || "key",
      state
    };
    steps.push(step);
    updateCount();

    // ON shows "CASIO" and clears itself ~450ms later; re-snapshot after that
    // so the step replays as the cleared display the user actually ends up on.
    if (!pre.on && calculatorOn) {
      clearTimeout(splashTimer);
      splashTimer = setTimeout(() => {
        if (steps[steps.length - 1] === step) step.state = captureState();
      }, 500);
    }
  }

  function calcButtonFrom(target) {
    if (!target || !target.closest) return null;
    const btn = target.closest("button");
    return btn && calcEl.contains(btn) ? btn : null;
  }

  let clickPre = null;
  document.addEventListener("click", (e) => {
    clickPre = calcButtonFrom(e.target) ? preState() : null;
  }, true);
  // Bubbles up to document after the .calculator click handler in calculator.js
  document.addEventListener("click", (e) => {
    const btn = calcButtonFrom(e.target);
    if (btn && clickPre) afterPress(btn, clickPre, null);
    clickPre = null;
  });

  const KEY_BUTTONS = {
    "+": 'button[data-key="187"]',
    "-": 'button[data-key="189"]',
    "*": 'button[data-key="106"]',
    x: 'button[data-key="106"]',
    "/": 'button[data-key="191"]',
    ".": ".period",
    "(": ".open-paren",
    ")": ".close-paren",
    "^": ".pow",
    "!": ".reciprocal",
    "%": ".equals",
    ",": ".comma",
    ";": ".comma",
    "=": ".equals",
    Enter: ".equals",
    Backspace: ".del",
    Escape: ".ac",
    ArrowUp: ".nav.up",
    ArrowDown: ".nav.down",
    ArrowLeft: ".nav.left",
    ArrowRight: ".nav.right",
    s: ".sin",
    c: ".cos",
    t: ".tan",
    l: ".log",
    n: ".ln",
    r: ".sqrt",
    p: ".exp",
    m: "#btn-mode"
  };

  // Keys calculator.js handles without going through a button of that name
  const KEY_LABELS = { r: "√(", p: "π" };

  function keyEventTargetsCalc(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return false;
    if (e.target && e.target.tagName === "INPUT") return false;
    return true;
  }

  function buttonForKey(key) {
    if (key >= "0" && key <= "9") {
      return calcEl.querySelector('button[data-key="' + (48 + Number(key)) + '"]');
    }
    const sel = KEY_BUTTONS[key] || KEY_BUTTONS[key.toLowerCase()];
    return sel ? calcEl.querySelector(sel) : null;
  }

  let keyPre = null;
  window.addEventListener("keydown", (e) => {
    keyPre = keyEventTargetsCalc(e) && e.key !== "Shift" ? preState() : null;
  }, true);
  // Registered after the keydown handler in calculator.js, so it sees the result
  window.addEventListener("keydown", (e) => {
    if (!keyPre) return;
    const override = KEY_LABELS[e.key] || KEY_LABELS[e.key.toLowerCase()];
    afterPress(override ? null : buttonForKey(e.key), keyPre, override || e.key);
    keyPre = null;
  });

  // A plain tap on the physical Shift toggles SHIFT on keyup
  let shiftKeyPre = null;
  window.addEventListener("keyup", (e) => {
    shiftKeyPre = e.key === "Shift" && keyEventTargetsCalc(e) ? preState() : null;
  }, true);
  window.addEventListener("keyup", (e) => {
    if (!shiftKeyPre) return;
    afterPress(document.getElementById("btn-shift"), shiftKeyPre, "SHIFT");
    shiftKeyPre = null;
  });

  /* ------------------------------ recording ------------------------------ */

  function updateCount() {
    el.count.textContent = steps.length
      ? steps.length + (steps.length === 1 ? " step" : " steps") + " recorded"
      : "0 steps recorded";
  }

  function toggleRecord() {
    if (replayExample) exitReplay(true);

    if (!recording) {
      recording = true;
      steps = [];
      // start every example from a known state
      if (!calculatorOn) {
        turnOn();
        setTimeout(() => { startState = captureState(); }, 500);
      } else {
        clearDisplay();
      }
      startState = captureState();
      panel.classList.add("is-recording");
      el.toggleLabel.textContent = "Stop recording";
      el.naming.hidden = true;
      updateCount();
      return;
    }

    recording = false;
    panel.classList.remove("is-recording");
    el.toggleLabel.textContent = "Record example";
    if (!steps.length) {
      el.count.textContent = "";
      return;
    }
    el.naming.hidden = false;
    el.name.value = "";
    el.name.focus();
  }

  function saveExample() {
    if (!steps.length) return;
    const name = el.name.value.trim() || "Example " + (examples.length + 1);
    examples.push({ name, start: startState, steps });
    steps = [];
    el.naming.hidden = true;
    el.count.textContent = "";
    persist();
    renderList();
  }

  function discardRecording() {
    steps = [];
    el.naming.hidden = true;
    el.count.textContent = "";
  }

  function deleteExample(index) {
    if (replayExample === examples[index]) exitReplay(true);
    examples.splice(index, 1);
    persist();
    renderList();
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(examples));
    } catch (err) {
      /* storage unavailable — examples stay for this session only */
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        examples = parsed.filter(
          (ex) => ex && typeof ex.name === "string" && Array.isArray(ex.steps) && ex.steps.length
        );
      }
    } catch (err) {
      examples = [];
    }
    renderList();
  }

  function renderList() {
    el.list.textContent = "";
    if (!examples.length) {
      const empty = document.createElement("div");
      empty.className = "rec-empty";
      empty.textContent = "No saved examples yet — record one above.";
      el.list.appendChild(empty);
      return;
    }

    examples.forEach((ex, index) => {
      const row = document.createElement("div");
      row.className = "rec-item";

      const play = document.createElement("button");
      play.type = "button";
      play.className = "rec-play-name";
      play.textContent = "▶ " + ex.name;
      play.addEventListener("click", () => startReplay(index));

      const count = document.createElement("span");
      count.className = "rec-steps";
      count.textContent = ex.steps.length + " steps";

      const del = document.createElement("button");
      del.type = "button";
      del.className = "rec-delete";
      del.title = "Delete example";
      del.textContent = "✕";
      del.addEventListener("click", () => deleteExample(index));

      row.append(play, count, del);
      el.list.appendChild(row);
    });
  }

  /* ------------------------------- replay -------------------------------- */

  function startReplay(index) {
    const ex = examples[index];
    if (!ex) return;
    if (recording) toggleRecord(); // recording and replaying at once makes no sense
    if (!replayExample) replayReturn = captureState();

    stopAutoplay();
    replayExample = ex;
    replayIndex = 0;

    el.replay.hidden = false;
    el.replayTitle.textContent = ex.name;
    el.replayDots.textContent = "";
    ex.steps.forEach(() => el.replayDots.appendChild(document.createElement("i")));

    applyStep();
  }

  function applyStep() {
    const step = replayExample.steps[replayIndex];
    if (!step) return;

    restoreState(step.state);

    el.replayStep.textContent =
      "Step " + (replayIndex + 1) + " / " + replayExample.steps.length + ":  " + step.label;

    Array.prototype.forEach.call(el.replayDots.children, (dot, i) => {
      dot.classList.toggle("done", i < replayIndex);
      dot.classList.toggle("current", i === replayIndex);
    });

    flash(step.sel);
  }

  function flash(sel) {
    if (!sel) return;
    let btn = null;
    try {
      btn = calcEl.querySelector(sel);
    } catch (err) {
      return; // selector from an older save that no longer parses
    }
    if (!btn) return;
    btn.classList.remove("rec-flash");
    void btn.offsetWidth; // restart the glow when the same key repeats
    btn.classList.add("rec-flash");
    setTimeout(() => btn.classList.remove("rec-flash"), FLASH_MS);
  }

  function replayNext() {
    if (!replayExample) return;
    if (replayIndex < replayExample.steps.length - 1) {
      replayIndex++;
      applyStep();
    } else {
      stopAutoplay();
    }
  }

  function replayPrev() {
    if (!replayExample || replayIndex <= 0) return;
    replayIndex--;
    applyStep();
  }

  function toggleAutoplay() {
    if (!replayExample) return;
    if (autoplayTimer) {
      stopAutoplay();
      return;
    }
    if (replayIndex >= replayExample.steps.length - 1) {
      replayIndex = 0;
      applyStep();
    }
    el.play.textContent = "❚❚ Pause";
    autoplayTimer = setInterval(replayNext, AUTOPLAY_MS);
  }

  function stopAutoplay() {
    if (autoplayTimer) {
      clearInterval(autoplayTimer);
      autoplayTimer = null;
    }
    el.play.textContent = "▶ Play";
  }

  function exitReplay(restore) {
    stopAutoplay();
    replayExample = null;
    replayIndex = -1;
    el.replay.hidden = true;
    if (restore && replayReturn) restoreState(replayReturn);
    replayReturn = null;
  }

  /* ------------------------------- wiring -------------------------------- */

  el.toggle.addEventListener("click", toggleRecord);
  el.save.addEventListener("click", saveExample);
  el.discard.addEventListener("click", discardRecording);
  el.prev.addEventListener("click", replayPrev);
  el.play.addEventListener("click", toggleAutoplay);
  el.next.addEventListener("click", replayNext);
  el.exit.addEventListener("click", () => exitReplay(true));
  el.name.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveExample();
  });

  load();
})();
