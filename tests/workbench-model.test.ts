import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBatchMetadataUpdates, updateOrderedSelection } from '../src/components/workbench/workbench-model';

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
