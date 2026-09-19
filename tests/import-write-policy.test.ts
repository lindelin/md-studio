import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertDiscWritableForImport, assertImportWritePolicy } from '../src/application/import-write-policy.ts';
import type { ResolvedImportQueueItem } from '../src/application/import-queue.ts';
import type { Disc } from '../src/services/interfaces/netmd.ts';

function selected(codec: string | null): ResolvedImportQueueItem[] {
    return [
        {
            item: {
                id: 'track-1',
                kind: 'local-path',
                name: 'track.aea',
                reference: 'bridge-file:track',
                title: 'Track',
                forcedEncoding: codec ? { codec, bitrate: codec === 'SPM' ? 146 : 292 } : null,
            },
        },
    ];
}

describe('import write policy', () => {
    it('allows ordinary LP writes through UI, MCP, and CLI', () => {
        assert.doesNotThrow(() =>
            assertImportWritePolicy({
                selected: selected(null),
                format: { codec: 'AT3', bitrate: 132 },
                nativeMonoUpload: false,
                allowInteractiveHomebrew: false,
            })
        );
    });

    it('blocks pre-encoded ATRAC1 from entering Homebrew mode through automation', () => {
        assert.throws(
            () =>
                assertImportWritePolicy({
                    selected: selected('SPS'),
                    format: { codec: 'AT3', bitrate: 132 },
                    nativeMonoUpload: false,
                    allowInteractiveHomebrew: false,
                }),
            /interactive confirmation/
        );
    });

    it('allows the browser UI to continue to its explicit Homebrew confirmation', () => {
        assert.doesNotThrow(() =>
            assertImportWritePolicy({
                selected: selected('SPM'),
                format: { codec: 'SPM', bitrate: 146 },
                nativeMonoUpload: false,
                allowInteractiveHomebrew: true,
            })
        );
    });

    it('allows mono recording without Homebrew on devices with native support', () => {
        assert.doesNotThrow(() =>
            assertImportWritePolicy({
                selected: selected(null),
                format: { codec: 'SPM', bitrate: 146 },
                nativeMonoUpload: true,
                allowInteractiveHomebrew: false,
            })
        );
    });

    it('rejects a missing or write-protected disc before creating a write task', () => {
        assert.throws(() => assertDiscWritableForImport(null), (error: any) => error.code === 'NO_DISC');
        assert.throws(
            () =>
                assertDiscWritableForImport({
                    title: '',
                    fullWidthTitle: '',
                    writable: true,
                    writeProtected: true,
                    used: 0,
                    left: 0,
                    total: 0,
                    trackCount: 0,
                    groups: [],
                } satisfies Disc),
            (error: any) => error.code === 'DISC_READ_ONLY'
        );
    });
});
