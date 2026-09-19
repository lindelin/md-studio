import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DeviceGateway } from '../src/application/contracts.ts';
import { ImportQueue } from '../src/application/import-queue.ts';
import { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import { TaskManager } from '../src/application/task-manager.ts';
import { WorkspaceStore } from '../src/application/workspace-store.ts';
import { SettingsStore } from '../src/application/settings-store.ts';

function makeApplication() {
    let title = 'Workspace Disc';
    const gateway: DeviceGateway = {
        async readSnapshot() {
            return {
                deviceName: 'MockMD',
                status: { discPresent: true, canBeFlushed: false, state: 'stopped' } as any,
                capabilities: ['content.read', 'metadata.edit'],
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
                    title,
                    fullWidthTitle: '',
                    writable: true,
                    writeProtected: false,
                    used: 0,
                    left: 80,
                    total: 80,
                    trackCount: 0,
                    groups: [],
                } as any,
            };
        },
        async renameDisc(nextTitle) {
            title = nextTitle;
        },
        async renameTrack() {},
        async renameHiMDTrack() {},
        async renameGroup() {},
        async addGroup() {},
        async deleteGroup() {},
        async deleteTracks() {},
        async rewriteGroups() {},
        async moveTrack() {},
        async wipeDisc() {},
        async formatToHiMD() {},
        async flush() {},
        async ejectDisc() {},
        async controlPlayback() {},
    };
    return new MiniDiscApplication(gateway);
}

describe('WorkspaceStore', () => {
    it('combines device, import queue and task updates into one observable snapshot', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const settings = new SettingsStore(null);
        const store = new WorkspaceStore(tasks, imports, settings);
        const application = makeApplication();
        let changes = 0;
        store.subscribe(() => changes++);

        assert.deepEqual(store.getSnapshot().connection, {
            phase: 'disconnected',
            serviceName: null,
            method: null,
            message: null,
        });

        store.attachApplication(application);
        assert.equal(store.getSnapshot().device, null);
        await application.refresh();
        imports.add([
            {
                source: { kind: 'local-path', name: 'song.wav', reference: 'C:\\Music\\song.wav' },
                metadata: { title: 'Song' },
            },
        ]);
        const task = tasks.create('disc.write', 'Write Song', 1, 'tracks');
        tasks.start(task.id);
        settings.update({ colorTheme: 'dark' });

        const snapshot = store.getSnapshot();
        assert.equal(snapshot.device?.disc?.title, 'Workspace Disc');
        assert.equal(snapshot.imports.items[0].title, 'Song');
        assert.equal(snapshot.tasks[0].status, 'running');
        assert.equal(snapshot.settings.values.colorTheme, 'dark');
        assert.equal(changes, 6);

        store.detachApplication();
        assert.equal(store.getSnapshot().device, null);
        await application.renameDisc('Detached');
        assert.equal(store.getSnapshot().device, null);
    });

    it('publishes connection progress independently from device content', () => {
        const store = new WorkspaceStore(new TaskManager(), new ImportQueue(), new SettingsStore(null));
        let changes = 0;
        store.subscribe(() => changes++);

        store.setConnection({
            phase: 'connecting',
            serviceName: 'USB NetMD',
            method: null,
            message: null,
        });
        store.setConnection({
            phase: 'connected',
            serviceName: 'USB NetMD',
            method: 'paired',
            message: null,
        });

        assert.deepEqual(store.getSnapshot().connection, {
            phase: 'connected',
            serviceName: 'USB NetMD',
            method: 'paired',
            message: null,
        });
        assert.equal(store.getSnapshot().device, null);
        assert.equal(changes, 2);
    });
});
