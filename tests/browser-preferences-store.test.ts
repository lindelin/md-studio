import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BrowserPreferencesStore } from '../src/frontend/browser-preferences-store.ts';
import { getSimpleServices, type ServiceConstructionInfo } from '../src/services/interface-service-manager.ts';
import { ApplicationError } from '../src/application/contracts.ts';

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();

    get length() { return this.values.size; }
    clear() { this.values.clear(); }
    getItem(key: string) { return this.values.get(key) ?? null; }
    key(index: number) { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string) { this.values.delete(key); }
    setItem(key: string, value: string) { this.values.set(key, value); }
}

describe('BrowserPreferencesStore', () => {
    it('persists a normalized device selection before publishing it', () => {
        const storage = new MemoryStorage();
        const store = new BrowserPreferencesStore(storage);
        let notifications = 0;
        store.subscribe(() => { notifications += 1; });

        const selected = store.setSelectedService(1);

        assert.equal(selected, 1);
        assert.equal(storage.getItem('lastSelectedService'), '1');
        assert.equal(store.getSnapshot().lastSelectedService, 1);
        assert.equal(store.getSnapshot().revision, 1);
        assert.equal(notifications, 1);
    });

    it('persists custom-device catalog changes and selection together', () => {
        const storage = new MemoryStorage();
        const store = new BrowserPreferencesStore(storage);
        const builtIns = getSimpleServices();
        const custom: ServiceConstructionInfo = {
            id: 'remote-netmd',
            name: 'Remote NetMD',
            parameters: { serverAddress: 'http://127.0.0.1:9000/', friendlyName: 'Studio' },
        };

        store.addService(custom);
        store.setSelectedService(builtIns.length);
        assert.equal(store.getSnapshot().availableServices.at(-1)?.id, 'remote-netmd');
        store.deleteService(builtIns.length);

        assert.equal(storage.getItem('customServices'), '[]');
        assert.equal(storage.getItem('lastSelectedService'), '0');
        assert.deepEqual(store.getSnapshot().availableServices, builtIns);
        assert.equal(store.getSnapshot().lastSelectedService, 0);
    });

    it('does not publish a change when browser storage rejects a preference', () => {
        const storage = new MemoryStorage();
        storage.setItem = () => { throw new Error('quota exceeded'); };
        const store = new BrowserPreferencesStore(storage);
        let notifications = 0;
        store.subscribe(() => { notifications += 1; });

        assert.throws(
            () => store.setLocalBridgeEnabled(true),
            (error: unknown) =>
                error instanceof ApplicationError &&
                error.code === 'PERSISTENCE_FAILED' &&
                error.details?.cause === 'quota exceeded'
        );
        assert.equal(store.getSnapshot().localBridgeEnabled, false);
        assert.equal(store.getSnapshot().revision, 0);
        assert.equal(notifications, 0);
    });

    it('freezes published snapshots so UI callers cannot mutate preferences', () => {
        const store = new BrowserPreferencesStore(new MemoryStorage());
        const snapshot = store.getSnapshot();
        assert.equal(Object.isFrozen(snapshot), true);
        assert.equal(Object.isFrozen(snapshot.availableServices), true);
        assert.equal(Object.isFrozen(snapshot.availableServices[0]), true);
    });
});
