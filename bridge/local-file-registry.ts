import { randomUUID } from 'node:crypto';
import { open, realpath, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';

export const BRIDGE_FILE_REFERENCE_PREFIX = 'bridge-file:';
const MAX_CHUNK_SIZE = 1024 * 1024;

interface RegisteredFile {
    path: string;
    name: string;
    size: number;
    mimeType: string;
}

export interface FileChunk {
    name: string;
    mimeType: string;
    size: number;
    offset: number;
    data: Uint8Array;
}

export interface FileChunkProvider {
    readChunk(handle: string, offset: number, length: number): Promise<FileChunk>;
}

export class LocalFileRegistry implements FileChunkProvider {
    private readonly files = new Map<string, RegisteredFile>();

    async register(filePath: string) {
        const resolvedPath = await realpath(filePath);
        const info = await stat(resolvedPath);
        if (!info.isFile()) throw new Error(`${filePath} is not a regular file.`);

        const handle = randomUUID();
        const registered: RegisteredFile = {
            path: resolvedPath,
            name: basename(resolvedPath),
            size: info.size,
            mimeType: inferMimeType(resolvedPath),
        };
        this.files.set(handle, registered);
        return {
            handle,
            reference: `${BRIDGE_FILE_REFERENCE_PREFIX}${handle}`,
            name: registered.name,
            size: registered.size,
            mimeType: registered.mimeType,
        };
    }

    revoke(handleOrReference: string) {
        this.files.delete(stripReferencePrefix(handleOrReference));
    }

    async readChunk(handleOrReference: string, offset: number, length: number): Promise<FileChunk> {
        const handle = stripReferencePrefix(handleOrReference);
        const registered = this.files.get(handle);
        if (!registered) throw new Error('The local audio file handle is unknown or expired.');
        if (!Number.isInteger(offset) || offset < 0 || offset > registered.size) throw new Error('Invalid file offset.');
        if (!Number.isInteger(length) || length < 1 || length > MAX_CHUNK_SIZE) throw new Error('Invalid file chunk length.');

        const bytesToRead = Math.min(length, registered.size - offset);
        const data = new Uint8Array(bytesToRead);
        if (bytesToRead > 0) {
            const file = await open(registered.path, 'r');
            try {
                const result = await file.read(data, 0, bytesToRead, offset);
                if (result.bytesRead !== bytesToRead) throw new Error('The local audio file changed while it was being read.');
            } finally {
                await file.close();
            }
        }
        return { ...registered, offset, data };
    }
}

function stripReferencePrefix(value: string) {
    return value.startsWith(BRIDGE_FILE_REFERENCE_PREFIX) ? value.slice(BRIDGE_FILE_REFERENCE_PREFIX.length) : value;
}

function inferMimeType(filePath: string) {
    switch (extname(filePath).toLowerCase()) {
        case '.wav':
            return 'audio/wav';
        case '.flac':
            return 'audio/flac';
        case '.mp3':
            return 'audio/mpeg';
        case '.m4a':
        case '.mp4':
            return 'audio/mp4';
        case '.ogg':
        case '.oga':
            return 'audio/ogg';
        case '.opus':
            return 'audio/opus';
        case '.aif':
        case '.aiff':
            return 'audio/aiff';
        default:
            return 'application/octet-stream';
    }
}
