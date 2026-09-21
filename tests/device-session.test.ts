import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    describeDeviceSessionFailure,
    DeviceSessionConnector,
    type DeviceSessionBindings,
} from '../src/application/device-session.ts';
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
    it('passes the selected USB device to the cached connection and never substitutes another on failure', async () => {
        const selected = {} as USBDevice;
        const fixture = makeConnector(async () => true, async () => { throw new Error('Must not pair another device'); });
        fixture.service.connect = async device => { assert.equal(device, selected); return true; };
        const result = await fixture.connector.connect(fixture.service, fixture.spec, false, selected);
        assert.equal(result.method, 'cached');
        fixture.service.connect = async () => { throw new Error('Selected device unplugged'); };
        await assert.rejects(fixture.connector.connect(fixture.service, fixture.spec, false, selected), /Selected device unplugged/);
        assert.equal(fixture.bindings.netmdService, undefined);
    });
    it('honors explicit device selection instead of reconnecting a different cached device', async () => {
        let cachedCalls = 0;
        const fixture = makeConnector(async () => { cachedCalls++; return true; }, async () => true);
        const result = await fixture.connector.connect(fixture.service, fixture.spec, true);
        assert.equal(cachedCalls, 0);
        assert.equal(result.method, 'paired');
        assert.equal(fixture.bindCount(), 1);
    });

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

    it('times out a stuck remembered connection without racing the pairing flow', async () => {
        let finishConnect!: (connected: boolean) => void;
        let pairCount = 0;
        let finalizeCount = 0;
        const fixture = makeConnector(
            () =>
                new Promise<boolean>((resolve) => {
                    finishConnect = resolve;
                }),
            async () => {
                pairCount += 1;
                return true;
            }
        );
        fixture.service.finalize = async () => {
            finalizeCount += 1;
        };
        const connector = new DeviceSessionConnector(fixture.bindings, () => fixture.application, 5);

        const result = await connector.connect(fixture.service, fixture.spec);

        assert.equal(result.application, null);
        assert.equal(result.method, null);
        assert.match(describeDeviceSessionFailure(result), /did not finish reconnecting within 1 seconds/);
        assert.equal(pairCount, 0);
        assert.equal(fixture.bindings.netmdService, undefined);

        finishConnect(true);
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.equal(finalizeCount, 1);
    });

    it('explains a missing device and retains a cached reconnect error', () => {
        assert.equal(
            describeDeviceSessionFailure({ application: null, method: null }),
            'The browser did not return a compatible MiniDisc device. Check the USB cable, device power, Windows driver, and the WebUSB chooser, then try again.'
        );
        assert.match(
            describeDeviceSessionFailure({
                application: null,
                method: null,
                cachedConnectionError: new Error('Access denied'),
            }),
            /could not reconnect \(Access denied\).*No compatible device was selected/
        );
    });
});
