'use strict';

      var NS = 'http://www.w3.org/2000/svg';
      var HOURS = [];
      var DATE = '';
      var STATIONS = [];
      var COLLISIONS = [];
      var SERIES = [];

      var COLORS = {
        green: '#16a34a',
        amber: '#f59e0b',
        red: '#dc2626',
        locked: '#94a3b8'
      };
      var OPACITY = {
        green: 0.22,
        amber: 0.24,
        red: 0.22,
        locked: 0.30
      };
      var SLOT_POS = {
        0: [],
        1: [
          [0, 0]
        ],
        2: [
          [-6.2, 0],
          [6.2, 0]
        ],
        3: [
          [-6.4, -4.6],
          [6.4, -4.6],
          [0, 6.2]
        ],
        4: [
          [-6.4, -6.4],
          [6.4, -6.4],
          [-6.4, 6.4],
          [6.4, 6.4]
        ]
      };

      function clamp(v, a, b) {
        return v < a ? a : (v > b ? b : v);
      }

      function pad2(n) {
        return n < 10 ? '0' + n : '' + n;
      }

      function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }

      function svgEl(tag, attrs, text) {
        var e = document.createElementNS(NS, tag);
        if (attrs) {
          for (var k in attrs) {
            if (attrs.hasOwnProperty(k)) e.setAttribute(k, attrs[k]);
          }
        }
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
      }

      /* Data series are loaded by data-service.js. */
      function sample(i, t) {
        var s = SERIES[i];
        var idx = Math.min(HOURS.length - 2, Math.floor(t));
        var f = clamp(t - idx, 0, 1);
        var a = s.hours[idx],
          b = s.hours[idx + 1];
        return {
          bikes: a.bikes + (b.bikes - a.bikes) * f,
          docks: a.docks + (b.docks - a.docks) * f,
          faults: a.faults + (b.faults - a.faults) * f
        };
      }

      function levelKey(v) {
        return v <= 0.0001 ? 'red' : (v <= 5 ? 'amber' : 'green');
      }

      function levelText(v, mode) {
        if (v <= 0.0001) return mode === 'borrow' ? 'No bikes available' : 'No docks available';
        if (v <= 5) return mode === 'borrow' ? 'Limited bike availability' : 'Limited dock availability';
        return mode === 'borrow' ? 'Good bike availability' : 'Good dock availability';
      }

      function fmtClock(t) {
        var total = Math.round((HOURS[0] * 60 + t * 60) / 5) * 5;
        return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60);
      }

      var state = {
        mode: 'borrow',
        t: 1.5,
        hoverId: null,
        pinnedId: null,
        playing: false,
        timer: null
      };

      /* ---------- Base-map blocks ---------- */
      function buildBlocks() {
        var g = document.getElementById('blocks');
        g.innerHTML = '';
        var s = 20261015;

        function rnd() {
          s = (s * 1664525 + 1013904223) % 4294967296;
          return s / 4294967296;
        }
        var frag = document.createDocumentFragment();
        for (var gy = 0; gy < 14; gy++) {
          for (var gx = 0; gx < 22; gx++) {
            if (rnd() < 0.13) continue;
            var x = gx * 66 + 8 + (rnd() - 0.5) * 6;
            var y = gy * 50 + 7 + (rnd() - 0.5) * 6;
            var w = 46 + rnd() * 12;
            var h = 31 + rnd() * 11;
            frag.appendChild(svgEl('rect', {
              x: x.toFixed(1),
              y: y.toFixed(1),
              width: w.toFixed(1),
              height: h.toFixed(1),
              rx: 3,
              fill: '#f7f8fa'
            }));
          }
        }
        g.appendChild(frag);
      }

      /* ---------- Map icons ---------- */
      function bikeGlyph() {
        var g = svgEl('g', {
          'class': 'icon'
        });
        g.appendChild(svgEl('circle', {
          cx: -3.2,
          cy: 2,
          r: 2.4,
          fill: 'none',
          stroke: '#fff',
          'stroke-width': 1.3
        }));
        g.appendChild(svgEl('circle', {
          cx: 3.2,
          cy: 2,
          r: 2.4,
          fill: 'none',
          stroke: '#fff',
          'stroke-width': 1.3
        }));
        g.appendChild(svgEl('path', {
          d: 'M -3.2 2 L -0.4 -2.6 L 3.2 2 M -0.4 -2.6 L 2.2 -2.6 M -0.4 -2.6 L -1.2 2',
          fill: 'none',
          stroke: '#fff',
          'stroke-width': 1.1,
          'stroke-linecap': 'round'
        }));
        return g;
      }

      function dockGlyph() {
        var g = svgEl('g', {
          'class': 'icon'
        });
        g.appendChild(svgEl('rect', {
          x: -3.2,
          y: -3.4,
          width: 6.4,
          height: 6.8,
          rx: 1.7,
          fill: '#fff'
        }));
        g.appendChild(svgEl('path', {
          d: 'M -3.2 3.9 h 6.4',
          stroke: '#fff',
          'stroke-width': 1.3,
          'stroke-linecap': 'round'
        }));
        g.appendChild(svgEl('path', {
          d: 'M -0.6 2 L -0.6 -2.4',
          stroke: '#334155',
          'stroke-width': 1.9,
          'stroke-linecap': 'round'
        }));
        return g;
      }

      function iconFor(mode) {
        return mode === 'borrow' ? bikeGlyph() : dockGlyph();
      }

      function wrenchGlyph() {
        var g = svgEl('g', {
          transform: 'translate(-11.5,-5) scale(0.42)'
        });
        g.appendChild(svgEl('path', {
          fill: '#b45309',
          d: 'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z'
        }));
        return g;
      }

      var nodes = [];

      function buildStations() {
        var layer = document.getElementById('stations');
        layer.innerHTML = '';
        nodes.length = 0;
        var frag = document.createDocumentFragment();
        STATIONS.forEach(function(st, i) {
          var r = 18 + st.cap * 0.12;
          var g = svgEl('g', {
            'class': 'station',
            transform: 'translate(' + st.x + ',' + st.y + ')',
            'data-id': st.id
          });
          var disc = svgEl('circle', {
            'class': 'disc',
            cx: 0,
            cy: 0
          });
          disc.style.r = r + 'px';
          disc.style.fill = COLORS.green;
          disc.style.fillOpacity = String(OPACITY.green);
          disc.style.stroke = 'rgba(255,255,255,.75)';
          disc.style.strokeWidth = '1.5';
          g.appendChild(disc);

          var slots = [];
          var slotWrap = svgEl('g', {
            'class': 'slots'
          });
          for (var k = 0; k < 4; k++) {
            var slot = svgEl('g', {
              'class': 'slot'
            });
            slot.style.opacity = '0';
            slot.appendChild(iconFor(state.mode));
            slotWrap.appendChild(slot);
            slots.push(slot);
          }
          g.appendChild(slotWrap);

          var fault = svgEl('g', {
            'class': 'fault',
            transform: 'translate(15,19)'
          });
          fault.style.opacity = '0';
          fault.appendChild(svgEl('rect', {
            x: -12,
            y: -7.5,
            width: 26,
            height: 15,
            rx: 7.5,
            fill: '#fff',
            stroke: '#f59e0b',
            'stroke-width': 1.4
          }));
          fault.appendChild(wrenchGlyph());
          var faultNum = svgEl('text', {
            x: 6.4,
            y: 3.6,
            'text-anchor': 'middle',
            'font-size': 9.5,
            'font-weight': 700,
            fill: '#b45309'
          }, '0');
          fault.appendChild(faultNum);
          g.appendChild(fault);

          var lock = svgEl('g', {
            'class': 'lock'
          });
          lock.style.opacity = '0';
          lock.appendChild(svgEl('path', {
            d: 'M -7.5 -7.5 L 7.5 7.5 M 7.5 -7.5 L -7.5 7.5',
            stroke: '#dc2626',
            'stroke-width': 4.4,
            'stroke-linecap': 'round'
          }));
          g.appendChild(lock);

          var hit = svgEl('circle', {
            'class': 'hit',
            cx: 0,
            cy: 0,
            r: 29,
            fill: 'transparent',
            'pointer-events': 'all'
          });
          g.appendChild(hit);

          g.addEventListener('mouseenter', function() {
            onEnter(i);
          });
          g.addEventListener('mouseleave', function() {
            onLeave(i);
          });
          g.addEventListener('click', function(ev) {
            ev.stopPropagation();
            onStationClick(i);
          });

          frag.appendChild(g);
          nodes.push({
            g: g,
            disc: disc,
            slots: slots,
            fault: fault,
            faultNum: faultNum,
            lock: lock,
            r: r
          });
        });
        layer.appendChild(frag);
      }

      function buildCollisions() {
        var layer = document.getElementById('collisions');
        layer.innerHTML = '';
        var frag = document.createDocumentFragment();
        COLLISIONS.forEach(function(c, i) {
          var g = svgEl('g', {
            'class': 'collision',
            transform: 'translate(' + c.x + ',' + c.y + ')',
            style: 'cursor:help'
          });
          g.appendChild(svgEl('circle', {
            'class': 'pulse-ring',
            cx: 0,
            cy: 0,
            r: 15,
            fill: 'none',
            stroke: '#dc2626',
            'stroke-width': 1.6
          }));
          g.appendChild(svgEl('path', {
            d: 'M 0 -10.5 L 11 8.5 L -11 8.5 Z',
            fill: '#dc2626',
            stroke: '#fff',
            'stroke-width': 2,
            'stroke-linejoin': 'round'
          }));
          g.appendChild(svgEl('rect', {
            x: -1.4,
            y: -4.4,
            width: 2.8,
            height: 7.2,
            rx: 1.4,
            fill: '#fff'
          }));
          g.appendChild(svgEl('circle', {
            cx: 0,
            cy: 5,
            r: 1.55,
            fill: '#fff'
          }));
          g.appendChild(svgEl('circle', {
            cx: 0,
            cy: 0,
            r: 14,
            fill: 'transparent',
            'pointer-events': 'all'
          }));
          g.addEventListener('mouseenter', function() {
            paintCollisionTip(c);
          });
          g.addEventListener('mouseleave', function() {
            scheduleTipHide();
          });
          frag.appendChild(g);
        });
        layer.appendChild(frag);
      }

      /* ---------- Tooltip ---------- */
      var tip = document.getElementById('tip');
      var mapShell = document.getElementById('mapShell');
      var tipTimer = null;
      var lastTipKey = '';

      function tipKeyFor(i) {
        var s = sample(i, state.t);
        return state.mode + '|' + Math.round(s.bikes) + '|' + Math.round(s.docks) + '|' + Math.round(s.faults) + '|' + fmtClock(state.t);
      }

      function paintStationTip(i) {
        var st = STATIONS[i];
        var s = sample(i, state.t);
        var bikes = st.locked ? 0 : Math.round(s.bikes);
        var docks = st.locked ? 0 : Math.round(s.docks);
        var faults = st.locked ? 0 : Math.round(s.faults);
        var v = state.mode === 'borrow' ? bikes : docks;
        var key = st.locked ? 'locked' : levelKey(v);
        var status;
        if (st.locked) {
          status = '<span class="tip-badge b-locked">Locked for maintenance</span>';
        } else {
          status = '<span class="tip-badge b-' + key + '">Operational</span>';
        }
        var levelLine = st.locked ? 'Locked · hire and returns unavailable' : ('Operational · ' + levelText(v, state.mode));
        tip.innerHTML =
          '<div class="tip-top">' +
          '<span class="dot" style="background:' + COLORS[st.locked ? 'locked' : key] + '"></span>' +
          '<div class="tip-name"><h4>' + esc(st.name) + '</h4>' +
          '<p>' + esc(st.en) + ' · ' + esc(st.area) + ' · ' + st.id + '</p></div>' + status +
          '</div>' +
          '<div class="tip-grid">' +
          '<div><span>Available bikes</span><strong>' + bikes + '<i>bikes</i></strong></div>' +
          '<div><span>Available docks</span><strong>' + docks + '<i>docks</i></strong></div>' +
          '<div><span>Reported faults</span><strong>' + faults + '<i>bikes</i></strong></div>' +
          '<div><span>Station capacity</span><strong>' + st.cap + '<i>spaces</i></strong></div>' +
          '</div>' +
          '<div class="tip-row"><span>Station status</span><b>' + levelLine + '</b></div>' +
          '<div class="tip-foot"><span>Updated ' + DATE + ' ' + fmtClock(state.t) + '</span>' +
          '<a href="insights.html">View station insights →</a></div>';
        placeTip(st.x, st.y);
        tip.classList.add('is-on');
      }

      function paintCollisionTip(c) {
        tip.innerHTML =
          '<div class="tip-top">' +
          '<span class="dot" style="background:#dc2626"></span>' +
          '<div class="tip-name"><h4>' + esc(c.title) + '</h4>' +
          '<p>Historic cycle collision · ' + c.date + '</p></div>' +
          '<span class="tip-badge b-red">Caution</span>' +
          '</div>' +
          '<div class="tip-note">' + c.note + '</div>' +
          '<div class="tip-foot"><span>Source: police collision records · historic archive</span>' +
          '<a href="insights.html">Station insights →</a></div>';
        placeTip(c.x, c.y);
        tip.classList.add('is-on');
      }

      function placeTip(x, y) {
        var W = 272,
          H = 250;
        var left = x - W / 2;
        var top = y - H - 26;
        if (left < 12) left = 12;
        if (left + W > 1428) left = 1428 - W;
        if (top < 12) top = y + 30;
        tip.style.left = left + 'px';
        tip.style.top = top + 'px';
      }

      function hideTip() {
        tip.classList.remove('is-on');
        tip.innerHTML = '';
        lastTipKey = '';
      }

      function scheduleTipHide() {
        if (state.pinnedId !== null) return;
        if (tipTimer) clearTimeout(tipTimer);
        tipTimer = setTimeout(function() {
          hideTip();
        }, 220);
      }

      function cancelTipHide() {
        if (tipTimer) {
          clearTimeout(tipTimer);
          tipTimer = null;
        }
      }

      tip.addEventListener('mouseenter', function() {
        cancelTipHide();
      });
      tip.addEventListener('mouseleave', function() {
        if (state.pinnedId === null) scheduleTipHide();
      });

      function onEnter(i) {
        cancelTipHide();
        state.hoverId = i;
        lastTipKey = '';
        paintStationTip(i);
        render();
      }

      function onLeave(i) {
        state.hoverId = null;
        if (state.pinnedId === null) scheduleTipHide();
        render();
      }

      function onStationClick(i) {
        cancelTipHide();
        state.pinnedId = (state.pinnedId === i) ? null : i;
        if (state.pinnedId === null) {
          hideTip();
        } else {
          lastTipKey = '';
          paintStationTip(i);
        }
        render();
      }

      document.getElementById('mapShell').addEventListener('click', function() {
        if (state.pinnedId !== null) {
          state.pinnedId = null;
          hideTip();
          render();
        }
      });
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && state.pinnedId !== null) {
          state.pinnedId = null;
          hideTip();
          render();
        }
      });

      /* ---------- Render ---------- */
      function render() {
        var t = state.t;
        var mode = state.mode;
        var counts = {
          green: 0,
          amber: 0,
          red: 0,
          locked: 0
        };

        for (var i = 0; i < STATIONS.length; i++) {
          var st = STATIONS[i];
          var n = nodes[i];
          var s = sample(i, t);
          var color, op, icons = 0,
            key;

          if (st.locked) {
            key = 'locked';
            color = COLORS.locked;
            op = OPACITY.locked;
            counts.locked++;
          } else {
            var v = mode === 'borrow' ? s.bikes : s.docks;
            key = levelKey(v);
            color = COLORS[key];
            op = OPACITY[key];
            icons = v <= 0.0001 ? 0 : clamp(Math.ceil(v - 0.0001), 1, 4);
            counts[key]++;
          }

          var hovered = (state.hoverId === i) || (state.pinnedId === i);
          n.disc.classList.toggle('is-critical', key === 'red' && !st.locked);
          n.disc.style.fill = color;
          n.disc.style.fillOpacity = String(hovered ? 0.92 : op);
          n.disc.style.r = (hovered ? n.r * 1.15 : n.r) + 'px';
          n.disc.style.stroke = hovered ? '#ffffff' : 'rgba(255,255,255,.75)';
          n.disc.style.strokeWidth = hovered ? '3' : '1.5';

          var pos = SLOT_POS[icons] || [];
          for (var k = 0; k < 4; k++) {
            var slot = n.slots[k];
            var on = k < icons;
            var p = on ? pos[k] : [0, 0];
            slot.style.opacity = on ? '1' : '0';
            slot.style.transform = 'translate(' + p[0] + 'px,' + p[1] + 'px) scale(' + (on ? 1 : 0.3) + ')';
          }

          var faults = st.locked ? 0 : Math.round(s.faults);
          n.fault.style.opacity = faults > 0 ? '1' : '0';
          if (n.faultNum.textContent !== String(faults)) n.faultNum.textContent = String(faults);
          n.lock.style.opacity = st.locked ? '1' : '0';
        }

        document.getElementById('cGreen').textContent = String(counts.green);
        document.getElementById('cAmber').textContent = String(counts.amber);
        document.getElementById('cRed').textContent = String(counts.red);
        document.getElementById('cLocked').textContent = String(counts.locked);
        document.getElementById('roGreen').textContent = 'Green ' + counts.green;
        document.getElementById('roAmber').textContent = 'Amber ' + counts.amber;
        document.getElementById('roRed').textContent = 'Red ' + counts.red;

        var clock = fmtClock(t);
        document.getElementById('clock').textContent = clock;
        document.getElementById('roTime').textContent = clock;

        if (state.hoverId !== null) {
          var kk = tipKeyFor(state.hoverId);
          if (kk !== lastTipKey) {
            lastTipKey = kk;
            paintStationTip(state.hoverId);
          }
        } else if (state.pinnedId !== null) {
          var kk2 = tipKeyFor(state.pinnedId);
          if (kk2 !== lastTipKey) {
            lastTipKey = kk2;
            paintStationTip(state.pinnedId);
          }
        }
      }

      /* ---------- Timeline ---------- */
      var track = document.getElementById('track');
      var tlFill = document.getElementById('tlFill');
      var tlKnob = document.getElementById('tlKnob');
      var playBtn = document.getElementById('playBtn');

      function buildTicks() {
        var wrap = document.getElementById('tlTicks');
        wrap.innerHTML = '';
        HOURS.forEach(function(h) {
          var s = document.createElement('span');
          s.textContent = pad2(h) + ':00';
          wrap.appendChild(s);
        });
      }

      function setTime(t) {
        state.t = clamp(t, 0, HOURS.length - 1);
        var pct = (state.t / (HOURS.length - 1)) * 100;
        tlFill.style.width = pct + '%';
        tlKnob.style.left = pct + '%';
        track.setAttribute('aria-valuenow', (HOURS[0] + state.t).toFixed(2));
        render();
      }

      var dragging = false;

      function ratioFromX(clientX) {
        var r = track.getBoundingClientRect();
        return clamp((clientX - r.left) / r.width, 0, 1);
      }
      track.addEventListener('pointerdown', function(e) {
        dragging = true;
        stopPlay();
        cancelTipHide();
        if (track.setPointerCapture) {
          try {
            track.setPointerCapture(e.pointerId);
          } catch (err) {}
        }
        setTime(ratioFromX(e.clientX) * (HOURS.length - 1));
        e.preventDefault();
      });
      track.addEventListener('pointermove', function(e) {
        if (!dragging) return;
        setTime(ratioFromX(e.clientX) * (HOURS.length - 1));
      });

      function endDrag(e) {
        if (!dragging) return;
        dragging = false;
        if (e && e.pointerId !== undefined && track.releasePointerCapture) {
          try {
            track.releasePointerCapture(e.pointerId);
          } catch (err) {}
        }
      }
      track.addEventListener('pointerup', endDrag);
      track.addEventListener('pointercancel', endDrag);
      window.addEventListener('pointerup', endDrag);
      track.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          stopPlay();
          setTime(state.t + 0.25);
          e.preventDefault();
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          stopPlay();
          setTime(state.t - 0.25);
          e.preventDefault();
        }
      });

      function startPlay() {
        if (state.playing) return;
        state.playing = true;
        playBtn.textContent = 'Pause';
        state.timer = setInterval(function() {
          var next = state.t + 0.085;
          if (next > HOURS.length - 1) next = 0;
          setTime(next);
        }, 60);
      }

      function stopPlay() {
        if (!state.playing) return;
        state.playing = false;
        playBtn.textContent = 'Play';
        if (state.timer) {
          clearInterval(state.timer);
          state.timer = null;
        }
      }
      playBtn.addEventListener('click', function() {
        if (state.playing) {
          stopPlay();
        } else {
          startPlay();
        }
      });

      /* ---------- Mode switch ---------- */
      var modeCap = document.getElementById('modeCap');
      var roMode = document.getElementById('roMode');
      var CAP_TEXT = {
        borrow: 'Marker colour = available bikes · Green: 6+ · Amber: 1–5 · Red: none available',
        return: 'Marker colour = available docks · Green: 6+ · Amber: 1–5 · Red: no docks available'
      };

      function syncIcons() {
        nodes.forEach(function(n) {
          n.slots.forEach(function(slot) {
            while (slot.firstChild) slot.removeChild(slot.firstChild);
            slot.appendChild(iconFor(state.mode));
          });
        });
      }
      Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function(btn) {
        btn.addEventListener('click', function() {
          var m = btn.getAttribute('data-mode');
          if (m === state.mode) return;
          state.mode = m;
          Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function(b) {
            b.classList.toggle('is-active', b === btn);
          });
          modeCap.textContent = CAP_TEXT[m];
          roMode.textContent = (m === 'borrow' ? 'Borrow mode · Available bikes' : 'Return mode · Available docks');
          syncIcons();
          render();
          if (state.pinnedId !== null) {
            lastTipKey = '';
            paintStationTip(state.pinnedId);
          }
        });
      });

      /* ---------- Viewport fitting ---------- */
      function fitStage() {
        var wrap = document.getElementById('stageWrap');
        var stage = document.getElementById('stage');
        var s = Math.min(wrap.clientWidth / 1440, wrap.clientHeight / 900, 1);
        stage.style.transform = 'scale(' + s + ')';
      }

      function applyDataset(data) {
        HOURS = data.meta.hours;
        DATE = data.meta.date;
        STATIONS = data.stations.map(function(station) {
          return {
            id: station.id,
            name: station.name,
            en: station.name,
            area: station.area,
            x: station.x,
            y: station.y,
            cap: station.capacity,
            locked: station.locked,
            history: station.history
          };
        });
        COLLISIONS = data.collisions || [];
        SERIES = STATIONS.map(function(station) {
          return {
            id: station.id,
            hours: station.history.map(function(item) {
              return {
                h: item.hour,
                bikes: item.bikes,
                docks: item.docks,
                faults: item.faults
              };
            })
          };
        });

        var sourceLabel = document.getElementById('sourceLabel');
        sourceLabel.textContent = DATE + ' · Data source: ' + data.meta.source;

        buildBlocks();
        buildStations();
        buildCollisions();
        buildTicks();
        setTime(state.t);
      }

      async function loadAndRenderData() {
        var dataStatus = document.getElementById('dataStatus');
        dataStatus.classList.remove('is-error');
        dataStatus.classList.remove('is-fallback');
        dataStatus.innerHTML = '<i></i>Loading data';

        var previousError = document.querySelector('.data-error');
        if (previousError) previousError.remove();

        try {
          var data = await window.BikeDataService.loadDashboardData();
          applyDataset(data);
          var statusText = 'API Data';
          if (data.meta.loadMode === 'demo') statusText = 'Demo Data';
          if (data.meta.loadMode === 'fallback') {
            statusText = 'Demo Fallback';
            dataStatus.classList.add('is-fallback');
          }
          dataStatus.innerHTML = '<i></i>' + statusText;
        } catch (error) {
          console.error(error);
          dataStatus.classList.add('is-error');
          dataStatus.textContent = 'Data unavailable';
          document.getElementById('mapShell').insertAdjacentHTML(
            'beforeend',
            '<div class="data-error"><strong>Unable to load data.</strong><br />Run the project through VS Code Live Server and check assets/js/config.js.</div>'
          );
        }
      }

      async function initialiseApp() {
        await loadAndRenderData();
        fitStage();
        window.addEventListener('resize', fitStage);

        if (!window.APP_CONFIG.useDemoData && window.APP_CONFIG.refreshIntervalMs > 0) {
          window.setInterval(loadAndRenderData, window.APP_CONFIG.refreshIntervalMs);
        }
      }

      initialiseApp();
