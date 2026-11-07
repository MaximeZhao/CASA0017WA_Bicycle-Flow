# Current data processing and coverage

## Saved source and display selection

The bundled SQL snapshot is a saved database state from 29 October 2026. It is not a continuously updated copy of TfL and does not contain every historical date.

| Stage | Stations | Availability observations | Historical collisions |
| --- | ---: | ---: | ---: |
| SQL snapshot (`v4/sql/demo-data.sql`, counts in `snapshot.json`) | 801 | 227,457 | 5,990 |
| Current offline history JSON (`v4/data/history.json`) | 400 | 113,458 | 2,288 |
| Dashboard API for 28 October 2026 | 400 metadata records; 398 with observations | 92,734 | 2,288 |
| Live Map display at one selected time | All 400 stations, with nearby stations grouped | Nearest earlier observation, at most 15 minutes old | At most 100 original records, spatially sampled |

The 400-station selection is stored in `dashboard_stations`; it is a presentation selection, not an API download limit. The original 801-station data remains in SQL. Collisions are restricted to the display bounds, then sampled only for map markers. Daily Flow's 300 m counts use the complete 2,288-record regional dataset, not the 100 map markers.

## Dates in the current offline JSON

| London date | Stations with observations | Observations | Distinct capture times |
| --- | ---: | ---: | ---: |
| 2026-10-12 | 400 | 400 | 1 |
| 2026-10-27 | 398 | 3,184 | 8 |
| 2026-10-28 | 398 | 92,734 | 233 |
| 2026-10-29 | 399 | 17,140 | 43 |

On 28 October, Little Argyll Street (BikePoints_116) and Agar Grove (BikePoints_334) have no observations in the saved source. They remain grey. There are also capture interruptions, including the interval from 16:55:50 to 19:12:32 London time. An observation expires 15 minutes after its capture time. Unknown values are not replaced by zero or interpolated records.

## Runtime behaviour

In JSON mode, Node reads the configured `DATA_FILE` and filters observations to the requested London date. In MySQL mode, it reads the selected stations, that day's observations and regional collisions from MySQL. Both modes return the same dashboard contract. The browser renders every returned station, grouping nearby stations at lower zoom levels.

The current 28 October API response was compared with the configured offline JSON: both the station observations and collision arrays matched exactly. No additional API truncation was found.

`v4/data/showcase.json` is an older fixture with 405 observations at two capture times on 23 October. It is separate from the current larger offline history file and from the SQL snapshot. Automatic fixture tests deliberately use that small file; their fixture counts are not the current database counts.

The collision records are from 2025 DfT/STATS19 data, whereas station observations are from October 2026. Missing fault metrics remain unknown; unavailable docks are not converted into user-submitted fault reports.
