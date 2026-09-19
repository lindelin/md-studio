import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AtracdencProcess } from '../src/services/audio/atracdenc-worker.ts';

class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: OnErrorEventHandler = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    posted: { message: unknown; transfer: readonly Transferable[] }[] = [];
    terminated = false;
    postError?: Error;

    postMessage(message: unknown, transfer: readonly Transferable[] = []) {
        if (this.postError) throw this.postError;
        this.posted.push({ message, transfer });
    }

    terminate() {
        this.terminated = true;
    }

    respond(data: unknown) {
        this.onmessage?.({ data } as MessageEvent);
    }

    fail(message: string) {
        this.onerror?.({ message } as ErrorEvent, undefined, undefined, undefined, undefined);
    }
}

function createProcess(timeouts = { init: 50, encode: 50 }) {
    const worker = new FakeWorker();
    const process = new AtracdencProcess(worker as unknown as Worker, timeouts);
    return { worker, process };
}

describe('AtracdencProcess', () => {
    it('matches init and encode responses and transfers the audio buffer', async () => {
        const { worker, process } = createProcess();
        const initializing = process.init();
        assert.deepEqual(worker.posted[0].message, { action: 'init' });
        worker.respond({ action: 'init' });
        await initializing;

        const input = Uint8Array.from([1, 2, 3]).buffer;
        const encoding = process.encode(input, '128');
        assert.equal((worker.posted[1].message as { action: string }).action, 'encode');
        assert.equal(worker.posted[1].transfer[0], input);
        const output = Uint8Array.from([4, 5]).buffer;
        worker.respond({ action: 'encode', result: output });

        assert.equal(await encoding, output);
    });

    it('rejects worker and structured encoder failures without leaving a request pending', async () => {
        const { worker, process } = createProcess();
        const first = process.init();
        worker.fail('worker startup failed');
        await assert.rejects(first, /worker startup failed/);

        const second = process.init();
        worker.respond({ action: 'init', error: 'ENCODER_FAILURE', message: 'runtime unavailable' });
        await assert.rejects(second, /runtime unavailable/);
    });

    it('rejects unexpected responses and synchronous postMessage failures', async () => {
        const { worker, process } = createProcess();
        const unexpected = process.init();
        worker.respond({ action: 'encode' });
        await assert.rejects(unexpected, /unexpected encode response/);

        worker.postError = new Error('could not transfer input');
        await assert.rejects(() => process.init(), /could not transfer input/);
    });

    it('times out silent workers and rejects pending work when terminated', async () => {
        const timedOut = createProcess({ init: 5, encode: 5 });
        await assert.rejects(() => timedOut.process.init(), /did not respond within/);

        const active = createProcess();
        const pending = active.process.init();
        active.process.terminate();
        await assert.rejects(pending, /was terminated/);
        assert.equal(active.worker.terminated, true);
    });
});
