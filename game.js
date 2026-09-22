const BOARD_SIZE = 8;
const PIECE_ROWS = 2; // 2 rows per side => 8 pieces per side
const HOME_ROW = { black: 0, red: BOARD_SIZE - 1 }; // each side's own edge row

const AI_SEARCH_DEPTH = 6; // plies (full turns) of minimax lookahead
const AI_THINK_DELAY_MS = 900; // pause before the computer's first step, for legibility
const AI_STEP_DELAY_MS = 600; // pause between chained-jump steps in a computer multi-jump
const PIECE_VALUE = 1;
const KING_VALUE = 1.6;
const ADVANCE_WEIGHT = 0.05;

const homeScreenEl = document.getElementById('homeScreen');
const gameScreenEl = document.getElementById('gameScreen');
const colorChoiceEl = document.getElementById('colorChoice');
const startBtn = document.getElementById('startBtn');
const homeBtn = document.getElementById('homeBtn');

const boardEl = document.getElementById('board');
const turnIndicatorEl = document.getElementById('turnIndicator');
const messageEl = document.getElementById('message');
const capturedBlackCountEl = document.getElementById('capturedBlackCount');
const capturedRedCountEl = document.getElementById('capturedRedCount');
const restartBtn = document.getElementById('restartBtn');
const gameOverOverlayEl = document.getElementById('gameOverOverlay');
const gameOverTextEl = document.getElementById('gameOverText');
const playAgainBtn = document.getElementById('playAgainBtn');
const overlayHomeBtn = document.getElementById('overlayHomeBtn');

const instructionsBtn = document.getElementById('instructionsBtn');
const instructionsModalEl = document.getElementById('instructionsModal');
const closeInstructionsBtn = document.getElementById('closeInstructionsBtn');

let board = [];
let currentPlayer = 'black';
let selected = null; // {row, col}
let legalMoves = []; // legal moves for the current player this turn
let forcedPiece = null; // {row, col} when mid multi-jump
let capturedCounts = { black: 0, red: 0 };
let reinforced = { black: false, red: false };
let gameOver = false;

let gameMode = 'human'; // 'human' | 'computer'
let humanColor = 'black'; // which color the human plays, when gameMode === 'computer'

function computerColor() {
  return humanColor === 'black' ? 'red' : 'black';
}

// The human always sits at the bottom of the board. Red already starts at the
// bottom, so only a human-plays-Black computer game needs a 180-degree flip.
function isBoardFlipped() {
  return gameMode === 'computer' && humanColor === 'black';
}

// Flipping is its own inverse, so the same function maps board <-> display coords.
function flipCoords(row, col) {
  if (!isBoardFlipped()) return { row, col };
  return { row: BOARD_SIZE - 1 - row, col: BOARD_SIZE - 1 - col };
}

function isDark(row, col) {
  return (row + col) % 2 === 1;
}

function createInitialBoard() {
  const b = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (!isDark(row, col)) continue;
      if (row < PIECE_ROWS) {
        b[row][col] = { color: 'black', king: false };
      } else if (row >= BOARD_SIZE - PIECE_ROWS) {
        b[row][col] = { color: 'red', king: false };
      }
    }
  }
  return b;
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function directionsFor(piece) {
  if (piece.king) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return piece.color === 'black' ? [[1, -1], [1, 1]] : [[-1, -1], [-1, 1]];
}

function getMovesForPiece(b, row, col) {
  const piece = b[row][col];
  if (!piece) return { simple: [], captures: [] };
  const simple = [];
  const captures = [];
  for (const [dr, dc] of directionsFor(piece)) {
    const r1 = row + dr, c1 = col + dc;
    if (!inBounds(r1, c1)) continue;
    if (!b[r1][c1]) {
      simple.push({ fromRow: row, fromCol: col, toRow: r1, toCol: c1 });
      continue;
    }
    if (b[r1][c1].color !== piece.color) {
      const r2 = row + dr * 2, c2 = col + dc * 2;
      if (inBounds(r2, c2) && !b[r2][c2]) {
        captures.push({
          fromRow: row, fromCol: col, toRow: r2, toCol: c2,
          captureRow: r1, captureCol: c1,
        });
      }
    }
  }
  return { simple, captures };
}

function getAllMoves(b, player) {
  let allSimple = [];
  let allCaptures = [];
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = b[row][col];
      if (!piece || piece.color !== player) continue;
      const { simple, captures } = getMovesForPiece(b, row, col);
      allSimple = allSimple.concat(simple);
      allCaptures = allCaptures.concat(captures);
    }
  }
  return allCaptures.length > 0 ? allCaptures : allSimple;
}

function cloneBoard(b) {
  return b.map(row => row.map(cell => (cell ? { ...cell } : null)));
}

function applyStepToBoard(b, move) {
  const piece = b[move.fromRow][move.fromCol];
  b[move.fromRow][move.fromCol] = null;
  b[move.toRow][move.toCol] = piece;
  if (move.captureRow !== undefined) {
    b[move.captureRow][move.captureCol] = null;
  }
  const lastRow = piece.color === 'black' ? BOARD_SIZE - 1 : 0;
  if (move.toRow === lastRow) {
    piece.king = true;
  }
}

// Expands single-step moves into complete turns: a full forced multi-jump
// chain is one entry (array of steps), matching what a player actually commits to.
function getFullMoveSequences(b, player) {
  const initial = getAllMoves(b, player);
  if (initial.length === 0) return [];
  const isCaptureTurn = initial[0].captureRow !== undefined;
  if (!isCaptureTurn) return initial.map(m => [m]);

  const sequences = [];
  function expand(fromBoard, move, chain) {
    const nb = cloneBoard(fromBoard);
    applyStepToBoard(nb, move);
    const newChain = chain.concat([move]);
    const { captures } = getMovesForPiece(nb, move.toRow, move.toCol);
    if (captures.length > 0) {
      for (const next of captures) expand(nb, next, newChain);
    } else {
      sequences.push(newChain);
    }
  }
  for (const m of initial) expand(b, m, []);
  return sequences;
}

function simulateReinforce(b, reinforcedState) {
  const next = { ...reinforcedState };
  for (const color of ['black', 'red']) {
    if (next[color]) continue;
    const row = HOME_ROW[color];
    const hasOwnPiece = b[row].some(cell => cell && cell.color === color);
    if (hasOwnPiece) continue;
    next[color] = true;
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (isDark(row, col) && !b[row][col]) {
        b[row][col] = { color, king: false };
      }
    }
  }
  return next;
}

function evaluateBoard(b, forColor) {
  let score = 0;
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      const piece = b[row][col];
      if (!piece) continue;
      let value = piece.king ? KING_VALUE : PIECE_VALUE;
      if (!piece.king) {
        const advancement = piece.color === 'black' ? row : BOARD_SIZE - 1 - row;
        value += advancement * ADVANCE_WEIGHT;
      }
      score += piece.color === forColor ? value : -value;
    }
  }
  return score;
}

// Minimax with alpha-beta pruning. Depth counts plies, where one ply is a full
// turn (including any forced multi-jump chain) for whichever player is to move.
function minimax(b, reinforcedState, player, depth, alpha, beta, forColor) {
  const sequences = getFullMoveSequences(b, player);
  if (sequences.length === 0) {
    return player === forColor ? -1000 : 1000;
  }
  if (depth === 0) {
    return evaluateBoard(b, forColor);
  }

  const opponent = player === 'black' ? 'red' : 'black';
  const maximizing = player === forColor;
  let best = maximizing ? -Infinity : Infinity;

  for (const seq of sequences) {
    const nb = cloneBoard(b);
    for (const step of seq) applyStepToBoard(nb, step);
    const nextReinforced = simulateReinforce(nb, reinforcedState);
    const value = minimax(nb, nextReinforced, opponent, depth - 1, alpha, beta, forColor);

    if (maximizing) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

function chooseBestSequence(b, player, reinforcedState) {
  const sequences = getFullMoveSequences(b, player);
  if (sequences.length === 0) return null;

  const opponent = player === 'black' ? 'red' : 'black';
  let alpha = -Infinity;
  const beta = Infinity;
  let bestSeq = sequences[0];
  let bestValue = -Infinity;

  for (const seq of sequences) {
    const nb = cloneBoard(b);
    for (const step of seq) applyStepToBoard(nb, step);
    const nextReinforced = simulateReinforce(nb, reinforcedState);
    const value = minimax(nb, nextReinforced, opponent, AI_SEARCH_DEPTH - 1, alpha, beta, player);
    if (value > bestValue) {
      bestValue = value;
      bestSeq = seq;
    }
    if (bestValue > alpha) alpha = bestValue;
  }
  return bestSeq;
}

function maybeTriggerAI() {
  if (gameMode !== 'computer' || gameOver) return;
  if (currentPlayer !== computerColor()) return;
  messageEl.textContent = 'Computer is thinking...';
  setTimeout(runAITurn, AI_THINK_DELAY_MS);
}

function runAITurn() {
  if (gameOver || currentPlayer !== computerColor()) return;
  const sequence = chooseBestSequence(board, currentPlayer, reinforced);
  if (!sequence) return; // startTurn already handles the no-moves/game-over case
  playAISequence(sequence, 0);
}

function playAISequence(sequence, index) {
  if (gameOver || index >= sequence.length) return;
  executeMove(sequence[index]);
  if (forcedPiece) {
    setTimeout(() => playAISequence(sequence, index + 1), AI_STEP_DELAY_MS);
  }
}

function startTurn(player, note) {
  currentPlayer = player;
  forcedPiece = null;
  selected = null;
  legalMoves = getAllMoves(board, currentPlayer);
  if (legalMoves.length === 0) {
    gameOver = true;
    const winnerColor = currentPlayer === 'black' ? 'red' : 'black';
    messageEl.textContent = `${capitalize(winnerColor)} wins! ${capitalize(currentPlayer)} has no legal moves.`;
    showGameOver(describeWinner(winnerColor));
  } else {
    messageEl.textContent = note || '';
  }
  render();
  maybeTriggerAI();
}

function tryReinforce(color) {
  if (reinforced[color]) return false;
  const row = HOME_ROW[color];
  const hasOwnPiece = board[row].some(cell => cell && cell.color === color);
  if (hasOwnPiece) return false;

  reinforced[color] = true;
  let added = 0;
  for (let col = 0; col < BOARD_SIZE; col++) {
    if (isDark(row, col) && !board[row][col]) {
      board[row][col] = { color, king: false };
      added++;
    }
  }
  return added > 0;
}

function applyReinforcements() {
  const notes = [];
  for (const color of ['black', 'red']) {
    if (tryReinforce(color)) {
      notes.push(`${capitalize(color)} reinforcements: 4 new pieces added to the back row!`);
    }
  }
  return notes.join(' ');
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function movesForSquare(row, col) {
  return legalMoves.filter(m => m.fromRow === row && m.fromCol === col);
}

function handleSquareClick(row, col) {
  if (gameOver) return;
  if (gameMode === 'computer' && currentPlayer === computerColor()) return;
  const piece = board[row][col];

  // Try to move if a piece is selected and this square is a legal destination.
  if (selected) {
    const move = movesForSquare(selected.row, selected.col)
      .find(m => m.toRow === row && m.toCol === col);
    if (move) {
      executeMove(move);
      return;
    }
  }

  // Otherwise, try to select a piece.
  if (forcedPiece && (forcedPiece.row !== row || forcedPiece.col !== col)) {
    return; // must continue jumping with the forced piece
  }
  if (piece && piece.color === currentPlayer && movesForSquare(row, col).length > 0) {
    selected = { row, col };
    render();
  }
}

function executeMove(move) {
  const piece = board[move.fromRow][move.fromCol];
  applyStepToBoard(board, move);

  const wasCapture = move.captureRow !== undefined;
  if (wasCapture) {
    capturedCounts[piece.color]++;
  }

  const reinforcementNote = applyReinforcements();

  if (wasCapture) {
    const { captures } = getMovesForPiece(board, move.toRow, move.toCol);
    if (captures.length > 0) {
      forcedPiece = { row: move.toRow, col: move.toCol };
      selected = forcedPiece;
      legalMoves = captures;
      render();
      if (reinforcementNote) messageEl.textContent = reinforcementNote;
      return;
    }
  }

  startTurn(currentPlayer === 'black' ? 'red' : 'black', reinforcementNote);
}

function render() {
  boardEl.innerHTML = '';
  for (let displayRow = 0; displayRow < BOARD_SIZE; displayRow++) {
    for (let displayCol = 0; displayCol < BOARD_SIZE; displayCol++) {
      const { row, col } = flipCoords(displayRow, displayCol);
      const sq = document.createElement('div');
      sq.className = `square ${isDark(row, col) ? 'dark' : 'light'}`;

      const isSelected = selected && selected.row === row && selected.col === col;
      if (isSelected) sq.classList.add('selected');

      const isLegalDest = selected && movesForSquare(selected.row, selected.col)
        .some(m => m.toRow === row && m.toCol === col);
      if (isLegalDest) sq.classList.add('legal-move');

      const piece = board[row][col];
      if (piece) {
        const pieceEl = document.createElement('div');
        pieceEl.className = `piece ${piece.color}${piece.king ? ' king' : ''}`;
        const hasMoves = movesForSquare(row, col).length > 0;
        if (piece.color !== currentPlayer || !hasMoves) {
          pieceEl.classList.add('no-move');
        }
        sq.appendChild(pieceEl);
      }

      sq.addEventListener('click', () => handleSquareClick(row, col));
      boardEl.appendChild(sq);
    }
  }

  let turnText = gameOver ? 'Game over' : `${capitalize(currentPlayer)}'s turn`;
  if (!gameOver && gameMode === 'computer') {
    turnText += currentPlayer === computerColor() ? ' (Computer)' : ' (You)';
  }
  turnIndicatorEl.textContent = turnText;
  capturedBlackCountEl.textContent = capturedCounts.black;
  capturedRedCountEl.textContent = capturedCounts.red;
}

function restart() {
  board = createInitialBoard();
  capturedCounts = { black: 0, red: 0 };
  reinforced = { black: false, red: false };
  gameOver = false;
  hideGameOver();
  startTurn('black');
}

function describeWinner(winnerColor) {
  if (gameMode !== 'computer') return `${capitalize(winnerColor)} wins!`;
  return winnerColor === humanColor ? 'You win!' : 'Computer wins!';
}

function showGameOver(text) {
  gameOverTextEl.textContent = text;
  gameOverOverlayEl.hidden = false;
}

function hideGameOver() {
  gameOverOverlayEl.hidden = true;
}

function showHomeScreen() {
  gameScreenEl.hidden = true;
  homeScreenEl.hidden = false;
  hideGameOver();
}

function startGame() {
  gameMode = document.querySelector('input[name="mode"]:checked').value;
  humanColor = gameMode === 'computer'
    ? document.querySelector('input[name="color"]:checked').value
    : 'black';
  homeScreenEl.hidden = true;
  gameScreenEl.hidden = false;
  restart();
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener('change', () => {
    const isComputer = document.querySelector('input[name="mode"]:checked').value === 'computer';
    colorChoiceEl.hidden = !isComputer;
  });
}

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', restart);
homeBtn.addEventListener('click', showHomeScreen);
playAgainBtn.addEventListener('click', restart);
overlayHomeBtn.addEventListener('click', showHomeScreen);

function showInstructions() {
  instructionsModalEl.hidden = false;
}

function hideInstructions() {
  instructionsModalEl.hidden = true;
}

instructionsBtn.addEventListener('click', showInstructions);
closeInstructionsBtn.addEventListener('click', hideInstructions);
instructionsModalEl.addEventListener('click', (e) => {
  if (e.target === instructionsModalEl) hideInstructions();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !instructionsModalEl.hidden) hideInstructions();
});
