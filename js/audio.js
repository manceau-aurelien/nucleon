(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});

  var STORAGE_KEY = 'nucleon_muted';

  function AudioEngine() {
    this.ctx = null;
    this.muted = false;
    this.lastAnnihilateTime = 0;
    this.lastHitTime = 0;
    this.lastPickupTime = 0;
    this.lastZoneWarnTime = 0;

    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      this.muted = false;
    }
  }

  AudioEngine.prototype._ensureCtx = function () {
    if (this.muted) return null;
    if (!this.ctx) {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch (e) {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      try {
        this.ctx.resume();
      } catch (e) {}
    }
    return this.ctx;
  };

  AudioEngine.prototype.unlock = function () {
    this._ensureCtx();
  };

  AudioEngine.prototype.setMuted = function (muted) {
    this.muted = !!muted;
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch (e) {}
  };

  AudioEngine.prototype.toggleMute = function () {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this._ensureCtx();
    }
    return this.muted;
  };

  AudioEngine.prototype.playAnnihilate = function (intensity) {
    var nowMs = performance.now();
    if (nowMs - this.lastAnnihilateTime < 45) return;
    var ctx = this._ensureCtx();
    if (!ctx) return;
    this.lastAnnihilateTime = nowMs;

    var t = ctx.currentTime;
    var vol = Math.min(0.06, 0.025 + (intensity || 1) * 0.015);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'triangle';
    var f0 = 1500 + Math.random() * 1100;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.055);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.06);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.065);
  };

  AudioEngine.prototype.playNucleusHit = function (isPlayerVictim) {
    var nowMs = performance.now();
    if (nowMs - this.lastHitTime < 70) return;
    var ctx = this._ensureCtx();
    if (!ctx) return;
    this.lastHitTime = nowMs;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = isPlayerVictim ? 'sawtooth' : 'sine';
    var f0 = isPlayerVictim ? 240 : 380;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.09);

    gain.gain.setValueAtTime(isPlayerVictim ? 0.07 : 0.04, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.095);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  };

  AudioEngine.prototype.playAbsorb = function (isPlayerKill, scale) {
    var ctx = this._ensureCtx();
    if (!ctx) return;

    var t = ctx.currentTime;
    var s = Math.min(1.5, Math.max(0.7, scale || 1));

    // Sub-bass implosion
    var sub = ctx.createOscillator();
    var subGain = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(140 * s, t);
    sub.frequency.exponentialRampToValueAtTime(42, t + 0.34);
    subGain.gain.setValueAtTime(isPlayerKill ? 0.16 : 0.08, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    sub.connect(subGain);
    subGain.connect(ctx.destination);
    sub.start(t);
    sub.stop(t + 0.38);

    // Ascending crystalline arpeggio chime on player kill
    if (isPlayerKill) {
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        var osc = ctx.createOscillator();
        var g = ctx.createGain();
        var start = t + i * 0.045;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(notes[i], start);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.linearRampToValueAtTime(0.075, start + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0008, start + 0.24);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.26);
      }
    }
  };

  AudioEngine.prototype.playPickup = function (isBig) {
    var nowMs = performance.now();
    if (nowMs - this.lastPickupTime < 60) return;
    var ctx = this._ensureCtx();
    if (!ctx) return;
    this.lastPickupTime = nowMs;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    var f = isBig ? 940 : 680 + Math.random() * 180;
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.08);
    gain.gain.setValueAtTime(isBig ? 0.055 : 0.03, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  };

  AudioEngine.prototype.playDash = function () {
    var ctx = this._ensureCtx();
    if (!ctx) return;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.08);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.24);

    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + 0.26);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.27);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.28);
  };

  AudioEngine.prototype.playShieldToggle = function (on) {
    var ctx = this._ensureCtx();
    if (!ctx) return;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(on ? 420 : 560, t);
    osc.frequency.exponentialRampToValueAtTime(on ? 640 : 340, t + 0.08);
    gain.gain.setValueAtTime(0.045, t);
    gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.095);
  };

  AudioEngine.prototype.playZoneWarning = function () {
    var nowMs = performance.now();
    if (nowMs - this.lastZoneWarnTime < 1200) return;
    var ctx = this._ensureCtx();
    if (!ctx) return;
    this.lastZoneWarnTime = nowMs;

    var t = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115, t);
    osc.frequency.linearRampToValueAtTime(92, t + 0.28);
    gain.gain.setValueAtTime(0.075, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.32);
  };

  AudioEngine.prototype.playVictory = function () {
    var ctx = this._ensureCtx();
    if (!ctx) return;
    var t = ctx.currentTime;
    var chord = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    for (var i = 0; i < chord.length; i++) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      var start = t + i * 0.07;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(chord[i], start);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.linearRampToValueAtTime(0.09, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.55);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.58);
    }
  };

  AudioEngine.prototype.playDefeat = function () {
    var ctx = this._ensureCtx();
    if (!ctx) return;
    var t = ctx.currentTime;
    var notes = [440, 349.23, 293.66, 196];
    for (var i = 0; i < notes.length; i++) {
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      var start = t + i * 0.09;
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(notes[i], start);
      var filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, start);
      g.gain.setValueAtTime(0.06, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    }
  };

  NUCLEON.Audio = new AudioEngine();
})();
