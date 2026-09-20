import { CustomParameterInfo, CustomParameters, isAllValid } from '../custom-parameters';
import { AT3RE_INCLUDED, ATRACOS_INCLUDED } from '../version-info';
import type { AudioExportService } from './audio/audio-export';
import { ApplicationError } from '../application/contracts';
import type { AudioEncoderConfiguration, AudioEncoderDescriptor } from '../application/audio-encoder-manager';

type AudioServiceConstructor = new (parameters: CustomParameters) => AudioExportService;

export const DEFAULT_AUDIO_SERVICE_ID = 'atracdenc';

export interface AudioServicePrototype {
    id: string;
    load: () => Promise<AudioServiceConstructor>;
    customParameters?: CustomParameterInfo[];
    name: string;
    description?: string;
    available: boolean;
    unavailableReason?: string;
}

export const AudioServices: AudioServicePrototype[] = [
    {
        id: 'at3re',
        name: 'At3RE',
        load: async () => (await import('./audio/atrac3re-export')).Atrac3REExportService,
        description: 'Reverse engineered at3tool encoder. Client-side only, has full ATRAC3/3+ support.',
        available: Boolean(AT3RE_INCLUDED),
        unavailableReason: AT3RE_INCLUDED ? undefined : 'This build does not include the At3RE JavaScript and WebAssembly runtime.',
    },
    {
        id: 'atracdenc',
        name: 'Atracdenc',
        load: async () => (await import('./audio/atracdenc-export')).AtracdencAudioExportService,
        description: 'The standard open-source ATRAC encoder. Its ATRAC3 support is incomplete',
        available: true,
    },
];

if (ATRACOS_INCLUDED) {
    AudioServices.push({
        id: 'atrac3os',
        name: 'Built in High-Quality Encoder',
        load: async () => (await import('./audio/atrac3os-export')).Atrac3OSExportService,
        description: 'The Sony encoder in a purpose-built Web VM',
        available: true,
    });
}

if (typeof window !== 'undefined' && window.native?.invokeLocalEncoder) {
    AudioServices.push({
        id: 'local-atrac',
        name: 'Local ATRAC Encoder',
        load: async () => (await import('./audio/ewmd-local-atrac-export')).LocalAtracExportService,
        available: true,
        description: 'A local copy of the high-quality Sony encoder.',
        customParameters: [
            {
                userFriendlyName: 'FFMPEG Path',
                type: 'hostFilePath',
                varName: 'ffmpeg',
                defaultValue: '',
                validator: (content) => !!content,
            },
            {
                userFriendlyName: 'psp_at3tool Path',
                type: 'hostFilePath',
                varName: 'exe',
                defaultValue: '',
                validator: (content) => !!content,
            },
        ],
    });
}

export function resolveAudioServiceIndex(preferredIndex: number): number {
    if (AudioServices[preferredIndex]?.available) return preferredIndex;
    const fallbackIndex = AudioServices.findIndex((service) => service.available);
    if (fallbackIndex === -1) throw new Error('This build has no available audio encoder.');
    return fallbackIndex;
}

export function resolveAudioServiceIndexById(preferredId: string | null | undefined, legacyIndex = 0): number {
    const preferredIndex = AudioServices.findIndex((service) => service.id === preferredId && service.available);
    return preferredIndex === -1 ? resolveAudioServiceIndex(legacyIndex) : preferredIndex;
}

export async function createAudioEncoder(
    configuration: AudioEncoderConfiguration
): Promise<AudioEncoderDescriptor> {
    const index = resolveAudioServiceIndex(configuration.index);
    const prototype = AudioServices[index];
    if (!isAllValid(prototype.customParameters, configuration.parameters)) {
        throw new ApplicationError('INVALID_INPUT', `The configuration for ${prototype.name} is invalid.`);
    }
    const Constructor = await prototype.load();
    return {
        index,
        id: prototype.id,
        name: prototype.name,
        service: new Constructor(configuration.parameters),
    };
}
