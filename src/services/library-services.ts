import { CustomParameterInfo, CustomParameters, isAllValid } from '../custom-parameters';
import { LibraryService } from './library/library';
import { RemoteLibraryService } from './library/remote-library';
import { ApplicationError } from '../application/contracts';

interface LibraryServicePrototype<T extends LibraryService> {
    create: new (parameters: CustomParameters) => T;
    customParameters?: CustomParameterInfo[];
    name: string;
    description?: string;
}

export const LibraryServices: LibraryServicePrototype<LibraryService>[] = [
    {
        name: 'Remote Library',
        create: RemoteLibraryService,
        customParameters: [
            {
                userFriendlyName: 'Server Address',
                varName: 'address',
                type: 'string',
                defaultValue: 'http://localhost:8000/',
                validator: (content) => {
                    try {
                        new URL(content);
                        return true;
                    } catch (e) {
                        return false;
                    }
                },
            },
        ],
        description:
            'A remote library with an inbuilt encoder. Lets you cut down on bandwidth usage, by having the files sent to the local Web Minidisc instance preencoded.',
    },
];

export function createLibraryService(index: number, parameters: CustomParameters): LibraryService {
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
    return new prototype.create(parameters);
}
