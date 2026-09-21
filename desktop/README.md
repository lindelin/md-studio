# Windows development and acceptance

Run `npm install`, `node desktop/prepare-driver.mjs`, then `npm run desktop:dev`.
This builds local web assets and desktop bundles and launches Electron; it does not create or run an installer.

The desktop window owns WebUSB. Close/disconnect the browser device session first. Use the native menu **MD Studio → Connections & drivers** before or after connecting. UI loading stays on loopback port 5190; the private browser bridge chooses a free port. A second app instance focuses the first.

## CLI and MCP

The Connections window copies the CLI launcher generated under `%APPDATA%/MD Studio/mdstudio.cmd`. It uses the bundled Electron runtime as Node. No global Node installation or MCP connection is needed by installed-app users. The desktop window must stay open. Start with `status`, `workspace`, `imports`, `add`, `preview LP2`; `write LP2` is an actual write instruction. `command` / `--file` accept the existing ApplicationCommand JSON for bulk labels, group creation and other supported operations. UI, CLI and MCP share the command bus and its task locking.

MCP uses Streamable HTTP on 127.0.0.1:47124 and a random capability URL copied from the window. No LAN binding. The URL is a credential; it rotates on each enable and is not retained across restarts. An HTTP MCP client must run locally or otherwise have access to this host. Host and Origin are checked. Closing MCP stops new requests; submitted device tasks continue in the desktop app. STDIO source entrypoint remains `npm run mcp` for browser-only development; do not start that independent bridge for the desktop session.

The Skill export copies a portable folder, not client settings. Install it in the chosen client's skill location. AI reasoning depends on that client; audio processing stays local.

## Drivers

The assistant reads Windows PnP entries using CIM and matches the installed netmd-js device catalog. Working WinUSB, storage, composite parents and interface-specific IDs are excluded from the install action. It never automatically rebinds a driver.

The first implementation launches the official, signed Zadig 2.9 interactive installer after a device-specific confirmation. Users still verify the target USB ID and click Install/Replace in Zadig. This is an integrated installer workflow, **not a custom one-click libwdi installer**; Zadig remains a general-purpose external UI, so its device dropdown is not locked to the MD. Do not advertise it as constrained automatic installation. Hi-MD storage drivers must not be replaced by this workflow. Manual rollback guidance is in the window.

The exact binary hash and upstream source version are in vendor/zadig/manifest.json. Source license texts accompany it; preserve the upstream source/rebuild availability and notices when publishing. `prepare-driver.mjs` downloads only the pinned binary and verifies its digest, without execution. Runtime verifies again before launch. Driver installation needs UAC; the main application does not run elevated. After installer exit the assistant scans again; exit alone is not proof of success.

## Acceptance before packaging

1. Launch desktop locally; connect the test MD manually. Check import, both title fields, groups, LP2 recording and actual playback on hardware.
2. Enable MCP; connect a local HTTP MCP client, list tools and read workspace. Disable and verify calls fail; re-enable with the new URL.
3. Run the CLI status/import/preview commands while MCP is off; authorize and test writing separately.
4. Check driver detection with a working driver; it should offer no replacement. Test installation only on a device needing setup, after reviewing the USB ID.
5. Report UI/driver results before building an installer.

`npm run desktop:pack` is configured for an x64 NSIS installer, but must only be run after the user's development-app acceptance. Installer signing, clean-machine driver installation, Windows ARM64 and installer behavior have not been validated. No installer has been produced in this development stage.
