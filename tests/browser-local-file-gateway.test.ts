import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BrowserLocalFileGateway } from '../src/application/browser-local-file-gateway.ts';

describe('BrowserLocalFileGateway', () => {
    it('stays unavailable until the explicitly enabled bridge attaches', async () => {
        const gateway = new BrowserLocalFileGateway();

        assert.equal(gateway.canResolve(), false);
        assert.equal(gateway.canWrite(), false);
        assert.throws(() => gateway.resolve('file-handle'), /not connected/);
        assert.throws(() => gateway.write('output-handle', 'track.oma', new Uint8Array()), /not connected/);
    });

    it('routes local import and export payloads through the attached bridge endpoint', async () => {
        const gateway = new BrowserLocalFileGateway();
        const writes: string[] = [];
        const file = new File([Uint8Array.from([1, 2, 3])], 'track.wav');
        gateway.attach({
            async resolve(reference) {
                assert.equal(reference, 'file-handle');
                return file;
            },
            async write(outputHandle, name, data) {
                writes.push(`${outputHandle}:${name}:${data.byteLength}`);
                return 'C:/Music/track.oma';
            },
        });

        assert.equal(gateway.canResolve(), true);
        assert.equal(gateway.canWrite(), true);
        assert.equal(await gateway.resolve('file-handle'), file);
        assert.equal(await gateway.write('output-handle', 'track.oma', Uint8Array.from([1, 2])), 'C:/Music/track.oma');
        assert.deepEqual(writes, ['output-handle:track.oma:2']);
    });
});
