(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});
  var Config = NUCLEON.Config;
  var Entities = NUCLEON.Entities;
  var Worlds = NUCLEON.Worlds;

  function Zone(world) {
    this.world = world || null;
    this.endless = false;
    this.phases = Config.ZONE_PHASES;
    this.reset(world, false);
  }

  Zone.prototype.setWorld = function (world) {
    this.world = world || null;
  };

  Zone.prototype.reset = function (world, isEndless, zoneOpts) {
    if (world !== undefined) {
      this.world = world;
    }
    this.endless = !!isEndless;
    if (zoneOpts && typeof Config.buildZonePhases === 'function') {
      this.phases = Config.buildZonePhases(zoneOpts.startDelay, zoneOpts.shrinkSpeed);
    } else {
      this.phases = Config.buildZonePhases
        ? Config.buildZonePhases(Config.DEFAULT_ZONE_START_DELAY, Config.DEFAULT_ZONE_SHRINK_SPEED)
        : Config.ZONE_PHASES;
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
    this.state = this.endless ? 'ENDLESS' : 'HOLD'; // 'HOLD' | 'SHRINK' | 'FINAL' | 'ENDLESS'
    this.timer = 0;
    this.phaseDuration = 0;
    this._vaporizeAccum = 0;
    if (!this.endless) {
      this._prepareNextTarget();
    }
  };

  Zone.prototype._prepareNextTarget = function () {
    var phases = this.phases || Config.ZONE_PHASES;
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
    // When collapsing all the way to 0, collapse straight onto current zone center
    var maxShift = p.targetRadius <= 0 ? 0 : Math.max(0, this.radius - p.targetRadius - 80);
    var tx = this.x;
    var ty = this.y;
    if (maxShift > 1) {
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
    }
    this.targetX = tx;
    this.targetY = ty;

    if (p.holdDuration <= 0.05) {
      // Immediate shrink when player sets start delay to 0s!
      this.state = 'SHRINK';
      this.startX = this.x;
      this.startY = this.y;
      this.startRadius = this.radius;
      this.phaseDuration = p.shrinkDuration;
      this.timer = p.shrinkDuration;
    } else {
      this.state = 'HOLD';
      this.phaseDuration = p.holdDuration;
      this.timer = p.holdDuration;
    }
  };

  Zone.prototype.isOutside = function (px, py) {
    if (this.endless) return false;
    if (this.radius <= 0.5 || this.state === 'FINAL') return true;
    var dx = px - this.x;
    var dy = py - this.y;
    return dx * dx + dy * dy > this.radius * this.radius;
  };

  Zone.prototype.getDistanceOutside = function (px, py) {
    if (this.endless) return 0;
    if (this.radius <= 0.5 || this.state === 'FINAL') return 200;
    var dx = px - this.x;
    var dy = py - this.y;
    var d = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0, d - this.radius);
  };

  Zone.prototype.update = function (dt, aliveCount, nuclei, electronPool, fx, audio, absorbFn, matchActive) {
    if (this.endless) return;

    var phases = this.phases || Config.ZONE_PHASES;

    if (this.state === 'HOLD') {
      // Respect player's configured initial delay on phase 0; only speed up inter-stage pauses when tiny survivor count remains
      if (this.phaseIndex > 0) {
        if (aliveCount <= 3 && this.timer > 3.0) {
          this.timer = 3.0;
        } else if (aliveCount <= 6 && this.timer > 4.5) {
          this.timer = 4.5;
        }
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
      this.radius = Math.max(0, this.startRadius + (this.targetRadius - this.startRadius) * smooth);

      if (this.timer <= 0) {
        this.x = this.targetX;
        this.y = this.targetY;
        this.radius = Math.max(0, this.targetRadius);
        this.phaseIndex++;
        this._prepareNextTarget();
      }
    }

    // Apply gradual HP drain to nuclei outside safe zone (or EVERYONE once collapsed to 0!)
    var fullyCollapsed = this.radius <= 0.5 || this.state === 'FINAL';
    var rSq = this.radius * this.radius;
    // Steady gradual drain when the whole arena is red so the fight decides the winner cleanly
    var hpRatioDps = fullyCollapsed ? 0.052 : 0.065;
    var flatDps = fullyCollapsed ? 3.2 : 4.0;

    for (var i = 0; i < nuclei.length; i++) {
      if (matchActive && !matchActive()) break;
      var nuc = nuclei[i];
      if (!nuc.alive) continue;
      var isOut = fullyCollapsed;
      if (!isOut) {
        var dx = nuc.x - this.x;
        var dy = nuc.y - this.y;
        isOut = dx * dx + dy * dy > rSq;
      }
      if (isOut) {
        var dps = nuc.maxHp * hpRatioDps + flatDps;
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

    // Periodically vaporize outer electrons outside the zone (gentler once fully collapsed)
    this._vaporizeAccum += dt;
    if (this._vaporizeAccum >= 0.14) {
      this._vaporizeAccum = 0;
      var vapChance = fullyCollapsed ? 0.08 : 0.26;
      var high = electronPool.highWater;
      var active = electronPool.active;
      var ex = electronPool.x;
      var ey = electronPool.y;
      var oid = electronPool.ownerId;
      for (var e = 0; e < high; e++) {
        if (!active[e]) continue;
        var eOut = fullyCollapsed;
        if (!eOut) {
          var edx = ex[e] - this.x;
          var edy = ey[e] - this.y;
          eOut = edx * edx + edy * edy > rSq;
        }
        if (eOut && Math.random() < vapChance) {
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
