// ============================================================
// main3d.js — Chess 3D main entry point
// Sets up Three.js scene, board, pieces, handles input + game flow
// Depends on: THREE, THREE.OrbitControls, ChessEngine, ChessAI
// ============================================================
(function () {
  'use strict';

  // === Constants ===
  const SQUARE = 1.0;
  const BOARD_THICKNESS = 0.25;
  const PIECE_HEIGHT = 0.7;
  const FILE_NAMES = ['a','b','c','d','e','f','g','h'];

  // === DOM refs ===
  const gameRoot = document.getElementById('game');
  const statusEl = document.getElementById('status');
  const moveTable = document.getElementById('moveTable');
  const startScreen = document.getElementById('startScreen');
  const resultScreen = document.getElementById('resultScreen');
  const resultTitle = document.getElementById('resultTitle');
  const resultSub = document.getElementById('resultSub');
  const promoModal = document.getElementById('promoModal');
  const promoRow = document.getElementById('promoRow');
  const hintEl = document.getElementById('hint');
  const movesBtn = document.getElementById('movesBtn');
  const movePanel = document.getElementById('movePanel');
  const flipBtn = document.getElementById('flipBtn');
  const soundBtn = document.getElementById('soundBtn');
  const menuBtn = document.getElementById('menuBtn');
  const againBtn = document.getElementById('againBtn');
  const resultMenuBtn = document.getElementById('resultMenuBtn');

  // === Globals ===
  let scene, camera, renderer, controls;
  let boardGroup, piecesGroup, highlightsGroup;
  let engine, ai, aiDifficulty = 'normal', mode = 'ai-white'; // 'ai-white' | 'ai-black' | 'local'
  let selected = null; // { mesh, square } of selected piece
  let legalMovesCache = [];
  let pendingPromo = null; // { from, to, resolve }
  let isFlipped = false;
  let soundOn = true;
  let aiThinking = false;
  let gameOver = false;

  // === Init ===
  function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b0d14);
    scene.fog = new THREE.Fog(0x0b0d14, 15, 35);

    // Camera
    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.set(0, 9, 9);
    camera.lookAt(0, 0, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    gameRoot.appendChild(renderer.domElement);

    // Controls
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 6;
    controls.maxDistance = 20;
    controls.maxPolarAngle = Math.PI * 0.48; // can't go below horizon
    controls.target.set(0, 0, 0);

    // Lights
    scene.add(new THREE.AmbientLight(0x4a4060, 0.6));
    const keyLight = new THREE.DirectionalLight(0xfff4d0, 1.2);
    keyLight.position.set(6, 12, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -8;
    keyLight.shadow.camera.right = 8;
    keyLight.shadow.camera.top = 8;
    keyLight.shadow.camera.bottom = -8;
    scene.add(keyLight);
    const fill1 = new THREE.PointLight(0xd4af37, 0.5, 30);
    fill1.position.set(-6, 4, -6);
    scene.add(fill1);
    const fill2 = new THREE.PointLight(0x7c3aed, 0.5, 30);
    fill2.position.set(6, 4, -6);
    scene.add(fill2);

    // Ground (subtle)
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x060710, roughness: 0.95, metalness: 0.3 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -BOARD_THICKNESS / 2 - 0.001;
    ground.receiveShadow = true;
    scene.add(ground);

    // Build board
    boardGroup = new THREE.Group();
    scene.add(boardGroup);
    buildBoard();

    piecesGroup = new THREE.Group();
    scene.add(piecesGroup);

    highlightsGroup = new THREE.Group();
    scene.add(highlightsGroup);

    // Engine
    engine = new ChessEngine();

    // Click handler
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('touchend', onTouchEnd, { passive: false });

    // Resize
    window.addEventListener('resize', onResize);

    // Buttons
    movesBtn.addEventListener('click', () => movePanel.classList.toggle('open'));
    flipBtn.addEventListener('click', () => {
      isFlipped = !isFlipped;
      const targetY = isFlipped ? Math.PI : 0;
      animateCameraOrbit(targetY);
    });
    soundBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      soundBtn.textContent = soundOn ? '🔊' : '🔇';
    });
    menuBtn.addEventListener('click', () => {
      startScreen.classList.add('show');
      // Reset game state
      resetGame();
    });
    againBtn.addEventListener('click', () => {
      resultScreen.classList.remove('show');
      resetGame();
      startGame();
    });
    resultMenuBtn.addEventListener('click', () => {
      resultScreen.classList.remove('show');
      startScreen.classList.add('show');
      resetGame();
    });

    // Difficulty buttons
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        aiDifficulty = btn.dataset.diff;
      });
    });

    // Mode buttons
    document.querySelectorAll('.big-btn[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        mode = btn.dataset.mode;
        startScreen.classList.remove('show');
        startGame();
      });
    });

    // Render loop
    animate();
  }

  function buildBoard() {
    // Board base
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x2a1d0e, roughness: 0.7, metalness: 0.3 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(8.6, BOARD_THICKNESS, 8.6), baseMat);
    base.position.y = -BOARD_THICKNESS / 2;
    base.receiveShadow = true;
    base.castShadow = true;
    boardGroup.add(base);

    // Gold trim
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.9 });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.04, 8.7), trimMat);
    trim.position.y = -BOARD_THICKNESS / 2 - 0.01;
    boardGroup.add(trim);

    // Squares
    const lightMat = new THREE.MeshStandardMaterial({ color: 0xe5d8b8, roughness: 0.6, metalness: 0 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.6, metalness: 0 });
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const isLight = (r + f) % 2 === 0;
        const sq = new THREE.Mesh(
          new THREE.BoxGeometry(SQUARE, 0.05, SQUARE),
          isLight ? lightMat : darkMat
        );
        const pos = squareToWorld(r * 8 + f);
        sq.position.set(pos.x, 0.001, pos.z);
        sq.receiveShadow = true;
        sq.userData = { square: r * 8 + f, isSquare: true };
        boardGroup.add(sq);
      }
    }

    // Coordinate labels (file letters) — using small planes with canvas textures
    // skip for simplicity
  }

  function squareToWorld(idx) {
    const r = Math.floor(idx / 8), f = idx % 8;
    // Center on origin
    const x = (f - 3.5) * SQUARE;
    const z = (3.5 - r) * SQUARE;
    return { x, z };
  }

  function worldToSquare(x, z) {
    const f = Math.round(x / SQUARE + 3.5);
    const r = Math.round(3.5 - z / SQUARE);
    if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
    return r * 8 + f;
  }

  function buildPieces() {
    // Clear
    while (piecesGroup.children.length) {
      const c = piecesGroup.children[0];
      piecesGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    for (let i = 0; i < 64; i++) {
      const p = engine.board[i];
      if (!p) continue;
      const mesh = buildPieceMesh(p);
      const pos = squareToWorld(i);
      mesh.position.set(pos.x, 0.04, pos.z);
      mesh.userData = { square: i, piece: p };
      piecesGroup.add(mesh);
    }
  }

  // Build a piece mesh using simple geometries
  function buildPieceMesh(p) {
    const type = p.toLowerCase();
    const color = (p === p.toUpperCase()) ? 'w' : 'b';
    const mat = new THREE.MeshStandardMaterial({
      color: color === 'w' ? 0xefe8d8 : 0x262029,
      roughness: 0.35,
      metalness: 0.55,
    });
    const accentMat = new THREE.MeshStandardMaterial({
      color: color === 'w' ? 0xd4af37 : 0x6b5a8e,
      roughness: 0.4,
      metalness: 0.6,
    });

    const group = new THREE.Group();

    // Base disc (all pieces)
    const baseGeom = new THREE.CylinderGeometry(0.35, 0.4, 0.1, 24);
    const base = new THREE.Mesh(baseGeom, mat);
    base.position.y = 0.05;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    if (type === 'p') {
      // Pawn: base + sphere on stem
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.4, 16), mat);
      stem.position.y = 0.3;
      stem.castShadow = true;
      group.add(stem);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat);
      head.position.y = 0.6;
      head.castShadow = true;
      group.add(head);
    } else if (type === 'r') {
      // Rook: cylinder + crenellated top
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.55, 24), mat);
      body.position.y = 0.32;
      body.castShadow = true;
      group.add(body);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.55), mat);
      top.position.y = 0.66;
      top.castShadow = true;
      group.add(top);
      // 4 crenellations
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), mat);
        c.position.set(Math.cos(a) * 0.22, 0.78, Math.sin(a) * 0.22);
        c.castShadow = true;
        group.add(c);
      }
    } else if (type === 'n') {
      // Knight: stylized L-shape (use box + angled head)
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.45, 16), mat);
      body.position.y = 0.28;
      body.castShadow = true;
      group.add(body);
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.35), mat);
      neck.position.set(0, 0.55, 0.05);
      neck.castShadow = true;
      neck.rotation.x = -0.3;
      group.add(neck);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.25), mat);
      head.position.set(0, 0.78, 0.13);
      head.castShadow = true;
      head.rotation.x = -0.3;
      group.add(head);
      // Ear
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 8), mat);
      ear.position.set(0, 0.9, 0.05);
      ear.castShadow = true;
      group.add(ear);
    } else if (type === 'b') {
      // Bishop: tall + sphere + cross on top
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.6, 16), mat);
      body.position.y = 0.36;
      body.castShadow = true;
      group.add(body);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 12), mat);
      ball.position.y = 0.74;
      ball.castShadow = true;
      group.add(ball);
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), mat);
      spike.position.y = 0.95;
      spike.castShadow = true;
      group.add(spike);
      // small accent ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 8, 24), accentMat);
      ring.position.y = 0.55;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    } else if (type === 'q') {
      // Queen: tall + crown of spheres
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.7, 16), mat);
      body.position.y = 0.4;
      body.castShadow = true;
      group.add(body);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat);
      ball.position.y = 0.85;
      ball.castShadow = true;
      group.add(ball);
      // Crown
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), accentMat);
        c.position.set(Math.cos(a) * 0.22, 1.0, Math.sin(a) * 0.22);
        group.add(c);
      }
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), accentMat);
      top.position.y = 1.1;
      group.add(top);
    } else if (type === 'k') {
      // King: tall + cross on top
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.75, 16), mat);
      body.position.y = 0.43;
      body.castShadow = true;
      group.add(body);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat);
      ball.position.y = 0.92;
      ball.castShadow = true;
      group.add(ball);
      // Cross
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), accentMat);
      crossV.position.y = 1.18;
      group.add(crossV);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), accentMat);
      crossH.position.y = 1.18;
      group.add(crossH);
    }
    return group;
  }

  function findPieceMesh(square) {
    return piecesGroup.children.find(c => c.userData.square === square);
  }

  function clearHighlights() {
    while (highlightsGroup.children.length) {
      const c = highlightsGroup.children[0];
      highlightsGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
  }

  function showSelectedHighlight(square) {
    const pos = squareToWorld(square);
    const geom = new THREE.RingGeometry(0.38, 0.46, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xd4af37, transparent: true, opacity: 0.85 });
    const ring = new THREE.Mesh(geom, mat);
    ring.position.set(pos.x, 0.04, pos.z);
    ring.rotation.x = -Math.PI / 2;
    highlightsGroup.add(ring);
  }

  function showLegalMoveHighlights(moves) {
    for (const m of moves) {
      const pos = squareToWorld(m.to);
      const isCapture = m.capture;
      const geom = isCapture
        ? new THREE.RingGeometry(0.38, 0.46, 32)
        : new THREE.CircleGeometry(0.14, 24);
      const mat = new THREE.MeshBasicMaterial({
        color: isCapture ? 0xff5340 : 0x7ac74f,
        transparent: true,
        opacity: 0.7,
      });
      const dot = new THREE.Mesh(geom, mat);
      dot.position.set(pos.x, 0.04, pos.z);
      dot.rotation.x = -Math.PI / 2;
      highlightsGroup.add(dot);
    }
  }

  function showCheckHighlight() {
    const kingColor = engine.turn;
    const kingIdx = engine.findKing(kingColor);
    if (kingIdx < 0) return;
    const pos = squareToWorld(kingIdx);
    const geom = new THREE.RingGeometry(0.4, 0.48, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(geom, mat);
    ring.position.set(pos.x, 0.045, pos.z);
    ring.rotation.x = -Math.PI / 2;
    highlightsGroup.add(ring);
  }

  // === Input ===
  function onCanvasClick(e) {
    if (gameOver || aiThinking) return;
    if (mode === 'ai-white' && engine.turn === 'b') return;
    if (mode === 'ai-black' && engine.turn === 'w') return;
    handlePointer(e.clientX, e.clientY);
  }

  function onTouchEnd(e) {
    if (e.changedTouches.length === 0) return;
    e.preventDefault();
    if (gameOver || aiThinking) return;
    if (mode === 'ai-white' && engine.turn === 'b') return;
    if (mode === 'ai-black' && engine.turn === 'w') return;
    const t = e.changedTouches[0];
    handlePointer(t.clientX, t.clientY);
  }

  function handlePointer(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x, y }, camera);
    // Intersect board squares
    const squares = boardGroup.children.filter(c => c.userData.isSquare);
    const hits = raycaster.intersectObjects(squares, false);
    if (hits.length === 0) return;
    const square = hits[0].object.userData.square;
    onSquareClick(square);
  }

  function onSquareClick(square) {
    const piece = engine.board[square];
    const myTurn = engine.turn;
    const myColor = myTurn;

    // If a piece is already selected and we click on a legal target, move
    if (selected) {
      const legalTarget = legalMovesCache.find(m => m.to === square);
      if (legalTarget) {
        // Promotion check
        if (legalTarget.promo) {
          // If multiple promo moves to same target, prompt
          const promoOptions = legalMovesCache.filter(m => m.to === square && m.promo);
          if (promoOptions.length > 1) {
            promptPromotion(selected.square, square, (promo) => {
              const m = promoOptions.find(p => p.promo.toLowerCase() === promo.toLowerCase());
              if (m) doMove(m);
            });
            return;
          }
        }
        doMove(legalTarget);
        return;
      }
    }

    // Otherwise, try selecting a piece of our color
    if (piece && ChessEngine._colorOf(piece) === myColor) {
      selected = { square, mesh: findPieceMesh(square) };
      clearHighlights();
      showSelectedHighlight(square);
      legalMovesCache = engine.legalMoves().filter(m => m.from === square);
      showLegalMoveHighlights(legalMovesCache);
    } else {
      // Deselect
      selected = null;
      legalMovesCache = [];
      clearHighlights();
    }
  }

  function promptPromotion(from, to, cb) {
    promoRow.innerHTML = '';
    const color = engine.turn;
    const options = ['q', 'r', 'b', 'n'];
    options.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'promo-btn ' + (color === 'w' ? 'w' : 'b');
      const symbols = { q: '♛', r: '♜', b: '♝', n: '♞' };
      btn.textContent = symbols[p];
      btn.onclick = () => {
        promoModal.classList.remove('show');
        cb(p);
      };
      promoRow.appendChild(btn);
    });
    promoModal.classList.add('show');
    pendingPromo = { from, to, cb };
  }

  function doMove(m) {
    const movingPiece = engine.board[m.from];
    const wasCapture = m.capture || m.ep;
    engine.makeMove(m);
    selected = null;
    legalMovesCache = [];
    clearHighlights();
    buildPieces();
    playSound(wasCapture ? 'capture' : 'move');
    updateStatus();
    updateMoveHistory(m, movingPiece);
    afterMove();
  }

  function afterMove() {
    const state = engine.gameState();
    if (state === 'checkmate' || state === 'stalemate' || state === 'draw') {
      gameOver = true;
      showResult(state);
      return;
    }
    if (state === 'check') {
      showCheckHighlight();
    }
    // AI turn?
    const isAITurn =
      (mode === 'ai-white' && engine.turn === 'b') ||
      (mode === 'ai-black' && engine.turn === 'w');
    if (isAITurn) {
      aiThinking = true;
      setStatus('AI thinking…');
      setTimeout(() => {
        const move = ai.chooseMove(engine);
        aiThinking = false;
        if (move) {
          const movingPiece = engine.board[move.from];
          const wasCapture = move.capture || move.ep;
          engine.makeMove(move);
          clearHighlights();
          buildPieces();
          playSound(wasCapture ? 'capture' : 'move');
          updateStatus();
          updateMoveHistory(move, movingPiece);
          afterMove();
        } else {
          showResult(engine.gameState());
          gameOver = true;
        }
      }, 300);
    }
  }

  function updateStatus() {
    const state = engine.gameState();
    let txt = '';
    if (state === 'check') txt = `<span class="check">CHECK! ${engine.turn === 'w' ? 'White' : 'Black'} to move</span>`;
    else txt = `${engine.turn === 'w' ? 'White' : 'Black'} to move`;
    setStatus(txt);
  }

  function setStatus(txt) {
    statusEl.innerHTML = txt;
  }

  function updateMoveHistory(m, piece) {
    const san = engine.moveSAN({ from: m.from, to: m.to, capture: m.capture, castle: m.castle, promo: m.promo }) || '';
    // Add row to move table
    const moveNum = Math.ceil(engine.history.length / 2);
    const isWhiteMove = engine.history.length % 2 === 1; // we already pushed, so odd = white moved
    let row;
    if (isWhiteMove) {
      row = document.createElement('tr');
      row.innerHTML = `<td class="n">${moveNum}.</td><td>${san}</td><td></td>`;
      moveTable.appendChild(row);
    } else {
      row = moveTable.lastElementChild;
      if (row) {
        const tds = row.querySelectorAll('td');
        if (tds[2]) tds[2].textContent = san;
      }
    }
    // Scroll to bottom
    const scroll = document.getElementById('moveScroll');
    if (scroll) scroll.scrollTop = scroll.scrollHeight;
  }

  function showResult(state) {
    if (state === 'checkmate') {
      // The side to move is checkmated — opposite side wins
      const winner = engine.turn === 'w' ? 'Black' : 'White';
      resultTitle.textContent = 'Checkmate';
      resultSub.textContent = `${winner} wins`;
    } else if (state === 'stalemate') {
      resultTitle.textContent = 'Stalemate';
      resultSub.textContent = 'Draw — no legal moves';
    } else {
      resultTitle.textContent = 'Draw';
      resultSub.textContent = '50-move rule or insufficient material';
    }
    resultScreen.classList.add('show');
  }

  function playSound(type) {
    if (!soundOn) return;
    try {
      const ctx = playSound._ctx || (playSound._ctx = new (window.AudioContext || window.webkitAudioContext)());
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine';
      if (type === 'capture') {
        o.frequency.value = 220; g.gain.value = 0.18; o.start();
        o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.18);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        o.stop(ctx.currentTime + 0.22);
      } else {
        o.frequency.value = 660; g.gain.value = 0.1; o.start();
        o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);
        g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        o.stop(ctx.currentTime + 0.12);
      }
    } catch (e) {}
  }

  // === Camera orbit animation ===
  let cameraOrbitTarget = null;
  function animateCameraOrbit(targetY) {
    cameraOrbitTarget = targetY;
  }

  // === Reset/start ===
  function resetGame() {
    engine = new ChessEngine();
    gameOver = false;
    selected = null;
    legalMovesCache = [];
    clearHighlights();
    buildPieces();
    moveTable.innerHTML = '';
    updateStatus();
  }

  function startGame() {
    resetGame();
    ai = new ChessAI(aiDifficulty);
    // If AI plays white (mode === 'ai-black'), AI moves first
    if (mode === 'ai-black') {
      aiThinking = true;
      setStatus('AI thinking…');
      setTimeout(() => {
        const move = ai.chooseMove(engine);
        aiThinking = false;
        if (move) {
          const movingPiece = engine.board[move.from];
          engine.makeMove(move);
          buildPieces();
          playSound(move.capture ? 'capture' : 'move');
          updateStatus();
          updateMoveHistory(move, movingPiece);
          afterMove();
        }
      }, 500);
    }
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function animate() {
    requestAnimationFrame(animate);
    // Smooth camera orbit
    if (cameraOrbitTarget !== null) {
      const cur = controls.getAzimuthalAngle ? controls.getAzimuthalAngle() : 0;
      // Just rotate the whole boardGroup visually instead
      const target = cameraOrbitTarget;
      const curRot = boardGroup.rotation.y;
      const diff = target - curRot;
      if (Math.abs(diff) < 0.01) {
        boardGroup.rotation.y = target;
        cameraOrbitTarget = null;
      } else {
        boardGroup.rotation.y = curRot + diff * 0.1;
      }
      // Pieces + highlights follow
      piecesGroup.rotation.y = boardGroup.rotation.y;
      highlightsGroup.rotation.y = boardGroup.rotation.y;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  // Start once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
