(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});
  var Config = NUCLEON.Config;

  var WORLD_LIST = [
    { id: 'open',    icon: '🌌', name: 'Espace Libre', desc: 'Arène ouverte classique, combats fluides' },
    { id: 'maze',    icon: '🧩', name: 'Labyrinthe',   desc: 'Couloirs quantiques, embuscades et blocage d\'assauts' },
    { id: 'pillars', icon: '🪨', name: 'Piliers',      desc: 'Monolithes magnétiques pour esquiver et contourner' },
    { id: 'nexus',   icon: '⚡', name: 'Réacteurs',    desc: '5 zones d\'énergie : recharge +85 % et soin +50 %' }
  ];

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function getWorldMeta(worldId) {
    for (var i = 0; i < WORLD_LIST.length; i++) {
      if (WORLD_LIST[i].id === worldId) return WORLD_LIST[i];
    }
    return WORLD_LIST[0];
  }

  function generate(worldId, seed) {
    var s = seed !== undefined ? seed : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    var rng = mulberry32(s);
    var meta = getWorldMeta(worldId);
    var world = {
      id: meta.id,
      name: meta.name,
      seed: s,
      walls: [],
      pillars: [],
      energyZones: []
    };

    if (meta.id === 'maze') {
      _buildMaze(world, rng);
    } else if (meta.id === 'pillars') {
      _buildPillars(world, rng);
    } else if (meta.id === 'nexus') {
      _buildNexus(world);
    }

    return world;
  }

  function _rectIntersectsCircle(rx, ry, rw, rh, cx, cy, cr) {
    var closestX = cx < rx ? rx : cx > rx + rw ? rx + rw : cx;
    var closestY = cy < ry ? ry : cy > ry + rh ? ry + rh : cy;
    var dx = cx - closestX;
    var dy = cy - closestY;
    return dx * dx + dy * dy < cr * cr;
  }

  function _rectInsideArena(rx, ry, rw, rh, maxR) {
    var maxRSq = maxR * maxR;
    var corners = [
      [rx, ry],
      [rx + rw, ry],
      [rx, ry + rh],
      [rx + rw, ry + rh]
    ];
    for (var i = 0; i < 4; i++) {
      var x = corners[i][0];
      var y = corners[i][1];
      if (x * x + y * y > maxRSq) return false;
    }
    return true;
  }

  function _buildMaze(world, rng) {
    var cols = 9;
    var rows = 9;
    var cellSize = 620;
    var wallThick = 56;
    var halfThick = wallThick * 0.5;
    var origin = -(cols * cellSize) * 0.5; // -2790

    // hWalls[r][c]: horizontal wall below cell (c, r), r in 0..rows-2, c in 0..cols-1
    // vWalls[r][c]: vertical wall right of cell (c, r), r in 0..rows-1, c in 0..cols-2
    var hWalls = [];
    var vWalls = [];
    var visited = [];
    var r, c;

    for (r = 0; r < rows; r++) {
      visited.push([]);
      for (c = 0; c < cols; c++) visited[r].push(false);
    }
    for (r = 0; r < rows - 1; r++) {
      hWalls.push([]);
      for (c = 0; c < cols; c++) hWalls[r].push(true);
    }
    for (r = 0; r < rows; r++) {
      vWalls.push([]);
      for (c = 0; c < cols - 1; c++) vWalls[r].push(true);
    }

    // Seeded randomized DFS from center (4, 4)
    var stack = [[4, 4]];
    visited[4][4] = true;
    var dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];

    while (stack.length > 0) {
      var top = stack[stack.length - 1];
      var cx = top[0];
      var cy = top[1];
      var neighbors = [];

      for (var d = 0; d < 4; d++) {
        var nx = cx + dirs[d][0];
        var ny = cy + dirs[d][1];
        if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited[ny][nx]) {
          neighbors.push([nx, ny, d]);
        }
      }

      if (neighbors.length === 0) {
        stack.pop();
        continue;
      }

      var pick = neighbors[Math.floor(rng() * neighbors.length)];
      var px = pick[0];
      var py = pick[1];
      var dirIdx = pick[2];

      if (dirIdx === 0) vWalls[cy][cx] = false;
      else if (dirIdx === 1) vWalls[cy][cx - 1] = false;
      else if (dirIdx === 2) hWalls[cy][cx] = false;
      else hWalls[cy - 1][cx] = false;

      visited[py][px] = true;
      stack.push([px, py]);
    }

    // Braid ~38% of remaining walls so corridors flow cleanly with flanking loops
    for (r = 0; r < rows - 1; r++) {
      for (c = 0; c < cols; c++) {
        if (hWalls[r][c] && rng() < 0.38) hWalls[r][c] = false;
      }
    }
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols - 1; c++) {
        if (vWalls[r][c] && rng() < 0.38) vWalls[r][c] = false;
      }
    }

    var arenaLimit = Config.ARENA_RADIUS - 140;

    // Emit horizontal wall segments
    for (r = 0; r < rows - 1; r++) {
      for (c = 0; c < cols; c++) {
        if (!hWalls[r][c]) continue;
        var wx = origin + c * cellSize - halfThick;
        var wy = origin + (r + 1) * cellSize - halfThick;
        var ww = cellSize + wallThick;
        var wh = wallThick;
        if (_rectIntersectsCircle(wx, wy, ww, wh, 0, 0, 430)) continue;
        if (!_rectInsideArena(wx, wy, ww, wh, arenaLimit)) continue;
        world.walls.push({ x: wx, y: wy, w: ww, h: wh });
      }
    }

    // Emit vertical wall segments
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols - 1; c++) {
        if (!vWalls[r][c]) continue;
        var vx = origin + (c + 1) * cellSize - halfThick;
        var vy = origin + r * cellSize - halfThick;
        var vw = wallThick;
        var vh = cellSize + wallThick;
        if (_rectIntersectsCircle(vx, vy, vw, vh, 0, 0, 430)) continue;
        if (!_rectInsideArena(vx, vy, vw, vh, arenaLimit)) continue;
        world.walls.push({ x: vx, y: vy, w: vw, h: vh });
      }
    }
  }

  function _buildPillars(world, rng) {
    var targetCount = 28;
    var maxDist = Config.ARENA_RADIUS - 260;

    for (var i = 0; i < targetCount; i++) {
      var pr = 78 + rng() * 67;
      for (var tries = 0; tries < 40; tries++) {
        var ang = rng() * Math.PI * 2;
        var dist = 420 + Math.sqrt(rng()) * (maxDist - 420);
        var px = Math.cos(ang) * dist;
        var py = Math.sin(ang) * dist;

        var ok = true;
        for (var j = 0; j < world.pillars.length; j++) {
          var other = world.pillars[j];
          var dx = px - other.x;
          var dy = py - other.y;
          var minSep = pr + other.r + 320;
          if (dx * dx + dy * dy < minSep * minSep) {
            ok = false;
            break;
          }
        }
        if (ok) {
          world.pillars.push({ x: Math.round(px), y: Math.round(py), r: Math.round(pr) });
          break;
        }
      }
    }
  }

  function _buildNexus(world) {
    // Central Super-Réacteur
    world.energyZones.push({
      x: 0,
      y: 0,
      r: 340,
      prodMult: 2.1,
      regenMult: 1.7,
      isSuper: true
    });

    // 4 outer Quantum Réacteurs
    var offsets = [
      [1550, 0],
      [-1550, 0],
      [0, 1550],
      [0, -1550]
    ];
    for (var i = 0; i < offsets.length; i++) {
      world.energyZones.push({
        x: offsets[i][0],
        y: offsets[i][1],
        r: 290,
        prodMult: 1.85,
        regenMult: 1.5,
        isSuper: false
      });
    }

    // 4 L-shaped protective baffles framing the central Super-Réacteur with 360px cardinal gates
    world.walls.push(
      { x: -410, y: -410, w: 230, h: 48 },
      { x: -410, y: -362, w: 48,  h: 180 },
      { x: 180,  y: -410, w: 230, h: 48 },
      { x: 362,  y: -362, w: 48,  h: 180 },
      { x: -410, y: 362,  w: 230, h: 48 },
      { x: -410, y: 182,  w: 48,  h: 180 },
      { x: 180,  y: 362,  w: 230, h: 48 },
      { x: 362,  y: 182,  w: 48,  h: 180 }
    );
  }

  function isBlocked(world, x, y, margin) {
    if (!world) return false;
    var m = margin || 0;
    var mSq = m * m;
    var walls = world.walls;
    var i;

    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      var cx = x < w.x ? w.x : x > w.x + w.w ? w.x + w.w : x;
      var cy = y < w.y ? w.y : y > w.y + w.h ? w.y + w.h : y;
      var dx = x - cx;
      var dy = y - cy;
      if (dx * dx + dy * dy < mSq) return true;
    }

    var pillars = world.pillars;
    for (i = 0; i < pillars.length; i++) {
      var p = pillars[i];
      var pdx = x - p.x;
      var pdy = y - p.y;
      var rad = p.r + m;
      if (pdx * pdx + pdy * pdy < rad * rad) return true;
    }

    return false;
  }

  function _pushOutOfRect(obj, w, radius, bounceDamp) {
    var cx = obj.x < w.x ? w.x : obj.x > w.x + w.w ? w.x + w.w : obj.x;
    var cy = obj.y < w.y ? w.y : obj.y > w.y + w.h ? w.y + w.h : obj.y;
    var dx = obj.x - cx;
    var dy = obj.y - cy;
    var dSq = dx * dx + dy * dy;

    if (dSq >= radius * radius) return false;

    var nx, ny, pen;
    if (dSq > 0.0001) {
      var d = Math.sqrt(dSq);
      nx = dx / d;
      ny = dy / d;
      pen = radius - d;
    } else {
      // Center strictly inside rect: push out along nearest edge
      var dLeft = obj.x - w.x;
      var dRight = w.x + w.w - obj.x;
      var dTop = obj.y - w.y;
      var dBottom = w.y + w.h - obj.y;
      var minEdge = dLeft;
      nx = -1;
      ny = 0;
      if (dRight < minEdge) { minEdge = dRight; nx = 1; ny = 0; }
      if (dTop < minEdge) { minEdge = dTop; nx = 0; ny = -1; }
      if (dBottom < minEdge) { minEdge = dBottom; nx = 0; ny = 1; }
      pen = radius + minEdge;
    }

    obj.x += nx * pen;
    obj.y += ny * pen;
    var vn = obj.vx * nx + obj.vy * ny;
    if (vn < 0) {
      var factor = 1 + (bounceDamp || 0);
      obj.vx -= vn * nx * factor;
      obj.vy -= vn * ny * factor;
    }
    return true;
  }

  function resolveCircle(world, obj, radius, bounceDamp) {
    if (!world) return false;
    var hit = false;
    var walls = world.walls;
    var i;

    for (i = 0; i < walls.length; i++) {
      if (_pushOutOfRect(obj, walls[i], radius, bounceDamp)) {
        hit = true;
      }
    }

    var pillars = world.pillars;
    for (i = 0; i < pillars.length; i++) {
      var p = pillars[i];
      var dx = obj.x - p.x;
      var dy = obj.y - p.y;
      var minDist = radius + p.r;
      var dSq = dx * dx + dy * dy;
      if (dSq < minDist * minDist) {
        var d = Math.sqrt(dSq) || 0.01;
        var nx = dx / d;
        var ny = dy / d;
        var pen = minDist - d;
        obj.x += nx * pen;
        obj.y += ny * pen;
        var vn = obj.vx * nx + obj.vy * ny;
        if (vn < 0) {
          var factor = 1 + (bounceDamp || 0);
          obj.vx -= vn * nx * factor;
          obj.vy -= vn * ny * factor;
        }
        hit = true;
      }
    }

    return hit;
  }

  function resolveElectron(world, pool, idx) {
    if (!world) return false;
    var walls = world.walls;
    var pillars = world.pillars;
    if (walls.length === 0 && pillars.length === 0) return false;

    var r = Config.ELECTRON_RADIUS;
    var rSq = r * r;
    var ex = pool.x[idx];
    var ey = pool.y[idx];
    var evx = pool.vx[idx];
    var evy = pool.vy[idx];
    var hit = false;
    var i;

    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      var cx = ex < w.x ? w.x : ex > w.x + w.w ? w.x + w.w : ex;
      var cy = ey < w.y ? w.y : ey > w.y + w.h ? w.y + w.h : ey;
      var dx = ex - cx;
      var dy = ey - cy;
      var dSq = dx * dx + dy * dy;
      if (dSq < rSq) {
        var nx, ny, pen;
        if (dSq > 0.0001) {
          var d = Math.sqrt(dSq);
          nx = dx / d;
          ny = dy / d;
          pen = r - d;
        } else {
          var dLeft = ex - w.x;
          var dRight = w.x + w.w - ex;
          var dTop = ey - w.y;
          var dBottom = w.y + w.h - ey;
          var minEdge = dLeft;
          nx = -1; ny = 0;
          if (dRight < minEdge) { minEdge = dRight; nx = 1; ny = 0; }
          if (dTop < minEdge) { minEdge = dTop; nx = 0; ny = -1; }
          if (dBottom < minEdge) { minEdge = dBottom; nx = 0; ny = 1; }
          pen = r + minEdge;
        }
        ex += nx * pen;
        ey += ny * pen;
        var vn = evx * nx + evy * ny;
        if (vn < 0) {
          evx -= vn * nx * 1.45;
          evy -= vn * ny * 1.45;
        }
        hit = true;
      }
    }

    for (i = 0; i < pillars.length; i++) {
      var p = pillars[i];
      var pdx = ex - p.x;
      var pdy = ey - p.y;
      var minD = r + p.r;
      var pdSq = pdx * pdx + pdy * pdy;
      if (pdSq < minD * minD) {
        var pd = Math.sqrt(pdSq) || 0.01;
        var pnx = pdx / pd;
        var pny = pdy / pd;
        var ppen = minD - pd;
        ex += pnx * ppen;
        ey += pny * ppen;
        var pvn = evx * pnx + evy * pny;
        if (pvn < 0) {
          evx -= pvn * pnx * 1.45;
          evy -= pvn * pny * 1.45;
        }
        hit = true;
      }
    }

    if (hit) {
      pool.x[idx] = ex;
      pool.y[idx] = ey;
      pool.vx[idx] = evx;
      pool.vy[idx] = evy;
    }
    return hit;
  }

  function getEnergyBoost(world, x, y) {
    var result = { prodMult: 1, regenMult: 1, inZone: false, isSuper: false };
    if (!world || world.energyZones.length === 0) return result;
    var zones = world.energyZones;
    for (var i = 0; i < zones.length; i++) {
      var z = zones[i];
      var dx = x - z.x;
      var dy = y - z.y;
      if (dx * dx + dy * dy <= z.r * z.r) {
        if (z.prodMult > result.prodMult) {
          result.prodMult = z.prodMult;
          result.regenMult = z.regenMult;
          result.inZone = true;
          result.isSuper = !!z.isSuper;
        }
      }
    }
    return result;
  }

  var STEER_ANGLES = [0.7, -0.7, 1.4, -1.4, 2.1, -2.1]; // ~±40°, ±80°, ±120°

  function steerAroundObstacles(world, x, y, dirX, dirY, radius) {
    if (!world || (world.walls.length === 0 && world.pillars.length === 0)) {
      return { x: dirX, y: dirY };
    }
    var look = radius + 82;
    var margin = radius + 8;

    if (
      !isBlocked(world, x + dirX * look, y + dirY * look, margin) &&
      !isBlocked(world, x + dirX * (look * 0.55), y + dirY * (look * 0.55), margin * 0.85)
    ) {
      return { x: dirX, y: dirY };
    }

    var baseAng = Math.atan2(dirY, dirX);
    for (var i = 0; i < STEER_ANGLES.length; i++) {
      var a = baseAng + STEER_ANGLES[i];
      var tx = Math.cos(a);
      var ty = Math.sin(a);
      if (
        !isBlocked(world, x + tx * look, y + ty * look, margin) &&
        !isBlocked(world, x + tx * (look * 0.5), y + ty * (look * 0.5), margin * 0.85)
      ) {
        return { x: tx, y: ty };
      }
    }

    return { x: dirX, y: dirY };
  }

  NUCLEON.Worlds = {
    WORLD_LIST: WORLD_LIST,
    getWorldMeta: getWorldMeta,
    generate: generate,
    isBlocked: isBlocked,
    resolveCircle: resolveCircle,
    resolveElectron: resolveElectron,
    getEnergyBoost: getEnergyBoost,
    steerAroundObstacles: steerAroundObstacles
  };
})();
