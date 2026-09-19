import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NetMDDeviceGateway } from '../src/application/device-gateway.ts';
import { Capability, DefaultMinidiscSpec, type MinidiscSpec, type NetMDService } from '../src/services/interfaces/netmd.ts';

describe('NetMDDeviceGateway', () => {
    it('publishes a serializable recording profile with every device snapshot', async () => {
        const service = {
            async getDeviceStatus() {
                return { discPresent: false, state: 'stopped', track: 0 };
            },
            async getDeviceName() {
                return 'Test device';
            },
            async getServiceCapabilities() {
                return [Capability.nativeMonoUpload];
            },
        } as unknown as NetMDService;
        const gateway = new NetMDDeviceGateway(service, new DefaultMinidiscSpec());

        const snapshot = await gateway.readSnapshot();

        assert.equal(snapshot.recording.specName, 'MD');
        assert.equal(snapshot.recording.availableFormats[2].userFriendlyName, 'LP2');
        assert.equal(snapshot.recording.availableFormats[2].secondsPerDefaultUnit, 2);
        assert.equal(snapshot.capabilities.includes('track.uploadMono'), true);
        assert.doesNotThrow(() => JSON.stringify(snapshot));
    });

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
