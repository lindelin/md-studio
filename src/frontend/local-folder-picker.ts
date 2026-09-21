import type { LocalLibraryFileReference } from '../application/local-library-file';

interface ReadableFileHandle {
    readonly kind: 'file';
    readonly name: string;
    getFile(): Promise<File>;
}

interface ReadableDirectoryHandle {
    readonly kind: 'directory';
    readonly name: string;
    values(): AsyncIterableIterator<ReadableFileHandle | ReadableDirectoryHandle>;
}

interface DirectoryPickerWindow extends Window {
    showDirectoryPicker?: (options?: { id?: string; mode?: 'read' }) => Promise<ReadableDirectoryHandle>;
}

export function supportsLocalFolderPicker(windowLike: Window = window): boolean {
    return typeof (windowLike as DirectoryPickerWindow).showDirectoryPicker === 'function';
}

export async function pickLocalFolderReferences(windowLike: Window = window): Promise<LocalLibraryFileReference[] | null> {
    const picker = (windowLike as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) throw new Error('This browser cannot reference a local folder directly.');

    let directory: ReadableDirectoryHandle;
    try {
        directory = await picker.call(windowLike, { id: 'minidisc-workspace-library', mode: 'read' });
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return null;
        throw error;
    }

    const references: LocalLibraryFileReference[] = [];
    await collectDirectoryReferences(directory, [directory.name], references);
    return references;
}

async function collectDirectoryReferences(
    directory: ReadableDirectoryHandle,
    path: string[],
    references: LocalLibraryFileReference[]
) {
    for await (const entry of directory.values()) {
        if (entry.kind === 'directory') {
            await collectDirectoryReferences(entry, [...path, entry.name], references);
            continue;
        }
        references.push({
            relativePath: [...path, entry.name].join('/'),
            getFile: () => entry.getFile(),
        });
    }
}
