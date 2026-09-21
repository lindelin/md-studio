import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { BrowserFolderLibraryService, clearBrowserFolder, indexBrowserFolder } from '../src/services/library/browser-folder-library.ts';
import { localLibraryReferencesFromFileInput } from '../src/application/local-library-file.ts';

function folderFile(path: string, type = 'audio/wav') {
    const file = new File([Uint8Array.from([1, 2, 3])], path.split('/').at(-1)!, { type });
    Object.defineProperty(file, 'webkitRelativePath', { value: path });
    return file;
}

const readMetadata = async (file: File) => ({
    title: file.name.replace(/\.[^.]+$/, ''),
    artist: 'Local Artist',
    album: 'Local Album',
    duration: 12,
    bitrate: 1411,
});

describe('BrowserFolderLibraryService', () => {
    afterEach(clearBrowserFolder);

    it('indexes nested local audio without retaining unsupported files', async () => {
        const first = folderFile('Music/Album/01 - First.wav');
        const second = folderFile('Music/Album/02 - Second.flac', '');
        const ignored = folderFile('Music/cover.jpg', 'image/jpeg');

        const indexed = await indexBrowserFolder(localLibraryReferencesFromFileInput([first, second, ignored]), readMetadata);
        const service = new BrowserFolderLibraryService({});
        const database = await service.getDatabase();

        assert.equal(indexed.fileCount, 2);
        assert.deepEqual(JSON.parse(JSON.stringify(database)), {
            Music: {
                Album: {
                    '01 - First.wav': {
                        artist: 'Local Artist',
                        album: 'Local Album',
                        title: '01 - First',
                        duration: 12,
                    },
                    '02 - Second.flac': {
                        artist: 'Local Artist',
                        album: 'Local Album',
                        title: '02 - Second',
                        duration: 12,
                    },
                },
            },
        });
        assert.equal(await service.resolveLocalLibraryFile('Music/Album/02 - Second.flac'), second);
    });

    it('publishes a folder atomically and requires a fresh selection after state is cleared', async () => {
        const original = folderFile('First/track.wav');
        await indexBrowserFolder(localLibraryReferencesFromFileInput([original]), readMetadata);
        const duplicateA = folderFile('Second/track.wav');
        const duplicateB = folderFile('Second/track.wav');

        await assert.rejects(
            () => indexBrowserFolder(localLibraryReferencesFromFileInput([duplicateA, duplicateB]), readMetadata),
            /same audio path/i
        );
        const service = new BrowserFolderLibraryService({});
        assert.equal(await service.resolveLocalLibraryFile('First/track.wav'), original);

        clearBrowserFolder();
        await assert.rejects(() => service.getDatabase(), /choose a local music folder/i);
    });

    it('rejects unsafe relative paths and folders without supported audio', async () => {
        await assert.rejects(
            () => indexBrowserFolder(localLibraryReferencesFromFileInput([folderFile('Music/../track.wav')]), readMetadata),
            /invalid audio path/i
        );
        await assert.rejects(
            () => indexBrowserFolder(localLibraryReferencesFromFileInput([folderFile('Music/readme.txt', 'text/plain')]), readMetadata),
            /no supported audio files/i
        );
    });
});
