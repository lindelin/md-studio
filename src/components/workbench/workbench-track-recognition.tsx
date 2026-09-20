import React, { useCallback, useEffect, useMemo, useState } from 'react';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import HeadphonesRoundedIcon from '@mui/icons-material/HeadphonesRounded';
import type { TrackRecognitionTaskResult } from '../../application/browser-track-recognizer';
import { requestBrowserAudioDevices, type BrowserAudioDevice } from '../../application/browser-audio-devices';
import { sanitizeDeviceFullWidthTitle, sanitizeDeviceHalfWidthTitle } from '../../application/device-title';
import type { UserSettings } from '../../application/settings-store';
import type { DisplayTrack } from '../../utils';
import { useApplicationClient, useApplicationWorkspace, useUpdateApplicationSettings } from '../use-application-client';
import { useI18n } from '../use-i18n';
import { formatRecognitionTitle, taskProgressPercent } from './workbench-model';

type RecognitionStatus = 'pending' | 'recognized' | 'not-found' | 'too-short';

interface RecognitionRow {
    index: number;
    duration: number;
    originalTitle: string;
    selected: boolean;
    status: RecognitionStatus;
    title: string;
    fullWidthTitle: string;
    matchedTitle: string;
    artist: string;
    album: string;
}

export interface WorkbenchTrackRecognitionProps {
    tracks: DisplayTrack[];
    initialTrackIndexes: number[];
    expectedRevision: number;
    onClose(): void;
    onTaskStarted(id: string, message: string): void;
    onApplied(message: string): void;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export const WorkbenchTrackRecognition = ({
    tracks,
    initialTrackIndexes,
    expectedRevision,
    onClose,
    onTaskStarted,
    onApplied,
}: WorkbenchTrackRecognitionProps) => {
    const client = useApplicationClient();
    const workspace = useApplicationWorkspace();
    const updateSettings = useUpdateApplicationSettings();
    const { language, t } = useI18n();
    const device = workspace.device;
    const settings = workspace.settings.values;
    const initialSelection = useMemo(
        () => new Set(initialTrackIndexes.length > 0 ? initialTrackIndexes : tracks.map((track) => track.index)),
        [initialTrackIndexes, tracks]
    );
    const [rows, setRows] = useState<RecognitionRow[]>(() =>
        tracks.map((track) => ({
            index: track.index,
            duration: track.duration,
            originalTitle: track.title || (language === 'zh-CN' ? `曲目 ${track.index + 1}` : `Track ${track.index + 1}`),
            selected: initialSelection.has(track.index),
            status: 'pending',
            title: '',
            fullWidthTitle: '',
            matchedTitle: '',
            artist: '',
            album: '',
        }))
    );
    const supportsFactoryMode = device?.capabilities.includes('advanced.factory') ?? false;
    const supportsPlayback = device?.capabilities.includes('playback.control') ?? false;
    const supportsHiMDMetadata = device?.capabilities.includes('metadata.himd') ?? false;
    const canRenameTracks = supportsHiMDMetadata || (device?.capabilities.includes('track.rename') ?? false);
    const [mode, setMode] = useState<'exploits' | 'line-in'>(
        settings.recognitionImportMethod === 'exploits' && supportsFactoryMode ? 'exploits' : 'line-in'
    );
    const [titleFormat, setTitleFormat] = useState(settings.recognitionTrackTitleFormat);
    const [audioDevices, setAudioDevices] = useState<BrowserAudioDevice[]>([]);
    const [audioDevicesLoaded, setAudioDevicesLoaded] = useState(false);
    const [audioDevicesLoading, setAudioDevicesLoading] = useState(false);
    const [inputDeviceId, setInputDeviceId] = useState('');
    const [taskId, setTaskId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const recognitionTask = taskId ? workspace.tasks.find((task) => task.id === taskId) : undefined;
    const networkAvailable = window.native?.unrestrictedFetchJSON !== undefined;

    const stopPreview = useCallback(() => client.stopLocalAudioInputPreview(), [client]);

    useEffect(
        () => () => {
            void client.stopLocalAudioInputPreview();
        },
        [client]
    );

    useEffect(() => {
        if (!recognitionTask || !taskId) return;
        if (recognitionTask.status === 'failed' || recognitionTask.status === 'interrupted') {
            setError(recognitionTask.error?.message ?? t('Song recognition failed.'));
            setTaskId(null);
            return;
        }
        if (recognitionTask.status !== 'succeeded' && recognitionTask.status !== 'cancelled') return;
        const results = (recognitionTask.result as TrackRecognitionTaskResult | undefined)?.tracks ?? [];
        setRows((current) =>
            current.map((row) => {
                const result = results.find((candidate) => candidate.index === row.index);
                if (!result) return row;
                if (!result.recognized) return { ...row, status: result.reason ?? 'not-found' };
                const rawTitle = formatRecognitionTitle(result, titleFormat);
                const title = sanitizeDeviceHalfWidthTitle(device?.recording, rawTitle);
                let fullWidthTitle = settings.fullWidthSupport
                    ? sanitizeDeviceFullWidthTitle(device?.recording, rawTitle)
                    : '';
                if (sanitizeDeviceHalfWidthTitle(device?.recording, fullWidthTitle) === title) fullWidthTitle = '';
                return {
                    ...row,
                    status: 'recognized',
                    title,
                    fullWidthTitle,
                    matchedTitle: result.title ?? '',
                    artist: result.artist ?? '',
                    album: result.album ?? '',
                };
            })
        );
        setTaskId(null);
    }, [device?.recording, recognitionTask, settings.fullWidthSupport, t, taskId, titleFormat]);

    const selectedPending = rows.filter((row) => row.selected && row.status !== 'recognized');
    const selectedRecognized = rows.filter((row) => row.selected && row.status === 'recognized');
    const activeTask = recognitionTask?.status === 'queued' || recognitionTask?.status === 'running';
    const modeReady = mode === 'exploits' ? supportsFactoryMode : supportsPlayback && inputDeviceId !== '';
    const canRecognize = !busy && !activeTask && networkAvailable && modeReady && selectedPending.length > 0;

    const loadAudioDevices = async () => {
        setAudioDevicesLoading(true);
        setError(null);
        try {
            const available = await requestBrowserAudioDevices();
            setAudioDevices(available);
            setAudioDevicesLoaded(true);
            if (available.length === 0) setError(t('No audio input is available.'));
        } catch (reason) {
            setError(language === 'zh-CN' ? `音频输入权限请求失败：${errorMessage(reason)}` : `Audio input permission failed: ${errorMessage(reason)}`);
        } finally {
            setAudioDevicesLoading(false);
        }
    };

    const changeInput = async (deviceId: string) => {
        setInputDeviceId(deviceId);
        setError(null);
        try {
            await stopPreview();
            if (deviceId) await client.startLocalAudioInputPreview(deviceId);
        } catch (reason) {
            setError(language === 'zh-CN' ? `无法监听此输入：${errorMessage(reason)}` : `Could not monitor this input: ${errorMessage(reason)}`);
        }
    };

    const changeMode = async (next: 'exploits' | 'line-in') => {
        setMode(next);
        setError(null);
        if (next !== 'line-in') {
            setInputDeviceId('');
            await stopPreview();
        }
        try {
            await updateSettings({ recognitionImportMethod: next });
        } catch (reason) {
            setError(errorMessage(reason));
        }
    };

    const changeTitleFormat = async (next: UserSettings['recognitionTrackTitleFormat']) => {
        setTitleFormat(next);
        setRows((current) =>
            current.map((row) => {
                if (row.status !== 'recognized') return row;
                const rawTitle = formatRecognitionTitle({ title: row.matchedTitle, artist: row.artist, album: row.album }, next);
                const title = sanitizeDeviceHalfWidthTitle(device?.recording, rawTitle);
                let fullWidthTitle = settings.fullWidthSupport
                    ? sanitizeDeviceFullWidthTitle(device?.recording, rawTitle)
                    : '';
                if (sanitizeDeviceHalfWidthTitle(device?.recording, fullWidthTitle) === title) fullWidthTitle = '';
                return { ...row, title, fullWidthTitle };
            })
        );
        try {
            await updateSettings({ recognitionTrackTitleFormat: next });
        } catch (reason) {
            setError(errorMessage(reason));
        }
    };

    const startRecognition = async () => {
        setBusy(true);
        setError(null);
        try {
            await stopPreview();
            const started = await client.startLocalTrackRecognition({
                mode,
                deviceId: mode === 'line-in' ? inputDeviceId : undefined,
                useSlowerExploit: settings.factoryModeUseSlowerExploit,
                tracks: rows.map((row) => ({
                    index: row.index,
                    duration: row.duration,
                    selected: row.selected,
                    alreadyRecognized: row.status === 'recognized',
                })),
            });
            setTaskId(started.id);
            onTaskStarted(
                started.id,
                language === 'zh-CN'
                    ? `已开始识别 ${selectedPending.length} 首曲目。`
                    : `Recognition started for ${selectedPending.length} track${selectedPending.length === 1 ? '' : 's'}.`
            );
        } catch (reason) {
            setError(errorMessage(reason));
        } finally {
            setBusy(false);
        }
    };

    const applyTitles = async () => {
        if (!device || selectedRecognized.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            const result = await client.execute(
                supportsHiMDMetadata
                    ? {
                          type: 'track.renameHimdMany',
                          updates: selectedRecognized.map((row) => ({
                              index: row.index,
                              title: row.title,
                              artist: row.artist,
                              album: row.album,
                          })),
                          expectedRevision,
                      }
                    : {
                          type: 'track.renameMany',
                          updates: selectedRecognized.map((row) => ({
                              index: row.index,
                              title: row.title,
                              fullWidthTitle: row.fullWidthTitle,
                          })),
                          expectedRevision,
                      }
            );
            if (!result.ok) throw new Error(result.error.message);
            onClose();
            onApplied(
                language === 'zh-CN'
                    ? `已将识别出的元数据应用到 ${selectedRecognized.length} 首曲目。`
                    : `Applied recognized metadata to ${selectedRecognized.length} track${selectedRecognized.length === 1 ? '' : 's'}.`
            );
        } catch (reason) {
            setError(errorMessage(reason));
            setBusy(false);
        }
    };

    const cancelRecognition = async () => {
        if (!taskId) return;
        setError(null);
        const result = await client.execute({ type: 'task.cancel', id: taskId });
        if (!result.ok) setError(result.error.message);
    };

    const close = () => {
        if (busy || activeTask) return;
        void stopPreview();
        onClose();
    };

    return (
        <div className="workbench__modal-backdrop" role="presentation" onMouseDown={close}>
            <section className="workbench__modal workbench__recognition-modal" role="dialog" aria-modal="true" aria-labelledby="workbench-recognition-title" onMouseDown={(event) => event.stopPropagation()}>
                <span className="workbench__eyebrow">{t('SONG RECOGNITION')}</span>
                <h2 id="workbench-recognition-title">{t('Identify and review MiniDisc tracks')}</h2>
                <p>{t('Capture three short samples from each selected track, review the matches, then apply titles only after you approve them.')}</p>

                <div className="workbench__recognition-controls">
                    <div className="workbench__transfer-options" role="radiogroup" aria-label={t('Recognition input')}>
                        <label className={mode === 'line-in' ? 'is-selected' : ''}>
                            <input type="radio" name="recognition-mode" checked={mode === 'line-in'} disabled={activeTask} onChange={() => void changeMode('line-in')} />
                            <span>{t('Line input')}<small>{t('Plays each track and records the computer audio input.')}</small></span>
                        </label>
                        <label className={mode === 'exploits' ? 'is-selected' : ''}>
                            <input type="radio" name="recognition-mode" checked={mode === 'exploits'} disabled={!supportsFactoryMode || activeTask} onChange={() => void changeMode('exploits')} />
                            <span>{t('Direct device read')}<small>{t(supportsFactoryMode ? 'Uses the supported Homebrew reader.' : 'Unavailable on this device.')}</small></span>
                        </label>
                    </div>
                    <label className="workbench__transfer-select">
                        {t('Recognized title format')}
                        <select value={titleFormat} disabled={activeTask} onChange={(event) => void changeTitleFormat(event.target.value as UserSettings['recognitionTrackTitleFormat'])}>
                            <option value="title">{t('Title')}</option>
                            <option value="album-title">{t('Album - Title')}</option>
                            <option value="artist-title">{t('Artist - Title')}</option>
                            <option value="title-artist">{t('Title - Artist')}</option>
                            <option value="artist-album-title">{t('Artist - Album - Title')}</option>
                        </select>
                    </label>
                </div>

                {mode === 'line-in' ? (
                    <div className="workbench__recognition-input">
                        <div><HeadphonesRoundedIcon /><span><strong>{t('Computer audio input')}</strong><small>{t('Connect the MiniDisc line-out before starting.')}</small></span></div>
                        {!audioDevicesLoaded ? (
                            <button className="secondary-button" onClick={() => void loadAudioDevices()} disabled={audioDevicesLoading || activeTask}>{t(audioDevicesLoading ? 'Checking…' : 'Choose input')}</button>
                        ) : (
                            <select value={inputDeviceId} disabled={activeTask} onChange={(event) => void changeInput(event.target.value)}>
                                <option value="">{t('Choose an input')}</option>
                                {audioDevices.map((audioDevice) => <option value={audioDevice.deviceId} key={audioDevice.deviceId}>{audioDevice.label}</option>)}
                            </select>
                        )}
                    </div>
                ) : null}

                {!networkAvailable ? <div className="workbench__write-warning">{t('Recognition needs the local unrestricted network adapter. Enable it in the supported desktop host or userscript before starting.')}</div> : null}
                {mode === 'line-in' && !supportsPlayback ? <div className="workbench__write-warning">{t('This device does not provide the playback controls required for line-input recognition.')}</div> : null}
                {error ? <div className="workbench__write-warning">{error}</div> : null}
                {recognitionTask ? (
                    <div className="workbench__recognition-progress">
                        <span><i style={{ width: `${taskProgressPercent(recognitionTask)}%` }} /></span>
                        <small>{recognitionTask.progress.currentLabel || recognitionTask.phase} · {taskProgressPercent(recognitionTask)}%</small>
                    </div>
                ) : null}

                <div className="workbench__recognition-table" role="table" aria-label={t('Recognition tracks')}>
                    <div className="workbench__recognition-row is-head" role="row">
                        <span><input type="checkbox" aria-label={t('Select all recognition tracks')} checked={rows.length > 0 && rows.every((row) => row.selected)} disabled={activeTask} onChange={() => setRows((current) => current.map((row) => ({ ...row, selected: !current.every((candidate) => candidate.selected) })))} /></span>
                        <span>#</span><span>{t('Original title')}</span><span>{t('Recognition result')}</span>
                    </div>
                    <div className="workbench__recognition-body">
                        {rows.map((row) => (
                            <div className="workbench__recognition-row" role="row" key={row.index}>
                                <span><input type="checkbox" aria-label={language === 'zh-CN' ? `选择曲目 ${row.index + 1}` : `Select track ${row.index + 1}`} checked={row.selected} disabled={activeTask} onChange={() => setRows((current) => current.map((candidate) => candidate.index === row.index ? { ...candidate, selected: !candidate.selected } : candidate))} /></span>
                                <span>{String(row.index + 1).padStart(2, '0')}</span>
                                <span title={row.originalTitle}>{row.originalTitle}</span>
                                <span>
                                    {row.status === 'recognized' ? (
                                        <input aria-label={language === 'zh-CN' ? `曲目 ${row.index + 1} 的识别标题` : `Recognized title for track ${row.index + 1}`} value={row.title} disabled={activeTask} onChange={(event) => setRows((current) => current.map((candidate) => candidate.index === row.index ? { ...candidate, title: event.target.value } : candidate))} />
                                    ) : <em className={`is-${row.status}`}>{t(row.status === 'too-short' ? 'Too short for three samples' : row.status === 'not-found' ? 'No match found' : 'Not recognized yet')}</em>}
                                    {row.status === 'recognized' ? <small>{[row.artist, row.album].filter(Boolean).join(' · ') || t('Matched')}</small> : null}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="workbench__modal-actions">
                    <button className="secondary-button" onClick={close} disabled={busy || activeTask}>{t('Close')}</button>
                    {activeTask ? <button className="secondary-button" onClick={() => void cancelRecognition()}>{t('Stop after current sample')}</button> : null}
                    <button className="secondary-button" onClick={() => void startRecognition()} disabled={!canRecognize}><AutoAwesomeRoundedIcon /> {t(activeTask ? 'Recognizing…' : selectedRecognized.length > 0 ? 'Recognize remaining' : 'Start recognition')}</button>
                    <button className="primary-button" onClick={() => void applyTitles()} disabled={busy || activeTask || !canRenameTracks || selectedRecognized.length === 0}><CheckCircleRoundedIcon /> {selectedRecognized.length === 0 ? t('Apply titles') : language === 'zh-CN' ? `应用 ${selectedRecognized.length} 个标题` : `Apply ${selectedRecognized.length} ${selectedRecognized.length === 1 ? 'title' : 'titles'}`}</button>
                </div>
            </section>
        </div>
    );
};
