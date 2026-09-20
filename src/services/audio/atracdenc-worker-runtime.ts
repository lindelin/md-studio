/* eslint no-restricted-globals: 0 */

let encoderModule: any;

onmessage = async (event: MessageEvent) => {
    const { action, ...payload } = event.data;
    try {
        if (action === 'init') {
            const runtimeUrl = payload.runtimeUrl;
            if (typeof runtimeUrl !== 'string' || runtimeUrl.length === 0) {
                throw new Error('Atracdenc runtime URL is missing.');
            }
            self.importScripts(runtimeUrl);
            const moduleFactory = (self as any).Module;
            if (typeof moduleFactory !== 'function') throw new Error('Atracdenc runtime did not expose a module factory.');
            encoderModule = await moduleFactory();
            encoderModule.setLogger?.((message: string, stream: string) => console.log(`${stream}: ${message}`));
            self.postMessage({ action: 'init' });
            return;
        }

        if (action === 'encode') {
            if (!encoderModule) throw new Error('Atracdenc is not initialized.');
            const { bitrate, data } = payload;
            const inputName = 'inWavFile.wav';
            const outputName = 'outAt3File.aea';
            encoderModule.FS.writeFile(inputName, new Uint8Array(data));
            encoderModule.callMain(['-e', 'atrac3', '-i', inputName, '-o', outputName, '--bitrate', bitrate]);

            const size = encoderModule.FS.stat(outputName).size;
            if (size < 96) throw new Error('Atracdenc produced an invalid output file.');
            const encoded = new Uint8Array(size - 96);
            const stream = encoderModule.FS.open(outputName, 'r');
            try {
                encoderModule.FS.read(stream, encoded, 0, encoded.length, 96);
            } finally {
                encoderModule.FS.close(stream);
            }

            const result = encoded.buffer;
            self.postMessage({ action: 'encode', result }, [result]);
            return;
        }

        throw new Error(`Unknown Atracdenc worker action: ${String(action)}.`);
    } catch (error) {
        self.postMessage({
            action,
            error: 'ENCODER_FAILURE',
            message: error instanceof Error ? error.message : String(error),
        });
    }
};
