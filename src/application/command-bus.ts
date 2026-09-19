import type {
    DestructiveConfirmation,
    DeviceSnapshot,
    GroupMetadataUpdate,
    HiMDTrackMetadataUpdate,
    PlaybackCommand,
    TrackMetadataUpdate,
} from './contracts';
import type { MiniDiscApplication } from './minidisc-application';
import type { TaskSnapshot } from './task-manager';
import { TaskManager } from './task-manager';
import type {
    ImportQueueInput,
    ImportQueueMetadataUpdate,
    ImportQueueSnapshot,
    ImportTrackMetadata,
    ImportWriteRequest,
    ImportWriter,
} from './import-queue';
import { ImportQueue } from './import-queue';
import type { TrackExporter, TrackExportRequest } from './track-export';
import type { MetadataCsvExport, MetadataImportPlan } from '../domain/metadata-import';

export type ApplicationCommand =
    | { type: 'disc.refresh'; dropCache?: boolean }
    | { type: 'disc.rename'; title: string; fullWidthTitle?: string; expectedRevision?: number }
    | { type: 'disc.erase'; confirmation?: DestructiveConfirmation; expectedRevision?: number }
    | { type: 'disc.formatHimd'; confirmation?: DestructiveConfirmation; expectedRevision?: number }
    | { type: 'device.flush'; expectedRevision?: number }
    | { type: 'disc.eject'; expectedRevision?: number }
    | { type: 'metadata.exportCsv' }
    | { type: 'metadata.planCsv'; text: string }
    | { type: 'metadata.applyCsv'; text: string; includedTrackIndexes: number[]; expectedRevision?: number }
    | { type: 'track.renameMany'; updates: TrackMetadataUpdate[]; expectedRevision?: number }
    | { type: 'track.renameHimdMany'; updates: HiMDTrackMetadataUpdate[]; expectedRevision?: number }
    | { type: 'track.move'; sourceIndex: number; destinationIndex: number; expectedRevision?: number }
    | ({ type: 'track.export' } & TrackExportRequest)
    | { type: 'track.deleteMany'; indexes: number[]; confirmation?: DestructiveConfirmation; expectedRevision?: number }
    | { type: 'group.rename'; update: GroupMetadataUpdate; expectedRevision?: number }
    | {
          type: 'group.create';
          firstTrack: number;
          trackCount: number;
          title?: string;
          fullWidthTitle?: string;
          expectedRevision?: number;
      }
    | { type: 'group.deleteMany'; indexes: number[]; expectedRevision?: number }
    | { type: 'playback.control'; command: PlaybackCommand }
    | { type: 'task.list' }
    | { type: 'task.get'; id: string }
    | { type: 'task.cancel'; id: string }
    | { type: 'import.list' }
    | { type: 'import.add'; inputs: Omit<ImportQueueInput, 'payload'>[]; expectedRevision?: number }
    | { type: 'import.update'; id: string; changes: Partial<ImportTrackMetadata>; expectedRevision?: number }
    | { type: 'import.updateMany'; updates: ImportQueueMetadataUpdate[]; expectedRevision?: number }
    | { type: 'import.move'; id: string; destinationIndex: number; expectedRevision?: number }
    | { type: 'import.remove'; ids: string[]; expectedRevision?: number }
    | { type: 'import.clear'; expectedRevision?: number }
    | ({ type: 'import.write' } & ImportWriteRequest);

export interface CommandSuccess {
    ok: true;
    snapshot?: DeviceSnapshot;
    task?: TaskSnapshot;
    tasks?: TaskSnapshot[];
    importQueue?: ImportQueueSnapshot;
    metadataCsv?: MetadataCsvExport;
    metadataPlan?: MetadataImportPlan;
}

export interface CommandFailure {
    ok: false;
    error: { code: string; message: string; details?: Record<string, unknown> };
}

export type CommandResult = CommandSuccess | CommandFailure;

export class ApplicationCommandBus {
    constructor(
        private readonly application: MiniDiscApplication,
        private readonly tasks: TaskManager,
        private readonly imports: ImportQueue,
        private readonly importWriter?: ImportWriter,
        private readonly trackExporter?: TrackExporter
    ) {}

    async execute(command: ApplicationCommand): Promise<CommandResult> {
        try {
            if (command.type === 'task.list') return { ok: true, tasks: this.tasks.list() };
            if (command.type === 'task.get') return { ok: true, task: this.tasks.get(command.id) };
            if (command.type === 'task.cancel') return { ok: true, task: this.tasks.requestCancellation(command.id) };
            if (command.type === 'import.list') return { ok: true, importQueue: this.imports.snapshot() };
            if (command.type === 'import.add') {
                return { ok: true, importQueue: this.imports.add(command.inputs, command.expectedRevision) };
            }
            if (command.type === 'import.update') {
                return {
                    ok: true,
                    importQueue: this.imports.update(command.id, command.changes, command.expectedRevision),
                };
            }
            if (command.type === 'import.updateMany') {
                return {
                    ok: true,
                    importQueue: this.imports.updateMany(command.updates, command.expectedRevision),
                };
            }
            if (command.type === 'import.move') {
                return {
                    ok: true,
                    importQueue: this.imports.move(command.id, command.destinationIndex, command.expectedRevision),
                };
            }
            if (command.type === 'import.remove') {
                return { ok: true, importQueue: this.imports.remove(command.ids, command.expectedRevision) };
            }
            if (command.type === 'import.clear') {
                return { ok: true, importQueue: this.imports.clear(command.expectedRevision) };
            }
            if (command.type === 'import.write') {
                if (!this.importWriter) throw new Error('Audio writing is unavailable in this application environment.');
                return { ok: true, task: await this.importWriter.start(command, this.imports, this.tasks) };
            }
            if (command.type === 'track.export') {
                if (!this.trackExporter) throw new Error('Track export is unavailable in this application environment.');
                return { ok: true, task: await this.trackExporter.start(command, this.application, this.tasks) };
            }
            if (command.type === 'metadata.exportCsv') {
                return { ok: true, metadataCsv: await this.application.exportMetadataCsv() };
            }
            if (command.type === 'metadata.planCsv') {
                return { ok: true, metadataPlan: await this.application.planMetadataImport(command.text) };
            }

            let snapshot: DeviceSnapshot;
            switch (command.type) {
                case 'disc.refresh':
                    snapshot = await this.application.refresh(command.dropCache);
                    break;
                case 'disc.rename':
                    snapshot = await this.application.renameDisc(command.title, command.fullWidthTitle, command.expectedRevision);
                    break;
                case 'disc.erase':
                    snapshot = await this.application.eraseDisc(command.confirmation, command.expectedRevision);
                    break;
                case 'disc.formatHimd':
                    snapshot = await this.application.formatToHiMD(command.confirmation, command.expectedRevision);
                    break;
                case 'device.flush':
                    snapshot = await this.application.flush(command.expectedRevision);
                    break;
                case 'disc.eject':
                    snapshot = await this.application.ejectDisc(command.expectedRevision);
                    break;
                case 'metadata.applyCsv':
                    snapshot = await this.application.applyMetadataImport(
                        command.text,
                        command.includedTrackIndexes,
                        command.expectedRevision
                    );
                    break;
                case 'track.renameMany':
                    snapshot = await this.application.renameTracks(command.updates, command.expectedRevision);
                    break;
                case 'track.renameHimdMany':
                    snapshot = await this.application.renameHiMDTracks(command.updates, command.expectedRevision);
                    break;
                case 'track.move':
                    snapshot = await this.application.moveTrack(command.sourceIndex, command.destinationIndex, command.expectedRevision);
                    break;
                case 'track.deleteMany':
                    snapshot = await this.application.deleteTracks(command.indexes, command.confirmation, command.expectedRevision);
                    break;
                case 'group.rename':
                    snapshot = await this.application.renameGroup(command.update, command.expectedRevision);
                    break;
                case 'group.create':
                    snapshot = await this.application.createGroup(
                        command.firstTrack,
                        command.trackCount,
                        command.title,
                        command.fullWidthTitle,
                        command.expectedRevision
                    );
                    break;
                case 'group.deleteMany':
                    snapshot = await this.application.deleteGroups(command.indexes, command.expectedRevision);
                    break;
                case 'playback.control':
                    snapshot = await this.application.controlPlayback(command.command);
                    break;
                default: {
                    const invalid = command as { type?: unknown };
                    const error = new Error(`Unknown application command: ${String(invalid.type)}`) as Error & { code: string };
                    error.code = 'INVALID_COMMAND';
                    throw error;
                }
            }
            return { ok: true, snapshot };
        } catch (error) {
            const typed = error as Error & { code?: string; details?: Record<string, unknown> };
            return {
                ok: false,
                error: {
                    code: typed.code ?? 'UNEXPECTED_ERROR',
                    message: typed.message || String(error),
                    details: typed.details,
                },
            };
        }
    }
}
