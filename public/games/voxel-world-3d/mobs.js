// ============================================================
// mobs.js — Simple ambient mobs (animals wandering the world)
// Exposes window.MobSystem
// ============================================================
(function () {
  'use strict';

  function Mob(type, x, y, z) {
    this.type = type; // 'pig' | 'sheep' | 'chicken'
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.mesh = null;
    this.wanderTimer = 0;
    this.alive = true;
    this.health = 1;
  }

  function MobSystem(world) {
    this.world = world;
    this.mobs = [];
  }

  MobSystem.prototype.spawn = function (THREE) {
    const w = this.world.size, h = this.world.height;
    // Spawn ~10 mobs randomly on grass
    const types = ['pig', 'sheep', 'chicken'];
    for (let i = 0; i < 10; i++) {
      const t = types[Math.floor(Math.random() * 3)];
      let tries = 30;
      while (tries-- > 0) {
        const x = Math.floor(Math.random() * w);
        const z = Math.floor(Math.random() * w);
        for (let y = h - 1; y >= 1; y--) {
          const b = this.world.get(x, y, z);
          if (b === 1 && this.world.get(x, y + 1, z) === 0 && this.world.get(x, y + 2, z) === 0) {
            const m = new Mob(t, x + 0.5, y + 1, z + 0.5);
            m.mesh = this._buildMesh(THREE, t);
            m.mesh.position.set(m.x, m.y, m.z);
            this.mobs.push(m);
            return m;
          }
        }
      }
    }
    return null;
  };

  MobSystem.prototype.spawnAll = function (THREE, group) {
    for (let i = 0; i < 12; i++) {
      const m = this.spawn(THREE);
      if (m && m.mesh && group) group.add(m.mesh);
    }
  };

  MobSystem.prototype._buildMesh = function (THREE, type) {
    const group = new THREE.Group();
    let bodyColor, headColor;
    if (type === 'pig') { bodyColor = 0xf4a6c0; headColor = 0xf4a6c0; }
    else if (type === 'sheep') { bodyColor = 0xeaeaea; headColor = 0xd4c4b0; }
    else { bodyColor = 0xf5f5dc; headColor = 0xf5f5dc; }

    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const headMat = new THREE.MeshLambertMaterial({ color: headColor });

    // Body
    const bodyW = type === 'chicken' ? 0.4 : 0.6;
    const bodyH = type === 'chicken' ? 0.35 : 0.55;
    const bodyD = type === 'chicken' ? 0.5 : 0.8;
    const body = new THREE.Mesh(new THREE.BoxGeometry(bodyW, bodyH, bodyD), bodyMat);
    body.position.y = bodyH / 2 + 0.05;
    body.castShadow = true;
    group.add(body);

    // Head
    const headW = type === 'chicken' ? 0.22 : 0.32;
    const head = new THREE.Mesh(new THREE.BoxGeometry(headW, headW, headW), headMat);
    head.position.set(0, bodyH + 0.05, bodyD / 2 + headW / 2 - 0.02);
    head.castShadow = true;
    group.add(head);

    // Legs
    const legMat = new THREE.MeshLambertMaterial({ color: 0x4a3a2a });
    const legW = 0.1, legH = 0.3;
    const legPositions = type === 'chicken'
      ? [[0, 0, 0]]
      : [[-bodyW/2 + 0.05, 0, bodyD/2 - 0.1], [bodyW/2 - 0.05, 0, bodyD/2 - 0.1], [-bodyW/2 + 0.05, 0, -bodyD/2 + 0.1], [bodyW/2 - 0.05, 0, -bodyD/2 + 0.1]];
    for (const [lx, _, lz] of legPositions) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legW), legMat);
      leg.position.set(lx, -legH / 2 + 0.05, lz);
      group.add(leg);
    }

    group.userData.mobType = type;
    return group;
  };

  MobSystem.prototype.update = function (dt) {
    for (const m of this.mobs) {
      if (!m.alive) continue;
      m.wanderTimer -= dt;
      if (m.wanderTimer <= 0) {
        m.wanderTimer = 2 + Math.random() * 4;
        if (Math.random() < 0.6) {
          // Pick a new wander direction
          m.yaw = Math.random() * Math.PI * 2;
          const speed = 0.8;
          m.vx = Math.sin(m.yaw) * speed;
          m.vz = Math.cos(m.yaw) * speed;
        } else {
          // Stand still
          m.vx = 0; m.vz = 0;
        }
      }
      // Apply velocity
      const newX = m.x + m.vx * dt;
      const newZ = m.z + m.vz * dt;
      // Check bounds
      if (newX > 0.5 && newX < this.world.size - 0.5) m.x = newX;
      else m.vx = 0;
      if (newZ > 0.5 && newZ < this.world.size - 0.5) m.z = newZ;
      else m.vz = 0;
      // Gravity — fall onto terrain
      m.vy -= 9.8 * dt;
      const newY = m.y + m.vy * dt;
      const blockBelow = this.world.get(Math.floor(m.x), Math.floor(newY - 0.5), Math.floor(m.z));
      if (blockBelow !== 0 && (!window.BLOCKS[blockBelow] || !window.BLOCKS[blockBelow].transparent || blockBelow !== 7)) {
        m.y = Math.floor(newY - 0.5) + 1.5;
        m.vy = 0;
      } else {
        m.y = newY;
      }
      // Update mesh
      if (m.mesh) {
        m.mesh.position.set(m.x, m.y, m.z);
        m.mesh.rotation.y = m.yaw;
      }
    }
  };

  MobSystem.prototype.add = function (m) {
    this.mobs.push(m);
  };

  MobSystem.prototype.remove = function (mob) {
    mob.alive = false;
    if (mob.mesh && mob.mesh.parent) mob.mesh.parent.remove(mob.mesh);
    this.mobs = this.mobs.filter(m => m !== mob);
  };

  window.MobSystem = MobSystem;
  window.Mob = Mob;
})();
