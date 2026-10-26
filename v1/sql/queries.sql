-- Run after selecting your database and installing sql/schema.sql.
SHOW TABLES;
SELECT COUNT(*) AS stations FROM stations;
SELECT COUNT(*) AS snapshots, MIN(recorded_at) AS first_utc, MAX(recorded_at) AS latest_utc FROM station_snapshots;
-- Traverse latest observations, one row per station; MySQL 8 window function.
WITH ranked AS (
 SELECT x.*, ROW_NUMBER() OVER (PARTITION BY station_id ORDER BY recorded_at DESC) AS rn
 FROM station_snapshots x
)
SELECT s.station_id, s.station_name, s.latitude, s.longitude,
 r.available_bikes, r.available_docks, r.capacity, r.is_operational, r.recorded_at
FROM stations s LEFT JOIN ranked r ON s.station_id=r.station_id AND r.rn=1
ORDER BY s.station_id;
-- Replace the ID with your own station ID.
SELECT * FROM station_snapshots WHERE station_id='BikePoints_1' ORDER BY recorded_at DESC LIMIT 100;
