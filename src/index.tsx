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
import { actions as convertDialogActions } from './redux/convert-dialog-feature';

import App from './components/app';

import { MediaRecorderService } from './services/browserintegration/mediarecorder';
import { BrowserMediaSessionService } from './services/browserintegration/media-session';
import { convertAndUpload, disconnectDevice } from './redux/actions';
import { sleep } from './utils';
import { SettingsResetErrorBoundary } from './components/settings-reset-error-boundary';
import { startLocalApplicationBridge } from './application/browser-bridge';
import { readRawPreference } from './preferences';
import { BrowserImportWriter } from './application/browser-import-writer';
import { BrowserTrackExporter } from './application/browser-track-exporter';
import { BrowserTrackRecorder } from './application/browser-track-recorder';
import { getApplicationClient, isActiveUsbDevice } from './application/runtime';
import { applyDeviceSnapshot } from './redux/application-adapter';
serviceRegistry.mediaRecorderService = new MediaRecorderService();
serviceRegistry.mediaSessionService = new BrowserMediaSessionService(store);
serviceRegistry.importWriter = new BrowserImportWriter({
    startUpload: async (files, format, parameters, taskId, deviceVersion, tasks) => {
        const audioExportService = await serviceRegistry.audioEncoderManager.getService();
        await store.dispatch(
            convertAndUpload(files, format, parameters, {
                taskId,
                deviceVersion,
                taskManager: tasks,
                audioExportService,
            })
        );
    },
    showImportDialog: () => {
        store.dispatch(convertDialogActions.setVisible(true));
    },
});
serviceRegistry.trackExporter = new BrowserTrackExporter();
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
            if (isActiveUsbDevice(event.device)) {
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
            const client = getApplicationClient();
            const activeSessionId = client.getWorkspaceSnapshot().device?.sessionId;
            if (!activeSessionId) {
                setTimeout(monitor, nextPollDelay);
                return;
            }
            try {
                await sleep(250);
                if (
                    client.getWorkspaceSnapshot().device?.sessionId !== activeSessionId ||
                    !shouldMonitorBeRunning(store.getState())
                ) {
                    setTimeout(monitor, nextPollDelay);
                    return;
                }
                const result = await client.execute({ type: 'device.pollStatus' });
                if (!result.ok) throw new Error(result.error.message);
                const snapshot = result.snapshot;
                if (!snapshot || snapshot.sessionId !== activeSessionId) {
                    setTimeout(monitor, nextPollDelay);
                    return;
                }
                const currentState = store.getState();
                const statusChanged = JSON.stringify(snapshot.status) !== JSON.stringify(currentState.main.deviceStatus);
                const discPresenceChanged = Boolean(snapshot.disc) !== Boolean(currentState.main.disc);
                if (statusChanged || discPresenceChanged) applyDeviceSnapshot(store.dispatch, snapshot);
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
