# Lin Hub v1.1.0

Lin 家族工具（Lin Files / Lin Thm / Lin Hub）。本地小工具，管理你在 Tavo Hub（hub.tavoai.dev）上的主题与插件：更新、批量发布、封面管理、多账号切换。

## 启动

- **桌面快捷方式「Lin Hub」**（推荐）：双击即启动隐藏后台服务并自动打开页面。服务已在跑时再双击，只会打开页面，不会起第二个实例
- 或双击应用目录里的 `start.bat`（会显示一个最小化窗口）
- 停止服务：双击 `stop.bat`，或任务管理器结束对应的 PowerShell 进程
- 服务仅在 localhost:8791 监听，外部无法访问

桌面快捷方式丢失时，双击 `make-shortcut.ps1` 重建（可用 `make-shortcut.ps1 -Name "名字"` 自定名）。图标 `icon.ico` 来自 Lin 家族图标库（lin-hub 一枚，含 ico 与 plain/seal-dark/seal-light 三套 PNG，重新生成用库内 `gen-lin-hub.ps1`）。

## 功能

| 页签 | 功能 |
|---|---|
| 主题库 | 全部主题列表（封面缩略图 / 已发布 vs 最新版本 / 同步状态），单主题：详情（版本历史、改外链、发布指定版本）、上传新版本（.thm + 可选封面，可自动发布）、仅换封面（不重传包）、备份云端包到 `backups\` |
| 批量任务 | 指定本地主题目录（+可选封面目录）→ 生成计划（自动按 theme.json 名匹配 hub，支持改名映射）→ 勾选行 → 批量"更新包+发布"／"仅换封面"／**"新建并发布"**。hub 上不存在的主题会自动列为新建行（可逐个填版本号），已发布版本相同的自动跳过 |
| 封面 | 全主题封面网格，单个"仅换封面"（服务端沿用旧包，只更新封面图，版本 +1，**不需要本地 .thm**） |
| 插件 | 列表 / 检查包（check-package）/ 更新并发布（一步 PATCH）/ 改元数据（不传包改名、外链、描述）/ 上传新插件。**分类只能从 hub 的 6 个 key 里选一个**（记忆 memory、玩法 gameplay、聊天 chat、创作 creation、美化 appearance、工具 utilities），外链可留空（留空时整个字段不发送），提交前自动先验包 |
| 本地库 | 指定目录扫出全部 .thm / .tpg（解析包内名称与版本），逐个手动绑定 Tavo Hub 主题/插件、Gitee 项目、GitHub 项目（存 data\bindings.json）；批量任务匹配 hub 时优先用绑定 |
| 项目推送 | Gitee / GitHub 双平台发布台：每个版本打 tag + Release，包作为附件上传；owner/仓库可每次手填；GitHub 空仓库自动引导提交、同名附件自动替换 |

## 账号

右上角「账号管理」：

- **邮箱验证码登录**：输入邮箱 → 发送验证码 → 输入验证码 → 登录（已有账号走登录，新邮箱自动注册）
- **从浏览器导入会话**：读取 Brave/Chrome 本地存储里已登录的 hub 会话（需先完全关闭浏览器）
- **手动添加 sid**
- 多账号随时下拉切换，记录存 `data\accounts.json`（sid 为明文，本机自用请勿外传此目录）
- **Gitee / GitHub 多账号**：同一弹窗内切换平台页签，粘贴令牌即验证添加，多账号可切换当前账号；项目推送使用当前账号的令牌

## 输入提示

所有填路径的输入框（主题目录、封面目录、.thm / .tpg / 封面 路径）**都同时支持带引号和不带引号**：

```
"D:\…\插件目录\linmask-v0.2.7.tpg"
D:\…\插件目录\linmask-v0.2.7.tpg
```

Windows 资源管理器「复制为路径」会自带双引号，直接粘贴即可——前端会在失焦时自动去掉引号（含全角引号 “ ” 和首尾空格），后端也会再归一化一次，所以从 API 调用同样有效。

## 本地配置（linhub-config.json）

复制 `linhub-config.example.json` 为同目录 `linhub-config.json` 并填入真实值（该文件不入库，已加入 .gitignore）：
`giteeToken` / `giteeRepo` / `hubAccount{sid,name}` / `braveUserData` / `chromeUserData`，所有键均可留空。
令牌与账号也可以运行后在「账号管理」里添加（存 `data\*.json`，同样不入库）。修改后即时生效，无需重启服务。

## 故障排查

**双击没反应 / 页面打不开**

启动器现在会**自动处理卡死**：健康检查走真实 HTTP（`/api/session/check`），如果端口在监听但不再响应（旧服务卡住），会杀掉残留进程并重新拉起，然后再打开页面。失败会弹消息框（10 秒自动关闭）并写日志。

1. `logs\launcher.log`：启动器每一步（路径、健康检查、拉起的 PID、是否杀过卡死进程）
2. `logs\server.log`：每个请求一行（方法 + 路径 + 耗时），错误会记 `ERROR ...`，超 3 秒的慢请求一定有记录
3. 想彻底重置：`stop.bat` 停服务，再双击快捷方式

**为什么 ps1 必须有 BOM（重要）**

PS5.1 读取无 BOM 的 .ps1 时按系统 ANSI（中文环境是 GBK）解码。UTF-8 的中文注释会被解成乱码，**而且实测会吞掉紧随其后的那一行代码**（例如 `$serverPath = ...` 整行消失，变量变 null，进而 `Start-Process` 报「ArgumentList 包含 Null 值」——在隐藏窗口里完全看不到）。所以本目录所有含中文的 ps1 都存成 UTF-8 **带 BOM**。新增/修改脚本后务必检查。

## 技术说明

- **架构**：`server.ps1` 只做入口与调度（HttpListener 接受连接 → 交给 RunspacePool 的 6 个 worker 并发处理）；业务全部在 `linhub-lib.ps1`。此前服务是单线程串行处理，一次批量上传会让整页请求排队（实测 10 个并发请求串行耗时 10 秒），现已改为并发（3.6 秒）
- **改前端后必须把 `www\app.html` 里 `app.js?v=N` / `app.css?v=N` 的 N 加一**：静态资源现在带 `Cache-Control: no-store`，但已经缓存过的旧副本仍可能被复用，改版本号是唯一可靠的破缓存手段
- 路径统一走 `Normalize-Path`（后端）与 `normPath()`（前端）清洗引号
- 账号状态以 `data\accounts.json` 为准，每个请求重读——多线程下内存缓存会不一致
- PowerShell 变量名**不区分大小写**：`$workers` 与参数 `$Workers` 是同一个变量，改代码时注意


- 纯 PowerShell 5.1（HttpListener + HttpClient），无外部依赖；前端为单页 HTML/JS/CSS
- 内容 API 基址 `https://hub.tavo.cc/api/v1/...`；**账号/登录 API 基址 `https://ag.tavo.cc/api/...`**（accounts/*、auth/email、v2/verification/email）
- 大响应（主题列表带全部 manifest，>2MB）直接字节透传给浏览器解析，绕开 PS5.1 ConvertFrom-Json 的 MaxJsonLength 限制
- 批量执行为独立 PowerShell 进程（`batch-run.ps1`），进度写 `jobs\*.json`，页面 1.5 秒轮询
- 每项操作之间固定 1.2 秒间隔，避免触发服务端限流
- 会话失效时右上角状态灯变红，到「账号管理」重新登录即可

## 已知边界

- 主题 metadata 编辑仅支持 external_url（SPA 的 PATCH 也只有这个字段）；改摘要/标签需走网页
- 插件分类固定 6 个（记忆/玩法/聊天/创作/美化/工具），一个插件只能占一个；名称或描述留空时会自动取包内 manifest 的值
- 「仅换封面」会使版本号 +1（hub 无零版本换封面接口，实测 `theme_file` 可省略、旧包自动沿用）
- **新建主题**走 `POST /v1/creator/themes`（FormData：`theme_file` + 可选 `cover_file` + `metadata{name,version,external_url}`），**创建即发布**，无需再调 publish。另确认存在 `POST .../{id}/unpublish` 与 `DELETE .../{id}`（未接入界面）
- Google OAuth 无法在本地工具内完成，请用邮箱验证码或浏览器导入
