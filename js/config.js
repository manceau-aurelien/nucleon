(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});

  var Config = {
    // World & Arena
    ARENA_RADIUS: 3200,
    AI_COUNT: 50,
    MIN_PLAYER_SPAWN_CLEARANCE: 480,
    AMBIENT_TARGET_BASE: 400,
    AMBIENT_TARGET_MIN: 75,
    MAX_AMBIENT_SLOTS: 480,

    // Nucleus starting & progression stats (unlimited electron cloud)
    START_POWER: 8,
    START_ELECTRONS: 8,
    NUM_SHELLS: 6,

    getRadius: function (power) {
      return 18 + Math.sqrt(power) * 3.4;
    },

    getMaxHp: function (power) {
      return 32 + power * 2.5;
    },

    // Soft natural orbital threshold for a nucleus of a given size (NOT a hard cap!)
    // Beyond this count, production gradually slows down due to orbital crowding,
    // requiring the nucleus to grow (quarks / absorptions) to produce rapidly.
    getNaturalCapacity: function (power) {
      return Math.max(12, Math.floor(6 + power * 0.90));
    },

    // Core base production rate (electrons/sec) before orbital crowding:
    // Very slow for small starter nuclei (~0.20/s = 1 electron every 5s),
    // scaling strongly as the nucleus absorbs matter and grows.
    getBaseProdRate: function (power) {
      var pDelta = Math.max(0, power - Config.START_POWER);
      return 0.20 + Math.pow(pDelta, 0.72) * 0.068;
    },

    // Progressive crowding factor in (0, 1] — never hits 0, so electrons have no upper limit
    getCrowdFactor: function (power, electronCount) {
      var count = electronCount || 0;
      var softCap = Config.getNaturalCapacity(power);
      if (count <= softCap) return 1;
      var excessRatio = (count - softCap) / softCap;
      return 1 / (1 + Math.pow(excessRatio, 1.15) * 0.85);
    },

    getProdRate: function (power, electronCount) {
      return Config.getBaseProdRate(power) * Config.getCrowdFactor(power, electronCount);
    },

    getActiveShells: function (electronCount) {
      var c = electronCount || 0;
      if (c <= 18) return 2;
      if (c <= 48) return 3;
      if (c <= 110) return 4;
      if (c <= 220) return 5;
      return 6;
    },

    getOrbitRadius: function (power, electronCount) {
      var effCount = Math.max(10, electronCount !== undefined ? electronCount : 10);
      return Config.getRadius(power) + 28 + Math.sqrt(effCount) * 5.8;
    },

    getMoveSpeed: function (power) {
      return Math.max(66, 148 - Math.sqrt(power) * 3.9);
    },

    // Electron & combat constants (24k pool supports massive uncapped swarms at 60 FPS)
    MAX_ELECTRONS_GLOBAL: 24000,
    ELECTRON_RADIUS: 4.2,
    ELECTRON_DAMAGE: 4.5,
    ELECTRON_ANNIHILATE_DIST: 9.8,
    ELECTRON_ANNIHILATE_DIST_SQ: 9.8 * 9.8,

    // Stances & tactical abilities
    ASSAULT_REACH_MULT: 2.35,
    SHIELD_ORBIT_MULT: 0.58,
    SHIELD_SPEED_MULT: 0.78,  // -22% move speed
    SHIELD_REGEN_MULT: 1.4,   // +40% regen speed
    SHIELD_DAMAGE_MULT: 0.70, // +30% core damage resistance

    REGEN_DELAY: 2.2,
    REGEN_RATE_RATIO: 0.038, // 3.8% maxHp/s

    DASH_COOLDOWN: 3.0,
    DASH_DURATION: 0.48,
    DASH_SPEED_MULT: 2.35,
    DASH_MIN_ELECTRONS: 4,
    DASH_COST_RATIO: 0.10,
    DASH_COST_MIN: 2,
    DASH_COST_MAX: 10,

    // Absorption & pickup rewards
    ABSORB_POWER_GAIN_RATIO: 0.65,
    ABSORB_BASE_POWER_BONUS: 5.5,
    ABSORB_HEAL_RATIO: 0.30,
    AMBIENT_PROD_GAIN: 0.14,
    AMBIENT_CLUSTER_PROD_GAIN: 0.55,

    // Solo / Endless mode with a friend set to "Même équipe": both humans share this
    // team id (AIs stay at -1, each on its own), kept outside 0..24 so it never collides.
    DUO_TEAM: 99,

    // Game Modes catalog
    GAME_MODES: [
      {
        id: 'teams',
        label: '3 Équipes',
        total: 51,
        teamCount: 3,
        teamSize: 17,
        isSquad: false,
        endless: false,
        desc: '3 armées de 17 noyaux (Cyan, Magenta, Ambre) — zéro tir allié'
      },
      {
        id: 'trios',
        label: 'Trios (20×3)',
        total: 60,
        teamCount: 20,
        teamSize: 3,
        isSquad: true,
        endless: false,
        desc: '20 escouades soudées de 3 noyaux (60 combattants) — restez groupés !'
      },
      {
        id: 'duos',
        label: 'Duos (25×2)',
        total: 50,
        teamCount: 25,
        teamSize: 2,
        isSquad: true,
        endless: false,
        desc: '25 binômes tactiques de 2 noyaux (50 combattants) — coopération rapprochée'
      },
      {
        id: 'clash',
        label: '2 Camps (30v30)',
        total: 60,
        teamCount: 2,
        teamSize: 30,
        isSquad: false,
        endless: false,
        desc: 'Guerre frontale massive : 30 Cyan contre 30 Corail (60 combattants)'
      },
      {
        id: 'solo',
        label: 'Solo',
        total: 51,
        teamCount: 0,
        teamSize: 1,
        isSquad: false,
        endless: false,
        desc: 'Chacun pour soi (51 noyaux) — absorbez tout pour survivre à la zone'
      },
      {
        id: 'endless',
        label: 'Infini (Sans Zone)',
        total: 51,
        teamCount: 0,
        teamSize: 1,
        isSquad: false,
        endless: true,
        desc: 'Arène permanente sans rétrécissement avec réapparition des IA — nuées géantes !'
      }
    ],

    getModeMeta: function (modeId) {
      for (var i = 0; i < Config.GAME_MODES.length; i++) {
        if (Config.GAME_MODES[i].id === modeId) return Config.GAME_MODES[i];
      }
      return Config.GAME_MODES[0];
    },

    // 3-Color Team Battle Mode
    TEAMS: [
      { id: 0, name: 'Cyan',    label: 'Équipe Cyan',    hue: 188, hex: '#00f0ff' },
      { id: 1, name: 'Magenta', label: 'Équipe Magenta', hue: 315, hex: '#ff2ea6' },
      { id: 2, name: 'Ambre',   label: 'Équipe Ambre',   hue: 42,  hex: '#ffb700' }
    ],

    // 2-Army Clash Mode (30 vs 30)
    CLASH_TEAMS: [
      { id: 0, name: 'Cyan',   label: 'Alliance Cyan',  hue: 188, hex: '#00f0ff' },
      { id: 1, name: 'Corail', label: 'Légion Corail',  hue: 348, hex: '#ff3366' }
    ],

    // 25 Named Quantum Squads (used for 20x3 Trios and 25x2 Duos)
    SQUADS: [
      { id: 0,  tag: 'α', name: 'Alpha',   hue: 188 },
      { id: 1,  tag: 'β', name: 'Bêta',    hue: 342 },
      { id: 2,  tag: 'γ', name: 'Gamma',   hue: 44  },
      { id: 3,  tag: 'δ', name: 'Delta',   hue: 152 },
      { id: 4,  tag: 'ε', name: 'Epsilon', hue: 274 },
      { id: 5,  tag: 'ζ', name: 'Zêta',    hue: 16  },
      { id: 6,  tag: 'η', name: 'Êta',     hue: 215 },
      { id: 7,  tag: 'θ', name: 'Thêta',   hue: 305 },
      { id: 8,  tag: 'λ', name: 'Lambda',  hue: 98  },
      { id: 9,  tag: 'μ', name: 'Mu',      hue: 56  },
      { id: 10, tag: 'ξ', name: 'Xi',      hue: 172 },
      { id: 11, tag: 'π', name: 'Pi',      hue: 326 },
      { id: 12, tag: 'ρ', name: 'Rho',     hue: 28  },
      { id: 13, tag: 'σ', name: 'Sigma',   hue: 242 },
      { id: 14, tag: 'τ', name: 'Tau',     hue: 128 },
      { id: 15, tag: 'φ', name: 'Phi',     hue: 288 },
      { id: 16, tag: 'χ', name: 'Chi',     hue: 198 },
      { id: 17, tag: 'ψ', name: 'Psi',     hue: 356 },
      { id: 18, tag: 'ω', name: 'Oméga',   hue: 74  },
      { id: 19, tag: '✦', name: 'Nova',    hue: 258 },
      { id: 20, tag: '◈', name: 'Vortex',  hue: 162 },
      { id: 21, tag: '❖', name: 'Quasar',  hue: 8   },
      { id: 22, tag: '⬡', name: 'Pulsar',  hue: 228 },
      { id: 23, tag: '✧', name: 'Éther',   hue: 316 },
      { id: 24, tag: '⚡', name: 'Zénith',  hue: 38  }
    ],

    // Difficulty presets
    DIFFICULTIES: {
      detente: {
        label: 'Détente',
        aiIntervalMin: 0.16,
        aiIntervalMax: 0.24,
        aggression: 0.72,
        dashChance: 0.28,
        fleeFactor: 1.42
      },
      standard: {
        label: 'Standard',
        aiIntervalMin: 0.11,
        aiIntervalMax: 0.16,
        aggression: 1.0,
        dashChance: 0.55,
        fleeFactor: 1.32
      },
      chaos: {
        label: 'Chaos',
        aiIntervalMin: 0.08,
        aiIntervalMax: 0.12,
        aggression: 1.25,
        dashChance: 0.85,
        fleeFactor: 1.24
      }
    },

    // Vibrant neon hues (16 hues for arena entities)
    NEON_HUES: [
      188, // Cyan
      212, // Electric Blue
      298, // Magenta
      268, // Violet
      152, // Emerald
      95,  // Lime
      38,  // Amber
      14,  // Coral
      334, // Rose
      172, // Turquoise
      48,  // Gold
      235, // Indigo
      284, // Purple
      125, // Neon Green
      354, // Crimson
      198  // Sky Cyan
    ],

    PLAYER_SWATCHES: [
      { hue: 188, label: 'Cyan Quantique', hex: '#00f0ff' },
      { hue: 298, label: 'Magenta Plasma', hex: '#ff2ef5' },
      { hue: 152, label: 'Émeraude Flux',  hex: '#00ff9d' },
      { hue: 38,  label: 'Ambre Solaire',  hex: '#ffaa00' },
      { hue: 268, label: 'Violet Pulsar',  hex: '#9b4dff' },
      { hue: 342, label: 'Corail Nova',    hex: '#ff3366' }
    ],

    AI_NAMES: [
      'Quark-7', 'Positron', 'Fermion', 'Boson', 'Neutrino', 'Hadron',
      'Lepton', 'Gluon', 'Tachyon', 'Pulsar', 'Quasar', 'Isotope',
      'Krypton', 'Xenon', 'Axion', 'Graviton', 'Photon', 'Muon',
      'Kaon', 'Pion', 'Helios', 'Vega', 'Orion', 'Lyra',
      'Aether', 'Plasma', 'Flux', 'Ion-9', 'Baryon', 'Meson',
      'Hyperion', 'Nova', 'Nebula', 'Chronos', 'Sigma', 'Omega',
      'Delta-4', 'Alpha-X', 'Zeta', 'Kaos', 'Vortex', 'Nyx',
      'Solaris', 'Stratos', 'Cryo', 'Pyro', 'Volt', 'Arc',
      'Prism', 'Echo', 'Zephyr', 'Magnetar', 'Ceres', 'Titan', 'Spectra',
      'Radon', 'Argon', 'Spinor', 'Tensor', 'Singularity', 'Cosmos',
      'Altair', 'Sirius', 'Rigel', 'Polaris', 'Draco', 'Cygnus'
    ],

    // Configurable Zone Timing (applies to all modes except Endless)
    DEFAULT_ZONE_START_DELAY: 45, // seconds before first shrink begins
    DEFAULT_ZONE_SHRINK_SPEED: 18, // px/s radial shrink speed (3200px -> 0px)
    ZONE_STAGE_RADII: [2250, 1500, 880, 440, 200, 0],

    ZONE_PRESETS: [
      { id: 'blitz',    label: '⚡ Éclair (~2m)',   startDelay: 15,  shrinkSpeed: 38 },
      { id: 'normal',   label: '⏱️ Normal (~4m30)', startDelay: 45,  shrinkSpeed: 18 },
      { id: 'long',     label: '🌌 Longue (~8m)',   startDelay: 120, shrinkSpeed: 12 },
      { id: 'marathon', label: '🪐 Marathon (~15m)', startDelay: 240, shrinkSpeed: 6  }
    ],

    buildZonePhases: function (startDelaySec, shrinkSpeedPx) {
      var delay = Math.max(0, Number(startDelaySec));
      if (isNaN(delay)) delay = Config.DEFAULT_ZONE_START_DELAY;
      var speed = Math.max(3, Number(shrinkSpeedPx));
      if (isNaN(speed)) speed = Config.DEFAULT_ZONE_SHRINK_SPEED;

      var radii = Config.ZONE_STAGE_RADII;
      var interHoldBase = delay <= 0 ? 0 : Math.min(25, Math.max(3, delay * 0.22));
      var holdWeights = [1, 1.0, 0.9, 0.8, 0.65, 0.5];
      var phases = [];
      var prevR = Config.ARENA_RADIUS;

      for (var i = 0; i < radii.length; i++) {
        var targetR = radii[i];
        var deltaR = Math.max(0, prevR - targetR);
        var holdDur = i === 0 ? delay : Math.round(interHoldBase * holdWeights[i] * 10) / 10;
        var shrinkDur = Math.max(1.5, Math.round((deltaR / speed) * 10) / 10);
        phases.push({
          targetRadius: targetR,
          holdDuration: holdDur,
          shrinkDuration: shrinkDur
        });
        prevR = targetR;
      }
      return phases;
    },

    estimateMatchDuration: function (startDelaySec, shrinkSpeedPx) {
      var phases = Config.buildZonePhases(startDelaySec, shrinkSpeedPx);
      var total = 0;
      for (var i = 0; i < phases.length; i++) {
        total += phases[i].holdDuration + phases[i].shrinkDuration;
      }
      return Math.round(total);
    },

    // Default fallback phases
    ZONE_PHASES: [
      { targetRadius: 2250, holdDuration: 45, shrinkDuration: 52.8 },
      { targetRadius: 1500, holdDuration: 9.9, shrinkDuration: 41.7 },
      { targetRadius: 880,  holdDuration: 8.9, shrinkDuration: 34.4 },
      { targetRadius: 440,  holdDuration: 7.9, shrinkDuration: 24.4 },
      { targetRadius: 200,  holdDuration: 6.4, shrinkDuration: 13.3 },
      { targetRadius: 0,    holdDuration: 5.0, shrinkDuration: 11.1 }
    ]
  };

  NUCLEON.Config = Config;
})();
