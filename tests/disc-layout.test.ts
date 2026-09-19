import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recomputeGroupsAfterTrackMove, resolveGroupedTrackMove } from '../src/domain/disc-layout.ts';

function makeDisc() {
    const tracks = ['A', 'B', 'C', 'D'].map((title, index) => ({
        index,
        title,
        fullWidthTitle: '',
        duration: 60,
        channelMode: 2,
        encoding: { codec: 'SP', bitrate: 292 },
    }));
    return {
        title: 'Test',
        fullWidthTitle: '',
        trackCount: tracks.length,
        totalCapacity: 4800,
        usedCapacity: 240,
        writable: true,
        groups: [
            { index: -1, title: null, fullWidthTitle: null, tracks: [tracks[0], tracks[3]] },
            { index: 1, title: 'Group', fullWidthTitle: '', tracks: [tracks[1], tracks[2]] },
        ],
    } as any;
}

function orderedTitles(disc: ReturnType<typeof makeDisc>) {
    return disc.groups
        .flatMap((group: any) => group.tracks)
        .sort((a: any, b: any) => a.index - b.index)
        .map((track: any) => track.title)
        .join('');
}

function namedGroupTitles(disc: ReturnType<typeof makeDisc>) {
    return (
        disc.groups
            .find((group: any) => group.title === 'Group')
            ?.tracks.map((track: any) => track.title)
            .join('') ?? ''
    );
}

describe('recomputeGroupsAfterTrackMove', () => {
    it('moves a track to the end instead of swapping only the endpoints', () => {
        const result = recomputeGroupsAfterTrackMove(makeDisc(), 0, 3) as ReturnType<typeof makeDisc>;
        assert.equal(orderedTitles(result), 'BCDA');
        assert.equal(namedGroupTitles(result), 'BC');
    });

    it('removes a track from a named group when moved beyond its boundary', () => {
        const result = recomputeGroupsAfterTrackMove(makeDisc(), 1, 3) as ReturnType<typeof makeDisc>;
        assert.equal(orderedTitles(result), 'ACDB');
        assert.equal(namedGroupTitles(result), 'C');
    });

    it('adds an ungrouped track when moved into a named group', () => {
        const result = recomputeGroupsAfterTrackMove(makeDisc(), 3, 2) as ReturnType<typeof makeDisc>;
        assert.equal(orderedTitles(result), 'ABDC');
        assert.equal(namedGroupTitles(result), 'BDC');
    });

    it('deletes a track and closes the group boundary', () => {
        const result = recomputeGroupsAfterTrackMove(makeDisc(), 1, -1) as ReturnType<typeof makeDisc>;
        assert.equal(orderedTitles(result), 'ACD');
        assert.equal(namedGroupTitles(result), 'C');
        assert.equal(result.trackCount, 3);
    });

    it('does not mutate the previous disc snapshot', () => {
        const source = makeDisc();
        recomputeGroupsAfterTrackMove(source, 0, 3);
        assert.equal(orderedTitles(source), 'ABCD');
        assert.deepEqual(
            source.groups.flatMap((group: any) => group.tracks).map((track: any) => track.index),
            [0, 3, 1, 2]
        );
    });
});

describe('resolveGroupedTrackMove', () => {
    it('maps a move from a named group into trailing ungrouped tracks', () => {
        assert.deepEqual(resolveGroupedTrackMove(makeDisc(), 1, 0, 2, 1), { sourceIndex: 1, destinationIndex: 3 });
    });

    it('maps an ungrouped track into the middle of a named group', () => {
        assert.deepEqual(resolveGroupedTrackMove(makeDisc(), 2, 0, 1, 1), { sourceIndex: 3, destinationIndex: 2 });
    });

    it('uses post-removal positions for reordering inside one group', () => {
        assert.deepEqual(resolveGroupedTrackMove(makeDisc(), 1, 0, 1, 1), { sourceIndex: 1, destinationIndex: 2 });
    });

    it('rejects stale drag positions before issuing a device command', () => {
        assert.throws(() => resolveGroupedTrackMove(makeDisc(), 1, 3, 2, 0), /source is outside/);
        assert.throws(() => resolveGroupedTrackMove(makeDisc(), 1, 0, 2, 2), /destination is outside/);
    });
});
