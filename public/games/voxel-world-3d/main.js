// ============================================================
// main.js — Voxel World 3D main entry
// Player controller, pointer lock, hotbar, day/night, game loop
// Depends on: THREE, World, MobSystem
// ============================================================
(function () {
  'use strict';

  // === DOM refs ===
  const gameRoot = document.getElementById('game');
  const menuOverlay = document.getElementById('menuOverlay');
  const pauseOverlay = document.getElementById('pauseOverlay');
  const pauseBtn = document.getElementById('menuBtn'); // doesn't exist for voxel — use ESC
  const hud = document.getElementById('hud');
  const cross = document.getElementById('cross');
  const hotbarEl = document.getElementById('hotbar');
  const blockNameEl = document.getElementById('blockName');
  const heartsEl = document.getElementById('hearts');
  const dmgFlashEl = document.getElementById('dmgFlash');
  const hintBEl = document.getElementById('hintB');
  const timeIcon = document.getElementById('timeIcon');
  const genStatus = document.getElementById('genStatus');
  const seedInput = document.getElementById('seedInput');
  const sizeSel = document.getElementById('sizeSel');
  const createBtn = document.getElementById('createBtn');
  const continueBtn = document.getElementById('continueBtn');
  const resumeBtn = document.getElementById('resumeBtn');
  const quitBtn = document.getElementById('quitBtn');
  const randSeed = document.getElementById('randSeed');
  const mc = document.getElementById('mc');
  const btnJump = document.getElementById('btnJump');
  const btnPlace = document.getElementById('btnPlace');
  const btnBreak = document.getElementById('btnBreak');
  const zoneL = document.getElementById('zoneL');
  const zoneR = document.getElementById('zoneR');

  // === Globals ===
  let scene, camera, renderer;
  let world, mobSystem, mobGroup;
  let player = {
    pos: new THREE.Vector3(0, 30, 0),
    vel: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    onGround: false,
    flying: false,
    width: 0.6, height: 1.7, eye: 1.6,
    health: 10, maxHealth: 10,
    invulnTimer: 0,
  };
  const keys = {};
  let pointerLocked = false;
  let paused = false;
  let mobileLook = { active: false, lastX: 0, lastY: 0 };
  let mobileMove = { forward: 0, strafe: 0 };
  let selectedSlot = 0;
  let dayTime = 0; // 0..1 (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
  let lastTime = performance.now();
  let highlightMesh;

  // Hotbar contents — block ids, with stack counts (creative = unlimited)
  const HOTBAR = [
    { id: 1, count: Infinity },  // Grass
    { id: 2, count: Infinity },  // Dirt
    { id: 3, count: Infinity },  // Stone
    { id: 4, count: Infinity },  // Sand
    { id: 5, count: Infinity },  // Wood
    { id: 6, count: Infinity },  // Leaves
    { id: 8, count: Infinity },  // Brick
    { id: 9, count: Infinity },  // Glass
    { id: 10, count: Infinity }, // Gold
  ];

  // === Init ===
  function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 50, 120);

    camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 200);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    gameRoot.appendChild(renderer.domElement);

    // Lights — sun + ambient (intensity changes with day/night)
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(50, 100, 50);
    sun.target.position.set(0, 0, 0);
    scene.add(sun);
    scene.add(sun.target);
    scene.userData.sun = sun;
    scene.userData.ambient = ambient;
    scene.userData.sunSphere = new THREE.Mesh(
      new THREE.SphereGeometry(2, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd24a })
    );
    scene.add(scene.userData.sunSphere);
    scene.userData.moonSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.5, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xe5e5e5 })
    );
    scene.add(scene.userData.moonSphere);

    // Highlight box (for block targeting)
    const highlightGeom = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true });
    highlightMesh = new THREE.Mesh(highlightGeom, highlightMat);
    highlightMesh.visible = false;
    scene.add(highlightMesh);

    // Events
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('click', requestPointerLock);
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('resize', onResize);
    // Wheel for hotbar
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

    // Mobile controls
    setupMobile();

    // Menu buttons
    createBtn.addEventListener('click', startGame);
    continueBtn.addEventListener('click', () => {
      menuOverlay.classList.remove('show');
      pauseOverlay.classList.remove('show');
      paused = false;
      requestPointerLock();
    });
    resumeBtn.addEventListener('click', () => {
      pauseOverlay.classList.remove('show');
      paused = false;
      requestPointerLock();
    });
    quitBtn.addEventListener('click', () => {
      pauseOverlay.classList.remove('show');
      menuOverlay.classList.add('show');
      paused = false;
    });
    randSeed.addEventListener('click', () => {
      seedInput.value = Math.floor(Math.random() * 99999);
    });

    // Build hotbar UI
    buildHotbarUI();

    // Render loop (renders even on menu so there's a backdrop)
    animate();
  }

  function startGame() {
    const seed = parseInt(seedInput.value || '0', 10) || Math.floor(Math.random() * 99999);
    const sizeChoice = parseInt(sizeSel.value, 10);
    const size = sizeChoice * 16; // 6 → 96, 9 → 144
    if (genStatus) {
      genStatus.textContent = `Generating ${size}×${size} world (seed ${seed})…`;
    }
    // Defer to next frame so the status shows up
    setTimeout(() => {
      if (world && world.meshGroup) scene.remove(world.meshGroup);
      if (mobGroup) scene.remove(mobGroup);
      world = new World(seed, size);
      const mesh = world.buildMesh(THREE);
      scene.add(mesh);
      // Spawn point
      const sp = world.findSpawnPoint();
      player.pos.set(sp.x, sp.y, sp.z);
      player.vel.set(0, 0, 0);
      player.health = player.maxHealth;
      // Spawn mobs
      mobSystem = new MobSystem(world);
      mobGroup = new THREE.Group();
      scene.add(mobGroup);
      mobSystem.spawnAll(THREE, mobGroup);
      // Hide menu
      menuOverlay.classList.remove('show');
      continueBtn.style.display = '';
      if (genStatus) genStatus.textContent = '';
      paused = false;
      requestPointerLock();
    }, 50);
  }

  // === Hotbar UI ===
  function buildHotbarUI() {
    hotbarEl.innerHTML = '';
    HOTBAR.forEach((slot, i) => {
      const div = document.createElement('div');
      div.className = 'slot' + (i === selectedSlot ? ' sel' : '');
      // Use the block's "side" texture (exposed via window from world.js) for the hotbar preview.
      // For grass, the side texture shows grass-on-top-of-dirt — looks great.
      const sideTextureCanvas = window.BLOCK_SIDE_CANVASES && window.BLOCK_SIDE_CANVASES[slot.id];
      const topTextureCanvas = window.BLOCK_TOP_CANVASES && window.BLOCK_TOP_CANVASES[slot.id];
      if (sideTextureCanvas) {
        // Composite: top half shows the top texture (perspective), bottom half shows side
        const canvas = document.createElement('canvas');
        canvas.width = 48; canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        // Side fills the whole slot
        ctx.drawImage(sideTextureCanvas, 0, 0, 48, 48);
        // Top diamond (perspective effect) — small overlay in top half
        if (topTextureCanvas) {
          ctx.save();
          ctx.globalAlpha = 0.95;
          // Draw a small top-texture square at the top to suggest depth
          ctx.drawImage(topTextureCanvas, 8, 4, 24, 12);
          ctx.restore();
        }
        // Edge shading
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, 44, 48, 4);
        ctx.fillRect(0, 0, 4, 48);
        ctx.fillRect(44, 0, 4, 48);
        div.style.backgroundImage = `url(${canvas.toDataURL()})`;
      } else {
        // Fallback to flat color
        const info = window.BLOCKS[slot.id];
        const hex = '#' + info.color.toString(16).padStart(6, '0');
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = hex;
        ctx.fillRect(0, 0, 32, 32);
        div.style.backgroundImage = `url(${canvas.toDataURL()})`;
      }
      div.innerHTML = `<span class="num">${i + 1}</span><span class="cnt">∞</span>`;
      div.addEventListener('click', () => selectSlot(i));
      hotbarEl.appendChild(div);
    });
    updateBlockName();
  }

  function selectSlot(i) {
    selectedSlot = i;
    document.querySelectorAll('#hotbar .slot').forEach((s, idx) => {
      s.classList.toggle('sel', idx === i);
    });
    updateBlockName();
  }

  function updateBlockName() {
    const slot = HOTBAR[selectedSlot];
    if (slot && window.BLOCKS[slot.id]) {
      blockNameEl.textContent = window.BLOCKS[slot.id].name;
    }
  }

  // === Input handlers ===
  function onKeyDown(e) {
    keys[e.code] = true;
    if (e.code === 'Escape' && !menuOverlay.classList.contains('show')) {
      paused = !paused;
      pauseOverlay.classList.toggle('show', paused);
      if (paused && document.pointerLockElement) document.exitPointerLock();
    }
    if (e.code === 'KeyF' && world) {
      player.flying = !player.flying;
      player.vel.y = 0;
    }
    // Number keys 1-9 for hotbar
    if (e.code.startsWith('Digit')) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9) selectSlot(n - 1);
    }
  }

  function onKeyUp(e) {
    keys[e.code] = false;
  }

  function onPointerLockChange() {
    pointerLocked = document.pointerLockElement === renderer.domElement;
  }

  function requestPointerLock() {
    if (paused || menuOverlay.classList.contains('show') || pauseOverlay.classList.contains('show')) return;
    renderer.domElement.requestPointerLock();
  }

  function onMouseMove(e) {
    if (!pointerLocked) return;
    const sens = 0.0025;
    player.yaw -= e.movementX * sens;
    player.pitch -= e.movementY * sens;
    player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
  }

  function onMouseDown(e) {
    if (paused || menuOverlay.classList.contains('show')) return;
    if (!pointerLocked) { requestPointerLock(); return; }
    if (e.button === 0) breakBlock();
    else if (e.button === 2) placeBlock();
  }

  function onWheel(e) {
    e.preventDefault();
    if (e.deltaY > 0) selectSlot((selectedSlot + 1) % 9);
    else selectSlot((selectedSlot - 1 + 9) % 9);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // === Mobile ===
  function setupMobile() {
    const isTouch = ('ontouchstart' in window);
    if (!isTouch) { mc.style.display = 'none'; return; }
    mc.style.display = 'block';
    btnJump.addEventListener('touchstart', e => { e.preventDefault(); keys['Space'] = true; }, { passive: false });
    btnJump.addEventListener('touchend', e => { e.preventDefault(); keys['Space'] = false; }, { passive: false });
    btnPlace.addEventListener('touchstart', e => { e.preventDefault(); placeBlock(); }, { passive: false });
    btnBreak.addEventListener('touchstart', e => { e.preventDefault(); breakBlock(); }, { passive: false });
    // Look (right side) and move (left side)
    zoneR.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      mobileLook.active = true;
      mobileLook.lastX = t.clientX;
      mobileLook.lastY = t.clientY;
    }, { passive: false });
    zoneR.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0];
      if (mobileLook.active) {
        const dx = t.clientX - mobileLook.lastX;
        const dy = t.clientY - mobileLook.lastY;
        mobileLook.lastX = t.clientX;
        mobileLook.lastY = t.clientY;
        const sens = 0.005;
        player.yaw -= dx * sens;
        player.pitch -= dy * sens;
        player.pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, player.pitch));
      }
    }, { passive: false });
    zoneR.addEventListener('touchend', e => { e.preventDefault(); mobileLook.active = false; }, { passive: false });
    zoneL.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      mobileMove._startX = t.clientX;
      mobileMove._startY = t.clientY;
    }, { passive: false });
    zoneL.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - mobileMove._startX;
      const dy = t.clientY - mobileMove._startY;
      const dead = 12;
      mobileMove.forward = Math.abs(dy) > dead ? -Math.sign(dy) : 0;
      mobileMove.strafe = Math.abs(dx) > dead ? Math.sign(dx) : 0;
    }, { passive: false });
    zoneL.addEventListener('touchend', e => { e.preventDefault(); mobileMove.forward = 0; mobileMove.strafe = 0; }, { passive: false });
  }

  // === Block interaction ===
  function getEyePosition() {
    return { x: player.pos.x, y: player.pos.y + player.eye - 0.2, z: player.pos.z };
  }
  function getLookDirection() {
    const dir = new THREE.Vector3(
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch)
    );
    return dir.normalize();
  }

  function breakBlock() {
    if (!world) return;
    const eye = getEyePosition();
    const dir = getLookDirection();
    const hit = world.raycast({ x: eye.x, y: eye.y, z: eye.z }, { x: dir.x, y: dir.y, z: dir.z }, 6);
    if (!hit) return;
    // Don't break bedrock
    if (world.get(hit.x, hit.y, hit.z) === 14) return;
    world.set(hit.x, hit.y, hit.z, 0);
    rebuildMesh();
  }

  function placeBlock() {
    if (!world) return;
    const eye = getEyePosition();
    const dir = getLookDirection();
    const hit = world.raycast({ x: eye.x, y: eye.y, z: eye.z }, { x: dir.x, y: dir.y, z: dir.z }, 6);
    if (!hit || !hit.face) return;
    const nx = hit.x + hit.face.x, ny = hit.y + hit.face.y, nz = hit.z + hit.face.z;
    // Don't place inside the player
    const pxMin = Math.floor(player.pos.x - player.width / 2);
    const pxMax = Math.floor(player.pos.x + player.width / 2);
    const pyMin = Math.floor(player.pos.y);
    const pyMax = Math.floor(player.pos.y + player.height);
    const pzMin = Math.floor(player.pos.z - player.width / 2);
    const pzMax = Math.floor(player.pos.z + player.width / 2);
    if (nx >= pxMin && nx <= pxMax && ny >= pyMin && ny <= pyMax && nz >= pzMin && nz <= pzMax) return;
    const slot = HOTBAR[selectedSlot];
    if (!slot || slot.count <= 0) return;
    world.set(nx, ny, nz, slot.id);
    rebuildMesh();
  }

  function rebuildMesh() {
    if (!world) return;
    // Remove old mesh
    if (world.meshGroup) scene.remove(world.meshGroup);
    // Build new
    const mesh = world.buildMesh(THREE);
    scene.add(mesh);
  }

  // === Physics ===
  function collidePlayer(dt) {
    if (!world) return;
    const w = player.width, h = player.height;
    // Apply gravity
    if (!player.flying) {
      player.vel.y -= 28 * dt;
      if (player.vel.y < -50) player.vel.y = -50;
    } else {
      // No gravity in fly mode
      if (keys['Space']) player.vel.y = 8;
      else if (keys['ShiftLeft'] || keys['ShiftRight']) player.vel.y = -8;
      else player.vel.y = 0;
    }

    // Movement input
    let forward = 0, strafe = 0;
    if (keys['KeyW'] || keys['ArrowUp']) forward += 1;
    if (keys['KeyS'] || keys['ArrowDown']) forward -= 1;
    if (keys['KeyA'] || keys['ArrowLeft']) strafe -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) strafe += 1;
    if (mobileMove.forward) forward = mobileMove.forward;
    if (mobileMove.strafe) strafe = mobileMove.strafe;

    const speed = player.flying ? 12 : 5.5;
    const sinY = Math.sin(player.yaw), cosY = Math.cos(player.yaw);
    // Forward vector (XZ plane)
    const fx = -sinY, fz = -cosY;
    // Right vector
    const rx = cosY, rz = -sinY;
    const vx = (fx * forward + rx * strafe);
    const vz = (fz * forward + rz * strafe);
    const len = Math.hypot(vx, vz);
    if (len > 0) {
      player.vel.x = (vx / len) * speed;
      player.vel.z = (vz / len) * speed;
    } else {
      player.vel.x = 0; player.vel.z = 0;
    }
    if (player.flying) {
      // No friction in fly mode
    }

    // Jump
    if (keys['Space'] && player.onGround && !player.flying) {
      player.vel.y = 9;
      player.onGround = false;
    }

    // Move + collide axis-by-axis
    let newX = player.pos.x + player.vel.x * dt;
    if (collidesAt(newX, player.pos.y, player.pos.z)) {
      player.vel.x = 0;
    } else {
      player.pos.x = newX;
    }
    let newZ = player.pos.z + player.vel.z * dt;
    if (collidesAt(player.pos.x, player.pos.y, newZ)) {
      player.vel.z = 0;
    } else {
      player.pos.z = newZ;
    }
    let newY = player.pos.y + player.vel.y * dt;
    if (collidesAt(player.pos.x, newY, player.pos.z)) {
      if (player.vel.y < 0) player.onGround = true;
      player.vel.y = 0;
    } else {
      player.pos.y = newY;
      player.onGround = false;
    }

    // Fall damage / void
    if (player.pos.y < -10) {
      damagePlayer(2);
      const sp = world.findSpawnPoint();
      player.pos.set(sp.x, sp.y, sp.z);
      player.vel.set(0, 0, 0);
    }

    // Block at feet check (suffocation)
    // ... (omitted for simplicity)
  }

  function collidesAt(x, y, z) {
    const w = player.width / 2, h = player.height;
    const x0 = Math.floor(x - w), x1 = Math.floor(x + w);
    const y0 = Math.floor(y), y1 = Math.floor(y + h);
    const z0 = Math.floor(z - w), z1 = Math.floor(z + w);
    for (let bx = x0; bx <= x1; bx++) {
      for (let by = y0; by <= y1; by++) {
        for (let bz = z0; bz <= z1; bz++) {
          const b = world.get(bx, by, bz);
          if (b === 0) continue;
          const info = window.BLOCKS[b];
          if (!info) continue;
          if (info.solid && !(info.transparent && b !== 9)) return true;
          // Water doesn't block, glass does
        }
      }
    }
    return false;
  }

  function damagePlayer(amt) {
    if (player.invulnTimer > 0) return;
    player.health = Math.max(0, player.health - amt);
    player.invulnTimer = 1.0;
    dmgFlashEl.style.opacity = '1';
    setTimeout(() => dmgFlashEl.style.opacity = '0', 200);
    updateHearts();
    if (player.health <= 0) {
      // Respawn
      const sp = world.findSpawnPoint();
      player.pos.set(sp.x, sp.y, sp.z);
      player.vel.set(0, 0, 0);
      player.health = player.maxHealth;
      updateHearts();
    }
  }

  function updateHearts() {
    heartsEl.style.display = 'flex';
    let txt = '';
    for (let i = 0; i < player.maxHealth; i++) {
      txt += i < player.health ? '❤' : '🖤';
    }
    heartsEl.textContent = txt;
  }

  // === Day/night cycle ===
  function updateDayNight(dt) {
    dayTime = (dayTime + dt / 240) % 1; // 4-minute day
    const sun = scene.userData.sun;
    const ambient = scene.userData.ambient;
    const sunSphere = scene.userData.sunSphere;
    const moonSphere = scene.userData.moonSphere;
    // Sun angle: at dayTime 0.25 sun rises in east (positive X), 0.5 at top, 0.75 sets in west
    const angle = (dayTime - 0.25) * Math.PI * 2;
    const sx = Math.cos(angle) * 100;
    const sy = Math.sin(angle) * 100;
    sun.position.set(sx, sy, 50);
    sunSphere.position.set(sx * 0.8, sy * 0.8 + 5, 50);
    moonSphere.position.set(-sx * 0.8, -sy * 0.8 + 5, 50);
    // Light intensity peaks at noon, drops at night
    const daylight = Math.max(0, Math.sin(angle));
    sun.intensity = daylight * 1.0;
    ambient.intensity = 0.2 + daylight * 0.4;
    // Background color
    const day = new THREE.Color(0x87ceeb);
    const night = new THREE.Color(0x0a0e1a);
    const sunset = new THREE.Color(0xff7b3a);
    let bg;
    if (daylight > 0.3) bg = day;
    else if (daylight > 0) bg = night.clone().lerp(sunset, daylight / 0.3);
    else bg = night;
    scene.background = bg;
    scene.fog.color = bg;
    // Time icon
    if (daylight > 0.3) timeIcon.textContent = '☀️';
    else if (daylight > 0) timeIcon.textContent = '🌅';
    else timeIcon.textContent = '🌙';
  }

  // === HUD update ===
  function updateHUD() {
    if (!world) { hud.innerHTML = ''; return; }
    const x = Math.floor(player.pos.x);
    const y = Math.floor(player.pos.y);
    const z = Math.floor(player.pos.z);
    const block = world.get(x, y - 1, z);
    const blockName = block ? (window.BLOCKS[block] ? window.BLOCKS[block].name : '?') : 'Air';
    hud.innerHTML = `XYZ: <b>${x} ${y} ${z}</b><br>Block: <b>${blockName}</b><br>FPS: <b id="fps">0</b>`;
  }

  // === Main loop ===
  let fpsTimer = 0, fpsCount = 0, fpsValue = 0;

  function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    // FPS counter
    fpsTimer += dt; fpsCount++;
    if (fpsTimer >= 0.5) {
      fpsValue = Math.round(fpsCount / fpsTimer);
      fpsTimer = 0; fpsCount = 0;
      const fpsEl = document.getElementById('fps');
      if (fpsEl) fpsEl.textContent = fpsValue;
    }

    if (!paused && !menuOverlay.classList.contains('show') && world) {
      collidePlayer(dt);
      if (mobSystem) mobSystem.update(dt);
      if (player.invulnTimer > 0) player.invulnTimer -= dt;
      updateDayNight(dt);

      // Update camera
      camera.position.set(player.pos.x, player.pos.y + player.eye, player.pos.z);
      camera.rotation.order = 'YXZ';
      camera.rotation.y = player.yaw;
      camera.rotation.x = player.pitch;

      // Update highlight
      const eye = getEyePosition();
      const dir = getLookDirection();
      const hit = world.raycast({ x: eye.x, y: eye.y, z: eye.z }, { x: dir.x, y: dir.y, z: dir.z }, 6);
      if (hit) {
        highlightMesh.visible = true;
        highlightMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
      } else {
        highlightMesh.visible = false;
      }
    }

    updateHUD();
    renderer.render(scene, camera);
  }

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
