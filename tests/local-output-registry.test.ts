import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { LocalOutputRegistry } from '../bridge/local-output-registry.ts';

describe('LocalOutputRegistry', () => {
    let directory: string;

    before(async () => {
        directory = await mkdtemp(join(tmpdir(), 'minidisc-exports-'));
    });

    after(async () => rm(directory, { recursive: true, force: true }));

    it('writes ordered chunks atomically and sanitizes the file name', async () => {
        const registry = new LocalOutputRegistry();
        const output = await registry.registerDirectory(directory);
        await registry.writeChunk(output.handle, 'file-one', '01: Track?.oma', 0, Uint8Array.from([1, 2]), false);
        const completed = await registry.writeChunk(output.handle, 'file-one', '01: Track?.oma', 2, Uint8Array.from([3]), true);

        assert.equal(basename(completed.completedPath!), '01_ Track_.oma');
        assert.deepEqual([...(await readFile(completed.completedPath!))], [1, 2, 3]);
        await registry.close();
    });

    it('rejects out-of-order chunks and removes the partial file', async () => {
        const registry = new LocalOutputRegistry();
        const output = await registry.registerDirectory(directory);
        await registry.writeChunk(output.handle, 'file-two', '02. Track.oma', 0, Uint8Array.from([1]), false);
        await assert.rejects(
            registry.writeChunk(output.handle, 'file-two', '02. Track.oma', 2, Uint8Array.from([2]), true),
            /out of order/
        );
        await registry.close();
    });
});
