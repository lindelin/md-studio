import { CustomParameterInfo, CustomParameters } from '../custom-parameters';
import type { MinidiscSpec, NetMDService } from './interfaces/netmd';

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
    description?: string;
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
];

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
