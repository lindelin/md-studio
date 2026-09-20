import type { Disc, Codec } from '../services/interfaces/netmd';
import type { TitledFile } from '../utils';
import { allocateRecordingTitle } from '../domain/recording-title-budget';
import type { ConvertedImportAudio } from './audio-conversion-pipeline';
import { ImportAudioConversionError } from './audio-conversion-pipeline';
import type { AdvancedUploadService, DeviceUploadService } from './contracts';

type FactoryUploadService = AdvancedUploadService;

export type ImportUploadPhase = 'converting' | 'transferring' | 'finalizing';

export interface ImportUploadTrack {
    index: number;
    total: number;
    file: TitledFile;
    displayTitle: string;
}

export interface ImportUploadHooks {
    onPhase?: (phase: ImportUploadPhase) => void;
    onTrackStarted?: (track: ImportUploadTrack) => void;
    onTrackProgress?: (
        track: ImportUploadTrack,
        progress: { written: number; encrypted: number; total: number }
    ) => void;
    onTrackCompleted?: (track: ImportUploadTrack) => void;
}

export interface ImportUploadSessionOptions {
    tracks: AsyncIterable<ConvertedImportAudio>;
    totalTracks: number;
    format: Codec;
    disc: Disc;
    service: DeviceUploadService;
    factoryService?: FactoryUploadService;
    usesHiMDTitles: boolean;
    useFullWidthTitles: boolean;
    disableMonoUploadOnFinish?: boolean;
    isCancelled?: () => boolean;
    signal?: AbortSignal;
    hooks?: ImportUploadHooks;
}

export interface ImportUploadSessionResult {
    writtenTracks: number;
    cancelled: boolean;
}

export class ImportUploadSessionError extends Error {
    readonly stage: 'prepare' | 'conversion' | 'transfer' | 'finalize' | 'homebrew-cleanup';
    readonly writtenTracks: number;
    readonly displayMessage: string;

    constructor(
        stage: ImportUploadSessionError['stage'],
        message: string,
        displayMessage: string,
        writtenTracks: number,
        options?: ErrorOptions
    ) {
        super(message, options);
        this.name = 'ImportUploadSessionError';
        this.stage = stage;
        this.writtenTracks = writtenTracks;
        this.displayMessage = displayMessage;
    }
}

export async function runImportUploadSession(options: ImportUploadSessionOptions): Promise<ImportUploadSessionResult> {
    const hooks = options.hooks ?? {};
    let prepared = false;
    let writtenTracks = 0;
    let primaryError: ImportUploadSessionError | undefined;
    let titleBudget = options.service.getRemainingCharactersForTitles(options.disc);

    if (options.signal?.aborted || options.isCancelled?.()) {
        return { writtenTracks: 0, cancelled: true };
    }

    try {
        try {
            await options.service.prepareUpload();
            prepared = true;
        } catch (error) {
            throw failure(
                'prepare',
                error,
                'The device could not start an upload session.',
                'The device could not prepare for recording.',
                writtenTracks
            );
        }
        hooks.onPhase?.('converting');

        try {
            for await (const converted of options.tracks) {
                if (options.isCancelled?.()) break;
                hooks.onPhase?.('transferring');

                const { file, data } = converted;
                const format = file.forcedEncoding ?? options.format;
                let halfWidthTitle = file.title;
                let fullWidthTitle = '';
                if (!options.usesHiMDTitles) {
                    const allocated = allocateRecordingTitle(
                        options.service.sanitizeHalfWidthTitle(file.title),
                        options.service.sanitizeFullWidthTitle(file.fullWidthTitle),
                        titleBudget,
                        options.useFullWidthTitles,
                        format.codec === 'SPS' || format.codec === 'SPM' ? 0 : 7
                    );
                    halfWidthTitle = allocated.halfWidthTitle;
                    fullWidthTitle = allocated.fullWidthTitle;
                    titleBudget = allocated.remaining;
                }

                const displayTitle = [halfWidthTitle, fullWidthTitle].filter(Boolean).join(' / ');
                const track: ImportUploadTrack = {
                    index: writtenTracks,
                    total: options.totalTracks,
                    file,
                    displayTitle,
                };
                hooks.onTrackStarted?.(track);
                const reportProgress = (progress: { written: number; encrypted: number; total: number }) =>
                    hooks.onTrackProgress?.(track, progress);
                reportProgress({ written: 0, encrypted: 0, total: 100 });

                try {
                    if (file.forcedEncoding?.codec === 'SPS' || file.forcedEncoding?.codec === 'SPM') {
                        if (!options.factoryService) throw new Error('ATRAC1 upload support is unavailable.');
                        await options.factoryService.uploadSP(
                            halfWidthTitle,
                            fullWidthTitle,
                            file.forcedEncoding.codec === 'SPM',
                            data,
                            reportProgress
                        );
                    } else {
                        await options.service.upload(
                            options.usesHiMDTitles
                                ? { title: file.title, artist: file.artist, album: file.album }
                                : halfWidthTitle,
                            fullWidthTitle,
                            data,
                            format,
                            reportProgress,
                            options.signal
                        );
                    }
                } catch (error) {
                    if (options.signal?.aborted || options.isCancelled?.()) break;
                    throw failure(
                        'transfer',
                        error,
                        `Could not transfer ${file.file.name}.`,
                        'The recording task stopped before all tracks were transferred.',
                        writtenTracks
                    );
                }
                writtenTracks += 1;
                hooks.onTrackCompleted?.({ ...track, index: writtenTracks - 1 });
            }
        } catch (error) {
            if (error instanceof ImportUploadSessionError) throw error;
            if (error instanceof ImportAudioConversionError) {
                throw failure('conversion', error, error.message, error.message, writtenTracks);
            }
            throw error;
        }
    } catch (error) {
        primaryError =
            error instanceof ImportUploadSessionError
                ? error
                : failure(
                      prepared ? 'transfer' : 'prepare',
                      error,
                      'The recording task stopped unexpectedly.',
                      'The recording task stopped before all tracks were transferred.',
                      writtenTracks
                  );
    } finally {
        hooks.onPhase?.('finalizing');
        if (prepared) {
            try {
                await options.service.finalizeUpload();
            } catch (error) {
                primaryError ??= failure(
                    'finalize',
                    error,
                    'The upload session could not be finalized.',
                    'Tracks were transferred, but the device upload session could not be finalized.',
                    writtenTracks
                );
            }
        }
        if (options.disableMonoUploadOnFinish) {
            if (!options.factoryService) {
                primaryError ??= failure(
                    'homebrew-cleanup',
                    new Error('The factory upload service is unavailable.'),
                    'The factory upload service is unavailable.',
                    'The device did not leave mono upload mode cleanly.',
                    writtenTracks
                );
            } else {
                try {
                    await options.factoryService.enableMonoUpload(false);
                } catch (error) {
                    primaryError ??= failure(
                        'homebrew-cleanup',
                        error,
                        'The device could not leave mono upload mode.',
                        'The device did not leave mono upload mode cleanly.',
                        writtenTracks
                    );
                }
            }
        }
    }

    if (primaryError) throw primaryError;
    return { writtenTracks, cancelled: options.signal?.aborted || (options.isCancelled?.() ?? false) };
}

function failure(
    stage: ImportUploadSessionError['stage'],
    error: unknown,
    fallbackMessage: string,
    displayMessage: string,
    writtenTracks: number
) {
    const message = error instanceof Error && error.message ? error.message : fallbackMessage;
    return new ImportUploadSessionError(stage, message, displayMessage, writtenTracks, { cause: error });
}
