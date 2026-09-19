import type { MiniDiscApplication } from './minidisc-application';
import type { MinidiscSpec, NetMDFactoryService, NetMDService } from '../services/interfaces/netmd';

export interface DeviceSessionBindings {
    netmdService?: NetMDService;
    netmdSpec?: MinidiscSpec;
    netmdFactoryService?: NetMDFactoryService;
}

export interface ConnectedDeviceSession {
    application: MiniDiscApplication;
    method: 'cached' | 'paired';
    cachedConnectionError?: unknown;
}

export interface DeviceSessionConnectionFailure {
    application: null;
    method: null;
    cachedConnectionError?: unknown;
}

export class DeviceSessionConnector {
    constructor(
        private readonly bindings: DeviceSessionBindings,
        private readonly bindApplication: () => MiniDiscApplication
    ) {}

    async connect(service: NetMDService, spec: MinidiscSpec): Promise<ConnectedDeviceSession | DeviceSessionConnectionFailure> {
        this.bindings.netmdService = service;
        this.bindings.netmdSpec = spec;
        this.bindings.netmdFactoryService = undefined;

        let cachedConnectionError: unknown;
        try {
            if (await service.connect()) {
                return { application: this.bindApplication(), method: 'cached' };
            }
        } catch (error) {
            // A remembered WebUSB device can disappear or lose permission. The
            // explicit pairing request is still allowed to recover the session.
            cachedConnectionError = error;
        }

        try {
            if (await service.pair()) {
                return { application: this.bindApplication(), method: 'paired', cachedConnectionError };
            }
            this.clearFailedBindings(service);
            return { application: null, method: null, cachedConnectionError };
        } catch (error) {
            this.clearFailedBindings(service);
            throw error;
        }
    }

    private clearFailedBindings(service: NetMDService) {
        if (this.bindings.netmdService !== service) return;
        this.bindings.netmdService = undefined;
        this.bindings.netmdSpec = undefined;
        this.bindings.netmdFactoryService = undefined;
    }
}
