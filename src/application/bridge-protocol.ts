import type { ApplicationCommand, CommandResult } from './command-bus';

export const BRIDGE_PROTOCOL_VERSION = 1;

export interface BridgeHello {
    type: 'hello';
    protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
    client: 'webminidisc-app';
}

export interface BridgeRequest {
    type: 'request';
    protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
    id: string;
    command: ApplicationCommand;
}

export interface BridgeResponse {
    type: 'response';
    protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
    id: string;
    result: CommandResult;
}

export type BridgeMessage = BridgeHello | BridgeRequest | BridgeResponse;

export function parseBridgeMessage(value: unknown): BridgeMessage {
    if (!value || typeof value !== 'object') throw new Error('Bridge message must be an object.');
    const message = value as Partial<BridgeMessage>;
    if (message.protocolVersion !== BRIDGE_PROTOCOL_VERSION) throw new Error('Unsupported bridge protocol version.');
    if (!['hello', 'request', 'response'].includes(String(message.type))) throw new Error('Unknown bridge message type.');
    return message as BridgeMessage;
}
