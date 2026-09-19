/* eslint no-restricted-globals: 0 */
function getPublicPathFor(script: string) {
    return `${import.meta.env.BASE_URL}${script}`;
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
    // Worker
    let Module: any;
    let setupBitrate: number | undefined = undefined;
    onmessage = async (ev: MessageEvent) => {
        const { action, ...others } = ev.data;
        if (action === 'init') {
            try {
                self.importScripts(getPublicPathFor(`at3re-harness.js`));
                const moduleFactory = (self as any).Module;
                if (typeof moduleFactory !== 'function') throw new Error('At3RE runtime did not expose a module factory.');
                const m = await moduleFactory({ locateFile: getPublicPathFor });
                Module = m;
                self.postMessage({ action: 'init' });
                Module.setLogger && Module.setLogger((msg: string, stream: string) => console.log(`${stream}: ${msg}`));
            } catch (error) {
                self.postMessage({
                    action: 'init',
                    error: 'INITIALIZATION_FAILED',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        } else if (action === 'encode') {
            if (!Module) {
                self.postMessage({ action: 'encode', error: 'NOT_INITIALIZED', message: 'At3RE is not initialized.' });
                return;
            }
            const { bitrate, data, lastInBatch } = others;
            if (setupBitrate === undefined) {
                // Initialize the encoder.
            } else if (setupBitrate !== bitrate) {
                // Redefining the bitrate without finishing the previous batch - error
                self.postMessage({ action: 'encode', error: -1, func: '<harness>' });
                return;
            }
            // Allocate the buffer and copy PCM:
            const addr = Module._malloc(data.byteLength);
            Module.HEAPU8.set(new Uint8Array(data), addr);

            const res = Module.ccall('initialize', 'number', ['number'], [bitrate]);
            if (res != 1) {
                self.postMessage({ action: 'encode', error: res, func: 'initialize' });
                return;
            }

            const expectedSize = Module.ccall('calculate_atrac_buf_size', 'number', ['number'], [data.byteLength]);
            const atracAddr = Module._malloc(expectedSize);

            let encodedBytes = Module.ccall(
                'encode',
                'number',
                ['number', 'number', 'number', 'number'],
                [addr, atracAddr, data.byteLength, expectedSize]
            );

            if (lastInBatch) {
                // Finish everything and clean up the env
                setupBitrate = undefined;
                encodedBytes = Module.ccall('finish', 'number', ['number', 'number'], [atracAddr, encodedBytes]);
            }

            const result = new Uint8Array<ArrayBuffer>(Module.HEAPU8.subarray(atracAddr, atracAddr + encodedBytes)).buffer;

            Module._free(addr);
            Module._free(atracAddr);

            self.postMessage(
                {
                    action: 'encode',
                    result,
                },
                [result]
            );
        }
    };
} else {
    // Main
}
