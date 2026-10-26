# Dashboard API data format

The browser should call a backend API. It should **not connect directly to MySQL**, because that would expose the database password.

## Endpoint

`GET /api/dashboard`

The endpoint must return JSON in this shape:

```json
{
  "meta": {
    "date": "2026-10-15",
    "source": "Santander Cycles API",
    "hours": [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
  },
  "stations": [
    {
      "id": "S01",
      "name": "King's Cross",
      "area": "Camden",
      "x": 612,
      "y": 262,
      "capacity": 30,
      "locked": false,
      "history": [
        { "hour": 8, "bikes": 12, "docks": 16, "faults": 2 }
      ]
    }
  ],
  "collisions": [
    {
      "x": 350,
      "y": 250,
      "title": "Hampstead Road and Finchley Road",
      "date": "2026-03-12",
      "note": "Description shown in the tooltip."
    }
  ]
}
```

## Field meanings

- `x` and `y`: station position inside the 1440 × 700 SVG map.
- `capacity`: total docks at the station.
- `bikes`: bikes available to borrow.
- `docks`: empty docks available for returns.
- `faults`: reported faulty bikes.
- `locked`: when true, borrowing and returning are disabled.
- `history`: ordered snapshots matching `meta.hours`.

If you later use latitude and longitude, convert them to map coordinates in the backend or add a projection function in the frontend.
