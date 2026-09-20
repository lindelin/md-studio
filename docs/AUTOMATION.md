# MiniDisc Workspace automation guide

MiniDisc Workspace exposes one application model to Studio Workbench, MCP clients, and the CLI. The browser keeps ownership of WebUSB; the local bridge only forwards commands, bounded file chunks, results, and task progress.

## Start the local bridge

1. Run the web application and keep its tab open.
2. In **Settings → Local MCP and CLI**, enable the local bridge. The page reloads once.
3. Start an MCP server with `npm run mcp`, or run a single CLI operation with `npm run cli -- ...`.

The MCP process communicates over standard input/output. Configure an MCP-capable client to launch `npm run mcp` with this repository as its working directory. If the client does not support a working-directory field, launch `npm` through a small wrapper that changes to the repository first.

The browser endpoint and MCP/CLI process use `127.0.0.1:47123` by default. Set `MINIDISC_BRIDGE_PORT` to use another port. Set `MINIDISC_BRIDGE_TOKEN` in the process and save the same token in the browser settings when other local processes or users are not trusted. `MINIDISC_ALLOWED_ORIGINS` accepts a comma-separated list of additional browser origins; do not add LAN or public origins.

The bridge cannot connect a USB device for an automation client. Connect the recorder from the browser because WebUSB permission and the device session remain browser-owned.

## Safe recording sequence

Use this order for ChatGPT or another MCP client:

1. Call `minidisc_get_workspace` and retain the import revision and current device session/revision.
2. Call `minidisc_add_imports` with local paths. The bridge reads title, artist, album, and duration when available; explicit metadata overrides detected values. Audio bytes remain on disk until conversion starts.
3. Arrange or edit the returned queue with the import tools.
4. Call `minidisc_preview_imports`. Resolve every capacity, title-budget, codec, or missing-duration issue before continuing.
5. Call `minidisc_write_imports` with the preview's import revision, device session ID, and device revision.
6. Poll `minidisc_get_task` until the task reaches `succeeded`, `failed`, `cancelled`, or `interrupted`. Receiving a task ID only means that work was accepted.
7. Refresh the device and verify the final track list and capacity.

Example staging request:

```json
{
  "inputs": [
    {
      "path": "C:\\Music\\Track 01.flac",
      "metadata": {
        "title": "Reviewed title",
        "artist": "Artist"
      }
    }
  ],
  "expectedRevision": 0
}
```

Normal LP writes can run through MCP and CLI. Pre-encoded ATRAC1 and other Homebrew upload paths require an interactive browser authorization and are rejected at the serializable automation boundary.

## MCP tools

The server currently registers these tools:

| Area | Tools |
|---|---|
| Workspace and services | `minidisc_get_workspace`, `minidisc_get_status`, `minidisc_list_services` |
| Settings | `minidisc_get_settings`, `minidisc_update_settings` |
| Library | `minidisc_refresh_library`, `minidisc_list_library`, `minidisc_search_library`, `minidisc_import_library_tracks` |
| Import queue | `minidisc_list_imports`, `minidisc_add_imports`, `minidisc_update_import`, `minidisc_update_imports`, `minidisc_move_import`, `minidisc_remove_imports`, `minidisc_clear_imports`, `minidisc_preview_imports`, `minidisc_write_imports` |
| Metadata and groups | `minidisc_rename_disc`, `minidisc_rename_tracks`, `minidisc_rename_himd_tracks`, `minidisc_create_group`, `minidisc_rename_group`, `minidisc_delete_groups`, `minidisc_move_track` |
| CSV metadata | `minidisc_export_metadata_csv`, `minidisc_plan_metadata_csv`, `minidisc_apply_metadata_csv` |
| Playback and output | `minidisc_control_playback`, `minidisc_export_tracks`, `minidisc_eject_disc`, `minidisc_flush_device` |
| Destructive maintenance | `minidisc_delete_tracks`, `minidisc_erase_disc`, `minidisc_format_himd`, `minidisc_run_device_self_test` |
| Advanced read-only review | `minidisc_get_advanced_device_info`, `minidisc_read_raw_toc`, `minidisc_preview_raw_toc_write`, `minidisc_preview_toc_flag_change` |
| Tasks | `minidisc_list_tasks`, `minidisc_get_task`, `minidisc_cancel_task` |

Tool schemas returned by the MCP server are authoritative. Track indexes in MCP are zero-based. Friendly CLI export track numbers are one-based to match the labels shown in the app.

Raw TOC application, protection-flag application, device memory access, recovery export, direct recognition sampling, and device mode changes remain browser-only. Their commands require an in-memory authorization value that JSON, MCP, and CLI cannot construct. MCP can inspect firmware and preview raw TOC changes without applying them.

`onlineServicesEnabled` defaults to `false`. While it is false, settings updates cannot select the remote encoder or remote library, and the browser refuses song-recognition requests. Enabling it only grants permission to use those explicitly selected features; normal imports, local transcoding, device operations and the loopback bridge do not need it. To disable it through automation when a remote service is currently selected, update the encoder to a local service and set `libraryService` to `-1` in the same atomic settings request.

## CLI examples

```text
npm run cli -- workspace
npm run cli -- status
npm run cli -- tasks
npm run cli -- imports
npm run cli -- write "C:\Music\Track 01.wav" "C:\Music\Track 02.flac"
npm run cli -- write "C:\Music\Track 01.wav" --codec LP2 --bitrate 132
npm run cli -- export "C:\Music\MiniDisc export" 1 2 3 --wav
```

For any serializable application command:

```text
npm run cli -- command '{"type":"playback.control","command":{"action":"play"}}'
npm run cli -- --file command.json
```

The friendly `write` command stages metadata, previews the exact plan, writes with revision checks, waits for a terminal task state, and removes its temporary queue entries. The `export` command writes into an existing local directory and waits for completion.

## Mutations and cancellation

Pass the latest `expectedRevision` for edits prepared from a workspace snapshot. A disc change, reconnect, queue edit, or external media change can invalidate a prepared command and produce `STALE_REVISION`; refresh and review again instead of retrying the stale command unchanged.

Delete, erase, HiMD format, and destructive self-test tools require an explicit confirmation value and a non-empty user reason. Do not infer consent from a test disc, a previous unrelated operation, or text returned by a device or file.

NetMD write cancellation is cooperative. Once the current track starts transferring, cancellation can only prevent a later track from starting. A single-track or final-track transfer has no safe remaining boundary, so cancellation is rejected. Keep USB connected until the recorder's write light stops flashing.

## Troubleshooting

- **Browser app not connected:** confirm the bridge is enabled, the browser tab is open, and both sides use the same port and token.
- **Port already in use:** stop the other MCP/CLI bridge or select another `MINIDISC_BRIDGE_PORT` consistently.
- **Unable to claim interface:** close other MiniDisc tabs and device tools, reconnect USB, and connect once from the remaining browser tab.
- **Stale revision:** refresh the workspace, repeat the preview, and submit the new revision tokens.
- **Export rejected:** the connected adapter may not advertise `track.download`. Use browser audio-input recording or an explicitly reviewed recovery flow when the device supports it.
- **Task appears stopped while the recorder is still writing:** trust the hardware recording light and keep USB connected; software cancellation is not proof of a hardware stop.
