export interface BrowserAudioDevice {
    deviceId: string;
    label: string;
}

type BrowserMediaDevices = Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>;

export async function requestBrowserAudioDevices(
    mediaDevices: BrowserMediaDevices = navigator.mediaDevices
): Promise<BrowserAudioDevice[]> {
    let permissionStream: MediaStream | null = null;
    try {
        permissionStream = await mediaDevices.getUserMedia({ audio: true });
        const devices = await mediaDevices.enumerateDevices();
        let inputNumber = 0;
        return devices
            .filter((device) => device.kind === 'audioinput')
            .map((device) => {
                inputNumber += 1;
                return {
                    deviceId: device.deviceId,
                    label: device.label.trim() || `Audio input ${inputNumber}`,
                };
            });
    } finally {
        permissionStream?.getTracks().forEach((track) => track.stop());
    }
}
