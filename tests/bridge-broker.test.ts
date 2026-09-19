import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BRIDGE_PROTOCOL_VERSION, type BridgeRequest } from '../src/application/bridge-protocol.ts';
import { LocalBridgeBroker, type BridgePeer } from '../bridge/broker.ts';
import type { FileChunkProvider } from '../bridge/local-file-registry.ts';

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
        broker.handleMessage(
            peer,
            JSON.stringify({ type: 'hello', protocolVersion: BRIDGE_PROTOCOL_VERSION, client: 'minidisc-workspace-app' })
        );
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
        broker.handleMessage(
            peer,
            JSON.stringify({ type: 'hello', protocolVersion: BRIDGE_PROTOCOL_VERSION, client: 'minidisc-workspace-app' })
        );
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

        broker.handleMessage(
            peer,
            JSON.stringify({ type: 'hello', protocolVersion: BRIDGE_PROTOCOL_VERSION, client: 'minidisc-workspace-app' })
        );

        await connected;
        assert.equal(broker.isConnected(), true);
    });

    it('serves registered local audio only through opaque handles', async () => {
        const files: FileChunkProvider = {
            async readChunk(handle, offset, length) {
                assert.equal(handle, 'opaque-handle');
                assert.equal(offset, 2);
                assert.equal(length, 3);
                return {
                    name: 'track.wav',
                    mimeType: 'audio/wav',
                    size: 5,
                    offset,
                    data: Uint8Array.from([3, 4, 5]),
                };
            },
        };
        const broker = new LocalBridgeBroker(files);
        const sent: string[] = [];
        const peer: BridgePeer = { send: (data) => sent.push(data) };
        broker.attach(peer);
        await broker.handleMessage(
            peer,
            JSON.stringify({ type: 'hello', protocolVersion: BRIDGE_PROTOCOL_VERSION, client: 'minidisc-workspace-app' })
        );
        await broker.handleMessage(
            peer,
            JSON.stringify({
                type: 'file.request',
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                id: 'file-request',
                handle: 'opaque-handle',
                offset: 2,
                length: 3,
            })
        );

        assert.deepEqual(JSON.parse(sent[0]), {
            type: 'file.response',
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            id: 'file-request',
            ok: true,
            name: 'track.wav',
            mimeType: 'audio/wav',
            size: 5,
            offset: 2,
            data: 'AwQF',
        });
    });
});
