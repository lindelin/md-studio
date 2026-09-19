import { randomUUID } from 'node:crypto';
import { access, open, realpath, rename, rm, stat, type FileHandle } from 'node:fs/promises';
import { basename, join } from 'node:path';

const MAX_CHUNK_SIZE = 1024 * 1024;

interface OutputSession {
    directory: string;
    files: Map<string, OutputFile>;
}

interface OutputFile {
    handle: FileHandle;
    temporaryPath: string;
    finalPath: string;
    offset: number;
}

export interface OutputChunkResult {
    bytesWritten: number;
    completedPath?: string;
}

export interface OutputChunkSink {
    writeChunk(
        outputHandle: string,
        fileId: string,
        name: string,
        offset: number,
        data: Uint8Array,
        complete: boolean
    ): Promise<OutputChunkResult>;
}

export class LocalOutputRegistry implements OutputChunkSink {
    private readonly sessions = new Map<string, OutputSession>();

    async registerDirectory(directoryPath: string) {
        const directory = await realpath(directoryPath);
        const info = await stat(directory);
        if (!info.isDirectory()) throw new Error(`${directoryPath} is not a directory.`);
        const handle = randomUUID();
        this.sessions.set(handle, { directory, files: new Map() });
        return { handle, directory };
    }

    async writeChunk(
        outputHandle: string,
        fileId: string,
        name: string,
        offset: number,
        data: Uint8Array,
        complete: boolean
    ): Promise<OutputChunkResult> {
        const session = this.sessions.get(outputHandle);
        if (!session) throw new Error('The local export destination is unknown or expired.');
        if (!fileId.trim()) throw new Error('The export file identifier is required.');
        if (!Number.isInteger(offset) || offset < 0) throw new Error('Invalid export offset.');
        if (data.byteLength > MAX_CHUNK_SIZE) throw new Error('The export chunk is too large.');

        let output = session.files.get(fileId);
        if (!output) {
            if (offset !== 0) throw new Error('The first export chunk must start at offset zero.');
            const safeName = sanitizeFileName(name);
            const finalPath = await availablePath(session.directory, safeName);
            const temporaryPath = join(session.directory, `.${basename(finalPath)}.${randomUUID()}.part`);
            const handle = await open(temporaryPath, 'wx');
            output = { handle, temporaryPath, finalPath, offset: 0 };
            session.files.set(fileId, output);
        }
        if (output.offset !== offset) throw new Error('Export chunks arrived out of order.');

        try {
            if (data.byteLength > 0) {
                const result = await output.handle.write(data, 0, data.byteLength, offset);
                if (result.bytesWritten !== data.byteLength) throw new Error('The export destination accepted only part of a chunk.');
                output.offset += result.bytesWritten;
            }
            if (!complete) return { bytesWritten: output.offset };

            await output.handle.sync();
            await output.handle.close();
            await rename(output.temporaryPath, output.finalPath);
            session.files.delete(fileId);
            return { bytesWritten: output.offset, completedPath: output.finalPath };
        } catch (error) {
            session.files.delete(fileId);
            await output.handle.close().catch(() => undefined);
            await rm(output.temporaryPath, { force: true }).catch(() => undefined);
            throw error;
        }
    }

    async close() {
        const cleanups: Promise<unknown>[] = [];
        for (const session of this.sessions.values()) {
            for (const output of session.files.values()) {
                cleanups.push(output.handle.close().catch(() => undefined));
                cleanups.push(rm(output.temporaryPath, { force: true }).catch(() => undefined));
            }
        }
        await Promise.allSettled(cleanups);
        this.sessions.clear();
    }
}

function sanitizeFileName(name: string) {
    const leaf = [...basename(name)]
        .map((character) => (character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character))
        .join('')
        .replace(/[. ]+$/g, '');
    if (!leaf || leaf === '.' || leaf === '..') throw new Error('The export file name is invalid.');
    return leaf.slice(0, 180);
}

async function availablePath(directory: string, requestedName: string) {
    const dot = requestedName.lastIndexOf('.');
    const stem = dot > 0 ? requestedName.slice(0, dot) : requestedName;
    const extension = dot > 0 ? requestedName.slice(dot) : '';
    for (let suffix = 1; suffix <= 9999; suffix += 1) {
        const candidate = join(directory, suffix === 1 ? requestedName : `${stem} (${suffix})${extension}`);
        try {
            await access(candidate);
        } catch {
            return candidate;
        }
    }
    throw new Error('Could not choose an unused export file name.');
}
