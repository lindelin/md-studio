import serviceRegistry from '../services/registry';
import { getTracks, sleepWithProgressCallback } from '../utils';
import { waitForTrackReady } from '../domain/playback-position';
import { ApplicationError } from './contracts';
import type { MiniDiscApplication } from './minidisc-application';
import type { TaskManager } from './task-manager';
import type { TrackRecorder, TrackRecordRequest } from './track-record';

type ReadyWaiter = typeof waitForTrackReady;
type DurationWaiter = typeof sleepWithProgressCallback;

export class BrowserTrackRecorder implements TrackRecorder {
    constructor(
        private readonly waitUntilReady: ReadyWaiter = waitForTrackReady,
        private readonly waitForDuration: DurationWaiter = sleepWithProgressCallback
    ) {}

    async start(request: TrackRecordRequest, application: MiniDiscApplication, tasks: TaskManager) {
        if (!request.deviceId.trim()) throw new ApplicationError('INVALID_INPUT', 'Choose an audio input before recording.');
        if (request.indexes.length === 0) throw new ApplicationError('INVALID_INPUT', 'At least one track is required.');
        const uniqueIndexes = new Set(request.indexes);
        if (uniqueIndexes.size !== request.indexes.length) {
            throw new ApplicationError('INVALID_INPUT', 'A track was supplied more than once.');
        }
        if (!serviceRegistry.mediaRecorderService) {
            throw new ApplicationError('DEVICE_NOT_CONNECTED', 'The browser audio recording service is unavailable.');
        }

        const snapshot = await application.refresh(false);
        if (request.expectedRevision !== undefined && request.expectedRevision !== snapshot.revision) {
            throw new ApplicationError('STALE_REVISION', 'The disc changed after this recording was prepared.', {
                expectedRevision: request.expectedRevision,
                actualRevision: snapshot.revision,
            });
        }
        if (!snapshot.capabilities.includes('playback.control')) {
            throw new ApplicationError('CAPABILITY_REQUIRED', 'The connected device cannot play tracks for audio-input recording.');
        }
        if (!snapshot.disc) throw new ApplicationError('NO_DISC', 'Insert a disc before recording tracks.');
        const selected = getTracks(snapshot.disc).filter((track) => uniqueIndexes.has(track.index));
        if (selected.length !== uniqueIndexes.size) {
            const known = new Set(selected.map((track) => track.index));
            const missing = [...uniqueIndexes].filter((index) => !known.has(index));
            throw new ApplicationError('INVALID_INPUT', `Track ${missing[0]} does not exist.`, { missing });
        }

        const task = tasks.create(
            'track.record',
            `Record ${selected.length} track${selected.length === 1 ? '' : 's'} through the audio input`,
            selected.length,
            'tracks'
        );
        tasks.start(task.id, 'preparing');
        void this.run(
            task.id,
            selected,
            request.deviceId,
            application,
            { sessionId: snapshot.sessionId, revision: snapshot.revision },
            tasks
        );
        return tasks.get(task.id);
    }

    private async run(
        taskId: string,
        selected: ReturnType<typeof getTracks>,
        deviceId: string,
        application: MiniDiscApplication,
        deviceVersion: { sessionId: string; revision: number },
        tasks: TaskManager
    ) {
        const recorder = serviceRegistry.mediaRecorderService;
        if (!recorder) {
            tasks.fail(taskId, new Error('The browser audio recording service ended before recording started.'));
            return;
        }

        let recordingStarted = false;
        let recordedTracks = 0;
        const files: string[] = [];
        try {
            await application.runPlaybackCaptureSession(deviceVersion, async (playback) => {
                await playback.control({ action: 'stop' });
                for (const track of selected) {
                    if (tasks.isCancellationRequested(taskId)) break;
                    const title = this.createRecordingTitle(track);
                    tasks.setPhase(taskId, 'preparing');
                    tasks.reportProgress(taskId, {
                        completed: recordedTracks,
                        currentLabel: title,
                        currentPercent: 0,
                    });

                    await playback.control({ action: 'gotoTrack', index: track.index });
                    await playback.control({ action: 'play' });
                    const readiness = await this.waitUntilReady(track.index, () => playback.readPosition(), {
                        isCancelled: () => tasks.isCancellationRequested(taskId),
                    });
                    if (readiness === 'cancelled') break;
                    await playback.control({ action: 'pause' });
                    await playback.control({ action: 'gotoTrack', index: track.index });

                    await recorder.initStream(deviceId);
                    try {
                        await recorder.startRecording();
                        recordingStarted = true;
                        tasks.setPhase(taskId, 'transferring');
                        await playback.control({ action: 'play' });
                        const completed = await this.waitForDuration(
                            track.duration * 1000,
                            (percentage) => {
                                if (tasks.get(taskId).status !== 'running') return;
                                tasks.reportProgress(taskId, {
                                    completed: recordedTracks,
                                    currentLabel: title,
                                    currentPercent: percentage,
                                });
                            },
                            () => tasks.isCancellationRequested(taskId)
                        );
                        await recorder.stopRecording();
                        recordingStarted = false;
                        if (!completed) break;

                        tasks.setPhase(taskId, 'finalizing');
                        await recorder.downloadRecorded(title);
                        files.push(`${title}.wav`);
                        recordedTracks += 1;
                        tasks.reportProgress(taskId, {
                            completed: recordedTracks,
                            currentLabel: title,
                            currentPercent: 100,
                        });
                    } finally {
                        if (recordingStarted) {
                            await recorder.stopRecording().catch((error) =>
                                console.error('Could not stop audio-input recording.', error)
                            );
                            recordingStarted = false;
                        }
                        await recorder.closeStream();
                    }
                }
            });

            if (tasks.get(taskId).status !== 'running') return;
            const result = { recordedTracks, files };
            if (tasks.isCancellationRequested(taskId)) tasks.cancel(taskId, result);
            else tasks.succeed(taskId, result);
        } catch (error) {
            if (tasks.get(taskId).status === 'running') {
                tasks.fail(taskId, error, {
                    completedItems: recordedTracks,
                    pendingItems: selected.length - recordedTracks,
                    recoveryAction:
                        recordedTracks > 0
                            ? 'Keep the downloaded recordings and retry only the remaining tracks.'
                            : 'Check the audio input and device playback connection before retrying.',
                });
            }
        } finally {
            await recorder.closeStream().catch((error) => console.error('Could not close the audio-input stream.', error));
        }
    }

    private createRecordingTitle(track: ReturnType<typeof getTracks>[number]) {
        if (track.title) {
            return `${track.index + 1}. ${track.title}${track.fullWidthTitle ? ` (${track.fullWidthTitle})` : ''}`;
        }
        if (track.fullWidthTitle) return `${track.index + 1}. ${track.fullWidthTitle}`;
        return `Track ${track.index + 1}`;
    }
}
