// ============================================================
// ai.js — Chess AI with minimax + alpha-beta pruning
// 3 difficulty levels: casual / normal / hard
// Exposes window.ChessAI
// ============================================================
(function () {
  'use strict';

  // Piece values
  const PV = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  // Piece-square tables (from white's perspective, rank 0 = top = rank 8 in chess)
  // Source: standard chess programming simplified tables
  const PST_PAWN = [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ];
  const PST_KNIGHT = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ];
  const PST_BISHOP = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 5, 5, 5, 5, -10,
    -10, 0, 5, 0, 0, 5, 0, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ];
  const PST_ROOK = [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ];
  const PST_QUEEN = [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ];
  const PST_KING = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ];

  function pstFor(type, color) {
    let table;
    switch (type) {
      case 'p': table = PST_PAWN; break;
      case 'n': table = PST_KNIGHT; break;
      case 'b': table = PST_BISHOP; break;
      case 'r': table = PST_ROOK; break;
      case 'q': table = PST_QUEEN; break;
      case 'k': table = PST_KING; break;
      default: return 0;
    }
    // Black pieces are mirrored vertically (rank 8 ↔ rank 1)
    return color === 'w' ? table : table.slice().reverse();
  }

  // Static evaluation — positive = white advantage
  function evaluate(engine) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = engine.board[i];
      if (!p) continue;
      const type = p.toLowerCase();
      const color = (p === p.toUpperCase()) ? 'w' : 'b';
      const val = PV[type] + pstFor(type, color)[i];
      score += color === 'w' ? val : -val;
    }
    return score;
  }

  // Move ordering: captures first (MVV-LVA simplified)
  function orderMoves(engine, moves) {
    return moves.map(m => {
      let s = 0;
      if (m.capture) {
        const victim = engine.board[m.to];
        const attacker = engine.board[m.from];
        if (victim) {
          s += 10 * PV[victim.toLowerCase()] - PV[attacker.toLowerCase()];
        }
        if (m.ep) s += 100;
      }
      if (m.promo) s += 800;
      return { m, s };
    }).sort((a, b) => b.s - a.s).map(o => o.m);
  }

  function minimax(engine, depth, alpha, beta, maximizing) {
    const state = engine.gameState();
    if (state === 'checkmate') {
      // Side to move is checkmated — good for the side NOT to move
      return maximizing ? -100000 + (10 - depth) : 100000 - (10 - depth);
    }
    if (state === 'stalemate' || state === 'draw') return 0;
    if (depth === 0) return evaluate(engine);

    let moves = engine.legalMoves();
    moves = orderMoves(engine, moves);

    if (maximizing) {
      let best = -Infinity;
      for (const m of moves) {
        const undo = engine.makeMove(m);
        const val = minimax(engine, depth - 1, alpha, beta, false);
        engine.undoMove(undo);
        if (val > best) best = val;
        if (val > alpha) alpha = val;
        if (beta <= alpha) break;
      }
      return best;
    } else {
      let best = Infinity;
      for (const m of moves) {
        const undo = engine.makeMove(m);
        const val = minimax(engine, depth - 1, alpha, beta, true);
        engine.undoMove(undo);
        if (val < best) best = val;
        if (val < beta) beta = val;
        if (beta <= alpha) break;
      }
      return best;
    }
  }

  function ChessAI(difficulty) {
    this.difficulty = difficulty || 'normal';
  }

  ChessAI.prototype.chooseMove = function (engine) {
    const moves = engine.legalMoves();
    if (moves.length === 0) return null;

    // CASUAL: random move with slight preference for captures
    if (this.difficulty === 'easy') {
      // 50% random move, 50% best-of-3 random sampling
      if (Math.random() < 0.5) {
        return moves[Math.floor(Math.random() * moves.length)];
      }
      const sampled = [];
      for (let i = 0; i < 3; i++) {
        sampled.push(moves[Math.floor(Math.random() * moves.length)]);
      }
      let best = sampled[0], bestScore = -Infinity;
      const turnIsWhite = engine.turn === 'w';
      for (const m of sampled) {
        const undo = engine.makeMove(m);
        const s = evaluate(engine) * (turnIsWhite ? 1 : -1);
        engine.undoMove(undo);
        if (s > bestScore) { bestScore = s; best = m; }
      }
      return best;
    }

    // NORMAL: depth 2, NORMAL_HARD moves
    // HARD: depth 3
    const depth = this.difficulty === 'hard' ? 3 : 2;
    const maximizing = engine.turn === 'w';
    let bestMove = moves[0];
    let bestScore = maximizing ? -Infinity : Infinity;
    const ordered = orderMoves(engine, moves);
    let alpha = -Infinity, beta = Infinity;

    for (const m of ordered) {
      const undo = engine.makeMove(m);
      const val = minimax(engine, depth - 1, alpha, beta, !maximizing);
      engine.undoMove(undo);
      if (maximizing) {
        if (val > bestScore) { bestScore = val; bestMove = m; }
        if (val > alpha) alpha = val;
      } else {
        if (val < bestScore) { bestScore = val; bestMove = m; }
        if (val < beta) beta = val;
      }
    }

    // Add slight randomness on normal so AI isn't 100% deterministic
    if (this.difficulty === 'normal' && Math.random() < 0.1) {
      return moves[Math.floor(Math.random() * moves.length)];
    }
    return bestMove;
  };

  window.ChessAI = ChessAI;
  window.ChessAI._evaluate = evaluate;
})();
