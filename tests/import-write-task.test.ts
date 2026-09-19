import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { finishRejectedImportWrite } from '../src/application/import-write-task.ts';
import { TaskManager } from '../src/application/task-manager.ts';

describe('rejected import write tasks', () => {
    it('cancels an interactive write before transfer without leaving a running task', () => {
        const tasks = new TaskManager();
        const task = tasks.create('disc.write', 'Write one track', 1, 'tracks');
        tasks.start(task.id, 'preparing');

        assert.equal(
            finishRejectedImportWrite(tasks, task.id, {
                kind: 'cancelled',
                reason: 'Homebrew confirmation was declined.',
                pendingItems: 1,
            }),
            true
        );
        assert.equal(tasks.get(task.id).status, 'cancelled');
        assert.deepEqual(tasks.get(task.id).result, {
            writtenTracks: 0,
            reason: 'Homebrew confirmation was declined.',
        });
    });

    it('fails an unavailable write with the full pending count and recovery advice', () => {
        const tasks = new TaskManager();
        const task = tasks.create('disc.write', 'Write two tracks', 2, 'tracks');
        tasks.start(task.id, 'preparing');

        finishRejectedImportWrite(tasks, task.id, {
            kind: 'unavailable',
            reason: 'ATRAC1 upload is unavailable.',
            pendingItems: 2,
            recoveryAction: 'Choose an LP recording mode or a compatible device.',
        });

        const failed = tasks.get(task.id);
        assert.equal(failed.status, 'failed');
        assert.equal(failed.error?.code, 'WRITE_UNAVAILABLE');
        assert.equal(failed.error?.completedItems, 0);
        assert.equal(failed.error?.pendingItems, 2);
        assert.equal(failed.error?.recoveryAction, 'Choose an LP recording mode or a compatible device.');
    });
});
