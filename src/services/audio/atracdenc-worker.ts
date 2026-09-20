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

    async init(runtimeUrl: string) {
        await this.request('init', { runtimeUrl }, [], this.timeouts.init);
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
