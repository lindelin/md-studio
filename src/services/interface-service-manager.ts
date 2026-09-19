import React, { ReactHTMLElement } from 'react';
import { CustomParameterInfo, CustomParameters } from '../custom-parameters';
import type { Codec, MinidiscSpec, NetMDService, RecordingCodec } from './interfaces/netmd';
import { DeviceIds } from 'networkwm-js';

export interface LoadedService {
    service: NetMDService;
    spec: MinidiscSpec;
}

interface ServicePrototype {
    load: (parameters?: CustomParameters) => Promise<LoadedService | null>;
    getConnectName: (parameters?: CustomParameters) => string;
    name: string;
    customParameters?: CustomParameterInfo[];
    description?: ReactHTMLElement<any>;
    requiresChrome: boolean;
}

export interface ServiceConstructionInfo {
    name: string;
    parameters?: CustomParameters;
}

export const Services: ServicePrototype[] = [
    {
        name: 'USB NetMD',
        getConnectName: () => 'Connect',
        load: async () => {
            const { DefaultMinidiscSpec, NetMDUSBService } = await import('./interfaces/netmd');
            return {
                service: window.native?.interface ?? new NetMDUSBService({ debug: true }),
                spec: new DefaultMinidiscSpec(),
            };
        },
        requiresChrome: true,
    },
    {
        name: 'HiMD (metadata and export)',
        getConnectName: () => 'Connect to HiMD (metadata and export)',
        load: async () => {
            const { HiMDRestrictedService, HiMDSpec } = await import('./interfaces/himd');
            return { service: new HiMDRestrictedService({ debug: true }), spec: new HiMDSpec() };
        },
        requiresChrome: true,
    },
    {
        name: 'HiMD (secure full access)',
        getConnectName: () => 'Connect to HiMD (secure full access)',
        load: async () => {
            if (window.native?.himdFullInterface) {
                const { HiMDSpec } = await import('./interfaces/himd');
                return { service: window.native.himdFullInterface, spec: new HiMDSpec() };
            }
            if (!confirm('Warning: For Full HiMD mode, it is recommended to use ElectronWMD instead! Continue?')) {
                return null;
            }
            const { HiMDFullService, HiMDSpec } = await import('./interfaces/himd');
            return { service: new HiMDFullService({ debug: true }), spec: new HiMDSpec() };
        },
        requiresChrome: true,
    },
    {
        name: 'DRM-Free Network Walkman',
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
        name: 'Remote NetMD',
        getConnectName: (parameters) => `Connect to ${parameters!.friendlyName || parameters!.serverAddress}`,
        description: React.createElement(
            'p',
            null,
            'Connect to a remote NetMD device with the help of ',
            React.createElement('a', { href: 'https://github.com/asivery/remote-netmd-server' }, 'Remote NetMD')
        ),
        load: async (parameters) => {
            const [{ NetMDRemoteService }, { DefaultMinidiscSpec }] = await Promise.all([
                import('./interfaces/remote-netmd'),
                import('./interfaces/netmd'),
            ]);
            return {
                service: new NetMDRemoteService({ debug: true, ...parameters } as any),
                spec: new DefaultMinidiscSpec(),
            };
        },
        requiresChrome: false,
        customParameters: [
            {
                userFriendlyName: 'Server Address',
                varName: 'serverAddress',
                type: 'string',
                validator: (content) => {
                    try {
                        const asURL = new URL(content);
                        return asURL.pathname === '/';
                    } catch (e) {
                        return false;
                    }
                },
            },
            {
                userFriendlyName: 'Friendly Name',
                varName: 'friendlyName',
                type: 'string',
            },
        ],
    },
    {
        name: 'MockMD',
        getConnectName: () => 'Connect to MockMD',
        description: React.createElement('p', null, 'Test NetMD interface. It does nothing'),
        load: async (parameters) => {
            console.log(`Given parameters: ${JSON.stringify(parameters)}`);
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
        name: 'MockMD - Byte-Based',
        getConnectName: () => 'Connect to MockMD (bytes)',
        description: React.createElement('p', null, 'Test NetMD interface. It does nothing'),
        load: async (parameters) => {
            console.log(`Given parameters: ${JSON.stringify(parameters)}`);
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

if (window.native?.nwInterface) {
    Services.push({
        name: 'NetworkWM',
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
        name: n.name,
    }));
}

function getPrototypeByName(name: string) {
    return Services.find((n) => n.name === name) || null;
}

export function filterOutCorrupted(savedCustomServices: unknown) {
    const legalCustomServices: ServiceConstructionInfo[] = [];
    if (!Array.isArray(savedCustomServices)) return legalCustomServices;

    for (const candidate of savedCustomServices) {
        if (!candidate || typeof candidate !== 'object') continue;
        const info = candidate as Partial<ServiceConstructionInfo>;
        if (typeof info.name !== 'string') continue;
        const prototype = getPrototypeByName(info.name);
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
        legalCustomServices.push(info as ServiceConstructionInfo);
    }
    return legalCustomServices;
}

export function loadService(info: ServiceConstructionInfo) {
    return getPrototypeByName(info.name)?.load(info.parameters) ?? Promise.resolve(null);
}

export function getConnectButtonName(service: ServiceConstructionInfo) {
    return getPrototypeByName(service.name)!.getConnectName(service.parameters);
}

export function doesServiceRequireChrome(info: ServiceConstructionInfo) {
    return getPrototypeByName(info.name)?.requiresChrome ?? false;
}
