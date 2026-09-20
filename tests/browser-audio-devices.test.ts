import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requestBrowserAudioDevices } from '../src/application/browser-audio-devices.ts';

describe('browser audio device discovery', () => {
    it('releases the permission stream and returns only labelled audio inputs', async () => {
        let stopped = 0;
        const devices = await requestBrowserAudioDevices({
            async getUserMedia() {
                return {
                    getTracks: () => [{ stop: () => (stopped += 1) }],
                } as unknown as MediaStream;
            },
            async enumerateDevices() {
                return [
                    { kind: 'audioinput', deviceId: 'line-in', label: 'Line input' },
                    { kind: 'videoinput', deviceId: 'camera', label: 'Camera' },
                    { kind: 'audioinput', deviceId: 'anonymous', label: '' },
                ] as MediaDeviceInfo[];
            },
        });

        assert.deepEqual(devices, [
            { deviceId: 'line-in', label: 'Line input' },
            { deviceId: 'anonymous', label: 'Audio input 2' },
        ]);
        assert.equal(stopped, 1);
    });

    it('releases the permission stream when enumeration fails', async () => {
        let stopped = false;
        await assert.rejects(
            () =>
                requestBrowserAudioDevices({
                    async getUserMedia() {
                        return {
                            getTracks: () => [{ stop: () => (stopped = true) }],
                        } as unknown as MediaStream;
                    },
                    async enumerateDevices() {
                        throw new Error('enumeration failed');
                    },
                }),
            /enumeration failed/
        );
        assert.equal(stopped, true);
    });
});
