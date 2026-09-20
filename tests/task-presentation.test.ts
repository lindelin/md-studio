import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { usesLegacyTaskPresentation } from '../src/frontend/task-presentation';

describe('task presentation policy', () => {
    it('uses the unified task center in the Studio Workbench', () => {
        assert.equal(usesLegacyTaskPresentation('MAIN', false), false);
    });

    it('keeps progress dialogs for compatibility and maintenance surfaces', () => {
        assert.equal(usesLegacyTaskPresentation('MAIN', true), true);
        assert.equal(usesLegacyTaskPresentation('FACTORY', false), true);
    });
});
