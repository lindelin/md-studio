import { ApplicationError } from './contracts';
import type { TaskManager, TaskSnapshot } from './task-manager';
import { INTERACTIVE_HOMEBREW_AUTHORIZATION } from './interactive-authorization';

export type ImportSourceKind = 'browser-file' | 'local-path' | 'library';

export interface ImportSourceDescriptor {
    kind: ImportSourceKind;
    name: string;
    reference: string;
    size?: number;
    mimeType?: string;
}

export interface ImportTrackMetadata {
    title: string;
    sourceTitle?: string;
    fullWidthTitle?: string;
    artist?: string;
    sourceArtist?: string;
    album?: string;
    sourceAlbum?: string;
    duration?: number;
    forcedEncoding?: { codec: string; bitrate: number } | null;
    bytesToSkip?: number;
}

export interface ImportQueueItem extends ImportSourceDescriptor, ImportTrackMetadata {
    id: string;
}

export interface ImportQueueSnapshot {
    revision: number;
    items: ImportQueueItem[];
}

export interface ImportQueueInput {
    source: ImportSourceDescriptor;
    metadata: ImportTrackMetadata;
    payload?: unknown;
}

export interface ImportWriteRequest {
    ids?: string[];
    format?: { codec: string; bitrate: number };
    enableReplayGain?: boolean;
    enableGapless?: boolean;
    removeOnSuccess?: boolean;
    expectedRevision?: number;
    expectedDeviceSessionId?: string;
    expectedDeviceRevision?: number;
    /** Browser UI only: an in-memory capability that cannot cross the JSON bridge. */
    interactiveHomebrewAuthorization?: typeof INTERACTIVE_HOMEBREW_AUTHORIZATION;
}

export interface ImportQueueMetadataUpdate {
    id: string;
    changes: Partial<ImportTrackMetadata>;
}

export interface ImportWriter {
    start(request: ImportWriteRequest, queue: ImportQueue, tasks: TaskManager): Promise<TaskSnapshot>;
}

export interface ResolvedImportQueueItem {
    item: ImportQueueItem;
    payload?: unknown;
}

type ImportQueueListener = (snapshot: ImportQueueSnapshot) => void;

const SOURCE_KEYS = new Set<keyof ImportSourceDescriptor>(['kind', 'name', 'reference', 'size', 'mimeType']);
const METADATA_KEYS = new Set<keyof ImportTrackMetadata>([
    'title',
    'sourceTitle',
    'fullWidthTitle',
    'artist',
    'sourceArtist',
    'album',
    'sourceAlbum',
    'duration',
    'forcedEncoding',
    'bytesToSkip',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createImportId() {
    return globalThis.crypto?.randomUUID?.() ?? `import-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export class ImportQueue {
    private revision = 0;
    private items: ImportQueueItem[] = [];
    private readonly payloads = new Map<string, unknown>();
    private readonly listeners = new Set<ImportQueueListener>();

    snapshot(): ImportQueueSnapshot {
        return { revision: this.revision, items: structuredClone(this.items) };
    }

    add(inputs: ImportQueueInput[], expectedRevision?: number) {
        this.assertRevision(expectedRevision);
        if (inputs.length === 0) throw new ApplicationError('INVALID_INPUT', 'At least one audio source is required.');
        for (const input of inputs) this.validateInput(input);

        for (const input of inputs) {
            const id = createImportId();
            this.items.push({ id, ...structuredClone(input.source), ...structuredClone(input.metadata) });
            if (input.payload !== undefined) this.payloads.set(id, input.payload);
        }
        return this.commit();
    }

    update(id: string, changes: Partial<ImportTrackMetadata>, expectedRevision?: number) {
        return this.updateMany([{ id, changes }], expectedRevision);
    }

    updateMany(updates: ImportQueueMetadataUpdate[], expectedRevision?: number) {
        this.assertRevision(expectedRevision);
        if (updates.length === 0) throw new ApplicationError('INVALID_INPUT', 'At least one import update is required.');
        const requestedIds = new Set(updates.map((update) => update.id));
        if (requestedIds.size !== updates.length) {
            throw new ApplicationError('INVALID_INPUT', 'An import item was supplied more than once.');
        }

        const replacements = new Map<number, ImportQueueItem>();
        for (const update of updates) {
            this.validateMetadataChanges(update.changes);
            const index = this.requireIndex(update.id);
            const updated = { ...this.items[index], ...structuredClone(update.changes) };
            this.validateMetadata(updated, false);
            replacements.set(index, updated);
        }
        for (const [index, item] of replacements) this.items[index] = item;
        return this.commit();
    }

    move(id: string, destinationIndex: number, expectedRevision?: number) {
        this.assertRevision(expectedRevision);
        const sourceIndex = this.requireIndex(id);
        if (!Number.isInteger(destinationIndex) || destinationIndex < 0 || destinationIndex >= this.items.length) {
            throw new ApplicationError('INVALID_INPUT', 'The import destination is outside the queue.', { destinationIndex });
        }
        const [item] = this.items.splice(sourceIndex, 1);
        this.items.splice(destinationIndex, 0, item);
        return this.commit();
    }

    remove(ids: string[], expectedRevision?: number) {
        this.assertRevision(expectedRevision);
        if (ids.length === 0) throw new ApplicationError('INVALID_INPUT', 'At least one import item is required.');
        const uniqueIds = [...new Set(ids)];
        if (uniqueIds.length !== ids.length) throw new ApplicationError('INVALID_INPUT', 'An import item was supplied more than once.');
        for (const id of uniqueIds) this.requireIndex(id);
        const removed = new Set(uniqueIds);
        this.items = this.items.filter((item) => !removed.has(item.id));
        for (const id of removed) this.payloads.delete(id);
        return this.commit();
    }

    clear(expectedRevision?: number) {
        this.assertRevision(expectedRevision);
        this.items = [];
        this.payloads.clear();
        return this.commit();
    }

    resolvePayload<T = unknown>(id: string): T {
        this.requireIndex(id);
        if (!this.payloads.has(id)) {
            throw new ApplicationError('INVALID_INPUT', `Import item ${id} has no local payload.`, { id });
        }
        return this.payloads.get(id) as T;
    }

    resolveSelection(ids?: string[], expectedRevision?: number): ResolvedImportQueueItem[] {
        this.assertRevision(expectedRevision);
        const requestedIds = ids ?? this.items.map((item) => item.id);
        if (requestedIds.length === 0) throw new ApplicationError('INVALID_INPUT', 'The import queue is empty.');
        const uniqueIds = new Set(requestedIds);
        if (uniqueIds.size !== requestedIds.length) {
            throw new ApplicationError('INVALID_INPUT', 'An import item was supplied more than once.');
        }
        for (const id of uniqueIds) this.requireIndex(id);
        return this.items
            .filter((item) => uniqueIds.has(item.id))
            .map((item) => ({ item: structuredClone(item), payload: this.payloads.get(item.id) }));
    }

    attachPayload(id: string, payload: unknown) {
        this.requireIndex(id);
        this.payloads.set(id, payload);
    }

    subscribe(listener: ImportQueueListener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private validateInput(input: ImportQueueInput) {
        if (!isRecord(input) || !isRecord(input.source) || !isRecord(input.metadata)) {
            throw new ApplicationError('INVALID_INPUT', 'Every import must contain a source and metadata object.');
        }
        this.assertKnownKeys(input.source, SOURCE_KEYS, 'audio source');
        if (!['browser-file', 'local-path', 'library'].includes(String(input.source.kind))) {
            throw new ApplicationError('INVALID_INPUT', 'The audio source kind is invalid.');
        }
        if (typeof input.source.name !== 'string' || typeof input.source.reference !== 'string') {
            throw new ApplicationError('INVALID_INPUT', 'Every audio source needs string name and reference fields.');
        }
        if (!input.source.name.trim() || !input.source.reference.trim()) {
            throw new ApplicationError('INVALID_INPUT', 'Every audio source needs a name and reference.');
        }
        if (input.source.size !== undefined && (!Number.isSafeInteger(input.source.size) || input.source.size < 0)) {
            throw new ApplicationError('INVALID_INPUT', 'Audio source size must be a non-negative whole number.');
        }
        if (input.source.mimeType !== undefined && typeof input.source.mimeType !== 'string') {
            throw new ApplicationError('INVALID_INPUT', 'Audio source MIME type must be a string.');
        }
        this.validateMetadata(input.metadata);
    }

    private validateMetadata(metadata: ImportTrackMetadata, checkKeys = true) {
        if (!isRecord(metadata)) throw new ApplicationError('INVALID_INPUT', 'Import metadata must be an object.');
        if (checkKeys) this.assertKnownKeys(metadata, METADATA_KEYS, 'import metadata');
        if (typeof metadata.title !== 'string') {
            throw new ApplicationError('INVALID_INPUT', 'Every imported track needs a title string.');
        }
        for (const key of [
            'sourceTitle',
            'fullWidthTitle',
            'artist',
            'sourceArtist',
            'album',
            'sourceAlbum',
        ] as const) {
            if (metadata[key] !== undefined && typeof metadata[key] !== 'string') {
                throw new ApplicationError('INVALID_INPUT', `${key} must be a string.`);
            }
        }
        if (metadata.duration !== undefined && (!Number.isFinite(metadata.duration) || metadata.duration < 0)) {
            throw new ApplicationError('INVALID_INPUT', 'Track duration must be a non-negative number.');
        }
        if (metadata.forcedEncoding !== undefined && metadata.forcedEncoding !== null) {
            const encoding = metadata.forcedEncoding;
            if (
                !isRecord(encoding) ||
                Object.keys(encoding).some((key) => key !== 'codec' && key !== 'bitrate') ||
                typeof encoding.codec !== 'string' ||
                encoding.codec.trim().length === 0 ||
                !Number.isSafeInteger(encoding.bitrate) ||
                encoding.bitrate <= 0
            ) {
                throw new ApplicationError(
                    'INVALID_INPUT',
                    'Forced encoding must contain a codec and a positive whole-number bitrate.'
                );
            }
        }
        if (metadata.bytesToSkip !== undefined && (!Number.isInteger(metadata.bytesToSkip) || metadata.bytesToSkip < 0)) {
            throw new ApplicationError('INVALID_INPUT', 'The encoded audio offset must be a non-negative whole number.');
        }
    }

    private validateMetadataChanges(changes: Partial<ImportTrackMetadata>) {
        if (!isRecord(changes) || Object.keys(changes).length === 0) {
            throw new ApplicationError('INVALID_INPUT', 'Every import update must change at least one metadata field.');
        }
        this.assertKnownKeys(changes, METADATA_KEYS, 'import update');
    }

    private assertKnownKeys<T extends string>(value: Record<string, unknown>, allowed: ReadonlySet<T>, label: string) {
        const unknownKey = Object.keys(value).find((key) => !allowed.has(key as T));
        if (unknownKey) throw new ApplicationError('INVALID_INPUT', `Unknown ${label} field: ${unknownKey}.`);
    }

    private requireIndex(id: string) {
        const index = this.items.findIndex((item) => item.id === id);
        if (index === -1) throw new ApplicationError('INVALID_INPUT', `Import item ${id} does not exist.`, { id });
        return index;
    }

    private assertRevision(expectedRevision?: number) {
        if (expectedRevision !== undefined && expectedRevision !== this.revision) {
            throw new ApplicationError('STALE_REVISION', 'The import queue changed after this command was prepared.', {
                expectedRevision,
                actualRevision: this.revision,
            });
        }
    }

    private commit() {
        this.revision += 1;
        const snapshot = this.snapshot();
        for (const listener of this.listeners) listener(snapshot);
        return snapshot;
    }
}
