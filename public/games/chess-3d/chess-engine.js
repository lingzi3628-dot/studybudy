// ============================================================
// chess-engine.js — Full chess rules engine (no dependencies)
// Exposes window.ChessEngine
// ============================================================
(function () {
  'use strict';

  // Piece encoding: 1 char
  // uppercase = White, lowercase = black
  // P/p = pawn, N/n = knight, B/b = bishop, R/r = rook, Q/q = queen, K/k = king

  // Initial board (rank 8 at top, rank 1 at bottom)
  // We use a 64-length array, index = rank*8 + file (rank 0 = top = black's back rank)
  const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

  function ChessEngine(fen) {
    this.load(fen || STARTING_FEN);
  }

  ChessEngine.prototype.load = function (fen) {
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    this.board = new Array(64).fill(null);
    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) {
          file += parseInt(ch, 10);
        } else {
          this.board[r * 8 + file] = ch;
          file++;
        }
      }
    }
    this.turn = parts[1] || 'w';
    this.castle = parts[2] || '-';
    this.ep = parts[3] === '-' ? null : parts[3]; // en passant target square like "e3"
    this.halfmove = parseInt(parts[4] || '0', 10);
    this.fullmove = parseInt(parts[5] || '1', 10);
    this.history = [];
  };

  ChessEngine.prototype.exportFEN = function () {
    const rows = [];
    for (let r = 0; r < 8; r++) {
      let row = '', empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.board[r * 8 + f];
        if (p === null) empty++;
        else {
          if (empty) { row += empty; empty = 0; }
          row += p;
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return `${rows.join('/')} ${this.turn} ${this.castle} ${this.ep || '-'} ${this.halfmove} ${this.fullmove}`;
  };

  ChessEngine.prototype.clone = function () {
    const c = new ChessEngine();
    c.board = this.board.slice();
    c.turn = this.turn;
    c.castle = this.castle;
    c.ep = this.ep;
    c.halfmove = this.halfmove;
    c.fullmove = this.fullmove;
    c.history = this.history.slice();
    return c;
  };

  function isWhite(p) { return p && p === p.toUpperCase(); }
  function isBlack(p) { return p && p === p.toLowerCase(); }
  function colorOf(p) { return !p ? null : (isWhite(p) ? 'w' : 'b'); }
  function sqToIndex(sq) { // 'e4' → 28 (rank 4 from bottom = rank 4 in chess, but our array has rank 0 at top)
    const file = sq.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = parseInt(sq[1], 10);
    const r = 8 - rank; // rank 8 is top (r=0), rank 1 is bottom (r=7)
    return r * 8 + file;
  }
  function indexToSq(idx) {
    const r = Math.floor(idx / 8);
    const f = idx % 8;
    return String.fromCharCode('a'.charCodeAt(0) + f) + (8 - r);
  }

  ChessEngine.prototype.pieceAt = function (sq) {
    // sq can be 'e4' or 28
    const idx = typeof sq === 'string' ? sqToIndex(sq) : sq;
    return this.board[idx];
  };

  // Generate pseudo-legal moves (not checking for own king in check)
  ChessEngine.prototype.generateMoves = function (opts) {
    opts = opts || {};
    const moves = [];
    const turn = opts.color || this.turn;
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (!p) continue;
      if (colorOf(p) !== turn) continue;
      const type = p.toLowerCase();
      const from = i;
      const r = Math.floor(i / 8), f = i % 8;
      if (type === 'p') {
        const dir = turn === 'w' ? -1 : 1; // white moves up (rank decreasing in our array)
        const startRank = turn === 'w' ? 6 : 1;
        // forward 1
        const oneAhead = i + dir * 8;
        if (oneAhead >= 0 && oneAhead < 64 && !this.board[oneAhead]) {
          // promotion?
          const lastRank = turn === 'w' ? 0 : 7;
          if (Math.floor(oneAhead / 8) === lastRank) {
            for (const promo of ['q', 'r', 'b', 'n']) {
              moves.push({ from, to: oneAhead, promo: turn === 'w' ? promo.toUpperCase() : promo });
            }
          } else {
            moves.push({ from, to: oneAhead });
          }
          // forward 2
          if (r === startRank) {
            const twoAhead = i + dir * 16;
            if (!this.board[twoAhead]) {
              moves.push({ from, to: twoAhead, double: true });
            }
          }
        }
        // captures (including en passant)
        for (const df of [-1, 1]) {
          const capFile = f + df;
          if (capFile < 0 || capFile > 7) continue;
          const capIdx = i + dir * 8 + df;
          if (capIdx < 0 || capIdx >= 64) continue;
          const target = this.board[capIdx];
          if (target && colorOf(target) !== turn) {
            const lastRank = turn === 'w' ? 0 : 7;
            if (Math.floor(capIdx / 8) === lastRank) {
              for (const promo of ['q', 'r', 'b', 'n']) {
                moves.push({ from, to: capIdx, promo: turn === 'w' ? promo.toUpperCase() : promo, capture: true });
              }
            } else {
              moves.push({ from, to: capIdx, capture: true });
            }
          }
          // en passant
          if (this.ep) {
            const epIdx = sqToIndex(this.ep);
            if (epIdx === capIdx) {
              // captured pawn is on the same rank as the moving pawn
              const capturedPawnIdx = i + df; // adjacent file, same rank
              if (capturedPawnIdx >= 0 && capturedPawnIdx < 64 && this.board[capturedPawnIdx] &&
                  this.board[capturedPawnIdx].toLowerCase() === 'p' && colorOf(this.board[capturedPawnIdx]) !== turn) {
                moves.push({ from, to: capIdx, ep: true, capture: true });
              }
            }
          }
        }
      } else if (type === 'n') {
        const deltas = [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]];
        for (const [dr, df] of deltas) {
          const nr = r + dr, nf = f + df;
          if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
          const to = nr * 8 + nf;
          const target = this.board[to];
          if (!target || colorOf(target) !== turn) {
            moves.push({ from, to, capture: !!target });
          }
        }
      } else if (type === 'b' || type === 'r' || type === 'q') {
        const dirs = [];
        if (type !== 'r') dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
        if (type !== 'b') dirs.push([-1,0],[1,0],[0,-1],[0,1]);
        for (const [dr, df] of dirs) {
          let nr = r + dr, nf = f + df;
          while (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
            const to = nr * 8 + nf;
            const target = this.board[to];
            if (!target) {
              moves.push({ from, to });
            } else {
              if (colorOf(target) !== turn) moves.push({ from, to, capture: true });
              break;
            }
            nr += dr; nf += df;
          }
        }
      } else if (type === 'k') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let df = -1; df <= 1; df++) {
            if (!dr && !df) continue;
            const nr = r + dr, nf = f + df;
            if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
            const to = nr * 8 + nf;
            const target = this.board[to];
            if (!target || colorOf(target) !== turn) {
              moves.push({ from, to, capture: !!target });
            }
          }
        }
        // Castling
        const rank = turn === 'w' ? 7 : 0;
        if (r === rank && f === 4) { // king on starting square
          const ks = turn === 'w' ? 'K' : 'k';
          const qs = turn === 'w' ? 'Q' : 'q';
          if (this.castle.includes(ks)) {
            // kingside: squares f and g empty, rook on h
            if (!this.board[rank * 8 + 5] && !this.board[rank * 8 + 6] &&
                this.board[rank * 8 + 7] && this.board[rank * 8 + 7].toLowerCase() === 'r' &&
                colorOf(this.board[rank * 8 + 7]) === turn) {
              // king not passing through check (we'll verify in isLegalMove)
              if (!this.squareAttacked(rank * 8 + 4, turn) &&
                  !this.squareAttacked(rank * 8 + 5, turn) &&
                  !this.squareAttacked(rank * 8 + 6, turn)) {
                moves.push({ from, to: rank * 8 + 6, castle: 'k' });
              }
            }
          }
          if (this.castle.includes(qs)) {
            if (!this.board[rank * 8 + 1] && !this.board[rank * 8 + 2] && !this.board[rank * 8 + 3] &&
                this.board[rank * 8 + 0] && this.board[rank * 8 + 0].toLowerCase() === 'r' &&
                colorOf(this.board[rank * 8 + 0]) === turn) {
              if (!this.squareAttacked(rank * 8 + 4, turn) &&
                  !this.squareAttacked(rank * 8 + 3, turn) &&
                  !this.squareAttacked(rank * 8 + 2, turn)) {
                moves.push({ from, to: rank * 8 + 2, castle: 'q' });
              }
            }
          }
        }
      }
    }
    return moves;
  };

  // Is the given square attacked by the side opposite to `defenderColor`?
  ChessEngine.prototype.squareAttacked = function (idx, defenderColor) {
    const attackerColor = defenderColor === 'w' ? 'b' : 'w';
    // Pawn attacks
    const dir = attackerColor === 'w' ? -1 : 1; // pawn moves direction; it attacks sideways from its position
    // Actually pawns of attackerColor attack squares diagonally forward. If attacker is white, pawn at sq attacks idx if idx is one rank up and one file over.
    const r = Math.floor(idx / 8), f = idx % 8;
    for (const df of [-1, 1]) {
      // attacker pawn is one rank below idx (from attacker's perspective)
      // if attacker is white (moves up = decreasing rank in our array), pawn is at r+1
      const pawnRank = attackerColor === 'w' ? r + 1 : r - 1;
      const pawnFile = f - df;
      if (pawnRank < 0 || pawnRank > 7 || pawnFile < 0 || pawnFile > 7) continue;
      const pawnIdx = pawnRank * 8 + pawnFile;
      const p = this.board[pawnIdx];
      if (p && p.toLowerCase() === 'p' && colorOf(p) === attackerColor) return true;
    }
    // Knight attacks
    const knightDeltas = [[-2,-1],[-2,1],[2,-1],[2,1],[-1,-2],[-1,2],[1,-2],[1,2]];
    for (const [dr, df] of knightDeltas) {
      const nr = r + dr, nf = f + df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
      const p = this.board[nr * 8 + nf];
      if (p && p.toLowerCase() === 'n' && colorOf(p) === attackerColor) return true;
    }
    // King attacks
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        if (!dr && !df) continue;
        const nr = r + dr, nf = f + df;
        if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
        const p = this.board[nr * 8 + nf];
        if (p && p.toLowerCase() === 'k' && colorOf(p) === attackerColor) return true;
      }
    }
    // Bishop/Queen diagonals
    const diagDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (const [dr, df] of diagDirs) {
      let nr = r + dr, nf = f + df;
      while (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
        const p = this.board[nr * 8 + nf];
        if (p) {
          if (colorOf(p) === attackerColor) {
            const t = p.toLowerCase();
            if (t === 'b' || t === 'q') return true;
          }
          break;
        }
        nr += dr; nf += df;
      }
    }
    // Rook/Queen straights
    const straightDirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (const [dr, df] of straightDirs) {
      let nr = r + dr, nf = f + df;
      while (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
        const p = this.board[nr * 8 + nf];
        if (p) {
          if (colorOf(p) === attackerColor) {
            const t = p.toLowerCase();
            if (t === 'r' || t === 'q') return true;
          }
          break;
        }
        nr += dr; nf += df;
      }
    }
    return false;
  };

  ChessEngine.prototype.findKing = function (color) {
    const king = color === 'w' ? 'K' : 'k';
    for (let i = 0; i < 64; i++) if (this.board[i] === king) return i;
    return -1;
  };

  ChessEngine.prototype.inCheck = function (color) {
    const k = this.findKing(color);
    if (k < 0) return false;
    return this.squareAttacked(k, color);
  };

  // Make a move on the board. Returns a "undo" record.
  ChessEngine.prototype.makeMove = function (m) {
    const undo = {
      from: m.from, to: m.to,
      captured: this.board[m.to],
      movedPiece: this.board[m.from],
      castle: this.castle,
      ep: this.ep,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
      turn: this.turn,
      epCaptured: null,
      epCapturedIdx: -1,
      castleRookFrom: -1,
      castleRookTo: -1,
      promoted: !!m.promo,
    };
    const piece = this.board[m.from];
    const type = piece.toLowerCase();
    // En passant capture
    if (m.ep) {
      const r = Math.floor(m.from / 8);
      const capturedIdx = r * 8 + (m.to % 8);
      undo.epCaptured = this.board[capturedIdx];
      undo.epCapturedIdx = capturedIdx;
      this.board[capturedIdx] = null;
    }
    // Move the piece
    this.board[m.to] = m.promo ? m.promo : piece;
    this.board[m.from] = null;
    // Castle: move the rook too
    if (m.castle === 'k') {
      const rank = Math.floor(m.from / 8);
      undo.castleRookFrom = rank * 8 + 7;
      undo.castleRookTo = rank * 8 + 5;
      this.board[undo.castleRookTo] = this.board[undo.castleRookFrom];
      this.board[undo.castleRookFrom] = null;
    } else if (m.castle === 'q') {
      const rank = Math.floor(m.from / 8);
      undo.castleRookFrom = rank * 8 + 0;
      undo.castleRookTo = rank * 8 + 3;
      this.board[undo.castleRookTo] = this.board[undo.castleRookFrom];
      this.board[undo.castleRookFrom] = null;
    }
    // Update castling rights
    let castle = this.castle;
    if (castle === '-') castle = '';
    if (type === 'k') {
      castle = castle.replace(colorOf(piece) === 'w' ? 'KQ' : 'kq', '');
    }
    if (type === 'r') {
      const rank = colorOf(piece) === 'w' ? 7 : 0;
      if (m.from === rank * 8 + 0) castle = castle.replace(colorOf(piece) === 'w' ? 'Q' : 'q', '');
      if (m.from === rank * 8 + 7) castle = castle.replace(colorOf(piece) === 'w' ? 'K' : 'k', '');
    }
    // If a rook is captured on its starting square, remove castling right
    if (m.capture && !m.ep) {
      const target = undo.captured;
      if (target && target.toLowerCase() === 'r') {
        const r = Math.floor(m.to / 8), f = m.to % 8;
        if (f === 0 && r === (colorOf(target) === 'w' ? 7 : 0)) {
          castle = castle.replace(colorOf(target) === 'w' ? 'Q' : 'q', '');
        }
        if (f === 7 && r === (colorOf(target) === 'w' ? 7 : 0)) {
          castle = castle.replace(colorOf(target) === 'w' ? 'K' : 'k', '');
        }
      }
    }
    this.castle = castle || '-';
    // En passant target
    if (m.double) {
      const r = Math.floor(m.from / 8), f = m.from % 8;
      const dir = colorOf(piece) === 'w' ? -1 : 1;
      this.ep = indexToSq(r * 8 + f + dir * 8);
    } else {
      this.ep = null;
    }
    // Halfmove clock
    if (type === 'p' || m.capture) this.halfmove = 0;
    else this.halfmove++;
    // Fullmove
    if (this.turn === 'b') this.fullmove++;
    // Switch turn
    this.turn = this.turn === 'w' ? 'b' : 'w';
    this.history.push(m);
    return undo;
  };

  ChessEngine.prototype.undoMove = function (undo) {
    const piece = undo.movedPiece;
    this.board[undo.from] = piece;
    this.board[undo.to] = undo.captured; // restore captured (or null)
    if (undo.epCaptured) {
      this.board[undo.epCapturedIdx] = undo.epCaptured;
    }
    if (undo.castleRookFrom >= 0) {
      this.board[undo.castleRookFrom] = this.board[undo.castleRookTo];
      this.board[undo.castleRookTo] = null;
    }
    this.castle = undo.castle;
    this.ep = undo.ep;
    this.halfmove = undo.halfmove;
    this.fullmove = undo.fullmove;
    this.turn = undo.turn;
    this.history.pop();
  };

  // Returns only legal moves (king not in check after move)
  ChessEngine.prototype.legalMoves = function (opts) {
    const all = this.generateMoves(opts);
    const legal = [];
    const turn = opts && opts.color ? opts.color : this.turn;
    for (const m of all) {
      const undo = this.makeMove(m);
      if (!this.inCheck(turn)) legal.push(m);
      this.undoMove(undo);
    }
    return legal;
  };

  ChessEngine.prototype.isLegal = function (m) {
    const undo = this.makeMove(m);
    const legal = !this.inCheck(m._turn || this.turn === 'w' ? 'b' : 'w'); // we already flipped turn
    // Actually we need to check the side that just moved, which is `undo.turn`
    const ok = !this.inCheck(undo.turn);
    this.undoMove(undo);
    return ok;
  };

  // Make a move from algebraic-ish notation: { from: 'e2', to: 'e4', promo?: 'q' }
  ChessEngine.prototype.move = function (m) {
    if (typeof m.from === 'string') m.from = sqToIndex(m.from);
    if (typeof m.to === 'string') m.to = sqToIndex(m.to);
    const legal = this.legalMoves();
    const found = legal.find(lm => lm.from === m.from && lm.to === m.to && (!m.promo || (lm.promo && lm.promo.toLowerCase() === m.promo.toLowerCase())));
    if (!found) return null;
    this.makeMove(found);
    return found;
  };

  // Game state: 'playing', 'check', 'checkmate', 'stalemate', 'draw'
  ChessEngine.prototype.gameState = function () {
    const legal = this.legalMoves();
    const check = this.inCheck(this.turn);
    if (legal.length === 0) {
      return check ? 'checkmate' : 'stalemate';
    }
    if (this.halfmove >= 100) return 'draw'; // 50-move rule
    // insufficient material (very simplified)
    if (this.insufficientMaterial()) return 'draw';
    return check ? 'check' : 'playing';
  };

  ChessEngine.prototype.insufficientMaterial = function () {
    const pieces = { w: [], b: [] };
    for (let i = 0; i < 64; i++) {
      const p = this.board[i];
      if (!p) continue;
      const c = colorOf(p);
      const t = p.toLowerCase();
      if (t === 'k') continue;
      if (t === 'p' || t === 'r' || t === 'q') return false;
      pieces[c].push({ type: t, idx: i });
    }
    const w = pieces.w.length, b = pieces.b.length;
    // K vs K
    if (w === 0 && b === 0) return true;
    // K+minor vs K
    if (w <= 1 && b === 0) return true;
    if (b <= 1 && w === 0) return true;
    return false;
  };

  ChessEngine.prototype.moveSAN = function (m) {
    const piece = this.board[m.from];
    if (!piece) return '?';
    const type = piece.toLowerCase();
    if (m.castle === 'k') return 'O-O';
    if (m.castle === 'q') return 'O-O-O';
    const toSq = indexToSq(m.to);
    let s = '';
    if (type !== 'p') s += type.toUpperCase();
    if (m.capture) {
      if (type === 'p') s += indexToSq(m.from)[0];
      s += 'x';
    }
    s += toSq;
    if (m.promo) s += '=' + m.promo.toUpperCase();
    return s;
  };

  // Expose helpers
  ChessEngine._sqToIndex = sqToIndex;
  ChessEngine._indexToSq = indexToSq;
  ChessEngine._colorOf = colorOf;
  ChessEngine._isWhite = isWhite;

  window.ChessEngine = ChessEngine;
})();
