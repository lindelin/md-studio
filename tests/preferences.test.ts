import assert from 'node:assert/strict';
import test from 'node:test';
import {
    clearAppPreferences,
    isBoolean,
    isOneOf,
    loadPreference,
    readRawPreference,
    saveRawPreference,
    savePreference,
} from '../src/preferences';

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length() {
        return this.values.size;
    }

    clear(): void {
        this.values.clear();
    }

    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }

    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }

    removeItem(key: string): void {
        this.values.delete(key);
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

test('malformed JSON is isolated to the affected preference', () => {
    const storage = new MemoryStorage();
    storage.setItem('colorTheme', '{broken');
    storage.setItem('unrelated', 'keep me');

    assert.equal(loadPreference('colorTheme', 'system', isOneOf(['dark', 'light', 'system'] as const), storage), 'system');
    assert.equal(storage.getItem('colorTheme'), null);
    assert.equal(storage.getItem('unrelated'), 'keep me');
});

test('valid JSON with the wrong shape is rejected', () => {
    const storage = new MemoryStorage();
    storage.setItem('notifyWhenFinished', JSON.stringify('yes'));

    assert.equal(loadPreference('notifyWhenFinished', false, isBoolean, storage), false);
    assert.equal(storage.getItem('notifyWhenFinished'), null);
});

test('valid preferences round trip through storage', () => {
    const storage = new MemoryStorage();

    assert.equal(savePreference('notifyWhenFinished', true, storage), true);
    assert.equal(loadPreference('notifyWhenFinished', false, isBoolean, storage), true);
});

test('raw preferences are safely available for legacy and bridge settings', () => {
    const storage = new MemoryStorage();

    assert.equal(saveRawPreference('version', '1.6.0', storage), true);
    assert.equal(readRawPreference('version', storage), '1.6.0');
});

test('app reset preserves storage owned by other code', () => {
    const storage = new MemoryStorage();
    storage.setItem('colorTheme', JSON.stringify('dark'));
    storage.setItem('unrelated', 'keep me');

    assert.deepEqual(clearAppPreferences(storage), { ok: true });

    assert.equal(storage.getItem('colorTheme'), null);
    assert.equal(storage.getItem('unrelated'), 'keep me');
});

test('app reset restores every preference when browser storage rejects a removal', () => {
    const storage = new MemoryStorage();
    storage.setItem('version', '0.1.0');
    storage.setItem('colorTheme', JSON.stringify('dark'));
    storage.setItem('unrelated', 'keep me');
    const removeItem = storage.removeItem.bind(storage);
    let removeCount = 0;
    storage.removeItem = (key: string) => {
        removeCount += 1;
        if (removeCount === 2) throw new Error('storage is locked');
        removeItem(key);
    };

    assert.deepEqual(clearAppPreferences(storage), {
        ok: false,
        cause: 'storage is locked',
        rollbackFailed: false,
    });
    assert.equal(storage.getItem('version'), '0.1.0');
    assert.equal(storage.getItem('colorTheme'), JSON.stringify('dark'));
    assert.equal(storage.getItem('unrelated'), 'keep me');
});

test('storage write failures do not crash reducers', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
        throw new Error('quota exceeded');
    };

    assert.equal(savePreference('notifyWhenFinished', true, storage), false);
});
