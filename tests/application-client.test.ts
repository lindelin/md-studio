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
            workspace
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
});
