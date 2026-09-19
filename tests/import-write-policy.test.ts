import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    assertDiscWritableForImport,
    assertImportDeviceVersion,
    assertImportPreviewWritable,
    assertImportWritePolicy,
} from '../src/application/import-write-policy.ts';
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

    it('rejects a write prepared for another device session or disc revision', () => {
        assert.doesNotThrow(() => assertImportDeviceVersion('session-a', 7, 'session-a', 7));
        assert.throws(
            () => assertImportDeviceVersion('session-a', 7, 'session-b', 7),
            (error: any) => error.code === 'STALE_REVISION' && error.details.actualSessionId === 'session-b'
        );
        assert.throws(
            () => assertImportDeviceVersion('session-a', 7, 'session-a', 8),
            (error: any) => error.code === 'STALE_REVISION' && error.details.actualRevision === 8
        );
    });

    it('rejects definite preview failures while allowing unresolved durations to proceed', () => {
        const base = {
            deviceSessionId: 'session-a',
            deviceRevision: 3,
            importRevision: 4,
            selectedIds: ['track-1'],
            selectedFormat: { codec: 'AT3', bitrate: 132 },
            measurementUnits: 'frames' as const,
            items: [],
            capacity: {
                availableBefore: 100,
                required: 20,
                remaining: 80,
                availableBeforeInSelectedFormat: 200,
                remainingInSelectedFormat: 160,
                fits: true,
            },
            titles: {
                halfWidthBefore: 100,
                fullWidthBefore: 100,
                halfWidthRemaining: 90,
                fullWidthRemaining: 90,
                fits: true,
            },
        };
        assert.doesNotThrow(() =>
            assertImportPreviewWritable({
                ...base,
                complete: false,
                issues: [{ id: 'track-1', code: 'MISSING_DURATION', message: 'Missing duration.' }],
                capacity: { ...base.capacity, fits: false },
            })
        );
        assert.throws(
            () =>
                assertImportPreviewWritable({
                    ...base,
                    complete: true,
                    issues: [],
                    capacity: { ...base.capacity, remaining: -1, remainingInSelectedFormat: -2, fits: false },
                }),
            /do not fit/
        );
        assert.throws(
            () =>
                assertImportPreviewWritable({
                    ...base,
                    complete: true,
                    issues: [],
                    titles: { ...base.titles, halfWidthRemaining: -1, fits: false },
                }),
            /title capacity/
        );
    });
});
