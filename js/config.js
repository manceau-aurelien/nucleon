(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});

  var Config = {
    // World & Arena
    ARENA_RADIUS: 3200,
    AI_COUNT: 50,
    MIN_PLAYER_SPAWN_CLEARANCE: 480,
    AMBIENT_TARGET_BASE: 380,
    AMBIENT_TARGET_MIN: 70,
    MAX_AMBIENT_SLOTS: 450,

    // Nucleus starting & progression stats
    START_POWER: 8,
    START_ELECTRONS: 14,

    getRadius: function (power) {
      return 18 + Math.sqrt(power) * 3.4;
    },

    getMaxHp: function (power) {
      return 32 + power * 2.5;
    },

    getMaxElectrons: function (power) {
      return Math.min(220, Math.floor(8 + power * 1.15));
    },

    getProdRate: function (power) {
      return 0.38 + Math.pow(power, 0.65) * 0.10;
    },

    getOrbitRadius: function (power) {
      return Config.getRadius(power) + 32 + Math.sqrt(Config.getMaxElectrons(power)) * 6.4;
    },

    getMoveSpeed: function (power) {
      return Math.max(69, 148 - Math.sqrt(power) * 4.1);
    },

    // Electron & combat constants
    MAX_ELECTRONS_GLOBAL: 6000,
    ELECTRON_RADIUS: 4.2,
    ELECTRON_DAMAGE: 4.5,
    ELECTRON_ANNIHILATE_DIST: 9.8,
    ELECTRON_ANNIHILATE_DIST_SQ: 9.8 * 9.8,

    // Stances & tactical abilities
    ASSAULT_REACH_MULT: 2.35,
    SHIELD_ORBIT_MULT: 0.58,
    SHIELD_SPEED_MULT: 0.78, // -22% move speed
    SHIELD_REGEN_MULT: 1.4,  // +40% regen speed
    SHIELD_DAMAGE_MULT: 0.70, // +30% core damage resistance

    REGEN_DELAY: 2.2,
    REGEN_RATE_RATIO: 0.038, // 3.8% maxHp/s

    DASH_COOLDOWN: 3.0,
    DASH_DURATION: 0.48,
    DASH_SPEED_MULT: 2.35,
    DASH_MIN_ELECTRONS: 4,
    DASH_COST_RATIO: 0.14,
    DASH_COST_MIN: 2,
    DASH_COST_MAX: 6,

    // Absorption & pickup rewards
    ABSORB_POWER_GAIN_RATIO: 0.65,
    ABSORB_BASE_POWER_BONUS: 5.5,
    ABSORB_HEAL_RATIO: 0.30,
    ABSORB_BONUS_ELECTRON_RATIO: 0.10,
    AMBIENT_PROD_GAIN: 0.22,
    AMBIENT_CLUSTER_PROD_GAIN: 0.75,

    // 3-Color Team Battle Mode
    TEAMS: [
      { id: 0, name: 'Cyan',    label: 'Équipe Cyan',    hue: 188, hex: '#00f0ff' },
      { id: 1, name: 'Magenta', label: 'Équipe Magenta', hue: 315, hex: '#ff2ea6' },
      { id: 2, name: 'Ambre',   label: 'Équipe Ambre',   hue: 42,  hex: '#ffb700' }
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
      { hue: 152, label: 'Émeraude Flux', hex: '#00ff9d' },
      { hue: 38,  label: 'Ambre Solaire', hex: '#ffaa00' },
      { hue: 268, label: 'Violet Pulsar', hex: '#9b4dff' },
      { hue: 342, label: 'Corail Nova', hex: '#ff3366' }
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
      'Prism', 'Echo', 'Zephyr', 'Magnetar', 'Ceres', 'Titan', 'Spectra'
    ],

    // Shrinking Zone Phases: 3200 -> 2250 -> 1500 -> 880 -> 420 -> 110
    ZONE_PHASES: [
      { targetRadius: 2250, holdDuration: 36, shrinkDuration: 36 },
      { targetRadius: 1500, holdDuration: 30, shrinkDuration: 32 },
      { targetRadius: 880,  holdDuration: 26, shrinkDuration: 28 },
      { targetRadius: 420,  holdDuration: 20, shrinkDuration: 24 },
      { targetRadius: 110,  holdDuration: 16, shrinkDuration: 22 }
    ]
  };

  NUCLEON.Config = Config;
})();
