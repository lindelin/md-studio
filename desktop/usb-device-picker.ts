import type { BrowserWindow, Session } from 'electron';
import { isSupportedMD } from './usb-policy';

// Owns the pending USB choice; the main process only validates IPC callers.
export function installUsbDevicePicker(usbSession: Session, mainWindow: BrowserWindow, uiOrigin: string) {
    let usbChoice: { devices: Electron.USBDevice[]; finish: (id?: string) => void } | undefined;
    function publishUsbChoices() {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        mainWindow.webContents.send(
            'desktop:usb-choices',
            usbChoice?.devices.map((device) => ({
                id: device.deviceId,
                name: device.productName || 'MD',
                usbId: `${device.vendorId.toString(16).padStart(4, '0')}:${device.productId.toString(16).padStart(4, '0')}`,
                serial: device.serialNumber || '',
            })) ?? null
        );
    }

    usbSession.on('select-usb-device', (event, details, callback) => {
        event.preventDefault();
        if (!details.frame || new URL(details.frame.url).origin !== uiOrigin) {
            callback();
            return;
        }
        usbChoice?.finish();
        const devices = details.deviceList.filter(isSupportedMD);
        if (!devices.length) {
            callback();
            return;
        }
        if (devices.length === 1) {
            callback(devices[0].deviceId);
            return;
        }
        const timer = setTimeout(() => choice.finish(), 120000);
        const choice = {
            devices,
            finish: (id?: string) => {
                if (usbChoice !== choice) return;
                clearTimeout(timer);
                usbChoice = undefined;
                publishUsbChoices();
                callback(id);
            },
        };
        usbChoice = choice;
        mainWindow.show();
        publishUsbChoices();
    });
    usbSession.on('usb-device-added', (_event, device, contents) => {
        if (!usbChoice || contents !== mainWindow.webContents || !isSupportedMD(device)) return;
        if (!usbChoice.devices.some((item) => item.deviceId === device.deviceId)) usbChoice.devices.push(device);
        publishUsbChoices();
    });
    usbSession.on('usb-device-removed', (_event, device, contents) => {
        if (!usbChoice || contents !== mainWindow.webContents) return;
        usbChoice.devices = usbChoice.devices.filter((item) => item.deviceId !== device.deviceId);
        publishUsbChoices();
    });

    mainWindow.webContents.on('did-start-loading', () => usbChoice?.finish());
    mainWindow.on('closed', () => usbChoice?.finish());
    return {
        select(id: string | null) {
            if (!usbChoice) throw new Error('Device selection is no longer active');
            if (id !== null && (typeof id !== 'string' || !usbChoice.devices.some((device) => device.deviceId === id)))
                throw new Error('Device is no longer available');
            usbChoice.finish(id ?? undefined);
        },
    };
}
