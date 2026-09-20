import { ApplicationError } from '../application/contracts';
import { normalizeServiceSelection } from './service-selection';
import {
    filterOutCorrupted,
    getSimpleServices,
    type ServiceConstructionInfo,
} from '../services/interface-service-manager';
import { isBoolean, isFiniteNumber, isServiceList, loadPreference, savePreferencesAtomically } from '../preferences';

export interface BrowserPreferencesSnapshot {
    revision: number;
    localBridgeEnabled: boolean;
    availableServices: readonly ServiceConstructionInfo[];
    lastSelectedService: number;
}

const persistenceMessage =
    'Settings could not be saved in this browser. Free some storage or reset the application, then try again.';

export class BrowserPreferencesStore {
    private readonly listeners = new Set<() => void>();
    private snapshot: BrowserPreferencesSnapshot;

    constructor(private readonly storage?: Storage | null) {
        const availableServices = [
            ...getSimpleServices(),
            ...filterOutCorrupted(this.load('customServices', [], isServiceList)),
        ];
        this.snapshot = this.freeze({
            revision: 0,
            localBridgeEnabled: this.load('minidiscLocalBridgeEnabled', false, isBoolean),
            availableServices,
            lastSelectedService: normalizeServiceSelection(
                availableServices.length,
                this.load('lastSelectedService', 0, isFiniteNumber)
            ),
        });
    }

    getSnapshot = () => this.snapshot;

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    setSelectedService(index: number) {
        const normalized = normalizeServiceSelection(this.snapshot.availableServices.length, index);
        this.persist([['lastSelectedService', normalized]]);
        this.publish({ lastSelectedService: normalized });
        return normalized;
    }

    setLocalBridgeEnabled(enabled: boolean) {
        this.persist([['minidiscLocalBridgeEnabled', enabled]]);
        this.publish({ localBridgeEnabled: enabled });
    }

    addService(info: ServiceConstructionInfo) {
        const availableServices = [...this.snapshot.availableServices, structuredClone(info)];
        const simpleServices = new Set(getSimpleServices().map((service) => service.name));
        const lastSelectedService = normalizeServiceSelection(
            availableServices.length,
            this.snapshot.lastSelectedService
        );
        this.persist([
            ['customServices', availableServices.filter((service) => !simpleServices.has(service.name))],
            ['lastSelectedService', lastSelectedService],
        ]);
        this.publish({ availableServices, lastSelectedService });
    }

    deleteService(index: number) {
        if (index < getSimpleServices().length || index >= this.snapshot.availableServices.length) return;
        const availableServices = [...this.snapshot.availableServices];
        availableServices.splice(index, 1);
        const simpleServices = new Set(getSimpleServices().map((service) => service.name));
        this.persist([
            ['customServices', availableServices.filter((service) => !simpleServices.has(service.name))],
            ['lastSelectedService', 0],
        ]);
        this.publish({ availableServices, lastSelectedService: 0 });
    }

    private load<T>(key: string, fallback: T, validator: (value: unknown) => value is T): T {
        return this.storage === undefined
            ? loadPreference(key, fallback, validator)
            : loadPreference(key, fallback, validator, this.storage);
    }

    private persist(entries: readonly (readonly [string, unknown])[]) {
        const result = savePreferencesAtomically(entries, this.storage);
        if (result?.ok) return;
        throw new ApplicationError('PERSISTENCE_FAILED', persistenceMessage, {
            cause: result?.cause ?? 'Browser storage is unavailable.',
            rollbackFailed: result?.rollbackFailed ?? false,
        });
    }

    private publish(changes: Partial<Omit<BrowserPreferencesSnapshot, 'revision'>>) {
        this.snapshot = this.freeze({
            ...this.snapshot,
            ...changes,
            revision: this.snapshot.revision + 1,
        });
        for (const listener of this.listeners) listener();
    }

    private freeze(snapshot: BrowserPreferencesSnapshot): BrowserPreferencesSnapshot {
        const services = snapshot.availableServices.map((service) =>
            Object.freeze({
                ...structuredClone(service),
                ...(service.parameters ? { parameters: Object.freeze(structuredClone(service.parameters)) } : {}),
            })
        );
        return Object.freeze({ ...snapshot, availableServices: Object.freeze(services) });
    }
}

export const browserPreferences = new BrowserPreferencesStore();
