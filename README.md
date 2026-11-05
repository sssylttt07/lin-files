# Lin Files

**English summary:** Lin Files is a local, "Obsidian-style" library manager for AI roleplay assets — Markdown notes, character cards (JSON / PNG-embedded), world books, chat logs, and Tavo `.thm` theme packages. Pure Node.js, zero npm dependencies, single `server.js` backend + static frontend. It listens on `127.0.0.1` only and touches nothing outside the folders you add. Bundled apps: Lin Thm previewer at `/thm/`, LinWork Pro editor at `/lwp/`, and the Lin Hub publishing console (Tavo Hub + Gitee/GitHub releases; Windows-only, runs on its own `localhost:8791` via a bundled PowerShell backend, one-click launch from the UI). All self-contained under `modules/`, zero-config.

---

Lin Files 是一个本地「Obsidian 式」**AI 角色扮演素材库管理器**：多库（Vault）管理、Markdown / JSON / JSONL / .thm 预览与编辑、主题包直读、封面管理、带时间戳的自动备份。**纯 Node、零依赖、数据全部只存在本机。**

## 架构

```
  浏览器（仅 127.0.0.1 可访问）
  ┌──────────────────────────────────────────────┐
  │  Lin Files 主界面（public/，多标签预览编辑）   │
  └───────┬──────────────────┬──────────────┬────┘
          │ /                │ /thm/        │ /lwp/
          ▼                  ▼              ▼
  ┌──────────────────────────────────────────────┐
  │   server.js（纯 Node，零依赖，约 1 个文件）    │
  │   仅监听 127.0.0.1 · 路径沙盒 · SSE 实时刷新   │
  ├──────────┬─────────────────┬─────────────────┤
  │  你的库   │  modules/lin-thm │ modules/lin-   │
  │ (Vaults) │  Lin Thm 预览器  │ work-pro/      │
  │          │  （.thm 实时预览）│ LinWork Pro    │
  │          │                 │ （卡/世界书编辑）│
  └──────────┴─────────────────┴─────────────────┘
        │  可选高级项：config.json 的 thmDir / lwpDir
        │  可把内嵌应用指向本机其他版本（覆盖包内 modules/）
        ▼
  config.json（本地，不入库） · data/（备份与凭据，不入库）
```

- `/` 主文件管理器；`/thm/` 内嵌 Lin Thm 主题预览器；`/lwp/` 内嵌 LinWork Pro 编辑器
- 三个路由都**优先从包内 `modules/` 目录提供服务**——零配置即可用
- `config.json` 里对应的 `thmDir` / `lwpDir` / `lwpFile` 是可选高级项，用于把内嵌应用指向本机的其他版本；两者都没有时，对应路由显示「功能未配置」提示页，服务不崩溃
- 内嵌 **Lin Hub 发布台**（`modules/lin-hub/`）：主界面「在线库」页一键拉起（或 `POST /api/starthub`），在独立端口 `8791` 提供服务（Windows-only，PowerShell 5.1 后端，仅监听 localhost）

## 安装（三步）

1. 从 **Releases** 下载 `LinFiles-v1.1.0-portable.zip`（已内置 Node 运行时）
2. 解压到任意目录（路径可含中文与空格）
3. 双击 **`启动 Lin Files.bat`** —— 浏览器会自动打开 `http://127.0.0.1:8765/`

> 停止服务：双击 `停止 Lin Files.bat`。重复启动不会开第二个服务，只会再开一次浏览器。
>
> 下载的是 src 包？任选其一：
> - 本机已装 Node.js（≥16）：`node server.js`
> - 没装 Node：`powershell -ExecutionPolicy Bypass -File scripts\install-runtime.ps1 -Url <运行时包地址>`，然后再双击启动脚本。

## 配置说明（config.example.json）

首次使用：把 `config.example.json` 复制为 `config.json`，按需修改。**所有键都可以省略**；库路径支持相对路径（相对应用根目录）。

| 键 | 说明 |
| --- | --- |
| `port` | 服务端口，默认 8765；被占用时自动顺延 |
| `vaults` | 库列表：`{ "id", "name", "path" }`；`path` 可用相对路径，模板默认指向内置示例库 |
| `showHidden` | 显示隐藏文件，默认 `false`（含 Windows「隐藏」属性文件） |
| `favorites` | 收藏（置顶）列表 |
| `themeLib` | 可选：主题库根目录（扫描 `.thm` 与封面、封面截图管理）。不配置则主题库页显示设置引导 |
| `themeCoverView` | 封面截图的视图名后缀，默认 `手机916` |
| `thmDir` * | 可选高级项：用本机另一份 Lin Thm 覆盖包内 `modules/lin-thm/` |
| `lwpDir` * / `lwpFile` * | 可选高级项：用本机另一份 LinWork Pro 覆盖包内版本（`lwpFile` 指定 html 文件名） |
| `linHubScript` * | 可选高级项：用本机另一份 Lin Hub 的启动脚本覆盖包内 `modules/lin-hub/launcher.ps1`；留空即用包内版本，主界面「在线库」一键拉起 |
| `githubPat` / `githubRepo` | `scripts/gh-publish.ps1` 专用：GitHub 令牌与 `用户/仓库`。**留空即无任何联网行为** |

## 隐私声明

- **所有数据只存在本机**：库文件、编辑内容、自动备份（`data/bak/`）都不上传
- 服务**仅监听 `127.0.0.1`**，局域网内其他设备无法访问；所有文件操作限制在你添加的库目录内（路径沙盒）
- `config.json`（含你的偏好）与 `data/`（备份、RB 凭据）在 `.gitignore` 中，**永远不会进入 git 仓库或打包产物**
- 除你主动调用的可选联动（Lin Hub 本机服务、RB 直推、gh-publish 脚本）外，无任何网络请求，无遥测

## 目录结构

```
Lin Files/
├─ server.js                 # 全部后端逻辑（纯 Node，零依赖）
├─ public/                   # 前端（原生 JS，无框架）
├─ modules/
│  ├─ lin-thm/               # 内嵌 Lin Thm 预览器（/thm/）
│  ├─ lin-work-pro/          # 内嵌 LinWork Pro 编辑器（/lwp/）
│  └─ lin-hub/               # 内嵌 Lin Hub 发布台（「在线库」一键拉起，独立端口 8791）
├─ 示例库/                    # 随包演示库（笔记 / 卡与记录 / 素材 / 网页 / 主题包）
├─ scripts/
│  ├─ check-staged.js        # git staged 模拟检查（个人痕迹自检）
│  ├─ prepare-release.ps1    # 打包 src / portable 产物到本地暂存目录
│  ├─ install-runtime.ps1    # 从 Release 拉取 Node 运行时（src 包用户用）
│  └─ gh-publish.ps1         # 手动调用的 GitHub 单文件发布工具（需配 githubPat）
├─ config.example.json       # 配置模板（复制为 config.json 使用）
├─ 启动 Lin Files.bat         # 双击启动（隐藏后台窗口）
└─ 停止 Lin Files.bat         # 双击停止
```

## Roadmap

- **GitHub 发布集成**（部分达成）：库中包文件可经内嵌 Lin Hub 的「项目推送」推送到 Gitee / GitHub Release；与文件树深度联动的直接推送仍 planned（底层能力见 `scripts/gh-publish.ps1`）
- **插件端同步**（planned）：与浏览器端插件共享会话与配置

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。
