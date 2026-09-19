import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BrowserTrackExporter } from '../src/application/browser-track-exporter.ts';
import type { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import { TaskManager } from '../src/application/task-manager.ts';
import serviceRegistry from '../src/services/registry.ts';
import { Capability, type NetMDService } from '../src/services/interfaces/netmd.ts';
import type { AppStore } from '../src/redux/store.ts';

describe('BrowserTrackExporter', () => {
    it('routes browser and archive exports through the same background task', async () => {
        const originalService = serviceRegistry.netmdService;
        const downloads: number[] = [];
        serviceRegistry.netmdService = {
            async download(index: number, progress: (value: { read: number; total: number }) => void) {
                downloads.push(index);
                progress({ read: 3, total: 3 });
                return { data: Uint8Array.from([1, 2, 3]), extension: 'oma' };
            },
        } as unknown as NetMDService;

        try {
            const exporter = new BrowserTrackExporter({
                getState: () => ({ main: { deviceCapabilities: [Capability.trackDownload] } }),
            } as unknown as AppStore);
            const application = {
                async refresh() {
                    return {
                        sessionId: 'session',
                        revision: 4,
                        deviceName: 'Test device',
                        status: { discPresent: true },
                        capabilities: ['track.download'],
                        recording: {
                            specName: 'MD',
                            measurementUnits: 'frames',
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
                                            fullWidthTitle: null,
                                            duration: 60,
                                            encoding: { codec: 'LP2', bitrate: 132 },
                                        },
                                    ],
                                },
                            ],
                        },
                    };
                },
            } as unknown as MiniDiscApplication;
            const tasks = new TaskManager();
            const files: { name: string; data: number[] }[] = [];

            const started = await exporter.start(
                { indexes: [0], expectedRevision: 4 },
                application,
                tasks,
                (data, name) => files.push({ name, data: [...data] })
            );
            let completed = tasks.get(started.id);
            for (let attempt = 0; attempt < 20 && completed.status === 'running'; attempt += 1) {
                await new Promise((resolve) => setTimeout(resolve, 0));
                completed = tasks.get(started.id);
            }

            assert.equal(completed.status, 'succeeded');
            assert.deepEqual(downloads, [0]);
            assert.deepEqual(files, [{ name: '01. Song.oma', data: [1, 2, 3] }]);
            assert.deepEqual(completed.result, { exportedTracks: 1, files: ['01. Song.oma'] });
        } finally {
            serviceRegistry.netmdService = originalService;
        }
    });
});
