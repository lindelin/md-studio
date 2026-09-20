import { Buffer } from 'buffer';
import process from 'process';
(globalThis as any).Buffer = Buffer;
(globalThis as any).process = process;

import React from 'react';
import { createRoot } from 'react-dom/client';
import serviceRegistry from './services/registry';

import App from './components/app';

import { MediaRecorderService } from './services/browserintegration/mediarecorder';
import { BrowserMediaSessionService } from './services/browserintegration/media-session';
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
import NotificationCompleteIconUrl from './images/record-complete-notification-icon.png';
import { ApplicationClientProvider } from './frontend/application-client-provider';
import { hasPendingWorkspaceWork } from './frontend/pending-work';
import { runtimeTranslate } from './runtime-i18n';
import { getBrowserNotificationPermission, tryCreateBrowserNotification } from './frontend/browser-notifications';
const mediaRecorderService = new MediaRecorderService();
const localFiles = new BrowserLocalFileGateway();
serviceRegistry.localAudioInput = new BrowserAudioInput(mediaRecorderService);
serviceRegistry.importWriter = new BrowserImportWriter({
    getApplication: () => serviceRegistry.application,
    getAudioExportService: () => serviceRegistry.audioEncoderManager.getService(),
    getUseFullWidthTitles: () => serviceRegistry.settingsStore.getSnapshot().values.fullWidthSupport,
    localFiles,
    notifyCompleted: () => {
        if (!serviceRegistry.settingsStore.getSnapshot().values.notifyWhenFinished) return;
        const notification = tryCreateBrowserNotification(runtimeTranslate('MiniDisc recording completed'), {
            icon: NotificationCompleteIconUrl,
        });
        if (!notification) return;
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
                void applicationClient.disconnectLocalDevice(false).catch((error) => {
                    console.error('Failed to finalize the disconnected USB device', error);
                });
                document.title = originalApplicationTitle;
            } else {
                console.log("The device disconnected isn't connected to this webapp");
            }
        };
    }

    Object.defineProperty(window, 'reload', {
        value: window.native?.reload ?? window.location.reload.bind(window.location),
        writable: false,
        configurable: false,
    });

    if (getBrowserNotificationPermission() !== 'granted') {
        if (serviceRegistry.settingsStore.getSnapshot().values.notifyWhenFinished) {
            try {
                serviceRegistry.settingsStore.update({ notifyWhenFinished: false });
            } catch (error) {
                console.error('Could not disable unavailable completion notifications', error);
            }
        }
    }
})();

(function statusMonitorManager() {
    // Polls the device for its state while playing tracks
    let consecutiveFailures = 0;

    function shouldMonitorBeRunning(): boolean {
        return applicationClient.getWorkspaceSnapshot().connection.phase === 'connected';
    }

    async function monitor() {
        let nextPollDelay = 500;
        if (shouldMonitorBeRunning()) {
            const client = getApplicationClient();
            const activeSessionId = client.getWorkspaceSnapshot().device?.sessionId;
            if (!activeSessionId) {
                setTimeout(monitor, nextPollDelay);
                return;
            }
            try {
                await sleep(250);
                if (client.getWorkspaceSnapshot().device?.sessionId !== activeSessionId || !shouldMonitorBeRunning()) {
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
    <ApplicationClientProvider client={applicationClient}>
        <SettingsResetErrorBoundary>
            <App />
        </SettingsResetErrorBoundary>
    </ApplicationClientProvider>
);
