/* eslint no-restricted-globals: 0 */
function getPublicPathFor(script: string) {
    return `${import.meta.env.BASE_URL}${script}`;
}
export class AtracdencProcess {
    private pendingRequest?: {
        action: 'init' | 'encode';
        resolve: (ev: MessageEvent) => void;
        reject: (reason: Error) => void;
        timeout: ReturnType<typeof setTimeout>;
    };

    constructor(
        public worker: Worker,
        private readonly timeouts = { init: 15_000, encode: 120_000 }
    ) {
        worker.onmessage = this.handleMessage.bind(this);
        worker.onerror = (event) => this.rejectPending(new Error(event.message || 'Atracdenc worker failed.'));
        worker.onmessageerror = () => this.rejectPending(new Error('Atracdenc returned an unreadable response.'));
    }

    async init() {
        await this.request('init', {}, [], this.timeouts.init);
    }

    async encode(data: ArrayBuffer, bitrate: string) {
        const eventData = await this.request('encode', { bitrate, data }, [data], this.timeouts.encode);
        return eventData.data.result as ArrayBuffer;
    }

    terminate() {
        this.rejectPending(new Error('Atracdenc worker was terminated.'));
        this.worker.terminate();
    }

    handleMessage(ev: MessageEvent) {
        if (!this.pendingRequest) return;
        const pending = this.pendingRequest;
        if (ev.data?.action !== pending.action) {
            this.rejectPending(new Error(`Atracdenc returned an unexpected ${String(ev.data?.action)} response.`));
            return;
        }
        clearTimeout(pending.timeout);
        this.pendingRequest = undefined;
        if (ev.data?.error) {
            pending.reject(new Error(ev.data.message || `Atracdenc ${pending.action} failed.`));
        } else {
            pending.resolve(ev);
        }
    }

    private request(
        action: 'init' | 'encode',
        payload: Record<string, unknown>,
        transfer: Transferable[],
        timeoutMs: number
    ) {
        if (this.pendingRequest) throw new Error('Atracdenc is already processing another request.');
        return new Promise<MessageEvent>((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.rejectPending(new Error(`Atracdenc ${action} did not respond within ${timeoutMs / 1000} seconds.`));
            }, timeoutMs);
            this.pendingRequest = { action, resolve, reject, timeout };
            try {
                this.worker.postMessage({ action, ...payload }, transfer);
            } catch (error) {
                this.rejectPending(error instanceof Error ? error : new Error(String(error)));
            }
        });
    }

    private rejectPending(reason: Error) {
        if (!this.pendingRequest) return;
        clearTimeout(this.pendingRequest.timeout);
        this.pendingRequest.reject(reason);
        this.pendingRequest = undefined;
    }
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    // Worker
    let Module: any;
    onmessage = async (ev: MessageEvent) => {
        const { action, ...others } = ev.data;
        try {
            if (action === 'init') {
                self.importScripts(getPublicPathFor(`atracdenc.js`));
                const moduleFactory = (self as any).Module;
                if (typeof moduleFactory !== 'function') throw new Error('Atracdenc runtime did not expose a module factory.');
                Module = await moduleFactory();
                Module.setLogger && Module.setLogger((msg: string, stream: string) => console.log(`${stream}: ${msg}`));
                self.postMessage({ action: 'init' });
            } else if (action === 'encode') {
                if (!Module) throw new Error('Atracdenc is not initialized.');
                const { bitrate, data } = others;
                const inWavFile = `inWavFile.wav`;
                const outAt3File = `outAt3File.aea`;
                const dataArray = new Uint8Array(data);
                Module.FS.writeFile(`${inWavFile}`, dataArray);
                Module.callMain([`-e`, `atrac3`, `-i`, inWavFile, `-o`, outAt3File, `--bitrate`, bitrate]);

                // Read file and trim header (96 bytes)
                const fileStat = Module.FS.stat(outAt3File);
                const size = fileStat.size;
                if (size < 96) throw new Error('Atracdenc produced an invalid output file.');
                const tmp = new Uint8Array(size - 96);
                const outAt3FileStream = Module.FS.open(outAt3File, 'r');
                try {
                    Module.FS.read(outAt3FileStream, tmp, 0, tmp.length, 96);
                } finally {
                    Module.FS.close(outAt3FileStream);
                }

                const result = tmp.buffer;

                self.postMessage(
                    {
                        action: 'encode',
                        result,
                    },
                    [result]
                );
            } else {
                throw new Error(`Unknown Atracdenc worker action: ${String(action)}.`);
            }
        } catch (error) {
            self.postMessage({
                action,
                error: 'ENCODER_FAILURE',
                message: error instanceof Error ? error.message : String(error),
            });
        }
    };
} else {
    // Main
}
