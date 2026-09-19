import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ApplicationClient } from '../src/application/application-client.ts';
import {
    BrowserTrackRecognizer,
    type AudioRecognitionService,
    type BrowserTrackRecognizerDependencies,
    type TrackRecognitionProgress,
} from '../src/application/browser-track-recognizer.ts';
import type { AdvancedTrackReader, PlaybackSession } from '../src/application/contracts.ts';

function createRecognizer(
    client: Partial<ApplicationClient>,
    recognition: AudioRecognitionService,
    transcode: BrowserTrackRecognizerDependencies['transcode'] = async (data) => data
) {
    return new BrowserTrackRecognizer(client as ApplicationClient, {
        async createRecognitionService() {
            return recognition;
        },
        transcode,
    });
}

describe('BrowserTrackRecognizer', () => {
    it('owns advanced capture attempts and reports short and recognized tracks', async () => {
        const offsets: number[] = [];
        const progress: TrackRecognitionProgress[] = [];
        let recognitionAttempts = 0;
        const reader: AdvancedTrackReader = async (_index, options, onProgress) => {
            offsets.push(options.startSeconds!);
            onProgress({ read: 6, total: 12, action: 'READ' });
            return { data: new Uint8Array([1, 2]), extension: 'aea' };
        };
        const client = {
            async runLocalAdvancedTrackDownloadSession<T>(
                useSlowerExploit: boolean,
                operation: (readTrack: AdvancedTrackReader) => Promise<T>
            ) {
                assert.equal(useSlowerExploit, true);
                return operation(reader);
            },
        };
        const recognizer = createRecognizer(client, {
            async recognize(_samples, onPhase) {
                recognitionAttempts += 1;
                onPhase('identifying');
                return recognitionAttempts === 1
                    ? null
                    : { title: 'Recognized', artist: 'Artist', album: 'Album' };
            },
        });

        const results = await recognizer.recognize(
            {
                mode: 'exploits',
                useSlowerExploit: true,
                tracks: [
                    { index: 0, duration: 20, selected: true, alreadyRecognized: false },
                    { index: 1, duration: 90, selected: true, alreadyRecognized: false },
                    { index: 2, duration: 90, selected: false, alreadyRecognized: false },
                ],
            },
            { onProgress: (event) => progress.push(event) }
        );

        assert.deepEqual(offsets, [0, 12]);
        assert.deepEqual(results, [
            { index: 0, recognized: false, reason: 'too-short' },
            { index: 1, recognized: true, title: 'Recognized', artist: 'Artist', album: 'Album' },
        ]);
        assert.deepEqual(
            progress.filter((event) => event.type === 'track').map((event) => event.current),
            [0, 1]
        );
    });

    it('captures line input through the versioned playback session', async () => {
        const commands: unknown[] = [];
        const captureCalls: unknown[] = [];
        const transcodeCalls: unknown[] = [];
        const playback: PlaybackSession = {
            async control(command) {
                commands.push(command);
            },
            async readPosition() {
                return null;
            },
        };
        const client = {
            getWorkspaceSnapshot() {
                return { device: { sessionId: 'session', revision: 4 } };
            },
            async runLocalPlaybackCaptureSession<T>(
                version: { sessionId: string; revision: number },
                operation: (session: PlaybackSession) => Promise<T>
            ) {
                assert.deepEqual(version, { sessionId: 'session', revision: 4 });
                return operation(playback);
            },
            async captureLocalAudioInput(deviceId: string, durationMs: number) {
                captureCalls.push({ deviceId, durationMs });
                return new Uint8Array([3, 4]);
            },
        };
        const recognizer = createRecognizer(
            client,
            {
                async recognize() {
                    return { title: 'Line song', artist: 'Line artist' };
                },
            },
            async (data, extension, parameters) => {
                transcodeCalls.push({ data: [...data], extension, parameters });
                return new Uint8Array([5, 6]);
            }
        );

        const results = await recognizer.recognize({
            mode: 'line-in',
            deviceId: 'audio-input',
            tracks: [{ index: 7, duration: 80, selected: true, alreadyRecognized: false }],
        });

        assert.deepEqual(commands, [
            { action: 'stop' },
            { action: 'gotoTrack', index: 7 },
            { action: 'seek', index: 7, hour: 0, minute: 0, second: 0, frame: 0 },
            { action: 'play' },
        ]);
        assert.deepEqual(captureCalls, [{ deviceId: 'audio-input', durationMs: 12_000 }]);
        assert.deepEqual(transcodeCalls, [
            { data: [3, 4], extension: 'wav', parameters: '-ar 16000 -ac 1 -f s16le' },
        ]);
        assert.deepEqual(results, [
            { index: 7, recognized: true, title: 'Line song', artist: 'Line artist', album: 'Unknown' },
        ]);
    });

    it('stops before another attempt after cancellation', async () => {
        let cancelled = false;
        let reads = 0;
        const client = {
            async runLocalAdvancedTrackDownloadSession<T>(
                _useSlowerExploit: boolean,
                operation: (readTrack: AdvancedTrackReader) => Promise<T>
            ) {
                return operation(async () => {
                    reads += 1;
                    return { data: new Uint8Array([1]), extension: 'aea' };
                });
            },
        };
        const recognizer = createRecognizer(client, {
            async recognize() {
                cancelled = true;
                return null;
            },
        });

        const results = await recognizer.recognize(
            {
                mode: 'exploits',
                tracks: [{ index: 1, duration: 90, selected: true, alreadyRecognized: false }],
            },
            { isCancelled: () => cancelled }
        );

        assert.equal(reads, 1);
        assert.deepEqual(results, []);
    });

    it('requires an audio input for line-in recognition', async () => {
        const recognizer = createRecognizer({}, { async recognize() { return null; } });
        await assert.rejects(
            recognizer.recognize({
                mode: 'line-in',
                tracks: [{ index: 1, duration: 90, selected: true, alreadyRecognized: false }],
            }),
            /Choose an audio input/
        );
    });
});
