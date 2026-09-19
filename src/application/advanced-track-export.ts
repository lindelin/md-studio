import { convertToWAV, createDownloadTrackName, getTracks } from '../utils';
import type { AdvancedBadSectorDecision } from './contracts';
import { ApplicationError } from './contracts';
import { INTERACTIVE_ADVANCED_AUTHORIZATION } from './interactive-authorization';
import type { MiniDiscApplication } from './minidisc-application';
import type { TaskManager, TaskSnapshot } from './task-manager';
import type { TrackExportSink } from './track-export';

export interface AdvancedTrackExportRequest {
    indexes: number[];
    convertToWav: boolean;
    nerawDownload: boolean;
    useSlowerExploit: boolean;
}

export type AdvancedBadSectorHandler = (
    address: string,
    count: number,
    seconds: number
) => Promise<AdvancedBadSectorDecision>;

export class BrowserAdvancedTrackExporter {
    async start(
        request: AdvancedTrackExportRequest,
        application: MiniDiscApplication,
        tasks: TaskManager,
        sink: TrackExportSink,
        handleBadSector: AdvancedBadSectorHandler
    ): Promise<TaskSnapshot> {
        if (request.indexes.length === 0) throw new ApplicationError('INVALID_INPUT', 'At least one track is required.');
        if (request.convertToWav && request.nerawDownload) {
            throw new ApplicationError('INVALID_INPUT', 'NERAW export cannot be converted to WAV.');
        }
        const snapshot = await application.refresh(false);
        if (!snapshot.disc) throw new ApplicationError('NO_DISC', 'Insert a disc before exporting tracks.');
        const tracks = getTracks(snapshot.disc);
        const requested = new Set(request.indexes);
        const selected = tracks.filter((track) => requested.has(track.index));
        if (requested.size !== request.indexes.length || selected.length !== request.indexes.length) {
            throw new ApplicationError('INVALID_INPUT', 'The advanced export contains a duplicate or missing track.');
        }

        const task = tasks.create(
            'advanced.track-export',
            `Export ${selected.length} track${selected.length === 1 ? '' : 's'} with device recovery`,
            selected.length,
            'tracks'
        );
        tasks.start(task.id, 'preparing');
        void this.run(task.id, request, selected, application, tasks, sink, handleBadSector);
        return tasks.get(task.id);
    }

    private async run(
        taskId: string,
        request: AdvancedTrackExportRequest,
        selected: ReturnType<typeof getTracks>,
        application: MiniDiscApplication,
        tasks: TaskManager,
        sink: TrackExportSink,
        handleBadSector: AdvancedBadSectorHandler
    ) {
        const files: string[] = [];
        try {
            const completed = await application.exportAdvancedTracks(
                selected.map((track) => track.index),
                request.useSlowerExploit,
                {
                    nerawDownload: request.nerawDownload,
                    shouldCancel: () => tasks.isCancellationRequested(taskId),
                    handleBadSector,
                },
                INTERACTIVE_ADVANCED_AUTHORIZATION,
                (index, progress) => {
                    const position = selected.findIndex((track) => track.index === index);
                    const track = selected[position];
                    tasks.setPhase(taskId, 'transferring');
                    tasks.reportProgress(taskId, {
                        completed: Math.max(0, position),
                        currentLabel:
                            progress.action === 'READ' && progress.sector
                                ? `Reading sector ${progress.sector}`
                                : progress.action === 'SEEK'
                                  ? 'Seeking'
                                  : track.title ?? `Track ${index + 1}`,
                        bytesWritten: progress.read,
                        bytesTotal: progress.total,
                        currentPercent: progress.total === 0 ? 0 : (Math.min(progress.read, progress.total) / progress.total) * 100,
                    });
                },
                async (index, received) => {
                    const position = selected.findIndex((track) => track.index === index);
                    const track = selected[position];
                    let data = received.data;
                    let fileName = createDownloadTrackName(track, received.extension);
                    if (request.convertToWav) {
                        tasks.setPhase(taskId, 'converting');
                        data = await convertToWAV(received, track);
                        fileName = fileName.replace(/\.[^.]+$/, '.wav');
                    }
                    await sink(data, fileName);
                    files.push(fileName);
                    tasks.reportProgress(taskId, {
                        completed: position + 1,
                        currentLabel: fileName,
                        currentPercent: 100,
                    });
                }
            );
            if (tasks.get(taskId).status !== 'running') return;
            if (tasks.isCancellationRequested(taskId)) {
                tasks.cancel(taskId, { exportedTracks: completed, files });
            } else {
                tasks.succeed(taskId, { exportedTracks: completed, files });
            }
        } catch (error) {
            if (tasks.get(taskId).status === 'running') {
                tasks.fail(taskId, error, {
                    completedItems: files.length,
                    pendingItems: selected.length - files.length,
                    recoveryAction:
                        files.length > 0
                            ? 'Keep the completed files and retry only the remaining tracks.'
                            : 'Keep the device connected and retry the advanced export.',
                });
            }
        }
    }
}
