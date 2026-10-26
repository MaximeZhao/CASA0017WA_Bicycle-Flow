'use strict';

/*
 * This is the only file you need to edit when switching data sources.
 * The page tries the API first and automatically falls back to local JSON.
 * Set useDemoData to true only when you deliberately want to skip the API.
 */
window.APP_CONFIG = Object.freeze({
  useDemoData: false,
  demoDataUrl: './data/demo-data.json',
  liveDataUrl: 'http://localhost:3000/api/dashboard',
  allowDemoFallback: true,
  refreshIntervalMs: 60000
});
