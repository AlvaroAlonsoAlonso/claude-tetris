'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - light blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

const THEME_KEY = 'tetris-theme';

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, gridColor;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  trackCombo(cleared);
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

// ---- Records ----
const RECORDS_KEY = 'tetris-records';
const STATS_KEY = 'tetris-stats';
const MAX_RECORDS = 5;
const NAME_MAX_LENGTH = 12;
const DEFAULT_PLAYER_NAME = 'Jugador';

const startScreen = document.getElementById('start-screen');
const startRecordsEl = document.getElementById('start-records');
const playBtn = document.getElementById('play-btn');
const gameoverRecordsEl = document.getElementById('gameover-records');
const recordHighlight = document.getElementById('record-highlight');
const recordForm = document.getElementById('record-form');
const recordNameInput = document.getElementById('record-name');
const resetRecordsBtn = document.getElementById('reset-records-btn');

let combo = 0;               // consecutive locks that cleared at least one line
let maxCombo = 0;            // best combo of the current game
let pendingRecord = null;    // { score, lines, combo } waiting for a name
let savedRecordIndex = -1;   // row to highlight after saving
let newStatFlags = { bestCombo: false, maxLines: false };

function toNonNegInt(v) {
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

function readJSON(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function loadRecords() {
  const data = readJSON(RECORDS_KEY);
  if (!Array.isArray(data)) return [];
  return data
    .filter(r => r && typeof r === 'object' && typeof r.name === 'string' &&
      Number.isFinite(r.score) && r.score > 0)
    .map(r => ({
      name: r.name.slice(0, NAME_MAX_LENGTH) || DEFAULT_PLAYER_NAME,
      score: Math.floor(r.score),
      lines: toNonNegInt(r.lines),
      combo: toNonNegInt(r.combo),
      date: typeof r.date === 'string' ? r.date : '',
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RECORDS);
}

function loadStats() {
  const data = readJSON(STATS_KEY);
  const obj = data && typeof data === 'object' ? data : {};
  return { bestCombo: toNonNegInt(obj.bestCombo), maxLines: toNonNegInt(obj.maxLines) };
}

// Position (0-based) a score would take in the table, or -1 if it does not qualify.
function recordRank(value, records) {
  if (!(value > 0)) return -1;
  let idx = records.findIndex(r => value > r.score);
  if (idx === -1) idx = records.length;
  return idx < MAX_RECORDS ? idx : -1;
}

function trackCombo(cleared) {
  if (cleared > 0) {
    combo++;
    if (combo > maxCombo) maxCombo = combo;
  } else {
    combo = 0;
  }
}

function resetRecordsState() {
  // A qualifying score left unsaved (Reiniciar without Guardar) is kept with the typed or default name.
  commitPendingRecord();
  combo = 0;
  maxCombo = 0;
  pendingRecord = null;
  savedRecordIndex = -1;
  newStatFlags = { bestCombo: false, maxLines: false };
  overlay.classList.remove('is-gameover');
  startScreen.classList.add('hidden');
  // Avoid a focused button (Jugar/Reiniciar) reacting to Space during play.
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
}

function formatRecordDate(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-ES');
}

function renderRecordsPanel(container, records, stats, highlightIndex, flags) {
  container.replaceChildren();

  if (!records.length) {
    const empty = document.createElement('p');
    empty.className = 'records-empty';
    empty.textContent = 'Aún no hay records. ¡Sé el primero!';
    container.appendChild(empty);
  } else {
    const table = document.createElement('table');
    table.className = 'records-table';
    const headRow = table.createTHead().insertRow();
    for (const h of ['#', 'Nombre', 'Puntos', 'Líneas', 'Combo']) {
      const th = document.createElement('th');
      th.textContent = h;
      headRow.appendChild(th);
    }
    const tbody = table.createTBody();
    records.forEach((r, i) => {
      const tr = tbody.insertRow();
      if (i === highlightIndex) tr.className = 'record-new';
      const date = formatRecordDate(r.date);
      if (date) tr.title = date;
      for (const v of [i + 1, r.name, r.score.toLocaleString(), r.lines, r.combo]) {
        tr.insertCell().textContent = String(v);
      }
    });
    container.appendChild(table);
  }

  const statsEl = document.createElement('div');
  statsEl.className = 'records-stats';
  const items = [
    ['MEJOR COMBO', stats.bestCombo, flags && flags.bestCombo],
    ['LÍNEAS MÁX.', stats.maxLines, flags && flags.maxLines],
  ];
  for (const [label, value, isNew] of items) {
    const item = document.createElement('div');
    item.className = 'records-stat' + (isNew ? ' is-new' : '');
    const l = document.createElement('span');
    l.className = 'label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'records-stat-value';
    v.textContent = String(value);
    item.append(l, v);
    if (isNew) {
      const badge = document.createElement('span');
      badge.className = 'records-stat-badge';
      badge.textContent = '¡nuevo!';
      item.appendChild(badge);
    }
    statsEl.appendChild(item);
  }
  container.appendChild(statsEl);
}

function refreshGameOverRecords(records = loadRecords()) {
  const rank = pendingRecord ? recordRank(pendingRecord.score, records) : -1;
  const shownRank = rank !== -1 ? rank : savedRecordIndex;
  recordForm.classList.toggle('hidden', rank === -1);
  recordHighlight.classList.toggle('hidden', shownRank === -1);
  recordHighlight.textContent = shownRank === -1 ? '' : `¡Nuevo récord! Puesto #${shownRank + 1}`;
  renderRecordsPanel(gameoverRecordsEl, records, loadStats(), savedRecordIndex, newStatFlags);
}

function showGameOverRecords() {
  const stats = loadStats();
  newStatFlags = { bestCombo: maxCombo > stats.bestCombo, maxLines: lines > stats.maxLines };
  if (newStatFlags.bestCombo || newStatFlags.maxLines) {
    writeJSON(STATS_KEY, {
      bestCombo: Math.max(stats.bestCombo, maxCombo),
      maxLines: Math.max(stats.maxLines, lines),
    });
  }
  pendingRecord = { score, lines, combo: maxCombo };
  savedRecordIndex = -1;
  overlay.classList.add('is-gameover');
  recordNameInput.value = '';
  refreshGameOverRecords();
  if (!recordForm.classList.contains('hidden')) recordNameInput.focus();
}

// Inserts the pending record (if it still qualifies) and persists it.
// Returns { records, rank, stored }; rank is -1 when nothing was inserted.
function commitPendingRecord() {
  const records = loadRecords();
  if (!pendingRecord) return { records, rank: -1, stored: false };
  const rank = recordRank(pendingRecord.score, records);
  let stored = false;
  if (rank !== -1) {
    const name = recordNameInput.value.trim().slice(0, NAME_MAX_LENGTH) || DEFAULT_PLAYER_NAME;
    records.splice(rank, 0, {
      name,
      score: pendingRecord.score,
      lines: pendingRecord.lines,
      combo: pendingRecord.combo,
      date: new Date().toISOString(),
    });
    records.length = Math.min(records.length, MAX_RECORDS);
    stored = writeJSON(RECORDS_KEY, records);
  }
  pendingRecord = null;
  return { records, rank, stored };
}

function savePendingRecord() {
  if (!pendingRecord) return;
  const { records, rank, stored } = commitPendingRecord();
  savedRecordIndex = rank;
  refreshGameOverRecords(records);
  if (rank !== -1 && !stored) recordHighlight.textContent += ' (no se pudo guardar)';
  restartBtn.focus();
}

function showStartScreen() {
  renderRecordsPanel(startRecordsEl, loadRecords(), loadStats(), -1, null);
  startScreen.classList.remove('hidden');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();
}

recordNameInput.maxLength = NAME_MAX_LENGTH;
recordNameInput.placeholder = DEFAULT_PLAYER_NAME;

recordForm.addEventListener('submit', e => {
  e.preventDefault();
  savePendingRecord();
});

// Keep typing in the name field (Space, P, arrows...) away from the game controls.
recordNameInput.addEventListener('keydown', e => e.stopPropagation());

resetRecordsBtn.addEventListener('click', () => {
  if (!confirm('¿Borrar todos los records y estadísticas? Esta acción no se puede deshacer.')) return;
  try {
    localStorage.removeItem(RECORDS_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch {
    // storage unavailable: nothing to clear
  }
  savedRecordIndex = -1;
  newStatFlags = { bestCombo: false, maxLines: false };
  refreshGameOverRecords([]);
  if (!recordForm.classList.contains('hidden')) recordNameInput.focus();
});

playBtn.addEventListener('click', init);

// Redraw the empty board with the new grid color if the theme changes on the start screen.
// Deferred so the theme listener (registered later) has already updated gridColor.
themeToggleBtn.addEventListener('click', () => {
  requestAnimationFrame(() => {
    if (!startScreen.classList.contains('hidden')) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawGrid();
    }
  });
});

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  // Stop after a gravity-triggered game over so endGame() does not fire again every tick.
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  const label = theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggleBtn.setAttribute('aria-label', label);
  themeToggleBtn.title = label;
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid-line').trim();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggleBtn.addEventListener('click', () => {
  const theme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

initTheme();

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  resetRecordsState();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

// Start-up: show the start screen; the game stays inert (gameOver) until "Jugar".
gameOver = true;
showStartScreen();
