import { configureStore, Middleware, combineReducers } from '@reduxjs/toolkit';
import contextMenu from './context-menu-feature';
import uploadDialog from './upload-dialog-feature';
import renameDialog from './rename-dialog-feature';
import otherDeviceDialog from './other-device-feature';
import errorDialog from './error-dialog-feature';
import panicDialog, { actions as panicDialogActions } from './panic-dialog-feature';
import convertDialog from './convert-dialog-feature';
import dumpDialog from './dump-dialog-feature';
import recordDialog from './record-dialog-feature';
import songRecognitionDialog from './song-recognition-dialog-feature';
import songRecognitionProgressDialog from './song-recognition-progress-dialog-feature';
import appState, { actions as appActions, buildInitialState as buildInitialAppState } from './app-feature';
import localLibrary from './local-library-feature';
import factory from './factory/factory-feature';

import factoryFragmentModeEditDialog from './factory/factory-fragment-mode-edit-dialog-feature';
import factoryProgressDialog from './factory/factory-progress-dialog-feature';
import factoryNoticeDialog from './factory/factory-notice-dialog-feature';
import factoryEditOtherValuesDialog from './factory/factory-edit-other-values-dialog-feature';
import factoryBadSectorDialog from './factory/factory-bad-sector-dialog-feature';

import main from './main-feature';
import { batchActions, batchDispatchMiddleware } from 'redux-batched-actions';
import { clearApplicationRuntime } from '../application/runtime';
import { applicationSettings, type UserSettings } from '../application/settings-store';

function sharedSettingsFromState(state: { appState: UserSettings }): UserSettings {
    const source = state.appState;
    return {
        colorTheme: source.colorTheme,
        vintageMode: source.vintageMode,
        discProtectedDialogDisabled: source.discProtectedDialogDisabled,
        notifyWhenFinished: source.notifyWhenFinished,
        fullWidthSupport: source.fullWidthSupport,
        pageFullHeight: source.pageFullHeight,
        pageFullWidth: source.pageFullWidth,
        archiveDiscCreateZip: source.archiveDiscCreateZip,
        factoryModeUseSlowerExploit: source.factoryModeUseSlowerExploit,
        factoryModeShortcuts: source.factoryModeShortcuts,
        factoryModeNERAWDownload: source.factoryModeNERAWDownload,
        audioExportService: source.audioExportService,
        audioExportServiceConfig: source.audioExportServiceConfig,
        libraryService: source.libraryService,
        libraryServiceConfig: source.libraryServiceConfig,
    };
}

const errorCatcher: Middleware = () => (next) => async (action) => {
    try {
        return await next(action);
    } catch (e) {
        console.error(e);
        await next(
            batchActions([panicDialogActions.setErrorProvided((e as any).stack ?? '<Not Provided>'), panicDialogActions.setVisible(true)])
        );
        throw e;
    }
};

const reducer = combineReducers({
    contextMenu,
    localLibrary,
    renameDialog,
    otherDeviceDialog,
    uploadDialog,
    errorDialog,
    panicDialog,
    convertDialog,
    dumpDialog,
    recordDialog,
    songRecognitionDialog,
    songRecognitionProgressDialog,
    factory,
    factoryFragmentModeEditDialog,
    factoryProgressDialog,
    factoryNoticeDialog,
    factoryEditOtherValuesDialog,
    factoryBadSectorDialog,
    appState,
    main,
});

const resetStateAction = appActions.setMainView.toString();
const resetStatePayload = 'WELCOME';
const applicationLifecycle: Middleware = () => (next) => (action) => {
    if (
        (action as { type?: string; payload?: unknown }).type === resetStateAction &&
        (action as { payload?: unknown }).payload === resetStatePayload
    ) {
        clearApplicationRuntime();
    }
    return next(action);
};
const sharedSettingsPersistence: Middleware = (storeApi) => (next) => (action) => {
    const result = next(action);
    if ((action as { type?: string }).type === appActions.applySharedSettings.toString()) return result;
    const values = sharedSettingsFromState(storeApi.getState() as { appState: UserSettings });
    const current = applicationSettings.getSnapshot().values;
    const changes = Object.fromEntries(
        (Object.keys(values) as (keyof UserSettings)[])
            .filter((key) =>
                typeof values[key] === 'object'
                    ? JSON.stringify(values[key]) !== JSON.stringify(current[key])
                    : values[key] !== current[key]
            )
            .map((key) => [key, values[key]])
    );
    if (Object.keys(changes).length > 0) applicationSettings.update(changes);
    return result;
};
const resetStateReducer: typeof reducer = function (...args) {
    const action = args[1];
    if (action.type === resetStateAction && action.payload === resetStatePayload) {
        // RunningChrome must reflect the actual browser type
        const initialAppState = buildInitialAppState();
        initialAppState.runningChrome = !!(navigator && navigator.usb);
        return {
            ...initialState,
            appState: initialAppState,
        };
    }
    return reducer(...args);
};

export const store = configureStore({
    reducer: resetStateReducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().prepend(errorCatcher, applicationLifecycle, sharedSettingsPersistence).concat(batchDispatchMiddleware),
});

const initialState = Object.freeze(store.getState());
applicationSettings.subscribe((snapshot) => store.dispatch(appActions.applySharedSettings(snapshot.values)));

export type AppStore = typeof store;
export type AppSubscribe = typeof store.subscribe;
export type AppGetState = typeof store.getState;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
