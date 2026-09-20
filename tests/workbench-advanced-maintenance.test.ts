import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    advancedMaintenanceActions,
    canRunAdvancedMaintenanceAction,
    isAdvancedMaintenanceConfirmationValid,
} from '../src/components/workbench/workbench-advanced-maintenance.ts';

describe('Studio Workbench advanced maintenance', () => {
    it('gates every action by the inspected firmware capability', () => {
        const tetris = advancedMaintenanceActions.find((action) => action.id === 'tetris')!;
        assert.equal(canRunAdvancedMaintenanceAction(tetris, ['runTetris']), true);
        assert.equal(canRunAdvancedMaintenanceAction(tetris, ['downloadAtrac']), false);
        assert.equal(canRunAdvancedMaintenanceAction(tetris), false);
    });

    it('requires exact confirmation only for session-ending modes', () => {
        const tetris = advancedMaintenanceActions.find((action) => action.id === 'tetris')!;
        const speedup = advancedMaintenanceActions.find((action) => action.id === 'sp-speedup')!;
        assert.equal(isAdvancedMaintenanceConfirmationValid(tetris, 'tetris'), false);
        assert.equal(isAdvancedMaintenanceConfirmationValid(tetris, 'TETRIS'), true);
        assert.equal(isAdvancedMaintenanceConfirmationValid(speedup, ''), true);
    });
});

