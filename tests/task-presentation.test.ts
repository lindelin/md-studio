import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { usesLegacyTaskPresentation } from '../src/frontend/task-presentation';

describe('task presentation policy', () => {
    it('uses the unified task center in the Studio Workbench', () => {
        assert.equal(usesLegacyTaskPresentation('MAIN'), false);
    });

    it('keeps legacy presentation outside the connected workspace', () => {
        assert.equal(usesLegacyTaskPresentation('WELCOME'), true);
    });
});
