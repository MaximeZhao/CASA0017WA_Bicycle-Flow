-- MySQL 8.0.16+; use an existing empty database selected via DB_NAME.
-- Non-destructive: does not drop or alter the original bike_stations table.
CREATE TABLE IF NOT EXISTS stations (
  station_id VARCHAR(80) PRIMARY KEY,
  station_name VARCHAR(255) NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(10,6) NOT NULL,
  area VARCHAR(255) NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_lat CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_lon CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS station_snapshots (
  station_id VARCHAR(80) NOT NULL,
  recorded_at DATETIME NOT NULL COMMENT 'UTC collection time',
  available_bikes INT UNSIGNED NULL,
  available_docks INT UNSIGNED NULL,
  capacity INT UNSIGNED NULL,
  is_operational BOOLEAN NULL COMMENT 'NULL means unknown, not open',
  fault_count INT UNSIGNED NULL COMMENT 'Only populate from a verified source',
  source VARCHAR(255) NOT NULL,
  PRIMARY KEY (station_id, recorded_at),
  INDEX idx_snapshot_time (recorded_at, station_id),
  CONSTRAINT fk_snapshot_station FOREIGN KEY (station_id) REFERENCES stations(station_id),
  CONSTRAINT chk_operational CHECK (is_operational IS NULL OR is_operational IN (0,1)),
  CONSTRAINT chk_bikes CHECK (capacity IS NULL OR available_bikes IS NULL OR available_bikes <= capacity),
  CONSTRAINT chk_docks CHECK (capacity IS NULL OR available_docks IS NULL OR available_docks <= capacity),
  CONSTRAINT chk_totals CHECK (capacity IS NULL OR available_bikes IS NULL OR available_docks IS NULL OR available_bikes + available_docks <= capacity),
  CONSTRAINT chk_faults CHECK (capacity IS NULL OR fault_count IS NULL OR fault_count <= capacity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS collisions (
  collision_id VARCHAR(80) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  occurred_on DATE NOT NULL,
  latitude DECIMAL(9,6) NOT NULL,
  longitude DECIMAL(10,6) NOT NULL,
  note TEXT NOT NULL,
  source VARCHAR(255) NOT NULL,
  INDEX idx_collision_date (occurred_on),
  CONSTRAINT chk_collision_lat CHECK (latitude BETWEEN -90 AND 90),
  CONSTRAINT chk_collision_lon CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
