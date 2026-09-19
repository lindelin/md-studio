import { randomUUID } from 'node:crypto';
import { BRIDGE_PROTOCOL_VERSION, parseBridgeMessage, type BridgeHello, type BridgeRequest } from '../src/application/bridge-protocol.ts';
import type { ApplicationCommand, CommandResult } from '../src/application/command-bus.ts';

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

    attach(peer: BridgePeer) {
        this.activePeer = peer;
        return () => {
            if (this.activePeer !== peer) return;
            this.activePeer = undefined;
            this.rejectPending(new Error('The MiniDisc application disconnected from the local bridge.'));
        };
    }

    handleMessage(peer: BridgePeer, raw: string) {
        const message = parseBridgeMessage(JSON.parse(raw));
        if (message.type === 'hello') {
            this.validateHello(message);
            this.activePeer = peer;
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

    private validateHello(message: BridgeHello) {
        if (message.client !== 'webminidisc-app') throw new Error('Unknown local bridge client.');
    }

    private rejectPending(error: Error) {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timeout);
            pending.reject(error);
        }
        this.pending.clear();
    }
}
