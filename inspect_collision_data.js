
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse");

const files = [
  "dft-road-casualty-statistics-collision-2025.csv",
  "dft-road-casualty-statistics-vehicle-2025.csv",
  "dft-road-casualty-statistics-casualty-2025.csv"
];

async function inspectFile(filename) {
  const filepath = path.join(__dirname, "data", "raw", filename);

  if (!fs.existsSync(filepath)) {
    console.log("File not found:", filepath);
    return;
  }

  const parser = fs.createReadStream(filepath).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true
    })
  );

  for await (const row of parser) {
    console.log("\nFILE:", filename);
    console.log("COLUMNS:");
    console.log(Object.keys(row));
    console.log("FIRST RECORD:");
    console.log(row);
    break;
  }
}

async function main() {
  for (const file of files) {
    await inspectFile(file);
  }
}

main().catch(console.error);
