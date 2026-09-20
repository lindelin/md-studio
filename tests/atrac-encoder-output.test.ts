import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateAndStripAtracEncoderOutput } from '../src/services/audio/atrac-encoder-output.ts';

function atracWav(bytesPerStereoFrame: number, payload: Uint8Array) {
    const bytes = new Uint8Array(44 + payload.byteLength);
    const view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode('RIFF'), 0);
    view.setUint32(4, bytes.length - 8, true);
    bytes.set(new TextEncoder().encode('WAVEfmt '), 8);
    view.setUint32(16, 16, true);
    view.setUint16(20, 0x270, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, 44100, true);
    view.setUint16(32, bytesPerStereoFrame, true);
    bytes.set(new TextEncoder().encode('data'), 36);
    view.setUint32(40, payload.byteLength, true);
    bytes.set(payload, 44);
    return bytes.buffer;
}

describe('ATRAC encoder output validation', () => {
    it('strips a matching ATRAC WAV header and preserves only audio frames', async () => {
        const payload = Uint8Array.of(1, 2, 3, 4);
        const result = await validateAndStripAtracEncoderOutput(
            atracWav(384, payload),
            { codec: 'AT3', bitrate: 132 },
            'Test encoder'
        );
        assert.deepEqual(new Uint8Array(result), payload);
    });

    it('rejects a valid ATRAC WAV encoded in a different recording mode', async () => {
        await assert.rejects(
            validateAndStripAtracEncoderOutput(
                atracWav(192, Uint8Array.of(1)),
                { codec: 'AT3', bitrate: 132 },
                'Test encoder'
            ),
            /returned AT3 66 kbps instead of AT3 132 kbps/
        );
    });

    it('rejects malformed and empty encoder results before device upload', async () => {
        await assert.rejects(
            validateAndStripAtracEncoderOutput(new ArrayBuffer(44), { codec: 'AT3', bitrate: 132 }, 'Test encoder'),
            /invalid ATRAC WAV/
        );
        await assert.rejects(
            validateAndStripAtracEncoderOutput(atracWav(384, new Uint8Array()), { codec: 'AT3', bitrate: 132 }, 'Test encoder'),
            /without audio frames/
        );
    });
});
