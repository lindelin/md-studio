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

## Exploit assembler expression evaluator

`netmd-exploits@0.5.12` declares `expr-eval@^2.0.2`, whose published line has no patched release for two high-severity advisories. The lock file overrides that transitive package with the API-compatible `expr-eval-fork@3.0.1` release identified as patched by the GitHub advisory database. A regression test verifies both the arithmetic used by the exploit assembler and rejection of caller-supplied functions. CI and release builds run `npm run audit:production`; update or remove the override when a compatible `netmd-exploits` release adopts a maintained evaluator directly.
