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
});
