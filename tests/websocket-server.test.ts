import assert from 'node:assert/strict';
import { once } from 'node:events';
import { describe, it } from 'node:test';
import WebSocket from 'ws';
import { LocalBridgeBroker } from '../bridge/broker.ts';
import { startLocalBridgeServer } from '../bridge/websocket-server.ts';
import { BRIDGE_PROTOCOL_VERSION, type BridgeRequest } from '../src/application/bridge-protocol.ts';

describe('local bridge WebSocket server', () => {
    it('authenticates a loopback app and carries a command round trip over a real socket', async () => {
        const broker = new LocalBridgeBroker();
        const bridge = startLocalBridgeServer(broker, {
            host: '127.0.0.1',
            port: 0,
            token: 'test-token',
            allowedOrigins: ['http://localhost:5173'],
        });
        await bridge.ready;

        const socket = new WebSocket(`ws://${bridge.host}:${bridge.port}?token=test-token`, {
            origin: 'http://localhost:5173',
        });
        try {
            await once(socket, 'open');
            socket.send(
                JSON.stringify({
                    type: 'hello',
                    protocolVersion: BRIDGE_PROTOCOL_VERSION,
                    client: 'minidisc-workspace-app',
                })
            );
            await broker.waitForConnection(1_000);

            socket.on('message', (raw) => {
                const request = JSON.parse(raw.toString()) as BridgeRequest;
                socket.send(
                    JSON.stringify({
                        type: 'response',
                        protocolVersion: BRIDGE_PROTOCOL_VERSION,
                        id: request.id,
                        result: {
                            ok: false,
                            error: { code: 'DEVICE_NOT_CONNECTED', message: 'Connect a device' },
                        },
                    })
                );
            });

            const result = await broker.execute({ type: 'disc.refresh' }, 1_000);
            assert.deepEqual(result, {
                ok: false,
                error: { code: 'DEVICE_NOT_CONNECTED', message: 'Connect a device' },
            });
        } finally {
            socket.close();
            if (socket.readyState !== WebSocket.CLOSED) await once(socket, 'close');
            await bridge.close();
        }
    });

    it('rejects clients with the wrong token or browser origin', async () => {
        const broker = new LocalBridgeBroker();
        const bridge = startLocalBridgeServer(broker, {
            host: '127.0.0.1',
            port: 0,
            token: 'expected-token',
            allowedOrigins: ['http://localhost:5173'],
        });
        await bridge.ready;

        const expectRejected = async (token: string, origin: string) => {
            const socket = new WebSocket(`ws://${bridge.host}:${bridge.port}?token=${token}`, { origin });
            await new Promise<void>((resolve, reject) => {
                socket.once('open', () => reject(new Error('Unauthorized bridge client connected.')));
                socket.once('error', () => resolve());
            });
            socket.terminate();
        };

        try {
            await expectRejected('wrong-token', 'http://localhost:5173');
            await expectRejected('expected-token', 'http://malicious.invalid');
            assert.equal(broker.isConnected(), false);
        } finally {
            await bridge.close();
        }
    });
});
