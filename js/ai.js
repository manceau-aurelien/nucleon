(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});
  var Config = NUCLEON.Config;
  var Entities = NUCLEON.Entities;
  var Worlds = NUCLEON.Worlds;

  // Scratch array mapping squad teamId -> living anchor nucleus index (-1 if none)
  var _squadAnchors = new Int16Array(128);

  function pickRandomPersonality() {
    var r = Math.random();
    if (r < 0.28) return 'HUNTER';
    if (r < 0.62) return 'OPPORTUNIST';
    if (r < 0.84) return 'CAUTIOUS';
    return 'NOMAD';
  }

  function _computeSquadAnchors(nuclei, nLen) {
    _squadAnchors.fill(-1);
    for (var i = 0; i < nLen; i++) {
      var n = nuclei[i];
      if (!n.alive || n.team < 0 || n.team >= 128) continue;
      var curIdx = _squadAnchors[n.team];
      if (curIdx === -1) {
        _squadAnchors[n.team] = i;
      } else {
        var cur = nuclei[curIdx];
        // Human players always anchor their squad; otherwise strongest member leads
        var nHuman = n.isPlayer || n.isRemotePlayer;
        var curHuman = cur.isPlayer || cur.isRemotePlayer;
        if (nHuman && !curHuman) {
          _squadAnchors[n.team] = i;
        } else if (nHuman === curHuman && n.power > cur.power) {
          _squadAnchors[n.team] = i;
        }
      }
    }
  }

  function updateAI(dt, nuclei, ambientPool, zone, difficultyKey, world, gameMode) {
    var diff = Config.DIFFICULTIES[difficultyKey] || Config.DIFFICULTIES.standard;
    var modeMeta = Config.getModeMeta(gameMode);
    var isSquadMode = !!(modeMeta && modeMeta.isSquad);
    var nLen = nuclei.length;

    if (isSquadMode) {
      _computeSquadAnchors(nuclei, nLen);
    }

    for (var i = 0; i < nLen; i++) {
      var me = nuclei[i];
      if (!me.alive || me.isPlayer || me.isRemotePlayer) continue;

      var st = me.aiState;
      st.timer -= dt;
      if (st.timer > 0) continue;

      st.timer = diff.aiIntervalMin + Math.random() * (diff.aiIntervalMax - diff.aiIntervalMin);
      st.wantDash = false;
      st.targetId = -1;

      var anchor = null;
      if (isSquadMode && me.team >= 0 && me.team < 128) {
        var aIdx = _squadAnchors[me.team];
        if (aIdx !== -1 && aIdx !== i) {
          anchor = nuclei[aIdx];
        }
      }

      _decideOneAI(i, me, st, nuclei, nLen, ambientPool, zone, diff, world, anchor);

      if (world && (world.walls.length > 0 || world.pillars.length > 0)) {
        var steered = Worlds.steerAroundObstacles(world, me.x, me.y, st.moveX, st.moveY, me.radius);
        st.moveX = steered.x;
        st.moveY = steered.y;
      }
    }
  }

  function _decideOneAI(i, me, st, nuclei, nLen, ambientPool, zone, diff, world, anchor) {
    var myScore = me.electronCount * 2.2 + me.hp * 0.16;
    var perception = me.orbitRadius * 4.2 + 360;
    var perceptionSq = perception * perception;
    var softRef = me.naturalCap || 12;
    var isSelfDepleted = me.electronCount < Math.max(4, Math.min(28, softRef * 0.30));

    // 1. Zone Safety check (once the circle shrinks below 85px or collapses completely to red,
    // stop forcing AIs to pile onto the tiny center like bumper cars — let them fight freely!)
    var zdx = me.x - zone.x;
    var zdy = me.y - zone.y;
    var distFromZoneCenter = Math.sqrt(zdx * zdx + zdy * zdy);
    var distToEdge = zone.radius - distFromZoneCenter;

    var hasSafePocket = !zone.endless && zone.state !== 'FINAL' && zone.radius > 85;
    var inZoneDanger = hasSafePocket && distToEdge < me.radius + 140;
    var outsideZone = hasSafePocket && distToEdge < 0;

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

    // Squad formation slot around anchor (for Trios 20x3 & Duos 25x2)
    var formX = me.x;
    var formY = me.y;
    var distToAnchor = 0;
    var toFormX = 0;
    var toFormY = 0;
    var anchorAssaultAim = false;
    var anchorTargetId = -1;

    if (anchor && anchor.alive) {
      var ancAng =
        Math.abs(anchor.vx) + Math.abs(anchor.vy) > 12
          ? Math.atan2(anchor.vy, anchor.vx)
          : anchor.targetAngle;
      var slotSign = me.wingSlot === 2 ? -1 : 1;
      var wingAngle = ancAng + slotSign * 2.15;
      var wingDist = anchor.orbitRadius + me.orbitRadius + 58;
      formX = anchor.x + Math.cos(wingAngle) * wingDist;
      formY = anchor.y + Math.sin(wingAngle) * wingDist;

      var dfx = formX - me.x;
      var dfy = formY - me.y;
      var dfLen = Math.sqrt(dfx * dfx + dfy * dfy) || 1;
      toFormX = dfx / dfLen;
      toFormY = dfy / dfLen;

      distToAnchor = Math.hypot(anchor.x - me.x, anchor.y - me.y);

      if ((anchor.isPlayer || anchor.isRemotePlayer) && anchor.stance === 'ASSAULT') {
        anchorAssaultAim = true;
      } else if (anchor.aiState && anchor.aiState.targetId >= 0) {
        anchorTargetId = anchor.aiState.targetId;
      }
    }

    // 2. Scan nearby allies (distress + combined squad power) & enemies
    var bestThreat = null;
    var bestThreatDistSq = Infinity;
    var nearestEnemy = null;
    var nearestEnemyDistSq = Infinity;
    var assistTargetId = -1;
    var nearbyAllyBonusScore = 0;

    for (var a = 0; a < nLen; a++) {
      if (a === i) continue;
      var ally = nuclei[a];
      if (!ally.alive || !Entities.areAllies(me, ally)) continue;
      var adx0 = ally.x - me.x;
      var ady0 = ally.y - me.y;
      var adSq0 = adx0 * adx0 + ady0 * ady0;
      if (adSq0 <= 560 * 560) {
        if (ally.underSiegeTimer > 0 && ally.lastAttackerId >= 0 && assistTargetId === -1) {
          assistTargetId = ally.lastAttackerId;
        }
        if (adSq0 <= 440 * 440) {
          nearbyAllyBonusScore += (ally.electronCount * 2.2 + ally.hp * 0.16) * 0.62;
        }
      }
    }

    var effectiveSquadScore = myScore + nearbyAllyBonusScore;
    var bestPrey = null;
    var bestPreyRank = -Infinity;
    var bestPreyDistSq = Infinity;

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

      // Threat check (accounts for nearby squadmates backing us up)
      var threatThreshold = effectiveSquadScore * diff.fleeFactor;
      if (me.personality === 'CAUTIOUS') threatThreshold *= 0.92;
      else if (me.personality === 'HUNTER') threatThreshold *= 1.08;

      var threatRange = other.orbitRadius + me.orbitRadius + 240;
      if (otherScore > threatThreshold && d < threatRange) {
        if (dSq < bestThreatDistSq) {
          bestThreat = other;
          bestThreatDistSq = dSq;
        }
      }

      // Squad focus-fire check: is our squad leader assaulting this enemy?
      var isAnchorFocus = false;
      if (anchorAssaultAim && anchor) {
        var aimDx = other.x - anchor.aimX;
        var aimDy = other.y - anchor.aimY;
        if (aimDx * aimDx + aimDy * aimDy < 340 * 340) {
          isAnchorFocus = true;
        }
      } else if (other.id === anchorTargetId) {
        isAnchorFocus = true;
      }

      // Do not chase prey too far away from squad anchor
      if (anchor && distToAnchor > 520 && !isAnchorFocus && other.id !== assistTargetId) {
        continue;
      }

      // Prey check (includes depleted giants & squad focus targets)
      var isWeakPrey = effectiveSquadScore > otherScore * (1.12 / diff.aggression);
      var isWoundedPrey = other.hp < other.maxHp * 0.55;
      var isUnshielded = other.electronCount < 4;
      var isDepletedGiant = other.electronCount < me.electronCount * 0.72 && me.electronCount >= 6;

      if (
        !isSelfDepleted &&
        (isWeakPrey || isWoundedPrey || isUnshielded || isDepletedGiant || isAnchorFocus || other.id === assistTargetId)
      ) {
        var rank =
          (effectiveSquadScore - otherScore) * 1.4 +
          (isWoundedPrey ? 35 : 0) +
          (isUnshielded ? 25 : 0) +
          (isDepletedGiant ? 30 : 0) +
          (other.id === assistTargetId ? 55 : 0) +
          (isAnchorFocus ? 85 : 0) -
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

    // 3. Decide reaction: Flee > Regroup if way behind > Hunt > Farm/Escort
    if (bestThreat) {
      var fdx = me.x - bestThreat.x;
      var fdy = me.y - bestThreat.y;
      var fLen = Math.sqrt(fdx * fdx + fdy * fdy) || 1;
      fdx /= fLen;
      fdy /= fLen;

      // Retreat toward squad anchor if available, and stay inside safe zone
      var safeBlend = inZoneDanger ? 0.65 : 0.22;
      var mx = fdx * (1 - safeBlend) + toSafeX * safeBlend;
      var my = fdy * (1 - safeBlend) + toSafeY * safeBlend;
      if (anchor && distToAnchor > 220 && !inZoneDanger) {
        mx = mx * 0.65 + toFormX * 0.35;
        my = my * 0.65 + toFormY * 0.35;
      }
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

    // Tight squad regrouping if separated from leader (> 460px) and not actively focusing leader's target
    if (anchor && distToAnchor > 460 && (!bestPrey || bestPreyRank < 45)) {
      st.moveX = inZoneDanger ? toFormX * 0.45 + toSafeX * 0.55 : toFormX;
      st.moveY = inZoneDanger ? toFormY * 0.45 + toSafeY * 0.55 : toFormY;
      var rgLen = Math.sqrt(st.moveX * st.moveX + st.moveY * st.moveY) || 1;
      st.moveX /= rgLen;
      st.moveY /= rgLen;
      st.desiredStance = me.hp < me.maxHp * 0.55 ? 'SHIELD' : 'ORBIT';
      if (distToAnchor > 780 && me.dashCd <= 0 && me.electronCount >= 10 && Math.random() < 0.35) {
        st.wantDash = true;
      }
      return;
    }

    if (bestPrey && (anchor || me.personality !== 'NOMAD' || bestPrey.hp < bestPrey.maxHp * 0.6 || bestPreyDistSq < 420 * 420)) {
      st.targetId = bestPrey.id;
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
        (me.personality === 'HUNTER' || me.personality === 'OPPORTUNIST' || anchor) &&
        bestPrey.hp < bestPrey.maxHp * 0.55 &&
        pDist > me.orbitRadius * 1.1 &&
        pDist < me.orbitRadius * 2.9 &&
        me.electronCount >= 9 &&
        me.dashCd <= 0 &&
        Math.random() < diff.dashChance * 0.75
      ) {
        st.wantDash = true;
      }
      return;
    }

    // If recovering low electrons or HP, hold Shield briefly
    if (me.hp < me.maxHp * 0.5 && me.electronCount < Math.max(5, softRef * 0.35)) {
      st.desiredStance = 'SHIELD';
    } else {
      st.desiredStance = 'ORBIT';
    }

    // 4. Farm nearest ambient quark/cluster (or escort squad anchor smoothly)
    if (inZoneDanger) {
      st.moveX = toSafeX;
      st.moveY = toSafeY;
      return;
    }

    // Squad wingmen follow anchor closely while scooping nearby quarks along the route
    if (anchor) {
      var bestSquadPart = null;
      var bestSqScore = -Infinity;
      for (var sp = 0; sp < ambientPool.length; sp++) {
        var sqPart = ambientPool[sp];
        if (!sqPart.active) continue;
        var sqDx = sqPart.x - me.x;
        var sqDy = sqPart.y - me.y;
        var sqDSq = sqDx * sqDx + sqDy * sqDy;
        if (sqDSq > 290 * 290) continue;
        // Must remain near anchor so the squad never splits up
        var ancDx = sqPart.x - anchor.x;
        var ancDy = sqPart.y - anchor.y;
        if (ancDx * ancDx + ancDy * ancDy > 410 * 410) continue;
        if (!zone.endless) {
          var sqZSq = (sqPart.x - zone.x) * (sqPart.x - zone.x) + (sqPart.y - zone.y) * (sqPart.y - zone.y);
          if (sqZSq > (zone.radius - 80) * (zone.radius - 80)) continue;
        }
        var sqS = (sqPart.isCluster ? 210 : 60) - Math.sqrt(sqDSq) * 0.4;
        if (sqS > bestSqScore) {
          bestSqScore = sqS;
          bestSquadPart = sqPart;
        }
      }

      if (bestSquadPart) {
        var qdx = bestSquadPart.x - me.x;
        var qdy = bestSquadPart.y - me.y;
        var qLen = Math.sqrt(qdx * qdx + qdy * qdy) || 1;
        var blendF = distToAnchor > 280 ? 0.42 : 0.15;
        var bx = (qdx / qLen) * (1 - blendF) + toFormX * blendF;
        var by = (qdy / qLen) * (1 - blendF) + toFormY * blendF;
        var bl = Math.sqrt(bx * bx + by * by) || 1;
        st.moveX = bx / bl;
        st.moveY = by / bl;
        return;
      }

      // Cruise cleanly into wingman slot beside anchor
      var formDist = Math.hypot(formX - me.x, formY - me.y);
      if (formDist > 28) {
        st.moveX = toFormX;
        st.moveY = toFormY;
      } else {
        var avLen = Math.hypot(anchor.vx, anchor.vy);
        if (avLen > 15) {
          st.moveX = anchor.vx / avLen;
          st.moveY = anchor.vy / avLen;
        } else {
          st.wanderAngle += (Math.random() - 0.5) * 0.7;
          st.moveX = Math.cos(st.wanderAngle) * 0.35;
          st.moveY = Math.sin(st.wanderAngle) * 0.35;
        }
      }
      return;
    }

    // Independent nucleus (or Squad Leader): contest Energy Reactors & farm quarks
    if (world && world.energyZones.length > 0 && (isSelfDepleted || me.hp < me.maxHp * 0.75 || Math.random() < 0.55)) {
      var bestEz = null;
      var bestEzScore = -Infinity;
      for (var ezIdx = 0; ezIdx < world.energyZones.length; ezIdx++) {
        var ez = world.energyZones[ezIdx];
        if (!zone.endless) {
          var ezZdx = ez.x - zone.x;
          var ezZdy = ez.y - zone.y;
          if (ezZdx * ezZdx + ezZdy * ezZdy > (zone.radius - 60) * (zone.radius - 60)) continue;
        }
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
      if (adSq > 540 * 540) continue;
      if (!zone.endless) {
        var pZoneDistSq = (part.x - zone.x) * (part.x - zone.x) + (part.y - zone.y) * (part.y - zone.y);
        if (pZoneDistSq > (zone.radius - 90) * (zone.radius - 90)) continue;
      }

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
      st.wanderAngle += (Math.random() - 0.5) * 1.1;
      var wx = Math.cos(st.wanderAngle);
      var wy = Math.sin(st.wanderAngle);
      var centerBias = !zone.endless && zone.radius < Config.ARENA_RADIUS * 0.7 ? 0.42 : 0.14;
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
