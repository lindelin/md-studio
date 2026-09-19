import type { ApplicationCommand, CommandResult } from './command-bus';

export const BRIDGE_PROTOCOL_VERSION = 3;

export interface BridgeHello {
    type: 'hello';
    protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
    client: 'minidisc-workspace-app';
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

export interface BridgeFileRequest {
    type: 'file.request';
    protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
    id: string;
    handle: string;
    offset: number;
    length: number;
}

export type BridgeFileResponse =
    | {
          type: 'file.response';
          protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
          id: string;
          ok: true;
          name: string;
          mimeType: string;
          size: number;
          offset: number;
          data: string;
      }
    | {
          type: 'file.response';
          protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
          id: string;
          ok: false;
          error: string;
      };

export interface BridgeFileWriteRequest {
    type: 'file.write.request';
    protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
    id: string;
    outputHandle: string;
    fileId: string;
    name: string;
    offset: number;
    data: string;
    complete: boolean;
}

export type BridgeFileWriteResponse =
    | {
          type: 'file.write.response';
          protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
          id: string;
          ok: true;
          bytesWritten: number;
          completedPath?: string;
      }
    | {
          type: 'file.write.response';
          protocolVersion: typeof BRIDGE_PROTOCOL_VERSION;
          id: string;
          ok: false;
          error: string;
      };

export type BridgeMessage =
    | BridgeHello
    | BridgeRequest
    | BridgeResponse
    | BridgeFileRequest
    | BridgeFileResponse
    | BridgeFileWriteRequest
    | BridgeFileWriteResponse;

export function parseBridgeMessage(value: unknown): BridgeMessage {
    if (!value || typeof value !== 'object') throw new Error('Bridge message must be an object.');
    const message = value as Partial<BridgeMessage>;
    if (message.protocolVersion !== BRIDGE_PROTOCOL_VERSION) throw new Error('Unsupported bridge protocol version.');
    if (
        !['hello', 'request', 'response', 'file.request', 'file.response', 'file.write.request', 'file.write.response'].includes(
            String(message.type)
        )
    ) {
        throw new Error('Unknown bridge message type.');
    }
    return message as BridgeMessage;
}
