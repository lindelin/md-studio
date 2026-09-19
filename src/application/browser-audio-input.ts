import type { MediaRecorderService } from '../services/browserintegration/mediarecorder';
import { sleepWithProgressCallback } from '../utils';

type DurationWaiter = typeof sleepWithProgressCallback;

export interface LocalAudioInput {
    startPreview(deviceId: string): void;
    stopPreview(): void;
    captureWav(
        deviceId: string,
        durationMs: number,
        onProgress: (percentage: number) => void,
        isCancelled: () => boolean
    ): Promise<Uint8Array>;
}

export class BrowserAudioInput implements LocalAudioInput {
    constructor(
        private readonly recorder: MediaRecorderService,
        private readonly waitForDuration: DurationWaiter = sleepWithProgressCallback
    ) {}

    startPreview(deviceId: string) {
        this.recorder.stopTestInput();
        this.recorder.playTestInput(deviceId);
    }

    stopPreview() {
        this.recorder.stopTestInput();
    }

    async captureWav(
        deviceId: string,
        durationMs: number,
        onProgress: (percentage: number) => void,
        isCancelled: () => boolean
    ) {
        let recordingStarted = false;
        await this.recorder.initStream(deviceId);
        try {
            await this.recorder.startRecording();
            recordingStarted = true;
            await this.waitForDuration(durationMs, onProgress, isCancelled);
            await this.recorder.stopRecording();
            recordingStarted = false;
            return await this.recorder.exportRecorded();
        } finally {
            if (recordingStarted) {
                await this.recorder
                    .stopRecording()
                    .catch((error) => console.error('Could not stop audio-input capture.', error));
            }
            await this.recorder.closeStream();
        }
    }
}
