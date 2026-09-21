# Architecture cleanup — 2026-09-21

## Runtime boundaries

- `src/components` renders the MD workspace and calls `ApplicationClient`.
- `src/application` owns commands, shared snapshots, import planning, tasks and device serialization. UI, MCP and CLI use this boundary.
- `src/services/interfaces` implements NetMD and Hi-MD protocols. NetMDMockService remains for isolated regression tests, not as a production connection option.
- `bridge` exposes the command layer over local MCP/CLI transports and registers local files.
- `desktop/main.ts` composes the local host, IPC and tray lifecycle. `desktop/usb-device-picker.ts` owns pending USB selection, hot-plug updates and cancellation; `desktop/preferences.ts` owns persistent MCP identity.

## Removed

- Network Walkman adapter, native hook, production catalog entries, dependency and adapter-only tests.
- Mock device entries in the production connection catalog; the test implementation is retained.
- Unreferenced custom-device and old settings dialogs and their dedicated CSS.
- Obsolete Jest setup (the project uses Node tests through tsx).
- Unused direct clsx dependency. Prettier and SVGR are now development dependencies rather than runtime dependencies.

Do not treat a filename as evidence of dead code: worker entry points, Vite shims, the HTML secure-context entry, and NetMD exploit helpers still have runtime consumers. Protocol, encoding, recording, title and group handling remain intact.

## Verification

- Full suite: 308 tests passed (removed six retired Network Walkman tests; added two USB picker tests).
- Catalog checks assert the exact three shipping MD adapters and rejection of saved retired adapters.
- Lint, UI/build-config/desktop type checks, production build, desktop preparation, third-party notices and runtime-asset release checks passed.
- Production build no longer emits Network Walkman or mock-device chunks. Transformed module count decreased from 1209 to 1169.
- Default `npm run typecheck` now includes the desktop host so IPC and host changes receive the same gate as the UI.

No live device writes or UI automation were used for cleanup validation. Installer rebuilding and hardware acceptance remain separate from these source checks.
