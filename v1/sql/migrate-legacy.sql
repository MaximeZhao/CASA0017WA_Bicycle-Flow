-- OPTIONAL, run AFTER schema.sql in the SAME selected database.
-- Confirm old recorded_at values represent UTC before migration.
-- No DROP, DELETE or overwrite of an existing new record.
-- Invalid old records are skipped; inspect them before migration.
START TRANSACTION;
INSERT INTO stations (station_id, station_name, latitude, longitude, area)
SELECT b.station_id, COALESCE(NULLIF(b.station_name, ''), b.station_id), b.latitude, b.longitude, NULL
FROM bike_stations b
LEFT JOIN stations s ON s.station_id = b.station_id
WHERE s.station_id IS NULL AND b.latitude BETWEEN -90 AND 90 AND b.longitude BETWEEN -180 AND 180;
INSERT INTO station_snapshots
(station_id, recorded_at, available_bikes, available_docks, capacity, is_operational, fault_count, source)
SELECT b.station_id, b.recorded_at, b.available_bikes, NULL, NULL, NULL, NULL, 'legacy bike_stations (UTC assumed)'
FROM bike_stations b
JOIN stations s ON s.station_id = b.station_id
LEFT JOIN station_snapshots n ON n.station_id = b.station_id AND n.recorded_at = b.recorded_at
WHERE n.station_id IS NULL AND b.recorded_at IS NOT NULL AND (b.available_bikes IS NULL OR b.available_bikes >= 0);
COMMIT;
