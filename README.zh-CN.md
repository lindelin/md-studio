# MD Studio — 用 AI 制作 MD 碟片

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

**把 MD 制作中繁琐的标签输入交给 AI：曲名、日文读音、曲序和分组，一起整理。** MD Studio 是免费开源的 Windows MD 制作应用，支持通过 NetMD 和 Hi-MD 录制音乐。既能手动制作，也能通过 MCP 或内置 CLI 让 AI 协助操作。

**[下载 Windows 版](https://github.com/lindelin/md-studio/releases/latest)** · **[中文使用手册](docs/manual/zh-CN.md)** · **[反馈问题](https://github.com/lindelin/md-studio/issues)**

## 从一张专辑到一张 MD

1. 安装 MD Studio，用 USB 连接碟机。
2. 导入本地音乐，选择录制模式。
3. 让 AI 整理标签、读音和分组，或自己编辑。
4. 检查曲序、标题和容量，确认后开始录制。

> “把 C:/Music/Album 里的专辑用 LP2 制作成 MD。日文普通标题用半角片假名，全角标题保留原始日文，按专辑分组。先给我看计划，确认后再写盘。”

## 专注制盘

- **AI 标签整理：** 随附 MD 标签整理 Skill，指导 AI 处理英文、日文、缺失标签、读音和分组。拿不准的读音先给你确认。
- **NetMD 与 Hi-MD：** 复用成熟设备库，具体模式和功能由碟机及碟片决定。
- **录制一目了然：** 在设备支持时使用 SP、LP2、LP4、MONO，录制前预览容量，录制中查看进度。
- **同一个工作室：** 界面、CLI、MCP 共用设备、导入队列和任务状态。
- **MCP 配置一次：** 重启后连接地址不变；关闭窗口后可留在托盘继续工作。
- **中日英三语：** 设置中可切换语言和浅色／深色主题。
- **本机处理音频：** 解码、转换和 USB 传输都在你的电脑完成，不依赖音频处理服务器。

## 使用要求

需要 Windows 10/11 64 位、兼容的 USB 碟机、可写 MD 和稳定供电。

AI 功能需要你自己的 AI 客户端：支持本地 HTTP MCP，或能够运行本机 CLI。应用不包含 AI 模型或订阅。只能访问云端服务器的客户端不能直接连接 localhost。

**普通用户不需要下载仓库、安装 Node.js，也不用另装标准录制流程所需的编码器。** 需要 WinUSB 驱动时，设置内提供经过校验的 Zadig 安装器入口。

当前安装包尚未进行 Windows 代码签名，请从本仓库 Releases 下载并核对 SHA-256。已进行 Sony MZ-N920 实机测试，不代表所有机型都已验证。

## AI 接入与隐私

打开 **AI 制作**，启用 MCP，将完整本地地址填入 AI 客户端，再导出并安装标签整理 Skill。地址含访问密钥，请勿分享。不使用 AI 也能正常编辑和录制。

音频转换和设备通信在本机进行；AI 客户端可能按它自身的设置向服务商发送对话和标签信息。录制结束前保持供电与 USB 连接；“结束批次”会等待当前曲目安全完成。

连接、标签规则、分组、CLI 和常见问题见[中文手册](docs/manual/zh-CN.md)。

## 开源与致谢

基于 [Web MiniDisc Pro](https://github.com/asivery/webminidisc)，感谢 asivery 和 NetMD／Hi-MD 社区。采用 [GPL-2.0-only](LICENSE)，保留[来源与致谢](NOTICE.md)及[第三方许可证](THIRD_PARTY_LICENSES.md)。开发参与方式见[贡献指南](CONTRIBUTING.md)。MiniDisc 及设备名称属于其各自权利人，本项目为独立社区项目。
