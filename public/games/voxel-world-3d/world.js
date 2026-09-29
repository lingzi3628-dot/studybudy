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
  // We build a single merged geometry grouped by block-id material groups.
  World.prototype.buildMesh = function (THREE) {
    const s = this.size, h = this.height;
    // Per block-type: arrays of { position, normal, uv, ao }
    const byType = {}; // blockId → { positions, normals, indices, uvs }
    for (let x = 0; x < s; x++) {
      for (let y = 0; y < h; y++) {
        for (let z = 0; z < s; z++) {
          const b = this.get(x, y, z);
          if (b === 0) continue;
          const info = BLOCKS[b];
          if (!info || info.transparent && b === 7) {
            // Water handled separately as a flat translucent plane on top
            // Actually for simplicity, we'll render water as solid faces with transparency
          }
          // Check 6 neighbors
          const neighbors = [
            { dx: 1, dy: 0, dz: 0, face: 'right' },
            { dx: -1, dy: 0, dz: 0, face: 'left' },
            { dx: 0, dy: 1, dz: 0, face: 'top' },
            { dx: 0, dy: -1, dz: 0, face: 'bottom' },
            { dx: 0, dy: 0, dz: 1, face: 'front' },
            { dx: 0, dy: 0, dz: -1, face: 'back' },
          ];
          for (const n of neighbors) {
            const nb = this.get(x + n.dx, y + n.dy, z + n.dz);
            const nbInfo = BLOCKS[nb];
            if (nb === 0 || (nbInfo && nbInfo.transparent && nb !== b)) {
              // Add this face
              if (!byType[b]) byType[b] = { positions: [], normals: [], indices: [], uvs: [] };
              this._addFace(THREE, byType[b], x, y, z, n.face, info);
            }
          }
        }
      }
    }
    // Build a Group of meshes per block-type
    const group = new THREE.Group();
    const meshes = {};
    for (const id in byType) {
      const d = byType[id];
      const info = BLOCKS[id];
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(d.positions, 3));
      geom.setAttribute('normal', new THREE.Float32BufferAttribute(d.normals, 3));
      geom.setAttribute('uv', new THREE.Float32BufferAttribute(d.uvs, 2));
      geom.setIndex(d.indices);
      const mat = new THREE.MeshLambertMaterial({
        color: info.color,
        transparent: !!info.transparent,
        opacity: info.opacity || 1.0,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.blockId = parseInt(id, 10);
      group.add(mesh);
      meshes[id] = mesh;
    }
    this.meshGroup = group;
    this.meshes = meshes;
    this.dirty = false;
    return group;
  };

  World.prototype._addFace = function (THREE, d, x, y, z, face, info) {
    const baseIdx = d.positions.length / 3;
    let positions, normals;
    // Each face = 4 vertices (CCW from outside)
    if (face === 'top') {
      positions = [
        x, y + 1, z,
        x + 1, y + 1, z,
        x + 1, y + 1, z + 1,
        x, y + 1, z + 1,
      ];
      normals = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
    } else if (face === 'bottom') {
      positions = [
        x, y, z + 1,
        x + 1, y, z + 1,
        x + 1, y, z,
        x, y, z,
      ];
      normals = [0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0];
    } else if (face === 'right') {
      positions = [
        x + 1, y, z,
        x + 1, y + 1, z,
        x + 1, y + 1, z + 1,
        x + 1, y, z + 1,
      ];
      normals = [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0];
    } else if (face === 'left') {
      positions = [
        x, y, z + 1,
        x, y + 1, z + 1,
        x, y + 1, z,
        x, y, z,
      ];
      normals = [-1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0];
    } else if (face === 'front') {
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
})();
