# Repository structure and file movement

The main website and the teammate's data pipeline share one repository while keeping their responsibilities, dependencies and database configuration explicit.

```text
Axure_Test/
├── index.html                 Main map page
├── insights.html              Station insights, same website
├── server.js                  Main website and dashboard API
├── package.json               Main website dependencies and commands
├── .env.example               Main website configuration template
├── assets/                    Frontend CSS, JavaScript and shared navigation
├── lib/                       Main website configuration and database adapters
├── scripts/                   Main website import, validation, initialization and Python collector
├── sql/                       Main dashboard schema, migration and queries
├── tests/                     Automated verification
├── data/                      Demo JSON, empty template and format examples
├── data-pipeline/             Teammate collection, DfT import, exports and prototype API
│   ├── package.json           Independent original dependency family
│   ├── .env.example           Independent pipeline database configuration
│   ├── db.js
│   ├── collect_bikes.js
│   ├── collect_collisions.js
│   ├── inspect_collision_data.js
│   ├── export_csv.js
│   ├── test_db.js
│   ├── prototype-server.js
│   └── data/{raw,exports}/    Local CSV inputs and outputs, ignored by Git
├── design/{wireframes,storyboards}/
├── docs/
│   ├── data-pipeline/         Teammate's original Word and text explanations
│   ├── presentations/         Group slide decks
│   └── ...                    Current interface, validation and database documentation
└── archive/prototypes/        Historical single-file frontend backup
```

## Movement map

| Before | After |
|---|---|
| `db.js`, `collect_bikes.js`, `collect_collisions.js`, `inspect_collision_data.js`, `export_csv.js`, `test_db.js` | Same filenames under `data-pipeline/` |
| Teammate's conflicting `server.js` | `data-pipeline/prototype-server.js` |
| Teammate's package/lock definitions | `data-pipeline/package.json`, `data-pipeline/package-lock.json` |
| `Data Explanation.docx`, `Code Explain.txt` | `docs/data-pipeline/` |
| `wireframe/` | `design/wireframes/` |
| `storyboard/` | `design/storyboards/` |
| `presentation/` | `docs/presentations/` |
| `index.single-file.backup.html` | `archive/prototypes/index.single-file.backup.html` |
| `创建表格.sql` | `sql/创建表格.sql` |
| `运行Practice.sql` | `sql/queries.sql` |
| `fetch_bikes.py` | `scripts/fetch_bikes.py` |

Path-only adjustments: Python project-root lookup and test import; pipeline dotenv lookup; prototype default port 3001 to avoid the main server; documentation references and named pipeline npm commands.

## History and attribution

The teammate's upload commits and upstream merge are preserved as ancestors. The previous uncommitted website work is recorded separately, followed by a normal merge and a directory-organization commit. No squash, rebase or force-push is used.

Use `git log --follow -- data-pipeline/collect_bikes.js` to inspect the upload and subsequent move. A file's latest commit can show the organizer; its earlier author history remains available. The Contributors section is calculated by GitHub and can refresh asynchronously.

The credentials file was uploaded upstream before this organization. It is removed from the tracked current tree and retained only locally as an ignored file. Historical copies remain because history is preserved; the owner should rotate any real password that was committed.
