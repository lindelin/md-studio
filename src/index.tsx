import { Buffer } from 'buffer';
import process from 'process';
(globalThis as any).Buffer = Buffer;
(globalThis as any).process = process;

import React from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';
import serviceRegistry from './services/registry';

import { store } from './redux/store';
import { actions as appActions } from './redux/app-feature';
import { actions as mainActions } from './redux/main-feature';
import { actions as convertDialogActions } from './redux/convert-dialog-feature';

import App from './components/app';

import { MediaRecorderService } from './services/browserintegration/mediarecorder';
import { BrowserMediaSessionService } from './services/browserintegration/media-session';
import { convertAndUpload, disconnectDevice, listContent } from './redux/actions';
import { sleep } from './utils';
import { SettingsResetErrorBoundary } from './components/settings-reset-error-boundary';
import { startLocalApplicationBridge } from './application/browser-bridge';
import { readRawPreference } from './preferences';
import { BrowserImportWriter } from './application/browser-import-writer';
import { BrowserTrackExporter } from './application/browser-track-exporter';
import { BrowserTrackRecorder } from './application/browser-track-recorder';
import { getApplicationClient } from './application/runtime';
serviceRegistry.mediaRecorderService = new MediaRecorderService();
serviceRegistry.mediaSessionService = new BrowserMediaSessionService(store);
serviceRegistry.importWriter = new BrowserImportWriter({
    startUpload: async (files, format, parameters, taskId) => {
        await store.dispatch(convertAndUpload(files, format, parameters, { taskId }));
    },
    showImportDialog: () => {
        store.dispatch(convertDialogActions.setVisible(true));
    },
});
serviceRegistry.trackExporter = new BrowserTrackExporter(store);
serviceRegistry.trackRecorder = new BrowserTrackRecorder();
getApplicationClient();
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
        const hasActiveTask = serviceRegistry.taskManager
            .list()
            .some((task) => task.status === 'queued' || task.status === 'running');
        const hasLegacyOperation = state.uploadDialog.visible || state.factoryProgressDialog.visible || state.recordDialog.visible;
        if (!(hasActiveTask || hasLegacyOperation)) {
            return;
        }
        ev.preventDefault();
        ev.returnValue = `A MiniDisc operation is still running and will be interrupted.`;
    });

    if (navigator && navigator.usb) {
        navigator.usb.ondisconnect = function (event) {
            if (serviceRegistry.netmdService?.isDeviceConnected(event.device)) {
                store.dispatch(disconnectDevice(false));
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
        return state.appState.mainView === 'MAIN' && state.appState.loading === false;
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
                const deviceStatus = await serviceRegistry.operationCoordinator.run(async () => {
                    if (serviceRegistry.netmdService !== service) throw new Error('The active device session changed.');
                    return service.getDeviceStatus();
                });
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
