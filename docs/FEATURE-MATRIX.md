# Feature matrix and release acceptance

This matrix is the release contract for MiniDisc Workspace. It records whether an upstream capability still exists, which product boundary owns it, and what evidence is still required before the first independent release.

Status meanings:

- **Ready** — implemented through the shared application boundary and covered by automated or browser verification.
- **Hardware check** — implemented, but final acceptance requires a compatible physical device.
- **Browser only** — intentionally requires an in-memory browser capability or user interaction and is excluded from JSON, MCP, and CLI.
- **Optional online** — disabled by default and outside the normal local workflow; it remains a release-scope decision.
- **Removed** — deliberately excluded from the new product.

## Product and architecture

| Capability | Status | Primary boundary | Evidence / remaining acceptance |
|---|---|---|---|
| Studio Workbench shell | Ready | React + `ApplicationClient` | Desktop and narrow viewport browser QA; device, disc, recording plan, inspector, tasks, library, settings, automation and tools are reachable. |
| Simplified Chinese and English | Ready | Shared i18n model | Static translation coverage plus live language switching and reload persistence. |
| Shared application commands | Ready | `ApplicationCommandBus` | UI, MCP and CLI use the same validation, revisions, errors and task state. |
| Shared workspace state | Ready | `WorkspaceStore` | Device, imports, tasks, settings, encoder and library summaries use one observable snapshot. |
| Local long-running tasks | Ready | `TaskManager` | Queued/running/terminal states, progress, partial results and cooperative cancellation are shared. |
| Browser-only payload boundary | Ready | `InProcessApplicationClient` | Local `File`, output sinks, microphone streams and advanced authorizations do not cross JSON automation. |
| Browser preferences | Ready | `BrowserPreferencesStore` | Adapter, custom devices and loopback bridge are persisted before a new revision is published. |
| Redux runtime | Removed | — | Runtime dependency and legacy state shell have been deleted. |
| Win95 / Retro UI | Removed | — | Duplicate UI, assets and dependency have been deleted. |
| Standalone Factory screen | Removed | — | Supported maintenance operations moved into capability-gated Workbench tools. |
| Tetris easter egg | Removed | — | No UI, command, bridge, capability or device-service entry remains. |
| Raw device globals in DevTools | Removed | — | NetMD, HiMD, exploit, patch and TOC objects are no longer attached to `window`. |

## MiniDisc workflows

| Area | Capability | UI | Application command / client | MCP / CLI | Status and evidence |
|---|---|---:|---:|---:|---|
| Session | Connect, cached reconnect, disconnect and recovery | Yes | Browser client | No | Ready; MockMD and MZ-N920 verified, with bounded cached reconnect. |
| Disc | Refresh content and device status | Yes | `disc.refresh`, `device.pollStatus` | Yes | Ready; cache invalidation and external-disc revision changes are covered. |
| Disc | Rename half-width/full-width or HiMD title | Yes | `disc.rename` | Yes | Ready on MockMD and MZ-N920; HiMD hardware check remains. |
| Disc | Capacity, write protection and title limits | Yes | Workspace snapshot | Yes | Ready; frame/byte capacity and NetMD title-cell allocation are covered. |
| Disc | Eject and pending-device flush | Yes | `disc.eject`, `device.flush` | Yes | Hardware check across adapters; capability gates prevent unsupported success. |
| Disc | Erase and HiMD format | Yes | `disc.erase`, `disc.formatHimd` | Yes | Destructive confirmation and revision checks are ready; HiMD format needs hardware acceptance. |
| Tracks | Rename NetMD and HiMD metadata | Yes | `track.renameMany`, `track.renameHimdMany` | Yes | NetMD ready; HiMD artist/album needs representative hardware. |
| Tracks | Move and grouped ordering | Yes | `track.move` | Yes | Ready; grouped and ungrouped movement model is covered. |
| Tracks | Multi-select deletion | Yes | `track.deleteMany` | Yes | Ready; explicit confirmation and descending index validation are covered. |
| Groups | Create, rename and delete groups | Yes | `group.create`, `group.rename`, `group.deleteMany` | Yes | Ready on MockMD; NetMD title behavior covered by shared gateway. |
| Playback | Play, pause, stop, next, previous and seek | Yes | `playback.control` | Yes | Ready on MockMD and MZ-N920; unsupported adapters fail explicitly. |
| Metadata | Export, plan and selectively apply CSV | Yes | `metadata.exportCsv`, `metadata.planCsv`, `metadata.applyCsv` | Yes | Ready; complete validation occurs before the first device write. |

## Import, conversion and recording

| Capability | UI | MCP / CLI | Execution boundary | Status and evidence |
|---|---:|---:|---|---|
| Browser file import | Yes | — | Local browser memory | Ready; tags, duration and pre-encoded formats are inspected before queueing. |
| Local path import | — | Yes | Loopback bridge + opaque file handles | Ready; files are read lazily in bounded chunks and identity is rechecked during transfer. |
| Shared recording plan | Yes | Yes | `ImportQueue` | Ready; add, edit, batch edit, move, remove, clear and revision checks are shared. |
| Capacity/title/codec preview | Yes | Yes | `import.preview` | Ready; stale device, disc or queue plans are rejected before task creation. |
| FFmpeg source conversion | Yes | Yes | Browser Worker | Ready; worker startup, cleanup, cancellation boundaries and safe virtual names are covered. |
| Local Atracdenc LP2/LP4 encoding | Yes | Yes | Browser Worker/WASM | Ready; real CLI → browser → MZ-N920 LP2 write verified. |
| Optional At3RE / Atrac3OS / native local encoder | When assets exist | Yes | Local Worker or desktop process | Hardware/runtime check; unavailable assets are not advertised. |
| Remote ATRAC encoding | Optional | Optional | External HTTP service | Optional online; disabled by default and conflicts with a strict local-only release profile. |
| Standard LP write | Yes | Yes | `import.write` + browser writer | Ready on MockMD and MZ-N920, including write-after-refresh and queue cleanup. |
| Homebrew ATRAC1 / SP / Mono write | Yes | No | Browser-only authorization | Hardware check; policy and confirmation are covered, representative write paths remain device-specific. |
| Immediate interruption of the active NetMD track | No | No | Protocol limitation | Not accepted as safe. Cancellation stops before the next track; the UI never claims the active recorder stopped. |
| Completion notification | Yes | — | Local browser notification | Ready; permission is requested only from the explicit setting and notification failure cannot change a successful write. |

## Export, recording, recognition and library

| Capability | Status | Boundary | Evidence / remaining acceptance |
|---|---|---|---|
| Standard direct track export | Hardware check | Shared background task | Capability and output handling are ready; requires a device with `track.download` such as MZ-RH1. |
| Recovery/exploit export | Browser only / hardware check | Browser authorization + advanced task | Review, progress, bad-sector decisions and output handling are ready; representative device acceptance remains. |
| Browser audio-input recording | Hardware check | Local microphone/line input | Device enumeration, preview replacement, cleanup and task state are covered; real input acceptance remains. |
| Song recognition | Optional online | Local sampling + external recognition request | Disabled with online services. A strict local-only release must remove it or replace the matcher with a local implementation. |
| Library workspace UI | Ready | Workbench + `LibraryCatalog` | Navigation, search, paging, selection and import are covered. |
| Built-in local folder library | Ready | Browser-session file handles + local encoder | Folder selection, bounded indexing, metadata, search, paging and import are local. Browser permission is intentionally reselected after reload. |
| Remote HTTP library | Optional online | External server | Disabled by default. The local folder library is the normal server-free catalog path. |

## Advanced maintenance

| Capability | Status | Automation exposure | Evidence / remaining acceptance |
|---|---|---|---|
| Firmware/capability inspection | Ready | MCP read-only + UI | `advanced.inspect`; MockMD and MZ-N920 diagnostics verified. |
| Six-sector raw TOC read and backup | Hardware check | MCP read-only + UI | Checksums, exact sizes and immutable snapshots are covered. |
| Raw TOC write and targeted SCMS/protection changes | Browser only / hardware check | Preview via MCP; application via browser only | Exact checksum, session/revision, confirmation phrase and in-memory authorization are enforced. |
| RAM/ROM/DRAM and firmware backup | Browser only / hardware check | No JSON payload | Progress and file task results are implemented; representative hardware acceptance remains. |
| SP upload speedup and disc-swap detection | Browser only / hardware check | No | Capability-gated and serialized; representative hardware acceptance remains. |
| HiMD unrestricted mode and service mode | Browser only / hardware check | No | Session-ending transition waits for device completion before disconnecting. |
| Destructive device self-test | Ready for supported NetMD | MCP + UI with confirmation | Full 14-step test passed on the authorized MZ-N920 test disc. |

## Automation coverage

The serializable command surface currently contains:

`workspace.get`, `services.get`, `settings.get`, `settings.update`, `disc.refresh`, `device.pollStatus`, `disc.rename`, `disc.erase`, `disc.formatHimd`, `device.flush`, `disc.eject`, `metadata.exportCsv`, `metadata.planCsv`, `metadata.applyCsv`, `advanced.inspect`, `advanced.readToc`, `advanced.previewTocWrite`, `advanced.previewTocPatch`, `advanced.writeToc`, `advanced.applyTocPatch`, `advanced.setSpUploadSpeedup`, `advanced.setDiscSwapDetectionDisabled`, `advanced.enableHimdFullMode`, `advanced.enterServiceMode`, `library.get`, `library.refresh`, `library.status`, `library.refreshSummary`, `library.list`, `library.search`, `library.import`, `track.renameMany`, `track.renameHimdMany`, `track.move`, `track.export`, `track.record`, `track.deleteMany`, `group.rename`, `group.create`, `group.deleteMany`, `playback.control`, `diagnostics.selfTest`, `task.list`, `task.get`, `task.cancel`, `import.list`, `import.add`, `import.update`, `import.updateMany`, `import.move`, `import.remove`, `import.clear`, `import.preview`, and `import.write`.

The local MCP server exposes 43 friendly tools over the same command bus. Raw TOC application, device memory reads, recovery export, direct recognition sampling, Homebrew upload authorization and device mode changes remain browser-only because their in-memory capabilities cannot be represented by a JSON client.

The friendly tool surface is: `minidisc_get_workspace`, `minidisc_list_services`, `minidisc_get_status`, `minidisc_refresh_library`, `minidisc_list_library`, `minidisc_search_library`, `minidisc_import_library_tracks`, `minidisc_get_settings`, `minidisc_update_settings`, `minidisc_get_advanced_device_info`, `minidisc_read_raw_toc`, `minidisc_preview_raw_toc_write`, `minidisc_preview_toc_flag_change`, `minidisc_rename_disc`, `minidisc_export_metadata_csv`, `minidisc_plan_metadata_csv`, `minidisc_apply_metadata_csv`, `minidisc_rename_tracks`, `minidisc_rename_himd_tracks`, `minidisc_create_group`, `minidisc_rename_group`, `minidisc_delete_groups`, `minidisc_move_track`, `minidisc_export_tracks`, `minidisc_delete_tracks`, `minidisc_erase_disc`, `minidisc_format_himd`, `minidisc_flush_device`, `minidisc_eject_disc`, `minidisc_control_playback`, `minidisc_run_device_self_test`, `minidisc_list_tasks`, `minidisc_cancel_task`, `minidisc_get_task`, `minidisc_list_imports`, `minidisc_add_imports`, `minidisc_update_import`, `minidisc_update_imports`, `minidisc_move_import`, `minidisc_remove_imports`, `minidisc_clear_imports`, `minidisc_preview_imports`, and `minidisc_write_imports`.

## Release acceptance still open

1. Decide and enforce the final local-only product profile. Remote encoder, remote library, Remote NetMD and external song recognition are currently optional and disabled by default; the strict interpretation is to remove them from the official build.
2. Verify standard export and successful file-result presentation on a download-capable NetMD device.
3. Verify representative HiMD metadata/export and Network Walkman operations without weakening capability gates.
4. Verify browser audio-input recording and, if recognition remains, define a local recognition implementation.
5. Verify device-specific advanced backup/recovery and Homebrew write paths only on explicitly disposable media.
6. Capture final release screenshots after the product profile is frozen, then repeat the clean-install, build, license and runtime-asset release gates.
