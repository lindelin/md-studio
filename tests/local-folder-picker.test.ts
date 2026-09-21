import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickLocalFolderReferences, supportsLocalFolderPicker } from '../src/frontend/local-folder-picker.ts';

function fileHandle(name: string, contents: string) {
    return {
        kind: 'file' as const,
        name,
        getFile: async () => new File([contents], name, { type: 'audio/wav' }),
    };
}

function directoryHandle(name: string, entries: object[]) {
    return {
        kind: 'directory' as const,
        name,
        async *values() {
            yield* entries;
        },
    };
}

describe('local folder picker', () => {
    it('returns lazy local file references without using a folder upload input', async () => {
        const first = fileHandle('01.wav', 'first');
        const second = fileHandle('02.wav', 'second');
        const folder = directoryHandle('Music', [first, directoryHandle('Album', [second])]);
        const pickerWindow = { showDirectoryPicker: async () => folder } as unknown as Window;

        assert.equal(supportsLocalFolderPicker(pickerWindow), true);
        const references = await pickLocalFolderReferences(pickerWindow);

        assert.deepEqual(references?.map((reference) => reference.relativePath), ['Music/01.wav', 'Music/Album/02.wav']);
        assert.equal((await references?.[1].getFile())?.name, '02.wav');
    });

    it('treats closing the system folder picker as a cancellation', async () => {
        const pickerWindow = {
            showDirectoryPicker: async () => {
                throw new DOMException('cancelled', 'AbortError');
            },
        } as unknown as Window;

        assert.equal(await pickLocalFolderReferences(pickerWindow), null);
    });
});
