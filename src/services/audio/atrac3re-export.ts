import { CodecFamily } from '../interfaces/netmd';
import { DefaultFfmpegAudioExportService, ExportParams } from './audio-export';

export class Atrac3Re {
    private pendingRequest?: {
        resolve: (ev: MessageEvent) => void;
        reject: (reason: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
    };
    private progress?: (progress: number) => void;

    constructor(public worker: Worker) {
        worker.onmessage = this.handleMessage.bind(this);
        worker.onerror = (event) => {
            this.rejectPending(new Error(event.message || 'At3RE worker failed to start.'));
        };
    }

    async init() {
        await this.request({ action: 'init' }, [], 15_000);
    }

    async encode(data: ArrayBuffer, bitrate: number, lastInBatch: boolean, progress?: (pg: number) => void) {
        this.progress = progress;
        const eventData = await this.request({ action: 'encode', bitrate, data, lastInBatch }, [data], 120_000);
        return eventData.data.result as ArrayBuffer;
    }

    terminate() {
        this.rejectPending(new Error('At3RE worker was terminated.'));
        this.worker.terminate();
    }

    private request(message: object, transfer: Transferable[], timeoutMs: number) {
        if (this.pendingRequest) throw new Error('At3RE is already processing another request.');
        return new Promise<MessageEvent>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.rejectPending(new Error(`At3RE did not respond within ${timeoutMs / 1000} seconds.`));
            }, timeoutMs);
            this.pendingRequest = { resolve, reject, timeout };
            this.worker.postMessage(message, transfer);
        });
    }

    private rejectPending(reason: Error) {
        if (!this.pendingRequest) return;
        clearTimeout(this.pendingRequest.timeout);
        this.pendingRequest.reject(reason);
        this.pendingRequest = undefined;
    }

    handleMessage(ev: MessageEvent) {
        if (ev.data.pcm_cursor !== undefined) {
            this.progress?.(ev.data.pcm_cursor as number);
        } else {
            if (!this.pendingRequest) return;
            const pending = this.pendingRequest;
            clearTimeout(pending.timeout);
            this.pendingRequest = undefined;
            if (ev.data.error !== undefined) {
                pending.reject(new Error(ev.data.message || `At3RE ${ev.data.func ?? 'worker'} failed (${ev.data.error}).`));
            } else {
                pending.resolve(ev);
            }
        }
    }
}

export class Atrac3REExportService extends DefaultFfmpegAudioExportService {
    public atrac3REProcess?: Atrac3Re;
    public ready?: Promise<void>;

    async prepare(file: File): Promise<void> {
        if (!this.atrac3REProcess) {
            this.atrac3REProcess = new Atrac3Re(
                new Worker(new URL('./atrac3re-worker.ts', import.meta.url), { type: 'classic' })
            );
            this.ready = this.atrac3REProcess.init();
        }
        await super.prepare(file);
    }

    async encodeATRAC3(parameters: ExportParams, callback?: (obj: { state: number; total: number }) => void): Promise<ArrayBuffer> {
        const ffmpegCommand = await this.createFfmpegParams(parameters, 'wav');
        const outFileName = `${this.outFileNameNoExt}.wav`;
        await this.ffmpegProcess.transcode(this.inFileName, outFileName, ffmpegCommand);
        const { data } = (await this.ffmpegProcess.read(outFileName)) as { data: Uint8Array };
        const length = data.length;

        await this.ready; // Make sure Worker is ready

        const finished = !parameters.writeGapless;

        const resultData = await this.atrac3REProcess!.encode(
            data.buffer as ArrayBuffer,
            parameters.format.bitrate!,
            finished,
            callback && ((bytesEncoded) => callback({ state: bytesEncoded, total: length }))
        );

        if (finished) {
            this.atrac3REProcess?.terminate();
            this.atrac3REProcess = undefined;
        }
        return resultData as ArrayBuffer;
    }

    async encodeATRAC3Plus(parameters: ExportParams, callback: (obj: { state: number; total: number }) => void): Promise<ArrayBuffer> {
        return await this.encodeATRAC3(parameters, callback);
    }

    getSupport(codec: CodecFamily) {
        return { state: 'perfect' as const, gapless: codec === 'AT3' || codec === 'A3+' };
    }
}
