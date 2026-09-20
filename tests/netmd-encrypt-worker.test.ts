import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeNetMDEncryptPacketIterator } from '../src/services/interfaces/netmd-encrypt-worker.ts';

class FakeWorker {
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: OnErrorEventHandler = null;
    onmessageerror: ((event: MessageEvent) => void) | null = null;
    posted: { message: unknown; transfer: readonly Transferable[] }[] = [];
    terminated = false;

    postMessage(message: unknown, transfer: readonly Transferable[] = []) {
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

const input = () => ({
    data: Uint8Array.from([1, 2, 3, 4]).buffer,
    frameSize: 4,
    kek: Uint8Array.from([5, 6]),
    chunkSize: 4,
});

describe('NetMD encryption worker adapter', () => {
    it('validates the handshake, yields chunks, reports progress, and terminates', async () => {
        const worker = new FakeWorker();
        const progress: number[] = [];
        const iterator = makeNetMDEncryptPacketIterator(
            worker as unknown as Worker,
            ({ encryptedBytes }) => progress.push(encryptedBytes),
            { init: 50, chunk: 50 }
        )(input());

        const first = iterator.next();
        assert.equal((worker.posted[0].message as { action: string }).action, 'init');
        worker.respond({ type: 'ready' });
        await Promise.resolve();
        assert.equal((worker.posted[1].message as { action: string }).action, 'getChunk');
        worker.respond({
            type: 'chunk',
            key: Uint8Array.from([7]),
            iv: Uint8Array.from([8]),
            data: Uint8Array.from([9, 10]),
        });
        assert.deepEqual(await first, {
            done: false,
            value: { key: Uint8Array.from([7]), iv: Uint8Array.from([8]), data: Uint8Array.from([9, 10]) },
        });
        assert.deepEqual(progress, [2]);

        const done = iterator.next();
        worker.respond({ type: 'done' });
        assert.deepEqual(await done, { done: true, value: undefined });
        assert.equal(worker.terminated, true);
    });

    it('rejects structured startup failures and silent workers instead of hanging', async () => {
        const failedWorker = new FakeWorker();
        const failed = makeNetMDEncryptPacketIterator(failedWorker as unknown as Worker, undefined, { init: 50, chunk: 50 })(input());
        const failedNext = failed.next();
        failedWorker.respond({ type: 'error', message: 'DES runtime unavailable' });
        await assert.rejects(failedNext, /DES runtime unavailable/);
        assert.equal(failedWorker.terminated, true);

        const silentWorker = new FakeWorker();
        const silent = makeNetMDEncryptPacketIterator(silentWorker as unknown as Worker, undefined, { init: 5, chunk: 5 })(input());
        await assert.rejects(silent.next(), /timed out/);
        assert.equal(silentWorker.terminated, true);
    });

    it('rejects worker startup and malformed chunk responses', async () => {
        const startupWorker = new FakeWorker();
        const startup = makeNetMDEncryptPacketIterator(startupWorker as unknown as Worker, undefined, { init: 50, chunk: 50 })(input());
        const startupNext = startup.next();
        startupWorker.fail('module worker failed');
        await assert.rejects(startupNext, /module worker failed/);

        const malformedWorker = new FakeWorker();
        const malformed = makeNetMDEncryptPacketIterator(malformedWorker as unknown as Worker, undefined, { init: 50, chunk: 50 })(input());
        const malformedNext = malformed.next();
        malformedWorker.respond({ type: 'ready' });
        await Promise.resolve();
        malformedWorker.respond({ type: 'chunk', key: [], iv: [], data: [] });
        await assert.rejects(malformedNext, /invalid key/);
        assert.equal(malformedWorker.terminated, true);
    });

    it('terminates a pending worker request when the upload is cancelled', async () => {
        const worker = new FakeWorker();
        const controller = new AbortController();
        const iterator = makeNetMDEncryptPacketIterator(
            worker as unknown as Worker,
            undefined,
            { init: 1_000, chunk: 1_000 },
            controller.signal
        )(input());

        const pending = iterator.next();
        controller.abort(new DOMException('cancelled by user', 'AbortError'));

        await assert.rejects(pending, /cancelled by user/);
        assert.equal(worker.terminated, true);
    });
});
