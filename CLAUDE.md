# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla-JS Tetris using HTML5 Canvas. No `package.json`, no build, no bundler, no tests, no linter. The UI text and README are in Spanish; keep user-facing strings in Spanish (e.g. "Puntuación", "Reiniciar") to match.

## Running

Open `index.html` directly in a browser, or serve the folder statically (e.g. `python -m http.server 8000`, then visit `http://localhost:8000`). Verification is manual, by playing the game in the browser.

## Architecture

Everything lives in three files that must stay in sync:

- `index.html` — two canvases (`#board` 300×600, `#next-canvas` 120×120), HUD elements (`#score`, `#lines`, `#level`), and `#overlay` (shared by PAUSA and GAME OVER, toggled with the `hidden` class). `game.js` looks these up by id at load time, so renaming an id breaks the script.
- `style.css` — dark/retro theme.
- `game.js` — the whole game as a single script with module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …), all reset by `init()`.

Key design points in `game.js`:

- The board is a `ROWS×COLS` matrix of `0` or a color/piece index 1–7. `COLORS[i]` and `PIECES[i]` share that index, and index 0 is `null` in both arrays. Piece matrices store their own index as the cell value.
- Pieces are `{ type, shape, x, y }`. Rotation is `rotateCW` (transpose plus row reverse) followed by `tryRotate`, which tries horizontal kicks `[0, -1, 1, -2, 2]`. There is no SRS table and no floor kick.
- `collide(shape, ox, oy)` is the single collision check, used for movement, rotation, spawn (game over) and `ghostY`. It allows `ny < 0` (above the board) but rejects out-of-range x and `ny >= ROWS`.
- Piece lifecycle: `lockPiece()` runs `merge()`, then `clearLines()`, then `spawn()`. `spawn()` promotes `next` to `current`, generates a new `next`, and calls `endGame()` if the new piece collides immediately. `randomPiece()` is uniform random with no 7-bag.
- Timing: `loop` is a `requestAnimationFrame` loop that accumulates `dropAccum` against `dropInterval`. `clearLines` recomputes level (`floor(lines/10)+1`) and `dropInterval` (`max(100, 1000-(level-1)*90)`). Soft drop gives +1 per row and hard drop +2 per row, added outside `LINE_SCORES`.
- Input is a single `keydown` listener that handles `P` even while paused and ignores everything else when `paused` or `gameOver`.
- Pause and game over stop the loop with `cancelAnimationFrame(animId)`. Pause resets `lastTime` on resume so `dt` does not spike. Note that when `endGame()` fires from inside `loop` (gravity lock), `loop` still schedules another frame afterwards, so the loop keeps drawing after game over. Input is still blocked by the `gameOver` flag.

## Changing board size

`COLS`, `ROWS` and `BLOCK` in `game.js` must match the `width`/`height` attributes of `<canvas id="board">` in `index.html` (`COLS*BLOCK` × `ROWS*BLOCK`). The `#next-canvas` preview assumes a 4×4 grid of 30px blocks (`NB = 30` in `drawNext`).
