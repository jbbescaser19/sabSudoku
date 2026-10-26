(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const boardEl = $("board"),
    padEl = $("numberPad"),
    toastEl = $("toast");
  const STORE_KEY = "kawaii-sudoku-v1";
  const DEFAULT_BG = "./sab.png";
  let puzzle = [],
    solution = [],
    values = [],
    notes = [],
    selected = -1;
  let difficulty = "easy",
    mistakes = 0,
    hints = 3,
    notesMode = false,
    paused = false,
    finished = false;
  let seconds = 0,
    timerId = null,
    history = [],
    future = [],
    selectedNumber = 0;
  let showCounts = true,
    showConflicts = true,
    toastTimer;

  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function candidates(grid, r, c) {
    const used = new Set();
    for (let i = 0; i < 9; i++) {
      used.add(grid[r][i]);
      used.add(grid[i][c]);
    }
    const br = Math.floor(r / 3) * 3,
      bc = Math.floor(c / 3) * 3;
    for (let y = br; y < br + 3; y++)
      for (let x = bc; x < bc + 3; x++) used.add(grid[y][x]);
    return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((n) => !used.has(n));
  }
  function findEmpty(grid) {
    let best = null,
      opts = null;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (!grid[r][c]) {
          const cur = candidates(grid, r, c);
          if (!opts || cur.length < opts.length) {
            best = [r, c];
            opts = cur;
            if (cur.length <= 1) return { pos: best, opts };
          }
        }
    return best ? { pos: best, opts } : null;
  }
  function fillGrid(grid) {
    const empty = findEmpty(grid);
    if (!empty) return true;
    const [r, c] = empty.pos;
    for (const n of shuffle(empty.opts)) {
      grid[r][c] = n;
      if (fillGrid(grid)) return true;
      grid[r][c] = 0;
    }
    return false;
  }
  function countSolutions(grid, limit = 2) {
    const empty = findEmpty(grid);
    if (!empty) return 1;
    let count = 0;
    const [r, c] = empty.pos;
    for (const n of empty.opts) {
      grid[r][c] = n;
      count += countSolutions(grid, limit - count);
      grid[r][c] = 0;
      if (count >= limit) break;
    }
    return count;
  }
  function makePuzzle(level) {
    const solved = Array.from({ length: 9 }, () => Array(9).fill(0));
    fillGrid(solved);
    const grid = clone(solved);
    const target = { easy: 34, medium: 44, hard: 51 }[level];
    let removed = 0;
    for (const idx of shuffle([...Array(81).keys()])) {
      if (removed >= target) break;
      const r = Math.floor(idx / 9),
        c = idx % 9,
        old = grid[r][c];
      grid[r][c] = 0;
      const test = clone(grid);
      if (countSolutions(test) === 1) removed++;
      else grid[r][c] = old;
    }
    return { grid, solved };
  }
  function flat(grid) {
    return grid.flat();
  }
  function toGrid(arr) {
    return Array.from({ length: 9 }, (_, r) => arr.slice(r * 9, r * 9 + 9));
  }
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2300);
  }
  function fmtTime() {
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  }
  function startTimer() {
    clearInterval(timerId);
    timerId = setInterval(() => {
      if (!paused && !finished) {
        seconds++;
        $("timer").textContent = fmtTime();
        save();
      }
    }, 1000);
  }
  function stopTimer() {
    clearInterval(timerId);
  }
  function conflictAt(index, value, arr = values) {
    if (!value) return false;
    const r = Math.floor(index / 9),
      c = index % 9;
    for (let i = 0; i < 81; i++) {
      if (i === index || arr[i] !== value) continue;
      const rr = Math.floor(i / 9),
        cc = i % 9;
      if (
        rr === r ||
        cc === c ||
        (Math.floor(rr / 3) === Math.floor(r / 3) &&
          Math.floor(cc / 3) === Math.floor(c / 3))
      )
        return true;
    }
    return false;
  }
  function getCounts() {
    const counts = Array(10).fill(0);
    for (let i = 0; i < 81; i++)
      if (!puzzle[i]) {
        if (values[i]) counts[values[i]]++;
      }
    return counts;
  }
  function renderBoard() {
    boardEl.innerHTML = "";
    const counts = getCounts();
    for (let i = 0; i < 81; i++) {
      const r = Math.floor(i / 9),
        c = i % 9,
        cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.setAttribute("role", "gridcell");
      cell.setAttribute(
        "aria-label",
        `Row ${r + 1}, column ${c + 1}${values[i] ? `, ${values[i]}` : " empty"}${puzzle[i] ? ", original clue" : ""}`,
      );
      if (c === 2 || c === 5) cell.classList.add("box-right");
      if (r === 2 || r === 5) cell.classList.add("box-bottom");
      if (puzzle[i]) cell.classList.add("given");
      if (selected >= 0) {
        const sr = Math.floor(selected / 9),
          sc = selected % 9;
        if (
          i !== selected &&
          (r === sr ||
            c === sc ||
            (Math.floor(r / 3) === Math.floor(sr / 3) &&
              Math.floor(c / 3) === Math.floor(sc / 3)))
        )
          cell.classList.add("related");
        if (values[selected] && values[i] === values[selected])
          cell.classList.add("same-number");
      }
      if (i === selected) cell.classList.add("selected");
      if (showConflicts && values[i] && conflictAt(i, values[i]))
        cell.classList.add("conflict");
      if (values[i]) cell.textContent = values[i];
      else if (notes[i]?.length) {
        const noteBox = document.createElement("span");
        noteBox.className = "notes";
        for (let n = 1; n <= 9; n++) {
          const s = document.createElement("span");
          s.textContent = notes[i].includes(n) ? n : "";
          noteBox.append(s);
        }
        cell.append(noteBox);
      }
      cell.addEventListener("click", () => {
        selected = i;
        renderBoard();
      });
      boardEl.append(cell);
    }
    renderPad(counts);
  }
  function renderPad(counts = getCounts()) {
    padEl.innerHTML = "";
    for (let n = 1; n <= 9; n++) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "number-btn" + (selectedNumber === n ? " active" : "");
      btn.innerHTML =
        String(n) +
        (showCounts
          ? `<span class="remaining">${Math.max(0, 9 - counts[n])} left</span>`
          : "");
      btn.disabled = finished;
      btn.setAttribute("aria-label", `Enter ${n}`);
      btn.addEventListener("click", () => enterNumber(n));
      padEl.append(btn);
    }
  }
  function snapshot() {
    return {
      values: clone(values),
      notes: clone(notes),
      mistakes,
      hints,
      seconds,
    };
  }
  function record() {
    history.push(snapshot());
    if (history.length > 150) history.shift();
    future = [];
  }
  function applySnapshot(s) {
    values = clone(s.values);
    notes = clone(s.notes);
    mistakes = s.mistakes;
    hints = s.hints;
    seconds = s.seconds;
    updateStats();
    renderBoard();
    save();
  }
  function enterNumber(n) {
    if (paused || finished) return;
    if (selected < 0) {
      showToast("Tap an empty square first ♡");
      return;
    }
    if (puzzle[selected]) {
      showToast("That original number is locked ✨");
      return;
    }
    record();
    selectedNumber = n;
    if (notesMode) {
      notes[selected] = notes[selected] || [];
      notes[selected] = notes[selected].includes(n)
        ? notes[selected].filter((x) => x !== n)
        : [...notes[selected], n].sort();
      values[selected] = 0;
    } else {
      values[selected] = n;
      notes[selected] = [];
      if (n !== solution[selected]) {
        mistakes++;
        showToast("Not quite — try another number 💜");
      } else {
        for (let i = 0; i < 81; i++)
          if (notes[i]) notes[i] = notes[i].filter((x) => x !== n);
      }
    }
    updateStats();
    renderBoard();
    checkWin();
    save();
  }
  function erase() {
    if (paused || finished || selected < 0 || puzzle[selected]) return;
    if (!values[selected] && !notes[selected]?.length) return;
    record();
    values[selected] = 0;
    notes[selected] = [];
    renderBoard();
    save();
  }
  function undo() {
    if (!history.length || paused || finished) return;
    future.push(snapshot());
    applySnapshot(history.pop());
  }
  function redo() {
    if (!future.length || paused || finished) return;
    history.push(snapshot());
    applySnapshot(future.pop());
  }
  function updateStats() {
    $("timer").textContent = fmtTime();
    $("mistakes").textContent = `${mistakes} / 3`;
    $("hintsLeft").textContent = hints;
    $("notesState").textContent = notesMode ? "On" : "Off";
    $("notesBtn").classList.toggle("active", notesMode);
    $("notesBtn").setAttribute("aria-pressed", String(notesMode));
    $("undoBtn").disabled = !history.length;
    $("redoBtn").disabled = !future.length;
  }
  function checkWin() {
    if (values.every((v, i) => v === solution[i])) {
      finished = true;
      paused = false;
      stopTimer();
      $("winSummary").textContent =
        `Solved in ${fmtTime()} with ${mistakes} mistake${mistakes === 1 ? "" : "s"}. You’re amazing!`;
      $("winOverlay").classList.remove("hidden");
      showToast("Puzzle complete! So lovely! 🎉");
    }
  }
  function checkAnswers() {
    if (paused || finished) return;
    let wrong = 0,
      empty = 0;
    values.forEach((v, i) => {
      if (!v) empty++;
      else if (v !== solution[i]) wrong++;
    });
    if (!wrong && !empty) {
      checkWin();
      return;
    }
    if (wrong)
      showToast(
        `${wrong} number${wrong === 1 ? "" : "s"} ${wrong === 1 ? "needs" : "need"} another look 💗`,
      );
    else
      showToast(
        `Looking good! ${empty} empty square${empty === 1 ? "" : "s"} left ✨`,
      );
  }
  function hint() {
    if (paused || finished) return;
    if (hints <= 0) {
      showToast("No hints left this round — you can do it!");
      return;
    }
    if (selected < 0 || puzzle[selected]) {
      const idx = values.findIndex((v, i) => !puzzle[i] && v !== solution[i]);
      selected = idx >= 0 ? idx : values.findIndex((v, i) => !puzzle[i] && !v);
    }
    if (selected < 0) {
      showToast("Choose an empty square first ♡");
      return;
    }
    record();
    values[selected] = solution[selected];
    notes[selected] = [];
    hints--;
    selectedNumber = solution[selected];
    for (let i = 0; i < 81; i++)
      if (notes[i]) notes[i] = notes[i].filter((x) => x !== solution[selected]);
    updateStats();
    renderBoard();
    checkWin();
    save();
    showToast("A little hint, just for you 💡");
  }
  function pause() {
    if (finished) return;
    paused = !paused;
    $("pauseOverlay").classList.toggle("hidden", !paused);
    $("pauseBtn").textContent = paused ? "▶ Resume" : "Ⅱ Pause";
    if (paused) showToast("Paused — take your time 🌙");
  }
  function newGame(level = difficulty) {
    if (!confirm("Start a new puzzle? Your current puzzle will be replaced."))
      return;
    startNew(level);
  }
  function startNew(level) {
    difficulty = level;
    $("difficulty").value = level;
    const generated = makePuzzle(level);
    puzzle = flat(generated.grid);
    solution = flat(generated.solved);
    values = [...puzzle];
    notes = Array.from({ length: 81 }, () => []);
    selected = -1;
    selectedNumber = 0;
    mistakes = 0;
    hints = 3;
    notesMode = false;
    paused = false;
    finished = false;
    seconds = 0;
    history = [];
    future = [];
    $("pauseOverlay").classList.add("hidden");
    $("winOverlay").classList.add("hidden");
    $("pauseBtn").textContent = "Ⅱ Pause";
    updateStats();
    renderBoard();
    startTimer();
    save();
  }
  function restart() {
    if (!confirm("Restart this puzzle from the beginning?")) return;
    values = [...puzzle];
    notes = Array.from({ length: 81 }, () => []);
    selected = -1;
    mistakes = 0;
    hints = 3;
    seconds = 0;
    history = [];
    future = [];
    paused = false;
    finished = false;
    $("pauseOverlay").classList.add("hidden");
    $("winOverlay").classList.add("hidden");
    $("pauseBtn").textContent = "Ⅱ Pause";
    updateStats();
    renderBoard();
    startTimer();
    save();
  }
  function save() {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          puzzle,
          solution,
          values,
          notes,
          difficulty,
          mistakes,
          hints,
          seconds,
          showCounts,
          showConflicts,
          notesMode,
          background: localStorage.getItem(STORE_KEY + "_bg") || "",
        }),
      );
    } catch (e) {
      /* Storage may be disabled or full; the game remains playable. */
    }
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (
        !s ||
        !Array.isArray(s.puzzle) ||
        s.puzzle.length !== 81 ||
        !Array.isArray(s.solution) ||
        s.solution.length !== 81
      )
        return false;
      puzzle = s.puzzle;
      solution = s.solution;
      values =
        Array.isArray(s.values) && s.values.length === 81
          ? s.values
          : puzzle.slice();
      notes =
        Array.isArray(s.notes) && s.notes.length === 81
          ? s.notes
          : Array.from({ length: 81 }, () => []);
      difficulty = s.difficulty || "easy";
      mistakes = s.mistakes || 0;
      hints = Number.isInteger(s.hints) ? s.hints : 3;
      seconds = s.seconds || 0;
      showCounts = s.showCounts !== false;
      showConflicts = s.showConflicts !== false;
      notesMode = !!s.notesMode;
      $("difficulty").value = difficulty;
      $("countsToggle").checked = showCounts;
      $("conflictToggle").checked = showConflicts;
      const bg = localStorage.getItem(STORE_KEY + "_bg");
      if (bg)
        document.body.style.backgroundImage = `linear-gradient(135deg,rgba(230,218,255,.18),rgba(255,222,243,.14)),url("${bg}")`;
      return true;
    } catch (e) {
      return false;
    }
  }
  function setBackground(data) {
    try {
      localStorage.setItem(STORE_KEY + "_bg", data);
      document.body.style.backgroundImage = `linear-gradient(135deg,rgba(230,218,255,.18),rgba(255,222,243,.14)),url("${data}")`;
      showToast("Background updated! Looking cute ✨");
    } catch (e) {
      showToast("This image is too large to save. Try a smaller image.");
    }
  }
  $("eraseBtn").addEventListener("click", erase);
  $("undoBtn").addEventListener("click", undo);
  $("redoBtn").addEventListener("click", redo);
  $("hintBtn").addEventListener("click", hint);
  $("checkBtn").addEventListener("click", checkAnswers);
  $("pauseBtn").addEventListener("click", pause);
  $("resumeBtn").addEventListener("click", pause);
  $("newGameBtn").addEventListener("click", () => newGame());
  $("winNewBtn").addEventListener("click", () => startNew(difficulty));
  $("resetBtn").addEventListener("click", restart);
  $("notesBtn").addEventListener("click", () => {
    notesMode = !notesMode;
    updateStats();
  });
  $("difficulty").addEventListener("change", (e) => newGame(e.target.value));
  $("settingsBtn").addEventListener("click", () =>
    $("settingsDialog").showModal(),
  );
  $("fullscreenBtn").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement)
        await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (e) {
      showToast("Fullscreen isn't available in this browser.");
    }
  });
  $("backgroundUpload").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("Please choose an image under 5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setBackground(reader.result);
    reader.onerror = () =>
      showToast("Couldn't read that image. Try another one.");
    reader.readAsDataURL(file);
    e.target.value = "";
  });
  $("defaultBackgroundBtn").addEventListener("click", () => {
    localStorage.removeItem(STORE_KEY + "_bg");
    document.body.style.backgroundImage = `linear-gradient(135deg,rgba(230,218,255,.18),rgba(255,222,243,.14)),url("${DEFAULT_BG}")`;
    showToast("Default background restored ♡");
  });
  $("countsToggle").addEventListener("change", (e) => {
    showCounts = e.target.checked;
    renderBoard();
    save();
  });
  $("conflictToggle").addEventListener("change", (e) => {
    showConflicts = e.target.checked;
    renderBoard();
    save();
  });
  document.addEventListener("keydown", (e) => {
    if ($("settingsDialog").open) return;
    if (/^[1-9]$/.test(e.key)) {
      enterNumber(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete") {
      erase();
    } else if (
      e.key === "ArrowUp" ||
      e.key === "ArrowDown" ||
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight"
    ) {
      e.preventDefault();
      if (selected < 0) selected = 0;
      else if (e.key === "ArrowUp") selected = Math.max(0, selected - 9);
      else if (e.key === "ArrowDown") selected = Math.min(80, selected + 9);
      else if (e.key === "ArrowLeft") selected = Math.max(0, selected - 1);
      else selected = Math.min(80, selected + 1);
      renderBoard();
    } else if (e.key.toLowerCase() === "n") {
      notesMode = !notesMode;
      updateStats();
    } else if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undo();
    } else if (e.key.toLowerCase() === "y" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      redo();
    } else if (e.key === "Escape" && paused) pause();
  });
  if (!load()) {
    const generated = makePuzzle(difficulty);
    puzzle = flat(generated.grid);
    solution = flat(generated.solved);
    values = puzzle.slice();
    notes = Array.from({ length: 81 }, () => []);
  }
  updateStats();
  renderBoard();
  startTimer();
})();
