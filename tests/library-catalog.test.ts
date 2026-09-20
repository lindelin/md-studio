import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LibraryCatalog, validateLocalDatabase } from '../src/application/library-catalog.ts';
import type { LibraryService } from '../src/services/library/library.ts';

function serviceWithDatabase(database: unknown): LibraryService {
    return {
        async getDatabase() {
            return database as any;
        },
        async processLocalLibraryFile() {
            return new ArrayBuffer(0);
        },
    };
}

describe('LibraryCatalog', () => {
    it('publishes a validated revisioned database through loading and ready states', async () => {
        const database = {
            Album: {
                '01 - Track.flac': { artist: 'Artist', album: 'Album', title: 'Track', duration: 123.5, trackIndex: 1 },
            },
        };
        const catalog = new LibraryCatalog(async () => serviceWithDatabase(database));
        const states: string[] = [];
        catalog.subscribe((snapshot) => states.push(snapshot.status));

        const snapshot = await catalog.refresh();

        assert.equal(snapshot.revision, 1);
        assert.equal(snapshot.status, 'ready');
        assert.deepEqual(snapshot.database, database);
        assert.deepEqual(catalog.getState(), { revision: 1, status: 'ready', entryCount: 2, error: null });
        assert.deepEqual(states, ['loading', 'ready']);
    });

    it('clears stale data and publishes a useful error when a refresh fails validation', async () => {
        let database: unknown = {
            'track.wav': { artist: 'Artist', album: 'Album', title: 'Track', duration: 5 },
        };
        const catalog = new LibraryCatalog(() => serviceWithDatabase(database));
        await catalog.refresh();
        database = { 'broken.wav': { artist: 'Artist', duration: -1 } };

        await assert.rejects(() => catalog.refresh(), /invalid directory or track entry/i);

        const snapshot = catalog.getSnapshot();
        assert.equal(snapshot.status, 'error');
        assert.equal(snapshot.database, null);
        assert.match(snapshot.error ?? '', /invalid directory or track entry/i);
        assert.equal(snapshot.revision, 1);
    });

    it('lists bounded deterministic pages and rejects stale or invalid paths', async () => {
        const catalog = new LibraryCatalog(() =>
            serviceWithDatabase({
                Zeta: {},
                Alpha: {
                    '02.flac': { artist: 'Artist', album: 'Album', title: 'Two', duration: 2, trackIndex: 2 },
                    '01.flac': { artist: 'Artist', album: 'Album', title: 'One', duration: 1, trackIndex: 1 },
                },
                'root.flac': { artist: 'Artist', album: '', title: 'Root', duration: 3 },
            })
        );
        await catalog.refresh();

        const root = catalog.list([], 0, 2, 1);
        const album = catalog.list(['Alpha'], 1, 1, 1);

        assert.deepEqual(root.items.map((item) => [item.kind, item.name]), [
            ['directory', 'Alpha'],
            ['directory', 'Zeta'],
        ]);
        assert.equal(root.total, 3);
        assert.equal(root.nextOffset, 2);
        assert.deepEqual(album.items.map((item) => item.name), ['02.flac']);
        assert.equal(album.nextOffset, undefined);
        assert.throws(() => catalog.list(['missing']), /does not exist/i);
        assert.throws(
            () => catalog.list([], 0, 100, 0),
            (error: unknown) => (error as { code?: string }).code === 'STALE_REVISION'
        );
        assert.throws(() => catalog.list([], 0, 201), /page size/i);
    });

    it('searches track paths and metadata with revisioned bounded pages', async () => {
        const catalog = new LibraryCatalog(() =>
            serviceWithDatabase({
                'Various Artists': {
                    Compilation: {
                        '02-song.flac': { artist: 'Beta', album: 'Summer Mix', title: 'Night Train', duration: 2 },
                        '01-song.flac': { artist: 'Alpha', album: 'Summer Mix', title: 'Day Train', duration: 1 },
                    },
                },
                Solo: {
                    'train.wav': { artist: 'Gamma', album: 'Winter', title: 'Still', duration: 3 },
                },
            })
        );
        await catalog.refresh();

        const firstPage = catalog.search(' train ', 0, 2, 1);
        const albumMatch = catalog.search('summer mix', 0, 10, 1);

        assert.equal(firstPage.query, 'train');
        assert.equal(firstPage.total, 3);
        assert.equal(firstPage.nextOffset, 2);
        assert.deepEqual(firstPage.items.map((item) => item.path), [
            ['Solo', 'train.wav'],
            ['Various Artists', 'Compilation', '01-song.flac'],
        ]);
        assert.equal(albumMatch.total, 2);
        assert.throws(() => catalog.search('   '), /search text/i);
        assert.throws(
            () => catalog.search('train', 0, 10, 0),
            (error: unknown) => (error as { code?: string }).code === 'STALE_REVISION'
        );
    });

    it('binds selected audio to the service instance that produced the catalog revision', async () => {
        const processed: string[] = [];
        const service: LibraryService = {
            async getDatabase() {
                return { Album: { 'track.flac': { artist: 'Artist', album: 'Album', title: 'Track', duration: 4 } } };
            },
            async processLocalLibraryFile(path) {
                processed.push(path);
                return Uint8Array.from([9]).buffer;
            },
        };
        const catalog = new LibraryCatalog(() => service);
        await catalog.refresh();

        const processFile = catalog.createFileProcessor(['Album', 'track.flac'], 1);
        const result = await processFile({ format: { codec: 'PCM', bitrate: 1411 } });

        assert.deepEqual(processed, ['Album/track.flac']);
        assert.deepEqual([...new Uint8Array(result)], [9]);
    });

    it('resolves browser-folder files without bypassing the configured local encoder', async () => {
        const file = new File([Uint8Array.from([1])], 'track.flac', { type: 'audio/flac' });
        const service: LibraryService = {
            async getDatabase() {
                return { Album: { 'track.flac': { artist: 'Artist', album: 'Album', title: 'Track', duration: 4 } } };
            },
            async resolveLocalLibraryFile(path) {
                assert.equal(path, 'Album/track.flac');
                return file;
            },
        };
        const catalog = new LibraryCatalog(() => service);
        await catalog.refresh();

        const resolveFile = catalog.createFileResolver(['Album', 'track.flac'], 1);

        assert.ok(resolveFile);
        assert.equal(await resolveFile(), file);
        assert.throws(() => catalog.createFileProcessor(['Album', 'track.flac'], 1), /configured local audio encoder/i);
    });

    it('bounds hostile or accidentally recursive catalog shapes', () => {
        let database: Record<string, unknown> = {};
        const root = database;
        for (let index = 0; index < 65; index += 1) {
            const next: Record<string, unknown> = {};
            database.directory = next;
            database = next;
        }

        assert.throws(() => validateLocalDatabase(root), /directory levels/i);
        assert.throws(
            () => validateLocalDatabase({ 'track.wav': { artist: 'Artist', album: 'Album', title: 'Track', duration: Number.NaN } }),
            /invalid directory or track entry/i
        );
    });
});
