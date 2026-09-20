import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    calculateVirtualListWindow,
    scrollOffsetForVirtualIndex,
} from '../src/components/workbench/workbench-virtual-list.ts';

describe('Studio Workbench virtual lists', () => {
    it('keeps small lists intact and windows large lists with overscan', () => {
        assert.deepEqual(
            calculateVirtualListWindow({ itemCount: 20, rowHeight: 50, scrollTop: 400, viewportHeight: 250 }),
            { start: 0, end: 20, offset: 0, totalHeight: 1000, virtualized: false }
        );
        assert.deepEqual(
            calculateVirtualListWindow({
                itemCount: 200,
                rowHeight: 50,
                scrollTop: 1000,
                viewportHeight: 250,
                overscan: 2,
            }),
            { start: 18, end: 27, offset: 900, totalHeight: 10000, virtualized: true }
        );
    });

    it('scrolls the requested row only when it is outside the viewport', () => {
        const base = { itemCount: 200, rowHeight: 50, viewportHeight: 250 };
        assert.equal(scrollOffsetForVirtualIndex({ ...base, index: 12, scrollTop: 500 }), 500);
        assert.equal(scrollOffsetForVirtualIndex({ ...base, index: 4, scrollTop: 500 }), 200);
        assert.equal(scrollOffsetForVirtualIndex({ ...base, index: 20, scrollTop: 500 }), 800);
        assert.equal(scrollOffsetForVirtualIndex({ ...base, index: 999, scrollTop: 0 }), 9750);
    });

    it('normalizes empty and malformed measurements without invalid ranges', () => {
        assert.deepEqual(
            calculateVirtualListWindow({
                itemCount: Number.NaN,
                rowHeight: 0,
                scrollTop: Number.POSITIVE_INFINITY,
                viewportHeight: Number.NaN,
            }),
            { start: 0, end: 0, offset: 0, totalHeight: 0, virtualized: false }
        );
        assert.equal(
            scrollOffsetForVirtualIndex({ index: 10, itemCount: 0, rowHeight: 0, scrollTop: 10, viewportHeight: 0 }),
            0
        );
    });
});
