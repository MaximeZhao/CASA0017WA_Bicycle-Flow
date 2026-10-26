"use strict";
const fs = require("node:fs/promises");
const { validate } = require("../assets/js/data-contract");
const db = require("../lib/database");
(async () => {
  try {
    if (!process.argv[2])
      throw new Error("Usage: npm run data:import -- data/my-data.json");
    const data = validate(
      JSON.parse(await fs.readFile(process.argv[2], "utf8")),
    );
    console.log(await db.importDataset(data));
  } catch (e) {
    console.error("Import failed:", e.code || e.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
