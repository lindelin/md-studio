import serviceRegistry from '../services/registry';
import {
    BRIDGE_PROTOCOL_VERSION,
    parseBridgeMessage,
    type BridgeFileRequest,
    type BridgeFileResponse,
    type BridgeHello,
    type BridgeResponse,
} from './bridge-protocol';
import { bindApplicationRuntime } from './runtime';
import { store } from '../redux/store';
import { applyDeviceSnapshot } from '../redux/application-adapter';
import { isBoolean, loadPreference, readRawPreference } from '../preferences';

const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:47123';

export class BrowserApplicationBridge {
    private socket?: WebSocket;
    private stopped = false;
    private reconnectTimer?: number;
    private readonly fileRequests = new Map<
        string,
        {
            resolve: (response: Extract<BridgeFileResponse, { ok: true }>) => void;
            reject: (error: Error) => void;
            timeout: number;
        }
    >();

    constructor(private readonly url: string) {}

    start() {
        this.stopped = false;
        this.connect();
    }

    stop() {
        this.stopped = true;
        if (this.reconnectTimer !== undefined) window.clearTimeout(this.reconnectTimer);
        this.socket?.close();
        this.rejectFileRequests(new Error('The local bridge stopped during a file transfer.'));
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
        socket.addEventListener('close', () => {
            this.rejectFileRequests(new Error('The local bridge disconnected during a file transfer.'));
            this.scheduleReconnect();
        });
        socket.addEventListener('error', () => socket.close());
    }

    private async handleMessage(socket: WebSocket, raw: unknown) {
        try {
            const parsed = parseBridgeMessage(JSON.parse(String(raw)));
            if (parsed.type === 'file.response') {
                const pending = this.fileRequests.get(parsed.id);
                if (!pending) return;
                this.fileRequests.delete(parsed.id);
                window.clearTimeout(pending.timeout);
                if (parsed.ok) pending.resolve(parsed);
                else pending.reject(new Error(parsed.error));
                return;
            }
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

    async resolve(reference: string): Promise<File> {
        const handle = reference.startsWith('bridge-file:') ? reference.slice('bridge-file:'.length) : '';
        if (!handle) throw new Error('The import does not contain a valid local bridge file handle.');

        const chunkSize = 1024 * 1024;
        let offset = 0;
        let name = 'audio';
        let mimeType = 'application/octet-stream';
        let size: number | undefined;
        const chunks: BlobPart[] = [];
        do {
            const chunk = await this.requestFileChunk(handle, offset, chunkSize);
            if (chunk.offset !== offset || (size !== undefined && chunk.size !== size)) {
                throw new Error('The local audio file changed while it was being transferred.');
            }
            name = chunk.name;
            mimeType = chunk.mimeType;
            size = chunk.size;
            const binary = atob(chunk.data);
            const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
            chunks.push(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
            offset += bytes.byteLength;
            if (bytes.byteLength === 0 && offset < size) throw new Error('The local bridge returned an incomplete audio file.');
        } while (size === undefined || offset < size);

        return new File(chunks, name, { type: mimeType });
    }

    private requestFileChunk(handle: string, offset: number, length: number) {
        const socket = this.socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error('The local bridge is not connected.');
        const id = globalThis.crypto.randomUUID();
        const request: BridgeFileRequest = {
            type: 'file.request',
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            id,
            handle,
            offset,
            length,
        };
        return new Promise<Extract<BridgeFileResponse, { ok: true }>>((resolve, reject) => {
            const timeout = window.setTimeout(() => {
                this.fileRequests.delete(id);
                reject(new Error('The local bridge did not return the next audio chunk in time.'));
            }, 30_000);
            this.fileRequests.set(id, { resolve, reject, timeout });
            try {
                socket.send(JSON.stringify(request));
            } catch (error) {
                window.clearTimeout(timeout);
                this.fileRequests.delete(id);
                reject(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    private rejectFileRequests(error: Error) {
        for (const pending of this.fileRequests.values()) {
            window.clearTimeout(pending.timeout);
            pending.reject(error);
        }
        this.fileRequests.clear();
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
    serviceRegistry.importPayloadResolver = bridge;
    bridge.start();
    return bridge;
}
