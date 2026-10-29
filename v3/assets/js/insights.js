"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const siteState = BikeSite.read();
  let loaded = false;
  let followLatest = !siteState.time;
  const contract = window.BikeContract;
  const colors = {
    good: "#16a34a",
    limited: "#f59e0b",
    empty: "#dc2626",
    closed: "#94a3b8",
    unknown: "#cbd5e1",
  };
  let data = null,
    stationId = siteState.station,
    index = 1,
    mode = siteState.mode || "borrow",
    timer = null,
    controller = null,
    request = 0,
    sorted = false;
  const number = (value) =>
    value === null || value === undefined ? "—" : String(value);
  const time = BikeTimeline.clock;
  function selectedTime() {
    return data?.meta.timestamps[index] || null;
  }
  function snapshot(station, timestamp = selectedTime()) {
    return timestamp ? BikeTimeline.freshSnapshot(station.history, timestamp, data.meta.staleAfterSeconds) : null;
  }
  function status(station, timestamp = selectedTime()) {
    return contract.status(
      snapshot(station, timestamp),
      mode,
      timestamp,
      data.meta.staleAfterSeconds,
    );
  }
  function dotClass(value) {
    return {
      good: "green",
      limited: "amber",
      empty: "red",
      closed: "grey",
      unknown: "grey",
    }[value];
  }
  function element(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function svg(tag, attrs, text) {
    const item = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) item.setAttribute(k, v);
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function filteredStations() {
    const query = $("stationSearch").value.trim().toLowerCase();
    return data.stations.filter((s) =>
      (s.name + " " + s.id + " " + (s.area || ""))
        .toLowerCase()
        .includes(query),
    );
  }
  function selectStation(id) {
    stationId = id;
    render();
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    $("playBtn").textContent = "Play";
  }
  function setTime(value) {
    followLatest=false;
    index = Math.max(
      0,
      Math.min(data.meta.timestamps.length - 1, Number(value)),
    );
    render();
  }
  function minimum(history) {
    const known = history.filter(
      (h) => h.isOperational === true && h.bikes !== null,
    );
    return known.reduce(
      (best, h) => (!best || h.bikes < best.bikes ? h : best),
      null,
    );
  }
  function within300m(station, collision) {
    const radians = (value) => (value * Math.PI) / 180;
    const dlat = radians(collision.lat - station.lat),
      dlon = radians(collision.lon - station.lon);
    const a =
      Math.sin(dlat / 2) ** 2 +
      Math.cos(radians(station.lat)) *
        Math.cos(radians(collision.lat)) *
        Math.sin(dlon / 2) ** 2;
    return (
      6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a))) <=
      300
    );
  }
  function renderList() {
    const list = $("stationList");
    list.replaceChildren();
    const stations = filteredStations();
    $("stationCount").textContent = "(" + stations.length + ")";
    if (!stations.length) {
      list.append(
        element(
          "p",
          "panel-footnote",
          data.stations.length
            ? "No matching stations."
            : "No stations loaded. Fill the data template.",
        ),
      );
      return;
    }
    for (const station of stations) {
      const button = element(
        "button",
        "station-row" + (station.id === stationId ? " is-selected" : ""),
      );
      button.type = "button";
      button.setAttribute("aria-pressed", String(station.id === stationId));
      const label = element("span", "station-label", station.name);
      label.append(element("small", "", station.area || ""));
      const h = snapshot(station);
      button.append(
        element("i", "status-dot " + dotClass(status(station))),
        label,
        element("b", "", number(h?.[mode === "borrow" ? "bikes" : "docks"])),
      );
      button.addEventListener("click", () => selectStation(station.id));
      list.append(button);
    }
  }
  function renderTotals() {
    let bikes = 0,
      docks = 0,
      bikeReports = 0,
      dockReports = 0,
      reporting = 0;
    for (const station of data.stations) {
      const h = snapshot(station);
      if (status(station) !== "unknown") reporting++;
      if (!h || h.isOperational !== true || status(station) === "unknown")
        continue;
      if (h.bikes !== null) {
        bikes += h.bikes;
        bikeReports++;
      }
      if (h.docks !== null) {
        docks += h.docks;
        dockReports++;
      }
    }
    $("totalBikes").textContent = bikeReports ? bikes : "—";
    $("totalDocks").textContent = dockReports ? docks : "—";
    $("reportingStations").textContent =
      reporting + " / " + data.stations.length;
    $("reportingNote").textContent =
      "Known status at " + time(selectedTime()) + " London";
  }
  function drawChart(station) {
    const chart = $("chart");
    chart.replaceChildren();
    const history = station?.history || [];
    if (!history.length) {
      chart.append(
        svg(
          "text",
          {
            x: 390,
            y: 85,
            "text-anchor": "middle",
            "font-size": 12,
            fill: "#8b97a7",
          },
          station
            ? "No observations for this date."
            : "Select a station to view its history.",
        ),
      );
      return;
    }
    const left = 35,
      right = 758,
      top = 12,
      bottom = 140;
    const start = Date.parse(data.meta.timestamps[0]),
      end = Date.parse(data.meta.timestamps.at(-1));
    const highest = Math.max(
      1,
      ...history.flatMap((h) => [h.bikes || 0, h.docks || 0]),
    );
    const max = Math.ceil(highest / 5) * 5;
    const x = (timestamp) =>
      left +
      (end === start
        ? (right - left) / 2
        : ((Date.parse(timestamp) - start) / (end - start)) * (right - left));
    const y = (value) => bottom - (value / max) * (bottom - top);
    for (let i = 0; i <= 3; i++) {
      const value = Math.round((max * i) / 3);
      chart.append(
        svg("line", {
          x1: left,
          x2: right,
          y1: y(value),
          y2: y(value),
          stroke: "#e8ecf3",
        }),
        svg(
          "text",
          {
            x: left - 7,
            y: y(value) + 3,
            "text-anchor": "end",
            "font-size": 10,
            fill: "#94a3b8",
          },
          value,
        ),
      );
    }
    for (const i of BikeTimeline.tickIndexes(data.meta.timestamps)) {
      const timestamp=data.meta.timestamps[i];
      chart.append(svg('text',{x:x(timestamp),y:160,'text-anchor':'middle','font-size':9,fill:'#94a3b8'},time(timestamp)));
    }
    // Hourly synthetic fixtures intentionally contain one sample per hour.
    const maxGap =
      data.meta.mode === "demo" ? 3600 : data.meta.staleAfterSeconds;
    for (const [key, color] of [
      ["bikes", "#16a34a"],
      ["docks", "#4674bf"],
    ]) {
      let points = [],
        previous = null;
      function flush() {
        if (points.length)
          chart.append(
            svg("polyline", {
              points: points.join(" "),
              fill: "none",
              stroke: color,
              "stroke-width": 2,
              "stroke-linejoin": "round",
            }),
          );
        points = [];
      }
      for (const h of history) {
        if (h[key] === null || h.isOperational !== true) {
          flush();
          previous = null;
          continue;
        }
        if (
          previous &&
          (Date.parse(h.recordedAt) - Date.parse(previous.recordedAt)) / 1000 >
            maxGap
        )
          flush();
        points.push(x(h.recordedAt) + "," + y(h[key]));
        const point = svg("circle", {
          cx: x(h.recordedAt),
          cy: y(h[key]),
          r: 2.7,
          fill: color,
        });
        point.append(
          svg("title", {}, time(h.recordedAt) + " London · " + h[key] + " " + key),
        );
        chart.append(point);
        previous = h;
      }
      flush();
    }
    const selected = selectedTime();
    if (
      selected &&
      Date.parse(selected) >= start &&
      Date.parse(selected) <= end
    ) {
      chart.append(
        svg("line", {
          x1: x(selected),
          x2: x(selected),
          y1: top,
          y2: bottom,
          stroke: "#64748b",
          "stroke-dasharray": "4 4",
        }),
      );
      const h = snapshot(station);
      if (h && status(station) !== "unknown" && h.isOperational === true)
        for (const [key, color] of [
          ["bikes", "#16a34a"],
          ["docks", "#4674bf"],
        ])
          if (h[key] !== null)
            chart.append(
              svg("circle", {
                cx: x(h.recordedAt),
                cy: y(h[key]),
                r: 4,
                fill: "#fff",
                stroke: color,
                "stroke-width": 2,
              }),
            );
    }
  }
  function renderStation() {
    const station = data.stations.find((s) => s.id === stationId),
      h = station ? snapshot(station) : null;
    $("stationName").textContent = station?.name || "Choose a station";
    $("stationMeta").textContent = station
      ? [
          station.area || "Area not supplied",
          "ID: " + station.id,
          "Capacity: " + number(h?.capacity),
        ].join("  ·  ")
      : "Station details will appear here.";
    const state = station ? status(station) : "unknown";
    const badge = $("stationStatus");
    badge.className =
      "status-badge " +
      (state === "closed"
        ? "closed"
        : state === "unknown"
          ? "unknown"
          : "operational");
    badge.textContent =
      state === "closed"
        ? "Closed"
        : state === "unknown"
          ? "Unknown / stale"
          : "Operational";
    $("selectedBikes").textContent = number(h?.bikes);
    $("selectedDocks").textContent = number(h?.docks);
    $("selectedFaults").textContent = number(h?.faults);
    const low = minimum(station?.history || []);
    $("selectedMinimum").textContent = number(low?.bikes);
    $("dailyMinimum").textContent = number(low?.bikes);
    $("minimumTime").textContent = low
      ? "at " + time(low.recordedAt) + " London"
      : "No operational samples";
    const faults = (station?.history || []).filter((h) => h.faults !== null);
    $("averageFaults").textContent = faults.length
      ? (faults.reduce((n, h) => n + h.faults, 0) / faults.length).toFixed(1)
      : "—";
    $("nearbyCollisions").textContent =
      !station || !data.collisions.length
        ? "—"
        : data.collisions.filter((c) => within300m(station, c)).length;
    $("collisionSource").textContent = !data.collisions.length
      ? "No collision dataset loaded"
      : data.meta.mode === "demo"
        ? "Synthetic examples within 300 m"
        : "Regional original records within 300 m";
    drawChart(station);
  }
  function renderNetwork() {
    $("networkMode").textContent =
      mode === "borrow" ? "Borrow mode" : "Return mode";
    const container = $("networkBars");
    container.replaceChildren();
    const times = data.meta.timestamps;
    if (!times.length) {
      container.append(element("p", "panel-footnote", "No observations yet."));
      return;
    }
    const step = Math.max(1, Math.ceil((times.length - 1) / 10));
    const observed = data.meta.observationTimestamps;
    const observedStep = Math.max(1, Math.ceil(observed.length / 5));
    const indexes = new Set([0, times.length - 1, index, ...observed.filter((t,i)=>i % observedStep === 0 || i === observed.length-1).map(t=>times.indexOf(t)).filter(i=>i>=0)]);
    for (let i = 0; i < times.length; i += step) indexes.add(i);
    for (const i of [...indexes].sort((a, b) => a - b)) {
      const counts = { good: 0, limited: 0, empty: 0, closed: 0, unknown: 0 };
      for (const station of data.stations) counts[status(station, times[i])]++;
      const button = element(
        "button",
        "network-bar" + (i === index ? " is-selected" : ""),
      );
      button.type = "button";
      button.setAttribute("aria-pressed", String(i === index));
      button.setAttribute(
        "aria-label",
        time(times[i]) +
          " London: " +
          counts.good +
          " high, " +
          counts.limited +
          " limited, " +
          counts.empty +
          " unavailable, " +
          (counts.closed + counts.unknown) +
          " closed or unknown",
      );
      const stack = element("span", "bar-stack");
      for (const key of ["good", "limited", "empty", "closed", "unknown"]) {
        const part = element("span", "bar-part");
        part.style.height =
          (data.stations.length
            ? (counts[key] / data.stations.length) * 100
            : 0) + "%";
        part.style.background = colors[key];
        stack.append(part);
      }
      button.append(stack, element("span", "bar-time", time(times[i])));
      button.addEventListener("click", () => {
        stop();
        setTime(i);
      });
      container.append(button);
    }
  }
  function renderTable() {
    let stations = filteredStations();
    if ($("limitedOnly").checked)
      stations = stations.filter((s) =>
        ["limited", "empty"].includes(status(s)),
      );
    if (sorted)
      stations.sort((a, b) => {
        const key = mode === "borrow" ? "bikes" : "docks";
        return (
          (snapshot(a)?.[key] ?? Infinity) - (snapshot(b)?.[key] ?? Infinity) ||
          a.name.localeCompare(b.name)
        );
      });
    $("tableCount").textContent = "(" + stations.length + " rows)";
    const rows = $("stationRows");
    rows.replaceChildren();
    for (const station of stations) {
      const h = snapshot(station),
        state = status(station);
      const row = element("tr", station.id === stationId ? "is-selected" : "");
      const nameCell = element("td");
      nameCell.append(element("i", "status-dot " + dotClass(state)));
      const button = element("button", "", station.name);
      button.type = "button";
      button.addEventListener("click", () => selectStation(station.id));
      nameCell.append(button);
      row.append(nameCell);
      for (const value of [
        station.area || "—",
        h?.capacity,
        h?.bikes,
        h?.docks,
        h?.faults,
      ])
        row.append(element("td", "", number(value)));
      const statusCell = element("td");
      statusCell.append(
        element(
          "span",
          "status-badge " +
            (state === "closed"
              ? "closed"
              : state === "unknown"
                ? "unknown"
                : ""),
          state === "closed"
            ? "Closed"
            : state === "unknown"
              ? "Unknown"
              : "Operational",
        ),
      );
      row.append(statusCell);
      rows.append(row);
    }
    if (!stations.length) {
      const row = element("tr"),
        cell = element("td", "", "No stations match the current filters.");
      cell.colSpan = 7;
      row.append(cell);
      rows.append(row);
    }
  }
  function render() {
    if (!data) return;
    $("clock").textContent = time(selectedTime());
    $("insightTimeline").value = index;
    $("insightTimeline").setAttribute(
      "aria-valuetext",
      time(selectedTime()) + " London",
    );
    renderTotals();
    renderList();
    renderStation();
    renderNetwork();
    renderTable();
    BikeSite.update({
      station: stationId || null,
      date: data.meta.date || null,
      time: selectedTime(),
      mode,
    });
  }
  function fitStage() {
    const scale = Math.min(
      $("stageWrap").clientWidth / 1440,
      $("stageWrap").clientHeight / 900,
      1,
    );
    $("stage").style.transform = "scale(" + scale + ")";
  }
  async function load(date) {
    stop();
    controller?.abort();
    controller = new AbortController();
    const current = ++request;
    try {
      const next = await BikeDataService.loadDashboardData(
        date,
        controller.signal,
      );
      if (current !== request) return;
      const preferredTime = followLatest ? null : (loaded ? selectedTime() : siteState.time);
      data = next;
      loaded = true;
      if (!data.stations.some((s) => s.id === stationId))
        stationId = data.stations[0]?.id || null;
      const restoredIndex = preferredTime
        ? data.meta.timestamps.indexOf(preferredTime)
        : -1;
      index =
        restoredIndex >= 0
          ? restoredIndex
          : Math.max(0, data.meta.timestamps.indexOf(data.meta.defaultTime));
      const dates = [...data.meta.availableDates];
      if (data.meta.date && !dates.includes(data.meta.date))
        dates.unshift(data.meta.date);
      $("dateSelect").replaceChildren(...dates.map((d) => new Option(d, d)));
      if (!dates.length) $("dateSelect").add(new Option("No observations", ""));
      $("dateSelect").value = data.meta.date || "";
      $("dateSelect").disabled = !dates.length;
      $("insightTimeline").max = Math.max(0, data.meta.timestamps.length - 1);
      $("insightTimeline").disabled = data.meta.timestamps.length < 2;
      $("playBtn").disabled = data.meta.timestamps.length < 2;
      const times = data.meta.timestamps;
      const labels = [];
      BikeTimeline.tickIndexes(times).forEach(i => labels.push(element('span','',time(times[i]))));
      $("timeLabels").replaceChildren(...labels);
      $("dataStatus").classList.remove("is-error");
      $("dataStatus").replaceChildren(
        element("i"),
        document.createTextNode(
          { demo: "Demo Data", json: "JSON Data", mysql: "MySQL Data" }[
            data.meta.mode
          ] || "Data",
        ),
      );
      $("message").className = "insights-source";
      $("message").textContent =
        data.meta.mode === "demo"
          ? "Synthetic demo data · illustrative station positions, availability and collision examples · " +
            (data.meta.date || "No observations") +
            " · All times Europe/London"
          : !data.stations.length
            ? "Import the project SQL snapshot into MySQL to load observations."
            : data.meta.source +
              " · " +
              (data.meta.date || "No observations") +
              " · Recorded samples, not trip counts · All times Europe/London";
      render();
    } catch (error) {
      if (error.name === "AbortError") return;
      stop();
      $("dataStatus").textContent = "Data unavailable";
      $("dataStatus").classList.add("is-error");
      $("message").className = "insights-source error";
      $("message").textContent =
        error.message +
        (data ? " Previously loaded samples may be outdated." : "");
    }
  }
  document.querySelectorAll("[data-mode]").forEach((button) =>
    button.addEventListener("click", () => {
      mode = button.dataset.mode;
      document.querySelectorAll("[data-mode]").forEach((b) => {
        b.classList.toggle("is-active", b === button);
        b.setAttribute("aria-pressed", String(b === button));
      });
      $("modeCap").textContent =
        "Station insights · Available " +
        (mode === "borrow" ? "bikes" : "docks");
      render();
    }),
  );
  $("insightTimeline").addEventListener("input", () => {
    stop();
    setTime($("insightTimeline").value);
  });
  $("playBtn").addEventListener("click", () => {
    if (timer) {
      stop();
      return;
    }
    if (!data || data.meta.timestamps.length < 2) return;
    if (index >= data.meta.timestamps.length - 1) index = 0;
    $("playBtn").textContent = "Pause";
    render();
    timer = setInterval(() => {
      if (index >= data.meta.timestamps.length - 1) {
        stop();
        return;
      }
      setTime(index + 1);
    }, 800);
  });
  $("stationSearch").addEventListener("input", () => {
    if (data) {
      renderList();
      renderTable();
    }
  });
  $("limitedOnly").addEventListener("change", () => {
    if (data) renderTable();
  });
  $("sortBtn").addEventListener("click", () => {
    sorted = !sorted;
    $("sortBtn").setAttribute("aria-pressed", String(sorted));
    if (data) renderTable();
  });
  $("dateSelect").addEventListener("change", () => { followLatest=false; load($("dateSelect").value); });
  $("latestData").addEventListener("click", () => { followLatest=true; load(); });
  window.setInterval(() => { if (!timer && !document.hidden) load(followLatest ? undefined : data?.meta.date); }, APP_CONFIG.refreshIntervalMs || 60000);
  window.addEventListener("resize", fitStage);
  window.addEventListener("pagehide", stop);
  fitStage();
  document.querySelectorAll("[data-mode]").forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("modeCap").textContent =
    "Station insights · Available " + (mode === "borrow" ? "bikes" : "docks");
  load(siteState.date || undefined);
})();
