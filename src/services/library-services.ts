import { CustomParameterInfo, CustomParameters, isAllValid } from '../custom-parameters';
import type { LibraryService } from './library/library';
import { ApplicationError } from '../application/contracts';
import type { OnlineServiceGuard } from '../application/online-service-policy';

type LibraryServiceConstructor = new (parameters: CustomParameters, guardOnlineService?: OnlineServiceGuard) => LibraryService;

export interface LibraryServicePrototype {
    id: string;
    load: () => Promise<LibraryServiceConstructor>;
    customParameters?: CustomParameterInfo[];
    name: string;
    description?: string;
    requiresOnlineServices?: boolean;
}

export const LibraryServices: LibraryServicePrototype[] = [
    {
        id: 'remote-library',
        name: 'Remote Library',
        load: async () => (await import('./library/remote-library')).RemoteLibraryService,
        requiresOnlineServices: true,
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
            'A remote library with a built-in encoder. It sends pre-encoded audio to MiniDisc Workspace to reduce bandwidth use.',
    },
];

export async function createLibraryService(
    index: number,
    parameters: CustomParameters,
    guardOnlineService?: OnlineServiceGuard
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
    return new Constructor(parameters, guardOnlineService);
}
