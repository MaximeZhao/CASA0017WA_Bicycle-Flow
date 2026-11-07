"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { build, search } = require("../assets/js/place-search");
const { stations } = require("../data/showcase.json");
const places = build(stations);

test("an exact area ranks before stations and its bounds contain its stations", () => {
  const area = search(places, "Canary Wharf")[0];
  assert.equal(area.type, "area");
  assert.equal(area.name, "Canary Wharf");
  const members = stations.filter(s => s.name.endsWith(", Canary Wharf"));
  assert.equal(area.count, members.length);
  assert.ok(members.length > 1);
  for (const s of members) {
    assert.ok(s.lat >= area.bounds[0][0] && s.lat <= area.bounds[1][0]);
    assert.ok(s.lon >= area.bounds[0][1] && s.lon <= area.bounds[1][1]);
  }
});
test("search tolerates case, apostrophes and token order", () => {
  assert.equal(search(places, "KINGS CROSS")[0].type, "area");
  const results = search(places, "waterloo station 1");
  assert.ok(results.some(p => p.type === "station" && p.name.includes("Waterloo Station 1")));
  assert.ok(search(places, "museum british").some(p => p.name.includes("British Museum")));
});
test("blank and unmatched queries stay empty, and station results retain real coordinates", () => {
  assert.deepEqual(search(places, "  "), []);
  assert.deepEqual(search(places, "a place not in the loaded dataset"), []);
  const target = stations.find(s => s.name.includes("British Museum"));
  const result = search(places, target.id).find(p => p.id === target.id);
  assert.equal(result.lat, target.lat);
  assert.equal(result.lon, target.lon);
  assert.ok(search(places, "street", 3).length <= 3);
});
