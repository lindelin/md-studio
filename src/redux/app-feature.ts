import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableBatching } from 'redux-batched-actions';
import { filterOutCorrupted, getSimpleServices, ServiceConstructionInfo } from '../services/interface-service-manager';
import { savePreference, loadPreference } from '../utils';
import { isBoolean, isFiniteNumber, isServiceList } from '../preferences';
import { normalizeServiceSelection } from '../frontend/service-selection';
import { updateLoadingOperations } from '../frontend/loading-state';

export type Views = 'WELCOME' | 'MAIN';

export interface AppState {
    mainView: Views;
    loading: boolean;
    loadingOperations: number;
    browserSupported: boolean;
    runningChrome: boolean;
    aboutDialogVisible: boolean;
    discProtectedDialogVisible: boolean;
    settingsDialogVisible: boolean;
    hasNotificationSupport: boolean;
    localBridgeEnabled: boolean;
    availableServices: ServiceConstructionInfo[];
    lastSelectedService: number;
}

export const buildInitialState = (): AppState => {
    const availableServices = [
        ...getSimpleServices(),
        ...filterOutCorrupted(loadPreference<ServiceConstructionInfo[]>('customServices', [], isServiceList)),
    ];
    return {
        mainView: 'WELCOME',
        loading: false,
        loadingOperations: 0,
        browserSupported: true,
        runningChrome: true,
        aboutDialogVisible: false,
        discProtectedDialogVisible: false,
        settingsDialogVisible: false,
        hasNotificationSupport: true,
        localBridgeEnabled: loadPreference('minidiscLocalBridgeEnabled', false, isBoolean),
        availableServices,
        lastSelectedService: normalizeServiceSelection(
            availableServices.length,
            loadPreference('lastSelectedService', 0, isFiniteNumber)
        ),
    };
};

const initialState: AppState = buildInitialState();

export const slice = createSlice({
    name: 'app',
    initialState,
    reducers: {
        setMainView: (state, action: PayloadAction<Views>) => {
            // CAVEAT: There's a middleware that resets the state when mainView is set to WELCOME
            state.mainView = action.payload;
        },
        setLoading: (state, action: PayloadAction<boolean>) => {
            state.loadingOperations = updateLoadingOperations(state.loadingOperations, action.payload);
            state.loading = state.loadingOperations > 0;
        },
        setBrowserSupported: (state, action: PayloadAction<boolean>) => {
            state.browserSupported = action.payload;
        },
        setRunningChrome: (state, action: PayloadAction<boolean>) => {
            state.runningChrome = action.payload;
        },
        setNotificationSupport: (state, action: PayloadAction<boolean>) => {
            state.hasNotificationSupport = action.payload;
        },
        showAboutDialog: (state, action: PayloadAction<boolean>) => {
            state.aboutDialogVisible = action.payload;
        },
        showDiscProtectedDialog: (state, action: PayloadAction<boolean>) => {
            state.discProtectedDialogVisible = action.payload;
        },
        showSettingsDialog: (state, action: PayloadAction<boolean>) => {
            state.settingsDialogVisible = action.payload;
        },
        setLocalBridgeEnabled: (state, action: PayloadAction<boolean>) => {
            state.localBridgeEnabled = action.payload;
            savePreference('minidiscLocalBridgeEnabled', action.payload);
        },
        setAvailableServices: (state, action: PayloadAction<ServiceConstructionInfo[]>) => {
            state.availableServices = action.payload;
            state.lastSelectedService = normalizeServiceSelection(state.availableServices.length, state.lastSelectedService);
            const simpleServices = getSimpleServices().map((n) => n.name);
            savePreference(
                'customServices',
                action.payload.filter((n) => !simpleServices.includes(n.name))
            ); // Only write the custom services
            savePreference('lastSelectedService', state.lastSelectedService);
        },
        setLastSelectedService: (state, action: PayloadAction<number>) => {
            state.lastSelectedService = normalizeServiceSelection(state.availableServices.length, action.payload);
            savePreference('lastSelectedService', state.lastSelectedService);
        },
    },
});

export const { reducer, actions } = slice;
export default enableBatching(reducer);
