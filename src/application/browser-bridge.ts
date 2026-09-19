import serviceRegistry from '../services/registry';
import { BRIDGE_PROTOCOL_VERSION, parseBridgeMessage, type BridgeHello, type BridgeResponse } from './bridge-protocol';
import { bindApplicationRuntime } from './runtime';
import { store } from '../redux/store';
import { applyDeviceSnapshot } from '../redux/application-adapter';
import { isBoolean, loadPreference, readRawPreference } from '../preferences';

const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:47123';

export class BrowserApplicationBridge {
    private socket?: WebSocket;
    private stopped = false;
    private reconnectTimer?: number;

    constructor(private readonly url: string) {}

    start() {
        this.stopped = false;
        this.connect();
    }

    stop() {
        this.stopped = true;
        if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
        this.socket?.close();
    }

    private connect() {
        if (this.stopped || this.socket?.readyState === WebSocket.OPEN) return;
        const socket = new WebSocket(this.url);
        this.socket = socket;
        socket.addEventListener('open', () => {
            const hello: BridgeHello = {
                type: 'hello',
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                client: 'minidisc-workspace-app',
            };
            socket.send(JSON.stringify(hello));
        });
        socket.addEventListener('message', (event) => void this.handleMessage(socket, event.data));
        socket.addEventListener('close', () => this.scheduleReconnect());
        socket.addEventListener('error', () => socket.close());
    }

    private async handleMessage(socket: WebSocket, raw: unknown) {
        try {
            const parsed = parseBridgeMessage(JSON.parse(String(raw)));
            if (parsed.type !== 'request') return;
            const commandBus =
                serviceRegistry.commandBus ??
                (serviceRegistry.netmdService && serviceRegistry.netmdSpec
                    ? (bindApplicationRuntime(), serviceRegistry.commandBus)
                    : undefined);
            const result = commandBus
                ? await commandBus.execute(parsed.command)
                : {
                      ok: false as const,
                      error: {
                          code: 'DEVICE_NOT_CONNECTED',
                          message: 'Connect a MiniDisc device in the application before using device commands.',
                      },
                  };
            if (result.ok && result.snapshot) applyDeviceSnapshot(store.dispatch, result.snapshot);
            const response: BridgeResponse = {
                type: 'response',
                protocolVersion: BRIDGE_PROTOCOL_VERSION,
                id: parsed.id,
                result,
            };
            socket.send(JSON.stringify(response));
        } catch (error) {
            console.error('Ignored an invalid local bridge message.', error);
        }
    }

    private scheduleReconnect() {
        this.socket = undefined;
        if (this.stopped || this.reconnectTimer !== undefined) return;
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = undefined;
            this.connect();
        }, 2000);
    }
}

export function startLocalApplicationBridge() {
    const explicitlyEnabled = loadPreference('minidiscLocalBridgeEnabled', false, isBoolean);
    if (!explicitlyEnabled) return undefined;

    const configuredUrl = readRawPreference('minidiscLocalBridgeUrl') || DEFAULT_BRIDGE_URL;
    const token = readRawPreference('minidiscLocalBridgeToken');
    let url: URL;
    try {
        url = new URL(configuredUrl);
        const loopbackHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
        if (!loopbackHost || !['ws:', 'wss:'].includes(url.protocol)) throw new Error('Bridge URL must use WebSocket on loopback');
    } catch (error) {
        console.warn('Ignored invalid local bridge URL.', error);
        url = new URL(DEFAULT_BRIDGE_URL);
    }
    if (token) url.searchParams.set('token', token);
    const bridge = new BrowserApplicationBridge(url.toString());
    bridge.start();
    return bridge;
}
