import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NetMDInterface } from 'netmd-js';
import {
    createNetMDTransferGuard,
    NetMDTransferTerminationError,
} from '../src/services/interfaces/netmd-transfer-guard.ts';

const args = [] as unknown as Parameters<NetMDInterface['sendTrack']>;

describe('NetMD transfer failure guard', () => {
    it('returns successful transfers without sending a terminate command', async () => {
        let terminateCount = 0;
        const expected = [1, 'uuid', 'content'] as [number, string, string];
        const guarded = createNetMDTransferGuard({
            async sendTrack() {
                return expected;
            },
            async terminate() {
                terminateCount += 1;
            },
        } as unknown as NetMDInterface);

        assert.equal(await guarded.sendTrack(...args), expected);
        assert.equal(terminateCount, 0);
    });

    it('terminates the prepared protocol transaction before preserving the transfer error', async () => {
        const events: string[] = [];
        const transferError = new Error('USB bulk transfer failed');
        const guarded = createNetMDTransferGuard({
            async sendTrack() {
                events.push('transfer');
                throw transferError;
            },
            async terminate() {
                events.push('terminate');
            },
        } as unknown as NetMDInterface);

        await assert.rejects(guarded.sendTrack(...args), (error) => error === transferError);
        assert.deepEqual(events, ['transfer', 'terminate']);
    });

    it('reports when the recorder does not acknowledge protocol cleanup', async () => {
        const transferError = new Error('encryption worker failed');
        const terminationError = new Error('terminate rejected');
        const guarded = createNetMDTransferGuard({
            async sendTrack() {
                throw transferError;
            },
            async terminate() {
                throw terminationError;
            },
        } as unknown as NetMDInterface);

        await assert.rejects(guarded.sendTrack(...args), (error) => {
            assert(error instanceof NetMDTransferTerminationError);
            assert.equal(error.transferError, transferError);
            assert.equal(error.terminationError, terminationError);
            assert.match(error.message, /recording light is still flashing/);
            return true;
        });
    });
});
