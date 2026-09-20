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

    it('reads the final partial download chunk, reports completion, and closes the file', async () => {
        const service = createService();
        const source = Uint8Array.from({ length: 5_000 }, (_, index) => index % 251);
        const requested: number[] = [];
        const progress: number[] = [];
        let cursor = 0;
        let closed = 0;
        Object.assign(service, {
            cache: {
                nwjsTracks: [{ systemIndex: 7, codecName: 'PCM' }],
                groups: [], left: 0, total: 0, used: 0,
            },
            database: {
                database: {
                    filesystem: {
                        open: async () => ({
                            length: source.byteLength,
                            read: async (length: number) => {
                                requested.push(length);
                                const chunk = source.slice(cursor, cursor + length);
                                cursor += chunk.byteLength;
                                return chunk;
                            },
                            close: async () => { closed += 1; },
                        }),
                    },
                },
            },
        });

        const result = await service.download(0, ({ read }) => progress.push(read));

        assert.equal(result.extension, 'wav');
        assert.deepEqual(result.data, source);
        assert.deepEqual(requested, [4096, 904]);
        assert.deepEqual(progress, [4096, 5000]);
        assert.equal(closed, 1);
    });

    it('closes and rejects a truncated Network Walkman download', async () => {
        const service = createService();
        let closed = 0;
        Object.assign(service, {
            cache: {
                nwjsTracks: [{ systemIndex: 7, codecName: 'PCM' }],
                groups: [], left: 0, total: 0, used: 0,
            },
            database: {
                database: {
                    filesystem: {
                        open: async () => ({
                            length: 10,
                            read: async () => new Uint8Array(),
                            close: async () => { closed += 1; },
                        }),
                    },
                },
            },
        });

        await assert.rejects(service.download(0, () => undefined), /ended before the declared size/);
        assert.equal(closed, 1);
    });
});
