import { configureStore, Middleware, combineReducers } from '@reduxjs/toolkit';
import otherDeviceDialog from './other-device-feature';
import errorDialog from './error-dialog-feature';
import panicDialog, { actions as panicDialogActions } from './panic-dialog-feature';
import appState, { actions as appActions, buildInitialState as buildInitialAppState } from './app-feature';
import factory from './factory/factory-feature';

import factoryNoticeDialog from './factory/factory-notice-dialog-feature';
import factoryBadSectorDialog from './factory/factory-bad-sector-dialog-feature';

import { batchActions, batchDispatchMiddleware } from 'redux-batched-actions';

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
    otherDeviceDialog,
    errorDialog,
    panicDialog,
    factory,
    factoryNoticeDialog,
    factoryBadSectorDialog,
    appState,
});

const resetStateAction = appActions.setMainView.toString();
const resetStatePayload = 'WELCOME';
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
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(errorCatcher).concat(batchDispatchMiddleware),
});

const initialState = Object.freeze(store.getState());

export type AppStore = typeof store;
export type AppSubscribe = typeof store.subscribe;
export type AppGetState = typeof store.getState;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
