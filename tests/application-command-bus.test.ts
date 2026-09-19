import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApplicationCommandBus } from '../src/application/command-bus.ts';
import { ImportQueue, type ImportWriter } from '../src/application/import-queue.ts';
import type { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import { TaskManager } from '../src/application/task-manager.ts';
import { SettingsStore } from '../src/application/settings-store.ts';

describe('ApplicationCommandBus import writing', () => {
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
