# Contributing to MiniDisc Workspace

MiniDisc Workspace is an independent GPL-2.0 project derived from Web MiniDisc Pro. Preserve upstream authorship, the Git history, `NOTICE.md`, and dependency license notices when contributing or redistributing builds.

## Development setup

Use Node.js 20.19 or newer and the npm version recorded in `package.json` when practical.

```text
npm ci
npm test
npm run dev
```

Before submitting a change, run:

```text
npm test
npm run lint
npm run typecheck
npm run licenses:check
npm run runtime-assets:check
npm run build
```

Run `npm run licenses:update` after dependency changes and `npm run runtime-assets:update` after changing browser runtime binaries or copied worker assets. Review the generated diff rather than accepting it blindly.

## Architecture rules

- Treat the existing NetMD, Hi-MD, Network Walkman, encoder, and advanced-device services as the canonical implementation of supported hardware behavior. Reuse them through thin device gateways; do not copy or independently reimplement a working protocol operation in the application, UI, MCP, or CLI layers.
- Change protocol or device-service behavior only for a reproduced defect, a documented missing capability, or a required upstream compatibility update. Keep the change narrow and add regression evidence at the service or gateway boundary.
- Keep stable protocol behavior behind device gateways. Gateways translate capabilities, parameters, and serializable results; they must not grow into a second device implementation.
- Put validation, revisions, capabilities, destructive confirmation, serialization, and transactions in the application layer.
- Expose long operations through Task Manager. Command acceptance is not completion.
- Read device, disc, import queue, settings, and task truth from Workspace Store.
- Keep browser-only objects such as `File`, USB sessions, audio streams, workers, save targets, and interactive permission handles behind in-process adapters.
- Keep MCP and CLI commands serializable. Do not add a JSON path that bypasses browser-only authorization for dangerous maintenance.
- Do not create a second UI-specific device state or task lifecycle beside the shared Workspace.
- Preserve partial results and recovery evidence when a multi-item task fails or is cancelled.

## Hardware testing

Use MockMD and isolated tests first. State exactly which adapter and capability a test requires; device families do not share one combined feature set.

Use a disposable disc for destructive verification. Before any write, record the device model, disc state, selected format, expected duration, and the action that will run. Verify the resulting disc by rereading it from the application.

Do not simulate active NetMD cancellation by terminating an encoder or worker. That can make software report cancellation while the recorder continues writing. Current cancellation stops at a track boundary. Keep USB attached while the recorder's write light flashes.

For read-only changes, avoid writing merely to prove the UI works. Capability gates, previews, task creation, browser console state, MockMD, and application-layer tests usually provide stronger and repeatable evidence.

## Tests and review evidence

Prefer tests at the narrowest shared boundary that proves behavior: pure domain functions, application commands, workspace/task lifecycle, and browser adapters. UI tests should verify important state, focus, accessibility, and failure behavior without duplicating implementation details.

Document material limits honestly. A successful MockMD test is not hardware validation, a task ID is not completion, and a browser status is not proof that a recorder has stopped. Keep exact device evidence separate from inference.

## Security and local automation

Read `SECURITY.md` before changing the bridge, local file gateways, import parsers, or maintenance commands. Keep the bridge loopback-only, bound payload sizes, use opaque handles for local files, and reject malformed commands before dispatch. Never include bridge tokens, private audio, device identifiers, or destructive proof-of-concept data in public logs or issues.
