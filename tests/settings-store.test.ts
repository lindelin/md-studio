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
                uploadFormat: { 'Mock NetMD': [1, 2] },
                trackTitleFormat: 'artist-title',
                recognitionTrackTitleFormat: 'title-artist',
                recognitionImportMethod: 'exploits',
                factoryBadSectorRememberChoice: true,
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
        assert.deepEqual(reloaded.values.uploadFormat, { 'Mock NetMD': [1, 2] });
        assert.equal(reloaded.values.trackTitleFormat, 'artist-title');
        assert.equal(reloaded.values.recognitionTrackTitleFormat, 'title-artist');
        assert.equal(reloaded.values.recognitionImportMethod, 'exploits');
        assert.equal(reloaded.values.factoryBadSectorRememberChoice, true);
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
        assert.throws(
            () => settings.update({ uploadFormat: { Mock: [0, -1] } }),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.throws(
            () => settings.update({ trackTitleFormat: 'performer' } as any),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.throws(
            () => settings.update({ recognitionTrackTitleFormat: 'filename' } as any),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.throws(
            () => settings.update({ recognitionImportMethod: 'microphone' } as any),
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
        storage.setItem('uploadFormat', JSON.stringify({ Mock: [1.5, 0] }));
        storage.setItem('trackTitleFormat', JSON.stringify('invalid-format'));
        storage.setItem('recognitionTrackTitleFormat', JSON.stringify('filename'));
        storage.setItem('recognitionImportMethod', JSON.stringify('microphone'));
        storage.setItem('factoryBadSectorRememberChoice', JSON.stringify('yes'));

        const snapshot = new SettingsStore(storage).getSnapshot();

        assert.equal(snapshot.values.audioExportService, 0);
        assert.deepEqual(snapshot.values.audioExportServiceConfig, { quality: 'high' });
        assert.equal(snapshot.values.libraryService, 0);
        assert.deepEqual(snapshot.values.libraryServiceConfig, {});
        assert.deepEqual(snapshot.values.uploadFormat, {});
        assert.equal(snapshot.values.trackTitleFormat, 'filename');
        assert.equal(snapshot.values.recognitionTrackTitleFormat, 'title');
        assert.equal(snapshot.values.recognitionImportMethod, 'line-in');
        assert.equal(snapshot.values.factoryBadSectorRememberChoice, false);
        assert.equal(storage.getItem('audioExportService'), null);
        assert.equal(storage.getItem('libraryServiceConfig'), null);
        assert.equal(storage.getItem('uploadFormat'), null);
        assert.equal(storage.getItem('trackTitleFormat'), null);
        assert.equal(storage.getItem('recognitionTrackTitleFormat'), null);
        assert.equal(storage.getItem('recognitionImportMethod'), null);
        assert.equal(storage.getItem('factoryBadSectorRememberChoice'), null);
    });
});
