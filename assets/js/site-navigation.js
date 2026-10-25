/* Shared navigation for the two pages of the same London Bike Pulse website. */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(null);
  else root.BikeSite = factory(root);
})(typeof window !== "undefined" ? window : null, function (browser) {
  "use strict";
  const storageKey = "london-bike-pulse:view:v1";
  const fields = ["station", "date", "time", "mode"];
  function clean(input) {
    const state = {};
    if (
      typeof input.station === "string" &&
      input.station.trim() &&
      input.station.length <= 80
    )
      state.station = input.station;
    if (
      typeof input.date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(input.date) &&
      Number.isFinite(Date.parse(input.date)) &&
      new Date(input.date).toISOString().slice(0, 10) === input.date
    )
      state.date = input.date;
    if (
      typeof input.time === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(input.time) &&
      Number.isFinite(Date.parse(input.time)) &&
      new Date(input.time).toISOString() === input.time.replace("Z", ".000Z") &&
      (!state.date || input.time.slice(0, 10) === state.date)
    )
      state.time = input.time;
    if (input.mode === "borrow" || input.mode === "return")
      state.mode = input.mode;
    return state;
  }
  function parse(search, cached = {}) {
    const params = new URLSearchParams(search);
    return clean(
      fields.some((field) => params.has(field))
        ? Object.fromEntries(fields.map((field) => [field, params.get(field)]))
        : cached,
    );
  }
  function url(page, state) {
    const params = new URLSearchParams(clean(state));
    return (
      (page === "insights" ? "/insights.html" : "/") +
      (params.size ? "?" + params.toString() : "")
    );
  }
  let cached = {};
  if (browser)
    try {
      cached =
        JSON.parse(browser.sessionStorage.getItem(storageKey) || "{}") || {};
    } catch (error) {
      cached = {};
    }
  let current = parse(browser ? browser.location.search : "", cached);
  let lastSaved = "";
  function updateLinks() {
    if (!browser) return;
    const insights = browser.location.pathname.endsWith("/insights.html");
    browser.document.querySelectorAll(".nav-link").forEach((link) => {
      const target = new URL(link.getAttribute("href"), browser.location.origin)
        .pathname;
      const page = target.endsWith("/insights.html") ? "insights" : "map";
      link.setAttribute("href", url(page, current));
      const active = page === (insights ? "insights" : "map");
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
  function update(patch) {
    current = clean({ ...current, ...patch });
    const serialized = JSON.stringify(current);
    if (serialized === lastSaved) return;
    lastSaved = serialized;
    if (browser)
      try {
        browser.sessionStorage.setItem(storageKey, serialized);
      } catch (error) {
        /* URL navigation still works without browser storage. */
      }
    updateLinks();
  }
  updateLinks();
  return { read: () => ({ ...current }), update, url, parse };
});
