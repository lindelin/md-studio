import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { waitForTrackReady } from '../src/domain/playback-position.ts';

describe('waitForTrackReady', () => {
    it('accepts the requested track after playback advances beyond one second', async () => {
        const positions = [null, [2, 0, 0, 0, 10], [2, 0, 0, 1, 0]];
        let time = 0;
        const result = await waitForTrackReady(2, async () => positions.shift() ?? null, {
            now: () => time,
            sleep: async (milliseconds) => {
                time += milliseconds;
            },
        });
        assert.equal(result, 'ready');
    });

    it('has a bounded timeout when the device never reports a usable position', async () => {
        let time = 0;
        await assert.rejects(
            waitForTrackReady(0, async () => null, {
                timeoutMs: 500,
                pollIntervalMs: 250,
                now: () => time,
                sleep: async (milliseconds) => {
                    time += milliseconds;
                },
            }),
            /Timed out/
        );
    });

    it('stops polling when cancellation is requested', async () => {
        const result = await waitForTrackReady(0, async () => null, { isCancelled: () => true });
        assert.equal(result, 'cancelled');
    });
});
