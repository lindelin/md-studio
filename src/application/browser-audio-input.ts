import type { MediaRecorderService } from '../services/browserintegration/mediarecorder';
import { sleepWithProgressCallback } from '../utils';

type DurationWaiter = typeof sleepWithProgressCallback;

export interface LocalAudioInput {
    startPreview(deviceId: string): Promise<void>;
    stopPreview(): Promise<void>;
    captureWav(
        deviceId: string,
        durationMs: number,
        onProgress: (percentage: number) => void,
        isCancelled: () => boolean
    ): Promise<Uint8Array>;
}

export class BrowserAudioInput implements LocalAudioInput {
    private previewRequest = 0;
    private previewOperation: Promise<void> = Promise.resolve();

    constructor(
        private readonly recorder: MediaRecorderService,
        private readonly waitForDuration: DurationWaiter = sleepWithProgressCallback
    ) {}

    startPreview(deviceId: string) {
        const request = ++this.previewRequest;
        return this.queuePreview(async () => {
            await this.recorder.stopTestInput();
            if (request !== this.previewRequest) return;
            await this.recorder.playTestInput(deviceId);
            if (request !== this.previewRequest) await this.recorder.stopTestInput();
        });
    }

    stopPreview() {
        this.previewRequest += 1;
        return this.queuePreview(() => this.recorder.stopTestInput());
    }

    private queuePreview(operation: () => Promise<void>) {
        const next = this.previewOperation.catch(() => undefined).then(operation);
        this.previewOperation = next;
        return next;
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
