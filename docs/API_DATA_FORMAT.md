# 数据契约 v2：文件、导入和 HTTP 共用

不支持旧版 SVG x/y + 小时数字格式。地图使用 Leaflet 经纬度，历史使用完整 UTC 时间。

## 最小可填写数据

```json
{
  "meta": {
    "schemaVersion": 2,
    "source": "Your verified source",
    "timezone": "UTC"
  },
  "stations": [
    {
      "id": "your-station-001",
      "name": "Your station",
      "lat": 51.529163,
      "lon": -0.10997,
      "area": null,
      "history": [
        {
          "recordedAt": "2026-10-20T08:00:00Z",
          "bikes": 9,
          "docks": 8,
          "capacity": 19,
          "isOperational": true,
          "faults": null
        }
      ]
    }
  ],
  "collisions": []
}
```

上面是格式示例，不是当前实时观测。

## 规则

- ID 非空且唯一；站点/事故 ID 最长 80 个字符，名称/来源最长 255 个字符。
- 经纬度必须是数字，纬度 -90～90，经度 -180～180。
- area 是字符串或 null。
- recordedAt 为 `YYYY-MM-DDTHH:mm:ssZ`，只接受 UTC 整秒；每个站点的 history 严格升序且不重复。
- bikes、docks、capacity、faults 必须是 0～1,000,000 的整数，或 null（未知）。所有字段均需存在。
- 当容量已知时，车辆、空桩、故障数量不能超过容量，bikes + docks 不能超过容量；不要求等于容量。
- isOperational 为 true / false / null；false 是关闭，null 是未知。
- 未知不能用 0 替代。故障数量只有经过验证的数据源提供时才能填。
- stations、history 和 collisions 都可以为空数组，页面会显示空状态。
- 同一数据集的所有状态使用 meta.source；MySQL 按每条快照保存来源。

## 可选事故记录

```json
{
  "id": "your-collision-001",
  "title": "Location name",
  "date": "2025-10-12",
  "lat": 51.51,
  "lon": -0.12,
  "note": "Verified description from your dataset",
  "source": "Dataset name and publication reference"
}
```

放入 collisions 数组。事故图层展示已加载全部事故，独立于站点时间轴；不自动推断事故概率或安全路线。

## GET /api/dashboard

可选参数 `date=YYYY-MM-DD`，按 UTC 日期过滤历史。不提供日期时选择最新有记录的一天。
输入文件不需要填写下面这些输出字段，后端会生成：

- meta.mode：demo / json / mysql。
- meta.date：选中日期或 null。
- meta.availableDates：有快照的日期列表，倒序。
- meta.timestamps：当天所有实际采集时间的去重排序列表。
- meta.generatedAt：接口生成时间，不是数据采集时间。
- meta.staleAfterSeconds：站点数据可接受的最大时间间隔。

非法日期返回 400。数据源错误返回 503，不切换为演示数据。指定日期没有记录时返回 200 和空 history。

## 文件位置

- 可直接复制：`data/example-station.json`
- 空模板：`data/template.json`
- 可切换数据源：`.env`
- 契约校验：`assets/js/data-contract.js`（Node 和浏览器共用）
