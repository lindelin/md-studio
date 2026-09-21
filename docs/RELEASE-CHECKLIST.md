# MD Studio 1.0.0 release checks

## Verified locally

- 310 automated tests, including Japanese message coverage, language resolution, task/queue behavior and HTTP MCP tools against an isolated mock device.
- TypeScript checks for frontend, build configuration and desktop; ESLint; production frontend and Electron compilation.
- 957 third-party license entries and 5 runtime assets with 12 provenance records verified. Production dependency audit: no reported vulnerabilities at release preparation.
- Existing Sony MZ-N920 hardware validation covers connection, CLI recording, labels, groups, persistent MCP and background disc operations; see the [MCP evidence](MCP-VALIDATION-2026-09-21.md). This release's language/documentation changes were verified in code, not by new hardware writes.
- English, Japanese and Simplified Chinese README/manuals. No newly generated screenshots or computer-driven UI tests.
- Public source/history checked for the developer's local user path and common token/private-key patterns; no matches. This is not a comprehensive security audit.

## Packaging

Use `node desktop/prepare-driver.mjs` and `npm run desktop:pack`. The release includes the x64 NSIS installer, three-language manuals and SHA-256 checksums. The Windows installer is unsigned; do not describe it as signed.

## Remaining acceptance

- Clean-machine install/uninstall and a final human review of the Japanese UI.
- Broader recorder coverage, especially Hi-MD-specific behavior.
- Windows code signing is not configured.

Manual acceptance limitations are also stated in the user manuals and release notes.
