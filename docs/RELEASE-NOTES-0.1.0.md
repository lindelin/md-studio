# MiniDisc Workspace 0.1.0

MiniDisc Workspace 0.1.0 is the first independent release derived from Web MiniDisc Pro. It keeps the existing NetMD, HiMD, Network Walkman, encoder, upload, download, playback, and advanced-maintenance implementations while introducing a new application boundary and primary interface.

## Highlights

- Studio Workbench replaces the former main workspace with a device overview, disc and recording-plan tables, inspector, library, settings, tools, and one task center.
- The interface starts in Simplified Chinese and retains complete English support, including runtime task states, validation, recovery guidance, and advanced maintenance workflows.
- Browser UI, MCP, and CLI share revision-checked application commands, import queue state, device snapshots, and long-running tasks.
- Local-path automation reads audio tags and duration before staging, while file bytes remain behind short-lived local handles until conversion starts.
- The Library can index a browser-selected local folder, search and page its metadata, and add deferred files to the shared recording plan without uploading or persisting folder access.
- Audio, transcoding, caches, task queues, and device traffic stay on the user's computer; hosted builds serve static application files only.
- Online services default to off. The connection UI, command layer and each remote request boundary block Remote NetMD, the remote encoder, remote library, and song recognition until the user enables them in Settings.
- Writing performs a capacity, title, codec, device-session, and revision preview before creating a task.
- Homebrew SP Mono and ATRAC1 writes show their exact capability requirements in the bilingual write review before a task is created; automation cannot authorize these browser-only operations.
- CSV metadata planning, normal and recovery export review, raw TOC review, protection flags, diagnostics, and capability-gated advanced tools are available from the workbench.
- Device services return results and errors without opening browser-native alert, confirm, or prompt dialogs. Full-access HiMD uses a bilingual in-app review.
- Windows development and production builds use cross-platform runtime preparation and version metadata.
- The bundled open-source Atracdenc runtime is rebuilt from pinned source and toolchain revisions with a checksum-enforced Windows script.
- The legacy Redux shell has been removed. Runtime state comes from the shared Workspace, while the browser-only device catalog and local-bridge switch use a small revisioned preference store.
- The unrelated device-side Tetris easter egg has been removed from the application commands, automation protocol, capability model, and NetMD service surface. Undocumented console globals that exposed raw NetMD, HiMD, exploit, patch, and TOC objects have also been removed so device operations stay behind the application boundary.

## Reliability and safety

- Device mutations are serialized and checked for capability, disc presence, write protection, session, revision, index, and destructive confirmation.
- Shared settings are persisted before their revision is published. Browser storage failures return a structured error and multi-field updates restore their previous values instead of reporting a success that disappears after reload.
- Device selection, custom-device entries, and the local-bridge switch are persisted before the browser-preferences store publishes a new revision. Failed writes leave the previous snapshot intact and stay visible in the bilingual interface.
- The obsolete write-protection-warning preference has been retired; actual write protection continues to be enforced by the application command layer.
- The startup recovery screen clears only this application's preferences as one transaction. If browser storage refuses the reset, it keeps the error visible instead of reloading into the same failure.
- Encoder output is validated for ATRAC container, codec, bitrate, and non-empty frames before upload.
- Completion notifications request browser permission only from the explicit Settings switch. Unsupported, denied, or failed notifications cannot change a successful write result or prevent the completed imports from leaving the queue.
- Remote requests, browser workers, playback readiness, and cached reconnects have bounded failure paths.
- Local bridge messages, file chunks, output paths, origins, and tokens are bounded and validated.
- Raw TOC writes require a preview, exact checksums, current session/revision, and browser-only authorization; MCP and CLI can preview but cannot apply them.
- NetMD cancellation stops at a track boundary. It does not claim to interrupt the track already recording.
- CLI recording-mode aliases such as LP2 and LP4 are normalized to the same canonical formats used by the browser application.

## Compatibility notes

- Chromium WebUSB and a compatible driver are required for USB devices. MockMD remains available without hardware.
- Direct track export depends on the adapter's `track.download` capability. The Sony MZ-N920 used during development does not expose normal direct download.
- Proprietary At3RE assets are not distributed. The application reports unavailable encoders and can use the bundled open-source Atracdenc path.
- Optional Atrac3OS assets must be complete and pass the runtime provenance checks before the encoder is advertised.
- Some advanced features depend on exact device firmware and exploit capabilities and remain hidden or disabled when unsupported.

## Verification snapshot

- 328 automated tests in 86 suites
- Full TypeScript and TSX lint with zero warnings
- Application and bridge type checks
- Production Vite/PWA build
- Lockfile-derived third-party license inventory and runtime-asset provenance checks
- MockMD browser regression in Simplified Chinese and English
- Sony MZ-N920 read, metadata, playback, reconnect, diagnostics, LP2 write, refresh, and capacity verification on an authorized test disc

See the [user guide](USER-GUIDE.md) for device workflows, the [automation guide](AUTOMATION.md) for MCP and CLI, and the repository `NOTICE.md`, `THIRD_PARTY_LICENSES.md`, and `RUNTIME_ASSETS.json` for attribution and redistribution details.
