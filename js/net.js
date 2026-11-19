(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});

  var PEERJS_URLS = [
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'
  ];
  var PREFIX = 'nucleon-arena-v1-';
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // 24 clear uppercase letters
  var MAX_PENDING = 24 * 1024;

  var peer = null;
  var conn = null;
  var live = null;
  var bc = null;
  var bcActive = false;

  var role = null; // 'host' | 'guest' | null
  var code = null;
  var transport = null; // 'p2p' | 'local' | null

  var pingTimer = null;
  var pingAt = 0;
  var stats = { rtt: null, lastReceive: 0, skipped: 0 };

  var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  var decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  var handlers = {
    onOpen: null,
    onData: null,
    onClose: null,
    onError: null
  };

  function makeCode() {
    var out = '';
    for (var i = 0; i < 4; i++) {
      out += ALPHA[(Math.random() * ALPHA.length) | 0];
    }
    return out;
  }

  function loadPeerLib() {
    return new Promise(function (resolve, reject) {
      if (window.Peer) return resolve();
      var idx = 0;
      function tryNext() {
        if (idx >= PEERJS_URLS.length) {
          return reject(new Error('Module réseau P2P indisponible.'));
        }
        var s = document.createElement('script');
        s.src = PEERJS_URLS[idx++];
        s.async = true;
        s.onload = function () { resolve(); };
        s.onerror = function () { tryNext(); };
        document.head.appendChild(s);
      }
      tryNext();
    });
  }

  function toBytes(v) {
    if (!v) return new Uint8Array(0);
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    return new Uint8Array(0);
  }

  function pack(msg) {
    var eb = toBytes(msg.electronsBuf);
    var ab = toBytes(msg.ambientBuf);
    var meta = {};
    for (var key in msg) {
      if (Object.prototype.hasOwnProperty.call(msg, key) && key !== 'electronsBuf' && key !== 'ambientBuf') {
        meta[key] = msg[key];
      }
    }
    var jsonStr = JSON.stringify(meta);
    var header = encoder ? encoder.encode(jsonStr) : new Uint8Array(0);
    var out = new Uint8Array(8 + header.length + eb.length + ab.length);
    var dv = new DataView(out.buffer);
    dv.setUint32(0, header.length);
    dv.setUint32(4, eb.length);
    out.set(header, 8);
    if (eb.length > 0) out.set(eb, 8 + header.length);
    if (ab.length > 0) out.set(ab, 8 + header.length + eb.length);
    return out.buffer;
  }

  function unpack(buffer) {
    var dv = new DataView(buffer);
    var metaLen = dv.getUint32(0);
    var elecLen = dv.getUint32(4);
    if (8 + metaLen + elecLen > buffer.byteLength) {
      throw new Error('Paquet tronqué');
    }
    var metaStr = decoder ? decoder.decode(new Uint8Array(buffer, 8, metaLen)) : '{}';
    var msg = JSON.parse(metaStr);
    if (elecLen > 0) {
      msg.electronsBuf = buffer.slice(8 + metaLen, 8 + metaLen + elecLen);
    }
    if (8 + metaLen + elecLen < buffer.byteLength) {
      msg.ambientBuf = buffer.slice(8 + metaLen + elecLen);
    }
    return msg;
  }

  function startPing() {
    clearInterval(pingTimer);
    pingTimer = setInterval(function () {
      if (!isConnected()) return;
      pingAt = performance.now();
      sendLatest({ t: '_ping', at: pingAt });
    }, 1000);
  }

  function clearLive() {
    clearInterval(pingTimer);
    pingTimer = null;
    pingAt = 0;
    if (live) {
      live.onmessage = null;
      try { live.close(); } catch (e) {}
    }
    live = null;
  }

  function receive(m) {
    if (!m || typeof m !== 'object') return;
    stats.lastReceive = performance.now();
    if (m.t === '_ping') {
      sendLatest({ t: '_pong', at: m.at });
      return;
    }
    if (m.t === '_pong') {
      if (m.at === pingAt) {
        stats.rtt = Math.round(performance.now() - m.at);
      }
      return;
    }
    if (handlers.onData) handlers.onData(m);
  }

  function setupPeerConn(c) {
    c.on('open', function () {
      if (bcActive) {
        // Close unused local BroadcastChannel once P2P connects
        try { if (bc) bc.close(); } catch (e) {}
        bc = null;
        bcActive = false;
      }
      conn = c;
      transport = 'p2p';
      stats.rtt = null;
      stats.skipped = 0;
      stats.lastReceive = performance.now();

      try {
        live = c.peerConnection.createDataChannel('nucleon-live-v1', {
          negotiated: true,
          id: 42,
          ordered: false,
          maxRetransmits: 0
        });
        live.binaryType = 'arraybuffer';
        live.onmessage = function (ev) {
          if (conn !== c) return;
          try {
            receive(unpack(ev.data));
          } catch (err) {}
        };
      } catch (e) {
        live = null;
      }

      startPing();
      if (handlers.onOpen) handlers.onOpen();
    });

    c.on('data', function (d) {
      if (conn !== c) return;
      if (d instanceof ArrayBuffer) {
        try { receive(unpack(d)); } catch (e) {}
      } else {
        receive(d);
      }
    });

    function lost() {
      if (conn !== c) return;
      clearLive();
      conn = null;
      transport = null;
      if (handlers.onClose) handlers.onClose();
    }

    c.on('close', lost);
    c.on('error', lost);
  }

  function setupBroadcastChannel(roomCode, isHostSide, onGuestClaimed) {
    if (typeof BroadcastChannel === 'undefined') return null;
    var channel = new BroadcastChannel('nucleon-local-' + roomCode);
    channel.onmessage = function (ev) {
      var d = ev.data;
      if (d instanceof ArrayBuffer) {
        if (bcActive) {
          try { receive(unpack(d)); } catch (e) {}
        }
        return;
      }
      if (!d || typeof d !== 'object') return;

      if (d._bc === 'join' && isHostSide) {
        if (conn || bcActive) return; // already occupied
        bcActive = true;
        transport = 'local';
        stats.rtt = 1;
        stats.skipped = 0;
        stats.lastReceive = performance.now();
        channel.postMessage({ _bc: 'ack' });
        if (onGuestClaimed) onGuestClaimed();
        startPing();
        if (handlers.onOpen) handlers.onOpen();
        return;
      }

      if (d._bc === 'leave') {
        if (bcActive) {
          bcActive = false;
          transport = null;
          clearLive();
          if (handlers.onClose) handlers.onClose();
        }
        return;
      }

      if (bcActive) {
        receive(d);
      }
    };
    return channel;
  }

  function close() {
    var p = peer;
    if (bc && bcActive) {
      try { bc.postMessage({ _bc: 'leave' }); } catch (e) {}
    }
    try { if (bc) bc.close(); } catch (e) {}
    bc = null;
    bcActive = false;

    clearLive();
    if (conn) {
      try { conn.close(); } catch (e) {}
    }
    conn = null;
    peer = null;
    role = null;
    code = null;
    transport = null;

    if (p) {
      try { p.destroy(); } catch (e) {}
    }
  }

  function isConnected() {
    return bcActive || !!(conn && conn.open);
  }

  function host() {
    close();
    role = 'host';
    var chosen = makeCode();
    code = chosen;

    // Open local BroadcastChannel immediately so same-browser tabs can always discover this room
    bc = setupBroadcastChannel(chosen, true, function () {
      // Guest claimed via local BroadcastChannel; close PeerJS listener cleanly
      if (peer) {
        try { peer.destroy(); } catch (e) {}
        peer = null;
      }
    });

    return loadPeerLib()
      .then(function () {
        return new Promise(function (resolve) {
          var settled = false;
          var attempts = 0;

          function tryPeer(candidateCode) {
            attempts++;
            var p = new window.Peer(PREFIX + candidateCode);
            peer = p;

            var timer = setTimeout(function () {
              if (!settled) {
                settled = true;
                // PeerJS signaling slow/blocked -> keep local channel active and resolve
                resolve(code);
              }
            }, 5000);

            p.on('open', function () {
              clearTimeout(timer);
              code = candidateCode;
              if (!settled) {
                settled = true;
                resolve(code);
              }
            });

            p.on('connection', function (cn) {
              if (conn || bcActive) {
                cn.on('open', function () { cn.close(); });
                return;
              }
              setupPeerConn(cn);
            });

            p.on('disconnected', function () {
              if (peer === p && !p.destroyed) {
                try { p.reconnect(); } catch (e) {}
              }
            });

            p.on('error', function (err) {
              clearTimeout(timer);
              if (!settled && peer === p) {
                try { p.destroy(); } catch (e) {}
                peer = null;
                if (err && err.type === 'unavailable-id' && attempts < 4) {
                  var nextCode = makeCode();
                  if (bc) { try { bc.close(); } catch (e2) {} }
                  bc = setupBroadcastChannel(nextCode, true, function () {
                    if (peer) {
                      try { peer.destroy(); } catch (e3) {}
                      peer = null;
                    }
                  });
                  code = nextCode;
                  tryPeer(nextCode);
                  return;
                }
                settled = true;
                resolve(code);
              } else if (handlers.onError) {
                handlers.onError(err);
              }
            });
          }

          tryPeer(chosen);
        });
      })
      .catch(function () {
        // Offline / CDN blocked: local BroadcastChannel still serves same-browser multiplayer
        return code;
      });
  }

  function join(rawCode) {
    close();
    var normalized = String(rawCode || '').toUpperCase().replace(/[^A-Z]/g, '');
    if (normalized.length !== 4) {
      return Promise.reject(new Error('Le code doit contenir exactement 4 lettres.'));
    }
    role = 'guest';
    code = normalized;

    // Step A: Quick 350ms BroadcastChannel probe for instant same-browser connection
    return new Promise(function (resolve, reject) {
      var localFound = false;
      var localTimer = null;

      if (typeof BroadcastChannel !== 'undefined') {
        var chan = new BroadcastChannel('nucleon-local-' + normalized);
        bc = chan;

        chan.onmessage = function (ev) {
          var d = ev.data;
          if (!localFound && d && d._bc === 'ack') {
            localFound = true;
            clearTimeout(localTimer);
            bcActive = true;
            transport = 'local';
            stats.rtt = 1;
            stats.skipped = 0;
            stats.lastReceive = performance.now();

            // Replace initial ack handler with runtime message router
            chan.onmessage = function (msgEv) {
              var msgData = msgEv.data;
              if (msgData instanceof ArrayBuffer) {
                try { receive(unpack(msgData)); } catch (e) {}
                return;
              }
              if (msgData && msgData._bc === 'leave') {
                bcActive = false;
                transport = null;
                clearLive();
                if (handlers.onClose) handlers.onClose();
                return;
              }
              receive(msgData);
            };

            startPing();
            if (handlers.onOpen) handlers.onOpen();
            resolve();
          }
        };

        chan.postMessage({ _bc: 'join' });
        localTimer = setTimeout(function () {
          if (localFound) return;
          try { chan.close(); } catch (e) {}
          bc = null;
          connectViaPeerJS(normalized, resolve, reject);
        }, 350);
      } else {
        connectViaPeerJS(normalized, resolve, reject);
      }
    });
  }

  function connectViaPeerJS(roomCode, resolve, reject) {
    loadPeerLib()
      .then(function () {
        var p = new window.Peer();
        peer = p;
        var done = false;

        function fail(msg) {
          if (done) return;
          done = true;
          close();
          reject(new Error(msg));
        }

        var timer = setTimeout(function () {
          fail('Aucune réponse pour le salon ' + roomCode + '. Vérifiez le code.');
        }, 15000);

        p.on('open', function () {
          var cn = p.connect(PREFIX + roomCode, { reliable: true });
          setupPeerConn(cn);
          cn.on('open', function () {
            if (done) return;
            done = true;
            clearTimeout(timer);
            resolve();
          });
        });

        p.on('error', function (e) {
          clearTimeout(timer);
          if (e && e.type === 'peer-unavailable') {
            fail('Aucun salon trouvé avec le code ' + roomCode + '.');
          } else {
            fail('Connexion impossible (' + ((e && e.type) || 'réseau') + ').');
          }
        });
      })
      .catch(function (err) {
        close();
        reject(err);
      });
  }

  function send(msg) {
    if (bcActive && bc) {
      try {
        bc.postMessage(msg);
        return true;
      } catch (e) {
        return false;
      }
    }
    if (!conn || !conn.open) return false;
    try {
      conn.send(msg);
      return true;
    } catch (e) {
      return false;
    }
  }

  function sendLatest(msg) {
    var hasBin = !!(msg.electronsBuf || msg.ambientBuf);
    if (bcActive && bc) {
      try {
        if (hasBin) {
          var buf = pack(msg);
          bc.postMessage(buf, [buf]);
        } else {
          bc.postMessage(msg);
        }
        return true;
      } catch (e) {
        return false;
      }
    }
    if (!conn || !conn.open) return false;
    if (live && live.readyState === 'open') {
      var data = pack(msg);
      if (live.bufferedAmount + data.byteLength > MAX_PENDING) {
        stats.skipped++;
        return false;
      }
      try {
        live.send(data);
        return true;
      } catch (e) {
        stats.skipped++;
        return false;
      }
    }
    if (hasBin) {
      if (conn.bufferSize || (conn.dataChannel && conn.dataChannel.bufferedAmount > MAX_PENDING)) {
        stats.skipped++;
        return false;
      }
      try {
        conn.send(pack(msg));
        return true;
      } catch (e) {
        return false;
      }
    }
    if (conn.bufferSize || (conn.dataChannel && conn.dataChannel.bufferedAmount > 0)) {
      stats.skipped++;
      return false;
    }
    return send(msg);
  }

  NUCLEON.Net = {
    host: host,
    join: join,
    send: send,
    sendLatest: sendLatest,
    close: close,
    pack: pack,
    unpack: unpack,
    setHandlers: function (obj) {
      for (var k in obj) {
        if (Object.prototype.hasOwnProperty.call(handlers, k)) {
          handlers[k] = obj[k];
        }
      }
    },
    get connected() { return isConnected(); },
    get role() { return role; },
    get code() { return code; },
    get rtt() { return stats.rtt; },
    get transport() { return transport; },
    get stats() {
      return {
        rtt: stats.rtt,
        skipped: stats.skipped,
        transport: transport,
        silentMs: performance.now() - stats.lastReceive
      };
    }
  };
})();
