import { parse as parsePath } from 'node:path';
import { parseFile } from 'music-metadata';
import type { ImportQueueInput, ImportTrackMetadata } from '../src/application/import-queue.ts';
import type { LocalFileRegistry } from './local-file-registry.ts';

export interface StagedLocalAudioImport {
    handle: string;
    input: Omit<ImportQueueInput, 'payload'>;
}

export async function stageLocalAudioImport(
    registry: LocalFileRegistry,
    filePath: string,
    overrides: Partial<ImportTrackMetadata> = {}
): Promise<StagedLocalAudioImport> {
    const registered = await registry.register(filePath);
    let inspected: Partial<ImportTrackMetadata> = {};
    try {
        const parsed = await parseFile(filePath, { duration: true, skipCovers: true });
        const sourceTitle = cleanText(parsed.common.title);
        const sourceArtist = cleanText(parsed.common.artist);
        const sourceAlbum = cleanText(parsed.common.album);
        inspected = {
            ...(sourceTitle ? { title: sourceTitle, sourceTitle } : {}),
            ...(sourceArtist ? { artist: sourceArtist, sourceArtist } : {}),
            ...(sourceAlbum ? { album: sourceAlbum, sourceAlbum } : {}),
            ...(Number.isFinite(parsed.format.duration) && (parsed.format.duration ?? 0) > 0
                ? { duration: parsed.format.duration }
                : {}),
        };
    } catch {
        // Unsupported or damaged files remain stageable and will be rejected by
        // the browser conversion pipeline if they cannot be decoded.
    }

    return {
        handle: registered.handle,
        input: {
            source: {
                kind: 'local-path',
                name: registered.name,
                reference: registered.reference,
                size: registered.size,
                mimeType: registered.mimeType,
            },
            metadata: {
                title: parsePath(registered.name).name,
                ...inspected,
                ...overrides,
            },
        },
    };
}

function cleanText(value: string | undefined) {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
}
