# MD Studio 1.0.0

## English

Make MD discs with AI: organize titles, Japanese readings, track order and groups, then review and record. This first public release includes the Windows desktop app, English/Japanese/Chinese UI, built-in CLI, persistent local HTTP MCP and a metadata Skill. Closing the window keeps the app in the system tray.

Download **MD-Studio-Setup-1.0.0.exe**. No source checkout or Node.js required. Standard encoding and the verified Zadig installer are included. For setup and examples, see the [English manual](https://github.com/lindelin/md-studio/blob/v1.0.0/docs/manual/en.md).

## 简体中文

让 AI 帮你制作 MD：整理曲名、日文读音、曲序和分组，检查后再录制。首个公开版本包含 Windows 桌面应用、中日英界面、内置 CLI、固定地址的本地 HTTP MCP 和标签整理 Skill，支持托盘后台运行。

下载 **MD-Studio-Setup-1.0.0.exe** 即可，无需源码或 Node.js。标准编码流程和经过校验的 Zadig 安装器已包含。使用方法见[中文手册](https://github.com/lindelin/md-studio/blob/v1.0.0/docs/manual/zh-CN.md)。

## 日本語

AI とつくる MD。曲名、日本語の読み方、曲順、グループを整理し、確認してから録音できます。初の公開版には Windows アプリ、日本語・英語・中国語の UI、CLI、固定 URL のローカル HTTP MCP、タグ整理 Skill が含まれます。トレイでのバックグラウンド動作にも対応。

**MD-Studio-Setup-1.0.0.exe** をダウンロードしてください。ソースコードや Node.js は不要です。標準のエンコード処理と検証済み Zadig を同梱。[日本語マニュアル](https://github.com/lindelin/md-studio/blob/v1.0.0/docs/manual/ja.md)に設定手順と使用例があります。

## Notes / 说明 / ご注意

- Windows 10/11 x64. Installer is unsigned / 安装包未签名 / インストーラーは未署名です。SHA-256: `SHA256SUMS.txt`.
- AI requires a compatible local MCP or CLI-capable client and your own AI service. / AI 需另备兼容本地 MCP 或 CLI 的客户端。/ 対応するローカル AI クライアントが別途必要です。
- Audio conversion is local; AI-client privacy policies still apply to prompts/metadata. / 音频本机转换，AI 对话和标签遵循客户端隐私设置。/ 音声変換はローカルですが、会話・タグ情報は AI クライアントの設定に従います。
- Hardware verified on Sony MZ-N920. Broader Hi-MD and clean-machine installation testing remain limited. / 已验证 MZ-N920，更多 Hi-MD 与干净系统安装仍待扩大测试。/ MZ-N920 で確認済み。幅広い Hi-MD 機種とクリーン環境の検証には制限があります。
- Keep USB and power connected while recording. / 录制中保持 USB 与供电。/ 録音中は USB と電源を維持してください。

Based on Web MiniDisc Pro; GPL-2.0-only. Credits and third-party licenses are included.
