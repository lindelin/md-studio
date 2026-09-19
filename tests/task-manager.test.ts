import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaskManager } from '../src/application/task-manager.ts';

describe('TaskManager', () => {
    it('reports a complete lifecycle with observable snapshots', () => {
        const manager = new TaskManager();
        const events: string[] = [];
        manager.subscribe((task) => events.push(`${task.status}:${task.phase}:${task.progress.completed}`));
        const task = manager.create('disc.write', 'Write two tracks', 2, 'tracks');
        manager.start(task.id);
        manager.setPhase(task.id, 'transferring');
        manager.reportProgress(task.id, { completed: 1, currentLabel: 'Track B' });
        const finished = manager.succeed(task.id, { writtenTracks: 2 });
        assert.equal(finished.status, 'succeeded');
        assert.equal(finished.progress.completed, 2);
        assert.deepEqual(finished.result, { writtenTracks: 2 });
        assert.deepEqual(events, [
            'queued:queued:0',
            'running:preparing:0',
            'running:transferring:0',
            'running:transferring:1',
            'succeeded:complete:2',
        ]);
    });

    it('supports cooperative cancellation without marking the task complete early', () => {
        const manager = new TaskManager();
        const task = manager.create('disc.write', 'Write a track');
        manager.start(task.id);
        const requested = manager.requestCancellation(task.id);
        assert.equal(requested.status, 'running');
        assert.equal(manager.isCancellationRequested(task.id), true);
        assert.equal(manager.cancel(task.id).status, 'cancelled');
    });

    it('rejects invalid progress and updates after completion', () => {
        const manager = new TaskManager();
        const task = manager.create('disc.write', 'Write a track');
        manager.start(task.id);
        assert.throws(() => manager.reportProgress(task.id, { completed: 2 }), /between zero/);
        manager.fail(task.id, new Error('USB disconnected'));
        assert.throws(() => manager.setPhase(task.id, 'finalizing'), /not running/);
    });
});
