type EncryptWorkerResponse =
    | { type: 'ready' }
    | { type: 'done' }
    | { type: 'error'; message: string }
    | { type: 'chunk'; key: Uint8Array<ArrayBuffer>; iv: Uint8Array<ArrayBuffer>; data: Uint8Array<ArrayBuffer> };

export interface EncryptWorkerTimeouts {
    init: number;
    chunk: number;
}

const DEFAULT_TIMEOUTS: EncryptWorkerTimeouts = { init: 15_000, chunk: 60_000 };

export function makeNetMDEncryptPacketIterator(
    worker: Worker,
    progressCallback?: (progress: { totalBytes: number; encryptedBytes: number }) => void,
    timeouts: EncryptWorkerTimeouts = DEFAULT_TIMEOUTS,
    signal?: AbortSignal
) {
    return async function* ({
        data,
        frameSize,
        kek,
        chunkSize,
    }: {
        data: ArrayBuffer;
        frameSize: number;
        kek: Uint8Array;
        chunkSize: number;
    }): AsyncIterableIterator<{
        key: Uint8Array<ArrayBuffer>;
        iv: Uint8Array<ArrayBuffer>;
        data: Uint8Array<ArrayBuffer>;
    }> {
        const totalBytes = data.byteLength;
        let encryptedBytes = 0;
        try {
            throwIfAborted(signal);
            const ready = await requestWorker(
                worker,
                { action: 'init', data, frameSize, kek, chunkSize },
                [data],
                timeouts.init,
                'initialization',
                signal
            );
            if (ready.type !== 'ready') throw new Error('The NetMD encryption worker returned an unexpected initialization response.');

            while (true) {
                throwIfAborted(signal);
                const response = await requestWorker(worker, { action: 'getChunk' }, [], timeouts.chunk, 'chunk', signal);
                if (response.type === 'done') return;
                if (response.type !== 'chunk') throw new Error('The NetMD encryption worker returned an unexpected chunk response.');
                assertByteArray(response.key, 'key');
                assertByteArray(response.iv, 'IV');
                assertByteArray(response.data, 'audio chunk');
                encryptedBytes += response.data.byteLength;
                progressCallback?.({ totalBytes, encryptedBytes });
                yield { key: response.key, iv: response.iv, data: response.data };
            }
        } finally {
            worker.terminate();
        }
    };
}

function requestWorker(
    worker: Worker,
    message: object,
    transfer: Transferable[],
    timeoutMs: number,
    phase: string,
    signal?: AbortSignal
): Promise<EncryptWorkerResponse> {
    return new Promise((resolve, reject) => {
        let settled = false;
        let abort: () => void = () => undefined;
        const finish = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            signal?.removeEventListener('abort', abort);
            worker.onmessage = null;
            worker.onerror = null;
            worker.onmessageerror = null;
            callback();
        };
        const timeout = setTimeout(
            () => finish(() => reject(new Error(`NetMD encryption worker ${phase} timed out after ${timeoutMs / 1000} seconds.`))),
            timeoutMs
        );
        abort = () => finish(() => reject(abortError(signal)));
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) {
            abort();
            return;
        }
        worker.onmessage = (event) =>
            finish(() => {
                const response = event.data as EncryptWorkerResponse;
                if (response?.type === 'error') reject(new Error(response.message || `NetMD encryption worker ${phase} failed.`));
                else resolve(response);
            });
        worker.onerror = (event) =>
            finish(() => reject(new Error(event.message || `NetMD encryption worker ${phase} failed to start.`)));
        worker.onmessageerror = () =>
            finish(() => reject(new Error(`NetMD encryption worker ${phase} returned an unreadable response.`)));
        try {
            worker.postMessage(message, transfer);
        } catch (error) {
            finish(() => reject(error instanceof Error ? error : new Error(String(error))));
        }
    });
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw abortError(signal);
}

function abortError(signal?: AbortSignal) {
    return signal?.reason instanceof Error ? signal.reason : new DOMException('The NetMD upload was cancelled.', 'AbortError');
}

function assertByteArray(value: unknown, label: string): asserts value is Uint8Array<ArrayBuffer> {
    if (!(value instanceof Uint8Array) || !(value.buffer instanceof ArrayBuffer)) {
        throw new Error(`The NetMD encryption worker returned an invalid ${label}.`);
    }
}
