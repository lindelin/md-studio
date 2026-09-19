import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableBatching } from 'redux-batched-actions';
import { CustomParameters } from '../custom-parameters';
import { filterOutCorrupted, getSimpleServices, ServiceConstructionInfo } from '../services/interface-service-manager';
import { savePreference, loadPreference } from '../utils';
import { resolveAudioServiceIndex } from '../services/audio-export-service-manager';
import { isBoolean, isFiniteNumber, isServiceList } from '../preferences';
import { applicationSettings, type UserSettings } from '../application/settings-store';

export type Views = 'WELCOME' | 'MAIN' | 'FACTORY';

export interface AppState {
    mainView: Views;
    loading: boolean;
    pairingFailed: boolean;
    pairingMessage: string;
    browserSupported: boolean;
    runningChrome: boolean;
    connectingInProgress: boolean;
    colorTheme: 'dark' | 'light' | 'system';
    vintageMode: boolean;
    aboutDialogVisible: boolean;
    discProtectedDialogVisible: boolean;
    discProtectedDialogDisabled: boolean;
    settingsDialogVisible: boolean;
    changelogDialogVisible: boolean;
    notifyWhenFinished: boolean;
    hasNotificationSupport: boolean;
    fullWidthSupport: boolean;
    localBridgeEnabled: boolean;
    availableServices: ServiceConstructionInfo[];
    lastSelectedService: number;
    factoryModeRippingInMainUi: boolean;
    audioExportService: number;
    audioExportServiceConfig: CustomParameters;
    libraryService: number;
    libraryServiceConfig: CustomParameters;
    pageFullHeight: boolean;
    pageFullWidth: boolean;
    archiveDiscCreateZip: boolean;
    factoryModeUseSlowerExploit: boolean;
    factoryModeShortcuts: boolean;
    factoryModeNERAWDownload: boolean;
}

export const buildInitialState = (): AppState => {
    const sharedSettings = applicationSettings.getSnapshot().values;
    return {
        mainView: 'WELCOME',
        loading: false,
        pairingFailed: false,
        pairingMessage: ``,
        browserSupported: true,
        runningChrome: true,
        connectingInProgress: false,
        colorTheme: sharedSettings.colorTheme,
        vintageMode: sharedSettings.vintageMode,
        changelogDialogVisible: false,
        aboutDialogVisible: false,
        discProtectedDialogVisible: false,
        discProtectedDialogDisabled: sharedSettings.discProtectedDialogDisabled,
        settingsDialogVisible: false,
        notifyWhenFinished: sharedSettings.notifyWhenFinished,
        hasNotificationSupport: true,
        fullWidthSupport: sharedSettings.fullWidthSupport,
        localBridgeEnabled: loadPreference('minidiscLocalBridgeEnabled', false, isBoolean),
        availableServices: getSimpleServices().concat(
            filterOutCorrupted(loadPreference<ServiceConstructionInfo[]>('customServices', [], isServiceList))
        ),
        lastSelectedService: loadPreference('lastSelectedService', 0, isFiniteNumber),
        factoryModeRippingInMainUi: false, // As this value is heavily device-dependent and not really that stable yet
        // it should not be stored in the preferences, and should default to false.
        audioExportService: resolveAudioServiceIndex(sharedSettings.audioExportService),
        audioExportServiceConfig: sharedSettings.audioExportServiceConfig,
        libraryService: sharedSettings.libraryService,
        libraryServiceConfig: sharedSettings.libraryServiceConfig,
        pageFullHeight: sharedSettings.pageFullHeight,
        pageFullWidth: sharedSettings.pageFullWidth,
        archiveDiscCreateZip: sharedSettings.archiveDiscCreateZip,
        factoryModeUseSlowerExploit: sharedSettings.factoryModeUseSlowerExploit,
        factoryModeShortcuts: sharedSettings.factoryModeShortcuts,
        factoryModeNERAWDownload: sharedSettings.factoryModeNERAWDownload,
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
            state.loading = action.payload;
        },
        setPairingFailed: (state, action: PayloadAction<boolean>) => {
            state.pairingFailed = action.payload;
        },
        setPairingMessage: (state, action: PayloadAction<string>) => {
            state.pairingMessage = action.payload;
        },
        setBrowserSupported: (state, action: PayloadAction<boolean>) => {
            state.browserSupported = action.payload;
        },
        setRunningChrome: (state, action: PayloadAction<boolean>) => {
            state.runningChrome = action.payload;
        },
        setConnectingInProgress: (state, action: PayloadAction<boolean>) => {
            state.connectingInProgress = action.payload;
        },
        setDarkMode: (state, action: PayloadAction<'dark' | 'light' | 'system'>) => {
            state.colorTheme = action.payload;
        },
        setNotifyWhenFinished: (state, action: PayloadAction<boolean>) => {
            state.notifyWhenFinished = action.payload;
        },
        setNotificationSupport: (state, action: PayloadAction<boolean>) => {
            state.hasNotificationSupport = action.payload;
        },
        setVintageMode: (state, action: PayloadAction<boolean>) => {
            state.vintageMode = action.payload;
        },
        showAboutDialog: (state, action: PayloadAction<boolean>) => {
            state.aboutDialogVisible = action.payload;
        },
        showDiscProtectedDialog: (state, action: PayloadAction<boolean>) => {
            state.discProtectedDialogVisible = action.payload;
        },
        disableDiscProtectedDialog: (state, action: PayloadAction<boolean>) => {
            state.discProtectedDialogDisabled = action.payload;
        },
        showSettingsDialog: (state, action: PayloadAction<boolean>) => {
            state.settingsDialogVisible = action.payload;
        },
        showChangelogDialog: (state, action: PayloadAction<boolean>) => {
            state.changelogDialogVisible = action.payload;
        },
        setFullWidthSupport: (state, action: PayloadAction<boolean>) => {
            state.fullWidthSupport = action.payload;
        },
        setLocalBridgeEnabled: (state, action: PayloadAction<boolean>) => {
            state.localBridgeEnabled = action.payload;
            savePreference('minidiscLocalBridgeEnabled', action.payload);
        },
        setAvailableServices: (state, action: PayloadAction<ServiceConstructionInfo[]>) => {
            state.availableServices = action.payload;
            const simpleServices = getSimpleServices().map((n) => n.name);
            savePreference(
                'customServices',
                action.payload.filter((n) => !simpleServices.includes(n.name))
            ); // Only write the custom services
        },
        setLastSelectedService: (state, action: PayloadAction<number>) => {
            state.lastSelectedService = action.payload;
            savePreference('lastSelectedService', state.lastSelectedService);
        },
        setFactoryModeRippingInMainUi: (state, action: PayloadAction<boolean>) => {
            state.factoryModeRippingInMainUi = action.payload;
        },
        setAudioExportService: (state, action: PayloadAction<number>) => {
            state.audioExportService = action.payload;
        },
        setAudioExportServiceConfig: (state, action: PayloadAction<CustomParameters>) => {
            state.audioExportServiceConfig = action.payload;
        },
        setLibraryService: (state, action: PayloadAction<number>) => {
            state.libraryService = action.payload;
        },
        setLibraryServiceConfig: (state, action: PayloadAction<CustomParameters>) => {
            state.libraryServiceConfig = action.payload;
        },
        setPageFullHeight: (state, action: PayloadAction<boolean>) => {
            state.pageFullHeight = action.payload;
        },
        setPageFullWidth: (state, action: PayloadAction<boolean>) => {
            state.pageFullWidth = action.payload;
        },
        setArchiveDiscCreateZip: (state, action: PayloadAction<boolean>) => {
            state.archiveDiscCreateZip = action.payload;
        },
        setFactoryModeUseSlowerExploit: (state, action: PayloadAction<boolean>) => {
            state.factoryModeUseSlowerExploit = action.payload;
        },
        setFactoryModeShortcuts: (state, action: PayloadAction<boolean>) => {
            state.factoryModeShortcuts = action.payload;
        },
        setFactoryModeNERAWDownload: (state, action: PayloadAction<boolean>) => {
            state.factoryModeNERAWDownload = action.payload;
        },
        applySharedSettings: (state, action: PayloadAction<UserSettings>) => {
            Object.assign(state, action.payload);
        },
    },
});

export const { reducer, actions } = slice;
export default enableBatching(reducer);
