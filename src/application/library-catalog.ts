import { ApplicationError } from './contracts';
import type { LibraryService, LocalDatabase, LocalTrackMetadata } from '../services/library/library';

export type LibraryCatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LibraryCatalogSnapshot {
    revision: number;
    status: LibraryCatalogStatus;
    database: LocalDatabase | null;
    error: string | null;
}

export type LibraryCatalogState = Omit<LibraryCatalogSnapshot, 'database'> & { entryCount: number };

type LibraryCatalogListener = (snapshot: LibraryCatalogSnapshot) => void;

const MAX_LIBRARY_DEPTH = 64;
const MAX_LIBRARY_ENTRIES = 100_000;

function isTrackMetadata(value: unknown): value is LocalTrackMetadata {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const candidate = value as Partial<LocalTrackMetadata>;
    return (
        typeof candidate.artist === 'string' &&
        typeof candidate.album === 'string' &&
        typeof candidate.title === 'string' &&
        typeof candidate.duration === 'number' &&
        Number.isFinite(candidate.duration) &&
        candidate.duration >= 0 &&
        (candidate.trackIndex === undefined ||
            (typeof candidate.trackIndex === 'number' && Number.isInteger(candidate.trackIndex) && candidate.trackIndex >= 0))
    );
}

export function validateLocalDatabase(value: unknown): asserts value is LocalDatabase {
    let entries = 0;
    const visit = (node: unknown, depth: number) => {
        if (depth > MAX_LIBRARY_DEPTH) {
            throw new ApplicationError('INVALID_INPUT', `Library database exceeds ${MAX_LIBRARY_DEPTH} directory levels.`);
        }
        if (typeof node !== 'object' || node === null || Array.isArray(node)) {
            throw new ApplicationError('INVALID_INPUT', 'Library database contains an invalid directory or track entry.');
        }
        for (const [name, child] of Object.entries(node)) {
            entries += 1;
            if (entries > MAX_LIBRARY_ENTRIES) {
                throw new ApplicationError('INVALID_INPUT', `Library database exceeds ${MAX_LIBRARY_ENTRIES} entries.`);
            }
            if (name.length === 0) {
                throw new ApplicationError('INVALID_INPUT', 'Library database contains an empty file or directory name.');
            }
            if (!isTrackMetadata(child)) visit(child, depth + 1);
        }
    };
    visit(value, 0);
}

export class LibraryCatalog {
    private snapshot: LibraryCatalogSnapshot = { revision: 0, status: 'idle', database: null, error: null };
    private readonly listeners = new Set<LibraryCatalogListener>();

    constructor(private readonly resolveService: () => LibraryService) {}

    getSnapshot = () => this.snapshot;

    getState = (): LibraryCatalogState => ({
        revision: this.snapshot.revision,
        status: this.snapshot.status,
        error: this.snapshot.error,
        entryCount: this.snapshot.database ? countEntries(this.snapshot.database) : 0,
    });

    subscribe = (listener: LibraryCatalogListener) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    async refresh(): Promise<LibraryCatalogSnapshot> {
        this.publish({ status: 'loading', database: null, error: null });
        try {
            const database: unknown = await this.resolveService().getDatabase();
            validateLocalDatabase(database);
            return this.publish({ status: 'ready', database, error: null }, true);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.publish({ status: 'error', database: null, error: message });
            throw error;
        }
    }

    private publish(changes: Partial<LibraryCatalogSnapshot>, incrementRevision = false) {
        this.snapshot = structuredClone({
            ...this.snapshot,
            ...changes,
            revision: this.snapshot.revision + (incrementRevision ? 1 : 0),
        });
        for (const listener of this.listeners) listener(this.snapshot);
        return this.snapshot;
    }
}

function countEntries(database: LocalDatabase): number {
    return Object.values(database).reduce(
        (total, entry) => total + 1 + (isTrackMetadata(entry) ? 0 : countEntries(entry)),
        0
    );
}
