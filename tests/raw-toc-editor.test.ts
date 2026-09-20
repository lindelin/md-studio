import assert from 'node:assert/strict';
import test from 'node:test';
import {
    assertRawTocInteger,
    cloneRawToc,
    escapeRawTocCell,
    linkedRawTocContentIndices,
    parseEscapedRawTocCell,
    parseRawTocEditorData,
    reconstructRawTocEditorData,
} from '../src/domain/raw-toc-editor.ts';
import { RAW_TOC_BYTE_LENGTH, RAW_TOC_SECTOR_SIZE } from '../src/domain/raw-toc-patch.ts';

function emptyRawToc() {
    const data = new Uint8Array(RAW_TOC_BYTE_LENGTH);
    data.fill(0x44, RAW_TOC_SECTOR_SIZE * 4, RAW_TOC_SECTOR_SIZE * 5);
    data.fill(0x55, RAW_TOC_SECTOR_SIZE * 5);
    return data;
}

test('raw TOC editor reconstructs writable sectors and preserves reference-only sectors', () => {
    const input = emptyRawToc();
    const document = parseRawTocEditorData(input);
    const draft = cloneRawToc(document.toc);
    draft.deviceSignature = 0x1234;
    draft.trackMap[3] = 7;
    draft.trackFragmentList[7].start = { cluster: 0x123, sector: 0x2a, group: 4 };
    draft.trackFragmentList[7].mode = 0x96;
    draft.titleCellList[5].title = [1, 2, 3, 4, 5, 6, 7];
    draft.timestampList[9] = { year: 26, month: 9, day: 20, hour: 14, minute: 30, second: 8, signature: 0x3344 };
    draft.fullWidthTitleCellList[11].title = [7, 6, 5, 4, 3, 2, 1];
    const output = reconstructRawTocEditorData(draft, document.source);

    assert.equal(output.byteLength, RAW_TOC_BYTE_LENGTH);
    assert.deepEqual(
        output.slice(RAW_TOC_SECTOR_SIZE * 4),
        input.slice(RAW_TOC_SECTOR_SIZE * 4),
        'sectors 4 and 5 remain byte-for-byte identical'
    );
    const reparsed = parseRawTocEditorData(output).toc;
    assert.equal(reparsed.deviceSignature, 0x1234);
    assert.equal(reparsed.trackMap[3], 7);
    assert.deepEqual(reparsed.trackFragmentList[7].start, { cluster: 0x123, sector: 0x2a, group: 4 });
    assert.equal(reparsed.trackFragmentList[7].mode, 0x96);
    assert.deepEqual(reparsed.titleCellList[5].title, [1, 2, 3, 4, 5, 6, 7]);
    assert.deepEqual(reparsed.timestampList[9], { year: 26, month: 9, day: 20, hour: 14, minute: 30, second: 8, signature: 0x3344 });
    assert.deepEqual(reparsed.fullWidthTitleCellList[11].title, [7, 6, 5, 4, 3, 2, 1]);
});

test('raw TOC title cells round-trip printable, escaped and backslash bytes', () => {
    const bytes = [0x41, 0, 0x5c, 0x7f, 0xff, 0x20, 0x5a];
    assert.deepEqual(parseEscapedRawTocCell(escapeRawTocCell(bytes)), bytes);
    assert.throws(() => parseEscapedRawTocCell('short'), /exactly 7 bytes/);
    assert.throws(() => parseEscapedRawTocCell('123456\\q1'), /two hexadecimal digits/);
});

test('linked content traversal stops at cycles', () => {
    const document = parseRawTocEditorData(emptyRawToc());
    document.toc.trackMap[1] = 3;
    document.toc.trackFragmentList[3].link = 4;
    document.toc.trackFragmentList[4].link = 3;
    assert.deepEqual(linkedRawTocContentIndices(document.toc, 'position', 1), [3, 4]);
});

test('raw TOC editor rejects malformed data and out-of-range fields', () => {
    assert.throws(() => parseRawTocEditorData(new Uint8Array(12)), /exactly 14,112 bytes/);
    assert.equal(assertRawTocInteger(255, 255, 'Link'), 255);
    assert.throws(() => assertRawTocInteger(256, 255, 'Link'), /integer from 0 to 255/);
    assert.throws(() => assertRawTocInteger(1.5, 255, 'Link'), /integer from 0 to 255/);
});
