import React, { useCallback, useEffect, useRef, useState } from 'react';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import MicRoundedIcon from '@mui/icons-material/MicRounded';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import StopRoundedIcon from '@mui/icons-material/StopRounded';
import { requestBrowserAudioDevices, type BrowserAudioDevice } from '../../application/browser-audio-devices';
import type { DisplayTrack } from '../../utils';
import { useApplicationClient } from '../use-application-client';

export interface WorkbenchTrackTransferProps {
    mode: 'export' | 'record';
    tracks: DisplayTrack[];
    expectedRevision: number;
    onClose(): void;
    onTaskStarted(id: string, message: string): void;
}

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}

export const WorkbenchTrackTransfer = ({
    mode,
    tracks,
    expectedRevision,
    onClose,
    onTaskStarted,
}: WorkbenchTrackTransferProps) => {
    const client = useApplicationClient();
    const [convertToWav, setConvertToWav] = useState(false);
    const [devices, setDevices] = useState<BrowserAudioDevice[]>([]);
    const [inputDeviceId, setInputDeviceId] = useState('');
    const [loadingDevices, setLoadingDevices] = useState(mode === 'record');
    const [previewPending, setPreviewPending] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const previewPlayback = useRef(false);
    const indexes = tracks.map((track) => track.index);

    useEffect(() => {
        if (mode !== 'record') return;
        let active = true;
        void requestBrowserAudioDevices()
            .then((available) => {
                if (!active) return;
                setDevices(available);
                if (available.length === 0) setError('No audio input is available.');
            })
            .catch((reason) => {
                if (active) setError(`Audio input permission failed: ${errorMessage(reason)}`);
            })
            .finally(() => {
                if (active) setLoadingDevices(false);
            });
        return () => {
            active = false;
        };
    }, [mode]);

    const stopLocalPreview = useCallback(async () => {
        setPreviewPending(false);
        await client.stopLocalAudioInputPreview();
    }, [client]);

    const stopPlaybackPreview = useCallback(async () => {
        if (!previewPlayback.current) return;
        previewPlayback.current = false;
        const stopped = await client.execute({ type: 'playback.control', command: { action: 'stop' } });
        if (!stopped.ok) throw new Error(stopped.error.message);
    }, [client]);

    useEffect(
        () => () => {
            void client.stopLocalAudioInputPreview();
            if (previewPlayback.current) void client.execute({ type: 'playback.control', command: { action: 'stop' } });
        },
        [client]
    );

    const close = () => {
        void Promise.allSettled([stopLocalPreview(), stopPlaybackPreview()]);
        onClose();
    };

    const changeInput = async (deviceId: string) => {
        setInputDeviceId(deviceId);
        setPreviewPending(true);
        setError(null);
        try {
            await client.startLocalAudioInputPreview(deviceId);
        } catch (reason) {
            setError(`Could not monitor this input: ${errorMessage(reason)}`);
        } finally {
            setPreviewPending(false);
        }
    };

    const playSample = async () => {
        if (tracks.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            const selected = await client.execute({
                type: 'playback.control',
                command: { action: 'gotoTrack', index: tracks[0].index },
            });
            if (!selected.ok) throw new Error(selected.error.message);
            const played = await client.execute({ type: 'playback.control', command: { action: 'play' } });
            if (!played.ok) throw new Error(played.error.message);
            previewPlayback.current = true;
        } catch (reason) {
            setError(errorMessage(reason));
        } finally {
            setBusy(false);
        }
    };

    const stopSample = async () => {
        setBusy(true);
        setError(null);
        try {
            await stopPlaybackPreview();
        } catch (reason) {
            setError(errorMessage(reason));
        } finally {
            setBusy(false);
        }
    };

    const start = async () => {
        setBusy(true);
        setError(null);
        try {
            if (mode === 'record') await stopLocalPreview();
            const result = await client.execute(
                mode === 'export'
                    ? { type: 'track.export', indexes, convertToWav, expectedRevision }
                    : { type: 'track.record', indexes, deviceId: inputDeviceId, expectedRevision }
            );
            if (!result.ok) throw new Error(result.error.message);
            if (!result.task) throw new Error(`${mode === 'export' ? 'Export' : 'Recording'} did not start.`);
            previewPlayback.current = false;
            onClose();
            onTaskStarted(
                result.task.id,
                mode === 'export'
                    ? `Export started for ${tracks.length} track${tracks.length === 1 ? '' : 's'}.`
                    : `Audio-input recording started for ${tracks.length} track${tracks.length === 1 ? '' : 's'}.`
            );
        } catch (reason) {
            setError(errorMessage(reason));
            setBusy(false);
        }
    };

    const canStart =
        !busy && tracks.length > 0 && (mode === 'export' || (!loadingDevices && !previewPending && inputDeviceId !== ''));

    return (
        <div className="workbench__modal-backdrop" role="presentation" onMouseDown={() => !busy && close()}>
            <section
                className="workbench__modal workbench__transfer-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="workbench-transfer-title"
                onMouseDown={(event) => event.stopPropagation()}
            >
                <span className="workbench__eyebrow">{mode === 'export' ? 'EXPORT TRACKS' : 'RECORD THROUGH AUDIO INPUT'}</span>
                <h2 id="workbench-transfer-title">
                    {mode === 'export' ? 'Export' : 'Record'} {tracks.length} selected track{tracks.length === 1 ? '' : 's'}
                </h2>
                <p>
                    {mode === 'export'
                        ? 'Choose whether to keep the device audio format or create standard WAV files.'
                        : 'Connect the MiniDisc line-out to a computer audio input, monitor it, then start the recording task.'}
                </p>

                <div className="workbench__transfer-tracks" aria-label="Selected tracks">
                    {tracks.slice(0, 4).map((track) => (
                        <span key={track.index}><b>{String(track.index + 1).padStart(2, '0')}</b>{track.title || `Track ${track.index + 1}`}</span>
                    ))}
                    {tracks.length > 4 ? <small>+ {tracks.length - 4} more tracks</small> : null}
                </div>

                {mode === 'export' ? (
                    <div className="workbench__transfer-options" role="radiogroup" aria-label="Export format">
                        <label className={convertToWav ? '' : 'is-selected'}>
                            <input type="radio" name="export-format" checked={!convertToWav} onChange={() => setConvertToWav(false)} />
                            <span>Original device format<small>Fastest option and preserves the source codec.</small></span>
                        </label>
                        <label className={convertToWav ? 'is-selected' : ''}>
                            <input type="radio" name="export-format" checked={convertToWav} onChange={() => setConvertToWav(true)} />
                            <span>Convert to WAV<small>Creates broadly compatible uncompressed audio files.</small></span>
                        </label>
                    </div>
                ) : (
                    <>
                        <label className="workbench__transfer-select">
                            Audio input
                            <select
                                value={inputDeviceId}
                                disabled={loadingDevices || busy}
                                onChange={(event) => void changeInput(event.target.value)}
                            >
                                <option value="">{loadingDevices ? 'Requesting audio input permission…' : 'Choose an input'}</option>
                                {devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
                            </select>
                        </label>
                        <div className="workbench__transfer-monitor">
                            <div><strong>Monitor the connection</strong><small>Selecting an input lets you hear the MiniDisc line-out through this computer.</small></div>
                            <button className="secondary-button" onClick={() => void playSample()} disabled={busy || tracks.length === 0}><PlayArrowRoundedIcon /> Play first track</button>
                            <button className="secondary-button" onClick={() => void stopSample()} disabled={busy || !previewPlayback.current}><StopRoundedIcon /> Stop</button>
                        </div>
                    </>
                )}

                {error ? <div className="workbench__write-warning">{error}</div> : null}
                <div className="workbench__modal-actions">
                    <button className="secondary-button" onClick={close} disabled={busy}>Cancel</button>
                    <button className="primary-button" onClick={() => void start()} disabled={!canStart}>
                        {mode === 'export' ? <DownloadRoundedIcon /> : <MicRoundedIcon />}
                        {busy ? 'Starting…' : mode === 'export' ? 'Start export' : 'Start recording'}
                    </button>
                </div>
            </section>
        </div>
    );
};
