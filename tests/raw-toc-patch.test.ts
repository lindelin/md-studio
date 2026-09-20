import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ModeFlag, parseTOC } from 'netmd-tocmanip';
import {
    planRawTocPatch,
    RAW_TOC_BYTE_LENGTH,
    RAW_TOC_SECTOR_SIZE,
    RAW_TOC_WRITABLE_BYTE_LENGTH,
} from '../src/domain/raw-toc-patch.ts';

describe('raw TOC flag patches', () => {
    it('changes only fragments missing unrestricted SCMS flags and preserves reference sectors', () => {
        const data = makeRawToc();
        data.fill(0x5a, RAW_TOC_WRITABLE_BYTE_LENGTH);

        const result = planRawTocPatch(data, 'unrestrict-scms');
        const toc = parsePatched(result.data);
        const unrestricted = ModeFlag.F_SCMS_DIG_COPY | ModeFlag.F_SCMS_UNRESTRICTED;

        assert.equal(result.totalTracks, 2);
        assert.equal(result.changedTracks, 1);
        assert.equal(result.changedFragments, 2);
        assert.equal(toc.trackFragmentList[1].mode & unrestricted, unrestricted);
        assert.equal(toc.trackFragmentList[2].mode & unrestricted, unrestricted);
        assert.equal(toc.trackFragmentList[3].mode & unrestricted, unrestricted);
        assert.deepEqual(
            result.data.subarray(RAW_TOC_WRITABLE_BYTE_LENGTH),
            data.subarray(RAW_TOC_WRITABLE_BYTE_LENGTH)
        );
    });

    it('marks every fragment writable and reports a no-op when repeated', () => {
        const first = planRawTocPatch(makeRawToc(), 'mark-tracks-writable');
        const second = planRawTocPatch(first.data, 'mark-tracks-writable');

        assert.equal(first.changedTracks, 1);
        assert.equal(first.changedFragments, 2);
        assert.equal(second.changedTracks, 0);
        assert.equal(second.changedFragments, 0);
    });

    it('rejects malformed sizes and cyclic fragment chains', () => {
        assert.throws(() => planRawTocPatch(new Uint8Array(10), 'unrestrict-scms'), /exactly 14112 bytes/);
        assert.throws(() => planRawTocPatch(makeRawToc(), 'unknown' as any), /not supported/);
        const cyclic = makeRawToc();
        setFragment(cyclic, 1, ModeFlag.F_AUDIO, 1);
        assert.throws(() => planRawTocPatch(cyclic, 'unrestrict-scms'), /invalid or cyclic fragment chain/);
        const shared = makeRawToc();
        shared[48 + 2] = 1;
        assert.throws(() => planRawTocPatch(shared, 'unrestrict-scms'), /shares a fragment/);
    });
});

function makeRawToc() {
    const data = new Uint8Array(RAW_TOC_BYTE_LENGTH);
    data[30] = 1;
    data[31] = 2;
    data[47] = 4;
    data[48 + 1] = 1;
    data[48 + 2] = 3;
    setFragment(data, 1, ModeFlag.F_AUDIO, 2);
    setFragment(data, 2, ModeFlag.F_AUDIO, 0);
    setFragment(
        data,
        3,
        ModeFlag.F_AUDIO | ModeFlag.F_WRITABLE | ModeFlag.F_SCMS_DIG_COPY | ModeFlag.F_SCMS_UNRESTRICTED,
        0
    );
    return data;
}

function setFragment(data: Uint8Array, index: number, mode: number, link: number) {
    const offset = 304 + index * 8;
    data[offset + 3] = mode;
    data[offset + 7] = link;
}

function parsePatched(data: Uint8Array) {
    return parseTOC(
        data.slice(0, RAW_TOC_SECTOR_SIZE),
        data.slice(RAW_TOC_SECTOR_SIZE, RAW_TOC_SECTOR_SIZE * 2),
        data.slice(RAW_TOC_SECTOR_SIZE * 2, RAW_TOC_SECTOR_SIZE * 3),
        data.slice(RAW_TOC_SECTOR_SIZE * 3, RAW_TOC_SECTOR_SIZE * 4)
    );
}
