"use strict";
window.BikeDataService = Object.freeze({
  async loadDashboardData(date, signal) {
    const url = new URL(window.APP_CONFIG.apiUrl, window.location.origin);
    if (date) url.searchParams.set("date", date);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal,
    });
    if (!response.ok)
      throw new Error(
        "Data request failed (" +
          response.status +
          "). Check the server data source.",
      );
    return window.BikeContract.validate(await response.json());
  },
});
