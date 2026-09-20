import { getApplicationClient } from '../application/runtime';
import { ApplicationError } from '../application/contracts';
import { savePreferencesAtomically } from '../preferences';
import { getSimpleServices, type ServiceConstructionInfo } from '../services/interface-service-manager';
import type { AppDispatch, RootState } from './store';
import { actions as appStateActions } from './app-feature';
import { normalizeServiceSelection } from '../frontend/service-selection';

const persistenceMessage = 'Settings could not be saved in this browser. Free some storage or reset the application, then try again.';

function persist(entries: readonly (readonly [string, unknown])[], storage?: Storage | null) {
    const result = savePreferencesAtomically(entries, storage === undefined ? undefined : storage);
    if (result?.ok) return;
    throw new ApplicationError('PERSISTENCE_FAILED', persistenceMessage, {
        cause: result?.cause ?? 'Browser storage is unavailable.',
        rollbackFailed: result?.rollbackFailed ?? false,
    });
}

export function disconnectDevice(finalize = true) {
    return async function (dispatch: AppDispatch) {
        await getApplicationClient().disconnectLocalDevice(finalize);
        dispatch(appStateActions.setMainView('WELCOME'));
    };
}

export function setSelectedService(index: number, storage?: Storage | null) {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        const normalized = normalizeServiceSelection(getState().appState.availableServices.length, index);
        persist([['lastSelectedService', normalized]], storage);
        dispatch(appStateActions.setLastSelectedService(normalized));
        return normalized;
    };
}

export function setLocalBridgeEnabled(enabled: boolean, storage?: Storage | null) {
    return async function (dispatch: AppDispatch) {
        persist([['minidiscLocalBridgeEnabled', enabled]], storage);
        dispatch(appStateActions.setLocalBridgeEnabled(enabled));
    };
}

export function addService(info: ServiceConstructionInfo, storage?: Storage | null) {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        const { availableServices } = getState().appState;
        const next = [...availableServices, info];
        const selected = normalizeServiceSelection(next.length, getState().appState.lastSelectedService);
        const simpleServices = new Set(getSimpleServices().map((service) => service.name));
        persist([
            ['customServices', next.filter((service) => !simpleServices.has(service.name))],
            ['lastSelectedService', selected],
        ], storage);
        dispatch(appStateActions.setAvailableServices(next));
    };
}

export function deleteService(index: number, storage?: Storage | null) {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        if (index < getSimpleServices().length) return;
        const availableServices = [...getState().appState.availableServices];
        availableServices.splice(index, 1);
        const simpleServices = new Set(getSimpleServices().map((service) => service.name));
        persist([
            ['customServices', availableServices.filter((service) => !simpleServices.has(service.name))],
            ['lastSelectedService', 0],
        ], storage);
        dispatch(appStateActions.setLastSelectedService(0));
        dispatch(appStateActions.setAvailableServices(availableServices));
    };
}
