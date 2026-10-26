'use strict';

      var siteState = BikeSite.read();
      var activeDate = siteState.date || null;
      var firstDatasetApplied = false;
      var NS = 'http://www.w3.org/2000/svg';
      var HOURS = [];
      var DATE = '';
      var STATIONS = [];
      var COLLISIONS = [];
      var map = null;
      var stationLayer = null;
      var collisionLayer = null;
      var DATA_META = {};
      var hasFittedMap = false;
      var isRefreshing = false;

      var COLORS = {
        green: '#16a34a',
        amber: '#f59e0b',
        red: '#dc2626',
        locked: '#94a3b8'
      };
      var OPACITY = {
        green: 0.68,
        amber: 0.72,
        red: 0.72,
        locked: 0.65
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
        var selected = HOURS[Math.round(clamp(t, 0, Math.max(0, HOURS.length - 1)))];
        var st = STATIONS[i];
        var item = selected ? BikeContract.snapshotAt(st.history, selected) : null;
        var reference = selected;
        if (selected && DATA_META.mode !== 'demo' && Math.round(t) === HOURS.length - 1 && DATA_META.date === new Date().toISOString().slice(0, 10)) reference = new Date().toISOString();
        var status = BikeContract.status(item, state.mode, reference, DATA_META.staleAfterSeconds);
        st.locked = status === 'closed';
        st.unknown = status === 'unknown';
        st.cap = item && item.capacity !== null ? item.capacity : null;
        return item || { bikes: null, docks: null, faults: null, capacity: null, recordedAt: null, isOperational: null };
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
        var timestamp = HOURS[Math.round(clamp(t, 0, Math.max(0, HOURS.length - 1)))];
        return timestamp ? timestamp.slice(11, 16) : '—';
      }

      var state = {
        mode: siteState.mode || 'borrow',
        t: 1.5,
        hoverId: null,
        pinnedId: null,
        playing: false,
        timer: null
      };

      /* ---------- Geographic map, original visual shell ---------- */
      function initMap() {
        if (!window.L) throw new Error('Leaflet is unavailable. Run npm install.');
        map = L.map('map', { zoomControl: true }).setView(APP_CONFIG.map.center, APP_CONFIG.map.zoom);
        L.tileLayer(APP_CONFIG.map.tileUrl, { attribution: APP_CONFIG.map.attribution, maxZoom: APP_CONFIG.map.maxZoom })
          .on('tileerror', function() { document.querySelector('.map-hint').textContent = 'Map tiles unavailable · check your connection. Station samples remain available.'; }).addTo(map);
        stationLayer = L.layerGroup().addTo(map);
        collisionLayer = L.layerGroup().addTo(map);
        map.on('move zoom', function() {
          if (state.pinnedId !== null) paintStationTip(state.pinnedId);
          else if (state.hoverId !== null) paintStationTip(state.hoverId);
        });
      }

      function attachMapGlyph(group, lat, lon, layer, title) {
        group.removeAttribute('transform');
        var svg = svgEl('svg', { width: 90, height: 90, viewBox: '-45 -45 90 90', 'aria-hidden': 'true' });
        svg.appendChild(group);
        var marker = L.marker([lat, lon], { icon: L.divIcon({ html: svg, className: 'bike-map-marker', iconSize: [90, 90], iconAnchor: [45, 45] }), title: title, alt: title });
        marker.addTo(layer);
        return marker;
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
        stationLayer.clearLayers();
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
          disc.style.stroke = '#ffffff';
          disc.style.strokeWidth = '2';
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
        nodes.forEach(function(n, i) {
          var st = STATIONS[i];
          n.marker = attachMapGlyph(n.g, st.lat, st.lon, stationLayer, st.name);
          n.marker.on('click', function(e) {
            if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
            onStationClick(i);
          });
        });
      }

      function buildCollisions() {
        var layer = document.getElementById('collisions');
        layer.innerHTML = '';
        collisionLayer.clearLayers();
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
        Array.from(layer.children).forEach(function(group, i) {
          var c = COLLISIONS[i];
          attachMapGlyph(group, c.lat, c.lon, collisionLayer, c.title).on('click', function() { paintCollisionTip(c); });
        });
      }

      /* ---------- Tooltip ---------- */
      var tip = document.getElementById('tip');
      var mapShell = document.getElementById('mapShell');
      var tipTimer = null;
      var lastTipKey = '';

      function tipKeyFor(i) {
        var s = sample(i, state.t);
        return state.mode + '|' + s.bikes + '|' + s.docks + '|' + s.faults + '|' + fmtClock(state.t) + '|' + STATIONS[i].locked + '|' + STATIONS[i].unknown;
      }

      function paintStationTip(i) {
        var st = STATIONS[i];
        if (!st || !map) return;
        var s = sample(i, state.t);
        var value = state.mode === 'borrow' ? s.bikes : s.docks;
        var key = st.locked || st.unknown ? 'locked' : levelKey(value);
        var status = st.locked ? 'Closed' : st.unknown ? 'Unknown / stale' : 'Operational';
        var availability = st.locked ? 'Hire and returns unavailable' : st.unknown ? 'No fresh, verified status at this time' : levelText(value, state.mode);
        function number(value) { return value === null ? '—' : value; }
        tip.innerHTML =
          '<div class="tip-top"><span class="dot" style="background:' + COLORS[key] + '"></span>' +
          '<div class="tip-name"><h4>' + esc(st.name) + '</h4><p>' + esc(st.id) + (st.area ? ' · ' + esc(st.area) : '') + '</p></div>' +
          '<span class="tip-badge b-' + key + '">' + status + '</span></div>' +
          '<div class="tip-grid"><div><span>Available bikes</span><strong>' + number(s.bikes) + '<i>bikes</i></strong></div>' +
          '<div><span>Available docks</span><strong>' + number(s.docks) + '<i>docks</i></strong></div>' +
          '<div><span>Reported faults</span><strong>' + number(s.faults) + '<i>bikes</i></strong></div>' +
          '<div><span>Station capacity</span><strong>' + number(s.capacity) + '<i>spaces</i></strong></div></div>' +
          '<div class="tip-row"><span>Station status</span><b>' + availability + '</b></div>' +
          '<div class="tip-foot"><span>' + (s.recordedAt ? esc(s.recordedAt.slice(11, 16)) + ' UTC · ' + (DATA_META.mode === 'demo' ? 'Synthetic sample' : 'Collected sample') : 'No observation') + '</span>' +
          '<a href="' + BikeSite.url('insights', { station: st.id, date: DATA_META.date, time: HOURS[Math.round(state.t)], mode: state.mode }) + '">View station insights →</a></div>';
        var point = map.latLngToContainerPoint([st.lat, st.lon]);
        placeTip(point.x, point.y);
        tip.classList.add('is-on');
      }

      function paintCollisionTip(c) {
        tip.innerHTML =
          '<div class="tip-top">' +
          '<span class="dot" style="background:#dc2626"></span>' +
          '<div class="tip-name"><h4>' + esc(c.title) + '</h4>' +
          '<p>' + (DATA_META.mode === 'demo' ? 'Synthetic collision example' : 'Historic cycle collision') + ' · ' + esc(c.date) + '</p></div>' +
          '<span class="tip-badge b-red">Caution</span>' +
          '</div>' +
          '<div class="tip-note">' + esc(c.note) + '</div>' +
          '<div class="tip-foot"><span>Source: ' + esc(c.source) + '</span>' +
          '<a href="insights.html">Station insights →</a></div>';
        var point = map.latLngToContainerPoint([c.lat, c.lon]);
        placeTip(point.x, point.y);
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

          if (st.locked || st.unknown) {
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
          n.disc.style.fillOpacity = String(hovered ? 0.94 : op);
          n.disc.style.r = (hovered ? n.r * 1.15 : n.r) + 'px';
          n.disc.style.stroke = '#ffffff';
          n.disc.style.strokeWidth = hovered ? '3' : '2';

          var pos = SLOT_POS[icons] || [];
          for (var k = 0; k < 4; k++) {
            var slot = n.slots[k];
            var on = k < icons;
            var p = on ? pos[k] : [0, 0];
            slot.style.opacity = on ? '1' : '0';
            slot.style.transform = 'translate(' + p[0] + 'px,' + p[1] + 'px) scale(' + (on ? 1 : 0.3) + ')';
          }

          var faults = st.locked || st.unknown || s.faults === null ? 0 : s.faults;
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

        BikeSite.update({ station: state.pinnedId !== null && STATIONS[state.pinnedId] ? STATIONS[state.pinnedId].id : null, date: DATA_META.date || null, time: HOURS[Math.round(state.t)] || null, mode: state.mode });

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
        var labelStep = Math.max(1, Math.ceil((HOURS.length - 1) / 10));
        HOURS.forEach(function(h, i) {
          if (i % labelStep !== 0 && i !== HOURS.length - 1) return;
          var s = document.createElement('span');
          s.textContent = h.slice(11, 16);
          wrap.appendChild(s);
        });
      }

      function setTime(t) {
        state.t = Math.round(clamp(t, 0, Math.max(0, HOURS.length - 1)));
        var pct = HOURS.length > 1 ? (state.t / (HOURS.length - 1)) * 100 : 0;
        tlFill.style.width = pct + '%';
        tlKnob.style.left = pct + '%';
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', String(Math.max(0, HOURS.length - 1)));
        track.setAttribute('aria-valuenow', String(state.t));
        track.setAttribute('aria-valuetext', fmtClock(state.t) + ' UTC');
        track.setAttribute('aria-disabled', HOURS.length < 2 ? 'true' : 'false');
        render();
      }

      var dragging = false;

      function ratioFromX(clientX) {
        var r = track.getBoundingClientRect();
        return clamp((clientX - r.left) / r.width, 0, 1);
      }
      track.addEventListener('pointerdown', function(e) {
        if (HOURS.length < 2) return;
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
          setTime(state.t + 1);
          e.preventDefault();
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          stopPlay();
          setTime(state.t - 1);
          e.preventDefault();
        }
      });

      function startPlay() {
        if (state.playing || HOURS.length < 2) return;
        state.playing = true;
        playBtn.textContent = 'Pause';
        state.timer = setInterval(function() {
          var next = state.t + 1;
          if (next > HOURS.length - 1) next = 0;
          setTime(next);
        }, 650);
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
        var scale = Math.min(wrap.clientWidth / 1440, wrap.clientHeight / 900, 1);
        stage.style.transform = 'scale(' + scale + ')';
        if (map) map.invalidateSize({ pan: false });
      }

      function applyDataset(data) {
        var previousTime = firstDatasetApplied ? HOURS[Math.round(state.t)] : siteState.time;
        var selectedId = state.pinnedId !== null && STATIONS[state.pinnedId] ? STATIONS[state.pinnedId].id : (!firstDatasetApplied ? siteState.station : null);
        DATA_META = data.meta;
        activeDate = data.meta.date;
        firstDatasetApplied = true;
        HOURS = data.meta.timestamps;
        DATE = data.meta.date || 'No observations';
        STATIONS = data.stations.map(function(station) {
          var latest = station.history[station.history.length - 1];
          return { id: station.id, name: station.name, area: station.area, lat: station.lat, lon: station.lon, x: 0, y: 0, cap: latest ? latest.capacity : null, locked: false, unknown: false, history: station.history };
        });
        COLLISIONS = data.collisions;
        state.hoverId = null;
        state.pinnedId = selectedId ? STATIONS.findIndex(function(st) { return st.id === selectedId; }) : null;
        if (state.pinnedId === -1) state.pinnedId = null;
        hideTip(); lastTipKey = '';
        document.getElementById('sourceLabel').textContent = DATE + ' · UTC · ' + (data.meta.mode === 'demo' ? 'Synthetic demo data' : data.meta.source);
        document.querySelector('.tl-kicker').textContent = data.meta.mode === 'demo' ? 'Demo Playback' : 'Historical Playback';
        document.querySelector('.map-hint').textContent = !STATIONS.length ? 'Data placeholder · add stations and observations using the template JSON.' : !HOURS.length ? 'No observations for this date.' : data.meta.mode === 'demo' ? 'Synthetic demo data · drag the timeline to test availability changes.' : 'Drag the timeline to explore collected observations · times in UTC.';
        playBtn.disabled = HOURS.length < 2;
        if (playBtn.disabled) stopPlay();
        buildStations(); buildCollisions(); buildTicks();
        if (!hasFittedMap && STATIONS.length) {
          map.fitBounds(STATIONS.map(function(st) { return [st.lat, st.lon]; }), { paddingTopLeft: [300, 70], paddingBottomRight: [240, 65], maxZoom: 14 });
          hasFittedMap = true;
        }
        var nextIndex = previousTime ? HOURS.indexOf(previousTime) : -1;
        setTime(nextIndex >= 0 ? nextIndex : Math.min(1, Math.max(0, HOURS.length - 1)));
      }

      async function loadAndRenderData() {
        if (isRefreshing) return;
        isRefreshing = true;
        var dataStatus = document.getElementById('dataStatus');
        dataStatus.classList.remove('is-error');
        try {
          var data = await BikeDataService.loadDashboardData(activeDate || undefined);
          applyDataset(data);
          dataStatus.innerHTML = '<i></i>' + ({ demo: 'Demo Data', json: 'JSON Data', mysql: 'MySQL Data' }[data.meta.mode] || 'Data');
          var previousError = document.querySelector('.data-error');
          if (previousError) previousError.remove();
        } catch (error) {
          console.error(error);
          stopPlay();
          dataStatus.classList.add('is-error');
          dataStatus.textContent = 'Data unavailable';
          document.querySelector('.map-hint').textContent = 'Unable to load data · check the server configuration. Previous samples may be outdated.';
        } finally { isRefreshing = false; }
      }

      async function initialiseApp() {
        try { initMap(); } catch (error) { document.getElementById('dataStatus').textContent = error.message; return; }
        document.querySelectorAll('.mode-btn').forEach(function(button) {
          var active = button.getAttribute('data-mode') === state.mode;
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
        });
        modeCap.textContent = CAP_TEXT[state.mode];
        roMode.textContent = state.mode === 'borrow' ? 'Borrow mode · Available bikes' : 'Return mode · Available docks';
        fitStage();
        await loadAndRenderData();
        window.addEventListener('resize', fitStage);

        if (window.APP_CONFIG.refreshIntervalMs > 0) {
          window.setInterval(loadAndRenderData, window.APP_CONFIG.refreshIntervalMs);
        }
      }

      initialiseApp();
