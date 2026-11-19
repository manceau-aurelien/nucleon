(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});
  var Config = NUCLEON.Config;
  var Entities = NUCLEON.Entities;

  var HUE_BUCKETS = 24;

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });

    this.camX = 0;
    this.camY = 0;
    this.zoom = 1;
    this.shakeTime = 0;
    this.shakeMag = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.electronSprites = [];
    this.quarkSprites = [];
    this.clusterSprite = null;
    this.stars = [];

    this._initSprites();
    this._initStars();
    this.resize();
  }

  Renderer.prototype._initSprites = function () {
    for (var b = 0; b < HUE_BUCKETS; b++) {
      var hue = Math.round((b / HUE_BUCKETS) * 360);

      // Electron 32x32 neon sprite
      var eCanvas = document.createElement('canvas');
      eCanvas.width = 32;
      eCanvas.height = 32;
      var eCtx = eCanvas.getContext('2d');
      var eg = eCtx.createRadialGradient(16, 16, 1, 16, 16, 15);
      eg.addColorStop(0, 'rgba(255, 255, 255, 1)');
      eg.addColorStop(0.24, 'hsla(' + hue + ', 100%, 72%, 0.95)');
      eg.addColorStop(0.55, 'hsla(' + hue + ', 100%, 55%, 0.35)');
      eg.addColorStop(1, 'hsla(' + hue + ', 100%, 50%, 0)');
      eCtx.fillStyle = eg;
      eCtx.fillRect(0, 0, 32, 32);
      this.electronSprites.push(eCanvas);

      // Ambient quark 16x16 sprite
      var qCanvas = document.createElement('canvas');
      qCanvas.width = 16;
      qCanvas.height = 16;
      var qCtx = qCanvas.getContext('2d');
      var qg = qCtx.createRadialGradient(8, 8, 0.5, 8, 8, 7.5);
      qg.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      qg.addColorStop(0.35, 'hsla(' + hue + ', 100%, 68%, 0.85)');
      qg.addColorStop(1, 'hsla(' + hue + ', 100%, 50%, 0)');
      qCtx.fillStyle = qg;
      qCtx.fillRect(0, 0, 16, 16);
      this.quarkSprites.push(qCanvas);
    }

    // Golden high-energy cluster sprite (40x40)
    var cCanvas = document.createElement('canvas');
    cCanvas.width = 40;
    cCanvas.height = 40;
    var cCtx = cCanvas.getContext('2d');
    var cg = cCtx.createRadialGradient(20, 20, 1, 20, 20, 19);
    cg.addColorStop(0, 'rgba(255, 255, 240, 1)');
    cg.addColorStop(0.25, 'rgba(255, 224, 90, 0.95)');
    cg.addColorStop(0.55, 'rgba(255, 155, 20, 0.42)');
    cg.addColorStop(1, 'rgba(255, 120, 0, 0)');
    cCtx.fillStyle = cg;
    cCtx.fillRect(0, 0, 40, 40);
    this.clusterSprite = cCanvas;
  };

  Renderer.prototype._initStars = function () {
    this.stars = [];
    for (var i = 0; i < 240; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random(),
        size: 0.8 + Math.random() * 1.7,
        alpha: 0.15 + Math.random() * 0.55,
        parallax: i < 140 ? 0.08 : 0.18,
        hue: i % 5 === 0 ? 190 : i % 7 === 0 ? 280 : 220
      });
    }
  };

  Renderer.prototype.resize = function () {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
    this.canvas.style.width = this.width + 'px';
    this.canvas.style.height = this.height + 'px';
  };

  Renderer.prototype.addShake = function (mag, dur) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, dur);
  };

  Renderer.prototype._hueBucket = function (hue) {
    var h = ((hue % 360) + 360) % 360;
    return Math.floor((h / 360) * HUE_BUCKETS) % HUE_BUCKETS;
  };

  Renderer.prototype.screenToWorld = function (sx, sy) {
    return {
      x: (sx - this.width * 0.5) / this.zoom + this.camX,
      y: (sy - this.height * 0.5) / this.zoom + this.camY
    };
  };

  Renderer.prototype.updateCamera = function (state, dt) {
    var target = state.player;
    if (!target || !target.alive) {
      target = state.spectateTarget;
      if (!target || !target.alive) {
        // Pick current leader
        var best = null;
        for (var i = 0; i < state.nuclei.length; i++) {
          var n = state.nuclei[i];
          if (n.alive && (!best || n.power > best.power)) {
            best = n;
          }
        }
        target = best;
        state.spectateTarget = best;
      }
    }

    var targetX = target ? target.x : 0;
    var targetY = target ? target.y : 0;
    var targetZoom = 1;
    if (target) {
      var span = target.orbitRadius * 2.1;
      targetZoom = Math.max(0.46, Math.min(1.02, 260 / Math.max(190, span)));
    }

    var lerpPos = 1 - Math.exp(-8.5 * dt);
    var lerpZoom = 1 - Math.exp(-4.5 * dt);
    this.camX += (targetX - this.camX) * lerpPos;
    this.camY += (targetY - this.camY) * lerpPos;
    this.zoom += (targetZoom - this.zoom) * lerpZoom;

    if (this.shakeTime > 0) {
      this.shakeTime = Math.max(0, this.shakeTime - dt);
      if (this.shakeTime <= 0) this.shakeMag = 0;
    }
  };

  Renderer.prototype.render = function (state, dt, input) {
    this.updateCamera(state, dt);

    var ctx = this.ctx;
    var w = this.width;
    var h = this.height;
    var dpr = this.dpr;
    var time = state.elapsedTime;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 1. Deep space background
    var bgGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
    bgGrad.addColorStop(0, '#091128');
    bgGrad.addColorStop(0.55, '#050816');
    bgGrad.addColorStop(1, '#02040a');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Parallax Starfield
    for (var s = 0; s < this.stars.length; s++) {
      var star = this.stars[s];
      var sx = ((star.x * w - this.camX * star.parallax) % w + w) % w;
      var sy = ((star.y * h - this.camY * star.parallax) % h + h) % h;
      var twinkle = 0.72 + 0.28 * Math.sin(time * 2.2 + s);
      ctx.fillStyle = 'hsla(' + star.hue + ', 80%, 82%, ' + (star.alpha * twinkle).toFixed(3) + ')';
      ctx.fillRect(sx, sy, star.size, star.size);
    }

    // Camera shake offset
    var shakeX = 0;
    var shakeY = 0;
    if (this.shakeTime > 0) {
      shakeX = (Math.random() - 0.5) * this.shakeMag * 2;
      shakeY = (Math.random() - 0.5) * this.shakeMag * 2;
    }

    var zoom = this.zoom;
    var camX = this.camX + shakeX;
    var camY = this.camY + shakeY;

    var halfW = (w * 0.5) / zoom + 140;
    var halfH = (h * 0.5) / zoom + 140;
    var viewMinX = camX - halfW;
    var viewMaxX = camX + halfW;
    var viewMinY = camY - halfH;
    var viewMaxY = camY + halfH;

    // 3. World space transform
    ctx.save();
    ctx.translate(w * 0.5, h * 0.5);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    // Subtle coordinate grid (culled to camera bounds)
    this._drawGrid(ctx, viewMinX, viewMaxX, viewMinY, viewMaxY);

    // Arena outer boundary
    ctx.beginPath();
    ctx.arc(0, 0, Config.ARENA_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(80, 150, 255, 0.22)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Quantum Shrinking Zone overlay
    this._drawZone(ctx, state.zone, time);

    // World obstacles & energy reactors
    if (state.world) {
      this._drawWorld(ctx, state.world, viewMinX, viewMaxX, viewMinY, viewMaxY, time);
    }

    // Ambient quarks & high-energy clusters
    this._drawAmbient(ctx, state.ambient, viewMinX, viewMaxX, viewMinY, viewMaxY, time);

    // Player tactical stance ring & cone
    if (state.player && state.player.alive) {
      this._drawPlayerTacticalRings(ctx, state.player, time);
    }

    // Electron-to-electron shield tethers for player in SHIELD mode
    if (state.player && state.player.alive && state.player.stance === 'SHIELD') {
      this._drawShieldTethers(ctx, state.player, state.electrons);
    }

    // Electrons
    this._drawElectrons(ctx, state.electrons, state.nuclei, viewMinX, viewMaxX, viewMinY, viewMaxY);

    // Drain beams
    this._drawDrainBeams(ctx, state.fx.drainBeams);

    // Sparks
    this._drawSparks(ctx, state.fx.sparks, viewMinX, viewMaxX, viewMinY, viewMaxY);

    // Shockwaves
    this._drawShockwaves(ctx, state.fx.shockwaves);

    // Nuclei
    this._drawNuclei(ctx, state, viewMinX, viewMaxX, viewMinY, viewMaxY, time);

    // Floating combat texts
    this._drawFloatingTexts(ctx, state.fx.floatingTexts);

    ctx.restore();

    // 4. Screen-space overlays
    if (state.player && state.player.alive) {
      this._drawSurvivorPointers(ctx, state, camX, camY, zoom, w, h);
      this._drawDangerVignette(ctx, state.player, state.zone, w, h, time);
      if (state.mode === 'PLAYING') {
        this._drawReticle(ctx, input, state.player, time);
      }
    }
  };

  Renderer.prototype._drawGrid = function (ctx, minX, maxX, minY, maxY) {
    var step = 160;
    var startX = Math.floor(minX / step) * step;
    var startY = Math.floor(minY / step) * step;
    var limit = Config.ARENA_RADIUS + 200;
    if (startX < -limit) startX = -limit;
    if (startY < -limit) startY = -limit;
    var endX = Math.min(limit, maxX);
    var endY = Math.min(limit, maxY);

    ctx.strokeStyle = 'rgba(56, 132, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var x = startX; x <= endX; x += step) {
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
    }
    for (var y = startY; y <= endY; y += step) {
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
    }
    ctx.stroke();
  };

  Renderer.prototype._drawZone = function (ctx, zone, time) {
    var outer = Config.ARENA_RADIUS + 1800;

    // Dim crimson tint outside current safe circle using even-odd fill
    ctx.save();
    ctx.beginPath();
    ctx.rect(-outer, -outer, outer * 2, outer * 2);
    ctx.arc(zone.x, zone.y, Math.max(10, zone.radius), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(255, 22, 85, 0.14)';
    ctx.fill('evenodd');
    ctx.restore();

    // Next safe zone dashed preview
    if (zone.state !== 'FINAL' && Math.abs(zone.targetRadius - zone.radius) > 4) {
      ctx.save();
      ctx.setLineDash([14, 14]);
      ctx.lineDashOffset = -time * 28;
      ctx.beginPath();
      ctx.arc(zone.targetX, zone.targetY, zone.targetRadius, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    // Pulsing magenta energy border
    var pulse = 0.65 + 0.35 * Math.sin(time * 4.5);
    ctx.beginPath();
    ctx.arc(zone.x, zone.y, Math.max(10, zone.radius), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 45, 135, ' + (0.65 * pulse).toFixed(3) + ')';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(zone.x, zone.y, Math.max(10, zone.radius), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 180, 220, 0.7)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  };

  Renderer.prototype._drawWorld = function (ctx, world, minX, maxX, minY, maxY, time) {
    var i;

    // 1. Quantum Energy Reactor zones (nexus world)
    var zones = world.energyZones;
    for (i = 0; i < zones.length; i++) {
      var ez = zones[i];
      if (ez.x + ez.r < minX || ez.x - ez.r > maxX || ez.y + ez.r < minY || ez.y - ez.r > maxY) continue;

      var grad = ctx.createRadialGradient(ez.x, ez.y, 16, ez.x, ez.y, ez.r);
      if (ez.isSuper) {
        grad.addColorStop(0, 'rgba(255, 210, 60, 0.28)');
        grad.addColorStop(0.6, 'rgba(255, 165, 20, 0.11)');
        grad.addColorStop(1, 'rgba(255, 140, 0, 0)');
      } else {
        grad.addColorStop(0, 'rgba(0, 240, 255, 0.24)');
        grad.addColorStop(0.6, 'rgba(0, 175, 255, 0.09)');
        grad.addColorStop(1, 'rgba(0, 140, 255, 0)');
      }
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ez.x, ez.y, ez.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -time * 24 * (ez.isSuper ? 1.4 : 1);
      ctx.strokeStyle = ez.isSuper ? 'rgba(255, 215, 75, 0.58)' : 'rgba(0, 240, 255, 0.45)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(ez.x, ez.y, ez.r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([6, 14]);
      ctx.lineDashOffset = time * 18;
      ctx.strokeStyle = ez.isSuper ? 'rgba(255, 240, 160, 0.35)' : 'rgba(130, 248, 255, 0.28)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ez.x, ez.y, ez.r * 0.65, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.textAlign = 'center';
      ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.fillStyle = ez.isSuper ? 'rgba(255, 224, 110, 0.78)' : 'rgba(120, 244, 255, 0.72)';
      ctx.fillText(ez.isSuper ? '+110% ⚡ SUPER-RÉACTEUR' : '+85% ⚡ RÉACTEUR', ez.x, ez.y + 4);
    }

    // 2. Labyrinth & Baffle Walls (crystal obsidian blocks with glowing electric-blue edges)
    var walls = world.walls;
    for (i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (w.x + w.w < minX || w.x > maxX || w.y + w.h < minY || w.y > maxY) continue;

      ctx.fillStyle = 'rgba(10, 18, 42, 0.94)';
      ctx.strokeStyle = 'rgba(56, 168, 255, 0.85)';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(w.x, w.y, w.w, w.h, 8);
      } else {
        ctx.rect(w.x, w.y, w.w, w.h);
      }
      ctx.fill();
      ctx.stroke();

      // Inner neon tech accent line
      ctx.strokeStyle = 'rgba(125, 225, 255, 0.22)';
      ctx.lineWidth = 1.2;
      if (w.w > w.h) {
        ctx.beginPath();
        ctx.moveTo(w.x + 12, w.y + w.h * 0.5);
        ctx.lineTo(w.x + w.w - 12, w.y + w.h * 0.5);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(w.x + w.w * 0.5, w.y + 12);
        ctx.lineTo(w.x + w.w * 0.5, w.y + w.h - 12);
        ctx.stroke();
      }
    }

    // 3. Monolith Pillars
    var pillars = world.pillars;
    for (i = 0; i < pillars.length; i++) {
      var p = pillars[i];
      if (p.x + p.r < minX || p.x - p.r > maxX || p.y + p.r < minY || p.y - p.r > maxY) continue;

      var pGrad = ctx.createRadialGradient(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.12, p.x, p.y, p.r);
      pGrad.addColorStop(0, 'rgba(34, 52, 102, 0.95)');
      pGrad.addColorStop(0.75, 'rgba(14, 22, 48, 0.96)');
      pGrad.addColorStop(1, 'rgba(8, 13, 30, 0.98)');
      ctx.fillStyle = pGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(92, 182, 255, 0.85)';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.strokeStyle = 'rgba(165, 120, 255, 0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.62, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(120, 225, 255, 0.28)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  Renderer.prototype._drawAmbient = function (ctx, ambient, minX, maxX, minY, maxY, time) {
    for (var i = 0; i < ambient.length; i++) {
      var p = ambient[i];
      if (!p.active) continue;
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) continue;

      var pulse = 0.88 + 0.14 * Math.sin(time * 4 + p.pulsePhase);
      if (p.isCluster) {
        var sz = 36 * pulse;
        ctx.drawImage(this.clusterSprite, p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
      } else {
        var bucket = this._hueBucket(p.hue);
        var qsz = 16 * pulse;
        ctx.drawImage(this.quarkSprites[bucket], p.x - qsz * 0.5, p.y - qsz * 0.5, qsz, qsz);
      }
    }
  };

  Renderer.prototype._drawPlayerTacticalRings = function (ctx, player, time) {
    var reach = player.orbitRadius;
    ctx.save();
    if (player.stance === 'ASSAULT') {
      var dx = player.aimX - player.x;
      var dy = player.aimY - player.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var angle = Math.atan2(dy, dx);
      var projDist = Math.min(len, reach * Config.ASSAULT_REACH_MULT);
      var tx = player.x + (dx / len) * projDist;
      var ty = player.y + (dy / len) * projDist;

      // Subtle cone from nucleus toward assault point
      var spread = 0.34;
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.arc(player.x, player.y, projDist, angle - spread, angle + spread);
      ctx.closePath();
      var grad = ctx.createRadialGradient(player.x, player.y, player.radius, player.x, player.y, projDist);
      grad.addColorStop(0, 'rgba(255, 165, 40, 0.04)');
      grad.addColorStop(1, 'rgba(255, 90, 60, 0.16)');
      ctx.fillStyle = grad;
      ctx.fill();

      // Target assault zone ring
      ctx.beginPath();
      ctx.arc(tx, ty, 24 + Math.sin(time * 8) * 3, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 170, 55, 0.55)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (player.stance === 'SHIELD') {
      var shieldR = reach * Config.SHIELD_ORBIT_MULT;
      ctx.beginPath();
      ctx.arc(player.x, player.y, shieldR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(80, 245, 255, 0.36)';
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 225, 255, 0.05)';
      ctx.fill();

      // Reinforced directional deflector arc + inner core armor aura
      if (player.shieldThreatActive) {
        ctx.beginPath();
        ctx.arc(player.x, player.y, reach * 0.62, player.shieldThreatAngle - 1.15, player.shieldThreatAngle + 1.15);
        ctx.strokeStyle = 'rgba(185, 252, 255, 0.85)';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      ctx.beginPath();
      ctx.arc(player.x, player.y, player.radius + 9, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120, 245, 255, 0.45)';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.setLineDash([6, 10]);
      ctx.beginPath();
      ctx.arc(player.x, player.y, reach, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(180, 230, 255, 0.14)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    ctx.restore();
  };

  Renderer.prototype._drawShieldTethers = function (ctx, player, pool) {
    var pts = [];
    var high = pool.highWater;
    var active = pool.active;
    var oid = pool.ownerId;
    var px = pool.x;
    var py = pool.y;
    for (var i = 0; i < high; i++) {
      if (active[i] && oid[i] === player.id) {
        pts.push({ x: px[i], y: py[i], a: Math.atan2(py[i] - player.y, px[i] - player.x) });
      }
    }
    if (pts.length < 3) return;
    pts.sort(function (a, b) { return a.a - b.a; });
    ctx.save();
    ctx.strokeStyle = 'hsla(' + player.hue + ', 100%, 75%, 0.25)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var k = 1; k < pts.length; k++) {
      ctx.lineTo(pts[k].x, pts[k].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  };

  Renderer.prototype._drawElectrons = function (ctx, pool, nuclei, minX, maxX, minY, maxY) {
    var high = pool.highWater;
    var active = pool.active;
    var x = pool.x;
    var y = pool.y;
    var prevX = pool.prevX;
    var prevY = pool.prevY;
    var oid = pool.ownerId;

    // Motion streaks first
    ctx.lineWidth = 2;
    for (var i = 0; i < high; i++) {
      if (!active[i]) continue;
      var ex = x[i];
      var ey = y[i];
      if (ex < minX || ex > maxX || ey < minY || ey > maxY) continue;
      var owner = nuclei[oid[i]];
      var hue = owner ? owner.hue : 188;

      var dx = ex - prevX[i];
      var dy = ey - prevY[i];
      if (dx * dx + dy * dy > 1.5) {
        ctx.strokeStyle = 'hsla(' + hue + ', 100%, 72%, 0.45)';
        ctx.beginPath();
        ctx.moveTo(ex - dx * 1.4, ey - dy * 1.4);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
    }

    // Glowing sprites
    for (var j = 0; j < high; j++) {
      if (!active[j]) continue;
      var sx = x[j];
      var sy = y[j];
      if (sx < minX || sx > maxX || sy < minY || sy > maxY) continue;
      var ow = nuclei[oid[j]];
      var bucket = this._hueBucket(ow ? ow.hue : 188);
      ctx.drawImage(this.electronSprites[bucket], sx - 11, sy - 11, 22, 22);
    }
  };

  Renderer.prototype._drawDrainBeams = function (ctx, beams) {
    ctx.lineWidth = 2.2;
    for (var i = 0; i < beams.length; i++) {
      var b = beams[i];
      if (!b.active) continue;
      var alpha = Math.max(0, b.life / b.maxLife);
      ctx.strokeStyle = 'hsla(' + b.hue + ', 100%, 78%, ' + (alpha * 0.9).toFixed(3) + ')';
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      var mx = (b.x1 + b.x2) * 0.5 + (Math.random() - 0.5) * 14;
      var my = (b.y1 + b.y2) * 0.5 + (Math.random() - 0.5) * 14;
      ctx.lineTo(mx, my);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
    }
  };

  Renderer.prototype._drawSparks = function (ctx, sparks, minX, maxX, minY, maxY) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < sparks.length; i++) {
      var s = sparks[i];
      if (!s.active) continue;
      if (s.x < minX || s.x > maxX || s.y < minY || s.y > maxY) continue;
      var alpha = Math.max(0, s.life / s.maxLife);
      var light = Math.round(62 + s.whiteMix * 36);
      ctx.fillStyle = 'hsla(' + s.hue + ', 100%, ' + light + '%, ' + alpha.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.4 + alpha * 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Renderer.prototype._drawShockwaves = function (ctx, waves) {
    for (var i = 0; i < waves.length; i++) {
      var w = waves[i];
      if (!w.active) continue;
      var p = 1 - w.life / w.maxLife;
      var r = w.inward ? w.maxRadius * (1 - p) : w.radius + (w.maxRadius - w.radius) * p;
      var alpha = Math.max(0, 1 - p);
      ctx.strokeStyle = 'hsla(' + w.hue + ', 100%, 72%, ' + (alpha * 0.85).toFixed(3) + ')';
      ctx.lineWidth = w.lineWidth * (0.4 + alpha * 0.8);
      ctx.beginPath();
      ctx.arc(w.x, w.y, Math.max(2, r), 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  Renderer.prototype._drawNuclei = function (ctx, state, minX, maxX, minY, maxY, time) {
    var nuclei = state.nuclei;
    var leaderId = state.leaderId;
    var player = state.player;
    var playerScore = player && player.alive ? player.electronCount * 2.2 + player.hp * 0.16 : 0;

    for (var i = 0; i < nuclei.length; i++) {
      var n = nuclei[i];
      if (!n.alive) continue;
      if (n.x + n.radius + 60 < minX || n.x - n.radius - 60 > maxX || n.y + n.radius + 60 < minY || n.y - n.radius - 60 > maxY) {
        continue;
      }

      var jx = 0;
      var jy = 0;
      if (n.underSiegeTimer > 0) {
        jx = (Math.random() - 0.5) * 3.5;
        jy = (Math.random() - 0.5) * 3.5;
      }
      var nx = n.x + jx;
      var ny = n.y + jy;
      var r = n.radius;

      // 1. Outer plasma aura
      var auraR = r * 2.15;
      var aura = ctx.createRadialGradient(nx, ny, r * 0.4, nx, ny, auraR);
      aura.addColorStop(0, 'hsla(' + n.hue + ', 100%, 62%, 0.38)');
      aura.addColorStop(0.55, 'hsla(' + n.hue + ', 100%, 52%, 0.12)');
      aura.addColorStop(1, 'hsla(' + n.hue + ', 100%, 50%, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(nx, ny, auraR, 0, Math.PI * 2);
      ctx.fill();

      // 2. Rotating inner atomic rings
      ctx.save();
      ctx.translate(nx, ny);
      ctx.rotate(time * 1.4 + n.id);
      ctx.strokeStyle = 'hsla(' + n.hue + ', 100%, 75%, 0.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.28, r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.rotate(Math.PI * 0.52);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.28, r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // 3. Core plasma sphere
      var coreGrad = ctx.createRadialGradient(nx - r * 0.25, ny - r * 0.25, r * 0.1, nx, ny, r);
      if (n.hitFlash > 0.1) {
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.55, 'hsla(' + n.hue + ', 100%, 82%, 1)');
        coreGrad.addColorStop(1, 'hsla(' + n.hue + ', 100%, 55%, 1)');
      } else {
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.28, 'hsla(' + n.hue + ', 100%, 72%, 1)');
        coreGrad.addColorStop(0.85, 'hsla(' + n.hue + ', 95%, 45%, 1)');
        coreGrad.addColorStop(1, 'hsla(' + n.hue + ', 100%, 30%, 1)');
      }
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(nx, ny, r, 0, Math.PI * 2);
      ctx.fill();

      // Crisp inner rim (+ distinct white highlight ring for player among teammates)
      ctx.strokeStyle = n.isPlayer ? '#ffffff' : 'hsla(' + n.hue + ', 100%, 85%, 0.85)';
      ctx.lineWidth = n.isPlayer ? 2.6 : 1.6;
      ctx.stroke();

      // Armored +30% resistance ring & smart deflector arc when in SHIELD stance
      if (n.stance === 'SHIELD') {
        ctx.save();
        ctx.beginPath();
        ctx.arc(nx, ny, r + 4.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(150, 248, 255, 0.72)';
        ctx.lineWidth = 2.2;
        ctx.stroke();

        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(nx, ny, r + 9, time * 1.6, time * 1.6 + Math.PI * 2);
        ctx.strokeStyle = 'rgba(120, 240, 255, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);

        if (n.shieldThreatActive) {
          ctx.beginPath();
          ctx.arc(nx, ny, r + 13.5, n.shieldThreatAngle - 1.15, n.shieldThreatAngle + 1.15);
          ctx.strokeStyle = 'rgba(205, 255, 255, 0.88)';
          ctx.lineWidth = 3.2;
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.lineCap = 'butt';
        }
        ctx.restore();
      }

      // 4. Circular integrity gauge (if damaged or player)
      var hpRatio = Math.max(0, Math.min(1, n.hp / n.maxHp));
      if (hpRatio < 0.995 || n.isPlayer) {
        var gaugeR = r + 6.5;
        ctx.beginPath();
        ctx.arc(nx, ny, gaugeR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 3;
        ctx.stroke();

        var gaugeColor = hpRatio > 0.5 ? '#2df7b5' : hpRatio > 0.25 ? '#ffbe3d' : '#ff3d6e';
        ctx.beginPath();
        ctx.arc(nx, ny, gaugeR, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * hpRatio);
        ctx.strokeStyle = gaugeColor;
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      // Friend dashed indicator halo
      if (n.isFriend) {
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(nx, ny, r + 11.5, -time * 1.4, -time * 1.4 + Math.PI * 2);
        ctx.strokeStyle = Entities.areAllies(player, n) ? '#7affd4' : '#ffe066';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // 5. Nameplate, crown, threat dot & electron badge
      ctx.textAlign = 'center';
      ctx.font = (n.isPlayer || n.isFriend ? '700 13px ' : '600 12px ') + 'Inter, system-ui, sans-serif';
      var labelY = ny - r - 15;

      var labelText = (n.isFriend ? '★ ' : '') + (n.id === leaderId ? '👑 ' : '') + n.name;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillText(labelText, nx + 1, labelY + 1);
      ctx.fillStyle = n.isPlayer ? '#ffffff' : n.isFriend ? '#ffe57f' : 'rgba(232, 242, 255, 0.92)';
      ctx.fillText(labelText, nx, labelY);

      // Threat comparison dot / ally diamond next to AI name
      if (!n.isPlayer && player && player.alive) {
        var textW = ctx.measureText(labelText).width;
        var badgeX = nx - textW * 0.5 - 9;
        var badgeY = labelY - 4;
        if (Entities.areAllies(player, n)) {
          ctx.fillStyle = n.color;
          ctx.beginPath();
          ctx.moveTo(badgeX, badgeY - 4.2);
          ctx.lineTo(badgeX + 4.2, badgeY);
          ctx.lineTo(badgeX, badgeY + 4.2);
          ctx.lineTo(badgeX - 4.2, badgeY);
          ctx.closePath();
          ctx.fill();
        } else {
          var otherScore = n.electronCount * 2.2 + n.hp * 0.16;
          var dotColor = '#ffbe3d';
          if (otherScore > playerScore * 1.25) dotColor = '#ff4466';
          else if (playerScore > otherScore * 1.15) dotColor = '#2df7b5';
          ctx.fillStyle = dotColor;
          ctx.beginPath();
          ctx.arc(badgeX, badgeY, 3.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Electron count inside/below core
      ctx.font = '700 11px Inter, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.fillText('⚡' + n.electronCount, nx, ny + 4);
    }
  };

  Renderer.prototype._drawFloatingTexts = function (ctx, texts) {
    ctx.textAlign = 'center';
    for (var i = 0; i < texts.length; i++) {
      var ft = texts[i];
      if (!ft.active) continue;
      var alpha = Math.min(1, (ft.life / ft.maxLife) * 1.6);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '800 ' + Math.round(15 * ft.scale) + 'px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#040814';
      ctx.fillText(ft.text, ft.x + 1.5, ft.y + 1.5);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);

      if (ft.subtext) {
        ctx.font = '600 12px Inter, system-ui, sans-serif';
        ctx.fillStyle = '#d6f7ff';
        ctx.fillText(ft.subtext, ft.x, ft.y + 16);
      }
      ctx.restore();
    }
  };

  Renderer.prototype._drawSurvivorPointers = function (ctx, state, camX, camY, zoom, w, h) {
    var nuclei = state.nuclei;
    var player = state.player;
    var enemyCount = 0;
    for (var ec = 0; ec < nuclei.length; ec++) {
      if (nuclei[ec].alive && !nuclei[ec].isPlayer && !Entities.areAllies(player, nuclei[ec])) {
        enemyCount++;
      }
    }
    var showAll = enemyCount <= 8;
    var pad = 42;
    var halfW = w * 0.5 - pad;
    var halfH = h * 0.5 - pad;

    for (var i = 0; i < nuclei.length; i++) {
      var n = nuclei[i];
      if (!n.alive || n.isPlayer || Entities.areAllies(player, n)) continue;
      if (!showAll && n.id !== state.leaderId) continue;

      var sx = (n.x - camX) * zoom + w * 0.5;
      var sy = (n.y - camY) * zoom + h * 0.5;
      if (sx >= 20 && sx <= w - 20 && sy >= 20 && sy <= h - 20) continue;

      var dx = n.x - player.x;
      var dy = n.y - player.y;
      var angle = Math.atan2(dy, dx);
      var cos = Math.cos(angle);
      var sin = Math.sin(angle);

      var tx = cos !== 0 ? halfW / Math.abs(cos) : Infinity;
      var ty = sin !== 0 ? halfH / Math.abs(sin) : Infinity;
      var t = Math.min(tx, ty);
      var px = w * 0.5 + cos * t;
      var py = h * 0.5 + sin * t;

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);
      ctx.fillStyle = n.id === state.leaderId ? '#ffd54f' : 'hsla(' + n.hue + ', 100%, 65%, 0.85)';
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-7, -6);
      ctx.lineTo(-4, 0);
      ctx.lineTo(-7, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  };

  Renderer.prototype._drawDangerVignette = function (ctx, player, zone, w, h, time) {
    var out = zone.isOutside(player.x, player.y);
    var lowHp = player.hp < player.maxHp * 0.35;
    if (!out && !lowHp) return;

    var pulse = 0.55 + 0.45 * Math.sin(time * 6);
    var intensity = out ? 0.36 * pulse : 0.24 * pulse;
    var g = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.32, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(255, 20, 70, 0)');
    g.addColorStop(1, 'rgba(255, 20, 70, ' + intensity.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };

  Renderer.prototype._drawReticle = function (ctx, input, player, time) {
    var mx = input.mouseX;
    var my = input.mouseY;
    ctx.save();
    ctx.translate(mx, my);
    if (player.stance === 'ASSAULT') {
      ctx.strokeStyle = 'rgba(255, 165, 50, 0.9)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 12 + Math.sin(time * 12) * 2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-17, 0); ctx.lineTo(-7, 0);
      ctx.moveTo(7, 0); ctx.lineTo(17, 0);
      ctx.moveTo(0, -17); ctx.lineTo(0, -7);
      ctx.moveTo(0, 7); ctx.lineTo(0, 17);
      ctx.stroke();
    } else if (player.stance === 'SHIELD') {
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(200, 235, 255, 0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(200, 235, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  Renderer.prototype.renderMinimap = function (minimapCtx, state) {
    var size = 170;
    var half = size * 0.5;
    var mapR = half - 6;
    var scale = mapR / Config.ARENA_RADIUS;
    var zone = state.zone;

    minimapCtx.clearRect(0, 0, size, size);

    // Circular radar background
    minimapCtx.save();
    minimapCtx.beginPath();
    minimapCtx.arc(half, half, mapR, 0, Math.PI * 2);
    minimapCtx.fillStyle = 'rgba(6, 12, 28, 0.82)';
    minimapCtx.fill();
    minimapCtx.clip();

    // Subtle radar crosshairs
    minimapCtx.strokeStyle = 'rgba(80, 150, 255, 0.14)';
    minimapCtx.lineWidth = 1;
    minimapCtx.beginPath();
    minimapCtx.moveTo(half, 0); minimapCtx.lineTo(half, size);
    minimapCtx.moveTo(0, half); minimapCtx.lineTo(size, half);
    minimapCtx.stroke();

    // World obstacles & energy zones on minimap
    var world = state.world;
    if (world) {
      var wi;
      for (wi = 0; wi < world.energyZones.length; wi++) {
        var ez = world.energyZones[wi];
        minimapCtx.fillStyle = ez.isSuper ? 'rgba(255, 210, 60, 0.18)' : 'rgba(0, 240, 255, 0.14)';
        minimapCtx.beginPath();
        minimapCtx.arc(half + ez.x * scale, half + ez.y * scale, Math.max(3, ez.r * scale), 0, Math.PI * 2);
        minimapCtx.fill();
      }
      minimapCtx.fillStyle = 'rgba(92, 168, 255, 0.48)';
      for (wi = 0; wi < world.walls.length; wi++) {
        var w = world.walls[wi];
        minimapCtx.fillRect(half + w.x * scale, half + w.y * scale, Math.max(1.4, w.w * scale), Math.max(1.4, w.h * scale));
      }
      for (wi = 0; wi < world.pillars.length; wi++) {
        var p = world.pillars[wi];
        minimapCtx.beginPath();
        minimapCtx.arc(half + p.x * scale, half + p.y * scale, Math.max(1.6, p.r * scale), 0, Math.PI * 2);
        minimapCtx.fill();
      }
    }

    // Current safe zone
    var zx = half + zone.x * scale;
    var zy = half + zone.y * scale;
    var zr = Math.max(2, zone.radius * scale);
    minimapCtx.strokeStyle = 'rgba(255, 45, 135, 0.85)';
    minimapCtx.lineWidth = 1.6;
    minimapCtx.beginPath();
    minimapCtx.arc(zx, zy, zr, 0, Math.PI * 2);
    minimapCtx.stroke();

    // Target next safe zone
    if (zone.state !== 'FINAL') {
      var tzx = half + zone.targetX * scale;
      var tzy = half + zone.targetY * scale;
      var tzr = Math.max(2, zone.targetRadius * scale);
      minimapCtx.setLineDash([3, 3]);
      minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
      minimapCtx.lineWidth = 1;
      minimapCtx.beginPath();
      minimapCtx.arc(tzx, tzy, tzr, 0, Math.PI * 2);
      minimapCtx.stroke();
      minimapCtx.setLineDash([]);
    }

    // Alive nuclei
    var nuclei = state.nuclei;
    for (var i = 0; i < nuclei.length; i++) {
      var n = nuclei[i];
      if (!n.alive || n.isPlayer) continue;
      var mx = half + n.x * scale;
      var my = half + n.y * scale;
      var dotR = n.isFriend ? 4.4 : Math.min(4.2, 1.8 + Math.sqrt(n.power) * 0.25);
      minimapCtx.fillStyle = n.id === state.leaderId ? '#ffd54f' : 'hsla(' + n.hue + ', 95%, 65%, 0.82)';
      minimapCtx.beginPath();
      minimapCtx.arc(mx, my, dotR, 0, Math.PI * 2);
      minimapCtx.fill();
      if (n.isFriend) {
        minimapCtx.strokeStyle = Entities.areAllies(state.player, n) ? '#7affd4' : '#ffe066';
        minimapCtx.lineWidth = 1.5;
        minimapCtx.beginPath();
        minimapCtx.arc(mx, my, dotR + 2.4, 0, Math.PI * 2);
        minimapCtx.stroke();
      }
    }

    // Player pulsing bright white-cyan marker (distinct from same-colored teammates)
    var player = state.player;
    if (player && player.alive) {
      var pmx = half + player.x * scale;
      var pmy = half + player.y * scale;
      var pulse = 4.8 + Math.sin(state.elapsedTime * 7) * 1.8;
      minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      minimapCtx.lineWidth = 1.6;
      minimapCtx.beginPath();
      minimapCtx.arc(pmx, pmy, pulse, 0, Math.PI * 2);
      minimapCtx.stroke();

      minimapCtx.fillStyle = '#ffffff';
      minimapCtx.beginPath();
      minimapCtx.arc(pmx, pmy, 3.6, 0, Math.PI * 2);
      minimapCtx.fill();
    }

    minimapCtx.restore();

    // Outer radar rim
    minimapCtx.beginPath();
    minimapCtx.arc(half, half, mapR, 0, Math.PI * 2);
    minimapCtx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    minimapCtx.lineWidth = 1.5;
    minimapCtx.stroke();
  };

  NUCLEON.Renderer = Renderer;
})();
