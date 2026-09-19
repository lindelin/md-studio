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
        const catalog = new LibraryCatalog(() => serviceWithDatabase(database));
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
