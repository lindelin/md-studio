import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BRIDGE_FILE_CHUNK_SIZE, BRIDGE_PROTOCOL_VERSION, parseBridgeMessage } from '../src/application/bridge-protocol.ts';

describe('bridge protocol validation', () => {
    it('accepts complete messages used by the local bridge', () => {
        assert.equal(
            parseBridgeMessage({
                type: 'request',
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                id: 'request-1',
                command: { type: 'disc.refresh' },
            }).type,
            'request'
        );
        assert.equal(
            parseBridgeMessage({
                type: 'file.write.request',
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                id: 'write-1',
                outputHandle: 'output',
                fileId: 'file',
                name: 'track.oma',
                offset: 0,
                data: 'AQID',
                complete: true,
            }).type,
            'file.write.request'
        );
    });

    it('rejects malformed, oversized, and unknown messages before dispatch', () => {
        assert.throws(
            () =>
                parseBridgeMessage({
                    type: 'request',
                    protocolVersion: BRIDGE_PROTOCOL_VERSION,
                    id: '',
                    command: { type: 'disc.refresh' },
                }),
            /ID/
        );
        assert.throws(
            () =>
                parseBridgeMessage({
                    type: 'file.request',
                    protocolVersion: BRIDGE_PROTOCOL_VERSION,
                    id: 'file-1',
                    handle: 'handle',
                    offset: 0,
                    length: BRIDGE_FILE_CHUNK_SIZE + 1,
                }),
            /chunk length/
        );
        assert.throws(
            () =>
                parseBridgeMessage({
                    type: 'file.write.request',
                    protocolVersion: BRIDGE_PROTOCOL_VERSION,
                    id: 'write-1',
                    outputHandle: 'output',
                    fileId: 'file',
                    name: 'track.oma',
                    offset: 0,
                    data: 'not base64',
                    complete: true,
                }),
            /base64/
        );
        assert.throws(
            () => parseBridgeMessage({ type: 'unknown', protocolVersion: BRIDGE_PROTOCOL_VERSION }),
            /Unknown bridge message type/
        );
        assert.throws(
            () =>
                parseBridgeMessage({
                    type: 'request',
                    protocolVersion: BRIDGE_PROTOCOL_VERSION,
                    id: 'advanced-1',
                    command: {
                        type: 'advanced.writeToc',
                        dataBase64: 'AQID',
                        confirmation: { confirmed: true, reason: 'Forged JSON confirmation' },
                    },
                }),
            /restricted to the local browser UI/
        );
    });
});
