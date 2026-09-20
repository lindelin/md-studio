import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    buildBatchMetadataUpdates,
    findTaskNeedingAttention,
    getTaskErrorDetail,
    resolveRowNavigationIndex,
    summarizeTaskResult,
    taskProgressPercent,
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
