# MiniDisc Workspace

MiniDisc Workspace is a local-first application for organizing, writing, playing, and exporting MiniDisc media. It is being rebuilt around a shared application command layer so the browser UI, MCP server, and CLI use the same device state, validation, task progress, and safety rules.

The project is under active reconstruction. The stable NetMD and HiMD protocol implementations are retained while device orchestration and the user interface move onto the shared application command and workspace model.

## Current capabilities

-   USB NetMD, restricted and full HiMD, DRM-free Network Walkman, Remote NetMD, and MockMD connections
-   Disc, track, group, half-width, full-width, and HiMD metadata editing
-   Playback control, track ordering, deletion, erase, eject, HiMD format, and device flush
-   Audio import, browser-side transcoding, NetMD upload, supported-device download, recording, and factory tools inherited from Web MiniDisc Pro
-   Revision-checked application commands and observable long-running tasks
-   Local MCP tools and a scriptable CLI over a loopback-only browser bridge
-   Simplified Chinese by default, with complete English support and an immediate, persisted language switch
-   Safe preference loading that isolates a damaged setting instead of clearing the complete browser store

## Requirements

-   Node.js 20.19 or newer and npm
-   A Chromium-based browser with WebUSB support
-   A compatible MiniDisc device and USB cable for hardware operations
-   On Windows, a compatible WinUSB driver for the device; the MiniDisc Wiki has current [Windows setup instructions](https://www.minidisc.wiki/guides/webminidisc/requirements#windows)

MockMD is available for development without hardware.

For normal recording, export, recovery, and troubleshooting flows, see the [user guide](docs/USER-GUIDE.md). The [feature matrix](docs/FEATURE-MATRIX.md) records migrated capabilities and outstanding hardware acceptance. For ChatGPT, MCP, and scripting setup, see the [automation guide](docs/AUTOMATION.md). Contributors should read [CONTRIBUTING.md](CONTRIBUTING.md) before changing device or task code. The first independent release is described in the [0.1.0 release notes](docs/RELEASE-NOTES-0.1.0.md).

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
npm run cli -- workspace
npm run cli -- tasks
npm run cli -- imports
npm run cli -- write "C:\\Music\\Track 01.wav" "C:\\Music\\Track 02.flac"
npm run cli -- export "C:\\Music\\MiniDisc export" 1 2 3 --wav
```

The CLI also accepts a complete application command:

```text
npm run cli -- command '{"type":"playback.control","command":{"action":"play"}}'
```

On Windows PowerShell, a JSON file is usually easier to quote:

```text
npm run cli -- --file command.json
```

The `write` and `export` commands keep the local bridge alive, stream files through opaque handles, and wait until the background task succeeds, fails, or is cancelled. Export track numbers are one-based, matching the app. Add `--codec LP2 --bitrate 132` to override the default recording format.

## Local MCP bridge

Enable **Local MCP and CLI bridge** in the app settings, then reload the app. `npm run mcp` starts an MCP server over standard input/output and a WebSocket bridge on `127.0.0.1:47123`. Keep the browser app open. Device operations continue to run in the browser, which owns the WebUSB session.

The MCP tools cover the complete workspace snapshot, device status, disc and track metadata, groups, playback, deletion and erase with explicit confirmation, HiMD maintenance, task state, local audio staging and writing, and streamed track export to a selected local directory. The workspace snapshot remains available before a device is connected, so clients can prepare imports and settings first. Long transfers return a task identifier for progress and cancellation. Destructive commands require both `confirmed: true` and a non-empty reason. Mutating tools accept `expectedRevision` so a command prepared from stale disc state is rejected before it writes.

The recommended recording sequence is read workspace → stage audio → preview imports → write with the preview's revisions → poll the returned task. The automation guide lists every MCP tool and the browser-only safety boundaries.

Set `MINIDISC_BRIDGE_TOKEN` to require a token, and store the same value in the browser preference `minidiscLocalBridgeToken`. The bridge listens on loopback and accepts local browser origins by default.

## Architecture

```text
Studio Workbench ─┐
Local MCP ────────┼── Application command layer ── NetMD / HiMD services ── Device
CLI ──────────────┘              │
                           tasks and imports
```

The application layer owns validation, revisions, destructive confirmation, serialization, task state, and device snapshots. Studio Workbench is the primary interface and reads the same workspace model as MCP and CLI. A small browser-preferences store owns only the selected adapter, custom-device catalog, and local-bridge switch; dialog and form drafts stay in local React state. Redux is no longer a dependency. The obsolete standalone Factory screen has been removed; its supported TOC, recovery, and maintenance operations live in the capability-gated Tools workflow.

## Local execution boundary

Audio files, metadata editing, transcoding, task queues, caches, and device communication run on the user's computer. A hosted web build serves static application files only: it does not upload audio, proxy USB traffic, run encoding jobs, or store disc contents. The desktop build uses the same local application core. **Online services** are disabled by default; this policy is enforced by the application command layer and again at each remote request boundary.

Remote NetMD, the remote encoder, the remote library, and song recognition require the user to enable **Settings → Online services** explicitly. Remote NetMD is blocked both before connection and before each HTTP or WebSocket request. Turning the permission off switches a selected remote encoder back to an available local encoder, clears the remote library selection, and blocks subsequent requests from an existing Remote NetMD service. Any future online metadata lookup or AI-assisted suggestion must be optional, disabled independently, and show the exact text fields that will leave the computer before the request is sent. Audio bytes and device data are excluded from those future integrations by default.

## Safety

Treat real discs as valuable media. Delete, erase, and HiMD format operations require explicit confirmation. Automated callers should refresh the disc first and send the returned revision with each prepared mutation.

An active NetMD track transfer cannot currently be stopped safely on every recorder. The stop action is cooperative: it prevents the next track from starting after the current track finishes. If the recorder's write light is flashing, leave USB connected until recording finishes. Do not trust a closed dialog, cancelled browser task, or interrupted encoder as proof that the recorder has stopped.

## License and upstream credit

MiniDisc Workspace is licensed under the [GNU General Public License v2.0](LICENSE).

It is derived from [Web MiniDisc Pro](https://github.com/asivery/webminidisc) by Asivery and contributors, which in turn was derived from [Web MiniDisc](https://github.com/cybercase/webminidisc). Their protocol work, device support, encoder integration, and contributor history remain foundational to this project. The Git history and GPL license are retained.

Major upstream projects include [netmd-js](https://github.com/cybercase/netmd-js), [netmd-exploits](https://github.com/asivery/netmd-exploits), [himd-js](https://github.com/asivery/himd-js), [linux-minidisc](https://github.com/linux-minidisc/linux-minidisc), [FFmpeg](https://ffmpeg.org/), and [Atracdenc](https://github.com/dcherednik/atracdenc). See [NOTICE.md](NOTICE.md) for provenance and redistribution notes, [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for the lockfile-derived dependency inventory, [SECURITY.md](SECURITY.md) for trust boundaries and the tracked dependency exception, and `package-lock.json` for the complete dependency graph. Run `npm run licenses:update` after dependency changes; CI rejects a stale inventory.
