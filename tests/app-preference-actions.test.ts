import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addService, deleteService, setLocalBridgeEnabled, setSelectedService } from '../src/redux/actions.ts';
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

function state(availableServices = getSimpleServices(), lastSelectedService = 0) {
    return { appState: { availableServices, lastSelectedService } } as any;
}

describe('browser app preference actions', () => {
    it('persists a normalized device selection before updating Redux', async () => {
        const storage = new MemoryStorage();
        const actions: any[] = [];
        const availableServices = getSimpleServices();

        const selected = await setSelectedService(1, storage)(
            (action: any) => actions.push(action),
            () => state(availableServices)
        );

        assert.equal(selected, 1);
        assert.equal(storage.getItem('lastSelectedService'), '1');
        assert.equal(actions.length, 1);
        assert.equal(actions[0].payload, 1);
    });

    it('persists custom-device catalog changes and selection together', async () => {
        const storage = new MemoryStorage();
        const actions: any[] = [];
        const builtIns = getSimpleServices();
        const custom: ServiceConstructionInfo = {
            id: 'remote-netmd',
            name: 'Remote NetMD',
            parameters: { address: 'ws://127.0.0.1:9000' },
        };

        await addService(custom, storage)((action: any) => actions.push(action), () => state(builtIns));
        const withCustom = [...builtIns, custom];
        await deleteService(builtIns.length, storage)(
            (action: any) => actions.push(action),
            () => state(withCustom, builtIns.length)
        );

        assert.equal(storage.getItem('customServices'), '[]');
        assert.equal(storage.getItem('lastSelectedService'), '0');
        assert.equal(actions.at(-2)?.payload, 0);
        assert.deepEqual(actions.at(-1)?.payload, builtIns);
    });

    it('does not update Redux when browser storage rejects a preference', async () => {
        const storage = new MemoryStorage();
        storage.setItem = () => { throw new Error('quota exceeded'); };
        const actions: any[] = [];

        await assert.rejects(
            setLocalBridgeEnabled(true, storage)((action: any) => actions.push(action)),
            (error: unknown) =>
                error instanceof ApplicationError &&
                error.code === 'PERSISTENCE_FAILED' &&
                error.details?.cause === 'quota exceeded'
        );
        assert.deepEqual(actions, []);
    });
});
