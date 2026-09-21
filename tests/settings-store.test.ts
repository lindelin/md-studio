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

class FailingStorage extends MemoryStorage {
    writes = 0;
    failOnWrite = Number.POSITIVE_INFINITY;

    override setItem(key: string, value: string) {
        this.writes += 1;
        if (this.writes === this.failOnWrite) throw new Error('quota exceeded');
        super.setItem(key, value);
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
                uiLanguage: 'zh-CN',
                fullWidthSupport: true,
                audioEncoderId: 'atracdenc',
                audioExportService: 1,
                audioExportServiceConfig: { bitrate: 256, normalize: true },
                uploadFormat: { 'Mock NetMD': [1, 2] },
                trackTitleFormat: 'artist-title',
            },
            0
        );
        const reloaded = new SettingsStore(storage).getSnapshot();

        assert.equal(updated.revision, 1);
        assert.equal(reloaded.values.colorTheme, 'dark');
        assert.equal(reloaded.values.uiLanguage, 'zh-CN');
        assert.equal(reloaded.values.fullWidthSupport, true);
        assert.equal(reloaded.values.audioEncoderId, 'atracdenc');
        assert.equal(reloaded.values.audioExportService, 1);
        assert.deepEqual(reloaded.values.audioExportServiceConfig, { bitrate: 256, normalize: true });
        assert.deepEqual(reloaded.values.uploadFormat, { 'Mock NetMD': [1, 2] });
        assert.equal(reloaded.values.trackTitleFormat, 'artist-title');
        assert.deepEqual(revisions, [1]);
    });

    it('does not retain mutable configuration objects supplied by a caller', () => {
        const settings = new SettingsStore(new MemoryStorage());
        const config = { endpoint: 'https://example.test/library' };

        settings.update({ audioExportServiceConfig: config });
        config.endpoint = 'https://mutated.invalid/';

        assert.equal(settings.getSnapshot().values.audioExportServiceConfig.endpoint, 'https://example.test/library');
    });

    it('rejects stale, empty, and malformed updates without changing state', () => {
        const settings = new SettingsStore(new MemoryStorage());
        settings.update({ fullWidthSupport: true });

        assert.throws(
            () => settings.update({ notifyWhenFinished: true }, 0),
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
            () => settings.update({ uiLanguage: 'fr' } as any),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.throws(() => settings.update({ onlineServicesEnabled: true } as any), /Unknown setting/);
        assert.throws(
            () => settings.update({ audioEncoderId: 'Invalid Encoder Id' }),
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
        assert.throws(() => settings.update({ recognitionImportMethod: 'line-in' } as any), /Unknown setting/);
        assert.equal(settings.getSnapshot().revision, 1);
        assert.equal(settings.getSnapshot().values.notifyWhenFinished, false);
    });

    it('cleans invalid persisted service settings while preserving valid legacy values', () => {
        const storage = new MemoryStorage();
        storage.setItem('audioExportService', JSON.stringify(-2));
        storage.setItem('audioEncoderId', JSON.stringify('Invalid Encoder Id'));
        storage.setItem('audioExportServiceConfig', JSON.stringify({ quality: 'high' }));
        storage.setItem('libraryService', JSON.stringify(0));
        storage.setItem('libraryServiceConfig', JSON.stringify({ nested: { invalid: true } }));
        storage.setItem('uploadFormat', JSON.stringify({ Mock: [1.5, 0] }));
        storage.setItem('trackTitleFormat', JSON.stringify('invalid-format'));
        storage.setItem('libraryService', JSON.stringify(1));

        const snapshot = new SettingsStore(storage).getSnapshot();

        assert.equal(snapshot.values.audioExportService, 1);
        assert.equal(snapshot.values.audioEncoderId, null);
        assert.deepEqual(snapshot.values.audioExportServiceConfig, { quality: 'high' });
        assert.deepEqual(snapshot.values.uploadFormat, {});
        assert.equal(snapshot.values.trackTitleFormat, 'filename');
        assert.equal(storage.getItem('audioExportService'), null);
        assert.equal(storage.getItem('audioEncoderId'), null);
        assert.equal(storage.getItem('libraryServiceConfig'), null);
        assert.equal(storage.getItem('uploadFormat'), null);
        assert.equal(storage.getItem('trackTitleFormat'), null);
        assert.equal(storage.getItem('libraryService'), null);
    });

    it('preserves a legacy encoder index until a stable service id is saved', () => {
        const storage = new MemoryStorage();
        storage.setItem('audioExportService', JSON.stringify(2));

        const snapshot = new SettingsStore(storage).getSnapshot();

        assert.equal(snapshot.values.audioEncoderId, null);
        assert.equal(snapshot.values.audioExportService, 2);
    });

    it('allows clearing a stable encoder id back to automatic selection', () => {
        const settings = new SettingsStore(new MemoryStorage());
        settings.update({ audioEncoderId: 'atracdenc' });

        const cleared = settings.update({ audioEncoderId: null });

        assert.equal(cleared.values.audioEncoderId, null);
    });

    it('rejects a failed browser write without publishing an in-memory success', () => {
        const storage = new FailingStorage();
        const settings = new SettingsStore(storage);
        const revisions: number[] = [];
        settings.subscribe((snapshot) => revisions.push(snapshot.revision));
        storage.failOnWrite = 1;

        assert.throws(
            () => settings.update({ uiLanguage: 'en' }),
            (error: unknown) =>
                error instanceof ApplicationError &&
                error.code === 'PERSISTENCE_FAILED' &&
                error.details?.cause === 'quota exceeded'
        );

        assert.equal(settings.getSnapshot().revision, 0);
        assert.equal(settings.getSnapshot().values.uiLanguage, 'system');
        assert.equal(storage.getItem('uiLanguage'), null);
        assert.deepEqual(revisions, []);
    });

    it('rolls back earlier fields when a later field cannot be persisted', () => {
        const storage = new FailingStorage();
        storage.setItem('colorTheme', JSON.stringify('light'));
        storage.setItem('uiLanguage', JSON.stringify('en'));
        const settings = new SettingsStore(storage);
        storage.failOnWrite = storage.writes + 2;

        assert.throws(
            () => settings.update({ colorTheme: 'dark', uiLanguage: 'zh-CN' }),
            (error: unknown) => error instanceof ApplicationError && error.code === 'PERSISTENCE_FAILED'
        );

        assert.equal(storage.getItem('colorTheme'), JSON.stringify('light'));
        assert.equal(storage.getItem('uiLanguage'), JSON.stringify('en'));
        assert.equal(settings.getSnapshot().revision, 0);
        assert.equal(settings.getSnapshot().values.colorTheme, 'light');
        assert.equal(settings.getSnapshot().values.uiLanguage, 'en');
    });
});
