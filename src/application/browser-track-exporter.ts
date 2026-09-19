import serviceRegistry from '../services/registry';
import { convertToWAV, createDownloadTrackName, downloadBlob, getTracks } from '../utils';
import { ApplicationError } from './contracts';
import type { MiniDiscApplication } from './minidisc-application';
import type { TaskManager } from './task-manager';
import type { TrackExporter, TrackExportRequest, TrackExportSink } from './track-export';

export class BrowserTrackExporter implements TrackExporter {
    async start(
        request: TrackExportRequest,
        application: MiniDiscApplication,
        tasks: TaskManager,
        sink?: TrackExportSink
    ) {
        if (request.indexes.length === 0) throw new ApplicationError('INVALID_INPUT', 'At least one track is required.');
        const uniqueIndexes = new Set(request.indexes);
        if (uniqueIndexes.size !== request.indexes.length) {
            throw new ApplicationError('INVALID_INPUT', 'A track was supplied more than once.');
        }
        if (request.outputHandle && !serviceRegistry.exportPayloadSink) {
            throw new ApplicationError('CAPABILITY_REQUIRED', 'The local export bridge is not connected.');
        }

        const snapshot = await application.refresh(false);
        if (request.expectedRevision !== undefined && request.expectedRevision !== snapshot.revision) {
            throw new ApplicationError('STALE_REVISION', 'The disc changed after this export was prepared.', {
                expectedRevision: request.expectedRevision,
                actualRevision: snapshot.revision,
            });
        }
        if (!snapshot.capabilities.includes('track.download')) {
            throw new ApplicationError('CAPABILITY_REQUIRED', 'The connected device cannot export tracks.');
        }
        if (!snapshot.disc) throw new ApplicationError('NO_DISC', 'Insert a disc before exporting tracks.');
        const allTracks = getTracks(snapshot.disc);
        const selected = allTracks.filter((track) => uniqueIndexes.has(track.index));
        if (selected.length !== uniqueIndexes.size) {
            const known = new Set(selected.map((track) => track.index));
            const missing = [...uniqueIndexes].filter((index) => !known.has(index));
            throw new ApplicationError('INVALID_INPUT', `Track ${missing[0]} does not exist.`, { missing });
        }

        const task = tasks.create(
            'track.export',
            `Export ${selected.length} track${selected.length === 1 ? '' : 's'} from MiniDisc`,
            selected.length,
            'tracks'
        );
        tasks.start(task.id, 'preparing');
        void this.run(
            task.id,
            selected,
            request,
            application,
            { sessionId: snapshot.sessionId, revision: snapshot.revision },
            tasks,
            sink
        );
        return tasks.get(task.id);
    }

    private async run(
        taskId: string,
        selected: ReturnType<typeof getTracks>,
        request: TrackExportRequest,
        application: MiniDiscApplication,
        deviceVersion: { sessionId: string; revision: number },
        tasks: TaskManager,
        sink?: TrackExportSink
    ) {
        const exportedFiles: string[] = [];
        try {
            await application.runTrackDownloadSession(deviceVersion, async (downloadTrack) => {
                for (const [position, track] of selected.entries()) {
                    if (tasks.isCancellationRequested(taskId)) break;
                    tasks.setPhase(taskId, 'transferring');
                    const received = await downloadTrack(track.index, ({ read, total }) => {
                        if (tasks.get(taskId).status !== 'running') return;
                        tasks.reportProgress(taskId, {
                            completed: position,
                            currentLabel: track.title ?? `Track ${track.index + 1}`,
                            bytesWritten: read,
                            bytesTotal: total,
                        });
                    });
                    if (!received) throw new Error(`The device returned no audio for track ${track.index + 1}.`);

                    let data = received.data;
                    let fileName = createDownloadTrackName(track, received.extension);
                    if (request.convertToWav) {
                        tasks.setPhase(taskId, 'converting');
                        data = await convertToWAV(received, track);
                        fileName = fileName.replace(/\.[^.]+$/, '.wav');
                    }
                    if (sink) {
                        await sink(data, fileName);
                        exportedFiles.push(fileName);
                    } else if (request.outputHandle) {
                        const completedPath = await serviceRegistry.exportPayloadSink!.write(request.outputHandle, fileName, data);
                        exportedFiles.push(completedPath ?? fileName);
                    } else {
                        downloadBlob(new Blob([data], { type: 'application/octet-stream' }), fileName);
                        exportedFiles.push(fileName);
                    }
                    tasks.reportProgress(taskId, { completed: position + 1, currentLabel: fileName });
                }
            });

            if (tasks.get(taskId).status !== 'running') return;
            if (tasks.isCancellationRequested(taskId)) {
                tasks.cancel(taskId, { exportedTracks: exportedFiles.length, files: exportedFiles });
            }
            else tasks.succeed(taskId, { exportedTracks: exportedFiles.length, files: exportedFiles });
        } catch (error) {
            if (tasks.get(taskId).status === 'running') {
                tasks.fail(taskId, error, {
                    completedItems: exportedFiles.length,
                    pendingItems: selected.length - exportedFiles.length,
                    recoveryAction:
                        exportedFiles.length > 0
                            ? 'Keep the completed files and retry only the remaining tracks.'
                            : 'Check the device connection and output directory, then retry the export.',
                });
            }
        }
    }
}
