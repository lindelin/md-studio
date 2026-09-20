import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AudioEncoderManager, type AudioEncoderConfiguration } from '../src/application/audio-encoder-manager.ts';
import type { AudioExportService } from '../src/services/audio/audio-export.ts';

function fakeService(onInit: () => void): AudioExportService {
    return {
        async init() {
            onInit();
        },
        async export() {
            return new ArrayBuffer(0);
        },
        async info() {
            return { format: null, input: null };
        },
        async prepare() {},
        getSupport() {
            return { state: 'perfect', gapless: false };
        },
    };
}

describe('AudioEncoderManager', () => {
    it('initializes one encoder per configuration and publishes stable workspace state', async () => {
        let configuration: AudioEncoderConfiguration = {
            index: 0,
            parameters: { quality: 'standard' },
        };
        let initialized = 0;
        const manager = new AudioEncoderManager(
            () => configuration,
            async (current) => ({
                index: current.index,
                id: `encoder-${current.index}`,
                name: `Encoder ${current.index}`,
                service: fakeService(() => initialized++),
            })
        );
        const statuses: string[] = [];
        manager.subscribe((snapshot) => statuses.push(snapshot.status));

        const [first, second] = await Promise.all([manager.getService(), manager.getService()]);

        assert.equal(first, second);
        assert.equal(initialized, 1);
        assert.deepEqual(statuses, ['loading', 'ready']);
        assert.deepEqual(manager.getSnapshot(), {
            revision: 1,
            status: 'ready',
            index: 0,
            id: 'encoder-0',
            name: 'Encoder 0',
            error: null,
            support: {
                SPS: { state: 'perfect', gapless: false },
                SPM: { state: 'perfect', gapless: false },
                AT3: { state: 'perfect', gapless: false },
                'A3+': { state: 'perfect', gapless: false },
                PCM: { state: 'perfect', gapless: false },
                MP3: { state: 'perfect', gapless: false },
            },
        });

        configuration = { index: 1, parameters: {} };
        const replacement = await manager.getService();

        assert.notEqual(replacement, first);
        assert.equal(initialized, 2);
        assert.equal(manager.getSnapshot().revision, 2);
        assert.equal(manager.getSnapshot().id, 'encoder-1');

    });

    it('reports initialization failures without discarding the last working service', async () => {
        let shouldFail = false;
        let configuration: AudioEncoderConfiguration = { index: 0, parameters: {} };
        const working = fakeService(() => {});
        const manager = new AudioEncoderManager(
            () => configuration,
            (current) => ({
                index: current.index,
                id: `encoder-${current.index}`,
                name: `Encoder ${current.index}`,
                service: shouldFail
                    ? ({
                          ...fakeService(() => {}),
                          async init() {
                              throw new Error('encoder unavailable');
                          },
                      } as AudioExportService)
                    : working,
            })
        );
        await manager.getService();
        configuration = { index: 1, parameters: {} };
        shouldFail = true;

        await assert.rejects(() => manager.getService(), /encoder unavailable/);

        assert.equal(manager.getSnapshot().status, 'error');
        assert.equal(manager.getSnapshot().revision, 1);
        assert.equal(manager.getActiveService(), working);
    });
});
