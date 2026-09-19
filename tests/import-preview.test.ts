import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { calculateImportPreview } from '../src/application/import-preview.ts';
import { DefaultMinidiscSpec, type Disc } from '../src/services/interfaces/netmd.ts';

const disc: Disc = {
    title: 'Preview Disc',
    fullWidthTitle: '',
    writable: true,
    writeProtected: false,
    used: 0,
    left: 600,
    total: 600,
    trackCount: 0,
    groups: [{ index: -1, title: null, fullWidthTitle: null, tracks: [] }],
};

describe('import preview', () => {
    it('calculates exact selected-format capacity and title budgets without mutating the disc', () => {
        const preview = calculateImportPreview(
            new DefaultMinidiscSpec(),
            disc,
            [
                { id: 'one', title: 'LP2 track', duration: 60 },
                { id: 'two', title: 'Pre-encoded SP', duration: 60, forcedEncoding: { codec: 'SPS', bitrate: 292 } },
            ],
            { codec: 'AT3', bitrate: 132 }
        );

        assert.equal(preview.complete, true);
        assert.equal(preview.capacity.required, 90);
        assert.equal(preview.capacity.remaining, 510);
        assert.equal(preview.capacity.availableBeforeInSelectedFormat, 1200);
        assert.equal(preview.capacity.remainingInSelectedFormat, 1020);
        assert.equal(preview.capacity.fits, true);
        assert.equal(preview.titles.halfWidthRemaining < preview.titles.halfWidthBefore, true);
        assert.equal(disc.groups[0].tracks.length, 0);
    });

    it('reports incomplete metadata and unsupported pre-encoded formats before writing', () => {
        const preview = calculateImportPreview(
            new DefaultMinidiscSpec(),
            disc,
            [
                { id: 'missing', title: 'Missing duration' },
                { id: 'unsupported', title: 'Unsupported', duration: 30, forcedEncoding: { codec: 'PCM', bitrate: 1411 } },
            ],
            { codec: 'SPS', bitrate: 292 }
        );

        assert.equal(preview.complete, false);
        assert.deepEqual(
            preview.issues.map((issue) => issue.code),
            ['MISSING_DURATION', 'UNSUPPORTED_FORCED_FORMAT']
        );
        assert.equal(preview.capacity.fits, false);
    });
});
