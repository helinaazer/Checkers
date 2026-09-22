# Checkers — 8-Piece Variant

A browser-based checkers game with a twist: each side starts with **8 pieces instead of 12**, and gets the missing 4 back as reinforcements once its home row empties out. Play against a friend on the same screen, or against a built-in computer opponent.

No build step, no dependencies — plain HTML, CSS and JavaScript.

## Running it

Open `index.html` in any modern browser. That's it.

If you'd rather serve it (some browsers are stricter about local files):

```bash
python -m http.server 8000
# then open http://localhost:8000
```

## How it plays

Pick an opponent on the home screen:

- **Human** — two players taking turns on one screen. Black is at the top, Red at the bottom.
- **Computer** — choose whether you play Black (moves first) or Red. The board is always oriented with your pieces at the bottom, so it rotates automatically when you play Black.

Click a piece to select it; legal destinations light up. Click one to move.

### Rules

Standard checkers, with one variant rule.

| | |
|---|---|
| **Setup** | 8 pieces per side on the dark squares of the two rows nearest each player. Black moves first. |
| **Moving** | Regular pieces move one square diagonally forward onto an empty dark square. |
| **Capturing** | Jump an adjacent opponent piece into the empty square beyond it. Captures are **mandatory** — if one is available, you must take it. |
| **Multi-jumps** | If the same piece can jump again after landing, it must keep going in that turn. |
| **Kings** | Reaching the far row promotes a piece to a king, which moves and captures diagonally in any direction. |
| **Winning** | Take all your opponent's pieces, or leave them with no legal move. |

**Reinforcements (the variant).** Each side's back row starts with only 4 of its 8 pieces. The first time that row is completely empty of your pieces, 4 fresh pieces appear there automatically — once per side, per game. Over a full game each side therefore fields 12 pieces total, the standard count, just introduced in two waves.

A **How to Play** button (`?`, top right) covers all of this in-game.

## The computer opponent

Minimax with alpha–beta pruning, searching 6 plies. One ply is a *complete turn*, so a forced multi-jump chain is searched and played as a single unit rather than as separate moves. The evaluation weighs material (kings count for more than regular pieces) plus a small bonus for pieces advanced toward their kinging row, and the search accounts for the reinforcement rule when it looks ahead.

There is a single fixed strength — no difficulty levels.

## Project structure

| File | Responsibility |
|---|---|
| `index.html` | DOM skeleton — home screen, board container, status bar, capture counters, modals. |
| `style.css` | All styling, including the responsive layout. |
| `game.js` | All game logic, state and rendering. No dependencies. |
| `PRD.md` | Product requirements — scope, rules, goals and non-goals. |
| `SPEC.md` | Technical spec — data model, core functions, DOM contract. |

## Browser support and layout

Works in current Chrome, Edge, Firefox and Safari. The layout is responsive across phone, tablet, laptop and desktop:

- The board scales to fill whatever space the viewport leaves, within sensible minimum and maximum square sizes.
- On phones the capture tallies move into a row above the board; on short landscape screens the title, status and message move into a sidebar so the board keeps the full height.
- Touch targets are sized for fingers, hover effects are suppressed on touch devices, and safe-area insets are respected on notched phones.

Game state lives in memory only — refreshing the page starts a new game.
