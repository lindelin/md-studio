# Design QA — Studio Workbench

- Reference: `../outputs/ui-directions/option-1.png`
- Implementation: `src/components/workbench/workbench.tsx` and `workbench.css`
- Review viewport: 1440 × 1024
- Review state: connected MockMD, writable disc, five populated tracks
- Browser: Codex in-app browser

## Visual comparison

The implementation follows the selected reference's fixed dark sidebar, compact device header, current-disc overview, central recording-plan table, right-side inspector, and bottom capacity/task bar. The hierarchy, cyan accent, dense row rhythm, selected-row treatment, border contrast, and 260px desktop sidebar are aligned with the reference.

The second comparison pass moved the write action into the Recording Plan heading, added connection and recording details to the disc overview, restored the reference's Help and About sidebar entries, added an explicit Eject control, and removed the decorative disc treatment in favor of the existing Material `Album` icon.

Runtime data intentionally replaces reference-only placeholders: device name, capacity, mode, title limits, capabilities, and task state all come from the shared Application Workspace. The work area now has explicit Recording plan and On disc views, so adding imports no longer hides the current disc. The selected recording mode is persisted in shared settings and reused by the write preview.

## Interaction verification

- Initial device connection publishes a complete device snapshot before the UI reports success.
- Track selection updates the inspector.
- Single, Ctrl/Command, Shift-range and select-all track selection feed the same action set and application menu.
- Recording-plan rows use the same selection model, support batch removal, and apply Artist/Album edits across the selected items while keeping titles scoped to the focused row.
- Enter/Space select a focused row; Up/Down move focus and selection through the current table.
- Inspector metadata changes update the shared application state and row content.
- MockMD verified group creation, group rename, ungrouping, track movement controls and batch export/record entry points.
- Disc rows show their recorded format; only the recording-plan view exposes the writable recording format control.
- Play and pause update from the device status snapshot.
- Disc refresh, eject, settings, application menu, Automation, Tools, Help, and About have reachable controls.
- The bottom status opens a Task Center backed by Workspace Task history; its empty state, task list/detail structure, status distinctions, result/error regions, cancellation control and responsive layout are present without a second state store.
- Escape closes the Task Center even while focus remains on the footer trigger.
- A failed MockMD export automatically opens and selects its Task Center entry, shows the device error and recovery action, and leaves zero legacy progress/error dialogs mounted in the modern workbench.
- Empty, disconnected, busy, selected, disabled, and connected states render without layout failure.
- 1024 × 768 collapses the sidebar and hides lower-priority columns without horizontal page overflow.
- 760 × 900 moves navigation to the bottom and stacks the inspector below the track plan.

## Findings and resolution

- P0: none.
- P1: device session entered the main view before its first snapshot was read. Fixed by awaiting the first application refresh inside the shared connection lifecycle.
- P2: welcome-page content overlapped its copyright row at desktop widths. Fixed by using content-driven height and a minimum surface height.
- P2: playback selection changed tracks without issuing play. Fixed by sequencing `gotoTrack` and `play`, while preserving pause for the active track.
- P2: initial workbench placement differed from the selected reference in action location and device detail density. Fixed in the second visual pass.
- P2: queued imports previously replaced the disc table, making disc management unreachable until the queue was cleared. Fixed with explicit Recording plan and On disc views.
- P2: the first recording-mode selector only changed local component state. Fixed by writing the device-specific format through the shared settings command used by the write preview.
- P2: the first workbench pass exposed only one selected track and had no visible group/export controls. Fixed with multi-select, group lifecycle actions, move controls and the existing export/record dialog.
- P2: the first recording-plan view still allowed only one selected item and mouse-only row navigation. Fixed with a shared ordered-selection model, keyboard focus, batch removal and tested shared metadata rules.
- P2: long-task state still required opening legacy progress dialogs. Fixed with a persistent footer entry and a unified Task Center that exposes the same Workspace Task lifecycle, partial result and recovery information.
- P2: task failures were briefly duplicated in the Task Center and the legacy Error dialog. Fixed with an explicit shell presentation policy: Studio Workbench owns terminal task feedback while Win95 and Factory surfaces keep compatibility dialogs.
- P3: the reference includes free-form notes. Notes remain a future queue feature because the shared contracts do not model them yet.

## Result

final result: passed
