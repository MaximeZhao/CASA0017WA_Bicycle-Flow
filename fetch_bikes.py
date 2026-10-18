
import requests
import mysql.connector
from datetime import datetime, timezone

# 1. TfL BikePoint API
url = "https://api.tfl.gov.uk/BikePoint"

# 2. 从 API 获取数据
response = requests.get(url, timeout=30)
response.raise_for_status()
stations = response.json()

print(f"Fetched {len(stations)} stations from TfL API")

# 3. 连接 MySQL
db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="Gyf030522=",
    database="bike_project"
)

cursor = db.cursor()

# 4. 编写 SQL 插入语句
sql = """
INSERT INTO bike_stations
(station_id, station_name, latitude, longitude,
 available_bikes, recorded_at)
VALUES (%s, %s, %s, %s, %s, %s)
ON DUPLICATE KEY UPDATE
    station_name = VALUES(station_name),
    latitude = VALUES(latitude),
    longitude = VALUES(longitude),
    available_bikes = VALUES(available_bikes),
    recorded_at = VALUES(recorded_at)
"""

# 5. 准备数据
records = []
recorded_at = datetime.now(timezone.utc).replace(tzinfo=None)

for station in stations:

    properties = {
        item["key"]: item["value"]
        for item in station.get("additionalProperties", [])
    }


    bike_count = properties.get("NbBikes")

    # 不把缺失数据错误地记成 0
    if bike_count is None:
        continue

    record = (
        station["id"],
        station["commonName"],
        station.get("lat"),
        station.get("lon"),
        int(bike_count),
        recorded_at
    )

    records.append(record)

# 6. 批量写入 MySQL
try:
    cursor.executemany(sql, records)
    db.commit()
    print(f"Successfully imported {len(records)} station records!")
except mysql.connector.Error:
    db.rollback()
    raise
finally:
    cursor.close()
    db.close()
