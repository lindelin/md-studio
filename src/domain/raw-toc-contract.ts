export const RAW_TOC_SECTOR_SIZE = 2352;
export const RAW_TOC_SECTOR_COUNT = 6;
export const RAW_TOC_WRITABLE_SECTOR_COUNT = 4;
export const RAW_TOC_BYTE_LENGTH = RAW_TOC_SECTOR_SIZE * RAW_TOC_SECTOR_COUNT;
export const RAW_TOC_WRITABLE_BYTE_LENGTH = RAW_TOC_SECTOR_SIZE * RAW_TOC_WRITABLE_SECTOR_COUNT;

export type RawTocPatchKind = 'unrestrict-scms' | 'mark-tracks-writable';

export function isRawTocPatchKind(value: unknown): value is RawTocPatchKind {
    return value === 'unrestrict-scms' || value === 'mark-tracks-writable';
}
