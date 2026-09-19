import { ApplicationError } from './contracts';
import type { ResolvedImportQueueItem } from './import-queue';

export interface ImportWritePolicyInput {
    selected: ResolvedImportQueueItem[];
    format: { codec: string; bitrate: number };
    nativeMonoUpload: boolean;
    allowInteractiveHomebrew: boolean;
}

export function assertImportWritePolicy(input: ImportWritePolicyInput) {
    const preencodedAtrac1 = input.selected.filter(
        ({ item }) => item.forcedEncoding?.codec === 'SPS' || item.forcedEncoding?.codec === 'SPM'
    );
    const monoExploitRequired = input.format.codec === 'SPM' && !input.nativeMonoUpload;
    if ((preencodedAtrac1.length > 0 || monoExploitRequired) && !input.allowInteractiveHomebrew) {
        throw new ApplicationError(
            'CAPABILITY_REQUIRED',
            'This write requires Homebrew mode and an interactive confirmation in the browser. MCP and CLI writes cannot enter it automatically.',
            {
                preencodedAtrac1Items: preencodedAtrac1.map(({ item }) => item.id),
                monoExploitRequired,
            }
        );
    }
}
