import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApplicationError } from '../src/application/contracts.ts';
import { ImportQueue } from '../src/application/import-queue.ts';

function input(name: string, payload?: unknown) {
    return {
        source: { kind: 'local-path' as const, name, reference: `C:\\Music\\${name}` },
        metadata: { title: name.replace(/\.flac$/, ''), duration: 60 },
        payload,
    };
}

describe('ImportQueue', () => {
    it('adds, edits, reorders and removes tracks with revisions', () => {
        const queue = new ImportQueue();
        const added = queue.add([input('A.flac'), input('B.flac')], 0);
        const firstId = added.items[0].id;
        const secondId = added.items[1].id;
        const updated = queue.update(firstId, { title: 'Renamed' }, 1);
        assert.equal(updated.items[0].title, 'Renamed');
        const moved = queue.move(secondId, 0, 2);
        assert.equal(moved.items[0].id, secondId);
        const removed = queue.remove([firstId], 3);
        assert.deepEqual(
            removed.items.map((item) => item.id),
            [secondId]
        );
        assert.equal(removed.revision, 4);
    });

    it('rejects stale edits without changing the queue', () => {
        const queue = new ImportQueue();
        const added = queue.add([input('A.flac')]);
        assert.throws(
            () => queue.update(added.items[0].id, { title: 'Stale' }, 0),
            (error: unknown) => (error as ApplicationError).code === 'STALE_REVISION'
        );
        assert.equal(queue.snapshot().items[0].title, 'A');
    });

    it('validates batch metadata edits before applying any of them', () => {
        const queue = new ImportQueue();
        const initial = queue.add([
            input('One.flac'),
            input('Two.flac'),
        ]);
        const [one, two] = initial.items;

        assert.throws(
            () =>
                queue.updateMany(
                    [
                        { id: one.id, changes: { title: 'Changed' } },
                        { id: two.id, changes: { duration: -1 } },
                    ],
                    initial.revision
                ),
            /non-negative/
        );
        assert.deepEqual(
            queue.snapshot().items.map((item) => item.title),
            ['One', 'Two']
        );

        const updated = queue.updateMany(
            [
                { id: one.id, changes: { title: 'First' } },
                { id: two.id, changes: { title: 'Second' } },
            ],
            initial.revision
        );
        assert.equal(updated.revision, initial.revision + 1);
        assert.deepEqual(
            updated.items.map((item) => item.title),
            ['First', 'Second']
        );
    });

    it('rejects empty, unknown, and malformed metadata at the shared command boundary', () => {
        const queue = new ImportQueue();
        const initial = queue.add([input('Safe.flac')]);
        const id = initial.items[0].id;

        assert.throws(
            () => queue.update(id, {}, initial.revision),
            (error: unknown) => (error as ApplicationError).code === 'INVALID_INPUT'
        );
        assert.throws(
            () => queue.update(id, { injected: 'value' } as any, initial.revision),
            /Unknown import update field/
        );
        assert.throws(
            () => queue.update(id, { forcedEncoding: { codec: 'AT3', bitrate: 0 } }, initial.revision),
            /positive whole-number bitrate/
        );
        assert.throws(
            () =>
                queue.add([
                    {
                        ...input('Bad.flac'),
                        source: { ...input('Bad.flac').source, kind: 'network-url' },
                    } as any,
                ]),
            /source kind is invalid/
        );
        assert.equal(queue.snapshot().revision, initial.revision);
        assert.deepEqual(queue.snapshot().items[0], initial.items[0]);
    });

    it('keeps non-serializable payloads out of snapshots', () => {
        const queue = new ImportQueue();
        const payload = { arrayBuffer: async () => new ArrayBuffer(0) };
        const added = queue.add([input('A.flac', payload)]);
        assert.equal('payload' in added.items[0], false);
        assert.equal(queue.resolvePayload(added.items[0].id), payload);
    });

    it('resolves a revision-checked write selection in queue order', () => {
        const queue = new ImportQueue();
        const payloadA = { name: 'payload-a' };
        const payloadB = { name: 'payload-b' };
        const added = queue.add([input('A.flac', payloadA), input('B.flac', payloadB)]);
        const selection = queue.resolveSelection([added.items[1].id, added.items[0].id], added.revision);
        assert.deepEqual(
            selection.map(({ item }) => item.title),
            ['A', 'B']
        );
        assert.deepEqual(
            selection.map(({ payload }) => payload),
            [payloadA, payloadB]
        );
        assert.throws(() => queue.resolveSelection(undefined, 0), /changed after this command/);
    });
});
