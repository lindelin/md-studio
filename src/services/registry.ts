import type { MinidiscSpec, NetMDFactoryService, NetMDService } from './interfaces/netmd';
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
import { AudioServices, createAudioEncoder, resolveAudioServiceIndexById } from './audio-export-service-manager';
import { createServiceCatalog, type ServiceCatalogSnapshot } from '../application/service-catalog';
import { Services as DeviceServices } from './interface-service-manager';
import type { LocalAudioInput } from '../application/browser-audio-input';
import type { TrackRecognizer } from '../application/browser-track-recognizer';
import { createOnlineServiceGuard } from '../application/online-service-policy';

interface ServiceRegistry {
    netmdService?: NetMDService;
    netmdSpec?: MinidiscSpec;
    netmdFactoryService?: NetMDFactoryService;
    audioEncoderManager: AudioEncoderManager;
    serviceCatalog: ServiceCatalogSnapshot;
    localAudioInput?: LocalAudioInput;
    mediaSessionService?: MediaSessionService;
    libraryCatalog: LibraryCatalog;
    application?: MiniDiscApplication;
    commandBus?: ApplicationCommandBus;
    applicationClient?: ApplicationClient;
    taskManager: TaskManager;
    importQueue: ImportQueue;
    importWriter?: ImportWriter;
    trackExporter?: TrackExporter;
    trackRecorder?: TrackRecorder;
    trackRecognizer?: TrackRecognizer;
    operationCoordinator: DeviceOperationCoordinator;
    workspaceStore: WorkspaceStore;
    settingsStore: SettingsStore;
}

const taskManager = new TaskManager();
const importQueue = new ImportQueue();
const guardOnlineService = createOnlineServiceGuard(applicationSettings);
const libraryCatalog = new LibraryCatalog(() => {
    const settings = applicationSettings.getSnapshot().values;
    return createLibraryService(settings.libraryService, settings.libraryServiceConfig, guardOnlineService);
});
const audioEncoderManager = new AudioEncoderManager(
    () => {
        const settings = applicationSettings.getSnapshot().values;
        return {
            index: resolveAudioServiceIndexById(settings.audioEncoderId, settings.audioExportService),
            parameters: settings.audioExportServiceConfig,
            onlineServicesEnabled: settings.onlineServicesEnabled,
        };
    },
    (configuration) => createAudioEncoder(configuration, guardOnlineService)
);
const ServiceRegistry: ServiceRegistry = {
    taskManager,
    importQueue,
    operationCoordinator: new DeviceOperationCoordinator(),
    settingsStore: applicationSettings,
    libraryCatalog,
    audioEncoderManager,
    serviceCatalog: createServiceCatalog(AudioServices, LibraryServices, DeviceServices),
    workspaceStore: new WorkspaceStore(taskManager, importQueue, applicationSettings, libraryCatalog, audioEncoderManager),
};

export default ServiceRegistry;
