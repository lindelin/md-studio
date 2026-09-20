import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    areServiceParametersValid,
    buildAdvancedExportFileName,
    buildBatchMetadataUpdates,
    canRequestTaskCancellation,
    canStartRecording,
    createDefaultServiceParameters,
    defaultMetadataTrackSelection,
    findTaskNeedingAttention,
    formatRecognitionTitle,
    getTaskOutputFiles,
    getTaskCancellationPresentation,
    getTaskErrorDetail,
    getSelfTestReadiness,
    isActiveUninterruptibleWrite,
    libraryPathKey,
    localizeTaskLabel,
    localizeTaskMessage,
    resolveRowNavigationIndex,
    summarizeTaskResult,
    taskProgressPercent,
    toggleLibraryTrackSelection,
    toggleVisibleLibraryTracks,
    updateOrderedSelection,
} from '../src/components/workbench/workbench-model';

const noModifiers = { shiftKey: false, ctrlKey: false, metaKey: false };

describe('Studio Workbench selection model', () => {
    it('replaces the selection on an ordinary click', () => {
        assert.deepEqual(updateOrderedSelection([1, 2], [1, 2, 3], 3, 2, noModifiers), {
            selection: [3],
            anchor: 3,
            primary: 3,
        });
    });

    it('toggles an item without losing the remaining primary selection', () => {
        assert.deepEqual(
            updateOrderedSelection(['a', 'b'], ['a', 'b', 'c'], 'b', 'a', {
                shiftKey: false,
                ctrlKey: true,
                metaKey: false,
            }),
            { selection: ['a'], anchor: 'b', primary: 'a' }
        );
    });

    it('adds the ordered range between the anchor and target', () => {
        assert.deepEqual(
            updateOrderedSelection([1], [1, 2, 3, 4, 5], 4, 2, {
                shiftKey: true,
                ctrlKey: false,
                metaKey: false,
            }),
            { selection: [1, 2, 3, 4], anchor: 4, primary: 4 }
        );
    });
});

describe('Studio Workbench service settings', () => {
    const service = {
        index: 1,
        id: 'test-service',
        name: 'Test service',
        available: true,
        parameters: [
            { key: 'address', label: 'Server address', type: 'string' as const, defaultValue: 'http://localhost:8000/' },
            { key: 'threads', label: 'Threads', type: 'number' as const, defaultValue: 2 },
            { key: 'enabled', label: 'Enabled', type: 'boolean' as const, defaultValue: false },
        ],
    };

    it('builds service drafts from serializable catalog defaults', () => {
        assert.deepEqual(createDefaultServiceParameters(service), {
            address: 'http://localhost:8000/',
            threads: 2,
            enabled: false,
        });
    });

    it('rejects malformed addresses and parameter types before reload', () => {
        assert.equal(areServiceParametersValid(service, createDefaultServiceParameters(service)), true);
        assert.equal(areServiceParametersValid(service, { address: 'not a URL', threads: 2, enabled: false }), false);
        assert.equal(areServiceParametersValid(service, { address: 'http://localhost/', threads: Infinity, enabled: false }), false);
        assert.equal(areServiceParametersValid(service, { address: 'http://localhost/', threads: 2, enabled: 'yes' }), false);
    });
});

describe('Studio Workbench library selection', () => {
    const one = { path: ['Albums', 'One.wav'], title: 'One' };
    const two = { path: ['Albums', 'Two.wav'], title: 'Two' };
    const sameNameElsewhere = { path: ['Singles', 'One.wav'], title: 'One' };

    it('uses the full path as the stable track identity', () => {
        assert.notEqual(libraryPathKey(one.path), libraryPathKey(sameNameElsewhere.path));
        assert.deepEqual(toggleLibraryTrackSelection([one], sameNameElsewhere), [one, sameNameElsewhere]);
        assert.deepEqual(toggleLibraryTrackSelection([one, sameNameElsewhere], one), [sameNameElsewhere]);
    });

    it('adds visible tracks once in display order and removes the visible set together', () => {
        assert.deepEqual(toggleVisibleLibraryTracks([one], [one, two]), [one, two]);
        assert.deepEqual(toggleVisibleLibraryTracks([one, sameNameElsewhere, two], [one, two]), [sameNameElsewhere]);
        assert.deepEqual(toggleVisibleLibraryTracks([one], []), [one]);
    });
});

describe('Studio Workbench batch metadata', () => {
    it('applies title fields to the primary row and shared fields to every selected row', () => {
        assert.deepEqual(
            buildBatchMetadataUpdates(
                ['one', 'two', 'three'],
                'two',
                ['title', 'artist', 'album'],
                { title: 'Focused title', artist: 'Shared artist', album: 'Shared album', fullWidthTitle: '' }
            ),
            [
                {
                    target: 'two',
                    changes: { title: 'Focused title', artist: 'Shared artist', album: 'Shared album' },
                },
                { target: 'one', changes: { artist: 'Shared artist', album: 'Shared album' } },
                { target: 'three', changes: { artist: 'Shared artist', album: 'Shared album' } },
            ]
        );
    });

    it('does not emit empty updates for secondary rows when only the title changes', () => {
        assert.deepEqual(
            buildBatchMetadataUpdates(
                ['one', 'two'],
                'one',
                ['title'],
                { title: 'Focused title', artist: '', album: '', fullWidthTitle: '' }
            ),
            [{ target: 'one', changes: { title: 'Focused title' } }]
        );
    });
});

describe('Studio Workbench task presentation', () => {
    it('uses explicit stage progress and completed task state', () => {
        assert.equal(
            taskProgressPercent({ status: 'running', progress: { completed: 1, total: 4, currentPercent: 62.4 } }),
            62
        );
        assert.equal(taskProgressPercent({ status: 'succeeded', progress: { completed: 0, total: 0 } }), 100);
    });

    it('summarizes known task results without rendering arbitrary nested values', () => {
        assert.deepEqual(
            summarizeTaskResult({ writtenTracks: 2, files: ['a.oma', 'b.oma'], internal: { token: 'hidden' } }),
            ['Written: 2', 'Files: 2']
        );
        assert.deepEqual(
            summarizeTaskResult({ writtenTracks: 2, files: ['a.oma', 'b.oma'] }, 'zh-CN'),
            ['已写入: 2', '文件: 2']
        );
    });

    it('localizes known task labels without changing unknown or English labels', () => {
        assert.equal(localizeTaskLabel('Write 2 tracks to MiniDisc', 'zh-CN'), '将 2 首曲目录制到 MiniDisc');
        assert.equal(localizeTaskLabel('Export device firmware', 'zh-CN'), '导出设备固件');
        assert.equal(localizeTaskLabel('Vendor-specific operation', 'zh-CN'), 'Vendor-specific operation');
        assert.equal(localizeTaskLabel('Write 2 tracks to MiniDisc', 'en'), 'Write 2 tracks to MiniDisc');
    });

    it('localizes task recovery messages while preserving unknown device errors', () => {
        assert.equal(localizeTaskMessage('The device returned no audio for track 3.', 'zh-CN'), '设备没有返回曲目 3 的音频。');
        assert.equal(
            localizeTaskMessage('Check the device connection and output directory, then retry the export.', 'zh-CN'),
            '检查设备连接和输出目录，然后重试导出。'
        );
        assert.equal(localizeTaskMessage('Vendor error 42', 'zh-CN'), 'Vendor error 42');
        assert.equal(localizeTaskMessage('The device returned no audio for track 3.', 'en'), 'The device returned no audio for track 3.');
    });

    it('extracts bounded output file entries without exposing arbitrary result fields', () => {
        assert.deepEqual(
            getTaskOutputFiles({
                files: ['C:\\Exports\\01. Song.oma', '/tmp/02. Song.wav', '', 42],
                internal: { token: 'hidden' },
            }),
            {
                total: 2,
                files: [
                    { value: 'C:\\Exports\\01. Song.oma', label: '01. Song.oma' },
                    { value: '/tmp/02. Song.wav', label: '02. Song.wav' },
                ],
            }
        );
        assert.deepEqual(getTaskOutputFiles({ files: ['a', 'b', 'c'] }, 2), {
            total: 3,
            files: [
                { value: 'a', label: 'a' },
                { value: 'b', label: 'b' },
            ],
        });
        assert.deepEqual(getTaskOutputFiles({ files: 'not-an-array' }), { files: [], total: 0 });
    });

    it('selects only new failed or interrupted tasks for attention', () => {
        const tasks = [
            { id: 'running', status: 'running' },
            { id: 'known', status: 'failed' },
            { id: 'new', status: 'interrupted' },
        ];
        assert.deepEqual(findTaskNeedingAttention(tasks, new Set(['known'])), { id: 'new', status: 'interrupted' });
        assert.equal(findTaskNeedingAttention(tasks, new Set(['known', 'new'])), undefined);
    });

    it('shows a distinct user-facing error detail without duplicating the task error', () => {
        assert.equal(
            getTaskErrorDetail({ message: 'USB transfer failed', details: { displayMessage: 'Reconnect and retry.' } }),
            'Reconnect and retry.'
        );
        assert.equal(getTaskErrorDetail({ message: 'Same', details: { displayMessage: 'Same' } }), null);
    });

    it('does not offer a no-op stop while the final track is transferring', () => {
        const finalTrack = {
            kind: 'disc.write',
            status: 'running',
            phase: 'transferring',
            progress: { completed: 0, total: 1 },
        };
        assert.equal(isActiveUninterruptibleWrite(finalTrack), true);
        assert.equal(canRequestTaskCancellation(finalTrack), false);
        assert.equal(
            canRequestTaskCancellation({ ...finalTrack, progress: { completed: 0, total: 2 } }),
            true
        );
        assert.equal(canRequestTaskCancellation({ ...finalTrack, phase: 'converting' }), true);
        assert.equal(canRequestTaskCancellation({ ...finalTrack, phase: 'finalizing' }), false);
        assert.equal(
            canRequestTaskCancellation({ ...finalTrack, phase: 'converting', progress: { completed: 1, total: 1 } }),
            false
        );
    });

    it('describes active writes as a batch boundary instead of an immediate stop', () => {
        const activeWrite = {
            kind: 'disc.write',
            status: 'running',
            phase: 'transferring',
            progress: { completed: 0, total: 2 },
            cancellationRequested: false,
        };
        assert.deepEqual(getTaskCancellationPresentation(activeWrite), {
            actionLabel: 'End batch after current track',
            safetyNotice:
                'The track already recording cannot be interrupted safely. Ending the batch only prevents later tracks from starting; keep USB connected while the recording light is flashing.',
        });
        assert.match(
            getTaskCancellationPresentation({ ...activeWrite, cancellationRequested: true }).safetyNotice ?? '',
            /track already recording will continue/
        );
        assert.equal(
            getTaskCancellationPresentation({ ...activeWrite, progress: { completed: 0, total: 1 } }).actionLabel,
            'Current track cannot be stopped'
        );
    });
});

describe('Studio Workbench metadata import review', () => {
    it('selects only tracks that exist and match the current disc by default', () => {
        const plan = {
            tracks: [
                { trackIndex: 0, actual: { title: 'One' }, matchesDisc: true },
                { trackIndex: 1, actual: { title: 'Two' }, matchesDisc: false },
                { trackIndex: 2, matchesDisc: false },
                { trackIndex: 3, actual: { title: 'Four' }, matchesDisc: true },
            ],
        } as unknown as Parameters<typeof defaultMetadataTrackSelection>[0];
        assert.deepEqual(defaultMetadataTrackSelection(plan), [0, 3]);
    });
});

describe('Studio Workbench device diagnostics', () => {
    const capabilities = [
        'disc.rename',
        'track.rename',
        'track.move',
        'track.delete',
        'disc.erase',
        'metadata.fullWidth',
        'playback.control',
    ] as Parameters<typeof getSelfTestReadiness>[0] extends infer T
        ? NonNullable<T>['capabilities']
        : never;

    it('requires a writable disposable disc and every exercised capability', () => {
        const device = {
            capabilities,
            disc: { writable: true, writeProtected: false, trackCount: 2 },
        } as unknown as NonNullable<Parameters<typeof getSelfTestReadiness>[0]>;
        assert.deepEqual(getSelfTestReadiness(device), {
            ready: true,
            reason: 'This disc can run the complete 14-step destructive self-test.',
        });
        assert.equal(getSelfTestReadiness({ ...device, disc: { ...device.disc!, trackCount: 1 } }).ready, false);
        assert.equal(getSelfTestReadiness({ ...device, capabilities: capabilities.slice(1) }).ready, false);
    });
});

describe('Studio Workbench recognition titles', () => {
    it('formats complete and partial recognition metadata without dangling separators', () => {
        const metadata = { title: 'Song', artist: 'Artist', album: 'Album' };
        assert.equal(formatRecognitionTitle(metadata, 'title'), 'Song');
        assert.equal(formatRecognitionTitle(metadata, 'album-title'), 'Album - Song');
        assert.equal(formatRecognitionTitle(metadata, 'artist-title'), 'Artist - Song');
        assert.equal(formatRecognitionTitle(metadata, 'title-artist'), 'Song - Artist');
        assert.equal(formatRecognitionTitle(metadata, 'artist-album-title'), 'Artist - Album - Song');
        assert.equal(formatRecognitionTitle({ title: 'Song', artist: '', album: '  ' }, 'artist-album-title'), 'Song');
    });
});

describe('Studio Workbench advanced exports', () => {
    it('creates portable descriptive backup names', () => {
        assert.equal(buildAdvancedExportFileName('toc', 'Sony MZ-N920'), 'toc_Sony_MZ-N920.bin');
        assert.equal(buildAdvancedExportFileName('firmware', 'MZ/N920', 'S1.600'), 'firmware_MZ_N920_S1.600.bin');
        assert.equal(buildAdvancedExportFileName('ram', '  '), 'ram_unknown.bin');
    });
});

describe('Studio Workbench write review', () => {
    const preview = {
        complete: true,
        capacity: { fits: true },
        titles: { fits: true },
    } as Parameters<typeof canStartRecording>[0];

    it('starts only after a complete preview fits capacity and title storage', () => {
        assert.equal(canStartRecording(preview, 'supported'), true);
        assert.equal(canStartRecording(null, 'supported'), false);
        assert.equal(canStartRecording({ ...preview!, complete: false }, 'supported'), false);
        assert.equal(
            canStartRecording({ ...preview!, capacity: { ...preview!.capacity, fits: false } }, 'supported'),
            false
        );
        assert.equal(canStartRecording({ ...preview!, titles: { ...preview!.titles, fits: false } }, 'supported'), false);
        assert.equal(canStartRecording(preview, 'unsupported'), false);
    });
});

describe('Studio Workbench row navigation', () => {
    it('supports single-row, boundary, page, home and end movement', () => {
        assert.equal(resolveRowNavigationIndex(4, 20, 'ArrowUp'), 3);
        assert.equal(resolveRowNavigationIndex(4, 20, 'ArrowDown'), 5);
        assert.equal(resolveRowNavigationIndex(4, 20, 'Home'), 0);
        assert.equal(resolveRowNavigationIndex(4, 20, 'End'), 19);
        assert.equal(resolveRowNavigationIndex(15, 20, 'PageUp'), 5);
        assert.equal(resolveRowNavigationIndex(15, 20, 'PageDown'), 19);
        assert.equal(resolveRowNavigationIndex(0, 20, 'ArrowUp'), 0);
    });

    it('ignores unsupported keys and invalid table positions', () => {
        assert.equal(resolveRowNavigationIndex(0, 3, 'Enter'), null);
        assert.equal(resolveRowNavigationIndex(-1, 3, 'ArrowDown'), null);
        assert.equal(resolveRowNavigationIndex(0, 0, 'ArrowDown'), null);
    });
});
