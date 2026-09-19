import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InProcessApplicationClient } from '../src/application/application-client.ts';
import { ImportQueue } from '../src/application/import-queue.ts';
import { SettingsStore } from '../src/application/settings-store.ts';
import { TaskManager } from '../src/application/task-manager.ts';
import { WorkspaceStore } from '../src/application/workspace-store.ts';
import type { AdvancedTrackReader, AdvancedUploadService, DeviceSnapshot } from '../src/application/contracts.ts';

async function runAdvancedSession<T>(
    _useSlowerExploit: boolean,
    operation: (readTrack: AdvancedTrackReader) => Promise<T>
) {
    return operation(async () => ({ data: new Uint8Array(), extension: 'aea' }));
}

async function runUploadSession<T>(
    _requiredCapabilities: string[],
    operation: (service?: AdvancedUploadService) => Promise<T>
) {
    return { value: await operation(), snapshot: {} as DeviceSnapshot };
}

describe('InProcessApplicationClient', () => {
    it('offers one command and subscription interface for browser UI state', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const workspace = new WorkspaceStore(tasks, imports, new SettingsStore(null));
        const commands: string[] = [];
        const client = new InProcessApplicationClient(
            {
                async execute(command) {
                    commands.push(command.type);
                    return { ok: true, workspace: workspace.getSnapshot() };
                },
            },
            workspace,
            imports,
            async () => tasks.create('export', 'Local export'),
            async () => tasks.create('advanced.memory-export', 'Memory export'),
            async () => tasks.create('advanced.track-export', 'Advanced export'),
            runAdvancedSession,
            runUploadSession
        );
        const initial = client.getWorkspaceSnapshot();
        let notifications = 0;
        const unsubscribe = client.subscribe(() => {
            notifications += 1;
        });

        const result = await client.execute({ type: 'workspace.get' });
        imports.add([
            {
                source: { kind: 'browser-file', name: 'one.wav', reference: 'browser:one' },
                metadata: { title: 'One' },
            },
        ]);

        assert.equal(result.ok, true);
        assert.deepEqual(commands, ['workspace.get']);
        assert.equal(notifications, 1);
        assert.notEqual(client.getWorkspaceSnapshot(), initial);
        assert.equal(client.getWorkspaceSnapshot().imports.items[0].title, 'One');
        unsubscribe();
    });

    it('keeps browser-local payloads behind the in-process client boundary', () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const workspace = new WorkspaceStore(tasks, imports, new SettingsStore(null));
        const client = new InProcessApplicationClient(
            {
                async execute() {
                    return { ok: true };
                },
            },
            workspace,
            imports,
            async () => tasks.create('export', 'Local export'),
            async () => tasks.create('advanced.memory-export', 'Memory export'),
            async () => tasks.create('advanced.track-export', 'Advanced export'),
            runAdvancedSession,
            runUploadSession
        );
        const payload = { browserFile: true };

        const result = client.addLocalImports([
            {
                source: { kind: 'browser-file', name: 'local.wav', reference: 'browser:local' },
                metadata: { title: 'Local' },
                payload,
            },
        ]);

        assert.equal(result.items[0].title, 'Local');
        assert.equal(imports.resolvePayload(result.items[0].id), payload);
    });

    it('routes UI-only export sinks without exposing them to serializable commands', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const workspace = new WorkspaceStore(tasks, imports, new SettingsStore(null));
        const requests: number[][] = [];
        const client = new InProcessApplicationClient(
            {
                async execute() {
                    return { ok: true };
                },
            },
            workspace,
            imports,
            async (request) => {
                requests.push(request.indexes);
                return tasks.create('track-export', 'Local export');
            },
            async () => tasks.create('advanced.memory-export', 'Memory export'),
            async () => tasks.create('advanced.track-export', 'Advanced export'),
            runAdvancedSession,
            runUploadSession
        );

        const task = await client.startLocalTrackExport({ indexes: [0, 2], convertToWav: true }, async () => {});

        assert.deepEqual(requests, [[0, 2]]);
        assert.equal(task.kind, 'track-export');
    });

    it('routes browser-only advanced memory exports through the local adapter', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const workspace = new WorkspaceStore(tasks, imports, new SettingsStore(null));
        const requestedKinds: string[] = [];
        const client = new InProcessApplicationClient(
            {
                async execute() {
                    return { ok: true };
                },
            },
            workspace,
            imports,
            async () => tasks.create('track-export', 'Local export'),
            async (kind) => {
                requestedKinds.push(kind);
                return tasks.create('advanced.memory-export', 'Memory export');
            },
            async () => tasks.create('advanced.track-export', 'Advanced export'),
            runAdvancedSession,
            runUploadSession
        );

        const task = await client.startLocalAdvancedMemoryExport('firmware', async () => {});

        assert.deepEqual(requestedKinds, ['firmware']);
        assert.equal(task.kind, 'advanced.memory-export');
    });

    it('routes browser-authorized recovery exports through the local adapter', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const workspace = new WorkspaceStore(tasks, imports, new SettingsStore(null));
        const indexes: number[][] = [];
        const client = new InProcessApplicationClient(
            { async execute() { return { ok: true }; } },
            workspace,
            imports,
            async () => tasks.create('track-export', 'Local export'),
            async () => tasks.create('advanced.memory-export', 'Memory export'),
            async (request) => {
                indexes.push(request.indexes);
                return tasks.create('advanced.track-export', 'Advanced export');
            },
            runAdvancedSession,
            runUploadSession
        );

        const task = await client.startLocalAdvancedTrackExport(
            { indexes: [1], convertToWav: false, nerawDownload: false, useSlowerExploit: false },
            async () => {},
            async () => 'skip'
        );

        assert.deepEqual(indexes, [[1]]);
        assert.equal(task.kind, 'advanced.track-export');
    });

    it('keeps an interactive advanced read session inside the local client boundary', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const workspace = new WorkspaceStore(tasks, imports, new SettingsStore(null));
        const sessionModes: boolean[] = [];
        const client = new InProcessApplicationClient(
            { async execute() { return { ok: true }; } },
            workspace,
            imports,
            async () => tasks.create('track-export', 'Local export'),
            async () => tasks.create('advanced.memory-export', 'Memory export'),
            async () => tasks.create('advanced.track-export', 'Advanced export'),
            async (slower, operation) => {
                sessionModes.push(slower);
                return operation(async () => ({ data: Uint8Array.from([7]), extension: 'aea' }));
            },
            runUploadSession
        );

        const extension = await client.runLocalAdvancedTrackDownloadSession(true, async (readTrack) =>
            (await readTrack(0, {
                nerawDownload: false,
                shouldCancel: () => false,
                handleBadSector: async () => 'abort',
            }, () => {})).extension
        );

        assert.equal(extension, 'aea');
        assert.deepEqual(sessionModes, [true]);
    });

    it('keeps advanced upload adapters out of serializable commands', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const workspace = new WorkspaceStore(tasks, imports, new SettingsStore(null));
        const capabilities: string[][] = [];
        const client = new InProcessApplicationClient(
            { async execute() { return { ok: true }; } },
            workspace,
            imports,
            async () => tasks.create('track-export', 'Local export'),
            async () => tasks.create('advanced.memory-export', 'Memory export'),
            async () => tasks.create('advanced.track-export', 'Advanced export'),
            runAdvancedSession,
            async (required, operation) => {
                capabilities.push(required);
                const value = await operation({
                    async uploadSP() { return 0; },
                    async enableMonoUpload() {},
                });
                return { value, snapshot: {} as DeviceSnapshot };
            }
        );

        const value = await client.runLocalDeviceUploadSession(['uploadAtrac1'], async (service) => {
            await service!.uploadSP('Title', '', false, new ArrayBuffer(0), () => {});
            return 'done';
        });

        assert.equal(value.value, 'done');
        assert.deepEqual(capabilities, [['uploadAtrac1']]);
    });

    it('captures browser-only library audio processing behind the local client boundary', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const workspace = new WorkspaceStore(tasks, imports, new SettingsStore(null));
        const requestedPaths: string[] = [];
        const client = new InProcessApplicationClient(
            { async execute() { return { ok: true }; } },
            workspace,
            imports,
            async () => tasks.create('track-export', 'Local export'),
            async () => tasks.create('advanced.memory-export', 'Memory export'),
            async () => tasks.create('advanced.track-export', 'Advanced export'),
            runAdvancedSession,
            runUploadSession,
            (path) => {
                requestedPaths.push(path);
                return async () => Uint8Array.from([1, 2, 3]).buffer;
            }
        );

        const processFile = client.createLocalLibraryFileProcessor('Album/Track.flac');
        const result = await processFile({ format: { codec: 'PCM', bitrate: 1411 }, enableReplayGain: false });

        assert.deepEqual(requestedPaths, ['Album/Track.flac']);
        assert.deepEqual([...new Uint8Array(result)], [1, 2, 3]);
    });
});
