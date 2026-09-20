import { getApplicationClient } from '../application/runtime';
import { getSimpleServices, type ServiceConstructionInfo } from '../services/interface-service-manager';
import type { AppDispatch, RootState } from './store';
import { actions as appStateActions } from './app-feature';

export function disconnectDevice(finalize = true) {
    return async function (dispatch: AppDispatch) {
        await getApplicationClient().disconnectLocalDevice(finalize);
        dispatch(appStateActions.setMainView('WELCOME'));
    };
}

export function addService(info: ServiceConstructionInfo) {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        const { availableServices } = getState().appState;
        dispatch(appStateActions.setAvailableServices([...availableServices, info]));
    };
}

export function deleteService(index: number) {
    return async function (dispatch: AppDispatch, getState: () => RootState) {
        if (index < getSimpleServices().length) return;
        const availableServices = [...getState().appState.availableServices];
        availableServices.splice(index, 1);
        dispatch(appStateActions.setLastSelectedService(0));
        dispatch(appStateActions.setAvailableServices(availableServices));
    };
}
