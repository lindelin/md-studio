import type { AudioExportService } from '../services/audio/audio-export';
import type { Codec } from '../services/interfaces/netmd';
import type { TitledFile } from '../utils';
import { convertImportAudio } from './audio-conversion-pipeline';
import type { BrowserLocalFileGateway } from './browser-local-file-gateway';
import { ApplicationError, type DeviceSnapshot } from './contracts';
import { createDeferredFile, isAdaptiveFile, isDeferredFile } from './deferred-file';
import type { ImportQueue, ImportWriteRequest, ImportWriter } from './import-queue';
import {
    assertDiscWritableForImport,
    assertImportDeviceVersion,
    assertImportPreviewWritable,
    assertImportWritePolicy,
} from './import-write-policy';
import { ImportUploadSessionError, runImportUploadSession } from './import-upload-session';
import { INTERACTIVE_ADVANCED_AUTHORIZATION, INTERACTIVE_HOMEBREW_AUTHORIZATION } from './interactive-authorization';
import type { MiniDiscApplication } from './minidisc-application';
import type { TaskManager, TaskStageProgress } from './task-manager';

export interface BrowserImportWriterDependencies {
    getApplication(): MiniDiscApplication | undefined;
    getAudioExportService(): Promise<AudioExportService>;
    getUseFullWidthTitles(): boolean;
    localFiles: BrowserLocalFileGateway;
    notifyCompleted?(): void;
}

export class BrowserImportWriter implements ImportWriter {
    constructor(private readonly dependencies: BrowserImportWriterDependencies) {}

    async start(request: ImportWriteRequest, queue: ImportQueue, tasks: TaskManager) {
        const selected = queue.resolveSelection(request.ids, request.expectedRevision);
        const application = this.dependencies.getApplication();
        if (!application) {
            throw new ApplicationError('NO_DISC', 'Connect a MiniDisc device before starting a write task.');
        }
        const device = application.readSnapshot() ?? (await application.refresh());
        assertImportDeviceVersion(request.expectedDeviceSessionId, request.expectedDeviceRevision, device.sessionId, device.revision);
        assertDiscWritableForImport(device.disc);

        const preview = await application.previewImports(
            selected.map(({ item }) => item),
            request.expectedRevision ?? queue.snapshot().revision,
            request.format,
            request.expectedDeviceRevision
        );
        assertImportPreviewWritable(preview);
        const format = preview.selectedFormat;
        assertImportWritePolicy({
            selected,
            format,
            nativeMonoUpload: device.capabilities.includes('track.uploadMono'),
            allowInteractiveHomebrew: request.interactiveHomebrewAuthorization === INTERACTIVE_HOMEBREW_AUTHORIZATION,
        });

        const task = tasks.create(
            'disc.write',
            `Write ${selected.length} track${selected.length === 1 ? '' : 's'} to MiniDisc`,
            selected.length,
            'tracks'
        );
        tasks.start(task.id, 'preparing');
        void this.run(
            task.id,
            selected,
            request,
            format,
            { sessionId: device.sessionId, revision: device.revision },
            device,
            queue,
            tasks,
            application
        );
        return tasks.get(task.id);
    }

    private async run(
        taskId: string,
        selected: ReturnType<ImportQueue['resolveSelection']>,
        request: ImportWriteRequest,
        format: Codec,
        deviceVersion: { sessionId: string; revision: number },
        device: DeviceSnapshot,
        queue: ImportQueue,
        tasks: TaskManager,
        application: MiniDiscApplication
    ) {
        const originalTitle = typeof document === 'undefined' ? '' : document.title;
        let wakeLock: { release(): Promise<void> } | undefined;
        let error: unknown;
        let errorMessage: string | undefined;
        let writtenTracks = 0;
        let cancelled = false;

        const isRunning = () => tasks.get(taskId).status === 'running';
        const isCancelled = () => {
            const task = tasks.get(taskId);
            return task.cancellationRequested || task.status === 'cancelled' || task.status === 'interrupted';
        };

        try {
            const files = await this.resolveFiles(selected, format);
            const usesAtrac1Upload = files.some(({ forcedEncoding }) => forcedEncoding?.codec === 'SPS' || forcedEncoding?.codec === 'SPM');
            const usesMonoUploadExploit = format.codec === 'SPM' && !device.capabilities.includes('track.uploadMono');
            const requiredExploitCapabilities = [usesAtrac1Upload && 'uploadAtrac1', usesMonoUploadExploit && 'uploadMonoSP'].filter(
                (value): value is string => Boolean(value)
            );

            const stages: Record<string, TaskStageProgress> = {
                conversion: { completed: 0, total: files.length, currentLabel: '' },
                transfer: { completed: 0, buffered: 0, total: 1, currentLabel: '' },
            };
            const publishStages = (progress: Parameters<TaskManager['reportProgress']>[1] = {}) => {
                if (isRunning()) tasks.reportProgress(taskId, { ...progress, stages });
            };
            publishStages();
            const audioExportService = await this.dependencies.getAudioExportService();
            wakeLock = await this.acquireWakeLock();

            const result = await application.runDeviceUploadSession(
                requiredExploitCapabilities,
                requiredExploitCapabilities.length > 0 ? INTERACTIVE_ADVANCED_AUTHORIZATION : undefined,
                async (uploadService, advancedUploadService) => {
                    if (usesMonoUploadExploit) await advancedUploadService!.enableMonoUpload(true);

                    let totalBytesAllTracks = 0;
                    let bytesSentFromPreviousTracks = 0;
                    let bytesSentFromCurrentTrack = 0;
                    let lastTransferUpdate = 0;
                    let lastEncodingUpdate = 0;
                    const updateTitle = () => {
                        if (typeof document === 'undefined') return;
                        if (totalBytesAllTracks === 0) {
                            document.title = `Converting | ${originalTitle}`;
                            return;
                        }
                        const percentage = Math.floor(
                            (100 * (bytesSentFromCurrentTrack + bytesSentFromPreviousTracks)) / totalBytesAllTracks
                        );
                        document.title = `${percentage}% complete | Upload | ${originalTitle}`;
                    };

                    const conversion = convertImportAudio(
                        files,
                        format,
                        {
                            enableReplayGain: request.enableReplayGain ?? false,
                            enableGapless: request.enableGapless ?? false,
                        },
                        audioExportService,
                        {
                            isCancelled,
                            onTrackStarted: (index, _total, file) => {
                                stages.conversion = {
                                    completed: index,
                                    total: files.length,
                                    currentLabel: file.title,
                                };
                                publishStages();
                                updateTitle();
                            },
                            onTrackProgress: (index, total, progress) => {
                                const now = Date.now();
                                if (now - lastEncodingUpdate < 200 && progress.state < progress.total) return;
                                lastEncodingUpdate = now;
                                const completed = index + progress.state / Math.max(1, progress.total);
                                stages.conversion = {
                                    completed,
                                    total,
                                    currentLabel: stages.conversion.currentLabel,
                                };
                                publishStages({ currentPercent: (completed / Math.max(1, total)) * 100 });
                            },
                            onQueueFinished: (totalBytes, startedCount) => {
                                totalBytesAllTracks = totalBytes;
                                stages.conversion = { completed: startedCount, total: files.length, currentLabel: '' };
                                publishStages();
                                updateTitle();
                            },
                        }
                    );

                    return runImportUploadSession({
                        tracks: conversion,
                        totalTracks: files.length,
                        format,
                        disc: device.disc!,
                        service: uploadService,
                        factoryService: advancedUploadService,
                        usesHiMDTitles: device.capabilities.includes('metadata.himd'),
                        useFullWidthTitles: this.dependencies.getUseFullWidthTitles(),
                        disableMonoUploadOnFinish: usesMonoUploadExploit,
                        isCancelled,
                        hooks: {
                            onPhase: (phase) => {
                                if (isRunning() && tasks.get(taskId).phase !== phase) tasks.setPhase(taskId, phase);
                            },
                            onTrackStarted: (track) => {
                                bytesSentFromPreviousTracks += bytesSentFromCurrentTrack;
                                bytesSentFromCurrentTrack = 0;
                                stages.transfer = {
                                    completed: 0,
                                    buffered: 0,
                                    total: 1,
                                    currentLabel: track.displayTitle,
                                };
                                publishStages({ completed: track.index, currentLabel: track.displayTitle, currentPercent: 0 });
                            },
                            onTrackProgress: (_track, progress) => {
                                bytesSentFromCurrentTrack = progress.written;
                                const now = Date.now();
                                if (now - lastTransferUpdate < 200 && progress.written < progress.total) return;
                                lastTransferUpdate = now;
                                stages.transfer = {
                                    completed: progress.written,
                                    buffered: progress.encrypted,
                                    total: progress.total,
                                    currentLabel: stages.transfer.currentLabel,
                                };
                                publishStages({
                                    bytesWritten: bytesSentFromPreviousTracks + progress.written,
                                    bytesTotal: totalBytesAllTracks || bytesSentFromPreviousTracks + progress.total,
                                    currentPercent: (progress.written / Math.max(1, progress.total)) * 100,
                                });
                                updateTitle();
                            },
                            onTrackCompleted: (track) => {
                                stages.transfer = {
                                    ...stages.transfer,
                                    completed: stages.transfer.total,
                                    buffered: stages.transfer.total,
                                };
                                publishStages({ completed: track.index + 1 });
                            },
                        },
                    });
                },
                deviceVersion
            );

            writtenTracks = result.value.writtenTracks;
            cancelled = result.value.cancelled;
        } catch (caughtError) {
            error = caughtError;
            if (caughtError instanceof ImportUploadSessionError) {
                writtenTracks = caughtError.writtenTracks;
                errorMessage = caughtError.displayMessage;
            } else {
                errorMessage = 'The recording task stopped before all tracks were transferred.';
            }
        } finally {
            if (typeof document !== 'undefined') document.title = originalTitle;
            if (wakeLock) {
                try {
                    await wakeLock.release();
                } catch (releaseError) {
                    console.error('Could not release the screen wake lock.', releaseError);
                }
            }

            if (isRunning()) {
                if (error) {
                    tasks.fail(taskId, error, {
                        completedItems: writtenTracks,
                        pendingItems: selected.length - writtenTracks,
                        recoveryAction:
                            writtenTracks > 0
                                ? 'Refresh the disc, keep the completed tracks, and retry only the remaining imports.'
                                : 'Check the source audio, encoder, and device connection before retrying the write.',
                        details: errorMessage ? { displayMessage: errorMessage } : undefined,
                    });
                } else if (cancelled || isCancelled()) {
                    tasks.cancel(taskId, { writtenTracks });
                } else {
                    tasks.succeed(taskId, { writtenTracks });
                    this.dependencies.notifyCompleted?.();
                }
            }

            const finalTask = tasks.get(taskId);
            if (finalTask.status === 'succeeded' && request.removeOnSuccess) {
                const currentIds = new Set(queue.snapshot().items.map(({ id }) => id));
                const completedIds = selected.map(({ item }) => item.id).filter((id) => currentIds.has(id));
                if (completedIds.length > 0) queue.remove(completedIds);
            }
        }
    }

    private async resolveFiles(selected: ReturnType<ImportQueue['resolveSelection']>, selectedFormat: Codec) {
        const files: TitledFile[] = [];
        for (const { item, payload } of selected) {
            let resolvedPayload = payload;
            if (resolvedPayload === undefined && item.kind === 'local-path' && this.dependencies.localFiles.canResolve()) {
                resolvedPayload = createDeferredFile(item.name, item.reference, (reference) =>
                    this.dependencies.localFiles.resolve(reference)
                );
            }
            if (!(resolvedPayload instanceof File) && !isAdaptiveFile(resolvedPayload) && !isDeferredFile(resolvedPayload)) {
                throw new ApplicationError('INVALID_INPUT', `Import item ${item.name} has no readable audio payload.`, {
                    id: item.id,
                });
            }
            files.push({
                file: resolvedPayload,
                title: item.title,
                fullWidthTitle: item.fullWidthTitle ?? '',
                forcedEncoding:
                    item.forcedEncoding?.codec === 'MP3' && selectedFormat.codec !== 'MP3'
                        ? null
                        : ((item.forcedEncoding as TitledFile['forcedEncoding']) ?? null),
                bytesToSkip:
                    item.forcedEncoding?.codec === 'MP3' && selectedFormat.codec !== 'MP3' ? 0 : (item.bytesToSkip ?? 0),
                artist: item.artist ?? '',
                album: item.album ?? '',
            });
        }
        return files;
    }

    private async acquireWakeLock() {
        if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;
        try {
            return await (
                navigator as Navigator & {
                    wakeLock: { request(type: 'screen'): Promise<{ release(): Promise<void> }> };
                }
            ).wakeLock.request('screen');
        } catch (error) {
            console.warn('Could not acquire the screen wake lock.', error);
            return undefined;
        }
    }
}
