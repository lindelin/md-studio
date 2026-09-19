import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeServiceSelection } from '../src/frontend/service-selection.ts';
import { updateLoadingOperations } from '../src/frontend/loading-state.ts';

describe('device service selection', () => {
    it('rejects stale and malformed persisted service indexes', () => {
        assert.equal(normalizeServiceSelection(2, 1), 1);
        assert.equal(normalizeServiceSelection(2, -1), 0);
        assert.equal(normalizeServiceSelection(2, 1.5), 0);
        assert.equal(normalizeServiceSelection(2, 2), 0);
        assert.equal(normalizeServiceSelection(2, Number.POSITIVE_INFINITY), 0);
    });

    it('resets a previously valid selection when the catalog shrinks', () => {
        assert.equal(normalizeServiceSelection(3, 2), 2);
        assert.equal(normalizeServiceSelection(2, 2), 0);
    });
});

describe('global loading operations', () => {
    it('keeps the UI busy until every overlapping operation finishes', () => {
        let operations = 0;
        operations = updateLoadingOperations(operations, true);
        operations = updateLoadingOperations(operations, true);
        assert.equal(operations, 2);

        operations = updateLoadingOperations(operations, false);
        assert.equal(operations, 1);
        operations = updateLoadingOperations(operations, false);
        assert.equal(operations, 0);
    });

    it('recovers safely from unmatched completion signals or malformed restored state', () => {
        assert.equal(updateLoadingOperations(0, false), 0);
        assert.equal(updateLoadingOperations(-3, false), 0);
        assert.equal(updateLoadingOperations(Number.NaN, true), 1);
    });
});
