USE bike_project;

CREATE TABLE bike_stations (
    station_id VARCHAR(50) PRIMARY KEY, 
    -- station id作为Primary Key
    station_name VARCHAR(255),
    latitude DOUBLE,
    longitude DOUBLE,
    available_bikes INT,
    recorded_at DATETIME
);

show TABLES;