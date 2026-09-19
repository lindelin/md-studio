import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    allocateRecordingTitle,
    RecordingTitleCapacityError,
} from '../src/domain/recording-title-budget.ts';

describe('recording title allocation', () => {
    it('fits half-width titles by encoded units instead of JavaScript character count', () => {
        const allocated = allocateRecordingTitle('ガガガガ', '', { halfWidth: 7, fullWidth: 7 }, true, 0);

        assert.equal(allocated.halfWidthTitle, 'ガガガ');
        assert.deepEqual(allocated.remaining, { halfWidth: 0, fullWidth: 7 });
    });

    it('removes full-width metadata when the setting is disabled while reserving the codec cell', () => {
        const allocated = allocateRecordingTitle('Song', '曲名', { halfWidth: 14, fullWidth: 14 }, false);

        assert.equal(allocated.fullWidthTitle, '');
        assert.deepEqual(allocated.remaining, { halfWidth: 7, fullWidth: 7 });
    });

    it('never rounds an allocated title beyond a non-cell-aligned remaining budget', () => {
        const allocated = allocateRecordingTitle('12345678', '', { halfWidth: 8, fullWidth: 7 }, false);

        assert.equal(allocated.halfWidthTitle, '1234567');
        assert.equal(allocated.remaining.halfWidth, 1);
    });

    it('limits one full-width title to 105 characters', () => {
        const allocated = allocateRecordingTitle('', '曲'.repeat(120), { halfWidth: 7, fullWidth: 300 }, true);

        assert.equal(allocated.fullWidthTitle.length, 105);
        assert.equal(allocated.remaining.fullWidth, 90);
    });

    it('fails before writing when there is not enough room for a required codec cell', () => {
        assert.throws(
            () => allocateRecordingTitle('', '', { halfWidth: 6, fullWidth: 7 }, false),
            RecordingTitleCapacityError
        );
    });
});
