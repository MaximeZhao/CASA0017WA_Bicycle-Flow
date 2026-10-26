"use strict";
const mysql = require("mysql2/promise");
const config = require("./config");
let pool;
function getPool() {
  return pool || (pool = mysql.createPool(config.database));
}
function utc(value) {
  return value.replace(" ", "T") + "Z";
}
function sqlTime(value) {
  return value.replace("T", " ").replace("Z", "");
}
async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
async function readDataset(date) {
  const db = await getPool().getConnection();
  try {
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await db.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
    let selectedDate = date;
    if (!selectedDate) {
      const [rows] = await db.query(
        'SELECT DATE_FORMAT(MAX(recorded_at), "%Y-%m-%d") AS day FROM station_snapshots',
      );
      selectedDate = rows[0].day;
    }
    const [stationRows] = await db.query(
      "SELECT station_id, station_name, latitude, longitude, area FROM stations ORDER BY station_id",
    );
    const stationMap = new Map(
      stationRows.map((s) => [
        s.station_id,
        {
          id: s.station_id,
          name: s.station_name,
          lat: Number(s.latitude),
          lon: Number(s.longitude),
          area: s.area,
          history: [],
        },
      ]),
    );
    let snapshots = [];
    if (selectedDate) {
      const start = selectedDate + " 00:00:00";
      const [rows] = await db.execute(
        "SELECT * FROM station_snapshots WHERE recorded_at >= ? AND recorded_at < DATE_ADD(?, INTERVAL 1 DAY) ORDER BY recorded_at, station_id",
        [start, start],
      );
      snapshots = rows;
      for (const row of rows)
        stationMap
          .get(row.station_id)
          .history.push({
            recordedAt: utc(row.recorded_at),
            bikes: row.available_bikes,
            docks: row.available_docks,
            capacity: row.capacity,
            isOperational:
              row.is_operational === null ? null : Boolean(row.is_operational),
            faults: row.fault_count,
          });
    }
    const [collisionRows] = await db.query(
      "SELECT * FROM collisions ORDER BY occurred_on, collision_id",
    );
    const [days] = await db.query(
      'SELECT DISTINCT DATE_FORMAT(recorded_at, "%Y-%m-%d") AS day FROM station_snapshots ORDER BY day DESC',
    );
    const sources = [...new Set(snapshots.map((r) => r.source))];
    await db.commit();
    return {
      meta: {
        schemaVersion: 2,
        source: "MySQL station observations",
        sources,
        timezone: "UTC",
        availableDates: days.map((r) => r.day),
        date: selectedDate,
      },
      stations: [...stationMap.values()],
      collisions: collisionRows.map((c) => ({
        id: c.collision_id,
        title: c.title,
        date: c.occurred_on,
        lat: Number(c.latitude),
        lon: Number(c.longitude),
        note: c.note,
        source: c.source,
      })),
    };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
async function importDataset(data) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    let snapshots = 0;
    for (const s of data.stations) {
      await connection.execute(
        "INSERT INTO stations (station_id,station_name,latitude,longitude,area) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE station_name=VALUES(station_name),latitude=VALUES(latitude),longitude=VALUES(longitude),area=VALUES(area)",
        [s.id, s.name, s.lat, s.lon, s.area],
      );
      for (const h of s.history) {
        // Same station + timestamp is immutable. Re-importing never overwrites history.
        await connection.execute(
          "INSERT INTO station_snapshots (station_id,recorded_at,available_bikes,available_docks,capacity,is_operational,fault_count,source) VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE station_id=station_snapshots.station_id",
          [
            s.id,
            sqlTime(h.recordedAt),
            h.bikes,
            h.docks,
            h.capacity,
            h.isOperational,
            h.faults,
            data.meta.source,
          ],
        );
        snapshots++;
      }
    }
    for (const c of data.collisions)
      await connection.execute(
        "INSERT INTO collisions (collision_id,title,occurred_on,latitude,longitude,note,source) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE title=VALUES(title),occurred_on=VALUES(occurred_on),latitude=VALUES(latitude),longitude=VALUES(longitude),note=VALUES(note),source=VALUES(source)",
        [c.id, c.title, c.date, c.lat, c.lon, c.note, c.source],
      );
    await connection.commit();
    return {
      stations: data.stations.length,
      snapshotsProcessed: snapshots,
      collisions: data.collisions.length,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
module.exports = { getPool, close, readDataset, importDataset };
