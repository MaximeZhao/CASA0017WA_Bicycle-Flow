# London Bike Pulse

地图与 Insights 保留同一网站入口；本次只整理职责、文件路径与 Git 记录，不改变页面设计。

## 先找到你需要的内容

| 内容 | 位置 |
|---|---|
| 网站启动、地图和 Insights | 根目录 `server.js`、`index.html`、`insights.html`，运行 `npm start` |
| 前端样式与交互 | `assets/` |
| 网站数据库适配与配置 | `lib/`、根目录 `.env.example` |
| 网站数据校验、导入与初始化 | `scripts/` |
| 网站建表和查询 | `sql/` |
| 队友上传的采集、事故导入、数据库测试与 CSV 导出 | [data-pipeline/](data-pipeline/README.md) |
| 队友的原始 Word 和文本说明 | `docs/data-pipeline/` |
| 原型设计稿与故事板 | `design/` |
| 小组演示文件 | `docs/presentations/` |
| 旧单文件网页 | `archive/prototypes/` |

完整移动清单见 [目录说明](docs/REPOSITORY_STRUCTURE.md)，贡献来源见 [CONTRIBUTORS.md](CONTRIBUTORS.md)。

队友的数据采集代码与当前网站模板使用不同数据库结构，两套配置和依赖分别保留；整理目录不代表两套数据库已经完成对接。请先阅读 `data-pipeline/README.md` 再运行会写入数据库的命令。

---

## 网站模板使用说明

Leaflet + OpenStreetMap 地图、站点状态、历史回放和站点分析。
使用 Node.js 22.13+、Python 3.10+；数据库模式要求 MySQL 8.0.16+。

## 1. 先启动演示，不需要数据库

```bash
npm install
npm start
```

打开 http://localhost:3000 。默认 `DATA_SOURCE=demo`，页面明确显示 DEMO DATA。
页面保留原版布局、配色、图例、统计浮层、站点图标和时间轴；地图使用 Leaflet + OpenStreetMap。
示例为 33 个模拟站点、11 个采集时间，并有 7 个模拟事故标记。位置仅供教学，车辆数量全部为合成数据，不是实时 TfL 数据。
Leaflet 从本机 npm 包加载；OpenStreetMap 底图需要互联网。

## 同一个网站内切换

只需打开首页，通过顶部 Map Playback / Station Insights 切换页面；两页由同一个 Node 服务提供，共用数据源和原版样式，不跳转外部原型。
切换时保留站点、日期、采样时间和借还模式。地图浮窗的 View station insights 也会打开对应站点的同一时间。
导航状态由 `assets/js/site-navigation.js` 统一管理，通过同站 URL 和当前标签页 sessionStorage 保存。

## 2. 只填数据：JSON 模式

```bash
cp .env.example .env
cp data/example-station.json data/my-data.json
```

编辑 `data/my-data.json`，复制站点对象并替换 ID、名称、经纬度和 history。
也可以从空的 `data/template.json` 开始，参照 `data/example-station.json`。
在 `.env` 中设置：

```ini
DATA_SOURCE=json
DATA_FILE=data/my-data.json
```

验证并启动：

```bash
npm run data:validate -- data/my-data.json
npm start
```

数据字段见 [docs/API_DATA_FORMAT.md](docs/API_DATA_FORMAT.md)。JSON 可以包含多个日期。
修改数据文件后点 Refresh，无需改地图代码。修改 `.env` 后需要重启服务。
模板不自动回退演示数据，真实数据失败会明确显示错误。

## 3. MySQL 模式

由数据库管理员先创建数据库及专用用户（把占位密码替换为自己的强密码）：

```sql
CREATE DATABASE bike_project CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'bike_app'@'localhost' IDENTIFIED BY 'replace-with-your-own-password';
GRANT SELECT, INSERT, UPDATE, CREATE, REFERENCES, INDEX ON bike_project.* TO 'bike_app'@'localhost';
```

这些语句只用于新环境；已有数据库/用户请复用，不要重复创建或清空数据库。
将 `.env` 中的 `DB_HOST`、`DB_PORT`、`DB_USER`、`DB_PASSWORD`、`DB_NAME` 填好。
初始化及导入：

```bash
npm run db:init
npm run data:import -- data/my-data.json
```

再设置 `DATA_SOURCE=mysql`，运行 `npm start`。
`db:init` 不会自动创建数据库，不会删除或修改旧 `bike_stations` 表。
同一站点 + 同一秒的快照重复导入时保留原记录，不覆盖历史。
数据库中导入不同来源时请使用不同站点 ID，避免 ID 冲突。

### 迁移原来的表

先备份旧数据库，检查旧 `recorded_at` 确实为 UTC，再在选中的数据库执行：

```sql
SOURCE sql/migrate-legacy.sql;
```

它保留旧表，只拷贝新表中不存在的记录。旧数据没有空桩、容量、关闭状态和故障数据，这些字段保留 NULL；地图显示 Unknown，不能把未知状态解释为营业。
如果原表已覆盖历史，迁移不能恢复那些被覆盖的数据。

## 4. 自动采集 TfL

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/fetch_bikes.py --output data/tfl-latest.json
npm run data:validate -- data/tfl-latest.json
```

先用上面的 JSON 导出检查数据，不需要连接数据库。
确认数据库初始化完成后：

```bash
python scripts/fetch_bikes.py
python scripts/fetch_bikes.py --interval-minutes 5
```

第一条采集一次并写入 MySQL；第二条每 5 分钟采集。Ctrl+C 停止。
`--output` 只导出最新批次，重复运行会替换该文件；需要持续历史请使用 MySQL 模式。
自动运行依赖采集进程持续在线；正式部署可用系统服务管理它。
时间是采集时刻，所有存储、API、日期选择和图表均为 UTC，不代表 TfL 每条字段的源端更新时间。
`faults` 没有可靠字段，保留 NULL，不用“容量减车辆减空桩”假装计算故障车辆数。

## 5. 数据库结构

- `stations`：站点资料，真实经纬度；不再存 SVG x/y。
- `station_snapshots`：每个采集时刻的车辆、空桩、容量、运营状态，联合主键保留历史。
- `collisions`：可选真实事故数据，有独立日期、来源；默认没有事故数据。

[docs/DATABASE_REVIEW.md](docs/DATABASE_REVIEW.md) 解释原表问题、新表和数据流。
[sql/queries.sql](sql/queries.sql) 提供遍历最新状态与历史记录的查询。

## 6. 页面和接口

- `/`：地图、借还切换、历史时间轴、可选事故图层。
- `/insights.html?station=你的站点ID&date=2026-10-19`：与地图页相同的原版视觉样式，含站点列表、指标、趋势图、故障/事故数据、全网状态柱状图和站点表格。
- `GET /api/dashboard`：最新有记录的 UTC 日期。
- `GET /api/dashboard?date=2026-10-19`：一天的数据。
- `GET /api/health`：进程状态和数据模式；不表示数据库已连通。

时间轴只选择已采集时刻，不生成中间车辆数量。每个站点显示该时间之前最近一次记录；超过 15 分钟显示灰色，可通过 `STALE_AFTER_SECONDS` 调整。
选择历史日期不会伪装为实时；当前日期 Latest 模式也会和当前时钟比较，以识别采集中断。
地图颜色：6+ 绿色、1–5 黄色、0 红色、关闭深灰、未知/过期浅灰。
站点资料是当前版本；历史快照保存状态，不保存站点改名/搬迁的历史资料版本。

## 7. 验证

```bash
npm test
python3 -m unittest discover -s tests -p 'test_*.py'
```

Node 测试覆盖数据契约、历史选择、日期过滤、未知状态、HTTP 接口和私密文件保护。
Python 测试覆盖 TfL 字段映射、缺失值、关闭状态和无效批次。
MySQL 还需在隔离的空测试库中验证（`DB_NAME` 必须以 `_test` 结尾）：设置 `DATA_SOURCE=mysql` 和测试库连接后运行 `node tests/mysql-integration.js`。流程：初始化 → 导入两次 → 查询记录数不增加 → 导入新时刻 → 记录数增加。

## 8. 部署与团队协作

前端使用同源 `/api/dashboard`，不再把 API 写死为 localhost。
默认只监听本机；需要局域网访问时在 `.env` 设置 `HOST=0.0.0.0`。
公开服务应放在 HTTPS 反向代理后，使用受限数据库账号。当前模板没有用户登录与写入型网页接口。
静态服务只开放页面、CSS、浏览器 JS 和 Leaflet，不开放 Python、SQL、`.env` 或 Git 文件。
旧数据库密码曾出现在仓库里，请更换密码；从当前文件移除不等于清除 Git 历史中的密码。
不要提交 `.env`、虚拟环境或真实密码。

5 人分工见 [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md)。

地图参考：

- https://leafletjs.com/examples/quick-start/
- https://operations.osmfoundation.org/policies/tiles/
- https://api.tfl.gov.uk/BikePoint

保留 OpenStreetMap 可见署名，使用普通浏览器瓦片缓存；不预下载或批量抓取底图。高流量部署请配置合适的瓦片服务，地址在 `assets/js/config.js`。
