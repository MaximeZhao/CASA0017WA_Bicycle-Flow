"use strict";
window.APP_CONFIG = Object.freeze({
  apiUrl: "/api/dashboard",
  refreshIntervalMs: 60000,
  map: {
    center: [51.515, -0.12],
    zoom: 13,
    tileUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  },
});
