import React, { useRef, useState } from 'react';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import type { MetadataImportPlan } from '../../domain/metadata-import';
import { downloadBlob, formatTimeFromSeconds } from '../../utils';
import { useApplicationClient, useApplicationWorkspace } from '../use-application-client';
import { defaultMetadataTrackSelection } from './workbench-model';

export const WorkbenchTools = ({ onMessage }: { onMessage(message: string): void }) => {
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

    const canImportMetadata =
        Boolean(disc?.writable) &&
        capabilities.includes('disc.rename') &&
        (capabilities.includes('track.rename') || capabilities.includes('metadata.himd')) &&
        capabilities.includes('group.rename') &&
        capabilities.includes('group.create') &&
        capabilities.includes('group.delete');

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

    return (
        <section className="workbench__tools">
            <header>
                <div><span className="workbench__eyebrow">TOOLS</span><h2>Disc metadata</h2><p>Export a restorable CSV, or validate every row before changing titles and groups.</p></div>
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
            </div>

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
        </section>
    );
};
