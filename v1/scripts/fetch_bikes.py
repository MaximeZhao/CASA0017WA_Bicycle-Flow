"""Collect TfL BikePoint observations once, or at a configured interval.
No writes on HTTP/parse failure. SQL writes use one transaction per batch.
"""
import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def count(properties, key):
    value = properties.get(key)
    if value is None or value == "":
        return None
    number = int(value)
    if number < 0 or number > 1000000:
        raise ValueError(f"Invalid {key}")
    return number


def operational(properties):
    installed = properties.get("Installed", "").lower()
    locked = properties.get("Locked", "").lower()
    if installed == "false" or locked == "true":
        return False
    if installed == "true" and locked == "false":
        return True
    return None


def transform(stations, recorded_at):
    if not isinstance(stations, list):
        raise ValueError("TfL must return a station array")
    result = []
    seen = set()
    for station in stations:
        station_id = station["id"]
        if station_id in seen:
            raise ValueError("Duplicate TfL station ID")
        seen.add(station_id)
        properties = {p["key"]: p["value"] for p in station.get("additionalProperties", [])}
        lat, lon = float(station["lat"]), float(station["lon"])
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError("Invalid coordinates")
        bikes, docks, capacity = (count(properties, key) for key in ("NbBikes", "NbEmptyDocks", "NbDocks"))
        if capacity is not None:
            if any(v is not None and v > capacity for v in (bikes, docks)):
                raise ValueError("Counts exceed capacity")
            if bikes is not None and docks is not None and bikes + docks > capacity:
                raise ValueError("Bikes + empty docks exceeds capacity")
        result.append({"id": station_id, "name": station["commonName"], "lat": lat, "lon": lon, "area": None,
                       "history": [{"recordedAt": recorded_at, "bikes": bikes, "docks": docks, "capacity": capacity,
                                    "isOperational": operational(properties), "faults": None}]})
    if not result:
        raise ValueError("Empty TfL response; existing data was not modified")
    return {"meta": {"schemaVersion": 2, "timezone": "UTC", "source": "TfL BikePoint (collection time)"},
            "stations": result, "collisions": []}


def save_mysql(data):
    import mysql.connector
    db = mysql.connector.connect(host=os.getenv("DB_HOST", "127.0.0.1"), port=int(os.getenv("DB_PORT", "3306")),
                                 user=os.getenv("DB_USER", "bike_app"), password=os.getenv("DB_PASSWORD", ""),
                                 database=os.getenv("DB_NAME", "bike_project"))
    cursor = db.cursor()
    try:
        db.start_transaction()
        for s in data["stations"]:
            cursor.execute("""INSERT INTO stations (station_id,station_name,latitude,longitude,area)
                VALUES (%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE station_name=VALUES(station_name),
                latitude=VALUES(latitude),longitude=VALUES(longitude),area=COALESCE(VALUES(area),area)""",
                           (s["id"], s["name"], s["lat"], s["lon"], s["area"]))
            h = s["history"][0]
            cursor.execute("""INSERT INTO station_snapshots
                (station_id,recorded_at,available_bikes,available_docks,capacity,is_operational,fault_count,source)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
                ON DUPLICATE KEY UPDATE station_id=station_snapshots.station_id""",
                           (s["id"], datetime.strptime(h["recordedAt"], "%Y-%m-%dT%H:%M:%SZ"), h["bikes"], h["docks"],
                            h["capacity"], h["isOperational"], h["faults"], data["meta"]["source"]))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        cursor.close()
        db.close()


def collect(output):
    import requests
    params = {"app_key": os.environ["TFL_APP_KEY"]} if os.getenv("TFL_APP_KEY") else {}
    response = requests.get("https://api.tfl.gov.uk/BikePoint", params=params, timeout=30,
                            headers={"User-Agent": "LondonBikePulse/2.0"})
    response.raise_for_status()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = transform(response.json(), now)
    if output:
        # Export one batch for inspection/import. MySQL mode retains history across batches.
        target = Path(output)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(target)
    else:
        save_mysql(data)
    print(f"{now}: collected {len(data['stations'])} stations", flush=True)


def main():
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", help="Export JSON instead of writing MySQL")
    parser.add_argument("--interval-minutes", type=float, default=0, help="0 = once; otherwise >= 1 minute")
    args = parser.parse_args()
    if args.interval_minutes != 0 and args.interval_minutes < 1:
        parser.error("interval must be 0 or at least 1 minute")
    while True:
        try:
            collect(args.output)
        except Exception as error:
            # Avoid logging request URLs, which can include an API key.
            print(f"Collection failed ({type(error).__name__}); previous records kept.", flush=True)
            if args.interval_minutes == 0:
                raise SystemExit(1)
        if args.interval_minutes == 0:
            break
        time.sleep(args.interval_minutes * 60)


if __name__ == "__main__":
    main()
