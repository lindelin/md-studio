import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { InProcessApplicationClient } from '../src/application/application-client.ts';
import { ImportQueue } from '../src/application/import-queue.ts';
import { SettingsStore } from '../src/application/settings-store.ts';
import { TaskManager } from '../src/application/task-manager.ts';
import { WorkspaceStore } from '../src/application/workspace-store.ts';

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
            async () => tasks.create('export', 'Local export')
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
            async () => tasks.create('export', 'Local export')
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
            }
        );

        const task = await client.startLocalTrackExport({ indexes: [0, 2], convertToWav: true }, async () => {});

        assert.deepEqual(requests, [[0, 2]]);
        assert.equal(task.kind, 'track-export');
    });
});
