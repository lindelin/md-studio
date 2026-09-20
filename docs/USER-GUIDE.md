# MiniDisc Workspace user guide

MiniDisc Workspace keeps the browser, local automation, and the connected recorder on one shared task and device state. The browser owns USB access. MCP and CLI requests are forwarded to that open browser session.

## Start the application

Install Node.js 20.19 or newer, then run:

```text
npm ci
npm run dev
```

Open the local address printed in the terminal. Use **Connect to MockMD** when learning the interface or testing changes without hardware.

The interface starts in **简体中文** and retains complete **English** support. Change it under **Settings → Language**, where **Follow browser language** is also available; the choice takes effect immediately and is saved for later sessions. Device names, codec names, capability identifiers, and exact destructive confirmation phrases remain unchanged where translating them could make diagnostics or safety checks ambiguous.

For a real recorder, install the WinUSB driver described by the [MiniDisc Wiki Windows guide](https://www.minidisc.wiki/guides/webminidisc/requirements#windows), connect the recorder, choose its matching adapter, and approve the browser's USB picker.

Only one tab or application can claim a USB interface. If connection fails with `Unable to claim interface`, close other MiniDisc tabs and programs, disconnect and reconnect the USB cable, then try once from the remaining tab. Repeated connect clicks do not release a claim held elsewhere.

## Workbench layout

- **Device** shows connection, disc capacity, playback, and synchronization state.
- **Disc** shows tracks already on the inserted disc. Selection drives playback, metadata, groups, export, and maintenance actions.
- **Recording Plan** contains local audio waiting to be written. Editing this list does not change the disc.
- **Library** browses a configured music source and adds selected tracks to the recording plan.
- **Inspector** edits the focused item and applies supported batch metadata to the current selection.
- **Task Center** shows queued and active work, true completion state, partial results, recovery advice, and completed output files.
- **Settings** controls defaults and service configuration. Items marked for reload take effect after the page reloads.
- **Tools** contains CSV metadata, diagnostics, backups, raw TOC work, protection flags, and device-specific maintenance.

Advanced controls are enabled only when the connected adapter advertises the required capability. A disabled action can be correct for that recorder.

## Local and online execution

Normal MiniDisc work is local. File import, metadata editing, FFmpeg conversion, ATRAC encoding, queues, caches, exports, MCP/CLI traffic and USB communication stay on this computer. A hosted web version downloads static application files and does not send those jobs to a project server.

**Settings → Online services** is off for a new installation. While it is off, the command layer and the request implementations block the remote ATRAC encoder, remote music library and song recognition. Turning it on only permits those features; each still runs after the user selects or starts it. Turning it off again returns a selected remote encoder to a bundled local encoder and clears the remote library selection.

## Record audio to a disc

1. Connect the recorder and confirm the correct disc title, capacity, and write-protection state.
2. Open **Recording Plan**, add local files or choose tracks from **Library**, and arrange the final order.
3. Edit titles, artist, album, groups, and recording format. Use the preview to resolve capacity, title-storage, or codec errors.
4. Review the exact mode, track count, and capacity in the recording confirmation.
5. Start the task and watch **Task Center** until it reaches **Succeeded** and the recorder finishes updating its table of contents.

NetMD cancellation is cooperative. While a track is transferring, **Stop after current track** prevents a following track from starting; it does not promise to abort the track already recording. Keep USB connected while the recorder's write light flashes. If hardware recording continues after the page appears stopped, wait for the device when practical. Disconnecting USB is a last-resort recovery step and can discard the in-progress track.

## Export or record a track

Select one or more disc tracks and open **Export**. Direct export is available only when the adapter exposes track download. Some NetMD recorders, including models that can upload normally, do not provide that capability.

When direct download is unavailable, the audio-input recording flow can capture device playback through a selected computer input. Preview the input before starting and keep the device connected for the full playback duration.

Successful and partially cancelled tasks that return files show them in **Task Center**. The file list is capped for responsiveness; **Copy** copies a displayed local path to the clipboard.

## Metadata and maintenance

CSV export creates a reviewable metadata snapshot. CSV import always produces a plan first and applies only selected compatible rows. Any disc change after planning invalidates the plan and requires a fresh review.

Raw TOC writes, protection-flag changes, formatting, erase, and diagnostics have stronger confirmation and capability checks. Back up the current TOC before raw maintenance. Reference sectors are kept separate from writable sectors, and a changed disc or checksum blocks a stale write.

Use destructive diagnostics only with a disposable writable disc. The self-test erases and rewrites content by design.

## MCP and CLI

Enable **Local MCP and CLI bridge** in Settings and reload the page. Keep that page open and connected. Then start either interface in another terminal:

```text
npm run mcp
npm run cli -- workspace
npm run cli -- tasks
```

The bridge listens only on `127.0.0.1` by default. Set `MINIDISC_BRIDGE_TOKEN` and configure the same token in the browser when other local users or processes are not trusted. Do not expose the bridge port to a LAN or the public internet.

CLI and MCP use the same revisions, confirmations, task states, and device transaction queue as Studio Workbench. A command returning a task ID means the task was accepted; inspect the task until it reaches a terminal state before treating the operation as complete.

## Recover from a disconnect

1. If a write light is flashing, allow the recorder to finish when possible.
2. Close duplicate MiniDisc tabs or other software that may own WebUSB.
3. Reconnect the cable and wait for the recorder to become ready.
4. Connect once from MiniDisc Workspace, refresh the disc, and verify its title, track count, duration, and remaining capacity.
5. Check Task Center for a failed or interrupted task before retrying. Do not assume a queued item was written just because the transfer dialog disappeared.

After reconnecting, always use the refreshed workspace revision. Previously prepared automation commands and write previews are intentionally rejected as stale.
