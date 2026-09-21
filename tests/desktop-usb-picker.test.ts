import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { it } from 'node:test';
import { installUsbDevicePicker } from '../desktop/usb-device-picker';
function fixture() {
    const usb = new EventEmitter();
    const contents = Object.assign(new EventEmitter(), { send: () => {} });
    const win = Object.assign(new EventEmitter(), { webContents: contents, show: () => {}, isDestroyed: () => false });
    const picker = installUsbDevicePicker(usb as any, win as any, 'http://127.0.0.1:5190');
    const a = { deviceId: 'a', vendorId: 0x054c, productId: 0x0188, productName: 'MD' };
    const b = { ...a, deviceId: 'b' };
    const choose = (devices: any[], callback: (id?: string) => void) =>
        usb.emit('select-usb-device', { preventDefault() {} }, { frame: { url: 'http://127.0.0.1:5190/' }, deviceList: devices }, callback);
    return { usb, win, contents, picker, a, b, choose };
}
it('selects one supported recorder and requires an explicit choice for multiple recorders', () => {
    const f = fixture();
    let result: string | undefined;
    let count = 0;
    f.choose([f.a], (id) => {
        result = id;
        count++;
    });
    assert.equal(result, 'a');
    f.choose([f.a, f.b], (id) => {
        result = id;
        count++;
    });
    assert.equal(count, 1);
    assert.throws(() => f.picker.select('foreign'), /no longer available/);
    f.picker.select('b');
    assert.equal(result, 'b');
    assert.equal(count, 2);
    assert.throws(() => f.picker.select('a'), /no longer active/);
});
it('rejects unplugged choices and cancels pending requests on navigation', () => {
    const f = fixture();
    let count = 0;
    f.choose([f.a, f.b], (id) => {
        assert.equal(id, undefined);
        count++;
    });
    f.usb.emit('usb-device-removed', {}, f.a, f.contents);
    assert.throws(() => f.picker.select('a'), /no longer available/);
    f.contents.emit('did-start-loading');
    assert.equal(count, 1);
    f.win.emit('closed');
    assert.equal(count, 1);
});
