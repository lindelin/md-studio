import type {
    DestructiveConfirmation,
    AdvancedDeviceInfo,
    AdvancedTocDump,
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
import { SettingsStore, type SettingsSnapshot, type UserSettingsUpdate } from './settings-store';
import { ApplicationError } from './contracts';

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
    | { type: 'advanced.inspect' }
    | { type: 'advanced.readToc' }
    | { type: 'settings.get' }
    | { type: 'settings.update'; changes: UserSettingsUpdate; expectedRevision?: number }
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
    advancedInfo?: AdvancedDeviceInfo;
    advancedToc?: AdvancedTocDump;
    settings?: SettingsSnapshot;
}

export interface CommandFailure {
    ok: false;
    error: { code: string; message: string; details?: Record<string, unknown> };
}

export type CommandResult = CommandSuccess | CommandFailure;

export class ApplicationCommandBus {
    constructor(
        private application: MiniDiscApplication | undefined,
        private readonly tasks: TaskManager,
        private readonly imports: ImportQueue,
        private importWriter?: ImportWriter,
        private trackExporter?: TrackExporter,
        private readonly settings = new SettingsStore(null)
    ) {}

    attachApplication(application: MiniDiscApplication | undefined) {
        this.application = application;
    }

    configureAdapters(importWriter?: ImportWriter, trackExporter?: TrackExporter) {
        this.importWriter = importWriter;
        this.trackExporter = trackExporter;
    }

    async execute(command: ApplicationCommand): Promise<CommandResult> {
        try {
            if (command.type === 'task.list') return { ok: true, tasks: this.tasks.list() };
            if (command.type === 'task.get') return { ok: true, task: this.tasks.get(command.id) };
            if (command.type === 'task.cancel') return { ok: true, task: this.tasks.requestCancellation(command.id) };
            if (command.type === 'import.list') return { ok: true, importQueue: this.imports.snapshot() };
            if (command.type === 'settings.get') return { ok: true, settings: this.settings.getSnapshot() };
            if (command.type === 'settings.update') {
                return { ok: true, settings: this.settings.update(command.changes, command.expectedRevision) };
            }
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
                this.requireApplication();
                if (!this.importWriter) throw new Error('Audio writing is unavailable in this application environment.');
                return { ok: true, task: await this.importWriter.start(command, this.imports, this.tasks) };
            }
            if (command.type === 'track.export') {
                const application = this.requireApplication();
                if (!this.trackExporter) throw new Error('Track export is unavailable in this application environment.');
                return { ok: true, task: await this.trackExporter.start(command, application, this.tasks) };
            }
            const application = this.requireApplication();
            if (command.type === 'metadata.exportCsv') {
                return { ok: true, metadataCsv: await application.exportMetadataCsv() };
            }
            if (command.type === 'metadata.planCsv') {
                return { ok: true, metadataPlan: await application.planMetadataImport(command.text) };
            }
            if (command.type === 'advanced.inspect') {
                return { ok: true, advancedInfo: await application.inspectAdvancedDevice() };
            }
            if (command.type === 'advanced.readToc') {
                return { ok: true, advancedToc: await application.readRawToc() };
            }

            let snapshot: DeviceSnapshot;
            switch (command.type) {
                case 'disc.refresh':
                    snapshot = await application.refresh(command.dropCache);
                    break;
                case 'disc.rename':
                    snapshot = await application.renameDisc(command.title, command.fullWidthTitle, command.expectedRevision);
                    break;
                case 'disc.erase':
                    snapshot = await application.eraseDisc(command.confirmation, command.expectedRevision);
                    break;
                case 'disc.formatHimd':
                    snapshot = await application.formatToHiMD(command.confirmation, command.expectedRevision);
                    break;
                case 'device.flush':
                    snapshot = await application.flush(command.expectedRevision);
                    break;
                case 'disc.eject':
                    snapshot = await application.ejectDisc(command.expectedRevision);
                    break;
                case 'metadata.applyCsv':
                    snapshot = await application.applyMetadataImport(
                        command.text,
                        command.includedTrackIndexes,
                        command.expectedRevision
                    );
                    break;
                case 'track.renameMany':
                    snapshot = await application.renameTracks(command.updates, command.expectedRevision);
                    break;
                case 'track.renameHimdMany':
                    snapshot = await application.renameHiMDTracks(command.updates, command.expectedRevision);
                    break;
                case 'track.move':
                    snapshot = await application.moveTrack(command.sourceIndex, command.destinationIndex, command.expectedRevision);
                    break;
                case 'track.deleteMany':
                    snapshot = await application.deleteTracks(command.indexes, command.confirmation, command.expectedRevision);
                    break;
                case 'group.rename':
                    snapshot = await application.renameGroup(command.update, command.expectedRevision);
                    break;
                case 'group.create':
                    snapshot = await application.createGroup(
                        command.firstTrack,
                        command.trackCount,
                        command.title,
                        command.fullWidthTitle,
                        command.expectedRevision
                    );
                    break;
                case 'group.deleteMany':
                    snapshot = await application.deleteGroups(command.indexes, command.expectedRevision);
                    break;
                case 'playback.control':
                    snapshot = await application.controlPlayback(command.command);
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

    private requireApplication() {
        if (!this.application) {
            throw new ApplicationError(
                'DEVICE_NOT_CONNECTED',
                'Connect a MiniDisc device in the application before using device commands.'
            );
        }
        return this.application;
    }
}
