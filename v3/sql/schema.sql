-- MySQL 8+ project schema. Select your own empty database before importing.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `bike_stations` (
  `station_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `station_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `total_docks` int NOT NULL DEFAULT '0',
  `current_bikes` int NOT NULL DEFAULT '0',
  `standard_bikes` int NOT NULL DEFAULT '0',
  `electric_bikes` int NOT NULL DEFAULT '0',
  `empty_docks` int NOT NULL DEFAULT '0',
  `unavailable_docks` int NOT NULL DEFAULT '0',
  `is_locked` tinyint(1) NOT NULL DEFAULT '0',
  `api_modified_at` datetime DEFAULT NULL,
  `last_updated` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`station_id`),
  KEY `idx_station_name` (`station_name`),
  KEY `idx_station_location` (`latitude`,`longitude`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `availability_history` (
  `history_id` bigint NOT NULL AUTO_INCREMENT,
  `station_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bikes` int NOT NULL DEFAULT '0',
  `standard_bikes` int NOT NULL DEFAULT '0',
  `electric_bikes` int NOT NULL DEFAULT '0',
  `empty_docks` int NOT NULL DEFAULT '0',
  `total_docks` int NOT NULL DEFAULT '0',
  `unavailable_docks` int NOT NULL DEFAULT '0',
  `is_locked` tinyint(1) NOT NULL DEFAULT '0',
  `captured_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  UNIQUE KEY `uq_history_station_time` (`station_id`,`captured_at`),
  KEY `idx_history_station_time` (`station_id`,`captured_at`),
  CONSTRAINT `fk_history_station` FOREIGN KEY (`station_id`) REFERENCES `bike_stations` (`station_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `collisions` (
  `collision_id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `collision_date` datetime DEFAULT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `location_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `borough` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `severity` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `cyclist_involved` tinyint(1) NOT NULL DEFAULT '1',
  `casualty_count` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`collision_id`),
  KEY `idx_collision_date` (`collision_date`),
  KEY `idx_collision_location` (`latitude`,`longitude`),
  KEY `idx_collision_cyclist` (`cyclist_involved`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `fault_reports` (
  `report_id` bigint NOT NULL AUTO_INCREMENT,
  `station_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `bike_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fault_target` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'bike',
  `fault_type` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `report_status` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'open',
  `reported_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `resolved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`report_id`),
  KEY `idx_fault_station_status` (`station_id`,`report_status`),
  KEY `idx_fault_reported_at` (`reported_at`),
  CONSTRAINT `fk_fault_station` FOREIGN KEY (`station_id`) REFERENCES `bike_stations` (`station_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dashboard_stations (
 station_id VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
 station_name VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
 latitude DECIMAL(10,7) NOT NULL,
 longitude DECIMAL(10,7) NOT NULL,
 area VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
 is_priority TINYINT(1) NOT NULL DEFAULT 0,
 selection_reason VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
 display_order INT NOT NULL,
 KEY idx_dashboard_order (display_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS dashboard_settings (
 setting_key VARCHAR(80) COLLATE utf8mb4_unicode_ci NOT NULL PRIMARY KEY,
 setting_value JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
