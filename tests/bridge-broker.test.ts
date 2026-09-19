import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BRIDGE_PROTOCOL_VERSION, type BridgeRequest } from '../src/application/bridge-protocol.ts';
import { LocalBridgeBroker, type BridgePeer } from '../bridge/broker.ts';

describe('LocalBridgeBroker', () => {
    it('forwards a command to the app and resolves its response', async () => {
        const broker = new LocalBridgeBroker();
        let request: BridgeRequest | undefined;
        const peer: BridgePeer = {
            send(data) {
                request = JSON.parse(data);
            },
        };
        broker.attach(peer);
        broker.handleMessage(peer, JSON.stringify({ type: 'hello', protocolVersion: BRIDGE_PROTOCOL_VERSION, client: 'webminidisc-app' }));
        const resultPromise = broker.execute({ type: 'disc.refresh' });
        assert.equal(request?.command.type, 'disc.refresh');
        broker.handleMessage(
            peer,
            JSON.stringify({
                type: 'response',
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                id: request!.id,
                result: { ok: false, error: { code: 'DEVICE_NOT_CONNECTED', message: 'Connect a device' } },
            })
        );
        assert.deepEqual(await resultPromise, {
            ok: false,
            error: { code: 'DEVICE_NOT_CONNECTED', message: 'Connect a device' },
        });
    });

    it('rejects pending commands when the app disconnects', async () => {
        const broker = new LocalBridgeBroker();
        const peer: BridgePeer = { send() {} };
        const detach = broker.attach(peer);
        broker.handleMessage(peer, JSON.stringify({ type: 'hello', protocolVersion: BRIDGE_PROTOCOL_VERSION, client: 'webminidisc-app' }));
        const pending = broker.execute({ type: 'task.list' });
        detach();
        await assert.rejects(pending, /disconnected/);
    });

    it('does not accept commands until the app completes its handshake', async () => {
        const broker = new LocalBridgeBroker();
        const peer: BridgePeer = { send() {} };
        broker.attach(peer);

        assert.equal(broker.isConnected(), false);
        await assert.rejects(broker.execute({ type: 'disc.refresh' }), /Open the MiniDisc application/);
    });

    it('allows callers to wait for an application connection', async () => {
        const broker = new LocalBridgeBroker();
        const peer: BridgePeer = { send() {} };
        broker.attach(peer);
        const connected = broker.waitForConnection(100);

        broker.handleMessage(peer, JSON.stringify({ type: 'hello', protocolVersion: BRIDGE_PROTOCOL_VERSION, client: 'webminidisc-app' }));

        await connected;
        assert.equal(broker.isConnected(), true);
    });
});
