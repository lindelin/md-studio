# MD Studio

MD Studio 是一个本机优先的 MD 制作工具，提供中英双语界面、Windows 桌面版、CLI 和可选的 MCP 接口。音频读取、标签整理、转码和设备通信均在用户电脑上完成。

MD Studio is a local-first tool for making MDs with a bilingual interface, a Windows desktop app, CLI access and optional MCP automation. Audio import, metadata work, transcoding and USB communication run on the user's computer.

## 功能 / Features

- 连接 netmd-js 与 himd-js 支持的 NetMD、Hi-MD 和兼容设备。
- 导入本地音频，整理曲序、普通标题、全角标题和 MD 文件夹（Group）。
- 使用 SP、LP2、LP4 或 MONO 预检容量并写入碟片。
- 编辑碟名和曲名，管理分组、播放和设备支持的碟片操作。
- Windows 桌面版内置 CLI、可开关的本机 HTTP MCP 服务以及 MD 标签整理 Skill。
- 自动检测 Windows 驱动；需要时从设置中打开经过校验的 Zadig 2.9 安装器。
- 所有界面操作、CLI 和 MCP 共用同一设备会话、录制计划与任务状态。

## Windows 桌面版 / Windows desktop

运行 `MD-Studio-Setup-<version>.exe`，安装后从开始菜单或桌面打开 **MD Studio**。桌面版自带运行环境，无需安装 Node.js，也不需要下载源码。

NetMD 通常需要 WinUSB。打开 **设置 → 设备驱动** 查看检测结果；只有需要 WinUSB 且可以安全处理的接口会显示安装入口。Zadig 仍是交互式安装器，请核对设备名称与 USB ID 后再选择 WinUSB。不要替换 Hi-MD 存储接口或其他 USB 设备的驱动。

The installer includes the runtime, CLI, metadata Skill and the verified Zadig payload. Driver replacement is always explicit and requires Windows administrator approval.

## 基本流程 / Basic workflow

1. 给碟机供电并连接 USB，在 MD Studio 中连接设备。
2. 导入音频并检查曲序、标题、全角标题、分组和录制模式。
3. 查看容量预检，确认后开始写入。
4. 在任务中心等待设备报告完成，再拔出 USB 或取出碟片。

正在录制的单首曲目无法在所有机型上安全中断。“当前曲目完成后结束批次”只会阻止后续曲目开始；录制灯停止前请保持碟机供电和 USB 连接。如果发生掉电或断线，请重新连接并刷新碟片，核对已经完成的曲目后只重试剩余内容。

An active track cannot be interrupted safely on every recorder. Ending a batch stops later tracks from starting after the current track finishes. Keep the recorder powered and USB connected while its recording light is flashing.

## CLI

桌面版启动时会生成：

```text
%APPDATA%\MD Studio\mdstudio.cmd
```

示例：

```powershell
& "$env:APPDATA\MD Studio\mdstudio.cmd" connect
& "$env:APPDATA\MD Studio\mdstudio.cmd" workspace
& "$env:APPDATA\MD Studio\mdstudio.cmd" add "C:\Music\Album\01.flac"
& "$env:APPDATA\MD Studio\mdstudio.cmd" preview LP2
& "$env:APPDATA\MD Studio\mdstudio.cmd" write LP2
```

`preview` 不写入设备；`write` 会实际录制并等待任务结束。桌面应用必须保持打开。

## AI 与 MCP / AI and MCP

在侧栏打开 **AI 制作**，开启 MCP 后复制完整的本机地址到支持本地 HTTP MCP 的客户端。地址只绑定 `127.0.0.1`，包含临时访问密钥，并在每次重新开启时轮换。不要分享该地址。

导出并安装随应用提供的 **MD 标签整理 Skill**，可帮助 AI 处理半角标题、全角标题、日文读音、艺术家、专辑和 MD 分组。AI 应先展示录制计划与容量，获得用户的实际写盘指令后再启动任务，并查询任务直到完成。

MCP support is included; final client-specific acceptance remains on the release checklist.

## Web 版 / Web build

网页版只分发静态文件，音频与设备任务仍在浏览器本机执行。USB 连接需要支持 WebUSB 的 Chromium 浏览器以及兼容驱动。CLI 与 MCP 的源码开发桥接方式见 [自动化文档](docs/AUTOMATION.md)。

## 开发 / Development

要求 Node.js 20.19 或更高版本以及 npm 11。

```powershell
npm install
npm run dev
npm test
npm run build
npm run desktop:prepare
npm run desktop:pack
```

发布前还应运行：

```powershell
npm run lint
npm run runtime-assets:release-check
npm run licenses:check
npm run audit:production
```

项目架构和贡献规则见 [CONTRIBUTING.md](CONTRIBUTING.md)，详细用户说明见 [docs/USER-GUIDE.md](docs/USER-GUIDE.md)，当前发行验收状态见 [docs/RELEASE-CHECKLIST.md](docs/RELEASE-CHECKLIST.md)。

## 开源与来源 / License and attribution

MD Studio 使用 [GNU GPL v2](LICENSE) 发布。它基于 [Web MiniDisc Pro](https://github.com/asivery/webminidisc) 及更早的 [Web MiniDisc](https://github.com/cybercase/webminidisc)，并保留其协议层、设备支持和贡献历史。完整来源与第三方说明见 [NOTICE.md](NOTICE.md) 和 [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)。

MD、MiniDisc、NetMD、Hi-MD 和 Sony 名称仅用于说明兼容格式与硬件；本项目与 Sony 无隶属或认可关系。
