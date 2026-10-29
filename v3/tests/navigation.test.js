"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const navigation = require("../assets/js/site-navigation");
test("both pages carry the same station, date, time and mode in same-site URLs", () => {
  const state = {
    station: "DEMO-S02",
    date: "2026-10-15",
    time: "2026-10-15T10:00:00Z",
    mode: "return",
  };
  for (const page of ["map", "insights"]) {
    const url = new URL(navigation.url(page, state), "http://localhost:3000");
    assert.equal(url.origin, "http://localhost:3000");
    assert.equal(url.pathname, page === "map" ? "/" : "/insights.html");
    assert.deepEqual(navigation.parse(url.search), state);
  }
});
test("direct URL state takes priority while plain navigation can restore saved state", () => {
  const cached = {
    station: "DEMO-S01",
    date: "2026-10-15",
    time: "2026-10-15T09:00:00Z",
    mode: "return",
  };
  assert.deepEqual(navigation.parse("", cached), cached);
  assert.deepEqual(navigation.parse("?station=DEMO-S02&mode=borrow", cached), {
    station: "DEMO-S02",
    mode: "borrow",
  });
  assert.deepEqual(
    navigation.parse("?date=2026-02-30&time=invalid&mode=bad"),
    {},
  );
  assert.deepEqual(
    navigation.parse("?date=2026-10-15&time=2026-10-16T09:00:00Z"),
    { date: "2026-10-15" },
  );
});
