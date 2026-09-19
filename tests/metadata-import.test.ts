import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildImportedGroups, createMetadataImportPlan, MetadataImportError, serializeMetadataCsv } from '../src/domain/metadata-import.ts';

const header = 'INDEX,GROUP RANGE,GROUP NAME,GROUP FULL WIDTH NAME,NAME,FULL WIDTH NAME,HIMD ALBUM,HIMD ARTIST,DURATION,ENCODING,BITRATE';

function disc() {
    return {
        title: 'Before',
        fullWidthTitle: '',
        writable: true,
        writeProtected: false,
        used: 30,
        left: 70,
        total: 100,
        trackCount: 3,
        groups: [
            {
                index: 0,
                title: null,
                fullWidthTitle: null,
                tracks: [
                    { index: 0, title: 'A', fullWidthTitle: '', duration: 60, channel: 2, encoding: { codec: 'SPS', bitrate: 292 } },
                    { index: 1, title: 'B', fullWidthTitle: '', duration: 61, channel: 2, encoding: { codec: 'SPS', bitrate: 292 } },
                    { index: 2, title: 'C', fullWidthTitle: '', duration: 62, channel: 2, encoding: { codec: 'SPS', bitrate: 292 } },
                ],
            },
        ],
    } as any;
}

describe('metadata CSV import planning', () => {
    it('exports current metadata into a round-trippable document', () => {
        const source = disc();
        source.title = 'Comma, Disc';
        source.groups[0].tracks[0].title = 'Comma, Track';
        const exported = serializeMetadataCsv(source);
        const plan = createMetadataImportPlan(exported.text, source);

        assert.equal(exported.fileName, 'Comma, Disc.csv');
        assert.equal(plan.discTitle.title, 'Comma, Disc');
        assert.equal(plan.tracks[0].title, 'Comma, Track');
        assert.equal(plan.trackCountMatches, true);
    });

    it('fully validates a file and builds the final group layout before device writes', () => {
        const text = [
            header,
            '0,0-0,,,Imported Disc,,,,30,,',
            '1,0-1,Side A,,First,,,Artist,60,SPS,292',
            '2,0-1,Side A,,Second,,,Artist,61,SPS,292',
            '3,,, ,Third,,,Artist,62,SPS,292',
        ].join('\n');
        const plan = createMetadataImportPlan(text, disc());
        assert.equal(plan.trackCountMatches, true);
        assert.equal(
            plan.tracks.every((track) => track.matchesDisc),
            true
        );
        const groups = buildImportedGroups(plan, new Set([0, 1, 2]));
        assert.deepEqual(
            groups.map((group) => ({ title: group.title, tracks: group.tracks.map((track) => track.index) })),
            [
                { title: null, tracks: [2] },
                { title: 'Side A', tracks: [0, 1] },
            ]
        );
        assert.equal(groups[1].tracks[0].title, 'First');
    });

    it('rejects malformed rows and overlapping groups during the dry run', () => {
        const malformed = [header, '0,0-0,,,Disc,,,,30,,', 'one,,,,A,,,,60,SPS,292'].join('\n');
        assert.throws(
            () => createMetadataImportPlan(malformed, disc()),
            (error: unknown) => error instanceof MetadataImportError && error.line === 3
        );

        const overlapping = [
            header,
            '0,0-0,,,Disc,,,,30,,',
            '1,0-1,A,,A,,,,60,SPS,292',
            '2,1-2,B,,B,,,,61,SPS,292',
            '3,1-2,B,,C,,,,62,SPS,292',
        ].join('\n');
        assert.throws(() => createMetadataImportPlan(overlapping, disc()), /overlaps/);
    });

    it('supports the legacy eight-column export without weakening validation', () => {
        const text = [
            'INDEX,GROUP RANGE,GROUP NAME,GROUP FULL WIDTH NAME,NAME,FULL WIDTH NAME,DURATION,ENCODING',
            '0,0-0,,,Legacy Disc,,30,',
            '1,,,,Legacy A,,60,SPS',
            '2,,,,Legacy B,,61,SPS',
            '3,,,,Legacy C,,62,SPS',
        ].join('\n');
        const plan = createMetadataImportPlan(text, disc());
        assert.equal(plan.discTitle.title, 'Legacy Disc');
        assert.equal(plan.tracks[0].album, '');
        assert.equal(plan.tracks[0].bitrate, undefined);
    });

    it('reports content mismatches without rejecting an otherwise valid import plan', () => {
        const text = [header, '0,0-0,,,Disc,,,,30,,', '1,,,,Different,,,,90,AT3,132'].join('\n');
        const plan = createMetadataImportPlan(text, disc());
        assert.equal(plan.trackCountMatches, false);
        assert.equal(plan.tracks[0].matchesDisc, false);
    });
});
