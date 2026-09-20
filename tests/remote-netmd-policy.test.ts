import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createOnlineServiceGuard } from '../src/application/online-service-policy.ts';
import { SettingsStore } from '../src/application/settings-store.ts';
import { NetMDRemoteService } from '../src/services/interfaces/remote-netmd.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function createService(settings = new SettingsStore(null)) {
    return new NetMDRemoteService({
        debug: false,
        serverAddress: 'https://example.test/',
        friendlyName: 'Test recorder',
        useChunkedTransfersForLP: false,
        guardOnlineService: createOnlineServiceGuard(settings),
    });
}

describe('Remote NetMD online-service policy', () => {
    it('blocks HTTP device requests before the network while online services are disabled', async () => {
        let requests = 0;
        globalThis.fetch = async () => {
            requests += 1;
            return new Response('{}', { status: 200 });
        };

        await assert.rejects(createService().pair(), (error: any) => error.code === 'ONLINE_SERVICE_DISABLED');
        assert.equal(requests, 0);
    });

    it('rechecks the live setting before every request on an existing device service', async () => {
        let requests = 0;
        globalThis.fetch = async () => {
            requests += 1;
            return Response.json({ ok: true, value: { version: '1.0', capabilities: [] } });
        };
        const settings = new SettingsStore(null);
        const service = createService(settings);

        settings.update({ onlineServicesEnabled: true });
        assert.equal(await service.pair(), true);
        settings.update({ onlineServicesEnabled: false });
        await assert.rejects(service.getDeviceStatus(), (error: any) => error.code === 'ONLINE_SERVICE_DISABLED');
        assert.equal(requests, 1);
    });

    it('blocks upload before creating a WebSocket or encryption worker', async () => {
        const service = createService();
        await assert.rejects(
            service.upload('', '', new ArrayBuffer(0), { codec: 'AT3', bitrate: 132 }, () => undefined),
            (error: any) => error.code === 'ONLINE_SERVICE_DISABLED'
        );
    });
});
