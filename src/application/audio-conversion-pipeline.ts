import type { Codec } from '../services/interfaces/netmd';
import type { AudioExportService, ExportParams } from '../services/audio/audio-export';
import type { TitledFile, AdaptiveFile } from '../utils';
import { isDeferredFile } from './deferred-file';

export interface ConvertedImportAudio {
    file: TitledFile;
    data: ArrayBuffer;
}

export interface AudioConversionHooks {
    isCancelled?: () => boolean;
    onTrackStarted?: (index: number, total: number, file: TitledFile) => void;
    onTrackProgress?: (index: number, total: number, progress: { state: number; total: number }) => void;
    onTrackConverted?: (index: number, total: number, file: TitledFile, byteLength: number) => void;
    onQueueFinished?: (totalBytes: number, startedCount: number) => void;
}

export class ImportAudioConversionError extends Error {
    readonly sourceName: string;

    constructor(sourceName: string, message: string, options?: ErrorOptions) {
        super(`${sourceName}: ${message}`, options);
        this.name = 'ImportAudioConversionError';
        this.sourceName = sourceName;
    }
}

export async function* convertImportAudio(
    files: TitledFile[],
    format: Codec,
    parameters: { enableReplayGain: boolean; enableGapless: boolean },
    audioExportService: AudioExportService,
    hooks: AudioConversionHooks = {}
): AsyncGenerator<ConvertedImportAudio> {
    const converted: Promise<ConvertedImportAudio>[] = [];
    let nextIndex = 0;
    let totalBytes = 0;
    let queueFinished = false;

    const finishQueue = () => {
        if (queueFinished) return;
        queueFinished = true;
        hooks.onQueueFinished?.(totalBytes, nextIndex);
    };

    const convertNext = () => {
        if (nextIndex === files.length || hooks.isCancelled?.()) {
            finishQueue();
            return;
        }

        const index = nextIndex++;
        const file = files[index];
        hooks.onTrackStarted?.(index, files.length, file);
        converted[index] = convertOne(file, index)
            .then((result) => {
                totalBytes += result.data.byteLength;
                hooks.onTrackConverted?.(index, files.length, file, result.data.byteLength);
                convertNext();
                return result;
            })
            .catch((error) => {
                finishQueue();
                throw error;
            });
    };

    const convertOne = async (file: TitledFile, index: number): Promise<ConvertedImportAudio> => {
        const input = isDeferredFile(file.file) ? await file.file.getFile() : file.file;
        if (file.forcedEncoding !== null) {
            try {
                if ('getForEncoding' in input) throw new Error('Adaptive files cannot be pre-encoded.');
                const data = (await (input as File).arrayBuffer()).slice(file.bytesToSkip);
                return { file, data };
            } catch (error) {
                throw new ImportAudioConversionError(file.file.name, 'Could not read the pre-encoded track.', {
                    cause: error,
                });
            }
        }

        try {
            const exportParams: ExportParams = {
                format: resolveExportFormat(format),
                enableReplayGain: parameters.enableReplayGain,
                writeGapless: parameters.enableGapless && index !== files.length - 1,
            };
            let data: ArrayBuffer;
            if ('getForEncoding' in input) {
                data = await (input as AdaptiveFile).getForEncoding(exportParams);
            } else {
                await audioExportService.prepare(input as File);
                data = await audioExportService.export(exportParams, (progress) =>
                    hooks.onTrackProgress?.(index, files.length, progress)
                );
            }
            return { file, data };
        } catch (error) {
            throw new ImportAudioConversionError(file.file.name, 'Unsupported or unrecognized format.', { cause: error });
        }
    };

    convertNext();
    let index = 0;
    while (index < converted.length) {
        yield await converted[index];
        delete converted[index];
        index += 1;
    }
    finishQueue();
}

function resolveExportFormat(format: Codec): ExportParams['format'] {
    if (format.codec === 'SPS' || format.codec === 'SPM') return { codec: 'PCM', bitrate: 1411 };
    return { codec: format.codec, bitrate: format.bitrate };
}
