/* Shared navigation and recorded-view state for Mind The Dock. */
(function (root, factory) {
  if (typeof module === "object" && module.exports)
    module.exports = factory(null);
  else root.BikeSite = factory(root);
})(typeof window !== "undefined" ? window : null, function (browser) {
  "use strict";
  const timeline = browser ? browser.BikeTimeline : require("./timeline");
  const storageKey = "mind-the-dock:view:v5";
  const fields = ["station", "date", "time", "mode"];
  // Keep Daily Flow on the original insights route so older running servers and saved links still work.
  const paths = { home: "/home.html", map: "/", flow: "/insights.html", insights: "/insights.html", contact: "/contact.html" };
  function pageForPath(pathname) {
    if (pathname.endsWith("/home.html")) return "home";
    if (pathname.endsWith("/contact.html")) return "contact";
    if (pathname.endsWith("/insights.html") || pathname.endsWith("/daily-flow.html")) return "flow";
    return "map";
  }
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
      (!state.date || timeline.dayOf(input.time) === state.date)
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
      (paths[page] || paths.map) +
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
    const activePage = pageForPath(browser.location.pathname);
    browser.document.querySelectorAll(".nav-link, [data-page]").forEach((link) => {
      const target = new URL(link.getAttribute("href"), browser.location.origin)
        .pathname;
      const page = link.dataset.page || pageForPath(target);
      link.setAttribute("href", url(page, current));
      if (!link.classList.contains("nav-link")) return;
      const active = page === activePage;
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
    if (browser) {
      const page = browser.location.pathname.endsWith('/insights.html') ? 'insights' : pageForPath(browser.location.pathname);
      const target = url(page, current);
      if (browser.location.pathname + browser.location.search !== target)
        browser.history.replaceState(null, '', target);
    }
  }
  updateLinks();
  return { read: () => ({ ...current }), update, url, parse, pageForPath };
});
