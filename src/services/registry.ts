import { MinidiscSpec, NetMDFactoryService, NetMDService } from './interfaces/netmd';
import { MediaRecorderService } from './browserintegration/mediarecorder';
import { MediaSessionService } from './browserintegration/media-session';
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
import { LibraryCatalog } from '../application/library-catalog';
import { createLibraryService, LibraryServices } from './library-services';
import { AudioEncoderManager } from '../application/audio-encoder-manager';
import { AudioServices, createAudioEncoder } from './audio-export-service-manager';
import { createServiceCatalog, type ServiceCatalogSnapshot } from '../application/service-catalog';

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
    audioEncoderManager: AudioEncoderManager;
    serviceCatalog: ServiceCatalogSnapshot;
    mediaRecorderService?: MediaRecorderService;
    mediaSessionService?: MediaSessionService;
    libraryCatalog: LibraryCatalog;
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
const libraryCatalog = new LibraryCatalog(() => {
    const settings = applicationSettings.getSnapshot().values;
    return createLibraryService(settings.libraryService, settings.libraryServiceConfig);
});
const audioEncoderManager = new AudioEncoderManager(
    () => {
        const settings = applicationSettings.getSnapshot().values;
        return { index: settings.audioExportService, parameters: settings.audioExportServiceConfig };
    },
    createAudioEncoder
);
const ServiceRegistry: ServiceRegistry = {
    taskManager,
    importQueue,
    operationCoordinator: new DeviceOperationCoordinator(),
    settingsStore: applicationSettings,
    libraryCatalog,
    audioEncoderManager,
    serviceCatalog: createServiceCatalog(AudioServices, LibraryServices),
    workspaceStore: new WorkspaceStore(taskManager, importQueue, applicationSettings, libraryCatalog, audioEncoderManager),
};

export default ServiceRegistry;
