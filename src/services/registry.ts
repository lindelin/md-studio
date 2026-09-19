import { MinidiscSpec, NetMDFactoryService, NetMDService } from './interfaces/netmd';
import { AudioExportService } from './audio/audio-export';
import { MediaRecorderService } from './browserintegration/mediarecorder';
import { MediaSessionService } from './browserintegration/media-session';
import { LibraryService } from './library/library';
import type { MiniDiscApplication } from '../application/minidisc-application';
import type { ApplicationCommandBus } from '../application/command-bus';
import { TaskManager } from '../application/task-manager';
import { ImportQueue } from '../application/import-queue';
import type { ImportWriter } from '../application/import-queue';
import { DeviceOperationCoordinator } from '../application/operation-coordinator';
import type { TrackExporter } from '../application/track-export';
import type { TrackRecorder } from '../application/track-record';
import { WorkspaceStore } from '../application/workspace-store';
import { applicationSettings, type SettingsStore } from '../application/settings-store';
import type { ApplicationClient } from '../application/application-client';

export interface ImportPayloadResolver {
    resolve(reference: string): Promise<File>;
}

export interface ExportPayloadSink {
    write(outputHandle: string, name: string, data: Uint8Array): Promise<string | undefined>;
}

interface ServiceRegistry {
    netmdService?: NetMDService;
    netmdSpec?: MinidiscSpec;
    netmdFactoryService?: NetMDFactoryService;
    audioExportService?: AudioExportService;
    mediaRecorderService?: MediaRecorderService;
    mediaSessionService?: MediaSessionService;
    libraryService?: LibraryService;
    application?: MiniDiscApplication;
    commandBus?: ApplicationCommandBus;
    applicationClient?: ApplicationClient;
    taskManager: TaskManager;
    importQueue: ImportQueue;
    importPayloadResolver?: ImportPayloadResolver;
    importWriter?: ImportWriter;
    exportPayloadSink?: ExportPayloadSink;
    trackExporter?: TrackExporter;
    trackRecorder?: TrackRecorder;
    operationCoordinator: DeviceOperationCoordinator;
    workspaceStore: WorkspaceStore;
    settingsStore: SettingsStore;
}

const taskManager = new TaskManager();
const importQueue = new ImportQueue();
const ServiceRegistry: ServiceRegistry = {
    taskManager,
    importQueue,
    operationCoordinator: new DeviceOperationCoordinator(),
    settingsStore: applicationSettings,
    workspaceStore: new WorkspaceStore(taskManager, importQueue, applicationSettings),
};

export default ServiceRegistry;
