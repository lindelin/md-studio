import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { RemoteLibraryService } from '../src/services/library/remote-library.ts';
import type { ExportParams } from '../src/services/audio/audio-export.ts';

const originalFetch = globalThis.fetch;

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

const lp2: ExportParams = {
    format: { codec: 'AT3', bitrate: 132 },
    enableReplayGain: true,
    writeGapless: false,
};

afterEach(() => {
    globalThis.fetch = originalFetch;
});

describe('RemoteLibraryService', () => {
    it('validates and strips a matching server-side ATRAC result', async () => {
        const payload = Uint8Array.of(1, 2, 3, 4);
        let requestedUrl = '';
        globalThis.fetch = async (input) => {
            requestedUrl = String(input);
            return new Response(atracWav(384, payload), { status: 200 });
        };
        const service = new RemoteLibraryService({ address: 'http://localhost:8000/music/' });

        const result = await service.processLocalLibraryFile('Album/Track.wav', lp2);

        assert.deepEqual(new Uint8Array(result), payload);
        const url = new URL(requestedUrl);
        assert.equal(url.pathname, '/music/transcode_local');
        assert.equal(url.searchParams.get('type'), 'LP2');
        assert.equal(url.searchParams.get('file_name'), 'Album/Track.wav');
        assert.equal(url.searchParams.get('applyReplaygain'), 'true');
    });

    it('rejects a server-side ATRAC result encoded in the wrong mode', async () => {
        let requests = 0;
        globalThis.fetch = async () => {
            requests += 1;
            return new Response(atracWav(192, Uint8Array.of(1)), { status: 200 });
        };
        const service = new RemoteLibraryService({ address: 'http://localhost:8000/' });

        await assert.rejects(
            service.processLocalLibraryFile('Track.wav', lp2),
            /returned AT3 66 kbps instead of AT3 132 kbps/
        );
        assert.equal(requests, 3);
    });
});
