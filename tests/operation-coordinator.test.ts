import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeviceOperationCoordinator } from '../src/application/operation-coordinator.ts';

describe('DeviceOperationCoordinator', () => {
    it('serializes device transactions and continues after a failed transaction', async () => {
        const coordinator = new DeviceOperationCoordinator();
        const events: string[] = [];
        let releaseFirst!: () => void;
        const gate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const first = coordinator.run(async () => {
            events.push('first:start');
            await gate;
            events.push('first:end');
            throw new Error('expected failure');
        });
        const second = coordinator.run(async () => {
            events.push('second:start');
            events.push('second:end');
            return 42;
        });

        await Promise.resolve();
        assert.deepEqual(events, ['first:start']);
        releaseFirst();
        await assert.rejects(first, /expected failure/);
        assert.equal(await second, 42);
        assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
    });
});
