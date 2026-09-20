import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useDispatch } from '../../frontend-utils';
import { acceptedTypes, AdaptiveFile, bytesToHumanReadable, DisplayTrack, formatTimeFromSeconds, getSortedTracks } from '../../utils';
import { actions as appActions } from '../../redux/app-feature';
import { actions as convertDialogActions } from '../../redux/convert-dialog-feature';
import { openLocalLibrary } from '../../redux/actions';
import { useApplicationClient, useApplicationWorkspace } from '../use-application-client';
import { getDefaultRecordingFormat, getRecordingCodec } from '../../application/device-profile';
import type { ImportQueueItem } from '../../application/import-queue';

import AlbumIcon from '@mui/icons-material/Album';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloudDoneIcon from '@mui/icons-material/CloudDone';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import EjectIcon from '@mui/icons-material/Eject';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import LibraryMusicIcon from '@mui/icons-material/LibraryMusic';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import QueueMusicIcon from '@mui/icons-material/QueueMusic';
import HelpOutlineRoundedIcon from '@mui/icons-material/HelpOutlineRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import UsbRoundedIcon from '@mui/icons-material/UsbRounded';
import BoltRoundedIcon from '@mui/icons-material/BoltRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import KeyboardArrowUpRoundedIcon from '@mui/icons-material/KeyboardArrowUpRounded';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';

import { TopMenu } from '../topmenu';
import { DiscProtectedDialog } from '../disc-protected-dialog';
import { UploadDialog } from '../upload-dialog';
import { RenameDialog } from '../rename-dialog';
import { ErrorDialog } from '../error-dialog';
import { ConvertDialog } from '../convert-dialog';
import { RecordDialog } from '../record-dialog';
import { FactoryModeProgressDialog } from '../factory/factory-progress-dialog';
import { FactoryModeBadSectorDialog } from '../factory/factory-bad-sector-dialog';
import { DumpDialog } from '../dump-dialog';
import { SongRecognitionDialog } from '../song-recognition-dialog';
import { SongRecognitionProgressDialog } from '../song-recognition-progress-dialog';
import { FactoryModeNoticeDialog } from '../factory/factory-notice-dialog';
import { AboutDialog } from '../about-dialog';
import { ChangelogDialog } from '../changelog-dialog';
import { SettingsDialog } from '../settings-dialog';
import { LocalLibraryDialog } from '../local-library';
import { PanicDialog } from '../panic-dialog';

import './workbench.css';

type NavigationSection = 'device' | 'library' | 'automation' | 'tools';
type PlanItem =
    | { kind: 'import'; key: string; index: number; item: ImportQueueItem }
    | { kind: 'track'; key: string; index: number; item: DisplayTrack };

function formatDuration(seconds?: number | null) {
    if (seconds === undefined || seconds === null) return '—';
    return formatTimeFromSeconds(seconds);
}

function codecLabel(codec?: { codec: string; bitrate: number } | string | null) {
    if (!codec) return 'Auto';
    if (typeof codec === 'string') {
        if (codec === 'SPS') return 'SP Stereo';
        if (codec === 'SPM') return 'SP Mono';
        return codec;
    }
    if (codec.codec === 'SP') return 'SP Stereo';
    if (codec.codec === 'LP2') return 'LP2 Stereo';
    if (codec.codec === 'LP4') return 'LP4 Stereo';
    return `${codec.codec} ${codec.bitrate}`;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export const Workbench = () => {
    const dispatch = useDispatch();
    const client = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const device = workspace.device;
    const disc = device?.disc ?? null;
    const imports = workspace.imports.items;
    const tracks = useMemo(() => getSortedTracks(disc), [disc]);
    const [section, setSection] = useState<NavigationSection>('device');
    const [uploadedFiles, setUploadedFiles] = useState<(File | AdaptiveFile)[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [draft, setDraft] = useState({ title: '', album: '', artist: '', fullWidthTitle: '' });
    const [formatIndex, setFormatIndex] = useState<[number, number]>(device?.recording.defaultFormat ?? [0, 0]);
    const [message, setMessage] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const planItems: PlanItem[] = useMemo(
        () =>
            imports.length > 0
                ? imports.map((item, index) => ({ kind: 'import' as const, key: `import:${item.id}`, index, item }))
                : tracks.map((item, index) => ({ kind: 'track' as const, key: `track:${item.index}`, index, item })),
        [imports, tracks]
    );

    useEffect(() => {
        if (!selectedKey || !planItems.some((item) => item.key === selectedKey)) {
            setSelectedKey(planItems[0]?.key ?? null);
        }
    }, [planItems, selectedKey]);

    const selected = planItems.find((item) => item.key === selectedKey) ?? null;
    useEffect(() => {
        if (!selected) {
            setDraft({ title: '', album: '', artist: '', fullWidthTitle: '' });
            return;
        }
        setDraft({
            title: selected.item.title ?? '',
            album: selected.item.album ?? '',
            artist: selected.item.artist ?? '',
            fullWidthTitle: selected.item.fullWidthTitle ?? '',
        });
    }, [selectedKey, selected]);

    useEffect(() => {
        if (device) setFormatIndex(device.recording.defaultFormat);
    }, [device]);

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            const accepted = acceptedFiles.filter((file) => !['audio/mpegurl', 'audio/x-mpegurl'].includes(file.type));
            if (accepted.length === 0) return;
            setUploadedFiles(accepted);
            dispatch(convertDialogActions.setVisible(true));
        },
        [dispatch]
    );
    const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
        onDrop,
        accept: acceptedTypes,
        noClick: true,
        noKeyboard: true,
    });

    const run = useCallback(async (operation: () => Promise<void>) => {
        setBusy(true);
        setMessage(null);
        try {
            await operation();
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }, []);

    const execute = useCallback(
        async (command: Parameters<typeof client.execute>[0]) => {
            const result = await client.execute(command);
            if (!result.ok) throw new Error(result.error.message);
            return result;
        },
        [client]
    );

    const selectedFormat = device ? getRecordingCodec(device.recording, formatIndex) : null;
    const defaultFormat = device ? getDefaultRecordingFormat(device.recording) : null;
    const capabilities = device?.capabilities ?? [];
    const canUpload = capabilities.includes('track.upload');
    const canEject = capabilities.includes('disc.eject');
    const canPlayback = capabilities.includes('playback.control');
    const canDownload = capabilities.includes('track.download');
    const measurementIsBytes = device?.recording.measurementUnits === 'bytes';
    const usedPercent = disc?.total ? Math.min(100, Math.max(0, (disc.used / disc.total) * 100)) : 0;
    const queuedDuration = imports.reduce((total, item) => total + (item.duration ?? 0), 0);
    const activeTask = workspace.tasks.find((task) => task.status === 'running' || task.status === 'queued') ?? null;
    const taskPercent = activeTask
        ? activeTask.progress.currentPercent ??
          (activeTask.progress.total > 0 ? (activeTask.progress.completed / activeTask.progress.total) * 100 : 0)
        : 0;

    const saveInspector = () => {
        if (!selected || !device) return;
        void run(async () => {
            if (selected.kind === 'import') {
                await execute({
                    type: 'import.update',
                    id: selected.item.id,
                    changes: {
                        title: draft.title,
                        album: draft.album,
                        artist: draft.artist,
                        fullWidthTitle: draft.fullWidthTitle,
                    },
                    expectedRevision: workspace.imports.revision,
                });
            } else if (capabilities.includes('metadata.himd')) {
                await execute({
                    type: 'track.renameHimdMany',
                    updates: [{ index: selected.item.index, title: draft.title, album: draft.album, artist: draft.artist }],
                    expectedRevision: device.revision,
                });
            } else {
                await execute({
                    type: 'track.renameMany',
                    updates: [{ index: selected.item.index, title: draft.title, fullWidthTitle: draft.fullWidthTitle }],
                    expectedRevision: device.revision,
                });
            }
            setMessage('Changes saved.');
        });
    };

    const removeSelected = () => {
        if (!selected) return;
        void run(async () => {
            if (selected.kind === 'import') {
                await execute({ type: 'import.remove', ids: [selected.item.id], expectedRevision: workspace.imports.revision });
                return;
            }
            if (!window.confirm(`Delete “${selected.item.title || `Track ${selected.item.index}`}” from this test disc?`)) return;
            await execute({
                type: 'track.deleteMany',
                indexes: [selected.item.index],
                confirmation: { confirmed: true, reason: 'User confirmed deletion in the workbench.' },
                expectedRevision: device?.revision,
            });
        });
    };

    const moveImport = (id: string, destinationIndex: number) => {
        if (destinationIndex < 0 || destinationIndex >= imports.length) return;
        void run(async () => {
            await execute({ type: 'import.move', id, destinationIndex, expectedRevision: workspace.imports.revision });
        });
    };

    const refresh = () => void run(async () => void (await execute({ type: 'disc.refresh', dropCache: true })));
    const eject = () => void run(async () => void (await execute({ type: 'disc.eject', expectedRevision: device?.revision })));
    const togglePlayback = (track: DisplayTrack) =>
        void run(async () => {
            const playing = device?.status.track === track.index && device.status.state === 'playing';
            if (playing) {
                await execute({ type: 'playback.control', command: { action: 'pause' } });
                return;
            }
            if (device?.status.track !== track.index) {
                await execute({ type: 'playback.control', command: { action: 'gotoTrack', index: track.index } });
            }
            await execute({ type: 'playback.control', command: { action: 'play' } });
        });

    const openWriter = () => {
        if (imports.length === 0) {
            open();
            return;
        }
        dispatch(convertDialogActions.setVisible(true));
    };

    const libraryClick = () => {
        setUploadedFiles([]);
        dispatch(openLocalLibrary());
    };

    const discLabel = disc?.title || 'Untitled MiniDisc';
    const capacityUsed = disc
        ? measurementIsBytes
            ? bytesToHumanReadable(disc.used)
            : formatTimeFromSeconds(disc.used)
        : '—';
    const capacityTotal = disc
        ? measurementIsBytes
            ? bytesToHumanReadable(disc.total)
            : formatTimeFromSeconds(disc.total)
        : '—';

    return (
        <div className="workbench" {...getRootProps()}>
            <input {...getInputProps()} />
            <aside className="workbench__sidebar">
                <div className="workbench__brand">
                    <span className="workbench__brand-mark"><AlbumIcon /></span>
                    <span><strong>Studio Workbench</strong><small>MiniDisc Management</small></span>
                </div>

                <nav className="workbench__nav" aria-label="Workspace">
                    <button className={section === 'device' ? 'is-active' : ''} onClick={() => setSection('device')}>
                        <UsbRoundedIcon /><span>Device</span><i className={device ? 'is-online' : ''} />
                    </button>
                    <button className={section === 'library' ? 'is-active' : ''} onClick={() => { setSection('library'); libraryClick(); }}>
                        <LibraryMusicIcon /><span>Library</span>
                    </button>
                    <button onClick={open} disabled={!canUpload}><AddRoundedIcon /><span>Import Audio</span></button>
                </nav>

                <div className="workbench__sidebar-label">WORKSPACE</div>
                <nav className="workbench__nav">
                    <button onClick={() => dispatch(appActions.showSettingsDialog(true))}><SettingsRoundedIcon /><span>Settings</span></button>
                    <button className={section === 'automation' ? 'is-active' : ''} onClick={() => setSection('automation')}>
                        <AutoAwesomeIcon /><span>Automation</span><em>API</em>
                    </button>
                    <button className={section === 'tools' ? 'is-active' : ''} onClick={() => setSection('tools')}><TuneRoundedIcon /><span>Tools</span></button>
                </nav>

                <nav className="workbench__nav workbench__support-nav">
                    <a href="https://www.minidisc.wiki/guides/start" target="_blank" rel="noreferrer"><HelpOutlineRoundedIcon /><span>Help &amp; Support</span></a>
                    <button onClick={() => dispatch(appActions.showAboutDialog(true))}><InfoOutlinedIcon /><span>About</span></button>
                </nav>

                <div className="workbench__sidebar-footer">
                    <CloudDoneIcon /><span>Studio Workbench v0.1.0<small>Local first · Open source</small></span>
                </div>
            </aside>

            <main className="workbench__main">
                <header className="workbench__header">
                    <div>
                        <span className="workbench__eyebrow">CONNECTED DEVICE</span>
                        <h1>{device?.deviceName || 'MiniDisc Workspace'}</h1>
                        <small className="workbench__header-subtitle">{device ? `${device.recording.specName} Mode · ${workspace.connection.method === 'cached' ? 'USB' : workspace.connection.method || 'USB'}` : 'Connect a device to begin'}</small>
                    </div>
                    <div className="workbench__header-actions">
                        <span className={`workbench__status ${device ? 'is-online' : ''}`}><i />{device ? 'Connected' : 'Disconnected'}</span>
                        <button className="icon-button" aria-label="Refresh disc" onClick={refresh} disabled={!disc || busy}><RefreshRoundedIcon /></button>
                        <button className="workbench__eject-button" aria-label="Eject disc" onClick={eject} disabled={!disc || !canEject || busy}><EjectIcon /><span>Eject</span></button>
                        <TopMenu tracksSelected={selected?.kind === 'track' ? [selected.item.index] : []} />
                    </div>
                </header>

                <section className="workbench__disc-overview">
                    <div className="workbench__disc-icon"><AlbumIcon /></div>
                    <div className="workbench__disc-copy">
                        <span className="workbench__eyebrow">CURRENT MINIDISC</span>
                        <h2>{discLabel}</h2>
                        <p>{disc ? `${disc.trackCount} tracks on disc · ${formatDuration(tracks.reduce((sum, track) => sum + track.duration, 0))}` : 'Insert a disc to begin'}</p>
                    </div>
                    <div className="workbench__capacity">
                        <div><span>USED</span><strong>{capacityUsed}</strong></div>
                        <div><span>CAPACITY</span><strong>{capacityTotal}</strong></div>
                        <div className="workbench__capacity-meter"><i style={{ width: `${usedPercent}%` }} /></div>
                        <small>{Math.round(usedPercent)}% used · {disc ? `${measurementIsBytes ? bytesToHumanReadable(disc.left) : formatTimeFromSeconds(disc.left)} available` : 'No media'}</small>
                    </div>
                    <dl className="workbench__device-facts">
                        <div><dt>Device</dt><dd>{device?.deviceName || '—'}</dd></div>
                        <div><dt>Connection</dt><dd>{workspace.connection.phase === 'connected' ? `USB (${workspace.connection.serviceName || 'MiniDisc'})` : '—'}</dd></div>
                        <div><dt>Mode</dt><dd>{defaultFormat?.userFriendlyName || defaultFormat?.codec || '—'}</dd></div>
                        <div><dt>Disc</dt><dd>{disc?.writable ? 'Writable' : disc ? 'Read only' : '—'}</dd></div>
                    </dl>
                </section>

                {section === 'automation' ? (
                    <section className="workbench__focus-panel">
                        <AutoAwesomeIcon />
                        <div><span className="workbench__eyebrow">AUTOMATION</span><h2>Application commands are ready</h2><p>The same workspace powers this interface, the local MCP bridge and the CLI. Local bridge access remains off until you enable it in Settings.</p></div>
                        <button className="secondary-button" onClick={() => dispatch(appActions.showSettingsDialog(true))}>Open settings</button>
                    </section>
                ) : section === 'tools' ? (
                    <section className="workbench__focus-panel">
                        <TuneRoundedIcon />
                        <div><span className="workbench__eyebrow">TOOLS</span><h2>Advanced disc tools</h2><p>Use the application menu for CSV metadata, recognition, exports, diagnostics and Homebrew features.</p></div>
                        <TopMenu tracksSelected={selected?.kind === 'track' ? [selected.item.index] : []} />
                    </section>
                ) : null}

                <div className="workbench__workspace-grid">
                    <section className="workbench__plan">
                        <div className="workbench__section-heading">
                            <div><span className="workbench__eyebrow">{imports.length ? 'READY TO TRANSFER' : 'DISC CONTENTS'}</span><h2>{imports.length ? 'Recording Plan' : 'Tracks on MiniDisc'}</h2></div>
                            <div className="workbench__plan-actions">
                                <span>{planItems.length} tracks · {formatDuration(imports.length ? queuedDuration : tracks.reduce((sum, track) => sum + track.duration, 0))}</span>
                                <button className="secondary-button" onClick={open} disabled={!canUpload}><AddRoundedIcon /> Add audio</button>
                                <button className="primary-button" onClick={openWriter} disabled={!canUpload || imports.length === 0 || busy}><AlbumIcon /> Write to MiniDisc</button>
                            </div>
                        </div>

                        <div className="workbench__table" role="table" aria-label={imports.length ? 'Recording plan' : 'Disc tracks'}>
                            <div className="workbench__table-head" role="row">
                                <span>#</span><span>Title</span><span>Artist</span><span>Mode</span><span>Duration</span><span />
                            </div>
                            <div className="workbench__table-body">
                                {planItems.length === 0 ? (
                                    <div className="workbench__empty"><QueueMusicIcon /><h3>Your recording plan is empty</h3><p>Import audio to prepare titles, order and recording modes before writing the disc.</p><button className="primary-button" onClick={open} disabled={!canUpload}><FolderOpenIcon /> Choose audio files</button></div>
                                ) : planItems.map((row) => {
                                    const isSelected = row.key === selectedKey;
                                    const playing = row.kind === 'track' && device?.status.track === row.item.index && device?.status.state === 'playing';
                                    const encoding = row.kind === 'import' ? row.item.forcedEncoding ?? selectedFormat : row.item.encoding;
                                    return (
                                        <div
                                            className={`workbench__table-row ${isSelected ? 'is-selected' : ''}`}
                                            key={row.key}
                                            role="row"
                                            draggable={row.kind === 'import'}
                                            onDragStart={() => row.kind === 'import' && setDraggedId(row.item.id)}
                                            onDragOver={(event) => row.kind === 'import' && event.preventDefault()}
                                            onDrop={() => { if (row.kind === 'import' && draggedId && draggedId !== row.item.id) moveImport(draggedId, row.index); setDraggedId(null); }}
                                            onClick={() => setSelectedKey(row.key)}
                                        >
                                            <span className="workbench__track-number"><DragIndicatorIcon />{String(row.index + 1).padStart(2, '0')}</span>
                                            <span className="workbench__track-title"><strong>{row.item.title || 'Untitled track'}</strong><small>{row.kind === 'import' ? row.item.name : row.item.fullWidthTitle || discLabel}</small></span>
                                            <span>{row.item.artist || '—'}</span>
                                            <span><i className="workbench__mode-pill">{codecLabel(encoding)}</i></span>
                                            <span>{formatDuration(row.item.duration)}</span>
                                            <span className="workbench__row-actions">
                                                {row.kind === 'track' && canPlayback ? <button aria-label={playing ? 'Pause track' : 'Play track'} onClick={(event) => { event.stopPropagation(); togglePlayback(row.item); }}>{playing ? <StopRoundedIcon /> : <PlayArrowRoundedIcon />}</button> : null}
                                                {row.kind === 'import' ? <><button aria-label="Move track up" onClick={(event) => { event.stopPropagation(); moveImport(row.item.id, row.index - 1); }}><KeyboardArrowUpRoundedIcon /></button><button aria-label="Move track down" onClick={(event) => { event.stopPropagation(); moveImport(row.item.id, row.index + 1); }}><KeyboardArrowDownRoundedIcon /></button></> : null}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>

                    <aside className="workbench__inspector">
                        <div className="workbench__inspector-heading"><div><span className="workbench__eyebrow">INSPECTOR</span><h2>{selected ? `Track ${selected.index + 1}` : 'No selection'}</h2></div><MoreHorizIcon /></div>
                        <label>Title<input value={draft.title} disabled={!selected} onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))} /></label>
                        <label>Artist<input value={draft.artist} disabled={!selected} onChange={(event) => setDraft((value) => ({ ...value, artist: event.target.value }))} /></label>
                        <label>Album<input value={draft.album} disabled={!selected} onChange={(event) => setDraft((value) => ({ ...value, album: event.target.value }))} /></label>
                        {device?.recording.titleStorage === 'netmd-toc' ? <label>Full-width title<input value={draft.fullWidthTitle} disabled={!selected} onChange={(event) => setDraft((value) => ({ ...value, fullWidthTitle: event.target.value }))} /></label> : null}
                        <button className="secondary-button workbench__save" onClick={saveInspector} disabled={!selected || busy}><CheckCircleIcon /> Apply metadata</button>
                        <div className="workbench__divider" />
                        <label>Recording mode
                            <select
                                value={`${formatIndex[0]}:${formatIndex[1]}`}
                                disabled={!device}
                                onChange={(event) => {
                                    const [format, bitrate] = event.target.value.split(':').map(Number);
                                    setFormatIndex([format, bitrate]);
                                }}
                            >
                                {device?.recording.availableFormats.flatMap((format, formatPosition) =>
                                    format.availableBitrates.map((bitrate, bitratePosition) => (
                                        <option value={`${formatPosition}:${bitratePosition}`} key={`${format.codec}:${bitrate}`}>{format.userFriendlyName || codecLabel({ codec: format.codec, bitrate })}</option>
                                    ))
                                )}
                            </select>
                        </label>
                        <div className="workbench__format-note"><BoltRoundedIcon /><span><strong>{selectedFormat?.codec || defaultFormat?.codec || 'Automatic'}</strong><small>{selectedFormat ? `${selectedFormat.bitrate} kbps recording` : 'Uses the device default'}</small></span></div>
                        <div className="workbench__divider" />
                        <button className="danger-button" onClick={removeSelected} disabled={!selected || busy}><DeleteOutlineIcon /> {selected?.kind === 'track' ? 'Delete from disc' : 'Remove from plan'}</button>
                    </aside>
                </div>

                <footer className="workbench__footer">
                    <div className="workbench__task-status">
                        {activeTask ? <><span className="workbench__task-spinner" /><div><strong>{activeTask.label}</strong><small>{activeTask.phase} · {Math.round(taskPercent)}%</small></div></> : <><CheckCircleIcon /><div><strong>Ready</strong><small>{imports.length ? `${imports.length} tracks prepared` : 'No pending transfer'}</small></div></>}
                    </div>
                    <div className="workbench__footer-meter"><span><i style={{ width: `${activeTask ? taskPercent : usedPercent}%` }} /></span><small>{activeTask ? `${Math.round(taskPercent)}% complete` : `${capacityUsed} of ${capacityTotal} used`}</small></div>
                </footer>
            </main>

            {isDragActive ? <div className="workbench__drop-overlay"><FolderOpenIcon /><strong>Drop audio to add it to the recording plan</strong></div> : null}
            {message ? <button className="workbench__toast" onClick={() => setMessage(null)}>{message}</button> : null}

            <DiscProtectedDialog />
            <UploadDialog />
            <RenameDialog />
            <ErrorDialog />
            <ConvertDialog files={uploadedFiles} />
            <RecordDialog />
            <FactoryModeProgressDialog />
            <FactoryModeBadSectorDialog />
            <DumpDialog trackIndexes={selected?.kind === 'track' ? [selected.item.index] : []} isCapableOfDownload={canDownload} isExploitDownload={false} />
            <SongRecognitionDialog />
            <SongRecognitionProgressDialog />
            <FactoryModeNoticeDialog />
            <AboutDialog />
            <ChangelogDialog />
            <SettingsDialog />
            <LocalLibraryDialog setUploadedFiles={setUploadedFiles} />
            <PanicDialog />
        </div>
    );
};

export default Workbench;
