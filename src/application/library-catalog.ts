import { ApplicationError } from './contracts';
import type { LibraryService, LocalDatabase, LocalTrackMetadata } from '../services/library/library';
import type { ExportParams } from '../services/audio/audio-export';

export type LibraryCatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LibraryCatalogSnapshot {
    revision: number;
    status: LibraryCatalogStatus;
    database: LocalDatabase | null;
    error: string | null;
}

export type LibraryCatalogState = Omit<LibraryCatalogSnapshot, 'database'> & { entryCount: number };

export type LibraryCatalogEntry =
    | { kind: 'directory'; name: string }
    | ({ kind: 'track'; name: string } & LocalTrackMetadata);

export interface LibraryCatalogPage {
    revision: number;
    path: string[];
    offset: number;
    limit: number;
    total: number;
    nextOffset?: number;
    items: LibraryCatalogEntry[];
}

export interface LibraryTrackSelection {
    path: string[];
    name: string;
    metadata: LocalTrackMetadata;
}

type LibraryCatalogListener = (snapshot: LibraryCatalogSnapshot) => void;

const MAX_LIBRARY_DEPTH = 64;
const MAX_LIBRARY_ENTRIES = 100_000;
const MAX_LIBRARY_TEXT_LENGTH = 1024;
export const MAX_LIBRARY_PAGE_SIZE = 200;
const MAX_LIBRARY_IMPORT_ITEMS = 500;

function isTrackMetadata(value: unknown): value is LocalTrackMetadata {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const candidate = value as Partial<LocalTrackMetadata>;
    return (
        typeof candidate.artist === 'string' &&
        candidate.artist.length <= MAX_LIBRARY_TEXT_LENGTH &&
        typeof candidate.album === 'string' &&
        candidate.album.length <= MAX_LIBRARY_TEXT_LENGTH &&
        typeof candidate.title === 'string' &&
        candidate.title.length <= MAX_LIBRARY_TEXT_LENGTH &&
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
            if (name.length === 0 || name.length > MAX_LIBRARY_TEXT_LENGTH || name.includes('/') || name.includes('\0')) {
                throw new ApplicationError(
                    'INVALID_INPUT',
                    `Library file and directory names must contain 1 to ${MAX_LIBRARY_TEXT_LENGTH} path-safe characters.`
                );
            }
            if (!isTrackMetadata(child)) visit(child, depth + 1);
        }
    };
    visit(value, 0);
}

export class LibraryCatalog {
    private snapshot: LibraryCatalogSnapshot = { revision: 0, status: 'idle', database: null, error: null };
    private readonly listeners = new Set<LibraryCatalogListener>();
    private activeService?: LibraryService;
    private refreshInFlight?: Promise<LibraryCatalogSnapshot>;

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
        if (this.refreshInFlight) return this.refreshInFlight;
        const refresh = this.performRefresh();
        this.refreshInFlight = refresh;
        try {
            return await refresh;
        } finally {
            if (this.refreshInFlight === refresh) this.refreshInFlight = undefined;
        }
    }

    private async performRefresh(): Promise<LibraryCatalogSnapshot> {
        this.activeService = undefined;
        this.publish({ status: 'loading', database: null, error: null });
        try {
            const service = this.resolveService();
            const database: unknown = await service.getDatabase();
            validateLocalDatabase(database);
            this.activeService = service;
            return this.publish({ status: 'ready', database, error: null }, true);
        } catch (error) {
            this.activeService = undefined;
            const message = error instanceof Error ? error.message : String(error);
            this.publish({ status: 'error', database: null, error: message });
            throw error;
        }
    }

    resolveTracks(paths: string[][], expectedRevision?: number): LibraryTrackSelection[] {
        if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_LIBRARY_IMPORT_ITEMS) {
            throw new ApplicationError(
                'INVALID_INPUT',
                `Select from 1 to ${MAX_LIBRARY_IMPORT_ITEMS} library tracks at a time.`
            );
        }
        const uniquePaths = new Set(paths.map((path) => JSON.stringify(path)));
        if (uniquePaths.size !== paths.length) {
            throw new ApplicationError('INVALID_INPUT', 'A library track was selected more than once.');
        }
        return paths.map((path) => {
            const entry = this.resolveEntry(path, expectedRevision);
            if (!isTrackMetadata(entry)) {
                throw new ApplicationError('INVALID_INPUT', `Library path is a directory: ${path.join('/')}.`);
            }
            return { path: [...path], name: path[path.length - 1], metadata: structuredClone(entry) };
        });
    }

    createFileProcessor(path: string[], expectedRevision?: number): (params: ExportParams) => Promise<ArrayBuffer> {
        const [selection] = this.resolveTracks([path], expectedRevision);
        const service = this.activeService;
        if (!service) throw new ApplicationError('INVALID_INPUT', 'Refresh the library before selecting audio.');
        const reference = selection.path.join('/');
        return (params) => service.processLocalLibraryFile(reference, params);
    }

    list(path: string[] = [], offset = 0, limit = 100, expectedRevision?: number): LibraryCatalogPage {
        if (this.snapshot.status !== 'ready' || !this.snapshot.database) {
            throw new ApplicationError('INVALID_INPUT', 'Refresh the library before listing its contents.');
        }
        if (expectedRevision !== undefined && expectedRevision !== this.snapshot.revision) {
            throw new ApplicationError('STALE_REVISION', 'The library changed after this listing was prepared.', {
                expectedRevision,
                actualRevision: this.snapshot.revision,
            });
        }
        if (!Number.isInteger(offset) || offset < 0) {
            throw new ApplicationError('INVALID_INPUT', 'Library page offset must be a non-negative whole number.');
        }
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIBRARY_PAGE_SIZE) {
            throw new ApplicationError('INVALID_INPUT', `Library page size must be from 1 to ${MAX_LIBRARY_PAGE_SIZE}.`);
        }
        if (
            !Array.isArray(path) ||
            path.length > MAX_LIBRARY_DEPTH ||
            path.some((part) => typeof part !== 'string' || part.length === 0 || part.length > MAX_LIBRARY_TEXT_LENGTH)
        ) {
            throw new ApplicationError('INVALID_INPUT', 'Library path is invalid.');
        }

        let directory = this.snapshot.database;
        for (const part of path) {
            const entry = directory[part];
            if (!entry || isTrackMetadata(entry)) {
                throw new ApplicationError('INVALID_INPUT', `Library directory does not exist: ${path.join('/')}.`);
            }
            directory = entry;
        }

        const items = Object.entries(directory)
            .map<LibraryCatalogEntry>(([name, entry]) =>
                isTrackMetadata(entry) ? { kind: 'track', name, ...entry } : { kind: 'directory', name }
            )
            .sort((left, right) => {
                if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
                return left.name.localeCompare(right.name);
            });
        const pageItems = items.slice(offset, offset + limit);
        const nextOffset = offset + pageItems.length;
        return structuredClone({
            revision: this.snapshot.revision,
            path,
            offset,
            limit,
            total: items.length,
            ...(nextOffset < items.length ? { nextOffset } : {}),
            items: pageItems,
        });
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

    private resolveEntry(path: string[], expectedRevision?: number): LocalDatabase | LocalTrackMetadata {
        if (this.snapshot.status !== 'ready' || !this.snapshot.database) {
            throw new ApplicationError('INVALID_INPUT', 'Refresh the library before selecting audio.');
        }
        if (expectedRevision !== undefined && expectedRevision !== this.snapshot.revision) {
            throw new ApplicationError('STALE_REVISION', 'The library changed after this selection was prepared.', {
                expectedRevision,
                actualRevision: this.snapshot.revision,
            });
        }
        if (!Array.isArray(path) || path.length === 0 || path.length > MAX_LIBRARY_DEPTH) {
            throw new ApplicationError('INVALID_INPUT', 'Library track path is invalid.');
        }
        let entry: LocalDatabase | LocalTrackMetadata = this.snapshot.database;
        for (const part of path) {
            if (
                isTrackMetadata(entry) ||
                typeof part !== 'string' ||
                part.length === 0 ||
                part.length > MAX_LIBRARY_TEXT_LENGTH ||
                !entry[part]
            ) {
                throw new ApplicationError('INVALID_INPUT', `Library track does not exist: ${path.join('/')}.`);
            }
            entry = entry[part];
        }
        return entry;
    }
}

function countEntries(database: LocalDatabase): number {
    return Object.values(database).reduce(
        (total, entry) => total + 1 + (isTrackMetadata(entry) ? 0 : countEntries(entry)),
        0
    );
}
