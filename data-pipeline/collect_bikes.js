
const db = require("./db");

const API_URL = "https://api.tfl.gov.uk/BikePoint";

// Convert to a number. Return null if the value is missing.
function toNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

// MySQL 时间统一使用 UTC
// Convert a JavaScript Date object to a MySQL DATETIME string in UTC.
function mysqlTime(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function collectBikes() {
  console.log("Starting TfL BikePoint collection...");

  // Step 1: 一次请求所有站点数据
  // Step 1: Fetch all station data in one request
  const response = await fetch(API_URL, {
    signal: AbortSignal.timeout(60000)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(
      `API ${response.status}: ${message.slice(0, 300)}`
    );
  }

  const stations = await response.json();

  if (!Array.isArray(stations)) {
    throw new Error("Unexpected BikePoint response format");
  }

  console.log(`Fetched ${stations.length} stations from TfL`);

  // Step 2: 连接 MySQL
  // Step 2: Connect to MySQL
  const connection = await db.getConnection();
  const capturedAt = mysqlTime(new Date());

  let imported = 0;
  let skipped = 0;

  const stationSQL = `
    INSERT INTO bike_stations
    (
      station_id, station_name, latitude, longitude,
      total_docks, current_bikes, standard_bikes,
      electric_bikes, empty_docks, unavailable_docks,
      is_locked, last_updated
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      station_name = VALUES(station_name),
      latitude = VALUES(latitude),
      longitude = VALUES(longitude),
      total_docks = VALUES(total_docks),
      current_bikes = VALUES(current_bikes),
      standard_bikes = VALUES(standard_bikes),
      electric_bikes = VALUES(electric_bikes),
      empty_docks = VALUES(empty_docks),
      unavailable_docks = VALUES(unavailable_docks),
      is_locked = VALUES(is_locked),
      last_updated = VALUES(last_updated)
  `;

  const historySQL = `
    INSERT INTO availability_history
    (
      station_id, bikes, standard_bikes,
      electric_bikes, empty_docks, total_docks,
      unavailable_docks, is_locked, captured_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  try {
    await connection.beginTransaction();

    // Step 3: 遍历全部站点
    // Step 3: Iterate through all stations
    for (const station of stations) {
      const properties = Object.fromEntries(
        (station.additionalProperties || [])
          .map(item => [item.key, item.value])
      );

      const bikes = toNumber(properties.NbBikes);
      const total = toNumber(properties.NbDocks);

      const empty = toNumber(
        properties.NbEmptyDocks ?? properties.NbSpaces
      );

      // 不编造缺失的详细数据
      // Do not fabricate missing detailed data
      const standard = null;
      const electric = null;

      const unavailable =
        total !== null && bikes !== null && empty !== null
          ? Math.max(0, total - bikes - empty)
          : null;

      let isLocked = null;

      if (properties.Locked === "true") isLocked = 1;
      if (properties.Locked === "false") isLocked = 0;

      if (!station.id || bikes === null || bikes < 0) {
        skipped++;
        continue;
      }

      // Step 4: 更新站点表
      // Step 4: Update the station table
      await connection.execute(stationSQL, [
        station.id,
        station.commonName ?? station.id,
        toNumber(station.lat),
        toNumber(station.lon),
        total,
        bikes,
        standard,
        electric,
        empty,
        unavailable,
        isLocked,
        capturedAt
      ]);

      // Step 5: 新增历史记录
      // Step 5: Insert a new history record
      await connection.execute(historySQL, [
        station.id,
        bikes,
        standard,
        electric,
        empty,
        total,
        unavailable,
        isLocked,
        capturedAt
      ]);

      imported++;
    }

    // Step 6: 保存到数据库
    // Step 6: Commit to the database
    await connection.commit();

    console.log("-------------------------------");
    console.log(`Imported stations: ${imported}`);
    console.log(`Skipped stations: ${skipped}`);
    console.log(`Capture time (UTC): ${capturedAt}`);
    console.log("MySQL import completed!");
    console.log("-------------------------------");

  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

collectBikes()
  .catch(error => {
    console.error("Import failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
