import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_UI_LANGUAGE_PREFERENCE, resolveUiLanguage, translate } from '../src/i18n.ts';
import { getCurrentUiLanguage, runtimeTranslate } from '../src/runtime-i18n.ts';

describe('UI language', () => {
    it('starts new installations in Simplified Chinese while keeping explicit English available', () => {
        assert.equal(DEFAULT_UI_LANGUAGE_PREFERENCE, 'zh-CN');
        assert.equal(resolveUiLanguage(DEFAULT_UI_LANGUAGE_PREFERENCE, 'en-US'), 'zh-CN');
        assert.equal(resolveUiLanguage('en', 'zh-CN'), 'en');
    });

    it('follows Chinese browser locales and otherwise keeps English', () => {
        assert.equal(resolveUiLanguage('system', 'zh-CN'), 'zh-CN');
        assert.equal(resolveUiLanguage('system', 'zh-TW'), 'zh-CN');
        assert.equal(resolveUiLanguage('system', 'en-US'), 'en');
    });

    it('honors an explicit language and falls back to the English source text', () => {
        assert.equal(resolveUiLanguage('en', 'zh-CN'), 'en');
        assert.equal(translate('zh-CN', 'Settings'), '设置');
        assert.equal(translate('zh-CN', 'Untranslated device name'), 'Untranslated device name');
        assert.equal(translate('en', 'Settings'), 'Settings');
    });

    it('covers core transfer and maintenance workflows while preserving confirmation tokens', () => {
        assert.equal(translate('zh-CN', 'Start recording'), '开始录音');
        assert.equal(translate('zh-CN', 'SONG RECOGNITION'), '歌曲识别');
        assert.equal(translate('zh-CN', 'VISUAL RAW TOC EDITOR'), '可视化原始 TOC 编辑器');
        assert.equal(translate('zh-CN', 'Disc maintenance'), '碟片维护');
        assert.equal(translate('zh-CN', 'Format as Hi-MD'), '格式化为 Hi-MD');
        assert.equal(
            translate(
                'zh-CN',
                'Settings could not be saved in this browser. Free some storage or reset the application, then try again.'
            ),
            '无法在此浏览器中保存设置。请释放部分存储空间或重置应用，然后重试。'
        );
        assert.equal(translate('zh-CN', 'WRITE TOC'), 'WRITE TOC');
    });

    it('defaults non-React browser prompts to Chinese on new installations', () => {
        assert.equal(getCurrentUiLanguage('zh-CN'), 'zh-CN');
        assert.equal(runtimeTranslate('MiniDisc recording completed', 'zh-CN'), 'MD 录制完成');
        assert.equal(
            runtimeTranslate('This HiMD has pending changes. Apply them before refreshing the device.', 'zh-CN'),
            '这张 HiMD 还有尚未应用的更改。请先应用更改，再刷新设备。'
        );
        assert.equal(
            runtimeTranslate('This action is not available for Network Walkman devices.', 'zh-CN'),
            'Network Walkman 设备不支持此操作。'
        );
        assert.equal(runtimeTranslate('MiniDisc recording completed', 'en-US'), 'MD 录制完成');
    });
});
