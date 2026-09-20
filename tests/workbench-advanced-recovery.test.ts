import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAdvancedBadSectorHandler } from '../src/components/workbench/workbench-advanced-recovery.ts';

describe('Studio Workbench advanced recovery', () => {
    it('reuses a remembered bad-sector decision for the current export', async () => {
        let prompts = 0;
        const handle = createAdvancedBadSectorHandler(async () => {
            prompts += 1;
            return { decision: 'skip', rememberForExport: true, rememberForSession: false };
        });

        assert.equal(await handle('100', 1, 5), 'skip');
        assert.equal(await handle('200', 2, 10), 'skip');
        assert.equal(prompts, 1);
    });

    it('asks again when the operator does not remember the decision', async () => {
        let prompts = 0;
        const handle = createAdvancedBadSectorHandler(async () => {
            prompts += 1;
            return { decision: prompts === 1 ? 'reload' : 'abort', rememberForExport: false, rememberForSession: false };
        });

        assert.equal(await handle('100', 1, 5), 'reload');
        assert.equal(await handle('200', 2, 10), 'abort');
        assert.equal(prompts, 2);
    });
});

