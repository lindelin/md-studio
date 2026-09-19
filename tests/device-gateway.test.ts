import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NetMDDeviceGateway } from '../src/application/device-gateway.ts';
import type { MinidiscSpec, NetMDService } from '../src/services/interfaces/netmd.ts';

describe('NetMDDeviceGateway', () => {
    it('explicitly preserves groups when moving a track on every device type', async () => {
        const calls: unknown[][] = [];
        const service = {
            async moveTrack(...args: unknown[]) {
                calls.push(args);
            },
        } as unknown as NetMDService;
        const gateway = new NetMDDeviceGateway(service, {} as MinidiscSpec);

        await gateway.moveTrack(4, 1);

        assert.deepEqual(calls, [[4, 1, true]]);
    });
});
