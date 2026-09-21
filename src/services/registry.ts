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
import { AudioEncoderManager } from '../application/audio-encoder-manager';
import { AudioServices, createAudioEncoder, resolveAudioServiceIndexById } from './audio-export-service-manager';
import { createServiceCatalog, type ServiceCatalogSnapshot } from '../application/service-catalog';
import { Services as DeviceServices } from './interface-service-manager';
import type { LocalAudioInput } from '../application/browser-audio-input';

interface ServiceRegistry {
    netmdService?: NetMDService;
    netmdSpec?: MinidiscSpec;
    netmdFactoryService?: NetMDFactoryService;
    audioEncoderManager: AudioEncoderManager;
    serviceCatalog: ServiceCatalogSnapshot;
    localAudioInput?: LocalAudioInput;
    mediaSessionService?: MediaSessionService;
    application?: MiniDiscApplication;
    commandBus?: ApplicationCommandBus;
    applicationClient?: ApplicationClient;
    taskManager: TaskManager;
    importQueue: ImportQueue;
    importWriter?: ImportWriter;
    trackExporter?: TrackExporter;
    trackRecorder?: TrackRecorder;
    operationCoordinator: DeviceOperationCoordinator;
    workspaceStore: WorkspaceStore;
    settingsStore: SettingsStore;
}

const taskManager = new TaskManager();
const importQueue = new ImportQueue();
const audioEncoderManager = new AudioEncoderManager(
    () => {
        const settings = applicationSettings.getSnapshot().values;
        return {
            index: resolveAudioServiceIndexById(settings.audioEncoderId, settings.audioExportService),
            parameters: settings.audioExportServiceConfig,
        };
    },
    (configuration) => createAudioEncoder(configuration)
);
const ServiceRegistry: ServiceRegistry = {
    taskManager,
    importQueue,
    operationCoordinator: new DeviceOperationCoordinator(),
    settingsStore: applicationSettings,
    audioEncoderManager,
    serviceCatalog: createServiceCatalog(AudioServices, DeviceServices),
    workspaceStore: new WorkspaceStore(taskManager, importQueue, applicationSettings, audioEncoderManager),
};

export default ServiceRegistry;
