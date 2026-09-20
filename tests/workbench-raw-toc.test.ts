import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
    canReviewRawTocWrite,
    inspectRawTocData,
    isRawTocConfirmationValid,
    RAW_TOC_BYTE_LENGTH,
    RAW_TOC_CONFIRMATION,
    RAW_TOC_WRITABLE_BYTE_LENGTH,
} from '../src/components/workbench/workbench-raw-toc.ts';

describe('Studio Workbench raw TOC review', () => {
    it('requires a writable, unprotected disc and inspected flush capability', () => {
        assert.equal(canReviewRawTocWrite({ writable: true, writeProtected: false }, ['flushUTOC']), true);
        assert.equal(canReviewRawTocWrite({ writable: true, writeProtected: true }, ['flushUTOC']), false);
        assert.equal(canReviewRawTocWrite({ writable: false, writeProtected: false }, ['flushUTOC']), false);
        assert.equal(canReviewRawTocWrite({ writable: true, writeProtected: false }, ['downloadAtrac']), false);
        assert.equal(canReviewRawTocWrite(undefined, ['flushUTOC']), false);
    });

    it('checks the exact backup size and reports full and writable checksums', async () => {
        const data = new Uint8Array(RAW_TOC_BYTE_LENGTH);
        data.fill(0x24, 0, RAW_TOC_WRITABLE_BYTE_LENGTH);
        data.fill(0x42, RAW_TOC_WRITABLE_BYTE_LENGTH);

        const result = await inspectRawTocData(data);

        assert.equal(result.byteLength, RAW_TOC_BYTE_LENGTH);
        assert.equal(result.sha256, createHash('sha256').update(data).digest('hex'));
        assert.equal(
            result.writableSha256,
            createHash('sha256').update(data.subarray(0, RAW_TOC_WRITABLE_BYTE_LENGTH)).digest('hex')
        );
        assert.deepEqual(Buffer.from(result.dataBase64, 'base64'), Buffer.from(data));
        await assert.rejects(() => inspectRawTocData(data.subarray(1)), /exactly 14,112 bytes/);
    });

    it('requires the exact destructive confirmation phrase', () => {
        assert.equal(isRawTocConfirmationValid(RAW_TOC_CONFIRMATION), true);
        assert.equal(isRawTocConfirmationValid('write toc'), false);
        assert.equal(isRawTocConfirmationValid(`${RAW_TOC_CONFIRMATION} `), false);
    });
});
