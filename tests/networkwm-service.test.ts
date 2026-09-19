import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NetworkWMService } from '../src/services/interfaces/networkwm-nodrm.ts';
import { Capability } from '../src/services/interfaces/capabilities.ts';

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

    it('advertises only supported mutations and rejects cross-album moves', async () => {
        const service = createService();
        const capabilities = await service.getServiceCapabilities();
        assert.equal(capabilities.includes(Capability.trackRename), true);
        assert.equal(capabilities.includes(Capability.trackDelete), true);
        assert.equal(capabilities.includes(Capability.discRename), false);
        assert.equal(capabilities.includes(Capability.groupCreate), false);

        Object.assign(service, {
            cache: {
                nwjsTracks: [
                    { album: 'First', artist: 'Artist', trackNumber: 0 },
                    { album: 'Second', artist: 'Artist', trackNumber: 0 },
                ],
                groups: [],
                left: 0,
                total: 0,
                used: 0,
            },
        });

        await assert.rejects(() => service.moveTrack(0, 1), /same artist and album/);
        await assert.rejects(() => service.renameDisc('Unsupported'), /not supported/);
        assert.equal((await service.getDeviceStatus()).canBeFlushed, false);
    });
});
