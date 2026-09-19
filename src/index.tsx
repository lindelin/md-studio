import { Buffer } from 'buffer';
(globalThis as any).Buffer = Buffer;

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import serviceRegistry from './services/registry';

import { store } from './redux/store';
import { actions as appActions } from './redux/app-feature';
import { actions as mainActions } from './redux/main-feature';

import App from './components/app';

import { MediaRecorderService } from './services/browserintegration/mediarecorder';
import { BrowserMediaSessionService } from './services/browserintegration/media-session';
import { listContent } from './redux/actions';
import { sleep } from './utils';
import { SettingsResetErrorBoundary } from './components/settings-reset-error-boundary';
import { startLocalApplicationBridge } from './application/browser-bridge';
import { readRawPreference } from './preferences';
import { BrowserImportWriter } from './application/browser-import-writer';
serviceRegistry.mediaRecorderService = new MediaRecorderService();
serviceRegistry.mediaSessionService = new BrowserMediaSessionService(store);
serviceRegistry.importWriter = new BrowserImportWriter(store.dispatch);
startLocalApplicationBridge();

Object.defineProperty(window, 'wmdVersion', {
    value: '0.1.0',
    writable: false,
});

const originalApplicationTitle = document.title;

if (readRawPreference('version') !== (window as any).wmdVersion) {
    store.dispatch(appActions.showChangelogDialog(true));
}

(function setupEventHandlers() {
    window.addEventListener('beforeunload', (ev) => {
        const state = store.getState();
        const isUploading = state.uploadDialog.visible;
        const isDownloading = state.factoryProgressDialog.visible || state.recordDialog.visible;
        if (!(isUploading || isDownloading)) {
            return;
        }
        ev.preventDefault();
        ev.returnValue = `Warning! Recording will be interrupted`;
    });

    if (navigator && navigator.usb) {
        navigator.usb.ondisconnect = function (event) {
            if (serviceRegistry.netmdService?.isDeviceConnected(event.device)) {
                store.dispatch(appActions.setMainView('WELCOME'));
                document.title = originalApplicationTitle;
            } else {
                console.log("The device disconnected isn't connected to this webapp");
            }
        };
    } else {
        store.dispatch(appActions.setBrowserSupported(false));
        store.dispatch(appActions.setRunningChrome(false));
    }

    Object.defineProperty(window, 'reload', {
        value: window.native?.reload ?? window.location.reload.bind(window.location),
        writable: false,
        configurable: false,
    });

    if (!('Notification' in window) || Notification.permission === 'denied') {
        store.dispatch(appActions.setNotificationSupport(false));
        store.dispatch(appActions.setNotifyWhenFinished(false));
    }
})();

(function statusMonitorManager() {
    // Polls the device for its state while playing tracks
    let consecutiveFailures = 0;

    function shouldMonitorBeRunning(state: ReturnType<typeof store.getState>): boolean {
        return (
            // App ready
            state.appState.mainView === 'MAIN' &&
            state.appState.loading === false &&
            // Disc playing
            // (state.main.deviceStatus?.state === 'playing' || state.main.disc === null) &&
            // No operational dialogs running
            state.convertDialog.visible === false &&
            state.uploadDialog.visible === false &&
            state.recordDialog.visible === false &&
            state.panicDialog.visible === false &&
            state.errorDialog.visible === false &&
            state.dumpDialog.visible === false &&
            state.songRecognitionProgressDialog.visible === false &&
            state.factoryProgressDialog.visible === false
        );
    }

    async function monitor() {
        let nextPollDelay = 500;
        const state = store.getState();
        if (shouldMonitorBeRunning(state)) {
            const service = serviceRegistry.netmdService;
            if (!service) {
                setTimeout(monitor, nextPollDelay);
                return;
            }
            try {
                await sleep(250);
                if (serviceRegistry.netmdService !== service || !shouldMonitorBeRunning(store.getState())) {
                    setTimeout(monitor, nextPollDelay);
                    return;
                }
                const deviceStatus = await service.getDeviceStatus();
                if (serviceRegistry.netmdService !== service) {
                    setTimeout(monitor, nextPollDelay);
                    return;
                }
                const currentState = store.getState();
                if (!deviceStatus.discPresent && currentState.main.disc !== null) store.dispatch(mainActions.setDisc(null));
                if (deviceStatus.discPresent && currentState.main.disc === null) await listContent(true)(store.dispatch);
                if (JSON.stringify(deviceStatus) !== JSON.stringify(currentState.main.deviceStatus)) {
                    store.dispatch(mainActions.setDeviceStatus(deviceStatus));
                }
                const currentFlushability = store.getState().main.flushable;
                const serviceFlushability = deviceStatus.canBeFlushed;
                if (typeof serviceFlushability === 'boolean' && currentFlushability !== serviceFlushability) {
                    store.dispatch(mainActions.setFlushable(serviceFlushability));
                }
                // Since this function doesn't execute if there's any operational dialog on screen
                // (including the track upload dialog), this won't conflict with anything.
                if (document.title !== originalApplicationTitle) {
                    document.title = originalApplicationTitle;
                }
                await sleep(250);
                consecutiveFailures = 0;
            } catch (e) {
                console.error(e);
                consecutiveFailures += 1;
                nextPollDelay = Math.min(5000, 500 * 2 ** Math.min(consecutiveFailures, 4));
            }
        } else {
            consecutiveFailures = 0;
        }
        setTimeout(monitor, nextPollDelay);
    }
    monitor();
})();

const root = createRoot(document.getElementById('root')!);
root.render(
    <Provider store={store}>
        <SettingsResetErrorBoundary>
            <App />
        </SettingsResetErrorBoundary>
    </Provider>
);
