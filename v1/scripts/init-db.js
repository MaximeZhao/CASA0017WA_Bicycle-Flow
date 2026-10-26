"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const db = require("../lib/database");
const config = require("../lib/config");
(async () => {
  try {
    const sql = await fs.readFile(
      path.join(config.root, "sql/schema.sql"),
      "utf8",
    );
    for (const statement of sql
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await db.getPool().query(statement);
    console.log("Schema ready. Existing legacy tables were not changed.");
  } catch (e) {
    console.error("Schema initialization failed:", e.code || e.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
})();
