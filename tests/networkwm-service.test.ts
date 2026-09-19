import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NetworkWMService } from '../src/services/interfaces/networkwm-nodrm.ts';

function createService() {
    return new NetworkWMService({ name: 'Test Walkman' } as ConstructorParameters<typeof NetworkWMService>[0]);
}

describe('NetworkWMService status contract', () => {
    it('does not claim unrelated WebUSB disconnect events', () => {
        const service = createService();

        assert.equal(service.isDeviceConnected({} as USBDevice), false);
    });

    it('publishes pending ordering changes through canBeFlushed', async () => {
        const service = createService();
        const tracks = [
            { album: 'Album', artist: 'Artist', trackNumber: 0 },
            { album: 'Album', artist: 'Artist', trackNumber: 1 },
        ];
        Object.assign(service, {
            cache: { nwjsTracks: tracks, groups: [], left: 0, total: 0, used: 0 },
            database: { flushUpdates: async () => undefined },
        });

        assert.equal((await service.getDeviceStatus()).canBeFlushed, false);

        await service.moveTrack(0, 1);
        assert.equal((await service.getDeviceStatus()).canBeFlushed, true);

        await service.flush();
        assert.equal((await service.getDeviceStatus()).canBeFlushed, false);
    });
});
