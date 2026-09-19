import serviceRegistry from '../services/registry';
import { ApplicationCommandBus } from './command-bus';
import { NetMDAdvancedDeviceGateway, NetMDDeviceGateway } from './device-gateway';
import { MiniDiscApplication } from './minidisc-application';
import { InProcessApplicationClient } from './application-client';
import { INTERACTIVE_ADVANCED_AUTHORIZATION } from './interactive-authorization';
import { BrowserAdvancedTrackExporter } from './advanced-track-export';
import type { AdaptiveFile } from '../utils';

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
            serviceRegistry.trackRecorder,
            serviceRegistry.libraryCatalog,
            (paths, expectedLibraryRevision) => {
                const selections = serviceRegistry.libraryCatalog.resolveTracks(paths, expectedLibraryRevision);
                return selections.map((selection) => {
                    const processFile = serviceRegistry.libraryCatalog.createFileProcessor(
                        selection.path,
                        expectedLibraryRevision
                    );
                    const payload: AdaptiveFile = {
                        name: selection.name,
                        ...selection.metadata,
                        getForEncoding: processFile,
                    };
                    return {
                        source: {
                            kind: 'library' as const,
                            name: selection.name,
                            reference: selection.path.join('/'),
                        },
                        metadata: {
                            title: selection.metadata.title,
                            sourceTitle: selection.metadata.title,
                            artist: selection.metadata.artist,
                            sourceArtist: selection.metadata.artist,
                            album: selection.metadata.album,
                            sourceAlbum: selection.metadata.album,
                            duration: selection.metadata.duration,
                        },
                        payload,
                    };
                });
            }
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
            },
            async (kind, sink) => {
                const task = serviceRegistry.taskManager.create(
                    'advanced.memory-export',
                    kind === 'ram' ? 'Export device RAM' : 'Export device firmware',
                    0,
                    'bytes'
                );
                serviceRegistry.taskManager.start(task.id, 'transferring');
                void getApplicationRuntime()
                    .readAdvancedMemory(kind, INTERACTIVE_ADVANCED_AUTHORIZATION, (progress) => {
                        serviceRegistry.taskManager.reportProgress(task.id, {
                            completed: progress.readBytes,
                            total: progress.totalBytes,
                            currentLabel: progress.region,
                            currentPercent:
                                progress.totalBytes === 0 ? 0 : (progress.readBytes / progress.totalBytes) * 100,
                        });
                    })
                    .then(async (dump) => {
                        serviceRegistry.taskManager.setPhase(task.id, 'finalizing');
                        if (dump.rom) await sink('ROM', dump.rom);
                        await sink('RAM', dump.ram);
                        if (dump.dram) await sink('DRAM', dump.dram);
                        serviceRegistry.taskManager.succeed(task.id, {
                            regions: [dump.rom && 'ROM', 'RAM', dump.dram && 'DRAM'].filter(Boolean),
                        });
                    })
                    .catch((error) => {
                        if (serviceRegistry.taskManager.get(task.id).status === 'running') {
                            serviceRegistry.taskManager.fail(task.id, error, {
                                recoveryAction: 'Keep the device connected and retry the memory export from the advanced tools.',
                            });
                        }
                    });
                return serviceRegistry.taskManager.get(task.id);
            },
            (request, sink, handleBadSector) =>
                new BrowserAdvancedTrackExporter().start(
                    request,
                    getApplicationRuntime(),
                    serviceRegistry.taskManager,
                    sink,
                    handleBadSector
                ),
            (useSlowerExploit, operation) =>
                getApplicationRuntime().runAdvancedTrackDownloadSession(
                    useSlowerExploit,
                    INTERACTIVE_ADVANCED_AUTHORIZATION,
                    operation
                ),
            (requiredExploitCapabilities, operation) =>
                getApplicationRuntime().runDeviceUploadSession(
                    requiredExploitCapabilities,
                    requiredExploitCapabilities.length > 0 ? INTERACTIVE_ADVANCED_AUTHORIZATION : undefined,
                    operation
                ),
            (filePath) => {
                return serviceRegistry.libraryCatalog.createFileProcessor(filePath.split('/'));
            }
        );
    }
    return serviceRegistry.applicationClient;
}

export function getApplicationRuntime() {
    return serviceRegistry.application ?? bindApplicationRuntime();
}

export function isActiveUsbDevice(device: USBDevice) {
    return serviceRegistry.netmdService?.isDeviceConnected(device) ?? false;
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
