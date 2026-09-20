import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { stageLocalAudioImport } from '../bridge/local-audio-import.ts';
import { LocalFileRegistry } from '../bridge/local-file-registry.ts';

function pcmWav(seconds: number) {
    const sampleRate = 8_000;
    const sampleCount = Math.round(sampleRate * seconds);
    const bytes = new Uint8Array(44 + sampleCount * 2);
    const view = new DataView(bytes.buffer);
    bytes.set(new TextEncoder().encode('RIFF'), 0);
    view.setUint32(4, bytes.byteLength - 8, true);
    bytes.set(new TextEncoder().encode('WAVEfmt '), 8);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    bytes.set(new TextEncoder().encode('data'), 36);
    view.setUint32(40, sampleCount * 2, true);
    return bytes;
}

describe('local audio import staging', () => {
    let directory: string;

    before(async () => {
        directory = await mkdtemp(join(tmpdir(), 'minidisc-audio-stage-'));
    });

    after(async () => rm(directory, { recursive: true, force: true }));

    it('reads duration and builds a deferred local-path import', async () => {
        const filePath = join(directory, 'Example Track.wav');
        await writeFile(filePath, pcmWav(1));
        const registry = new LocalFileRegistry();

        const staged = await stageLocalAudioImport(registry, filePath);

        assert.equal(staged.input.source.kind, 'local-path');
        assert.equal(staged.input.source.name, 'Example Track.wav');
        assert.match(staged.input.source.reference, /^bridge-file:/);
        assert.equal(staged.input.metadata.title, 'Example Track');
        assert.ok(Math.abs((staged.input.metadata.duration ?? 0) - 1) < 0.01);
        assert.equal((await registry.readChunk(staged.handle, 0, 4)).data.byteLength, 4);
    });

    it('keeps explicit metadata and falls back safely for an unreadable audio header', async () => {
        const filePath = join(directory, 'Broken Audio.bin');
        await writeFile(filePath, Uint8Array.of(1, 2, 3));

        const staged = await stageLocalAudioImport(new LocalFileRegistry(), filePath, {
            title: 'Reviewed title',
            artist: 'Reviewed artist',
        });

        assert.equal(staged.input.metadata.title, 'Reviewed title');
        assert.equal(staged.input.metadata.artist, 'Reviewed artist');
        assert.equal(staged.input.metadata.duration, undefined);
    });
});
