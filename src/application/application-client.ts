import type { ApplicationCommand, CommandResult } from './command-bus';
import type { ImportQueue, ImportQueueInput, ImportQueueSnapshot } from './import-queue';
import type { TaskSnapshot } from './task-manager';
import type { TrackExportRequest, TrackExportSink } from './track-export';
import type { WorkspaceSnapshot, WorkspaceStore } from './workspace-store';
import type {
    AdvancedMemoryKind,
    AdvancedMemoryRegion,
    AdvancedTrackReader,
    AdvancedUploadService,
    DeviceSnapshot,
} from './contracts';
import type { AdvancedBadSectorHandler, AdvancedTrackExportRequest } from './advanced-track-export';
import type { ExportParams } from '../services/audio/audio-export';

export type LocalAdvancedMemorySink = (
    region: AdvancedMemoryRegion,
    data: Uint8Array
) => void | Promise<void>;

export interface ApplicationCommandExecutor {
    execute(command: ApplicationCommand): Promise<CommandResult>;
}

export interface ApplicationClient {
    execute(command: ApplicationCommand): Promise<CommandResult>;
    addLocalImports(inputs: ImportQueueInput[], expectedRevision?: number): ImportQueueSnapshot;
    startLocalTrackExport(request: TrackExportRequest, sink: TrackExportSink): Promise<TaskSnapshot>;
    startLocalAdvancedMemoryExport(kind: AdvancedMemoryKind, sink: LocalAdvancedMemorySink): Promise<TaskSnapshot>;
    startLocalAdvancedTrackExport(
        request: AdvancedTrackExportRequest,
        sink: TrackExportSink,
        handleBadSector: AdvancedBadSectorHandler
    ): Promise<TaskSnapshot>;
    runLocalAdvancedTrackDownloadSession<T>(
        useSlowerExploit: boolean,
        operation: (readTrack: AdvancedTrackReader) => Promise<T>
    ): Promise<T>;
    runLocalDeviceUploadSession<T>(
        requiredExploitCapabilities: string[],
        operation: (advancedUploadService?: AdvancedUploadService) => Promise<T>,
        expectedDeviceVersion?: { sessionId: string; revision: number }
    ): Promise<{ value: T; snapshot: DeviceSnapshot }>;
    createLocalLibraryFileProcessor(filePath: string): (params: ExportParams) => Promise<ArrayBuffer>;
    getWorkspaceSnapshot(): WorkspaceSnapshot;
    subscribe(listener: () => void): () => void;
}

export class InProcessApplicationClient implements ApplicationClient {
    constructor(
        private readonly commands: ApplicationCommandExecutor,
        private readonly workspace: WorkspaceStore,
        private readonly localImports: Pick<ImportQueue, 'add'>,
        private readonly localTrackExport: (request: TrackExportRequest, sink: TrackExportSink) => Promise<TaskSnapshot>,
        private readonly localAdvancedMemoryExport: (
            kind: AdvancedMemoryKind,
            sink: LocalAdvancedMemorySink
        ) => Promise<TaskSnapshot>,
        private readonly localAdvancedTrackExport: (
            request: AdvancedTrackExportRequest,
            sink: TrackExportSink,
            handleBadSector: AdvancedBadSectorHandler
        ) => Promise<TaskSnapshot>,
        private readonly localAdvancedTrackDownloadSession: <T>(
            useSlowerExploit: boolean,
            operation: (readTrack: AdvancedTrackReader) => Promise<T>
        ) => Promise<T>,
        private readonly localDeviceUploadSession: <T>(
            requiredExploitCapabilities: string[],
            operation: (advancedUploadService?: AdvancedUploadService) => Promise<T>,
            expectedDeviceVersion?: { sessionId: string; revision: number }
        ) => Promise<{ value: T; snapshot: DeviceSnapshot }>,
        private readonly localLibraryFileProcessor?: (filePath: string) => (params: ExportParams) => Promise<ArrayBuffer>
    ) {}

    execute = (command: ApplicationCommand) => this.commands.execute(command);
    addLocalImports = (inputs: ImportQueueInput[], expectedRevision?: number) =>
        this.localImports.add(inputs, expectedRevision);
    startLocalTrackExport = (request: TrackExportRequest, sink: TrackExportSink) => this.localTrackExport(request, sink);
    startLocalAdvancedMemoryExport = (kind: AdvancedMemoryKind, sink: LocalAdvancedMemorySink) =>
        this.localAdvancedMemoryExport(kind, sink);
    startLocalAdvancedTrackExport = (
        request: AdvancedTrackExportRequest,
        sink: TrackExportSink,
        handleBadSector: AdvancedBadSectorHandler
    ) => this.localAdvancedTrackExport(request, sink, handleBadSector);
    runLocalAdvancedTrackDownloadSession = <T>(
        useSlowerExploit: boolean,
        operation: (readTrack: AdvancedTrackReader) => Promise<T>
    ) => this.localAdvancedTrackDownloadSession(useSlowerExploit, operation);
    runLocalDeviceUploadSession = <T>(
        requiredExploitCapabilities: string[],
        operation: (advancedUploadService?: AdvancedUploadService) => Promise<T>,
        expectedDeviceVersion?: { sessionId: string; revision: number }
    ) => this.localDeviceUploadSession(requiredExploitCapabilities, operation, expectedDeviceVersion);
    createLocalLibraryFileProcessor = (filePath: string) => {
        if (!this.localLibraryFileProcessor) {
            throw new Error('The local library is unavailable in this application environment.');
        }
        return this.localLibraryFileProcessor(filePath);
    };
    getWorkspaceSnapshot = this.workspace.getSnapshot;
    subscribe = this.workspace.subscribe;
}
