import React, { ReactHTMLElement } from 'react';
import { CustomParameterInfo, CustomParameters } from '../custom-parameters';
import type { Codec, MinidiscSpec, NetMDService, RecordingCodec } from './interfaces/netmd';
// The package root eagerly re-exports its filesystem, encryption, ID3, and Hi-MD
// dependencies. The connection catalog only needs this small static device list;
// the full implementation remains behind the dynamic NetworkWMService import.
import { DeviceIds } from 'networkwm-js/dist/devices.js';

const deviceProtocolDebuggingEnabled = import.meta.env?.DEV === true;

export interface LoadedService {
    service: NetMDService;
    spec: MinidiscSpec;
}

interface ServicePrototype {
    id: string;
    load: (parameters?: CustomParameters) => Promise<LoadedService | null>;
    getConnectName: (parameters?: CustomParameters) => string;
    name: string;
    customParameters?: CustomParameterInfo[];
    description?: ReactHTMLElement<any>;
    catalogDescription?: string;
    requiresChrome: boolean;
}

export interface ServiceConstructionInfo {
    id?: string;
    name: string;
    parameters?: CustomParameters;
}

export const Services: ServicePrototype[] = [
    {
        id: 'usb-netmd',
        name: 'USB NetMD',
        catalogDescription: 'Connect directly to a NetMD recorder through the browser USB API.',
        getConnectName: () => 'Connect',
        load: async () => {
            const { DefaultMinidiscSpec, NetMDUSBService } = await import('./interfaces/netmd');
            return {
                service: window.native?.interface ?? new NetMDUSBService({ debug: deviceProtocolDebuggingEnabled }),
                spec: new DefaultMinidiscSpec(),
            };
        },
        requiresChrome: true,
    },
    {
        id: 'himd-restricted',
        name: 'HiMD (metadata and export)',
        catalogDescription: 'Read Hi-MD metadata and export tracks through the browser USB API.',
        getConnectName: () => 'Connect to HiMD (metadata and export)',
        load: async () => {
            const { HiMDRestrictedService, HiMDSpec } = await import('./interfaces/himd');
            return { service: new HiMDRestrictedService({ debug: deviceProtocolDebuggingEnabled }), spec: new HiMDSpec() };
        },
        requiresChrome: true,
    },
    {
        id: 'himd-full',
        name: 'HiMD (secure full access)',
        catalogDescription: 'Use secure full-access Hi-MD operations when the environment supports them.',
        getConnectName: () => 'Connect to HiMD (secure full access)',
        load: async () => {
            if (window.native?.himdFullInterface) {
                const { HiMDSpec } = await import('./interfaces/himd');
                return { service: window.native.himdFullInterface, spec: new HiMDSpec() };
            }
            const { HiMDFullService, HiMDSpec } = await import('./interfaces/himd');
            return { service: new HiMDFullService({ debug: deviceProtocolDebuggingEnabled }), spec: new HiMDSpec() };
        },
        requiresChrome: true,
    },
    {
        id: 'network-walkman-drm-free',
        name: 'DRM-Free Network Walkman',
        catalogDescription: 'Manage supported DRM-free Network Walkman devices.',
        getConnectName: (params) => {
            const intPid = parseInt(params!.pid as string);
            return `Connect to ${DeviceIds.find((e) => e.productId == intPid)!.name}`;
        },
        load: async (params) => {
            const intPid = parseInt(params!.pid as string);
            const [{ NetworkWMService }, { HiMDSpec }] = await Promise.all([
                import('./interfaces/networkwm-nodrm'),
                import('./interfaces/himd'),
            ]);
            return {
                service: new NetworkWMService(DeviceIds.find((e) => e.productId == intPid)!),
                spec: new HiMDSpec(),
            };
        },
        requiresChrome: true,
        customParameters: [
            {
                varName: 'pid',
                type: DeviceIds.filter((e) => e.disableDRM).map((e) => ({ name: e.name, value: e.productId.toString() })),
                userFriendlyName: 'Device',
                defaultValue: DeviceIds.filter((e) => e.disableDRM)[0].productId.toString(),
            },
        ],
    },
    {
        id: 'mock-netmd',
        name: 'MockMD',
        catalogDescription: 'Use a configurable in-memory NetMD device for development and testing.',
        getConnectName: () => 'Connect to MockMD',
        description: React.createElement('p', null, 'Test NetMD interface. It does nothing'),
        load: async (parameters) => {
            const [{ NetMDMockService }, { DefaultMinidiscSpec }] = await Promise.all([
                import('./interfaces/netmd-mock'),
                import('./interfaces/netmd'),
            ]);
            return { service: new NetMDMockService(parameters, false), spec: new DefaultMinidiscSpec() };
        },
        requiresChrome: false,
        customParameters: [
            {
                userFriendlyName: 'Test Number',
                type: 'number',
                varName: 'number',
            },
            {
                userFriendlyName: 'Override disc title',
                type: 'string',
                varName: 'overrideTitle',
            },
            {
                userFriendlyName: 'Override full-width disc title',
                type: 'string',
                varName: 'overrideFWTitle',
            },
            {
                userFriendlyName: 'capabilityContentList',
                type: 'boolean',
                varName: 'capabilityContentList',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityPlaybackControl',
                type: 'boolean',
                varName: 'capabilityPlaybackControl',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityMetadataEdit',
                type: 'boolean',
                varName: 'capabilityMetadataEdit',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityTrackUpload',
                type: 'boolean',
                varName: 'capabilityTrackUpload',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityTrackDownload',
                type: 'boolean',
                varName: 'capabilityTrackDownload',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityDiscEject',
                type: 'boolean',
                varName: 'capabilityDiscEject',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityFactoryMode',
                type: 'boolean',
                varName: 'capabilityFactoryMode',
                defaultValue: true,
            },
            {
                userFriendlyName: 'Test combobox',
                type: [
                    { name: 'A', value: 'a' },
                    { name: 'Bbb', value: 'b' },
                ],
                varName: 'combobox',
                defaultValue: 'a',
            },
        ],
    },
    {
        id: 'mock-netmd-bytes',
        name: 'MockMD - Byte-Based',
        catalogDescription: 'Use a byte-capacity mock device for development and testing.',
        getConnectName: () => 'Connect to MockMD (bytes)',
        description: React.createElement('p', null, 'Test NetMD interface. It does nothing'),
        load: async (parameters) => {
            const [{ NetMDMockService }, { DefaultMinidiscSpec }, { HiMDSpec }] = await Promise.all([
                import('./interfaces/netmd-mock'),
                import('./interfaces/netmd'),
                import('./interfaces/himd'),
            ]);
            const spec = new DefaultMinidiscSpec();
            Object.defineProperty(spec, 'measurementUnits', { value: 'bytes' });
            spec.translateToDefaultMeasuringModeFrom = new HiMDSpec().translateToDefaultMeasuringModeFrom;
            return { service: new NetMDMockService(parameters, true), spec };
        },
        requiresChrome: false,
        customParameters: [
            {
                userFriendlyName: 'capabilityContentList',
                type: 'boolean',
                varName: 'capabilityContentList',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityPlaybackControl',
                type: 'boolean',
                varName: 'capabilityPlaybackControl',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityMetadataEdit',
                type: 'boolean',
                varName: 'capabilityMetadataEdit',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityTrackUpload',
                type: 'boolean',
                varName: 'capabilityTrackUpload',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityTrackDownload',
                type: 'boolean',
                varName: 'capabilityTrackDownload',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityDiscEject',
                type: 'boolean',
                varName: 'capabilityDiscEject',
                defaultValue: true,
            },
            {
                userFriendlyName: 'capabilityFactoryMode',
                type: 'boolean',
                varName: 'capabilityFactoryMode',
                defaultValue: true,
            },
        ],
    },
];

if (typeof window !== 'undefined' && window.native?.nwInterface) {
    Services.push({
        id: 'network-walkman-native',
        name: 'NetworkWM',
        catalogDescription: 'Manage a Network Walkman through the native application integration.',
        requiresChrome: true,
        getConnectName: () => 'Connect to Network Walkman',
        load: async () => {
            const nativeService = window.native?.nwInterface;
            if (!nativeService) return null;
            const { HiMDSpec } = await import('./interfaces/himd');
            class NetworkWMSpec extends HiMDSpec {
                public availableFormats: RecordingCodec[] = [
                    { codec: 'AT3', availableBitrates: [132, 105, 66], defaultBitrate: 132 },
                    { codec: 'A3+', availableBitrates: [352, 256, 192, 64, 48], defaultBitrate: 256 },
                    { codec: 'MP3', availableBitrates: [320, 256, 192, 128, 96, 64], defaultBitrate: 192 },
                ];
                public readonly measurementUnits = 'bytes';
                public defaultFormat = [1, 1] as [number, number];
                public specName = 'NetworkWM';

                translateToDefaultMeasuringModeFrom(codec: Codec, defaultMeasuringModeDuration: number): number {
                    return super.translateToDefaultMeasuringModeFrom(codec, defaultMeasuringModeDuration) + 32768;
                }
            }
            return { service: nativeService, spec: new NetworkWMSpec() };
        },
    });
}

export function getSimpleServices() {
    return Services.filter((n) => !n.customParameters).map((n) => ({
        id: n.id,
        name: n.name,
    }));
}

function getPrototype(info: ServiceConstructionInfo) {
    return Services.find((service) => (info.id ? service.id === info.id : service.name === info.name)) || null;
}

export function filterOutCorrupted(savedCustomServices: unknown) {
    const legalCustomServices: ServiceConstructionInfo[] = [];
    if (!Array.isArray(savedCustomServices)) return legalCustomServices;

    for (const candidate of savedCustomServices) {
        if (!candidate || typeof candidate !== 'object') continue;
        const info = candidate as Partial<ServiceConstructionInfo>;
        if (typeof info.name !== 'string') continue;
        const prototype = getPrototype(info as ServiceConstructionInfo);
        if (!prototype) continue; // No such service - remove.
        const requiredParameters = prototype.customParameters;
        if (!requiredParameters) continue; // The service cannot be a custom service - no props to set.
        if (!info.parameters || typeof info.parameters !== 'object' || Array.isArray(info.parameters)) continue;
        const parameterKeys = Object.keys(info.parameters);
        if (requiredParameters.length !== parameterKeys.length) continue; // Invalid config.
        const typeValid = (n: CustomParameterInfo, value: CustomParameters extends { [e: string]: infer R } ? R : never) =>
            Array.isArray(n.type) ? n.type.some((e) => e.value === value) : typeof value === n.type;
        if (
            requiredParameters.filter((n) => parameterKeys.includes(n.varName) && typeValid(n, info.parameters![n.varName])).length !==
            requiredParameters.length
        )
            continue; // The service's parameters differ from the prototype's declaration.
        legalCustomServices.push({ id: prototype.id, name: prototype.name, parameters: info.parameters });
    }
    return legalCustomServices;
}

export function loadService(info: ServiceConstructionInfo) {
    return getPrototype(info)?.load(info.parameters) ?? Promise.resolve(null);
}

export function getConnectButtonName(service: ServiceConstructionInfo) {
    return getPrototype(service)!.getConnectName(service.parameters);
}

export function doesServiceRequireChrome(info: ServiceConstructionInfo) {
    return getPrototype(info)?.requiresChrome ?? false;
}
