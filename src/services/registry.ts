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
    taskManager: TaskManager;
    importQueue: ImportQueue;
    importPayloadResolver?: ImportPayloadResolver;
    importWriter?: ImportWriter;
    exportPayloadSink?: ExportPayloadSink;
    trackExporter?: TrackExporter;
    operationCoordinator: DeviceOperationCoordinator;
}

const ServiceRegistry: ServiceRegistry = {
    taskManager: new TaskManager(),
    importQueue: new ImportQueue(),
    operationCoordinator: new DeviceOperationCoordinator(),
};

export default ServiceRegistry;
