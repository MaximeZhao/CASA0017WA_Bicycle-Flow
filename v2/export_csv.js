
const fs = require("node:fs");
const path = require("node:path");
const db = require("./db");

const tables = [
  "bike_stations",
  "availability_history",
  "collisions",
  "fault_reports"
];

const outputDir = path.join(__dirname, "data", "exports");

function csvValue(value) {
  if (value === null || value === undefined) return "";

  if (value instanceof Date) {
    value = value.toISOString();
  }

  if (typeof value === "number") {
    return String(value);
  }

  const text = String(value);
  const safe = /^[=+\-@\t\r\n]/.test(text)
    ? "'" + text
    : text;

  return `"${safe.replace(/"/g, '""')}"`;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    for (const table of tables) {
      const [rows, fields] = await db.query(
        `SELECT * FROM \`${table}\``
      );

      const columns = fields.map(field => field.name);

      const lines = [
        columns.join(","),
        ...rows.map(row =>
          columns.map(col => csvValue(row[col])).join(",")
        )
      ];

      const file = path.join(outputDir, `${table}.csv`);

      fs.writeFileSync(
        file,
        "\uFEFF" + lines.join("\r\n") + "\r\n",
        "utf8"
      );

      console.log(`${table}: ${rows.length} rows exported`);
    }

    console.log("Export completed!");

  } finally {
    await db.end();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
