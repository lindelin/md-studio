import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModeFlag, getTitleByTrackNumber, type DiscAddress, type ToC } from 'netmd-tocmanip';
import type { AdvancedTocWritePreview } from '../../application/contracts';
import { INTERACTIVE_ADVANCED_AUTHORIZATION } from '../../application/interactive-authorization';
import {
    assertRawTocInteger,
    cloneRawToc,
    escapeRawTocCell,
    getRawTocMap,
    linkedRawTocContentIndices,
    parseEscapedRawTocCell,
    parseRawTocEditorData,
    rawTocEditorTabs,
    reconstructRawTocEditorData,
    type RawTocEditorTab,
} from '../../domain/raw-toc-editor';
import { useApplicationClient, useApplicationWorkspace } from '../use-application-client';
import { useI18n } from '../use-i18n';
import { inspectRawTocData } from './workbench-raw-toc';
import './workbench.css';

const EDITED_TOC_CONFIRMATION = 'WRITE EDITED TOC';

interface LoadedToc {
    source: Uint8Array;
    draft: ToC;
    expectedSessionId: string;
    expectedRevision: number;
}

interface TocReview {
    dataBase64: string;
    preview: AdvancedTocWritePreview;
    expectedSessionId: string;
    expectedRevision: number;
}

const modeFlags = [
    [ModeFlag.F_EMPHASIS, 'Emphasis'],
    [ModeFlag.F_STEREO, 'Stereo / LP2'],
    [ModeFlag.F_SP_MODE, 'SP mode'],
    [ModeFlag.F_CODECMODE_RESERVED, 'Reserved codec bit'],
    [ModeFlag.F_AUDIO, 'Audio'],
    [ModeFlag.F_SCMS_DIG_COPY, 'SCMS digital copy'],
    [ModeFlag.F_SCMS_UNRESTRICTED, 'SCMS unrestricted'],
    [ModeFlag.F_WRITABLE, 'Writable'],
] as const;

export function WorkbenchTocEditor({
    open,
    embedded = false,
    writeEnabled = true,
    writeDisabledReason = 'This device cannot write raw TOC sectors.',
    onClose,
    onMessage,
}: {
    open: boolean;
    embedded?: boolean;
    writeEnabled?: boolean;
    writeDisabledReason?: string;
    onClose(): void;
    onMessage(message: string): void;
}) {
    const client = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const { language, t } = useI18n();
    const [loaded, setLoaded] = useState<LoadedToc | null>(null);
    const [tab, setTab] = useState<RawTocEditorTab>('position');
    const [selection, setSelection] = useState<{ kind: 'map' | 'content'; index: number }>({ kind: 'map', index: 0 });
    const [modified, setModified] = useState(false);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [discardAction, setDiscardAction] = useState<'close' | 'reload' | null>(null);
    const [review, setReview] = useState<TocReview | null>(null);
    const [confirmation, setConfirmation] = useState('');
    const backupInput = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        const device = client.getWorkspaceSnapshot().device;
        if (!device) {
            setStatus(t('Connect a device and insert a disc before opening the TOC editor.'));
            return;
        }
        setBusy(true);
        setStatus(t('Reading all six raw TOC sectors…'));
        try {
            const result = await client.execute({ type: 'advanced.readToc' });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedToc) throw new Error(t('The device did not return raw TOC data.'));
            const document = parseRawTocEditorData(decodeBase64(result.advancedToc.dataBase64));
            const latest = client.getWorkspaceSnapshot().device;
            if (latest?.sessionId !== device.sessionId || latest.revision !== device.revision) {
                throw new Error(t('The device or disc changed while the TOC was being read. Reload the editor.'));
            }
            setLoaded({
                source: document.source,
                draft: document.toc,
                expectedSessionId: device.sessionId,
                expectedRevision: device.revision,
            });
            setModified(false);
            setSelection({ kind: 'map', index: 0 });
            setStatus(null);
        } catch (error) {
            setLoaded(null);
            setStatus(error instanceof Error ? error.message : t('Could not read the raw TOC.'));
        } finally {
            setBusy(false);
        }
    }, [client, t]);

    useEffect(() => {
        if (!open) {
            setLoaded(null);
            setModified(false);
            setStatus(null);
            setDiscardAction(null);
            setReview(null);
            setConfirmation('');
            return;
        }
        void load();
    }, [open, load]);

    const updateDraft = useCallback((update: (toc: ToC) => void) => {
        setLoaded((current) => {
            if (!current) return current;
            const draft = cloneRawToc(current.draft);
            update(draft);
            return { ...current, draft };
        });
        setModified(true);
        setReview(null);
        setConfirmation('');
    }, []);

    const requestClose = () => {
        if (busy) return;
        if (modified) setDiscardAction('close');
        else onClose();
    };

    const requestReload = () => {
        if (busy) return;
        if (modified) setDiscardAction('reload');
        else void load();
    };

    const loadBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file || !loaded) return;
        setBusy(true);
        setStatus(language === 'zh-CN' ? `正在将 ${file.name} 载入为本地草稿…` : `Loading ${file.name} as a local draft…`);
        try {
            const document = parseRawTocEditorData(new Uint8Array(await file.arrayBuffer()));
            const latest = client.getWorkspaceSnapshot().device;
            if (latest?.sessionId !== loaded.expectedSessionId || latest.revision !== loaded.expectedRevision) {
                throw new Error(t('The device or disc changed after this editor was loaded. Reload before importing a backup.'));
            }
            setLoaded({ ...loaded, draft: document.toc });
            setModified(true);
            setReview(null);
            setConfirmation('');
            setSelection({ kind: 'map', index: 0 });
            setStatus(null);
            onMessage(language === 'zh-CN'
                ? `已将 ${file.name} 载入为本地 TOC 草稿，碟片尚未改变。`
                : `Loaded ${file.name} as a local TOC draft. The disc has not been changed.`);
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not load the TOC backup.'));
        } finally {
            setBusy(false);
        }
    };

    const discard = () => {
        const action = discardAction;
        setDiscardAction(null);
        if (action === 'close') onClose();
        if (action === 'reload') void load();
    };

    const reviewChanges = async () => {
        if (!loaded || !modified) return;
        const latest = client.getWorkspaceSnapshot().device;
        if (latest?.sessionId !== loaded.expectedSessionId || latest.revision !== loaded.expectedRevision) {
            setStatus(t('The device or disc changed after this draft was loaded. Reload before reviewing it.'));
            return;
        }
        setBusy(true);
        setStatus(t('Comparing the edited TOC with the current disc…'));
        try {
            const proposed = reconstructRawTocEditorData(loaded.draft, loaded.source);
            const source = await inspectRawTocData(proposed);
            const result = await client.execute({ type: 'advanced.previewTocWrite', dataBase64: source.dataBase64 });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.advancedTocWritePreview) throw new Error(t('The device did not return a TOC write preview.'));
            const current = client.getWorkspaceSnapshot().device;
            if (current?.sessionId !== loaded.expectedSessionId || current.revision !== loaded.expectedRevision) {
                throw new Error(t('The device or disc changed while the draft was being compared. Reload the editor.'));
            }
            setReview({
                dataBase64: source.dataBase64,
                preview: result.advancedTocWritePreview,
                expectedSessionId: loaded.expectedSessionId,
                expectedRevision: loaded.expectedRevision,
            });
            setConfirmation('');
            setStatus(null);
        } catch (error) {
            setReview(null);
            setStatus(error instanceof Error ? error.message : t('Could not review the edited TOC.'));
        } finally {
            setBusy(false);
        }
    };

    const writeChanges = async () => {
        if (!review || confirmation !== EDITED_TOC_CONFIRMATION) return;
        const latest = client.getWorkspaceSnapshot().device;
        if (latest?.sessionId !== review.expectedSessionId || latest.revision !== review.expectedRevision) {
            setReview(null);
            setConfirmation('');
            setStatus(t('The device or disc changed after this write was reviewed. Reload the editor.'));
            return;
        }
        setBusy(true);
        setStatus(t('Writing the four reviewed UTOC sectors…'));
        try {
            const result = await client.execute({
                type: 'advanced.writeToc',
                dataBase64: review.dataBase64,
                confirmation: {
                    confirmed: true,
                    reason: 'Confirmed in the visual TOC editor after reviewing exact checksums and changed sectors.',
                },
                expectedRevision: review.expectedRevision,
                expectedCurrentTocSha256: review.preview.currentSha256,
                interactiveAuthorization: INTERACTIVE_ADVANCED_AUTHORIZATION,
            });
            if (!result.ok) throw new Error(result.error.message);
            if (!result.snapshot) throw new Error(t('Writing the TOC did not return refreshed device state.'));
            setReview(null);
            setConfirmation('');
            setModified(false);
            onMessage(t('Wrote the reviewed visual TOC draft and refreshed the disc.'));
            onClose();
        } catch (error) {
            setStatus(error instanceof Error ? error.message : t('Could not write the edited TOC.'));
        } finally {
            setBusy(false);
        }
    };

    const draft = loaded?.draft;
    const map = draft ? getRawTocMap(draft, tab) : [];
    const linked = useMemo(
        () => (draft && selection.kind === 'map' ? linkedRawTocContentIndices(draft, tab, selection.index) : []),
        [draft, selection, tab]
    );

    if (!open) return null;

    return (
        <div
            className={`workbench__modal-backdrop workbench__toc-editor-backdrop ${embedded ? 'is-embedded' : ''}`}
            role="presentation"
            onMouseDown={embedded ? undefined : requestClose}
        >
            <section
                className="workbench__modal workbench__toc-editor"
                role="dialog"
                aria-modal={embedded ? undefined : true}
                aria-labelledby="workbench-toc-editor-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <header className="workbench__toc-editor-header">
                    <div>
                        <span className="workbench__eyebrow">{t('VISUAL RAW TOC EDITOR')}</span>
                        <h2 id="workbench-toc-editor-title">{workspace.device?.disc?.title || t('Inserted MiniDisc')}</h2>
                        <p>{t('Edit a local draft of sectors 0–3. Reference sectors 4–5 are preserved byte for byte.')}</p>
                    </div>
                    <div className="workbench__toc-editor-actions">
                        <button className="secondary-button" onClick={() => backupInput.current?.click()} disabled={busy || !loaded}>
                            {t('Load backup')}
                        </button>
                        <input
                            ref={backupInput}
                            type="file"
                            accept=".bin,application/octet-stream"
                            hidden
                            onChange={(event) => void loadBackup(event)}
                        />
                        <button className="secondary-button" onClick={requestReload} disabled={busy}>
                            {t('Reload disc')}
                        </button>
                        <button className="secondary-button" onClick={requestClose} disabled={busy}>
                            {t('Close')}
                        </button>
                    </div>
                </header>

                {status ? (
                    <div className="workbench__tools-warning">
                        <span>{status}</span>
                    </div>
                ) : null}
                {busy && !draft ? (
                    <div className="workbench__write-pending">
                        <i /> {t('Reading raw TOC…')}
                    </div>
                ) : null}

                {draft ? (
                    <>
                        <TocHeaderEditor toc={draft} updateDraft={updateDraft} />
                        <nav className="workbench__toc-tabs" aria-label={t('TOC sectors')}>
                            {rawTocEditorTabs.map((item) => (
                                <button
                                    className={tab === item.id ? 'is-active' : ''}
                                    key={item.id}
                                    onClick={() => {
                                        setTab(item.id);
                                        setSelection({ kind: 'map', index: 0 });
                                    }}
                                >
                                    {t(item.label)}
                                </button>
                            ))}
                        </nav>

                        <div className="workbench__toc-editor-body">
                            <div className="workbench__toc-tables">
                                <TocGrid
                                    label={t(rawTocEditorTabs.find((item) => item.id === tab)?.mapLabel ?? 'Map')}
                                    selected={selection.kind === 'map' ? selection.index : -1}
                                    values={map}
                                    statusForIndex={(index) => (map[index] === 0 ? '·' : map[index].toString(16).padStart(2, '0'))}
                                    onSelect={(index) => setSelection({ kind: 'map', index })}
                                />
                                <TocGrid
                                    label={t(rawTocEditorTabs.find((item) => item.id === tab)?.contentLabel ?? 'Contents')}
                                    selected={selection.kind === 'content' ? selection.index : -1}
                                    highlighted={linked}
                                    values={Array.from({ length: 256 }, (_, index) => index)}
                                    statusForIndex={(index) => contentMarker(draft, tab, index)}
                                    onSelect={(index) => setSelection({ kind: 'content', index })}
                                />
                            </div>
                            <TocSelectionEditor
                                key={`${tab}:${selection.kind}:${selection.index}`}
                                toc={draft}
                                tab={tab}
                                selection={selection}
                                linked={linked}
                                updateDraft={updateDraft}
                            />
                        </div>

                        <footer className="workbench__toc-editor-footer">
                            <span>{!writeEnabled ? writeDisabledReason : t(modified ? 'Unsaved local draft' : 'Draft matches the loaded TOC')}</span>
                            <button className="danger-button" onClick={() => void reviewChanges()} disabled={busy || !modified || !writeEnabled}>
                                {t(busy ? 'Checking…' : 'Review write')}
                            </button>
                        </footer>
                    </>
                ) : null}
            </section>

            {discardAction ? (
                <div
                    className="workbench__modal-backdrop workbench__toc-editor-confirm"
                    role="presentation"
                    onMouseDown={() => setDiscardAction(null)}
                >
                    <section
                        className="workbench__modal"
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby="toc-discard-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <span className="workbench__eyebrow">{t('UNSAVED DRAFT')}</span>
                        <h2 id="toc-discard-title">{t('Discard the visual TOC edits?')}</h2>
                        <p>{t('The local draft has not been written. Discarding it does not change the disc.')}</p>
                        <div className="workbench__modal-actions">
                            <button className="secondary-button" onClick={() => setDiscardAction(null)}>
                                {t('Keep editing')}
                            </button>
                            <button className="danger-button" onClick={discard}>
                                {t('Discard draft')}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}

            {review ? (
                <div
                    className="workbench__modal-backdrop workbench__toc-editor-confirm"
                    role="presentation"
                    onMouseDown={() => !busy && setReview(null)}
                >
                    <section
                        className="workbench__modal workbench__maintenance-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="toc-editor-review-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <span className="workbench__eyebrow">{t('VISUAL TOC WRITE REVIEW')}</span>
                        <h2 id="toc-editor-review-title">{t('Write this edited TOC?')}</h2>
                        <dl className="workbench__review-grid">
                            <div>
                                <dt>{t('Current disc SHA-256')}</dt>
                                <dd>{review.preview.currentSha256}</dd>
                            </div>
                            <div>
                                <dt>{t('Edited TOC SHA-256')}</dt>
                                <dd>{review.preview.proposedSha256}</dd>
                            </div>
                            <div>
                                <dt>{t('Current writable sectors')}</dt>
                                <dd>{review.preview.currentWritableSha256}</dd>
                            </div>
                            <div>
                                <dt>{t('Edited writable sectors')}</dt>
                                <dd>{review.preview.proposedWritableSha256}</dd>
                            </div>
                            <div>
                                <dt>{t('Writable bytes changed')}</dt>
                                <dd>{review.preview.changedWritableBytes.toLocaleString()}</dd>
                            </div>
                            <div>
                                <dt>{t('Writable sectors changed')}</dt>
                                <dd>{review.preview.changedWritableSectors.join(', ') || t('None')}</dd>
                            </div>
                        </dl>
                        <div className="workbench__write-warning">
                            {t('A malformed TOC can make every track unreadable. Keep USB and device power stable until the disc refresh finishes.')}
                        </div>
                        {review.preview.changedWritableBytes === 0 ? (
                            <div className="workbench__tools-empty">{t('The writable sectors already match. No write is needed.')}</div>
                        ) : (
                            <label>
                                {language === 'zh-CN' ? `输入 ${EDITED_TOC_CONFIRMATION} 以继续` : `Type ${EDITED_TOC_CONFIRMATION} to continue`}
                                <input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
                            </label>
                        )}
                        <div className="workbench__modal-actions">
                            <button className="secondary-button" onClick={() => setReview(null)} disabled={busy}>
                                {t('Cancel')}
                            </button>
                            <button
                                className="danger-button"
                                onClick={() => void writeChanges()}
                                disabled={busy || review.preview.changedWritableBytes === 0 || confirmation !== EDITED_TOC_CONFIRMATION}
                            >
                                {t(busy ? 'Writing…' : 'Write reviewed TOC')}
                            </button>
                        </div>
                    </section>
                </div>
            ) : null}
        </div>
    );
}

function TocHeaderEditor({ toc, updateDraft }: { toc: ToC; updateDraft(update: (toc: ToC) => void): void }) {
    const { t } = useI18n();
    return (
        <details className="workbench__toc-header-fields">
            <summary>{t('TOC header and free-list pointers')}</summary>
            <div>
                <NumberEditor
                    label={t('Device signature')}
                    value={toc.deviceSignature}
                    maximum={0xffff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.deviceSignature = value;
                        })
                    }
                />
                <NumberEditor
                    label={t('Track count')}
                    value={toc.nTracks}
                    maximum={0xff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.nTracks = value;
                        })
                    }
                />
                <NumberEditor
                    label={t('Disc non-empty')}
                    value={toc.discNonEmpty}
                    maximum={0xff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.discNonEmpty = value;
                        })
                    }
                />
                <NumberEditor
                    label={t('Next fragment')}
                    value={toc.nextFreeTrackSlot}
                    maximum={0xff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.nextFreeTrackSlot = value;
                        })
                    }
                />
                <NumberEditor
                    label={t('Next title cell')}
                    value={toc.nextFreeTitleSlot}
                    maximum={0xff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.nextFreeTitleSlot = value;
                        })
                    }
                />
                <NumberEditor
                    label={t('Next timestamp')}
                    value={toc.nextFreeTimestampSlot}
                    maximum={0xff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.nextFreeTimestampSlot = value;
                        })
                    }
                />
                <NumberEditor
                    label={t('Next full-width cell')}
                    value={toc.nextFreeFullWidthTitleSlot}
                    maximum={0xff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.nextFreeFullWidthTitleSlot = value;
                        })
                    }
                />
            </div>
        </details>
    );
}

function TocGrid({
    label,
    selected,
    highlighted = [],
    values,
    statusForIndex,
    onSelect,
}: {
    label: string;
    selected: number;
    highlighted?: number[];
    values: number[];
    statusForIndex(index: number): string;
    onSelect(index: number): void;
}) {
    return (
        <section className="workbench__toc-grid-panel" aria-label={label}>
            <h3>{label}</h3>
            <div className="workbench__toc-grid">
                {values.map((_, index) => (
                    <button
                        className={`${selected === index ? 'is-selected' : ''} ${highlighted.includes(index) ? 'is-linked' : ''} ${statusForIndex(index) !== '·' ? 'is-used' : ''}`}
                        key={index}
                        title={`${label} ${index}: ${statusForIndex(index)}`}
                        aria-label={`${label} ${index}, ${statusForIndex(index)}`}
                        onClick={() => onSelect(index)}
                    >
                        <b>{index.toString(16).padStart(2, '0')}</b>
                        <small>{statusForIndex(index)}</small>
                    </button>
                ))}
            </div>
        </section>
    );
}

function TocSelectionEditor({
    toc,
    tab,
    selection,
    linked,
    updateDraft,
}: {
    toc: ToC;
    tab: RawTocEditorTab;
    selection: { kind: 'map' | 'content'; index: number };
    linked: number[];
    updateDraft(update: (toc: ToC) => void): void;
}) {
    const { language, t } = useI18n();
    const index = selection.index;
    if (selection.kind === 'map') {
        const map = getRawTocMap(toc, tab);
        let preview = '';
        if (tab === 'half-width-title') preview = safeTrackTitle(toc, index, false);
        if (tab === 'full-width-title') preview = safeTrackTitle(toc, index, true);
        return (
            <aside className="workbench__toc-selection">
                <span className="workbench__eyebrow">{language === 'zh-CN' ? `映射条目 ${index}` : `MAP ENTRY ${index}`}</span>
                <h3>
                    {tab === 'position'
                        ? index === 0 ? t('Free list') : language === 'zh-CN' ? `曲目 ${index}` : `Track ${index}`
                        : index === 0 ? t('Disc metadata') : language === 'zh-CN' ? `曲目 ${index}` : `Track ${index}`}
                </h3>
                {preview ? <p className="workbench__toc-title-preview">{preview}</p> : null}
                <NumberEditor
                    label={t('Linked content index')}
                    value={map[index]}
                    maximum={0xff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            getRawTocMap(draft, tab)[index] = value;
                        })
                    }
                />
                <p>{linked.length > 0 ? (language === 'zh-CN' ? `链：${linked.join(' → ')}` : `Chain: ${linked.join(' → ')}`) : t('This entry has no non-zero content chain.')}</p>
            </aside>
        );
    }

    if (tab === 'position') {
        const fragment = toc.trackFragmentList[index];
        return (
            <aside className="workbench__toc-selection">
                <span className="workbench__eyebrow">{language === 'zh-CN' ? `片段 ${index}` : `FRAGMENT ${index}`}</span>
                <h3>{index === 0 ? t('Fragment free list') : language === 'zh-CN' ? `片段 ${index}` : `Fragment ${index}`}</h3>
                <AddressEditor
                    label={t('Start')}
                    value={fragment.start}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.trackFragmentList[index].start = value;
                        })
                    }
                />
                <AddressEditor
                    label={t('End')}
                    value={fragment.end}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.trackFragmentList[index].end = value;
                        })
                    }
                />
                <NumberEditor
                    label={t('Mode byte')}
                    value={fragment.mode}
                    maximum={0xff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.trackFragmentList[index].mode = value;
                        })
                    }
                />
                <div className="workbench__toc-mode-flags">
                    {modeFlags.map(([flag, label]) => (
                        <label key={flag}>
                            <input
                                type="checkbox"
                                checked={(fragment.mode & flag) !== 0}
                                onChange={(event) =>
                                    updateDraft((draft) => {
                                        draft.trackFragmentList[index].mode = event.target.checked
                                            ? draft.trackFragmentList[index].mode | flag
                                            : draft.trackFragmentList[index].mode & ~flag;
                                    })
                                }
                            />
                            {t(label)}
                        </label>
                    ))}
                </div>
                <NumberEditor
                    label={t('Next fragment')}
                    value={fragment.link}
                    maximum={0xff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.trackFragmentList[index].link = value;
                        })
                    }
                />
            </aside>
        );
    }

    if (tab === 'timestamp') {
        const timestamp = toc.timestampList[index];
        return (
            <aside className="workbench__toc-selection">
                <span className="workbench__eyebrow">{language === 'zh-CN' ? `时间戳 ${index}` : `TIMESTAMP ${index}`}</span>
                <h3>{t('Timestamp')} {index}</h3>
                {(['year', 'month', 'day', 'hour', 'minute', 'second'] as const).map((field) => (
                    <NumberEditor
                        key={field}
                        label={t(field[0].toUpperCase() + field.slice(1))}
                        value={timestamp[field]}
                        maximum={0xff}
                        onCommit={(value) =>
                            updateDraft((draft) => {
                                draft.timestampList[index][field] = value;
                            })
                        }
                    />
                ))}
                <NumberEditor
                    label={t('Signature')}
                    value={timestamp.signature}
                    maximum={0xffff}
                    onCommit={(value) =>
                        updateDraft((draft) => {
                            draft.timestampList[index].signature = value;
                        })
                    }
                />
            </aside>
        );
    }

    const cells = tab === 'half-width-title' ? toc.titleCellList : toc.fullWidthTitleCellList;
    return (
        <aside className="workbench__toc-selection">
            <span className="workbench__eyebrow">{language === 'zh-CN' ? `标题单元 ${index}` : `TITLE CELL ${index}`}</span>
            <h3>
                {language === 'zh-CN' ? `${t(tab === 'half-width-title' ? 'Half-width' : 'Full-width')}单元 ${index}` : `${tab === 'half-width-title' ? 'Half-width' : 'Full-width'} cell ${index}`}
            </h3>
            <CellEditor
                value={cells[index].title}
                onCommit={(value) =>
                    updateDraft((draft) => {
                        (tab === 'half-width-title' ? draft.titleCellList : draft.fullWidthTitleCellList)[index].title = value;
                    })
                }
            />
            <NumberEditor
                label={t('Next title cell')}
                value={cells[index].link}
                maximum={0xff}
                onCommit={(value) =>
                    updateDraft((draft) => {
                        (tab === 'half-width-title' ? draft.titleCellList : draft.fullWidthTitleCellList)[index].link = value;
                    })
                }
            />
        </aside>
    );
}

function NumberEditor({
    label,
    value,
    maximum,
    onCommit,
    hexadecimal = false,
}: {
    label: string;
    value: number;
    maximum: number;
    onCommit(value: number): void;
    hexadecimal?: boolean;
}) {
    const [local, setLocal] = useState(hexadecimal ? value.toString(16) : String(value));
    const [error, setError] = useState('');
    useEffect(() => setLocal(hexadecimal ? value.toString(16) : String(value)), [value, hexadecimal]);
    const commit = () => {
        const parsed = Number.parseInt(local || '0', hexadecimal ? 16 : 10);
        try {
            assertRawTocInteger(parsed, maximum, label);
            if (parsed !== value) onCommit(parsed);
            setLocal(hexadecimal ? parsed.toString(16) : String(parsed));
            setError('');
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Invalid value.');
        }
    };
    return (
        <label className="workbench__toc-field">
            <span>{label}</span>
            <input
                value={local}
                inputMode={hexadecimal ? 'text' : 'numeric'}
                onChange={(event) => setLocal(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                }}
            />
            {error ? <small>{error}</small> : null}
        </label>
    );
}

function AddressEditor({ label, value, onCommit }: { label: string; value: DiscAddress; onCommit(value: DiscAddress): void }) {
    const { language, t } = useI18n();
    return (
        <fieldset className="workbench__toc-address">
            <legend>{language === 'zh-CN' ? `${label}地址 · 十六进制` : `${label} address · hexadecimal`}</legend>
            <NumberEditor
                label={t('Cluster')}
                value={value.cluster}
                maximum={0x3fff}
                hexadecimal
                onCommit={(cluster) => onCommit({ ...value, cluster })}
            />
            <NumberEditor
                label={t('Sector')}
                value={value.sector}
                maximum={0x3f}
                hexadecimal
                onCommit={(sector) => onCommit({ ...value, sector })}
            />
            <NumberEditor
                label={t('Group')}
                value={value.group}
                maximum={0x0f}
                hexadecimal
                onCommit={(group) => onCommit({ ...value, group })}
            />
        </fieldset>
    );
}

function CellEditor({ value, onCommit }: { value: number[]; onCommit(value: number[]): void }) {
    const { t } = useI18n();
    const [local, setLocal] = useState(escapeRawTocCell(value));
    const [error, setError] = useState('');
    useEffect(() => setLocal(escapeRawTocCell(value)), [value]);
    const change = (next: string) => {
        setLocal(next);
        try {
            const parsed = parseEscapedRawTocCell(next);
            setError('');
            onCommit(parsed);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Invalid title-cell bytes.');
        }
    };
    return (
        <label className="workbench__toc-field">
            <span>{t('Seven raw bytes')}</span>
            <input value={local} onChange={(event) => change(event.target.value)} spellCheck={false} />
            <small className={error ? 'is-error' : ''}>{error || t('Use \\00 style hexadecimal escapes for non-printable bytes.')}</small>
        </label>
    );
}

function contentMarker(toc: ToC, tab: RawTocEditorTab, index: number) {
    if (tab === 'position') {
        const mode = toc.trackFragmentList[index].mode;
        if (mode === 0) return '·';
        if ((mode & ModeFlag.F_SP_MODE) !== 0) return (mode & ModeFlag.F_STEREO) !== 0 ? 'SP' : 'M';
        return (mode & ModeFlag.F_STEREO) !== 0 ? 'L2' : 'L4';
    }
    if (tab === 'timestamp') {
        const value = toc.timestampList[index];
        return value.year || value.month || value.day || value.hour || value.minute || value.second || value.signature ? 'T' : '·';
    }
    const cells = tab === 'half-width-title' ? toc.titleCellList : toc.fullWidthTitleCellList;
    return cells[index].title.some((byte) => byte !== 0) ? 'TXT' : '·';
}

function safeTrackTitle(toc: ToC, index: number, fullWidth: boolean) {
    try {
        return getTitleByTrackNumber(toc, index, fullWidth, fullWidth && index === 0);
    } catch {
        return '';
    }
}

function decodeBase64(data: string) {
    const binary = atob(data);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
