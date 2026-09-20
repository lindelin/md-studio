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

import App from './components/app';

import { MediaRecorderService } from './services/browserintegration/mediarecorder';
import { BrowserMediaSessionService } from './services/browserintegration/media-session';
import { disconnectDevice } from './redux/actions';
import { sleep } from './utils';
import { SettingsResetErrorBoundary } from './components/settings-reset-error-boundary';
import { startLocalApplicationBridge } from './application/browser-bridge';
import { releaseActiveLocalApplicationBridge, type LocalBridgeHost } from './application/local-bridge-lifecycle';
import { BrowserImportWriter } from './application/browser-import-writer';
import { BrowserTrackExporter } from './application/browser-track-exporter';
import { BrowserTrackRecorder } from './application/browser-track-recorder';
import { getApplicationClient, isActiveUsbDevice } from './application/runtime';
import { BrowserAudioInput } from './application/browser-audio-input';
import { BrowserLocalFileGateway } from './application/browser-local-file-gateway';
import { BrowserTrackRecognizer } from './application/browser-track-recognizer';
import NotificationCompleteIconUrl from './images/record-complete-notification-icon.png';
import { ApplicationClientProvider } from './frontend/application-client-provider';
import { hasPendingWorkspaceWork } from './frontend/pending-work';
import { runtimeTranslate } from './runtime-i18n';
const mediaRecorderService = new MediaRecorderService();
const localFiles = new BrowserLocalFileGateway();
serviceRegistry.localAudioInput = new BrowserAudioInput(mediaRecorderService);
serviceRegistry.importWriter = new BrowserImportWriter({
    getApplication: () => serviceRegistry.application,
    getAudioExportService: () => serviceRegistry.audioEncoderManager.getService(),
    getUseFullWidthTitles: () => serviceRegistry.settingsStore.getSnapshot().values.fullWidthSupport,
    localFiles,
    notifyCompleted: () => {
        const state = store.getState().appState;
        if (!state.hasNotificationSupport || !serviceRegistry.settingsStore.getSnapshot().values.notifyWhenFinished) return;
        const notification = new Notification(runtimeTranslate('MiniDisc recording completed'), {
            icon: NotificationCompleteIconUrl,
        });
        notification.onclick = function () {
            window.focus();
            this.close();
        };
    },
});
serviceRegistry.trackExporter = new BrowserTrackExporter(localFiles);
serviceRegistry.trackRecorder = new BrowserTrackRecorder(mediaRecorderService);
const applicationClient = getApplicationClient();
serviceRegistry.mediaSessionService = new BrowserMediaSessionService(applicationClient);
serviceRegistry.trackRecognizer = new BrowserTrackRecognizer(applicationClient);
const localApplicationBridge = startLocalApplicationBridge(localFiles);
if (import.meta.hot) {
    import.meta.hot.dispose(() => {
        releaseActiveLocalApplicationBridge(window as unknown as LocalBridgeHost, localApplicationBridge);
    });
}

Object.defineProperty(window, 'wmdVersion', {
    value: '0.1.0',
    writable: false,
});

const originalApplicationTitle = document.title;

(function setupEventHandlers() {
    window.addEventListener('beforeunload', (ev) => {
        if (!hasPendingWorkspaceWork(applicationClient.getWorkspaceSnapshot())) {
            return;
        }
        ev.preventDefault();
        ev.returnValue = runtimeTranslate('A MiniDisc operation is still running and will be interrupted.');
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
        if (serviceRegistry.settingsStore.getSnapshot().values.notifyWhenFinished) {
            serviceRegistry.settingsStore.update({ notifyWhenFinished: false });
        }
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
                if (client.getWorkspaceSnapshot().device?.sessionId !== activeSessionId || !shouldMonitorBeRunning(store.getState())) {
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
        <ApplicationClientProvider client={applicationClient}>
            <SettingsResetErrorBoundary>
                <App />
            </SettingsResetErrorBoundary>
        </ApplicationClientProvider>
    </Provider>
);
