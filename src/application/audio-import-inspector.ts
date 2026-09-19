import {
    getATRACOMAEncoding,
    getATRACWAVEncoding,
    getChannelsFromAEA,
    getMetadataFromFile,
    type AdaptiveFile,
} from '../utils';

export interface InspectedImportFile {
    file: File | AdaptiveFile;
    title: string;
    album: string;
    artist: string;
    duration: number;
    forcedEncoding: { codec: string; bitrate: number } | null;
    bytesToSkip: number;
}

export interface ImportInspectionFailure {
    name: string;
    reason: string;
}

export interface ImportInspectionResult {
    files: InspectedImportFile[];
    failures: ImportInspectionFailure[];
}

export async function inspectImportFiles(
    inputs: readonly (File | AdaptiveFile)[],
    supportedCodecs: readonly string[]
): Promise<ImportInspectionResult> {
    const files: InspectedImportFile[] = [];
    const failures: ImportInspectionFailure[] = [];
    const supported = new Set(supportedCodecs);

    for (const input of inputs) {
        if (isAdaptiveFile(input)) {
            files.push({
                file: input,
                title: input.title,
                album: input.album,
                artist: input.artist,
                duration: input.duration,
                forcedEncoding: null,
                bytesToSkip: 0,
            });
            continue;
        }

        const metadata = await getMetadataFromFile(input);
        let forcedEncoding = await inspectForcedEncoding(input, metadata.bitrate);
        if (forcedEncoding === 'ILLEGAL') {
            failures.push({ name: input.name, reason: 'The file contains an unsupported or invalid ATRAC stream.' });
            continue;
        }
        if (forcedEncoding && !supported.has(forcedEncoding.format.codec)) {
            if (forcedEncoding.format.codec === 'MP3') forcedEncoding = null;
            else {
                failures.push({
                    name: input.name,
                    reason: `The connected device does not support ${forcedEncoding.format.codec} direct upload.`,
                });
                continue;
            }
        }

        files.push({
            file: input,
            ...metadata,
            forcedEncoding: forcedEncoding?.format ?? null,
            bytesToSkip: forcedEncoding?.headerLength ?? 0,
        });
    }

    return { files, failures };
}

function isAdaptiveFile(file: File | AdaptiveFile): file is AdaptiveFile {
    return 'getForEncoding' in file && typeof file.getForEncoding === 'function';
}

async function inspectForcedEncoding(file: File, bitrate: number) {
    let forcedEncoding:
        | { format: { codec: string; bitrate: number }; headerLength: number }
        | 'ILLEGAL'
        | null = await getATRACWAVEncoding(file);

    if (file.name.toLowerCase().endsWith('.aea')) {
        const channels = await getChannelsFromAEA(file);
        if (channels === 1 || channels === 2) {
            return {
                format: { codec: channels === 2 ? 'SPS' : 'SPM', bitrate: channels === 2 ? 292 : 146 },
                headerLength: 2048,
            };
        }
    } else if (file.name.toLowerCase().endsWith('.mp3') && bitrate > 0) {
        return { format: { codec: 'MP3', bitrate }, headerLength: 0 };
    }

    if (forcedEncoding === null) forcedEncoding = await getATRACOMAEncoding(file);
    return forcedEncoding;
}
