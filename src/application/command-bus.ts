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
import { MINIDISC_SELF_TEST_STEP_COUNT } from './minidisc-application';
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
import type { TrackRecorder, TrackRecordRequest } from './track-record';
import type { MetadataCsvExport, MetadataImportPlan } from '../domain/metadata-import';
import { SettingsStore, type SettingsSnapshot, type UserSettingsUpdate } from './settings-store';
import { ApplicationError } from './contracts';
import type { WorkspaceSnapshot, WorkspaceStore } from './workspace-store';
import { INTERACTIVE_ADVANCED_AUTHORIZATION } from './interactive-authorization';
import type {
    LibraryCatalog,
    LibraryCatalogPage,
    LibraryCatalogSearchPage,
    LibraryCatalogSnapshot,
    LibraryCatalogState,
} from './library-catalog';
import type { ServiceCatalogSnapshot } from './service-catalog';
import type { ImportPreview } from './import-preview';

export type LibraryImportFactory = (paths: string[][], expectedLibraryRevision?: number) => ImportQueueInput[];

export type ApplicationCommand =
    | { type: 'workspace.get' }
    | { type: 'services.get' }
    | { type: 'disc.refresh'; dropCache?: boolean }
    | { type: 'device.pollStatus' }
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
    | {
          type: 'advanced.writeToc';
          dataBase64: string;
          confirmation?: DestructiveConfirmation;
          expectedRevision?: number;
          interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION;
      }
    | {
          type: 'advanced.runTetris';
          confirmation?: DestructiveConfirmation;
          interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION;
      }
    | {
          type: 'advanced.setSpUploadSpeedup';
          enabled: boolean;
          interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION;
      }
    | {
          type: 'advanced.setDiscSwapDetectionDisabled';
          disabled: boolean;
          interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION;
      }
    | {
          type: 'advanced.enableHimdFullMode';
          confirmation?: DestructiveConfirmation;
          interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION;
      }
    | {
          type: 'advanced.enterServiceMode';
          confirmation?: DestructiveConfirmation;
          interactiveAuthorization?: typeof INTERACTIVE_ADVANCED_AUTHORIZATION;
      }
    | { type: 'settings.get' }
    | { type: 'settings.update'; changes: UserSettingsUpdate; expectedRevision?: number }
    | { type: 'library.get' }
    | { type: 'library.refresh' }
    | { type: 'library.status' }
    | { type: 'library.refreshSummary' }
    | { type: 'library.list'; path?: string[]; offset?: number; limit?: number; expectedRevision?: number }
    | { type: 'library.search'; query: string; offset?: number; limit?: number; expectedRevision?: number }
    | {
          type: 'library.import';
          paths: string[][];
          expectedLibraryRevision?: number;
          expectedImportRevision?: number;
      }
    | { type: 'track.renameMany'; updates: TrackMetadataUpdate[]; expectedRevision?: number }
    | { type: 'track.renameHimdMany'; updates: HiMDTrackMetadataUpdate[]; expectedRevision?: number }
    | { type: 'track.move'; sourceIndex: number; destinationIndex: number; expectedRevision?: number }
    | ({ type: 'track.export' } & TrackExportRequest)
    | ({ type: 'track.record' } & TrackRecordRequest)
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
    | { type: 'diagnostics.selfTest'; confirmation?: DestructiveConfirmation }
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
    | {
          type: 'import.preview';
          ids?: string[];
          format?: { codec: string; bitrate: number };
          expectedImportRevision?: number;
          expectedDeviceRevision?: number;
      }
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
    library?: LibraryCatalogSnapshot;
    libraryState?: LibraryCatalogState;
    libraryPage?: LibraryCatalogPage;
    librarySearch?: LibraryCatalogSearchPage;
    workspace?: WorkspaceSnapshot;
    services?: ServiceCatalogSnapshot;
    importPreview?: ImportPreview;
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
        private readonly settings = new SettingsStore(null),
        private readonly workspace?: WorkspaceStore,
        private trackRecorder?: TrackRecorder,
        private readonly libraryCatalog?: LibraryCatalog,
        private readonly libraryImportFactory?: LibraryImportFactory,
        private readonly serviceCatalog?: ServiceCatalogSnapshot
    ) {}

    attachApplication(application: MiniDiscApplication | undefined) {
        this.application = application;
    }

    configureAdapters(importWriter?: ImportWriter, trackExporter?: TrackExporter, trackRecorder?: TrackRecorder) {
        this.importWriter = importWriter;
        this.trackExporter = trackExporter;
        this.trackRecorder = trackRecorder;
    }

    async execute(command: ApplicationCommand): Promise<CommandResult> {
        try {
            if (command.type === 'workspace.get') {
                return {
                    ok: true,
                    workspace: this.workspace
                        ? structuredClone(this.workspace.getSnapshot())
                        : {
                              device: this.application?.readSnapshot() ?? null,
                              imports: this.imports.snapshot(),
                              tasks: this.tasks.list(),
                              settings: this.settings.getSnapshot(),
                              library: this.libraryCatalog?.getState() ?? {
                                  revision: 0,
                                  status: 'idle',
                                  entryCount: 0,
                                  error: null,
                              },
                              encoder: {
                                  revision: 0,
                                  status: 'idle',
                                  index: null,
                                  id: null,
                                  name: null,
                                  error: null,
                                  support: {},
                              },
                          },
                };
            }
            if (command.type === 'services.get') {
                if (!this.serviceCatalog) throw new Error('The service catalog is unavailable in this application environment.');
                return { ok: true, services: structuredClone(this.serviceCatalog) };
            }
            if (command.type === 'task.list') return { ok: true, tasks: this.tasks.list() };
            if (command.type === 'task.get') return { ok: true, task: this.tasks.get(command.id) };
            if (command.type === 'task.cancel') return { ok: true, task: this.tasks.requestCancellation(command.id) };
            if (command.type === 'import.list') return { ok: true, importQueue: this.imports.snapshot() };
            if (command.type === 'settings.get') return { ok: true, settings: this.settings.getSnapshot() };
            if (command.type === 'settings.update') {
                return { ok: true, settings: this.settings.update(command.changes, command.expectedRevision) };
            }
            if (command.type === 'library.get') {
                if (!this.libraryCatalog) throw new Error('The library catalog is unavailable in this application environment.');
                return { ok: true, library: structuredClone(this.libraryCatalog.getSnapshot()) };
            }
            if (command.type === 'library.refresh') {
                if (!this.libraryCatalog) throw new Error('The library catalog is unavailable in this application environment.');
                return { ok: true, library: structuredClone(await this.libraryCatalog.refresh()) };
            }
            if (command.type === 'library.status') {
                if (!this.libraryCatalog) throw new Error('The library catalog is unavailable in this application environment.');
                return { ok: true, libraryState: structuredClone(this.libraryCatalog.getState()) };
            }
            if (command.type === 'library.refreshSummary') {
                if (!this.libraryCatalog) throw new Error('The library catalog is unavailable in this application environment.');
                await this.libraryCatalog.refresh();
                return { ok: true, libraryState: structuredClone(this.libraryCatalog.getState()) };
            }
            if (command.type === 'library.list') {
                if (!this.libraryCatalog) throw new Error('The library catalog is unavailable in this application environment.');
                return {
                    ok: true,
                    libraryPage: this.libraryCatalog.list(
                        command.path,
                        command.offset,
                        command.limit,
                        command.expectedRevision
                    ),
                };
            }
            if (command.type === 'library.search') {
                if (!this.libraryCatalog) throw new Error('The library catalog is unavailable in this application environment.');
                return {
                    ok: true,
                    librarySearch: this.libraryCatalog.search(
                        command.query,
                        command.offset,
                        command.limit,
                        command.expectedRevision
                    ),
                };
            }
            if (command.type === 'library.import') {
                if (!this.libraryImportFactory) {
                    throw new Error('Library audio import is unavailable in this application environment.');
                }
                return {
                    ok: true,
                    importQueue: this.imports.add(
                        this.libraryImportFactory(command.paths, command.expectedLibraryRevision),
                        command.expectedImportRevision
                    ),
                };
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
            if (command.type === 'import.preview') {
                const application = this.requireApplication();
                const selection = this.imports.resolveSelection(command.ids, command.expectedImportRevision);
                return {
                    ok: true,
                    importPreview: await application.previewImports(
                        selection.map(({ item }) => item),
                        command.expectedImportRevision ?? this.imports.snapshot().revision,
                        command.format,
                        command.expectedDeviceRevision
                    ),
                };
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
            if (command.type === 'track.record') {
                const application = this.requireApplication();
                if (!this.trackRecorder) throw new Error('Audio-input recording is unavailable in this application environment.');
                return { ok: true, task: await this.trackRecorder.start(command, application, this.tasks) };
            }
            if (command.type === 'diagnostics.selfTest') {
                const application = this.requireApplication();
                if (!command.confirmation?.confirmed || command.confirmation.reason.trim().length === 0) {
                    throw new ApplicationError(
                        'CONFIRMATION_REQUIRED',
                        'The device self-test renames content, deletes tracks, and erases the disc.'
                    );
                }
                const task = this.tasks.create(
                    'diagnostics.selfTest',
                    'Run destructive MiniDisc device self-test',
                    MINIDISC_SELF_TEST_STEP_COUNT,
                    'steps'
                );
                this.tasks.start(task.id, 'transferring');
                void application
                    .runSelfTest(
                        command.confirmation,
                        (progress) => {
                            if (this.tasks.get(task.id).status === 'running') this.tasks.reportProgress(task.id, progress);
                        },
                        () => this.tasks.isCancellationRequested(task.id)
                    )
                    .then((result) => {
                        if (this.tasks.get(task.id).status !== 'running') return;
                        if (result.cancelled) this.tasks.cancel(task.id, result);
                        else this.tasks.succeed(task.id, result);
                    })
                    .catch((error) => {
                        if (this.tasks.get(task.id).status === 'running') this.tasks.fail(task.id, error);
                    });
                return { ok: true, task: this.tasks.get(task.id) };
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
            if (command.type === 'advanced.runTetris') {
                await application.runTetris(command.confirmation, command.interactiveAuthorization);
                return { ok: true };
            }
            if (command.type === 'advanced.setSpUploadSpeedup') {
                await application.setSpUploadSpeedup(command.enabled, command.interactiveAuthorization);
                return { ok: true };
            }
            if (command.type === 'advanced.setDiscSwapDetectionDisabled') {
                await application.setDiscSwapDetectionDisabled(command.disabled, command.interactiveAuthorization);
                return { ok: true };
            }
            if (command.type === 'advanced.enableHimdFullMode') {
                await application.enableHimdFullMode(command.confirmation, command.interactiveAuthorization);
                return { ok: true };
            }
            if (command.type === 'advanced.enterServiceMode') {
                await application.enterServiceMode(command.confirmation, command.interactiveAuthorization);
                return { ok: true };
            }

            let snapshot: DeviceSnapshot;
            switch (command.type) {
                case 'disc.refresh':
                    snapshot = await application.refresh(command.dropCache);
                    break;
                case 'device.pollStatus':
                    snapshot = await application.pollDeviceStatus();
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
                case 'advanced.writeToc':
                    snapshot = await application.writeRawToc(
                        command.dataBase64,
                        command.confirmation,
                        command.expectedRevision,
                        command.interactiveAuthorization
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
