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

export class CachedDeviceConnectionTimeoutError extends Error {
    constructor(readonly timeoutMs: number) {
        super(`The remembered device did not respond within ${Math.ceil(timeoutMs / 1000)} seconds.`);
        this.name = 'CachedDeviceConnectionTimeoutError';
    }
}

export function describeDeviceSessionFailure(failure: DeviceSessionConnectionFailure) {
    if (failure.cachedConnectionError instanceof CachedDeviceConnectionTimeoutError) {
        return `The previously authorized MiniDisc device did not finish reconnecting within ${Math.ceil(failure.cachedConnectionError.timeoutMs / 1000)} seconds. Retry the connection. If Windows still holds the interface, unplug and reconnect the USB cable once.`;
    }
    const cachedMessage = errorMessage(failure.cachedConnectionError);
    if (cachedMessage) {
        return `The previously authorized MiniDisc device could not reconnect (${cachedMessage}). No compatible device was selected in the browser prompt.`;
    }
    return 'The browser did not return a compatible MiniDisc device. Check the USB cable, device power, Windows driver, and the WebUSB chooser, then try again.';
}

export class DeviceSessionConnector {
    constructor(
        private readonly bindings: DeviceSessionBindings,
        private readonly bindApplication: () => MiniDiscApplication,
        private readonly cachedConnectionTimeoutMs = 15_000
    ) {}

    async connect(service: NetMDService, spec: MinidiscSpec, chooseDevice = false, usbDevice?: USBDevice): Promise<ConnectedDeviceSession | DeviceSessionConnectionFailure> {
        this.bindings.netmdService = service;
        this.bindings.netmdSpec = spec;
        this.bindings.netmdFactoryService = undefined;

        let cachedConnectionError: unknown;
        try {
            const cachedConnection = chooseDevice ? Promise.resolve(false) : service.connect(usbDevice);
            const cachedResult = await settleBeforeTimeout(cachedConnection, this.cachedConnectionTimeoutMs);
            if (cachedResult.timedOut) {
                cachedConnectionError = new CachedDeviceConnectionTimeoutError(this.cachedConnectionTimeoutMs);
                this.clearFailedBindings(service);
                void cachedConnection
                    .then(async (connected) => {
                        if (connected && this.bindings.netmdService !== service) await service.finalize();
                    })
                    .catch(() => undefined);
                return { application: null, method: null, cachedConnectionError };
            }
            if (cachedResult.value) {
                return { application: this.bindApplication(), method: 'cached' };
            }
        } catch (error) {
            if (usbDevice) { this.clearFailedBindings(service); throw error; }
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

async function settleBeforeTimeout<T>(promise: Promise<T>, timeoutMs: number) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<{ timedOut: true }>((resolve) => {
        timeout = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    });
    try {
        return await Promise.race([promise.then((value) => ({ timedOut: false as const, value })), timedOut]);
    } finally {
        if (timeout !== undefined) clearTimeout(timeout);
    }
}

function errorMessage(error: unknown) {
    if (error instanceof Error) return error.message.trim();
    if (typeof error === 'string') return error.trim();
    return '';
}
