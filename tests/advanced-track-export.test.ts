import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BrowserAdvancedTrackExporter } from '../src/application/advanced-track-export.ts';
import type { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import { TaskManager } from '../src/application/task-manager.ts';

describe('BrowserAdvancedTrackExporter', () => {
    it('publishes recovery progress and files through one cancellable task', async () => {
        const application = {
            async refresh() {
                return {
                    disc: {
                        groups: [{ tracks: [{ index: 0, title: 'Recovered', duration: 60 }] }],
                    },
                };
            },
            async exportAdvancedTracks(indexes: number[], _slower: boolean, _options: unknown, _authorization: symbol, onProgress: Function, onTrack: Function) {
                onProgress(indexes[0], { read: 4, total: 8, action: 'READ', sector: '20' });
                await onTrack(indexes[0], { data: Uint8Array.from([1, 2, 3]), extension: 'aea' });
                return 1;
            },
        } as unknown as MiniDiscApplication;
        const tasks = new TaskManager();
        const files: { name: string; data: number[] }[] = [];

        const started = await new BrowserAdvancedTrackExporter().start(
            { indexes: [0], convertToWav: false, nerawDownload: false, useSlowerExploit: true },
            application,
            tasks,
            (data, name) => files.push({ name, data: [...data] }),
            async () => 'skip'
        );
        let completed = tasks.get(started.id);
        for (let attempt = 0; attempt < 20 && completed.status === 'running'; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            completed = tasks.get(started.id);
        }

        assert.equal(completed.status, 'succeeded');
        assert.deepEqual(files, [{ name: '01. Recovered.aea', data: [1, 2, 3] }]);
        assert.deepEqual(completed.result, { exportedTracks: 1, files: ['01. Recovered.aea'] });
    });
});
