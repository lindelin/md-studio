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
    requiresBrowserUsb?: boolean;
    parameters: ServiceParameterDescriptor[];
}

export interface ServiceCatalogSnapshot {
    devices: ConfigurableServiceDescriptor[];
    audioEncoders: ConfigurableServiceDescriptor[];
    libraries: ConfigurableServiceDescriptor[];
}

interface ServicePrototype {
    id: string;
    name: string;
    description?: unknown;
    catalogDescription?: string;
    available?: boolean;
    unavailableReason?: string;
    requiresChrome?: boolean;
    customParameters?: CustomParameterInfo[];
}

export function createServiceCatalog(
    audioEncoders: readonly ServicePrototype[],
    libraries: readonly ServicePrototype[],
    devices: readonly ServicePrototype[] = []
): ServiceCatalogSnapshot {
    return structuredClone({
        devices: devices.map(toDescriptor),
        audioEncoders: audioEncoders.map(toDescriptor),
        libraries: libraries.map(toDescriptor),
    });
}

function toDescriptor(service: ServicePrototype, index: number): ConfigurableServiceDescriptor {
    const description = service.catalogDescription ?? (typeof service.description === 'string' ? service.description : undefined);
    return {
        index,
        id: service.id,
        name: service.name,
        ...(description ? { description } : {}),
        available: service.available ?? true,
        ...(service.unavailableReason ? { unavailableReason: service.unavailableReason } : {}),
        ...(service.requiresChrome !== undefined ? { requiresBrowserUsb: service.requiresChrome } : {}),
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
