import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    createDeviceRecordingProfile,
    getDefaultRecordingFormat,
    getRecordingCodec,
} from '../src/application/device-profile.ts';
import { sanitizeDeviceFullWidthTitle, sanitizeDeviceHalfWidthTitle } from '../src/application/device-title.ts';
import { DefaultMinidiscSpec, type MinidiscSpec } from '../src/services/interfaces/netmd.ts';

describe('device recording profile', () => {
    it('serializes NetMD formats and capacity ratios without exposing spec methods', () => {
        const profile = createDeviceRecordingProfile(new DefaultMinidiscSpec());

        assert.equal(profile.specName, 'MD');
        assert.equal(profile.measurementUnits, 'frames');
        assert.equal(profile.titleStorage, 'netmd-toc');
        assert.equal(getDefaultRecordingFormat(profile)?.userFriendlyName, 'SP');
        assert.deepEqual(getRecordingCodec(profile, [2, 0]), { codec: 'AT3', bitrate: 132 });
        assert.equal(profile.availableFormats[2].secondsPerDefaultUnit, 2);
        assert.doesNotThrow(() => JSON.stringify(profile));
    });

    it('keeps HiMD byte allocation details in the application service', () => {
        const byteSpec = {
            specName: 'HiMD',
            measurementUnits: 'bytes',
            titleStorage: 'unicode',
            defaultFormat: [0, 1],
            availableFormats: [{ codec: 'A3+', defaultBitrate: 256, availableBitrates: [352, 256] }],
        } as MinidiscSpec;
        const profile = createDeviceRecordingProfile(byteSpec);

        assert.equal(profile.specName, 'HiMD');
        assert.equal(profile.measurementUnits, 'bytes');
        assert.equal(profile.availableFormats[0].secondsPerDefaultUnit, undefined);
        assert.equal(getRecordingCodec(profile, [0, 1])?.bitrate, 256);
        assert.equal(getRecordingCodec(profile, [99, 0]), null);
        assert.equal(sanitizeDeviceHalfWidthTitle(profile, 'スコット'), 'スコット');
        assert.equal(sanitizeDeviceFullWidthTitle(profile, 'スコット'), 'スコット');
    });

    it('applies NetMD title sanitization from serialized profile metadata', () => {
        const profile = createDeviceRecordingProfile(new DefaultMinidiscSpec());

        assert.notEqual(sanitizeDeviceHalfWidthTitle(profile, 'スコット'), 'スコット');
        assert.equal(sanitizeDeviceFullWidthTitle(profile, 'スコット'), 'スコット');
    });
});
