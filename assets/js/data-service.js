'use strict';

(function() {
  function validateDashboardData(data) {
    if (!data || !data.meta || !Array.isArray(data.meta.hours)) {
      throw new Error('The dataset is missing meta.hours.');
    }

    if (!Array.isArray(data.stations)) {
      throw new Error('The dataset is missing the stations array.');
    }

    data.stations.forEach(function(station) {
      if (!station.id || !Array.isArray(station.history)) {
        throw new Error('Every station needs an id and a history array.');
      }
    });

    return data;
  }

  async function fetchDashboardData(url) {
    var response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error('Data request failed with status ' + response.status + '.');
    }

    return validateDashboardData(await response.json());
  }

  function addLoadMode(data, loadMode, sourcePrefix) {
    return Object.assign({}, data, {
      meta: Object.assign({}, data.meta, {
        loadMode: loadMode,
        source: sourcePrefix ? sourcePrefix + data.meta.source : data.meta.source
      })
    });
  }

  async function loadDashboardData() {
    var config = window.APP_CONFIG;

    if (config.useDemoData) {
      return addLoadMode(
        await fetchDashboardData(config.demoDataUrl),
        'demo',
        ''
      );
    }

    try {
      return addLoadMode(
        await fetchDashboardData(config.liveDataUrl),
        'api',
        ''
      );
    } catch (apiError) {
      if (!config.allowDemoFallback) throw apiError;

      console.warn('The API is unavailable. Local demo data is being used.', apiError);
      return addLoadMode(
        await fetchDashboardData(config.demoDataUrl),
        'fallback',
        'Fallback · '
      );
    }
  }

  window.BikeDataService = Object.freeze({
    loadDashboardData: loadDashboardData
  });
})();
