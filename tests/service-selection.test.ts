import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeServiceSelection } from '../src/frontend/service-selection.ts';

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
