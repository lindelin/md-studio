import type { AdaptiveFile, DeferredFile } from '../utils';

export function createDeferredFile(
    name: string,
    reference: string,
    resolve: (reference: string) => Promise<File>
): DeferredFile {
    return {
        name,
        getFile: () => resolve(reference),
    };
}

export function isDeferredFile(value: unknown): value is DeferredFile {
    return Boolean(value && typeof value === 'object' && 'getFile' in value && typeof value.getFile === 'function');
}

export function isAdaptiveFile(value: unknown): value is AdaptiveFile {
    return Boolean(value && typeof value === 'object' && 'getForEncoding' in value && typeof value.getForEncoding === 'function');
}
