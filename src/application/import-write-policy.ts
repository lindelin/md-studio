import { ApplicationError } from './contracts';
import type { ResolvedImportQueueItem } from './import-queue';
import type { Disc } from '../services/interfaces/netmd';
import type { ImportPreview } from './import-preview';

export type ImportHomebrewCapability = 'uploadAtrac1' | 'uploadMonoSP';

export function getImportHomebrewRequirements(
    tracks: readonly { forcedEncoding?: { codec: string; bitrate: number } | null }[],
    format: { codec: string; bitrate: number },
    nativeMonoUpload: boolean
): ImportHomebrewCapability[] {
    const requirements: ImportHomebrewCapability[] = [];
    if (tracks.some((track) => track.forcedEncoding?.codec === 'SPS' || track.forcedEncoding?.codec === 'SPM')) {
        requirements.push('uploadAtrac1');
    }
    if (format.codec === 'SPM' && !nativeMonoUpload) requirements.push('uploadMonoSP');
    return requirements;
}

export interface ImportWritePolicyInput {
    selected: ResolvedImportQueueItem[];
    format: { codec: string; bitrate: number };
    nativeMonoUpload: boolean;
    allowInteractiveHomebrew: boolean;
}

export function assertImportWritePolicy(input: ImportWritePolicyInput) {
    const requiredCapabilities = getImportHomebrewRequirements(
        input.selected.map(({ item }) => item),
        input.format,
        input.nativeMonoUpload
    );
    if (requiredCapabilities.length > 0 && !input.allowInteractiveHomebrew) {
        throw new ApplicationError(
            'CAPABILITY_REQUIRED',
            'This write requires Homebrew mode and an interactive confirmation in the browser. MCP and CLI writes cannot enter it automatically.',
            {
                preencodedAtrac1Items: input.selected
                    .filter(({ item }) => item.forcedEncoding?.codec === 'SPS' || item.forcedEncoding?.codec === 'SPM')
                    .map(({ item }) => item.id),
                monoExploitRequired: requiredCapabilities.includes('uploadMonoSP'),
                requiredCapabilities,
            }
        );
    }
}

export function assertDiscWritableForImport(disc: Disc | null) {
    if (!disc) throw new ApplicationError('NO_DISC', 'Insert a MiniDisc before starting a write task.');
    if (!disc.writable || disc.writeProtected) {
        throw new ApplicationError('DISC_READ_ONLY', 'The inserted MiniDisc is not writable.', {
            writable: disc.writable,
            writeProtected: disc.writeProtected,
        });
    }
}

export function assertImportDeviceVersion(
    expectedSessionId: string | undefined,
    expectedRevision: number | undefined,
    actualSessionId: string,
    actualRevision: number
) {
    if (expectedSessionId !== undefined && expectedSessionId !== actualSessionId) {
        throw new ApplicationError('STALE_REVISION', 'The connected device changed after this write was prepared.', {
            expectedSessionId,
            actualSessionId,
        });
    }
    if (expectedRevision !== undefined && expectedRevision !== actualRevision) {
        throw new ApplicationError('STALE_REVISION', 'The disc changed after this write was prepared.', {
            expectedRevision,
            actualRevision,
        });
    }
}

export function assertImportPreviewWritable(preview: ImportPreview) {
    const unsupported = preview.issues.filter((issue) => issue.code === 'UNSUPPORTED_FORCED_FORMAT');
    if (unsupported.length > 0) {
        throw new ApplicationError('INVALID_INPUT', unsupported[0].message, {
            issues: unsupported,
        });
    }
    if (preview.capacity.remaining < 0) {
        throw new ApplicationError('INVALID_INPUT', 'The queued tracks do not fit on the inserted MiniDisc.', {
            required: preview.capacity.required,
            available: preview.capacity.availableBefore,
            remaining: preview.capacity.remaining,
            measurementUnits: preview.measurementUnits,
        });
    }
    if (!preview.titles.fits) {
        throw new ApplicationError('INVALID_INPUT', 'The queued track titles exceed the MiniDisc title capacity.', {
            halfWidthRemaining: preview.titles.halfWidthRemaining,
            fullWidthRemaining: preview.titles.fullWidthRemaining,
        });
    }
}
