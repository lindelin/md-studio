import { CustomParameterInfo, CustomParameters, isAllValid } from '../custom-parameters';
import type { LibraryService } from './library/library';
import { ApplicationError } from '../application/contracts';

type LibraryServiceConstructor = new (parameters: CustomParameters) => LibraryService;

export interface LibraryServicePrototype {
    id: string;
    load: () => Promise<LibraryServiceConstructor>;
    customParameters?: CustomParameterInfo[];
    name: string;
    description?: string;
}

export const LibraryServices: LibraryServicePrototype[] = [
    {
        id: 'browser-folder',
        name: 'Local Folder',
        load: async () => (await import('./library/browser-folder-library')).BrowserFolderLibraryService,
        description: 'Browse audio from a folder selected on this computer. Files and metadata remain in the browser session.',
    },
];

export async function createLibraryService(
    index: number,
    parameters: CustomParameters
): Promise<LibraryService> {
    const prototype = LibraryServices[index];
    if (!prototype) {
        throw new ApplicationError(
            'INVALID_INPUT',
            index === -1 ? 'Configure a library service before opening the library.' : `Unknown library service index: ${index}.`
        );
    }
    if (!isAllValid(prototype.customParameters, parameters)) {
        throw new ApplicationError('INVALID_INPUT', `The configuration for ${prototype.name} is invalid.`);
    }
    const Constructor = await prototype.load();
    return new Constructor(parameters);
}
