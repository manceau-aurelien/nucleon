(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});
  var Config = NUCLEON.Config;
  var Entities = NUCLEON.Entities;
  var Worlds = NUCLEON.Worlds;

  function pickRandomPersonality() {
    var r = Math.random();
    if (r < 0.28) return 'HUNTER';
    if (r < 0.62) return 'OPPORTUNIST';
    if (r < 0.84) return 'CAUTIOUS';
    return 'NOMAD';
  }

  function updateAI(dt, nuclei, ambientPool, zone, difficultyKey, world) {
    var diff = Config.DIFFICULTIES[difficultyKey] || Config.DIFFICULTIES.standard;
    var nLen = nuclei.length;

    for (var i = 0; i < nLen; i++) {
      var me = nuclei[i];
      if (!me.alive || me.isPlayer || me.isRemotePlayer) continue;

      var st = me.aiState;
      st.timer -= dt;
      if (st.timer > 0) continue;

      st.timer = diff.aiIntervalMin + Math.random() * (diff.aiIntervalMax - diff.aiIntervalMin);
      st.wantDash = false;

      _decideOneAI(i, me, st, nuclei, nLen, ambientPool, zone, diff, world);

      if (world && (world.walls.length > 0 || world.pillars.length > 0)) {
        var steered = Worlds.steerAroundObstacles(world, me.x, me.y, st.moveX, st.moveY, me.radius);
        st.moveX = steered.x;
        st.moveY = steered.y;
      }
    }
  }

  function _decideOneAI(i, me, st, nuclei, nLen, ambientPool, zone, diff, world) {

      var myScore = me.electronCount * 2.2 + me.hp * 0.16;
      var perception = me.orbitRadius * 4.2 + 340;
      var perceptionSq = perception * perception;
      var isSelfDepleted = me.electronCount < Math.max(5, me.maxElectrons * 0.28);

      // 1. Zone Safety check
      var zdx = me.x - zone.x;
      var zdy = me.y - zone.y;
      var distFromZoneCenter = Math.sqrt(zdx * zdx + zdy * zdy);
      var distToEdge = zone.radius - distFromZoneCenter;

      var inZoneDanger = distToEdge < me.radius + 140;
      var outsideZone = distToEdge < 0;

      // Vector toward next safe zone center
      var toSafeX = zone.targetX - me.x;
      var toSafeY = zone.targetY - me.y;
      var toSafeLen = Math.sqrt(toSafeX * toSafeX + toSafeY * toSafeY) || 1;
      toSafeX /= toSafeLen;
      toSafeY /= toSafeLen;

      if (outsideZone) {
        st.moveX = toSafeX;
        st.moveY = toSafeY;
        st.desiredStance = 'ORBIT';
        if (me.dashCd <= 0 && me.electronCount >= Config.DASH_MIN_ELECTRONS && Math.random() < 0.65) {
          st.wantDash = true;
        }
        return;
      }

      // 2. Scan nearby nuclei for threats, besieged allies & prey
      var bestThreat = null;
      var bestThreatDistSq = Infinity;
      var nearestEnemy = null;
      var nearestEnemyDistSq = Infinity;
      var assistTargetId = -1;

      var bestPrey = null;
      var bestPreyRank = -Infinity;
      var bestPreyDistSq = Infinity;

      // First pass for ally distress signals within 520px
      for (var a = 0; a < nLen; a++) {
        if (a === i) continue;
        var ally = nuclei[a];
        if (!ally.alive || !Entities.areAllies(me, ally)) continue;
        var adx0 = ally.x - me.x;
        var ady0 = ally.y - me.y;
        if (adx0 * adx0 + ady0 * ady0 <= 520 * 520 && ally.underSiegeTimer > 0 && ally.lastAttackerId >= 0) {
          assistTargetId = ally.lastAttackerId;
          break;
        }
      }

      for (var j = 0; j < nLen; j++) {
        if (j === i) continue;
        var other = nuclei[j];
        if (!other.alive || Entities.areAllies(me, other)) continue;

        var dx = other.x - me.x;
        var dy = other.y - me.y;
        var dSq = dx * dx + dy * dy;
        if (dSq > perceptionSq) continue;

        if (dSq < nearestEnemyDistSq) {
          nearestEnemyDistSq = dSq;
          nearestEnemy = other;
        }

        var otherScore = other.electronCount * 2.2 + other.hp * 0.16;
        var d = Math.sqrt(dSq);

        // Threat check
        var threatThreshold = myScore * diff.fleeFactor;
        if (me.personality === 'CAUTIOUS') threatThreshold *= 0.92;
        else if (me.personality === 'HUNTER') threatThreshold *= 1.08;

        var threatRange = other.orbitRadius + me.orbitRadius + 240;
        if (otherScore > threatThreshold && d < threatRange) {
          if (dSq < bestThreatDistSq) {
            bestThreat = other;
            bestThreatDistSq = dSq;
          }
        }

        // Prey check (includes depleted giants!)
        var isWeakPrey = myScore > otherScore * (1.12 / diff.aggression);
        var isWoundedPrey = other.hp < other.maxHp * 0.55;
        var isUnshielded = other.electronCount < 5;
        var isDepletedGiant = other.electronCount < me.electronCount * 0.72 && me.electronCount >= 7;

        if (!isSelfDepleted && (isWeakPrey || isWoundedPrey || isUnshielded || isDepletedGiant)) {
          // Prefer closer, weaker, depleted, or wounded targets (+ assist ally bonus)
          var rank =
            (myScore - otherScore) * 1.5 +
            (isWoundedPrey ? 35 : 0) +
            (isUnshielded ? 25 : 0) +
            (isDepletedGiant ? 30 : 0) +
            (other.id === assistTargetId ? 42 : 0) -
            d * 0.14;
          if (me.personality === 'HUNTER') rank += 18;
          if (rank > bestPreyRank) {
            bestPreyRank = rank;
            bestPrey = other;
            bestPreyDistSq = dSq;
          }
        }
      }

      // Depleted self defense: retreat & shield while recharging when enemy is close
      if (!bestThreat && isSelfDepleted && nearestEnemy && nearestEnemyDistSq < (perception * 0.65) * (perception * 0.65)) {
        bestThreat = nearestEnemy;
        bestThreatDistSq = nearestEnemyDistSq;
      }

      // 3. Decide reaction: Flee > Hunt > Duel > Farm
      if (bestThreat) {
        var fdx = me.x - bestThreat.x;
        var fdy = me.y - bestThreat.y;
        var fLen = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
        fdx /= fLen;
        fdy /= fLen;

        // Blend with zone-inward vector so AI doesn't run out of bounds
        var safeBlend = inZoneDanger ? 0.65 : 0.25;
        var mx = fdx * (1 - safeBlend) + toSafeX * safeBlend;
        var my = fdy * (1 - safeBlend) + toSafeY * safeBlend;
        var mLen = Math.sqrt(mx * mx + my * my) || 1;
        st.moveX = mx / mLen;
        st.moveY = my / mLen;

        var threatDist = Math.sqrt(bestThreatDistSq);
        if (threatDist < bestThreat.orbitRadius + me.radius + 95 || me.hp < me.maxHp * 0.72) {
          st.desiredStance = 'SHIELD';
        } else {
          st.desiredStance = 'ORBIT';
        }

        if (
          me.hp < me.maxHp * 0.65 &&
          threatDist < bestThreat.orbitRadius + me.orbitRadius + 130 &&
          me.dashCd <= 0 &&
          me.electronCount >= Config.DASH_MIN_ELECTRONS + 2 &&
          Math.random() < diff.dashChance
        ) {
          st.wantDash = true;
        }
        return;
      }

      if (bestPrey && (me.personality !== 'NOMAD' || bestPrey.hp < bestPrey.maxHp * 0.6 || bestPreyDistSq < 420 * 420)) {
        var pdx = bestPrey.x - me.x;
        var pdy = bestPrey.y - me.y;
        var pDist = Math.sqrt(bestPreyDistSq) || 1;
        var dirX = pdx / pDist;
        var dirY = pdy / pDist;

        if (inZoneDanger) {
          st.moveX = dirX * 0.4 + toSafeX * 0.6;
          st.moveY = dirY * 0.4 + toSafeY * 0.6;
          var nl = Math.sqrt(st.moveX * st.moveX + st.moveY * st.moveY) || 1;
          st.moveX /= nl;
          st.moveY /= nl;
        } else {
          st.moveX = dirX;
          st.moveY = dirY;
        }

        var attackRange = me.orbitRadius * 2.5 + bestPrey.radius;
        if (pDist < attackRange && me.electronCount >= 4) {
          st.desiredStance = 'ASSAULT';
          st.aimX = bestPrey.x;
          st.aimY = bestPrey.y;
        } else if (me.electronCount < 4) {
          st.desiredStance = 'SHIELD';
        } else {
          st.desiredStance = 'ORBIT';
        }

        if (
          (me.personality === 'HUNTER' || me.personality === 'OPPORTUNIST') &&
          bestPrey.hp < bestPrey.maxHp * 0.55 &&
          pDist > me.orbitRadius * 1.1 &&
          pDist < me.orbitRadius * 2.9 &&
          me.electronCount >= 10 &&
          me.dashCd <= 0 &&
          Math.random() < diff.dashChance * 0.75
        ) {
          st.wantDash = true;
        }
        return;
      }

      // If recovering low electrons or HP, hold Shield briefly
      if (me.hp < me.maxHp * 0.5 && me.electronCount < me.maxElectrons * 0.35) {
        st.desiredStance = 'SHIELD';
      } else {
        st.desiredStance = 'ORBIT';
      }

      // 4. Farm nearest ambient quark/cluster inside safe zone (or contest nearest Energy Reactor if depleted/nexus)
      if (inZoneDanger) {
        st.moveX = toSafeX;
        st.moveY = toSafeY;
        return;
      }

      if (world && world.energyZones.length > 0 && (isSelfDepleted || me.hp < me.maxHp * 0.75 || Math.random() < 0.55)) {
        var bestEz = null;
        var bestEzScore = -Infinity;
        for (var ezIdx = 0; ezIdx < world.energyZones.length; ezIdx++) {
          var ez = world.energyZones[ezIdx];
          var ezZdx = ez.x - zone.x;
          var ezZdy = ez.y - zone.y;
          if (ezZdx * ezZdx + ezZdy * ezZdy > (zone.radius - 60) * (zone.radius - 60)) continue;
          var ed = Math.hypot(ez.x - me.x, ez.y - me.y);
          var ezScore = (ez.isSuper ? 260 : 140) - ed * 0.16;
          if (ezScore > bestEzScore) {
            bestEzScore = ezScore;
            bestEz = ez;
          }
        }
        if (bestEz) {
          var ex = bestEz.x - me.x;
          var ey = bestEz.y - me.y;
          var el = Math.sqrt(ex * ex + ey * ey) || 1;
          if (el > bestEz.r * 0.55) {
            st.moveX = ex / el;
            st.moveY = ey / el;
            return;
          }
        }
      }

      var bestParticle = null;
      var bestPartScore = -Infinity;
      for (var p = 0; p < ambientPool.length; p++) {
        var part = ambientPool[p];
        if (!part.active) continue;
        var adx = part.x - me.x;
        var ady = part.y - me.y;
        var adSq = adx * adx + ady * ady;
        if (adSq > 520 * 520) continue;
        // Prefer staying near zone
        var pZoneDistSq = (part.x - zone.x) * (part.x - zone.x) + (part.y - zone.y) * (part.y - zone.y);
        if (pZoneDistSq > (zone.radius - 90) * (zone.radius - 90)) continue;

        var pScore = (part.isCluster ? 190 : 50) - Math.sqrt(adSq) * 0.35;
        if (pScore > bestPartScore) {
          bestPartScore = pScore;
          bestParticle = part;
        }
      }

      if (bestParticle) {
        var bdx = bestParticle.x - me.x;
        var bdy = bestParticle.y - me.y;
        var bLen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
        st.moveX = bdx / bLen;
        st.moveY = bdy / bLen;
      } else {
        // Gentle wandering biased toward next safe zone center
        st.wanderAngle += (Math.random() - 0.5) * 1.1;
        var wx = Math.cos(st.wanderAngle);
        var wy = Math.sin(st.wanderAngle);
        var centerBias = zone.radius < Config.ARENA_RADIUS * 0.7 ? 0.42 : 0.18;
        var fx = wx * (1 - centerBias) + toSafeX * centerBias;
        var fy = wy * (1 - centerBias) + toSafeY * centerBias;
        var fl = Math.sqrt(fx * fx + fy * fy) || 1;
        st.moveX = fx / fl;
        st.moveY = fy / fl;
      }
  }

  NUCLEON.AI = {
    pickRandomPersonality: pickRandomPersonality,
    update: updateAI
  };
})();
