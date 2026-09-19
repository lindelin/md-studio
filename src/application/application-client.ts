import type { ApplicationCommand, CommandResult } from './command-bus';
import type { ImportQueue, ImportQueueInput, ImportQueueSnapshot } from './import-queue';
import type { TaskSnapshot } from './task-manager';
import type { TrackExportRequest, TrackExportSink } from './track-export';
import type { WorkspaceSnapshot, WorkspaceStore } from './workspace-store';
import type { AdvancedMemoryKind, AdvancedMemoryRegion } from './contracts';
import type { AdvancedBadSectorHandler, AdvancedTrackExportRequest } from './advanced-track-export';

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
        ) => Promise<TaskSnapshot>
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
    getWorkspaceSnapshot = this.workspace.getSnapshot;
    subscribe = this.workspace.subscribe;
}
