import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { enableBatching } from 'redux-batched-actions';
import { CustomParameters } from '../custom-parameters';
import { filterOutCorrupted, getSimpleServices, ServiceConstructionInfo } from '../services/interface-service-manager';
import { savePreference, loadPreference } from '../utils';
import { resolveAudioServiceIndex } from '../services/audio-export-service-manager';
import { isBoolean, isFiniteNumber, isOneOf, isPrimitiveRecord, isServiceList } from '../preferences';

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
    return {
        mainView: 'WELCOME',
        loading: false,
        pairingFailed: false,
        pairingMessage: ``,
        browserSupported: true,
        runningChrome: true,
        connectingInProgress: false,
        colorTheme: loadPreference('colorTheme', 'system', isOneOf(['dark', 'light', 'system'] as const)),
        vintageMode: loadPreference('vintageMode', false, isBoolean),
        changelogDialogVisible: false,
        aboutDialogVisible: false,
        discProtectedDialogVisible: false,
        discProtectedDialogDisabled: loadPreference('discProtectedDialogDisabled', false, isBoolean),
        settingsDialogVisible: false,
        notifyWhenFinished: loadPreference('notifyWhenFinished', false, isBoolean),
        hasNotificationSupport: true,
        fullWidthSupport: loadPreference('fullWidthSupport', false, isBoolean),
        localBridgeEnabled: loadPreference('minidiscLocalBridgeEnabled', false, isBoolean),
        availableServices: getSimpleServices().concat(
            filterOutCorrupted(loadPreference<ServiceConstructionInfo[]>('customServices', [], isServiceList))
        ),
        lastSelectedService: loadPreference('lastSelectedService', 0, isFiniteNumber),
        factoryModeRippingInMainUi: false, // As this value is heavily device-dependent and not really that stable yet
        // it should not be stored in the preferences, and should default to false.
        audioExportService: resolveAudioServiceIndex(loadPreference('audioExportService', 0, isFiniteNumber)),
        audioExportServiceConfig: loadPreference('audioExportServiceConfig', {}, isPrimitiveRecord),
        libraryService: loadPreference('libraryService', -1, isFiniteNumber),
        libraryServiceConfig: loadPreference('libraryServiceConfig', {}, isPrimitiveRecord),
        pageFullHeight: loadPreference('pageFullHeight', false, isBoolean),
        pageFullWidth: loadPreference('pageFullWidth', false, isBoolean),
        archiveDiscCreateZip: loadPreference('archiveDiscCreateZip', false, isBoolean),
        factoryModeUseSlowerExploit: loadPreference('factoryModeUseSlowerExploit', false, isBoolean),
        factoryModeShortcuts: loadPreference('factoryModeShortcuts', false, isBoolean),
        factoryModeNERAWDownload: loadPreference('factoryModeNERAWDownload', false, isBoolean),
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
            savePreference('colorTheme', state.colorTheme);
        },
        setNotifyWhenFinished: (state, action: PayloadAction<boolean>) => {
            state.notifyWhenFinished = action.payload;
            savePreference('notifyWhenFinished', action.payload);
        },
        setNotificationSupport: (state, action: PayloadAction<boolean>) => {
            state.hasNotificationSupport = action.payload;
        },
        setVintageMode: (state, action: PayloadAction<boolean>) => {
            state.vintageMode = action.payload;
            savePreference('vintageMode', action.payload);
        },
        showAboutDialog: (state, action: PayloadAction<boolean>) => {
            state.aboutDialogVisible = action.payload;
        },
        showDiscProtectedDialog: (state, action: PayloadAction<boolean>) => {
            state.discProtectedDialogVisible = action.payload;
        },
        disableDiscProtectedDialog: (state, action: PayloadAction<boolean>) => {
            state.discProtectedDialogDisabled = action.payload;
            savePreference('discProtectedDialogDisabled', action.payload);
        },
        showSettingsDialog: (state, action: PayloadAction<boolean>) => {
            state.settingsDialogVisible = action.payload;
        },
        showChangelogDialog: (state, action: PayloadAction<boolean>) => {
            state.changelogDialogVisible = action.payload;
        },
        setFullWidthSupport: (state, action: PayloadAction<boolean>) => {
            state.fullWidthSupport = action.payload;
            savePreference('fullWidthSupport', state.fullWidthSupport);
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
            savePreference('audioExportService', state.audioExportService);
        },
        setAudioExportServiceConfig: (state, action: PayloadAction<CustomParameters>) => {
            state.audioExportServiceConfig = action.payload;
            savePreference('audioExportServiceConfig', state.audioExportServiceConfig);
        },
        setLibraryService: (state, action: PayloadAction<number>) => {
            state.libraryService = action.payload;
            savePreference('libraryService', state.libraryService);
        },
        setLibraryServiceConfig: (state, action: PayloadAction<CustomParameters>) => {
            state.libraryServiceConfig = action.payload;
            savePreference('libraryServiceConfig', state.libraryServiceConfig);
        },
        setPageFullHeight: (state, action: PayloadAction<boolean>) => {
            state.pageFullHeight = action.payload;
            savePreference('pageFullHeight', action.payload);
        },
        setPageFullWidth: (state, action: PayloadAction<boolean>) => {
            state.pageFullWidth = action.payload;
            savePreference('pageFullWidth', action.payload);
        },
        setArchiveDiscCreateZip: (state, action: PayloadAction<boolean>) => {
            state.archiveDiscCreateZip = action.payload;
            savePreference('archiveDiscCreateZip', action.payload);
        },
        setFactoryModeUseSlowerExploit: (state, action: PayloadAction<boolean>) => {
            state.factoryModeUseSlowerExploit = action.payload;
            savePreference('factoryModeUseSlowerExploit', action.payload);
        },
        setFactoryModeShortcuts: (state, action: PayloadAction<boolean>) => {
            state.factoryModeShortcuts = action.payload;
            savePreference('factoryModeShortcuts', action.payload);
        },
        setFactoryModeNERAWDownload: (state, action: PayloadAction<boolean>) => {
            state.factoryModeNERAWDownload = action.payload;
            savePreference('factoryModeNERAWDownload', action.payload);
        },
    },
});

export const { reducer, actions } = slice;
export default enableBatching(reducer);
