import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    advancedMaintenanceActions,
    canRunAdvancedMaintenanceAction,
    isAdvancedMaintenanceConfirmationValid,
} from '../src/components/workbench/workbench-advanced-maintenance.ts';

describe('Studio Workbench advanced maintenance', () => {
    it('gates every action by the inspected firmware capability', () => {
        const serviceMode = advancedMaintenanceActions.find((action) => action.id === 'service-mode')!;
        assert.equal(canRunAdvancedMaintenanceAction(serviceMode, ['enterServiceMode']), true);
        assert.equal(canRunAdvancedMaintenanceAction(serviceMode, ['downloadAtrac']), false);
        assert.equal(canRunAdvancedMaintenanceAction(serviceMode), false);
    });

    it('requires exact confirmation only for session-ending modes', () => {
        const serviceMode = advancedMaintenanceActions.find((action) => action.id === 'service-mode')!;
        const speedup = advancedMaintenanceActions.find((action) => action.id === 'sp-speedup')!;
        assert.equal(isAdvancedMaintenanceConfirmationValid(serviceMode, 'service'), false);
        assert.equal(isAdvancedMaintenanceConfirmationValid(serviceMode, 'SERVICE'), true);
        assert.equal(isAdvancedMaintenanceConfirmationValid(speedup, ''), true);
    });
});
