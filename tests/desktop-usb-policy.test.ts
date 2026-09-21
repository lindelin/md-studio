import assert from 'node:assert/strict';
import { it } from 'node:test';
import { isSupportedMD, protectedMDClasses } from '../desktop/usb-policy';
it('permits catalogued NetMD and Hi-MD devices, not arbitrary Sony USB devices', () => {
    assert.equal(isSupportedMD({vendorId:0x054c,productId:0x0188}),true);
    assert.equal(isSupportedMD({vendorId:0x054c,productId:0x0287}),true);
    assert.equal(isSupportedMD({vendorId:0x054c,productId:0xffff}),false);
    assert.equal(isSupportedMD({vendorId:0xffff,productId:0x0188}),false);
});
it('opens MD audio/storage interfaces while keeping other protected classes', () => {
    const classes=['audio','audio-video','hid','mass-storage','smart-card','video','wireless'];
    assert.deepEqual(protectedMDClasses(classes),['audio-video','hid','smart-card','video','wireless']);
    assert.equal(classes.length,7);
});
