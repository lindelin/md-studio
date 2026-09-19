import { CustomParameterInfo, CustomParameters, isAllValid } from '../custom-parameters';
import { AT3RE_INCLUDED, ATRACOS_INCLUDED } from '../version-info';
import { Atrac3OSExportService } from './audio/atrac3os-export';
import { Atrac3REExportService } from './audio/atrac3re-export';
import { AtracdencAudioExportService } from './audio/atracdenc-export';
import { AudioExportService } from './audio/audio-export';
import { LocalAtracExportService } from './audio/ewmd-local-atrac-export';
import { RemoteAtracExportService } from './audio/remote-atrac-export';
import { ApplicationError } from '../application/contracts';
import type { AudioEncoderConfiguration, AudioEncoderDescriptor } from '../application/audio-encoder-manager';

interface AudioServicePrototype<T extends AudioExportService> {
    id: string;
    create: new (parameters: CustomParameters) => T;
    customParameters?: CustomParameterInfo[];
    name: string;
    description?: string;
    available: boolean;
    unavailableReason?: string;
}

export const AudioServices: AudioServicePrototype<AudioExportService>[] = [
    {
        id: 'at3re',
        name: 'At3RE',
        create: Atrac3REExportService,
        description: 'Reverse engineered at3tool encoder. Client-side only, has full ATRAC3/3+ support.',
        available: Boolean(AT3RE_INCLUDED),
        unavailableReason: AT3RE_INCLUDED ? undefined : 'This build does not include the At3RE JavaScript and WebAssembly runtime.',
    },
    {
        id: 'atracdenc',
        name: 'Atracdenc',
        create: AtracdencAudioExportService,
        description: 'The standard open-source ATRAC encoder. Its ATRAC3 support is incomplete',
        available: true,
    },
    {
        id: 'remote-atrac',
        name: 'Remote ATRAC Encoder',
        create: RemoteAtracExportService,
        available: true,
        customParameters: [
            {
                userFriendlyName: 'Server Address',
                varName: 'address',
                type: 'string',
                defaultValue: 'https://atrac.minidisc.wiki/',
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
            'A separate high-quality ATRAC encoder hosted on another server (as defined by https://github.com/thinkbrown/atrac-api)',
    },
];

if (ATRACOS_INCLUDED) {
    AudioServices.push({
        id: 'atrac3os',
        name: 'Built in High-Quality Encoder',
        create: Atrac3OSExportService,
        description: 'The Sony encoder in a purpose-built Web VM',
        available: true,
    });
}

if (typeof window !== 'undefined' && window.native?.invokeLocalEncoder) {
    AudioServices.push({
        id: 'local-atrac',
        name: 'Local ATRAC Encoder',
        create: LocalAtracExportService,
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

export function createAudioEncoder(configuration: AudioEncoderConfiguration): AudioEncoderDescriptor {
    const index = resolveAudioServiceIndex(configuration.index);
    const prototype = AudioServices[index];
    if (!isAllValid(prototype.customParameters, configuration.parameters)) {
        throw new ApplicationError('INVALID_INPUT', `The configuration for ${prototype.name} is invalid.`);
    }
    return {
        index,
        id: prototype.id,
        name: prototype.name,
        service: new prototype.create(configuration.parameters),
    };
}
