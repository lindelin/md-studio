import { randomUUID } from 'node:crypto';
import {
    BRIDGE_PROTOCOL_VERSION,
    parseBridgeMessage,
    type BridgeFileResponse,
    type BridgeHello,
    type BridgeRequest,
} from '../src/application/bridge-protocol.ts';
import type { ApplicationCommand, CommandResult } from '../src/application/command-bus.ts';
import type { FileChunkProvider } from './local-file-registry.ts';

export interface BridgePeer {
    send(data: string): void;
}

interface PendingRequest {
    resolve: (result: CommandResult) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
}

export class LocalBridgeBroker {
    private activePeer?: BridgePeer;
    private readonly pending = new Map<string, PendingRequest>();
    private readonly connectionWaiters = new Set<{ resolve: () => void; reject: (error: Error) => void; timeout: NodeJS.Timeout }>();

    constructor(private readonly files?: FileChunkProvider) {}

    attach(peer: BridgePeer) {
        return () => {
            if (this.activePeer !== peer) return;
            this.activePeer = undefined;
            this.rejectPending(new Error('The MiniDisc application disconnected from the local bridge.'));
        };
    }

    async handleMessage(peer: BridgePeer, raw: string) {
        const message = parseBridgeMessage(JSON.parse(raw));
        if (message.type === 'hello') {
            this.validateHello(message);
            if (this.activePeer && this.activePeer !== peer) {
                this.rejectPending(new Error('The MiniDisc application connection was replaced.'));
            }
            this.activePeer = peer;
            for (const waiter of this.connectionWaiters) {
                clearTimeout(waiter.timeout);
                waiter.resolve();
            }
            this.connectionWaiters.clear();
            return;
        }
        if (message.type === 'file.request') {
            if (peer !== this.activePeer) return;
            let response: BridgeFileResponse;
            try {
                if (!this.files) throw new Error('Local file transfer is unavailable.');
                const chunk = await this.files.readChunk(message.handle, message.offset, message.length);
                response = {
                    type: 'file.response',
                    protocolVersion: BRIDGE_PROTOCOL_VERSION,
                    id: message.id,
                    ok: true,
                    name: chunk.name,
                    mimeType: chunk.mimeType,
                    size: chunk.size,
                    offset: chunk.offset,
                    data: Buffer.from(chunk.data).toString('base64'),
                };
            } catch (error) {
                response = {
                    type: 'file.response',
                    protocolVersion: BRIDGE_PROTOCOL_VERSION,
                    id: message.id,
                    ok: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
            peer.send(JSON.stringify(response));
            return;
        }
        if (message.type !== 'response' || peer !== this.activePeer) return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(message.id);
        pending.resolve(message.result);
    }

    execute(command: ApplicationCommand, timeoutMs = 30_000) {
        if (!this.activePeer) return Promise.reject(new Error('Open the MiniDisc application and connect it to the local bridge.'));
        const id = randomUUID();
        const request: BridgeRequest = {
            type: 'request',
            protocolVersion: BRIDGE_PROTOCOL_VERSION,
            id,
            command,
        };
        return new Promise<CommandResult>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`The MiniDisc application did not answer command ${command.type} in time.`));
            }, timeoutMs);
            this.pending.set(id, { resolve, reject, timeout });
            this.activePeer!.send(JSON.stringify(request));
        });
    }

    isConnected() {
        return this.activePeer !== undefined;
    }

    waitForConnection(timeoutMs = 30_000) {
        if (this.activePeer) return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const waiter = {
                resolve,
                reject,
                timeout: setTimeout(() => {
                    this.connectionWaiters.delete(waiter);
                    reject(new Error('The MiniDisc application did not connect to the local bridge in time.'));
                }, timeoutMs),
            };
            this.connectionWaiters.add(waiter);
        });
    }

    private validateHello(message: BridgeHello) {
        if (message.client !== 'minidisc-workspace-app') throw new Error('Unknown local bridge client.');
    }

    private rejectPending(error: Error) {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
        }
        this.pending.clear();
    }
}
