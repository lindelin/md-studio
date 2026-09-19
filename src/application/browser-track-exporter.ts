import type { AppStore } from '../redux/store';
import serviceRegistry from '../services/registry';
import { Capability } from '../services/interfaces/netmd';
import { convertToWAV, createDownloadTrackName, downloadBlob, getTracks } from '../utils';
import { ApplicationError } from './contracts';
import type { MiniDiscApplication } from './minidisc-application';
import type { TaskManager } from './task-manager';
import type { TrackExporter, TrackExportRequest } from './track-export';

export class BrowserTrackExporter implements TrackExporter {
    constructor(private readonly store: AppStore) {}

    async start(request: TrackExportRequest, application: MiniDiscApplication, tasks: TaskManager) {
        if (request.indexes.length === 0) throw new ApplicationError('INVALID_INPUT', 'At least one track is required.');
        const uniqueIndexes = new Set(request.indexes);
        if (uniqueIndexes.size !== request.indexes.length) {
            throw new ApplicationError('INVALID_INPUT', 'A track was supplied more than once.');
        }
        if (!this.store.getState().main.deviceCapabilities.includes(Capability.trackDownload)) {
            throw new ApplicationError('CAPABILITY_REQUIRED', 'The connected device cannot export tracks.');
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
        void this.run(task.id, selected, request, tasks);
        return tasks.get(task.id);
    }

    private async run(
        taskId: string,
        selected: ReturnType<typeof getTracks>,
        request: TrackExportRequest,
        tasks: TaskManager
    ) {
        const service = serviceRegistry.netmdService;
        if (!service) {
            tasks.fail(taskId, new Error('The MiniDisc device disconnected before export started.'));
            return;
        }
        const exportedFiles: string[] = [];
        try {
            await serviceRegistry.operationCoordinator.run(async () => {
                for (const [position, track] of selected.entries()) {
                    if (tasks.isCancellationRequested(taskId)) break;
                    tasks.setPhase(taskId, 'transferring');
                    const received = await service.download(track.index, ({ read, total }) => {
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
                    if (request.outputHandle) {
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
