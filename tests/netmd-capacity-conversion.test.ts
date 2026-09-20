import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { convertDiscToNJS, convertDiscToWMD, Disc } from '../src/services/interfaces/netmd.ts';
import { Disc as NetMDDisc } from 'netmd-js';

describe('NetMD capacity conversion', () => {
    it('converts used, remaining, and total capacity from frames to seconds together', () => {
        const source: NetMDDisc = {
            title: '',
            fullWidthTitle: '',
            writable: true,
            writeProtected: false,
            used: 513,
            left: 2_301_952,
            total: 2_304_000,
            trackCount: 0,
            groups: [],
        };

        const converted = convertDiscToWMD(source);

        assert.equal(converted.used, 2);
        assert.equal(converted.left, 4496);
        assert.equal(converted.total, 4500);
    });

    it('converts all capacity fields back to NetMD frames', () => {
        const source: Disc = {
            title: '',
            fullWidthTitle: '',
            writable: true,
            writeProtected: false,
            used: 2,
            left: 4496,
            total: 4500,
            trackCount: 0,
            groups: [],
        };

        const converted = convertDiscToNJS(source);

        assert.equal(converted.used, 1024);
        assert.equal(converted.left, 2_301_952);
        assert.equal(converted.total, 2_304_000);
    });
});
