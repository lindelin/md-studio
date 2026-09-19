import type { Disc } from '../services/interfaces/netmd';

export function recomputeGroupsAfterTrackMove(disc: Disc, trackIndex: number, targetIndex: number): Disc {
    let offset = trackIndex > targetIndex ? 1 : -1;
    const deleteMode = targetIndex === -1;

    if (deleteMode) {
        offset = -1;
        targetIndex = disc.trackCount;
    }

    const boundsStart = Math.min(trackIndex, targetIndex);
    const boundsEnd = Math.max(trackIndex, targetIndex);
    const groupBoundaries = disc.groups
        .filter((group) => group.title !== null && group.tracks.length > 0)
        .map((group) => ({
            name: group.title,
            fullWidthName: group.fullWidthTitle,
            start: group.tracks[0].index,
            end: group.tracks[0].index + group.tracks.length - 1,
        }));

    for (const group of groupBoundaries) {
        if (group.start > boundsStart && group.start <= boundsEnd) group.start += offset;
        if (group.end >= boundsStart && group.end < boundsEnd) group.end += offset;
    }

    const allTracks = disc.groups
        .flatMap((group) => group.tracks)
        .map((track) => ({ ...track }))
        .sort((a, b) => a.index - b.index);

    const sourcePosition = allTracks.findIndex((track) => track.index === trackIndex);
    if (sourcePosition === -1) throw new Error(`Track ${trackIndex} does not exist in the cached disc content.`);

    if (deleteMode) {
        allTracks.splice(sourcePosition, 1);
    } else {
        const [movedTrack] = allTracks.splice(sourcePosition, 1);
        allTracks.splice(Math.max(0, Math.min(targetIndex, allTracks.length)), 0, movedTrack);
    }
    allTracks.forEach((track, index) => (track.index = index));

    const nextDisc: Disc = { ...disc, trackCount: allTracks.length };
    nextDisc.groups = groupBoundaries
        .map((group) => ({
            title: group.name,
            fullWidthTitle: group.fullWidthName,
            index: group.start,
            tracks: allTracks.slice(group.start, group.end + 1),
        }))
        .filter((group) => group.tracks.length > 0);

    const groupedTracks = nextDisc.groups.flatMap((group) => group.tracks);
    const ungroupedTracks = allTracks.filter((track) => !groupedTracks.includes(track));
    if (ungroupedTracks.length) {
        nextDisc.groups.unshift({ title: null, fullWidthTitle: null, index: 0, tracks: ungroupedTracks });
    }
    return nextDisc;
}
