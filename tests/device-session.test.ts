import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeviceSessionConnector, type DeviceSessionBindings } from '../src/application/device-session.ts';
import type { MiniDiscApplication } from '../src/application/minidisc-application.ts';
import type { MinidiscSpec, NetMDService } from '../src/services/interfaces/netmd.ts';

function makeConnector(connect: () => Promise<boolean>, pair: () => Promise<boolean>) {
    const bindings: DeviceSessionBindings = {};
    const application = {} as MiniDiscApplication;
    let bindCount = 0;
    const connector = new DeviceSessionConnector(bindings, () => {
        bindCount += 1;
        return application;
    });
    const service = { connect, pair } as NetMDService;
    const spec = {} as MinidiscSpec;
    return { bindings, application, connector, service, spec, bindCount: () => bindCount };
}

describe('DeviceSessionConnector', () => {
    it('uses an already authorized device without opening the pairing flow', async () => {
        let pairCount = 0;
        const fixture = makeConnector(
            async () => true,
            async () => {
                pairCount += 1;
                return true;
            }
        );

        const result = await fixture.connector.connect(fixture.service, fixture.spec);

        assert.equal(result.method, 'cached');
        assert.equal(result.application, fixture.application);
        assert.equal(pairCount, 0);
        assert.equal(fixture.bindCount(), 1);
        assert.equal(fixture.bindings.netmdService, fixture.service);
    });

    it('falls back to explicit pairing when a remembered connection fails', async () => {
        const cachedError = new Error('permission expired');
        const fixture = makeConnector(
            async () => {
                throw cachedError;
            },
            async () => true
        );

        const result = await fixture.connector.connect(fixture.service, fixture.spec);

        assert.equal(result.method, 'paired');
        assert.equal(result.application, fixture.application);
        assert.equal(result.cachedConnectionError, cachedError);
        assert.equal(fixture.bindCount(), 1);
    });

    it('clears an unusable service after the user does not pair it', async () => {
        const fixture = makeConnector(async () => false, async () => false);

        const result = await fixture.connector.connect(fixture.service, fixture.spec);

        assert.equal(result.application, null);
        assert.equal(result.method, null);
        assert.equal(fixture.bindCount(), 0);
        assert.equal(fixture.bindings.netmdService, undefined);
        assert.equal(fixture.bindings.netmdSpec, undefined);
    });
});
