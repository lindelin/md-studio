import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectImportFiles } from '../src/application/audio-import-inspector.ts';
import type { AdaptiveFile } from '../src/utils.ts';

describe('audio import inspection', () => {
    it('normalizes adaptive library files without reading a browser payload', async () => {
        const file: AdaptiveFile = {
            name: 'library-track.flac',
            title: 'Library Track',
            artist: 'Artist',
            album: 'Album',
            duration: 123,
            async getForEncoding() {
                throw new Error('The inspector must not resolve adaptive audio.');
            },
        };

        const result = await inspectImportFiles([file], ['AT3']);

        assert.deepEqual(result.failures, []);
        assert.equal(result.files[0].title, 'Library Track');
        assert.equal(result.files[0].forcedEncoding, null);
    });

    it('detects AEA direct-upload metadata and rejects it for unsupported devices', async () => {
        const bytes = new Uint8Array(2048 + 424);
        bytes.set(new TextEncoder().encode('AEA Track'), 4);
        bytes[4 + 256 + 4] = 2;
        const file = new File([bytes], 'track.aea');

        const supported = await inspectImportFiles([file], ['SPS']);
        const unsupported = await inspectImportFiles([file], ['AT3']);

        assert.deepEqual(supported.files[0].forcedEncoding, { codec: 'SPS', bitrate: 292 });
        assert.equal(supported.files[0].bytesToSkip, 2048);
        assert.equal(supported.files[0].title, 'AEA Track');
        assert.equal(unsupported.files.length, 0);
        assert.match(unsupported.failures[0].reason, /does not support SPS direct upload/);
    });

    it('marks an unrecognized duration as unknown instead of zero-length audio', async () => {
        const originalLog = console.log;
        console.log = () => undefined;
        try {
            const result = await inspectImportFiles([new File([], 'unknown.bin')], ['AT3']);

            assert.equal(result.files[0].duration, undefined);
        } finally {
            console.log = originalLog;
        }
    });

    it('inspects pre-encoded WAV headers without reading the whole file', async () => {
        class SliceOnlyFile extends File {
            override async arrayBuffer(): Promise<ArrayBuffer> {
                throw new Error('Whole-file reads are not allowed during inspection.');
            }
        }

        const bytes = new Uint8Array(44 + 384);
        const view = new DataView(bytes.buffer);
        bytes.set(new TextEncoder().encode('RIFF'), 0);
        view.setUint32(4, bytes.length - 8, true);
        bytes.set(new TextEncoder().encode('WAVEfmt '), 8);
        view.setUint32(16, 16, true);
        view.setUint16(20, 0x270, true);
        view.setUint16(22, 2, true);
        view.setUint32(24, 44100, true);
        view.setUint16(32, 384, true);
        bytes.set(new TextEncoder().encode('data'), 36);
        view.setUint32(40, 384, true);

        const result = await inspectImportFiles([new SliceOnlyFile([bytes], 'encoded.wav')], ['AT3']);

        assert.deepEqual(result.failures, []);
        assert.deepEqual(result.files[0].forcedEncoding, { codec: 'AT3', bitrate: 132 });
        assert.equal(result.files[0].bytesToSkip, 44);
        assert.equal((result.files[0].duration ?? 0) > 0, true);
    });
});
