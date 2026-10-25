
const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("node:path");
const db = require("./db");

const app = express();
const PORT = 3000;


app.listen(PORT, "127.0.0.1", () => {
  console.log(`Server: http://localhost:${PORT}`);
});

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false
});


app.get("/api/stations", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT station_id, station_name
      FROM bike_stations
      ORDER BY station_name
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/fault-reports", reportLimiter, async (req, res) => {
  const {
    station_id,
    bike_number,
    fault_target,
    fault_type,
    description
  } = req.body || {};

  const clean = value =>
    typeof value === "string" ? value.trim() : "";

  const stationId = clean(station_id);
  const bikeNumber = clean(bike_number);
  const target = clean(fault_target);
  const type = clean(fault_type);
  const details = clean(description);

  const validTargets = ["bike", "dock", "station"];
  const validTypes = [
    "brake", "tyre", "battery",
    "lock", "dock", "other"
  ];

  if (
    !stationId || stationId.length > 50 ||
    bikeNumber.length > 50 ||
    !validTargets.includes(target) ||
    !validTypes.includes(type) ||
    details.length > 2000
  ) {
    return res.status(400).json({
      error: "Invalid report fields"
    });
  }

  try {

    const [stations] = await db.execute(
      "SELECT station_id FROM bike_stations WHERE station_id = ?",
      [stationId]
    );

    if (stations.length === 0) {
      return res.status(400).json({
        error: "Station does not exist"
      });
    }

    const [result] = await db.execute(`
      INSERT INTO fault_reports
      (
        station_id, bike_number, fault_target,
        fault_type, description, report_status
      )
      VALUES (?, ?, ?, ?, ?, 'pending')
    `, [
      stationId,
      bikeNumber || null,
      target,
      type,
      details || null
    ]);

    res.status(201).json({
      message: "Fault report submitted",
      report_id: result.insertId
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/fault-reports", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT report_id, station_id, bike_number,
             fault_target, fault_type, description,
             report_status, reported_at, resolved_at
      FROM fault_reports
      ORDER BY reported_at DESC
      LIMIT 100
    `);

    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Database error" });
  }
});
