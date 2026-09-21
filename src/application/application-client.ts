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
    DeviceUploadService,
    PlaybackSession,
} from './contracts';
import type { AdvancedBadSectorHandler, AdvancedTrackExportRequest } from './advanced-track-export';
import type { LocalAudioInput } from './browser-audio-input';
import type { CustomParameters } from '../custom-parameters';

export type LocalAdvancedMemorySink = (region: AdvancedMemoryRegion, data: Uint8Array) => void | Promise<void>;

export interface ApplicationCommandExecutor {
    execute(command: ApplicationCommand): Promise<CommandResult>;
}

export interface LocalDeviceConnectionRequest {
    chooseDevice?: boolean;
    id?: string;
    name: string;
    parameters?: CustomParameters;
}

export interface LocalDeviceConnectionResult {
    connected: boolean;
    method: 'cached' | 'paired' | null;
    message?: string;
}

export interface ApplicationClient {
    execute(command: ApplicationCommand): Promise<CommandResult>;
    connectLocalDevice(request: LocalDeviceConnectionRequest): Promise<LocalDeviceConnectionResult>;
    disconnectLocalDevice(finalize?: boolean): Promise<void>;
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
        operation: (uploadService: DeviceUploadService, advancedUploadService?: AdvancedUploadService) => Promise<T>,
        expectedDeviceVersion?: { sessionId: string; revision: number }
    ): Promise<{ value: T; snapshot: DeviceSnapshot }>;
    runLocalPlaybackCaptureSession<T>(
        expectedDeviceVersion: { sessionId: string; revision: number },
        operation: (playback: PlaybackSession) => Promise<T>
    ): Promise<T>;
    initializeLocalMediaServices(): Promise<void>;
    startLocalAudioInputPreview(deviceId: string): Promise<void>;
    stopLocalAudioInputPreview(): Promise<void>;
    captureLocalAudioInput(
        deviceId: string,
        durationMs: number,
        onProgress: (percentage: number) => void,
        isCancelled: () => boolean
    ): Promise<Uint8Array>;
    getWorkspaceSnapshot(): WorkspaceSnapshot;
    subscribe(listener: () => void): () => void;
}

export class InProcessApplicationClient implements ApplicationClient {
    constructor(
        private readonly commands: ApplicationCommandExecutor,
        private readonly workspace: WorkspaceStore,
        private readonly localImports: Pick<ImportQueue, 'add'>,
        private readonly localTrackExport: (request: TrackExportRequest, sink: TrackExportSink) => Promise<TaskSnapshot>,
        private readonly localAdvancedMemoryExport: (kind: AdvancedMemoryKind, sink: LocalAdvancedMemorySink) => Promise<TaskSnapshot>,
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
            operation: (uploadService: DeviceUploadService, advancedUploadService?: AdvancedUploadService) => Promise<T>,
            expectedDeviceVersion?: { sessionId: string; revision: number }
        ) => Promise<{ value: T; snapshot: DeviceSnapshot }>,
        private readonly localPlaybackCaptureSession?: <T>(
            expectedDeviceVersion: { sessionId: string; revision: number },
            operation: (playback: PlaybackSession) => Promise<T>
        ) => Promise<T>,
        private readonly localMediaServices?: {
            initialize(): Promise<void>;
            audioInput: LocalAudioInput;
        },
        private readonly localDeviceSessions?: {
            connect(request: LocalDeviceConnectionRequest): Promise<LocalDeviceConnectionResult>;
            disconnect(finalize?: boolean): Promise<void>;
        },
    ) {}

    execute = (command: ApplicationCommand) => this.commands.execute(command);
    connectLocalDevice = (request: LocalDeviceConnectionRequest) => {
        if (!this.localDeviceSessions) {
            throw new Error('Browser device connection is unavailable in this application environment.');
        }
        return this.localDeviceSessions.connect(request);
    };
    disconnectLocalDevice = (finalize = true) => {
        if (!this.localDeviceSessions) {
            throw new Error('Browser device connection is unavailable in this application environment.');
        }
        return this.localDeviceSessions.disconnect(finalize);
    };
    addLocalImports = (inputs: ImportQueueInput[], expectedRevision?: number) => this.localImports.add(inputs, expectedRevision);
    startLocalTrackExport = (request: TrackExportRequest, sink: TrackExportSink) => this.localTrackExport(request, sink);
    startLocalAdvancedMemoryExport = (kind: AdvancedMemoryKind, sink: LocalAdvancedMemorySink) =>
        this.localAdvancedMemoryExport(kind, sink);
    startLocalAdvancedTrackExport = (
        request: AdvancedTrackExportRequest,
        sink: TrackExportSink,
        handleBadSector: AdvancedBadSectorHandler
    ) => this.localAdvancedTrackExport(request, sink, handleBadSector);
    runLocalAdvancedTrackDownloadSession = <T>(useSlowerExploit: boolean, operation: (readTrack: AdvancedTrackReader) => Promise<T>) =>
        this.localAdvancedTrackDownloadSession(useSlowerExploit, operation);
    runLocalDeviceUploadSession = <T>(
        requiredExploitCapabilities: string[],
        operation: (uploadService: DeviceUploadService, advancedUploadService?: AdvancedUploadService) => Promise<T>,
        expectedDeviceVersion?: { sessionId: string; revision: number }
    ) => this.localDeviceUploadSession(requiredExploitCapabilities, operation, expectedDeviceVersion);
    runLocalPlaybackCaptureSession = <T>(
        expectedDeviceVersion: { sessionId: string; revision: number },
        operation: (playback: PlaybackSession) => Promise<T>
    ) => {
        if (!this.localPlaybackCaptureSession) {
            throw new Error('Browser playback capture is unavailable in this application environment.');
        }
        return this.localPlaybackCaptureSession(expectedDeviceVersion, operation);
    };
    initializeLocalMediaServices = () => {
        if (!this.localMediaServices) {
            throw new Error('Browser media services are unavailable in this application environment.');
        }
        return this.localMediaServices.initialize();
    };
    startLocalAudioInputPreview = (deviceId: string) => {
        if (!this.localMediaServices) {
            throw new Error('Browser audio input is unavailable in this application environment.');
        }
        return this.localMediaServices.audioInput.startPreview(deviceId);
    };
    stopLocalAudioInputPreview = () => this.localMediaServices?.audioInput.stopPreview() ?? Promise.resolve();
    captureLocalAudioInput = (
        deviceId: string,
        durationMs: number,
        onProgress: (percentage: number) => void,
        isCancelled: () => boolean
    ) => {
        if (!this.localMediaServices) {
            throw new Error('Browser audio input is unavailable in this application environment.');
        }
        return this.localMediaServices.audioInput.captureWav(deviceId, durationMs, onProgress, isCancelled);
    };
    getWorkspaceSnapshot = this.workspace.getSnapshot;
    subscribe = this.workspace.subscribe;
}

export function waitForApplicationTask(client: Pick<ApplicationClient, 'getWorkspaceSnapshot' | 'subscribe'>, id: string) {
    const readTask = () => {
        const task = client.getWorkspaceSnapshot().tasks.find((candidate) => candidate.id === id);
        if (!task) throw new Error(`Task ${id} is no longer available.`);
        return task;
    };
    const initial = readTask();
    if (initial.status !== 'queued' && initial.status !== 'running') return Promise.resolve(initial);

    return new Promise<TaskSnapshot>((resolve, reject) => {
        const unsubscribe = client.subscribe(() => {
            try {
                const task = readTask();
                if (task.status === 'queued' || task.status === 'running') return;
                unsubscribe();
                resolve(task);
            } catch (error) {
                unsubscribe();
                reject(error);
            }
        });
    });
}
