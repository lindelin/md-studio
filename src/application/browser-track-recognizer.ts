import type { ApplicationClient } from './application-client';
import type { AdvancedTrackReader } from './contracts';
import { ffmpegTranscode, timeToSeekArgs } from '../utils';
import type { TaskManager, TaskSnapshot, TaskStageProgress } from './task-manager';

export const RECOGNITION_SAMPLE_SECONDS = 12;
export const RECOGNITION_ATTEMPTS = 3;

export type TrackRecognitionMode = 'exploits' | 'line-in';
export type TrackRecognitionPhase = 'reading' | 'calculating' | 'identifying';

export interface TrackRecognitionInput {
    index: number;
    duration: number;
    selected: boolean;
    alreadyRecognized: boolean;
}

export interface RecognizedTrackMetadata {
    index: number;
    recognized: boolean;
    title?: string;
    artist?: string;
    album?: string;
    reason?: 'too-short' | 'not-found';
}

export interface TrackRecognitionRequest {
    tracks: TrackRecognitionInput[];
    mode: TrackRecognitionMode;
    deviceId?: string;
    useSlowerExploit?: boolean;
}

export type TrackRecognitionProgress =
    | { type: 'track'; current: number; total: number; trackIndex: number }
    | { type: 'phase'; phase: TrackRecognitionPhase }
    | { type: 'read'; current: number; total: number };

export interface RecognitionMatch {
    title: string;
    artist: string;
    album?: string;
}

export interface AudioRecognitionService {
    recognize(samples: Uint8Array, onPhase: (phase: 'calculating' | 'identifying') => void): Promise<RecognitionMatch | null>;
}

export interface TrackRecognizer {
    start(request: TrackRecognitionRequest, tasks: TaskManager): Promise<TaskSnapshot<TrackRecognitionTaskResult>>;
    recognize(
        request: TrackRecognitionRequest,
        hooks?: {
            isCancelled?(): boolean;
            onProgress?(progress: TrackRecognitionProgress): void;
        }
    ): Promise<RecognizedTrackMetadata[]>;
}

export interface TrackRecognitionTaskResult {
    tracks: RecognizedTrackMetadata[];
}

type RecognitionClient = Pick<
    ApplicationClient,
    'getWorkspaceSnapshot' | 'runLocalAdvancedTrackDownloadSession' | 'runLocalPlaybackCaptureSession' | 'captureLocalAudioInput'
>;

export interface BrowserTrackRecognizerDependencies {
    createRecognitionService(): Promise<AudioRecognitionService>;
    transcode(data: Uint8Array, inputFormat: string, outputParameters: string): Promise<Uint8Array>;
}

export class BrowserTrackRecognizer implements TrackRecognizer {
    constructor(
        private readonly client: RecognitionClient,
        private readonly dependencies: BrowserTrackRecognizerDependencies = {
            createRecognitionService: createShazamRecognitionService,
            transcode: ffmpegTranscode,
        }
    ) {}

    async start(request: TrackRecognitionRequest, tasks: TaskManager) {
        const total = request.tracks.filter((track) => track.selected && !track.alreadyRecognized).length;
        const task = tasks.create('metadata.recognize', `Recognize ${total} track${total === 1 ? '' : 's'}`, total, 'tracks');
        tasks.start(task.id, 'preparing');
        void this.runTask(task.id, request, tasks);
        return tasks.get(task.id) as TaskSnapshot<TrackRecognitionTaskResult>;
    }

    async recognize(
        request: TrackRecognitionRequest,
        hooks: {
            isCancelled?(): boolean;
            onProgress?(progress: TrackRecognitionProgress): void;
        } = {}
    ): Promise<RecognizedTrackMetadata[]> {
        const candidates = request.tracks.filter((track) => track.selected && !track.alreadyRecognized);
        if (candidates.length === 0) return [];
        if (request.mode === 'line-in' && !request.deviceId) {
            throw new Error('Choose an audio input before starting song recognition.');
        }

        const recognition = await this.dependencies.createRecognitionService();
        const run = (readAdvancedTrack?: AdvancedTrackReader) =>
            this.recognizeCandidates(candidates, request, recognition, readAdvancedTrack, hooks);

        if (request.mode === 'exploits') {
            return this.client.runLocalAdvancedTrackDownloadSession(request.useSlowerExploit ?? false, run);
        }
        return run();
    }

    private async runTask(taskId: string, request: TrackRecognitionRequest, tasks: TaskManager) {
        const stages: Record<string, TaskStageProgress> = {
            recognition: { completed: 0, total: 0, currentLabel: 'reading' },
        };
        const isRunning = () => tasks.get(taskId).status === 'running';
        const isCancelled = () => {
            const task = tasks.get(taskId);
            return task.cancellationRequested || task.status === 'cancelled' || task.status === 'interrupted';
        };

        try {
            const results = await this.recognize(request, {
                isCancelled,
                onProgress: (progress) => {
                    if (!isRunning()) return;
                    if (progress.type === 'track') {
                        tasks.reportProgress(taskId, {
                            completed: progress.current,
                            currentLabel: `Track ${progress.trackIndex + 1}`,
                            stages,
                        });
                        return;
                    }
                    if (progress.type === 'phase') {
                        const phase =
                            progress.phase === 'reading' ? 'transferring' : progress.phase === 'calculating' ? 'converting' : 'finalizing';
                        if (tasks.get(taskId).phase !== phase) tasks.setPhase(taskId, phase);
                        stages.recognition = { completed: 0, total: 0, currentLabel: progress.phase };
                        tasks.reportProgress(taskId, { stages });
                        return;
                    }
                    stages.recognition = {
                        completed: progress.current,
                        total: progress.total,
                        currentLabel: 'reading',
                    };
                    tasks.reportProgress(taskId, { stages });
                },
            });
            if (!isRunning()) return;
            const result: TrackRecognitionTaskResult = { tracks: results };
            if (isCancelled()) tasks.cancel(taskId, result);
            else tasks.succeed(taskId, result);
        } catch (error) {
            if (!isRunning()) return;
            tasks.fail(taskId, error, {
                retryable: true,
                completedItems: tasks.get(taskId).progress.completed,
                pendingItems: tasks.get(taskId).progress.total - tasks.get(taskId).progress.completed,
                recoveryAction: 'Check the audio source and recognition service, then retry the remaining tracks.',
            });
        }
    }

    private async recognizeCandidates(
        tracks: TrackRecognitionInput[],
        request: TrackRecognitionRequest,
        recognition: AudioRecognitionService,
        readAdvancedTrack: AdvancedTrackReader | undefined,
        hooks: {
            isCancelled?(): boolean;
            onProgress?(progress: TrackRecognitionProgress): void;
        }
    ) {
        const results: RecognizedTrackMetadata[] = [];
        const isCancelled = () => hooks.isCancelled?.() === true;

        for (let current = 0; current < tracks.length && !isCancelled(); current += 1) {
            const track = tracks[current];
            hooks.onProgress?.({ type: 'track', current, total: tracks.length, trackIndex: track.index });
            if (track.duration < RECOGNITION_SAMPLE_SECONDS * RECOGNITION_ATTEMPTS) {
                results.push({ index: track.index, recognized: false, reason: 'too-short' });
                continue;
            }

            let match: RecognitionMatch | null = null;
            for (let attempt = 0; attempt < RECOGNITION_ATTEMPTS && !isCancelled() && match === null; attempt += 1) {
                hooks.onProgress?.({ type: 'phase', phase: 'reading' });
                hooks.onProgress?.({ type: 'read', current: 0, total: 1 });
                const startSeconds = attempt * RECOGNITION_SAMPLE_SECONDS;
                const captured =
                    request.mode === 'exploits'
                        ? await this.captureAdvancedTrack(track.index, startSeconds, readAdvancedTrack, isCancelled, hooks)
                        : await this.captureLineInput(track.index, startSeconds, request.deviceId!, isCancelled, hooks);

                if (isCancelled()) break;
                hooks.onProgress?.({ type: 'phase', phase: 'calculating' });
                const rawSamples = await this.dependencies.transcode(captured.data, captured.extension, '-ar 16000 -ac 1 -f s16le');
                if (isCancelled()) break;
                match = await recognition.recognize(rawSamples, (phase) => hooks.onProgress?.({ type: 'phase', phase }));
            }

            if (isCancelled()) break;
            results.push(
                match
                    ? {
                          index: track.index,
                          recognized: true,
                          title: match.title,
                          artist: match.artist,
                          album: match.album ?? 'Unknown',
                      }
                    : { index: track.index, recognized: false, reason: 'not-found' }
            );
        }
        return results;
    }

    private async captureAdvancedTrack(
        trackIndex: number,
        startSeconds: number,
        readAdvancedTrack: AdvancedTrackReader | undefined,
        isCancelled: () => boolean,
        hooks: { onProgress?(progress: TrackRecognitionProgress): void }
    ) {
        if (!readAdvancedTrack) throw new Error('The advanced track reader is unavailable.');
        return readAdvancedTrack(
            trackIndex,
            {
                nerawDownload: false,
                shouldCancel: isCancelled,
                handleBadSector: async () => 'abort',
                secondsToRead: RECOGNITION_SAMPLE_SECONDS,
                startSeconds,
                writeHeader: true,
            },
            (progress) => hooks.onProgress?.({ type: 'read', current: progress.read, total: progress.total })
        );
    }

    private async captureLineInput(
        trackIndex: number,
        startSeconds: number,
        deviceId: string,
        isCancelled: () => boolean,
        hooks: { onProgress?(progress: TrackRecognitionProgress): void }
    ) {
        const device = this.client.getWorkspaceSnapshot().device;
        if (!device) throw new Error('The MiniDisc device disconnected before recognition started.');
        const data = await this.client.runLocalPlaybackCaptureSession(
            { sessionId: device.sessionId, revision: device.revision },
            async (playback) => {
                await playback.control({ action: 'stop' });
                await playback.control({ action: 'gotoTrack', index: trackIndex });
                const [hour, minute, second, frame] = timeToSeekArgs(startSeconds);
                await playback.control({ action: 'seek', index: trackIndex, hour, minute, second, frame });
                await playback.control({ action: 'play' });
                return this.client.captureLocalAudioInput(
                    deviceId,
                    RECOGNITION_SAMPLE_SECONDS * 1000,
                    (percentage) => hooks.onProgress?.({ type: 'read', current: percentage, total: 100 }),
                    isCancelled
                );
            }
        );
        return { data, extension: 'wav' };
    }
}

export async function createShazamRecognitionService(): Promise<AudioRecognitionService> {
    const { s16LEToSamplesArray, Shazam } = await import('shazam-api');
    const shazam = new Shazam();
    const unrestrictedFetch = window.native?.unrestrictedFetchJSON;
    if (!unrestrictedFetch) {
        throw new Error('Song recognition is unavailable because unrestricted network access is not configured.');
    }
    shazam.endpoint.sendRecognizeRequest = async (url: string, body: string) =>
        unrestrictedFetch(url, {
            method: 'POST',
            body,
            headers: shazam.endpoint.headers(),
        });
    return {
        async recognize(samples, onPhase) {
            return shazam.recognizeSong(s16LEToSamplesArray(samples), (state) =>
                onPhase(state === 'generating' ? 'calculating' : 'identifying')
            );
        },
    };
}
