import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { convertImportAudio } from '../src/application/audio-conversion-pipeline.ts';
import { createDeferredFile } from '../src/application/deferred-file.ts';
import type { AudioExportService } from '../src/services/audio/audio-export.ts';
import type { TitledFile } from '../src/utils.ts';

function titled(file: TitledFile['file'], forcedEncoding: TitledFile['forcedEncoding'] = null): TitledFile {
    return {
        file,
        title: file.name,
        fullWidthTitle: '',
        forcedEncoding,
        bytesToSkip: 0,
        artist: '',
        album: '',
    };
}

describe('audio conversion pipeline', () => {
    it('resolves deferred files only when conversion starts and reports encoded bytes', async () => {
        let resolved = 0;
        const source = new File([Uint8Array.from([1, 2])], 'source.wav');
        const deferred = createDeferredFile('source.wav', 'opaque', async () => {
            resolved += 1;
            return source;
        });
        const calls: string[] = [];
        const service = {
            async prepare(file: File) {
                calls.push(`prepare:${file.name}`);
            },
            async export(params: { writeGapless: boolean }, progress: (value: { state: number; total: number }) => void) {
                calls.push(`gapless:${params.writeGapless}`);
                progress({ state: 1, total: 2 });
                return Uint8Array.from([3, 4, 5]).buffer;
            },
        } as AudioExportService;
        const events: string[] = [];

        const iterator = convertImportAudio(
            [titled(deferred)],
            { codec: 'AT3', bitrate: 132 },
            { enableReplayGain: false, enableGapless: true },
            service,
            {
                onTrackProgress: (_index, _total, progress) => events.push(`progress:${progress.state}/${progress.total}`),
                onQueueFinished: (bytes) => events.push(`finished:${bytes}`),
            }
        );
        assert.equal(resolved, 0);
        const converted = await Array.fromAsync(iterator);

        assert.equal(resolved, 1);
        assert.deepEqual([...new Uint8Array(converted[0].data)], [3, 4, 5]);
        assert.deepEqual(calls, ['prepare:source.wav', 'gapless:false']);
        assert.deepEqual(events, ['progress:1/2', 'finished:3']);
    });

    it('strips the declared header from pre-encoded audio without invoking an encoder', async () => {
        const source = new File([Uint8Array.from([9, 8, 1, 2, 3])], 'track.wav');
        const file = { ...titled(source, { codec: 'AT3', bitrate: 132 }), bytesToSkip: 2 };
        const service = {
            async prepare() {
                throw new Error('encoder should not run');
            },
        } as unknown as AudioExportService;

        const converted = await Array.fromAsync(
            convertImportAudio(
                [file],
                { codec: 'AT3', bitrate: 132 },
                { enableReplayGain: false, enableGapless: false },
                service
            )
        );

        assert.deepEqual([...new Uint8Array(converted[0].data)], [1, 2, 3]);
    });

    it('does not start another conversion after cancellation is observed', async () => {
        const sources = [new File([Uint8Array.of(1)], 'one.wav'), new File([Uint8Array.of(2)], 'two.wav')];
        let cancelled = false;
        const prepared: string[] = [];
        const service = {
            async prepare(file: File) {
                prepared.push(file.name);
            },
            async export() {
                cancelled = true;
                return Uint8Array.of(1).buffer;
            },
        } as unknown as AudioExportService;

        const converted = await Array.fromAsync(
            convertImportAudio(
                sources.map((file) => titled(file)),
                { codec: 'AT3', bitrate: 132 },
                { enableReplayGain: false, enableGapless: false },
                service,
                { isCancelled: () => cancelled }
            )
        );

        assert.equal(converted.length, 1);
        assert.deepEqual(prepared, ['one.wav']);
    });
});
