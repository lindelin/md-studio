export interface LocalLibraryFileReference {
    relativePath: string;
    getFile(): Promise<File>;
}

export function localLibraryReferencesFromFileInput(files: readonly File[]): LocalLibraryFileReference[] {
    return files.map((file) => ({
        relativePath: file.webkitRelativePath || file.name,
        getFile: () => Promise.resolve(file),
    }));
}
