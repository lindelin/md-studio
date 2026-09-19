import type { CustomParameterInfo } from '../custom-parameters';

export interface ServiceParameterDescriptor {
    key: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'hostFilePath' | 'hostDirPath' | 'enum';
    defaultValue: string | number | boolean;
    options?: { label: string; value: string }[];
}

export interface ConfigurableServiceDescriptor {
    index: number;
    id: string;
    name: string;
    description?: string;
    available: boolean;
    unavailableReason?: string;
    parameters: ServiceParameterDescriptor[];
}

export interface ServiceCatalogSnapshot {
    audioEncoders: ConfigurableServiceDescriptor[];
    libraries: ConfigurableServiceDescriptor[];
}

interface ServicePrototype {
    id: string;
    name: string;
    description?: string;
    available?: boolean;
    unavailableReason?: string;
    customParameters?: CustomParameterInfo[];
}

export function createServiceCatalog(
    audioEncoders: readonly ServicePrototype[],
    libraries: readonly ServicePrototype[]
): ServiceCatalogSnapshot {
    return structuredClone({
        audioEncoders: audioEncoders.map(toDescriptor),
        libraries: libraries.map(toDescriptor),
    });
}

function toDescriptor(service: ServicePrototype, index: number): ConfigurableServiceDescriptor {
    return {
        index,
        id: service.id,
        name: service.name,
        ...(service.description ? { description: service.description } : {}),
        available: service.available ?? true,
        ...(service.unavailableReason ? { unavailableReason: service.unavailableReason } : {}),
        parameters: (service.customParameters ?? []).map(toParameterDescriptor),
    };
}

function toParameterDescriptor(parameter: CustomParameterInfo): ServiceParameterDescriptor {
    if (Array.isArray(parameter.type)) {
        return {
            key: parameter.varName,
            label: parameter.userFriendlyName,
            type: 'enum',
            defaultValue: parameter.defaultValue ?? parameter.type[0]?.value ?? '',
            options: parameter.type.map((option) => ({ label: option.name, value: option.value })),
        };
    }
    const defaultValue = parameter.type === 'boolean' ? false : parameter.type === 'number' ? 0 : '';
    return {
        key: parameter.varName,
        label: parameter.userFriendlyName,
        type: parameter.type,
        defaultValue: parameter.defaultValue ?? defaultValue,
    };
}
