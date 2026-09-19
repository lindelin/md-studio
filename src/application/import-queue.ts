import { ApplicationError } from './contracts';

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
    fullWidthTitle?: string;
    artist?: string;
    album?: string;
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

type ImportQueueListener = (snapshot: ImportQueueSnapshot) => void;

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
        this.assertRevision(expectedRevision);
        const index = this.requireIndex(id);
        const updated = { ...this.items[index], ...structuredClone(changes) };
        this.validateMetadata(updated);
        this.items[index] = updated;
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

    attachPayload(id: string, payload: unknown) {
        this.requireIndex(id);
        this.payloads.set(id, payload);
    }

    subscribe(listener: ImportQueueListener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private validateInput(input: ImportQueueInput) {
        if (!input.source.name.trim() || !input.source.reference.trim()) {
            throw new ApplicationError('INVALID_INPUT', 'Every audio source needs a name and reference.');
        }
        this.validateMetadata(input.metadata);
    }

    private validateMetadata(metadata: ImportTrackMetadata) {
        if (typeof metadata.title !== 'string') {
            throw new ApplicationError('INVALID_INPUT', 'Every imported track needs a title string.');
        }
        if (metadata.duration !== undefined && (!Number.isFinite(metadata.duration) || metadata.duration < 0)) {
            throw new ApplicationError('INVALID_INPUT', 'Track duration must be a non-negative number.');
        }
        if (metadata.bytesToSkip !== undefined && (!Number.isInteger(metadata.bytesToSkip) || metadata.bytesToSkip < 0)) {
            throw new ApplicationError('INVALID_INPUT', 'The encoded audio offset must be a non-negative whole number.');
        }
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
