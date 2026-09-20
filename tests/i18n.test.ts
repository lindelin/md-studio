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
});
