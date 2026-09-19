import type { Disc, Group } from '../services/interfaces/netmd';

export function getGroupedTracks(disc: Disc | null) {
    if (!disc) return [];
    const groupedList: Group[] = [];
    const ungroupedTracks = [...(disc.groups.find((group) => group.title === null)?.tracks ?? [])];
    let lastIndex = 0;

    for (const group of disc.groups) {
        if (group.title === null) continue;
        const countBeforeGroup = group.tracks[0].index - lastIndex;
        groupedList.push({
            index: -1,
            title: null,
            fullWidthTitle: null,
            tracks: countBeforeGroup === 0 ? [] : ungroupedTracks.splice(0, countBeforeGroup),
        });
        lastIndex = group.tracks[group.tracks.length - 1].index + 1;
        groupedList.push(group);
    }
    groupedList.push({ index: -1, title: null, fullWidthTitle: null, tracks: ungroupedTracks });
    return groupedList;
}

export function resolveGroupedTrackMove(
    disc: Disc,
    sourceList: number,
    sourcePosition: number,
    targetList: number,
    targetPosition: number
) {
    const groups = getGroupedTracks(disc).map((group) => ({ ...group, tracks: [...group.tracks] }));
    const sourceGroup = groups[sourceList];
    const targetGroup = groups[targetList];
    if (!sourceGroup || !targetGroup) throw new Error('The track move references a group that does not exist.');
    if (!Number.isInteger(sourcePosition) || sourcePosition < 0 || sourcePosition >= sourceGroup.tracks.length) {
        throw new Error('The track move source is outside its group.');
    }

    const [movedTrack] = sourceGroup.tracks.splice(sourcePosition, 1);
    if (!Number.isInteger(targetPosition) || targetPosition < 0 || targetPosition > targetGroup.tracks.length) {
        throw new Error('The track move destination is outside its group.');
    }
    targetGroup.tracks.splice(targetPosition, 0, movedTrack);
    const destinationIndex = groups.flatMap((group) => group.tracks).findIndex((track) => track.index === movedTrack.index);
    if (destinationIndex === -1) throw new Error('The moved track is missing from the planned disc layout.');
    return { sourceIndex: movedTrack.index, destinationIndex };
}

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
