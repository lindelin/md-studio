import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApplicationError } from '../src/application/contracts.ts';
import { SettingsStore } from '../src/application/settings-store.ts';

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length() {
        return this.values.size;
    }

    clear() {
        this.values.clear();
    }

    getItem(key: string) {
        return this.values.get(key) ?? null;
    }

    key(index: number) {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string) {
        this.values.delete(key);
    }

    setItem(key: string, value: string) {
        this.values.set(key, value);
    }
}

describe('SettingsStore', () => {
    it('persists validated settings and publishes revisioned snapshots', () => {
        const storage = new MemoryStorage();
        const settings = new SettingsStore(storage);
        const revisions: number[] = [];
        settings.subscribe((snapshot) => revisions.push(snapshot.revision));

        const updated = settings.update(
            {
                colorTheme: 'dark',
                fullWidthSupport: true,
                audioExportService: 2,
                audioExportServiceConfig: { bitrate: 256, normalize: true },
                libraryService: 1,
                libraryServiceConfig: { endpoint: 'https://example.test/library' },
            },
            0
        );
        const reloaded = new SettingsStore(storage).getSnapshot();

        assert.equal(updated.revision, 1);
        assert.equal(reloaded.values.colorTheme, 'dark');
        assert.equal(reloaded.values.fullWidthSupport, true);
        assert.equal(reloaded.values.audioExportService, 2);
        assert.deepEqual(reloaded.values.audioExportServiceConfig, { bitrate: 256, normalize: true });
        assert.equal(reloaded.values.libraryService, 1);
        assert.deepEqual(reloaded.values.libraryServiceConfig, { endpoint: 'https://example.test/library' });
        assert.deepEqual(revisions, [1]);
    });

    it('does not retain mutable configuration objects supplied by a caller', () => {
        const settings = new SettingsStore(new MemoryStorage());
        const config = { endpoint: 'https://example.test/library' };

        settings.update({ libraryServiceConfig: config });
        config.endpoint = 'https://mutated.invalid/';

        assert.equal(settings.getSnapshot().values.libraryServiceConfig.endpoint, 'https://example.test/library');
    });

    it('rejects stale, empty, and malformed updates without changing state', () => {
        const settings = new SettingsStore(new MemoryStorage());
        settings.update({ pageFullWidth: true });

        assert.throws(
            () => settings.update({ pageFullHeight: true }, 0),
            (error: unknown) => (error as ApplicationError).code === 'STALE_REVISION'
        );
        assert.throws(
            () => settings.update({}),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.throws(
            () => settings.update({ colorTheme: 'purple' } as any),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.throws(
            () => settings.update({ audioExportService: -1 }),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.throws(
            () => settings.update({ libraryService: 1.5 }),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.throws(
            () => settings.update({ libraryServiceConfig: { nested: {} } } as any),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.equal(settings.getSnapshot().revision, 1);
        assert.equal(settings.getSnapshot().values.pageFullHeight, false);
    });

    it('cleans invalid persisted service settings while preserving valid legacy values', () => {
        const storage = new MemoryStorage();
        storage.setItem('audioExportService', JSON.stringify(-2));
        storage.setItem('audioExportServiceConfig', JSON.stringify({ quality: 'high' }));
        storage.setItem('libraryService', JSON.stringify(0));
        storage.setItem('libraryServiceConfig', JSON.stringify({ nested: { invalid: true } }));

        const snapshot = new SettingsStore(storage).getSnapshot();

        assert.equal(snapshot.values.audioExportService, 0);
        assert.deepEqual(snapshot.values.audioExportServiceConfig, { quality: 'high' });
        assert.equal(snapshot.values.libraryService, 0);
        assert.deepEqual(snapshot.values.libraryServiceConfig, {});
        assert.equal(storage.getItem('audioExportService'), null);
        assert.equal(storage.getItem('libraryServiceConfig'), null);
    });
});
