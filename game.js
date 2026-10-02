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
  activeSkin.drawBlock(context, x, y, colorIndex, size, alpha ?? 1);
}

function drawGrid() {
  ctx.strokeStyle = activeSkin.gridColor || gridColor;
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
  paintBackground(ctx, canvas);
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
  paintBackground(nextCtx, nextCanvas);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

// ---- Skins ----
const SKIN_KEY = 'tetris-skin';
const skinSelect = document.getElementById('skin-select');

// Traza un rectángulo redondeado; usa ctx.roundRect si existe y, si no, arcos.
function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (typeof context.roundRect === 'function') {
    context.roundRect(x, y, w, h, r);
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Bloque neón pre-renderizado (con brillo) en un canvas fuera de pantalla.
const neonSprites = new Map();
function neonSprite(color, size, pad) {
  const key = `${color}|${size}`;
  let sprite = neonSprites.get(key);
  if (sprite) return sprite;
  sprite = document.createElement('canvas');
  sprite.width = sprite.height = size + pad * 2;
  const g = sprite.getContext('2d');
  const px = pad + 2;
  const s = size - 4;
  g.shadowColor = color;
  g.shadowBlur = size * 0.5;
  g.fillStyle = color;
  g.fillRect(px, px, s, s);
  g.shadowBlur = 0;
  g.shadowColor = 'transparent';
  // Núcleo oscuro y borde claro: efecto de tubo de neón.
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(px + 4, px + 4, s - 8, s - 8);
  g.strokeStyle = 'rgba(255,255,255,0.75)';
  g.lineWidth = 1;
  g.strokeRect(px + 0.5, px + 0.5, s - 1, s - 1);
  neonSprites.set(key, sprite);
  return sprite;
}

const SKINS = {
  retro: {
    name: 'Retro',
    colors: COLORS,
    boardBg: null,
    gridColor: null,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      context.globalAlpha = alpha;
      context.fillStyle = this.colors[colorIndex];
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      // highlight
      context.fillStyle = 'rgba(255,255,255,0.12)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
      context.globalAlpha = 1;
    },
  },
  neon: {
    name: 'Neón',
    colors: [
      null,
      '#00f0ff', // I
      '#fff200', // O
      '#d500ff', // T
      '#39ff14', // S
      '#ff1744', // Z
      '#2979ff', // J
      '#ff9100', // L
    ],
    boardBg: '#000000',
    gridColor: '#101826',
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const color = this.colors[colorIndex];
      const px = x * size + 2;
      const py = y * size + 2;
      const s = size - 4;
      if (alpha < 1) {
        // Fantasma: solo un contorno tenue, sin brillo.
        context.globalAlpha = Math.min(1, alpha * 2);
        context.strokeStyle = color;
        context.lineWidth = 1;
        context.strokeRect(px + 0.5, py + 0.5, s - 1, s - 1);
        context.globalAlpha = 1;
        return;
      }
      // El brillo (shadowBlur) es caro: se pinta una vez por color y tamaño y se reutiliza.
      const pad = Math.ceil(size / 2);
      context.drawImage(neonSprite(color, size, pad), x * size - pad, y * size - pad);
    },
  },
  pastel: {
    name: 'Pastel',
    colors: [
      null,
      '#a0e7e5', // I
      '#fff1a8', // O
      '#d7b9f5', // T
      '#b5ead7', // S
      '#ffb7b2', // Z
      '#aec6f4', // J
      '#ffd3b0', // L
    ],
    boardBg: null,
    gridColor: null,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const px = x * size + 2;
      const py = y * size + 2;
      const s = size - 4;
      const r = Math.round(size * 0.22);
      context.globalAlpha = alpha;
      context.fillStyle = this.colors[colorIndex];
      roundedRectPath(context, px, py, s, s, r);
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.12)';
      context.lineWidth = 1;
      context.stroke();
      // Brillo suave en la parte superior.
      context.fillStyle = 'rgba(255,255,255,0.35)';
      roundedRectPath(context, px + 3, py + 3, s - 6, Math.round(s * 0.3), Math.max(1, r - 2));
      context.fill();
      context.globalAlpha = 1;
    },
  },
  pixel: {
    name: 'Pixel art',
    colors: [
      null,
      '#38c0f8', // I
      '#f8d830', // O
      '#a050f0', // T
      '#58d858', // S
      '#f04848', // Z
      '#4878f8', // J
      '#f89838', // L
    ],
    boardBg: null,
    gridColor: null,
    drawBlock(context, x, y, colorIndex, size, alpha) {
      const p = Math.max(1, Math.round(size / 10)); // tamaño de cada "pixel"
      const x0 = x * size + 1;
      const y0 = y * size + 1;
      const s = size - 2;
      context.globalAlpha = alpha;
      context.fillStyle = this.colors[colorIndex];
      context.fillRect(x0, y0, s, s);
      // Bisel: luz arriba/izquierda, sombra abajo/derecha.
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.fillRect(x0, y0, s, p);
      context.fillRect(x0, y0, p, s);
      context.fillStyle = 'rgba(0,0,0,0.4)';
      context.fillRect(x0, y0 + s - p, s, p);
      context.fillRect(x0 + s - p, y0, p, s);
      // Brillo en la esquina superior izquierda.
      context.fillStyle = 'rgba(255,255,255,0.8)';
      context.fillRect(x0 + p, y0 + p, p, p);
      // Tramado (dither) en damero sobre la mitad inferior derecha.
      context.fillStyle = 'rgba(0,0,0,0.2)';
      const cells = Math.floor((s - 2 * p) / p);
      for (let i = 0; i < cells; i++)
        for (let j = 0; j < cells; j++)
          if ((i + j) % 2 === 0 && i + j >= cells)
            context.fillRect(x0 + p + i * p, y0 + p + j * p, p, p);
      context.globalAlpha = 1;
    },
  },
};

let activeSkin = SKINS.retro;

function paintBackground(context, cvs) {
  context.clearRect(0, 0, cvs.width, cvs.height);
  if (activeSkin.boardBg) {
    context.fillStyle = activeSkin.boardBg;
    context.fillRect(0, 0, cvs.width, cvs.height);
  }
}

// Redibuja tablero y pieza siguiente aunque el bucle esté parado (pausa / game over).
function redrawSkin() {
  if (board && current) draw();
  if (next) drawNext();
}

function applySkin(id) {
  const key = Object.prototype.hasOwnProperty.call(SKINS, id) ? id : 'retro';
  activeSkin = SKINS[key];
  document.body.dataset.skin = key;
  if (skinSelect) skinSelect.value = key;
  redrawSkin();
  return key;
}

function initSkin() {
  if (skinSelect) {
    for (const [id, skin] of Object.entries(SKINS)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = skin.name;
      skinSelect.appendChild(opt);
    }
    skinSelect.addEventListener('change', () => {
      const key = applySkin(skinSelect.value);
      try { localStorage.setItem(SKIN_KEY, key); } catch (_) { /* almacenamiento no disponible */ }
      skinSelect.blur();
    });
    // P (pausa) y Escape devuelven el foco al juego en vez de hacer búsqueda por letra en el selector.
    skinSelect.addEventListener('keydown', e => {
      if (e.code === 'KeyP' || e.code === 'Escape') {
        e.preventDefault();
        skinSelect.blur();
      }
    });
  }
  let saved = null;
  try { saved = localStorage.getItem(SKIN_KEY); } catch (_) { /* almacenamiento no disponible */ }
  applySkin(saved);
}

initSkin();

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

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
  animId = requestAnimationFrame(loop);
}

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  const label = theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro';
  themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeToggleBtn.setAttribute('aria-label', label);
  themeToggleBtn.title = label;
  // Las variables del modo claro están en body.light-theme, así que se leen desde body.
  gridColor = getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeToggleBtn.addEventListener('click', () => {
  const theme = document.body.classList.contains('light-theme') ? 'dark' : 'light';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
  redrawSkin();
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
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // No mover piezas mientras se usa un control de formulario (p. ej. el selector de skin).
  if (document.activeElement && document.activeElement.matches('select, input, textarea')) return;
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

init();
