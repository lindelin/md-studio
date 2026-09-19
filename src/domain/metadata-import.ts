import type { Disc, Group, Track } from '../services/interfaces/netmd';

export const METADATA_CSV_HEADER_ALIASES = [
    ['INDEX'],
    ['GROUP RANGE'],
    ['GROUP NAME'],
    ['GROUP FULL WIDTH NAME'],
    ['NAME'],
    ['FULL WIDTH NAME'],
    ['HIMD ALBUM', 'ALBUM'],
    ['HIMD ARTIST', 'ARTIST'],
    ['DURATION'],
    ['ENCODING'],
    ['BITRATE'],
] as const;

export const LEGACY_METADATA_CSV_HEADER = [
    'INDEX',
    'GROUP RANGE',
    'GROUP NAME',
    'GROUP FULL WIDTH NAME',
    'NAME',
    'FULL WIDTH NAME',
    'DURATION',
    'ENCODING',
] as const;

export interface MetadataImportRow {
    line: number;
    index: number;
    groupRange: string;
    groupName: string;
    groupFullWidthName: string;
    title: string;
    fullWidthTitle: string;
    album: string;
    artist: string;
    duration: number;
    codec: string;
    bitrate?: number;
}

export interface MetadataImportTrack extends MetadataImportRow {
    trackIndex: number;
    actual?: Track;
    matchesDisc: boolean;
}

export interface MetadataImportPlan {
    disc: Disc;
    discTitle: { title: string; fullWidthTitle: string };
    tracks: MetadataImportTrack[];
    expectedTrackCount: number;
    trackCountMatches: boolean;
}

export class MetadataImportError extends Error {
    constructor(
        message: string,
        public readonly line?: number
    ) {
        super(line === undefined ? message : `Line ${line}: ${message}`);
        this.name = 'MetadataImportError';
    }
}

export function createMetadataImportPlan(text: string, disc: Disc): MetadataImportPlan {
    const rows = parseMetadataCsv(text);
    const discRows = rows.filter((row) => row.index === 0);
    if (discRows.length !== 1) throw new MetadataImportError('The file must contain exactly one disc information row (INDEX 0).');

    const actualTracks = new Map(disc.groups.flatMap((group) => group.tracks).map((track) => [track.index, track]));
    const seenTrackIndexes = new Set<number>();
    const rangeDefinitions = new Map<string, { name: string; fullWidthName: string; line: number }>();
    const tracks = rows
        .filter((row) => row.index !== 0)
        .map((row): MetadataImportTrack => {
            const trackIndex = row.index - 1;
            if (seenTrackIndexes.has(trackIndex)) throw new MetadataImportError(`Track ${row.index} appears more than once.`, row.line);
            seenTrackIndexes.add(trackIndex);
            validateGroupRange(row, disc.trackCount, rangeDefinitions);
            const actual = actualTracks.get(trackIndex);
            return {
                ...row,
                trackIndex,
                actual,
                matchesDisc: actual ? rowMatchesTrack(row, actual) : false,
            };
        });
    validateNonOverlappingRanges(rangeDefinitions);

    return {
        disc,
        discTitle: { title: discRows[0].title, fullWidthTitle: discRows[0].fullWidthTitle },
        tracks,
        expectedTrackCount: tracks.length,
        trackCountMatches: disc.trackCount === tracks.length,
    };
}

export function buildImportedGroups(plan: MetadataImportPlan, includedTrackIndexes: Set<number>): Group[] {
    const trackUpdates = new Map(
        plan.tracks.filter((track) => includedTrackIndexes.has(track.trackIndex)).map((track) => [track.trackIndex, track])
    );
    const allTracks = plan.disc.groups
        .flatMap((group) => group.tracks)
        .sort((a, b) => a.index - b.index)
        .map((track) => {
            const update = trackUpdates.get(track.index);
            return update
                ? {
                      ...track,
                      title: update.title,
                      fullWidthTitle: update.fullWidthTitle,
                      album: update.album,
                      artist: update.artist,
                  }
                : { ...track };
        });

    const selectedRanges = new Map<string, MetadataImportTrack>();
    for (const track of plan.tracks) {
        if (includedTrackIndexes.has(track.trackIndex) && track.groupRange) selectedRanges.set(track.groupRange, track);
    }

    const groupedIndexes = new Set<number>();
    const namedGroups = [...selectedRanges.entries()]
        .map(([range, row]) => {
            const [start, end] = range.split('-').map(Number);
            const tracks = allTracks.filter((track) => track.index >= start && track.index <= end);
            for (const track of tracks) groupedIndexes.add(track.index);
            return { start, row, tracks };
        })
        .sort((a, b) => a.start - b.start)
        .map(
            ({ row, tracks }, index): Group => ({
                index: index + 1,
                title: row.groupName,
                fullWidthTitle: row.groupFullWidthName,
                tracks,
            })
        );

    const ungroupedTracks = allTracks.filter((track) => !groupedIndexes.has(track.index));
    const groups: Group[] = [];
    if (ungroupedTracks.length > 0) {
        groups.push({ index: 0, title: null, fullWidthTitle: null, tracks: ungroupedTracks });
    }
    return groups.concat(namedGroups);
}

function parseMetadataCsv(text: string): MetadataImportRow[] {
    const records = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => splitLegacyCsvLine(line));
    if (records.length === 0) throw new MetadataImportError('The CSV file is empty.');

    if (sameHeader(records[0], LEGACY_METADATA_CSV_HEADER)) {
        records[0] = METADATA_CSV_HEADER_ALIASES.map((aliases) => aliases[0]);
        for (let index = 1; index < records.length; index += 1) {
            records[index].splice(6, 0, '', '');
            records[index].push('');
        }
    }
    validateHeader(records[0]);

    return records.slice(1).map((cells, rowIndex) => parseRow(cells, rowIndex + 2));
}

function splitLegacyCsvLine(line: string) {
    return line.split(/(?<!\\),/g).map((cell) => cell.replace(/\\,/g, ','));
}

function validateHeader(header: string[]) {
    if (
        header.length !== METADATA_CSV_HEADER_ALIASES.length ||
        header.some((cell, index) => !METADATA_CSV_HEADER_ALIASES[index].includes(cell as never))
    ) {
        throw new MetadataImportError('The CSV header is malformed or unsupported.', 1);
    }
}

function parseRow(cells: string[], line: number): MetadataImportRow {
    if (cells.length !== METADATA_CSV_HEADER_ALIASES.length) {
        throw new MetadataImportError(`Expected ${METADATA_CSV_HEADER_ALIASES.length} columns but found ${cells.length}.`, line);
    }
    const [sIndex, rawGroupRange, groupName, groupFullWidthName, title, fullWidthTitle, album, artist, sDuration, codec, sBitrate] = cells;
    const index = parseWholeNumber(sIndex, 'INDEX', line);
    const duration = parseNonNegativeNumber(sDuration, 'DURATION', line);
    const bitrate = sBitrate === '' ? undefined : parseNonNegativeNumber(sBitrate, 'BITRATE', line);
    if (index > 0 && !codec.trim()) throw new MetadataImportError('ENCODING is required for track rows.', line);
    return {
        line,
        index,
        groupRange: rawGroupRange.replace(/\s/g, ''),
        groupName,
        groupFullWidthName,
        title,
        fullWidthTitle,
        album,
        artist,
        duration,
        codec,
        bitrate,
    };
}

function validateGroupRange(
    row: MetadataImportRow,
    trackCount: number,
    definitions: Map<string, { name: string; fullWidthName: string; line: number }>
) {
    if (!row.groupRange) return;
    if (!/^\d+-\d+$/.test(row.groupRange)) throw new MetadataImportError('GROUP RANGE must use zero-based START-END form.', row.line);
    const [start, end] = row.groupRange.split('-').map(Number);
    if (start > end || start < 0 || end >= trackCount) {
        throw new MetadataImportError(`GROUP RANGE ${row.groupRange} is outside the current disc.`, row.line);
    }
    const existing = definitions.get(row.groupRange);
    if (existing && (existing.name !== row.groupName || existing.fullWidthName !== row.groupFullWidthName)) {
        throw new MetadataImportError(`GROUP RANGE ${row.groupRange} has conflicting names.`, row.line);
    }
    definitions.set(row.groupRange, { name: row.groupName, fullWidthName: row.groupFullWidthName, line: row.line });
}

function validateNonOverlappingRanges(definitions: Map<string, { line: number }>) {
    const ranges = [...definitions.entries()]
        .map(([range, value]) => ({ ...value, range, bounds: range.split('-').map(Number) as [number, number] }))
        .sort((a, b) => a.bounds[0] - b.bounds[0]);
    for (let index = 1; index < ranges.length; index += 1) {
        if (ranges[index].bounds[0] <= ranges[index - 1].bounds[1]) {
            throw new MetadataImportError(`GROUP RANGE ${ranges[index].range} overlaps ${ranges[index - 1].range}.`, ranges[index].line);
        }
    }
}

function rowMatchesTrack(row: MetadataImportRow, track: Track) {
    return (
        Math.abs(track.duration - row.duration) < 2 &&
        track.encoding.codec.toLowerCase() === row.codec.toLowerCase() &&
        (row.bitrate === undefined || track.encoding.bitrate === row.bitrate)
    );
}

function parseWholeNumber(value: string, field: string, line: number) {
    if (!/^\d+$/.test(value)) throw new MetadataImportError(`${field} must be a non-negative whole number.`, line);
    return Number(value);
}

function parseNonNegativeNumber(value: string, field: string, line: number) {
    if (value.trim() === '' || !Number.isFinite(Number(value)) || Number(value) < 0) {
        throw new MetadataImportError(`${field} must be a non-negative number.`, line);
    }
    return Number(value);
}

function sameHeader(actual: string[], expected: readonly string[]) {
    return actual.length === expected.length && actual.every((cell, index) => cell === expected[index]);
}
