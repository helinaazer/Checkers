# Technical Spec: Checkers — 8-Piece Variant

Companion to [PRD.md](PRD.md), which covers product requirements and rules. This document specifies the implementation: file layout, data model, state machine, and function contracts, as currently implemented in `game.js`, `index.html`, and `style.css`.

## File Layout
| File | Responsibility |
|---|---|
| `index.html` | DOM skeleton: board container, status bar, captured-piece counters, message area. |
| `style.css` | All visual styling: board/square/piece rendering, selection and legal-move indicators. |
| `game.js` | All game logic, state, and rendering. No external dependencies. |

## Constants
```js
BOARD_SIZE = 8                          // 8x8 board
PIECE_ROWS = 2                          // rows of pieces per side at start (8 pieces/side)
HOME_ROW = { black: 0, red: 7 }         // each side's back row, for reinforcement checks

AI_SEARCH_DEPTH = 6                     // minimax plies (full turns) of lookahead
AI_THINK_DELAY_MS = 400                 // pause before the computer's first step
AI_STEP_DELAY_MS = 350                  // pause between chained-jump steps
PIECE_VALUE = 1, KING_VALUE = 1.6, ADVANCE_WEIGHT = 0.05   // evaluation weights
```

## Data Model

### Board
`board` is an 8x8 array of arrays (`board[row][col]`). Row 0 is Black's starting edge; row 7 is Red's. Only dark squares (`(row + col) % 2 === 1`) ever hold a piece; light squares are always `null`.

Each cell is either `null` or a piece object:
```js
{ color: 'black' | 'red', king: boolean }
```

### Move
A move object produced by move-generation functions:
```js
{
  fromRow, fromCol,        // origin square
  toRow, toCol,             // destination square
  captureRow, captureCol    // present only on capture moves — the jumped piece's square
}
```
A move is a capture iff `captureRow !== undefined`.

### Global State
| Variable | Type | Meaning |
|---|---|---|
| `board` | `Cell[8][8]` | current board position |
| `currentPlayer` | `'black' \| 'red'` | player to move |
| `selected` | `{row, col} \| null` | currently selected piece |
| `legalMoves` | `Move[]` | all legal moves for `currentPlayer` this turn (captures only, if any exist) |
| `forcedPiece` | `{row, col} \| null` | set during a multi-jump; only this piece may move |
| `capturedCounts` | `{black, red}` | pieces captured **by** each color |
| `reinforced` | `{black, red}` | whether each side's one-time reinforcement has already fired |
| `gameOver` | `boolean` | true once a player has no legal moves |
| `gameMode` | `'human' \| 'computer'` | selected on the home screen; `'human'` is the default |
| `humanColor` | `'black' \| 'red'` | which color the human plays when `gameMode === 'computer'`; irrelevant in human mode |

State is held entirely in memory (module-level variables); there is no persistence, serialization, or external store. `computerColor()` returns the color opposite `humanColor` and is only meaningful when `gameMode === 'computer'`.

### Board orientation
`board[row][col]` coordinates never change meaning — row 0 is always Black's logical starting edge. Only *rendering and click mapping* are orientation-aware:
- `isBoardFlipped()` — true iff `gameMode === 'computer' && humanColor === 'black'` (the only case where Black, which starts at row 0/"top", must instead appear at the bottom for the human).
- `flipCoords(row, col)` — self-inverse 180° coordinate rotation (`{ row: 7-row, col: 7-col }`) used both directions: board → display in `render()`, and display → board is unnecessary separately since `render()` attaches each square's click handler with the already-resolved board `(row, col)`, so `handleSquareClick` always receives true board coordinates regardless of orientation.
- Human vs Human never flips, since both players share the screen and physically switch sides.

## Core Functions

### Board setup
- `isDark(row, col)` — true if the square is a playable dark square.
- `createInitialBoard()` — builds the starting 8x8 array: rows `0..PIECE_ROWS-1` get black pieces, rows `BOARD_SIZE-PIECE_ROWS..BOARD_SIZE-1` get red pieces, middle rows empty.

### Move generation
- `directionsFor(piece)` — returns the set of diagonal `[dr, dc]` directions a piece may move/capture in: two forward diagonals for a regular piece, all four for a king.
- `getMovesForPiece(b, row, col)` — for one piece, returns `{ simple: Move[], captures: Move[] }` by scanning each direction one step (simple move onto empty square) and two steps (capture: adjacent opponent piece, empty landing square beyond).
- `getAllMoves(b, player)` — aggregates `getMovesForPiece` over every square belonging to `player`. Returns **only captures** if any exist anywhere on the board for that player (mandatory-capture rule), otherwise all simple moves.

Both functions are pure — they take a board `b` as a parameter and read no global state, so they can be re-run against `board` after mutation (e.g. to check for continued jumps) without side effects.

- `applyStepToBoard(b, move)` — pure helper shared by real move execution and AI simulation: moves the piece within `b`, removes the captured piece if `move.captureRow !== undefined`, and promotes to king on reaching the far row. Does not touch `capturedCounts`, `reinforced`, or any other global — those are the caller's responsibility.
- `cloneBoard(b)` — deep-clones a board array (new arrays, new piece objects) for use in AI search, so exploring hypothetical moves never mutates the live `board`.

### Turn lifecycle
- `startTurn(player, note)` — sets `currentPlayer`, clears `selected`/`forcedPiece`, recomputes `legalMoves` via `getAllMoves`. If empty, sets `gameOver = true`, writes the small win message, and calls `showGameOver(describeWinner(...))` to raise the full-screen overlay; otherwise displays `note` (used for reinforcement notices). Calls `render()`, then `maybeTriggerAI()` (a no-op unless it's now the computer's turn, and `maybeTriggerAI` itself also no-ops once `gameOver`).
- `handleSquareClick(row, col)` — click dispatcher, invoked per-square from `render()`'s attached listeners:
  1. No-op if `gameOver`.
  2. No-op if `gameMode === 'computer'` and it's currently the computer's turn (`currentPlayer === computerColor()`) — blocks human clicks during the AI's turn.
  3. If a piece is `selected` and the clicked square is one of its legal destinations, calls `executeMove`.
  4. Otherwise, attempts selection: blocked if a `forcedPiece` is active and a different square was clicked; otherwise selects the clicked square if it holds a `currentPlayer` piece with at least one legal move.
- `executeMove(move)` — applies `move` to `board` via `applyStepToBoard`, increments `capturedCounts[piece.color]` if it was a capture, and calls `applyReinforcements()`. If the move was a capture and the moved piece has further captures available from its new square, keeps the same player's turn active with `forcedPiece`/`selected`/`legalMoves` set to that continuation (multi-jump) instead of calling `startTurn`. Otherwise ends the turn via `startTurn` for the opponent. `executeMove` is the single code path for applying a move to the live board — both human clicks and the computer's chosen moves go through it, so DOM updates and rule enforcement stay identical between the two.

### Reinforcement (variant rule)
- `tryReinforce(color)` — no-ops if already reinforced or the color's home row (`HOME_ROW[color]`) still holds any of that color's pieces. Otherwise marks `reinforced[color] = true` and fills every empty dark square in that row with a new non-king piece of that color.
- `applyReinforcements()` — calls `tryReinforce` for both colors after each move, returning a combined notice string for any side that just reinforced. Runs unconditionally after every move (cheap no-op check when not applicable) rather than being tied to a specific triggering event.

### Rendering
- `render()` — full re-render of the board on every state change (no diffing): iterates `displayRow`/`displayCol` from 0..7, resolves each to board coordinates via `flipCoords`, and clears/rebuilds `#board`'s children accordingly, applying `selected`/`legal-move`/`no-move` classes per square from current state, then updates the turn indicator (appending `(Computer)`/`(You)` when `gameMode === 'computer'`) and captured-count text. A click listener bound to the resolved board `(row, col)` is (re-)attached to every square on each render.
- `movesForSquare(row, col)` — filters `legalMoves` down to those originating at `(row, col)`; used both for click handling and for rendering legal-move dots.

### Computer opponent (AI)
The AI plans and plays one full turn at a time — a "turn" being either a single simple move or a complete forced multi-jump chain, since a player never gets to stop partway through a chain.

- `getFullMoveSequences(b, player)` — builds on `getAllMoves`: for non-capture turns, wraps each simple move as a one-step sequence; for capture turns, recursively expands every forced-continuation branch (via `applyStepToBoard` on cloned boards + `getMovesForPiece`) into complete jump-chain sequences (`Move[]`). This is the unit of search and of AI execution.
- `simulateReinforce(b, reinforcedState)` — pure counterpart to `tryReinforce`/`applyReinforcements`: given a board and a `{black, red}` reinforced-flags object, returns a new flags object and mutates the given board with any newly-added reinforcement pieces. Used so search branches correctly account for the reinforcement variant rule without touching the real `reinforced` global.
- `evaluateBoard(b, forColor)` — static evaluation: material (`PIECE_VALUE`/`KING_VALUE` per piece) plus a small per-square `ADVANCE_WEIGHT` bonus for non-king pieces advanced toward their kinging row, summed as `forColor`'s total minus the opponent's.
- `minimax(b, reinforcedState, player, depth, alpha, beta, forColor)` — recursive minimax with alpha-beta pruning. One ply = one player's full turn (one `getFullMoveSequences` entry applied via `cloneBoard` + `applyStepToBoard` + `simulateReinforce`). `forColor` is fixed for the whole search as the color being optimized for (the computer); `player` alternates each ply. A player with no available sequences immediately returns a large win/loss value (±1000) for `forColor`; at `depth === 0` returns `evaluateBoard`.
- `chooseBestSequence(b, player, reinforcedState)` — root of the search: evaluates every immediate `getFullMoveSequences(b, player)` option via one `minimax` call each (depth `AI_SEARCH_DEPTH - 1`), returning the sequence with the highest value for `player`.
- `maybeTriggerAI()` — called at the end of every `startTurn`; no-ops unless `gameMode === 'computer'` and it's now `computerColor()`'s turn, in which case it shows a "Computer is thinking..." message and schedules `runAITurn` after `AI_THINK_DELAY_MS`.
- `runAITurn()` — calls `chooseBestSequence` against the live `board`/`reinforced` and hands the result to `playAISequence`.
- `playAISequence(sequence, index)` — plays one precomputed step via the real `executeMove(sequence[index])`, then, if `executeMove` left `forcedPiece` set (meaning the turn isn't over — the chain continues), schedules the next step after `AI_STEP_DELAY_MS`. Because `getFullMoveSequences` mirrors the real forced-capture rules exactly, the precomputed sequence always matches what `executeMove` naturally continues into — no re-planning mid-chain.

### Instructions modal
- `instructionsBtn` (`#instructionsBtn`) is a `position: fixed` circular button living outside both `#homeScreen` and `#gameScreen` in `index.html`, so it renders regardless of which screen is currently hidden — no state coordination with `startGame()`/`showHomeScreen()` is needed.
- `instructionsModalEl` (`#instructionsModal`) is a second `position: fixed` overlay (independent of `#gameOverOverlay`; both use the shared `[hidden] { display: none !important; }` rule and full-viewport-cover pattern), containing a static reference of the rules — its content is authored directly in `index.html` and is not generated from game state.
- `showInstructions()` / `hideInstructions()` toggle `instructionsModalEl.hidden`, wired to: `#instructionsBtn` (open), `#closeInstructionsBtn` (close), a click on the overlay backdrop itself (`e.target === instructionsModalEl`, so clicks inside `.modal-card` don't close it), and an `Escape` keydown listener on `document` (guarded by `!instructionsModalEl.hidden` so it doesn't interfere with other Escape handling when closed).
- Z-index layering: `.instructions-btn` (30) and `.modal-overlay` (40) both sit above `.overlay`/`#gameOverOverlay` (10), so the button and modal stay usable even when the game-over overlay is showing.

### Game-over overlay
- `describeWinner(winnerColor)` — in human mode returns `"<Color> wins!"`; in computer mode returns `"You win!"` or `"Computer wins!"` by comparing `winnerColor` to `humanColor`.
- `showGameOver(text)` — sets `#gameOverText` and unhides `#gameOverOverlay`, a `position: fixed; inset: 0` overlay (see CSS) that visually dims/blurs the board behind it and, being on top with `z-index`, also blocks further clicks from reaching the board regardless of `handleSquareClick`'s own `gameOver` guard.
- `hideGameOver()` — re-hides the overlay; called from `restart()` (so starting a fresh game always clears a previous game's overlay) and `showHomeScreen()`.
- `#playAgainBtn` / `#overlayHomeBtn` inside the overlay are bound to `restart()` / `showHomeScreen()` respectively — the same handlers as the in-game Restart/Change Opponent buttons.

### Home screen & mode selection
- `homeScreenEl` / `gameScreenEl` — the two top-level screens (`#homeScreen`, `#gameScreen` in `index.html`), toggled via the `hidden` attribute. **Gotcha:** `style.css` gives both `.home` and `.game` (and other elements) `display: flex`; without an explicit `[hidden] { display: none !important; }` rule, that author-origin declaration would out-cascade the browser's default `[hidden]` styling at equal specificity and both screens would render at once. That override rule lives at the top of `style.css` and must be kept for any future `hidden`-toggled element.
- Mode and color choices are still plain radio inputs (`input[name="mode"]`, `input[name="color"]`) — game.js's reads/writes of them (`document.querySelector('input[name="..."]:checked').value`) are unchanged — but each radio is visually replaced by a card: `.option-card` is a `<label>` wrapping the (visually hidden via `position:absolute; opacity:0`, but still focusable/clickable) `<input>` plus an icon/swatch, a title, and a description. `.option-card:has(input:checked)` draws the accent border/highlight, so there is no JS-driven "selected" class to keep in sync — purely CSS, driven by native radio state. This relies on `:has()`, supported in current evergreen browsers per the project's browser-support target.
- Mode radios toggle `#colorChoice`'s `hidden` attribute on `change` (shown only for `computer` mode); color radios (`input[name="color"]`) default to `black`.
- The "Human" option card's icon is two overlapping `.mini-piece` divs styled like real board pieces; the "Computer" option card's icon is an inline SVG chip glyph; the color-choice cards' icons are `.option-swatch` circles using the same gradients as `.piece.black`/`.piece.red`, so the start screen visually echoes the actual board pieces.
- `startGame()` — reads the checked mode/color radios into `gameMode`/`humanColor`, swaps screen visibility, and calls `restart()`.
- `showHomeScreen()` — bound to `#homeBtn` ("Change Opponent"); swaps screen visibility back without altering any in-progress game state.

### Lifecycle
- `restart()` — resets `board`, `capturedCounts`, `reinforced`, `gameOver`, hides the game-over overlay, then calls `startTurn('black')` (which will immediately hand off to `maybeTriggerAI()` if the computer plays Black). Bound to `#restartBtn`'s and `#playAgainBtn`'s click events, and called from `startGame()`. `gameMode`/`humanColor` are left untouched by `restart()`, so Restart/Play Again always keeps the current mode. There is no longer an unconditional call at load time — the game only starts once the home screen's Start button is clicked.

## DOM Structure & Contract
`game.js` binds to these `index.html` element IDs and expects them to exist at load:

| ID | Updated by | Content |
|---|---|---|
| `#homeScreen` | `startGame()` / `showHomeScreen()` | `hidden` toggled; contains mode/color radios and `#startBtn` |
| `#colorChoice` | mode-radio `change` handler | `hidden` toggled based on selected opponent mode |
| `#gameScreen` | `startGame()` / `showHomeScreen()` | `hidden` toggled; wraps the existing status bar / board / message UI |
| `#board` | `render()` | rebuilt each render: one `.square` div per board cell, each optionally containing one `.piece` div |
| `#turnIndicator` | `render()` | `"<Player>'s turn"`, optionally suffixed `" (Computer)"`/`" (You)"`, or `"Game over"` |
| `#message` | `startTurn()`, `maybeTriggerAI()` | win text, reinforcement notice, or "Computer is thinking..."; cleared otherwise |
| `#capturedBlackCount` / `#capturedRedCount` | `render()` | numeric captured counts |
| `#gameOverOverlay` | `showGameOver()` / `hideGameOver()` | `hidden` toggled; full-screen win overlay |
| `#gameOverText` | `showGameOver()` | winner text, from `describeWinner()` |
| `#startBtn` | — | click-bound to `startGame()` |
| `#restartBtn` | — | click-bound to `restart()` |
| `#homeBtn` | — | click-bound to `showHomeScreen()` |
| `#playAgainBtn` | — | click-bound to `restart()` (inside the overlay) |
| `#overlayHomeBtn` | — | click-bound to `showHomeScreen()` (inside the overlay) |
| `#instructionsBtn` | — | click-bound to `showInstructions()`; fixed-position, outside both screens |
| `#instructionsModal` | `showInstructions()` / `hideInstructions()` | `hidden` toggled; static rules-reference content |
| `#closeInstructionsBtn` | — | click-bound to `hideInstructions()` |

### CSS class contract (`style.css` targets these on generated elements)
- `.square.dark` / `.square.light` — square background
- `.square.selected` — outline on the selected square
- `.square.legal-move` — dot overlay marking a legal destination
- `.piece.black` / `.piece.red` — piece color styling
- `.piece.king` — adds the crown glyph
- `.piece.no-move` — dims cursor affordance for pieces that can't move this turn (opponent's pieces, or own pieces with no legal move)

## Notes on Correctness-Relevant Behavior
- **Mandatory capture** is enforced globally: `getAllMoves` discards all simple moves the instant any capture exists anywhere on the board for that player, not just for the selected piece.
- **Forced multi-jump** is enforced by re-deriving captures from the just-moved piece's new square after every capture, before ending the turn.
- **Reinforcement** triggers on home-row emptiness, not on a piece count or move count — it fires the instant `HOME_ROW[color]` has zero of that color's pieces, checked after every move for both colors, and can never fire more than once per color per game (`reinforced` flag).
- All move-legality state (`legalMoves`) is a snapshot computed at `startTurn`/`executeMove` time, not recomputed lazily on click.
- **AI search correctness depends on `getFullMoveSequences` staying in lockstep with the real move-generation rules** (`getAllMoves`/`getMovesForPiece`) and with `simulateReinforce` mirroring `tryReinforce` exactly — any future rule change (e.g. a different mandatory-capture variant) must be reflected in both the real-execution path and the simulation path, or the computer's plan can diverge from what `executeMove` actually does when replayed.
- The AI is blocked from acting on the human's turn only via `handleSquareClick`'s early return; `board`/`legalMoves`/etc. are otherwise fully readable/writable regardless of `gameMode`, so a bug in that one guard would let the human move the computer's pieces.
