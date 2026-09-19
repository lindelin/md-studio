# Security policy

## Supported code

Security fixes are made on the current development branch. Published releases should identify the exact commit and dependency lock file used to build them.

## Reporting a vulnerability

After this project is published, use the repository host's private security-reporting feature. Do not include device identifiers, private audio, bridge tokens, or destructive proof-of-concept steps in a public issue. Until a private reporting channel is listed, share only a minimal public description that asks the maintainer to establish a private channel.

## Trust boundaries

- The browser owns USB access. A local MCP or CLI bridge cannot control a device until the user explicitly enables the bridge in the browser.
- The bridge listens on loopback by default. A token can be configured with `MINIDISC_BRIDGE_TOKEN`; do not expose the bridge port to a LAN or public network.
- Imported audio, metadata, playlists, and remote-service responses are untrusted input. Keep parsers bounded and avoid loading files outside paths explicitly selected by the user.
- Factory and exploit features execute device-specific maintenance operations. They remain separate from normal editing and require an explicit user action in the application.

## Known dependency exception

`netmd-exploits` currently depends on `expr-eval`, for which npm reports high-severity advisories. The vulnerable parser is used by the bundled exploit assembler. MiniDisc Workspace does not expose assembly expressions through its MCP, CLI, import, or metadata interfaces. Downgrading to the audit tool's suggested `netmd-exploits` version would remove later device fixes, so the dependency remains temporarily pinned by `package-lock.json`. Replace or update it when a compatible upstream release removes `expr-eval`.
