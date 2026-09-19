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
        const stages = {
            conversion: { completed: 1.5, total: 2, currentLabel: 'Track B' },
            transfer: { completed: 5, buffered: 7, total: 10, currentLabel: 'Track A' },
        };
        manager.reportProgress(task.id, { completed: 1, currentLabel: 'Track B', stages });
        stages.conversion.completed = 0;
        const finished = manager.succeed(task.id, { writtenTracks: 2 });
        assert.equal(finished.status, 'succeeded');
        assert.equal(finished.progress.completed, 2);
        assert.deepEqual(finished.result, { writtenTracks: 2 });
        assert.equal(finished.progress.stages?.conversion.completed, 1.5);
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
        assert.throws(() => manager.reportProgress(task.id, { currentPercent: 101 }), /100 percent/);
        assert.throws(() => manager.reportProgress(task.id, { stages: { transfer: { completed: 2, total: 1 } } }), /stage transfer/);
        const failed = manager.fail(task.id, new Error('USB disconnected'), {
            code: 'DEVICE_DISCONNECTED',
            retryable: true,
            completedItems: 0,
            pendingItems: 1,
            recoveryAction: 'Reconnect the device and retry.',
        });
        assert.deepEqual(failed.error, {
            code: 'DEVICE_DISCONNECTED',
            message: 'USB disconnected',
            phase: 'preparing',
            retryable: true,
            completedItems: 0,
            pendingItems: 1,
            recoveryAction: 'Reconnect the device and retry.',
            details: undefined,
        });
        assert.throws(() => manager.setPhase(task.id, 'finalizing'), /not running/);
    });

    it('preserves partial results when a running task is cancelled', () => {
        const manager = new TaskManager();
        const task = manager.create('track.export', 'Export tracks', 3, 'tracks');
        manager.start(task.id, 'transferring');
        manager.reportProgress(task.id, { completed: 1 });

        const cancelled = manager.cancel(task.id, { exportedTracks: 1, files: ['Track 1.oma'] });
        assert.equal(cancelled.status, 'cancelled');
        assert.deepEqual(cancelled.result, { exportedTracks: 1, files: ['Track 1.oma'] });
        assert.equal(cancelled.progress.completed, 1);
    });
});
