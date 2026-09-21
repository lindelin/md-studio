import assert from 'node:assert/strict';
import { it } from 'node:test';
import { recordingModeLabel } from '../src/frontend/recording-mode-label.ts';
it('uses MD recording names for device-reported and planned encoding', () => {
    assert.equal(recordingModeLabel({ codec: 'AT3', bitrate: 132 }), 'LP2');
    assert.equal(recordingModeLabel({ codec: 'AT3', bitrate: 66 }), 'LP4');
    assert.equal(recordingModeLabel({ codec: 'SPS', bitrate: 292 }), 'SP');
    assert.equal(recordingModeLabel('SPS'), 'SP');
    assert.equal(recordingModeLabel({ codec: 'SPM', bitrate: 146 }), 'SP Mono');
    assert.equal(recordingModeLabel({ codec: 'AT3', bitrate: 105 }), 'ATRAC3 105 kbps');
});
