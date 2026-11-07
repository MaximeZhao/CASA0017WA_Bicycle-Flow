# Mind The Dock Live Map PBIs

These changes apply to the active `v5/` application.

| PBI | Result | Acceptance check |
| --- | --- | --- |
| 1. Brand and navigation | Mind The Dock branding; Home, Live Map, Daily Flow and Contact Us routes. Daily Flow uses the original `/insights.html` address and all original availability analysis functions. `/daily-flow.html` remains an alias on an updated server. | Test both the top navigation and a station's View daily flow link. Confirm the station, date, London time and borrow/return mode are retained. Check search, selection, curves, summary metrics, nearby collision counts, network bars, filters, sorting, playback and date selection. |
| 2. Area and station search | Search local area names and stations from the loaded observations. An area fits the map to its selected stations; a station opens its details. | Search Canary Wharf, Hackney or British Museum. Select a result by clicking or using arrow keys and Enter. Escape dismisses results. Unknown queries show an empty result message. |
| 3. Responsive pages | Full-width desktop map; responsive navigation, search, controls, details and analysis. The fixed 1440 × 900 canvas scale is removed. | Check desktop and 390 px / 320 px phone widths. Confirm the timeline is accessible and pages do not clip horizontally. Analysis pages scroll naturally. |
| 4. Static red stations | Unavailable stations remain red without the flashing animation. | Inspect a zero-availability station in each mode; colour remains steady. |

## Data scope

V5 displays all 797 stations from the November CSV. There are 24 original capture times across 4–5 November, with 19,094 observations. Kensington Gore and Prince Consort Road disappear after the first seven captures; missing records remain unknown. Playback visits recorded snapshots only. The prior regional collision dataset is retained, so collision coverage is narrower than the station network.

Search covers the areas represented in the loaded station data, using the original station area or the area suffix in its name. It is not a general address geocoder or a borough-boundary search.

Contact Us contains the project introduction, project mailbox, five team members with their supplied roles and email addresses, and the actual data sources. All contact details, sources and copyright text are plain text without hyperlinks; only the top site navigation and brand link navigate between pages. Daily Flow reports station availability, not measured trip flows.

The collision layer uses red warning triangles with exclamation marks and a keyboard-accessible on/off switch. The simplified map key contains only high, limited, unavailable and historic collision entries. Closed station, no fresh observation and out-of-service docks entries have been removed from the key. Actual missing/closed states remain unknown/closed in the underlying data. The map-corner attribution control is removed; OpenStreetMap attribution is visible below the timeline instead.

Daily Flow retains the complete desktop dashboard on sufficiently large screens and uses natural scrolling on smaller screens. Timeline geometry uses elapsed time so irregular capture intervals do not shift the displayed clock away from the tick labels.

## Local use

Restart `npm start` after this change so the Node server picks up the new page routes. For subsequent development, `npm run dev` watches the Node server and its imported modules and restarts them when their code changes. Refresh the browser after frontend changes. Continue using your existing data-source environment variables. Database schema, collector behaviour and original observation files are unchanged.
