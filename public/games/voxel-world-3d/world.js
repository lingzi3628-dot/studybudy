// ============================================================
// world.js — Voxel terrain generation + storage
// Exposes window.World
// ============================================================
(function () {
  'use strict';

  // Block types: id → { name, color, transparent, solid }
  const BLOCKS = {
    0:  { name: 'Air',        color: 0x000000, transparent: true,  solid: false },
    1:  { name: 'Grass',      color: 0x7ac74f, transparent: false, solid: true, top: 0x9be86b, side: 0x6b4423 },
    2:  { name: 'Dirt',       color: 0x6b4423, transparent: false, solid: true },
    3:  { name: 'Stone',      color: 0x808080, transparent: false, solid: true },
    4:  { name: 'Sand',       color: 0xf4e4a1, transparent: false, solid: true },
    5:  { name: 'Wood',       color: 0x8b5a2b, transparent: false, solid: true, top: 0xa87a4a, side: 0x6b4423 },
    6:  { name: 'Leaves',     color: 0x4a8c2e, transparent: false, solid: true },
    7:  { name: 'Water',      color: 0x3b82f6, transparent: true,  solid: false, opacity: 0.7 },
    8:  { name: 'Brick',      color: 0xa83232, transparent: false, solid: true },
    9:  { name: 'Glass',      color: 0xc4e7ff, transparent: true,  solid: true, opacity: 0.4 },
    10: { name: 'Gold',       color: 0xffd24a, transparent: false, solid: true, metal: true },
    11: { name: 'Diamond',    color: 0x4ad8e8, transparent: false, solid: true, metal: true },
    12: { name: 'Plank',      color: 0xc89a5b, transparent: false, solid: true },
    13: { name: 'Cobble',     color: 0x666666, transparent: false, solid: true },
    14: { name: 'Bedrock',    color: 0x222222, transparent: false, solid: true },
  };

  // ============================================================
  // Procedural pixel-art texture generation (Minecraft-style)
  // ============================================================

  // Helper: pack a #rrggbb hex into a number
  function hx(s) { return parseInt(s.replace('#',''), 16); }

  // Mulberry32 seeded PRNG for stable per-texture randomness
  function makeRng(seed) {
    let a = seed | 0;
    return function() {
      a = (a + 0x6D2B79F5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Build a 16×16 pixel-art texture on a canvas
  // pixelFn(x, y, rng) returns a hex color string or null (skip)
  function makeTexture(pixelFn, seed) {
    const cv = document.createElement('canvas');
    cv.width = 16; cv.height = 16;
    const ctx = cv.getContext('2d');
    const rng = makeRng(seed);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const c = pixelFn(x, y, rng);
        if (c) {
          ctx.fillStyle = c;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    return cv;
  }

  function darken(hex, amt) {
    const r = Math.max(0, ((hex >> 16) & 0xff) - amt);
    const g = Math.max(0, ((hex >> 8) & 0xff) - amt);
    const b = Math.max(0, (hex & 0xff) - amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function lighten(hex, amt) {
    const r = Math.min(255, ((hex >> 16) & 0xff) + amt);
    const g = Math.min(255, ((hex >> 8) & 0xff) + amt);
    const b = Math.min(255, (hex & 0xff) + amt);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function hex2str(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

  // Texture builders — each returns a canvas
  function texGrassTop() {
    const base = 0x7ab84a, dark = 0x5e9e3a, light = 0x9bd86a;
    return makeTexture((x, y, rng) => {
      const r = rng();
      if (r < 0.15) return hex2str(dark);
      if (r > 0.85) return hex2str(light);
      return hex2str(base);
    }, 100);
  }
  function texGrassSide() {
    // Brown dirt bottom, green grass top with a few pixels of overhang
    const dirt = 0x7a5230, dirtDark = 0x5e3f24, dirtLight = 0x9c6638;
    const grass = 0x7ab84a, grassDark = 0x5e9e3a, grassLight = 0x9bd86a;
    return makeTexture((x, y, rng) => {
      if (y < 3 + Math.floor(rng() * 1.5)) {
        // Top grass strip (top 3-4 pixels)
        const r = rng();
        if (r < 0.2) return hex2str(grassDark);
        if (r > 0.8) return hex2str(grassLight);
        return hex2str(grass);
      } else if (y < 5 && rng() < 0.3) {
        // Grass overhang pixels
        return hex2str(grass);
      } else {
        // Dirt body
        const r = rng();
        if (r < 0.2) return hex2str(dirtDark);
        if (r > 0.8) return hex2str(dirtLight);
        return hex2str(dirt);
      }
    }, 200);
  }
  function texDirt() {
    const base = 0x7a5230, dark = 0x5e3f24, light = 0x9c6638;
    return makeTexture((x, y, rng) => {
      const r = rng();
      if (r < 0.2) return hex2str(dark);
      if (r > 0.8) return hex2str(light);
      return hex2str(base);
    }, 300);
  }
  function texStone() {
    const base = 0x808080, dark = 0x606060, light = 0xa0a0a0;
    return makeTexture((x, y, rng) => {
      const r = rng();
      if (r < 0.15) return hex2str(dark);
      if (r > 0.85) return hex2str(light);
      // Add a few cracks
      if ((x === 4 && y >= 4 && y <= 9) || (y === 11 && x >= 2 && x <= 7)) return hex2str(dark);
      return hex2str(base);
    }, 400);
  }
  function texCobble() {
    const base = 0x707070, dark = 0x4a4a4a, light = 0x9a9a9a;
    return makeTexture((x, y, rng) => {
      // Cobblestone: alternating light/dark "rocks" with mortar lines
      const cellX = Math.floor(x / 4), cellY = Math.floor(y / 4);
      const subX = x % 4, subY = y % 4;
      // Mortar (dark border between cells)
      if (subX === 0 || subY === 0) return hex2str(dark);
      const r = ((cellX * 7 + cellY * 13 + subX + subY) % 17) / 17;
      if (r < 0.3) return hex2str(light);
      if (r > 0.85) return hex2str(dark);
      return hex2str(base);
    }, 500);
  }
  function texSand() {
    const base = 0xe8d68f, dark = 0xc7b272, light = 0xf4e8b5;
    return makeTexture((x, y, rng) => {
      const r = rng();
      if (r < 0.2) return hex2str(dark);
      if (r > 0.8) return hex2str(light);
      return hex2str(base);
    }, 600);
  }
  function texWoodTop() {
    // Tree rings
    const center = 0x9a7245, ring = 0x6b4423, dark = 0x4a3018;
    return makeTexture((x, y, rng) => {
      const dx = x - 7.5, dy = y - 7.5;
      const d = Math.sqrt(dx*dx + dy*dy);
      const ringIdx = Math.floor(d);
      if (ringIdx % 2 === 0) return hex2str(ring);
      return hex2str(center);
    }, 700);
  }
  function texWoodSide() {
    // Vertical bark grain
    const base = 0x6b4423, dark = 0x4a3018, light = 0x8b5a2b;
    return makeTexture((x, y, rng) => {
      // Vertical streaks
      const streak = (x * 3 + Math.floor(y / 4)) % 5;
      if (streak === 0) return hex2str(dark);
      if (streak === 4) return hex2str(light);
      // Random dark pixels for knots
      if (rng() < 0.04) return hex2str(dark);
      return hex2str(base);
    }, 800);
  }
  function texLeaves() {
    const base = 0x4a8c2e, dark = 0x356823, light = 0x6bac42;
    return makeTexture((x, y, rng) => {
      const r = rng();
      if (r < 0.35) return hex2str(dark);
      if (r > 0.7) return hex2str(light);
      return hex2str(base);
    }, 900);
  }
  function texPlank() {
    const base = 0xb88853, dark = 0x8e6840, light = 0xd2a76e;
    return makeTexture((x, y, rng) => {
      // Horizontal planks 4px tall, vertical seams offset
      const row = Math.floor(y / 4);
      const seamX = (row % 2 === 0) ? 8 : 0;
      if (y % 4 === 0) return hex2str(dark);
      if (x === seamX) return hex2str(dark);
      const r = rng();
      if (r < 0.15) return hex2str(dark);
      if (r > 0.85) return hex2str(light);
      return hex2str(base);
    }, 1000);
  }
  function texBrick() {
    const base = 0x9c3838, mortar = 0xc8b8a0, dark = 0x6e2424;
    return makeTexture((x, y, rng) => {
      const row = Math.floor(y / 4);
      const brickH = y % 4;
      const offset = (row % 2 === 0) ? 0 : 4;
      const brickX = (x + offset) % 8;
      if (brickH === 0) return hex2str(mortar);
      if (brickX === 0) return hex2str(mortar);
      if (rng() < 0.08) return hex2str(dark);
      return hex2str(base);
    }, 1100);
  }
  function texGlass() {
    return makeTexture((x, y, rng) => {
      // Border frame + transparent center with a few highlight streaks
      if (x === 0 || y === 0 || x === 15 || y === 15) return '#a8d8f0';
      if (x === 1 || y === 1 || x === 14 || y === 14) return '#c8e8ff';
      // Diagonal highlight
      if (x === y && x < 8) return '#ffffff';
      if (x + y === 6 && x < 6) return '#e0f4ff';
      return '#d0e8f5';
    }, 1200);
  }
  function texGold() {
    const base = 0xfcc438, dark = 0xc89028, light = 0xffe878;
    return makeTexture((x, y, rng) => {
      const r = rng();
      if (r < 0.25) return hex2str(dark);
      if (r > 0.75) return hex2str(light);
      // Shiny spots
      if ((x === 4 && y === 4) || (x === 11 && y === 9)) return hex2str(light);
      return hex2str(base);
    }, 1300);
  }
  function texDiamond() {
    const base = 0x5ce8e8, dark = 0x2ec0c8, light = 0xa0f8f8;
    return makeTexture((x, y, rng) => {
      const r = rng();
      if (r < 0.2) return hex2str(dark);
      if (r > 0.85) return hex2str(light);
      // Crystal facets
      if (x === 7 && y === 7) return hex2str(light);
      if (x + y === 14 && x >= 5 && x <= 10) return hex2str(light);
      return hex2str(base);
    }, 1400);
  }
  function texBedrock() {
    const base = 0x383838, dark = 0x1a1a1a, light = 0x555555;
    return makeTexture((x, y, rng) => {
      const r = rng();
      if (r < 0.3) return hex2str(dark);
      if (r > 0.8) return hex2str(light);
      return hex2str(base);
    }, 1500);
  }
  function texWater() {
    const base = 0x3b6ed8, dark = 0x2854b8, light = 0x6a98ec;
    return makeTexture((x, y, rng) => {
      // Wavy pattern
      const wave = Math.sin((x + y * 0.5) * 0.8) * 0.5 + 0.5;
      if (wave < 0.3) return hex2str(dark);
      if (wave > 0.7) return hex2str(light);
      return hex2str(base);
    }, 1600);
  }

  // Per-block-type face textures: { top, side, bottom }
  // For most blocks, all three are the same; for grass and wood they differ.
  const TEXTURES = {
    1:  { top: texGrassTop(), side: texGrassSide(), bottom: texDirt() },     // Grass
    2:  { top: texDirt(), side: texDirt(), bottom: texDirt() },               // Dirt
    3:  { top: texStone(), side: texStone(), bottom: texStone() },            // Stone
    4:  { top: texSand(), side: texSand(), bottom: texSand() },               // Sand
    5:  { top: texWoodTop(), side: texWoodSide(), bottom: texWoodTop() },     // Wood
    6:  { top: texLeaves(), side: texLeaves(), bottom: texLeaves() },         // Leaves
    7:  { top: texWater(), side: texWater(), bottom: texWater() },            // Water
    8:  { top: texBrick(), side: texBrick(), bottom: texBrick() },            // Brick
    9:  { top: texGlass(), side: texGlass(), bottom: texGlass() },            // Glass
    10: { top: texGold(), side: texGold(), bottom: texGold() },               // Gold
    11: { top: texDiamond(), side: texDiamond(), bottom: texDiamond() },      // Diamond
    12: { top: texPlank(), side: texPlank(), bottom: texPlank() },           // Plank
    13: { top: texCobble(), side: texCobble(), bottom: texCobble() },         // Cobble
    14: { top: texBedrock(), side: texBedrock(), bottom: texBedrock() },       // Bedrock
  };

  // Cache of THREE.Texture per block id + face direction
  const textureCache = {};
  function getTexture(THREE, blockId, face) {
    const key = blockId + ':' + face;
    if (textureCache[key]) return textureCache[key];
    const texSet = TEXTURES[blockId];
    if (!texSet) return null;
    const cv = face === 'top' ? texSet.top : face === 'bottom' ? texSet.bottom : texSet.side;
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter; // crisp pixel art
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    textureCache[key] = tex;
    return tex;
  }

  function hash2D(x, z, seed) {
    let h = (x * 374761393 + z * 668265263 + seed * 374761391) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967295; // 0..1
  }
  function smoothNoise(x, z, seed) {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const x1 = x0 + 1, z1 = z0 + 1;
    const sx = x - x0, sz = z - z0;
    const n00 = hash2D(x0, z0, seed);
    const n10 = hash2D(x1, z0, seed);
    const n01 = hash2D(x0, z1, seed);
    const n11 = hash2D(x1, z1, seed);
    // Smoothstep
    const fx = sx * sx * (3 - 2 * sx);
    const fz = sz * sz * (3 - 2 * sz);
    const nx0 = n00 * (1 - fx) + n10 * fx;
    const nx1 = n01 * (1 - fx) + n11 * fx;
    return nx0 * (1 - fz) + nx1 * fz;
  }

  function fbm(x, z, seed, octaves) {
    octaves = octaves || 4;
    let val = 0, amp = 1, freq = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
      val += smoothNoise(x * freq, z * freq, seed + i * 1000) * amp;
      total += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return val / total;
  }

  function World(seed, size) {
    this.seed = seed || Math.floor(Math.random() * 99999);
    this.size = size || 96; // world is size×size blocks in X/Z
    this.height = 32; // world is 32 blocks tall
    // Store blocks as a flat Uint8Array: x + z*size + y*size*size
    this.data = new Uint8Array(this.size * this.size * this.height);
    // Mesh cache: per Y-layer, an InstancedMesh of visible faces — too complex for r128.
    // Simpler: build a single merged BufferGeometry per "dirty" region.
    // For simplicity here: maintain a Map of block positions to mesh per (x,z) chunk column.
    this.dirty = true;
    this.generate();
  }

  World.prototype.idx = function (x, y, z) {
    return x + z * this.size + y * this.size * this.size;
  };

  World.prototype.get = function (x, y, z) {
    if (x < 0 || x >= this.size || z < 0 || z >= this.size || y < 0 || y >= this.height) return 0;
    return this.data[this.idx(x, y, z)];
  };

  World.prototype.set = function (x, y, z, block) {
    if (x < 0 || x >= this.size || z < 0 || z >= this.size || y < 0 || y >= this.height) return;
    this.data[this.idx(x, y, z)] = block;
    this.dirty = true;
  };

  World.prototype.generate = function () {
    const s = this.size, h = this.height;
    const seed = this.seed;
    const seaLevel = Math.floor(h * 0.4); // ~12
    for (let x = 0; x < s; x++) {
      for (let z = 0; z < s; z++) {
        // Heightmap via fbm
        const e = fbm(x / 32, z / 32, seed, 4);
        const mountain = Math.pow(e, 1.5);
        const terrainH = Math.floor(mountain * h * 0.7) + 2;
        for (let y = 0; y < h; y++) {
          let b = 0;
          if (y === 0) b = 14; // bedrock
          else if (y < terrainH - 4) b = 3; // stone
          else if (y < terrainH - 1) b = 2; // dirt
          else if (y < terrainH) {
            // Top block — grass if above sea level, sand if at/below
            b = (terrainH <= seaLevel + 1) ? 4 : 1;
          } else if (y <= seaLevel) {
            b = 7; // water
          }
          this.data[this.idx(x, y, z)] = b;
        }
        // Plant trees on grass tops occasionally
        if (this.get(x, terrainH - 1, z) === 1 && terrainH > seaLevel + 1) {
          if (hash2D(x, z, seed + 42) > 0.97) {
            this.plantTree(x, terrainH, z);
          }
        }
        // Scatter ores in stone (rare gold/diamond)
        for (let y = 1; y < terrainH - 4; y++) {
          if (this.get(x, y, z) === 3) {
            const r = hash2D(x * 7, y * 13 + z * 31, seed + 99);
            if (r > 0.9985) this.data[this.idx(x, y, z)] = 11; // diamond (rare)
            else if (r > 0.995) this.data[this.idx(x, y, z)] = 10; // gold
          }
        }
      }
    }
    this.dirty = true;
  };

  World.prototype.plantTree = function (x, y, z) {
    const h = 4 + Math.floor(hash2D(x, z, this.seed + 7) * 3); // 4-6 trunk
    for (let i = 0; i < h; i++) {
      if (y + i < this.height) this.set(x, y + i, z, 5); // wood
    }
    // Leaves canopy
    const cy = y + h;
    for (let dy = -1; dy <= 1; dy++) {
      const r = dy === 1 ? 1 : 2;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (Math.abs(dx) === r && Math.abs(dz) === r && Math.random() < 0.5) continue;
          const lx = x + dx, ly = cy + dy, lz = z + dz;
          if (lx >= 0 && lx < this.size && lz >= 0 && lz < this.size && ly < this.height) {
            if (this.get(lx, ly, lz) === 0) this.set(lx, ly, lz, 6);
          }
        }
      }
    }
  };

  // === Mesh building ===
  // For each block, only render faces that are exposed to air or transparent.
  // We split faces by (blockId, faceDirection) so we can apply different
  // textures to top/side/bottom of grass, wood, etc.
  World.prototype.buildMesh = function (THREE) {
    const s = this.size, h = this.height;
    // byType: { "blockId:face" → { positions, normals, indices, uvs } }
    const byType = {};
    for (let x = 0; x < s; x++) {
      for (let y = 0; y < h; y++) {
        for (let z = 0; z < s; z++) {
          const b = this.get(x, y, z);
          if (b === 0) continue;
          const info = BLOCKS[b];
          if (!info) continue;
          // Check 6 neighbors
          const neighbors = [
            { dx: 1, dy: 0, dz: 0, face: 'side' },
            { dx: -1, dy: 0, dz: 0, face: 'side' },
            { dx: 0, dy: 1, dz: 0, face: 'top' },
            { dx: 0, dy: -1, dz: 0, face: 'bottom' },
            { dx: 0, dy: 0, dz: 1, face: 'side' },
            { dx: 0, dy: 0, dz: -1, face: 'side' },
          ];
          for (const n of neighbors) {
            const nb = this.get(x + n.dx, y + n.dy, z + n.dz);
            const nbInfo = BLOCKS[nb];
            if (nb === 0 || (nbInfo && nbInfo.transparent && nb !== b)) {
              const key = b + ':' + n.face;
              if (!byType[key]) byType[key] = { positions: [], normals: [], indices: [], uvs: [] };
              this._addFace(THREE, byType[key], x, y, z, n.face === 'top' ? 'top' : n.face === 'bottom' ? 'bottom' : 'side', info, n.face);
            }
          }
        }
      }
    }
    // Build a Group of meshes per (blockId, face)
    const group = new THREE.Group();
    const meshes = {};
    for (const key in byType) {
      const d = byType[key];
      const [blockIdStr, faceDir] = key.split(':');
      const blockId = parseInt(blockIdStr, 10);
      const info = BLOCKS[blockId];
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(d.normals, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(d.uvs, 2));
      geom.setIndex(d.indices);
      const tex = getTexture(THREE, blockId, faceDir);
      const matOpts = {
        map: tex,
        transparent: !!info.transparent,
        opacity: info.opacity || 1.0,
      };
      const mat = new THREE.MeshLambertMaterial(matOpts);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData = { blockId, faceDir: key };
      group.add(mesh);
      meshes[key] = mesh;
    }
    this.meshGroup = group;
    this.meshes = meshes;
    this.dirty = false;
    return group;
  };

  World.prototype._addFace = function (THREE, d, x, y, z, faceType, info, origFace) {
    const baseIdx = d.positions.length / 3;
    let positions, normals;
    // Each face = 4 vertices (CCW from outside)
    if (origFace === 'top') {
      positions = [
        x, y + 1, z,
        x + 1, y + 1, z,
        x + 1, y + 1, z + 1,
        x, y + 1, z + 1,
      ];
      normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    } else if (origFace === 'bottom') {
      positions = [
        x, y, z + 1,
        x + 1, y, z + 1,
        x + 1, y, z,
        x, y, z,
      ];
      normals = [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0];
    } else if (origFace === 'right') {
      positions = [
        x + 1, y, z,
        x + 1, y + 1, z,
        x + 1, y + 1, z + 1,
        x + 1, y, z + 1,
      ];
      normals = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];
    } else if (origFace === 'left') {
      positions = [
        x, y, z + 1,
        x, y + 1, z + 1,
        x, y + 1, z,
        x, y, z,
      ];
      normals = [-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0];
    } else if (origFace === 'front') {
      positions = [
        x + 1, y, z + 1,
        x + 1, y + 1, z + 1,
        x, y + 1, z + 1,
        x, y, z + 1,
      ];
      normals = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    } else { // back
      positions = [
        x, y, z,
        x, y + 1, z,
        x + 1, y + 1, z,
        x + 1, y, z,
      ];
      normals = [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1];
    }
    for (const v of positions) d.positions.push(v);
    for (const n of normals) d.normals.push(n);
    d.uvs.push(0, 0, 1, 0, 1, 1, 0, 1);
    d.indices.push(baseIdx, baseIdx + 1, baseIdx + 2, baseIdx, baseIdx + 2, baseIdx + 3);
  };

  // Raycast voxel pick (DDA) — returns { x, y, z, face } or null
  World.prototype.raycast = function (origin, direction, maxDist) {
    maxDist = maxDist || 8;
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = Math.sign(direction.x), stepY = Math.sign(direction.y), stepZ = Math.sign(direction.z);
    const tDeltaX = stepX !== 0 ? Math.abs(1 / direction.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / direction.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / direction.z) : Infinity;
    let tMaxX = stepX > 0 ? (x + 1 - origin.x) / direction.x : (stepX < 0 ? (x - origin.x) / direction.x : Infinity);
    let tMaxY = stepY > 0 ? (y + 1 - origin.y) / direction.y : (stepY < 0 ? (y - origin.y) / direction.y : Infinity);
    let tMaxZ = stepZ > 0 ? (z + 1 - origin.z) / direction.z : (stepZ < 0 ? (z - origin.z) / direction.z : Infinity);
    let face = null;
    let t = 0;
    while (t < maxDist) {
      const b = this.get(x, y, z);
      if (b !== 0 && (!BLOCKS[b] || !BLOCKS[b].transparent || b !== 7)) {
        return { x, y, z, face, dist: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; face = { x: -stepX, y: 0, z: 0 };
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; face = { x: 0, y: -stepY, z: 0 };
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = { x: 0, y: 0, z: -stepZ };
      }
    }
    return null;
  };

  World.prototype.findSpawnPoint = function () {
    // Center of world, on top of terrain
    const cx = Math.floor(this.size / 2), cz = Math.floor(this.size / 2);
    for (let y = this.height - 1; y >= 0; y--) {
      const b = this.get(cx, y, cz);
      if (b !== 0 && (!BLOCKS[b] || !BLOCKS[b].transparent)) {
        return { x: cx + 0.5, y: y + 2.6, z: cz + 0.5 };
      }
    }
    return { x: cx + 0.5, y: 20, z: cz + 0.5 };
  };

  window.World = World;
  window.BLOCKS = BLOCKS;
  // Expose the per-block texture canvases so main.js can render pixel-art hotbar previews
  window.BLOCK_SIDE_CANVASES = {};
  window.BLOCK_TOP_CANVASES = {};
  for (const id in TEXTURES) {
    window.BLOCK_SIDE_CANVASES[id] = TEXTURES[id].side;
    window.BLOCK_TOP_CANVASES[id] = TEXTURES[id].top;
  }
})();
