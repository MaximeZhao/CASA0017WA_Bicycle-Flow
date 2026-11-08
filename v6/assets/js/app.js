'use strict';

      var siteState = BikeSite.read();
      var activeDate = siteState.date || null;
      var followLatest = !siteState.time;
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
      var places = [];
      var searchMatches = [];
      var searchIndex = -1;

      var COLORS = {
        green: '#16a34a',
        amber: '#f59e0b',
        red: '#dc2626',
        locked: '#94a3b8'
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
        var item = selected ? BikeTimeline.freshSnapshot(st.history, selected, DATA_META.staleAfterSeconds) : null;
        var reference = selected;

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
        return BikeTimeline.clock(timestamp);
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
        map = L.map('map', { zoomControl: true, attributionControl: false }).setView(APP_CONFIG.map.center, APP_CONFIG.map.zoom);
        L.tileLayer(APP_CONFIG.map.tileUrl, { attribution: APP_CONFIG.map.attribution, maxZoom: APP_CONFIG.map.maxZoom })
          .on('tileerror', function() { document.querySelector('.map-hint').textContent = 'Map tiles unavailable · check your connection. Station samples remain available.'; }).addTo(map);
        stationLayer = L.layerGroup().addTo(map);
        collisionLayer = L.layerGroup().addTo(map);
        document.getElementById('collisionToggle').addEventListener('click', function(event) {
          event.stopPropagation();
          var enabled = !map.hasLayer(collisionLayer);
          if (enabled) collisionLayer.addTo(map); else map.removeLayer(collisionLayer);
          this.setAttribute('aria-checked', String(enabled));
        });
        map.on('zoomend moveend', refreshStationClusters);
        map.on('move zoom', function() {
          if (state.pinnedId !== null) paintStationTip(state.pinnedId);
          else if (state.hoverId !== null) paintStationTip(state.hoverId);
        });
      }

      /* ---------- Local area and station search ---------- */
      var searchInput = document.getElementById('placeSearch');
      var searchResults = document.getElementById('placeResults');
      var searchStatus = document.getElementById('searchStatus');
      function closeSearch() {
        searchResults.hidden = true;
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.removeAttribute('aria-activedescendant');
        searchIndex = -1;
      }
      function choosePlace(place) {
        closeSearch();
        searchInput.value = place.name;
        if (place.type === 'area') {
          state.pinnedId = null;
          state.hoverId = null;
          hideTip();
          map.fitBounds(place.bounds, { padding: [55, 65], maxZoom: 15 });
          searchStatus.textContent = 'Showing ' + place.name + ', ' + place.count + ' selected stations.';
        } else {
          map.setView([place.lat, place.lon], Math.max(16, map.getZoom()));
          state.pinnedId = STATIONS.findIndex(function(station) { return station.id === place.id; });
          if (state.pinnedId < 0) state.pinnedId = null;
          searchStatus.textContent = 'Selected ' + place.name + '.';
        }
        render();
      }
      function showSearch() {
        searchMatches = BikePlaces.search(places, searchInput.value);
        searchIndex = -1;
        searchInput.removeAttribute('aria-activedescendant');
        searchResults.replaceChildren();
        if (!searchInput.value.trim()) return closeSearch();
        searchResults.hidden = false;
        searchInput.setAttribute('aria-expanded', 'true');
        if (!searchMatches.length) {
          var empty = document.createElement('li');
          empty.className = 'search-empty';
          empty.textContent = places.length ? 'No matching area or station in this dataset.' : 'Station data is still loading. Try again shortly.';
          empty.setAttribute('role', 'presentation');
          searchResults.appendChild(empty);
        }
        searchMatches.forEach(function(place, i) {
          var row = document.createElement('li');
          row.id = 'place-result-' + i;
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', 'false');
          var name = document.createElement('strong'); name.textContent = place.name;
          var detail = document.createElement('small');
          detail.textContent = place.type === 'area' ? 'Area · ' + place.count + ' selected stations' : 'Cycle hire station';
          row.append(name, detail);
          row.addEventListener('mousedown', function(e) { e.preventDefault(); });
          row.addEventListener('click', function() { choosePlace(place); });
          searchResults.appendChild(row);
        });
        searchStatus.textContent = searchMatches.length ? searchMatches.length + ' results. Use the arrow keys and Enter to select.' : 'No matching area or station in this dataset.';
      }
      searchInput.addEventListener('input', showSearch);
      searchInput.addEventListener('focus', function() { if (searchInput.value) showSearch(); });
      searchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') { closeSearch(); return; }
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        if (searchResults.hidden) showSearch();
        if (!searchMatches.length) return;
        searchIndex = searchIndex < 0 ? (e.key === 'ArrowDown' ? 0 : searchMatches.length - 1) :
          (searchIndex + (e.key === 'ArrowDown' ? 1 : -1) + searchMatches.length) % searchMatches.length;
        searchResults.querySelectorAll('[role=option]').forEach(function(row, i) { row.setAttribute('aria-selected', String(i === searchIndex)); });
        var active = document.getElementById('place-result-' + searchIndex);
        searchInput.setAttribute('aria-activedescendant', active.id);
        active.scrollIntoView({ block: 'nearest' });
      });
      document.getElementById('placeSearchForm').addEventListener('submit', function(e) {
        e.preventDefault();
        if (searchResults.hidden) showSearch();
        if (searchMatches.length) choosePlace(searchMatches[Math.max(0, searchIndex)]);
      });
      document.addEventListener('click', function(e) { if (!document.getElementById('placeSearchForm').contains(e.target)) closeSearch(); });

      function attachMapGlyph(group, lat, lon, layer, title) {
        group.removeAttribute('transform');
        var svg = svgEl('svg', { width: 64, height: 74, viewBox: '-32 -32 64 74', 'aria-hidden': 'true' });
        svg.appendChild(group);
        var marker = L.marker([lat, lon], { icon: L.divIcon({ html: svg, className: 'bike-map-marker', iconSize: [64, 74], iconAnchor: [32, 32] }), title: title, alt: title });
        marker.addTo(layer);
        return marker;
      }

      /* ---------- Map icons ---------- */
      function bikeGlyph() {
        var group = svgEl('g', { 'class': 'icon' });
        group.appendChild(svgEl('image', {
          href: '/assets/images/station-bike.svg', x: -13, y: -13, width: 26, height: 26
        }));
        return group;
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
          var r = 19;
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
          disc.style.fill = '#ffffff';
          disc.style.fillOpacity = '1';
          disc.style.stroke = COLORS.green;
          disc.style.strokeWidth = '4';
          g.appendChild(disc);

          var icon = bikeGlyph();
          g.appendChild(icon);
          var countBadge = svgEl('g', { 'class': 'station-count' });
          countBadge.appendChild(svgEl('rect', { x: -15, y: 24, width: 30, height: 16, rx: 4, fill: 'white', stroke: '#cbd5e1' }));
          var countText = svgEl('text', { x: 0, y: 35.5, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#17243a' }, '—');
          countBadge.appendChild(countText);
          g.appendChild(countBadge);

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

          var hit = svgEl('circle', {
            'class': 'hit',
            cx: 0,
            cy: 0,
            r: 24,
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
            icon: icon,
            countText: countText,
            fault: fault,
            faultNum: faultNum,
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

      var stationClusters = [];
      var collisionWarningSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="white" stroke="#dc2626" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 23 21H1Z"/><path d="M12 8v6" stroke-linecap="round"/><circle cx="12" cy="17.5" r="1.15" fill="#dc2626" stroke="none"/></svg>';
      function refreshStationClusters() {
        if (!map || !stationLayer) return;
        stationClusters.forEach(function(marker) { stationLayer.removeLayer(marker); });
        stationClusters = [];
        var groups = {};
        nodes.forEach(function(n, i) {
          if (!n.marker) return;
          var point = map.project(n.marker.getLatLng(), map.getZoom());
          var key = map.getZoom() >= 15 ? String(i) : Math.floor(point.x / 28) + ':' + Math.floor(point.y / 28);
          (groups[key] || (groups[key] = [])).push({node:n, station:STATIONS[i]});
        });
        Object.keys(groups).forEach(function(key) {
          var entries = groups[key];
          if (entries.length === 1) { entries[0].node.marker.addTo(stationLayer); return; }
          entries.forEach(function(entry) { stationLayer.removeLayer(entry.node.marker); });
          var lat = entries.reduce(function(sum,entry) { return sum+entry.station.lat; },0)/entries.length;
          var lon = entries.reduce(function(sum,entry) { return sum+entry.station.lon; },0)/entries.length;
          var html = '<div style="width:34px;height:34px;border-radius:50%;background:'+(entries.every(function(entry){return entry.station.unknown;})?'#94a3b8':'#3154bd')+';color:white;border:3px solid white;box-shadow:0 2px 8px #0003;display:grid;place-items:center;font:600 14px system-ui">'+entries.length+'</div>';
          var marker = L.marker([lat,lon], {icon:L.divIcon({html:html,className:'station-cluster',iconSize:[40,40],iconAnchor:[20,20]}),title:entries.length+' original stations · click to expand'}).addTo(stationLayer);
          marker.bindTooltip(entries.map(function(entry) { return esc(entry.station.name); }).join('<br>'));
          marker.on('click',function() { map.fitBounds(entries.map(function(entry) { return [entry.station.lat,entry.station.lon]; }), {padding:[70,70],maxZoom:17}); });
          stationClusters.push(marker);
        });
      }
      function buildCollisions() {
        document.getElementById('collisions').innerHTML = '';
        collisionLayer.clearLayers();
        // Map-only spatial sample; keep COLLISIONS intact for station safety statistics.
        var candidates = COLLISIONS.slice().sort(function(a,b) { return b.date.localeCompare(a.date) || a.id.localeCompare(b.id); });
        var sample = [];
        var nearest = candidates.map(function() { return Infinity; });
        var next = 0;
        while (sample.length < Math.min(100, candidates.length)) {
          var chosen = candidates[next];
          sample.push(chosen);
          nearest[next] = -1;
          var farthest = -1;
          candidates.forEach(function(c,i) {
            if (nearest[i] < 0) return;
            var dy = c.lat-chosen.lat, dx = (c.lon-chosen.lon)*0.622;
            nearest[i] = Math.min(nearest[i], dx*dx+dy*dy);
            if (nearest[i] > farthest) { farthest=nearest[i]; next=i; }
          });
        }
        document.querySelector('.map-hint').textContent = STATIONS.length+' original stations · '+sample.length+' collision samples · Grey = no fresh observation · London time.';
        sample.forEach(function(c) {
          L.marker([c.lat,c.lon], {icon:L.divIcon({html:collisionWarningSvg,className:'collision-map-marker',iconSize:[22,22],iconAnchor:[11,11]}),title:'Historic collision · '+c.date,alt:'Historic collision · '+c.date,zIndexOffset:-100}).addTo(collisionLayer)
            .on('click',function() { paintCollisionTip(c); });
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
          '<button type="button" class="tip-close" aria-label="Close station details">×</button><div class="tip-top"><span class="dot" style="background:' + COLORS[key] + '"></span>' +
          '<div class="tip-name"><h4>' + esc(st.name) + '</h4><p>' + esc(st.id) + (st.area ? ' · ' + esc(st.area) : '') + '</p></div>' +
          '<span class="tip-badge b-' + key + '">' + status + '</span></div>' +
          '<div class="tip-grid"><div><span>Available bikes</span><strong>' + number(s.bikes) + '<i>bikes</i></strong></div>' +
          '<div><span>Available docks</span><strong>' + number(s.docks) + '<i>docks</i></strong></div>' +
          '<div><span>Reported faults</span><strong>' + number(s.faults) + '<i>bikes</i></strong></div>' +
          '<div><span>Station capacity</span><strong>' + number(s.capacity) + '<i>spaces</i></strong></div></div>' +
          '<div class="tip-row"><span>Station status</span><b>' + availability + '</b></div>' +
          '<div class="tip-foot"><span>' + (s.recordedAt ? esc(BikeTimeline.clock(s.recordedAt)) + ' London · ' + (DATA_META.mode === 'demo' ? 'Synthetic sample' : 'Collected sample') : 'No observation') + '</span>' +
          '<a href="' + BikeSite.url('flow', { station: st.id, date: DATA_META.date, time: HOURS[Math.round(state.t)], mode: state.mode }) + '">View daily flow →</a></div>';
        var point = map.latLngToContainerPoint([st.lat, st.lon]);
        placeTip(point.x, point.y);
        tip.classList.add('is-on');
      }

      function paintCollisionTip(c) {
        tip.innerHTML =
          '<button type="button" class="tip-close" aria-label="Close location details">×</button><div class="tip-top">' +
          '<span class="collision-tip-icon">' + collisionWarningSvg + '</span>' +
          '<div class="tip-name"><h4>' + esc(c.title) + '</h4>' +
          '<p>' + (DATA_META.mode === 'demo' ? 'Synthetic collision example' : 'Historic cycle collision') + ' · ' + esc(c.date) + '</p></div>' +
          '<span class="tip-badge b-red">Caution</span>' +
          '</div>' +
          '<div class="tip-note">' + esc(c.note) + '</div>' +
          '<div class="tip-foot"><span>Source: ' + esc(c.source) + '</span>' +
          '<a href="' + BikeSite.url('flow', BikeSite.read()) + '">Daily flow →</a></div>';
        var point = map.latLngToContainerPoint([c.lat, c.lon]);
        placeTip(point.x, point.y);
        tip.classList.add('is-on');
      }

      function placeTip(x, y) {
        if (mapShell.clientWidth <= 640) {
          tip.style.left = '12px'; tip.style.top = 'auto'; tip.style.bottom = '12px';
          return;
        }
        tip.style.bottom = 'auto';
        var W = tip.offsetWidth || 292,
          H = tip.offsetHeight || 270;
        var left = x - W / 2;
        var top = y - H - 26;
        left = clamp(left, 12, Math.max(12, mapShell.clientWidth - W - 12));
        if (top < 12) top = y + 30;
        top = clamp(top, 12, Math.max(12, mapShell.clientHeight - H - 12));
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
      tip.addEventListener('click', function(e) {
        e.stopPropagation();
        if (e.target.closest('.tip-close')) { state.pinnedId = null; state.hoverId = null; hideTip(); render(); }
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

      document.getElementById('mapShell').addEventListener('click', function(event) {
        if (event.target.closest('.map-tools, .tools-toggle, .map-mode-control, .map-readout')) return;
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
          var color, key;

          if (st.locked || st.unknown) {
            key = 'locked';
            color = COLORS.locked;
            counts.locked++;
          } else {
            var v = mode === 'borrow' ? s.bikes : s.docks;
            key = levelKey(v);
            color = COLORS[key];
            counts[key]++;
          }

          var hovered = (state.hoverId === i) || (state.pinnedId === i);
          n.disc.style.fill = '#ffffff';
          n.disc.style.fillOpacity = '1';
          n.disc.style.r = (hovered ? n.r * 1.08 : n.r) + 'px';
          n.disc.style.stroke = color;
          n.disc.style.strokeWidth = hovered ? '5' : '4';
          n.icon.style.opacity = st.locked || st.unknown ? '0.45' : '1';
          n.countText.textContent = st.locked ? '×' : st.unknown ? '—' : String(mode === 'borrow' ? s.bikes : s.docks);
          var description = st.name + ' · ' + (st.locked ? 'closed' : st.unknown ? 'unknown or stale' : n.countText.textContent + (mode === 'borrow' ? ' bikes available' : ' docks available'));
          n.marker.options.title = description;
          n.marker.options.alt = description;
          var markerElement = n.marker.getElement();
          if (markerElement) { markerElement.setAttribute('title', description); markerElement.setAttribute('aria-label', description); }

          var faults = st.locked || st.unknown || s.faults === null ? 0 : s.faults;
          n.fault.style.opacity = faults > 0 ? '1' : '0';
          if (n.faultNum.textContent !== String(faults)) n.faultNum.textContent = String(faults);
        }

        document.getElementById('cGreen').textContent = String(counts.green);
        document.getElementById('cAmber').textContent = String(counts.amber);
        document.getElementById('cRed').textContent = String(counts.red);
        document.getElementById('cLocked').textContent = String(counts.locked);
        document.getElementById('roGreen').textContent = 'High ' + counts.green;
        document.getElementById('roAmber').textContent = 'Limited ' + counts.amber;
        document.getElementById('roRed').textContent = 'None ' + counts.red;
        document.getElementById('roInactive').textContent = 'Inactive ' + counts.locked;
        document.getElementById('coverageNote').textContent = (STATIONS.length - counts.locked) + ' of ' + STATIONS.length + ' selected stations reporting · London time';

        BikeSite.update({ station: state.pinnedId !== null && STATIONS[state.pinnedId] ? STATIONS[state.pinnedId].id : null, date: DATA_META.date || null, time: HOURS[Math.round(state.t)] || null, mode: state.mode });

        refreshStationClusters();
        var clock = fmtClock(t);
        document.getElementById('clock').textContent = clock;
        document.getElementById('roTime').textContent = clock;
        // Keep the collapsed playback launcher in sync with the selected observation.
        document.getElementById('playbackSummary').textContent = clock + ' · London';

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
        // Reserve enough label space on narrow playback sheets, including the final time.
        var trackWidth = track.clientWidth || Math.max(180, Math.min(window.innerWidth - 100, 860));
        var lastRatio = -1;
        BikeTimeline.tickIndexes(HOURS).filter(function(i) {
          var ratio = BikeTimeline.positionRatio(HOURS, i);
          if (i === 0 || i === HOURS.length - 1 || ((ratio - lastRatio) * trackWidth >= 44 && (1 - ratio) * trackWidth >= 44)) {
            lastRatio = ratio;
            return true;
          }
          return false;
        }).forEach(function(i) {
          var span = document.createElement('span');
          span.textContent = BikeTimeline.clock(HOURS[i]);
          span.style.position = 'absolute';
          span.style.left = (BikeTimeline.positionRatio(HOURS, i)*100)+'%';
          span.style.transform = i===0 ? 'none' : i===HOURS.length-1 ? 'translateX(-100%)' : 'translateX(-50%)';
          wrap.appendChild(span);
        });
      }

      function setTime(t) {
        state.t = Math.round(clamp(t, 0, Math.max(0, HOURS.length - 1)));
        var pct = BikeTimeline.positionRatio(HOURS, state.t) * 100;
        tlFill.style.width = pct + '%';
        tlKnob.style.left = pct + '%';
        track.setAttribute('aria-valuemin', '0');
        track.setAttribute('aria-valuemax', String(Math.max(0, HOURS.length - 1)));
        track.setAttribute('aria-valuenow', String(state.t));
        track.setAttribute('aria-valuetext', fmtClock(state.t) + ' London');
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
        followLatest = false;
        dragging = true;
        stopPlay();
        cancelTipHide();
        if (track.setPointerCapture) {
          try {
            track.setPointerCapture(e.pointerId);
          } catch (err) {}
        }
        setTime(BikeTimeline.indexAtRatio(HOURS, ratioFromX(e.clientX)));
        e.preventDefault();
      });
      track.addEventListener('pointermove', function(e) {
        if (!dragging) return;
        setTime(BikeTimeline.indexAtRatio(HOURS, ratioFromX(e.clientX)));
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
        followLatest = false;
        if (e.key === 'Home' || e.key === 'End') { stopPlay(); setTime(e.key === 'Home' ? 0 : HOURS.length-1); e.preventDefault(); }
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
        followLatest = false;
        if (state.playing || HOURS.length < 2) return;
        state.playing = true;
        playBtn.textContent = 'Pause';
        // Animate the group bicycle logo only while the timeline is playing.
        document.getElementById('timelineDialog').classList.add('is-playing');
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
        document.getElementById('timelineDialog').classList.remove('is-playing');
        if (state.timer) {
          clearInterval(state.timer);
          state.timer = null;
        }
      }
      window.addEventListener('playback-open', buildTicks);
      window.addEventListener('playback-close', stopPlay);
      document.getElementById('latestSample').addEventListener('click', function() { stopPlay(); followLatest=true; activeDate=null; loadAndRenderData(); });
      document.getElementById('playbackDate').addEventListener('change', function(e) { if (e.target.value) { stopPlay(); followLatest=false; activeDate=e.target.value; BikeSite.update({date:activeDate,time:null}); loadAndRenderData(); } });
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

      Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function(btn) {
        btn.addEventListener('click', function() {
          var m = btn.getAttribute('data-mode');
          if (m === state.mode) return;
          state.mode = m;
          Array.prototype.forEach.call(document.querySelectorAll('.mode-btn'), function(b) {
            b.classList.toggle('is-active', b === btn);
            b.setAttribute('aria-pressed', String(b === btn));
          });
          modeCap.textContent = CAP_TEXT[m];
          roMode.textContent = (m === 'borrow' ? 'Borrow mode · Available bikes' : 'Return mode · Available docks');
          render();
          if (state.pinnedId !== null) {
            lastTipKey = '';
            paintStationTip(state.pinnedId);
          }
        });
      });

      /* ---------- Viewport fitting ---------- */
      function fitStage() {
        if (map) map.invalidateSize({ pan: false });
        if (!document.getElementById('timelineDialog').hidden) buildTicks();
      }

      function applyDataset(data) {
        var previousTime = followLatest ? null : (firstDatasetApplied ? HOURS[Math.round(state.t)] : siteState.time);
        var selectedId = state.pinnedId !== null && STATIONS[state.pinnedId] ? STATIONS[state.pinnedId].id : (!firstDatasetApplied ? siteState.station : null);
        DATA_META = data.meta;
        activeDate = data.meta.date;
        document.getElementById("playbackDate").value = activeDate || "";
        firstDatasetApplied = true;
        HOURS = data.meta.timestamps;
        DATE = data.meta.date || 'No observations';
        STATIONS = data.stations.map(function(station) {
          var latest = station.history[station.history.length - 1];
          return { id: station.id, name: station.name, area: station.area, lat: station.lat, lon: station.lon, x: 0, y: 0, cap: latest ? latest.capacity : null, locked: false, unknown: false, history: station.history };
        });
        places = BikePlaces.build(STATIONS);
        if (!searchResults.hidden) showSearch();
        COLLISIONS = data.collisions;
        state.hoverId = null;
        state.pinnedId = selectedId ? STATIONS.findIndex(function(st) { return st.id === selectedId; }) : null;
        if (state.pinnedId === -1) state.pinnedId = null;
        hideTip(); lastTipKey = '';
        document.getElementById('sourceLabel').textContent = 'London time';
        document.getElementById('sourceLabel').title = data.meta.source;
        document.querySelector('.tl-kicker').textContent = data.meta.isSimulated ? 'Simulated playback' : data.meta.playbackMode === 'observations' ? 'Recorded snapshots' : data.meta.mode === 'demo' ? 'Demo playback' : 'Historical playback';
        document.getElementById('track').setAttribute('aria-label', data.meta.playbackMode === 'observations' ? 'Recorded observation timeline' : 'Full-day London timeline');
        document.querySelector('.map-hint').textContent = !STATIONS.length ? 'Import the project SQL snapshot into MySQL to load stations.' : !HOURS.length ? 'No observations for this date.' : data.meta.mode === 'demo' ? 'Synthetic demo data · drag the timeline to test availability changes.' : 'Original stations · numbered groups expand on click · historic collisions optional.';
        playBtn.disabled = HOURS.length < 2;
        if (playBtn.disabled) stopPlay();
        buildStations(); refreshStationClusters(); buildCollisions(); buildTicks();
        if (!hasFittedMap && STATIONS.length) {
          var mobile = mapShell.clientWidth <= 640;
          map.fitBounds(STATIONS.map(function(st) { return [st.lat, st.lon]; }), { paddingTopLeft: mobile ? [28, 70] : [270, 40], paddingBottomRight: mobile ? [28, 120] : [280, 45], maxZoom: 14 });
          hasFittedMap = true;
        }
        var nextIndex = previousTime ? HOURS.indexOf(previousTime) : -1;
        setTime(nextIndex >= 0 ? nextIndex : Math.max(0, HOURS.indexOf(DATA_META.defaultTime)));
      }

      async function loadAndRenderData() {
        if (isRefreshing) return;
        isRefreshing = true;
        var dataStatus = document.getElementById('dataStatus');
        dataStatus.classList.remove('is-error');
        try {
          var data = await BikeDataService.loadDashboardData(followLatest ? undefined : (activeDate || undefined));
          applyDataset(data);
          dataStatus.innerHTML = '<i></i>' + (data.meta.isSimulated ? 'Simulated data' : ({ demo: 'Demo data', json: 'Recorded data', mysql: 'Database data' }[data.meta.mode] || 'Data'));
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
        if (window.ResizeObserver) new ResizeObserver(fitStage).observe(mapShell);

        if (window.APP_CONFIG.refreshIntervalMs > 0) {
          window.setInterval(loadAndRenderData, window.APP_CONFIG.refreshIntervalMs);
        }
      }

      initialiseApp();
