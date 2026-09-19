import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { LocalFileRegistry } from '../bridge/local-file-registry.ts';

describe('LocalFileRegistry', () => {
    let directory: string;
    let filePath: string;

    before(async () => {
        directory = await mkdtemp(join(tmpdir(), 'minidisc-files-'));
        filePath = join(directory, 'track.wav');
        await writeFile(filePath, Uint8Array.from([1, 2, 3, 4, 5]));
    });

    after(async () => rm(directory, { recursive: true, force: true }));

    it('registers a real file and reads bounded chunks by opaque handle', async () => {
        const registry = new LocalFileRegistry();
        const registered = await registry.register(filePath);
        assert.match(registered.reference, /^bridge-file:/);
        assert.equal(registered.name, 'track.wav');
        assert.equal(registered.size, 5);
        assert.equal(registered.mimeType, 'audio/wav');

        const chunk = await registry.readChunk(registered.handle, 1, 3);
        assert.deepEqual([...chunk.data], [2, 3, 4]);
    });

    it('rejects paths that were never registered and oversized chunks', async () => {
        const registry = new LocalFileRegistry();
        await assert.rejects(registry.readChunk('missing', 0, 1), /unknown or expired/);
        const registered = await registry.register(filePath);
        await assert.rejects(registry.readChunk(registered.handle, 0, 1024 * 1024 + 1), /chunk length/);
    });

    it('revokes files that are no longer referenced while preserving staged handles', async () => {
        const registry = new LocalFileRegistry();
        const retained = await registry.register(filePath);
        const staged = await registry.register(filePath);
        const expired = await registry.register(filePath);

        assert.equal(registry.revokeUnreferenced([retained.reference], [staged.handle]), 1);
        assert.deepEqual([...(await registry.readChunk(retained.handle, 0, 1)).data], [1]);
        assert.deepEqual([...(await registry.readChunk(staged.reference, 0, 1)).data], [1]);
        await assert.rejects(registry.readChunk(expired.handle, 0, 1), /unknown or expired/);

        registry.clear();
        await assert.rejects(registry.readChunk(retained.handle, 0, 1), /unknown or expired/);
    });

    it('rejects a registered path when its file is replaced or modified', async () => {
        const registry = new LocalFileRegistry();
        const registered = await registry.register(filePath);
        try {
            await writeFile(filePath, Uint8Array.from([5, 4, 3, 2, 1]));
            await assert.rejects(registry.readChunk(registered.handle, 0, 5), /changed after it was registered/);
        } finally {
            await writeFile(filePath, Uint8Array.from([1, 2, 3, 4, 5]));
        }
    });
});
