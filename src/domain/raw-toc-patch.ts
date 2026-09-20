import { ModeFlag, parseTOC, reconstructTOC, type ToC } from 'netmd-tocmanip';

export const RAW_TOC_SECTOR_SIZE = 2352;
export const RAW_TOC_SECTOR_COUNT = 6;
export const RAW_TOC_WRITABLE_SECTOR_COUNT = 4;
export const RAW_TOC_BYTE_LENGTH = RAW_TOC_SECTOR_SIZE * RAW_TOC_SECTOR_COUNT;
export const RAW_TOC_WRITABLE_BYTE_LENGTH = RAW_TOC_SECTOR_SIZE * RAW_TOC_WRITABLE_SECTOR_COUNT;

export type RawTocPatchKind = 'unrestrict-scms' | 'mark-tracks-writable';

export function isRawTocPatchKind(value: unknown): value is RawTocPatchKind {
    return value === 'unrestrict-scms' || value === 'mark-tracks-writable';
}

export interface RawTocPatchPlan {
    kind: RawTocPatchKind;
    totalTracks: number;
    changedTracks: number;
    changedFragments: number;
    data: Uint8Array;
}

export function planRawTocPatch(data: Uint8Array, kind: RawTocPatchKind): RawTocPatchPlan {
    if (!isRawTocPatchKind(kind)) throw new Error('The raw TOC flag change is not supported.');
    if (data.byteLength !== RAW_TOC_BYTE_LENGTH) {
        throw new Error(`A raw TOC must contain exactly ${RAW_TOC_BYTE_LENGTH} bytes.`);
    }
    const sectors = Array.from({ length: RAW_TOC_SECTOR_COUNT }, (_, index) =>
        data.slice(index * RAW_TOC_SECTOR_SIZE, (index + 1) * RAW_TOC_SECTOR_SIZE)
    );
    let toc: ToC;
    try {
        toc = parseTOC(...sectors);
    } catch {
        throw new Error('The raw TOC could not be parsed safely.');
    }
    if (!Number.isInteger(toc.nTracks) || toc.nTracks < 0 || toc.nTracks > 255) {
        throw new Error('The raw TOC reports an invalid track count.');
    }

    const flag =
        kind === 'unrestrict-scms'
            ? ModeFlag.F_SCMS_DIG_COPY | ModeFlag.F_SCMS_UNRESTRICTED
            : ModeFlag.F_WRITABLE;
    let changedTracks = 0;
    const changedFragmentIndexes = new Set<number>();
    const claimedFragmentIndexes = new Set<number>();
    for (let track = 1; track <= toc.nTracks; track += 1) {
        const fragments = getTrackFragmentIndexes(toc, track);
        let trackChanged = false;
        for (const fragmentIndex of fragments) {
            if (claimedFragmentIndexes.has(fragmentIndex)) {
                throw new Error(`Track ${track} shares a fragment with another track.`);
            }
            claimedFragmentIndexes.add(fragmentIndex);
            const fragment = toc.trackFragmentList[fragmentIndex]!;
            if ((fragment.mode & flag) === flag) continue;
            fragment.mode |= flag;
            changedFragmentIndexes.add(fragmentIndex);
            trackChanged = true;
        }
        if (trackChanged) changedTracks += 1;
    }

    const reconstructed = reconstructTOC(toc, false);
    const next = data.slice();
    for (let index = 0; index < RAW_TOC_WRITABLE_SECTOR_COUNT; index += 1) {
        const sector = reconstructed[index];
        if (!sector || sector.byteLength !== RAW_TOC_SECTOR_SIZE) {
            throw new Error(`The raw TOC could not reconstruct writable sector ${index}.`);
        }
        next.set(sector, index * RAW_TOC_SECTOR_SIZE);
    }
    return {
        kind,
        totalTracks: toc.nTracks,
        changedTracks,
        changedFragments: changedFragmentIndexes.size,
        data: next,
    };
}

function getTrackFragmentIndexes(toc: ToC, track: number) {
    let index = toc.trackMap[track];
    const indexes: number[] = [];
    const seen = new Set<number>();
    for (;;) {
        if (!Number.isInteger(index) || index <= 0 || index >= toc.trackFragmentList.length || seen.has(index)) {
            throw new Error(`Track ${track} has an invalid or cyclic fragment chain.`);
        }
        seen.add(index);
        indexes.push(index);
        const fragment = toc.trackFragmentList[index];
        if (!fragment) throw new Error(`Track ${track} references a missing fragment.`);
        if (fragment.link === 0) return indexes;
        index = fragment.link;
    }
}
