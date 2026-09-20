export const RAW_TOC_SECTOR_SIZE = 2352;
export const RAW_TOC_SECTOR_COUNT = 6;
export const RAW_TOC_WRITABLE_SECTOR_COUNT = 4;
export const RAW_TOC_BYTE_LENGTH = RAW_TOC_SECTOR_SIZE * RAW_TOC_SECTOR_COUNT;
export const RAW_TOC_WRITABLE_BYTE_LENGTH = RAW_TOC_SECTOR_SIZE * RAW_TOC_WRITABLE_SECTOR_COUNT;
export const RAW_TOC_CONFIRMATION = 'WRITE TOC';

export interface RawTocFileInspection {
    byteLength: number;
    sha256: string;
    writableSha256: string;
    dataBase64: string;
}

export function canReviewRawTocWrite(
    disc: { writable: boolean; writeProtected: boolean } | null | undefined,
    exploitCapabilities?: string[]
) {
    return Boolean(disc?.writable && !disc.writeProtected && exploitCapabilities?.includes('flushUTOC'));
}

export async function inspectRawTocData(data: Uint8Array): Promise<RawTocFileInspection> {
    if (data.byteLength !== RAW_TOC_BYTE_LENGTH) {
        throw new Error(`A raw TOC backup must contain exactly ${RAW_TOC_BYTE_LENGTH.toLocaleString()} bytes.`);
    }
    return {
        byteLength: data.byteLength,
        sha256: await sha256(data),
        writableSha256: await sha256(data.subarray(0, RAW_TOC_WRITABLE_BYTE_LENGTH)),
        dataBase64: encodeBase64(data),
    };
}

export function isRawTocConfirmationValid(value: string) {
    return value === RAW_TOC_CONFIRMATION;
}

async function sha256(data: Uint8Array) {
    const stable = new Uint8Array(data.byteLength);
    stable.set(data);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', stable));
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function encodeBase64(data: Uint8Array) {
    let binary = '';
    for (let offset = 0; offset < data.byteLength; offset += 32_768) {
        binary += String.fromCharCode(...data.subarray(offset, Math.min(offset + 32_768, data.byteLength)));
    }
    return btoa(binary);
}
