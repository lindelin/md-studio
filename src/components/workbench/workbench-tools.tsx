import React, { useRef, useState } from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import BugReportRoundedIcon from '@mui/icons-material/BugReportRounded';
import DataObjectRoundedIcon from '@mui/icons-material/DataObjectRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import MemoryRoundedIcon from '@mui/icons-material/MemoryRounded';
import SaveAltRoundedIcon from '@mui/icons-material/SaveAltRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import type { MetadataImportPlan } from '../../domain/metadata-import';
import type { AdvancedDeviceInfo } from '../../application/contracts';
import { downloadBlob, formatTimeFromSeconds } from '../../utils';
import { useApplicationClient, useApplicationWorkspace } from '../use-application-client';
import { buildAdvancedExportFileName, defaultMetadataTrackSelection, getSelfTestReadiness } from './workbench-model';

function decodeBase64(data: string) {
    const binary = atob(data);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export const WorkbenchTools = ({
    onMessage,
    onTaskStarted,
}: {
    onMessage(message: string): void;
    onTaskStarted(id: string, message: string): void;
}) => {
    const client = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const device = workspace.device;
    const disc = device?.disc;
    const capabilities = device?.capabilities ?? [];
    const fileInput = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [sourceName, setSourceName] = useState('');
    const [sourceText, setSourceText] = useState('');
    const [plan, setPlan] = useState<MetadataImportPlan | null>(null);
    const [plannedRevision, setPlannedRevision] = useState<number | undefined>();
    const [includedTrackIndexes, setIncludedTrackIndexes] = useState<number[]>([]);
    const [advancedInfo, setAdvancedInfo] = useState<AdvancedDeviceInfo | null>(null);
    const [tocSummary, setTocSummary] = useState<{ bytes: number; sha256: string } | null>(null);
    const [selfTestOpen, setSelfTestOpen] = useState(false);
    const [selfTestConfirmation, setSelfTestConfirmation] = useState('');

    const canImportMetadata =
        Boolean(disc?.writable) &&
        capabilities.includes('disc.rename') &&
        (capabilities.includes('track.rename') || capabilities.includes('metadata.himd')) &&
        capabilities.includes('group.rename') &&
        capabilities.includes('group.create') &&
        capabilities.includes('group.delete');
    const selfTestReadiness = getSelfTestReadiness(device ?? undefined);

    const closeSelfTest = () => {
        if (busy) return;
        setSelfTestOpen(false);
        setSelfTestConfirmation('');
    };

    const exportCsv = async () => {
        setBusy(true);
        setStatus('Preparing metadata export…');
        try {
            const result = await client.execute({ type: 'metadata.exportCsv' });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.metadataCsv) throw new Error('Metadata export did not return a CSV document.');
            downloadBlob(
                new Blob([result.metadataCsv.text], { type: 'text/csv;charset=utf-8' }),
                result.metadataCsv.fileName
            );
            setStatus(null);
            onMessage(`Saved ${result.metadataCsv.fileName}.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Could not export disc metadata.');
        } finally {
            setBusy(false);
        }
    };

    const chooseCsv = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !device) return;
        const expectedRevision = device.revision;
        setBusy(true);
        setStatus(`Checking ${file.name}…`);
        setPlan(null);
        try {
            const text = await file.text();
            const result = await client.execute({ type: 'metadata.planCsv', text });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.metadataPlan) throw new Error('Metadata import did not return a validation plan.');
            setSourceName(file.name);
            setSourceText(text);
            setPlan(result.metadataPlan);
            setPlannedRevision(expectedRevision);
            setIncludedTrackIndexes(defaultMetadataTrackSelection(result.metadataPlan));
            setStatus(null);
        } catch (error) {
            setSourceName(file.name);
            setSourceText('');
            setPlannedRevision(undefined);
            setIncludedTrackIndexes([]);
            setStatus(error instanceof Error ? error.message : 'Could not read the metadata file.');
        } finally {
            setBusy(false);
        }
    };

    const toggleTrack = (index: number) => {
        setIncludedTrackIndexes((current) =>
            current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort((a, b) => a - b)
        );
    };

    const applyCsv = async () => {
        if (!plan || !sourceText || plannedRevision === undefined) return;
        setBusy(true);
        setStatus('Applying reviewed metadata…');
        try {
            const result = await client.execute({
                type: 'metadata.applyCsv',
                text: sourceText,
                includedTrackIndexes,
                expectedRevision: plannedRevision,
            });
            if (!result.ok) throw new Error(result.error.message);
            setPlan(null);
            setSourceName('');
            setSourceText('');
            setIncludedTrackIndexes([]);
            setPlannedRevision(undefined);
            setStatus(null);
            onMessage(`Applied disc metadata and ${includedTrackIndexes.length} reviewed track update${includedTrackIndexes.length === 1 ? '' : 's'}.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Could not apply the metadata file.');
        } finally {
            setBusy(false);
        }
    };

    const inspectDevice = async () => {
        setBusy(true);
        setStatus('Reading device firmware and advanced capabilities…');
        try {
            const result = await client.execute({ type: 'advanced.inspect' });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedInfo) throw new Error('The device did not return advanced information.');
            setAdvancedInfo(result.advancedInfo);
            setStatus(null);
        } catch (error) {
            setAdvancedInfo(null);
            setStatus(error instanceof Error ? error.message : 'Could not inspect the device.');
        } finally {
            setBusy(false);
        }
    };

    const startSelfTest = async () => {
        if (selfTestConfirmation !== 'ERASE') return;
        setBusy(true);
        setStatus('Starting the destructive device self-test…');
        try {
            const result = await client.execute({
                type: 'diagnostics.selfTest',
                confirmation: {
                    confirmed: true,
                    reason: 'Confirmed in Studio Workbench after reviewing that the self-test erases the entire disc.',
                },
            });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.task) throw new Error('The device self-test did not return a task.');
            setSelfTestOpen(false);
            setSelfTestConfirmation('');
            setStatus(null);
            onTaskStarted(result.task.id, 'Device self-test started. The test disc will be erased if all steps complete.');
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Could not start the device self-test.');
        } finally {
            setBusy(false);
        }
    };

    const exportRawToc = async () => {
        if (!device || !disc) return;
        setBusy(true);
        setStatus('Reading six raw TOC sectors…');
        try {
            const result = await client.execute({ type: 'advanced.readToc' });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedToc) throw new Error('The device did not return a raw TOC backup.');
            const data = decodeBase64(result.advancedToc.dataBase64);
            const fileName = buildAdvancedExportFileName('toc', disc.title || device.deviceName);
            downloadBlob(new Blob([data], { type: 'application/octet-stream' }), fileName);
            setTocSummary({ bytes: result.advancedToc.byteLength, sha256: result.advancedToc.sha256 });
            setStatus(null);
            onMessage(`Saved ${fileName} with SHA-256 ${result.advancedToc.sha256.slice(0, 12)}….`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : 'Could not export the raw TOC.');
        } finally {
            setBusy(false);
        }
    };

    const exportAdvancedMemory = async (kind: 'ram' | 'firmware') => {
        if (!device) return;
        setBusy(true);
        setStatus(`Starting ${kind === 'ram' ? 'RAM' : 'firmware'} export…`);
        try {
            const task = await client.startLocalAdvancedMemoryExport(kind, (region, data) => {
                const prefix = region === 'ROM' ? 'firmware' : region.toLowerCase();
                const fileName = buildAdvancedExportFileName(prefix, device.deviceName, advancedInfo?.firmwareVersion);
                downloadBlob(new Blob([new Uint8Array(data)], { type: 'application/octet-stream' }), fileName);
            });
            setStatus(null);
            onTaskStarted(task.id, `${kind === 'ram' ? 'RAM' : 'Firmware'} export started. Keep the device connected until every region is saved.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : `Could not start the ${kind} export.`);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="workbench__tools">
            <header>
                <div><span className="workbench__eyebrow">TOOLS</span><h2>Disc and device tools</h2><p>Back up metadata and low-level device information before making maintenance changes.</p></div>
            </header>

            <div className="workbench__tools-grid">
                <article className="workbench__tool-card">
                    <DownloadRoundedIcon />
                    <div><h3>Export metadata</h3><p>Save the disc title, track titles, full-width titles, Hi-MD fields, encoding details and group ranges.</p></div>
                    <button className="secondary-button" onClick={() => void exportCsv()} disabled={!disc || busy}><DownloadRoundedIcon /> Export CSV</button>
                </article>
                <article className="workbench__tool-card">
                    <UploadFileRoundedIcon />
                    <div><h3>Import metadata</h3><p>Choose a CSV to compare it with the inserted disc. Nothing is written until you review and apply the plan.</p></div>
                    <button className="secondary-button" onClick={() => fileInput.current?.click()} disabled={!canImportMetadata || busy}><UploadFileRoundedIcon /> Choose CSV</button>
                    <input ref={fileInput} type="file" accept=".csv,text/csv" hidden onChange={(event) => void chooseCsv(event)} />
                </article>
                <article className="workbench__tool-card">
                    <MemoryRoundedIcon />
                    <div><h3>Device information</h3><p>Read the firmware version and supported Homebrew capabilities without changing disc content.</p></div>
                    <button className="secondary-button" onClick={() => void inspectDevice()} disabled={!capabilities.includes('advanced.factory') || busy}><MemoryRoundedIcon /> Inspect device</button>
                </article>
                <article className="workbench__tool-card">
                    <DataObjectRoundedIcon />
                    <div><h3>Raw TOC backup</h3><p>Save all six 2,352-byte TOC sectors with a SHA-256 checksum. This is read-only.</p>{tocSummary ? <small>{tocSummary.bytes.toLocaleString()} bytes · SHA-256 {tocSummary.sha256.slice(0, 16)}…</small> : null}</div>
                    <button className="secondary-button" onClick={() => void exportRawToc()} disabled={!disc || !capabilities.includes('advanced.factory') || busy}><SaveAltRoundedIcon /> Export TOC</button>
                </article>
                <article className="workbench__tool-card">
                    <SaveAltRoundedIcon />
                    <div><h3>Device memory backup</h3><p>Export supported RAM and firmware regions through an observable background task.</p><small>{advancedInfo ? 'Availability is based on the inspected firmware.' : 'Inspect the device first to discover supported readers.'}</small></div>
                    <div className="workbench__tool-actions">
                        <button className="secondary-button" onClick={() => void exportAdvancedMemory('ram')} disabled={!advancedInfo?.capabilities.includes('readRam') || busy}>RAM</button>
                        <button className="secondary-button" onClick={() => void exportAdvancedMemory('firmware')} disabled={!advancedInfo?.capabilities.includes('readFirmware') || busy}>Firmware</button>
                    </div>
                </article>
                <article className="workbench__tool-card is-danger">
                    <BugReportRoundedIcon />
                    <div><h3>Destructive device self-test</h3><p>Verify titles, ordering, playback, deletion and erase behavior. The inserted disc will be emptied.</p><small>{selfTestReadiness.reason}</small></div>
                    <button className="danger-button" onClick={() => setSelfTestOpen(true)} disabled={!selfTestReadiness.ready || busy}><BugReportRoundedIcon /> Review self-test</button>
                </article>
            </div>

            {advancedInfo ? (
                <section className="workbench__device-inspection">
                    <div><span className="workbench__eyebrow">DEVICE INSPECTION</span><h3>{advancedInfo.firmwareVersion || 'Unknown firmware'}</h3></div>
                    <div>{advancedInfo.capabilities.length > 0 ? advancedInfo.capabilities.map((capability) => <span key={capability}>{capability}</span>) : <span>No advanced capabilities reported</span>}</div>
                </section>
            ) : null}

            {!disc ? <div className="workbench__tools-empty"><TuneRoundedIcon /><strong>Connect a device and insert a disc to use metadata tools.</strong></div> : null}
            {disc && !canImportMetadata ? <div className="workbench__tools-warning"><WarningAmberRoundedIcon /><span>This disc or device does not support the complete title and group import workflow. Export remains available.</span></div> : null}
            {status ? <div className="workbench__tools-warning"><WarningAmberRoundedIcon /><span>{status}</span></div> : null}

            {plan ? (
                <section className="workbench__metadata-review" aria-label="Metadata import review">
                    <header>
                        <div><span className="workbench__eyebrow">IMPORT REVIEW</span><h3>{sourceName}</h3><p>The disc title is always applied. Select only tracks whose title and group information should be replaced.</p></div>
                        <span className={plan.trackCountMatches ? 'is-compatible' : 'is-warning'}>{plan.trackCountMatches ? <CheckCircleRoundedIcon /> : <WarningAmberRoundedIcon />}{plan.expectedTrackCount} file tracks · {plan.disc.trackCount} disc tracks</span>
                    </header>
                    <dl className="workbench__metadata-summary">
                        <div><dt>Current disc title</dt><dd>{plan.disc.title || plan.disc.fullWidthTitle || 'Untitled'}</dd></div>
                        <div><dt>New disc title</dt><dd>{plan.discTitle.title || plan.discTitle.fullWidthTitle || 'Untitled'}</dd></div>
                        <div><dt>Compatible tracks</dt><dd>{plan.tracks.filter((track) => track.actual && track.matchesDisc).length}</dd></div>
                        <div><dt>Needs review</dt><dd>{plan.tracks.filter((track) => track.actual && !track.matchesDisc).length}</dd></div>
                    </dl>
                    {!plan.trackCountMatches ? <div className="workbench__tools-warning"><WarningAmberRoundedIcon /><span>The file and current disc have different track counts. Missing tracks cannot be selected.</span></div> : null}
                    <div className="workbench__metadata-actions">
                        <button className="secondary-button" onClick={() => setIncludedTrackIndexes(defaultMetadataTrackSelection(plan))}>Select compatible</button>
                        <button className="secondary-button" onClick={() => setIncludedTrackIndexes([])}>Clear tracks</button>
                        <span>{includedTrackIndexes.length} selected</span>
                    </div>
                    <div className="workbench__metadata-list">
                        <div className="workbench__metadata-list-head"><span /><span>Track from file</span><span>Current disc</span><span>Result</span></div>
                        {plan.tracks.map((track) => {
                            const selected = includedTrackIndexes.includes(track.trackIndex);
                            const actual = track.actual;
                            return (
                                <label className={`workbench__metadata-row ${!actual || !track.matchesDisc ? 'has-warning' : ''}`} key={`${track.line}:${track.trackIndex}`}>
                                    <input type="checkbox" checked={selected} disabled={!actual || busy} onChange={() => toggleTrack(track.trackIndex)} />
                                    <span><b>{track.index}. {track.title || 'Untitled'}</b><small>{formatTimeFromSeconds(track.duration)} · {track.codec}{track.bitrate ? ` ${track.bitrate} kbps` : ''}{track.groupName ? ` · ${track.groupName}` : ''}</small></span>
                                    <span>{actual ? <><b>{actual.index + 1}. {actual.title || 'Untitled'}</b><small>{formatTimeFromSeconds(actual.duration)} · {actual.encoding.codec}{actual.encoding.bitrate ? ` ${actual.encoding.bitrate} kbps` : ''}</small></> : <><b>Missing</b><small>No matching track on this disc</small></>}</span>
                                    <span className={track.matchesDisc ? 'is-compatible' : 'is-warning'}>{track.matchesDisc ? <><CheckCircleRoundedIcon /> Compatible</> : <><WarningAmberRoundedIcon /> Review</>}</span>
                                </label>
                            );
                        })}
                    </div>
                    <footer>
                        <button className="secondary-button" onClick={() => { setPlan(null); setSourceText(''); setSourceName(''); }} disabled={busy}>Discard</button>
                        <button className="primary-button" onClick={() => void applyCsv()} disabled={busy || !canImportMetadata}>Apply reviewed metadata</button>
                    </footer>
                </section>
            ) : null}

            {selfTestOpen ? (
                <div className="workbench__modal-backdrop" role="presentation" onMouseDown={closeSelfTest}>
                    <section className="workbench__modal workbench__self-test-modal" role="dialog" aria-modal="true" aria-labelledby="workbench-self-test-title" onMouseDown={(event) => event.stopPropagation()}>
                        <span className="workbench__eyebrow">DESTRUCTIVE DIAGNOSTIC</span>
                        <h2 id="workbench-self-test-title">Erase this disc and run 14 device checks?</h2>
                        <p>The test renames the disc and its first two tracks, changes full-width titles, moves tracks, tests playback controls, deletes a track, then erases the entire disc.</p>
                        <div className="workbench__write-warning">Every track currently on “{disc?.title || 'Untitled MiniDisc'}” will be permanently deleted. Use only a disposable test disc.</div>
                        <label>Type ERASE to enable the test<input autoFocus value={selfTestConfirmation} onChange={(event) => setSelfTestConfirmation(event.target.value)} /></label>
                        <div className="workbench__modal-actions">
                            <button className="secondary-button" onClick={closeSelfTest} disabled={busy}>Cancel</button>
                            <button className="danger-button" onClick={() => void startSelfTest()} disabled={busy || selfTestConfirmation !== 'ERASE'}>Erase disc and run test</button>
                        </div>
                    </section>
                </div>
            ) : null}
        </section>
    );
};
