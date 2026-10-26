"use strict";
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
const mode = process.env.DATA_SOURCE || "demo";
if (!["demo", "json", "mysql"].includes(mode))
  throw new Error("DATA_SOURCE must be demo, json or mysql");
const staleAfterSeconds = Number(process.env.STALE_AFTER_SECONDS || 900);
if (!Number.isFinite(staleAfterSeconds) || staleAfterSeconds < 0)
  throw new Error("STALE_AFTER_SECONDS must be a non-negative number");
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535");
module.exports = {
  root,
  mode,
  host: process.env.HOST || "127.0.0.1",
  port,
  dataFile: path.resolve(
    root,
    mode === "demo"
      ? "data/demo-data.json"
      : process.env.DATA_FILE || "data/my-data.json",
  ),
  staleAfterSeconds,
  database: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "bike_app",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "bike_project",
    timezone: "Z",
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: 5,
    decimalNumbers: true,
    charset: "utf8mb4",
  },
};
