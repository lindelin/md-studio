# MD Studio 0.1.0 release checklist

Updated 2026-09-21.

## Completed

- Core NetMD connection, import, LP2 writing, title editing and group creation verified on Sony MZ-N920.
- CLI cached-device connection, local FLAC import, preview, writing and fresh device readback verified on hardware.
- Cooperative write cancellation stops at the next safe track boundary; UI wording does not claim that an active track stopped.
- USB loss and application-session recovery preserve the recording plan and report partial-task evidence.
- Windows driver detection excludes working WinUSB, storage, composite-parent and interface-specific devices.
- Zadig 2.9 payload is pinned, hash-verified before launch and included with source/license notices.
- Chinese and English UI, dark/light theme implementation, MD mode labels and project identity are covered by automated checks.
- Type checks, lint, 307 automated tests, runtime-asset provenance, 959 dependency licenses and production dependency audit pass.
- x64 NSIS packaging succeeds and contains the application, CLI, metadata Skill, Zadig payload and license materials.

## Deferred acceptance

- Final MCP client integration test, per the maintainer's decision.
- Final UI review and release screenshots after the last visual change.
- Clean-machine installer and uninstall check.
- Representative Hi-MD and download-capable hardware checks.

## Distribution note

The local test installer is unsigned because no Windows code-signing certificate is configured. Windows SmartScreen may warn until a trusted certificate and release signing process are added. Do not describe an unsigned build as signed.
