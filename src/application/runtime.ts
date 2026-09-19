import serviceRegistry from '../services/registry';
import { ApplicationCommandBus } from './command-bus';
import { NetMDAdvancedDeviceGateway, NetMDDeviceGateway } from './device-gateway';
import { MiniDiscApplication } from './minidisc-application';
import { InProcessApplicationClient } from './application-client';

export function bindApplicationRuntime() {
    if (!serviceRegistry.netmdService || !serviceRegistry.netmdSpec) {
        throw new Error('Cannot bind the application runtime before a device and MiniDisc specification are selected.');
    }
    const application = new MiniDiscApplication(
        new NetMDDeviceGateway(serviceRegistry.netmdService, serviceRegistry.netmdSpec),
        serviceRegistry.operationCoordinator,
        new NetMDAdvancedDeviceGateway(
            serviceRegistry.netmdService,
            serviceRegistry.netmdFactoryService,
            (factoryService) => {
                serviceRegistry.netmdFactoryService = factoryService;
            }
        )
    );
    serviceRegistry.application = application;
    serviceRegistry.workspaceStore.attachApplication(application);
    ensureApplicationCommandBus().attachApplication(application);
    return application;
}

export function ensureApplicationCommandBus() {
    if (!serviceRegistry.commandBus) {
        serviceRegistry.commandBus = new ApplicationCommandBus(
            serviceRegistry.application,
            serviceRegistry.taskManager,
            serviceRegistry.importQueue,
            serviceRegistry.importWriter,
            serviceRegistry.trackExporter,
            serviceRegistry.settingsStore,
            serviceRegistry.workspaceStore,
            serviceRegistry.trackRecorder
        );
    }
    serviceRegistry.commandBus.configureAdapters(
        serviceRegistry.importWriter,
        serviceRegistry.trackExporter,
        serviceRegistry.trackRecorder
    );
    return serviceRegistry.commandBus;
}

export function getApplicationClient() {
    if (!serviceRegistry.applicationClient) {
        serviceRegistry.applicationClient = new InProcessApplicationClient(
            ensureApplicationCommandBus(),
            serviceRegistry.workspaceStore,
            serviceRegistry.importQueue,
            async (request, sink) => {
                if (!serviceRegistry.trackExporter) {
                    throw new Error('Track export is unavailable in this application environment.');
                }
                return serviceRegistry.trackExporter.start(
                    request,
                    getApplicationRuntime(),
                    serviceRegistry.taskManager,
                    sink
                );
            }
        );
    }
    return serviceRegistry.applicationClient;
}

export function getApplicationRuntime() {
    return serviceRegistry.application ?? bindApplicationRuntime();
}

export function clearApplicationRuntime() {
    for (const task of serviceRegistry.taskManager.list()) {
        if (task.status === 'queued' || task.status === 'running') {
            serviceRegistry.taskManager.interrupt(task.id, 'The device session ended before the task completed.');
        }
    }
    serviceRegistry.workspaceStore.detachApplication();
    serviceRegistry.application = undefined;
    ensureApplicationCommandBus().attachApplication(undefined);
}

export async function releaseDeviceSession(finalize = true) {
    const service = serviceRegistry.netmdService;
    clearApplicationRuntime();
    serviceRegistry.netmdService = undefined;
    serviceRegistry.netmdSpec = undefined;
    serviceRegistry.netmdFactoryService = undefined;

    if (!service || !finalize) return;
    try {
        await service.finalize();
    } catch (error) {
        // A cable can disappear between the disconnect event and cleanup. The
        // browser session is already detached, so cleanup remains best-effort.
        console.warn('Could not finalize the previous MiniDisc device session.', error);
    }
}
