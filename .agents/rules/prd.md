---
trigger: always_on
glob:
description:项目PRD文档
---

* **目录初始化**：在项目根目录下，必须维护一个名为 `PRD` 的专属文件夹。若该目录不存在，请自动创建。
* **文档沉淀 (全部以 Markdown 格式保存至 `PRD/` 目录，以中文撰写)**：
  - `requirements.md`：提取并转换 Implementation Plan 为标准需求文档。
  - `walkthrough.md`：详细记录项目的 Walkthrough。
  - `communication_log.md`：总结并保存我们的核心沟通记录与决策。
  - `changelog.md`：撰写并持续维护项目的更新日志。
  - `dev_log.md`：记录开发过程中的关键思考、踩坑记录的开发日志。
* **版本控制安全**：在创建 `PRD` 文件夹后，必须立即检查根目录下的 `.gitignore` 文件。如果其中未包含 `PRD/`，请自动将其添加进去，确保该内部文档目录绝对不会被提交或上传至 GitHub。
