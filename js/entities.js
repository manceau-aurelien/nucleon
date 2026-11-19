(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});
  var Config = NUCLEON.Config;

  function recalcStats(nuc) {
    var prevMaxHp = nuc.maxHp || Config.getMaxHp(nuc.power);
    nuc.radius = Config.getRadius(nuc.power);
    nuc.maxHp = Config.getMaxHp(nuc.power);
    nuc.maxElectrons = Config.getMaxElectrons(nuc.power);
    nuc.prodRate = Config.getProdRate(nuc.power);
    nuc.orbitRadius = Config.getOrbitRadius(nuc.power);
    nuc.moveSpeed = Config.getMoveSpeed(nuc.power);

    if (prevMaxHp > 0 && nuc.hp !== undefined) {
      var ratio = nuc.hp / prevMaxHp;
      nuc.hp = Math.min(nuc.maxHp, ratio * nuc.maxHp);
    } else {
      nuc.hp = nuc.maxHp;
    }

    if (nuc.prodRate > nuc.peakProdRate) {
      nuc.peakProdRate = nuc.prodRate;
    }
  }

  function createNucleus(id, name, x, y, hue, isPlayer, personality, team) {
    var power = Config.START_POWER;
    var nuc = {
      id: id,
      name: name,
      isPlayer: !!isPlayer,
      isRemotePlayer: false,
      isFriend: false,
      team: team !== undefined ? team : -1,
      alive: true,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      targetAngle: Math.random() * Math.PI * 2,
      moveIntensity: 0,
      power: power,
      radius: 0,
      hp: 0,
      maxHp: 0,
      maxElectrons: 0,
      prodRate: 0,
      prodAccum: 0,
      electronCount: 0,
      shellCounts: [0, 0, 0],
      orbitRadius: 0,
      moveSpeed: 0,
      hue: hue,
      color: 'hsl(' + hue + ', 95%, 62%)',
      glowColor: 'hsla(' + hue + ', 100%, 60%, 0.45)',
      stance: 'ORBIT', // 'ORBIT' | 'ASSAULT' | 'SHIELD'
      aimX: x + 120,
      aimY: y,
      shieldThreatAngle: 0,
      shieldThreatActive: false,
      _threatX: new Float32Array(16),
      _threatY: new Float32Array(16),
      _threatDSq: new Float32Array(16),
      _threatCount: 0,
      _shieldSlot: 0,
      _labelCache: '',
      _labelWidth: 0,
      dashTimer: 0,
      dashCd: 0,
      dashDirX: 1,
      dashDirY: 0,
      lastDamagedTime: -100,
      underSiegeTimer: 0,
      lastAttackerId: -1,
      hitFlash: 0,
      kills: 0,
      peakElectrons: 0,
      peakProdRate: 0,
      damageDealt: 0,
      timeAlive: 0,
      personality: personality || 'OPPORTUNIST',
      aiState: {
        timer: Math.random() * 0.14,
        moveX: 0,
        moveY: 0,
        desiredStance: 'ORBIT',
        aimX: x,
        aimY: y,
        wantDash: false,
        wanderAngle: Math.random() * Math.PI * 2,
        targetId: -1
      }
    };
    recalcStats(nuc);
    nuc.hp = nuc.maxHp;
    nuc.peakProdRate = nuc.prodRate;
    return nuc;
  }

  /**
   * Structure-of-Arrays pool for up to MAX_ELECTRONS_GLOBAL electrons.
   * Zero GC allocations during simulation.
   */
  function ElectronPool(capacity) {
    this.capacity = capacity;
    this.active = new Uint8Array(capacity);
    this.shell = new Uint8Array(capacity);
    this.ownerId = new Int16Array(capacity);
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.prevX = new Float32Array(capacity);
    this.prevY = new Float32Array(capacity);
    this.orbitAngle = new Float32Array(capacity);
    this.orbitDir = new Float32Array(capacity);
    this.speedFactor = new Float32Array(capacity);
    this.phase = new Float32Array(capacity);

    this.freeList = new Int32Array(capacity);
    this.freeTop = 0;
    this.highWater = 0;
    this.count = 0;

    this.reset();
  }

  ElectronPool.prototype.reset = function () {
    this.active.fill(0);
    this.freeTop = this.capacity;
    for (var i = 0; i < this.capacity; i++) {
      this.freeList[i] = this.capacity - 1 - i;
    }
    this.highWater = 0;
    this.count = 0;
  };

  ElectronPool.prototype.spawn = function (owner, x, y, vx, vy, shell, orbitAngle, orbitDir) {
    if (this.freeTop <= 0) return -1;
    var idx = this.freeList[--this.freeTop];
    this.active[idx] = 1;
    this.ownerId[idx] = owner.id;
    this.shell[idx] = shell;
    this.x[idx] = x;
    this.y[idx] = y;
    this.prevX[idx] = x;
    this.prevY[idx] = y;
    this.vx[idx] = vx;
    this.vy[idx] = vy;
    this.orbitAngle[idx] = orbitAngle;
    this.orbitDir[idx] = orbitDir;
    this.speedFactor[idx] = 0.88 + Math.random() * 0.26;
    this.phase[idx] = Math.random() * Math.PI * 2;

    if (idx >= this.highWater) {
      this.highWater = idx + 1;
    }
    this.count++;
    owner.electronCount++;
    owner.shellCounts[shell]++;
    if (owner.electronCount > owner.peakElectrons) {
      owner.peakElectrons = owner.electronCount;
    }
    return idx;
  };

  ElectronPool.prototype.despawn = function (idx, nuclei) {
    if (!this.active[idx]) return;
    this.active[idx] = 0;
    var oid = this.ownerId[idx];
    var sh = this.shell[idx];
    var owner = nuclei[oid];
    if (owner) {
      if (owner.electronCount > 0) owner.electronCount--;
      if (owner.shellCounts[sh] > 0) owner.shellCounts[sh]--;
    }
    this.freeList[this.freeTop++] = idx;
    this.count--;
  };

  ElectronPool.prototype.setFromSnapshot = function (int16Arr, count) {
    var cap = Math.min(count, this.capacity);
    var prevHigh = this.highWater;
    for (var i = 0; i < cap; i++) {
      var off = i * 5;
      var nx = int16Arr[off + 1];
      var ny = int16Arr[off + 2];
      this.active[i] = 1;
      this.ownerId[i] = int16Arr[off];
      this.prevX[i] = nx;
      this.prevY[i] = ny;
      this.x[i] = nx;
      this.y[i] = ny;
      this.vx[i] = int16Arr[off + 3];
      this.vy[i] = int16Arr[off + 4];
    }
    for (var j = cap; j < prevHigh; j++) {
      this.active[j] = 0;
    }
    this.highWater = cap;
    this.count = cap;
  };

  function createFxPools() {
    var i;
    var sparks = [];
    for (i = 0; i < 700; i++) {
      sparks.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 0.3, size: 2, hue: 188, whiteMix: 0.5 });
    }
    var shockwaves = [];
    for (i = 0; i < 48; i++) {
      shockwaves.push({ active: false, x: 0, y: 0, radius: 10, maxRadius: 80, life: 0, maxLife: 0.4, hue: 188, lineWidth: 3, inward: false });
    }
    var drainBeams = [];
    for (i = 0; i < 120; i++) {
      drainBeams.push({ active: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, maxLife: 0.14, hue: 188 });
    }
    var floatingTexts = [];
    for (i = 0; i < 40; i++) {
      floatingTexts.push({ active: false, x: 0, y: 0, vy: -35, text: '', subtext: '', color: '#ffffff', life: 0, maxLife: 1.4, scale: 1 });
    }
    return {
      sparks: sparks,
      sparkCursor: 0,
      shockwaves: shockwaves,
      shockwaveCursor: 0,
      drainBeams: drainBeams,
      beamCursor: 0,
      floatingTexts: floatingTexts,
      textCursor: 0
    };
  }

  function spawnSpark(fx, x, y, vx, vy, size, hue, maxLife, whiteMix) {
    var list = fx.sparks;
    var s = list[fx.sparkCursor];
    fx.sparkCursor = (fx.sparkCursor + 1) % list.length;
    s.active = true;
    s.x = x;
    s.y = y;
    s.vx = vx;
    s.vy = vy;
    s.size = size;
    s.hue = hue;
    s.life = maxLife;
    s.maxLife = maxLife;
    s.whiteMix = whiteMix || 0.4;
  }

  function spawnShockwave(fx, x, y, startR, maxR, hue, maxLife, lineWidth, inward) {
    var list = fx.shockwaves;
    var w = list[fx.shockwaveCursor];
    fx.shockwaveCursor = (fx.shockwaveCursor + 1) % list.length;
    w.active = true;
    w.x = x;
    w.y = y;
    w.radius = startR;
    w.maxRadius = maxR;
    w.hue = hue;
    w.life = maxLife;
    w.maxLife = maxLife;
    w.lineWidth = lineWidth || 3;
    w.inward = !!inward;
  }

  function spawnDrainBeam(fx, x1, y1, x2, y2, hue) {
    var list = fx.drainBeams;
    var b = list[fx.beamCursor];
    fx.beamCursor = (fx.beamCursor + 1) % list.length;
    b.active = true;
    b.x1 = x1;
    b.y1 = y1;
    b.x2 = x2;
    b.y2 = y2;
    b.hue = hue;
    b.life = 0.14;
    b.maxLife = 0.14;
  }

  function spawnFloatingText(fx, x, y, text, subtext, color, scale, maxLife) {
    var list = fx.floatingTexts;
    var ft = list[fx.textCursor];
    fx.textCursor = (fx.textCursor + 1) % list.length;
    ft.active = true;
    ft.x = x;
    ft.y = y;
    ft.vy = -38;
    ft.text = text;
    ft.subtext = subtext || '';
    ft.color = color || '#ffffff';
    ft.scale = scale || 1;
    ft.life = maxLife || 1.65;
    ft.maxLife = ft.life;
  }

  function createAmbientPool(maxSlots) {
    var arr = [];
    for (var i = 0; i < maxSlots; i++) {
      arr.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        energy: 0.32,
        radius: 5,
        hue: 188,
        pulsePhase: Math.random() * Math.PI * 2,
        isCluster: false
      });
    }
    return arr;
  }

  function areAllies(a, b) {
    return !!(a && b && a.team !== -1 && a.team === b.team);
  }

  NUCLEON.Entities = {
    recalcStats: recalcStats,
    createNucleus: createNucleus,
    areAllies: areAllies,
    ElectronPool: ElectronPool,
    createFxPools: createFxPools,
    spawnSpark: spawnSpark,
    spawnShockwave: spawnShockwave,
    spawnDrainBeam: spawnDrainBeam,
    spawnFloatingText: spawnFloatingText,
    createAmbientPool: createAmbientPool
  };
})();
