import { MinidiscSpec, NetMDFactoryService, NetMDService } from './interfaces/netmd';
import { AudioExportService } from './audio/audio-export';
import { MediaRecorderService } from './browserintegration/mediarecorder';
import { MediaSessionService } from './browserintegration/media-session';
import { LibraryService } from './library/library';
import type { MiniDiscApplication } from '../application/minidisc-application';
import type { ApplicationCommandBus } from '../application/command-bus';

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
}

const ServiceRegistry: ServiceRegistry = {};

export default ServiceRegistry;
