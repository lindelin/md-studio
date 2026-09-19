# MiniDisc Workspace

MiniDisc Workspace is a local-first application for organizing, writing, playing, and exporting MiniDisc media. It is being rebuilt around a shared application command layer so the browser UI, MCP server, and CLI use the same device state, validation, task progress, and safety rules.

The project is under active reconstruction. The stable NetMD and HiMD protocol implementations are retained while device orchestration and the user interface are separated from the legacy Redux actions.

## Current capabilities

-   USB NetMD, restricted and full HiMD, DRM-free Network Walkman, Remote NetMD, and MockMD connections
-   Disc, track, group, half-width, full-width, and HiMD metadata editing
-   Playback control, track ordering, deletion, erase, eject, HiMD format, and device flush
-   Audio import, browser-side transcoding, NetMD upload, supported-device download, recording, and factory tools inherited from Web MiniDisc Pro
-   Revision-checked application commands and observable long-running tasks
-   Local MCP tools and a scriptable CLI over a loopback-only browser bridge
-   Safe preference loading that isolates a damaged setting instead of clearing the complete browser store

## Requirements

-   Node.js 20 or newer and npm
-   A Chromium-based browser with WebUSB support
-   A compatible MiniDisc device and USB cable for hardware operations
-   On Windows, a compatible WinUSB driver for the device; the MiniDisc Wiki has current [Windows setup instructions](https://www.minidisc.wiki/guides/webminidisc/requirements#windows)

MockMD is available for development without hardware.

## Run locally

```text
npm ci
npm run dev
```

Open the local URL printed by Vite. The runtime preparation step is cross-platform and copies the required encoder and worker assets before development and production builds.

Useful commands:

```text
npm test
npm run build
npm run mcp
npm run cli -- status
npm run cli -- tasks
npm run cli -- imports
```

The CLI also accepts a complete application command:

```text
npm run cli -- command '{"type":"playback.control","command":{"action":"play"}}'
```

On Windows PowerShell, a JSON file is usually easier to quote:

```text
npm run cli -- --file command.json
```

## Local MCP bridge

Enable **Local MCP and CLI bridge** in the app settings, then reload the app. `npm run mcp` starts an MCP server over standard input/output and a WebSocket bridge on `127.0.0.1:47123`. Keep the browser app open. Device operations continue to run in the browser, which owns the WebUSB session.

The MCP tools cover device status, disc and track metadata, groups, playback, deletion and erase with explicit confirmation, HiMD maintenance, task state, and the ordered import plan. Destructive commands require both `confirmed: true` and a non-empty reason. Mutating tools accept `expectedRevision` so a command prepared from stale disc state is rejected before it writes.

Set `MINIDISC_BRIDGE_TOKEN` to require a token, and store the same value in the browser preference `minidiscLocalBridgeToken`. The bridge listens on loopback and accepts local browser origins by default.

## Architecture

```text
New browser UI ─┐
Local MCP ──────┼── Application command layer ── NetMD / HiMD services ── Device
CLI ────────────┘              │
                         tasks and imports
```

The application layer owns validation, revisions, destructive confirmation, serialization, task state, and device snapshots. Redux currently adapts legacy screens to that layer while the replacement UI is developed.

## Safety

Treat real discs as valuable media. Delete, erase, and HiMD format operations require explicit confirmation. Automated callers should refresh the disc first and send the returned revision with each prepared mutation.

## License and upstream credit

MiniDisc Workspace is licensed under the [GNU General Public License v2.0](LICENSE).

It is derived from [Web MiniDisc Pro](https://github.com/asivery/webminidisc) by Asivery and contributors, which in turn was derived from [Web MiniDisc](https://github.com/cybercase/webminidisc). Their protocol work, device support, encoder integration, and contributor history remain foundational to this project. The Git history and GPL license are retained.

Major upstream projects include [netmd-js](https://github.com/cybercase/netmd-js), [netmd-exploits](https://github.com/asivery/netmd-exploits), [himd-js](https://github.com/asivery/himd-js), [linux-minidisc](https://github.com/linux-minidisc/linux-minidisc), [FFmpeg](https://ffmpeg.org/), and [Atracdenc](https://github.com/dcherednik/atracdenc). See `package-lock.json` for the complete dependency graph.
