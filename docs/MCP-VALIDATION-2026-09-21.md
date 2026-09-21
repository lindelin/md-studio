# MCP validation — 2026-09-21

## Changes
- NetMD disc renaming preserves raw half-width and full-width group suffixes separately. The upstream helper checked the half-width raw title when deciding whether full-width groups existed.
- Persist MCP enable state and random access token. Fixed loopback port 47124 and URL survive toggles and restarts. Existing local client URL was preserved during this development upgrade.
- Close hides the window to a system tray icon. The renderer and USB session remain alive; background throttling is disabled. Tray menu provides reopen/settings/quit. Explicit quit checks active tasks and driver installation.
- AI access explains setup once and provides Run in background. Startup MCP errors appear there.

## Automated verification
- 310 tests passed, including a real HTTP MCP endpoint calling every one of the 30 registered tools against an isolated application and mock device.
- The HTTP test covers settings, imports, ordering, labels, groups, preview, task calls, deletion/erase on the mock, and unsupported-operation errors.
- Write-task dispatch uses a fake writer; this does not establish real hardware recording or cancellation reliability. Existing pipeline tests cover conversion, transfer and cooperative cancellation separately.
- Regression tests cover grouped/ungrouped raw disc titles, omitted/empty full-width names, persistent credentials, and enable-state persistence.
- Type checks, lint and production/desktop builds passed.

## Real device verification
- Sony MZ-N920 connected using the existing CLI cached connection after app restart.
- Existing configured md_studio MCP address worked after restart without manually enabling MCP or changing client configuration.
- MCP changed disc title/full-width title and restored mcp test. Both group lists and all track metadata were preserved.
- MCP changed/restored track 0 and group 0 labels. Complete disc metadata matched the pre-test snapshot afterwards.
- No real audio erased, formatted or recorded during these checks.

## Remaining manual acceptance
- Close window, verify tray restoration and AI calls while hidden, and check explicit quit during a write.
- Real Hi-MD formatting/metadata require a Hi-MD device; simulated error checks are not hardware validation.
- Installer has not been rebuilt for these changes.

- Real MCP local MP3 inspection/import, queued-title edit and LP2 capacity/title preview passed. The temporary queue item was removed afterwards; no audio was written.
