# 更新日志

## v1.1.0（2026-11-05）

内嵌 Lin Hub 发布台，一站式发布闭环成形。

### 新增

- **`modules/lin-hub/`**：内嵌 Lin Hub v1.1.0——Tavo Hub 主题/插件发布管理、Gitee / GitHub 双平台项目推送（tag + Release 附件）、三平台账号管理（多令牌切换）、本地库手动绑定（本地包 ↔ 在线库对应关系），随包零配置
- **「在线库」一键拉起零配置化**：`/api/starthub` 默认使用包内 `modules/lin-hub/launcher.ps1`（此前必须手动配置 `linHubScript` 才能启动）
- Lin Hub 本体同步更新：本地私有配置 `linhub-config.json`（见 `modules/lin-hub/linhub-config.example.json`）、GitHub 空仓库自动引导提交、同名附件自动替换
### 变更

- `config.json` 的 `linHubScript` 语义：从「必填才能启动」改为「可选覆盖项」（指向本机另一份 Lin Hub，覆盖包内版本）

### 兼容

- Lin Hub 为 Windows-only（PowerShell 5.1），仅监听 `localhost:8791`
- 其余功能无任何变化；v1.0.0 用户可直接覆盖升级

## v1.0.0（2026-11-04）

首个公开版本。本地「Obsidian 式」AI 角色扮演素材库管理器。

### 核心功能

- **多库（Vault）管理**：添加 / 移除 / 重命名文件夹库；库路径支持相对路径；隐藏文件开关（含 Windows「隐藏」属性，PowerShell 异步快照不卡顿）
- **预览与编辑**：Markdown 渲染、图片直览、HTML 渲染 / 源码切换、json / jsonl / thm 内文本编辑（Ctrl+S 保存）
- **自动备份**：覆盖保存前自动留带时间戳的 `.bak`（每文件保留最近 3 份），可从「历史版本」随时还原
- **压缩包直读**：ZIP / .thm 双击列出内部清单、条目预览、一键解压（自实现 ZIP 解析，支持 store / deflate）
- **搜索与直达**：库内全文搜索（文件名 + 内容，命中计数与上下文片段）、`Ctrl+P` 快速打开
- **文件操作**：新建 / 重命名 / 移动 / 删除（进系统回收站）、拖拽上传二进制、收藏置顶、系统打开 / 定位
- **角色卡扫描**：识别 chara_card_v2 / v3 角色卡、世界书、PNG 内嵌卡，自动按「角色名_版本号」配对头像图片
- **主题库管理**：扫描 `.thm` 与封面图片（同目录 / 子目录智能匹配）、封面截图保存（同名覆盖、一题一封面）、拖拽 `.thm` 入库
- **内嵌应用**：`/thm/` Lin Thm 主题预览器、`/lwp/` LinWork Pro 卡片编辑器；包内 `modules/` 优先、`config.json` 可覆盖本机版本、缺失时显示友好提示页
- **可选联动**：Lin Hub 一键启动与上架状态徽标（`linHubScript` 配置）；RB 草稿直推代理（目标固定 rubii.ai，凭据仅存本机 data/ 目录且不入库）

### 工程特性

- **纯 Node 零依赖**：HTTP 服务、ZIP 解析、SSE 推送全部为原生模块实现，无 npm 安装步骤
- **安全模型**：仅监听 `127.0.0.1`；所有路径操作经沙盒校验，禁止越出库目录
- **发行工程**：`config.example.json` 零真实路径模板；`scripts/check-staged.js` 个人痕迹模拟检查；`scripts/prepare-release.ps1` 一键产出 src / portable 两个本地产物
