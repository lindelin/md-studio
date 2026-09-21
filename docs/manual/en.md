# MD Studio user manual

[English](en.md) · [简体中文](zh-CN.md) · [日本語](ja.md) · [Home](../../README.md)

For MD Studio 1.0.0 on Windows. [Download the installer](https://github.com/lindelin/md-studio/releases/latest).

## 1. Install and connect

Run `MD-Studio-Setup-1.0.0.exe`, choose an installation location, and open MD Studio. You do not need the repository or Node.js. The release is unsigned; compare its SHA-256 with `SHA256SUMS.txt` on the release page. Windows 10/11 x64 is the target platform.

Insert a writable MD, provide reliable recorder power, and connect USB. On **Device**, choose the matching NetMD/Hi-MD connection and connect. With multiple compatible USB devices, select one from the list; this release controls one recorder at a time. Available Hi-MD operations depend on the connection method and device.

If a NetMD driver is missing, open **Settings → Device driver → Detect driver**. When offered, launch the included Zadig installer, verify the recorder name and USB ID, and select WinUSB. Administrator permission is required for driver installation. Do not replace unrelated devices or Hi-MD storage interfaces. You do not need a separate Zadig download for this installer.

Under **Settings**, select English, Japanese, Simplified Chinese or the system language, and a light/dark/system theme. New installations follow the system language.

## 2. Add music and prepare a disc

Use the audio file button on the Device page to add local files. There is no music-library server or folder indexing setup. File tags are read when available; WAV files may have tags or only useful filenames. Review the imported names rather than assuming every tag is correct.

Arrange tracks in the recording plan, choose a supported mode (SP, LP2, LP4 or MONO for standard MD), and inspect the capacity preview. Hi-MD can expose different formats. Existing tracks on a disc can use different recording modes; each row shows its actual mode.

The usual recording path includes local decoding/encoding. No server-side conversion or separate standard encoder installation is required. Unsupported optional encoders are not needed for the built-in workflow.

## 3. Titles, artist, album and groups

| Field | Standard MD / NetMD | Hi-MD |
| --- | --- | --- |
| Normal title | Use compatible half-width characters; the product's default for Japanese is the half-width katakana reading | Preserve the original title in supported characters |
| Full-width title | English full-width letters or original Japanese, including kanji; actual display depends on the player | Follow the fields offered for this device |
| Artist / album | Source information for organizing music, not separate disc fields | Separate fields where supported |
| Group | A named consecutive range of tracks, often an album | Supported grouping depends on the device |

The same half/full-width strategy applies to standard MD disc and group names. Full-width English is a formatting preference, not a guarantee every player displays it. Converting character width cannot determine how kanji are pronounced: ask AI to verify readings, especially names and unusual song titles.

Select a track and edit its labels in the inspector, then apply. For NetMD, use an album as a disc title or group name rather than claiming the album/artist is stored in a dedicated field. Preserve version information such as live, remix and instrumental. Source audio files are not retagged by these edits.

To make a group, select consecutive ungrouped tracks on the disc and choose **New group**. Click its name to select the group and rename it. Ungrouping preserves the music. To change members, ungroup, reorder and create the group again. Avoid `//` in group names. Respect the app's title-budget checks; do not silently truncate titles.

## 4. Make an MD with AI

1. Open **AI Creation** and enable MCP. The local server restarts with the app after it has been enabled once.
2. Copy the complete URL into an AI client supporting **local HTTP MCP**. The URL includes an access key, stays the same across restarts/toggles, and should not be shared. Resetting app data or moving to another PC can require new client configuration.
3. Export **MD metadata Skill** and install it using your client's skill instructions. It teaches title/readings/grouping rules; it is not an AI model.
4. Ask AI to read the current device and disc, add local music, and prepare a plan. Verify file order, half/full-width labels, groups, recording mode and capacity before approving writing.
5. Have AI wait for the actual task result and read back the disc. A successful preview or accepted command is not proof of completed recording.

Example:

> Prepare C:/Music/Album for LP2. Keep the Japanese originals as full-width titles and verify their readings for half-width katakana titles. Use the album name for the group. Show uncertain readings and the capacity estimate before writing.

Clients that run only in the cloud cannot reach your PC's localhost directly. Use a compatible local client; no port forwarding is needed. AI services, accounts and fees are separate. Audio conversion and USB transfer run on the PC, but your AI client may send prompts/metadata to its provider. Check that client's privacy settings.

## 5. Use CLI without MCP

Keep MD Studio running. Its launcher is generated at `%APPDATA%\MD Studio\mdstudio.cmd`; you can also copy the path from AI Creation. In PowerShell:

```powershell
$md = "$env:APPDATA\MD Studio\mdstudio.cmd"
& $md --help
& $md workspace
& $md add "C:\Music\Album\01.flac" "C:\Music\Album\02.flac"
& $md preview LP2
# This command records the current queue to the connected disc:
& $md write LP2
& $md tasks
```

`preview` does not write. `write` waits for the task result. The CLI shares your current queue and connection; a second invocation is not a separate recorder session. For structured automation commands see [automation reference](../AUTOMATION.md). MCP does not need to be enabled for desktop CLI use.

## 6. Recording, background operation and erasing

Keep USB and power connected while the recording light flashes. **End batch after current track** prevents later tracks from starting; it does not instantly stop the track already being recorded. Wait for completion before removing a disc.

Closing the window leaves MD Studio in the system tray, so recording, MCP and CLI continue. Double-click the tray icon to reopen. Use its **Quit** menu to end the app. Background mode is not a Windows service: the app must be running and the computer must remain awake.

Disc maintenance offers erasing/initialization and, where supported, Hi-MD formatting. These delete data. Read the confirmation and enter the displayed confirmation phrase exactly; changing languages does not translate the required token.

## 7. Troubleshooting

- **Cannot claim USB / no recorder:** close other MD apps or tabs, check power, reconnect USB and detect the driver. Select the correct device if several are attached.
- **Recording seems slow:** encoding and recorder transfer rates vary with mode and hardware. Check task progress; do not unplug a recorder still writing.
- **Power/USB lost:** reconnect and refresh the disc. Check completed tracks and retry only the remaining ones.
- **AI cannot connect:** confirm MD Studio is running, MCP is enabled and the client supports local HTTP MCP; recopy the complete URL without posting it publicly. A port conflict can prevent startup.
- **Labels display incorrectly:** check half/full-width fields and the actual player's character support. AI-generated readings need review.
- **Report a bug:** include app version, Windows version, device model, mode, steps and a redacted error message at [Issues](https://github.com/lindelin/md-studio/issues). Never include MCP URLs/access keys or private music paths.

Sony MZ-N920 has been used for real-device verification. Other NetMD/Hi-MD models rely on inherited device support and may need further testing. Clean-machine installer/uninstaller and broad Hi-MD acceptance remain areas for additional verification.
