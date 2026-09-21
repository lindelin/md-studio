# MD Studio — Make MD discs with AI

[English](README.md) · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

[![Latest release](https://img.shields.io/github/v/release/lindelin/md-studio)](https://github.com/lindelin/md-studio/releases/latest) [![Downloads](https://img.shields.io/github/downloads/lindelin/md-studio/total)](https://github.com/lindelin/md-studio/releases) [![License: GPL v2](https://img.shields.io/badge/license-GPL--2.0-blue)](LICENSE)

**Let AI handle the tedious part of making an MD: titles, Japanese readings, track order and groups.** MD Studio is a free, open-source Windows app for recording music to MiniDisc through NetMD and Hi-MD. Use it yourself, or connect your AI assistant through MCP or the included CLI.

**[Download for Windows](https://github.com/lindelin/md-studio/releases/latest)** · **[User manual](docs/manual/en.md)** · **[Report a problem](https://github.com/lindelin/md-studio/issues)**

## From a folder of music to a finished MD

1. Install MD Studio and connect your recorder by USB.
2. Add your music and choose the recording mode.
3. Ask AI to organize titles, readings and groups, or edit them yourself.
4. Review the recording plan and capacity, then start recording.

> “Prepare the album in C:/Music/Album for LP2. Use half-width katakana for the Japanese normal titles and the original Japanese for full-width titles. Group by album. Show me the plan before writing.”

## Built for making MDs

- **AI-assisted tags:** an included MD metadata Skill guides your assistant through English/Japanese titles, missing tags, readings and grouping. Review uncertain readings before recording.
- **NetMD and Hi-MD:** reuse established device libraries; available modes and features depend on the recorder and disc.
- **Clear recording modes:** SP, LP2, LP4 and MONO where supported, with capacity preview and progress.
- **One shared studio:** the interface, CLI and MCP use the same device, import queue and tasks.
- **Set up MCP once:** its local address persists across app restarts. Closing the window keeps the app in the system tray.
- **English, 日本語, 简体中文:** choose a language and light or dark theme in Settings.
- **Local audio processing:** audio decoding, conversion and USB transfer run on your PC. No audio-processing server is needed.

## What you need

- Windows 10/11, 64-bit, a compatible USB recorder, a writable MD and reliable power.
- For AI: your own client with local HTTP MCP support, or an assistant able to run local CLI commands. MD Studio does not include an AI model or subscription. Clients that can only reach cloud servers cannot connect directly to localhost.
- No source checkout, Node.js or separate encoder installation is needed for the standard desktop workflow. Driver setup includes a verified Zadig installer when WinUSB is needed.

The installer is currently unsigned. Download from this repository's Releases page and compare the published SHA-256 checksum. Real-device testing so far includes the Sony MZ-N920; this is not a claim that every recorder has been tested.

## AI, privacy and recording

Enable MCP in **AI Creation**, copy the full local URL into your client, and export/install the included metadata Skill. The URL contains an access key: keep it private. AI is optional; all regular editing and recording controls remain available.

Audio conversion and device communication stay local. Your AI client may send prompts and metadata to its provider under its own settings. Keep power and USB connected until recording finishes; ending a batch waits for the current track to finish safely.

Read the [manual](docs/manual/en.md) for setup, title rules, groups, CLI examples and troubleshooting.

## Open source and credits

MD Studio is based on [Web MiniDisc Pro](https://github.com/asivery/webminidisc), with thanks to asivery and the NetMD/Hi-MD community. Distributed under [GPL-2.0-only](LICENSE). See [credits](NOTICE.md), [third-party licenses](THIRD_PARTY_LICENSES.md) and [contributing](CONTRIBUTING.md). MiniDisc and device names belong to their respective owners; this is an independent project.
