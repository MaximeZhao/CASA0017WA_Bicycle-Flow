# 项目目录

- `v1/`：已有网站代码和配置，`original-upload/` 保留早期页面快照。
- `v2/`：已有数据采集、导出和 API 原型代码。
- `docs/`、`design/`：共享文档、PPT、设计稿，保留原位置和内容。

本次仅整理目录，不修改业务逻辑，不改写历史提交。

## 运行

网站：`cd v1 && npm install && npm start`。

API 原型：`cd v2 && npm install && npm run start:prototype`。需要在该目录的 `.env` 配置数据库连接；原有上传内容不包含完整网站前端。采集、导出命令见 `v2/package.json`。

共享技术文档中原网站根目录路径现在对应 `v1/`；保留文档原文。
