import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDeferredFile, isAdaptiveFile, isDeferredFile } from '../src/application/deferred-file.ts';

describe('deferred files', () => {
    it('does not resolve a bridge file until the conversion pipeline requests it', async () => {
        const file = {} as File;
        let resolvedFiles = 0;
        const deferred = createDeferredFile('track.wav', 'bridge-file:test', async (reference) => {
            assert.equal(reference, 'bridge-file:test');
            resolvedFiles += 1;
            return file;
        });

        assert.equal(resolvedFiles, 0);
        assert.equal(deferred.name, 'track.wav');
        assert.equal(await deferred.getFile(), file);
        assert.equal(resolvedFiles, 1);
    });

    it('distinguishes deferred and adaptive payloads', () => {
        const deferred = createDeferredFile('track.wav', 'bridge-file:test', async () => ({}) as File);
        const adaptive = { getForEncoding: async () => new ArrayBuffer(0) };

        assert.equal(isDeferredFile(deferred), true);
        assert.equal(isAdaptiveFile(deferred), false);
        assert.equal(isAdaptiveFile(adaptive), true);
        assert.equal(isDeferredFile(adaptive), false);
    });
});
