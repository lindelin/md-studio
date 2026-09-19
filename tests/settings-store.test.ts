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

        const updated = settings.update({ colorTheme: 'dark', fullWidthSupport: true }, 0);
        const reloaded = new SettingsStore(storage).getSnapshot();

        assert.equal(updated.revision, 1);
        assert.equal(reloaded.values.colorTheme, 'dark');
        assert.equal(reloaded.values.fullWidthSupport, true);
        assert.deepEqual(revisions, [1]);
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
        assert.equal(settings.getSnapshot().revision, 1);
        assert.equal(settings.getSnapshot().values.pageFullHeight, false);
    });
});
