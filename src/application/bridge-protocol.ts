import type { ApplicationCommand, CommandResult } from './command-bus';

export const BRIDGE_PROTOCOL_VERSION = 3;
export const BRIDGE_FILE_CHUNK_SIZE = 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(BRIDGE_FILE_CHUNK_SIZE / 3) * 4;
const BROWSER_ONLY_COMMANDS = new Set([
    'advanced.writeToc',
    'advanced.runTetris',
    'advanced.setSpUploadSpeedup',
    'advanced.setDiscSwapDetectionDisabled',
    'advanced.enableHimdFullMode',
    'advanced.enterServiceMode',
]);

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
    const message = requireRecord(value, 'Bridge message');
    if (message.protocolVersion !== BRIDGE_PROTOCOL_VERSION) throw new Error('Unsupported bridge protocol version.');
    const type = requireString(message.type, 'Bridge message type');

    switch (type) {
        case 'hello':
            requireString(message.client, 'Bridge client');
            break;
        case 'request': {
            requireId(message.id);
            const command = requireRecord(message.command, 'Bridge command');
            const commandType = requireString(command.type, 'Application command type');
            if (BROWSER_ONLY_COMMANDS.has(commandType)) {
                throw new Error(`Application command ${commandType} is restricted to the local browser UI.`);
            }
            break;
        }
        case 'response': {
            requireId(message.id);
            const result = requireRecord(message.result, 'Bridge command result');
            requireBoolean(result.ok, 'Bridge command result status');
            if (result.ok === false) {
                const error = requireRecord(result.error, 'Bridge command error');
                requireString(error.code, 'Bridge command error code');
                requireString(error.message, 'Bridge command error message');
            }
            break;
        }
        case 'file.request':
            requireId(message.id);
            requireString(message.handle, 'File handle');
            requireWholeNumber(message.offset, 'File offset');
            requireWholeNumber(message.length, 'File chunk length', 1, BRIDGE_FILE_CHUNK_SIZE);
            break;
        case 'file.response':
            requireId(message.id);
            requireBoolean(message.ok, 'File response status');
            if (message.ok) {
                requireString(message.name, 'File name');
                requireString(message.mimeType, 'File MIME type', true);
                requireWholeNumber(message.size, 'File size');
                requireWholeNumber(message.offset, 'File offset');
                requireBase64(message.data, 'File chunk');
            } else {
                requireString(message.error, 'File response error');
            }
            break;
        case 'file.write.request':
            requireId(message.id);
            requireString(message.outputHandle, 'Output handle');
            requireString(message.fileId, 'Output file ID');
            requireString(message.name, 'Output file name');
            requireWholeNumber(message.offset, 'Output offset');
            requireBase64(message.data, 'Output chunk');
            requireBoolean(message.complete, 'Output completion status');
            break;
        case 'file.write.response':
            requireId(message.id);
            requireBoolean(message.ok, 'Output response status');
            if (message.ok) {
                requireWholeNumber(message.bytesWritten, 'Output byte count');
                if (message.completedPath !== undefined) requireString(message.completedPath, 'Completed output path');
            } else {
                requireString(message.error, 'Output response error');
            }
            break;
        default:
            throw new Error('Unknown bridge message type.');
    }
    return message as BridgeMessage;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string, allowEmpty = false) {
    if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) throw new Error(`${label} must be a string.`);
    return value;
}

function requireId(value: unknown) {
    return requireString(value, 'Bridge message ID');
}

function requireBoolean(value: unknown, label: string) {
    if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean.`);
    return value;
}

function requireWholeNumber(value: unknown, label: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
        throw new Error(`${label} must be a whole number from ${minimum} to ${maximum}.`);
    }
    return value as number;
}

function requireBase64(value: unknown, label: string) {
    const encoded = requireString(value, label, true);
    if (encoded.length > MAX_BASE64_CHARS || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
        throw new Error(`${label} must be a valid bounded base64 string.`);
    }
    return encoded;
}
