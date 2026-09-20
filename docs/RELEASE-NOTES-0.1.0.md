# MiniDisc Workspace 0.1.0

MiniDisc Workspace 0.1.0 is the first independent release derived from Web MiniDisc Pro. It keeps the existing NetMD, HiMD, Network Walkman, encoder, upload, download, playback, and advanced-maintenance implementations while introducing a new application boundary and primary interface.

## Highlights

- Studio Workbench replaces the former main workspace with a device overview, disc and recording-plan tables, inspector, library, settings, tools, and one task center.
- The interface supports Simplified Chinese and English, including runtime task states, validation, recovery guidance, and retained compatibility dialogs.
- Browser UI, MCP, and CLI share revision-checked application commands, import queue state, device snapshots, and long-running tasks.
- Local-path automation reads audio tags and duration before staging, while file bytes remain behind short-lived local handles until conversion starts.
- Writing performs a capacity, title, codec, device-session, and revision preview before creating a task.
- CSV metadata planning, normal and recovery export review, raw TOC review, protection flags, diagnostics, and capability-gated advanced tools are available from the workbench.
- Windows development and production builds use cross-platform runtime preparation and version metadata.

## Reliability and safety

- Device mutations are serialized and checked for capability, disc presence, write protection, session, revision, index, and destructive confirmation.
- Encoder output is validated for ATRAC container, codec, bitrate, and non-empty frames before upload.
- Remote requests, browser workers, playback readiness, and cached reconnects have bounded failure paths.
- Local bridge messages, file chunks, output paths, origins, and tokens are bounded and validated.
- Raw TOC writes require a preview, exact checksums, current session/revision, and browser-only authorization; MCP and CLI can preview but cannot apply them.
- NetMD cancellation stops at a track boundary. It does not claim to interrupt the track already recording.

## Compatibility notes

- Chromium WebUSB and a compatible driver are required for USB devices. MockMD remains available without hardware.
- Direct track export depends on the adapter's `track.download` capability. The Sony MZ-N920 used during development does not expose normal direct download.
- Proprietary At3RE assets are not distributed. The application reports unavailable encoders and can use the bundled open-source Atracdenc path.
- Optional Atrac3OS assets must be complete and pass the runtime provenance checks before the encoder is advertised.
- Some advanced features depend on exact device firmware and exploit capabilities and remain hidden or disabled when unsupported.

## Verification snapshot

- 292 automated tests in 78 suites
- Full TypeScript and TSX lint with zero warnings
- Application and bridge type checks
- Production Vite/PWA build
- Lockfile-derived third-party license inventory and runtime-asset provenance checks
- MockMD browser regression in Simplified Chinese and English
- Sony MZ-N920 read, metadata, playback, reconnect, diagnostics, LP2 write, refresh, and capacity verification on an authorized test disc

See the [user guide](USER-GUIDE.md) for device workflows, the [automation guide](AUTOMATION.md) for MCP and CLI, and the repository `NOTICE.md`, `THIRD_PARTY_LICENSES.md`, and `RUNTIME_ASSETS.json` for attribution and redistribution details.
