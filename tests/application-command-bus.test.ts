import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApplicationCommandBus } from '../src/application/command-bus.ts';
import { ImportQueue, type ImportWriter } from '../src/application/import-queue.ts';
import type { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import { TaskManager } from '../src/application/task-manager.ts';
import { SettingsStore } from '../src/application/settings-store.ts';
import { WorkspaceStore } from '../src/application/workspace-store.ts';
import type { TrackRecorder } from '../src/application/track-record.ts';

describe('ApplicationCommandBus import writing', () => {
    it('keeps settings and import planning available without a connected device', async () => {
        const settings = new SettingsStore(null);
        const imports = new ImportQueue();
        const bus = new ApplicationCommandBus(undefined, new TaskManager(), imports, undefined, undefined, settings);

        const updatedSettings = await bus.execute({ type: 'settings.update', changes: { colorTheme: 'dark' } });
        const addedImport = await bus.execute({
            type: 'import.add',
            inputs: [
                {
                    source: { kind: 'local-path', name: 'track.wav', reference: 'bridge-file:opaque' },
                    metadata: { title: 'Track' },
                },
            ],
        });

        assert.equal(updatedSettings.ok && updatedSettings.settings?.values.colorTheme, 'dark');
        assert.equal(addedImport.ok && addedImport.importQueue?.items[0]?.name, 'track.wav');
    });

    it('returns one disconnected workspace snapshot for UI and automation clients', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const settings = new SettingsStore(null);
        const workspace = new WorkspaceStore(tasks, imports, settings);
        const bus = new ApplicationCommandBus(undefined, tasks, imports, undefined, undefined, settings, workspace);
        imports.add([
            {
                source: { kind: 'local-path', name: 'queued.wav', reference: 'bridge-file:queued' },
                metadata: { title: 'Queued' },
            },
        ]);
        settings.update({ colorTheme: 'dark' });

        const result = await bus.execute({ type: 'workspace.get' });

        assert.equal(result.ok && result.workspace?.device, null);
        assert.equal(result.ok && result.workspace?.imports.items[0]?.title, 'Queued');
        assert.equal(result.ok && result.workspace?.settings.values.colorTheme, 'dark');
        assert.deepEqual(result.ok && result.workspace?.tasks, []);
    });

    it('returns a structured disconnected error only for commands that need a device', async () => {
        const bus = new ApplicationCommandBus(undefined, new TaskManager(), new ImportQueue());

        const result = await bus.execute({ type: 'disc.refresh' });

        assert.deepEqual(result, {
            ok: false,
            error: {
                code: 'DEVICE_NOT_CONNECTED',
                message: 'Connect a MiniDisc device in the application before using device commands.',
                details: undefined,
            },
        });
    });

    it('restores device commands when an application session is attached', async () => {
        const application = { refresh: async () => ({ revision: 7 }) } as unknown as MiniDiscApplication;
        const bus = new ApplicationCommandBus(undefined, new TaskManager(), new ImportQueue());
        bus.attachApplication(application);

        const result = await bus.execute({ type: 'disc.refresh' });

        assert.equal(result.ok && result.snapshot?.revision, 7);
    });

    it('rejects unknown runtime commands instead of reporting a false success', async () => {
        const bus = new ApplicationCommandBus({} as MiniDiscApplication, new TaskManager(), new ImportQueue());
        const result = await bus.execute({ type: 'unknown.command' } as any);
        assert.deepEqual(result, {
            ok: false,
            error: {
                code: 'INVALID_COMMAND',
                message: 'Unknown application command: unknown.command',
                details: undefined,
            },
        });
    });

    it('starts a background write through the injected application adapter', async () => {
        const tasks = new TaskManager();
        const imports = new ImportQueue();
        const added = imports.add([
            {
                source: { kind: 'local-path', name: 'track.wav', reference: 'bridge-file:opaque' },
                metadata: { title: 'Track' },
            },
        ]);
        let receivedFormat: { codec: string; bitrate: number } | undefined;
        const writer: ImportWriter = {
            async start(request, queue, taskManager) {
                queue.resolveSelection(request.ids, request.expectedRevision);
                receivedFormat = request.format;
                return taskManager.create('disc.write', 'Write one track', 1, 'tracks');
            },
        };
        const bus = new ApplicationCommandBus({} as MiniDiscApplication, tasks, imports, writer);
        const result = await bus.execute({
            type: 'import.write',
            format: { codec: 'AT3', bitrate: 132 },
            expectedRevision: added.revision,
        });

        assert.equal(result.ok, true);
        assert.equal(result.ok && result.task?.kind, 'disc.write');
        assert.deepEqual(receivedFormat, { codec: 'AT3', bitrate: 132 });
    });

    it('returns a structured failure when no write adapter is available', async () => {
        const bus = new ApplicationCommandBus({} as MiniDiscApplication, new TaskManager(), new ImportQueue());
        const result = await bus.execute({ type: 'import.write' });
        assert.deepEqual(result, {
            ok: false,
            error: {
                code: 'UNEXPECTED_ERROR',
                message: 'Audio writing is unavailable in this application environment.',
                details: undefined,
            },
        });
    });

    it('starts audio-input recording through the injected application adapter', async () => {
        const tasks = new TaskManager();
        let receivedDeviceId = '';
        const recorder: TrackRecorder = {
            async start(request, _application, taskManager) {
                receivedDeviceId = request.deviceId;
                return taskManager.create('track.record', 'Record one track', 1, 'tracks');
            },
        };
        const bus = new ApplicationCommandBus(
            {} as MiniDiscApplication,
            tasks,
            new ImportQueue(),
            undefined,
            undefined,
            new SettingsStore(null),
            undefined,
            recorder
        );

        const result = await bus.execute({ type: 'track.record', indexes: [0], deviceId: 'line-in' });

        assert.equal(result.ok && result.task?.kind, 'track.record');
        assert.equal(receivedDeviceId, 'line-in');
    });

    it('updates shared settings but rejects attempts to enable the local bridge', async () => {
        const settings = new SettingsStore(null);
        const bus = new ApplicationCommandBus(
            {} as MiniDiscApplication,
            new TaskManager(),
            new ImportQueue(),
            undefined,
            undefined,
            settings
        );

        const updated = await bus.execute({ type: 'settings.update', changes: { colorTheme: 'dark' }, expectedRevision: 0 });
        const rejected = await bus.execute({
            type: 'settings.update',
            changes: { minidiscLocalBridgeEnabled: true },
        } as any);

        assert.equal(updated.ok && updated.settings?.values.colorTheme, 'dark');
        assert.equal(rejected.ok, false);
        assert.equal(!rejected.ok && rejected.error.code, 'INVALID_INPUT');
    });
});
