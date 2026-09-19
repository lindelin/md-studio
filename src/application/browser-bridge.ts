import serviceRegistry from '../services/registry';
import { BRIDGE_PROTOCOL_VERSION, parseBridgeMessage, type BridgeHello, type BridgeResponse } from './bridge-protocol';
import { bindApplicationRuntime } from './runtime';
import { store } from '../redux/store';
import { applyDeviceSnapshot } from '../redux/application-adapter';

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
                client: 'webminidisc-app',
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
    const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const explicitlyEnabled = window.localStorage.getItem('minidiscLocalBridgeEnabled');
    if (!localHost && explicitlyEnabled !== 'true') return undefined;
    if (explicitlyEnabled === 'false') return undefined;

    const configuredUrl = window.localStorage.getItem('minidiscLocalBridgeUrl') || DEFAULT_BRIDGE_URL;
    const token = window.localStorage.getItem('minidiscLocalBridgeToken');
    const url = new URL(configuredUrl);
    if (token) url.searchParams.set('token', token);
    const bridge = new BrowserApplicationBridge(url.toString());
    bridge.start();
    return bridge;
}
