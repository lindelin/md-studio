import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveUiLanguage, translate } from '../src/i18n.ts';

describe('UI language', () => {
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
        assert.equal(translate('zh-CN', 'WRITE TOC'), 'WRITE TOC');
    });
});
