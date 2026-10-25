
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse");
const db = require("./db");

// Step 1: 定义文件路径
// Step 1: Define file paths
const RAW_DIR = path.join(__dirname, "data", "raw");

const FILES = {
  collisions: path.join(
    RAW_DIR,
    "dft-road-casualty-statistics-collision-2025.csv"
  ),
  vehicles: path.join(
    RAW_DIR,
    "dft-road-casualty-statistics-vehicle-2025.csv"
  ),
  casualties: path.join(
    RAW_DIR,
    "dft-road-casualty-statistics-casualty-2025.csv"
  )
};


// 兼容不同年份的事故编号字段
// Handle different collision ID fields across years
function getCollisionId(row) {
  return String(
    row.collision_index || row.accident_index || ""
  ).trim();
}

// 处理无效数字，返回 null
// Handle invalid numbers, return null
function validNumber(value) {
  if (
    value === undefined ||
    value === null ||
    value === "" ||
    value === "-1"
  ) {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// 将 CSV 日期转成 MySQL DATE
// Convert CSV date formats to MySQL DATE format
function formatDate(value) {
  if (!value) return null;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [day, month, year] = value.split("/");
    return `${year}-${month}-${day}`;
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }

  return null;
}

// 以流式方式读取 CSV
// Read CSV files in a streaming manner
async function* readCSV(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const stream = fs.createReadStream(filePath).pipe(
    parse({
      columns: true,
      bom: true,
      skip_empty_lines: true,
      trim: true
    })
  );

  for await (const row of stream) {
    yield row;
  }
}

async function importCollisions() {
  console.log("Starting DfT collision import...");

  // 用 Set 记录涉及自行车的事故编号
  // Use a Set to track collision IDs involving cyclists

  const cyclistCollisionIds = new Set();

  // 用 Map 保存每场事故的伤亡人数
  // Use a Map to store casualty counts for each collision
  const casualtyCounts = new Map();

  console.log("Reading Vehicles CSV...");

  let vehicleRows = 0;

  for await (const vehicle of readCSV(FILES.vehicles)) {
    const id = getCollisionId(vehicle);
    if (!id) continue;

    vehicleRows++;

    // DfT: vehicle_type = 1 is Pedal cycle
    if (Number(vehicle.vehicle_type) === 1) {
      cyclistCollisionIds.add(id);
    }
  }

  console.log(`Processed ${vehicleRows} vehicle records`);


  console.log("Reading Casualties CSV...");

  let casualtyRows = 0;

  for await (const casualty of readCSV(FILES.casualties)) {
    const id = getCollisionId(casualty);
    if (!id) continue;

    casualtyRows++;

    casualtyCounts.set(
      id,
      (casualtyCounts.get(id) || 0) + 1
    );


    // DfT: casualty_type = 1 is Pedal cyclist
    if (Number(casualty.casualty_type) === 1) {
      cyclistCollisionIds.add(id);
    }
  }

  console.log(`Processed ${casualtyRows} casualty records`);
  console.log(
    `Cyclist-related collision IDs: ${cyclistCollisionIds.size}`
  );

  console.log("Reading Collisions CSV...");

  const londonCollisions = [];

  let checked = 0;

  for await (const collision of readCSV(FILES.collisions)) {
    checked++;

    const id = getCollisionId(collision);
    if (!id) continue;

    // Police Force 1 = Metropolitan Police
    // Police Force 48 = City of London Police
    const policeForce = Number(collision.police_force);

    if (policeForce !== 1 && policeForce !== 48) {
      continue;
    }

    // 只保留涉及自行车的事故
    // Only keep collisions involving cyclists
    if (!cyclistCollisionIds.has(id)) {
      continue;
    }

    const latitude = validNumber(collision.latitude);
    const longitude = validNumber(collision.longitude);

    // Severity: 1 Fatal, 2 Serious, 3 Slight
    const severityCode = Number(collision.collision_severity);

    const severityMap = {
      1: "Fatal",
      2: "Serious",
      3: "Slight"
    };

    const severity = severityMap[severityCode] || null;

    const date = formatDate(
      collision.date || collision.collision_date
    );

    const locationName = null;
    const borough = null;

    const casualtyCount = casualtyCounts.has(id)
      ? casualtyCounts.get(id)
      : validNumber(collision.number_of_casualties);

    londonCollisions.push([
      id,
      date,
      latitude,
      longitude,
      locationName,
      borough,
      severity,
      1,
      casualtyCount
    ]);
  }

  console.log(`Checked ${checked} collisions`);
  console.log(
    `London cyclist-related collisions: ${londonCollisions.length}`
  );

  // 防止筛选错误时静默导入空数据
  // Prevent silent import of empty data due to filtering errors
  if (londonCollisions.length === 0) {
    throw new Error(
      "No matching London cyclist collisions found. " +
      "Check the CSV headers and field values."
    );
  }


  console.log("Importing collisions into MySQL...");

  const connection = await db.getConnection();

  const BATCH_SIZE = 200;
  let imported = 0;

  try {
    await connection.beginTransaction();

    for (let i = 0; i < londonCollisions.length; i += BATCH_SIZE) {
      const batch = londonCollisions.slice(i, i + BATCH_SIZE);

      const sql = `
        INSERT INTO collisions
        (
          collision_id,
          collision_date,
          latitude,
          longitude,
          location_name,
          borough,
          severity,
          cyclist_involved,
          casualty_count
        )
        VALUES ?
        ON DUPLICATE KEY UPDATE
          collision_date = VALUES(collision_date),
          latitude = VALUES(latitude),
          longitude = VALUES(longitude),
          location_name = VALUES(location_name),
          borough = VALUES(borough),
          severity = VALUES(severity),
          cyclist_involved = VALUES(cyclist_involved),
          casualty_count = VALUES(casualty_count)
      `;

      await connection.query(sql, [batch]);

      imported += batch.length;

      console.log(
        `Imported ${imported} / ${londonCollisions.length}`
      );
    }

    await connection.commit();

    console.log("--------------------------------");
    console.log("Collision import completed!");
    console.log(`Total processed: ${checked}`);
    console.log(`London cyclist collisions: ${imported}`);
    console.log("--------------------------------");

  } catch (error) {
    await connection.rollback();
    throw error;

  } finally {
    connection.release();
  }
}

importCollisions()
  .catch(error => {
    console.error("Import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
