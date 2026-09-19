import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

describe('legacy dialog settings projection', () => {
    it('keeps recording format and title template synchronized with the shared settings store', async () => {
        (globalThis as unknown as { window: Record<string, unknown> }).window = {};
        const [
            { applicationSettings },
            { actions: convertDialogActions },
            { actions: songRecognitionDialogActions },
            { actions: factoryBadSectorDialogActions },
            { store },
        ] = await Promise.all([
            import('../src/application/settings-store.ts'),
            import('../src/redux/convert-dialog-feature.ts'),
            import('../src/redux/song-recognition-dialog-feature.ts'),
            import('../src/redux/factory/factory-bad-sector-dialog-feature.ts'),
            import('../src/redux/store.ts'),
        ]);
        store.dispatch(convertDialogActions.setFormat({ MockMD: [1, 2] }));
        store.dispatch(convertDialogActions.setTitleFormat('album-title'));
        store.dispatch(songRecognitionDialogActions.setTitleFormat('title-artist'));
        store.dispatch(songRecognitionDialogActions.setImportMethod('exploits'));
        store.dispatch(factoryBadSectorDialogActions.setRememberChoice(true));

        let shared = applicationSettings.getSnapshot();
        assert.deepEqual(shared.values.uploadFormat, { MockMD: [1, 2] });
        assert.equal(shared.values.trackTitleFormat, 'album-title');
        assert.equal(shared.values.recognitionTrackTitleFormat, 'title-artist');
        assert.equal(shared.values.recognitionImportMethod, 'exploits');
        assert.equal(shared.values.factoryBadSectorRememberChoice, true);

        applicationSettings.update(
            {
                uploadFormat: { NetMD: [0, 1] },
                trackTitleFormat: 'artist-title',
                recognitionTrackTitleFormat: 'album-title',
                recognitionImportMethod: 'line-in',
                factoryBadSectorRememberChoice: false,
            },
            shared.revision
        );
        shared = applicationSettings.getSnapshot();

        assert.deepEqual(store.getState().convertDialog.format, { NetMD: [0, 1] });
        assert.equal(store.getState().convertDialog.titleFormat, 'artist-title');
        assert.equal(store.getState().songRecognitionDialog.titleFormat, 'album-title');
        assert.equal(store.getState().songRecognitionDialog.importMethod, 'line-in');
        assert.equal(store.getState().factoryBadSectorDialog.remember, false);
        assert.equal(shared.revision, 6);
    });
});
