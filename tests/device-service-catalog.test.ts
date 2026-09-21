import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

Object.defineProperty(globalThis, 'window', { value: {}, configurable: true });

const {
    filterOutCorrupted,
    getConnectButtonName,
    getSimpleServices,
} = await import('../src/services/interface-service-manager.ts');

describe('device service catalog', () => {
    it('publishes stable ids for built-in device adapters', () => {
        assert.deepEqual(getSimpleServices(), [
            { id: 'usb-netmd', name: 'USB NetMD' },
            { id: 'himd-restricted', name: 'HiMD (metadata and export)' },
            { id: 'himd-full', name: 'HiMD (secure full access)' },
        ]);
        assert.equal(getConnectButtonName({ id: 'usb-netmd', name: 'Renamed display label' }), 'Connect');
        assert.equal(getSimpleServices().some((service) => service.id === 'remote-netmd'), false);
        assert.deepEqual(filterOutCorrupted([{id:'network-walkman-drm-free',name:'DRM-Free Network Walkman',parameters:{pid:'507'}},{id:'mock-netmd',name:'MockMD',parameters:{}}]), []);
    });

    it('drops saved Remote NetMD entries from the local-only product catalog', () => {
        assert.deepEqual(
            filterOutCorrupted([
                {
                    name: 'Remote NetMD',
                    parameters: { serverAddress: 'https://example.test/', friendlyName: 'Studio' },
                },
            ]),
            []
        );
    });
});
