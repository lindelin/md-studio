/* eslint no-restricted-globals: 0 */
import CryptoJSWasm from '@originjs/crypto-js-wasm';
import { getAsyncPacketIterator } from 'netmd-js/dist/encrypt-generator';

let iterator: ReturnType<typeof getAsyncPacketIterator> | undefined;

onmessage = async (event: MessageEvent) => {
    const { action, ...payload } = event.data;
    try {
        if (action === 'init') {
            await CryptoJSWasm.DES.loadWasm();
            iterator = getAsyncPacketIterator({
                data: payload.data,
                frameSize: payload.frameSize,
                kek: payload.kek,
                chunkSize: payload.chunkSize,
            });
            self.postMessage({ type: 'ready' });
            return;
        }

        if (action === 'getChunk') {
            if (!iterator) throw new Error('The NetMD encryption worker is not initialized.');
            const next = await iterator.next();
            if (next.done) {
                self.postMessage({ type: 'done' });
                self.close();
                return;
            }
            const key = new Uint8Array(next.value.key);
            const iv = new Uint8Array(next.value.iv);
            const data = new Uint8Array(next.value.data);
            self.postMessage({ type: 'chunk', key, iv, data }, [data.buffer]);
            return;
        }

        throw new Error(`Unknown NetMD encryption worker action: ${String(action)}.`);
    } catch (error) {
        self.postMessage({
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
        });
    }
};
