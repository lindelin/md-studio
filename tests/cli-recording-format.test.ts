import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeCliRecordingFormat } from '../bridge/cli-recording-format.ts';

describe('CLI recording format aliases', () => {
    it('maps documented MiniDisc modes to application codec identifiers', () => {
        assert.deepEqual(normalizeCliRecordingFormat('LP2', 132), { codec: 'AT3', bitrate: 132 });
        assert.deepEqual(normalizeCliRecordingFormat('lp4', 66), { codec: 'AT3', bitrate: 66 });
        assert.deepEqual(normalizeCliRecordingFormat('SP', 292), { codec: 'SPS', bitrate: 292 });
        assert.deepEqual(normalizeCliRecordingFormat('mono', 146), { codec: 'SPM', bitrate: 146 });
    });

    it('preserves canonical codec names and rejects mismatched mode bitrates', () => {
        assert.deepEqual(normalizeCliRecordingFormat('at3', 105), { codec: 'AT3', bitrate: 105 });
        assert.throws(() => normalizeCliRecordingFormat('LP2', 66), /LP2 requires --bitrate 132/);
        assert.throws(() => normalizeCliRecordingFormat('LP4', 132), /LP4 requires --bitrate 66/);
    });
});
