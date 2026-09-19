import type { Codec, Disc, MinidiscSpec, Track } from '../services/interfaces/netmd';

export interface ImportPreviewTrack {
    id: string;
    title: string;
    fullWidthTitle?: string;
    album?: string;
    artist?: string;
    duration?: number;
    forcedEncoding?: { codec: string; bitrate: number } | null;
}

export interface ImportPreview {
    deviceSessionId: string;
    deviceRevision: number;
    importRevision: number;
    selectedIds: string[];
    selectedFormat: Codec;
    measurementUnits: 'bytes' | 'frames';
    complete: boolean;
    issues: Array<{
        id: string;
        code: 'MISSING_DURATION' | 'UNSUPPORTED_FORCED_FORMAT';
        message: string;
    }>;
    items: Array<{
        id: string;
        format: Codec | null;
        duration: number | null;
        required: number | null;
        requiredInSelectedFormat: number | null;
        remaining: number;
        remainingInSelectedFormat: number;
        capacityFits: boolean;
        titles: {
            halfWidthRequired: number;
            fullWidthRequired: number;
            halfWidthRemaining: number;
            fullWidthRemaining: number;
            fits: boolean;
        };
    }>;
    capacity: {
        availableBefore: number;
        required: number;
        remaining: number;
        availableBeforeInSelectedFormat: number;
        remainingInSelectedFormat: number;
        fits: boolean;
    };
    titles: {
        halfWidthBefore: number;
        fullWidthBefore: number;
        halfWidthRemaining: number;
        fullWidthRemaining: number;
        fits: boolean;
    };
}

export type ImportPreviewCalculation = Omit<ImportPreview, 'deviceSessionId' | 'deviceRevision' | 'importRevision'>;

export class ImportPreviewError extends Error {}

export function calculateImportPreview(
    spec: MinidiscSpec,
    disc: Disc,
    tracks: ImportPreviewTrack[],
    requestedFormat: { codec: string; bitrate: number }
): ImportPreviewCalculation {
    const selectedFormat = resolveSupportedFormat(spec, requestedFormat);
    const issues: ImportPreviewCalculation['issues'] = [];
    const items: ImportPreviewCalculation['items'] = [];
    const titleBefore = spec.getRemainingCharactersForTitles(disc);
    let required = 0;
    let halfWidthRemaining = titleBefore.halfWidth;
    let fullWidthRemaining = titleBefore.fullWidth;

    for (const track of tracks) {
        const forced = resolveForcedFormat(spec, track, selectedFormat);
        const format = forced === null ? null : (forced ?? selectedFormat);
        let itemRequired: number | null = null;
        if (track.duration === undefined) {
            issues.push({ id: track.id, code: 'MISSING_DURATION', message: `${track.title || track.id} has no known duration.` });
        } else if (format === null) {
            issues.push({
                id: track.id,
                code: 'UNSUPPORTED_FORCED_FORMAT',
                message: `${track.title || track.id} uses a pre-encoded format that this device does not support.`,
            });
        } else {
            itemRequired = spec.translateToDefaultMeasuringModeFrom(format, track.duration);
            required += itemRequired;
        }

        const titleRequired = spec.getCharactersForTitle(toPreviewTrack(track));
        halfWidthRemaining -= titleRequired.halfWidth;
        fullWidthRemaining -= titleRequired.fullWidth;
        const itemRemaining = disc.left - required;
        items.push({
            id: track.id,
            format,
            duration: track.duration ?? null,
            required: itemRequired,
            requiredInSelectedFormat: itemRequired === null ? null : translateDefaultUnits(spec, selectedFormat, itemRequired),
            remaining: itemRemaining,
            remainingInSelectedFormat: translateDefaultUnits(spec, selectedFormat, itemRemaining),
            capacityFits: itemRequired !== null && itemRemaining >= 0,
            titles: {
                halfWidthRequired: titleRequired.halfWidth,
                fullWidthRequired: titleRequired.fullWidth,
                halfWidthRemaining,
                fullWidthRemaining,
                fits: halfWidthRemaining >= 0 && fullWidthRemaining >= 0,
            },
        });
    }

    const remaining = disc.left - required;
    const complete = issues.length === 0;
    return {
        selectedIds: tracks.map((track) => track.id),
        selectedFormat,
        measurementUnits: spec.measurementUnits,
        complete,
        issues,
        items,
        capacity: {
            availableBefore: disc.left,
            required,
            remaining,
            availableBeforeInSelectedFormat: translateDefaultUnits(spec, selectedFormat, disc.left),
            remainingInSelectedFormat: translateDefaultUnits(spec, selectedFormat, remaining),
            fits: complete && remaining >= 0,
        },
        titles: {
            halfWidthBefore: titleBefore.halfWidth,
            fullWidthBefore: titleBefore.fullWidth,
            halfWidthRemaining,
            fullWidthRemaining,
            fits: halfWidthRemaining >= 0 && fullWidthRemaining >= 0,
        },
    };
}

function resolveSupportedFormat(spec: MinidiscSpec, requested: { codec: string; bitrate: number }): Codec {
    const family = spec.availableFormats.find(
        (format) => format.codec === requested.codec && format.availableBitrates.includes(requested.bitrate)
    );
    if (!family) throw new ImportPreviewError(`The connected device does not support ${requested.codec}@${requested.bitrate}kbps.`);
    return { codec: family.codec, bitrate: requested.bitrate };
}

function resolveForcedFormat(spec: MinidiscSpec, track: ImportPreviewTrack, selected: Codec): Codec | null | undefined {
    const forced = track.forcedEncoding;
    if (!forced || (forced.codec === 'MP3' && selected.codec !== 'MP3')) return undefined;
    try {
        return resolveSupportedFormat(spec, forced);
    } catch {
        return null;
    }
}

function translateDefaultUnits(spec: MinidiscSpec, format: Codec, units: number) {
    return spec.measurementUnits === 'frames' ? spec.translateDefaultMeasuringModeTo(format, units) : units;
}

function toPreviewTrack(track: ImportPreviewTrack): Track {
    return {
        index: 0,
        title: track.title,
        fullWidthTitle: track.fullWidthTitle ?? '',
        album: track.album,
        artist: track.artist,
        duration: track.duration ?? 0,
        channel: 2,
        encoding: { codec: 'SPS', bitrate: 292 },
        protected: null as unknown as Track['protected'],
    };
}
