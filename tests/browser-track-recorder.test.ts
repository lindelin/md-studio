import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BrowserTrackRecorder } from '../src/application/browser-track-recorder.ts';
import type { PlaybackSession } from '../src/application/contracts.ts';
import type { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import { TaskManager } from '../src/application/task-manager.ts';
import type { MediaRecorderService } from '../src/services/browserintegration/mediarecorder.ts';

describe('BrowserTrackRecorder', () => {
    it('records selected playback through one observable background task', async () => {
        const events: string[] = [];
        const mediaRecorder = {
            async initStream(deviceId: string) {
                events.push(`input:${deviceId}`);
            },
            async startRecording() {
                events.push('record:start');
            },
            async stopRecording() {
                events.push('record:stop');
            },
            async downloadRecorded(title: string) {
                events.push(`download:${title}`);
            },
            async closeStream() {
                events.push('input:close');
            },
        } as unknown as MediaRecorderService;

        const recorder = new BrowserTrackRecorder(
            mediaRecorder,
            async () => 'ready',
            async (_duration, progress) => {
                progress(50);
                return true;
            }
        );
        const application = {
            async refresh() {
                return {
                        sessionId: 'session',
                        revision: 7,
                        deviceName: 'Test device',
                        status: { discPresent: true },
                        capabilities: ['playback.control'],
                        recording: {
                            specName: 'MD',
                            measurementUnits: 'frames',
                            titleStorage: 'netmd-toc',
                            defaultFormat: [0, 0],
                            availableFormats: [
                                { codec: 'SPS', defaultBitrate: 292, availableBitrates: [292], secondsPerDefaultUnit: 1 },
                            ],
                        },
                        disc: {
                            title: 'Disc',
                            fullWidthTitle: null,
                            trackCount: 1,
                            groups: [
                                {
                                    index: 0,
                                    title: null,
                                    fullWidthTitle: null,
                                    tracks: [
                                        {
                                            index: 0,
                                            title: 'Song',
                                            fullWidthTitle: '曲',
                                            duration: 60,
                                            encoding: { codec: 'LP2', bitrate: 132 },
                                        },
                                    ],
                                },
                            ],
                        },
                };
            },
            async runPlaybackCaptureSession(
                version: { sessionId: string; revision: number },
                operation: (playback: PlaybackSession) => Promise<unknown>
            ) {
                assert.deepEqual(version, { sessionId: 'session', revision: 7 });
                return operation({
                    async control(command) {
                        if (command.action === 'gotoTrack') events.push(`goto:${command.index}`);
                        else events.push(command.action);
                    },
                    async readPosition() {
                        return [0, 0, 0, 2];
                    },
                });
            },
        } as unknown as MiniDiscApplication;
        const tasks = new TaskManager();

        const started = await recorder.start(
            { indexes: [0], deviceId: 'line-in', expectedRevision: 7 },
            application,
            tasks
        );
        let completed = tasks.get(started.id);
        for (let attempt = 0; attempt < 20 && completed.status === 'running'; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            completed = tasks.get(started.id);
        }

        assert.equal(completed.status, 'succeeded');
        assert.deepEqual(completed.result, { recordedTracks: 1, files: ['1. Song (曲).wav'] });
        assert.deepEqual(events.slice(0, 10), [
            'stop',
            'goto:0',
            'play',
            'pause',
            'goto:0',
            'input:line-in',
            'record:start',
            'play',
            'record:stop',
            'download:1. Song (曲)',
        ]);
        assert.equal(completed.progress.completed, 1);
    });
});
