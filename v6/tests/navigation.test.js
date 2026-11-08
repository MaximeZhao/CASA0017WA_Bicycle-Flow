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
  const paths = { map: "/", insights: "/insights.html", home: "/home.html", flow: "/insights.html", contact: "/contact.html", profile: "/profile.html" };
  for (const page of Object.keys(paths)) {
    const url = new URL(navigation.url(page, state), "http://localhost:3000");
    assert.equal(url.origin, "http://localhost:3000");
    assert.equal(url.pathname, paths[page]);
    assert.deepEqual(navigation.parse(url.search), state);
  }
});

test("Daily Flow reuses the established Station Insights route", () => {
  const state = { station: "BikePoints_24", date: "2026-10-28", time: "2026-10-28T08:00:00Z", mode: "return" };
  assert.equal(navigation.url('flow', state), navigation.url('insights', state));
  assert.deepEqual(navigation.parse(new URL(navigation.url('flow', state), 'http://localhost').search), state);
});

test("each navigation page is identified without treating Home or Contact as the map", () => {
  assert.equal(navigation.pageForPath('/home.html'), 'home');
  assert.equal(navigation.pageForPath('/'), 'map');
  assert.equal(navigation.pageForPath('/index.html'), 'map');
  assert.equal(navigation.pageForPath('/daily-flow.html'), 'flow');
  assert.equal(navigation.pageForPath('/insights.html'), 'flow');
  assert.equal(navigation.pageForPath('/contact.html'), 'contact');
  assert.equal(navigation.pageForPath('/profile.html'), 'profile');
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
