(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});
  var Config = NUCLEON.Config;
  var Entities = NUCLEON.Entities;
  var Worlds = NUCLEON.Worlds;

  function Zone(world) {
    this.world = world || null;
    this.reset(world);
  }

  Zone.prototype.setWorld = function (world) {
    this.world = world || null;
  };

  Zone.prototype.reset = function (world) {
    if (world !== undefined) {
      this.world = world;
    }
    this.x = 0;
    this.y = 0;
    this.radius = Config.ARENA_RADIUS;
    this.startX = 0;
    this.startY = 0;
    this.startRadius = Config.ARENA_RADIUS;
    this.targetX = 0;
    this.targetY = 0;
    this.targetRadius = Config.ARENA_RADIUS;
    this.phaseIndex = 0;
    this.state = 'HOLD'; // 'HOLD' | 'SHRINK' | 'FINAL'
    this.timer = 0;
    this.phaseDuration = 0;
    this._vaporizeAccum = 0;
    this._prepareNextTarget();
  };

  Zone.prototype._prepareNextTarget = function () {
    var phases = Config.ZONE_PHASES;
    if (this.phaseIndex >= phases.length) {
      this.state = 'FINAL';
      this.timer = 0;
      this.phaseDuration = 0;
      this.targetX = this.x;
      this.targetY = this.y;
      this.targetRadius = this.radius;
      return;
    }
    var p = phases[this.phaseIndex];
    this.targetRadius = p.targetRadius;
    var maxShift = Math.max(0, this.radius - p.targetRadius - 80);
    var tx = 0;
    var ty = 0;
    for (var tries = 0; tries < 30; tries++) {
      var angle = Math.random() * Math.PI * 2;
      var dist = Math.sqrt(Math.random()) * maxShift * 0.72;
      var cx = this.x + Math.cos(angle) * dist;
      var cy = this.y + Math.sin(angle) * dist;
      if (!Worlds || !Worlds.isBlocked(this.world, cx, cy, 95)) {
        tx = cx;
        ty = cy;
        break;
      }
    }
    this.targetX = tx;
    this.targetY = ty;

    this.state = 'HOLD';
    this.phaseDuration = p.holdDuration;
    this.timer = p.holdDuration;
  };

  Zone.prototype.isOutside = function (px, py) {
    var dx = px - this.x;
    var dy = py - this.y;
    return dx * dx + dy * dy > this.radius * this.radius;
  };

  Zone.prototype.getDistanceOutside = function (px, py) {
    var dx = px - this.x;
    var dy = py - this.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0, d - this.radius);
  };

  Zone.prototype.update = function (dt, aliveCount, nuclei, electronPool, fx, audio, absorbFn) {
    var phases = Config.ZONE_PHASES;

    if (this.state === 'HOLD') {
      // Dynamic pacing when survivor count drops low
      if (aliveCount <= 3 && this.timer > 3.0) {
        this.timer = 3.0;
      } else if (aliveCount <= 6 && this.timer > 4.0) {
        this.timer = 4.0;
      } else if (aliveCount <= 14 && this.timer > 5.0) {
        this.timer = 5.0;
      }

      this.timer -= dt;
      if (this.timer <= 0) {
        var p = phases[this.phaseIndex];
        this.state = 'SHRINK';
        this.startX = this.x;
        this.startY = this.y;
        this.startRadius = this.radius;
        this.phaseDuration = p.shrinkDuration;
        this.timer = p.shrinkDuration;
      }
    } else if (this.state === 'SHRINK') {
      this.timer -= dt;
      var t = 1 - Math.max(0, this.timer) / this.phaseDuration;
      // Smooth step
      var smooth = t * t * (3 - 2 * t);
      this.x = this.startX + (this.targetX - this.startX) * smooth;
      this.y = this.startY + (this.targetY - this.startY) * smooth;
      this.radius = this.startRadius + (this.targetRadius - this.startRadius) * smooth;

      if (this.timer <= 0) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.radius = this.targetRadius;
        this.phaseIndex++;
        this._prepareNextTarget();
      }
    }

    // Apply damage to nuclei outside safe zone
    var rSq = this.radius * this.radius;
    for (var i = 0; i < nuclei.length; i++) {
      var nuc = nuclei[i];
      if (!nuc.alive) continue;
      var dx = nuc.x - this.x;
      var dy = nuc.y - this.y;
      if (dx * dx + dy * dy > rSq) {
        var dps = nuc.maxHp * 0.065 + 4;
        nuc.hp -= dps * dt;
        nuc.underSiegeTimer = Math.max(nuc.underSiegeTimer, 0.25);
        if (nuc.isPlayer) {
          audio.playZoneWarning();
        }
        if (nuc.hp <= 0) {
          absorbFn(null, nuc);
        }
      }
    }

    // Periodically vaporize outer electrons outside the zone
    this._vaporizeAccum += dt;
    if (this._vaporizeAccum >= 0.14) {
      this._vaporizeAccum = 0;
      var high = electronPool.highWater;
      var active = electronPool.active;
      var ex = electronPool.x;
      var ey = electronPool.y;
      var oid = electronPool.ownerId;
      for (var e = 0; e < high; e++) {
        if (!active[e]) continue;
        var edx = ex[e] - this.x;
        var edy = ey[e] - this.y;
        if (edx * edx + edy * edy > rSq && Math.random() < 0.28) {
          var owner = nuclei[oid[e]];
          var sx = ex[e];
          var sy = ey[e];
          electronPool.despawn(e, nuclei);
          Entities.spawnSpark(
            fx,
            sx,
            sy,
            (Math.random() - 0.5) * 90,
            (Math.random() - 0.5) * 90,
            2.4,
            318,
            0.28,
            0.3
          );
          if (owner && owner.isPlayer && Math.random() < 0.2) {
            audio.playZoneWarning();
          }
        }
      }
    }
  };

  NUCLEON.Zone = Zone;
})();
