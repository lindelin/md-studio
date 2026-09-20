import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runImportUploadSession, ImportUploadSessionError } from '../src/application/import-upload-session.ts';
import type { ConvertedImportAudio } from '../src/application/audio-conversion-pipeline.ts';
import type { Disc } from '../src/services/interfaces/netmd.ts';
import type { TitledFile } from '../src/utils.ts';

const disc = {
    title: '',
    fullWidthTitle: '',
    writable: true,
    writeProtected: false,
    used: 0,
    left: 100,
    total: 100,
    trackCount: 0,
    groups: [],
} satisfies Disc;

const titlePolicy = {
    getRemainingCharactersForTitles: () => ({ halfWidth: 100, fullWidth: 100 }),
    sanitizeHalfWidthTitle: (value: string) => value,
    sanitizeFullWidthTitle: (value: string) => value,
};

function track(name: string, title = name): ConvertedImportAudio {
    const file = new File([Uint8Array.of(1)], name);
    const titled: TitledFile = {
        file,
        title,
        fullWidthTitle: '',
        forcedEncoding: null,
        bytesToSkip: 0,
        artist: 'Artist',
        album: 'Album',
    };
    return { file: titled, data: Uint8Array.of(1, 2, 3).buffer };
}

async function* tracks(...values: ConvertedImportAudio[]) {
    yield* values;
}

describe('import upload session', () => {
    it('prepares, uploads Hi-MD metadata, reports progress, and finalizes', async () => {
        const calls: string[] = [];
        const service = {
            ...titlePolicy,
            async prepareUpload() {
                calls.push('prepare');
            },
            async upload(title: unknown, _full: string, _data: ArrayBuffer, format: unknown, progress: (value: any) => void) {
                calls.push(`upload:${JSON.stringify(title)}:${JSON.stringify(format)}`);
                progress({ written: 3, encrypted: 3, total: 3 });
            },
            async finalizeUpload() {
                calls.push('finalize');
            },
        };
        const completed: string[] = [];

        const result = await runImportUploadSession({
            tracks: tracks(track('one.wav', 'One')),
            totalTracks: 1,
            format: { codec: 'AT3', bitrate: 132 },
            disc,
            service,
            usesHiMDTitles: true,
            useFullWidthTitles: false,
            hooks: { onTrackCompleted: (current) => completed.push(current.displayTitle) },
        });

        assert.deepEqual(result, { writtenTracks: 1, cancelled: false });
        assert.deepEqual(calls, [
            'prepare',
            'upload:{"title":"One","artist":"Artist","album":"Album"}:{"codec":"AT3","bitrate":132}',
            'finalize',
        ]);
        assert.deepEqual(completed, ['One']);
    });

    it('finalizes a prepared session and preserves completed count after a transfer failure', async () => {
        let finalized = false;
        const service = {
            ...titlePolicy,
            async prepareUpload() {},
            async upload(title: unknown) {
                if (title === 'Two') throw new Error('USB transfer failed');
            },
            async finalizeUpload() {
                finalized = true;
            },
        };

        await assert.rejects(
            runImportUploadSession({
                tracks: tracks(track('one.wav', 'One'), track('two.wav', 'Two')),
                totalTracks: 2,
                format: { codec: 'AT3', bitrate: 132 },
                disc,
                service,
                usesHiMDTitles: false,
                useFullWidthTitles: false,
            }),
            (error) => {
                assert(error instanceof ImportUploadSessionError);
                assert.equal(error.stage, 'transfer');
                assert.equal(error.writtenTracks, 1);
                assert.equal(error.message, 'USB transfer failed');
                return true;
            }
        );
        assert.equal(finalized, true);
    });

    it('stops before the next track after cancellation and disables mono upload mode', async () => {
        let cancelled = false;
        let uploads = 0;
        let monoDisabled = false;
        const service = {
            ...titlePolicy,
            async prepareUpload() {},
            async upload() {
                uploads += 1;
                cancelled = true;
            },
            async finalizeUpload() {},
        };
        const factoryService = {
            async uploadSP() {
                throw new Error('not expected');
            },
            async enableMonoUpload(enabled: boolean) {
                monoDisabled = !enabled;
            },
        };

        const result = await runImportUploadSession({
            tracks: tracks(track('one.wav'), track('two.wav')),
            totalTracks: 2,
            format: { codec: 'AT3', bitrate: 132 },
            disc,
            service,
            factoryService,
            usesHiMDTitles: false,
            useFullWidthTitles: false,
            disableMonoUploadOnFinish: true,
            isCancelled: () => cancelled,
        });

        assert.deepEqual(result, { writtenTracks: 1, cancelled: true });
        assert.equal(uploads, 1);
        assert.equal(monoDisabled, true);
    });
});
