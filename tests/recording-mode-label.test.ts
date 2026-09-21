import assert from 'node:assert/strict';
import { it } from 'node:test';
import { recordingModeLabel } from '../src/frontend/recording-mode-label.ts';
it('uses MD recording names for device-reported and planned encoding', () => {
    assert.equal(recordingModeLabel({ codec: 'AT3', bitrate: 132 }), 'LP2');
    assert.equal(recordingModeLabel({ codec: 'AT3', bitrate: 66 }), 'LP4');
    assert.equal(recordingModeLabel({ codec: 'SPS', bitrate: 292 }), 'SP');
    assert.equal(recordingModeLabel('SPS'), 'SP');
    assert.equal(recordingModeLabel({ codec: 'SPM', bitrate: 146 }), 'MONO');
    assert.equal(recordingModeLabel({ codec: 'AT3', bitrate: 105 }), 'ATRAC3 105 kbps');
});


it('retains LP2 and LP4 bitrates through the recorded-track list projection', async () => {
    const { getSortedTracks } = await import('../src/utils.ts');
    const formats = [
        { codec: 'SPS', bitrate: 292 },
        { codec: 'AT3', bitrate: 132 },
        { codec: 'AT3', bitrate: 66 },
        { codec: 'SPM', bitrate: 146 },
    ] as const;
    const disc = {
        groups: [{ title: null, tracks: formats.map((encoding, index) => ({
            index, title: `Track ${index}`, fullWidthTitle: '', duration: 180, encoding,
        })) }],
    } as unknown as import('../src/services/interfaces/netmd').Disc;
    assert.deepEqual(getSortedTracks(disc).map(track => recordingModeLabel(track.encoding)), ['SP', 'LP2', 'LP4', 'MONO']);
});
