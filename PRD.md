# PRD: Checkers — 8-Piece Variant

## Overview
A locally-hosted, browser-based checkers game, playable either by two people sharing one screen (hotseat) or by one person against a computer opponent. The game follows standard checkers rules, with one variant: each side starts with **8 pieces instead of 12**.

## Goals
- Provide a playable, rules-correct checkers game with no installation beyond opening a file / running a trivial local server.
- Preserve standard checkers rules and feel, changing only the starting piece count and layout.
- Keep the implementation dependency-free (plain HTML/CSS/JS) for easy local hosting.
- Offer a computer opponent for solo play, in addition to hotseat two-player play.

## Non-Goals
- No online/networked multiplayer.
- No move animations, sound effects, or undo/redo.
- No draw-by-repetition detection.
- No difficulty levels for the computer opponent (single fixed strength).

## Users
- Two people sharing one device/browser, playing turns by taking turns clicking (Human vs Human).
- One person playing solo against the built-in computer opponent (Human vs Computer), choosing which color to play.

## Platform & Hosting
- Plain HTML/CSS/JavaScript, no build step or external dependencies.
- Run by opening `index.html` directly, or serving the folder with any static file server (e.g. `python -m http.server`).

## Board & Starting Setup
- Standard 8x8 board; only dark squares are playable.
- Each side starts with **8 pieces** arranged in the **2 rows closest to that player** (instead of the standard 3 rows / 12 pieces).
- The middle 4 rows start empty.
- Black starts at the top, Red at the bottom. Black moves first.

## Game Modes & Start Screen
- On load, the player sees a home screen (before any board is shown) to choose:
  - **Opponent:** Human (2 players, same screen) or Computer.
  - **Play as** (only shown when Computer is selected): Black (moves first) or Red.
- Starting the game hides the home screen and shows the board, initialized fresh for the chosen mode.
- In Computer mode, the human's color is fixed for that game; the computer plays the other color and moves automatically (with a brief "thinking" pause) on its turns, including playing out its own forced multi-jumps automatically.
- In Computer mode, the board is oriented so the human always plays from the bottom of the screen — the board is visually rotated 180° when the human plays Black, so their pieces are always nearest them regardless of chosen color. Human vs Human keeps the fixed Black-top/Red-bottom orientation, since players share the screen and switch sides physically.
- A "Change Opponent" control returns from the game screen to the home screen (without affecting the in-progress board until a new game is started).
- The computer opponent uses full lookahead search (minimax with alpha-beta pruning) over complete legal turns — including multi-jump chains as a single turn — favoring captures, kings, and board advancement; it accounts for the reinforcement variant rule when planning.

## Rules (standard checkers, applied to the 8-piece setup)
1. **Movement:** Regular pieces move diagonally forward one square onto an empty dark square.
2. **Capturing:** A piece captures by jumping diagonally over an adjacent opponent piece into an empty square immediately beyond it; the captured piece is removed. Captures are **mandatory** — if any capture is available to the player, only capturing moves are legal that turn.
3. **Multi-jumps:** If a piece can capture again immediately after a capture, it must continue jumping with that same piece in the same turn.
4. **Kinging:** A piece reaching the farthest row from its start becomes a king (visually marked). Kings move and capture diagonally in both directions.
5. **Turn order:** Players alternate turns, Black first.
6. **Win condition:** A player wins when the opponent has no pieces left, or the opponent has no legal move on their turn.
7. **Reinforcements (variant rule):** Each side's own edge/home row (row 0 for Black, row 7 for Red) starts with 4 pieces. The first time that row has none of that player's pieces left on it (they've all moved forward or been captured), 4 fresh regular pieces are added into the empty dark squares of that row for that player. This happens automatically, only once per player per game, bringing their total introduced pieces to 12 — matching the standard checkers count.

## Functional Requirements
- Present a home screen with opponent selection (Human/Computer) and, for Computer, a color choice, plus a Start button.
- Render the 8x8 board and current piece positions.
- Click to select a piece; only pieces with a legal move (respecting mandatory-capture rule) are selectable.
- Highlight the selected piece and its legal destination squares.
- Click a highlighted square to execute the move, including forced multi-jump continuation.
- Promote pieces to kings automatically on reaching the last row.
- Automatically add 4 reinforcement pieces to a side's home row the first time that row is empty of that side's pieces (once per player per game).
- Track and display captured-piece counts per side.
- Display whose turn it is.
- Display a one-time notice when a side receives reinforcements.
- Detect a win/game-over state and display it as a full-screen overlay (board dimmed/blurred behind it) with a large win message and "Play Again" / "Change Opponent" actions.
- Restart button to reset the board to the initial 8-piece setup (including reinforcement state), keeping the current game mode.
- In Computer mode, automatically compute and play the computer's turn (including any forced multi-jump chain) with no player interaction required, and block board clicks while it is the computer's turn.
- "Change Opponent" control to return to the home screen to pick a different mode/color.
- An always-available "How to Play" button (visible on the home screen and during a game) that opens a rules-reference dialog covering goal, setup, moving, capturing, mandatory captures/multi-jumps, kings, the reinforcement variant, winning, and how computer games work; closable via its close button, clicking outside it, or Escape.

## Non-Functional Requirements
- **Zero dependencies:** No build tools, package manager, or external libraries — plain HTML/CSS/JS only.
- **Local-first:** Must run by opening the HTML file directly or via a trivial static file server; no backend/server-side logic required.
- **Performance:** UI updates (move highlighting, board re-render) respond instantly (sub-100ms) to clicks on ordinary consumer hardware.
- **Browser compatibility:** Works in current versions of major evergreen browsers (Chrome, Edge, Firefox).
- **No persistence:** Game state lives only in memory for the current browser session; closing/refreshing the page resets the game (no save/load required).
- **Usability:** Legal moves, selected piece, and turn/game-over state must be visually unambiguous without instructions.
- **Visual design:** A modern dark UI (card-style panels, accent color, subtle motion/transitions) using only CSS — no external design libraries or fonts, consistent with the zero-dependency requirement.
- **Maintainability:** Game logic, rendering, and styling are separated into distinct files (`game.js`, `index.html`, `style.css`) so rules can be modified without touching rendering code.
- **No accessibility/mobile requirements:** Desktop mouse/click interaction only; touch and screen-reader support are out of scope for this version.

## Success Criteria
- Two players can play a full game start-to-finish with correct rule enforcement (legal moves, mandatory captures, multi-jumps, kinging, win detection).
- No external dependencies; runs entirely locally in a browser.
