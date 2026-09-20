import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stageBrowserImports } from '../src/application/browser-import-planner.ts';
import type { ApplicationClient } from '../src/application/application-client.ts';
import type { ImportQueueInput } from '../src/application/import-queue.ts';
import type { AdaptiveFile } from '../src/utils.ts';

const recordingProfile = {
    specName: 'MD',
    measurementUnits: 'frames' as const,
    titleStorage: 'unicode' as const,
    defaultFormat: [0, 0] as [number, number],
    availableFormats: [{ codec: 'AT3', defaultBitrate: 132, availableBitrates: [132] }],
};

describe('browser import planning', () => {
    it('inspects, formats, and adds one local batch atomically', async () => {
        const adaptive: AdaptiveFile = {
            name: '01. Source.flac',
            title: 'Source title',
            artist: 'Artist',
            album: 'Album',
            duration: 123,
            async getForEncoding() {
                return new ArrayBuffer(0);
            },
        };
        let captured: ImportQueueInput[] = [];
        let capturedRevision: number | undefined;
        const client = {
            addLocalImports(inputs: ImportQueueInput[], expectedRevision?: number) {
                captured = inputs;
                capturedRevision = expectedRevision;
                return {
                    revision: expectedRevision! + 1,
                    items: inputs.map((input, index) => ({ id: `item-${index}`, ...input.source, ...input.metadata })),
                };
            },
        } as Pick<ApplicationClient, 'addLocalImports'>;

        const result = await stageBrowserImports(client, [adaptive], {
            recordingProfile,
            titleFormat: 'artist-album-title',
            fullWidthTitles: false,
            supportsFullWidthTitles: false,
            usesHimdTitles: false,
            expectedRevision: 7,
        });

        assert.equal(capturedRevision, 7);
        assert.equal(captured.length, 1);
        assert.equal(captured[0].metadata.title, 'Artist - Album - Source title');
        assert.equal(captured[0].metadata.sourceTitle, 'Source title');
        assert.equal(captured[0].metadata.duration, 123);
        assert.equal(captured[0].payload, adaptive);
        assert.match(captured[0].source.reference, /^browser-file:/);
        assert.equal(result.importQueue?.revision, 8);
        assert.equal(result.addedCount, 1);
        assert.deepEqual(result.failures, []);
    });

    it('returns inspection failures without adding an unusable batch', async () => {
        const bytes = new Uint8Array(2048 + 424);
        bytes.set(new TextEncoder().encode('AEA Track'), 4);
        bytes[4 + 256 + 4] = 2;
        let added = false;
        const client = {
            addLocalImports() {
                added = true;
                throw new Error('unreachable');
            },
        } as unknown as Pick<ApplicationClient, 'addLocalImports'>;

        const result = await stageBrowserImports(client, [new File([bytes], 'track.aea')], {
            recordingProfile,
            titleFormat: 'filename',
            fullWidthTitles: false,
            supportsFullWidthTitles: false,
            usesHimdTitles: false,
            expectedRevision: 0,
        });

        assert.equal(added, false);
        assert.equal(result.importQueue, null);
        assert.equal(result.addedCount, 0);
        assert.match(result.failures[0].reason, /does not support SPS direct upload/);
    });
});
