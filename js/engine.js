(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});
  var Config = NUCLEON.Config;
  var Worlds = NUCLEON.Worlds;
  var SpatialGrid = NUCLEON.SpatialGrid;
  var Audio = NUCLEON.Audio;
  var Net = NUCLEON.Net;
  var Entities = NUCLEON.Entities;
  var Zone = NUCLEON.Zone;
  var AI = NUCLEON.AI;
  var Renderer = NUCLEON.Renderer;

  var BEST_STORAGE_KEY = 'nucleon_best_record';

  function formatTime(sec) {
    var s = Math.max(0, Math.floor(sec));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : r);
  }

  function shuffleArray(arr) {
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function Engine() {
    this.canvas = document.getElementById('game-canvas');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas ? this.minimapCanvas.getContext('2d') : null;
    this.renderer = new Renderer(this.canvas);

    this.state = {
      mode: 'MENU', // 'MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'DEFEAT' | 'SPECTATING'
      gameMode: 'teams', // 'teams' | 'solo'
      worldId: 'open',
      worldSeed: 1337,
      world: Worlds.generate('open', 1337),
      playerTeam: 0,
      friendRelation: 'ally', // 'ally' | 'rival'
      difficulty: 'standard',
      playerName: 'Noyau-01',
      playerHue: 188,
      mp: {
        active: false,
        role: null,
        code: null,
        connected: false,
        friendName: 'Ami',
        friendHue: 298,
        friendId: -1,
        sendAccum: 0,
        guestSendAccum: 0,
        ambTick: 0,
        guestInput: { ang: 0, move: 0, aimX: 0, aimY: 0, stance: 'ORBIT', wantDash: false },
        pendingEvents: []
      },
      nuclei: [],
      player: null,
      spectateTarget: null,
      leaderId: -1,
      aliveCount: 0,
      totalCount: Config.AI_COUNT + 1,
      electrons: new Entities.ElectronPool(Config.MAX_ELECTRONS_GLOBAL),
      spatial: new SpatialGrid(Config.MAX_ELECTRONS_GLOBAL),
      ambient: Entities.createAmbientPool(Config.MAX_AMBIENT_SLOTS),
      fx: Entities.createFxPools(),
      zone: new Zone(),
      killFeed: [],
      elapsedTime: 0,
      ambientTimer: 0
    };

    this.input = {
      mouseX: window.innerWidth * 0.5,
      mouseY: window.innerHeight * 0.5,
      mouseWorldX: 0,
      mouseWorldY: 0,
      lmbDown: false,
      rmbDown: false,
      keys: {}
    };

    this.hudAccum = 0;
    this.lastFrameTime = 0;
    this._nearestEnemy = new Int16Array(64);
    this._shieldingList = [];
    this._aliveScratch = [];
    this._lastLbHtml = '';
    this._lastKfHtml = '';
    this._dom = this._cacheDom();
    this._loadBestRecord();
    this._bindEvents();

    // Start attract-mode background simulation immediately
    this.initMatch(true);
    this._loop(performance.now());
  }

  Engine.prototype._cacheDom = function () {
    return {
      hudRoot: document.getElementById('hud-root'),
      hudElectrons: document.getElementById('hud-electrons'),
      hudElectronsBar: document.getElementById('hud-electrons-bar'),
      hudProd: document.getElementById('hud-prod'),
      hudHp: document.getElementById('hud-hp'),
      hudHpBar: document.getElementById('hud-hp-bar'),
      hudPower: document.getElementById('hud-power'),
      hudKills: document.getElementById('hud-kills'),
      reactorBadge: document.getElementById('reactor-badge'),
      netBadge: document.getElementById('net-badge'),
      hudAlive: document.getElementById('hud-alive'),
      hudRank: document.getElementById('hud-rank'),
      hudZoneLabel: document.getElementById('hud-zone-label'),
      hudZoneTimer: document.getElementById('hud-zone-timer'),
      teamScoreboard: document.getElementById('team-scoreboard'),
      teamCounts: [
        document.getElementById('team-count-0'),
        document.getElementById('team-count-1'),
        document.getElementById('team-count-2')
      ],
      teamBars: [
        document.getElementById('team-bar-0'),
        document.getElementById('team-bar-1'),
        document.getElementById('team-bar-2')
      ],
      zoneWarningBanner: document.getElementById('zone-warning-banner'),
      leaderboardList: document.getElementById('leaderboard-list'),
      killFeed: document.getElementById('kill-feed'),
      btnMute: document.getElementById('btn-mute'),
      btnPause: document.getElementById('btn-pause'),
      skillAssault: document.getElementById('skill-assault'),
      skillShield: document.getElementById('skill-shield'),
      skillDash: document.getElementById('skill-dash'),
      dashFill: document.getElementById('dash-fill'),
      dashLabel: document.getElementById('dash-label'),
      spectateBar: document.getElementById('spectate-bar'),
      spectateName: document.getElementById('spectate-name'),
      btnSpectateNext: document.getElementById('btn-spectate-next'),
      btnSpectateReplay: document.getElementById('btn-spectate-replay'),

      menuModal: document.getElementById('menu-modal'),
      worldPills: document.querySelectorAll('.world-pill'),
      worldDesc: document.getElementById('world-desc'),
      playerNameInput: document.getElementById('player-name-input'),
      modePills: document.querySelectorAll('.mode-pill'),
      colorPickerLabel: document.getElementById('color-picker-label'),
      swatchRow: document.getElementById('swatch-row'),
      diffPills: document.querySelectorAll('.diff-pill'),
      bestRecordText: document.getElementById('best-record-text'),
      btnPlay: document.getElementById('btn-play'),

      mpIdle: document.getElementById('mp-idle'),
      mpError: document.getElementById('mp-error'),
      btnMpHost: document.getElementById('btn-mp-host'),
      mpJoinInput: document.getElementById('mp-join-input'),
      btnMpJoin: document.getElementById('btn-mp-join'),
      mpHostPanel: document.getElementById('mp-host-panel'),
      mpCodeText: document.getElementById('mp-code-text'),
      btnMpCopy: document.getElementById('btn-mp-copy'),
      btnMpLeaveHost: document.getElementById('btn-mp-leave-host'),
      mpHostStatus: document.getElementById('mp-host-status'),
      mpFriendRelRow: document.getElementById('mp-friend-relation-row'),
      mpFriendRelPills: document.querySelectorAll('.friend-rel-pill'),
      mpGuestPanel: document.getElementById('mp-guest-panel'),
      mpGuestStatus: document.getElementById('mp-guest-status'),
      mpGuestLobbyInfo: document.getElementById('mp-guest-lobby-info'),
      btnMpLeaveGuest: document.getElementById('btn-mp-leave-guest'),

      pauseModal: document.getElementById('pause-modal'),
      btnResume: document.getElementById('btn-resume'),
      btnRestartPause: document.getElementById('btn-restart-pause'),
      btnMenuPause: document.getElementById('btn-menu-pause'),

      endModal: document.getElementById('end-modal'),
      endTitle: document.getElementById('end-title'),
      endSubtitle: document.getElementById('end-subtitle'),
      endRank: document.getElementById('end-rank'),
      endKills: document.getElementById('end-kills'),
      endPeakElectrons: document.getElementById('end-peak-electrons'),
      endPeakProd: document.getElementById('end-peak-prod'),
      endTime: document.getElementById('end-time'),
      btnReplay: document.getElementById('btn-replay'),
      btnSpectate: document.getElementById('btn-spectate'),
      btnEndMenu: document.getElementById('btn-end-menu')
    };
  };

  Engine.prototype._loadBestRecord = function () {
    this.bestRecord = { rank: 99, kills: 0, wins: 0 };
    try {
      var raw = localStorage.getItem(BEST_STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed.rank === 'number') {
          this.bestRecord = parsed;
        }
      }
    } catch (e) {}
    this._renderBestRecord();
  };

  Engine.prototype._saveBestRecord = function (rank, kills, isWin) {
    if (rank < this.bestRecord.rank) this.bestRecord.rank = rank;
    if (kills > this.bestRecord.kills) this.bestRecord.kills = kills;
    if (isWin) this.bestRecord.wins = (this.bestRecord.wins || 0) + 1;
    try {
      localStorage.setItem(BEST_STORAGE_KEY, JSON.stringify(this.bestRecord));
    } catch (e) {}
    this._renderBestRecord();
  };

  Engine.prototype._renderBestRecord = function () {
    var el = this._dom.bestRecordText;
    if (!el) return;
    if (this.bestRecord.rank > 60) {
      el.textContent = 'Record : aucune partie terminée';
    } else {
      el.textContent =
        'Record : #' +
        this.bestRecord.rank +
        ' • ' +
        this.bestRecord.kills +
        ' absorptions' +
        (this.bestRecord.wins ? ' • ' + this.bestRecord.wins + ' victoire(s)' : '');
    }
  };

  Engine.prototype._bindEvents = function () {
    var self = this;
    var dom = this._dom;

    window.addEventListener('resize', function () {
      self.renderer.resize();
    });

    window.addEventListener('blur', function () {
      self.input.lmbDown = false;
      self.input.rmbDown = false;
      self.input.keys = {};
    });

    this.canvas.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    window.addEventListener('mousemove', function (e) {
      self.input.mouseX = e.clientX;
      self.input.mouseY = e.clientY;
    });

    this.canvas.addEventListener('mousedown', function (e) {
      Audio.unlock();
      if (e.button === 0) self.input.lmbDown = true;
      else if (e.button === 2) {
        self.input.rmbDown = true;
        if (self.state.mode === 'PLAYING') Audio.playShieldToggle(true);
      }
    });

    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) self.input.lmbDown = false;
      else if (e.button === 2) {
        if (self.input.rmbDown && self.state.mode === 'PLAYING') {
          Audio.playShieldToggle(false);
        }
        self.input.rmbDown = false;
      }
    });

    window.addEventListener('keydown', function (e) {
      var code = e.code;
      var activeTag = document.activeElement && document.activeElement.tagName;
      if (activeTag === 'INPUT') return;

      self.input.keys[code] = true;

      if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') {
        if (self.state.mode === 'PLAYING') {
          e.preventDefault();
          self._triggerPlayerDash();
        }
      } else if (code === 'KeyE' || code === 'KeyS') {
        if (self.state.mode === 'PLAYING' && !e.repeat) {
          Audio.playShieldToggle(true);
        }
      } else if (code === 'KeyP' || code === 'Escape') {
        if (self.state.mode === 'PLAYING') {
          self.setMode('PAUSED');
        } else if (self.state.mode === 'PAUSED') {
          self.setMode('PLAYING');
        }
      } else if (code === 'KeyM') {
        var muted = Audio.toggleMute();
        self._updateMuteButton(muted);
      }
    });

    window.addEventListener('keyup', function (e) {
      var code = e.code;
      self.input.keys[code] = false;
      if ((code === 'KeyE' || code === 'KeyS') && self.state.mode === 'PLAYING') {
        Audio.playShieldToggle(false);
      }
    });

    // Team vs Solo picker options inside #swatch-row
    function renderPickerOptions() {
      if (!dom.swatchRow) return;
      dom.swatchRow.innerHTML = '';
      if (self.state.gameMode === 'teams') {
        if (dom.colorPickerLabel) dom.colorPickerLabel.textContent = 'Votre équipe';
        for (var t = 0; t < Config.TEAMS.length; t++) {
          (function (team) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'team-btn' + (self.state.playerTeam === team.id ? ' active' : '');
            btn.setAttribute('data-team', String(team.id));
            btn.innerHTML =
              '<span class="team-dot" style="background:' +
              team.hex +
              ';box-shadow:0 0 8px ' +
              team.hex +
              '"></span>' +
              team.name;
            btn.addEventListener('click', function () {
              self.state.playerTeam = team.id;
              self.state.playerHue = team.hue;
              var all = dom.swatchRow.querySelectorAll('.team-btn');
              for (var k = 0; k < all.length; k++) all[k].classList.remove('active');
              btn.classList.add('active');
            });
            dom.swatchRow.appendChild(btn);
          })(Config.TEAMS[t]);
        }
      } else {
        if (dom.colorPickerLabel) dom.colorPickerLabel.textContent = 'Couleur plasma';
        for (var i = 0; i < Config.PLAYER_SWATCHES.length; i++) {
          (function (sw) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'swatch-btn' + (self.state.playerHue === sw.hue ? ' active' : '');
            btn.title = sw.label;
            btn.style.background = sw.hex;
            btn.style.boxShadow = '0 0 12px ' + sw.hex;
            btn.addEventListener('click', function () {
              self.state.playerHue = sw.hue;
              var all = dom.swatchRow.querySelectorAll('.swatch-btn');
              for (var k = 0; k < all.length; k++) all[k].classList.remove('active');
              btn.classList.add('active');
              if (self.state.mp.active && self.state.mp.role === 'guest' && Net.connected) {
                var nm = (dom.playerNameInput.value || '').trim().slice(0, 16) || 'Ami';
                Net.send({ t: 'hello', name: nm, hue: sw.hue });
              }
            });
            dom.swatchRow.appendChild(btn);
          })(Config.PLAYER_SWATCHES[i]);
        }
      }
    }
    this._renderPickerOptions = renderPickerOptions;
    renderPickerOptions();

    // World selector pills
    for (var wp = 0; wp < dom.worldPills.length; wp++) {
      (function (pill) {
        pill.addEventListener('click', function () {
          if (self.state.mp.active && self.state.mp.role === 'guest') return;
          var nextWorld = pill.getAttribute('data-world') || 'open';
          if (self.state.worldId === nextWorld) return;
          self.state.worldId = nextWorld;
          for (var k = 0; k < dom.worldPills.length; k++) {
            dom.worldPills[k].classList.remove('active');
          }
          pill.classList.add('active');
          var wMeta = Worlds.getWorldMeta(nextWorld);
          if (dom.worldDesc) dom.worldDesc.textContent = wMeta.desc;
          self.initMatch(true);
          self._sendLobbySync();
        });
      })(dom.worldPills[wp]);
    }

    // Game mode pills (Équipes / Solo)
    for (var m = 0; m < dom.modePills.length; m++) {
      (function (pill) {
        pill.addEventListener('click', function () {
          if (self.state.mp.active && self.state.mp.role === 'guest') return;
          var nextMode = pill.getAttribute('data-mode') || 'teams';
          if (self.state.gameMode === nextMode) return;
          self.state.gameMode = nextMode;
          for (var k = 0; k < dom.modePills.length; k++) {
            dom.modePills[k].classList.remove('active');
          }
          pill.classList.add('active');
          if (nextMode === 'teams') {
            self.state.playerHue = Config.TEAMS[self.state.playerTeam].hue;
          }
          renderPickerOptions();
          self._updateMenuMpUi();
          self.initMatch(true);
          self._sendLobbySync();
        });
      })(dom.modePills[m]);
    }

    // Difficulty pills
    for (var d = 0; d < dom.diffPills.length; d++) {
      (function (pill) {
        pill.addEventListener('click', function () {
          if (self.state.mp.active && self.state.mp.role === 'guest') return;
          self.state.difficulty = pill.getAttribute('data-diff') || 'standard';
          for (var k = 0; k < dom.diffPills.length; k++) {
            dom.diffPills[k].classList.remove('active');
          }
          pill.classList.add('active');
          self._sendLobbySync();
        });
      })(dom.diffPills[d]);
    }

    // Friend relation pills (Same Team vs Rivals)
    for (var fr = 0; fr < dom.mpFriendRelPills.length; fr++) {
      (function (pill) {
        pill.addEventListener('click', function () {
          self.state.friendRelation = pill.getAttribute('data-rel') || 'ally';
          for (var k = 0; k < dom.mpFriendRelPills.length; k++) {
            dom.mpFriendRelPills[k].classList.remove('active');
          }
          pill.classList.add('active');
          self._sendLobbySync();
        });
      })(dom.mpFriendRelPills[fr]);
    }

    // Multiplayer Lobby buttons
    if (dom.btnMpHost) {
      dom.btnMpHost.addEventListener('click', function () {
        Audio.unlock();
        self._hostRoom();
      });
    }
    if (dom.btnMpJoin) {
      dom.btnMpJoin.addEventListener('click', function () {
        Audio.unlock();
        self._joinRoom();
      });
    }
    if (dom.mpJoinInput) {
      dom.mpJoinInput.addEventListener('input', function () {
        dom.mpJoinInput.value = dom.mpJoinInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      });
      dom.mpJoinInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          Audio.unlock();
          self._joinRoom();
        }
      });
    }
    if (dom.btnMpCopy) {
      dom.btnMpCopy.addEventListener('click', function () {
        if (!self.state.mp.code) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(self.state.mp.code).then(function () {
            dom.btnMpCopy.textContent = 'Copié !';
            setTimeout(function () { dom.btnMpCopy.textContent = 'Copier'; }, 1400);
          }).catch(function () {});
        }
      });
    }
    if (dom.btnMpLeaveHost) {
      dom.btnMpLeaveHost.addEventListener('click', function () {
        self._leaveMultiplayer();
      });
    }
    if (dom.btnMpLeaveGuest) {
      dom.btnMpLeaveGuest.addEventListener('click', function () {
        self._leaveMultiplayer();
      });
    }

    this._setupNetHandlers();

    dom.btnPlay.addEventListener('click', function () {
      if (self.state.mp.active && self.state.mp.role === 'guest') return;
      Audio.unlock();
      self._startMatchFromMenu();
    });

    dom.playerNameInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        if (self.state.mp.active && self.state.mp.role === 'guest') return;
        Audio.unlock();
        self._startMatchFromMenu();
      }
    });

    dom.btnMute.addEventListener('click', function () {
      var m = Audio.toggleMute();
      self._updateMuteButton(m);
    });
    this._updateMuteButton(Audio.muted);

    dom.btnPause.addEventListener('click', function () {
      if (self.state.mode === 'PLAYING') self.setMode('PAUSED');
      else if (self.state.mode === 'PAUSED') self.setMode('PLAYING');
    });

    dom.btnResume.addEventListener('click', function () {
      self.setMode('PLAYING');
    });

    dom.btnRestartPause.addEventListener('click', function () {
      if (self.state.mp.active && self.state.mp.role === 'guest') return;
      self.initMatch(false);
      self.setMode('PLAYING');
    });

    dom.btnMenuPause.addEventListener('click', function () {
      self._leaveMultiplayer();
      self.initMatch(true);
      self.setMode('MENU');
    });

    dom.btnReplay.addEventListener('click', function () {
      if (self.state.mp.active && self.state.mp.role === 'guest') return;
      self.initMatch(false);
      self.setMode('PLAYING');
    });

    dom.btnSpectate.addEventListener('click', function () {
      self._enterSpectate();
    });

    dom.btnEndMenu.addEventListener('click', function () {
      self._leaveMultiplayer();
      self.initMatch(true);
      self.setMode('MENU');
    });

    dom.btnSpectateNext.addEventListener('click', function () {
      self._cycleSpectateTarget();
    });

    dom.btnSpectateReplay.addEventListener('click', function () {
      if (self.state.mp.active && self.state.mp.role === 'guest') return;
      self.initMatch(false);
      self.setMode('PLAYING');
    });
  };

  Engine.prototype._setMpError = function (msg) {
    var el = this._dom.mpError;
    if (!el) return;
    if (!msg) {
      el.textContent = '';
      el.classList.add('hidden');
    } else {
      el.textContent = msg;
      el.classList.remove('hidden');
    }
  };

  Engine.prototype._hostRoom = function () {
    var self = this;
    var dom = this._dom;
    this._setMpError('');
    dom.btnMpHost.disabled = true;
    dom.btnMpHost.textContent = 'Création...';

    Net.host()
      .then(function (code) {
        self.state.mp.active = true;
        self.state.mp.role = 'host';
        self.state.mp.code = code;
        self.state.mp.connected = false;
        self.state.mp.friendName = 'Ami';
        dom.btnMpHost.disabled = false;
        dom.btnMpHost.textContent = '🔗 Créer un salon';
        self._updateMenuMpUi();
      })
      .catch(function (err) {
        dom.btnMpHost.disabled = false;
        dom.btnMpHost.textContent = '🔗 Créer un salon';
        self._setMpError(err ? err.message : 'Impossible de créer le salon.');
      });
  };

  Engine.prototype._joinRoom = function () {
    var self = this;
    var dom = this._dom;
    var code = (dom.mpJoinInput.value || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (code.length !== 4) {
      this._setMpError('Entrez un code de 4 lettres (ex : KRAZ).');
      return;
    }
    this._setMpError('');
    dom.btnMpJoin.disabled = true;
    dom.btnMpJoin.textContent = 'Connexion...';

    Net.join(code)
      .then(function () {
        self.state.mp.active = true;
        self.state.mp.role = 'guest';
        self.state.mp.code = code;
        self.state.mp.connected = true;
        dom.btnMpJoin.disabled = false;
        dom.btnMpJoin.textContent = '🎮 Rejoindre';
        var rawName = (dom.playerNameInput.value || '').trim();
        var guestName = rawName.length > 0 ? rawName.slice(0, 16) : 'Ami';
        Net.send({ t: 'hello', name: guestName, hue: self.state.playerHue });
        self._updateMenuMpUi();
      })
      .catch(function (err) {
        dom.btnMpJoin.disabled = false;
        dom.btnMpJoin.textContent = '🎮 Rejoindre';
        self._setMpError(err ? err.message : 'Salon introuvable.');
      });
  };

  Engine.prototype._leaveMultiplayer = function () {
    if (!this.state.mp.active) return;
    Net.close();
    this.state.mp.active = false;
    this.state.mp.role = null;
    this.state.mp.code = null;
    this.state.mp.connected = false;
    this.state.mp.friendId = -1;
    this._updateMenuMpUi();
  };

  Engine.prototype._sendLobbySync = function () {
    var st = this.state;
    if (!st.mp.active || st.mp.role !== 'host' || !Net.connected) return;
    var rawName = (this._dom.playerNameInput.value || '').trim();
    var hostName = rawName.length > 0 ? rawName.slice(0, 16) : 'Noyau-01';
    Net.send({
      t: 'lobby',
      worldId: st.worldId,
      gameMode: st.gameMode,
      difficulty: st.difficulty,
      friendRelation: st.friendRelation,
      hostName: hostName
    });
  };

  Engine.prototype._updateMenuMpUi = function () {
    var st = this.state;
    var dom = this._dom;
    var mp = st.mp;

    dom.mpIdle.classList.toggle('hidden', mp.active);
    dom.mpHostPanel.classList.toggle('hidden', !(mp.active && mp.role === 'host'));
    dom.mpGuestPanel.classList.toggle('hidden', !(mp.active && mp.role === 'guest'));

    if (mp.active && mp.role === 'host') {
      dom.mpCodeText.textContent = mp.code || '----';
      dom.mpHostStatus.textContent = mp.connected
        ? '🟢 ' + mp.friendName + ' connecté !'
        : '⏳ En attente d\'un ami...';
      dom.mpFriendRelRow.classList.toggle('hidden', st.gameMode !== 'teams');
    } else if (mp.active && mp.role === 'guest') {
      dom.mpGuestStatus.textContent = '🟢 Connecté au salon ' + (mp.code || '');
    }

    var isGuest = mp.active && mp.role === 'guest';
    for (var i = 0; i < dom.worldPills.length; i++) dom.worldPills[i].disabled = isGuest;
    for (var j = 0; j < dom.modePills.length; j++) dom.modePills[j].disabled = isGuest;
    for (var k = 0; k < dom.diffPills.length; k++) dom.diffPills[k].disabled = isGuest;

    dom.btnPlay.disabled = isGuest;
    dom.btnPlay.textContent = isGuest ? 'EN ATTENTE DE L\'HÔTE...' : 'LANCER LA PARTIE';
    dom.btnReplay.classList.toggle('hidden', isGuest);
    dom.btnRestartPause.classList.toggle('hidden', isGuest);
    dom.btnSpectateReplay.classList.toggle('hidden', isGuest);
  };

  Engine.prototype._setupNetHandlers = function () {
    var self = this;
    Net.setHandlers({
      onOpen: function () {
        if (self.state.mp.role === 'host') {
          self.state.mp.connected = true;
          self._sendLobbySync();
          self._updateMenuMpUi();
        }
      },
      onData: function (msg) {
        self._handleNetData(msg);
      },
      onClose: function () {
        var wasPlaying = self.state.mode !== 'MENU';
        self.state.mp.connected = false;
        if (self.state.mp.role === 'guest') {
          self._leaveMultiplayer();
          self._setMpError('L\'hôte a fermé le salon.');
          if (wasPlaying) {
            self.initMatch(true);
            self.setMode('MENU');
          }
        } else if (self.state.mp.role === 'host') {
          self.state.mp.friendName = 'Ami';
          if (self.state.mp.friendId >= 0 && self.state.nuclei[self.state.mp.friendId]) {
            self.state.nuclei[self.state.mp.friendId].isRemotePlayer = false;
            self.state.nuclei[self.state.mp.friendId].isFriend = false;
          }
          self._updateMenuMpUi();
        }
      },
      onError: function () {}
    });
  };

  Engine.prototype._handleNetData = function (msg) {
    var st = this.state;
    if (!msg || !msg.t) return;

    if (st.mp.role === 'host') {
      if (msg.t === 'hello') {
        st.mp.friendName = (msg.name || 'Ami').slice(0, 16);
        if (typeof msg.hue === 'number') st.mp.friendHue = msg.hue;
        st.mp.connected = true;
        this._updateMenuMpUi();
      } else if (msg.t === 'in') {
        var gi = st.mp.guestInput;
        gi.ang = msg.ang || 0;
        gi.move = msg.move || 0;
        gi.aimX = msg.aimX || 0;
        gi.aimY = msg.aimY || 0;
        gi.stance = msg.stance || 'ORBIT';
        if (msg.dash) gi.wantDash = true;
      }
      return;
    }

    // Guest side message handlers
    if (msg.t === 'lobby') {
      st.mp.friendName = msg.hostName || 'Hôte';
      var wMeta = Worlds.getWorldMeta(msg.worldId);
      var mLabel = msg.gameMode === 'teams'
        ? 'Équipes (' + (msg.friendRelation === 'ally' ? 'Même équipe' : 'Adversaires') + ')'
        : 'Solo';
      if (this._dom.mpGuestLobbyInfo) {
        this._dom.mpGuestLobbyInfo.textContent =
          'Hôte : ' + st.mp.friendName + ' • Monde : ' + wMeta.name + ' • ' + mLabel;
      }
      // Preview host's selected world on menu background
      if (st.mode === 'MENU' && msg.worldId !== st.worldId) {
        st.worldId = msg.worldId;
        st.gameMode = msg.gameMode;
        this.initMatch(true);
      }
    } else if (msg.t === 'start') {
      this._startGuestMatch(msg);
    } else if (msg.t === 'snap') {
      this._applyHostSnapshot(msg);
    } else if (msg.t === 'guest_dead') {
      if (st.mode === 'PLAYING') {
        this._finishMatch(false, msg.killerName || 'Ennemi', msg.rank);
      }
    } else if (msg.t === 'end') {
      if (st.mode === 'PLAYING' || st.mode === 'SPECTATING') {
        if (msg.victory) {
          this._finishMatch(true, '', 1);
        }
      }
    }
  };

  Engine.prototype._updateMuteButton = function (muted) {
    if (this._dom.btnMute) {
      this._dom.btnMute.textContent = muted ? '🔇' : '🔊';
      this._dom.btnMute.title = muted ? 'Activer le son (M)' : 'Couper le son (M)';
    }
  };

  Engine.prototype._startMatchFromMenu = function () {
    var rawName = (this._dom.playerNameInput.value || '').trim();
    this.state.playerName = rawName.length > 0 ? rawName.slice(0, 16) : 'Noyau-01';
    this.initMatch(false);
    this.setMode('PLAYING');
  };

  Engine.prototype.setMode = function (mode) {
    this.state.mode = mode;
    var dom = this._dom;

    dom.menuModal.classList.toggle('hidden', mode !== 'MENU');
    dom.pauseModal.classList.toggle('hidden', mode !== 'PAUSED');
    dom.endModal.classList.toggle('hidden', mode !== 'VICTORY' && mode !== 'DEFEAT');
    dom.hudRoot.classList.toggle('hidden', mode === 'MENU');
    dom.spectateBar.classList.toggle('hidden', mode !== 'SPECTATING');

    if (mode === 'PLAYING') {
      this.input.lmbDown = false;
      this.input.rmbDown = false;
      this.input.keys = {};
      document.body.classList.add('in-game');
    } else {
      document.body.classList.remove('in-game');
    }
  };

  Engine.prototype._findUnblockedSpawn = function (world, minR, maxR, angleMin, angleMax, nucleiList, margin, avoidEnemyOf) {
    var sx = 0;
    var sy = 0;
    for (var tries = 0; tries < 36; tries++) {
      var u = Math.random();
      var r = minR + Math.sqrt(u) * Math.max(40, maxR - minR);
      var a = angleMin + Math.random() * (angleMax - angleMin);
      sx = Math.cos(a) * r;
      sy = Math.sin(a) * r;

      if (Worlds.isBlocked(world, sx, sy, margin)) continue;

      if (avoidEnemyOf && (avoidEnemyOf.team === -1 || avoidEnemyOf.team !== undefined)) {
        var pdx = sx - avoidEnemyOf.x;
        var pdy = sy - avoidEnemyOf.y;
        if (pdx * pdx + pdy * pdy < Config.MIN_PLAYER_SPAWN_CLEARANCE * Config.MIN_PLAYER_SPAWN_CLEARANCE) {
          continue;
        }
      }

      var tooClose = false;
      for (var k = 0; k < nucleiList.length; k++) {
        var other = nucleiList[k];
        var odx = sx - other.x;
        var ody = sy - other.y;
        if (odx * odx + ody * ody < 210 * 210) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) break;
    }
    return { x: sx, y: sy };
  };

  Engine.prototype.initMatch = function (attractMode, customSeed) {
    var st = this.state;
    var seed = customSeed !== undefined ? customSeed : ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    st.worldSeed = seed;
    st.world = Worlds.generate(st.worldId, seed);
    st.nuclei = [];
    st.electrons.reset();
    st.spatial.clear();
    st.zone.reset(st.world);
    st.killFeed = [];
    st.elapsedTime = 0;
    st.ambientTimer = 0;
    st.spectateTarget = null;
    st.leaderId = -1;
    st.mp.friendId = -1;
    st.mp.pendingEvents = [];
    st.mp.sendAccum = 0;
    st.mp.guestSendAccum = 0;
    st.mp.ambTick = 0;

    // Reset FX
    var i;
    for (i = 0; i < st.fx.sparks.length; i++) st.fx.sparks[i].active = false;
    for (i = 0; i < st.fx.shockwaves.length; i++) st.fx.shockwaves[i].active = false;
    for (i = 0; i < st.fx.drainBeams.length; i++) st.fx.drainBeams[i].active = false;
    for (i = 0; i < st.fx.floatingTexts.length; i++) st.fx.floatingTexts[i].active = false;

    // Reset ambient particles
    for (i = 0; i < st.ambient.length; i++) st.ambient[i].active = false;

    var isTeamMode = st.gameMode === 'teams';
    var isHostMp = !attractMode && st.mp.active && st.mp.role === 'host' && st.mp.connected;
    var player = null;
    var guestNuc = null;
    var idCounter = 0;

    // Spawn Host/Solo Player (if not attract mode)
    if (!attractMode) {
      var pTeam = isTeamMode ? st.playerTeam : -1;
      var pHue = isTeamMode ? Config.TEAMS[pTeam].hue : st.playerHue;
      var pAngMin = isTeamMode ? pTeam * ((Math.PI * 2) / 3) - 0.7 : 0;
      var pAngMax = isTeamMode ? pTeam * ((Math.PI * 2) / 3) + 0.7 : Math.PI * 2;
      var pPos = this._findUnblockedSpawn(
        st.world,
        420,
        Config.ARENA_RADIUS * 0.65,
        pAngMin,
        pAngMax,
        st.nuclei,
        46,
        null
      );
      player = Entities.createNucleus(
        idCounter++,
        st.playerName,
        pPos.x,
        pPos.y,
        pHue,
        true,
        'PLAYER',
        pTeam
      );
      st.nuclei.push(player);
      st.player = player;
      this.renderer.camX = player.x;
      this.renderer.camY = player.y;
      this.renderer.zoom = 0.92;
    } else {
      st.player = null;
      this.renderer.camX = 0;
      this.renderer.camY = 0;
      this.renderer.zoom = 0.72;
    }

    // Spawn Connected Friend (Guest) if Host in Multiplayer
    if (isHostMp) {
      var gTeam = -1;
      var gHue = st.mp.friendHue;
      if (isTeamMode) {
        gTeam = st.friendRelation === 'ally' ? player.team : (player.team + 1) % 3;
        gHue = Config.TEAMS[gTeam].hue;
      } else if (Math.abs(gHue - player.hue) < 18) {
        gHue = (gHue + 54) % 360;
      }
      var gAngMin = isTeamMode ? gTeam * ((Math.PI * 2) / 3) - 0.7 : 0;
      var gAngMax = isTeamMode ? gTeam * ((Math.PI * 2) / 3) + 0.7 : Math.PI * 2;
      var gPos = this._findUnblockedSpawn(
        st.world,
        420,
        Config.ARENA_RADIUS * 0.65,
        gAngMin,
        gAngMax,
        st.nuclei,
        46,
        isTeamMode && gTeam === player.team ? null : player
      );
      guestNuc = Entities.createNucleus(
        idCounter++,
        st.mp.friendName || 'Ami',
        gPos.x,
        gPos.y,
        gHue,
        false,
        'PLAYER',
        gTeam
      );
      guestNuc.isRemotePlayer = true;
      guestNuc.isFriend = true;
      st.mp.friendId = guestNuc.id;
      st.nuclei.push(guestNuc);
    }

    // Build team assignments for AIs (17 per team total across 51 combatants)
    var aiCount = isHostMp ? Config.AI_COUNT - 1 : Config.AI_COUNT;
    var aiTeams = [];
    if (isTeamMode) {
      var teamQuota = [17, 17, 17];
      if (!attractMode && player) teamQuota[player.team]--;
      if (isHostMp && guestNuc) teamQuota[guestNuc.team]--;
      if (attractMode) teamQuota[2] = 16; // 50 AIs total in attract mode

      for (var tIdx = 0; tIdx < 3; tIdx++) {
        for (var q = 0; q < teamQuota[tIdx]; q++) {
          aiTeams.push(tIdx);
        }
      }
      aiTeams = shuffleArray(aiTeams);
    }

    // Spawn AIs with well-distributed unblocked positions
    var names = shuffleArray(Config.AI_NAMES);
    for (i = 0; i < aiCount; i++) {
      var aiTeam = isTeamMode ? aiTeams[i % aiTeams.length] : -1;
      var aMin = isTeamMode ? aiTeam * ((Math.PI * 2) / 3) - 0.95 : 0;
      var aMax = isTeamMode ? aiTeam * ((Math.PI * 2) / 3) + 0.95 : Math.PI * 2;
      var minR = isTeamMode ? 350 : 120;
      var maxR = Config.ARENA_RADIUS - 240;

      var avoidRef = null;
      if (player && (!isTeamMode || aiTeam !== player.team)) {
        avoidRef = player;
      }
      var aiPos = this._findUnblockedSpawn(st.world, minR, maxR, aMin, aMax, st.nuclei, 42, avoidRef);

      var hue = isTeamMode ? Config.TEAMS[aiTeam].hue : Config.NEON_HUES[(i + 3) % Config.NEON_HUES.length];
      if (!isTeamMode && player && Math.abs(hue - player.hue) < 16) {
        hue = (hue + 48) % 360;
      }
      var ai = Entities.createNucleus(
        idCounter++,
        names[i % names.length],
        aiPos.x,
        aiPos.y,
        hue,
        false,
        AI.pickRandomPersonality(),
        aiTeam
      );
      st.nuclei.push(ai);
    }

    st.totalCount = st.nuclei.length;
    st.aliveCount = st.nuclei.length;

    // Seed initial orbiting electrons for every nucleus
    var startElectrons = Config.START_ELECTRONS;
    for (i = 0; i < st.nuclei.length; i++) {
      var nuc = st.nuclei[i];
      for (var e = 0; e < startElectrons; e++) {
        var shell = e % 2;
        var ang = (e / startElectrons) * Math.PI * 2 + Math.random() * 0.2;
        var rad = nuc.orbitRadius * (0.72 + shell * 0.22);
        var ex = nuc.x + Math.cos(ang) * rad;
        var ey = nuc.y + Math.sin(ang) * rad;
        var eIdx = st.electrons.spawn(nuc, ex, ey, 0, 0, shell, ang, shell === 1 ? -1 : 1);
        if (eIdx !== -1) Worlds.resolveElectron(st.world, st.electrons, eIdx);
      }
    }

    // Seed ambient particles
    this._maintainAmbient(Config.AMBIENT_TARGET_BASE);

    if (isHostMp) {
      var metaList = [];
      for (i = 0; i < st.nuclei.length; i++) {
        var mn = st.nuclei[i];
        metaList.push({
          id: mn.id,
          name: mn.name,
          x: Math.round(mn.x),
          y: Math.round(mn.y),
          hue: mn.hue,
          team: mn.team
        });
      }
      Net.send({
        t: 'start',
        worldId: st.worldId,
        seed: seed,
        gameMode: st.gameMode,
        difficulty: st.difficulty,
        hostId: player.id,
        guestId: guestNuc.id,
        nucleiMeta: metaList
      });
    }

    if (attractMode) {
      this.setMode('MENU');
    } else {
      this._refreshHud();
    }
  };

  Engine.prototype._maintainAmbient = function (targetOverride) {
    var st = this.state;
    var zone = st.zone;
    var ratio = zone.radius / Config.ARENA_RADIUS;
    var target =
      targetOverride !== undefined
        ? targetOverride
        : Math.max(Config.AMBIENT_TARGET_MIN, Math.round(Config.AMBIENT_TARGET_BASE * ratio * ratio));

    var activeCount = 0;
    var ambient = st.ambient;
    var rSafe = Math.max(80, zone.radius - 60);

    for (var i = 0; i < ambient.length; i++) {
      if (ambient[i].active) {
        var dx = ambient[i].x - zone.x;
        var dy = ambient[i].y - zone.y;
        if (dx * dx + dy * dy > zone.radius * zone.radius) {
          ambient[i].active = false;
        } else {
          activeCount++;
        }
      }
    }

    var toSpawn = Math.min(18, target - activeCount);
    if (targetOverride !== undefined) toSpawn = target - activeCount;

    for (var j = 0; j < ambient.length && toSpawn > 0; j++) {
      if (ambient[j].active) continue;
      var part = ambient[j];
      var px = 0;
      var py = 0;
      var placed = false;
      for (var tries = 0; tries < 10; tries++) {
        var a = Math.random() * Math.PI * 2;
        var d = Math.sqrt(Math.random()) * rSafe;
        px = zone.x + Math.cos(a) * d;
        py = zone.y + Math.sin(a) * d;
        if (!Worlds.isBlocked(st.world, px, py, 22)) {
          placed = true;
          break;
        }
      }
      if (!placed) continue;

      var isCluster = Math.random() < 0.085;
      part.active = true;
      part.x = px;
      part.y = py;
      part.vx = (Math.random() - 0.5) * 7;
      part.vy = (Math.random() - 0.5) * 7;
      part.isCluster = isCluster;
      part.energy = isCluster ? 1.1 : 0.32;
      part.radius = isCluster ? 9 : 4.5;
      part.hue = isCluster ? 44 : Config.NEON_HUES[Math.floor(Math.random() * Config.NEON_HUES.length)];
      part.pulsePhase = Math.random() * Math.PI * 2;
      toSpawn--;
    }
  };

  Engine.prototype._triggerPlayerDash = function () {
    var st = this.state;
    var p = st.player;
    if (!p || !p.alive) return;
    if (p.dashCd > 0 || p.electronCount < Config.DASH_MIN_ELECTRONS) return;

    if (st.mp.active && st.mp.role === 'guest') {
      this._sendGuestInput(true);
      Audio.playDash();
      return;
    }

    var worldAim = this.renderer.screenToWorld(this.input.mouseX, this.input.mouseY);
    var dx = worldAim.x - p.x;
    var dy = worldAim.y - p.y;
    var len = Math.sqrt(dx * dx + dy * dy);
    var dirX = len > 8 ? dx / len : Math.cos(p.targetAngle);
    var dirY = len > 8 ? dy / len : Math.sin(p.targetAngle);

    this._performDash(p, dirX, dirY);
  };

  Engine.prototype._performDash = function (nuc, dirX, dirY) {
    if (nuc.dashCd > 0 || nuc.electronCount < Config.DASH_MIN_ELECTRONS) return;
    nuc.dashTimer = Config.DASH_DURATION;
    nuc.dashCd = Config.DASH_COOLDOWN;
    nuc.dashDirX = dirX;
    nuc.dashDirY = dirY;

    var cost = Math.max(
      Config.DASH_COST_MIN,
      Math.min(Config.DASH_COST_MAX, Math.floor(nuc.electronCount * Config.DASH_COST_RATIO))
    );

    // Sacrifice trailing electrons as glowing exhaust
    var pool = this.state.electrons;
    var removed = 0;
    for (var i = 0; i < pool.highWater && removed < cost; i++) {
      if (pool.active[i] && pool.ownerId[i] === nuc.id) {
        var sx = pool.x[i];
        var sy = pool.y[i];
        pool.despawn(i, this.state.nuclei);
        Entities.spawnSpark(
          this.state.fx,
          sx,
          sy,
          -dirX * 140 + (Math.random() - 0.5) * 80,
          -dirY * 140 + (Math.random() - 0.5) * 80,
          3.2,
          nuc.hue,
          0.35,
          0.6
        );
        removed++;
      }
    }

    Entities.spawnShockwave(this.state.fx, nuc.x, nuc.y, nuc.radius, nuc.radius * 2.8, nuc.hue, 0.28, 2.5, false);
    if (nuc.isPlayer) {
      Audio.playDash();
    } else if (nuc.isRemotePlayer && this.state.mp.active) {
      this.state.mp.pendingEvents.push({
        k: 'dash',
        x: Math.round(nuc.x),
        y: Math.round(nuc.y),
        r: Math.round(nuc.radius),
        hue: nuc.hue
      });
    }
  };

  Engine.prototype._loop = function (now) {
    var self = this;
    requestAnimationFrame(function (ts) {
      self._loop(ts);
    });

    if (!this.lastFrameTime) this.lastFrameTime = now;
    var dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrameTime) / 1000));
    this.lastFrameTime = now;

    if (this.state.mode !== 'PAUSED' || this.state.mp.active) {
      this._step(dt);
    }

    this.renderer.render(this.state, dt, this.input);

    if (this.state.mode !== 'MENU' && this.minimapCtx) {
      this.renderer.renderMinimap(this.minimapCtx, this.state);
    }

    this.hudAccum += dt;
    if (this.hudAccum >= 0.08 && this.state.mode !== 'MENU') {
      this.hudAccum = 0;
      this._refreshHud();
    }
  };

  Engine.prototype._step = function (dt) {
    var st = this.state;
    if (st.mp.active && st.mp.role === 'guest') {
      this._stepGuest(dt);
      return;
    }

    var nuclei = st.nuclei;
    var pool = st.electrons;
    var spatial = st.spatial;
    var fx = st.fx;
    var i, j;

    st.elapsedTime += dt;

    // 1. Update Zone
    var self = this;
    st.zone.update(dt, st.aliveCount, nuclei, pool, fx, Audio, function (killer, victim) {
      self._absorbNucleus(killer, victim);
    });

    // 2. Maintain ambient particles
    st.ambientTimer += dt;
    if (st.ambientTimer >= 0.4) {
      st.ambientTimer = 0;
      this._maintainAmbient();
    }

    // 3. Player input -> player nucleus
    var worldAim = this.renderer.screenToWorld(this.input.mouseX, this.input.mouseY);
    this.input.mouseWorldX = worldAim.x;
    this.input.mouseWorldY = worldAim.y;

    var player = st.player;
    if (player && player.alive && st.mode === 'PLAYING') {
      var pdx = worldAim.x - player.x;
      var pdy = worldAim.y - player.y;
      var pDist = Math.sqrt(pdx * pdx + pdy * pdy);

      if (pDist > 12) {
        player.targetAngle = Math.atan2(pdy, pdx);
        player.moveIntensity = Math.min(1, (pDist - 12) / 110);
      } else {
        player.moveIntensity = 0;
      }

      player.aimX = worldAim.x;
      player.aimY = worldAim.y;

      var wantShield = this.input.rmbDown || this.input.keys.KeyE || this.input.keys.KeyS;
      var wantAssault = this.input.lmbDown || this.input.keys.KeyA || this.input.keys.KeyQ;

      if (wantShield) player.stance = 'SHIELD';
      else if (wantAssault) player.stance = 'ASSAULT';
      else player.stance = 'ORBIT';
    }

    // 4. AI decisions
    AI.update(dt, nuclei, st.ambient, st.zone, st.difficulty, st.world);

    // 5. Update all alive nuclei
    var leader = null;
    for (i = 0; i < nuclei.length; i++) {
      var nuc = nuclei[i];
      if (!nuc.alive) continue;

      nuc.timeAlive += dt;
      if (nuc.dashCd > 0) nuc.dashCd = Math.max(0, nuc.dashCd - dt);
      if (nuc.underSiegeTimer > 0) nuc.underSiegeTimer = Math.max(0, nuc.underSiegeTimer - dt);
      if (nuc.hitFlash > 0) nuc.hitFlash = Math.max(0, nuc.hitFlash - dt * 5);

      if (nuc.isRemotePlayer) {
        var gi = st.mp.guestInput;
        nuc.targetAngle = gi.ang;
        nuc.moveIntensity = gi.move;
        nuc.stance = gi.stance;
        nuc.aimX = gi.aimX;
        nuc.aimY = gi.aimY;
        if (gi.wantDash) {
          gi.wantDash = false;
          var ddx = nuc.aimX - nuc.x;
          var ddy = nuc.aimY - nuc.y;
          var dLen = Math.sqrt(ddx * ddx + ddy * ddy);
          var dirX = dLen > 8 ? ddx / dLen : Math.cos(nuc.targetAngle);
          var dirY = dLen > 8 ? ddy / dLen : Math.sin(nuc.targetAngle);
          this._performDash(nuc, dirX, dirY);
        }
      } else if (!nuc.isPlayer) {
        var aiSt = nuc.aiState;
        nuc.stance = aiSt.desiredStance;
        nuc.aimX = aiSt.aimX;
        nuc.aimY = aiSt.aimY;
        if (aiSt.wantDash) {
          aiSt.wantDash = false;
          this._performDash(nuc, aiSt.moveX, aiSt.moveY);
        }
      }

      // Compute velocity
      var speed = nuc.moveSpeed;
      if (nuc.stance === 'SHIELD') speed *= Config.SHIELD_SPEED_MULT;

      if (nuc.dashTimer > 0) {
        nuc.dashTimer = Math.max(0, nuc.dashTimer - dt);
        var dashSpd = nuc.moveSpeed * Config.DASH_SPEED_MULT;
        nuc.vx = nuc.dashDirX * dashSpd;
        nuc.vy = nuc.dashDirY * dashSpd;
        if (Math.random() < 0.6) {
          Entities.spawnSpark(fx, nuc.x, nuc.y, -nuc.vx * 0.25, -nuc.vy * 0.25, 2.5, nuc.hue, 0.22, 0.5);
        }
      } else {
        var desiredVx = 0;
        var desiredVy = 0;
        if (nuc.isPlayer || nuc.isRemotePlayer) {
          desiredVx = Math.cos(nuc.targetAngle) * speed * nuc.moveIntensity;
          desiredVy = Math.sin(nuc.targetAngle) * speed * nuc.moveIntensity;
        } else {
          desiredVx = nuc.aiState.moveX * speed;
          desiredVy = nuc.aiState.moveY * speed;
        }
        var accel = 1 - Math.exp(-6.5 * dt);
        nuc.vx += (desiredVx - nuc.vx) * accel;
        nuc.vy += (desiredVy - nuc.vy) * accel;
      }

      nuc.x += nuc.vx * dt;
      nuc.y += nuc.vy * dt;

      // Clamp inside ARENA_RADIUS
      var distSq = nuc.x * nuc.x + nuc.y * nuc.y;
      var maxR = Config.ARENA_RADIUS - nuc.radius;
      if (distSq > maxR * maxR) {
        var dist = Math.sqrt(distSq) || 1;
        var nx = nuc.x / dist;
        var ny = nuc.y / dist;
        nuc.x = nx * maxR;
        nuc.y = ny * maxR;
        var dot = nuc.vx * nx + nuc.vy * ny;
        if (dot > 0) {
          nuc.vx -= dot * nx * 1.4;
          nuc.vy -= dot * ny * 1.4;
        }
      }

      // Collide against world walls & pillars
      Worlds.resolveCircle(st.world, nuc, nuc.radius, 0.35);

      // Energy reactor zone boost
      var eBoost = Worlds.getEnergyBoost(st.world, nuc.x, nuc.y);
      nuc._inReactor = eBoost.inZone;
      nuc._reactorMult = eBoost.prodMult;

      // Electron production
      nuc.prodAccum += nuc.prodRate * eBoost.prodMult * dt;
      while (nuc.prodAccum >= 1 && nuc.electronCount < nuc.maxElectrons) {
        nuc.prodAccum -= 1;
        // Least populated shell (0, 1, 2)
        var sh = 0;
        if (nuc.shellCounts[1] < nuc.shellCounts[sh]) sh = 1;
        if (nuc.shellCounts[2] < nuc.shellCounts[sh]) sh = 2;
        var ang = Math.random() * Math.PI * 2;
        var spawnR = nuc.radius + 6;
        pool.spawn(
          nuc,
          nuc.x + Math.cos(ang) * spawnR,
          nuc.y + Math.sin(ang) * spawnR,
          nuc.vx * 0.5,
          nuc.vy * 0.5,
          sh,
          ang,
          sh === 1 ? -1 : 1
        );
      }
      if (nuc.electronCount >= nuc.maxElectrons && nuc.prodAccum > 1) {
        nuc.prodAccum = 1;
      }

      // Integrity regen out of combat inside safe zone
      if (
        nuc.hp < nuc.maxHp &&
        st.elapsedTime - nuc.lastDamagedTime > Config.REGEN_DELAY &&
        !st.zone.isOutside(nuc.x, nuc.y)
      ) {
        var regenMult = (nuc.stance === 'SHIELD' ? Config.SHIELD_REGEN_MULT : 1) * eBoost.regenMult;
        nuc.hp = Math.min(nuc.maxHp, nuc.hp + nuc.maxHp * Config.REGEN_RATE_RATIO * regenMult * dt);
      }

      if (!leader || nuc.power > leader.power) {
        leader = nuc;
      }
    }
    st.leaderId = leader ? leader.id : -1;

    // Nucleus-vs-Nucleus soft repulsion so electron battles stay clean around cores
    for (i = 0; i < nuclei.length; i++) {
      var a = nuclei[i];
      if (!a.alive) continue;
      for (j = i + 1; j < nuclei.length; j++) {
        var b = nuclei[j];
        if (!b.alive) continue;
        var rdx = b.x - a.x;
        var rdy = b.y - a.y;
        var minDist = a.radius + b.radius + 4;
        var rdSq = rdx * rdx + rdy * rdy;
        if (rdSq < minDist * minDist) {
          var rd = Math.sqrt(rdSq) || 0.01;
          var overlap = (minDist - rd) * 0.5;
          var ux = rdx / rd;
          var uy = rdy / rd;
          a.x -= ux * overlap;
          a.y -= uy * overlap;
          b.x += ux * overlap;
          b.y += uy * overlap;
        }
      }
      Worlds.resolveCircle(st.world, a, a.radius, 0.25);
    }

    // 6. Update electrons & build spatial hash
    this._updateElectrons(dt);

    // 7. Ambient particles attraction & pickup
    this._updateAmbient(dt);

    // 8. Electron vs Electron (Mutual 1-for-1 annihilation)
    this._resolveElectronCollisions();

    // 9. Electron vs Enemy Nucleus (Siege & Absorption)
    this._resolveNucleusHits();

    // 10. Update FX pools
    this._updateFx(dt);

    // 11. Broadcast snapshot if Host in multiplayer
    if (st.mp.active && st.mp.role === 'host' && st.mp.connected) {
      this._broadcastHostSnapshot(dt);
    }
  };

  Engine.prototype._updateElectrons = function (dt) {
    var st = this.state;
    var pool = st.electrons;
    var nuclei = st.nuclei;
    var spatial = st.spatial;

    var high = pool.highWater;
    var active = pool.active;
    var oid = pool.ownerId;
    var shell = pool.shell;
    var px = pool.x;
    var py = pool.y;
    var prevX = pool.prevX;
    var prevY = pool.prevY;
    var vx = pool.vx;
    var vy = pool.vy;
    var orbitAngle = pool.orbitAngle;
    var orbitDir = pool.orbitDir;
    var speedFactor = pool.speedFactor;
    var phase = pool.phase;
    var time = st.elapsedTime;

    // Precompute nearest nearby enemy per alive nucleus for local auto-aggression in ORBIT mode,
    // and collect shielding nuclei for smart electron interception
    var nLen = nuclei.length;
    if (this._nearestEnemy.length < nLen) {
      this._nearestEnemy = new Int16Array(nLen);
    }
    var nearestEnemy = this._nearestEnemy;
    var shieldingList = this._shieldingList;
    shieldingList.length = 0;

    for (var k = 0; k < nLen; k++) {
      var owner = nuclei[k];
      nearestEnemy[k] = -1;
      owner.shieldThreatActive = false;
      owner._threatCount = 0;
      owner._shieldSlot = 0;
      if (!owner.alive) continue;

      if (owner.stance === 'SHIELD') {
        shieldingList.push(owner);
      }

      if (owner.stance !== 'ORBIT') continue;
      var bestD = Infinity;
      var maxAutoR = owner.orbitRadius * 1.45;
      for (var m = 0; m < nLen; m++) {
        if (m === k) continue;
        var other = nuclei[m];
        if (!other.alive || Entities.areAllies(owner, other)) continue;
        var ddx = other.x - owner.x;
        var ddy = other.y - owner.y;
        var reachLimit = maxAutoR + other.radius;
        var dSq = ddx * ddx + ddy * ddy;
        if (dSq < reachLimit * reachLimit && dSq < bestD) {
          bestD = dSq;
          nearestEnemy[k] = m;
        }
      }
    }

    // Smart Shield Threat Scan BEFORE spatial.clear() using spatial grid from previous tick
    var sLen = shieldingList.length;
    if (sLen > 0) {
      var sHead = spatial.head;
      var sNext = spatial.next;
      var sDim = spatial.gridDim;

      for (var si = 0; si < sLen; si++) {
        var sNuc = shieldingList[si];
        var senseR = sNuc.orbitRadius * 1.65 + 85;
        var senseRSq = senseR * senseR;
        var minGx = spatial.getCellX(sNuc.x - senseR);
        var maxGx = spatial.getCellX(sNuc.x + senseR);
        var minGy = spatial.getCellY(sNuc.y - senseR);
        var maxGy = spatial.getCellY(sNuc.y + senseR);

        for (var sgy = minGy; sgy <= maxGy; sgy++) {
          var rowOff = sgy * sDim;
          for (var sgx = minGx; sgx <= maxGx; sgx++) {
            var se = sHead[rowOff + sgx];
            while (se !== -1) {
              if (active[se]) {
                var eOwnerId = oid[se];
                if (eOwnerId !== sNuc.id && !Entities.areAllies(sNuc, nuclei[eOwnerId])) {
                  var sx = px[se];
                  var sy = py[se];
                  var sdx = sx - sNuc.x;
                  var sdy = sy - sNuc.y;
                  var sdSq = sdx * sdx + sdy * sdy;
                  if (sdSq < senseRSq) {
                    var cnt = sNuc._threatCount;
                    if (cnt < 16 || sdSq < sNuc._threatDSq[15]) {
                      var pos = cnt < 16 ? cnt++ : 15;
                      while (pos > 0 && sNuc._threatDSq[pos - 1] > sdSq) {
                        sNuc._threatDSq[pos] = sNuc._threatDSq[pos - 1];
                        sNuc._threatX[pos] = sNuc._threatX[pos - 1];
                        sNuc._threatY[pos] = sNuc._threatY[pos - 1];
                        pos--;
                      }
                      sNuc._threatDSq[pos] = sdSq;
                      sNuc._threatX[pos] = sx;
                      sNuc._threatY[pos] = sy;
                      sNuc._threatCount = cnt;
                    }
                  }
                }
              }
              se = sNext[se];
            }
          }
        }

        var tCount = sNuc._threatCount;
        if (tCount > 0) {
          var sumX = 0;
          var sumY = 0;
          for (var ti = 0; ti < tCount; ti++) {
            var td = Math.sqrt(sNuc._threatDSq[ti]) || 1;
            var w = 1 / (td + 20);
            sumX += ((sNuc._threatX[ti] - sNuc.x) / td) * w;
            sumY += ((sNuc._threatY[ti] - sNuc.y) / td) * w;
          }
          sNuc.shieldThreatAngle = Math.atan2(sumY, sumX);
          sNuc.shieldThreatActive = true;
        } else {
          // Fallback: aim shield phalanx at closest nearby enemy nucleus
          var bestEnD = Infinity;
          var maxEnR = sNuc.orbitRadius * 2.6 + 220;
          var maxEnRSq = maxEnR * maxEnR;
          for (var ei = 0; ei < nLen; ei++) {
            var en = nuclei[ei];
            if (!en.alive || en.id === sNuc.id || Entities.areAllies(sNuc, en)) continue;
            var edx = en.x - sNuc.x;
            var edy = en.y - sNuc.y;
            var edSq = edx * edx + edy * edy;
            if (edSq < maxEnRSq && edSq < bestEnD) {
              bestEnD = edSq;
              sNuc.shieldThreatAngle = Math.atan2(edy, edx);
              sNuc.shieldThreatActive = true;
            }
          }
        }
      }
    }

    spatial.clear();

    for (var i = 0; i < high; i++) {
      if (!active[i]) continue;
      var owIdx = oid[i];
      var ow = nuclei[owIdx];
      if (!ow || !ow.alive) {
        pool.despawn(i, nuclei);
        continue;
      }

      prevX[i] = px[i];
      prevY[i] = py[i];

      var sh = shell[i];
      var dir = orbitDir[i];
      var angVel = (ow.stance === 'SHIELD' ? 2.1 : 1.2 - sh * 0.18) * speedFactor[i] * dir;
      orbitAngle[i] += angVel * dt;
      var ang = orbitAngle[i];

      var tx, ty;
      var maxSpeed = ow.moveSpeed + 170;
      var steerRate = 6.0;

      if (ow.stance === 'SHIELD') {
        var slot = ow._shieldSlot++;
        var totalE = Math.max(1, ow.electronCount);
        var threatCount = ow._threatCount;
        var maxIntercept = Math.min(threatCount, Math.ceil(totalE * 0.65));

        if (threatCount > 0 && slot < maxIntercept) {
          // Active intercept: step directly into incoming enemy electron's path
          var thX = ow._threatX[slot];
          var thY = ow._threatY[slot];
          var thDist = Math.sqrt(ow._threatDSq[slot]) || 1;
          var interceptDist = Math.min(thDist * 0.92, ow.orbitRadius * 1.15);
          tx = ow.x + ((thX - ow.x) / thDist) * interceptDist;
          ty = ow.y + ((thY - ow.y) / thDist) * interceptDist;
          steerRate = 11.0;
          maxSpeed = ow.moveSpeed + 275;
        } else if (ow.shieldThreatActive) {
          // Directional phalanx arc (80% front threat side, 20% rear guard)
          if (slot % 5 === 0) {
            var rearAngle = ow.shieldThreatAngle + Math.PI + Math.sin(ang * 0.9 + phase[i]) * 1.25;
            var rearR = ow.orbitRadius * 0.54;
            tx = ow.x + Math.cos(rearAngle) * rearR;
            ty = ow.y + Math.sin(rearAngle) * rearR;
          } else {
            var frontAngle = ow.shieldThreatAngle + Math.sin(ang * 1.1 + phase[i]) * 1.15;
            var frontR = ow.orbitRadius * 0.56;
            tx = ow.x + Math.cos(frontAngle) * frontR;
            ty = ow.y + Math.sin(frontAngle) * frontR;
          }
          steerRate = 9.5;
          maxSpeed = ow.moveSpeed + 250;
        } else {
          var sr = ow.orbitRadius * Config.SHIELD_ORBIT_MULT * (0.9 + sh * 0.08);
          tx = ow.x + Math.cos(ang) * sr;
          ty = ow.y + Math.sin(ang) * sr;
          steerRate = 8.8;
          maxSpeed = ow.moveSpeed + 230;
        }
      } else if (ow.stance === 'ASSAULT') {
        var adx = ow.aimX - ow.x;
        var ady = ow.aimY - ow.y;
        var aLen = Math.sqrt(adx * adx + ady * ady) || 1;
        var maxProj = ow.orbitRadius * Config.ASSAULT_REACH_MULT;
        var projDist = Math.min(aLen, maxProj);
        var cx = ow.x + (adx / aLen) * projDist;
        var cy = ow.y + (ady / aLen) * projDist;

        // Swirl around assault focal point with subtle forward lance spread
        var swirlR = (18 + sh * 14) + Math.sin(time * 6 + phase[i]) * 8;
        tx = cx + Math.cos(ang * 1.4) * swirlR;
        ty = cy + Math.sin(ang * 1.4) * swirlR;
        steerRate = 7.5;
        maxSpeed = ow.moveSpeed + 250;
      } else {
        // ORBIT mode with local auto-aggression on facing side
        var orbitR = ow.orbitRadius * (0.72 + sh * 0.22) + Math.sin(time * 3 + phase[i]) * 4;
        tx = ow.x + Math.cos(ang) * orbitR;
        ty = ow.y + Math.sin(ang) * orbitR;

        var enemyIdx = nearestEnemy[owIdx];
        if (enemyIdx !== -1) {
          var enemy = nuclei[enemyIdx];
          var ex = enemy.x - ow.x;
          var ey = enemy.y - ow.y;
          var eLen = Math.sqrt(ex * ex + ey * ey) || 1;
          var dot = ((px[i] - ow.x) * ex + (py[i] - ow.y) * ey) / eLen;
          if (dot > -ow.radius * 0.35) {
            tx = enemy.x + Math.cos(ang) * (enemy.radius * 0.4);
            ty = enemy.y + Math.sin(ang) * (enemy.radius * 0.4);
            steerRate = 7.0;
            maxSpeed = ow.moveSpeed + 205;
          }
        }
      }

      var dx = tx - px[i];
      var dy = ty - py[i];
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.5) {
        var desiredVx = (dx / dist) * Math.min(maxSpeed, dist * steerRate) + ow.vx * 0.35;
        var desiredVy = (dy / dist) * Math.min(maxSpeed, dist * steerRate) + ow.vy * 0.35;
        var blend = 1 - Math.exp(-7 * dt);
        vx[i] += (desiredVx - vx[i]) * blend;
        vy[i] += (desiredVy - vy[i]) * blend;
      }

      px[i] += vx[i] * dt;
      py[i] += vy[i] * dt;

      // Soft tether if electron gets stretched way too far
      var tdx = px[i] - ow.x;
      var tdy = py[i] - ow.y;
      var maxTether = ow.orbitRadius * (Config.ASSAULT_REACH_MULT + 0.45);
      var tdSq = tdx * tdx + tdy * tdy;
      if (tdSq > maxTether * maxTether) {
        var td = Math.sqrt(tdSq);
        px[i] = ow.x + (tdx / td) * maxTether;
        py[i] = ow.y + (tdy / td) * maxTether;
      }

      Worlds.resolveElectron(st.world, pool, i);
      spatial.insert(i, px[i], py[i]);
    }
  };

  Engine.prototype._updateAmbient = function (dt) {
    var st = this.state;
    var ambient = st.ambient;
    var nuclei = st.nuclei;
    var spatial = st.spatial;
    var pool = st.electrons;
    var ex = pool.x;
    var ey = pool.y;
    var eActive = pool.active;
    var eOid = pool.ownerId;
    var maxR = Config.ARENA_RADIUS - 30;

    for (var i = 0; i < ambient.length; i++) {
      var p = ambient[i];
      if (!p.active) continue;

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x * p.x + p.y * p.y > maxR * maxR) {
        p.vx *= -1;
        p.vy *= -1;
      }
      if (st.world && (st.world.walls.length > 0 || st.world.pillars.length > 0)) {
        Worlds.resolveCircle(st.world, p, p.radius, 0.8);
      }

      var collector = null;
      var attractX = 0;
      var attractY = 0;

      // Check direct nucleus pickup
      for (var k = 0; k < nuclei.length; k++) {
        var nuc = nuclei[k];
        if (!nuc.alive) continue;
        var dx = nuc.x - p.x;
        var dy = nuc.y - p.y;
        var rHit = nuc.radius + p.radius + 14;
        var dSq = dx * dx + dy * dy;
        if (dSq < rHit * rHit) {
          collector = nuc;
          break;
        }
        var rPull = nuc.radius + 54;
        if (dSq < rPull * rPull) {
          attractX = dx;
          attractY = dy;
        }
      }

      // Check electron pickup via inline 3x3 spatial hash (zero closure allocation)
      if (!collector) {
        var acx = spatial.getCellX(p.x);
        var acy = spatial.getCellY(p.y);
        var aMinX = acx > 0 ? acx - 1 : 0;
        var aMaxX = acx < spatial.gridDim - 1 ? acx + 1 : spatial.gridDim - 1;
        var aMinY = acy > 0 ? acy - 1 : 0;
        var aMaxY = acy < spatial.gridDim - 1 ? acy + 1 : spatial.gridDim - 1;
        var pickRSq = (p.radius + 11) * (p.radius + 11);
        var aHead = spatial.head;
        var aNext = spatial.next;
        var aDim = spatial.gridDim;

        for (var agy = aMinY; agy <= aMaxY && !collector; agy++) {
          var aRowOff = agy * aDim;
          for (var agx = aMinX; agx <= aMaxX && !collector; agx++) {
            var eIdx = aHead[aRowOff + agx];
            while (eIdx !== -1) {
              if (eActive[eIdx]) {
                var edx = ex[eIdx] - p.x;
                var edy = ey[eIdx] - p.y;
                if (edx * edx + edy * edy < pickRSq) {
                  var ow = nuclei[eOid[eIdx]];
                  if (ow && ow.alive) {
                    collector = ow;
                    break;
                  }
                }
              }
              eIdx = aNext[eIdx];
            }
          }
        }
      }

      if (collector) {
        p.active = false;
        var prevMaxE = collector.maxElectrons;
        collector.power += p.energy;
        collector.prodAccum += p.isCluster ? Config.AMBIENT_CLUSTER_PROD_GAIN : Config.AMBIENT_PROD_GAIN;
        collector.hp = Math.min(collector.maxHp, collector.hp + (p.isCluster ? 4.5 : 1.5));
        Entities.recalcStats(collector);

        Entities.spawnSpark(
          st.fx,
          p.x,
          p.y,
          (Math.random() - 0.5) * 90,
          (Math.random() - 0.5) * 90,
          p.isCluster ? 3.5 : 2.2,
          p.hue,
          0.26,
          0.6
        );

        if (collector.isPlayer) {
          Audio.playPickup(p.isCluster);
          if (collector.maxElectrons > prevMaxE) {
            Entities.spawnFloatingText(
              st.fx,
              collector.x,
              collector.y - collector.radius - 28,
              '+1 MAX ÉLECTRON',
              '',
              '#7affd4',
              0.85,
              1.05
            );
          }
        }
      } else if (attractX !== 0 || attractY !== 0) {
        var al = Math.sqrt(attractX * attractX + attractY * attractY) || 1;
        p.x += (attractX / al) * 80 * dt;
        p.y += (attractY / al) * 80 * dt;
      }
    }
  };

  Engine.prototype._resolveElectronCollisions = function () {
    var st = this.state;
    var pool = st.electrons;
    var spatial = st.spatial;
    var nuclei = st.nuclei;
    var fx = st.fx;

    var high = pool.highWater;
    var active = pool.active;
    var oid = pool.ownerId;
    var x = pool.x;
    var y = pool.y;
    var threshSq = Config.ELECTRON_ANNIHILATE_DIST_SQ;

    var camX = this.renderer.camX;
    var camY = this.renderer.camY;
    var earRangeSq = 950 * 950;

    var head = spatial.head;
    var next = spatial.next;
    var dim = spatial.gridDim;

    for (var i = 0; i < high; i++) {
      if (!active[i]) continue;
      var ix = x[i];
      var iy = y[i];
      var iOwner = oid[i];

      var cx = spatial.getCellX(ix);
      var cy = spatial.getCellY(iy);
      var minX = cx > 0 ? cx - 1 : 0;
      var maxX = cx < dim - 1 ? cx + 1 : dim - 1;
      var minY = cy > 0 ? cy - 1 : 0;
      var maxY = cy < dim - 1 ? cy + 1 : dim - 1;

      var annihilated = false;
      for (var gy = minY; gy <= maxY && !annihilated; gy++) {
        var rowOffset = gy * dim;
        for (var gx = minX; gx <= maxX && !annihilated; gx++) {
          var j = head[rowOffset + gx];
          while (j !== -1) {
            var nextJ = next[j];
            if (j > i && active[j] && oid[j] !== iOwner && !Entities.areAllies(nuclei[iOwner], nuclei[oid[j]])) {
              var dx = x[j] - ix;
              var dy = y[j] - iy;
              if (dx * dx + dy * dy < threshSq) {
                var mx = (ix + x[j]) * 0.5;
                var my = (iy + y[j]) * 0.5;
                var h1 = nuclei[iOwner] ? nuclei[iOwner].hue : 188;
                var h2 = nuclei[oid[j]] ? nuclei[oid[j]].hue : 300;

                pool.despawn(i, nuclei);
                pool.despawn(j, nuclei);

                // Spark burst at annihilation midpoint
                for (var s = 0; s < 3; s++) {
                  var ang = Math.random() * Math.PI * 2;
                  var spd = 70 + Math.random() * 140;
                  Entities.spawnSpark(
                    fx,
                    mx,
                    my,
                    Math.cos(ang) * spd,
                    Math.sin(ang) * spd,
                    2.6,
                    s === 0 ? h1 : h2,
                    0.22,
                    0.85
                  );
                }

                var cdx = mx - camX;
                var cdy = my - camY;
                if (cdx * cdx + cdy * cdy < earRangeSq) {
                  Audio.playAnnihilate(iOwner === 0 || oid[j] === 0 ? 1.4 : 0.7);
                }

                annihilated = true;
                break;
              }
            }
            j = nextJ;
          }
        }
      }
    }
  };

  Engine.prototype._resolveNucleusHits = function () {
    var st = this.state;
    var pool = st.electrons;
    var nuclei = st.nuclei;
    var fx = st.fx;

    var high = pool.highWater;
    var active = pool.active;
    var oid = pool.ownerId;
    var x = pool.x;
    var y = pool.y;

    var camX = this.renderer.camX;
    var camY = this.renderer.camY;
    var earRangeSq = 950 * 950;
    var nLen = nuclei.length;

    for (var i = 0; i < high; i++) {
      if (!active[i]) continue;
      var ex = x[i];
      var ey = y[i];
      var attackerId = oid[i];

      for (var k = 0; k < nLen; k++) {
        var nuc = nuclei[k];
        var attacker = nuclei[attackerId];
        if (!nuc.alive || nuc.id === attackerId || Entities.areAllies(attacker, nuc)) continue;

        var dx = ex - nuc.x;
        var dy = ey - nuc.y;
        var hitR = nuc.radius + Config.ELECTRON_RADIUS;
        if (dx * dx + dy * dy < hitR * hitR) {
          pool.despawn(i, nuclei);

          var dmg = Config.ELECTRON_DAMAGE;
          if (nuc.stance === 'SHIELD') {
            dmg *= Config.SHIELD_DAMAGE_MULT;
          }
          nuc.hp -= dmg;
          nuc.lastDamagedTime = st.elapsedTime;
          nuc.underSiegeTimer = 0.5;
          nuc.lastAttackerId = attackerId;
          nuc.hitFlash = 1;

          if (attacker) {
            attacker.damageDealt += dmg;
          }

          var hue = attacker ? attacker.hue : nuc.hue;
          Entities.spawnDrainBeam(fx, ex, ey, nuc.x, nuc.y, hue);
          Entities.spawnSpark(
            fx,
            ex,
            ey,
            (Math.random() - 0.5) * 140,
            (Math.random() - 0.5) * 140,
            2.8,
            hue,
            0.25,
            0.7
          );
          if (nuc.stance === 'SHIELD') {
            Entities.spawnSpark(
              fx,
              ex,
              ey,
              (Math.random() - 0.5) * 180,
              (Math.random() - 0.5) * 180,
              3.4,
              188,
              0.28,
              0.95
            );
          }

          var cdx = nuc.x - camX;
          var cdy = nuc.y - camY;
          if (cdx * cdx + cdy * cdy < earRangeSq) {
            Audio.playNucleusHit(nuc.isPlayer);
            if (nuc.isPlayer) {
              this.renderer.addShake(2.2, 0.08);
            }
          }

          if (nuc.hp <= 0) {
            this._absorbNucleus(attacker, nuc);
          }
          break;
        }
      }
    }
  };

  Engine.prototype._absorbNucleus = function (killer, victim) {
    if (!victim.alive) return;
    var st = this.state;
    var pool = st.electrons;
    var fx = st.fx;

    victim.alive = false;
    st.aliveCount = Math.max(0, st.aliveCount - 1);

    // Scatter victim's remaining electrons as sparks
    for (var i = 0; i < pool.highWater; i++) {
      if (pool.active[i] && pool.ownerId[i] === victim.id) {
        var sx = pool.x[i];
        var sy = pool.y[i];
        pool.despawn(i, st.nuclei);
        var ang = Math.atan2(sy - victim.y, sx - victim.x);
        var spd = 90 + Math.random() * 140;
        Entities.spawnSpark(fx, sx, sy, Math.cos(ang) * spd, Math.sin(ang) * spd, 3, victim.hue, 0.45, 0.6);
      }
    }

    Entities.spawnShockwave(fx, victim.x, victim.y, victim.radius * 0.4, victim.radius * 3.8, victim.hue, 0.45, 3.5, false);

    if (killer && killer.alive) {
      var oldMaxE = killer.maxElectrons;
      var oldProd = killer.prodRate;

      killer.power += victim.power * Config.ABSORB_POWER_GAIN_RATIO + Config.ABSORB_BASE_POWER_BONUS;
      killer.kills++;
      Entities.recalcStats(killer);

      killer.hp = Math.min(killer.maxHp, killer.hp + killer.maxHp * Config.ABSORB_HEAL_RATIO);

      var bonusE = Math.min(
        killer.maxElectrons - killer.electronCount,
        Math.ceil(victim.maxElectrons * Config.ABSORB_BONUS_ELECTRON_RATIO)
      );
      for (var b = 0; b < bonusE; b++) {
        var sh = b % 3;
        var a = Math.random() * Math.PI * 2;
        var r = killer.radius + 10;
        pool.spawn(
          killer,
          killer.x + Math.cos(a) * r,
          killer.y + Math.sin(a) * r,
          0,
          0,
          sh,
          a,
          sh === 1 ? -1 : 1
        );
      }

      // Implosion shockwave on killer
      Entities.spawnShockwave(fx, killer.x, killer.y, killer.radius, killer.radius * 3.2, killer.hue, 0.42, 4, true);

      var dMax = killer.maxElectrons - oldMaxE;
      var dProd = killer.prodRate - oldProd;

      if (killer.isPlayer) {
        this.renderer.addShake(6.5, 0.22);
        Audio.playAbsorb(true, 1 + victim.power * 0.02);
        Entities.spawnFloatingText(
          fx,
          killer.x,
          killer.y - killer.radius - 34,
          'ABSORBÉ !',
          '+' + dMax + ' Cap. max • +' + dProd.toFixed(1) + '/s',
          '#00f0ff',
          1.15,
          2.0
        );
      } else if (killer.isRemotePlayer && st.mp.active) {
        st.mp.pendingEvents.push({
          k: 'absorb',
          x: Math.round(killer.x),
          y: Math.round(killer.y),
          r: Math.round(killer.radius),
          hue: killer.hue,
          dMax: dMax,
          dProd: Number(dProd.toFixed(1)),
          scale: Number((1 + victim.power * 0.02).toFixed(2))
        });
      } else {
        var cdx = killer.x - this.renderer.camX;
        var cdy = killer.y - this.renderer.camY;
        if (cdx * cdx + cdy * cdy < 900 * 900) {
          Audio.playAbsorb(false, 0.9);
        }
      }

      this._pushKillFeed(killer.name, victim.name, killer.isPlayer, victim.isPlayer);
    } else {
      this._pushKillFeed('Zone Quantique', victim.name, false, victim.isPlayer);
    }

    // Notify remote Guest if absorbed
    if (st.mp.active && st.mp.role === 'host' && st.mp.connected && victim.isRemotePlayer) {
      Net.send({
        t: 'guest_dead',
        killerName: killer ? killer.name : 'Zone Quantique',
        rank: st.aliveCount + 1
      });
    }

    // Check match end conditions if player is in game (or Host keeping match alive for Guest)
    if (st.mode === 'PLAYING') {
      if (victim.isPlayer) {
        this._finishMatch(false, killer ? killer.name : 'Zone Quantique');
      } else if (st.gameMode === 'teams' && st.player && st.player.alive) {
        var enemyAlive = false;
        for (var ei = 0; ei < st.nuclei.length; ei++) {
          var en = st.nuclei[ei];
          if (en.alive && en.team !== st.player.team) {
            enemyAlive = true;
            break;
          }
        }
        if (!enemyAlive) {
          if (st.mp.active && st.mp.role === 'host' && st.mp.connected) {
            var gNuc = st.nuclei[st.mp.friendId];
            if (gNuc && gNuc.team === st.player.team) {
              Net.send({ t: 'end', victory: true });
            }
          }
          this._finishMatch(true, '');
        }
      } else if (st.aliveCount === 1 && st.player && st.player.alive) {
        this._finishMatch(true, '');
      }
    } else if (st.mp.active && st.mp.role === 'host' && st.mp.connected) {
      var guestN = st.nuclei[st.mp.friendId];
      if (guestN && guestN.alive) {
        if (st.gameMode === 'teams') {
          var gEnemyAlive = false;
          for (var gi2 = 0; gi2 < st.nuclei.length; gi2++) {
            var ge = st.nuclei[gi2];
            if (ge.alive && ge.team !== guestN.team) {
              gEnemyAlive = true;
              break;
            }
          }
          if (!gEnemyAlive) {
            Net.send({ t: 'end', victory: true });
          }
        } else if (st.aliveCount === 1) {
          Net.send({ t: 'end', victory: true });
        }
      }
    }
  };

  Engine.prototype._pushKillFeed = function (killerName, victimName, killerIsPlayer, victimIsPlayer) {
    var feed = this.state.killFeed;
    feed.unshift({
      killer: killerName,
      victim: victimName,
      killerIsPlayer: killerIsPlayer,
      victimIsPlayer: victimIsPlayer,
      life: 4.5
    });
    if (feed.length > 4) feed.length = 4;
  };

  Engine.prototype._finishMatch = function (victory, killerName, rankOverride) {
    var st = this.state;
    var player = st.player;
    var rank = rankOverride !== undefined ? rankOverride : victory ? 1 : st.aliveCount + 1;

    if (victory) {
      Audio.playVictory();
      this.setMode('VICTORY');
      if (st.gameMode === 'teams' && player && player.team !== -1) {
        var teamInfo = Config.TEAMS[player.team];
        var teamSurvivors = 0;
        for (var ts = 0; ts < st.nuclei.length; ts++) {
          if (st.nuclei[ts].alive && st.nuclei[ts].team === player.team) teamSurvivors++;
        }
        this._dom.endTitle.textContent = 'VICTOIRE — ÉQUIPE ' + teamInfo.name.toUpperCase() + ' !';
        this._dom.endSubtitle.textContent =
          'Votre équipe a éliminé les deux autres couleurs (' + teamSurvivors + ' survivant(s)).';
      } else {
        this._dom.endTitle.textContent = 'VICTOIRE QUANTIQUE !';
        this._dom.endSubtitle.textContent = 'Vous avez absorbé tous les noyaux de l\'arène.';
      }
      this._dom.endTitle.className = 'end-title victory';
      this._dom.btnSpectate.classList.add('hidden');
    } else {
      Audio.playDefeat();
      this.setMode('DEFEAT');
      this._dom.endTitle.textContent = 'NOYAU ABSORBÉ';
      this._dom.endTitle.className = 'end-title defeat';
      this._dom.endSubtitle.textContent = 'Absorbé par ' + killerName;
      this._dom.btnSpectate.classList.remove('hidden');
    }

    this._dom.endRank.textContent = '#' + rank + ' / ' + st.totalCount;
    this._dom.endKills.textContent = player ? String(player.kills) : '0';
    this._dom.endPeakElectrons.textContent = player ? String(player.peakElectrons) : '0';
    this._dom.endPeakProd.textContent = player ? player.peakProdRate.toFixed(1) + '/s' : '0/s';
    this._dom.endTime.textContent = formatTime(player ? player.timeAlive : st.elapsedTime);

    this._saveBestRecord(rank, player ? player.kills : 0, victory);
    this._refreshHud();
  };

  Engine.prototype._sendGuestInput = function (wantDash) {
    var st = this.state;
    var player = st.player;
    if (!player || !player.alive || !Net.connected) return;
    var worldAim = this.renderer.screenToWorld(this.input.mouseX, this.input.mouseY);
    var pdx = worldAim.x - player.x;
    var pdy = worldAim.y - player.y;
    var pDist = Math.sqrt(pdx * pdx + pdy * pdy);
    var ang = pDist > 12 ? Math.atan2(pdy, pdx) : player.targetAngle;
    var move = pDist > 12 ? Math.min(1, (pDist - 12) / 110) : 0;

    var wantShield = this.input.rmbDown || this.input.keys.KeyE || this.input.keys.KeyS;
    var wantAssault = this.input.lmbDown || this.input.keys.KeyA || this.input.keys.KeyQ;
    var stance = wantShield ? 'SHIELD' : wantAssault ? 'ASSAULT' : 'ORBIT';

    player.targetAngle = ang;
    player.moveIntensity = move;
    player.aimX = worldAim.x;
    player.aimY = worldAim.y;
    player.stance = stance;

    var msg = {
      t: 'in',
      ang: Number(ang.toFixed(3)),
      move: Number(move.toFixed(2)),
      aimX: Math.round(worldAim.x),
      aimY: Math.round(worldAim.y),
      stance: stance
    };
    if (wantDash) {
      msg.dash = 1;
      Net.send(msg);
    } else {
      Net.sendLatest(msg);
    }
  };

  Engine.prototype._stepGuest = function (dt) {
    var st = this.state;
    st.elapsedTime += dt;

    var worldAim = this.renderer.screenToWorld(this.input.mouseX, this.input.mouseY);
    this.input.mouseWorldX = worldAim.x;
    this.input.mouseWorldY = worldAim.y;

    if (st.mode === 'PLAYING') {
      st.mp.guestSendAccum += dt;
      if (st.mp.guestSendAccum >= 0.033) {
        st.mp.guestSendAccum = 0;
        this._sendGuestInput(false);
      }
    }

    // Smoothly interpolate nuclei toward latest Host snapshot
    var lerpPos = 1 - Math.exp(-16 * dt);
    var nuclei = st.nuclei;
    for (var i = 0; i < nuclei.length; i++) {
      var n = nuclei[i];
      if (!n.alive) continue;
      n.timeAlive += dt;
      if (n.netX !== undefined) {
        n.netX += n.vx * dt * 0.45;
        n.netY += n.vy * dt * 0.45;
        n.x += (n.netX - n.x) * lerpPos;
        n.y += (n.netY - n.y) * lerpPos;
      }
      if (n.dashCd > 0) n.dashCd = Math.max(0, n.dashCd - dt);
      if (n.hitFlash > 0) n.hitFlash = Math.max(0, n.hitFlash - dt * 5);
      if (n.underSiegeTimer > 0) n.underSiegeTimer = Math.max(0, n.underSiegeTimer - dt);
    }

    // Extrapolate local electron trails at 60 FPS between 20 Hz snapshots
    var pool = st.electrons;
    var high = pool.highWater;
    var active = pool.active;
    var ex = pool.x;
    var ey = pool.y;
    var prevX = pool.prevX;
    var prevY = pool.prevY;
    var evx = pool.vx;
    var evy = pool.vy;
    for (var e = 0; e < high; e++) {
      if (!active[e]) continue;
      prevX[e] = ex[e];
      prevY[e] = ey[e];
      ex[e] += evx[e] * dt;
      ey[e] += evy[e] * dt;
    }

    this._updateFx(dt);
  };

  Engine.prototype._startGuestMatch = function (msg) {
    var st = this.state;
    st.worldId = msg.worldId || 'open';
    st.worldSeed = msg.seed || 1337;
    st.gameMode = msg.gameMode || 'teams';
    st.difficulty = msg.difficulty || 'standard';
    st.world = Worlds.generate(st.worldId, st.worldSeed);
    st.zone.reset(st.world);
    st.nuclei = [];
    st.electrons.reset();
    st.killFeed = [];
    st.elapsedTime = 0;
    st.spectateTarget = null;
    st.leaderId = -1;
    st.mp.friendId = msg.hostId;

    var i;
    for (i = 0; i < st.fx.sparks.length; i++) st.fx.sparks[i].active = false;
    for (i = 0; i < st.fx.shockwaves.length; i++) st.fx.shockwaves[i].active = false;
    for (i = 0; i < st.fx.drainBeams.length; i++) st.fx.drainBeams[i].active = false;
    for (i = 0; i < st.fx.floatingTexts.length; i++) st.fx.floatingTexts[i].active = false;
    for (i = 0; i < st.ambient.length; i++) st.ambient[i].active = false;

    var meta = msg.nucleiMeta || [];
    for (i = 0; i < meta.length; i++) {
      var m = meta[i];
      var isSelf = m.id === msg.guestId;
      var nuc = Entities.createNucleus(m.id, m.name, m.x, m.y, m.hue, isSelf, 'PLAYER', m.team);
      nuc.netX = m.x;
      nuc.netY = m.y;
      if (m.id === msg.hostId) nuc.isFriend = true;
      st.nuclei.push(nuc);
      if (isSelf) st.player = nuc;
    }

    st.totalCount = st.nuclei.length;
    st.aliveCount = st.nuclei.length;
    if (st.player) {
      this.renderer.camX = st.player.x;
      this.renderer.camY = st.player.y;
      this.renderer.zoom = 0.92;
    }

    this._updateMenuMpUi();
    this.setMode('PLAYING');
    this._refreshHud();
  };

  Engine.prototype._broadcastHostSnapshot = function (dt) {
    var st = this.state;
    st.mp.sendAccum += dt;
    if (st.mp.sendAccum < 0.05) return; // 20 Hz
    st.mp.sendAccum = 0;

    var nuclei = st.nuclei;
    var guestNuc = st.mp.friendId >= 0 ? nuclei[st.mp.friendId] : null;
    var focus = guestNuc && guestNuc.alive ? guestNuc : nuclei[st.leaderId] || st.player;
    var fxX = focus ? focus.x : 0;
    var fxY = focus ? focus.y : 0;

    // 1. Pack compact nuclei array
    var nArr = [];
    for (var i = 0; i < nuclei.length; i++) {
      var n = nuclei[i];
      var stanceIdx = n.stance === 'ASSAULT' ? 1 : n.stance === 'SHIELD' ? 2 : 0;
      nArr.push([
        n.id,
        n.alive ? 1 : 0,
        Math.round(n.x),
        Math.round(n.y),
        Math.round(n.vx),
        Math.round(n.vy),
        Math.round(n.radius * 10),
        Math.round(n.hp * 10),
        Math.round(n.maxHp * 10),
        n.electronCount,
        n.maxElectrons,
        Math.round(n.prodRate * 10),
        Math.round(n.power * 10),
        n.kills,
        stanceIdx,
        Math.round(n.aimX),
        Math.round(n.aimY),
        Math.round(n.shieldThreatAngle * 100),
        n.shieldThreatActive ? 1 : 0,
        Math.round(n.hitFlash * 10),
        Math.round(n.underSiegeTimer * 10),
        Math.round(n.dashCd * 10)
      ]);
    }

    // 2. Pack electrons near Guest viewport (max 1000 * 5 Int16 = 10 KB)
    var pool = st.electrons;
    var high = pool.highWater;
    var active = pool.active;
    var ex = pool.x;
    var ey = pool.y;
    var evx = pool.vx;
    var evy = pool.vy;
    var oid = pool.ownerId;
    var maxDistSq = 1650 * 1650;
    var eIndices = [];
    for (var e = 0; e < high && eIndices.length < 1000; e++) {
      if (!active[e]) continue;
      var dx = ex[e] - fxX;
      var dy = ey[e] - fxY;
      if (dx * dx + dy * dy <= maxDistSq) {
        eIndices.push(e);
      }
    }
    var eArr = new Int16Array(eIndices.length * 5);
    for (var ei = 0; ei < eIndices.length; ei++) {
      var idx = eIndices[ei];
      var off = ei * 5;
      eArr[off] = oid[idx];
      eArr[off + 1] = Math.round(ex[idx]);
      eArr[off + 2] = Math.round(ey[idx]);
      eArr[off + 3] = Math.round(evx[idx]);
      eArr[off + 4] = Math.round(evy[idx]);
    }

    // 3. Pack ambient particles every 2nd snapshot (~10 Hz)
    var aArr = null;
    st.mp.ambTick++;
    if (st.mp.ambTick % 2 === 0) {
      var ambient = st.ambient;
      var aList = [];
      for (var ai = 0; ai < ambient.length; ai++) {
        if (ambient[ai].active) aList.push(ambient[ai]);
      }
      aArr = new Int16Array(aList.length * 3);
      for (var aj = 0; aj < aList.length; aj++) {
        var ap = aList[aj];
        var aOff = aj * 3;
        aArr[aOff] = Math.round(ap.x);
        aArr[aOff + 1] = Math.round(ap.y);
        aArr[aOff + 2] = ((ap.hue & 511) << 1) | (ap.isCluster ? 1 : 0);
      }
    }

    var z = st.zone;
    var msg = {
      t: 'snap',
      alive: st.aliveCount,
      leader: st.leaderId,
      n: nArr,
      z: [
        Math.round(z.x),
        Math.round(z.y),
        Math.round(z.radius),
        Math.round(z.targetX),
        Math.round(z.targetY),
        Math.round(z.targetRadius),
        z.state === 'HOLD' ? 0 : z.state === 'SHRINK' ? 1 : 2,
        Math.round(z.timer * 10)
      ],
      kf: st.killFeed.map(function (k) {
        return [k.killer, k.victim];
      }),
      electronsBuf: eArr
    };
    if (aArr) msg.ambientBuf = aArr;
    if (st.mp.pendingEvents.length > 0) {
      msg.ev = st.mp.pendingEvents;
      st.mp.pendingEvents = [];
    }

    Net.sendLatest(msg);
  };

  Engine.prototype._applyHostSnapshot = function (msg) {
    var st = this.state;
    st.aliveCount = msg.alive;
    st.leaderId = msg.leader;

    var nuclei = st.nuclei;
    var nArr = msg.n || [];
    for (var i = 0; i < nArr.length; i++) {
      var row = nArr[i];
      var nuc = nuclei[row[0]];
      if (!nuc) continue;
      var wasAlive = nuc.alive;
      nuc.alive = row[1] === 1;
      nuc.netX = row[2];
      nuc.netY = row[3];
      if (Math.hypot(nuc.netX - nuc.x, nuc.netY - nuc.y) > 420) {
        nuc.x = nuc.netX;
        nuc.y = nuc.netY;
      }
      nuc.vx = row[4];
      nuc.vy = row[5];
      nuc.radius = row[6] / 10;
      nuc.hp = row[7] / 10;
      nuc.maxHp = row[8] / 10;
      nuc.electronCount = row[9];
      nuc.maxElectrons = row[10];
      nuc.prodRate = row[11] / 10;
      nuc.power = row[12] / 10;
      nuc.orbitRadius = Config.getOrbitRadius(nuc.power);
      nuc.kills = row[13];
      nuc.stance = row[14] === 1 ? 'ASSAULT' : row[14] === 2 ? 'SHIELD' : 'ORBIT';
      nuc.aimX = row[15];
      nuc.aimY = row[16];
      nuc.shieldThreatAngle = row[17] / 100;
      nuc.shieldThreatActive = row[18] === 1;
      nuc.hitFlash = row[19] / 10;
      nuc.underSiegeTimer = row[20] / 10;
      nuc.dashCd = row[21] / 10;

      if (nuc.electronCount > nuc.peakElectrons) nuc.peakElectrons = nuc.electronCount;
      if (nuc.prodRate > nuc.peakProdRate) nuc.peakProdRate = nuc.prodRate;

      var eBoost = Worlds.getEnergyBoost(st.world, nuc.x, nuc.y);
      nuc._inReactor = eBoost.inZone;
      nuc._reactorMult = eBoost.prodMult;

      if (wasAlive && !nuc.alive) {
        Entities.spawnShockwave(st.fx, nuc.x, nuc.y, nuc.radius * 0.4, nuc.radius * 3.8, nuc.hue, 0.45, 3.5, false);
      }
    }

    if (msg.z) {
      var z = st.zone;
      z.x = msg.z[0];
      z.y = msg.z[1];
      z.radius = msg.z[2];
      z.targetX = msg.z[3];
      z.targetY = msg.z[4];
      z.targetRadius = msg.z[5];
      z.state = msg.z[6] === 0 ? 'HOLD' : msg.z[6] === 1 ? 'SHRINK' : 'FINAL';
      z.timer = msg.z[7] / 10;
    }

    if (msg.electronsBuf) {
      var eInt = new Int16Array(msg.electronsBuf);
      st.electrons.setFromSnapshot(eInt, Math.floor(eInt.length / 5));
    }

    if (msg.ambientBuf) {
      var aInt = new Int16Array(msg.ambientBuf);
      var aCount = Math.min(st.ambient.length, Math.floor(aInt.length / 3));
      for (var ai = 0; ai < aCount; ai++) {
        var ap = st.ambient[ai];
        var off = ai * 3;
        var packed = aInt[off + 2];
        var isCluster = (packed & 1) === 1;
        ap.active = true;
        ap.x = aInt[off];
        ap.y = aInt[off + 1];
        ap.isCluster = isCluster;
        ap.radius = isCluster ? 9 : 4.5;
        ap.hue = (packed >> 1) & 511;
      }
      for (var aj = aCount; aj < st.ambient.length; aj++) {
        st.ambient[aj].active = false;
      }
    }

    if (msg.kf) {
      var playerName = st.player ? st.player.name : '';
      st.killFeed = msg.kf.map(function (pair) {
        return {
          killer: pair[0],
          victim: pair[1],
          killerIsPlayer: pair[0] === playerName,
          victimIsPlayer: pair[1] === playerName,
          life: 4.0
        };
      });
    }

    if (msg.ev) {
      for (var evi = 0; evi < msg.ev.length; evi++) {
        var ev = msg.ev[evi];
        if (ev.k === 'absorb') {
          this.renderer.addShake(6.5, 0.22);
          Audio.playAbsorb(true, ev.scale || 1);
          Entities.spawnShockwave(st.fx, ev.x, ev.y, ev.r, ev.r * 3.2, ev.hue, 0.42, 4, true);
          Entities.spawnFloatingText(
            st.fx,
            ev.x,
            ev.y - ev.r - 34,
            'ABSORBÉ !',
            '+' + ev.dMax + ' Cap. max • +' + ev.dProd + '/s',
            '#00f0ff',
            1.15,
            2.0
          );
        } else if (ev.k === 'dash') {
          Entities.spawnShockwave(st.fx, ev.x, ev.y, ev.r, ev.r * 2.8, ev.hue, 0.28, 2.5, false);
        }
      }
    }
  };

  Engine.prototype._enterSpectate = function () {
    this.setMode('SPECTATING');
    this._cycleSpectateTarget();
  };

  Engine.prototype._cycleSpectateTarget = function () {
    var nuclei = this.state.nuclei;
    var alive = [];
    for (var i = 0; i < nuclei.length; i++) {
      if (nuclei[i].alive) alive.push(nuclei[i]);
    }
    if (alive.length === 0) return;
    alive.sort(function (a, b) { return b.power - a.power; });
    var cur = this.state.spectateTarget;
    var idx = cur ? alive.indexOf(cur) : -1;
    var next = alive[(idx + 1) % alive.length];
    this.state.spectateTarget = next;
    if (this._dom.spectateName) {
      this._dom.spectateName.textContent = next.name + ' (⚡ ' + next.electronCount + ')';
    }
  };

  Engine.prototype._updateFx = function (dt) {
    var fx = this.state.fx;
    var i;

    for (i = 0; i < fx.sparks.length; i++) {
      var s = fx.sparks[i];
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.93;
      s.vy *= 0.93;
    }

    for (i = 0; i < fx.shockwaves.length; i++) {
      var w = fx.shockwaves[i];
      if (!w.active) continue;
      w.life -= dt;
      if (w.life <= 0) w.active = false;
    }

    for (i = 0; i < fx.drainBeams.length; i++) {
      var b = fx.drainBeams[i];
      if (!b.active) continue;
      b.life -= dt;
      if (b.life <= 0) b.active = false;
    }

    for (i = 0; i < fx.floatingTexts.length; i++) {
      var ft = fx.floatingTexts[i];
      if (!ft.active) continue;
      ft.life -= dt;
      if (ft.life <= 0) {
        ft.active = false;
        continue;
      }
      ft.y += ft.vy * dt;
      ft.vy *= 0.96;
    }

    var feed = this.state.killFeed;
    for (i = feed.length - 1; i >= 0; i--) {
      feed[i].life -= dt;
      if (feed[i].life <= 0) feed.splice(i, 1);
    }
  };

  Engine.prototype._refreshHud = function () {
    var st = this.state;
    var dom = this._dom;
    var player = st.player;

    // Alive counter
    dom.hudAlive.textContent = st.aliveCount + ' / ' + st.totalCount;

    // Team scoreboard update
    if (dom.teamScoreboard) {
      var showTeams = st.gameMode === 'teams';
      dom.teamScoreboard.classList.toggle('hidden', !showTeams);
      if (showTeams) {
        var counts = [0, 0, 0];
        for (var ti = 0; ti < st.nuclei.length; ti++) {
          var tn = st.nuclei[ti];
          if (tn.alive && tn.team >= 0 && tn.team < 3) counts[tn.team]++;
        }
        var totalAliveTeams = counts[0] + counts[1] + counts[2];
        for (var tc = 0; tc < 3; tc++) {
          if (dom.teamCounts[tc]) dom.teamCounts[tc].textContent = String(counts[tc]);
          if (dom.teamBars[tc]) {
            var pct = totalAliveTeams > 0 ? (counts[tc] / totalAliveTeams) * 100 : 0;
            dom.teamBars[tc].style.width = pct.toFixed(1) + '%';
          }
        }
      }
    }

    // Zone status
    var z = st.zone;
    if (z.state === 'HOLD') {
      dom.hudZoneLabel.textContent = 'Zone stable';
      dom.hudZoneLabel.className = 'zone-status stable';
      dom.hudZoneTimer.textContent = formatTime(Math.ceil(z.timer));
    } else if (z.state === 'SHRINK') {
      dom.hudZoneLabel.textContent = 'Rétrécissement !';
      dom.hudZoneLabel.className = 'zone-status shrinking';
      dom.hudZoneTimer.textContent = formatTime(Math.ceil(z.timer));
    } else {
      dom.hudZoneLabel.textContent = 'Zone finale';
      dom.hudZoneLabel.className = 'zone-status final';
      dom.hudZoneTimer.textContent = '∞';
    }

    // Sort alive nuclei for leaderboard & player rank (reuse scratch array)
    var aliveList = this._aliveScratch;
    aliveList.length = 0;
    for (var i = 0; i < st.nuclei.length; i++) {
      if (st.nuclei[i].alive) aliveList.push(st.nuclei[i]);
    }
    aliveList.sort(function (a, b) {
      return b.power - a.power;
    });

    // Leaderboard Top 6 (update DOM only when content changes)
    var lbHtml = '';
    var topCount = Math.min(6, aliveList.length);
    for (var r = 0; r < topCount; r++) {
      var item = aliveList[r];
      var cls = item.isPlayer ? 'lb-row is-player' : 'lb-row';
      var dispName = (item.isFriend ? '★ ' : '') + item.name;
      lbHtml +=
        '<div class="' +
        cls +
        '"><span class="lb-rank">' +
        (r + 1) +
        '</span><span class="lb-dot" style="background:' +
        item.color +
        '"></span><span class="lb-name">' +
        this._escapeHtml(dispName) +
        '</span><span class="lb-val">⚡' +
        item.electronCount +
        '</span></div>';
    }
    if (lbHtml !== this._lastLbHtml) {
      this._lastLbHtml = lbHtml;
      dom.leaderboardList.innerHTML = lbHtml;
    }

    // Player stats & tactical bar
    if (dom.netBadge) {
      var showNet = st.mp.active && st.mp.connected;
      dom.netBadge.classList.toggle('hidden', !showNet);
      if (showNet) {
        var rtt = Net.rtt;
        var latText = Net.transport === 'local' ? 'Local' : rtt !== null ? rtt + ' ms' : 'P2P';
        dom.netBadge.textContent = '🟢 Salon ' + (st.mp.code || '') + ' • ' + latText;
      }
    }

    if (player && player.alive) {
      var pRank = aliveList.indexOf(player) + 1;
      dom.hudRank.textContent = '#' + (pRank > 0 ? pRank : '-');
      dom.hudElectrons.textContent = player.electronCount + ' / ' + player.maxElectrons;
      dom.hudElectronsBar.style.width =
        Math.min(100, (player.electronCount / Math.max(1, player.maxElectrons)) * 100).toFixed(1) + '%';
      var effProd = player.prodRate * (player._reactorMult || 1);
      dom.hudProd.textContent = '+' + effProd.toFixed(1) + ' /s';
      if (dom.reactorBadge) {
        dom.reactorBadge.classList.toggle('hidden', !player._inReactor);
      }
      dom.hudHp.textContent = Math.ceil(player.hp) + ' / ' + Math.ceil(player.maxHp);
      dom.hudHpBar.style.width =
        Math.max(0, Math.min(100, (player.hp / Math.max(1, player.maxHp)) * 100)).toFixed(1) + '%';
      dom.hudPower.textContent = Math.floor(player.power);
      dom.hudKills.textContent = String(player.kills);

      dom.zoneWarningBanner.classList.toggle('hidden', !z.isOutside(player.x, player.y));

      // Tactical bar
      dom.skillAssault.classList.toggle('active', player.stance === 'ASSAULT');
      dom.skillShield.classList.toggle('active', player.stance === 'SHIELD');
      if (player.dashCd > 0) {
        var readyPct = 100 - (player.dashCd / Config.DASH_COOLDOWN) * 100;
        dom.dashFill.style.width = readyPct.toFixed(1) + '%';
        dom.dashLabel.textContent = player.dashCd.toFixed(1) + 's';
        dom.skillDash.classList.remove('ready');
      } else if (player.electronCount < Config.DASH_MIN_ELECTRONS) {
        dom.dashFill.style.width = '0%';
        dom.dashLabel.textContent = 'Min ' + Config.DASH_MIN_ELECTRONS + ' ⚡';
        dom.skillDash.classList.remove('ready');
      } else {
        dom.dashFill.style.width = '100%';
        dom.dashLabel.textContent = 'Prêt';
        dom.skillDash.classList.add('ready');
      }
    } else {
      dom.zoneWarningBanner.classList.add('hidden');
      if (dom.reactorBadge) dom.reactorBadge.classList.add('hidden');
      if (st.mode === 'SPECTATING' && st.spectateTarget && dom.spectateName) {
        dom.spectateName.textContent = st.spectateTarget.name + ' (⚡ ' + st.spectateTarget.electronCount + ')';
      }
    }

    // Kill feed (update DOM only when content changes)
    var kfHtml = '';
    for (var k = 0; k < st.killFeed.length; k++) {
      var kf = st.killFeed[k];
      kfHtml +=
        '<div class="kf-item">' +
        '<span class="' +
        (kf.killerIsPlayer ? 'kf-player' : 'kf-name') +
        '">' +
        this._escapeHtml(kf.killer) +
        '</span>' +
        ' <span class="kf-verb">a absorbé</span> ' +
        '<span class="' +
        (kf.victimIsPlayer ? 'kf-victim-player' : 'kf-name') +
        '">' +
        this._escapeHtml(kf.victim) +
        '</span></div>';
    }
    if (kfHtml !== this._lastKfHtml) {
      this._lastKfHtml = kfHtml;
      dom.killFeed.innerHTML = kfHtml;
    }
  };

  Engine.prototype._escapeHtml = function (str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  };

  window.addEventListener('DOMContentLoaded', function () {
    NUCLEON.engine = new Engine();
  });
})();
