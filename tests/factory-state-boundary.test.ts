import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { reducer } from '../src/redux/factory/factory-feature.ts';

describe('Factory compatibility state boundary', () => {
    it('keeps editor drafts out of Redux', () => {
        const state = reducer(undefined, { type: '@@test/init' });

        assert.deepEqual(Object.keys(state).sort(), [
            'deviceDiscSwapDetectionDisabled',
            'exploitCapabilities',
            'firmwareVersion',
            'spUploadSpeedupActive',
        ]);
        assert.equal('toc' in state, false);
        assert.equal('modified' in state, false);
    });
});
