import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BrowserAudioInput } from '../src/application/browser-audio-input.ts';
import type { MediaRecorderService } from '../src/services/browserintegration/mediarecorder.ts';

describe('BrowserAudioInput', () => {
    it('captures WAV bytes and closes the selected browser input', async () => {
        const events: string[] = [];
        const recorder = {
            stopTestInput() {
                events.push('preview:stop');
            },
            playTestInput(deviceId: string) {
                events.push(`preview:${deviceId}`);
            },
            async initStream(deviceId: string) {
                events.push(`input:${deviceId}`);
            },
            async startRecording() {
                events.push('record:start');
            },
            async stopRecording() {
                events.push('record:stop');
            },
            async exportRecorded() {
                events.push('record:export');
                return Uint8Array.from([1, 2, 3]);
            },
            async closeStream() {
                events.push('input:close');
            },
        } as unknown as MediaRecorderService;
        const progress: number[] = [];
        const input = new BrowserAudioInput(recorder, async (_duration, report) => {
            report(50);
            return true;
        });

        await input.startPreview('preview-device');
        const data = await input.captureWav('capture-device', 250, (value) => progress.push(value), () => false);

        assert.deepEqual([...data], [1, 2, 3]);
        assert.deepEqual(progress, [50]);
        assert.deepEqual(events, [
            'preview:stop',
            'preview:preview-device',
            'input:capture-device',
            'record:start',
            'record:stop',
            'record:export',
            'input:close',
        ]);
    });

    it('stops recording and releases the input when capture fails', async () => {
        const events: string[] = [];
        const recorder = {
            stopTestInput() {},
            playTestInput() {},
            async initStream() {
                events.push('input:open');
            },
            async startRecording() {
                events.push('record:start');
            },
            async stopRecording() {
                events.push('record:stop');
            },
            async closeStream() {
                events.push('input:close');
            },
        } as unknown as MediaRecorderService;
        const input = new BrowserAudioInput(recorder, async () => {
            throw new Error('capture failed');
        });

        await assert.rejects(() => input.captureWav('line-in', 250, () => {}, () => false), /capture failed/);
        assert.deepEqual(events, ['input:open', 'record:start', 'record:stop', 'input:close']);
    });

    it('serializes rapid preview replacements and keeps only the latest input active', async () => {
        const events: string[] = [];
        const recorder = {
            async stopTestInput() {
                events.push('stop');
            },
            async playTestInput(deviceId: string) {
                events.push(`play:${deviceId}`);
            },
        } as unknown as MediaRecorderService;
        const input = new BrowserAudioInput(recorder);

        const first = input.startPreview('first');
        const second = input.startPreview('second');
        await Promise.all([first, second]);

        assert.deepEqual(events, ['stop', 'stop', 'play:second']);
    });
});
