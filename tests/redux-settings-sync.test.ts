import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('legacy Redux settings projection', () => {
    it('keeps recording format and title template synchronized with the shared settings store', async () => {
        (globalThis as unknown as { window: Record<string, unknown> }).window = {};
        const [{ applicationSettings }, { actions: convertDialogActions }, { store }] = await Promise.all([
            import('../src/application/settings-store.ts'),
            import('../src/redux/convert-dialog-feature.ts'),
            import('../src/redux/store.ts'),
        ]);
        store.dispatch(convertDialogActions.setFormat({ MockMD: [1, 2] }));
        store.dispatch(convertDialogActions.setTitleFormat('album-title'));

        let shared = applicationSettings.getSnapshot();
        assert.deepEqual(shared.values.uploadFormat, { MockMD: [1, 2] });
        assert.equal(shared.values.trackTitleFormat, 'album-title');

        applicationSettings.update(
            { uploadFormat: { NetMD: [0, 1] }, trackTitleFormat: 'artist-title' },
            shared.revision
        );
        shared = applicationSettings.getSnapshot();

        assert.deepEqual(store.getState().convertDialog.format, { NetMD: [0, 1] });
        assert.equal(store.getState().convertDialog.titleFormat, 'artist-title');
        assert.equal(shared.revision, 3);
    });
});
